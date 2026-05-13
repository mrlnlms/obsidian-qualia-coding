import { describe, it, expect } from 'vitest';
import { cuAlpha } from '../../../../src/core/icr/coefficients/cuAlpha';
import { distanceJaccard, distanceNominal } from '../../../../src/core/icr/distances';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('cuAlpha', () => {
	it('returns 1.0 when both coders agree on code within shared boundaries', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		expect(cuAlpha(input)).toBeCloseTo(1.0, 3);
	});

	it('returns negative or low when codes differ within shared boundary', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c2'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		expect(cuAlpha(input)).toBeLessThan(0.5);
	});

	it('returns 1 (vacuous) when no shared boundary', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c2'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		// Sem chars compartilhados — α undefined; convenção: 1
		expect(cuAlpha(input)).toBe(1);
	});

	it('agreement on partial overlap segment gives high alpha', () => {
		// A marca 0-10 com c1, B marca 5-15 com c1 → shared 5-9 (5 chars), ambos c1 → α=1 nesse subset
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		expect(cuAlpha(input)).toBeCloseTo(1.0, 3);
	});
});

describe('cuAlpha — paramétrico em distance', () => {
	// Multi-label nos boundaries compartilhados (0..10): coder A multi-label fixo {a,b};
	// coder B varia entre subset/lateral/identical sob mesmas boundaries.
	const inputMultiLabel: KappaInput = {
		markers: [
			{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['a', 'b'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 3 }, codeIds: ['a', 'b'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 3, to: 7 }, codeIds: ['a', 'b', 'c'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 7, to: 10 }, codeIds: ['a', 'c'] },
		],
		sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
		coders: ['a', 'b'],
	};

	it('default = δ_nominal (backwards compat)', () => {
		const α_default = cuAlpha(inputMultiLabel);
		const α_explicit = cuAlpha(inputMultiLabel, { distance: distanceNominal });
		expect(α_default).toBeCloseTo(α_explicit, 6);
	});

	it('cu-α propaga distance pra α subjacente — Jaccard penaliza overlap parcial', () => {
		const α_nominal = cuAlpha(inputMultiLabel);
		const α_jaccard = cuAlpha(inputMultiLabel, { distance: distanceJaccard });
		expect(α_jaccard).toBeLessThan(α_nominal);
	});
});
