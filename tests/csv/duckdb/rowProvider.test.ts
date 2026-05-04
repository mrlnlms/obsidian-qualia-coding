import { describe, it, expect } from 'vitest';
import { MockRowProvider, markerRefKey } from '../../../src/csv/duckdb/rowProvider';

describe('MockRowProvider', () => {
	const rows = [
		{ name: 'Alice', dept: 'Eng' },
		{ name: 'Bob', dept: 'Sales' },
		{ name: 'Carol', dept: 'Eng' },
	];

	it('getMarkerText returns the cell value', async () => {
		const p = new MockRowProvider(rows);
		expect(await p.getMarkerText({ sourceRowId: 1, column: 'name' })).toBe('Bob');
	});

	it('getMarkerText returns null for out-of-range row', async () => {
		const p = new MockRowProvider(rows);
		expect(await p.getMarkerText({ sourceRowId: 99, column: 'name' })).toBeNull();
	});

	it('getMarkerText returns null for missing column', async () => {
		const p = new MockRowProvider(rows);
		expect(await p.getMarkerText({ sourceRowId: 0, column: 'missing' })).toBeNull();
	});

	it('batchGetMarkerText returns map keyed by markerRefKey', async () => {
		const p = new MockRowProvider(rows);
		const refs = [
			{ sourceRowId: 0, column: 'name' },
			{ sourceRowId: 2, column: 'dept' },
		];
		const map = await p.batchGetMarkerText(refs);
		expect(map.size).toBe(2);
		expect(map.get(markerRefKey(refs[0]!))).toBe('Alice');
		expect(map.get(markerRefKey(refs[1]!))).toBe('Eng');
	});

	it('batchGetMarkerText handles missing rows/cols as null', async () => {
		const p = new MockRowProvider(rows);
		const refs = [
			{ sourceRowId: 99, column: 'name' },
			{ sourceRowId: 0, column: 'missing' },
		];
		const map = await p.batchGetMarkerText(refs);
		expect(map.get(markerRefKey(refs[0]!))).toBeNull();
		expect(map.get(markerRefKey(refs[1]!))).toBeNull();
	});

	it('getRowCount returns total rows', async () => {
		const p = new MockRowProvider(rows);
		expect(await p.getRowCount()).toBe(3);
	});

	it('throws after dispose', async () => {
		const p = new MockRowProvider(rows);
		await p.dispose();
		await expect(p.getMarkerText({ sourceRowId: 0, column: 'name' })).rejects.toThrow(/disposed/);
		await expect(p.batchGetMarkerText([])).rejects.toThrow(/disposed/);
		await expect(p.getRowCount()).rejects.toThrow(/disposed/);
	});

	it('dispose is idempotent', async () => {
		const p = new MockRowProvider(rows);
		await p.dispose();
		await expect(p.dispose()).resolves.toBeUndefined();
	});
});

describe('markerRefKey', () => {
	it('builds stable composite keys', () => {
		expect(markerRefKey({ sourceRowId: 0, column: 'name' })).toBe('0|name');
		expect(markerRefKey({ sourceRowId: 42, column: 'col with spaces' })).toBe('42|col with spaces');
	});

	it('two refs with same coordinates produce same key', () => {
		const a = markerRefKey({ sourceRowId: 7, column: 'x' });
		const b = markerRefKey({ sourceRowId: 7, column: 'x' });
		expect(a).toBe(b);
	});
});
