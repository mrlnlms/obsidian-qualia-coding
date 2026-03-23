import { describe, it, expect } from 'vitest';
import {
	hasCode,
	getCodeIds,
	findCodeApplication,
	addCodeApplication,
	removeCodeApplication,
	getMagnitude,
	setMagnitude,
} from '../../src/core/codeApplicationHelpers';
import type { CodeApplication } from '../../src/core/types';

describe('codeApplicationHelpers', () => {
	const codes: CodeApplication[] = [
		{ codeId: 'code_a' },
		{ codeId: 'code_b', magnitude: 'ALTA' },
	];

	describe('hasCode', () => {
		it('returns true when codeId present', () => {
			expect(hasCode(codes, 'code_a')).toBe(true);
		});
		it('returns false when codeId absent', () => {
			expect(hasCode(codes, 'code_z')).toBe(false);
		});
	});

	describe('getCodeIds', () => {
		it('extracts all codeIds', () => {
			expect(getCodeIds(codes)).toEqual(['code_a', 'code_b']);
		});
		it('returns empty array for empty input', () => {
			expect(getCodeIds([])).toEqual([]);
		});
	});

	describe('findCodeApplication', () => {
		it('finds by codeId', () => {
			expect(findCodeApplication(codes, 'code_b')).toEqual({ codeId: 'code_b', magnitude: 'ALTA' });
		});
		it('returns undefined when not found', () => {
			expect(findCodeApplication(codes, 'code_z')).toBeUndefined();
		});
	});

	describe('addCodeApplication', () => {
		it('adds new code returning new array', () => {
			const original: CodeApplication[] = [{ codeId: 'code_a' }];
			const result = addCodeApplication(original, 'code_c');
			expect(result).toHaveLength(2);
			expect(result[1]).toEqual({ codeId: 'code_c' });
			expect(original).toHaveLength(1); // original unchanged
		});
		it('returns same array if duplicate', () => {
			const original: CodeApplication[] = [{ codeId: 'code_a' }];
			const result = addCodeApplication(original, 'code_a');
			expect(result).toHaveLength(1);
		});
	});

	describe('removeCodeApplication', () => {
		it('removes by codeId', () => {
			const result = removeCodeApplication([...codes], 'code_a');
			expect(result).toHaveLength(1);
			expect(result[0].codeId).toBe('code_b');
		});
		it('returns unchanged if not found', () => {
			const result = removeCodeApplication([...codes], 'code_z');
			expect(result).toHaveLength(2);
		});
	});

	describe('getMagnitude', () => {
		it('returns value when present', () => {
			expect(getMagnitude(codes, 'code_b')).toBe('ALTA');
		});
		it('returns undefined when code has no magnitude', () => {
			expect(getMagnitude(codes, 'code_a')).toBeUndefined();
		});
		it('returns undefined when codeId not found', () => {
			expect(getMagnitude(codes, 'code_z')).toBeUndefined();
		});
	});

	describe('setMagnitude', () => {
		it('sets value on existing code', () => {
			const result = setMagnitude(codes, 'code_a', 'MEDIA');
			expect(result).not.toBe(codes);
			expect(findCodeApplication(result, 'code_a')?.magnitude).toBe('MEDIA');
		});
		it('clears magnitude with undefined', () => {
			const result = setMagnitude(codes, 'code_b', undefined);
			expect(findCodeApplication(result, 'code_b')?.magnitude).toBeUndefined();
		});
		it('returns same array when codeId not found', () => {
			const result = setMagnitude(codes, 'code_z', 'ALTA');
			expect(result).toBe(codes);
		});
		it('preserves other code applications', () => {
			const result = setMagnitude(codes, 'code_a', 'BAIXA');
			expect(findCodeApplication(result, 'code_b')?.magnitude).toBe('ALTA');
		});
	});
});
