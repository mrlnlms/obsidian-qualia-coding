import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CsvCodingModel } from '../../src/csv/csvCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { MockRowProvider } from '../../src/csv/duckdb/rowProvider';

function createMockDm(initial: Record<string, any> = {}) {
	const store: Record<string, any> = { ...initial };
	return {
		section: (k: string) => {
			if (!store[k]) store[k] = { segmentMarkers: [], rowMarkers: [] };
			return store[k];
		},
		setSection: (k: string, v: any) => { store[k] = v; },
		markDirty: vi.fn(),
	};
}

let model: CsvCodingModel;
let registry: CodeDefinitionRegistry;
let dm: ReturnType<typeof createMockDm>;

const FILE = 'data.parquet';

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
	dm = createMockDm();
	model = new CsvCodingModel(dm as any, registry);
});

describe('markerTextCache — populate', () => {
	it('caches row marker text from provider', async () => {
		const rows = [{ name: 'Alice', city: 'NYC' }, { name: 'Bob', city: 'LA' }];
		const provider = new MockRowProvider(rows);
		const m = model.findOrCreateRowMarker(FILE, 1, 'name');

		await model.populateMarkerTextCacheForFile(FILE, provider);

		expect(model.getMarkerText(m)).toBe('Bob');
		expect(model.getMarkerTextCacheSize()).toBe(1);
	});

	it('caches segment marker as substring(from, to)', async () => {
		const rows = [{ text: 'The quick brown fox jumps' }];
		const provider = new MockRowProvider(rows);
		const seg = model.findOrCreateSegmentMarker({
			fileId: FILE, sourceRowId: 0, column: 'text', from: 4, to: 9, text: 'quick',
		});

		await model.populateMarkerTextCacheForFile(FILE, provider);

		expect(model.getMarkerText(seg)).toBe('quick');
	});

	it('returns null when row missing in provider (out of range)', async () => {
		const rows = [{ name: 'Alice' }];
		const provider = new MockRowProvider(rows);
		const m = model.findOrCreateRowMarker(FILE, 99, 'name');

		await model.populateMarkerTextCacheForFile(FILE, provider);

		expect(model.getMarkerText(m)).toBeNull();
		expect(model.getMarkerTextCacheSize()).toBe(0);
	});

	it('chunks fetches when markers > chunkSize', async () => {
		const rows = Array.from({ length: 50 }, (_, i) => ({ col: `v${i}` }));
		const provider = new MockRowProvider(rows);
		for (let i = 0; i < 50; i++) model.findOrCreateRowMarker(FILE, i, 'col');

		const spy = vi.spyOn(provider, 'batchGetMarkerText');
		await model.populateMarkerTextCacheForFile(FILE, provider, { chunkSize: 10 });

		expect(spy).toHaveBeenCalledTimes(5);
		expect(model.getMarkerTextCacheSize()).toBe(50);
	});

	it('dedupes refs by (sourceRowId, column) within a chunk', async () => {
		const rows = [{ text: 'Hello World' }];
		const provider = new MockRowProvider(rows);
		// Three segment markers on the same cell.
		model.findOrCreateSegmentMarker({ fileId: FILE, sourceRowId: 0, column: 'text', from: 0, to: 5, text: 'Hello' });
		model.findOrCreateSegmentMarker({ fileId: FILE, sourceRowId: 0, column: 'text', from: 6, to: 11, text: 'World' });
		model.findOrCreateRowMarker(FILE, 0, 'text');

		const spy = vi.spyOn(provider, 'batchGetMarkerText');
		await model.populateMarkerTextCacheForFile(FILE, provider);

		expect(spy).toHaveBeenCalledTimes(1);
		const args = spy.mock.calls[0]![0];
		// 3 markers but only 1 unique (sourceRowId, column).
		expect(args.length).toBe(1);
		expect(model.getMarkerTextCacheSize()).toBe(3);
	});

	it('does nothing when file has no markers', async () => {
		const provider = new MockRowProvider([{ x: 'y' }]);
		const spy = vi.spyOn(provider, 'batchGetMarkerText');

		await model.populateMarkerTextCacheForFile(FILE, provider);

		expect(spy).not.toHaveBeenCalled();
		expect(model.getMarkerTextCacheSize()).toBe(0);
	});
});

describe('markerTextCache — populateMissing', () => {
	it('only fetches markers without cache hits', async () => {
		const rows = [
			{ col: 'first' },
			{ col: 'second' },
			{ col: 'third' },
		];
		const provider = new MockRowProvider(rows);
		const m1 = model.findOrCreateRowMarker(FILE, 0, 'col');
		const m2 = model.findOrCreateRowMarker(FILE, 1, 'col');

		await model.populateMarkerTextCacheForFile(FILE, provider);
		expect(model.getMarkerTextCacheSize()).toBe(2);

		// Add a third marker post-populate.
		const m3 = model.findOrCreateRowMarker(FILE, 2, 'col');
		const spy = vi.spyOn(provider, 'batchGetMarkerText');

		const added = await model.populateMissingMarkerTextsForFile(FILE, provider);

		expect(added).toBe(1);
		expect(spy).toHaveBeenCalledTimes(1);
		const requestedRefs = spy.mock.calls[0]![0];
		expect(requestedRefs).toEqual([{ sourceRowId: 2, column: 'col' }]);
		expect(model.getMarkerText(m1)).toBe('first');
		expect(model.getMarkerText(m2)).toBe('second');
		expect(model.getMarkerText(m3)).toBe('third');
	});

	it('returns 0 and skips fetch when nothing missing', async () => {
		const rows = [{ col: 'v' }];
		const provider = new MockRowProvider(rows);
		model.findOrCreateRowMarker(FILE, 0, 'col');
		await model.populateMarkerTextCacheForFile(FILE, provider);

		const spy = vi.spyOn(provider, 'batchGetMarkerText');
		const added = await model.populateMissingMarkerTextsForFile(FILE, provider);

		expect(added).toBe(0);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('markerTextCache — async path', () => {
	it('getMarkerTextAsync caches the result on hit', async () => {
		const rows = [{ col: 'lazy-value' }];
		const provider = new MockRowProvider(rows);
		const m = model.findOrCreateRowMarker(FILE, 0, 'col');
		model.registerLazyProvider(FILE, provider);

		// No populate — start cold.
		expect(model.getMarkerTextCacheSize()).toBe(0);

		const text = await model.getMarkerTextAsync(m);
		expect(text).toBe('lazy-value');
		// Sync now hits cache.
		expect(model.getMarkerText(m)).toBe('lazy-value');
		expect(model.getMarkerTextCacheSize()).toBe(1);
	});

	it('getMarkerTextAsync applies from/to substring on segment', async () => {
		const rows = [{ text: 'Hello World' }];
		const provider = new MockRowProvider(rows);
		const seg = model.findOrCreateSegmentMarker({
			fileId: FILE, sourceRowId: 0, column: 'text', from: 6, to: 11, text: 'World',
		});
		model.registerLazyProvider(FILE, provider);

		const text = await model.getMarkerTextAsync(seg);
		expect(text).toBe('World');
	});
});

describe('markerTextCache — invalidation', () => {
	it('removeMarker drops cache entry', async () => {
		const provider = new MockRowProvider([{ col: 'hi' }]);
		const m = model.findOrCreateRowMarker(FILE, 0, 'col');
		await model.populateMarkerTextCacheForFile(FILE, provider);
		expect(model.getMarkerTextCacheSize()).toBe(1);

		model.removeMarker(m.id);
		expect(model.getMarkerTextCacheSize()).toBe(0);
	});

	it('clearMarkerTextCacheForFile drops only that file', async () => {
		const provider1 = new MockRowProvider([{ col: 'a' }]);
		const provider2 = new MockRowProvider([{ col: 'b' }]);
		const m1 = model.findOrCreateRowMarker('file1.parquet', 0, 'col');
		const m2 = model.findOrCreateRowMarker('file2.parquet', 0, 'col');
		await model.populateMarkerTextCacheForFile('file1.parquet', provider1);
		await model.populateMarkerTextCacheForFile('file2.parquet', provider2);
		expect(model.getMarkerTextCacheSize()).toBe(2);

		model.clearMarkerTextCacheForFile('file1.parquet');
		expect(model.getMarkerText(m1)).toBeNull();
		expect(model.getMarkerText(m2)).toBe('b');
	});

	it('removeAllMarkersForFile clears that file cache', async () => {
		const provider = new MockRowProvider([{ col: 'x' }, { col: 'y' }]);
		model.findOrCreateRowMarker(FILE, 0, 'col');
		model.findOrCreateRowMarker(FILE, 1, 'col');
		await model.populateMarkerTextCacheForFile(FILE, provider);
		expect(model.getMarkerTextCacheSize()).toBe(2);

		model.removeAllMarkersForFile(FILE);
		expect(model.getMarkerTextCacheSize()).toBe(0);
	});

	it('clearAllMarkers wipes the entire preview cache', async () => {
		const provider = new MockRowProvider([{ col: 'x' }]);
		model.findOrCreateRowMarker(FILE, 0, 'col');
		await model.populateMarkerTextCacheForFile(FILE, provider);
		expect(model.getMarkerTextCacheSize()).toBe(1);

		model.clearAllMarkers();
		expect(model.getMarkerTextCacheSize()).toBe(0);
	});

	it('deleteSegmentMarkersForCell drops cache for that cell only', async () => {
		const provider = new MockRowProvider([{ text: 'Hello World', other: 'untouched' }]);
		const seg1 = model.findOrCreateSegmentMarker({ fileId: FILE, sourceRowId: 0, column: 'text', from: 0, to: 5, text: 'Hello' });
		const segOtherCell = model.findOrCreateSegmentMarker({ fileId: FILE, sourceRowId: 0, column: 'other', from: 0, to: 9, text: 'untouched' });
		await model.populateMarkerTextCacheForFile(FILE, provider);
		expect(model.getMarkerTextCacheSize()).toBe(2);

		model.deleteSegmentMarkersForCell(FILE, 0, 'text');
		expect(model.getMarkerText(seg1)).toBeNull();
		expect(model.getMarkerText(segOtherCell)).toBe('untouched');
	});

	it('removeCodeFromManyRows drops cache when marker becomes empty', async () => {
		registry.create('code-a');
		const provider = new MockRowProvider([{ col: 'a' }, { col: 'b' }]);
		const m1 = model.findOrCreateRowMarker(FILE, 0, 'col');
		model.findOrCreateRowMarker(FILE, 1, 'col');
		const codeId = registry.getByName('code-a')!.id;
		model.addCodeToMarker(m1.id, codeId);

		await model.populateMarkerTextCacheForFile(FILE, provider);
		expect(model.getMarkerTextCacheSize()).toBe(2);

		// Removing code-a from row 0 makes the marker empty → deleted.
		model.removeCodeFromManyRows(FILE, [0], 'col', codeId);

		// m1 cache entry is dropped; m2 still cached.
		expect(model.getMarkerTextCacheSize()).toBe(1);
	});
});
