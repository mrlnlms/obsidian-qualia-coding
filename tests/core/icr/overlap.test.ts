import { describe, it, expect } from 'vitest';
import { computeOverlap } from '../../../src/core/icr/overlap';
import type { TextRange } from '../../../src/core/icr/textRange';

describe('computeOverlap', () => {
	const a: TextRange = { fileId: 'f1', locator: '', from: 0, to: 10 };

	it('returns null when fileId differs', () => {
		const b: TextRange = { fileId: 'f2', locator: '', from: 0, to: 10 };
		expect(computeOverlap(a, b)).toBeNull();
	});

	it('returns null when locator differs', () => {
		const b: TextRange = { fileId: 'f1', locator: 'page:2', from: 0, to: 10 };
		expect(computeOverlap(a, b)).toBeNull();
	});

	it('returns null when no overlap (b entirely after a)', () => {
		const b: TextRange = { fileId: 'f1', locator: '', from: 20, to: 30 };
		expect(computeOverlap(a, b)).toBeNull();
	});

	it('returns null when no overlap (b entirely before a)', () => {
		const x: TextRange = { fileId: 'f1', locator: '', from: 50, to: 60 };
		const y: TextRange = { fileId: 'f1', locator: '', from: 10, to: 20 };
		expect(computeOverlap(x, y)).toBeNull();
	});

	it('returns null when adjacent but no overlap (a.to === b.from)', () => {
		const b: TextRange = { fileId: 'f1', locator: '', from: 10, to: 20 };
		expect(computeOverlap(a, b)).toBeNull();
	});

	it('returns intersection when overlap exists', () => {
		const b: TextRange = { fileId: 'f1', locator: '', from: 5, to: 15 };
		expect(computeOverlap(a, b)).toEqual({ from: 5, to: 10 });
	});

	it('returns full range when one contains the other', () => {
		const b: TextRange = { fileId: 'f1', locator: '', from: 2, to: 8 };
		expect(computeOverlap(a, b)).toEqual({ from: 2, to: 8 });
	});

	it('returns identical range for identical inputs', () => {
		expect(computeOverlap(a, a)).toEqual({ from: 0, to: 10 });
	});

	it('is symmetric: overlap(a, b) === overlap(b, a)', () => {
		const b: TextRange = { fileId: 'f1', locator: '', from: 5, to: 15 };
		expect(computeOverlap(a, b)).toEqual(computeOverlap(b, a));
	});
});
