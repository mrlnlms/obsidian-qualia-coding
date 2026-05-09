import { describe, it, expect } from 'vitest';
import { fleissKappa } from '../../../../src/core/icr/coefficients/fleissKappa';
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
