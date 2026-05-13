import { describe, it, expect } from 'vitest';
import { fleissKappa } from '../../../../src/core/icr/coefficients/fleissKappa';
import { krippendorffAlphaNominal } from '../../../../src/core/icr/coefficients/krippendorffAlpha';
import { distanceJaccard } from '../../../../src/core/icr/distances';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('fleissKappa', () => {
	it('returns ~1.0 when all 3 coders agree', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'c', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b', 'c'],
		};
		expect(fleissKappa(input)).toBeCloseTo(1.0, 3);
	});

	it('returns lower kappa when coders disagree systematically', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'c', range: { fileId: 'f1', locator: '', from: 10, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b', 'c'],
		};
		expect(fleissKappa(input)).toBeLessThan(0.5);
	});

	it('returns 1 with single coder (vacuous)', () => {
		const input: KappaInput = {
			markers: [],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 10 }],
			coders: ['a'],
		};
		expect(fleissKappa(input)).toBe(1);
	});

	it('returns 1 with no markers (all coders agree on __none__)', () => {
		const input: KappaInput = {
			markers: [],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 10 }],
			coders: ['a', 'b'],
		};
		expect(fleissKappa(input)).toBe(1);
	});
});

describe('fleissKappa — fallback automático pra α em escopo multi-label', () => {
	it('escopo com algum marker multi-label: delega pra krippendorffAlphaNominal com δ', () => {
		const inputMulti: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 3 }, codeIds: ['x', 'y'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 1 }, codeIds: ['x', 'y'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 1, to: 2 }, codeIds: ['x', 'y', 'z'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 2, to: 3 }, codeIds: ['x', 'z'] },
				{ coderId: 'c', range: { fileId: 'f1', locator: '', from: 0, to: 3 }, codeIds: ['x', 'y'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 5 }],
			coders: ['a', 'b', 'c'],
		};
		const fleissResult = fleissKappa(inputMulti, { distance: distanceJaccard });
		const alphaResult = krippendorffAlphaNominal(inputMulti, { distance: distanceJaccard });
		expect(fleissResult).toBeCloseTo(alphaResult, 6);
	});

	it('detecta multi-label corretamente (1 marker multi-label num input misto delega)', () => {
		const inputMixed: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				// 1 marker multi-label triggera fallback
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1', 'c2'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 15 }],
			coders: ['a', 'b'],
		};
		const fleissResult = fleissKappa(inputMixed, { distance: distanceJaccard });
		const alphaResult = krippendorffAlphaNominal(inputMixed, { distance: distanceJaccard });
		expect(fleissResult).toBeCloseTo(alphaResult, 6);
	});

	it('single-label puro mantém Fleiss clássico (sem delegate pra α)', () => {
		// Tests existentes acima validam Fleiss clássico funciona; este garante que options
		// passada em single-label puro NÃO altera resultado (Fleiss clássico ignora options).
		const inputSingle: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'c', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 10 }],
			coders: ['a', 'b', 'c'],
		};
		const withoutDistance = fleissKappa(inputSingle);
		const withDistance = fleissKappa(inputSingle, { distance: distanceJaccard });
		expect(withDistance).toBeCloseTo(withoutDistance, 6);
	});
});
