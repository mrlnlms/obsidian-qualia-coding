/**
 * bboxAdapter — entry point pra ICR sobre PDF shape + Image bbox 2D.
 *
 * Per-pair (2 coders por chamada). Multi-coder N>2 reportado como matriz
 * triangular C(N,2) — caller invoca este adapter C(N,2) vezes.
 *
 * **Engine separation pro reporter:** este adapter aceita PdfShape + Image
 * juntos no mesmo KappaInput. Caller que quiser separar `engine: 'pdfShape'`
 * vs `engine: 'image'` no reporter chama o adapter 2x:
 *   - 1x com `pdfShapeMarkers: [...], imageMarkers: []` → label `'pdfShape'`
 *   - 1x com `pdfShapeMarkers: [], imageMarkers: [...]` → label `'image'`
 * Caller que quiser tratar como 1 família spatial-bbox unificada chama 1x
 * com ambos preenchidos e label próprio.
 *
 * Pipeline:
 * 1. Validate coders (2 distinct).
 * 2. Group markers por scope (`fileId:page:N` PDF, `fileId:` image).
 * 3. Per scope: split por coder, normalize, rasterize, IoU matrix, match, fromEvents.
 *    Pre-handla casos assimétricos (0×N e N×0) antes de chamar match().
 * 4. Concat units; build KappaInput.
 */

import type { PdfShapeMarker } from '../../pdf/pdfCodingTypes';
import type { ImageMarker } from '../../image/imageCodingTypes';
import type { CoderId } from './coderTypes';
import type { KappaInput, CodedMarker, SourceMeta } from './kappaInput';
import { normalizeShapeCoords } from './bboxNormalize';
import { rasterize } from './bboxRaster';
import { iou } from './bboxIoU';
import { match, type AlignmentEvent } from './bboxMatcher';
import { fromEvents } from './bboxKappaInput';

type AnyBboxMarker = PdfShapeMarker | ImageMarker;

export interface BboxAdapterInput {
	pdfShapeMarkers: PdfShapeMarker[];
	imageMarkers: ImageMarker[];
	coders: { a: CoderId; b: CoderId };
	theta: number;
	gridSize?: number;
}

export function buildKappaInput(input: BboxAdapterInput): KappaInput {
	const { pdfShapeMarkers, imageMarkers, coders, theta } = input;
	const baseGridSize = input.gridSize ?? 200;

	if (!coders.a || !coders.b) {
		throw new Error('Bbox κ requires both coders to be provided');
	}
	if (coders.a === coders.b) {
		throw new Error('Bbox κ requires 2 distinct coders');
	}

	const allMarkers: AnyBboxMarker[] = [...pdfShapeMarkers, ...imageMarkers];
	const byScope = new Map<string, AnyBboxMarker[]>();
	for (const m of allMarkers) {
		const scope = scopeOf(m);
		let bucket = byScope.get(scope);
		if (!bucket) { bucket = []; byScope.set(scope, bucket); }
		bucket.push(m);
	}

	const allUnits: CodedMarker[] = [];
	const sources: SourceMeta[] = [];

	for (const [scope, markers] of byScope) {
		const aMarkers = markers.filter(m => m.codedBy === coders.a);
		const bMarkers = markers.filter(m => m.codedBy === coders.b);
		if (aMarkers.length === 0 && bMarkers.length === 0) continue;

		const gridSize = detectAdaptiveGridSize(markers, baseGridSize);

		const aBitmaps = aMarkers.map(m => {
			const norm = normalizeShapeCoords(m);
			return rasterize(norm.shape, norm.coords, gridSize);
		});
		const bBitmaps = bMarkers.map(m => {
			const norm = normalizeShapeCoords(m);
			return rasterize(norm.shape, norm.coords, gridSize);
		});

		// Match — pre-handla casos assimétricos (match() não infere M quando N=0)
		let events: AlignmentEvent[];
		if (aBitmaps.length === 0 && bBitmaps.length === 0) {
			continue;
		} else if (aBitmaps.length === 0) {
			events = bMarkers.map((_, j) => ({ kind: 'unmatched_b' as const, bIndex: j }));
		} else if (bBitmaps.length === 0) {
			events = aMarkers.map((_, i) => ({ kind: 'unmatched_a' as const, aIndex: i }));
		} else {
			const matrix = aBitmaps.map(ab => bBitmaps.map(bb => iou(ab, bb)));
			events = match(matrix, theta);
		}

		const aRefs = aMarkers.map(m => ({ id: m.id, codeIds: m.codes.map(c => c.codeId) }));
		const bRefs = bMarkers.map(m => ({ id: m.id, codeIds: m.codes.map(c => c.codeId) }));

		const scopeMarkers = fromEvents(events, scope, coders, aRefs, bRefs);
		allUnits.push(...scopeMarkers);
		sources.push({
			fileId: scope,
			locator: `bbox:${scope}`,
			totalUnits: events.length,
		});
	}

	return {
		markers: allUnits,
		sources,
		coders: [coders.a, coders.b],
	};
}

function scopeOf(m: AnyBboxMarker): string {
	if (m.markerType === 'pdf') {
		return `${m.fileId}:page:${(m as PdfShapeMarker).page}`;
	}
	return `${m.fileId}:`;
}

function detectAdaptiveGridSize(markers: AnyBboxMarker[], base: number): number {
	for (const m of markers) {
		const c = m.coords;
		if (c.type === 'rect') {
			const area = c.w * c.h;
			if (area < 0.0001 || Math.min(c.w, c.h) < 2 / base) return 400;
		} else if (c.type === 'ellipse') {
			const area = Math.PI * c.rx * c.ry;
			if (area < 0.0001 || Math.min(c.rx, c.ry) < 1 / base) return 400;
		} else if (c.type === 'polygon') {
			let xmin = 1, ymin = 1, xmax = 0, ymax = 0;
			for (const p of c.points) {
				if (p.x < xmin) xmin = p.x;
				if (p.x > xmax) xmax = p.x;
				if (p.y < ymin) ymin = p.y;
				if (p.y > ymax) ymax = p.y;
			}
			const w = xmax - xmin, h = ymax - ymin;
			if (w * h < 0.0001 || Math.min(w, h) < 2 / base) return 400;
		}
	}
	return base;
}
