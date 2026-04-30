// Re-export shared shape types from core
export type { ShapeType, RectCoords, EllipseCoords, PolygonCoords, PercentShapeCoords } from '../core/shapeTypes';
import type { CodeApplication } from '../core/types';
import type { MemoRecord } from '../core/memoTypes';

/**
 * Portable text anchor — used only by the QDPX export/import pipeline to
 * locate text in the consolidated PlainText. NOT persisted on markers; markers
 * use DOM-aligned indices as before.
 */
export interface PdfAnchor {
	text: string;
	contextBefore: string;
	contextAfter: string;
	occurrenceIndex: number;
}

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
	memo?: MemoRecord;
	colorOverride?: string;
	createdAt: number;
	updatedAt: number;
}

export interface PdfShapeMarker {
	id: string;
	fileId: string;
	page: number;
	shape: import('../core/shapeTypes').ShapeType;
	coords: import('../core/shapeTypes').PercentShapeCoords;
	codes: CodeApplication[];
	memo?: MemoRecord;
	colorOverride?: string;
	createdAt: number;
	updatedAt: number;
}

export interface PdfCodingData {
	markers: PdfMarker[];
	shapes: PdfShapeMarker[];
	registry: any;
}
