import { describe, it, expect } from 'vitest';
import { cohenKappa } from '../../../../src/core/icr/coefficients/cohenKappa';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('cohenKappa', () => {
	it('returns 1.0 when both coders perfectly agree', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		expect(cohenKappa(input, 'a', 'b')).toBeCloseTo(1.0, 3);
	});

	it('returns ≤0.5 when coders disagree on boundary', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 10, to: 20 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		const k = cohenKappa(input, 'a', 'b');
		expect(k).toBeLessThan(0.5);
	});

	it('returns kappa between 0 and 1 for partial overlap', () => {
		// A marca 0-10, B marca 0-15. Po=0.75 (10 c1+c1 + 5 none+none), Pe=0.5 → κ=0.5.
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		const k = cohenKappa(input, 'a', 'b');
		expect(k).toBeGreaterThan(0);
		expect(k).toBeLessThan(1);
		expect(k).toBeCloseTo(0.5, 2);
	});

	it('symmetric partial overlap gives κ=0 (chance agreement)', () => {
		// A marca 0-10, B marca 5-15, totalChars=20. Marginais idênticas → Po=Pe → κ=0.
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		expect(cohenKappa(input, 'a', 'b')).toBeCloseTo(0, 2);
	});

	it('returns 1 for empty input (vacuous agreement)', () => {
		const input: KappaInput = { markers: [], sources: [], coders: [] };
		expect(cohenKappa(input, 'a', 'b')).toBe(1);
	});

	it('detects code disagreement when boundaries are identical', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c2'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 10 }],
			coders: ['a', 'b'],
		};
		// Both coders mark same chars but with different codes — Po=0, Pe is non-trivial
		const k = cohenKappa(input, 'a', 'b');
		expect(k).toBeLessThanOrEqual(0);
	});
});
