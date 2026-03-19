import { describe, it, expect } from 'vitest';
import { calculateEvolution, calculateTemporal } from '../../src/analytics/data/evolution';
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
	return { name, color, sources: ['markdown'] };
}

function mkData(markers: UnifiedMarker[], codes: UnifiedCode[]): ConsolidatedData {
	return { markers, codes, sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false }, lastUpdated: Date.now() };
}

// ── calculateEvolution ──────────────────────────────────────────

describe('calculateEvolution', () => {
	it('returns empty points for markers without fromLine', () => {
		const res = calculateEvolution(
			mkData([mkMarker('1', 'markdown', 'f1', ['a'])], [mkCode('a')]),
			filters(),
		);
		expect(res.points).toEqual([]);
		expect(res.files).toEqual([]);
	});

	it('returns empty for empty data', () => {
		const res = calculateEvolution(mkData([], []), filters());
		expect(res.codes).toEqual([]);
		expect(res.points).toEqual([]);
	});

	it('produces points for markers with fromLine', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 10, toLine: 20 }),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.points).toHaveLength(1);
		expect(res.points[0].code).toBe('a');
		expect(res.points[0].fileId).toBe('f1');
		expect(res.points[0].fromLine).toBe(10);
		expect(res.points[0].toLine).toBe(20);
	});

	it('position is normalized (0 to 1)', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 0, toLine: 5 }),
				mkMarker('2', 'markdown', 'f1', ['a'], { fromLine: 50, toLine: 100 }),
			], [mkCode('a')]),
			filters(),
		);
		for (const p of res.points) {
			expect(p.position).toBeGreaterThanOrEqual(0);
			expect(p.position).toBeLessThanOrEqual(1);
		}
	});

	it('position of last line is 1.0 (or near)', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 100, toLine: 100 }),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.points[0].position).toBe(1);
	});

	it('points are sorted by position', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 50, toLine: 60 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { fromLine: 10, toLine: 20 }),
				mkMarker('3', 'markdown', 'f1', ['a'], { fromLine: 80, toLine: 90 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		for (let i = 1; i < res.points.length; i++) {
			expect(res.points[i].position).toBeGreaterThanOrEqual(res.points[i - 1].position);
		}
	});

	it('files list is sorted', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'z.md', ['a'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'a.md', ['a'], { fromLine: 1 }),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.files).toEqual(['a.md', 'z.md']);
	});

	it('multiple files have independent positions', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 50, toLine: 100 }),
				mkMarker('2', 'markdown', 'f2', ['a'], { fromLine: 5, toLine: 10 }),
			], [mkCode('a')]),
			filters(),
		);
		// Each file normalizes independently based on its own max line
		expect(res.points).toHaveLength(2);
	});

	it('codes are sorted alphabetically', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['z'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['a'], { fromLine: 2 }),
			], [mkCode('z'), mkCode('a')]),
			filters(),
		);
		expect(res.codes).toEqual(['a', 'z']);
	});

	it('respects minFrequency', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['rare'], { fromLine: 1 }),
				mkMarker('2', 'markdown', 'f1', ['common'], { fromLine: 2 }),
				mkMarker('3', 'markdown', 'f1', ['common'], { fromLine: 3 }),
			], [mkCode('rare'), mkCode('common')]),
			filters({ minFrequency: 2 }),
		);
		expect(res.codes).toEqual(['common']);
		expect(res.points.every(p => p.code === 'common')).toBe(true);
	});

	it('marker with multiple codes produces multiple points', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b'], { fromLine: 10, toLine: 20 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		expect(res.points).toHaveLength(2);
	});

	it('toLine defaults to fromLine when not provided', () => {
		const res = calculateEvolution(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { fromLine: 10 }),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.points[0].toLine).toBe(10);
	});
});

// ── calculateTemporal ───────────────────────────────────────────

describe('calculateTemporal', () => {
	it('returns empty for markers without createdAt', () => {
		const res = calculateTemporal(
			mkData([mkMarker('1', 'markdown', 'f1', ['a'])], [mkCode('a')]),
			filters(),
		);
		expect(res.codes).toEqual([]);
		expect(res.series).toEqual([]);
		expect(res.dateRange).toEqual([0, 0]);
	});

	it('returns empty for empty data', () => {
		const res = calculateTemporal(mkData([], []), filters());
		expect(res.dateRange).toEqual([0, 0]);
	});

	it('builds cumulative series', () => {
		const res = calculateTemporal(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { createdAt: 1000 }),
				mkMarker('2', 'markdown', 'f1', ['a'], { createdAt: 2000 }),
				mkMarker('3', 'markdown', 'f1', ['a'], { createdAt: 3000 }),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.series).toHaveLength(1);
		const pts = res.series[0].points;
		expect(pts).toHaveLength(3);
		expect(pts[0].count).toBe(1);
		expect(pts[1].count).toBe(2);
		expect(pts[2].count).toBe(3);
	});

	it('series points are sorted by date', () => {
		const res = calculateTemporal(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { createdAt: 3000 }),
				mkMarker('2', 'markdown', 'f1', ['a'], { createdAt: 1000 }),
				mkMarker('3', 'markdown', 'f1', ['a'], { createdAt: 2000 }),
			], [mkCode('a')]),
			filters(),
		);
		const pts = res.series[0].points;
		expect(pts[0].date).toBe(1000);
		expect(pts[1].date).toBe(2000);
		expect(pts[2].date).toBe(3000);
	});

	it('dateRange spans all timestamps', () => {
		const res = calculateTemporal(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { createdAt: 500 }),
				mkMarker('2', 'markdown', 'f1', ['a'], { createdAt: 9000 }),
			], [mkCode('a')]),
			filters(),
		);
		expect(res.dateRange).toEqual([500, 9000]);
	});

	it('respects codes filter', () => {
		const res = calculateTemporal(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b'], { createdAt: 1000 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { createdAt: 2000 }),
			], [mkCode('a'), mkCode('b')]),
			filters({ codes: ['a'] }),
		);
		expect(res.codes).toEqual(['a']);
		expect(res.series).toHaveLength(1);
	});

	it('respects excludeCodes filter', () => {
		const res = calculateTemporal(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a', 'b'], { createdAt: 1000 }),
			], [mkCode('a'), mkCode('b')]),
			filters({ excludeCodes: ['b'] }),
		);
		expect(res.codes).toEqual(['a']);
	});

	it('respects minFrequency', () => {
		const res = calculateTemporal(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['rare'], { createdAt: 1000 }),
				mkMarker('2', 'markdown', 'f1', ['common'], { createdAt: 1000 }),
				mkMarker('3', 'markdown', 'f1', ['common'], { createdAt: 2000 }),
			], [mkCode('rare'), mkCode('common')]),
			filters({ minFrequency: 2 }),
		);
		expect(res.codes).toEqual(['common']);
	});

	it('multiple codes produce multiple series', () => {
		const res = calculateTemporal(
			mkData([
				mkMarker('1', 'markdown', 'f1', ['a'], { createdAt: 1000 }),
				mkMarker('2', 'markdown', 'f1', ['b'], { createdAt: 2000 }),
			], [mkCode('a'), mkCode('b')]),
			filters(),
		);
		expect(res.series).toHaveLength(2);
	});
});
