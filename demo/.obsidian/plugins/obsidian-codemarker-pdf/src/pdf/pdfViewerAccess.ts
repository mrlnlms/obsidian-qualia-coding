/**
 * PDF viewer access utilities.
 * Adapted from obsidian-pdf-plus (MIT) utils/index.ts.
 */

import type { PDFViewerChild, PDFPageView, TextLayerInfo, TextContentItem, OldTextLayerBuilder, TextLayerBuilder } from '../pdfTypings';

/**
 * Get the PDFViewerChild from a PDF view.
 */
export function getPdfViewerChild(view: any): PDFViewerChild | null {
	return view?.viewer?.child ?? null;
}

/**
 * Get the page element (div.page[data-page-number]) from a DOM node.
 */
export function getPageElFromNode(node: Node): HTMLElement | null {
	let current: Node | null = node;
	while (current) {
		if (current instanceof HTMLElement && current.matches('div.page[data-page-number]')) {
			return current;
		}
		current = current.parentNode;
	}
	return null;
}

/**
 * Find the textLayerNode (span with class textLayerNode) containing the given node.
 * Adapted from app.js via PDF++.
 */
export function getTextLayerNode(pageEl: HTMLElement, node: Node): HTMLElement | null {
	if (!pageEl.contains(node)) return null;

	if (node instanceof HTMLElement && node.classList.contains('textLayerNode')) return node;

	let n: Node | null = node;
	while (n = n.parentNode) {
		if (n === pageEl) return null;
		if (n instanceof HTMLElement && n.classList.contains('textLayerNode')) return n;
	}

	return null;
}

/**
 * Calculate offset within a textLayerNode, accounting for multiple text nodes.
 * Adapted from app.js via PDF++.
 */
export function getOffsetInTextLayerNode(textLayerNode: HTMLElement, node: Node, offsetInNode: number): number | null {
	if (!textLayerNode.contains(node)) return null;

	const iterator = document.createNodeIterator(textLayerNode, NodeFilter.SHOW_TEXT);
	let textNode;
	let offset = offsetInNode;
	while ((textNode = iterator.nextNode()) && node !== textNode) {
		offset += textNode.textContent!.length;
	}

	return offset;
}

/**
 * Get node and offset for a character position within a parent node.
 * Adapted from PDF++.
 */
export function getNodeAndOffsetOfTextPos(node: Node, offset: number): { node: Text, offset: number } | null {
	const iter = document.createNodeIterator(node, NodeFilter.SHOW_TEXT);
	let textNode;
	while ((textNode = iter.nextNode()) && offset >= textNode.textContent!.length) {
		offset -= textNode.textContent!.length;
	}
	return textNode ? { node: textNode as Text, offset } : null;
}

/**
 * Get text layer info (textDivs + textContentItems) from a page view.
 * Compatible with both Obsidian v1.7.7 and v1.8.0+.
 */
export function getTextLayerInfo(pageView: PDFPageView): TextLayerInfo | null {
	const textLayer = pageView.textLayer;
	if (!textLayer) return null;

	// Obsidian v1.8.0+ — TextLayerBuilder has .textLayer property
	if ('textLayer' in textLayer && textLayer.textLayer) {
		const tl = textLayer.textLayer as any;
		return {
			textDivs: tl.textDivs ?? [],
			textContentItems: tl.textContentItems ?? [],
		};
	}

	// Obsidian v1.7.7 — OldTextLayerBuilder has direct properties
	if ('textDivs' in textLayer && 'textContentItems' in textLayer) {
		return {
			textDivs: (textLayer as any).textDivs ?? [],
			textContentItems: (textLayer as any).textContentItems ?? [],
		};
	}

	return null;
}

/**
 * Get the page number from a page element.
 */
export function getPageNumber(pageEl: HTMLElement): number {
	return parseInt(pageEl.getAttribute('data-page-number') ?? '0', 10);
}
