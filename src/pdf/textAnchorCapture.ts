/**
 * Captures a text anchor (text + contextBefore + contextAfter + occurrenceIndex)
 * from a DOM range within a PDF page's .textLayer.
 *
 * Handles Obsidian's nested textLayerNode structure (each char can be its own
 * span inside an outer span with data-idx). Only outer spans are used for
 * pageText composition.
 */

import type { PdfAnchor } from './pdfCodingTypes';

const CONTEXT_CHARS = 30;

export interface DomRangeLike {
	startContainer: Node;
	startOffset: number;
	endContainer: Node;
	endOffset: number;
}

/**
 * Returns the OUTERMOST `.textLayerNode` ancestor of a node (the one that's
 * a direct child of `.textLayer`, not a nested char span).
 */
function findOuterTextLayerNode(node: Node | null, pageEl: HTMLElement): HTMLElement | null {
	let outermost: HTMLElement | null = null;
	let current: Node | null = node;
	while (current && current !== pageEl) {
		if (current.nodeType === Node.ELEMENT_NODE) {
			const el = current as HTMLElement;
			if (el.classList?.contains('textLayerNode')) {
				outermost = el;
			}
		}
		current = current.parentNode;
	}
	return outermost;
}

/**
 * Ordered list of OUTER `.textLayerNode` elements (ignoring any nested
 * `.textLayerNode` descendants used for per-char positioning).
 * Sorted by data-idx when present; falls back to DOM order.
 */
function orderedTextLayerNodes(pageEl: HTMLElement): HTMLElement[] {
	const all = Array.from(pageEl.querySelectorAll<HTMLElement>('.textLayerNode'));
	const outer = all.filter((node) => {
		let p = node.parentElement;
		while (p && p !== pageEl) {
			if (p.classList.contains('textLayerNode')) return false;
			p = p.parentElement;
		}
		return true;
	});
	const hasDataIdx = outer.some((n) => n.hasAttribute('data-idx'));
	if (!hasDataIdx) return outer;
	return outer.slice().sort((a, b) => {
		const ai = parseInt(a.getAttribute('data-idx') ?? '0', 10);
		const bi = parseInt(b.getAttribute('data-idx') ?? '0', 10);
		return ai - bi;
	});
}

interface PageLayout {
	pageText: string;
	/** For each outer textLayerNode (in logical order), its starting char offset in pageText. */
	nodeOffsets: Map<HTMLElement, number>;
}

function layoutPage(pageEl: HTMLElement): PageLayout {
	const nodes = orderedTextLayerNodes(pageEl);
	const nodeOffsets = new Map<HTMLElement, number>();
	let pageText = '';
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]!;
		nodeOffsets.set(node, pageText.length);
		pageText += node.textContent ?? '';
		if (i < nodes.length - 1) pageText += ' ';
	}
	return { pageText, nodeOffsets };
}

/** Maps a (node, offsetInNode) position into its char offset in pageText. */
function domPositionToPageOffset(
	layout: PageLayout,
	pageEl: HTMLElement,
	container: Node,
	offsetInNode: number,
): number | null {
	const outer = findOuterTextLayerNode(container, pageEl);
	if (!outer) return null;
	const baseOffset = layout.nodeOffsets.get(outer);
	if (baseOffset === undefined) return null;

	// If container is the outer itself, offsetInNode counts child nodes (element or text);
	// sum their textContent lengths up to offsetInNode.
	if (container === outer) {
		let acc = 0;
		for (let i = 0; i < offsetInNode && i < outer.childNodes.length; i++) {
			acc += outer.childNodes[i]!.textContent?.length ?? 0;
		}
		return baseOffset + acc;
	}

	// Container is a descendant — walk text nodes inside `outer` in document order
	// until we hit the container, accumulating lengths.
	let acc = 0;
	const walker = document.createTreeWalker(outer, NodeFilter.SHOW_TEXT);
	let current: Node | null = walker.nextNode();
	while (current) {
		if (current === container) {
			return baseOffset + acc + Math.min(offsetInNode, current.textContent?.length ?? 0);
		}
		acc += current.textContent?.length ?? 0;
		current = walker.nextNode();
	}
	return null;
}

export function captureAnchorFromDomRange(
	pageEl: HTMLElement,
	range: DomRangeLike,
): PdfAnchor | null {
	const layout = layoutPage(pageEl);
	const startOffset = domPositionToPageOffset(layout, pageEl, range.startContainer, range.startOffset);
	const endOffset = domPositionToPageOffset(layout, pageEl, range.endContainer, range.endOffset);
	if (startOffset === null || endOffset === null) return null;
	if (endOffset <= startOffset) return null;

	const text = layout.pageText.slice(startOffset, endOffset);
	const contextBefore = layout.pageText.slice(Math.max(0, startOffset - CONTEXT_CHARS), startOffset);
	const contextAfter = layout.pageText.slice(endOffset, endOffset + CONTEXT_CHARS);

	// occurrenceIndex counts prior matches whose contexts ALSO match — aligned with findAnchor.
	let occurrenceIndex = 0;
	let searchFrom = 0;
	while (true) {
		const idx = layout.pageText.indexOf(text, searchFrom);
		if (idx < 0 || idx >= startOffset) break;
		const before = layout.pageText.slice(Math.max(0, idx - contextBefore.length), idx);
		const after = layout.pageText.slice(idx + text.length, idx + text.length + contextAfter.length);
		if (before === contextBefore && after === contextAfter) occurrenceIndex++;
		searchFrom = idx + 1;
	}

	return { text, contextBefore, contextAfter, occurrenceIndex };
}
