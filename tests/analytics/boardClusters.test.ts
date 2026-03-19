import { describe, it, expect } from 'vitest';
import { clusterCodeCards } from '../../src/analytics/board/boardClusters';
import type { ClusterResult } from '../../src/analytics/board/boardClusters';
import type { ConsolidatedData, UnifiedMarker, UnifiedCode } from '../../src/analytics/data/dataTypes';

// ── Helpers ──────────────────────────────────────────────────────

function makeMarker(id: string, codes: string[]): UnifiedMarker {
	return { id, source: 'markdown', fileId: 'f1', codes };
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

// ── clusterCodeCards ─────────────────────────────────────────────
// The function derives active sources from data.sources, computes
// co-occurrence via calculateCooccurrence, builds a Jaccard distance
// matrix, then uses buildDendrogram + cutDendrogram to cluster.
// When Jaccard distance = 0 (perfect co-occurrence), root.distance = 0,
// maxDist = 0 || 1 = 1, cutDistance = cutRatio * 1. Since root.distance
// (0) <= any cutDistance >= 0, all codes merge into one cluster.
// When Jaccard distance = 1 (no co-occurrence), root.distance = 1,
// maxDist = 1, cutDistance = cutRatio. Codes split when cutRatio < 1.

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

	it('single code returns its color directly (not averaged to rgba)', () => {
		const data = makeData(
			[makeMarker('m1', ['A'])],
			[makeCode('A', '#FF0000')],
		);
		const result = clusterCodeCards(['A'], ['#FF0000'], data);
		expect(result.clusters[0].color).toBe('#FF0000');
	});

	// --- Co-occurrence driven clustering ---

	it('two codes that co-occur strongly stay in the same cluster', () => {
		const markers = [
			makeMarker('m1', ['A', 'B']),
			makeMarker('m2', ['A', 'B']),
			makeMarker('m3', ['A', 'B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 0.5);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].codeNames).toContain('A');
		expect(result.clusters[0].codeNames).toContain('B');
	});

	it('two codes that never co-occur are separate at low cutRatio', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 0.3);
		expect(result.clusters.length).toBe(2);
	});

	it('three codes: A-B co-occur, C alone → 2 clusters', () => {
		const markers = [
			makeMarker('m1', ['A', 'B']),
			makeMarker('m2', ['A', 'B']),
			makeMarker('m3', ['C']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#FF0000', '#00FF00', '#0000FF'], data, 0.5);
		expect(result.clusters.length).toBe(2);
		const clusterWithA = result.clusters.find(c => c.codeNames.includes('A'))!;
		expect(clusterWithA.codeNames).toContain('B');
		const clusterWithC = result.clusters.find(c => c.codeNames.includes('C'))!;
		expect(clusterWithC.codeNames).toEqual(['C']);
	});

	it('all codes co-occur equally → single cluster at any cutRatio', () => {
		const markers = [
			makeMarker('m1', ['A', 'B', 'C']),
			makeMarker('m2', ['A', 'B', 'C']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#F00', '#0F0', '#00F'], data, 0.5);
		expect(result.clusters).toHaveLength(1);
	});

	// --- cutRatio extremes ---

	it('cutRatio=0 with perfect co-occurrence keeps codes together (distance=0)', () => {
		const markers = [
			makeMarker('m1', ['A', 'B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 0);
		expect(result.clusters.length).toBe(1);
	});

	it('cutRatio=0 with no co-occurrence separates codes', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 0);
		expect(result.clusters.length).toBe(2);
	});

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

	// --- Codes not in cooccurrence data ---

	it('codes not in cooccurrence data get max distance → separate', () => {
		const data = makeData(
			[makeMarker('m1', ['other'])],
			[makeCode('other')],
		);
		const result = clusterCodeCards(['X', 'Y'], ['#F00', '#0F0'], data, 0.3);
		expect(result.clusters.length).toBe(2);
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
		const result = clusterCodeCards(['A', 'B', 'C'], ['#FF0000', '#00FF00', '#0000FF'], data, 0);
		for (const cluster of result.clusters) {
			expect(cluster.color).toMatch(/^rgba\(\d{1,3},\d{1,3},\d{1,3},0\.12\)$/);
		}
	});

	// --- averageColor (tested indirectly via cluster.color) ---

	it('single-color cluster produces rgba with that color at 0.12 opacity', () => {
		const data = makeData(
			[makeMarker('m1', ['A']), makeMarker('m2', ['B'])],
			[makeCode('A'), makeCode('B')],
		);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data, 0);
		const clusterA = result.clusters.find(c => c.codeNames.includes('A'))!;
		expect(clusterA.color).toBe('rgba(255,0,0,0.12)');
		const clusterB = result.clusters.find(c => c.codeNames.includes('B'))!;
		expect(clusterB.color).toBe('rgba(0,255,0,0.12)');
	});

	it('two colors merged → averaged rgb at 0.12 opacity', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#0000FF'], data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].color).toBe('rgba(128,0,128,0.12)');
	});

	it('red + blue → purple-ish rgba', () => {
		const data = makeData([], [makeCode('R'), makeCode('B')]);
		const result = clusterCodeCards(['R', 'B'], ['#FF0000', '#0000FF'], data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].color).toBe('rgba(128,0,128,0.12)');
	});

	it('three colors averaged correctly', () => {
		const data = makeData([], [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#FF0000', '#00FF00', '#0000FF'], data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].color).toBe('rgba(85,85,85,0.12)');
	});

	// --- parseHex (tested indirectly via cluster color) ---

	it('#RRGGBB format produces correct average', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF8800', '#007744'], data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].color).toBe('rgba(128,128,34,0.12)');
	});

	it('#RGB shorthand format is parsed correctly', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#F00', '#00F'], data, 1);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].color).toBe('rgba(128,0,128,0.12)');
	});

	it('hex without # prefix is parsed correctly', () => {
		const data = makeData([], [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['FF0000', '00FF00'], data, 1);
		expect(result.clusters).toHaveLength(1);
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

	it('all markers have all codes (perfect co-occurrence) → one cluster', () => {
		const codes = ['A', 'B', 'C', 'D'];
		const markers = [
			makeMarker('m1', codes),
			makeMarker('m2', codes),
			makeMarker('m3', codes),
		];
		const data = makeData(markers, codes.map(c => makeCode(c)));
		const result = clusterCodeCards(codes, ['#F00', '#0F0', '#00F', '#FF0'], data, 0.5);
		expect(result.clusters).toHaveLength(1);
		expect(result.clusters[0].codeNames.sort()).toEqual([...codes].sort());
	});

	it('no markers at all → all codes separate at cutRatio<1', () => {
		const data = makeData([], [makeCode('A'), makeCode('B'), makeCode('C')]);
		const result = clusterCodeCards(['A', 'B', 'C'], ['#F00', '#0F0', '#00F'], data, 0.3);
		expect(result.clusters.length).toBe(3);
	});

	it('default cutRatio is 0.5', () => {
		const markers = [
			makeMarker('m1', ['A']),
			makeMarker('m2', ['B']),
		];
		const data = makeData(markers, [makeCode('A'), makeCode('B')]);
		const result = clusterCodeCards(['A', 'B'], ['#FF0000', '#00FF00'], data);
		// No co-occurrence → distance=1, cutDistance=0.5 < 1 → separate
		expect(result.clusters.length).toBe(2);
	});

	// --- Result structure ---

	it('result has clusters array with id, codeNames, color fields', () => {
		const data = makeData([makeMarker('m1', ['A']), makeMarker('m2', ['B'])], [makeCode('A'), makeCode('B')]);
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
		const data = makeData(
			[makeMarker('m1', ['A']), makeMarker('m2', ['B'])],
			[makeCode('A'), makeCode('B')],
		);
		const result = clusterCodeCards(['A', 'B'], ['#F00', '#0F0'], data, 0);
		for (const cluster of result.clusters) {
			expect(cluster.codeNames.length).toBeGreaterThan(0);
		}
	});
});
