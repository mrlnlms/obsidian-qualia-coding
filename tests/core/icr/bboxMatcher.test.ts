import { describe, it, expect } from 'vitest';
import { hungarianAssignment, match, type AlignmentEvent } from '../../../src/core/icr/bboxMatcher';

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

describe('bboxMatcher.match', () => {
	it('matches pair above threshold', () => {
		const matrix = [[0.8]];
		const events = match(matrix, 0.5);
		expect(events).toEqual([
			{ kind: 'matched', aIndex: 0, bIndex: 0, iou: 0.8 },
		]);
	});

	it('unmatched pair below threshold', () => {
		const matrix = [[0.3]];
		const events = match(matrix, 0.5);
		expect(events).toContainEqual({ kind: 'unmatched_a', aIndex: 0 });
		expect(events).toContainEqual({ kind: 'unmatched_b', bIndex: 0 });
	});

	it('rectangular: 1 sobra de A vira unmatched_a', () => {
		const matrix = [
			[0.8],
			[0.1],
		];
		const events = match(matrix, 0.5);
		expect(events).toContainEqual({ kind: 'matched', aIndex: 0, bIndex: 0, iou: 0.8 });
		expect(events).toContainEqual({ kind: 'unmatched_a', aIndex: 1 });
	});

	it('rectangular: 1 sobra de B vira unmatched_b', () => {
		const matrix = [
			[0.8, 0.1],
		];
		const events = match(matrix, 0.5);
		expect(events).toContainEqual({ kind: 'matched', aIndex: 0, bIndex: 0, iou: 0.8 });
		expect(events).toContainEqual({ kind: 'unmatched_b', bIndex: 1 });
	});

	it('returns empty when matrix is empty (0×0 — caller deve pre-handle 0×N e N×0)', () => {
		const events = match([], 0.5);
		expect(events).toEqual([]);
	});

	it('output ordering: matched first, then unmatched', () => {
		const matrix = [
			[0.8, 0.1],
			[0.1, 0.7],
		];
		const events: AlignmentEvent[] = match(matrix, 0.5);
		expect(events.filter(e => e.kind === 'matched')).toHaveLength(2);
		const kinds = events.map(e => e.kind);
		const lastMatchedIdx = kinds.lastIndexOf('matched');
		const firstUnmatchedAIdx = kinds.indexOf('unmatched_a');
		if (firstUnmatchedAIdx !== -1) expect(lastMatchedIdx).toBeLessThan(firstUnmatchedAIdx);
	});
});
