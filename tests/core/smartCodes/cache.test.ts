import { describe, it, expect, beforeEach } from 'vitest';
import { SmartCodeCache, type CacheConfig } from '../../../src/core/smartCodes/cache';
import { createDefaultData } from '../../../src/core/types';

describe('SmartCodeCache', () => {
	let cache: SmartCodeCache;
	let data: any;

	const lookups = (data: any): CacheConfig => ({
		smartCodes: data.smartCodes.definitions,
		caseVars: { get: () => undefined, allKeys: () => new Set<string>() },
		codeStruct: { codesInFolder: () => [], codesInGroup: () => [] },
	});

	beforeEach(() => {
		data = createDefaultData();
		data.markdown.markers = {
			'f1.md': [{ id: 'm1', fileId: 'f1.md', codes: [{ codeId: 'c_a' }], range: {} }],
		};
		data.smartCodes.definitions = {
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
		data.smartCodes.definitions['sc_y'] = { id: 'sc_y', name: 'Y', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_b' }};
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
		data.smartCodes.definitions['sc_z'] = { id: 'sc_z', name: 'Z', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'smartCode', smartCodeId: 'sc_x' }};
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

	it('referential identity: markerByRef aponta pros mesmos marker objects', () => {
		const markerByRef = cache.__getMarkerByRefForTest();
		expect(markerByRef.size).toBe(1);
		for (const [ref, cachedMarker] of markerByRef) {
			const originalMarker = data.markdown.markers[ref.fileId].find((m: any) => m.id === ref.markerId);
			expect(cachedMarker).toBe(originalMarker);
		}
	});

	describe('applyMarkerMutation', () => {
		it('ADD: nova ref entra no markerByRef + invalida só SCs dependentes', () => {
			data.smartCodes.definitions['sc_y'] = { id: 'sc_y', name: 'Y', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_b' }} as any;
			cache.configure(lookups(data));
			cache.rebuildIndexes(data);
			cache.getMatches('sc_x'); // warm
			cache.getMatches('sc_y');
			expect(cache.isDirty('sc_x')).toBe(false);
			expect(cache.isDirty('sc_y')).toBe(false);

			const newMarker = { id: 'm2', fileId: 'f2.md', codes: [{ codeId: 'c_b' }], range: {} };
			data.markdown.markers['f2.md'] = [newMarker];
			cache.applyMarkerMutation({
				engine: 'markdown', fileId: 'f2.md', markerId: 'm2',
				prevCodeIds: [], nextCodeIds: ['c_b'], codeIds: ['c_b'],
				marker: newMarker as any,
			});

			expect(cache.isDirty('sc_x')).toBe(false); // sc_x depende de c_a, não c_b
			expect(cache.isDirty('sc_y')).toBe(true);
			expect(cache.getCount('sc_y')).toBe(1);
			expect(cache.getMatches('sc_y')[0]).toMatchObject({ engine: 'markdown', fileId: 'f2.md', markerId: 'm2' });
		});

		it('REMOVE: tira do markerByRef + invalida SCs que dependem dos codes removidos', () => {
			cache.getMatches('sc_x');
			expect(cache.getCount('sc_x')).toBe(1);

			cache.applyMarkerMutation({
				engine: 'markdown', fileId: 'f1.md', markerId: 'm1',
				prevCodeIds: ['c_a'], nextCodeIds: [], codeIds: ['c_a'],
				marker: undefined,
			});

			expect(cache.isDirty('sc_x')).toBe(true);
			expect(cache.getCount('sc_x')).toBe(0);
		});

		it('UPDATE: preserva ref identity + invalida SCs', () => {
			const matches1 = cache.getMatches('sc_x');
			const refIdentity = matches1[0]!;

			const updatedMarker = { id: 'm1', fileId: 'f1.md', codes: [{ codeId: 'c_a' }, { codeId: 'c_b' }], range: {} };
			cache.applyMarkerMutation({
				engine: 'markdown', fileId: 'f1.md', markerId: 'm1',
				prevCodeIds: ['c_a'], nextCodeIds: ['c_a', 'c_b'], codeIds: ['c_a', 'c_b'],
				marker: updatedMarker as any,
			});

			expect(cache.isDirty('sc_x')).toBe(true);
			const matches2 = cache.getMatches('sc_x');
			// Ref identity mantida — mesma instância de MarkerRef.
			expect(matches2[0]).toBe(refIdentity);
			// Marker value substituído.
			expect(cache.getMarkerByRef(refIdentity)).toBe(updatedMarker);
		});

		it('memo edit (codeIds vazio) é no-op de invalidação', () => {
			cache.getMatches('sc_x');
			expect(cache.isDirty('sc_x')).toBe(false);

			const updated = { id: 'm1', fileId: 'f1.md', codes: [{ codeId: 'c_a' }], range: {}, memo: 'new' };
			cache.applyMarkerMutation({
				engine: 'markdown', fileId: 'f1.md', markerId: 'm1',
				prevCodeIds: ['c_a'], nextCodeIds: ['c_a'], codeIds: [],
				marker: updated as any,
			});

			expect(cache.isDirty('sc_x')).toBe(false); // sem invalidação
			expect(cache.getMarkerByRef(cache.getMatches('sc_x')[0]!)).toBe(updated); // mas marker atualizado
		});
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

	describe('onSmartCodeChanged (incremental update)', () => {
		it('add: extrai deps do sc novo + marca dirty', () => {
			data.smartCodes.definitions['sc_new'] = { id: 'sc_new', name: 'N', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_a' }};
			cache.onSmartCodeChanged('sc_new');
			expect(cache.isDirty('sc_new')).toBe(true);
			expect(cache.getMatches('sc_new')).toHaveLength(1);
		});

		it('update: re-extrai deps do sc + marca dirty + cascateia pra dependentes', () => {
			data.smartCodes.definitions['sc_z'] = { id: 'sc_z', name: 'Z', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'smartCode', smartCodeId: 'sc_x' }};
			cache.onSmartCodeChanged('sc_z');
			cache.getMatches('sc_z');  // computa
			expect(cache.isDirty('sc_z')).toBe(false);

			// Edita sc_x — sc_z (dependente) deve ficar dirty
			data.smartCodes.definitions['sc_x']!.predicate = { kind: 'hasCode', codeId: 'c_b' };
			cache.onSmartCodeChanged('sc_x');
			expect(cache.isDirty('sc_x')).toBe(true);
			expect(cache.isDirty('sc_z')).toBe(true);
		});

		it('remove: dropa deps + matches + cascateia pra dependentes', () => {
			data.smartCodes.definitions['sc_z'] = { id: 'sc_z', name: 'Z', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'smartCode', smartCodeId: 'sc_x' }};
			cache.onSmartCodeChanged('sc_z');
			cache.getMatches('sc_z');

			delete data.smartCodes.definitions['sc_x'];
			cache.onSmartCodeChanged('sc_x');
			expect(cache.isDirty('sc_x')).toBe(false);
			expect(cache.__getMatchesMapHasForTest('sc_x')).toBe(false);
			expect(cache.isDirty('sc_z')).toBe(true);  // cascade
		});
	});
});
