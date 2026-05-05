import type { SmartCodeDefinition } from '../../core/types';
import type { SmartCodeCache } from '../../core/smartCodes/cache';
import { predicateToJson } from '../../core/smartCodes/predicateSerializer';
import { toCsv } from './csvWriter';

/** Gera CSV plano com smart codes pra análise externa em R/pandas. predicate vem como JSON serializado. */
export function buildSmartCodesCsv(smartCodes: SmartCodeDefinition[], cache: { getMatches: (id: string) => unknown[] }): string {
	const header: (string | number | null | undefined | boolean)[] = ['id', 'name', 'color', 'predicate_json', 'memo', 'matches_at_export'];
	const rows: (string | number | null | undefined | boolean)[][] = [header];
	for (const sc of smartCodes) {
		rows.push([
			sc.id,
			sc.name,
			sc.color,
			predicateToJson(sc.predicate),
			sc.memo?.content ?? '',
			cache.getMatches(sc.id).length,
		]);
	}
	return toCsv(rows);
}
