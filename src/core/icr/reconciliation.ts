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
		case 'csvSegment':
			return b.rowIndex >= 0 && b.from >= 0 && b.to >= b.from;
		case 'pdfText':
			return b.page >= 0 && b.from >= 0 && b.to >= b.from;
		case 'temporal':
			return b.from >= 0 && b.to >= b.from;
		case 'bbox':
			return (
				(b.page === undefined || b.page >= 0)
				&& b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0
				&& b.x + b.w <= 1 && b.y + b.h <= 1
			);
	}
}

/** União inclusiva dos bounds. Cobre todos os 6 kinds. Pra csvRow retorna bounds[0]
 *  (uma região = uma cell, sem "união" semântica). Pra csvSegment/pdfText une apenas
 *  bounds com mesma cell/page; pra bbox une apenas mesma page (heurística — bounds de
 *  cells/pages diferentes não deveriam estar agrupados como mesma região, mas a função
 *  é defensiva). */
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
		let min = first.from;
		let max = first.to;
		for (const b of bounds) {
			if (b.kind !== 'temporal') continue;
			if (b.from < min) min = b.from;
			if (b.to > max) max = b.to;
		}
		return { kind: 'temporal', from: min, to: max };
	}
	if (first.kind === 'pdfText') {
		let min = first.from;
		let max = first.to;
		for (const b of bounds) {
			if (b.kind !== 'pdfText' || b.page !== first.page) continue;
			if (b.from < min) min = b.from;
			if (b.to > max) max = b.to;
		}
		return { kind: 'pdfText', page: first.page, from: min, to: max };
	}
	if (first.kind === 'csvSegment') {
		let min = first.from;
		let max = first.to;
		for (const b of bounds) {
			if (b.kind !== 'csvSegment') continue;
			if (b.rowIndex !== first.rowIndex || b.column !== first.column) continue;
			if (b.from < min) min = b.from;
			if (b.to > max) max = b.to;
		}
		return { kind: 'csvSegment', rowIndex: first.rowIndex, column: first.column, from: min, to: max };
	}
	if (first.kind === 'bbox') {
		let x0 = first.x;
		let y0 = first.y;
		let x1 = first.x + first.w;
		let y1 = first.y + first.h;
		for (const b of bounds) {
			if (b.kind !== 'bbox') continue;
			if ((b.page ?? -1) !== (first.page ?? -1)) continue;
			if (b.x < x0) x0 = b.x;
			if (b.y < y0) y0 = b.y;
			if (b.x + b.w > x1) x1 = b.x + b.w;
			if (b.y + b.h > y1) y1 = b.y + b.h;
		}
		return { kind: 'bbox', page: first.page, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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

/** Marca uma região como "em discussão" — usuário viu o P2 mas não decidiu ainda.
 *  Emite reconciliation_opened sem aplicar mudanças. Idempotente: re-marcar a mesma
 *  região emite nova entry mas o status workflow só lê a última via findLatestActiveOpenedEntry. */
export function openReconciliation(params: {
	region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds };
	coderIds: CoderId[];
	candidateCodeIds: string[];
	log: AuditEntry[];
}): { auditEntryId: string } {
	const entry: Omit<Extract<AuditEntry, { type: 'reconciliation_opened' }>, 'id'> = {
		codeId: '',
		at: Date.now(),
		entity: 'reconciliation',
		type: 'reconciliation_opened',
		region: params.region,
		coderIds: params.coderIds,
		candidateCodeIds: params.candidateCodeIds,
	};
	const id = appendEntryAndReturnId(params.log, entry);
	return { auditEntryId: id };
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
