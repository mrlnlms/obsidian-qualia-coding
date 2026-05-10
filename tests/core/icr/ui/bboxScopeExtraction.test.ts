import { describe, it, expect } from 'vitest';
import { computeBboxKappaForPair, type BboxModels } from '../../../../src/core/icr/ui/bboxScopeExtraction';
import type { PdfShapeMarker } from '../../../../src/pdf/pdfCodingTypes';
import type { ImageMarker } from '../../../../src/image/imageCodingTypes';

function makeShape(opts: { id: string; codedBy: string; codeId: string; x?: number; y?: number; w?: number; h?: number; fileId?: string }): PdfShapeMarker {
	return {
		markerType: 'pdf',
		id: opts.id,
		fileId: opts.fileId ?? 'p.pdf',
		page: 1,
		shape: 'rect',
		coords: { type: 'rect', x: opts.x ?? 0.1, y: opts.y ?? 0.1, w: opts.w ?? 0.2, h: opts.h ?? 0.2 },
		codes: [{ codeId: opts.codeId }],
		codedBy: opts.codedBy,
		createdAt: 0, updatedAt: 0,
	};
}

function makeImage(opts: { id: string; codedBy: string; codeId: string; x?: number; y?: number; w?: number; h?: number; fileId?: string }): ImageMarker {
	return {
		markerType: 'image',
		id: opts.id,
		fileId: opts.fileId ?? 'i.png',
		shape: 'rect',
		coords: { type: 'rect', x: opts.x ?? 0.1, y: opts.y ?? 0.1, w: opts.w ?? 0.2, h: opts.h ?? 0.2 },
		codes: [{ codeId: opts.codeId }],
		codedBy: opts.codedBy,
		createdAt: 0, updatedAt: 0,
	};
}

function makeModels(pdfShapes: PdfShapeMarker[], imgs: ImageMarker[]): BboxModels {
	return {
		pdf: { getAllShapes: () => pdfShapes },
		image: { getAllMarkers: () => imgs },
	};
}

describe('computeBboxKappaForPair', () => {
	it('mode unified: combina pdfShape + image num KappaInput, retorna spatialBbox', () => {
		// 2 shapes concordantes (mesmo bbox) → Cohen κ = 1
		const pdf = [
			makeShape({ id: 's1', codedBy: 'human:a', codeId: 'A' }),
			makeShape({ id: 's2', codedBy: 'human:b', codeId: 'A' }),
		];
		const img = [
			makeImage({ id: 'i1', codedBy: 'human:a', codeId: 'A' }),
			makeImage({ id: 'i2', codedBy: 'human:b', codeId: 'A' }),
		];
		const r = computeBboxKappaForPair({
			models: makeModels(pdf, img),
			scope: { coderIds: ['human:a', 'human:b'] },
			pair: ['human:a', 'human:b'],
			mode: 'unified',
			theta: 0.5,
		});
		expect(r.spatialBbox).toBeDefined();
		expect(r.pdfShape).toBeUndefined();
		expect(r.image).toBeUndefined();
	});

	it('mode split: pdfShape e image isolados', () => {
		const pdf = [
			makeShape({ id: 's1', codedBy: 'human:a', codeId: 'A' }),
			makeShape({ id: 's2', codedBy: 'human:b', codeId: 'A' }),
		];
		const img = [
			makeImage({ id: 'i1', codedBy: 'human:a', codeId: 'A' }),
			makeImage({ id: 'i2', codedBy: 'human:b', codeId: 'A' }),
		];
		const r = computeBboxKappaForPair({
			models: makeModels(pdf, img),
			scope: { coderIds: ['human:a', 'human:b'] },
			pair: ['human:a', 'human:b'],
			mode: 'split',
			theta: 0.5,
		});
		expect(r.spatialBbox).toBeUndefined();
		expect(r.pdfShape).toBeDefined();
		expect(r.image).toBeDefined();
	});

	it('retorna {} quando nenhum lado tem markers', () => {
		const r = computeBboxKappaForPair({
			models: makeModels([], []),
			scope: { coderIds: ['human:a', 'human:b'] },
			pair: ['human:a', 'human:b'],
			mode: 'unified',
			theta: 0.5,
		});
		expect(r).toEqual({});
	});

	it('filtra por scope.codeIds', () => {
		const pdf = [
			makeShape({ id: 's1', codedBy: 'human:a', codeId: 'A' }),
			makeShape({ id: 's2', codedBy: 'human:b', codeId: 'A' }),
			makeShape({ id: 's3', codedBy: 'human:a', codeId: 'B' }),
			makeShape({ id: 's4', codedBy: 'human:b', codeId: 'B' }),
		];
		const r = computeBboxKappaForPair({
			models: makeModels(pdf, []),
			scope: { coderIds: ['human:a', 'human:b'], codeIds: ['A'] },
			pair: ['human:a', 'human:b'],
			mode: 'unified',
			theta: 0.5,
		});
		expect(r.spatialBbox).toBeDefined();
	});

	it('filtra markers de coders fora do par', () => {
		const pdf = [
			makeShape({ id: 's1', codedBy: 'human:a', codeId: 'A' }),
			makeShape({ id: 's2', codedBy: 'human:b', codeId: 'A' }),
			makeShape({ id: 's3', codedBy: 'human:c', codeId: 'A' }),
		];
		// Pair (a,b) deve ignorar marker do c
		const r = computeBboxKappaForPair({
			models: makeModels(pdf, []),
			scope: { coderIds: ['human:a', 'human:b', 'human:c'] },
			pair: ['human:a', 'human:b'],
			mode: 'unified',
			theta: 0.5,
		});
		expect(r.spatialBbox).toBeDefined();
	});

	it('só pdfShape (image vazio) retorna spatialBbox em unified e só pdfShape em split', () => {
		const pdf = [
			makeShape({ id: 's1', codedBy: 'human:a', codeId: 'A' }),
			makeShape({ id: 's2', codedBy: 'human:b', codeId: 'A' }),
		];
		const ru = computeBboxKappaForPair({
			models: makeModels(pdf, []),
			scope: { coderIds: ['human:a', 'human:b'] },
			pair: ['human:a', 'human:b'],
			mode: 'unified',
			theta: 0.5,
		});
		expect(ru.spatialBbox).toBeDefined();

		const rs = computeBboxKappaForPair({
			models: makeModels(pdf, []),
			scope: { coderIds: ['human:a', 'human:b'] },
			pair: ['human:a', 'human:b'],
			mode: 'split',
			theta: 0.5,
		});
		expect(rs.pdfShape).toBeDefined();
		expect(rs.image).toBeUndefined();
	});

	it('models ausentes (sem pdf nem image) retornam {}', () => {
		const r = computeBboxKappaForPair({
			models: {},
			scope: { coderIds: ['human:a', 'human:b'] },
			pair: ['human:a', 'human:b'],
			mode: 'unified',
			theta: 0.5,
		});
		expect(r).toEqual({});
	});
});
