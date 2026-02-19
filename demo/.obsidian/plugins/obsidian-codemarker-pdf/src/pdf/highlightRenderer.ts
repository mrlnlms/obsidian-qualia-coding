/**
 * Highlight renderer for PDF pages.
 * Places colored overlay rectangles over marked text.
 * Adapted from obsidian-pdf-plus (MIT) lib/highlights/viewer.ts.
 */

import { setTooltip } from 'obsidian';
import type { Rect, PDFPageView, TextLayerInfo } from '../pdfTypings';
import type { PdfMarker } from '../coding/pdfCodingTypes';
import type { CodeDefinitionRegistry } from '../coding/pdfCodingModel';
import { computeMergedHighlightRects } from './highlightGeometry';
import { getTextLayerInfo } from './pdfViewerAccess';

const HIGHLIGHT_LAYER_CLASS = 'codemarker-pdf-highlight-layer';
const HIGHLIGHT_CLASS = 'codemarker-pdf-highlight';

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
}

export function renderHighlightsForPage(
	pageView: PDFPageView,
	markers: PdfMarker[],
	registry: CodeDefinitionRegistry,
	callbacks: HighlightCallbacks,
): void {
	const pageDiv = pageView.div;
	clearHighlightsForPage(pageDiv);

	if (markers.length === 0) return;

	const textLayerInfo = getTextLayerInfo(pageView);
	if (!textLayerInfo) return;

	const layer = getOrCreateHighlightLayer(pageDiv);

	for (const marker of markers) {
		if (marker.codes.length === 0) continue;

		const color = registry.getColorForCodes(marker.codes) ?? '#FFEB3B';

		let mergedRects;
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

		for (const { rect } of mergedRects) {
			const rectEl = placeRectInPage(rect, pageView, layer, HIGHLIGHT_CLASS);
			rectEl.dataset.markerId = marker.id;
			rectEl.style.backgroundColor = color;

			// Tooltip with code names
			const codeNames = marker.codes.join(', ');
			setTooltip(rectEl, codeNames);

			// Click → open detail sidebar
			rectEl.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				callbacks.onClick(marker.id, marker.codes[0]);
			});

			// Double-click → open coding popover for editing
			rectEl.addEventListener('dblclick', (e) => {
				e.stopPropagation();
				e.preventDefault();
				callbacks.onDblClick(marker, e);
			});

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
	}
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
