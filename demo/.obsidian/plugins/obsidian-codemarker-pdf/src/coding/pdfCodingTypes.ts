export interface PdfMarker {
	id: string;
	file: string;
	page: number;
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
	text: string;
	codes: string[];
	note?: string;
	createdAt: number;
	updatedAt: number;
}

// ── Shape types (drawn regions) ──

export type ShapeType = 'rect' | 'ellipse' | 'polygon';

export interface RectCoords {
	type: 'rect';
	x: number; y: number; w: number; h: number; // CSS % of page
}

export interface EllipseCoords {
	type: 'ellipse';
	cx: number; cy: number; rx: number; ry: number; // CSS % of page
}

export interface PolygonCoords {
	type: 'polygon';
	points: Array<{ x: number; y: number }>; // CSS % of page
}

export type NormalizedShapeCoords = RectCoords | EllipseCoords | PolygonCoords;

export interface PdfShapeMarker {
	id: string;
	file: string;
	page: number;
	shape: ShapeType;
	coords: NormalizedShapeCoords;
	codes: string[];
	note?: string;
	createdAt: number;
	updatedAt: number;
}

export interface PdfCodingData {
	markers: PdfMarker[];
	shapes: PdfShapeMarker[];
	registry: any;
}
