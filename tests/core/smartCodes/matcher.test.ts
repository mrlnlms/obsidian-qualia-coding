import { describe, it, expect } from 'vitest';
import { collectMatchesChunked } from '../../../src/core/smartCodes/matcher';
import { SmartCodeCache } from '../../../src/core/smartCodes/cache';
import { createDefaultData } from '../../../src/core/types';

function buildFixture(numMarkers: number) {
	const data = createDefaultData();
	const markers = [];
	for (let i = 0; i < numMarkers; i++) {
		markers.push({ id: `m${i}`, fileId: 'f.md', codes: [{ codeId: i % 2 === 0 ? 'c_a' : 'c_b' }], range: {} } as any);
	}
	(data.markdown.markers as any)['f.md'] = markers;
	data.registry.smartCodes['sc_x'] = { id: 'sc_x', name: 'X', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_a' }};
	return data;
}

describe('collectMatchesChunked', () => {
	it('progresso reportado em chunks', async () => {
		const data = buildFixture(2500);
		const cache = new SmartCodeCache();
		cache.configure({ smartCodes: data.registry.smartCodes, caseVars: { get: () => undefined, allKeys: () => new Set() }, codeStruct: { codesInFolder: () => [], codesInGroup: () => [] }});
		cache.rebuildIndexes(data);

		const progressCalls: Array<[number, number]> = [];
		await collectMatchesChunked('sc_x', cache, { chunkSize: 1000, onProgress: (d, t) => progressCalls.push([d, t]) });
		expect(progressCalls.length).toBeGreaterThan(0);
		expect(progressCalls.at(-1)![0]).toBe(progressCalls.at(-1)![1]);
		expect(progressCalls.at(-1)![1]).toBe(2500);
	});

	it('result idêntico ao sync compute', async () => {
		const data = buildFixture(200);
		const cache = new SmartCodeCache();
		cache.configure({ smartCodes: data.registry.smartCodes, caseVars: { get: () => undefined, allKeys: () => new Set() }, codeStruct: { codesInFolder: () => [], codesInGroup: () => [] }});
		cache.rebuildIndexes(data);

		const sync = cache.getMatches('sc_x');
		const chunked = await collectMatchesChunked('sc_x', cache, { chunkSize: 50 });
		expect(chunked.map(r => r.markerId).sort()).toEqual(sync.map(r => r.markerId).sort());
		// 100 matches (metade dos 200 com c_a)
		expect(chunked).toHaveLength(100);
	});

	it('returns empty quando smart code não existe', async () => {
		const data = buildFixture(10);
		const cache = new SmartCodeCache();
		cache.configure({ smartCodes: data.registry.smartCodes, caseVars: { get: () => undefined, allKeys: () => new Set() }, codeStruct: { codesInFolder: () => [], codesInGroup: () => [] }});
		cache.rebuildIndexes(data);

		const result = await collectMatchesChunked('sc_missing', cache);
		expect(result).toEqual([]);
	});
});
