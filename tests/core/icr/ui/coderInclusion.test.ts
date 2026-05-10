import { describe, it, expect } from 'vitest';
import {
	getCodersWithMarkersInScope,
	applyCoderInclusion,
} from '../../../../src/core/icr/ui/coderInclusion';

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
