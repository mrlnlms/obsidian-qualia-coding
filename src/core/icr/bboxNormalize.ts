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
