import { describe, it, expect } from 'vitest';
import { calculateFrequency, calculateDocumentCodeMatrix, calculateSourceComparison } from '../../src/analytics/data/frequency';
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

// ── calculateFrequency ──────────────────────────────────────────

describe('calculateFrequency', () => {
	it('returns empty array for empty data', () => {
		expect(calculateFrequency(mkData([], []), filters())).toEqual([]);
	});

	it('counts a single code once', () => {
		const res = calculateFrequency(
			mkData([mkMarker('1', 'markdown', 'f1', ['joy'])], [mkCode('joy', '#F00')]),
			filters(),
		);
		expect(res).toHaveLength(1);
		expect(res[0]).toMatchObject({ code: 'joy', total: 1, color: '#F00' });
	});

	it('counts same code across multiple markers', () => {
		const res = calculateFrequency(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['joy']),
				mkMarker('2', 'markdown', 'f1', ['joy']),
				mkMarker('3', 'pdf', 'f2', ['joy']),
			], [mkCode('joy')]),
			filters(),
		);
		expect(res[0].total).toBe(3);
	});

	it('tracks bySource counts correctly', () => {
		const res = calculateFrequency(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
				mkMarker('3', 'pdf', 'f3', ['a']),
			], [mkCode('a')]),
			filters(),
		);
		expect(res[0].bySource.markdown).toBe(1);
		expect(res[0].bySource.pdf).toBe(2);
		expect(res[0].bySource.image).toBe(0);
	});

	it('tracks byFile counts correctly', () => {
		const res = calculateFrequency(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a']),
				mkMarker('3', 'markdown', 'f2', ['a']),
			], [mkCode('a')]),
			filters(),
		);
		expect(res[0].byFile).toEqual({ f1: 2, f2: 1 });
	});

	it('handles marker with multiple codes', () => {
		const res = calculateFrequency(
			mkData([mkMarker('1', 'markdown', 'f1', ['a', 'b'])], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		expect(res).toHaveLength(2);
		expect(res.find(r => r.code === 'a')!.total).toBe(1);
		expect(res.find(r => r.code === 'b')!.total).toBe(1);
	});

	it('applies source filter', () => {
		const res = calculateFrequency(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
			], [mkCode('a')]),
			filters({ sources: ['pdf'] }),
		);
		expect(res[0].total).toBe(1);
		expect(res[0].bySource.pdf).toBe(1);
	});

	it('applies codes filter (include list)', () => {
		const res = calculateFrequency(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b']),
			], [mkCode('a'), mkCode('b')]),
			filters({ codes: ['a'] }),
		);
		expect(res).toHaveLength(1);
		expect(res[0].code).toBe('a');
	});

	it('applies excludeCodes filter', () => {
		const res = calculateFrequency(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b']),
			], [mkCode('a'), mkCode('b')]),
			filters({ excludeCodes: ['b'] }),
		);
		expect(res).toHaveLength(1);
		expect(res[0].code).toBe('a');
	});

	it('applies minFrequency filter', () => {
		const res = calculateFrequency(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['rare']),
				mkMarker('2', 'markdown', 'f1', ['common']),
				mkMarker('3', 'markdown', 'f1', ['common']),
			], [mkCode('rare'), mkCode('common')]),
			filters({ minFrequency: 2 }),
		);
		expect(res).toHaveLength(1);
		expect(res[0].code).toBe('common');
	});

	it('uses default color when code not in definitions', () => {
		const res = calculateFrequency(
			mkData([mkMarker('1', 'markdown', 'f1', ['unknown'])], []),
			filters(),
		);
		expect(res[0].color).toBe('#6200EE');
	});

	it('handles all seven source types', () => {
		const sources: SourceType[] = ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'];
		const markers = sources.map((s, i) => mkMarker(`m${i}`, s, `f${i}`, ['a']));
		const res = calculateFrequency(mkData(markers, [mkCode('a')]), filters());
		expect(res[0].total).toBe(7);
		for (const s of sources) {
			expect(res[0].bySource[s]).toBe(1);
		}
	});
});

// ── calculateDocumentCodeMatrix ─────────────────────────────────

describe('calculateDocumentCodeMatrix', () => {
	it('returns empty for no markers', () => {
		const res = calculateDocumentCodeMatrix(mkData([], []), filters());
		expect(res.files).toEqual([]);
		expect(res.codes).toEqual([]);
		expect(res.matrix).toEqual([]);
	});

	it('builds correct matrix for single file, multiple codes', () => {
		const res = calculateDocumentCodeMatrix(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a', 'b']),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		expect(res.files).toEqual(['f1']);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.matrix[0][ai]).toBe(2);
		expect(res.matrix[0][bi]).toBe(1);
	});

	it('builds correct matrix for multiple files', () => {
		const res = calculateDocumentCodeMatrix(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f2', ['b']),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		expect(res.files).toEqual(['f1', 'f2']);
		expect(res.codes).toEqual(['a', 'b']);
	});

	it('codes are sorted alphabetically', () => {
		const res = calculateDocumentCodeMatrix(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['z-code']),
				mkMarker('2', 'markdown', 'f1', ['a-code']),
			], [mkCode('z-code'), mkCode('a-code')]),
			filters(),
		);
		expect(res.codes).toEqual(['a-code', 'z-code']);
	});

	it('calculates maxValue correctly', () => {
		const res = calculateDocumentCodeMatrix(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a']),
				mkMarker('3', 'markdown', 'f1', ['a']),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.maxValue).toBe(3);
	});

	it('respects minFrequency', () => {
		const res = calculateDocumentCodeMatrix(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['rare']),
				mkMarker('2', 'markdown', 'f1', ['common']),
				mkMarker('3', 'markdown', 'f1', ['common']),
			], [mkCode('rare'), mkCode('common')]),
			filters({ minFrequency: 2 }),
		);
		expect(res.codes).toEqual(['common']);
	});
});

// ── calculateSourceComparison ───────────────────────────────────

describe('calculateSourceComparison', () => {
	it('returns empty for no markers', () => {
		const res = calculateSourceComparison(mkData([], []), filters());
		expect(res.entries).toEqual([]);
		expect(res.activeSources).toEqual([]);
	});

	it('computes bySourcePctOfCode', () => {
		const res = calculateSourceComparison(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a']),
				mkMarker('3', 'pdf', 'f2', ['a']),
			], [mkCode('a')]),
			filters(),
		);
		const entry = res.entries[0];
		// 2 markdown out of 3 total = 66.7%
		expect(entry.bySourcePctOfCode.markdown).toBeCloseTo(66.7, 0);
		expect(entry.bySourcePctOfCode.pdf).toBeCloseTo(33.3, 0);
	});

	it('computes bySourcePctOfSrc', () => {
		const res = calculateSourceComparison(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['b']),
				mkMarker('3', 'pdf', 'f2', ['a']),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		const entryA = res.entries.find(e => e.code === 'a')!;
		// markdown: 1 of 2 markdown markers = 50%
		expect(entryA.bySourcePctOfSrc.markdown).toBe(50);
		// pdf: 1 of 1 pdf markers = 100%
		expect(entryA.bySourcePctOfSrc.pdf).toBe(100);
	});

	it('entries are sorted by total descending', () => {
		const res = calculateSourceComparison(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['less']),
				mkMarker('2', 'markdown', 'f1', ['more']),
				mkMarker('3', 'markdown', 'f1', ['more']),
				mkMarker('4', 'markdown', 'f1', ['more']),
			], [mkCode('less'), mkCode('more')]),
			filters(),
		);
		expect(res.entries[0].code).toBe('more');
		expect(res.entries[1].code).toBe('less');
	});

	it('identifies active sources', () => {
		const res = calculateSourceComparison(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'audio', 'f2', ['a']),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.activeSources).toContain('markdown');
		expect(res.activeSources).toContain('audio');
		expect(res.activeSources).not.toContain('pdf');
	});

	it('respects minFrequency', () => {
		const res = calculateSourceComparison(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['rare']),
			], [mkCode('rare')]),
			filters({ minFrequency: 5 }),
		);
		expect(res.entries).toEqual([]);
	});
});
