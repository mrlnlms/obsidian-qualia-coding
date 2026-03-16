// Re-export shared shape types from core
export type { ShapeType, RectCoords, EllipseCoords, PolygonCoords, NormalizedShapeCoords } from '../core/shapeTypes';

export interface PdfMarker {
	id: string;
	fileId: string;
	page: number;
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
	text: string;
	codes: string[];
	memo?: string;
	colorOverride?: string;
	createdAt: number;
	updatedAt: number;
}

export interface PdfShapeMarker {
	id: string;
	fileId: string;
	page: number;
	shape: import('../core/shapeTypes').ShapeType;
	coords: import('../core/shapeTypes').NormalizedShapeCoords;
	codes: string[];
	memo?: string;
	colorOverride?: string;
	createdAt: number;
	updatedAt: number;
}

export interface PdfCodingData {
	markers: PdfMarker[];
	shapes: PdfShapeMarker[];
	registry: any;
}
