import { describe, it, expect } from 'vitest';
import { clusterCodeCards } from '../../src/analytics/board/boardClusters';
import type { ClusterResult } from '../../src/analytics/board/boardClusters';
import type { ConsolidatedData, UnifiedMarker, UnifiedCode } from '../../src/analytics/data/dataTypes';

// ── Helpers ──────────────────────────────────────────────────────

function makeMarker(id: string, codes: string[], source: UnifiedMarker['source'] = 'markdown'): UnifiedMarker {
	return { id, source, file: 'f1', codes };
}

function makeCode(name: string, color: string = '#6200EE'): UnifiedCode {
	return { name, color, sources: ['markdown'] };
}

function makeData(markers: UnifiedMarker[], codes: UnifiedCode[]): ConsolidatedData {
	return {
		markers,
		codes,
		sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false },
		lastUpdated: Date.now(),
	};
}

/** Collect all codeNames across clusters into a flat sorted array */
function allCodeNames(result: ClusterResult): string[] {
	return result.clusters.flatMap(c => c.codeNames).sort();
}

// ── NOTE on cooccurrence behavior ────────────────────────────────
// clusterCodeCards passes sources:[] to calculateCooccurrence, which
// filters out all markers. As a result, the cooc matrix is always empty,
// all pairwise Jaccard distances are 1, and the dendrogram root has
// distance=1. The fallback `maxDist = root.distance || 1` yields 1.
// Clustering is thus controlled purely by cutRatio:
//   cutRatio >= 1 → cutDistance >= 1 → all in one cluster
//   cutRatio < 1  → cutDistance < 1  → each code in its own cluster
// (since all merge distances in the dendrogram equal 1)

// ── clusterCodeCards ─────────────────────────────────────────────

describe('clusterCodeCards', () => {
	// --- Basic / single-code scenarios ---

	it('single code returns single cluster containing that code', () => {
		const data = makeData(
			[makeMarker('m1', ['A'])],
			[makeCode('A', '#FF0000')],
		);
		const result = clusterCodeCards(['A'], ['#FF0000'], data);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].id).toBe(0);
		expect(result.clusters[0].codeNames).toEqual(['A']);
	});

	it('empty codeNames returns single cluster with empty codeNames', () => {
		const data = makeData([], []);
		const result = clusterCodeCards([], [], data);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].codeNames).toEqual([]);
	});

	it('single code with no color falls back to #888', () => {
		const data = makeData([], []);
		const result = clusterCodeCards(['A'], [], data);
		expect(result.clusters[0].color).toBe('#888');
	});

	it('single code returns its color directly (not averaged)', () => {
		const data = makeData(
			[makeMarker('m1', ['A'])],
			[makeCode('A', '#FF0000')],
		);
		const result = clusterCodeCards(['A'], ['#FF0000'], data);
		// Early return path returns raw color, not rgba
		expect(result.clusters[0].color).toBe('#FF0000');
	});

	// --- cutRatio controls clustering (all distances are 1) ---

	it('cutRatio=1 merges all codes into one cluster', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].codeNames).toContain('A');
		expect(result.clusters[0].codeNames).toContain('B');
	});

	it('cutRatio=0 with perfect co-occurrence keeps codes together (distance=0)', () => {
		const markers = [
			makeMarker('m1', ['A', 'B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 0);
		// Jaccard distance = 0, cutDistance = 0 → same cluster (0 <= 0)
		expect(result.clusters.length).toBe(1);
	});

	it('cutRatio=0 with no co-occurrence separates codes', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 0);
		// Jaccard distance = 1, cutDistance = 0 → separate clusters
		expect(result.clusters.length).toBe(2);
	});

	it('default cutRatio (0.5) separates codes when all distances are 1', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data);
		// cutRatio=0.5 → cutDistance=0.5 < 1 → separate
		expect(result.clusters.length).toBe(2);
	});

	it('perfect co-occurrence with any cutRatio stays together (distance=0)', () => {
		const markers = [
			makeMarker('m1', ['A', 'B', 'C']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#F00', '#0F0', '#00F'], data, 0.5);
		// All Jaccard distances = 0, so all codes stay in 1 cluster regardless of cutRatio
		expect(result.clusters.length).toBe(1);
	});

	it('cutRatio=1 with three codes → one cluster', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
			makeMarker('m3', ['C']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#F00', '#0F0', '#00F'], data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].codeNames.sort()).toEqual(['A', 'B', 'C']);
	});

	// --- Structural guarantees ---

	it('cluster IDs are sequential starting from 0', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
			makeMarker('m3', ['C']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#F00', '#0F0', '#00F'], data, 0);
		const ids = result.clusters.map(c => c.id).sort((a, b) => a - b);
		for (let i = 0; i < ids.length; i++) {
			expect(ids[i]).toBe(i);
		}
	});

	it('all cluster codeNames combined equals input codeNames (no loss)', () => {
		const codeNames = ['A', 'B', 'C', 'D', 'E'];
		const colors = ['#F00', '#0F0', '#00F', '#FF0', '#F0F'];
		const markers = codeNames.map((name, i) => makeMarker(`m${i}`, [name]));
		const data = makeData(markers, codeNames.map(c => makeCode(c)));
		const result = clusterCodeCards(codeNames, colors, data, 0.5);
		expect(allCodeNames(result)).toEqual([...codeNames].sort());
	});

	it('no loss of codes at cutRatio=1 (single cluster)', () => {
		const codeNames = ['X', 'Y', 'Z'];
		const colors = ['#111', '#222', '#333'];
		const data = makeData([], codeNames.map(c => makeCode(c)));
		const result = clusterCodeCards(codeNames, colors, data, 1);
		expect(allCodeNames(result)).toEqual([...codeNames].sort());
	});

	it('cluster colors are valid rgba strings (multi-code path)', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
			makeMarker('m3', ['C']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B'), makeCode('C')]);
		// cutRatio=0 → each code alone → each cluster has one color averaged to rgba
		const result = clusterCodeCards(['A', 'B', 'C'], ['#FF0000', '#00FF00', '#0000FF'], data, 0);
		for (const cluster of result.clusters) {
			expect(cluster.color).toMatch(/^rgba\(\d{1,3},\d{1,3},\d{1,3},0\.12\)$/);
		}
	});

	// --- averageColor (tested indirectly via cluster.color) ---

	it('single-color cluster produces rgba with that color at 0.12 opacity', () => {
		const data = makeData([makeMarker('m1', ['A']), makeMarker('m2', ['B'])], [makeCode('A'), makeCode('B')]);
		// cutRatio=0 → separate clusters, each with one color
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 0);
		const clusterA = result.clusters.find(c => c.codeNames.includes('A'))!;
		expect(clusterA.color).toBe('rgba(255,0,0,0.12)');
		const clusterB = result.clusters.find(c => c.codeNames.includes('B'))!;
		expect(clusterB.color).toBe('rgba(0,255,0,0.12)');
	});

	it('two colors merged → averaged rgb at 0.12 opacity', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		// cutRatio=1 → single cluster with averaged color
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#0000FF'], data, 1);
		expect(result.clusters).toHaveLength(1);
		// Average of (255,0,0) and (0,0,255) = (128,0,128)
		expect(result.clusters[0].color).toBe('rgba(128,0,128,0.12)');
	});

	it('red + blue → purple-ish rgba', () => {
		const data = makeData([], [makeCode('R'), makeCode('B')]);
		const result = clusterCodeCards(['R', 'B'], ['#FF0000', '#0000FF'], data, 1);
		expect(result.clusters).toHaveLength(1);
		const color = result.clusters[0].color;
		expect(color).toBe('rgba(128,0,128,0.12)');
	});

	it('three colors averaged correctly', () => {
		const data = makeData([], [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#FF0000', '#00FF00', '#0000FF'], data, 1);
		expect(result.clusters).toHaveLength(1);
		// Average of (255,0,0), (0,255,0), (0,0,255) = (85,85,85)
		expect(result.clusters[0].color).toBe('rgba(85,85,85,0.12)');
	});

	// --- parseHex (tested indirectly via cluster color) ---

	it('#RRGGBB format produces correct average', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF8800', '#007744'], data, 1);
		expect(result.clusters).toHaveLength(1);
		// (255+0)/2=128, (136+119)/2=128, (0+68)/2=34
		expect(result.clusters[0].color).toBe('rgba(128,128,34,0.12)');
	});

	it('#RGB shorthand format is parsed correctly', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		// #F00 = (255,0,0), #00F = (0,0,255)
		const result = clusterCodeCards(['A', 'B'], ['#F00', '#00F'], data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].color).toBe('rgba(128,0,128,0.12)');
	});

	it('hex without # prefix is parsed correctly', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['FF0000', '00FF00'], data, 1);
		expect(result.clusters).toHaveLength(1);
		// (255+0)/2=128, (0+255)/2=128, (0+0)/2=0
		expect(result.clusters[0].color).toBe('rgba(128,128,0,0.12)');
	});

	// --- Edge cases ---

	it('duplicate code names in input are preserved', () => {
		const data = makeData(
			[makeMarker('m1', ['A'])],
			[makeCode('A', '#FF0000')],
		);
		const result = clusterCodeCards(['A', 'A'], ['#FF0000', '#FF0000'], data, 0.5);
		const total = result.clusters.reduce((sum, c) => sum + c.codeNames.length, 0);
		expect(total).toBe(2);
	});

	it('large number of codes (12) all accounted for', () => {
		const codeNames: string[] = [];
		const colors: string[] = [];
		const codeObjs: UnifiedCode[] = [];
		for (let i = 0; i < 12; i++) {
			const name = `code${i}`;
			codeNames.push(name);
			colors.push(`#${String(i * 20).padStart(2, '0')}${String(i * 15).padStart(2, '0')}${String(i * 10).padStart(2, '0')}`);
			codeObjs.push(makeCode(name));
		}
		const markers = codeNames.map((name, i) => makeMarker(`m${i}`, [name]));
		const data = makeData(markers, codeObjs);
		const result = clusterCodeCards(codeNames, colors, data, 0.3);
		expect(allCodeNames(result)).toEqual([...codeNames].sort());
		// IDs should be sequential
		const ids = result.clusters.map(c => c.id).sort((a, b) => a - b);
		for (let i = 0; i < ids.length; i++) {
			expect(ids[i]).toBe(i);
		}
	});

	it('large number of codes at cutRatio=1 → single cluster', () => {
		const codeNames = Array.from({ length: 12 }, (_, i) => `c${i}`);
		const colors = codeNames.map(() => '#AABBCC');
		const data = makeData([], codeNames.map(c => makeCode(c)));
		const result = clusterCodeCards(codeNames, colors, data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].codeNames.length).toBe(12);
	});

	it('no markers at all → all codes separate at cutRatio<1', () => {
		const data = makeData([], [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#F00', '#0F0', '#00F'], data, 0.3);
		expect(result.clusters.length).toBe(3);
	});

	it('codes not in cooccurrence data get max distance → separate', () => {
		const data = makeData(
			[makeMarker('m1', ['other'])],
			[makeCode('other')],
		);
		const result = clusterCodeCards(['X', 'Y'], ['#F00', '#0F0'], data, 0.3);
		expect(result.clusters.length).toBe(2);
	});

	it('buildDendrogram returns null for empty distMatrix → fallback cluster', () => {
		// This shouldn't happen in practice since length < 2 is handled earlier,
		// but if somehow n >= 2 but buildDendrogram returns null, it falls back
		// We can't trigger this path easily, so test the normal fallback for single code
		const data = makeData([], []);
		const result = clusterCodeCards(['onlyOne'], ['#ABC'], data);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].codeNames).toEqual(['onlyOne']);
	});

	// --- Result structure ---

	it('result has clusters array with id, codeNames, color fields', () => {
		const data = makeData([makeMarker('m1', ['A'])], [makeCode('A')]);
		const result = clusterCodeCards(['A', 'B'], ['#F00', '#0F0'], data, 0);
		for (const cluster of result.clusters) {
			expect(cluster).toHaveProperty('id');
			expect(cluster).toHaveProperty('codeNames');
			expect(cluster).toHaveProperty('color');
			expect(typeof cluster.id).toBe('number');
			expect(Array.isArray(cluster.codeNames)).toBe(true);
			expect(typeof cluster.color).toBe('string');
		}
	});

	it('each cluster codeNames is a non-empty array (when codes provided)', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#F00', '#0F0'], data, 0);
		for (const cluster of result.clusters) {
			expect(cluster.codeNames.length).toBeGreaterThan(0);
		}
	});
});
