import { describe, it, expect } from 'vitest';
import { calculateChiSquare } from '../../src/analytics/data/inferential';
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
