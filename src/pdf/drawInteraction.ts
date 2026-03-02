/**
 * Drawing interaction handler for PDF pages.
 * Manages mouse events for drawing shapes (rect, ellipse, polygon)
 * and shape selection/move/resize.
 */

import type { PDFViewerChild } from './pdfTypings';
import type { PdfCodingModel } from './pdfCodingModel';
import type { NormalizedShapeCoords } from '../core/shapeTypes';
import type { DrawMode } from '../core/shapeTypes';
import { getPageElFromNode, getPageNumber } from './pdfViewerAccess';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAW_LAYER_CLASS = 'codemarker-pdf-draw-layer';
const MIN_SHAPE_SIZE = 1; // Minimum % size to accept a drawn shape

export type { DrawMode };

export interface DrawInteractionCallbacks {
	onShapeCreated: (file: string, page: number, coords: NormalizedShapeCoords) => void;
	onShapeSelected: (shapeId: string | null) => void;
	onShapeMoved: (shapeId: string, coords: NormalizedShapeCoords) => void;
}

export class DrawInteraction {
	private child: PDFViewerChild;
	private model: PdfCodingModel;
	private callbacks: DrawInteractionCallbacks;
	private mode: DrawMode = 'select';
	private drawing = false;
	private startPoint: { x: number; y: number; page: number; pageEl: HTMLElement } | null = null;
	private previewEl: SVGElement | null = null;
	private previewSvg: SVGSVGElement | null = null;
	private polygonPoints: Array<{ x: number; y: number }> = [];
	private selectedShapeId: string | null = null;

	// Move state
	private moveState: {
		shapeId: string;
		startMouse: { x: number; y: number };
		startCoords: NormalizedShapeCoords;
		pageEl: HTMLElement;
	} | null = null;

	private cleanupFns: Array<() => void> = [];

	constructor(
		child: PDFViewerChild,
		model: PdfCodingModel,
		callbacks: DrawInteractionCallbacks,
	) {
		this.child = child;
		this.model = model;
		this.callbacks = callbacks;
	}

	getMode(): DrawMode { return this.mode; }

	setMode(mode: DrawMode): void {
		// Finish polygon if switching away
		if (this.mode === 'polygon' && mode !== 'polygon') {
			this.finishPolygon();
		}

		this.mode = mode;
		this.clearPreview();

		if (mode === 'select') {
			document.body.classList.remove('codemarker-pdf-drawing');
		} else {
			document.body.classList.add('codemarker-pdf-drawing');
		}
	}

	getSelectedShapeId(): string | null { return this.selectedShapeId; }

	selectShape(shapeId: string | null): void {
		// Clear old selection
		if (this.selectedShapeId) {
			const oldEls = document.querySelectorAll(`[data-shape-id="${this.selectedShapeId}"]`);
			for (const el of Array.from(oldEls)) {
				el.classList.remove('codemarker-pdf-shape-selected');
			}
		}

		this.selectedShapeId = shapeId;

		// Apply new selection
		if (shapeId) {
			const newEls = document.querySelectorAll(`[data-shape-id="${shapeId}"]`);
			for (const el of Array.from(newEls)) {
				el.classList.add('codemarker-pdf-shape-selected');
			}
		}

		this.callbacks.onShapeSelected(shapeId);
	}

	/**
	 * Install mouse listeners on the PDF container.
	 * Call cleanup() to remove.
	 */
	start(): void {
		const container = this.child.containerEl;

		const onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
		const onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
		const onMouseUp = (e: MouseEvent) => this.handleMouseUp(e);
		const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
		const onDblClick = (e: MouseEvent) => this.handleDoubleClick(e);

		container.addEventListener('mousedown', onMouseDown, true);
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		document.addEventListener('keydown', onKeyDown);
		container.addEventListener('dblclick', onDblClick, true);

		this.cleanupFns.push(
			() => container.removeEventListener('mousedown', onMouseDown, true),
			() => document.removeEventListener('mousemove', onMouseMove),
			() => document.removeEventListener('mouseup', onMouseUp),
			() => document.removeEventListener('keydown', onKeyDown),
			() => container.removeEventListener('dblclick', onDblClick, true),
		);
	}

	stop(): void {
		for (const fn of this.cleanupFns) fn();
		this.cleanupFns = [];
		this.clearPreview();
		this.startPoint = null;
		this.drawing = false;
		this.polygonPoints = [];
		this.selectShape(null);
		document.body.classList.remove('codemarker-pdf-drawing');
	}

	deleteSelectedShape(): boolean {
		if (!this.selectedShapeId) return false;
		this.model.deleteShape(this.selectedShapeId);
		this.selectedShapeId = null;
		return true;
	}

	// ── Mouse handlers ──

	private handleMouseDown(e: MouseEvent): void {
		if (this.mode === 'select') {
			this.handleSelectMouseDown(e);
			return;
		}

		// Only capture if clicking directly on page (not on existing shapes or UI)
		const target = e.target as HTMLElement;
		if (target.closest('.codemarker-popover') || target.closest('.codemarker-pdf-draw-toolbar')) return;

		const pageEl = getPageElFromNode(e.target as Node);
		if (!pageEl) return;

		if (this.mode === 'polygon') {
			// Polygon: click-to-place vertices
			e.preventDefault();
			e.stopPropagation();
			this.addPolygonPoint(e);
			return;
		}

		// Rect / Ellipse: start drag-to-draw
		const page = getPageNumber(pageEl);
		const point = this.mouseToPagePercent(e, pageEl);
		if (!point) return;

		e.preventDefault();
		e.stopPropagation();

		this.drawing = true;
		this.startPoint = { x: point.x, y: point.y, page, pageEl };

		// Create preview SVG on the page
		this.createPreviewSvg(pageEl);
	}

	private handleMouseMove(e: MouseEvent): void {
		if (!this.drawing || !this.startPoint || !this.previewSvg) return;

		const point = this.mouseToPagePercent(e, this.startPoint.pageEl);
		if (!point) return;

		this.updatePreview(this.startPoint, point);
	}

	private handleMouseUp(e: MouseEvent): void {
		if (this.moveState) {
			this.finishMove(e);
			return;
		}

		if (!this.drawing || !this.startPoint) return;
		this.drawing = false;

		const { page, pageEl } = this.startPoint;
		const point = this.mouseToPagePercent(e, pageEl);
		if (!point) {
			this.clearPreview();
			this.startPoint = null;
			return;
		}

		const coords = this.buildCoords(this.startPoint, point);
		this.clearPreview();
		this.startPoint = null;

		if (!coords) return; // Too small

		const filePath = this.child.file?.path;
		if (!filePath) return;

		this.callbacks.onShapeCreated(filePath, page, coords);

		// Return to select mode after drawing
		this.setMode('select');
	}

	private handleDoubleClick(e: MouseEvent): void {
		// Double-click on a shape in select mode → handled by drawLayer callbacks
		// This handler is for double-click to finish polygon
		if (this.mode === 'polygon' && this.polygonPoints.length >= 3) {
			e.preventDefault();
			e.stopPropagation();
			this.finishPolygon();
		}
	}

	private handleKeyDown(e: KeyboardEvent): void {
		// Delete key → remove selected shape
		if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedShapeId && this.mode === 'select') {
			// Don't intercept if user is typing in an input
			if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
			e.preventDefault();
			this.deleteSelectedShape();
			return;
		}

		// Escape → cancel current drawing or deselect
		if (e.key === 'Escape') {
			if (this.drawing) {
				this.drawing = false;
				this.clearPreview();
			} else if (this.mode === 'polygon' && this.polygonPoints.length > 0) {
				this.polygonPoints = [];
				this.clearPreview();
			} else if (this.selectedShapeId) {
				this.selectShape(null);
			} else if (this.mode !== 'select') {
				this.setMode('select');
			}
		}

		// Keyboard shortcuts for modes
		if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
		switch (e.key.toLowerCase()) {
			case 'v': this.setMode('select'); break;
			case 'r': this.setMode('rect'); break;
			case 'e': this.setMode('ellipse'); break;
			case 'p': this.setMode('polygon'); break;
		}
	}

	private handleSelectMouseDown(e: MouseEvent): void {
		const target = e.target as Element;

		// Check if clicking on a shape
		const shapeEl = target.closest?.('[data-shape-id]') as SVGElement | null;
		if (shapeEl) {
			const shapeId = shapeEl.dataset.shapeId;
			if (shapeId) {
				e.preventDefault();
				e.stopPropagation();
				this.selectShape(shapeId);

				// Start move
				const pageEl = getPageElFromNode(shapeEl as any) ?? shapeEl.closest?.('div.page[data-page-number]') as HTMLElement | null;
				if (pageEl) {
					const shape = this.model.findShapeById(shapeId);
					if (shape) {
						const pt = this.mouseToPagePercent(e, pageEl);
						if (pt) {
							this.moveState = {
								shapeId,
								startMouse: pt,
								startCoords: JSON.parse(JSON.stringify(shape.coords)),
								pageEl,
							};
						}
					}
				}
				return;
			}
		}

		// Click on empty space → deselect
		if (!target.closest('.codemarker-popover') && !target.closest('.codemarker-pdf-draw-toolbar')) {
			this.selectShape(null);
		}
	}

	private finishMove(e: MouseEvent): void {
		if (!this.moveState) return;
		const { shapeId, startMouse, startCoords, pageEl } = this.moveState;
		this.moveState = null;

		const endPt = this.mouseToPagePercent(e, pageEl);
		if (!endPt) return;

		const dx = endPt.x - startMouse.x;
		const dy = endPt.y - startMouse.y;

		// Only update if actually moved
		if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;

		const newCoords = this.offsetCoords(startCoords, dx, dy);
		this.callbacks.onShapeMoved(shapeId, newCoords);
	}

	// ── Polygon ──

	/** Handle click to place a polygon vertex. Called from drawLayer click events or page clicks. */
	addPolygonPoint(e: MouseEvent): void {
		if (this.mode !== 'polygon') return;

		const pageEl = getPageElFromNode(e.target as Node);
		if (!pageEl) return;

		const point = this.mouseToPagePercent(e, pageEl);
		if (!point) return;

		const page = getPageNumber(pageEl);

		if (this.polygonPoints.length === 0) {
			this.startPoint = { x: point.x, y: point.y, page, pageEl };
			this.createPreviewSvg(pageEl);
		}

		this.polygonPoints.push(point);
		this.updatePolygonPreview();
	}

	private finishPolygon(): void {
		if (this.polygonPoints.length < 3 || !this.startPoint) {
			this.polygonPoints = [];
			this.clearPreview();
			this.startPoint = null;
			return;
		}

		const filePath = this.child.file?.path;
		const page = this.startPoint.page;
		if (!filePath) {
			this.polygonPoints = [];
			this.clearPreview();
			this.startPoint = null;
			return;
		}

		const coords: NormalizedShapeCoords = {
			type: 'polygon',
			points: [...this.polygonPoints],
		};

		this.polygonPoints = [];
		this.clearPreview();
		this.startPoint = null;

		this.callbacks.onShapeCreated(filePath, page, coords);
		this.setMode('select');
	}

	// ── Coordinate conversion ──

	private mouseToPagePercent(e: MouseEvent, pageEl: HTMLElement): { x: number; y: number } | null {
		const rect = pageEl.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * 100;
		const y = ((e.clientY - rect.top) / rect.height) * 100;

		// Clamp to page bounds
		return {
			x: Math.max(0, Math.min(100, x)),
			y: Math.max(0, Math.min(100, y)),
		};
	}

	private buildCoords(
		start: { x: number; y: number },
		end: { x: number; y: number },
	): NormalizedShapeCoords | null {
		const x = Math.min(start.x, end.x);
		const y = Math.min(start.y, end.y);
		const w = Math.abs(end.x - start.x);
		const h = Math.abs(end.y - start.y);

		if (w < MIN_SHAPE_SIZE && h < MIN_SHAPE_SIZE) return null;

		if (this.mode === 'rect') {
			return { type: 'rect', x, y, w, h };
		} else if (this.mode === 'ellipse') {
			return {
				type: 'ellipse',
				cx: x + w / 2,
				cy: y + h / 2,
				rx: w / 2,
				ry: h / 2,
			};
		}
		return null;
	}

	private offsetCoords(coords: NormalizedShapeCoords, dx: number, dy: number): NormalizedShapeCoords {
		switch (coords.type) {
			case 'rect':
				return { ...coords, x: coords.x + dx, y: coords.y + dy };
			case 'ellipse':
				return { ...coords, cx: coords.cx + dx, cy: coords.cy + dy };
			case 'polygon':
				return {
					...coords,
					points: coords.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
				};
		}
	}

	// ── Preview rendering ──

	private createPreviewSvg(pageEl: HTMLElement): void {
		this.clearPreview();

		// Use existing draw layer SVG or create temporary one
		let svg = pageEl.querySelector(`.${DRAW_LAYER_CLASS}`) as SVGSVGElement | null;
		if (!svg) {
			svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
			svg.setAttribute('class', DRAW_LAYER_CLASS);
			svg.setAttribute('width', '100%');
			svg.setAttribute('height', '100%');
			svg.setAttribute('viewBox', '0 0 100 100');
			svg.setAttribute('preserveAspectRatio', 'none');
			// Inline styles as fallback for SVG namespace elements
			svg.style.position = 'absolute';
			svg.style.top = '0';
			svg.style.left = '0';
			svg.style.width = '100%';
			svg.style.height = '100%';
			svg.style.pointerEvents = 'none';
			svg.style.zIndex = '4';
			svg.style.overflow = 'visible';
			pageEl.appendChild(svg);
		}
		this.previewSvg = svg;
	}

	private updatePreview(start: { x: number; y: number }, end: { x: number; y: number }): void {
		if (!this.previewSvg) return;

		// Remove old preview
		if (this.previewEl) {
			this.previewEl.remove();
			this.previewEl = null;
		}

		const x = Math.min(start.x, end.x);
		const y = Math.min(start.y, end.y);
		const w = Math.abs(end.x - start.x);
		const h = Math.abs(end.y - start.y);

		let el: SVGElement;

		if (this.mode === 'rect') {
			el = document.createElementNS(SVG_NS, 'rect');
			el.setAttribute('x', String(x));
			el.setAttribute('y', String(y));
			el.setAttribute('width', String(w));
			el.setAttribute('height', String(h));
		} else if (this.mode === 'ellipse') {
			el = document.createElementNS(SVG_NS, 'ellipse');
			el.setAttribute('cx', String(x + w / 2));
			el.setAttribute('cy', String(y + h / 2));
			el.setAttribute('rx', String(w / 2));
			el.setAttribute('ry', String(h / 2));
		} else {
			return;
		}

		el.classList.add('codemarker-pdf-shape-preview');
		this.previewSvg.appendChild(el);
		this.previewEl = el;
	}

	private updatePolygonPreview(): void {
		if (!this.previewSvg || this.polygonPoints.length === 0) return;

		if (this.previewEl) {
			this.previewEl.remove();
			this.previewEl = null;
		}

		if (this.polygonPoints.length === 1) {
			// Single point — show a dot
			const p = this.polygonPoints[0]!;
			const circle = document.createElementNS(SVG_NS, 'circle');
			circle.setAttribute('cx', String(p.x));
			circle.setAttribute('cy', String(p.y));
			circle.setAttribute('r', '0.5');
			circle.classList.add('codemarker-pdf-shape-preview');
			this.previewSvg.appendChild(circle);
			this.previewEl = circle;
		} else {
			const pointsStr = this.polygonPoints.map(p => `${p.x},${p.y}`).join(' ');
			const polygon = document.createElementNS(SVG_NS, 'polygon');
			polygon.setAttribute('points', pointsStr);
			polygon.classList.add('codemarker-pdf-shape-preview');
			this.previewSvg.appendChild(polygon);
			this.previewEl = polygon;
		}
	}

	private clearPreview(): void {
		if (this.previewEl) {
			this.previewEl.remove();
			this.previewEl = null;
		}
		this.previewSvg = null;
	}
}
