import { describe, it, expect } from 'vitest';
import { alphaBinary } from '../../../../src/core/icr/coefficients/alphaBinary';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('alphaBinary', () => {
	it('returns 1.0 when boundaries are identical (any code)', () => {
		// Both coders mark same boundary, mas com codes diferentes — α-binary ignora código.
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c2'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		expect(alphaBinary(input)).toBeCloseTo(1.0, 3);
	});

	it('returns negative when coders systematically disagree on boundaries', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 10 }],
			coders: ['a', 'b'],
		};
		expect(alphaBinary(input)).toBeLessThan(0);
	});

	it('treats different codes as same when boundaries match (collapse)', () => {
		// A marca 0-10 com c1, B marca 0-10 com c2. α-binary trata como mesma "presença" → 1.0
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c2'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
			coders: ['a', 'b'],
		};
		expect(alphaBinary(input)).toBeCloseTo(1.0, 3);
	});
});
