import { describe, it, expect, beforeEach } from 'vitest';
import {
	getCodersWithMarkersInScope,
	applyCoderInclusion,
	applyConsensusExclusion,
	getConsensusCoderIdsInScope,
	bumpCoderInclusionCacheGeneration,
} from '../../../../src/core/icr/ui/coderInclusion';

// Cache module-level — invalida antes de cada test pra evitar cross-contamination.
beforeEach(() => bumpCoderInclusionCacheGeneration());

function makeMd(opts: { id: string; coderId: string; codeId: string; fileId?: string }): any {
	return {
		markerType: 'markdown', id: opts.id, fileId: opts.fileId ?? 'f.md',
		range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
		color: '#888', codes: [{ codeId: opts.codeId }],
		codedBy: opts.coderId, createdAt: 0, updatedAt: 0,
	};
}

function makeShape(opts: { id: string; coderId: string; codeId: string }): any {
	return {
		markerType: 'pdf', id: opts.id, fileId: 'f.pdf', page: 1, shape: 'rect',
		coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
		codes: [{ codeId: opts.codeId }], codedBy: opts.coderId, createdAt: 0, updatedAt: 0,
	};
}

function modelsWith(opts: { mds?: any[]; shapes?: any[]; imgs?: any[] }): any {
	return {
		markdown: { getAllMarkers: () => opts.mds ?? [] },
		pdf: { getAllMarkers: () => [], getAllShapes: () => opts.shapes ?? [] },
		csv: { getAllMarkers: () => [] },
		audio: { getAllMarkers: () => [] }, video: { getAllMarkers: () => [] },
		image: { getAllMarkers: () => opts.imgs ?? [] },
	};
}

describe('getCodersWithMarkersInScope', () => {
	it('retorna só coders que têm pelo menos 1 marker (text-likes)', () => {
		const result = getCodersWithMarkersInScope(
			{ coderIds: ['human:a', 'human:b', 'human:default'] },
			modelsWith({ mds: [makeMd({ id: 'm1', coderId: 'human:a', codeId: 'X' })] }),
		);
		expect(result).toEqual(['human:a']);
	});

	it('detecta markers em pdf shapes (bbox)', () => {
		const result = getCodersWithMarkersInScope(
			{ coderIds: ['human:a', 'human:b', 'human:default'] },
			modelsWith({ shapes: [makeShape({ id: 's1', coderId: 'human:b', codeId: 'X' })] }),
		);
		expect(result).toEqual(['human:b']);
	});

	it('preserva ordem original do scope.coderIds', () => {
		const result = getCodersWithMarkersInScope(
			{ coderIds: ['human:b', 'human:a'] },
			modelsWith({
				mds: [
					makeMd({ id: 'm1', coderId: 'human:a', codeId: 'X' }),
					makeMd({ id: 'm2', coderId: 'human:b', codeId: 'X' }),
				],
			}),
		);
		expect(result).toEqual(['human:b', 'human:a']);
	});

	it('respeita scope.codeIds', () => {
		const result = getCodersWithMarkersInScope(
			{ coderIds: ['human:a', 'human:b'], codeIds: ['X'] },
			modelsWith({
				mds: [
					makeMd({ id: 'm1', coderId: 'human:a', codeId: 'X' }),
					makeMd({ id: 'm2', coderId: 'human:b', codeId: 'Y' }),
				],
			}),
		);
		expect(result).toEqual(['human:a']);
	});

	it('respeita scope.fileIds', () => {
		const result = getCodersWithMarkersInScope(
			{ coderIds: ['human:a', 'human:b'], fileIds: ['target.md'] },
			modelsWith({
				mds: [
					makeMd({ id: 'm1', coderId: 'human:a', codeId: 'X', fileId: 'target.md' }),
					makeMd({ id: 'm2', coderId: 'human:b', codeId: 'X', fileId: 'other.md' }),
				],
			}),
		);
		expect(result).toEqual(['human:a']);
	});

	it('coder fora do scope.coderIds nunca entra', () => {
		const result = getCodersWithMarkersInScope(
			{ coderIds: ['human:a'] },
			modelsWith({
				mds: [
					makeMd({ id: 'm1', coderId: 'human:a', codeId: 'X' }),
					makeMd({ id: 'm2', coderId: 'human:other', codeId: 'X' }),
				],
			}),
		);
		expect(result).toEqual(['human:a']);
	});
});

describe('applyCoderInclusion', () => {
	const scope = { coderIds: ['human:a', 'human:b', 'human:default'] };
	const models = modelsWith({
		mds: [
			makeMd({ id: 'm1', coderId: 'human:a', codeId: 'X' }),
			makeMd({ id: 'm2', coderId: 'human:b', codeId: 'X' }),
		],
	});

	it('includeWithoutMarkers=true retorna scope intacto', () => {
		const r = applyCoderInclusion(scope, models, true);
		expect(r.coderIds).toEqual(scope.coderIds);
	});

	it('includeWithoutMarkers=false filtra coders sem markers', () => {
		const r = applyCoderInclusion(scope, models, false);
		expect(r.coderIds).toEqual(['human:a', 'human:b']);
	});

	it('preserva outras propriedades do scope', () => {
		const r = applyCoderInclusion(
			{ ...scope, codeIds: ['X'], fileIds: ['f.md'] },
			models,
			false,
		);
		expect(r.codeIds).toEqual(['X']);
		expect(r.fileIds).toEqual(['f.md']);
	});
});

// ─── E3b: applyConsensusExclusion + getConsensusCoderIdsInScope ────────────

function fakeCoderRegistry(coders: { id: string; type: 'human' | 'consensus' | 'llm' | 'group' }[]) {
	return {
		getById: (id: string) => coders.find(c => c.id === id),
	} as any;
}

describe('applyConsensusExclusion', () => {
	const registry = fakeCoderRegistry([
		{ id: 'human:a', type: 'human' },
		{ id: 'human:b', type: 'human' },
		{ id: 'consensus:default', type: 'consensus' },
	]);

	it('exclude=true filtra coders consensus', () => {
		const r = applyConsensusExclusion(
			{ coderIds: ['human:a', 'human:b', 'consensus:default'] },
			registry,
			true,
		);
		expect(r.coderIds).toEqual(['human:a', 'human:b']);
	});

	it('exclude=false retorna scope intacto', () => {
		const scope = { coderIds: ['human:a', 'human:b', 'consensus:default'] };
		const r = applyConsensusExclusion(scope, registry, false);
		expect(r.coderIds).toEqual(scope.coderIds);
	});

	it('lida com scope sem consensus', () => {
		const r = applyConsensusExclusion(
			{ coderIds: ['human:a', 'human:b'] },
			registry,
			true,
		);
		expect(r.coderIds).toEqual(['human:a', 'human:b']);
	});

	it('preserva outras propriedades do scope', () => {
		const r = applyConsensusExclusion(
			{ coderIds: ['human:a', 'consensus:default'], codeIds: ['X'], fileIds: ['f.md'] },
			registry,
			true,
		);
		expect(r.codeIds).toEqual(['X']);
		expect(r.fileIds).toEqual(['f.md']);
	});

	it('múltiplos consensus coders todos são removidos', () => {
		const reg = fakeCoderRegistry([
			{ id: 'human:a', type: 'human' },
			{ id: 'consensus:default', type: 'consensus' },
			{ id: 'consensus:wave-1', type: 'consensus' },
		]);
		const r = applyConsensusExclusion(
			{ coderIds: ['human:a', 'consensus:default', 'consensus:wave-1'] },
			reg,
			true,
		);
		expect(r.coderIds).toEqual(['human:a']);
	});

	it('coder ausente do registry NÃO é tratado como consensus', () => {
		const r = applyConsensusExclusion(
			{ coderIds: ['human:a', 'unknown:x', 'consensus:default'] },
			registry,
			true,
		);
		expect(r.coderIds).toEqual(['human:a', 'unknown:x']);
	});
});

describe('getConsensusCoderIdsInScope', () => {
	const registry = fakeCoderRegistry([
		{ id: 'human:a', type: 'human' },
		{ id: 'consensus:default', type: 'consensus' },
		{ id: 'consensus:wave-1', type: 'consensus' },
	]);

	it('retorna só os consensus do scope', () => {
		const ids = getConsensusCoderIdsInScope(
			{ coderIds: ['human:a', 'consensus:default', 'consensus:wave-1'] },
			registry,
		);
		expect(ids).toEqual(['consensus:default', 'consensus:wave-1']);
	});

	it('retorna [] quando scope só tem humanos', () => {
		const ids = getConsensusCoderIdsInScope({ coderIds: ['human:a'] }, registry);
		expect(ids).toEqual([]);
	});

	it('preserva ordem do scope', () => {
		const ids = getConsensusCoderIdsInScope(
			{ coderIds: ['consensus:wave-1', 'human:a', 'consensus:default'] },
			registry,
		);
		expect(ids).toEqual(['consensus:wave-1', 'consensus:default']);
	});
});
