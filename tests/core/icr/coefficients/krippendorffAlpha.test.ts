import { describe, it, expect } from 'vitest';
import { krippendorffAlphaNominal } from '../../../../src/core/icr/coefficients/krippendorffAlpha';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('krippendorffAlphaNominal', () => {
	it('returns 1.0 on perfect agreement', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(1.0, 3);
	});

	it('returns near 0 on chance-level agreement (independent distributions)', () => {
		// A marca 0-9 com c1, B marca 5-14 com c1, totalChars=20.
		// Overlap em 5-9 (concordam c1), 0-4 (A só), 10-14 (B só), 15-19 (ambos __none__).
		// Pa = 0.5, Pe = 0.5 → α ≈ 0 (chance).
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		const alpha = krippendorffAlphaNominal(input);
		expect(Math.abs(alpha)).toBeLessThan(0.2);
	});

	it('returns negative alpha on systematic disagreement', () => {
		// A marca 0-4, B marca 5-9, totalChars=10. Coders nunca concordam → α < 0.
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 10 }],
			coders: ['a', 'b'],
		};
		const alpha = krippendorffAlphaNominal(input);
		expect(alpha).toBeLessThan(0);
	});

	it('returns positive alpha for partial overlap (asymmetric)', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		const alpha = krippendorffAlphaNominal(input);
		expect(alpha).toBeGreaterThan(0);
		expect(alpha).toBeLessThan(1);
	});

	it('returns 1 for empty input', () => {
		const input: KappaInput = { markers: [], sources: [], coders: [] };
		expect(krippendorffAlphaNominal(input)).toBe(1);
	});

	it('handles 3 coders', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'c', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b', 'c'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(1.0, 3);
	});
});
