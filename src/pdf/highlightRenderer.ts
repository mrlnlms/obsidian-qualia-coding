/**
 * Highlight renderer for PDF pages.
 * Places colored overlay rectangles over marked text.
 * Adapted from obsidian-pdf-plus (MIT) lib/highlights/viewer.ts.
 */

import { setTooltip } from 'obsidian';
import type { Rect, PDFPageView } from './pdfTypings';
import type { PdfMarker } from './pdfCodingTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { MergedRect } from './highlightGeometry';
import { computeMergedHighlightRects } from './highlightGeometry';
import { getTextLayerInfo } from './pdfViewerAccess';
import { runtimeIndicesFromAnchor, type RuntimeIndices } from './runtimeIndicesFromAnchor';
import { renderAnchorRectsInPage } from './anchorHighlight';
import type { PdfViewState } from './pdfViewState';

const HIGHLIGHT_LAYER_CLASS = 'codemarker-pdf-highlight-layer';
const HIGHLIGHT_CLASS = 'codemarker-pdf-highlight';
const BASE_OPACITY = 0.35;

/** Resolve per-code colors for a marker. Returns array of hex colors. */
function resolveCodeColors(marker: PdfMarker, registry: CodeDefinitionRegistry): string[] {
	if (marker.colorOverride) return [marker.colorOverride];
	const colors: string[] = [];
	for (const ca of marker.codes) {
		const def = registry.getById(ca.codeId);
		if (def) colors.push(def.color);
	}
	return colors.length > 0 ? colors : ['#FFEB3B'];
}

// Hover popover timing (exported for shared use by drawLayer)
export const HOVER_OPEN_DELAY = 400;  // ms before opening popover on hover
export const HOVER_CLOSE_DELAY = 300; // ms grace period before closing

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
	onMarkerHoverPopover: (marker: PdfMarker, rect: HTMLElement) => void;
	onHover?: (markerId: string | null, codeName: string | null) => void;
	onClosePopover?: () => void;
	onRangeUpdate?: (markerId: string, changes: {
		beginIndex?: number; beginOffset?: number;
		endIndex?: number; endOffset?: number;
		text?: string;
	}) => void;
}

/** Per-marker rendering result (first/last rects + merged geometry for handles). */
export interface MarkerRenderInfo {
	marker: PdfMarker;
	indices: RuntimeIndices;
	firstRectEl: HTMLElement;
	lastRectEl: HTMLElement;
	mergedRects: MergedRect[];
	color: string;
}

/** Cancel any pending hover popover open. */
export function cancelHoverPopover(state: PdfViewState): void {
	if (state.hoverOpenTimer) { clearTimeout(state.hoverOpenTimer); state.hoverOpenTimer = null; }
}

/** Start the hover close grace period. If not cancelled, closes the popover. */
export function startHoverCloseTimer(state: PdfViewState, closePopover: () => void): void {
	if (state.hoverCloseTimer) clearTimeout(state.hoverCloseTimer);
	state.hoverCloseTimer = setTimeout(() => {
		closePopover();
		state.currentHoverMarkerId = null;
		state.hoverCloseTimer = null;
	}, HOVER_CLOSE_DELAY);
}

/** Cancel the hover close grace period (mouse re-entered popover or highlight). */
export function cancelHoverCloseTimer(state: PdfViewState): void {
	if (state.hoverCloseTimer) { clearTimeout(state.hoverCloseTimer); state.hoverCloseTimer = null; }
}

export function renderHighlightsForPage(
	pageView: PDFPageView,
	markers: PdfMarker[],
	registry: CodeDefinitionRegistry,
	callbacks: HighlightCallbacks,
	state: PdfViewState,
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

		const codeColors = resolveCodeColors(marker, registry);
		const perCodeOpacity = codeColors.length > 1 ? BASE_OPACITY / codeColors.length : undefined;

		const idx = runtimeIndicesFromAnchor(pageDiv, marker);
		if (!idx) continue;

		// Visual rects come straight from Range.getClientRects() — bypasses pdfjs
		// textContentItems indexing entirely. Indices (idx) are kept only for
		// hit-testing/layering comparisons.
		let firstRectEl: HTMLElement | null = null;
		let lastRectEl: HTMLElement | null = null;
		const codeNames = marker.codes
			.map((ca) => registry.getById(ca.codeId)?.name ?? ca.codeId)
			.join(', ');

		for (const color of codeColors) {
			const els = renderAnchorRectsInPage(pageDiv, layer, marker, HIGHLIGHT_CLASS);
			if (!els || els.length === 0) continue;
			for (const el of els) {
				el.dataset.markerId = marker.id;
				el.style.backgroundColor = color;
				if (perCodeOpacity !== undefined) el.style.opacity = String(perCodeOpacity);
			}
			if (!firstRectEl) firstRectEl = els[0]!;
			lastRectEl = els[els.length - 1]!;
			if (lastRectEl) setTooltip(lastRectEl, codeNames);
		}

		if (firstRectEl && lastRectEl) {
			renderInfos.push({
				marker,
				indices: idx,
				firstRectEl,
				lastRectEl,
				mergedRects: [],
				color: codeColors[0]!,
			});
		}
	}

	// Attach centralized hover tracking on the page div
	attachLayerHoverTracking(pageDiv, renderInfos, callbacks, state);

	return renderInfos;
}

/**
 * Centralized hover tracking on the page div.
 * Since highlight rects are pointer-events: none, we listen on the page div
 * and use geometric hit-testing to detect which marker (if any) is under the cursor.
 * This allows text selection to work normally through highlights.
 */
function attachLayerHoverTracking(
	pageDiv: HTMLElement,
	renderInfos: MarkerRenderInfo[],
	callbacks: HighlightCallbacks,
	state: PdfViewState,
): void {
	if (renderInfos.length === 0) return;

	// Build a flat list of all rects with their marker info for hit-testing
	const hitTargets: { rectEl: HTMLElement; marker: PdfMarker; indices: RuntimeIndices }[] = [];
	for (const info of renderInfos) {
		const layer = info.firstRectEl.parentElement;
		if (!layer) continue;
		const rects = layer.querySelectorAll<HTMLElement>(
			`.${HIGHLIGHT_CLASS}[data-marker-id="${info.marker.id}"]`,
		);
		for (const rectEl of Array.from(rects)) {
			hitTargets.push({ rectEl, marker: info.marker, indices: info.indices });
		}
	}

	let currentMarkerId: string | null = null;
	let currentHitCount = 0; // Track how many markers are under cursor

	const onMouseMove = (e: MouseEvent) => {
		// Skip during drag operations
		if (document.body.classList.contains('codemarker-pdf-dragging')) return;

		// Hit-test: collect ALL markers under cursor, then pick the smallest
		const hits: { rectEl: HTMLElement; marker: PdfMarker; indices: RuntimeIndices }[] = [];
		const seenMarkers = new Set<string>();

		for (const { rectEl, marker, indices } of hitTargets) {
			const r = rectEl.getBoundingClientRect();
			if (e.clientX >= r.left && e.clientX <= r.right &&
				e.clientY >= r.top && e.clientY <= r.bottom) {
				if (!seenMarkers.has(marker.id)) {
					seenMarkers.add(marker.id);
					hits.push({ rectEl, marker, indices });
				}
			}
		}

		let hitMarker: PdfMarker | null = null;
		let hitRect: HTMLElement | null = null;
		let isPartialIntersection = false;

		if (hits.length === 1) {
			hitMarker = hits[0]!.marker;
			hitRect = hits[0]!.rectEl;
		} else if (hits.length > 1) {
			// Check if this is a partial intersection (no containment) vs nesting
			isPartialIntersection = !hits.some((a, i) =>
				hits.some((b, j) => i !== j && indicesContains(a.indices, b.indices)),
			);

			// Smart layering: smallest (most specific) marker wins
			hits.sort((a, b) => {
				const aContainsB = indicesContains(a.indices, b.indices);
				const bContainsA = indicesContains(b.indices, a.indices);

				if (aContainsB) return 1;
				if (bContainsA) return -1;
				if (a.indices.beginIndex !== b.indices.beginIndex) return b.indices.beginIndex - a.indices.beginIndex;
				return b.indices.beginOffset - a.indices.beginOffset;
			});
			hitMarker = hits[0]!.marker;
			hitRect = hits[0]!.rectEl;
		}

		const hitId = hitMarker?.id ?? null;

		// No change if same marker AND same hit count (intersection state unchanged)
		if (hitId === currentMarkerId && hits.length === currentHitCount) return;

		// Leaving previous marker (or intersection state changed)
		if (currentMarkerId !== null) {
			cancelHoverPopover(state);
			callbacks.onHover?.(null, null);
			showHandlesForMarker(pageDiv, null);

			if (state.currentHoverMarkerId === currentMarkerId) {
				startHoverCloseTimer(state, () => {
					callbacks.onClosePopover?.();
					state.currentHoverMarkerId = null;
				});
			}
		}

		currentMarkerId = hitId;
		currentHitCount = hits.length;

		// Entering new marker (or intersection state changed)
		if (hitMarker && hitRect) {
			callbacks.onHover?.(hitMarker.id, hitMarker.codes[0]?.codeId ?? null);

			// Show handles — all overlapping markers in intersection areas, single marker otherwise
			if (hits.length > 1) {
				showHandlesForMarker(pageDiv, seenMarkers);
			} else {
				showHandlesForMarker(pageDiv, hitMarker.id);
			}

			// Popover: suppress in partial intersection areas (only show handles there)
			if (!isPartialIntersection) {
				if (state.currentHoverMarkerId === hitMarker.id) {
					cancelHoverCloseTimer(state);
				} else {
					cancelHoverPopover(state);
					const marker = hitMarker;
					const anchorEl = hitRect;
					state.hoverOpenTimer = setTimeout(() => {
						state.hoverOpenTimer = null;
						state.currentHoverMarkerId = marker.id;
						callbacks.onMarkerHoverPopover(marker, anchorEl);
					}, HOVER_OPEN_DELAY);
				}
			}
		}
	};

	const onMouseLeave = () => {
		if (currentMarkerId !== null) {
			cancelHoverPopover(state);
			callbacks.onHover?.(null, null);
			showHandlesForMarker(pageDiv, null);

			if (state.currentHoverMarkerId === currentMarkerId) {
				startHoverCloseTimer(state, () => {
					callbacks.onClosePopover?.();
					state.currentHoverMarkerId = null;
				});
			}
			currentMarkerId = null;
		}
	};

	// Clean up previous listeners if any
	const prev = hoverCleanupMap.get(pageDiv);
	if (prev) prev();

	pageDiv.addEventListener('mousemove', onMouseMove);
	pageDiv.addEventListener('mouseleave', onMouseLeave);

	hoverCleanupMap.set(pageDiv, () => {
		pageDiv.removeEventListener('mousemove', onMouseMove);
		pageDiv.removeEventListener('mouseleave', onMouseLeave);
	});
}

/**
 * Show drag handles for one or more markers, hide all others.
 * Accepts a single marker ID, a Set of IDs (for intersection areas), or null to hide all.
 */
export function showHandlesForMarker(container: HTMLElement, markerIds: string | Set<string> | null): void {
	const idSet = markerIds instanceof Set ? markerIds
		: markerIds ? new Set([markerIds])
		: null;
	const handles = Array.from(container.querySelectorAll<HTMLElement>('.codemarker-pdf-handle'));
	for (const h of handles) {
		if (idSet && h.dataset.markerId && idSet.has(h.dataset.markerId)) {
			h.classList.add('codemarker-pdf-handle-visible');
		} else {
			if (!document.body.classList.contains('codemarker-pdf-dragging')) {
				h.classList.remove('codemarker-pdf-handle-visible');
			}
		}
	}
}

/**
 * Apply or remove hover class on highlights matching a marker ID.
 */
export function applyHoverToHighlights(container: HTMLElement, markerId: string | null): void {
	const HOVER_OPACITY = 0.55;
	const highlights = Array.from(container.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`));
	for (const el of highlights) {
		if (markerId && el.dataset.markerId === markerId) {
			el.classList.add('codemarker-pdf-highlight-hovered');
			// Multi-code layers have inline opacity — scale up for hover
			if (el.style.opacity) {
				el.dataset.baseOpacity = el.style.opacity;
				const base = parseFloat(el.style.opacity);
				el.style.opacity = String(base * (HOVER_OPACITY / BASE_OPACITY));
			}
		} else {
			el.classList.remove('codemarker-pdf-highlight-hovered');
			// Restore base opacity for multi-code layers
			if (el.dataset.baseOpacity) {
				el.style.opacity = el.dataset.baseOpacity;
				delete el.dataset.baseOpacity;
			}
		}
	}
}

/**
 * Update only the highlight rects for a single marker (during drag preview).
 * Removes old rects for that marker, re-computes geometry, creates new rects,
 * and repositions existing drag handles — without destroying the layer or other markers.
 */
export function updateHighlightRectsForMarker(
	pageView: PDFPageView,
	marker: PdfMarker,
	registry: CodeDefinitionRegistry,
): void {
	const pageDiv = pageView.div;
	const layer = pageDiv.querySelector<HTMLElement>(`.${HIGHLIGHT_LAYER_CLASS}`);
	if (!layer) return;

	// Remove old rects for this marker (but NOT handles)
	const oldRects = layer.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}[data-marker-id="${marker.id}"]`);
	for (const r of Array.from(oldRects)) r.remove();

	const textLayerInfo = getTextLayerInfo(pageView);
	if (!textLayerInfo) return;

	const codeColors = resolveCodeColors(marker, registry);
	const perCodeOpacity = codeColors.length > 1 ? BASE_OPACITY / codeColors.length : undefined;

	let firstRectEl: HTMLElement | null = null;
	let lastRectEl: HTMLElement | null = null;

	for (const color of codeColors) {
		const els = renderAnchorRectsInPage(pageDiv, layer, marker, HIGHLIGHT_CLASS);
		if (!els || els.length === 0) continue;
		for (const el of els) {
			el.dataset.markerId = marker.id;
			el.style.backgroundColor = color;
			if (perCodeOpacity !== undefined) el.style.opacity = String(perCodeOpacity);
		}
		if (!firstRectEl) firstRectEl = els[0]!;
		lastRectEl = els[els.length - 1]!;
	}

	if (firstRectEl && lastRectEl) {
		repositionHandlesForMarker(layer, marker.id, firstRectEl, lastRectEl);
	}
}

/**
 * Reposition existing drag handle elements to match new first/last rects.
 * Constants mirror dragHandles.ts sizing ratios.
 */
function repositionHandlesForMarker(
	layer: HTMLElement,
	markerId: string,
	firstRectEl: HTMLElement,
	lastRectEl: HTMLElement,
): void {
	const handles = layer.querySelectorAll<HTMLElement>(`.codemarker-pdf-handle[data-marker-id="${markerId}"]`);
	for (const h of Array.from(handles)) {
		const type = h.dataset.handleType as 'start' | 'end';
		const rectEl = type === 'start' ? firstRectEl : lastRectEl;
		const rectHeight = rectEl.getBoundingClientRect().height || 14;
		const ballRadius = Math.min(8, Math.max(3, rectHeight * 0.38));
		const ballSize = ballRadius * 2;
		const topOffset = rectHeight * 0.15;

		if (type === 'start') {
			h.style.left = `calc(${rectEl.style.left} - ${ballSize / 2}px)`;
			h.style.top = `calc(${rectEl.style.top} - ${topOffset}px)`;
		} else {
			const rectRight = `calc(${rectEl.style.left} + ${rectEl.style.width})`;
			h.style.left = `calc(${rectRight} - ${ballSize / 2}px)`;
			h.style.top = `calc(${rectEl.style.top} - ${topOffset}px)`;
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
 * Check if range A fully contains range B (A starts before/at B and ends after/at B).
 * Used for smart layering: nested (smaller) markers get priority over containers.
 */
function indicesContains(a: RuntimeIndices, b: RuntimeIndices): boolean {
	const aStartsBefore =
		a.beginIndex < b.beginIndex ||
		(a.beginIndex === b.beginIndex && a.beginOffset <= b.beginOffset);
	const aEndsAfter =
		a.endIndex > b.endIndex ||
		(a.endIndex === b.endIndex && a.endOffset >= b.endOffset);
	return aStartsBefore && aEndsAfter;
}

/**
 * Normalize a rect to ensure [left, top, right, bottom] order.
 */
function normalizeRect(rect: number[]): [number, number, number, number] {
	return [
		Math.min(rect[0]!, rect[2]!),
		Math.min(rect[1]!, rect[3]!),
		Math.max(rect[0]!, rect[2]!),
		Math.max(rect[1]!, rect[3]!),
	];
}

// ── Selection Preview ──

/** WeakMap to store hover cleanup functions per page div (avoids DOM property hacks). */
const hoverCleanupMap = new WeakMap<HTMLElement, () => void>();

const PREVIEW_CLASS = 'codemarker-pdf-selection-preview';

/**
 * Render a temporary selection-like highlight on a page.
 * Used to preserve the visual selection while the coding popover is open.
 * Returns a cleanup function that removes the preview rects.
 */
export function renderSelectionPreview(
	pageView: PDFPageView,
	anchor: import('./pdfCodingTypes').PdfAnchor,
): (() => void) | null {
	const layer = getOrCreateHighlightLayer(pageView.div);
	const elements = renderAnchorRectsInPage(pageView.div, layer, anchor, PREVIEW_CLASS);
	if (!elements || elements.length === 0) return null;
	return () => {
		for (const el of elements) el.remove();
	};
}
