/**
 * Highlight renderer for PDF pages.
 * Places colored overlay rectangles over marked text.
 * Adapted from obsidian-pdf-plus (MIT) lib/highlights/viewer.ts.
 */

import { setTooltip } from 'obsidian';
import type { Rect, PDFPageView } from '../pdfTypings';
import type { PdfMarker } from '../coding/pdfCodingTypes';
import type { CodeDefinitionRegistry } from '../coding/pdfCodingModel';
import type { MergedRect } from './highlightGeometry';
import { computeMergedHighlightRects } from './highlightGeometry';
import { getTextLayerInfo } from './pdfViewerAccess';

const HIGHLIGHT_LAYER_CLASS = 'codemarker-pdf-highlight-layer';
const HIGHLIGHT_CLASS = 'codemarker-pdf-highlight';

// Click detection thresholds
const CLICK_DISTANCE_THRESHOLD = 5; // px
const CLICK_TIME_THRESHOLD = 300;   // ms
const DBLCLICK_INTERVAL = 400;      // ms between two clicks

/**
 * Get or create the highlight overlay layer for a page div.
 */
export function getOrCreateHighlightLayer(pageDiv: HTMLElement): HTMLElement {
	const existing = pageDiv.querySelector<HTMLElement>(`.${HIGHLIGHT_LAYER_CLASS}`);
	if (existing) return existing;

	const layer = document.createElement('div');
	layer.className = HIGHLIGHT_LAYER_CLASS;
	pageDiv.appendChild(layer);
	return layer;
}

/**
 * Convert a PDF coordinate rect to CSS percentage position within a page.
 * PDF coords use bottom-left origin; CSS uses top-left origin.
 */
export function placeRectInPage(
	rect: Rect,
	pageView: PDFPageView,
	layer: HTMLElement,
	className: string,
): HTMLElement {
	const viewBox = pageView.pdfPage.view as [number, number, number, number];
	const pageX = viewBox[0];
	const pageY = viewBox[1];
	const pageWidth = viewBox[2] - viewBox[0];
	const pageHeight = viewBox[3] - viewBox[1];

	// Mirror Y axis: PDF bottom-left → CSS top-left
	const normalizedRect = normalizeRect([
		rect[0],
		viewBox[3] - rect[1] + viewBox[1],
		rect[2],
		viewBox[3] - rect[3] + viewBox[1],
	]);

	const rectEl = document.createElement('div');
	rectEl.className = className;
	rectEl.style.left = `${100 * (normalizedRect[0] - pageX) / pageWidth}%`;
	rectEl.style.top = `${100 * (normalizedRect[1] - pageY) / pageHeight}%`;
	rectEl.style.width = `${100 * (normalizedRect[2] - normalizedRect[0]) / pageWidth}%`;
	rectEl.style.height = `${100 * (normalizedRect[3] - normalizedRect[1]) / pageHeight}%`;

	layer.appendChild(rectEl);
	return rectEl;
}

/**
 * Render all highlights for a specific page.
 */
export interface HighlightCallbacks {
	onClick: (markerId: string, codeName: string) => void;
	onDblClick: (marker: PdfMarker, evt: MouseEvent) => void;
	onHover?: (markerId: string | null, codeName: string | null) => void;
	onRangeUpdate?: (markerId: string, changes: {
		beginIndex?: number; beginOffset?: number;
		endIndex?: number; endOffset?: number;
		text?: string;
	}) => void;
}

/** Per-marker rendering result (first/last rects + merged geometry for handles). */
export interface MarkerRenderInfo {
	marker: PdfMarker;
	firstRectEl: HTMLElement;
	lastRectEl: HTMLElement;
	mergedRects: MergedRect[];
	color: string;
}

// Track last click time per layer for double-click detection
const lastClickMap = new WeakMap<HTMLElement, { time: number; markerId: string }>();

export function renderHighlightsForPage(
	pageView: PDFPageView,
	markers: PdfMarker[],
	registry: CodeDefinitionRegistry,
	callbacks: HighlightCallbacks,
): MarkerRenderInfo[] {
	const pageDiv = pageView.div;
	clearHighlightsForPage(pageDiv);

	const renderInfos: MarkerRenderInfo[] = [];

	if (markers.length === 0) return renderInfos;

	const textLayerInfo = getTextLayerInfo(pageView);
	if (!textLayerInfo) return renderInfos;

	const layer = getOrCreateHighlightLayer(pageDiv);

	for (const marker of markers) {
		if (marker.codes.length === 0) continue;

		const color = registry.getColorForCodes(marker.codes) ?? '#FFEB3B';

		let mergedRects: MergedRect[];
		try {
			mergedRects = computeMergedHighlightRects(
				textLayerInfo,
				marker.beginIndex,
				marker.beginOffset,
				marker.endIndex,
				marker.endOffset,
			);
		} catch {
			continue;
		}

		if (mergedRects.length === 0) continue;

		let firstRectEl: HTMLElement | null = null;
		let lastRectEl: HTMLElement | null = null;

		for (const { rect } of mergedRects) {
			const rectEl = placeRectInPage(rect, pageView, layer, HIGHLIGHT_CLASS);
			rectEl.dataset.markerId = marker.id;
			rectEl.style.backgroundColor = color;

			if (!firstRectEl) firstRectEl = rectEl;
			lastRectEl = rectEl;

			// Tooltip with code names
			const codeNames = marker.codes.join(', ');
			setTooltip(rectEl, codeNames);

			// Mousedown-based interaction: differentiates click vs drag-to-select
			attachMouseInteraction(rectEl, layer, marker, callbacks);

			// Hover → bidirectional highlight ↔ sidebar
			if (callbacks.onHover) {
				rectEl.addEventListener('mouseenter', () => {
					callbacks.onHover!(marker.id, marker.codes[0] ?? null);
				});
				rectEl.addEventListener('mouseleave', () => {
					callbacks.onHover!(null, null);
				});
			}
		}

		if (firstRectEl && lastRectEl) {
			renderInfos.push({
				marker,
				firstRectEl,
				lastRectEl,
				mergedRects,
				color,
			});
		}
	}

	return renderInfos;
}

/**
 * Attach mousedown-based interaction to a highlight rect.
 * Allows text selection to pass through while detecting clicks/double-clicks.
 */
function attachMouseInteraction(
	rectEl: HTMLElement,
	layer: HTMLElement,
	marker: PdfMarker,
	callbacks: HighlightCallbacks,
): void {
	rectEl.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return; // left button only

		// Don't interfere with handle drags
		if (document.body.classList.contains('codemarker-pdf-dragging')) return;

		const startX = e.clientX;
		const startY = e.clientY;
		const startTime = Date.now();

		// Temporarily disable pointer-events on the layer so the text layer
		// underneath receives mouse events for text selection
		layer.style.pointerEvents = 'none';

		// Re-dispatch mousedown to the element underneath (text layer)
		const underlying = document.elementFromPoint(e.clientX, e.clientY);
		if (underlying && underlying !== rectEl) {
			underlying.dispatchEvent(new MouseEvent('mousedown', {
				bubbles: true,
				cancelable: true,
				clientX: e.clientX,
				clientY: e.clientY,
				button: e.button,
			}));
		}

		const onUp = (upEvt: MouseEvent) => {
			document.removeEventListener('mouseup', onUp);
			layer.style.pointerEvents = '';

			const dx = upEvt.clientX - startX;
			const dy = upEvt.clientY - startY;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const elapsed = Date.now() - startTime;

			// Only treat as click if minimal movement and short duration
			if (dist < CLICK_DISTANCE_THRESHOLD && elapsed < CLICK_TIME_THRESHOLD) {
				// Check for double-click
				const lastClick = lastClickMap.get(layer);
				const now = Date.now();

				if (lastClick && lastClick.markerId === marker.id && (now - lastClick.time) < DBLCLICK_INTERVAL) {
					// Double-click → open coding popover
					lastClickMap.delete(layer);
					callbacks.onDblClick(marker, upEvt);
				} else {
					// Single click → open detail sidebar
					lastClickMap.set(layer, { time: now, markerId: marker.id });
					// Delay to allow double-click detection
					setTimeout(() => {
						const current = lastClickMap.get(layer);
						if (current && current.markerId === marker.id && current.time === now) {
							lastClickMap.delete(layer);
							callbacks.onClick(marker.id, marker.codes[0]);
						}
					}, DBLCLICK_INTERVAL);
				}
			}
			// If distance >= threshold: it was a text selection drag — do nothing,
			// the main.ts mouseup handler will capture the selection
		};

		document.addEventListener('mouseup', onUp);
	});
}

/**
 * Apply or remove hover class on highlights matching a marker ID.
 */
export function applyHoverToHighlights(container: HTMLElement, markerId: string | null): void {
	const highlights = Array.from(container.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`));
	for (const el of highlights) {
		if (markerId && el.dataset.markerId === markerId) {
			el.classList.add('codemarker-pdf-highlight-hovered');
		} else {
			el.classList.remove('codemarker-pdf-highlight-hovered');
		}
	}
}

/**
 * Clear all highlights from a page.
 */
export function clearHighlightsForPage(pageDiv: HTMLElement): void {
	const layer = pageDiv.querySelector(`.${HIGHLIGHT_LAYER_CLASS}`);
	if (layer) layer.remove();
}

/**
 * Normalize a rect to ensure [left, top, right, bottom] order.
 */
function normalizeRect(rect: number[]): [number, number, number, number] {
	return [
		Math.min(rect[0], rect[2]),
		Math.min(rect[1], rect[3]),
		Math.max(rect[0], rect[2]),
		Math.max(rect[1], rect[3]),
	];
}
