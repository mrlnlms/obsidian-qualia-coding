/**
 * Draw layer renderer for PDF pages.
 * Renders SVG overlay shapes (rect, ellipse, polygon) drawn by the user
 * for qualitative coding of non-text regions (figures, tables, charts).
 *
 * Coordinates are stored as CSS percentages (0-100) relative to page dimensions,
 * so shapes scale naturally with zoom.
 */

import type { PDFPageView } from './pdfTypings';
import type { PdfShapeMarker, NormalizedShapeCoords } from './pdfCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { PdfViewState } from './pdfViewState';
import {
	HOVER_OPEN_DELAY,
	cancelHoverPopover,
	cancelHoverCloseTimer,
	startHoverCloseTimer,
} from './highlightRenderer';

const DRAW_LAYER_CLASS = 'codemarker-pdf-draw-layer';
const SHAPE_CLASS = 'codemarker-pdf-shape';
const SVG_NS = 'http://www.w3.org/2000/svg';

export interface DrawLayerCallbacks {
	onClick: (shapeId: string, codeName: string) => void;
	onDoubleClick: (shape: PdfShapeMarker, anchorEl: SVGElement) => void;
	onHover: (shapeId: string | null, codeName: string | null) => void;
	onShapeHoverPopover: (shape: PdfShapeMarker, anchorEl: SVGElement) => void;
}

/**
 * Render all drawn shapes for a specific page as SVG elements.
 */
export function renderDrawLayerForPage(
	pageView: PDFPageView,
	shapes: PdfShapeMarker[],
	registry: CodeDefinitionRegistry,
	callbacks: DrawLayerCallbacks,
	state?: PdfViewState,
): void {
	const pageDiv = pageView.div;
	clearDrawLayerForPage(pageDiv);

	if (shapes.length === 0) return;

	// Create SVG overlay
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('class', DRAW_LAYER_CLASS);
	svg.setAttribute('width', '100%');
	svg.setAttribute('height', '100%');
	svg.setAttribute('viewBox', '0 0 100 100');
	svg.setAttribute('preserveAspectRatio', 'none');
	// Inline styles as fallback — SVG namespace elements may ignore CSS class dimensions
	svg.style.position = 'absolute';
	svg.style.top = '0';
	svg.style.left = '0';
	svg.style.width = '100%';
	svg.style.height = '100%';
	svg.style.pointerEvents = 'none';
	svg.style.zIndex = '4';
	svg.style.overflow = 'visible';

	for (const shape of shapes) {
		const color = registry.getColorForCodes(shape.codes) ?? '#FFEB3B';
		const el = createShapeSVG(shape.coords, color);
		if (!el) continue;

		el.classList.add(SHAPE_CLASS);
		el.dataset.shapeId = shape.id;
		if (shape.codes.length > 0) {
			el.dataset.codeName = shape.codes[0];
		}

		// Events
		el.addEventListener('mouseenter', () => {
			callbacks.onHover(shape.id, shape.codes[0] ?? null);

			// Cancel any pending close from text highlights or other shapes
			if (state) {
				cancelHoverCloseTimer(state);
				cancelHoverPopover(state);

				// Start hover open timer for popover
				if (state.currentHoverShapeId === shape.id) {
					// Already showing popover for this shape — just cancel close
					return;
				}
				if (state.shapeHoverTimer) { clearTimeout(state.shapeHoverTimer); state.shapeHoverTimer = null; }
				state.shapeHoverTimer = setTimeout(() => {
					state.shapeHoverTimer = null;
					state.currentHoverShapeId = shape.id;
					callbacks.onShapeHoverPopover(shape, el);
				}, HOVER_OPEN_DELAY);
			}
		});
		el.addEventListener('mouseleave', () => {
			callbacks.onHover(null, null);

			if (state) {
				// Cancel pending open
				if (state.shapeHoverTimer) { clearTimeout(state.shapeHoverTimer); state.shapeHoverTimer = null; }

				// Start close grace period if popover is open for this shape
				if (state.currentHoverShapeId === shape.id) {
					const popover = state.containerEl.querySelector('.codemarker-popover') as HTMLElement | null;
					if (popover) {
						startHoverCloseTimer(state, () => { popover.remove(); state.currentHoverShapeId = null; });
					} else {
						state.currentHoverShapeId = null;
					}
				}
			}
		});
		el.addEventListener('click', (e) => {
			e.stopPropagation();
			if (shape.codes.length > 0) {
				callbacks.onClick(shape.id, shape.codes[0]!);
			}
		});
		el.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			callbacks.onDoubleClick(shape, el);
		});

		svg.appendChild(el);
	}

	pageDiv.appendChild(svg);
}

/**
 * Create an SVG element for the given shape coordinates.
 */
function createShapeSVG(coords: NormalizedShapeCoords, color: string): SVGElement | null {
	switch (coords.type) {
		case 'rect': {
			const rect = document.createElementNS(SVG_NS, 'rect');
			rect.setAttribute('x', String(coords.x));
			rect.setAttribute('y', String(coords.y));
			rect.setAttribute('width', String(coords.w));
			rect.setAttribute('height', String(coords.h));
			applyShapeStyle(rect, color);
			return rect;
		}
		case 'ellipse': {
			const ellipse = document.createElementNS(SVG_NS, 'ellipse');
			ellipse.setAttribute('cx', String(coords.cx));
			ellipse.setAttribute('cy', String(coords.cy));
			ellipse.setAttribute('rx', String(coords.rx));
			ellipse.setAttribute('ry', String(coords.ry));
			applyShapeStyle(ellipse, color);
			return ellipse;
		}
		case 'polygon': {
			if (coords.points.length < 3) return null;
			const polygon = document.createElementNS(SVG_NS, 'polygon');
			const pointsStr = coords.points.map(p => `${p.x},${p.y}`).join(' ');
			polygon.setAttribute('points', pointsStr);
			applyShapeStyle(polygon, color);
			return polygon;
		}
	}
	return null;
}

/**
 * Apply fill + stroke styling to an SVG shape element.
 */
function applyShapeStyle(el: SVGElement, color: string): void {
	el.setAttribute('fill', color);
	el.setAttribute('fill-opacity', '0.25');
	el.setAttribute('stroke', color);
	el.setAttribute('stroke-width', '0.3');
	el.setAttribute('stroke-opacity', '0.8');
	el.setAttribute('vector-effect', 'non-scaling-stroke');
}

/**
 * Clear the draw layer from a page.
 */
export function clearDrawLayerForPage(pageDiv: HTMLElement): void {
	const layer = pageDiv.querySelector(`.${DRAW_LAYER_CLASS}`);
	if (layer) layer.remove();
}

/**
 * Apply or remove hover class on shapes matching a shape/marker ID.
 * Uses the same ID space as markers for unified hover state.
 */
export function applyHoverToDrawLayer(container: HTMLElement, shapeId: string | null): void {
	const shapes = Array.from(container.querySelectorAll<SVGElement>(`.${SHAPE_CLASS}`));
	for (const el of shapes) {
		if (shapeId && el.dataset.shapeId === shapeId) {
			el.classList.add('codemarker-pdf-shape-hovered');
		} else {
			el.classList.remove('codemarker-pdf-shape-hovered');
		}
	}
}

/**
 * Get the vertical bounds of a shape as CSS percentages (for margin panel integration).
 * Returns topPct and bottomPct in the 0-100 range.
 */
export function getShapeVerticalBounds(coords: NormalizedShapeCoords): { topPct: number; bottomPct: number } {
	switch (coords.type) {
		case 'rect':
			return { topPct: coords.y, bottomPct: coords.y + coords.h };
		case 'ellipse':
			return { topPct: coords.cy - coords.ry, bottomPct: coords.cy + coords.ry };
		case 'polygon': {
			const ys = coords.points.map(p => p.y);
			return { topPct: Math.min(...ys), bottomPct: Math.max(...ys) };
		}
	}
}
