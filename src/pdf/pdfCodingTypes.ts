// Re-export shared shape types from core
export type { ShapeType, RectCoords, EllipseCoords, PolygonCoords, NormalizedShapeCoords } from '../core/shapeTypes';
import type { CodeApplication } from '../core/types';

/**
 * Portable text anchor — survives round-trip across vaults/PDFs as long as the
 * underlying text is present. Runtime (render/drag) and export/import all use
 * this as the single source of truth.
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
	text: string;
	contextBefore: string;
	contextAfter: string;
	occurrenceIndex: number;
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
