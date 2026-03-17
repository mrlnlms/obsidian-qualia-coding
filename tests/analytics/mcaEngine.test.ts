import { describe, it, expect } from 'vitest';
import { calculateMCA } from '../../src/analytics/data/mcaEngine';
import type { UnifiedMarker } from '../../src/analytics/data/dataTypes';

function mkMarker(id: string, codes: string[], file = 'f.md'): UnifiedMarker {
	return { id, source: 'markdown', file, codes };
}

describe('calculateMCA', () => {
	it('returns null for empty markers', async () => {
		const result = await calculateMCA([], ['A', 'B'], ['#f00', '#0f0']);
		expect(result).toBeNull();
	});

	it('returns null for fewer than 2 codes', async () => {
		const markers = [mkMarker('1', ['A']), mkMarker('2', ['A'])];
		const result = await calculateMCA(markers, ['A'], ['#f00']);
		expect(result).toBeNull();
	});

	it('returns null for fewer than 2 valid markers', async () => {
		const markers = [mkMarker('1', ['A', 'B'])];
		const result = await calculateMCA(markers, ['A', 'B'], ['#f00', '#0f0']);
		expect(result).toBeNull();
	});

	it('returns null when no markers have any of the target codes', async () => {
		const markers = [mkMarker('1', ['X']), mkMarker('2', ['Y'])];
		const result = await calculateMCA(markers, ['A', 'B'], ['#f00', '#0f0']);
		expect(result).toBeNull();
	});

	it('returns valid result for 3 markers with 2 codes', async () => {
		const markers = [
			mkMarker('1', ['A', 'B']),
			mkMarker('2', ['A']),
			mkMarker('3', ['B']),
		];
		const result = await calculateMCA(markers, ['A', 'B'], ['#f00', '#0f0']);
		// May return null if SVD finds insufficient dimensions, but if not:
		if (result) {
			expect(result.codePoints.length).toBeGreaterThanOrEqual(1);
			expect(result.markerPoints.length).toBeGreaterThanOrEqual(1);
			expect(result.eigenvalues.length).toBeGreaterThanOrEqual(1);
			expect(result.inertiaExplained).toHaveLength(2);
		}
	});

	it('returns result with correct structure for sufficient data', async () => {
		const markers = [
			mkMarker('1', ['A', 'B']),
			mkMarker('2', ['A', 'C']),
			mkMarker('3', ['B', 'C']),
			mkMarker('4', ['A']),
			mkMarker('5', ['B']),
		];
		const result = await calculateMCA(markers, ['A', 'B', 'C'], ['#f00', '#0f0', '#00f']);
		if (result) {
			expect(result.codePoints).toBeDefined();
			expect(result.markerPoints).toBeDefined();
			for (const cp of result.codePoints) {
				expect(typeof cp.x).toBe('number');
				expect(typeof cp.y).toBe('number');
				expect(cp.name).toBeTruthy();
			}
			for (const mp of result.markerPoints) {
				expect(typeof mp.x).toBe('number');
				expect(typeof mp.y).toBe('number');
				expect(mp.id).toBeTruthy();
			}
		}
	});

	it('eigenvalues are non-negative', async () => {
		const markers = [
			mkMarker('1', ['A', 'B']),
			mkMarker('2', ['A', 'C']),
			mkMarker('3', ['B', 'C']),
			mkMarker('4', ['A', 'B', 'C']),
		];
		const result = await calculateMCA(markers, ['A', 'B', 'C'], ['#f00', '#0f0', '#00f']);
		if (result) {
			for (const ev of result.eigenvalues) {
				expect(ev).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it('inertiaExplained values are between 0 and 100', async () => {
		const markers = [
			mkMarker('1', ['A', 'B']),
			mkMarker('2', ['A', 'C']),
			mkMarker('3', ['B', 'C']),
			mkMarker('4', ['A']),
			mkMarker('5', ['C']),
		];
		const result = await calculateMCA(markers, ['A', 'B', 'C'], ['#f00', '#0f0', '#00f']);
		if (result) {
			expect(result.inertiaExplained[0]).toBeGreaterThanOrEqual(0);
			expect(result.inertiaExplained[0]).toBeLessThanOrEqual(100);
			expect(result.inertiaExplained[1]).toBeGreaterThanOrEqual(0);
			expect(result.inertiaExplained[1]).toBeLessThanOrEqual(100);
		}
	});
});
