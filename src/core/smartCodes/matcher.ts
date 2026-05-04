import type { MarkerRef } from './types';
import { evaluate } from './evaluator';
import type { SmartCodeCache } from './cache';

export interface CollectOptions {
	chunkSize?: number;
	onProgress?: (done: number, total: number) => void;
}

/**
 * Wrapper sobre cache.compute pra cache miss grande — itera markers em chunks de N (default 1000)
 * com yield via setTimeout(0) entre chunks pra não bloquear UI. Reporta progresso opcional.
 */
export async function collectMatchesChunked(
	smartCodeId: string,
	cache: SmartCodeCache,
	options: CollectOptions = {},
): Promise<MarkerRef[]> {
	const chunkSize = options.chunkSize ?? 1000;
	const sc = cache.__getSmartCodeForMatcher(smartCodeId);
	if (!sc) return [];
	const all = cache.__getAllRefsForMatcher();
	const total = all.length;
	const ctx = cache.__buildEvaluatorContextForMatcher(smartCodeId);
	const out: MarkerRef[] = [];
	for (let i = 0; i < total; i += chunkSize) {
		const slice = all.slice(i, i + chunkSize);
		for (const { ref, marker } of slice) {
			if (evaluate(sc.predicate, ref, marker, ctx)) out.push(ref);
		}
		options.onProgress?.(Math.min(i + chunkSize, total), total);
		await new Promise(r => setTimeout(r, 0));
	}
	return out;
}
