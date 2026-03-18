/**
 * Shared shape types and interfaces used by both PDF and Image engines.
 * Extracted from pdf/pdfCodingTypes.ts to avoid duplication.
 */

export type ShapeType = 'rect' | 'ellipse' | 'polygon';
export type DrawMode = 'select' | 'rect' | 'ellipse' | 'polygon' | 'freeform';

// ── Normalized coordinates ──

export interface RectCoords {
	type: 'rect';
	x: number; y: number; w: number; h: number;
}

export interface EllipseCoords {
	type: 'ellipse';
	cx: number; cy: number; rx: number; ry: number;
}

export interface PolygonCoords {
	type: 'polygon';
	points: Array<{ x: number; y: number }>;
}

export type NormalizedShapeCoords = RectCoords | EllipseCoords | PolygonCoords;

// ── Callbacks ──

export interface DrawingCallbacks {
	onShapeCreated?(coords: NormalizedShapeCoords): void;
	onShapeSelected?(shapeId: string | null): void;
	onShapeMoved?(shapeId: string, coords: NormalizedShapeCoords): void;
	onShapeDeleted?(shapeId: string): void;
}

// ── Toolbar button specs ──

export interface DrawToolButtonSpec {
	mode: DrawMode;
	icon: string;
	tooltip: string;
	shortcut: string;
}

export const DRAW_TOOL_BUTTONS: DrawToolButtonSpec[] = [
	{ mode: 'select', icon: 'mouse-pointer', tooltip: 'Select', shortcut: 'V' },
	{ mode: 'rect', icon: 'square', tooltip: 'Rectangle', shortcut: 'R' },
	{ mode: 'ellipse', icon: 'circle', tooltip: 'Ellipse', shortcut: 'E' },
	{ mode: 'polygon', icon: 'pentagon', tooltip: 'Polygon', shortcut: 'P' },
	{ mode: 'freeform', icon: 'pencil', tooltip: 'Freeform', shortcut: 'F' },
];
