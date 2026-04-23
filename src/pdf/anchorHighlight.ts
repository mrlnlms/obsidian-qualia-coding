/**
 * Anchor-based highlight rendering — bypasses the legacy pdfjs index system.
 *
 * `computeAnchorRects` resolves an anchor to a DOM Range, then uses
 * `Range.getClientRects()` to compute one rect per text line. Callers convert
 * those rects into absolute-positioned highlight elements.
 */

import { mapAnchorToDomRange } from './textAnchorRender';
import type { PdfAnchor } from './pdfCodingTypes';

/**
 * Resolve an anchor to a concrete DOM Range. Returns null if no match.
 * Safe to run in jsdom — does not call layout APIs.
 */
export function resolveAnchorRange(pageEl: HTMLElement, anchor: PdfAnchor): Range | null {
	const mapped = mapAnchorToDomRange(pageEl, anchor);
	if (!mapped) return null;

	const range = document.createRange();
	try {
		range.setStart(mapped.startContainer, mapped.startOffset);
		range.setEnd(mapped.endContainer, mapped.endOffset);
	} catch {
		return null;
	}
	return range;
}

/**
 * Resolve an anchor into visual rects. Returns null if the anchor doesn't match.
 * Rects are in client (viewport) coordinates. Requires a real browser layout
 * engine (jsdom does not implement Range.getClientRects).
 */
export function computeAnchorRects(pageEl: HTMLElement, anchor: PdfAnchor): DOMRect[] | null {
	const range = resolveAnchorRange(pageEl, anchor);
	if (!range) return null;
	if (typeof range.getClientRects !== 'function') return [];

	const domRects = range.getClientRects();
	const rects: DOMRect[] = [];
	for (let i = 0; i < domRects.length; i++) {
		const r = domRects[i]!;
		if (r.width <= 0 || r.height <= 0) continue;
		rects.push(r);
	}
	return rects;
}

/**
 * Convert a viewport DOMRect into a {left, top, width, height} in percentages
 * relative to a page element.
 */
export function rectToPagePercent(
	rect: DOMRect,
	pageEl: HTMLElement,
): { left: number; top: number; width: number; height: number } {
	const page = pageEl.getBoundingClientRect();
	return {
		left: ((rect.left - page.left) / page.width) * 100,
		top: ((rect.top - page.top) / page.height) * 100,
		width: (rect.width / page.width) * 100,
		height: (rect.height / page.height) * 100,
	};
}

/**
 * Render highlight rects for an anchor into a layer element. Returns the
 * created rect elements (in DOM order — first covers the top-left, last covers
 * the bottom-right of the selection). Returns null if the anchor doesn't match.
 */
export function renderAnchorRectsInPage(
	pageEl: HTMLElement,
	layer: HTMLElement,
	anchor: PdfAnchor,
	className: string,
): HTMLElement[] | null {
	const rects = computeAnchorRects(pageEl, anchor);
	if (rects === null) return null;

	const elements: HTMLElement[] = [];
	for (const rect of rects) {
		const pct = rectToPagePercent(rect, pageEl);
		const el = document.createElement('div');
		el.className = className;
		el.style.left = `${pct.left}%`;
		el.style.top = `${pct.top}%`;
		el.style.width = `${pct.width}%`;
		el.style.height = `${pct.height}%`;
		layer.appendChild(el);
		elements.push(el);
	}
	return elements;
}
