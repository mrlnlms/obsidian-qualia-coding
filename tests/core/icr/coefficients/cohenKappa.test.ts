import { describe, it, expect } from 'vitest';
import { cohenKappa } from '../../../../src/core/icr/coefficients/cohenKappa';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('cohenKappa — caminho A binary-per-label', () => {
	it('returns 1.0 when both coders perfectly agree', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		expect(cohenKappa(input, 'a', 'b').value).toBeCloseTo(1.0, 3);
	});

	it('returns ≤0.5 when coders disagree on boundary', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 10, to: 20 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		expect(cohenKappa(input, 'a', 'b').value).toBeLessThan(0.5);
	});

	it('returns kappa ≈ 0.5 for partial overlap', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		const k = cohenKappa(input, 'a', 'b').value;
		expect(k).toBeGreaterThan(0);
		expect(k).toBeLessThan(1);
		expect(k).toBeCloseTo(0.5, 2);
	});

	it('symmetric partial overlap gives κ=0 (chance agreement)', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		expect(cohenKappa(input, 'a', 'b').value).toBeCloseTo(0, 2);
	});

	it('returns 1 for empty input (vacuous agreement)', () => {
		const input: KappaInput = { markers: [], sources: [], coders: [] };
		const r = cohenKappa(input, 'a', 'b');
		expect(r.value).toBe(1);
		expect(r.perCode).toEqual({});
	});

	it('detects code disagreement when boundaries are identical', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c2'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 10 }],
			coders: ['a', 'b'],
		};
		const r = cohenKappa(input, 'a', 'b');
		expect(r.value).toBeLessThanOrEqual(0);
	});

	it('perCode tem entry pra cada code do universo + macro-average bate', () => {
		// 2 coders, 3 markers, codes 'a' e 'b' mistos
		const input: KappaInput = {
			markers: [
				{ coderId: 'cA', range: { fileId: 'f1', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
				{ coderId: 'cB', range: { fileId: 'f1', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
				{ coderId: 'cA', range: { fileId: 'f1', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b'] },
				{ coderId: 'cB', range: { fileId: 'f1', locator: '', from: 1, to: 2 }, codeIds: ['a', 'c'] },
				{ coderId: 'cA', range: { fileId: 'f1', locator: '', from: 2, to: 3 }, codeIds: ['c'] },
				{ coderId: 'cB', range: { fileId: 'f1', locator: '', from: 2, to: 3 }, codeIds: ['c'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 3 }],
			coders: ['cA', 'cB'],
		};
		const r = cohenKappa(input, 'cA', 'cB');
		expect(r.perCode).toHaveProperty('a');
		expect(r.perCode).toHaveProperty('b');
		expect(r.perCode).toHaveProperty('c');
		const avg = (r.perCode.a! + r.perCode.b! + r.perCode.c!) / 3;
		expect(r.value).toBeCloseTo(avg, 6);
	});

	it('multi-label real: codes não interferem entre si (eixos binários independentes)', () => {
		// 2 coders, 3 units, multi-label idêntico em todos
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 3 }, codeIds: ['x', 'y', 'z'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 3 }, codeIds: ['x', 'y', 'z'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 3 }],
			coders: ['a', 'b'],
		};
		const r = cohenKappa(input, 'a', 'b');
		expect(r.value).toBeCloseTo(1.0, 3);
		expect(r.perCode.x).toBeCloseTo(1.0, 3);
		expect(r.perCode.y).toBeCloseTo(1.0, 3);
		expect(r.perCode.z).toBeCloseTo(1.0, 3);
	});
});
