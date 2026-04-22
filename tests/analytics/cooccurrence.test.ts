import { describe, it, expect } from 'vitest';
import { calculateCooccurrence, calculateOverlap } from '../../src/analytics/data/cooccurrence';
import type { ConsolidatedData, FilterConfig, UnifiedMarker, UnifiedCode, SourceType } from '../../src/analytics/data/dataTypes';

function filters(overrides: Partial<FilterConfig> = {}): FilterConfig {
	return {
		sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
		codes: [],
		excludeCodes: [],
		minFrequency: 1,
		...overrides,
	};
}

function mkMarker(id: string, source: SourceType, fileId: string, codes: string[], meta?: UnifiedMarker['meta']): UnifiedMarker {
	return { id, source, fileId, codes, meta };
}

function mkCode(name: string, color = '#6200EE'): UnifiedCode {
	return { id: name, name, color, sources: ['markdown'] };
}

function mkData(markers: UnifiedMarker[], codes: UnifiedCode[]): ConsolidatedData {
	return { markers, codes, sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false }, lastUpdated: Date.now() };
}

// ── calculateCooccurrence ───────────────────────────────────────

describe('calculateCooccurrence', () => {
	it('returns empty for no markers', () => {
		const res = calculateCooccurrence(mkData([], []), filters());
		expect(res.codes).toEqual([]);
		expect(res.matrix).toEqual([]);
		expect(res.maxValue).toBe(0);
	});

	it('diagonal equals self-frequency', () => {
		const res = calculateCooccurrence(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a']),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.matrix[0][0]).toBe(2);
	});

	it('counts pairwise co-occurrence on same marker', () => {
		const res = calculateCooccurrence(
			mkData([mkMarker('1', 'markdown', 'f1', ['a', 'b'])], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBe(1);
		expect(res.matrix[bi][ai]).toBe(1);
	});

	it('matrix is symmetric', () => {
		const res = calculateCooccurrence(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b', 'c']),
				mkMarker('2', 'markdown', 'f1', ['a', 'c']),
			], [mkCode('a'), mkCode('b'), mkCode('c')]),
			filters(),
		);
		const n = res.codes.length;
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n; j++) {
				expect(res.matrix[i][j]).toBe(res.matrix[j][i]);
			}
		}
	});

	it('no co-occurrence when codes are on separate markers', () => {
		const res = calculateCooccurrence(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['b']),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBe(0);
	});

	it('three codes on one marker produce all pairwise co-occurrences', () => {
		const res = calculateCooccurrence(
			mkData([mkMarker('1', 'markdown', 'f1', ['a', 'b', 'c'])], [mkCode('a'), mkCode('b'), mkCode('c')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		const ci = res.codes.indexOf('c');
		expect(res.matrix[ai][bi]).toBe(1);
		expect(res.matrix[ai][ci]).toBe(1);
		expect(res.matrix[bi][ci]).toBe(1);
	});

	it('accumulates co-occurrences across markers', () => {
		const res = calculateCooccurrence(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b']),
				mkMarker('2', 'markdown', 'f1', ['a', 'b']),
				mkMarker('3', 'pdf', 'f2', ['a', 'b']),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBe(3);
	});

	it('maxValue is correct', () => {
		const res = calculateCooccurrence(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a']),
				mkMarker('3', 'markdown', 'f1', ['a']),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.maxValue).toBe(3); // diagonal = 3
	});

	it('codes are sorted alphabetically', () => {
		const res = calculateCooccurrence(
			mkData([mkMarker('1', 'markdown', 'f1', ['z', 'a', 'm'])], [mkCode('z'), mkCode('a'), mkCode('m')]),
			filters(),
		);
		expect(res.codes).toEqual(['a', 'm', 'z']);
	});

	it('respects minFrequency', () => {
		const res = calculateCooccurrence(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['rare', 'common']),
				mkMarker('2', 'markdown', 'f1', ['common']),
			], [mkCode('rare'), mkCode('common')]),
			filters({ minFrequency: 2 }),
		);
		expect(res.codes).toEqual(['common']);
		expect(res.matrix).toEqual([[2]]);
	});

	it('respects excludeCodes', () => {
		const res = calculateCooccurrence(
			mkData([mkMarker('1', 'markdown', 'f1', ['a', 'b'])], [mkCode('a'), mkCode('b')]),
			filters({ excludeCodes: ['b'] }),
		);
		expect(res.codes).toEqual(['a']);
	});

	it('assigns correct colors', () => {
		const res = calculateCooccurrence(
			mkData([mkMarker('1', 'markdown', 'f1', ['a'])], [mkCode('a', '#FF0000')]),
			filters(),
		);
		expect(res.colors[0]).toBe('#FF0000');
	});
});

// ── calculateOverlap ────────────────────────────────────────────

describe('calculateOverlap', () => {
	it('returns empty for no markers', () => {
		const res = calculateOverlap(mkData([], []), filters());
		expect(res.codes).toEqual([]);
		expect(res.matrix).toEqual([]);
		expect(res.totalPairsChecked).toBe(0);
	});

	it('detects overlap between markdown markers on same file', () => {
		const res = calculateOverlap(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1, toLine: 10 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5, toLine: 15 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBeGreaterThan(0);
	});

	it('no overlap for markers on different files', () => {
		const res = calculateOverlap(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1, toLine: 10 }),
				mkMarker('2', 'markdown', 'f2', ['b'], { fromLine: 1, toLine: 10 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBe(0);
	});

	it('no overlap for non-overlapping ranges', () => {
		const res = calculateOverlap(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1, toLine: 5 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 100, toLine: 110 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBe(0);
	});

	it('overlap for audio markers with overlapping time', () => {
		const res = calculateOverlap(
			mkData([
				mkMarker('1', 'audio', 'f1', ['a'], { audioFrom: 0, audioTo: 10 }),
				mkMarker('2', 'audio', 'f1', ['b'], { audioFrom: 5, audioTo: 15 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBeGreaterThan(0);
	});

	it('overlap for video markers with overlapping time', () => {
		const res = calculateOverlap(
			mkData([
				mkMarker('1', 'video', 'f1', ['a'], { videoFrom: 0, videoTo: 10 }),
				mkMarker('2', 'video', 'f1', ['b'], { videoFrom: 5, videoTo: 15 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBeGreaterThan(0);
	});

	it('skips image markers and reports in skippedSources', () => {
		const res = calculateOverlap(
			mkData([mkMarker('1', 'image', 'f1', ['a'])], [mkCode('a')]),
			filters(),
		);
		expect(res.skippedSources).toContain('image');
	});

	it('overlap matrix is symmetric', () => {
		const res = calculateOverlap(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1, toLine: 10 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5, toLine: 15 }),
				mkMarker('3', 'markdown', 'f1', ['c'], { fromLine: 8, toLine: 20 }),
			], [mkCode('a'), mkCode('b'), mkCode('c')]),
			filters(),
		);
		const n = res.codes.length;
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n; j++) {
				expect(res.matrix[i][j]).toBe(res.matrix[j][i]);
			}
		}
	});

	it('csv-row overlap on same row', () => {
		const res = calculateOverlap(
			mkData([
				mkMarker('1', 'csv-row', 'f1', ['a'], { row: 5 }),
				mkMarker('2', 'csv-row', 'f1', ['b'], { row: 5 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBeGreaterThan(0);
	});

	it('pdf overlap on same page', () => {
		const res = calculateOverlap(
			mkData([
				mkMarker('1', 'pdf', 'f1', ['a'], { page: 3 }),
				mkMarker('2', 'pdf', 'f1', ['b'], { page: 3 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[ai][bi]).toBeGreaterThan(0);
	});
});
