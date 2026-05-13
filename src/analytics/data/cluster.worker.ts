/**
 * Cluster Worker — hierarchicalCluster + computeClusterArtifacts (build+cut+silhouette)
 * fora da main thread. Necessário pra cooccurrence/overlap reorder e dendrogram render
 * não travarem UI em codebooks grandes.
 *
 * Bundleado standalone pelo esbuild plugin `inline-worker` e injetado como string em main.js.
 * Não pode importar nada que dependa do runtime Obsidian. `clusterEngine.ts` é puro
 * (apenas TypeScript + tipos próprios) então pode ser importado direto.
 */

import {
	hierarchicalCluster,
	buildDendrogram,
	cutDendrogram,
	calculateSilhouette,
	type ClusterOrder,
	type DendrogramNode,
	type SilhouetteResult,
} from './clusterEngine';

interface ClusterArtifacts {
	root: DendrogramNode | null;
	assignments: number[];
	silhouette: SilhouetteResult | null;
	clusterToLeaves: number[][];
	clusterColors: string[];
}

function computeClusterArtifactsCore(
	distMatrix: number[][],
	names: string[],
	colors: string[],
	cutDistance: number,
): ClusterArtifacts {
	const root = buildDendrogram(distMatrix, names, colors);
	if (!root) {
		return { root: null, assignments: [], silhouette: null, clusterToLeaves: [], clusterColors: [] };
	}

	const assignments = cutDendrogram(root, cutDistance);
	const silhouette = calculateSilhouette(distMatrix, assignments, names, colors);

	const clusterToLeaves: number[][] = [];
	for (let i = 0; i < assignments.length; i++) {
		const c = assignments[i]!;
		if (!clusterToLeaves[c]) clusterToLeaves[c] = [];
		clusterToLeaves[c]!.push(i);
	}

	const nClusters = clusterToLeaves.length;
	const clusterColors: string[] = [];
	for (let i = 0; i < nClusters; i++) {
		const hue = (i * 137.5) % 360;
		clusterColors.push(`hsl(${hue}, 65%, 55%)`);
	}

	return { root, assignments, silhouette, clusterToLeaves, clusterColors };
}

// ─── Message protocol ──────────────────────────────────────

type Request =
	| { id: number; op: 'hierarchicalCluster'; distMatrix: number[][] }
	| { id: number; op: 'computeClusterArtifacts'; distMatrix: number[][]; names: string[]; colors: string[]; cutDistance: number };

type Response =
	| { id: number; ok: true; op: 'hierarchicalCluster'; result: ClusterOrder }
	| { id: number; ok: true; op: 'computeClusterArtifacts'; result: ClusterArtifacts }
	| { id: number; ok: false; error: string };

const ctx = self as unknown as Worker;

ctx.addEventListener('message', (ev: MessageEvent<Request>) => {
	const req = ev.data;
	try {
		if (req.op === 'hierarchicalCluster') {
			const result = hierarchicalCluster(req.distMatrix);
			const resp: Response = { id: req.id, ok: true, op: 'hierarchicalCluster', result };
			ctx.postMessage(resp);
		} else if (req.op === 'computeClusterArtifacts') {
			const result = computeClusterArtifactsCore(req.distMatrix, req.names, req.colors, req.cutDistance);
			const resp: Response = { id: req.id, ok: true, op: 'computeClusterArtifacts', result };
			ctx.postMessage(resp);
		}
	} catch (e) {
		const err = e instanceof Error ? e.message : String(e);
		const resp: Response = { id: req.id, ok: false, error: err };
		ctx.postMessage(resp);
	}
});

export {};
