/**
 * Kappa Worker Client — interface promise-based pra rodar reportKappa/reportPairwise
 * fora da main thread. Importante pra Compare Coders View — compute dos 5 coefs
 * sobre per-char positions trava o frame pra combos não-cacheadas.
 *
 * Worker source vem inlined em build-time (esbuild plugin `inline-worker`).
 * Blob URL é criada lazy no primeiro uso e o Worker é singleton (auto-restart on error).
 */

import type { KappaInput } from './kappaInput';
import type { CategoricalKappaInput } from './categoricalKappaInput';
import type { CoderId } from './coderTypes';
import type { EngineId, KappaReport, PairwiseReport, EngineKappaInput } from './reporter';
import workerSource from './kappa.worker.ts?inline';

let worker: Worker | null = null;
let workerUrl: string | null = null;
let nextRequestId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function ensureWorker(): Worker {
	if (worker) return worker;
	const blob = new Blob([workerSource], { type: 'text/javascript' });
	workerUrl = URL.createObjectURL(blob);
	const w = new Worker(workerUrl);
	w.addEventListener('message', (ev: MessageEvent) => {
		const data = ev.data as { id: number; ok: boolean; result?: unknown; error?: string };
		const entry = pending.get(data.id);
		if (!entry) return;
		pending.delete(data.id);
		if (data.ok) entry.resolve(data.result);
		else entry.reject(new Error(data.error ?? 'unknown worker error'));
	});
	w.addEventListener('error', (ev: ErrorEvent) => {
		// Reject all pending + reset worker (lazy reconnect on next call)
		const err = new Error(ev.message || 'worker error');
		for (const [, p] of pending) p.reject(err);
		pending.clear();
		try { w.terminate(); } catch { /* ignore */ }
		if (workerUrl) URL.revokeObjectURL(workerUrl);
		worker = null;
		workerUrl = null;
	});
	worker = w;
	return w;
}

export function disposeKappaWorker(): void {
	if (worker) try { worker.terminate(); } catch { /* ignore */ }
	if (workerUrl) URL.revokeObjectURL(workerUrl);
	for (const [, p] of pending) p.reject(new Error('worker disposed'));
	pending.clear();
	worker = null;
	workerUrl = null;
}

function send<T>(op: 'reportKappa' | 'reportPairwise', payload: object): Promise<T> {
	const w = ensureWorker();
	const id = ++nextRequestId;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
		w.postMessage({ id, op, ...payload });
	});
}

// Fallback síncrono quando Worker não existe (jsdom em tests, ambientes restritos).
// Lazy import dos compute helpers — só carrega se for de fato chamado.
async function syncFallback<T>(
	op: 'reportKappa' | 'reportPairwise',
	payload: { inputs: EngineKappaInput[]; pairs?: [CoderId, CoderId][]; perPairInputs?: Map<string, EngineKappaInput[]> },
): Promise<T> {
	const { __syncReportKappa, __syncReportPairwise } = await import('./kappaSyncFallback');
	if (op === 'reportKappa') return __syncReportKappa(payload.inputs) as unknown as T;
	return __syncReportPairwise(payload.inputs, payload.pairs!, payload.perPairInputs) as unknown as T;
}

const hasWorker = typeof Worker !== 'undefined';

export function reportKappaAsync(inputs: EngineKappaInput[]): Promise<KappaReport> {
	if (!hasWorker) return syncFallback<KappaReport>('reportKappa', { inputs });
	return send<KappaReport>('reportKappa', { inputs });
}

export function reportPairwiseAsync(
	inputs: EngineKappaInput[],
	pairs: [CoderId, CoderId][],
	perPairInputs?: Map<string, EngineKappaInput[]>,
): Promise<PairwiseReport[]> {
	// Map não serializa via postMessage — converte pra array de entries pro worker.
	const perPairEntries: Array<[string, EngineKappaInput[]]> | undefined =
		perPairInputs && perPairInputs.size > 0 ? Array.from(perPairInputs.entries()) : undefined;
	if (!hasWorker) return syncFallback<PairwiseReport[]>('reportPairwise', { inputs, pairs, perPairInputs });
	return send<PairwiseReport[]>('reportPairwise', { inputs, pairs, perPairEntries });
}
