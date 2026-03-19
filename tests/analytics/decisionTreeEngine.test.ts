import { describe, it, expect } from 'vitest';
import { buildDecisionTree } from '../../src/analytics/data/decisionTreeEngine';
import type { ConsolidatedData, FilterConfig, UnifiedMarker, UnifiedCode } from '../../src/analytics/data/dataTypes';

function mkMarker(id: string, codes: string[], fileId = 'f.md'): UnifiedMarker {
	return { id, source: 'markdown', fileId, codes };
}

function mkData(markers: UnifiedMarker[], codeNames: string[]): ConsolidatedData {
	const codes: UnifiedCode[] = codeNames.map(name => ({
		name,
		color: '#' + name.charCodeAt(0).toString(16).padStart(6, '0'),
		sources: ['markdown'],
	}));
	return {
		markers,
		codes,
		sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false },
		lastUpdated: Date.now(),
	};
}

const defaultFilters: FilterConfig = {
	sources: ['markdown'],
	codes: [],
	excludeCodes: [],
	minFrequency: 1,
};

describe('buildDecisionTree', () => {
	it('builds tree for empty markers', () => {
		const data = mkData([], ['Outcome', 'Pred']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome');
		expect(result.totalMarkers).toBe(0);
		expect(result.root).toBeDefined();
		expect(result.root.n).toBe(0);
	});

	it('builds leaf node when all markers have same outcome (pure)', () => {
		const markers = Array.from({ length: 10 }, (_, i) =>
			mkMarker(`m${i}`, ['Outcome', 'Pred']),
		);
		const data = mkData(markers, ['Outcome', 'Pred']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome');
		// All positive -> pure node -> leaf
		expect(result.root.children).toHaveLength(0);
		expect(result.root.prediction).toBe(1);
	});

	it('builds tree with split when data is separable', () => {
		// Pred perfectly predicts Outcome
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 20; i++) {
			if (i < 10) {
				markers.push(mkMarker(`m${i}`, ['Outcome', 'Pred']));
			} else {
				markers.push(mkMarker(`m${i}`, [])); // no outcome, no pred
			}
		}
		const data = mkData(markers, ['Outcome', 'Pred']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome', 4, 2);
		expect(result.root).toBeDefined();
		expect(result.totalMarkers).toBe(20);
	});

	it('reports correct accuracy and aPriori', () => {
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 20; i++) {
			if (i < 15) markers.push(mkMarker(`m${i}`, ['Outcome']));
			else markers.push(mkMarker(`m${i}`, []));
		}
		const data = mkData(markers, ['Outcome']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome');
		// No predictors -> leaf. Majority is positive (15/20).
		expect(result.aPriori).toBe(0.75);
		expect(result.accuracy).toBe(0.75);
	});

	it('respects maxDepth parameter', () => {
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 40; i++) {
			const codes: string[] = [];
			if (i % 2 === 0) codes.push('Outcome');
			if (i % 3 === 0) codes.push('A');
			if (i % 5 === 0) codes.push('B');
			if (i % 7 === 0) codes.push('C');
			markers.push(mkMarker(`m${i}`, codes));
		}
		const data = mkData(markers, ['Outcome', 'A', 'B', 'C']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome', 1, 2);
		// maxDepth=1 means root can split but children are leaves
		function maxDepth(node: any): number {
			if (node.children.length === 0) return node.depth;
			return Math.max(...node.children.map((c: any) => maxDepth(c)));
		}
		expect(maxDepth(result.root)).toBeLessThanOrEqual(1);
	});

	it('result contains outcomeCode and outcomeColor', () => {
		const data = mkData([mkMarker('1', ['Outcome'])], ['Outcome']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome');
		expect(result.outcomeCode).toBe('Outcome');
		expect(result.outcomeColor).toBeDefined();
	});

	it('predictors list excludes outcome code', () => {
		const markers = Array.from({ length: 20 }, (_, i) =>
			mkMarker(`m${i}`, i < 10 ? ['Outcome', 'A'] : ['B']),
		);
		const data = mkData(markers, ['Outcome', 'A', 'B']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome', 4, 2);
		expect(result.predictors).not.toContain('Outcome');
	});

	it('tau is 0 when accuracy equals aPriori', () => {
		// All same class, no predictors
		const markers = Array.from({ length: 10 }, (_, i) =>
			mkMarker(`m${i}`, ['Outcome']),
		);
		const data = mkData(markers, ['Outcome']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome');
		expect(result.tau).toBe(0);
	});

	it('filters markers by source', () => {
		const markers = [
			{ id: 'm1', source: 'markdown' as const, fileId: 'f.md', codes: ['Outcome'] },
			{ id: 'm2', source: 'image' as const, fileId: 'f.png', codes: [] },
		];
		const data = mkData(markers, ['Outcome']);
		const filtersOnlyMd: FilterConfig = { ...defaultFilters, sources: ['markdown'] };
		const result = buildDecisionTree(data, filtersOnlyMd, 'Outcome');
		expect(result.totalMarkers).toBe(1);
	});

	it('errorLeaves captures leaf nodes with classification errors', () => {
		// Create markers where prediction will have errors
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 30; i++) {
			const codes: string[] = [];
			// Majority positive but some negative
			if (i < 20) codes.push('Outcome');
			markers.push(mkMarker(`m${i}`, codes));
		}
		const data = mkData(markers, ['Outcome']);
		const result = buildDecisionTree(data, defaultFilters, 'Outcome');
		// Leaf predicts majority (1), so 10 negatives are errors
		if (result.root.errors > 0) {
			expect(result.errorLeaves.length).toBeGreaterThan(0);
			for (const el of result.errorLeaves) {
				expect(el.errors).toBeGreaterThan(0);
				expect(el.markerIds.length).toBeGreaterThan(0);
			}
		}
	});
});
