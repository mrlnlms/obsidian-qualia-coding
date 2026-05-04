import { describe, it, expect } from 'vitest';
import {
	hierarchicalCluster,
	buildDendrogram,
	cutDendrogram,
	calculateSilhouette,
} from '../../src/analytics/data/clusterEngine';

// ── hierarchicalCluster ──

describe('hierarchicalCluster', () => {
	it('returns empty indices for empty input', () => {
		const result = hierarchicalCluster([]);
		expect(result.indices).toEqual([]);
		expect(result.merges).toEqual([]);
	});

	it('returns single index for 1-item input', () => {
		const result = hierarchicalCluster([[0]]);
		expect(result.indices).toEqual([0]);
		expect(result.merges).toEqual([]);
	});

	it('returns both indices for 2-item input', () => {
		const result = hierarchicalCluster([
			[0, 3],
			[3, 0],
		]);
		expect(result.indices).toEqual([0, 1]);
		expect(result.merges).toHaveLength(1);
		expect(result.merges[0]!.distance).toBe(3);
	});

	it('clusters multiple items and returns all indices', () => {
		// 3 items: A-B close (1), A-C far (10), B-C far (10)
		const dist = [
			[0, 1, 10],
			[1, 0, 10],
			[10, 10, 0],
		];
		const result = hierarchicalCluster(dist);
		expect(result.indices).toHaveLength(3);
		expect(new Set(result.indices)).toEqual(new Set([0, 1, 2]));
		// First merge should be the closest pair (0,1)
		expect(result.merges).toHaveLength(2);
		expect(result.merges[0]!.distance).toBe(1);
	});

	it('produces correct merge count (n-1)', () => {
		const n = 5;
		const dist: number[][] = [];
		for (let i = 0; i < n; i++) {
			dist.push([]);
			for (let j = 0; j < n; j++) {
				dist[i]!.push(i === j ? 0 : Math.abs(i - j));
			}
		}
		const result = hierarchicalCluster(dist);
		expect(result.merges).toHaveLength(n - 1);
		expect(result.indices).toHaveLength(n);
	});

	it('merges closest pair first in 4-item scenario', () => {
		// Clusters: {0,1} close (0.5), {2,3} close (0.5), groups far apart (10)
		const dist = [
			[0, 0.5, 10, 10],
			[0.5, 0, 10, 10],
			[10, 10, 0, 0.5],
			[10, 10, 0.5, 0],
		];
		const result = hierarchicalCluster(dist);
		expect(result.merges[0]!.distance).toBe(0.5);
	});

	it('returns indices as permutation of 0..n-1', () => {
		const dist = [
			[0, 2, 8, 9],
			[2, 0, 7, 8],
			[8, 7, 0, 1],
			[9, 8, 1, 0],
		];
		const result = hierarchicalCluster(dist);
		const sorted = [...result.indices].sort((a, b) => a - b);
		expect(sorted).toEqual([0, 1, 2, 3]);
	});
});

// ── buildDendrogram ──

describe('buildDendrogram', () => {
	it('returns null for empty input', () => {
		expect(buildDendrogram([], [], [])).toBeNull();
	});

	it('returns leaf node for single item', () => {
		const root = buildDendrogram([[0]], ['A'], ['#f00']);
		expect(root).not.toBeNull();
		expect(root!.label).toBe('A');
		expect(root!.color).toBe('#f00');
		expect(root!.leafIndices).toEqual([0]);
		expect(root!.left).toBeNull();
		expect(root!.right).toBeNull();
	});

	it('builds tree for 2 items', () => {
		const root = buildDendrogram(
			[[0, 5], [5, 0]],
			['A', 'B'],
			['#f00', '#0f0'],
		);
		expect(root).not.toBeNull();
		expect(root!.left).not.toBeNull();
		expect(root!.right).not.toBeNull();
		expect(root!.distance).toBe(5);
		expect(root!.leafIndices).toHaveLength(2);
	});

	it('builds tree for multiple items with correct leaf count', () => {
		const dist = [
			[0, 1, 10],
			[1, 0, 10],
			[10, 10, 0],
		];
		const root = buildDendrogram(dist, ['A', 'B', 'C'], ['#f00', '#0f0', '#00f']);
		expect(root).not.toBeNull();
		expect(root!.leafIndices).toHaveLength(3);
	});
});

// ── cutDendrogram ──

describe('cutDendrogram', () => {
	it('assigns all to one cluster when cut above root', () => {
		const root = buildDendrogram(
			[[0, 1, 10], [1, 0, 10], [10, 10, 0]],
			['A', 'B', 'C'],
			['#f00', '#0f0', '#00f'],
		)!;
		const assignments = cutDendrogram(root, 100);
		// All same cluster
		expect(new Set(assignments).size).toBe(1);
	});

	it('assigns each to own cluster when cut at 0', () => {
		const dist = [
			[0, 5, 10],
			[5, 0, 8],
			[10, 8, 0],
		];
		const root = buildDendrogram(dist, ['A', 'B', 'C'], ['#f00', '#0f0', '#00f'])!;
		const assignments = cutDendrogram(root, 0);
		// Each item separate
		expect(assignments).toHaveLength(3);
		expect(new Set(assignments).size).toBeGreaterThanOrEqual(2);
	});

	it('returns correct number of assignments', () => {
		const dist = [
			[0, 1, 10, 10],
			[1, 0, 10, 10],
			[10, 10, 0, 1],
			[10, 10, 1, 0],
		];
		const root = buildDendrogram(dist, ['A', 'B', 'C', 'D'], ['#f00', '#0f0', '#00f', '#ff0'])!;
		const assignments = cutDendrogram(root, 5);
		expect(assignments).toHaveLength(4);
	});

	it('returns compact cluster IDs (0..K-1) regardless of recursion depth', () => {
		// 6 items, two well-separated groups of 3, recursion will create internal IDs
		// that would otherwise be sparse (e.g. 2,3,5) — fix should compact them.
		const dist = [
			[0, 0.1, 0.1, 10, 10, 10],
			[0.1, 0, 0.1, 10, 10, 10],
			[0.1, 0.1, 0, 10, 10, 10],
			[10, 10, 10, 0, 0.1, 0.1],
			[10, 10, 10, 0.1, 0, 0.1],
			[10, 10, 10, 0.1, 0.1, 0],
		];
		const names = ['A', 'B', 'C', 'D', 'E', 'F'];
		const colors = names.map(() => '#000');
		const root = buildDendrogram(dist, names, colors)!;
		const assignments = cutDendrogram(root, 0.5);
		const unique = Array.from(new Set(assignments)).sort((a, b) => a - b);
		// Compact: IDs must be exactly 0..K-1 with no gaps
		for (let i = 0; i < unique.length; i++) {
			expect(unique[i]).toBe(i);
		}
	});

	it('aligns cluster IDs with visual leaf order (left-first DFS)', () => {
		// Same 6-item layout — leaves visually grouped by cluster, IDs ascending top-down
		const dist = [
			[0, 0.1, 0.1, 10, 10, 10],
			[0.1, 0, 0.1, 10, 10, 10],
			[0.1, 0.1, 0, 10, 10, 10],
			[10, 10, 10, 0, 0.1, 0.1],
			[10, 10, 10, 0.1, 0, 0.1],
			[10, 10, 10, 0.1, 0.1, 0],
		];
		const names = ['A', 'B', 'C', 'D', 'E', 'F'];
		const colors = names.map(() => '#000');
		const root = buildDendrogram(dist, names, colors)!;
		const assignments = cutDendrogram(root, 0.5);

		// Items in the same true group should share an ID
		expect(assignments[0]).toBe(assignments[1]);
		expect(assignments[1]).toBe(assignments[2]);
		expect(assignments[3]).toBe(assignments[4]);
		expect(assignments[4]).toBe(assignments[5]);
		// And the two groups must have different IDs
		expect(assignments[0]).not.toBe(assignments[3]);
	});
});

// ── calculateSilhouette ──

describe('calculateSilhouette', () => {
	it('returns negative avg score for single cluster (bi=0, ai>0)', () => {
		const dist = [
			[0, 1, 2],
			[1, 0, 1],
			[2, 1, 0],
		];
		const result = calculateSilhouette(dist, [0, 0, 0], ['A', 'B', 'C'], ['#f00', '#0f0', '#00f']);
		// With only one cluster: bi is set to 0, ai > 0 => score = (0-ai)/ai = -1
		expect(result.avgScore).toBe(-1);
		expect(result.scores).toHaveLength(3);
		for (const s of result.scores) expect(s.score).toBe(-1);
	});

	it('returns positive scores for well-separated clusters', () => {
		// Two tight clusters far apart
		const dist = [
			[0, 0.1, 10, 10],
			[0.1, 0, 10, 10],
			[10, 10, 0, 0.1],
			[10, 10, 0.1, 0],
		];
		const result = calculateSilhouette(
			dist,
			[0, 0, 1, 1],
			['A', 'B', 'C', 'D'],
			['#f00', '#f00', '#0f0', '#0f0'],
		);
		expect(result.avgScore).toBeGreaterThan(0);
		for (const s of result.scores) expect(s.score).toBeGreaterThan(0);
	});

	it('returns scores sorted by cluster then score descending', () => {
		const dist = [
			[0, 1, 5, 5],
			[1, 0, 5, 5],
			[5, 5, 0, 1],
			[5, 5, 1, 0],
		];
		const result = calculateSilhouette(
			dist,
			[0, 0, 1, 1],
			['A', 'B', 'C', 'D'],
			['#f00', '#f00', '#0f0', '#0f0'],
		);
		// Sorted by cluster asc
		for (let i = 1; i < result.scores.length; i++) {
			const prev = result.scores[i - 1]!;
			const curr = result.scores[i]!;
			if (prev.cluster === curr.cluster) {
				expect(prev.score).toBeGreaterThanOrEqual(curr.score);
			} else {
				expect(prev.cluster).toBeLessThan(curr.cluster);
			}
		}
	});

	it('handles 2 items in different clusters', () => {
		const dist = [
			[0, 5],
			[5, 0],
		];
		const result = calculateSilhouette(dist, [0, 1], ['A', 'B'], ['#f00', '#0f0']);
		expect(result.scores).toHaveLength(2);
		// Singleton clusters: silhouette is undefined (Rousseeuw 1987) → forced to 0
		for (const s of result.scores) expect(s.score).toBe(0);
	});

	it('populates name and color from inputs', () => {
		const dist = [
			[0, 1],
			[1, 0],
		];
		const result = calculateSilhouette(dist, [0, 1], ['Alice', 'Bob'], ['#aaa', '#bbb']);
		const names = result.scores.map(s => s.name);
		expect(names).toContain('Alice');
		expect(names).toContain('Bob');
	});
});
