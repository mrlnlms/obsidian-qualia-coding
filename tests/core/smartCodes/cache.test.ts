import { describe, it, expect, beforeEach } from 'vitest';
import { SmartCodeCache, type CacheConfig } from '../../../src/core/smartCodes/cache';
import { createDefaultData } from '../../../src/core/types';

describe('SmartCodeCache', () => {
	let cache: SmartCodeCache;
	let data: any;

	const lookups = (data: any): CacheConfig => ({
		smartCodes: data.registry.smartCodes,
		caseVars: { get: () => undefined, allKeys: () => new Set<string>() },
		codeStruct: { codesInFolder: () => [], codesInGroup: () => [] },
	});

	beforeEach(() => {
		data = createDefaultData();
		data.markdown.markers = {
			'f1.md': [{ id: 'm1', fileId: 'f1.md', codes: [{ codeId: 'c_a' }], range: {} }],
		};
		data.registry.smartCodes = {
			'sc_x': { id: 'sc_x', name: 'X', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_a' }},
		};
		cache = new SmartCodeCache();
		cache.configure(lookups(data));
		cache.rebuildIndexes(data);
	});

	it('getMatches retorna refs corretas', () => {
		const m = cache.getMatches('sc_x');
		expect(m).toHaveLength(1);
		expect(m[0]).toMatchObject({ engine: 'markdown', fileId: 'f1.md', markerId: 'm1' });
	});

	it('getCount retorna 1', () => {
		expect(cache.getCount('sc_x')).toBe(1);
	});

	it('cached read não re-computa (mesma referência)', () => {
		const matches1 = cache.getMatches('sc_x');
		const matches2 = cache.getMatches('sc_x');
		expect(matches1).toBe(matches2);
	});

	it('invalidateForCode invalida só smart codes que dependem', () => {
		data.registry.smartCodes['sc_y'] = { id: 'sc_y', name: 'Y', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_b' }};
		cache.configure(lookups(data));
		cache.rebuildIndexes(data);
		cache.getMatches('sc_x');
		cache.getMatches('sc_y');

		let changed: string[] = [];
		cache.subscribe(ids => { changed = ids; });
		cache.invalidateForCode('c_a');
		cache.__flushPendingForTest();

		expect(changed).toEqual(['sc_x']);
	});

	it('cascata: invalidate sc_x propaga pra sc_z que referencia sc_x', () => {
		data.registry.smartCodes['sc_z'] = { id: 'sc_z', name: 'Z', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'smartCode', smartCodeId: 'sc_x' }};
		cache.configure(lookups(data));
		cache.rebuildIndexes(data);
		cache.getMatches('sc_x');
		cache.getMatches('sc_z');

		let changed: string[] = [];
		cache.subscribe(ids => { changed = ids; });
		cache.invalidate('sc_x');
		cache.__flushPendingForTest();

		expect(changed.sort()).toEqual(['sc_x', 'sc_z']);
	});

	it('referential identity: indexByCode aponta pros mesmos marker objects', () => {
		const idx = cache.__getIndexByCodeForTest();
		const refs = idx.get('c_a');
		expect(refs).toBeDefined();
		expect(refs!.size).toBe(1);

		const markerByRef = cache.__getMarkerByRefForTest();
		for (const ref of refs!) {
			const cachedMarker = markerByRef.get(ref);
			const originalMarker = data.markdown.markers[ref.fileId].find((m: any) => m.id === ref.markerId);
			expect(cachedMarker).toBe(originalMarker);
		}
	});

	it('computePreview NÃO polui matches/dirty internos', () => {
		const matchesSizeBefore = cache.__getMatchesMapSizeForTest();
		const dirtySizeBefore = cache.__getDirtySizeForTest();

		const result = cache.computePreview({ kind: 'hasCode', codeId: 'c_a' }, '__preview__');
		expect(result).toHaveLength(1);

		expect(cache.__getMatchesMapSizeForTest()).toBe(matchesSizeBefore);
		expect(cache.__getDirtySizeForTest()).toBe(dirtySizeBefore);
		expect(cache.__getMatchesMapHasForTest('__preview__')).toBe(false);
	});

	it('isDirty true após invalidate, false após getMatches', () => {
		cache.getMatches('sc_x');  // computa
		expect(cache.isDirty('sc_x')).toBe(false);
		cache.invalidate('sc_x');
		expect(cache.isDirty('sc_x')).toBe(true);
		cache.getMatches('sc_x');
		expect(cache.isDirty('sc_x')).toBe(false);
	});

	it('subscribe + unsubscribe', () => {
		let count = 0;
		const unsub = cache.subscribe(() => { count++; });
		cache.invalidateForCode('c_a');
		cache.__flushPendingForTest();
		expect(count).toBe(1);
		unsub();
		cache.invalidateForCode('c_a');
		cache.__flushPendingForTest();
		expect(count).toBe(1);  // não chamou de novo
	});
});
