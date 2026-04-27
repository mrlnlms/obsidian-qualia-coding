import { describe, it, expect } from 'vitest';
import { isEdgeAboveThreshold } from '../../src/analytics/views/modes/relationsNetworkHelpers';

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
