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
import { computeCodebookHash } from './computeCodebookHash';
import { crossVaultRemap } from './crossVaultRemap';

export interface MergeOptions {
	/** Quando true, computa MergeResult sem mutar localData (preview pra UX). */
	dryRun?: boolean;
}

export async function mergeCoderContribution(
	localData: QualiaData,
	payload: Payload,
	localHashRegistry: SourceHashRegistry,
	options?: MergeOptions,
): Promise<MergeResult> {
	const dryRun = options?.dryRun ?? false;
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

	// 4. Code merge — incoming wins on diff
	for (const code of payload.codes) {
		const existing = localData.registry.definitions[code.id];
		if (!existing) {
			if (!dryRun) {
				localData.registry.definitions[code.id] = code;
				if (!localData.registry.rootOrder.includes(code.id)) {
					localData.registry.rootOrder.push(code.id);
				}
			}
			added.codes++;
		} else {
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

	// 6. Marker insertion — markdown (nested Record<fileId, Marker[]>)
	for (const [payloadFileId, markers] of Object.entries(payload.markers.markdown)) {
		const localFileId = remap.fileIdRemap[payloadFileId];
		if (!localFileId) {
			pendingMarkers += markers.length;
			continue;
		}
		if (!dryRun) {
			if (!localData.markdown.markers[localFileId]) localData.markdown.markers[localFileId] = [];
		}
		for (const m of markers) {
			if (!dryRun) localData.markdown.markers[localFileId]!.push({ ...m, fileId: localFileId });
			added.markers++;
		}
	}

	// PDF (flat array)
	for (const m of payload.markers.pdf) {
		const localFileId = remap.fileIdRemap[m.fileId];
		if (!localFileId) {
			pendingMarkers++;
			continue;
		}
		if (!dryRun) localData.pdf.markers.push({ ...m, fileId: localFileId });
		added.markers++;
	}

	// CSV segment (flat array)
	for (const m of payload.markers.csvSegment) {
		const localFileId = remap.fileIdRemap[m.fileId];
		if (!localFileId) {
			pendingMarkers++;
			continue;
		}
		if (!dryRun) localData.csv.segmentMarkers.push({ ...m, fileId: localFileId });
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
