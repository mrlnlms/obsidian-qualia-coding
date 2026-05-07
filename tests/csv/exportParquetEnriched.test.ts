import { describe, it, expect } from 'vitest';
import { isOOMError } from '../../src/csv/exportParquetEnriched';

describe('isOOMError', () => {
	it('matches DuckDB Out of Memory message', () => {
		const err = new Error('Out of Memory Error: Allocation failure');
		expect(isOOMError(err)).toBe(true);
	});

	it('matches WASM memory access out of bounds', () => {
		const err = new Error('RuntimeError: memory access out of bounds');
		expect(isOOMError(err)).toBe(true);
	});

	it('matches lone Allocation failure phrase (case-insensitive)', () => {
		expect(isOOMError(new Error('allocation failure'))).toBe(true);
	});

	it('does not match arbitrary errors', () => {
		expect(isOOMError(new Error('File not found'))).toBe(false);
		expect(isOOMError(new Error('SQL syntax error'))).toBe(false);
	});

	it('handles non-Error values defensively', () => {
		expect(isOOMError('Out of Memory')).toBe(false);
		expect(isOOMError(null)).toBe(false);
		expect(isOOMError(undefined)).toBe(false);
		expect(isOOMError({ message: 'Out of Memory' })).toBe(false);
	});
});
