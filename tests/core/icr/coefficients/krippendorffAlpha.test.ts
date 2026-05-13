import { describe, it, expect } from 'vitest';
import { krippendorffAlphaNominal } from '../../../../src/core/icr/coefficients/krippendorffAlpha';
import { distanceJaccard, distanceMASI, distanceNominal } from '../../../../src/core/icr/distances';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('krippendorffAlphaNominal', () => {
	it('returns 1.0 on perfect agreement', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(1.0, 3);
	});

	it('returns near 0 on chance-level agreement (independent distributions)', () => {
		// A marca 0-9 com c1, B marca 5-14 com c1, totalUnits=20.
		// Overlap em 5-9 (concordam c1), 0-4 (A só), 10-14 (B só), 15-19 (ambos __none__).
		// Pa = 0.5, Pe = 0.5 → α ≈ 0 (chance).
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		const alpha = krippendorffAlphaNominal(input);
		expect(Math.abs(alpha)).toBeLessThan(0.2);
	});

	it('returns negative alpha on systematic disagreement', () => {
		// A marca 0-4, B marca 5-9, totalUnits=10. Coders nunca concordam → α < 0.
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 10 }],
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
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
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
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b', 'c'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(1.0, 3);
	});
});

describe('krippendorffAlphaNominal — paramétrico em distance', () => {
	// Cenário multi-label: 3 chars, 2 coders.
	//   char 0: A={a,b}, B={a,b}     → idêntico
	//   char 1: A={a,b}, B={a,b,c}   → subset
	//   char 2: A={a,b}, B={a,c}     → overlap lateral
	const inputMultiLabel: KappaInput = {
		markers: [
			{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
			{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b'] },
			{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 2, to: 3 }, codeIds: ['a', 'b'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b', 'c'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 2, to: 3 }, codeIds: ['a', 'c'] },
		],
		sources: [{ fileId: 'f1', locator: '', totalUnits: 3 }],
		coders: ['a', 'b'],
	};

	it('default = δ_nominal (backwards compat)', () => {
		const α_default = krippendorffAlphaNominal(inputMultiLabel);
		const α_explicit_nominal = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceNominal });
		expect(α_default).toBeCloseTo(α_explicit_nominal, 6);
	});

	it('δ_jaccard distingue subset e overlap lateral de agreement', () => {
		// Sob δ_nominal multi-label reduz a first-code 'a' → todos pares concordam → α_nominal = 1.
		// Sob δ_jaccard, char 1 (subset) e char 2 (lateral) contribuem distância parcial → α < 1.
		const α_nominal = krippendorffAlphaNominal(inputMultiLabel);
		const α_jaccard = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceJaccard });
		expect(α_jaccard).toBeLessThan(α_nominal);
	});

	it('δ_MASI produz valor distinto de Jaccard em cenário com subset+lateral', () => {
		// MASI penaliza subset e lateral com fatores diferentes (5/9 vs 8/9) que Jaccard (1/3 vs 2/3).
		// A direção da diferença depende da proporção subset:lateral no cenário.
		// Aqui apenas validamos que valores diferem (não cravamos sinal — depende da mistura).
		const α_jaccard = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceJaccard });
		const α_masi = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceMASI });
		expect(α_masi).not.toBeCloseTo(α_jaccard, 4);
	});

	it('singletons: jaccard e nominal produzem α idêntico (invariant)', () => {
		// Pra |A|=|B|=1, todas as 3 distances reduzem ao caso clássico — α é o mesmo.
		const inputSingleLabel: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		const α_nominal = krippendorffAlphaNominal(inputSingleLabel);
		const α_jaccard = krippendorffAlphaNominal(inputSingleLabel, { distance: distanceJaccard });
		const α_masi = krippendorffAlphaNominal(inputSingleLabel, { distance: distanceMASI });
		expect(α_jaccard).toBeCloseTo(α_nominal, 6);
		expect(α_masi).toBeCloseTo(α_nominal, 6);
	});
});
