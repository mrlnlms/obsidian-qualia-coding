/**
 * executeReconciliationDecision — função orquestradora pra reconciliação ICR (Slice E3a).
 *
 * Cross-engine: opera via IcrMarkerOps (façade per-engine) em vez de mutate model direto.
 * Pure-ish: aceita log + markerOps + registries por referência. Mutates log via appendEntry,
 * dispara mutações em markerOps. Caller responsável por dataManager.commit() após.
 *
 * 4 ações expostas em P2 (drilldownCards):
 *   - adopt/consensus-marker (default additive)
 *   - adopt/overwrite-originals (opt-in, com snapshot)
 *   - accept-divergence (audit-only)
 *   - split (cria CodeDefinition novo + consensus marker)
 *
 * Princípio: toda decisão é não-destrutiva no nível do audit — overwrite preserva snapshot pra revert.
 */

import type { AuditEntry, ReconciliationBounds, ReconciliationDecision, MarkerSnapshot } from '../types';
import type { CoderId } from './coderTypes';
import type { EngineId } from './reporter';
import type { IcrMarkerOps } from './markerOps';
import type { CodeDefinitionRegistry } from '../codeDefinitionRegistry';
import type { CoderRegistry } from './coderRegistry';
import { appendEntry } from '../auditLog';

export interface ReconciliationParams {
	region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds };
	coderIds: CoderId[];
	decision: ReconciliationDecision;
	memoOfReconciliation: string;
	/** Override pro union default dos bounds dos coders na região. */
	consensusBounds?: ReconciliationBounds;
	/** Default 'consensus:default'. Slug usado em createConsensus. */
	consensusCoderId?: CoderId;
	/** Pra accept-divergence: anchor codeId — primeiro candidato ou '' se vazio. */
	anchorCodeId?: string;

	registry: CodeDefinitionRegistry;
	coderRegistry: CoderRegistry;
	log: AuditEntry[];
	markerOps: IcrMarkerOps;
}

export interface ReconciliationResult {
	ok: boolean;
	reason?: 'invalid-region' | 'consensus-coder-creation-failed' | 'code-not-found';
	consensusMarkerId?: string;
	newCodeId?: string;
	preStateSnapshot?: MarkerSnapshot[];
	auditEntryId: string;
}

const DEFAULT_CONSENSUS_SLUG = 'default';

function isValidBounds(b: ReconciliationBounds): boolean {
	switch (b.kind) {
		case 'text':
			return b.from >= 0 && b.to >= b.from;
		case 'csvRow':
			return b.rowIndex >= 0;
		case 'temporal':
			return b.fromMs >= 0 && b.toMs >= b.fromMs;
	}
}

/** União inclusiva dos bounds. Pra text: [min from, max to]. Pra temporal: idem ms.
 *  Pra csvRow: bounds[0] (heurística — uma região = uma row, não há "união" semanticamente). */
function unionOfBounds(bounds: ReconciliationBounds[], fallback: ReconciliationBounds): ReconciliationBounds {
	if (bounds.length === 0) return fallback;
	const first = bounds[0]!;
	if (first.kind === 'text') {
		let min = first.from;
		let max = first.to;
		for (const b of bounds) {
			if (b.kind !== 'text') continue;
			if (b.from < min) min = b.from;
			if (b.to > max) max = b.to;
		}
		return { kind: 'text', from: min, to: max };
	}
	if (first.kind === 'temporal') {
		let min = first.fromMs;
		let max = first.toMs;
		for (const b of bounds) {
			if (b.kind !== 'temporal') continue;
			if (b.fromMs < min) min = b.fromMs;
			if (b.toMs > max) max = b.toMs;
		}
		return { kind: 'temporal', fromMs: min, toMs: max };
	}
	return first; // csvRow: primeira (não há união semântica)
}

export function executeReconciliationDecision(params: ReconciliationParams): ReconciliationResult {
	const { region, coderIds, decision, memoOfReconciliation, log, markerOps, registry, coderRegistry } = params;

	if (!isValidBounds(region.bounds)) {
		return { ok: false, reason: 'invalid-region', auditEntryId: '' };
	}

	const at = Date.now();

	// Audit-only branches (accept-divergence + reject) — saem cedo.
	if (decision.kind === 'accept-divergence' || decision.kind === 'reject') {
		const anchorCodeId = params.anchorCodeId ?? '';
		const entry: Omit<Extract<AuditEntry, { type: 'reconciliation_decided' }>, 'id'> = {
			codeId: anchorCodeId,
			at,
			entity: 'reconciliation',
			type: 'reconciliation_decided',
			region,
			coderIds,
			decision,
			memoOfReconciliation,
		};
		const id = appendEntryAndReturnId(log, entry);
		return { ok: true, auditEntryId: id };
	}

	// Branch adopt/split — ambos criam consensus marker (e split cria code novo antes).
	const consensusSlug = (params.consensusCoderId ?? `consensus:${DEFAULT_CONSENSUS_SLUG}`).replace(/^consensus:/, '');
	const consensusCoder = coderRegistry.createConsensus(consensusSlug);
	if (!consensusCoder) {
		return { ok: false, reason: 'consensus-coder-creation-failed', auditEntryId: '' };
	}
	const consensusCoderId = consensusCoder.id;

	let newCodeId: string | undefined;
	let targetCodeId: string;
	if (decision.kind === 'split') {
		const created = registry.create(`split-${at}`);
		newCodeId = created.id;
		targetCodeId = newCodeId;
	} else {
		// adopt
		if (!registry.getById(decision.codeId)) {
			return { ok: false, reason: 'code-not-found', auditEntryId: '' };
		}
		targetCodeId = decision.codeId;
	}

	// overwrite-originals: snapshot + update markers dos coders perdedores.
	let preStateSnapshot: MarkerSnapshot[] | undefined;
	if (decision.mode === 'overwrite-originals') {
		const inRegion = markerOps.findMarkersInRegion(region);
		preStateSnapshot = [];
		for (const m of inRegion) {
			if (m.codedBy === consensusCoderId) continue;
			if (!coderIds.includes(m.codedBy)) continue;
			const hasTarget = m.codes.some(c => c.codeId === targetCodeId);
			if (hasTarget) continue; // já tem o target, sem mudança
			const snap = markerOps.serializeMarker(region.engine, region.fileId, m.markerId);
			preStateSnapshot.push(snap);
			const newCodes = m.codes
				.filter(c => c.codeId !== targetCodeId)
				.map(c => ({ ...c, codeId: targetCodeId }));
			const dedupedCodes = uniqByCodeId(newCodes.length > 0 ? newCodes : [{ codeId: targetCodeId }]);
			markerOps.updateMarker(region.engine, region.fileId, m.markerId, { codes: dedupedCodes });
		}
	}

	// Cria consensus marker (sempre, pra adopt + split).
	const boundsForConsensus = params.consensusBounds ?? region.bounds;
	const created = markerOps.createMarker(region.engine, {
		fileId: region.fileId,
		bounds: boundsForConsensus,
		codeIds: [targetCodeId],
		codedBy: consensusCoderId,
	});
	const consensusMarkerId = created.markerId;

	// Audit entry com decision incluindo snapshot capturado.
	const finalDecision: ReconciliationDecision = decision.kind === 'adopt'
		? { kind: 'adopt', codeId: decision.codeId, mode: decision.mode, preStateSnapshot }
		: { kind: 'split', newCodeId: targetCodeId, mode: decision.mode, preStateSnapshot };

	const decidedEntry: Omit<Extract<AuditEntry, { type: 'reconciliation_decided' }>, 'id'> = {
		codeId: targetCodeId,
		at,
		entity: 'reconciliation',
		type: 'reconciliation_decided',
		region,
		coderIds,
		decision: finalDecision,
		consensusMarkerId,
		memoOfReconciliation,
	};
	const id = appendEntryAndReturnId(log, decidedEntry);

	return { ok: true, consensusMarkerId, newCodeId, preStateSnapshot, auditEntryId: id };
}

export interface ReconciliationRevertParams {
	registry: CodeDefinitionRegistry;
	coderRegistry: CoderRegistry;
	log: AuditEntry[];
	markerOps: IcrMarkerOps;
}

export function executeReconciliationRevert(
	originalEntryId: string,
	params: ReconciliationRevertParams,
): ReconciliationResult {
	const { log, markerOps } = params;
	const original = log.find(e => e.id === originalEntryId);
	if (!original || original.type !== 'reconciliation_decided') {
		return { ok: false, reason: 'invalid-region', auditEntryId: '' };
	}

	const restoredMarkerIds: string[] = [];
	const decision = original.decision;
	const region = original.region;

	if (decision.kind === 'adopt' || decision.kind === 'split') {
		if (decision.mode === 'consensus-marker') {
			if (original.consensusMarkerId) {
				markerOps.removeMarker(region.engine, region.fileId, original.consensusMarkerId);
				restoredMarkerIds.push(original.consensusMarkerId);
			}
		} else {
			// overwrite-originals: restore via snapshot
			const snapshots = decision.preStateSnapshot ?? [];
			for (const snap of snapshots) {
				markerOps.restoreMarker(snap);
				restoredMarkerIds.push(snap.markerId);
			}
			// Também remove o consensus marker criado.
			if (original.consensusMarkerId) {
				markerOps.removeMarker(region.engine, region.fileId, original.consensusMarkerId);
			}
		}
	}
	// accept-divergence / reject: nada pra restaurar.

	const revertedEntry: Omit<Extract<AuditEntry, { type: 'reconciliation_reverted' }>, 'id'> = {
		codeId: original.codeId,
		at: Date.now(),
		entity: 'reconciliation',
		type: 'reconciliation_reverted',
		originalEntryId,
		restoredMarkerIds,
	};
	const id = appendEntryAndReturnId(log, revertedEntry);

	return { ok: true, auditEntryId: id };
}

function uniqByCodeId<T extends { codeId: string }>(arr: T[]): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of arr) {
		if (seen.has(item.codeId)) continue;
		seen.add(item.codeId);
		out.push(item);
	}
	return out;
}

/** Append entry ao log e retorna o id alocado. Reconciliation entries nunca coalesce. */
function appendEntryAndReturnId(
	log: AuditEntry[],
	entry: Omit<Extract<AuditEntry, { entity: 'reconciliation' }>, 'id'>,
): string {
	const before = log.length;
	appendEntry(log, entry as Omit<AuditEntry, 'id'>);
	const newEntry = log[before] ?? log[log.length - 1]!;
	return newEntry.id;
}
