import type { QualiaData } from './types';
import type { MemoRecord } from './memoTypes';

function migrateMemoField(memo: unknown): MemoRecord | undefined {
	if (memo === undefined || memo === null) return undefined;
	if (typeof memo === 'string') {
		return memo.length > 0 ? { content: memo } : undefined;
	}
	if (typeof memo === 'object' && 'content' in (memo as object)) {
		return memo as MemoRecord;
	}
	return undefined;
}

/**
 * Migra `memo: string` legacy pra MemoRecord em CodeDefinition, GroupDefinition,
 * CodeRelation. Markers são migrados nos Models de cada engine no load via
 * migrateMarkerMemo.
 *
 * Idempotente: se memo já é MemoRecord, retorna inalterado.
 */
export function migrateLegacyMemos(data: QualiaData): QualiaData {
	if (!data?.registry) return data;
	for (const def of Object.values(data.registry.definitions ?? {})) {
		(def as any).memo = migrateMemoField((def as any).memo);
		if (def.relations) {
			for (const rel of def.relations) {
				(rel as any).memo = migrateMemoField((rel as any).memo);
			}
		}
	}
	for (const group of Object.values(data.registry.groups ?? {})) {
		(group as any).memo = migrateMemoField((group as any).memo);
	}
	// Smart Codes (Tier 3) — memo era string até virar MemoRecord pra suportar Convert to note.
	for (const sc of Object.values(data.smartCodes?.definitions ?? {})) {
		(sc as any).memo = migrateMemoField((sc as any).memo);
	}
	return data;
}

/** Migra memo de um marker individual. Chamado pelos Models de cada engine no load. */
export function migrateMarkerMemo<T extends { memo?: unknown }>(marker: T): T {
	(marker as any).memo = migrateMemoField((marker as any).memo);
	return marker;
}
