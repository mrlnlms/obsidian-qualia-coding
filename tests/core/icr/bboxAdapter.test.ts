import { describe, it, expect } from 'vitest';
import { buildKappaInput } from '../../../src/core/icr/bboxAdapter';
import { cohenKappa } from '../../../src/core/icr/coefficients/cohenKappa';
import type { PdfShapeMarker } from '../../../src/pdf/pdfCodingTypes';
import type { ImageMarker } from '../../../src/image/imageCodingTypes';

const mkPdfShape = (overrides: Partial<PdfShapeMarker> = {}): PdfShapeMarker => ({
	markerType: 'pdf', id: 's', fileId: 'a.pdf', page: 1,
	shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 },
	codes: [], createdAt: 1, updatedAt: 1, ...overrides,
});

describe('bboxAdapter.buildKappaInput', () => {
	it('throws when coders are identical', () => {
		expect(() => buildKappaInput({
			pdfShapeMarkers: [], imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:x' },
			theta: 0.5,
		})).toThrow(/distinct coders/);
	});

	it('throws when coder is missing', () => {
		expect(() => buildKappaInput({
			pdfShapeMarkers: [], imageMarkers: [],
			coders: { a: 'coder:x', b: '' as any },
			theta: 0.5,
		})).toThrow(/both coders/);
	});

	it('returns empty KappaInput when no markers (empty input, valid coders)', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [], imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.markers).toEqual([]);
		expect(result.sources).toEqual([]);
		expect(result.coders).toEqual(['coder:x', 'coder:y']);
	});

	it('handles 1 page, 1 matched bbox, identical → matched event', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'a0', codedBy: 'coder:x', codes: [{ codeId: 'c1' }] }),
				mkPdfShape({ id: 'b0', codedBy: 'coder:y', codes: [{ codeId: 'c1' }] }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.markers).toHaveLength(2);
		expect(result.sources).toHaveLength(1);
		expect(result.sources[0]!.totalUnits).toBe(1);
	});

	it('handles 1 page, disjoint bboxes → 2 unmatched events', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'a0', codedBy: 'coder:x', codes: [{ codeId: 'c1' }],
					coords: { type: 'rect', x: 0, y: 0, w: 0.3, h: 0.3 } }),
				mkPdfShape({ id: 'b0', codedBy: 'coder:y', codes: [{ codeId: 'c1' }],
					coords: { type: 'rect', x: 0.7, y: 0.7, w: 0.3, h: 0.3 } }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.markers).toHaveLength(2);
		expect(result.sources[0]!.totalUnits).toBe(2);
	});

	it('groups markers by scope (page)', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'a0', page: 1, codedBy: 'coder:x', codes: [{ codeId: 'c1' }] }),
				mkPdfShape({ id: 'a1', page: 2, codedBy: 'coder:x', codes: [{ codeId: 'c1' }] }),
				mkPdfShape({ id: 'b0', page: 1, codedBy: 'coder:y', codes: [{ codeId: 'c1' }] }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.markers).toHaveLength(3);
		expect(result.sources).toHaveLength(2);
	});

	it('handles ImageMarker with fileId-only scope (no page)', () => {
		const im: ImageMarker = {
			markerType: 'image', id: 'i0', fileId: 'pic.png',
			shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 },
			codes: [{ codeId: 'c1' }], codedBy: 'coder:x',
			createdAt: 1, updatedAt: 1,
		};
		const result = buildKappaInput({
			pdfShapeMarkers: [],
			imageMarkers: [im],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.sources).toHaveLength(1);
		expect(result.sources[0]!.locator).toBe('bbox:pic.png:');
	});
});

describe('bboxAdapter — integration scenarios', () => {
	it('cenário 1 — concordância total: 5 bboxes idênticas, mesmos códigos → κ=1', () => {
		const make = (id: string, coder: string, x: number) => mkPdfShape({
			id, codedBy: coder as any, codes: [{ codeId: 'c1' }],
			coords: { type: 'rect', x, y: 0.1, w: 0.1, h: 0.1 },
		});
		const result = buildKappaInput({
			pdfShapeMarkers: [
				make('a0', 'coder:x', 0.1), make('a1', 'coder:x', 0.3), make('a2', 'coder:x', 0.5), make('a3', 'coder:x', 0.7), make('a4', 'coder:x', 0.9),
				make('b0', 'coder:y', 0.1), make('b1', 'coder:y', 0.3), make('b2', 'coder:y', 0.5), make('b3', 'coder:y', 0.7), make('b4', 'coder:y', 0.9),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		const k = cohenKappa(result, 'coder:x', 'coder:y');
		expect(k).toBeCloseTo(1, 5);
	});

	it('cenário 2 — discordância total: bboxes disjuntas → κ ≈ 0', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'a0', codedBy: 'coder:x' as any, codes: [{ codeId: 'c1' }],
					coords: { type: 'rect', x: 0, y: 0, w: 0.2, h: 0.2 } }),
				mkPdfShape({ id: 'b0', codedBy: 'coder:y' as any, codes: [{ codeId: 'c1' }],
					coords: { type: 'rect', x: 0.7, y: 0.7, w: 0.2, h: 0.2 } }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		const k = cohenKappa(result, 'coder:x', 'coder:y');
		expect(k).toBeLessThan(0.1);
	});

	it('cenário 3 — match espacial mas códigos diferentes → κ baixo', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'a0', codedBy: 'coder:x' as any, codes: [{ codeId: 'aaa' }],
					coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }),
				mkPdfShape({ id: 'b0', codedBy: 'coder:y' as any, codes: [{ codeId: 'zzz' }],
					coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		const k = cohenKappa(result, 'coder:x', 'coder:y');
		expect(k).toBeLessThan(0.1);
	});

	it('cenário 4 — scope mismatch: A page 1, B page 2 → κ baixo (2 unmatched)', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'a0', page: 1, codedBy: 'coder:x' as any, codes: [{ codeId: 'c1' }] }),
				mkPdfShape({ id: 'b0', page: 2, codedBy: 'coder:y' as any, codes: [{ codeId: 'c1' }] }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.sources).toHaveLength(2);
		const k = cohenKappa(result, 'coder:x', 'coder:y');
		expect(k).toBeLessThan(0.1);
	});

	it('cenário 5 — multi-shape: rect, ellipse, polygon do mesmo coder', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'a0', codedBy: 'coder:x' as any, codes: [{ codeId: 'c1' }],
					shape: 'rect', coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }),
				mkPdfShape({ id: 'a1', codedBy: 'coder:x' as any, codes: [{ codeId: 'c1' }],
					shape: 'ellipse', coords: { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 } }),
				mkPdfShape({ id: 'a2', codedBy: 'coder:x' as any, codes: [{ codeId: 'c1' }],
					shape: 'polygon', coords: { type: 'polygon', points: [{ x: 0.7, y: 0.7 }, { x: 0.9, y: 0.7 }, { x: 0.8, y: 0.9 }] } }),
				mkPdfShape({ id: 'b0', codedBy: 'coder:y' as any, codes: [{ codeId: 'c1' }],
					shape: 'rect', coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }),
				mkPdfShape({ id: 'b1', codedBy: 'coder:y' as any, codes: [{ codeId: 'c1' }],
					shape: 'ellipse', coords: { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 } }),
				mkPdfShape({ id: 'b2', codedBy: 'coder:y' as any, codes: [{ codeId: 'c1' }],
					shape: 'polygon', coords: { type: 'polygon', points: [{ x: 0.7, y: 0.7 }, { x: 0.9, y: 0.7 }, { x: 0.8, y: 0.9 }] } }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		const k = cohenKappa(result, 'coder:x', 'coder:y');
		expect(k).toBeCloseTo(1, 0);
	});

	it('cenário 6a — scope só do coder A (B vazio): todos viram unmatched_a', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'a0', codedBy: 'coder:x' as any, codes: [{ codeId: 'c1' }] }),
				mkPdfShape({ id: 'a1', codedBy: 'coder:x' as any, codes: [{ codeId: 'c2' }],
					coords: { type: 'rect', x: 0.5, y: 0, w: 0.3, h: 0.3 } }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.markers).toHaveLength(2);
		expect(result.sources[0]!.totalUnits).toBe(2);
	});

	it('cenário 6b — scope só do coder B (A vazio): todos viram unmatched_b', () => {
		const result = buildKappaInput({
			pdfShapeMarkers: [
				mkPdfShape({ id: 'b0', codedBy: 'coder:y' as any, codes: [{ codeId: 'c1' }] }),
				mkPdfShape({ id: 'b1', codedBy: 'coder:y' as any, codes: [{ codeId: 'c2' }],
					coords: { type: 'rect', x: 0.5, y: 0, w: 0.3, h: 0.3 } }),
			],
			imageMarkers: [],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.markers).toHaveLength(2);
		expect(result.sources[0]!.totalUnits).toBe(2);
	});

	it('cenário 7 — image marker com fileId-only scope', () => {
		const im = (id: string, coder: string): ImageMarker => ({
			markerType: 'image', id, fileId: 'pic.png',
			shape: 'rect', coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
			codes: [{ codeId: 'c1' }], codedBy: coder as any,
			createdAt: 1, updatedAt: 1,
		});
		const result = buildKappaInput({
			pdfShapeMarkers: [],
			imageMarkers: [im('a0', 'coder:x'), im('b0', 'coder:y')],
			coders: { a: 'coder:x', b: 'coder:y' },
			theta: 0.5,
		});
		expect(result.sources[0]!.locator).toMatch(/bbox:pic\.png:/);
		const k = cohenKappa(result, 'coder:x', 'coder:y');
		expect(k).toBeCloseTo(1, 5);
	});
});
