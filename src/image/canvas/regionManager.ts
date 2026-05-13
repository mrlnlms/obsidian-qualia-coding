/**
 * RegionManager — bridge between Fabric.js canvas objects and ImageCodingModel.
 *
 * Responsibilities:
 * - Convert Fabric shape → normalized coords (0..1) → model.createMarker()
 * - Restore persisted markers → Fabric shapes on canvas
 * - Track shape ↔ markerId mapping
 * - Sync shape position/size changes back to model
 */

import { Rect, Ellipse, Polygon, Point, FabricObject, Canvas } from 'fabric';
import type { ImageCodingModel } from '../imageCodingModel';
import type { ImageMarker, NormalizedRect, NormalizedPolygon, NormalizedCoords } from '../imageCodingTypes';
import type { FabricCanvasState } from './fabricCanvas';
import { getCodeIds } from '../../core/codeApplicationHelpers';

/** Marker color when no codes assigned */
const DEFAULT_FILL = 'rgba(59, 130, 246, 0.2)';
const DEFAULT_STROKE = 'rgba(59, 130, 246, 0.8)';
const STROKE_WIDTH = 2;

/**
 * Apply a Fabric 2x3 transform matrix `[a, b, c, d, tx, ty]` to a point.
 * The matrix encodes scale/rotate/skew/translate from the shape's local frame to world.
 */
function applyMatrix(x: number, y: number, m: number[]): { x: number; y: number } {
	return {
		x: m[0]! * x + m[2]! * y + m[4]!,
		y: m[1]! * x + m[3]! * y + m[5]!,
	};
}

/**
 * Recover absolute (world) coords for the points stored on a Fabric Polygon.
 *
 * Fabric Polyline._render draws each point as `(p.x - pathOffset.x, p.y - pathOffset.y)`,
 * meaning `points` live in a local frame whose origin is the bbox center.
 * `calcTransformMatrix()` then maps that local frame to world. Skipping the
 * pathOffset subtraction double-offsets every saved point by the bbox-center
 * vector — visible as a polygon shifted into the bottom-right of the image after
 * close+reopen (bug fixed 2026-05-06).
 */
export function polygonPointsToWorld(
	points: Array<{ x: number; y: number }>,
	pathOffset: { x: number; y: number },
	matrix: number[],
): Array<{ x: number; y: number }> {
	return points.map((p) => applyMatrix(p.x - pathOffset.x, p.y - pathOffset.y, matrix));
}

export class RegionManager {
	private shapeToMarker: Map<FabricObject, string> = new Map(); // shape → markerId
	private markerToShape: Map<string, FabricObject> = new Map(); // markerId → shape
	private fabricState: FabricCanvasState;
	private model: ImageCodingModel;

	constructor(fabricState: FabricCanvasState, model: ImageCodingModel) {
		this.fabricState = fabricState;
		this.model = model;
	}

	get canvas(): Canvas {
		return this.fabricState.canvas;
	}

	get imageWidth(): number {
		return this.fabricState.imageWidth;
	}

	get imageHeight(): number {
		return this.fabricState.imageHeight;
	}

	// ─── Normalize / Denormalize ───

	private normalizeRect(left: number, top: number, w: number, h: number): NormalizedRect {
		return {
			type: 'rect',
			x: left / this.imageWidth,
			y: top / this.imageHeight,
			w: w / this.imageWidth,
			h: h / this.imageHeight,
		};
	}

	private denormalizeRect(c: NormalizedRect): { left: number; top: number; width: number; height: number } {
		return {
			left: c.x * this.imageWidth,
			top: c.y * this.imageHeight,
			width: c.w * this.imageWidth,
			height: c.h * this.imageHeight,
		};
	}

	private normalizePolygon(points: Array<{ x: number; y: number }>): NormalizedPolygon {
		return {
			type: 'polygon',
			points: points.map((p) => ({
				x: p.x / this.imageWidth,
				y: p.y / this.imageHeight,
			})),
		};
	}

	private denormalizePolygon(c: NormalizedPolygon): Array<{ x: number; y: number }> {
		return c.points.map((p) => ({
			x: p.x * this.imageWidth,
			y: p.y * this.imageHeight,
		}));
	}

	// ─── Style ───

	private getStyleForMarker(marker: ImageMarker): { fill: string; stroke: string } {
		// Per-marker override bypasses per-code blending — single color wins.
		// Otherwise blend only over codes currently visible in this file
		// (so toggling a code off via the eye icon recolors the shape).
		let color: string | null | undefined = marker.colorOverride;
		if (!color) {
			const visibleIds = getCodeIds(marker.codes).filter(
				codeId => this.model.registry.isCodeVisibleInFile(codeId, marker.fileId),
			);
			color = this.model.registry.getColorForCodeIds(visibleIds);
		}
		if (color) {
			return {
				fill: color + '33', // ~20% opacity
				stroke: color + 'CC', // ~80% opacity
			};
		}
		return { fill: DEFAULT_FILL, stroke: DEFAULT_STROKE };
	}

	private applyStyle(shape: FabricObject, marker: ImageMarker): void {
		const { fill, stroke } = this.getStyleForMarker(marker);
		shape.set({ fill, stroke });
	}

	// ─── Register a drawn shape into the model ───

	registerShape(shape: FabricObject, fileId: string): ImageMarker | null {
		const coords = this.shapeToNormalizedCoords(shape);
		if (!coords) return null;

		const shapeType = coords.type === 'rect'
			? (shape instanceof Ellipse ? 'ellipse' : 'rect')
			: 'polygon';

		const marker = this.model.createMarker(fileId, shapeType, coords);

		this.shapeToMarker.set(shape, marker.id);
		this.markerToShape.set(marker.id, shape);

		// Apply default style
		this.applyStyle(shape, marker);
		this.canvas.requestRenderAll();

		return marker;
	}

	/** Convert a Fabric shape to normalized coords */
	private shapeToNormalizedCoords(shape: FabricObject): NormalizedCoords | null {
		if (shape instanceof Polygon && !(shape instanceof Rect)) {
			const points = (shape as Polygon).points as Array<{ x: number; y: number }>;
			if (!points || points.length < 3) return null;

			const matrix = shape.calcTransformMatrix();
			// `pathOffset` é exposto via `declare` em Polyline (parent de Polygon) e não
			// surge no tipo público do Polygon. Cast manual com shape mínima necessária.
			const pathOffset = (shape as Polygon & { pathOffset: { x: number; y: number } }).pathOffset;
			return this.normalizePolygon(polygonPointsToWorld(points, pathOffset, matrix));
		}

		// Rect or Ellipse — use bounding box
		const left = shape.left ?? 0;
		const top = shape.top ?? 0;
		const w = (shape.width ?? 0) * (shape.scaleX ?? 1);
		const h = (shape.height ?? 0) * (shape.scaleY ?? 1);
		return this.normalizeRect(left, top, w, h);
	}

	// ─── Restore persisted markers onto canvas ───

	restoreMarkers(fileId: string): void {
		const markers = this.model.getMarkersForFile(fileId);
		for (const marker of markers) {
			const shape = this.createShapeFromMarker(marker);
			if (!shape) continue;

			this.canvas.add(shape);
			this.shapeToMarker.set(shape, marker.id);
			this.markerToShape.set(marker.id, shape);
		}
		this.canvas.requestRenderAll();
	}

	private createShapeFromMarker(marker: ImageMarker): FabricObject | null {
		const { fill, stroke } = this.getStyleForMarker(marker);
		const base = {
			fill,
			stroke,
			strokeWidth: STROKE_WIDTH,
			strokeUniform: true,
			selectable: true,
			evented: true,
			hasControls: true,
			hasBorders: true,
		};

		const c = marker.coords;

		if (marker.shape === 'rect' && c.type === 'rect') {
			const { left, top, width, height } = this.denormalizeRect(c);
			return new Rect({ ...base, left, top, width, height });
		}

		if (marker.shape === 'ellipse' && c.type === 'rect') {
			const { left, top, width, height } = this.denormalizeRect(c);
			return new Ellipse({ ...base, left, top, rx: width / 2, ry: height / 2 });
		}

		if (marker.shape === 'polygon' && c.type === 'polygon') {
			const pts = this.denormalizePolygon(c);
			return new Polygon(
				pts.map((p) => new Point(p.x, p.y)),
				base
			);
		}

		return null;
	}

	// ─── Sync shape edits → model ───

	syncShapeToModel(shape: FabricObject): void {
		const markerId = this.shapeToMarker.get(shape);
		if (!markerId) return;

		const coords = this.shapeToNormalizedCoords(shape);
		if (!coords) return;

		this.model.updateMarkerCoords(markerId, coords);
	}

	// ─── Delete ───

	deleteShape(shape: FabricObject): void {
		const markerId = this.shapeToMarker.get(shape);
		if (markerId) {
			this.model.removeMarker(markerId);
			this.markerToShape.delete(markerId);
		}
		this.shapeToMarker.delete(shape);
		this.canvas.remove(shape);
		this.canvas.requestRenderAll();
	}

	// ─── Lookups ───

	getMarkerIdForShape(shape: FabricObject): string | undefined {
		return this.shapeToMarker.get(shape);
	}

	getShapeForMarker(markerId: string): FabricObject | undefined {
		return this.markerToShape.get(markerId);
	}

	/** Refresh visual style for a marker (e.g. after code added/removed) */
	refreshStyle(markerId: string): void {
		const shape = this.markerToShape.get(markerId);
		const marker = this.model.findMarkerById(markerId);
		if (!shape || !marker) return;
		this.applyStyle(shape, marker);
		this.canvas.requestRenderAll();
	}

	/** Re-apply style to every shape currently on the canvas.
	 *  Called when an external mutation (e.g. colorOverride change via Marker Detail)
	 *  invalidates the cached visual but doesn't go through addCode/removeCode. */
	refreshAllStyles(): void {
		for (const [markerId, shape] of this.markerToShape) {
			const marker = this.model.findMarkerById(markerId);
			if (marker) this.applyStyle(shape, marker);
		}
		this.canvas.requestRenderAll();
	}

	/** Iterable of marker IDs currently bound to canvas shapes. */
	getActiveMarkerIds(): IterableIterator<string> {
		return this.markerToShape.keys();
	}

	// ─── Cleanup ───

	clear(): void {
		for (const shape of this.shapeToMarker.keys()) {
			this.canvas.remove(shape);
		}
		this.shapeToMarker.clear();
		this.markerToShape.clear();
	}
}
