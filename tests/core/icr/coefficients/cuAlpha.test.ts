import { describe, it, expect } from 'vitest';
import { cuAlpha } from '../../../../src/core/icr/coefficients/cuAlpha';
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
