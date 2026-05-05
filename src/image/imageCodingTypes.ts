/**
 * Types for image qualitative coding.
 *
 * All region coordinates are **normalized 0–1** relative to the image's
 * natural width/height. This makes them resolution-independent.
 */

import type { CodeApplication } from '../core/types';
import type { MemoRecord } from '../core/memoTypes';

export type RegionShape = 'rect' | 'ellipse' | 'polygon';

export interface ImageMarker {
	markerType: 'image';
	id: string;
	fileId: string;          // image file path in vault
	shape: RegionShape;
	coords: NormalizedCoords;
	codes: CodeApplication[];
	memo?: MemoRecord;
	colorOverride?: string;
	createdAt: number;
	updatedAt: number;
}

export type NormalizedCoords = NormalizedRect | NormalizedPolygon;

export interface NormalizedRect {
	type: 'rect';
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface NormalizedPolygon {
	type: 'polygon';
	points: Array<{ x: number; y: number }>;
}
