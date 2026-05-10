import { describe, it, expect } from 'vitest';
import { hungarianAssignment, match } from '../../../src/core/icr/bboxMatcher';

describe('hungarianAssignment', () => {
	it('1×1 trivial', () => {
		const result = hungarianAssignment([[0.2]]);
		expect(result).toEqual([[0, 0]]);
	});

	it('2×2 identity', () => {
		const cost = [
			[0.1, 0.9],
			[0.9, 0.1],
		];
		const result = hungarianAssignment(cost);
		expect(result).toContainEqual([0, 0]);
		expect(result).toContainEqual([1, 1]);
	});

	it('2×2 swap (otimal escolhe diagonal cruzada)', () => {
		const cost = [
			[0.9, 0.1],
			[0.1, 0.9],
		];
		const result = hungarianAssignment(cost);
		expect(result).toContainEqual([0, 1]);
		expect(result).toContainEqual([1, 0]);
	});

	it('rectangular 2×3 (mais B que A; 1 sobra de B sem assignment)', () => {
		const cost = [
			[0.1, 0.5, 0.9],
			[0.9, 0.1, 0.5],
		];
		const result = hungarianAssignment(cost);
		expect(result.length).toBe(2);
		expect(result).toContainEqual([0, 0]);
		expect(result).toContainEqual([1, 1]);
	});

	it('rectangular 3×2 (mais A que B)', () => {
		const cost = [
			[0.1, 0.9],
			[0.5, 0.5],
			[0.9, 0.1],
		];
		const result = hungarianAssignment(cost);
		expect(result.length).toBe(2);
	});

	it('handles 0×N (no rows)', () => {
		expect(hungarianAssignment([])).toEqual([]);
	});

	it('handles N×0 (no cols)', () => {
		expect(hungarianAssignment([[], []])).toEqual([]);
	});
});
