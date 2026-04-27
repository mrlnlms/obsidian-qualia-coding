import { describe, it, expect } from 'vitest';
import { binNumeric, binDate, explodeMultitext } from '../../src/analytics/data/binning';

describe('binNumeric', () => {
	it('uses quartiles for ≥5 unique values', () => {
		const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const { bins, assign } = binNumeric(values);
		expect(bins).toHaveLength(4); // 4 quartile bins
		expect(assign(1)).toBe(bins[0]);
		expect(assign(10)).toBe(bins[3]);
	});

	it('returns categorical labels for ≤4 unique values', () => {
		const values = [1, 2, 3, 1];
		const { bins, assign } = binNumeric(values);
		expect(bins).toEqual(['1', '2', '3']);
		expect(assign(1)).toBe('1');
		expect(assign(3)).toBe('3');
	});

	it('returns single bin when all values identical', () => {
		const values = [5, 5, 5, 5];
		const { bins, assign } = binNumeric(values);
		expect(bins).toHaveLength(1);
		expect(assign(5)).toBe(bins[0]);
	});

	it('returns empty bins for empty input', () => {
		const { bins } = binNumeric([]);
		expect(bins).toEqual([]);
	});

	it('skips NaN/Infinity in unique-value counting', () => {
		const values = [1, 2, NaN, Infinity, 3];
		const { bins } = binNumeric(values.filter(v => Number.isFinite(v)));
		expect(bins).toHaveLength(3);
	});
});

describe('binDate', () => {
	it('uses year granularity when range > 2 years', () => {
		const values = [
			new Date('2020-01-01'),
			new Date('2022-06-15'),
			new Date('2023-12-31'),
		];
		const { bins, assign } = binDate(values);
		expect(bins).toEqual(expect.arrayContaining(['2020', '2022', '2023']));
		expect(assign(new Date('2021-05-01'))).toBe('2021');
	});

	it('uses month granularity when range between 1 month and 2 years', () => {
		const values = [
			new Date('2024-01-15'),
			new Date('2024-03-20'),
			new Date('2024-06-10'),
		];
		const { bins, assign } = binDate(values);
		expect(bins).toEqual(expect.arrayContaining(['2024-01', '2024-03', '2024-06']));
		expect(assign(new Date('2024-02-15'))).toBe('2024-02');
	});

	it('uses day granularity when range < 1 month', () => {
		const values = [
			new Date('2024-03-01'),
			new Date('2024-03-10'),
			new Date('2024-03-20'),
		];
		const { bins, assign } = binDate(values);
		expect(bins).toEqual(expect.arrayContaining(['2024-03-01', '2024-03-10', '2024-03-20']));
		expect(assign(new Date('2024-03-15'))).toBe('2024-03-15');
	});

	it('returns empty bins for empty input', () => {
		const { bins } = binDate([]);
		expect(bins).toEqual([]);
	});

	it('handles single-date input (range = 0)', () => {
		const { bins, assign } = binDate([new Date('2024-05-10')]);
		expect(bins).toHaveLength(1);
		expect(assign(new Date('2024-05-10'))).toBe(bins[0]);
	});
});

describe('explodeMultitext', () => {
	it('returns array of strings for multitext value', () => {
		expect(explodeMultitext(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
	});

	it('returns single-element array for non-array string value', () => {
		expect(explodeMultitext('foo')).toEqual(['foo']);
	});

	it('returns single-element array for number value (stringified)', () => {
		expect(explodeMultitext(42)).toEqual(['42']);
	});

	it('returns single-element array for boolean value', () => {
		expect(explodeMultitext(true)).toEqual(['true']);
	});

	it('returns empty array for null/undefined/empty array', () => {
		expect(explodeMultitext(null)).toEqual([]);
		expect(explodeMultitext(undefined)).toEqual([]);
		expect(explodeMultitext([])).toEqual([]);
	});

	it('skips empty strings inside array', () => {
		expect(explodeMultitext(['a', '', 'b', ''])).toEqual(['a', 'b']);
	});
});
