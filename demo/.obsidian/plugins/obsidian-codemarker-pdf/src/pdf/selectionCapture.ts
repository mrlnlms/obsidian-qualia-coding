/**
 * Captures a text selection from the PDF viewer and converts it
 * to index-based coordinates for persistent storage.
 */

import {
	getPageElFromNode,
	getTextLayerNode,
	getOffsetInTextLayerNode,
	getPageNumber,
} from './pdfViewerAccess';

export interface PdfSelectionResult {
	file: string;
	page: number;
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
	text: string;
}

/**
 * Capture the current browser selection within a PDF viewer.
 * Returns null if the selection is not within a single PDF page's text layer.
 */
export function capturePdfSelection(filePath: string): PdfSelectionResult | null {
	const selection = document.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

	const range = selection.getRangeAt(0);
	const text = selection.toString().trim();
	if (!text) return null;

	// Find the page element for the start of the selection
	const startPageEl = getPageElFromNode(range.startContainer);
	if (!startPageEl) return null;

	// Ensure the selection is within a single page
	const endPageEl = getPageElFromNode(range.endContainer);
	if (!endPageEl || startPageEl !== endPageEl) return null;

	const page = getPageNumber(startPageEl);
	if (!page) return null;

	// Find textLayerNodes for start and end
	const startTextNode = getTextLayerNode(startPageEl, range.startContainer);
	const endTextNode = getTextLayerNode(startPageEl, range.endContainer);
	if (!startTextNode || !endTextNode) return null;

	// Get data-idx from the textLayerNodes
	const beginIndex = getDataIdx(startTextNode);
	const endIndex = getDataIdx(endTextNode);
	if (beginIndex === null || endIndex === null) return null;

	// Calculate offsets within the textLayerNodes
	const beginOffset = getOffsetInTextLayerNode(startTextNode, range.startContainer, range.startOffset);
	const endOffset = getOffsetInTextLayerNode(endTextNode, range.endContainer, range.endOffset);
	if (beginOffset === null || endOffset === null) return null;

	return {
		file: filePath,
		page,
		beginIndex,
		beginOffset,
		endIndex,
		endOffset,
		text,
	};
}

/**
 * Detect if the current selection spans multiple PDF pages.
 * Returns true if cross-page selection is detected.
 */
export function detectCrossPageSelection(): boolean {
	const selection = document.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;

	const range = selection.getRangeAt(0);
	const startPageEl = getPageElFromNode(range.startContainer);
	const endPageEl = getPageElFromNode(range.endContainer);

	// Both must be in a page, but different pages
	if (startPageEl && endPageEl && startPageEl !== endPageEl) return true;
	return false;
}

/**
 * Extract the data-idx attribute from a textLayerNode.
 * Falls back to finding the index among siblings with textLayerNode class.
 */
function getDataIdx(node: HTMLElement): number | null {
	// Try data-idx attribute first (Obsidian's customized PDF.js)
	const idx = node.getAttribute('data-idx');
	if (idx !== null) return parseInt(idx, 10);

	// Fallback: find index among textLayerNode siblings
	const parent = node.parentElement;
	if (!parent) return null;

	const nodes = parent.querySelectorAll('.textLayerNode');
	for (let i = 0; i < nodes.length; i++) {
		if (nodes[i] === node) return i;
	}

	return null;
}
