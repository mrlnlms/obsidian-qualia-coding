/**
 * Highlight geometry computation for PDF text selections.
 * Adapted from obsidian-pdf-plus (MIT) lib/highlights/geometry.ts.
 * Converted from class methods to standalone functions.
 */

import type { Rect, TextContentItem, TextLayerInfo } from './pdfTypings';
import { getNodeAndOffsetOfTextPos } from './pdfViewerAccess';

export type MergedRect = { rect: Rect; indices: number[] };

/**
 * Returns merged rectangles covering the text selection specified by index/offset pairs.
 * Merges adjacent rects on the same line.
 */
export function computeMergedHighlightRects(
	textLayer: TextLayerInfo,
	beginIndex: number,
	beginOffset: number,
	endIndex: number,
	endOffset: number,
): MergedRect[] {
	const { textContentItems, textDivs } = textLayer;
	const results: MergedRect[] = [];

	let mergedRect: Rect | null = null;
	let mergedIndices: number[] = [];

	let adjEndIndex = endIndex;
	let adjEndOffset = endOffset;

	// If selection ends at beginning of an item, move to end of previous item
	if (adjEndOffset === 0 && adjEndIndex > beginIndex) {
		adjEndIndex--;
		adjEndOffset = textContentItems[adjEndIndex]?.str?.length ?? 0;
	}

	for (let index = beginIndex; index <= adjEndIndex; index++) {
		const item = textContentItems[index];
		const textDiv = textDivs[index];
		if (!item || !textDiv || !item.str) continue;

		const rect = computeHighlightRectForItem(
			item, textDiv, index, beginIndex, beginOffset, adjEndIndex, adjEndOffset,
		);
		if (!rect) continue;

		if (!mergedRect) {
			mergedRect = rect;
			mergedIndices = [index];
		} else {
			if (areRectanglesMergeable(mergedRect, rect)) {
				mergedRect = mergeRectangles(mergedRect, rect);
				mergedIndices.push(index);
			} else {
				results.push({ rect: mergedRect, indices: mergedIndices });
				mergedRect = rect;
				mergedIndices = [index];
			}
		}
	}

	if (mergedRect) results.push({ rect: mergedRect, indices: mergedIndices });
	return results;
}

function computeHighlightRectForItem(
	item: TextContentItem, textDiv: HTMLElement, index: number,
	beginIndex: number, beginOffset: number, endIndex: number, endOffset: number,
): Rect | null {
	// If the item has chars property (Obsidian-specific), use character-level bounding
	if (item.chars && item.chars.length >= item.str.length) {
		return computeHighlightRectForItemFromChars(item, index, beginIndex, beginOffset, endIndex, endOffset);
	}
	// Fallback: DOM Range measurement
	return computeHighlightRectForItemFromTextLayer(item, textDiv, index, beginIndex, beginOffset, endIndex, endOffset);
}

function computeHighlightRectForItemFromChars(
	item: TextContentItem, index: number,
	beginIndex: number, beginOffset: number, endIndex: number, endOffset: number,
): Rect | null {
	const chars = item.chars!;

	// Trim chars to match the trimmed str
	const trimmedChars = chars.slice(
		chars.findIndex((c) => c.c === item.str.charAt(0)),
		chars.findLastIndex((c) => c.c === item.str.charAt(item.str.length - 1)) + 1,
	);

	const offsetFrom = index === beginIndex ? beginOffset : 0;
	const offsetTo = (index === endIndex ? Math.min(endOffset, trimmedChars.length) : trimmedChars.length) - 1;

	if (offsetFrom > trimmedChars.length - 1 || offsetTo < 0) return null;

	const charFrom = trimmedChars[offsetFrom];
	const charTo = trimmedChars[offsetTo];
	if (!charFrom || !charTo) return null;

	return [
		Math.min(charFrom.r[0], charTo.r[0]), Math.min(charFrom.r[1], charTo.r[1]),
		Math.max(charFrom.r[2], charTo.r[2]), Math.max(charFrom.r[3], charTo.r[3]),
	];
}

function computeHighlightRectForItemFromTextLayer(
	item: TextContentItem, textDiv: HTMLElement, index: number,
	beginIndex: number, beginOffset: number, endIndex: number, endOffset: number,
): Rect | null {
	const x1 = item.transform[4]!;
	const y1 = item.transform[5]!;
	const x2 = item.transform[4]! + item.width;
	const y2 = item.transform[5]! + item.height;

	const range = document.createRange();

	if (index === beginIndex) {
		const posFrom = getNodeAndOffsetOfTextPos(textDiv, beginOffset);
		if (posFrom) {
			range.setStart(posFrom.node, posFrom.offset);
		} else {
			range.setStartBefore(textDiv);
		}
	} else {
		range.setStartBefore(textDiv);
	}

	if (index === endIndex) {
		const posTo = getNodeAndOffsetOfTextPos(textDiv, endOffset);
		if (posTo) {
			range.setEnd(posTo.node, posTo.offset);
		} else {
			range.setEndAfter(textDiv);
		}
	} else {
		range.setEndAfter(textDiv);
	}

	const rect = range.getBoundingClientRect();
	const parentRect = textDiv.getBoundingClientRect();

	if (parentRect.width === 0 || parentRect.height === 0) return null;

	return [
		x1 + (rect.left - parentRect.left) / parentRect.width * item.width,
		y1 + (rect.bottom - parentRect.bottom) / parentRect.height * item.height,
		x2 - (parentRect.right - rect.right) / parentRect.width * item.width,
		y2 - (parentRect.top - rect.top) / parentRect.height * item.height,
	];
}

function areRectanglesMergeable(rect1: Rect, rect2: Rect): boolean {
	return areRectanglesMergeableHorizontally(rect1, rect2)
		|| areRectanglesMergeableVertically(rect1, rect2);
}

function areRectanglesMergeableHorizontally(rect1: Rect, rect2: Rect): boolean {
	const [, bottom1, , top1] = rect1;
	const [, bottom2, , top2] = rect2;
	const y1 = (bottom1 + top1) / 2;
	const y2 = (bottom2 + top2) / 2;
	const height1 = Math.abs(top1 - bottom1);
	const height2 = Math.abs(top2 - bottom2);
	const threshold = Math.max(height1, height2) * 0.5;
	return Math.abs(y1 - y2) < threshold;
}

function areRectanglesMergeableVertically(rect1: Rect, rect2: Rect): boolean {
	const [left1, bottom1, right1, top1] = rect1;
	const [left2, bottom2, right2, top2] = rect2;
	const width1 = Math.abs(right1 - left1);
	const width2 = Math.abs(right2 - left2);
	const height1 = Math.abs(top1 - bottom1);
	const height2 = Math.abs(top2 - bottom2);
	const threshold = Math.max(width1, width2) * 0.1;
	return Math.abs(left1 - left2) < threshold && Math.abs(right1 - right2) < threshold
		&& height1 / width1 > 0.85 && height2 / width2 > 0.85;
}

function mergeRectangles(...rects: Rect[]): Rect {
	return [
		Math.min(...rects.map(r => r[0])),
		Math.min(...rects.map(r => r[1])),
		Math.max(...rects.map(r => r[2])),
		Math.max(...rects.map(r => r[3])),
	];
}

/**
 * Compute the vertical bounds (as CSS % of page height) for a set of merged rects.
 * Converts from PDF coordinate space (bottom-left origin) to CSS % (top-left origin).
 */
export function getMarkerVerticalBounds(
	mergedRects: MergedRect[],
	pageView: { pdfPage: { view: [number, number, number, number] } },
): { topPct: number; bottomPct: number } | null {
	if (mergedRects.length === 0) return null;

	const viewBox = pageView.pdfPage.view;
	const pageHeight = viewBox[3] - viewBox[1];

	// In PDF coords: y increases upward. rect = [left, bottom, right, top].
	// Find min bottom (lowest point on page) and max top (highest point on page).
	let minBottom = Infinity;
	let maxTop = -Infinity;
	for (const { rect } of mergedRects) {
		minBottom = Math.min(minBottom, rect[1], rect[3]);
		maxTop = Math.max(maxTop, rect[1], rect[3]);
	}

	// Convert to CSS %: mirror Y axis
	const cssTop = 100 * (viewBox[3] - maxTop) / pageHeight;
	const cssBottom = 100 * (viewBox[3] - minBottom) / pageHeight;

	return { topPct: Math.max(0, cssTop), bottomPct: Math.min(100, cssBottom) };
}
