import { describe, it, expect } from 'vitest';
import { cohenKappaCategorical } from '../../../../src/core/icr/coefficients/cohenKappaCategorical';
import type { CategoricalKappaInput } from '../../../../src/core/icr/categoricalKappaInput';

describe('cohenKappaCategorical', () => {
	it('returns 1.0 on perfect agreement', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		expect(cohenKappaCategorical(input, 'a', 'b')).toBeCloseTo(1.0, 3);
	});

	it('returns ≤0 when coders systematically disagree', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c2'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		expect(cohenKappaCategorical(input, 'a', 'b')).toBeLessThanOrEqual(0);
	});

	it('handles missing data with κ>0 when agreement majority offsets non-trivially from chance', () => {
		// 4 ambos marcam c1, 1 só B marca c2 (A=none).
		// Marginais: A: c1=4, none=1. B: c1=4, c2=1.
		// Po = 4/5 = 0.8; Pe = 0.8*0.8 + 0.2*0 + 0*0.2 = 0.64 → κ ≈ 0.44
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c1'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 2, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 2, column: 'r', codeIds: ['c1'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 3, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 3, column: 'r', codeIds: ['c1'], coderId: 'b' },
				// row 4: só B marca, com c2 (= disagreement assimétrico)
				{ fileId: 'd.csv', sourceRowId: 4, column: 'r', codeIds: ['c2'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		const k = cohenKappaCategorical(input, 'a', 'b');
		expect(k).toBeGreaterThan(0);
		expect(k).toBeLessThan(1);
	});

	it('returns 1 for empty input (vacuous)', () => {
		const input: CategoricalKappaInput = { units: [], coders: ['a', 'b'] };
		expect(cohenKappaCategorical(input, 'a', 'b')).toBe(1);
	});
});
