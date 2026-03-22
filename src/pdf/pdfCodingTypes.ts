// Re-export shared shape types from core
export type { ShapeType, RectCoords, EllipseCoords, PolygonCoords, NormalizedShapeCoords } from '../core/shapeTypes';
import type { CodeApplication } from '../core/types';

export interface PdfMarker {
	id: string;
	fileId: string;
	page: number;
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
	text: string;
	codes: CodeApplication[];
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
	codes: CodeApplication[];
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
