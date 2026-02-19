/**
 * Types for image qualitative coding.
 *
 * All region coordinates are **normalized 0–1** relative to the image's
 * natural width/height. This makes them resolution-independent — the same
 * marker data renders correctly regardless of zoom or canvas size.
 */

export type RegionShape = 'rect' | 'ellipse' | 'polygon';

/** A single coded region on an image. */
export interface ImageMarker {
	id: string;
	file: string;            // image file path in vault
	shape: RegionShape;
	/** Normalized coordinates [0..1] relative to image natural dimensions */
	coords: NormalizedCoords;
	codes: string[];         // code names applied to this region
	createdAt: number;
	updatedAt: number;
}

/** Rect/Ellipse: bounding box. Polygon: array of points. */
export type NormalizedCoords = NormalizedRect | NormalizedPolygon;

export interface NormalizedRect {
	type: 'rect';
	x: number;      // left   (0..1)
	y: number;      // top    (0..1)
	w: number;      // width  (0..1)
	h: number;      // height (0..1)
}

export interface NormalizedPolygon {
	type: 'polygon';
	points: Array<{ x: number; y: number }>;  // each 0..1
}

/** Persisted in data.json */
export interface ImageCodingData {
	markers: ImageMarker[];
	registry: {
		definitions: Record<string, import('./codeDefinitionRegistry').CodeDefinition>;
		nextPaletteIndex: number;
	};
}
