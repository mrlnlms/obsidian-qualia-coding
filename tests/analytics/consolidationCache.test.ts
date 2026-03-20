import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsolidationCache } from '../../src/analytics/data/consolidationCache';
import { consolidate } from '../../src/analytics/data/dataConsolidator';
import type { AllEngineData } from '../../src/analytics/data/dataReader';
import type { EngineType } from '../../src/analytics/data/dataTypes';

function makeFixture(): AllEngineData {
	const defs = {
		'id-a': { id: 'id-a', name: 'Alpha', color: '#FF0000' },
		'id-b': { id: 'id-b', name: 'Beta', color: '#00FF00' },
	};
	return {
		markdown: {
			markers: {
				'note.md': [
					{ id: 'm1', codes: ['Alpha', 'Beta'], range: { from: { line: 0, ch: 0 }, to: { line: 1, ch: 10 } }, fileId: 'note.md', createdAt: 1000 },
				],
			},
			settings: {} as any,
			codeDefinitions: defs,
		},
		csv: {
			segmentMarkers: [
				{ id: 'c1', codes: ['Alpha'], fileId: 'data.csv', row: 0, column: 'col1', from: 0, to: 5, createdAt: 2000 },
			],
			rowMarkers: [],
			registry: { definitions: defs },
		},
		image: { markers: [], settings: { autoOpenImages: false, fileStates: {} }, registry: { definitions: defs } },
		pdf: { markers: [], shapes: [], registry: { definitions: defs } },
		audio: { files: [], settings: {}, codeDefinitions: { definitions: defs } },
		video: { files: [], settings: {}, codeDefinitions: { definitions: defs } },
	};
}

function fullConsolidate(raw: AllEngineData) {
	return consolidate(raw.markdown, raw.csv, raw.image, raw.pdf, raw.audio, raw.video);
}

describe('ConsolidationCache', () => {
	let cache: ConsolidationCache;
	let fixture: AllEngineData;
	let readFn: () => AllEngineData;

	beforeEach(() => {
		cache = new ConsolidationCache();
		fixture = makeFixture();
		readFn = vi.fn(() => fixture);
	});

	it('first call computes everything (cache miss)', async () => {
		const result = await cache.getData(readFn);
		expect(result.markers.length).toBeGreaterThan(0);
		expect(readFn).toHaveBeenCalledTimes(1);
	});

	it('second call without invalidation returns cached (reference ===)', async () => {
		const first = await cache.getData(readFn);
		const second = await cache.getData(readFn);
		expect(second).toBe(first);
		expect(readFn).toHaveBeenCalledTimes(1);
	});

	it('invalidateEngine marks only that engine dirty', async () => {
		await cache.getData(readFn);
		cache.invalidateEngine('markdown');
		const result = await cache.getData(readFn);
		expect(result).not.toBe(undefined);
		expect(readFn).toHaveBeenCalledTimes(2);
	});

	it('invalidateEngine for multiple engines reprocesses all dirty', async () => {
		await cache.getData(readFn);
		cache.invalidateEngine('markdown');
		cache.invalidateEngine('csv');
		const result = await cache.getData(readFn);
		expect(result.markers.length).toBeGreaterThan(0);
	});

	it('invalidateRegistry recalculates codes but not markers', async () => {
		const first = await cache.getData(readFn);
		const markersBefore = first.markers;
		cache.invalidateRegistry();
		const second = await cache.getData(readFn);
		expect(second.markers).toEqual(markersBefore);
		expect(second).not.toBe(first);
	});

	it('invalidateAll recomputes everything', async () => {
		const first = await cache.getData(readFn);
		cache.invalidateAll();
		const second = await cache.getData(readFn);
		expect(second).not.toBe(first);
		expect(readFn).toHaveBeenCalledTimes(2);
	});

	it('output matches full consolidate()', async () => {
		const cached = await cache.getData(readFn);
		const full = fullConsolidate(fixture);
		expect(cached.markers).toEqual(full.markers);
		expect(cached.codes).toEqual(full.codes);
		expect(cached.sources).toEqual(full.sources);
	});

	it('multiple invalidations before getData collapse into one recompute', async () => {
		await cache.getData(readFn);
		cache.invalidateEngine('markdown');
		cache.invalidateEngine('markdown');
		cache.invalidateEngine('markdown');
		const result = await cache.getData(readFn);
		expect(readFn).toHaveBeenCalledTimes(2);
		expect(result.markers.length).toBeGreaterThan(0);
	});

	it('engine with null data works without error', async () => {
		const nullFixture = { ...makeFixture(), pdf: null as any };
		const nullReadFn = vi.fn(() => nullFixture);
		const nullCache = new ConsolidationCache();
		const result = await nullCache.getData(nullReadFn);
		expect(result.sources.pdf).toBe(false);
	});

	it('sources record reflects hasData (original semantics: data exists, not markers exist)', async () => {
		const result = await cache.getData(readFn);
		expect(result.sources.markdown).toBe(true);
		expect(result.sources.csv).toBe(true);
		expect(result.sources.image).toBe(true);
		expect(result.sources.pdf).toBe(true);
		expect(result.sources.audio).toBe(true);
		expect(result.sources.video).toBe(true);
	});

	it('registry + engine dirty together reprocesses both', async () => {
		const first = await cache.getData(readFn);
		cache.invalidateEngine('csv');
		cache.invalidateRegistry();
		const second = await cache.getData(readFn);
		expect(second).not.toBe(first);
	});
});
