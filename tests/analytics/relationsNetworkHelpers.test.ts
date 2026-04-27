import { describe, it, expect } from 'vitest';
import {
	isEdgeAboveThreshold,
	computeEdgeOpacity,
} from '../../src/analytics/views/modes/relationsNetworkHelpers';

describe('isEdgeAboveThreshold', () => {
	it('returns true when weight is strictly above minWeight', () => {
		expect(isEdgeAboveThreshold(5, 3)).toBe(true);
	});

	it('returns false when weight is below minWeight', () => {
		expect(isEdgeAboveThreshold(2, 3)).toBe(false);
	});

	it('returns true at boundary (weight === minWeight, inclusivo)', () => {
		expect(isEdgeAboveThreshold(3, 3)).toBe(true);
	});
});

describe('computeEdgeOpacity', () => {
	// Fórmula base: 0.25 + 0.6 * (weight / maxWeight)
	// weight=5, maxWeight=10 → 0.25 + 0.6 * 0.5 = 0.55

	it('returns base opacity when hoveredNodeIdx is null', () => {
		expect(computeEdgeOpacity(5, 10, { sourceIdx: 0, targetIdx: 1 }, null)).toBeCloseTo(0.55);
	});

	it('returns base opacity when edge connects to hovered source', () => {
		expect(computeEdgeOpacity(5, 10, { sourceIdx: 2, targetIdx: 1 }, 2)).toBeCloseTo(0.55);
	});

	it('returns base opacity when edge connects to hovered target', () => {
		expect(computeEdgeOpacity(5, 10, { sourceIdx: 0, targetIdx: 3 }, 3)).toBeCloseTo(0.55);
	});

	it('returns base / 3 when edge does not touch hovered node', () => {
		expect(computeEdgeOpacity(5, 10, { sourceIdx: 0, targetIdx: 1 }, 7)).toBeCloseTo(0.55 / 3);
	});

	it('scales linearly with weight/maxWeight', () => {
		// weight=10, maxWeight=10 → 0.25 + 0.6 * 1 = 0.85
		expect(computeEdgeOpacity(10, 10, { sourceIdx: 0, targetIdx: 1 }, null)).toBeCloseTo(0.85);
		// weight=0, maxWeight=10 → 0.25 + 0 = 0.25
		expect(computeEdgeOpacity(0, 10, { sourceIdx: 0, targetIdx: 1 }, null)).toBeCloseTo(0.25);
	});
});
