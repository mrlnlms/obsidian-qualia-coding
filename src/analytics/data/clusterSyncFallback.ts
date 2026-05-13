/**
 * Sync fallback pro Cluster Worker — usado quando `Worker` não existe
 * (jsdom em tests, ambientes restritos). Roda exatamente o mesmo compute
 * que o worker, na main thread.
 *
 * Em produção (Obsidian desktop) o Worker funciona e este arquivo nunca é chamado.
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

export function __syncHierarchicalCluster(distMatrix: number[][]): ClusterOrder {
	return hierarchicalCluster(distMatrix);
}

export function __syncComputeClusterArtifacts(
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
