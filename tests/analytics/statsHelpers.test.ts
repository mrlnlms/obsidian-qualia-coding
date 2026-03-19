import { describe, it, expect } from 'vitest';
import { applyFilters } from '../../src/analytics/data/statsHelpers';
import type { ConsolidatedData, FilterConfig, UnifiedMarker, SourceType } from '../../src/analytics/data/dataTypes';

function filters(overrides: Partial<FilterConfig> = {}): FilterConfig {
	return {
		sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
		codes: [],
		excludeCodes: [],
		minFrequency: 1,
		...overrides,
	};
}

function mkMarker(id: string, source: SourceType, fileId: string, codes: string[]): UnifiedMarker {
	return { id, source, fileId, codes };
}

function mkData(markers: UnifiedMarker[]): ConsolidatedData {
	return { markers, codes: [], sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false }, lastUpdated: Date.now() };
}

describe('applyFilters', () => {
	it('returns all markers when no filters are active', () => {
		const markers = [
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'pdf', 'f2', ['b']),
		];
		const result = applyFilters(mkData(markers), filters());
		expect(result).toHaveLength(2);
	});

	it('returns empty for empty data', () => {
		expect(applyFilters(mkData([]), filters())).toEqual([]);
	});

	it('filters by source — includes only matching sources', () => {
		const markers = [
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'pdf', 'f2', ['a']),
			mkMarker('3', 'image', 'f3', ['a']),
		];
		const result = applyFilters(mkData(markers), filters({ sources: ['pdf'] }));
		expect(result).toHaveLength(1);
		expect(result[0].source).toBe('pdf');
	});

	it('filters by source — empty sources array excludes everything', () => {
		const markers = [mkMarker('1', 'markdown', 'f1', ['a'])];
		const result = applyFilters(mkData(markers), filters({ sources: [] }));
		expect(result).toEqual([]);
	});

	it('filters by codes — includes markers with at least one matching code', () => {
		const markers = [
			mkMarker('1', 'markdown', 'f1', ['a', 'b']),
			mkMarker('2', 'markdown', 'f1', ['c']),
		];
		const result = applyFilters(mkData(markers), filters({ codes: ['a'] }));
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('1');
	});

	it('empty codes array means no code filter (include all)', () => {
		const markers = [
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'markdown', 'f1', ['b']),
		];
		const result = applyFilters(mkData(markers), filters({ codes: [] }));
		expect(result).toHaveLength(2);
	});

	it('excludeCodes removes markers where ALL codes are excluded', () => {
		const markers = [
			mkMarker('1', 'markdown', 'f1', ['a', 'b']),   // has 'a' which is not excluded
			mkMarker('2', 'markdown', 'f1', ['b']),          // all codes are excluded
		];
		const result = applyFilters(mkData(markers), filters({ excludeCodes: ['b'] }));
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('1');
	});

	it('excludeCodes with empty array excludes nothing', () => {
		const markers = [mkMarker('1', 'markdown', 'f1', ['a'])];
		const result = applyFilters(mkData(markers), filters({ excludeCodes: [] }));
		expect(result).toHaveLength(1);
	});

	it('combines source and code filters', () => {
		const markers = [
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'pdf', 'f2', ['a']),
			mkMarker('3', 'markdown', 'f1', ['b']),
		];
		const result = applyFilters(mkData(markers), filters({ sources: ['markdown'], codes: ['a'] }));
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('1');
	});

	it('combines source, codes, and excludeCodes', () => {
		const markers = [
			mkMarker('1', 'markdown', 'f1', ['a', 'x']),
			mkMarker('2', 'markdown', 'f1', ['x']),
			mkMarker('3', 'pdf', 'f2', ['a']),
		];
		const result = applyFilters(mkData(markers), filters({
			sources: ['markdown'],
			codes: ['a', 'x'],
			excludeCodes: ['x'],
		}));
		// marker 1: markdown, has 'a' (matches codes), has 'a' which is not excluded => included
		// marker 2: markdown, has 'x' (matches codes), but ALL codes are excluded => excluded
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('1');
	});

	it('filters all seven source types correctly', () => {
		const allSources: SourceType[] = ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'];
		const markers = allSources.map((s, i) => mkMarker(`${i}`, s, `f${i}`, ['a']));
		for (const src of allSources) {
			const result = applyFilters(mkData(markers), filters({ sources: [src] }));
			expect(result).toHaveLength(1);
			expect(result[0].source).toBe(src);
		}
	});

	it('marker with empty codes array is included when no code filter', () => {
		const markers = [mkMarker('1', 'markdown', 'f1', [])];
		const result = applyFilters(mkData(markers), filters());
		expect(result).toHaveLength(1);
	});

	it('marker with empty codes array is excluded when code filter is active', () => {
		const markers = [mkMarker('1', 'markdown', 'f1', [])];
		const result = applyFilters(mkData(markers), filters({ codes: ['a'] }));
		expect(result).toEqual([]);
	});
});
