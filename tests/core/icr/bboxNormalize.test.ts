import { describe, it, expect } from 'vitest';
import { normalizeShapeCoords } from '../../../src/core/icr/bboxNormalize';
import type { PdfShapeMarker } from '../../../src/pdf/pdfCodingTypes';
import type { ImageMarker } from '../../../src/image/imageCodingTypes';

describe('normalizeShapeCoords', () => {
	it('passes PdfShapeMarker rect coords through unchanged', () => {
		const m: PdfShapeMarker = {
			markerType: 'pdf', id: 's1', fileId: 'a.pdf', page: 1,
			shape: 'rect',
			coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
			codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = normalizeShapeCoords(m);
		expect(r.shape).toBe('rect');
		expect(r.coords).toEqual({ type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
	});

	it('passes PdfShapeMarker ellipse coords through', () => {
		const m: PdfShapeMarker = {
			markerType: 'pdf', id: 's2', fileId: 'a.pdf', page: 1,
			shape: 'ellipse',
			coords: { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.3 },
			codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = normalizeShapeCoords(m);
		expect(r.shape).toBe('ellipse');
		expect(r.coords.type).toBe('ellipse');
	});

	it('passes ImageMarker rect coords through', () => {
		const m: ImageMarker = {
			markerType: 'image', id: 'i1', fileId: 'a.png',
			shape: 'rect',
			coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
			codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = normalizeShapeCoords(m);
		expect(r.shape).toBe('rect');
		expect(r.coords.type).toBe('rect');
	});

	it('respects ImageMarker actual coord type when shape label says ellipse but coords are rect (preexistent inconsistency)', () => {
		const m: ImageMarker = {
			markerType: 'image', id: 'i2', fileId: 'a.png',
			shape: 'ellipse',
			coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
			codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = normalizeShapeCoords(m);
		expect(r.shape).toBe('rect');
		expect(r.coords.type).toBe('rect');
	});

	it('passes ImageMarker polygon coords through', () => {
		const m: ImageMarker = {
			markerType: 'image', id: 'i3', fileId: 'a.png',
			shape: 'polygon',
			coords: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] },
			codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = normalizeShapeCoords(m);
		expect(r.shape).toBe('polygon');
		expect(r.coords.type).toBe('polygon');
		if (r.coords.type === 'polygon') expect(r.coords.points.length).toBe(3);
	});
});
