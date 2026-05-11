/**
 * Bridge entre PdfShapeMarker.coords (PercentShapeCoords — rect|ellipse|polygon)
 * e ImageMarker.coords (NormalizedCoords — rect|polygon, sem ellipse apesar do
 * label `shape: RegionShape` aceitar 'ellipse').
 *
 * Adapter respeita coords.type (não o label `shape`) — isola inconsistência
 * preexistente do image engine. Se image engine futuro adicionar EllipseCoords,
 * a função ganha um caminho sem mudar o resto do adapter.
 */

import type { PdfShapeMarker } from '../../pdf/pdfCodingTypes';
import type { ImageMarker } from '../../image/imageCodingTypes';
import type { ShapeType, PercentShapeCoords } from '../shapeTypes';

export interface NormalizedShape {
	shape: ShapeType;
	coords: PercentShapeCoords;
}

export function normalizeShapeCoords(
	marker: PdfShapeMarker | ImageMarker,
): NormalizedShape {
	const c = marker.coords;
	return { shape: c.type, coords: c as PercentShapeCoords };
}

/** AABB normalizado 0–1 (x,y,w,h) de qualquer coord shape. Cobre rect/ellipse/polygon
 *  pra PdfShape; rect/polygon pra Image (NormalizedCoords não tem ellipse mas o type
 *  union do bboxNormalize aceita coords like-PercentShapeCoords). w/h sempre >0 pra
 *  shape válida — caller responsável por validar shapes degenerados antes. */
export function aabbOf(coords: PercentShapeCoords): { x: number; y: number; w: number; h: number } {
	switch (coords.type) {
		case 'rect':
			return { x: coords.x, y: coords.y, w: coords.w, h: coords.h };
		case 'ellipse':
			return { x: coords.cx - coords.rx, y: coords.cy - coords.ry, w: 2 * coords.rx, h: 2 * coords.ry };
		case 'polygon': {
			let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
			for (const p of coords.points) {
				if (p.x < xmin) xmin = p.x;
				if (p.x > xmax) xmax = p.x;
				if (p.y < ymin) ymin = p.y;
				if (p.y > ymax) ymax = p.y;
			}
			return { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin };
		}
	}
}

/** Overlap AABB (true sse os retângulos têm interseção de área positiva). Pré-check rápido
 *  pra rasterização — se AABBs não se tocam, IoU real é zero. */
export function aabbOverlaps(
	a: { x: number; y: number; w: number; h: number },
	b: { x: number; y: number; w: number; h: number },
): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
