/**
 * Smoke SC3 contra data.json real do vault. Roda só se data.json existe na raiz
 * (workbench dev). Em CI / fresh clone, skip silenciosamente.
 *
 * Valida:
 * 1. cache.rebuildIndexes carrega todos markers sem crash, populando markerByRef.
 * 2. Cada SC computa matches deterministicamente (count estável em re-runs).
 * 3. applyMarkerMutation com mutação no-op (UPDATE com mesmos codes) preserva
 *    counts — testa identity preservation + invalidação correta.
 * 4. REMOVE + ADD restaura counts (round-trip).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SmartCodeCache } from '../../src/core/smartCodes/cache';
import type { MarkerMutationEvent, EngineType } from '../../src/core/types';

const dataPath = join(process.cwd(), 'data.json');
const dataExists = existsSync(dataPath);

describe.runIf(dataExists)('SC3 smoke contra data.json real', () => {
	let data: any;
	beforeAll(() => {
		data = JSON.parse(readFileSync(dataPath, 'utf8'));
	});

	const buildCache = () => {
		const cache = new SmartCodeCache();
		cache.configure({
			smartCodes: data.smartCodes?.definitions ?? {},
			caseVars: { get: () => undefined, allKeys: () => new Set<string>() },
			codeStruct: { codesInFolder: () => [], codesInGroup: () => [] },
		});
		cache.rebuildIndexes(data);
		return cache;
	};

	const allMarkers = (): Array<{ engine: EngineType; fileId: string; markerId: string; codes: string[]; marker: any }> => {
		const out: Array<{ engine: EngineType; fileId: string; markerId: string; codes: string[]; marker: any }> = [];
		for (const [fid, ms] of Object.entries(data.markdown?.markers ?? {})) {
			for (const m of ms as any[]) out.push({ engine: 'markdown', fileId: fid, markerId: m.id, codes: m.codes.map((c: any) => c.codeId), marker: m });
		}
		for (const m of (data.pdf?.markers ?? []) as any[]) out.push({ engine: 'pdf', fileId: m.fileId, markerId: m.id, codes: m.codes.map((c: any) => c.codeId), marker: m });
		for (const m of (data.image?.markers ?? []) as any[]) out.push({ engine: 'image', fileId: m.fileId, markerId: m.id, codes: m.codes.map((c: any) => c.codeId), marker: m });
		for (const m of (data.csv?.segmentMarkers ?? []) as any[]) out.push({ engine: 'csv', fileId: m.fileId, markerId: m.id, codes: m.codes.map((c: any) => c.codeId), marker: m });
		for (const m of (data.csv?.rowMarkers ?? []) as any[]) out.push({ engine: 'csv', fileId: m.fileId, markerId: m.id, codes: m.codes.map((c: any) => c.codeId), marker: m });
		for (const f of (data.audio?.files ?? []) as any[]) {
			for (const m of f.markers ?? []) out.push({ engine: 'audio', fileId: f.path, markerId: m.id, codes: m.codes.map((c: any) => c.codeId), marker: m });
		}
		for (const f of (data.video?.files ?? []) as any[]) {
			for (const m of f.markers ?? []) out.push({ engine: 'video', fileId: f.path, markerId: m.id, codes: m.codes.map((c: any) => c.codeId), marker: m });
		}
		return out;
	};

	it('rebuildIndexes carrega todos markers do vault sem crash', () => {
		const cache = buildCache();
		const markers = allMarkers();
		expect(cache.__getMarkerByRefForTest().size).toBe(markers.length);
	});

	it('cada SC retorna count determinístico em re-builds', () => {
		const scIds = Object.keys(data.smartCodes?.definitions ?? {});
		if (scIds.length === 0) return;

		const cacheA = buildCache();
		const countsA = new Map(scIds.map(id => [id, cacheA.getCount(id)]));
		const cacheB = buildCache();
		const countsB = new Map(scIds.map(id => [id, cacheB.getCount(id)]));
		expect(countsA).toEqual(countsB);
		console.log('[SC3 smoke] SC counts:', Object.fromEntries(countsA));
	});

	it('applyMarkerMutation UPDATE no-op preserva counts (identity preservation)', () => {
		const scIds = Object.keys(data.smartCodes?.definitions ?? {});
		if (scIds.length === 0) return;

		const cache = buildCache();
		const countsBefore = new Map(scIds.map(id => [id, cache.getCount(id)]));

		// Pra cada marker, simula UPDATE com codes idênticos.
		for (const m of allMarkers()) {
			cache.applyMarkerMutation({
				engine: m.engine, fileId: m.fileId, markerId: m.markerId,
				prevCodeIds: m.codes, nextCodeIds: m.codes,
				codeIds: m.codes, // união = mesmos codes → invalida SCs dependentes
				marker: m.marker,
			});
		}

		// Cache invalida + recomputa. Counts devem permanecer iguais.
		const countsAfter = new Map(scIds.map(id => [id, cache.getCount(id)]));
		expect(countsAfter).toEqual(countsBefore);
	});

	it('REMOVE + ADD round-trip preserva counts pra cada engine', () => {
		const scIds = Object.keys(data.smartCodes?.definitions ?? {});
		if (scIds.length === 0) return;

		const markers = allMarkers();
		// 1 marker por engine pra cobrir todos os caminhos.
		const sampleByEngine = new Map<EngineType, typeof markers[0]>();
		for (const m of markers) {
			if (m.codes.length === 0) continue; // só markers com codes (relevante pra SC matching)
			if (!sampleByEngine.has(m.engine)) sampleByEngine.set(m.engine, m);
		}

		for (const [engine, sample] of sampleByEngine) {
			const cache = buildCache();
			const countsBefore = new Map(scIds.map(id => [id, cache.getCount(id)]));

			// REMOVE
			cache.applyMarkerMutation({
				engine: sample.engine, fileId: sample.fileId, markerId: sample.markerId,
				prevCodeIds: sample.codes, nextCodeIds: [],
				codeIds: sample.codes, marker: undefined,
			});
			// ADD back
			cache.applyMarkerMutation({
				engine: sample.engine, fileId: sample.fileId, markerId: sample.markerId,
				prevCodeIds: [], nextCodeIds: sample.codes,
				codeIds: sample.codes, marker: sample.marker,
			});

			const countsAfter = new Map(scIds.map(id => [id, cache.getCount(id)]));
			expect(countsAfter, `engine=${engine} round-trip`).toEqual(countsBefore);
		}
	});

	it('granular invalidation: mutation em código não-dependente NÃO marca SC dirty', () => {
		const scIds = Object.keys(data.smartCodes?.definitions ?? {});
		if (scIds.length === 0) return;

		const cache = buildCache();
		// Warm — tudo computado, dirty=false
		for (const id of scIds) cache.getCount(id);
		for (const id of scIds) expect(cache.isDirty(id)).toBe(false);

		// Mutation com codeId fictício que nenhum SC referencia.
		cache.applyMarkerMutation({
			engine: 'markdown', fileId: '__nonexistent.md', markerId: '__fake__',
			prevCodeIds: ['__fake_code_id__'], nextCodeIds: [],
			codeIds: ['__fake_code_id__'], marker: undefined,
		});

		// Nenhum SC marcado dirty (granular funciona).
		for (const id of scIds) expect(cache.isDirty(id), `sc=${id} should be clean`).toBe(false);
	});
});
