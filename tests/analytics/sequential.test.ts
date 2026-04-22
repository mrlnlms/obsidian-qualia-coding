import { describe, it, expect } from 'vitest';
import { calculateLagSequential, calculatePolarCoordinates } from '../../src/analytics/data/sequential';
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

// ── calculateLagSequential ──────────────────────────────────────

describe('calculateLagSequential', () => {
	it('returns empty for no markers', () => {
		const res = calculateLagSequential(mkData([], []), filters(), 1);
		expect(res.codes).toEqual([]);
		expect(res.totalTransitions).toBe(0);
		expect(res.lag).toBe(1);
	});

	it('counts lag-1 transitions correctly', () => {
		// A -> B -> A => transitions: A->B, B->A
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5 }),
				mkMarker('3', 'markdown', 'f1', ['a'], { fromLine: 10 }),
			], [mkCode('a'), mkCode('b')]),
			filters(), 1,
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.transitions[ai][bi]).toBe(1); // A -> B
		expect(res.transitions[bi][ai]).toBe(1); // B -> A
		expect(res.totalTransitions).toBe(2);
	});

	it('counts lag-2 transitions correctly', () => {
		// Markers: A(1), B(5), C(10) => lag-2: A->C
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5 }),
				mkMarker('3', 'markdown', 'f1', ['c'], { fromLine: 10 }),
			], [mkCode('a'), mkCode('b'), mkCode('c')]),
			filters(), 2,
		);
		const ai = res.codes.indexOf('a');
		const ci = res.codes.indexOf('c');
		expect(res.transitions[ai][ci]).toBe(1); // A -> C at lag 2
	});

	it('single marker has no transitions', () => {
		const res = calculateLagSequential(
			mkData([mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1 })], [mkCode('a')]),
			filters(), 1,
		);
		expect(res.totalTransitions).toBe(0);
	});

	it('lag larger than marker count yields zero transitions', () => {
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5 }),
			], [mkCode('a'), mkCode('b')]),
			filters(), 10,
		);
		expect(res.totalTransitions).toBe(0);
	});

	it('transitions matrix is NxN', () => {
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5 }),
			], [mkCode('a'), mkCode('b')]),
			filters(), 1,
		);
		expect(res.transitions.length).toBe(2);
		expect(res.transitions[0].length).toBe(2);
	});

	it('expected values are computed', () => {
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5 }),
				mkMarker('3', 'markdown', 'f1', ['a'], { fromLine: 10 }),
				mkMarker('4', 'markdown', 'f1', ['b'], { fromLine: 15 }),
			], [mkCode('a'), mkCode('b')]),
			filters(), 1,
		);
		for (const row of res.expected) {
			for (const val of row) {
				expect(isFinite(val)).toBe(true);
				expect(val).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it('zScores are finite', () => {
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5 }),
				mkMarker('3', 'markdown', 'f1', ['a'], { fromLine: 10 }),
				mkMarker('4', 'markdown', 'f1', ['b'], { fromLine: 15 }),
			], [mkCode('a'), mkCode('b')]),
			filters(), 1,
		);
		for (const row of res.zScores) {
			for (const val of row) {
				expect(isFinite(val)).toBe(true);
			}
		}
	});

	it('markers are sorted by position within file', () => {
		// Out-of-order markers should still produce correct transitions
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['b'], { fromLine: 10 }),
				mkMarker('2', 'markdown', 'f1', ['a'], { fromLine: 1 }),
			], [mkCode('a'), mkCode('b')]),
			filters(), 1,
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.transitions[ai][bi]).toBe(1); // A(line1) -> B(line10)
	});

	it('separate files have independent sequences', () => {
		// file1: A -> B, file2: B -> A
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 5 }),
				mkMarker('3', 'markdown', 'f2', ['b'], { fromLine: 1 }),
				mkMarker('4', 'markdown', 'f2', ['a'], { fromLine: 5 }),
			], [mkCode('a'), mkCode('b')]),
			filters(), 1,
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.transitions[ai][bi]).toBe(1); // f1: A->B
		expect(res.transitions[bi][ai]).toBe(1); // f2: B->A
	});

	it('marker with multiple codes produces cross-transitions', () => {
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['c'], { fromLine: 5 }),
			], [mkCode('a'), mkCode('b'), mkCode('c')]),
			filters(), 1,
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		const ci = res.codes.indexOf('c');
		expect(res.transitions[ai][ci]).toBe(1);
		expect(res.transitions[bi][ci]).toBe(1);
	});

	it('uses audioFrom for position ordering', () => {
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'audio', 'f1', ['a'], { audioFrom: 0, audioTo: 5 }),
				mkMarker('2', 'audio', 'f1', ['b'], { audioFrom: 10, audioTo: 15 }),
			], [mkCode('a'), mkCode('b')]),
			filters(), 1,
		);
		const ai = res.codes.indexOf('a');
		const bi = res.codes.indexOf('b');
		expect(res.transitions[ai][bi]).toBe(1);
	});

	it('respects minFrequency', () => {
		const res = calculateLagSequential(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['rare'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['common'], { fromLine: 5 }),
				mkMarker('3', 'markdown', 'f1', ['common'], { fromLine: 10 }),
			], [mkCode('rare'), mkCode('common')]),
			filters({ minFrequency: 2 }), 1,
		);
		expect(res.codes).toEqual(['common']);
	});
});

// ── calculatePolarCoordinates ───────────────────────────────────

describe('calculatePolarCoordinates', () => {
	it('returns empty vectors for no markers', () => {
		const res = calculatePolarCoordinates(mkData([], []), filters(), 'a');
		expect(res.vectors).toEqual([]);
		expect(res.focalCode).toBe('a');
	});

	it('returns empty vectors when focal code not found', () => {
		const res = calculatePolarCoordinates(
			mkData([mkMarker('1', 'markdown', 'f1', ['b'], { fromLine: 1 })], [mkCode('b')]),
			filters(), 'nonexistent',
		);
		expect(res.vectors).toEqual([]);
	});

	it('computes vectors with expected fields', () => {
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 20; i++) {
			markers.push(mkMarker(`m${i}`, 'markdown', 'f1', [i % 2 === 0 ? 'a' : 'b'], { fromLine: i * 10 }));
		}
		const res = calculatePolarCoordinates(
			mkData(markers, [mkCode('a'), mkCode('b')]),
			filters(), 'a', 3,
		);
		expect(res.maxLag).toBe(3);
		expect(res.focalCode).toBe('a');
		if (res.vectors.length > 0) {
			const v = res.vectors[0];
			expect(typeof v.zProspective).toBe('number');
			expect(typeof v.zRetrospective).toBe('number');
			expect(typeof v.radius).toBe('number');
			expect(typeof v.angle).toBe('number');
			expect([1, 2, 3, 4]).toContain(v.quadrant);
			expect(typeof v.significant).toBe('boolean');
		}
	});

	it('significance is based on radius > 1.96', () => {
		// With enough alternating data, we expect significant results
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 50; i++) {
			markers.push(mkMarker(`m${i}`, 'markdown', 'f1', [i % 2 === 0 ? 'a' : 'b'], { fromLine: i }));
		}
		const res = calculatePolarCoordinates(
			mkData(markers, [mkCode('a'), mkCode('b')]),
			filters(), 'a', 5,
		);
		for (const v of res.vectors) {
			if (v.radius > 1.96) {
				expect(v.significant).toBe(true);
			} else {
				expect(v.significant).toBe(false);
			}
		}
	});

	it('vectors are sorted by radius descending', () => {
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 30; i++) {
			const code = ['a', 'b', 'c'][i % 3];
			markers.push(mkMarker(`m${i}`, 'markdown', 'f1', [code], { fromLine: i * 5 }));
		}
		const res = calculatePolarCoordinates(
			mkData(markers, [mkCode('a'), mkCode('b'), mkCode('c')]),
			filters(), 'a', 3,
		);
		for (let i = 1; i < res.vectors.length; i++) {
			expect(res.vectors[i].radius).toBeLessThanOrEqual(res.vectors[i - 1].radius);
		}
	});

	it('focal code is excluded from vectors', () => {
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 10; i++) {
			markers.push(mkMarker(`m${i}`, 'markdown', 'f1', [i % 2 === 0 ? 'a' : 'b'], { fromLine: i }));
		}
		const res = calculatePolarCoordinates(
			mkData(markers, [mkCode('a'), mkCode('b')]),
			filters(), 'a', 2,
		);
		expect(res.vectors.every(v => v.code !== 'a')).toBe(true);
	});
});
