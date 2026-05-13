import { describe, it, expect } from 'vitest';
import { fleissKappaCategorical } from '../../../../src/core/icr/coefficients/fleissKappaCategorical';
import { krippendorffAlphaCategoricalNominal } from '../../../../src/core/icr/coefficients/krippendorffAlphaCategorical';
import { distanceJaccard } from '../../../../src/core/icr/distances';
import type { CategoricalKappaInput } from '../../../../src/core/icr/categoricalKappaInput';

describe('fleissKappaCategorical', () => {
	it('returns 1.0 when all 3 coders agree on every unit', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'c' },
			],
			coders: ['a', 'b', 'c'],
		};
		expect(fleissKappaCategorical(input)).toBeCloseTo(1.0, 3);
	});

	it('returns 1 with single coder (vacuous)', () => {
		const input: CategoricalKappaInput = { units: [], coders: ['a'] };
		expect(fleissKappaCategorical(input)).toBe(1);
	});

	it('returns 1 with no units', () => {
		const input: CategoricalKappaInput = { units: [], coders: ['a', 'b'] };
		expect(fleissKappaCategorical(input)).toBe(1);
	});

	it('handles disagreement', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c2'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c1'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		expect(fleissKappaCategorical(input)).toBeLessThanOrEqual(0);
	});
});

describe('fleissKappaCategorical — fallback automático pra α em multi-label', () => {
	it('escopo com algum unit multi-label: delega pra krippendorffAlphaCategoricalNominal', () => {
		const inputMulti: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['x', 'y'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['x', 'y'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['x', 'y'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['x', 'y', 'z'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		const fleissResult = fleissKappaCategorical(inputMulti, { distance: distanceJaccard });
		const alphaResult = krippendorffAlphaCategoricalNominal(inputMulti, { distance: distanceJaccard });
		expect(fleissResult).toBeCloseTo(alphaResult, 6);
	});

	it('single-label puro mantém Fleiss clássico (options ignorada)', () => {
		const inputSingle: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		const withoutDistance = fleissKappaCategorical(inputSingle);
		const withDistance = fleissKappaCategorical(inputSingle, { distance: distanceJaccard });
		expect(withDistance).toBeCloseTo(withoutDistance, 6);
	});
});
