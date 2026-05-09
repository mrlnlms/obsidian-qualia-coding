import { describe, it, expect } from 'vitest';
import { krippendorffAlphaCategoricalNominal } from '../../../../src/core/icr/coefficients/krippendorffAlphaCategorical';
import type { CategoricalKappaInput } from '../../../../src/core/icr/categoricalKappaInput';

describe('krippendorffAlphaCategoricalNominal', () => {
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
		expect(krippendorffAlphaCategoricalNominal(input)).toBeCloseTo(1.0, 3);
	});

	it('returns negative on systematic disagreement', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c2'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c1'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		expect(krippendorffAlphaCategoricalNominal(input)).toBeLessThan(0);
	});

	it('returns 1 for empty input', () => {
		expect(krippendorffAlphaCategoricalNominal({ units: [], coders: [] })).toBe(1);
	});

	it('handles 3 coders perfect agreement', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'c' },
			],
			coders: ['a', 'b', 'c'],
		};
		expect(krippendorffAlphaCategoricalNominal(input)).toBeCloseTo(1.0, 3);
	});
});
