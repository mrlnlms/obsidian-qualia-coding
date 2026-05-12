/**
 * mergeCoderContribution — função pura.
 *
 * Aplica payload no localData via mutação direta. Retorna MergeResult com
 * conflicts estruturados pra UX layer (Fase C P1) decidir resolução.
 *
 * Steps:
 * 1. Codebook divergence detection (computeCodebookHash local vs payload.codebookVersion)
 * 2. Coder registration (se ausente)
 * 3. Cross-vault remap (delega pra crossVaultRemap)
 * 4. Code merge (incoming wins on diff + emite code_overwritten conflict)
 * 5. Group merge (skip se já existe)
 * 6. Marker insertion per engine (markdown / PDF / CSV cod segment) com fileId remap
 *
 * Markers cujo fileId não foi remapped (source_not_found) ficam em "pending" — não
 * inseridos. UX layer decide se cria source local stub ou rejeita.
 */

import type { QualiaData } from '../../types';
import type { Payload, MergeResult, ConflictRecord } from './payloadTypes';
import type { SourceHashRegistry } from '../sourceHashRegistry';
import type { ResolutionOverrides } from '../contributions/contributionViewTypes';
import { computeCodebookHash } from './computeCodebookHash';
import { crossVaultRemap } from './crossVaultRemap';

export interface MergeOptions {
	/** Quando true, computa MergeResult sem mutar localData (preview pra UX). */
	dryRun?: boolean;
	/** Escolhas do user (chips Visão geral / Lado a lado / Por código). */
	overrides?: ResolutionOverrides;
}

export async function mergeCoderContribution(
	localData: QualiaData,
	payload: Payload,
	localHashRegistry: SourceHashRegistry,
	options?: MergeOptions,
): Promise<MergeResult> {
	const dryRun = options?.dryRun ?? false;
	const overrides = options?.overrides;
	const conflicts: ConflictRecord[] = [];
	const warnings: string[] = [];
	const added = { markers: 0, codes: 0, groups: 0, coder: false };
	let pendingMarkers = 0;

	// 1. Codebook divergence (puro — não muta)
	const localCodebookHash = await computeCodebookHash({
		codes: Object.values(localData.registry.definitions),
		groups: Object.values(localData.registry.groups),
		smartCodes: Object.values(localData.smartCodes?.definitions ?? {}),
	});
	if (localCodebookHash !== payload.codebookVersion) {
		conflicts.push({
			kind: 'codebook_diverged',
			localHash: localCodebookHash,
			payloadHash: payload.codebookVersion,
		});
	}

	// 2. Coder registration
	if (!localData.coders) {
		if (!dryRun) localData.coders = { coders: [] };
	}
	const codersList = localData.coders?.coders ?? [];
	if (!codersList.find(c => c.id === payload.coder.id)) {
		if (!dryRun) localData.coders!.coders.push(payload.coder);
		added.coder = true;
	}

	// 3. Cross-vault remap (puro — não muta localData)
	const remap = crossVaultRemap(payload.sources, localHashRegistry);
	conflicts.push(...remap.conflicts);

	// 4. Code merge — incoming wins on diff (override 'local' mantém local; 'skip' não adiciona novo)
	for (const code of payload.codes) {
		const codeOverride = overrides?.codebookOverrides.get(code.id);
		const existing = localData.registry.definitions[code.id];
		if (!existing) {
			// Code novo
			if (codeOverride === 'skip') continue; // não adiciona, não conta
			if (!dryRun) {
				localData.registry.definitions[code.id] = code;
				if (!localData.registry.rootOrder.includes(code.id)) {
					localData.registry.rootOrder.push(code.id);
				}
			}
			added.codes++;
		} else {
			// Code existe local — se override === 'local', skipa overwrite
			if (codeOverride === 'local') continue;
			if (existing.name !== code.name) {
				conflicts.push({ kind: 'code_overwritten', codeId: code.id, field: 'name', from: existing.name, to: code.name });
				if (!dryRun) existing.name = code.name;
			}
			if (existing.color !== code.color) {
				conflicts.push({ kind: 'code_overwritten', codeId: code.id, field: 'color', from: existing.color, to: code.color });
				if (!dryRun) existing.color = code.color;
			}
		}
	}

	// 5. Group merge — skip se já existe (não overwrite, comportamento conservativo)
	if (payload.groups) {
		for (const group of payload.groups) {
			if (!localData.registry.groups[group.id]) {
				if (!dryRun) {
					localData.registry.groups[group.id] = group;
					if (!localData.registry.groupOrder.includes(group.id)) {
						localData.registry.groupOrder.push(group.id);
					}
				}
				added.groups++;
			}
		}
	}

	// Helper: precedência skipSource ⊃ skipCode ⊃ skipMarker (spec §4.2). Retorna true
	// se algum override decide skipar, e qual contagem aplica.
	const shouldSkipMarker = (markerId: string, payloadFileId: string, codeIds: string[]): boolean => {
		const sourceOverride = overrides?.sourceOverrides.get(payloadFileId);
		if (sourceOverride === 'skip-source') return true;
		if (codeIds.some(cid => overrides?.perCodeSkip.has(cid))) return true;
		if (overrides?.perMarkerSkip.has(markerId)) return true;
		return false;
	};

	// Helper: resolve fileId remap considerando sourceOverrides (skip = early; map-manual = override).
	const resolveFileId = (payloadFileId: string): string | undefined => {
		const sourceOverride = overrides?.sourceOverrides.get(payloadFileId);
		if (sourceOverride === 'skip-source') return undefined;
		if (sourceOverride && typeof sourceOverride === 'object' && sourceOverride.kind === 'map-manual') {
			return sourceOverride.localFileId;
		}
		return remap.fileIdRemap[payloadFileId];
	};

	// 6. Pre-check: garantir que todo fileId referenciado por markers tenha cobertura
	// (remap ou conflict). Marker cujo source nem entrou em payload.sources (porque
	// extract não tinha hash registry pra esse arquivo) escapa do crossVaultRemap.
	// Aqui emitimos source_not_found pra fechar o gap — UX precisa saber por que
	// markers ficaram pending.
	const unresolvedFileIds = new Set<string>();
	for (const fid of Object.keys(payload.markers.markdown)) {
		if (!remap.fileIdRemap[fid] && !payload.sources[fid]) unresolvedFileIds.add(fid);
	}
	for (const m of payload.markers.pdf) {
		if (!remap.fileIdRemap[m.fileId] && !payload.sources[m.fileId]) unresolvedFileIds.add(m.fileId);
	}
	for (const m of payload.markers.csvSegment) {
		if (!remap.fileIdRemap[m.fileId] && !payload.sources[m.fileId]) unresolvedFileIds.add(m.fileId);
	}
	for (const fid of unresolvedFileIds) {
		conflicts.push({ kind: 'source_not_found', fileId: fid, payloadHash: '(no hash in payload)' });
	}

	// Dedup por markerId: pre-build sets dos IDs locais por engine. Evita inserção
	// duplicada quando user faz apply em 2 contribuições do mesmo coder (re-export).
	const localMarkdownIds = new Set<string>();
	for (const ms of Object.values(localData.markdown.markers)) {
		for (const m of ms) localMarkdownIds.add((m as { id: string }).id);
	}
	const localPdfIds = new Set(localData.pdf.markers.map(m => (m as { id: string }).id));
	const localCsvSegmentIds = new Set(localData.csv.segmentMarkers.map(m => (m as { id: string }).id));

	// 7. Marker insertion — markdown (nested Record<fileId, Marker[]>)
	for (const [payloadFileId, markers] of Object.entries(payload.markers.markdown)) {
		const localFileId = resolveFileId(payloadFileId);
		if (!localFileId) {
			pendingMarkers += markers.length;
			continue;
		}
		for (const m of markers) {
			const codeIds = (m as any).codes?.map((c: any) => c.codeId) ?? [];
			if (shouldSkipMarker(m.id, payloadFileId, codeIds)) {
				pendingMarkers++;
				continue;
			}
			if (localMarkdownIds.has(m.id)) {
				conflicts.push({ kind: 'marker_already_exists', markerId: m.id, engine: 'markdown', fileId: localFileId });
				continue;
			}
			if (!dryRun) {
				if (!localData.markdown.markers[localFileId]) localData.markdown.markers[localFileId] = [];
				localData.markdown.markers[localFileId]!.push({ ...m, fileId: localFileId });
			}
			localMarkdownIds.add(m.id);
			added.markers++;
		}
	}

	// PDF (flat array)
	for (const m of payload.markers.pdf) {
		const localFileId = resolveFileId(m.fileId);
		if (!localFileId) {
			pendingMarkers++;
			continue;
		}
		const codeIds = (m as any).codes?.map((c: any) => c.codeId) ?? [];
		if (shouldSkipMarker(m.id, m.fileId, codeIds)) {
			pendingMarkers++;
			continue;
		}
		if (localPdfIds.has(m.id)) {
			conflicts.push({ kind: 'marker_already_exists', markerId: m.id, engine: 'pdf', fileId: localFileId });
			continue;
		}
		if (!dryRun) localData.pdf.markers.push({ ...m, fileId: localFileId });
		localPdfIds.add(m.id);
		added.markers++;
	}

	// CSV segment (flat array)
	for (const m of payload.markers.csvSegment) {
		const localFileId = resolveFileId(m.fileId);
		if (!localFileId) {
			pendingMarkers++;
			continue;
		}
		const codeIds = (m as any).codes?.map((c: any) => c.codeId) ?? [];
		if (shouldSkipMarker(m.id, m.fileId, codeIds)) {
			pendingMarkers++;
			continue;
		}
		if (localCsvSegmentIds.has(m.id)) {
			conflicts.push({ kind: 'marker_already_exists', markerId: m.id, engine: 'csvSegment', fileId: localFileId });
			continue;
		}
		if (!dryRun) localData.csv.segmentMarkers.push({ ...m, fileId: localFileId });
		localCsvSegmentIds.add(m.id);
		added.markers++;
	}

	return {
		added,
		conflicts,
		warnings,
		fileIdRemap: remap.fileIdRemap,
		pendingMarkers,
	};
}
