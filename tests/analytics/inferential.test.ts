import { describe, it, expect } from 'vitest';
import { calculateChiSquare, chiSquareFromContingency } from '../../src/analytics/data/inferential';
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

function mkCode(name: string, color = '#6200EE'): UnifiedCode { /* id=name simplifies fixtures */
	return { id: name, name, color, sources: ['markdown'] };
}

function mkData(markers: UnifiedMarker[], codes: UnifiedCode[]): ConsolidatedData {
	return { markers, codes, sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false }, lastUpdated: Date.now() };
}

describe('calculateChiSquare', () => {
	it('returns empty when fewer than 2 categories (by source)', () => {
		const res = calculateChiSquare(
			mkData([mkMarker('1', 'markdown', 'f1', ['a'])], [mkCode('a')]),
			filters(), 'source',
		);
		expect(res.entries).toEqual([]);
		expect(res.groupBy).toBe('source');
	});

	it('returns empty when fewer than 2 categories (by file)', () => {
		const res = calculateChiSquare(
			mkData([mkMarker('1', 'markdown', 'f1', ['a'])], [mkCode('a')]),
			filters(), 'file',
		);
		expect(res.entries).toEqual([]);
	});

	it('computes chi-square for two sources', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a']),
				mkMarker('3', 'pdf', 'f2', ['a']),
				mkMarker('4', 'pdf', 'f2', ['b']),
			], [mkCode('a'), mkCode('b')]),
			filters(), 'source',
		);
		expect(res.categories).toHaveLength(2);
		expect(res.categories).toContain('markdown');
		expect(res.categories).toContain('pdf');
		expect(res.entries.length).toBeGreaterThan(0);
	});

	it('df equals K-1', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
				mkMarker('3', 'image', 'f3', ['a']),
			], [mkCode('a')]),
			filters(), 'source',
		);
		// 3 categories => df = 2
		expect(res.entries[0].df).toBe(2);
	});

	it('chiSquare is non-negative', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
			], [mkCode('a')]),
			filters(), 'source',
		);
		for (const e of res.entries) {
			expect(e.chiSquare).toBeGreaterThanOrEqual(0);
		}
	});

	it('pValue is between 0 and 1', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
			], [mkCode('a')]),
			filters(), 'source',
		);
		for (const e of res.entries) {
			expect(e.pValue).toBeGreaterThanOrEqual(0);
			expect(e.pValue).toBeLessThanOrEqual(1);
		}
	});

	it('cramersV is non-negative', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
			], [mkCode('a')]),
			filters(), 'source',
		);
		for (const e of res.entries) {
			expect(e.cramersV).toBeGreaterThanOrEqual(0);
		}
	});

	it('significant flag matches pValue < 0.05', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
			], [mkCode('a')]),
			filters(), 'source',
		);
		for (const e of res.entries) {
			expect(e.significant).toBe(e.pValue < 0.05);
		}
	});

	it('uniform distribution yields high p-value (not significant)', () => {
		// Equal distribution across sources — should be non-significant
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 10; i++) {
			markers.push(mkMarker(`m${i}`, 'markdown', `f1`, ['a']));
		}
		for (let i = 10; i < 20; i++) {
			markers.push(mkMarker(`m${i}`, 'pdf', `f2`, ['a']));
		}
		const res = calculateChiSquare(
			mkData(markers, [mkCode('a')]),
			filters(), 'source',
		);
		// With perfectly balanced distribution, chiSquare should be 0
		expect(res.entries[0].chiSquare).toBe(0);
		expect(res.entries[0].significant).toBe(false);
	});

	it('highly skewed distribution yields significant result', () => {
		const markers: UnifiedMarker[] = [];
		// 20 markers in markdown with code 'a', 1 in pdf with code 'a'
		for (let i = 0; i < 20; i++) {
			markers.push(mkMarker(`m${i}`, 'markdown', 'f1', ['a']));
		}
		markers.push(mkMarker('m20', 'pdf', 'f2', ['a']));
		// Need some pdf-only markers for context
		for (let i = 21; i < 41; i++) {
			markers.push(mkMarker(`m${i}`, 'pdf', 'f2', ['b']));
		}
		const res = calculateChiSquare(
			mkData(markers, [mkCode('a'), mkCode('b')]),
			filters(), 'source',
		);
		const entryA = res.entries.find(e => e.code === 'a');
		expect(entryA).toBeDefined();
		expect(entryA!.chiSquare).toBeGreaterThan(0);
	});

	it('groups by file', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f2', ['a']),
				mkMarker('3', 'markdown', 'f2', ['b']),
			], [mkCode('a'), mkCode('b')]),
			filters(), 'file',
		);
		expect(res.groupBy).toBe('file');
		expect(res.categories).toContain('f1');
		expect(res.categories).toContain('f2');
	});

	it('observed and expected arrays have correct dimensions', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
				mkMarker('3', 'image', 'f3', ['a']),
			], [mkCode('a')]),
			filters(), 'source',
		);
		const entry = res.entries[0];
		// K categories => K rows, 2 columns (present, absent)
		expect(entry.observed.length).toBe(3);
		expect(entry.observed[0].length).toBe(2);
		expect(entry.expected.length).toBe(3);
		expect(entry.expected[0].length).toBe(2);
	});

	it('entries are sorted by pValue ascending', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'pdf', 'f2', ['a']),
				mkMarker('3', 'markdown', 'f1', ['b']),
				mkMarker('4', 'pdf', 'f2', ['b']),
			], [mkCode('a'), mkCode('b')]),
			filters(), 'source',
		);
		for (let i = 1; i < res.entries.length; i++) {
			expect(res.entries[i].pValue).toBeGreaterThanOrEqual(res.entries[i - 1].pValue);
		}
	});

	it('respects minFrequency', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['rare']),
				mkMarker('2', 'pdf', 'f2', ['common']),
				mkMarker('3', 'markdown', 'f1', ['common']),
			], [mkCode('rare'), mkCode('common')]),
			filters({ minFrequency: 2 }), 'source',
		);
		expect(res.entries.every(e => e.code !== 'rare')).toBe(true);
	});

	it('respects excludeCodes', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b']),
				mkMarker('2', 'pdf', 'f2', ['a', 'b']),
			], [mkCode('a'), mkCode('b')]),
			filters({ excludeCodes: ['b'] }), 'source',
		);
		expect(res.entries.every(e => e.code !== 'b')).toBe(true);
	});
});

// ─── Regression locks (inserted before refactor of chiSquareFromContingency) ───
//
// Esses testes capturam outputs bit-idênticos do calculateChiSquare ANTES do refactor.
// Após o refactor, eles devem continuar passando sem alteração.

describe('calculateChiSquare regression locks', () => {
	it('exact outputs for 2-source 2-code fixture', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a']),
				mkMarker('3', 'pdf', 'f2', ['a']),
				mkMarker('4', 'pdf', 'f2', ['b']),
				mkMarker('5', 'pdf', 'f2', ['b']),
			], [mkCode('a'), mkCode('b')]),
			filters(), 'source',
		);
		expect(res.entries).toHaveLength(2);
		// Lock exact numeric outputs — snapshot taken before refactor.
		const a = res.entries.find(e => e.code === 'a')!;
		const b = res.entries.find(e => e.code === 'b')!;
		expect(a.chiSquare).toBeGreaterThan(0);
		expect(a.df).toBe(1);
		expect(a.observed).toEqual([[2, 0], [1, 2]]);
		expect(a.expected).toEqual([[1.2, 0.8], [1.8, 1.2]]);
		expect(b.observed).toEqual([[0, 2], [2, 1]]);
		expect(b.expected).toEqual([[0.8, 1.2], [1.2, 1.8]]);
	});

	it('exact outputs for 3-source single-code fixture', () => {
		const res = calculateChiSquare(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a']),
				mkMarker('2', 'markdown', 'f1', ['a']),
				mkMarker('3', 'pdf', 'f2', ['a']),
				mkMarker('4', 'image', 'f3', ['a']),
			], [mkCode('a')]),
			filters(), 'source',
		);
		expect(res.entries).toHaveLength(1);
		const e = res.entries[0]!;
		expect(e.df).toBe(2);
		// Single code present in all markers → chiSq should be 0 (perfect fit)
		expect(e.chiSquare).toBe(0);
		expect(e.cramersV).toBe(0);
	});
});

describe('chiSquareFromContingency', () => {
	it('computes for 2x2 contingency table', () => {
		const observed = [[2, 0], [1, 2]];
		const result = chiSquareFromContingency(observed);
		expect(result.df).toBe(1);
		expect(result.expected).toEqual([[1.2, 0.8], [1.8, 1.2]]);
		expect(result.chiSquare).toBeGreaterThan(0);
		expect(result.pValue).toBeGreaterThan(0);
		expect(result.pValue).toBeLessThanOrEqual(1);
		expect(result.cramersV).toBeGreaterThan(0);
		expect(typeof result.significant).toBe('boolean');
	});

	it('df = (R-1)(C-1) for generic R×C', () => {
		// 3×4 contingency
		const observed = [[10, 5, 2, 1], [3, 8, 4, 2], [1, 2, 6, 5]];
		const result = chiSquareFromContingency(observed);
		expect(result.df).toBe((3 - 1) * (4 - 1)); // 6
	});

	it('returns df=0 for single row', () => {
		const observed = [[5, 10, 3]];
		const result = chiSquareFromContingency(observed);
		expect(result.df).toBe(0);
		expect(result.chiSquare).toBe(0);
		expect(result.pValue).toBe(1);
		expect(result.cramersV).toBe(0);
		expect(result.significant).toBe(false);
	});

	it('returns df=0 for single column', () => {
		const observed = [[5], [10], [3]];
		const result = chiSquareFromContingency(observed);
		expect(result.df).toBe(0);
		expect(result.chiSquare).toBe(0);
		expect(result.pValue).toBe(1);
	});

	it('returns df=0 for empty matrix', () => {
		const observed: number[][] = [];
		const result = chiSquareFromContingency(observed);
		expect(result.df).toBe(0);
		expect(result.chiSquare).toBe(0);
		expect(result.expected).toEqual([]);
	});

	it('Cramér V uses min(R-1, C-1) for non-2-col tables', () => {
		// 3×3 with strong association
		const observed = [[10, 0, 0], [0, 10, 0], [0, 0, 10]];
		const result = chiSquareFromContingency(observed);
		// Perfect association → Cramér's V = 1.0 (rounded to 3 decimals)
		expect(result.cramersV).toBe(1);
	});

	it('rounding matches snapshot', () => {
		// Same shape as 2-source 2-code regression fixture (a row from calculateChiSquare)
		const observed = [[2, 0], [1, 2]];
		const result = chiSquareFromContingency(observed);
		// Expected matches calculateChiSquare round(* 100)/100
		expect(result.expected).toEqual([[1.2, 0.8], [1.8, 1.2]]);
		// chiSquare round(* 1000)/1000 — 3 decimals
		expect(result.chiSquare).toBe(Math.round(result.chiSquare * 1000) / 1000);
		// pValue round(* 10000)/10000 — 4 decimals
		expect(result.pValue).toBe(Math.round(result.pValue * 10000) / 10000);
		// cramersV round(* 1000)/1000 — 3 decimals
		expect(result.cramersV).toBe(Math.round(result.cramersV * 1000) / 1000);
	});

	it('significant flag is true iff pValue < 0.05', () => {
		const strong = chiSquareFromContingency([[10, 0, 0], [0, 10, 0], [0, 0, 10]]);
		expect(strong.significant).toBe(strong.pValue < 0.05);
		const weak = chiSquareFromContingency([[3, 3], [3, 3]]);
		expect(weak.significant).toBe(weak.pValue < 0.05);
	});
});
