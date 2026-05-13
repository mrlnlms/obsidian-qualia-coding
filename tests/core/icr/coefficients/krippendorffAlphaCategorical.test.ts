import { describe, it, expect } from 'vitest';
import { krippendorffAlphaCategoricalNominal } from '../../../../src/core/icr/coefficients/krippendorffAlphaCategorical';
import { distanceJaccard, distanceMASI, distanceNominal } from '../../../../src/core/icr/distances';
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

describe('krippendorffAlphaCategoricalNominal — paramétrico em distance', () => {
	// Cenário multi-label: 3 rows, 2 coders, mesma column.
	//   row 0: A={a,b}, B={a,b}     → idêntico
	//   row 1: A={a,b}, B={a,b,c}   → subset
	//   row 2: A={a,b}, B={a,c}     → overlap lateral
	const inputMultiLabel: CategoricalKappaInput = {
		units: [
			{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['a', 'b'], coderId: 'a' },
			{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['a', 'b'], coderId: 'b' },
			{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['a', 'b'], coderId: 'a' },
			{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['a', 'b', 'c'], coderId: 'b' },
			{ fileId: 'd.csv', sourceRowId: 2, column: 'r', codeIds: ['a', 'b'], coderId: 'a' },
			{ fileId: 'd.csv', sourceRowId: 2, column: 'r', codeIds: ['a', 'c'], coderId: 'b' },
		],
		coders: ['a', 'b'],
	};

	it('default = δ_nominal (backwards compat)', () => {
		const α_default = krippendorffAlphaCategoricalNominal(inputMultiLabel);
		const α_explicit = krippendorffAlphaCategoricalNominal(inputMultiLabel, { distance: distanceNominal });
		expect(α_default).toBeCloseTo(α_explicit, 6);
	});

	it('δ_jaccard distingue subset e lateral de agreement', () => {
		const α_nominal = krippendorffAlphaCategoricalNominal(inputMultiLabel);
		const α_jaccard = krippendorffAlphaCategoricalNominal(inputMultiLabel, { distance: distanceJaccard });
		expect(α_jaccard).toBeLessThan(α_nominal);
	});

	it('δ_MASI produz valor distinto de Jaccard em cenário com subset+lateral', () => {
		const α_jaccard = krippendorffAlphaCategoricalNominal(inputMultiLabel, { distance: distanceJaccard });
		const α_masi = krippendorffAlphaCategoricalNominal(inputMultiLabel, { distance: distanceMASI });
		expect(α_masi).not.toBeCloseTo(α_jaccard, 4);
	});

	it('singletons: jaccard e nominal produzem α idêntico (invariant)', () => {
		const inputSingleLabel: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c2'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c1'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		const α_nominal = krippendorffAlphaCategoricalNominal(inputSingleLabel);
		const α_jaccard = krippendorffAlphaCategoricalNominal(inputSingleLabel, { distance: distanceJaccard });
		const α_masi = krippendorffAlphaCategoricalNominal(inputSingleLabel, { distance: distanceMASI });
		expect(α_jaccard).toBeCloseTo(α_nominal, 6);
		expect(α_masi).toBeCloseTo(α_nominal, 6);
	});
});
