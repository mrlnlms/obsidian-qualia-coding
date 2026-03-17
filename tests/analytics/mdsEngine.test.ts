import { describe, it, expect } from 'vitest';
import { calculateMDS } from '../../src/analytics/data/mdsEngine';
import type { UnifiedMarker, UnifiedCode, SourceType } from '../../src/analytics/data/dataTypes';

function mkMarker(id: string, codes: string[], file: string, source: SourceType = 'markdown'): UnifiedMarker {
	return { id, source, file, codes };
}

function mkCode(name: string, color = '#6200EE'): UnifiedCode {
	return { name, color, sources: ['markdown'] };
}

const ALL_SOURCES: SourceType[] = ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'];

describe('calculateMDS', () => {
	it('returns null for empty markers', async () => {
		const result = await calculateMDS([], [mkCode('A')], 'codes', ALL_SOURCES);
		expect(result).toBeNull();
	});

	it('returns null for fewer than 3 active codes in codes mode', async () => {
		const markers = [mkMarker('1', ['A'], 'f1.md'), mkMarker('2', ['B'], 'f2.md')];
		const codes = [mkCode('A'), mkCode('B')];
		const result = await calculateMDS(markers, codes, 'codes', ALL_SOURCES);
		expect(result).toBeNull();
	});

	it('returns null for fewer than 3 files in files mode', async () => {
		const markers = [mkMarker('1', ['A'], 'f1.md'), mkMarker('2', ['B'], 'f2.md')];
		const codes = [mkCode('A'), mkCode('B')];
		const result = await calculateMDS(markers, codes, 'files', ALL_SOURCES);
		expect(result).toBeNull();
	});

	it('returns valid result for codes mode with sufficient data', async () => {
		const markers = [
			mkMarker('1', ['A', 'B'], 'f1.md'),
			mkMarker('2', ['B', 'C'], 'f2.md'),
			mkMarker('3', ['A', 'C'], 'f3.md'),
			mkMarker('4', ['A'], 'f4.md'),
			mkMarker('5', ['B'], 'f5.md'),
			mkMarker('6', ['C'], 'f6.md'),
		];
		const codes = [mkCode('A', '#f00'), mkCode('B', '#0f0'), mkCode('C', '#00f')];
		const result = await calculateMDS(markers, codes, 'codes', ALL_SOURCES);
		expect(result).not.toBeNull();
		expect(result!.mode).toBe('codes');
		expect(result!.points).toHaveLength(3);
		expect(typeof result!.stress).toBe('number');
		expect(result!.varianceExplained).toHaveLength(2);
	});

	it('returns valid result for files mode with sufficient data', async () => {
		const markers = [
			mkMarker('1', ['A', 'B'], 'f1.md'),
			mkMarker('2', ['B', 'C'], 'f2.md'),
			mkMarker('3', ['A', 'C'], 'f3.md'),
		];
		const codes = [mkCode('A'), mkCode('B'), mkCode('C')];
		const result = await calculateMDS(markers, codes, 'files', ALL_SOURCES);
		expect(result).not.toBeNull();
		expect(result!.mode).toBe('files');
		expect(result!.points).toHaveLength(3);
	});

	it('filters markers by enabled sources', async () => {
		const markers = [
			mkMarker('1', ['A', 'B'], 'f1.md', 'markdown'),
			mkMarker('2', ['B', 'C'], 'f2.md', 'image'),
			mkMarker('3', ['A', 'C'], 'f3.md', 'image'),
			mkMarker('4', ['A'], 'f4.md', 'image'),
		];
		const codes = [mkCode('A'), mkCode('B'), mkCode('C')];
		// Only markdown enabled - only 1 marker, not enough
		const result = await calculateMDS(markers, codes, 'codes', ['markdown']);
		expect(result).toBeNull();
	});

	it('stress is between 0 and 1', async () => {
		const markers = [
			mkMarker('1', ['A', 'B'], 'f1.md'),
			mkMarker('2', ['B', 'C'], 'f2.md'),
			mkMarker('3', ['A', 'C'], 'f3.md'),
			mkMarker('4', ['A', 'B', 'C'], 'f4.md'),
		];
		const codes = [mkCode('A'), mkCode('B'), mkCode('C')];
		const result = await calculateMDS(markers, codes, 'codes', ALL_SOURCES);
		if (result) {
			expect(result.stress).toBeGreaterThanOrEqual(0);
			expect(result.stress).toBeLessThanOrEqual(1);
		}
	});

	it('points have name, color, x, y, size fields', async () => {
		const markers = [
			mkMarker('1', ['A', 'B'], 'f1.md'),
			mkMarker('2', ['B', 'C'], 'f2.md'),
			mkMarker('3', ['A', 'C'], 'f3.md'),
			mkMarker('4', ['A'], 'f4.md'),
		];
		const codes = [mkCode('A', '#f00'), mkCode('B', '#0f0'), mkCode('C', '#00f')];
		const result = await calculateMDS(markers, codes, 'codes', ALL_SOURCES);
		if (result) {
			for (const p of result.points) {
				expect(typeof p.name).toBe('string');
				expect(typeof p.color).toBe('string');
				expect(typeof p.x).toBe('number');
				expect(typeof p.y).toBe('number');
				expect(typeof p.size).toBe('number');
			}
		}
	});
});
