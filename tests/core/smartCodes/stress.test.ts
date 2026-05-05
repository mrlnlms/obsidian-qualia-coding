import { describe, it, expect } from 'vitest';
import { SmartCodeCache } from '../../../src/core/smartCodes/cache';
import { buildLargeFixture } from './_fixtures/buildLargeFixture';

const SMALL = { codes: 100, markers: 1000, smartCodes: 10 };
const LARGE = { codes: 1000, markers: 10000, smartCodes: 100 };

const lookups = (data: any) => ({
	smartCodes: data.smartCodes.definitions,
	caseVars: { get: () => undefined, allKeys: () => new Set<string>() },
	codeStruct: { codesInFolder: () => [], codesInGroup: () => [] },
});

describe('SmartCodeCache stress (CI 2x headroom)', () => {
	it('rebuildIndexes 10k markers em <1000ms', () => {
		const data = buildLargeFixture(LARGE);
		const cache = new SmartCodeCache();
		cache.configure(lookups(data));
		const t0 = performance.now();
		cache.rebuildIndexes(data);
		const dt = performance.now() - t0;
		expect(dt).toBeLessThan(1000);
	});

	it('cold compute smart code novo <1000ms', () => {
		const data = buildLargeFixture(LARGE);
		const cache = new SmartCodeCache();
		cache.configure(lookups(data));
		cache.rebuildIndexes(data);
		const t0 = performance.now();
		cache.getMatches('sc_50');
		const dt = performance.now() - t0;
		expect(dt).toBeLessThan(1000);
	});

	it('cached read <10ms (média de 100 reads)', () => {
		const data = buildLargeFixture(LARGE);
		const cache = new SmartCodeCache();
		cache.configure(lookups(data));
		cache.rebuildIndexes(data);
		cache.getMatches('sc_50');  // warm
		const t0 = performance.now();
		for (let i = 0; i < 100; i++) cache.getMatches('sc_50');
		const dt = (performance.now() - t0) / 100;
		expect(dt).toBeLessThan(10);
	});

	it('referential identity: indexByCode aponta pros mesmos marker objects', () => {
		const data = buildLargeFixture(SMALL);
		const cache = new SmartCodeCache();
		cache.configure(lookups(data));
		cache.rebuildIndexes(data);
		const idx = cache.__getIndexByCodeForTest();
		const refs = idx.get('c_0');
		expect(refs).toBeDefined();
		expect(refs!.size).toBeGreaterThan(0);

		const markerByRef = cache.__getMarkerByRefForTest();
		// Pega o primeiro ref e valida que o marker no markerByRef é o mesmo objeto que está em data
		const firstRef = [...refs!][0]!;
		const cachedMarker = markerByRef.get(firstRef);
		// Search no data por engine + fileId + markerId
		let originalMarker: any;
		if (firstRef.engine === 'markdown') originalMarker = (data.markdown.markers as any)[firstRef.fileId]?.find((m: any) => m.id === firstRef.markerId);
		else if (firstRef.engine === 'pdf') originalMarker = (data.pdf.markers as any).find((m: any) => m.id === firstRef.markerId);
		else if (firstRef.engine === 'csv') originalMarker = (data.csv.rowMarkers as any).find((m: any) => m.id === firstRef.markerId);
		expect(originalMarker).toBeDefined();
		expect(cachedMarker).toBe(originalMarker);
	});

	it('invalidação granular: invalidateForCode só marca smart codes que dependem', () => {
		const data = buildLargeFixture(SMALL);
		const cache = new SmartCodeCache();
		cache.configure(lookups(data));
		cache.rebuildIndexes(data);
		// Computar todos
		for (const id of Object.keys(data.smartCodes.definitions)) cache.getMatches(id);
		// Invalida c_0 — só smart codes cujo predicate referencia c_0 devem ficar dirty
		cache.invalidateForCode('c_0');
		const dirtyCount = Array.from({ length: SMALL.smartCodes }, (_, i) => cache.isDirty(`sc_${i}`)).filter(Boolean).length;
		// Smart codes que dependem de c_0: predicate `hasCode(c_0)` + `magnitudeGte(c_1, 3)` → sc_0 (predicate: hasCode c_0 + magGte c_1)
		// Smart codes nesting referenciam outros sc, então só os com leaf direta hasCode/magGte de c_0 ficam dirty (1 ou poucos)
		expect(dirtyCount).toBeGreaterThan(0);
		expect(dirtyCount).toBeLessThan(SMALL.smartCodes);  // não invalida tudo
	});
});
