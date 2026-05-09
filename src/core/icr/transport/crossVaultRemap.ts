/**
 * crossVaultRemap — função pura.
 *
 * Recebe (payloadSources, localRegistry) e retorna mapping payloadFileId → localFileId
 * baseado em hash match. Não bloqueia em divergências — emite ConflictRecord pra caller.
 *
 * Política:
 * - Path idêntico + hash igual → keep
 * - Path idêntico + hash diferente → emit source_hash_mismatch + tenta findByHash
 * - Hash match em outro path único → remap
 * - Hash match em múltiplos paths → escolhe primeiro alfabético + emit multiple_hash_matches
 * - Nenhum match → emit source_not_found, fileId NÃO entra no remap
 */

import type { SourceHashRegistry } from '../sourceHashRegistry';
import type { ConflictRecord } from './payloadTypes';

export interface RemapResult {
	fileIdRemap: Record<string, string>;
	conflicts: ConflictRecord[];
}

export function crossVaultRemap(
	payloadSources: Record<string, { hash: string; fileSize?: number }>,
	localRegistry: SourceHashRegistry,
): RemapResult {
	const fileIdRemap: Record<string, string> = {};
	const conflicts: ConflictRecord[] = [];

	for (const [payloadFileId, src] of Object.entries(payloadSources)) {
		// 1. Check if path identical exists locally
		const localEntry = localRegistry.getEntry(payloadFileId);
		if (localEntry) {
			if (localEntry.hash === src.hash) {
				fileIdRemap[payloadFileId] = payloadFileId;
				continue;
			}
			// Same path, different hash — emit conflict + continue checking findByHash
			conflicts.push({
				kind: 'source_hash_mismatch',
				fileId: payloadFileId,
				localHash: localEntry.hash,
				payloadHash: src.hash,
			});
		}

		// 2. Hash match em outro path?
		const matches = localRegistry.findByHash(src.hash);
		if (matches.length === 1) {
			fileIdRemap[payloadFileId] = matches[0]!;
		} else if (matches.length > 1) {
			const sorted = [...matches].sort();
			fileIdRemap[payloadFileId] = sorted[0]!;
			conflicts.push({
				kind: 'multiple_hash_matches',
				payloadFileId,
				localFileIds: matches,
				chosenFileId: sorted[0]!,
			});
		} else if (!localEntry) {
			conflicts.push({
				kind: 'source_not_found',
				fileId: payloadFileId,
				payloadHash: src.hash,
			});
		}
	}

	return { fileIdRemap, conflicts };
}
