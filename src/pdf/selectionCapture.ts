/**
 * Captures a text selection from the PDF viewer and converts it
 * to a portable PdfAnchor (text + contextBefore + contextAfter + occurrenceIndex).
 */

import { getPageElFromNode, getPageNumber } from './pdfViewerAccess';
import { captureAnchorFromDomRange } from './textAnchorCapture';
import type { PDFViewerChild } from './pdfTypings';
import type { PdfAnchor } from './pdfCodingTypes';

export interface PdfSelectionResult {
	file: string;
	page: number;
	anchor: PdfAnchor;
}

/**
 * Capture the current browser selection within a PDF viewer.
 * Returns null if the selection is not within a single PDF page's text layer.
 */
export function capturePdfSelection(filePath: string): PdfSelectionResult | null {
	const selection = document.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

	const range = selection.getRangeAt(0);
	if (selection.toString().trim() === '') return null;

	const startPageEl = getPageElFromNode(range.startContainer);
	if (!startPageEl) return null;

	const endPageEl = getPageElFromNode(range.endContainer);
	if (!endPageEl || startPageEl !== endPageEl) return null;

	const pageOneBased = getPageNumber(startPageEl);
	if (!pageOneBased) return null;

	const anchor = captureAnchorFromDomRange(startPageEl, range);
	if (!anchor) return null;

	// Schema stores 0-based page index; viewer's data-page-number is 1-based.
	return { file: filePath, page: pageOneBased - 1, anchor };
}

/**
 * Detect if the current selection spans multiple PDF pages.
 */
export function detectCrossPageSelection(): boolean {
	const selection = document.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;

	const range = selection.getRangeAt(0);
	const startPageEl = getPageElFromNode(range.startContainer);
	const endPageEl = getPageElFromNode(range.endContainer);

	if (startPageEl && endPageEl && startPageEl !== endPageEl) return true;
	return false;
}

/**
 * Capture a cross-page selection. One PdfSelectionResult per page.
 */
export function captureCrossPageSelection(
	filePath: string,
	child: PDFViewerChild,
): PdfSelectionResult[] | null {
	const selection = document.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

	const range = selection.getRangeAt(0);
	const startPageEl = getPageElFromNode(range.startContainer);
	const endPageEl = getPageElFromNode(range.endContainer);
	if (!startPageEl || !endPageEl || startPageEl === endPageEl) return null;

	const startPage = getPageNumber(startPageEl);
	const endPage = getPageNumber(endPageEl);
	if (!startPage || !endPage || startPage >= endPage) return null;

	const results: PdfSelectionResult[] = [];

	for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
		let pageView;
		try {
			pageView = child.getPage(pageNum);
		} catch {
			continue;
		}
		if (!pageView) continue;
		const pageEl = pageView.div;
		const nodes = pageEl.querySelectorAll<HTMLElement>('.textLayerNode');
		if (nodes.length === 0) continue;

		const firstNode = nodes[0]!;
		const lastNode = nodes[nodes.length - 1]!;
		const firstTextNode = firstNode.firstChild ?? firstNode;
		const lastTextNode = lastNode.firstChild ?? lastNode;
		const lastLen = lastNode.textContent?.length ?? 0;

		let rangeLike;
		if (pageNum === startPage) {
			rangeLike = {
				startContainer: range.startContainer,
				startOffset: range.startOffset,
				endContainer: lastTextNode,
				endOffset: lastLen,
			};
		} else if (pageNum === endPage) {
			rangeLike = {
				startContainer: firstTextNode,
				startOffset: 0,
				endContainer: range.endContainer,
				endOffset: range.endOffset,
			};
		} else {
			rangeLike = {
				startContainer: firstTextNode,
				startOffset: 0,
				endContainer: lastTextNode,
				endOffset: lastLen,
			};
		}

		const anchor = captureAnchorFromDomRange(pageEl, rangeLike);
		if (!anchor) continue;
		// Viewer data-page-number is 1-based; schema uses 0-based.
		results.push({ file: filePath, page: pageNum - 1, anchor });
	}

	return results.length > 0 ? results : null;
}
