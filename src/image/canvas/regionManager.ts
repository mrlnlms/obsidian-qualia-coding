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
import type { ImageCodingModel } from '../models/codingModel';
import type { ImageMarker, NormalizedRect, NormalizedPolygon, NormalizedCoords } from '../models/codingTypes';
import type { FabricCanvasState } from './fabricCanvas';

/** Marker color when no codes assigned */
const DEFAULT_FILL = 'rgba(59, 130, 246, 0.2)';
const DEFAULT_STROKE = 'rgba(59, 130, 246, 0.8)';
const STROKE_WIDTH = 2;

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
		const color = this.model.registry.getColorForCodes(marker.codes);
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
			// Polygon — extract absolute points
			const points = (shape as any).points as Array<{ x: number; y: number }>;
			if (!points || points.length < 3) return null;

			// Fabric stores polygon points relative to shape origin;
			// we need absolute coords
			const matrix = shape.calcTransformMatrix();
			const absPoints = points.map((p) => {
				const transformed = this.transformPoint(p.x, p.y, matrix);
				return { x: transformed.x, y: transformed.y };
			});
			return this.normalizePolygon(absPoints);
		}

		// Rect or Ellipse — use bounding box
		const left = shape.left ?? 0;
		const top = shape.top ?? 0;
		const w = (shape.width ?? 0) * (shape.scaleX ?? 1);
		const h = (shape.height ?? 0) * (shape.scaleY ?? 1);
		return this.normalizeRect(left, top, w, h);
	}

	private transformPoint(x: number, y: number, matrix: number[]): { x: number; y: number } {
		return {
			x: matrix[0]! * x + matrix[2]! * y + matrix[4]!,
			y: matrix[1]! * x + matrix[3]! * y + matrix[5]!,
		};
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
			this.model.deleteMarker(markerId);
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

	// ─── Cleanup ───

	clear(): void {
		for (const shape of this.shapeToMarker.keys()) {
			this.canvas.remove(shape);
		}
		this.shapeToMarker.clear();
		this.markerToShape.clear();
	}
}
