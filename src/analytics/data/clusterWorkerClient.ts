/**
 * Cluster Worker Client — interface promise-based pra rodar hierarchicalCluster
 * e computeClusterArtifacts fora da main thread. Cooccurrence/Overlap reorder e
 * Dendrogram render usam esses helpers pra não travar UI em codebooks grandes.
 *
 * Worker source vem inlined em build-time (esbuild plugin `inline-worker`).
 * Blob URL é criada lazy no primeiro uso e o Worker é singleton (auto-restart on error).
 */

import type { ClusterOrder, DendrogramNode, SilhouetteResult } from './clusterEngine';
import workerSource from './cluster.worker.ts?inline';

export interface ClusterArtifacts {
	root: DendrogramNode | null;
	assignments: number[];
	silhouette: SilhouetteResult | null;
	clusterToLeaves: number[][];
	clusterColors: string[];
}

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
		else entry.reject(new Error(data.error ?? 'unknown cluster worker error'));
	});
	w.addEventListener('error', (ev: ErrorEvent) => {
		const err = new Error(ev.message || 'cluster worker error');
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

export function disposeClusterWorker(): void {
	if (worker) try { worker.terminate(); } catch { /* ignore */ }
	if (workerUrl) URL.revokeObjectURL(workerUrl);
	for (const [, p] of pending) p.reject(new Error('cluster worker disposed'));
	pending.clear();
	worker = null;
	workerUrl = null;
}

function send<T>(op: 'hierarchicalCluster' | 'computeClusterArtifacts', payload: object): Promise<T> {
	const w = ensureWorker();
	const id = ++nextRequestId;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
		w.postMessage({ id, op, ...payload });
	});
}

async function syncFallback<T>(
	op: 'hierarchicalCluster' | 'computeClusterArtifacts',
	payload: { distMatrix: number[][]; names?: string[]; colors?: string[]; cutDistance?: number },
): Promise<T> {
	const { __syncHierarchicalCluster, __syncComputeClusterArtifacts } = await import('./clusterSyncFallback');
	if (op === 'hierarchicalCluster') return __syncHierarchicalCluster(payload.distMatrix) as unknown as T;
	return __syncComputeClusterArtifacts(payload.distMatrix, payload.names!, payload.colors!, payload.cutDistance!) as unknown as T;
}

const hasWorker = typeof Worker !== 'undefined';

export function hierarchicalClusterAsync(distMatrix: number[][]): Promise<ClusterOrder> {
	if (!hasWorker) return syncFallback<ClusterOrder>('hierarchicalCluster', { distMatrix });
	return send<ClusterOrder>('hierarchicalCluster', { distMatrix });
}

export function computeClusterArtifactsAsync(
	distMatrix: number[][],
	names: string[],
	colors: string[],
	cutDistance: number,
): Promise<ClusterArtifacts> {
	if (!hasWorker) return syncFallback<ClusterArtifacts>('computeClusterArtifacts', { distMatrix, names, colors, cutDistance });
	return send<ClusterArtifacts>('computeClusterArtifacts', { distMatrix, names, colors, cutDistance });
}
