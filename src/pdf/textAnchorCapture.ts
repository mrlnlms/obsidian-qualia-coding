/**
 * Captures a text anchor (text + contextBefore + contextAfter + occurrenceIndex)
 * from a DOM range within a PDF page's .textLayer.
 *
 * Mirrors the convention used by pdfPlainText.ts: textLayerNode contents are
 * joined with ' ' to form the page-level text.
 */

import type { PdfAnchor } from './pdfCodingTypes';

const CONTEXT_CHARS = 30;

export interface DomRangeLike {
	startContainer: Node;
	startOffset: number;
	endContainer: Node;
	endOffset: number;
}

/** Returns the `.textLayerNode` ancestor of a node (or the node itself if it's one). */
function findTextLayerNode(node: Node | null): HTMLElement | null {
	let current: Node | null = node;
	while (current) {
		if (current.nodeType === Node.ELEMENT_NODE) {
			const el = current as HTMLElement;
			if (el.classList?.contains('textLayerNode')) return el;
		}
		current = current.parentNode;
	}
	return null;
}

/** Ordered list of textLayerNode children, respecting data-idx when present. */
function orderedTextLayerNodes(pageEl: HTMLElement): HTMLElement[] {
	const nodes = Array.from(pageEl.querySelectorAll<HTMLElement>('.textLayerNode'));
	const hasDataIdx = nodes.some((n) => n.hasAttribute('data-idx'));
	if (!hasDataIdx) return nodes;
	const sorted = [...nodes];
	sorted.sort((a, b) => {
		const ai = parseInt(a.getAttribute('data-idx') ?? '0', 10);
		const bi = parseInt(b.getAttribute('data-idx') ?? '0', 10);
		return ai - bi;
	});
	return sorted;
}

interface PageLayout {
	pageText: string;
	/** For each textLayerNode (in logical order), its starting char offset in pageText. */
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
	container: Node,
	offsetInNode: number,
): number | null {
	const layerNode = findTextLayerNode(container);
	if (!layerNode) return null;
	const baseOffset = layout.nodeOffsets.get(layerNode);
	if (baseOffset === undefined) return null;

	// If container is the layerNode itself, offsetInNode counts child nodes;
	// approximate by summing their textContent lengths.
	if (container === layerNode) {
		let acc = 0;
		for (let i = 0; i < offsetInNode && i < layerNode.childNodes.length; i++) {
			acc += layerNode.childNodes[i]!.textContent?.length ?? 0;
		}
		return baseOffset + acc;
	}

	// Container is (presumably) a descendant text node of layerNode. Walk children
	// in order, accumulating textContent lengths up to `container`, then add offsetInNode.
	let acc = 0;
	const walker = document.createTreeWalker(layerNode, NodeFilter.SHOW_TEXT);
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
	const startOffset = domPositionToPageOffset(layout, range.startContainer, range.startOffset);
	const endOffset = domPositionToPageOffset(layout, range.endContainer, range.endOffset);
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
