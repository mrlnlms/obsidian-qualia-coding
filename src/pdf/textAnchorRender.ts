/**
 * Inverse of textAnchorCapture: given an anchor, finds the DOM range within
 * a page's `.textLayer` that contains the matched text.
 *
 * Uses the same page-layout convention as pdfPlainText.ts (items joined by ' ').
 */

import { findAnchor } from './textAnchor';
import type { PdfAnchor } from './pdfCodingTypes';

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
	nodes: HTMLElement[];
	nodeOffsets: number[]; // parallel to nodes
}

function layoutPage(pageEl: HTMLElement): PageLayout {
	const nodes = orderedTextLayerNodes(pageEl);
	const nodeOffsets: number[] = [];
	let pageText = '';
	for (let i = 0; i < nodes.length; i++) {
		nodeOffsets.push(pageText.length);
		pageText += nodes[i]!.textContent ?? '';
		if (i < nodes.length - 1) pageText += ' ';
	}
	return { pageText, nodes, nodeOffsets };
}

/** Maps a pageText offset to {textNode, offsetInTextNode}. */
function pageOffsetToDomPosition(
	layout: PageLayout,
	pageOffset: number,
): { node: Node; offset: number } | null {
	// Find which layerNode owns this offset (last one with nodeOffset <= pageOffset
	// AND pageOffset < nodeOffset + nodeLength).
	for (let i = layout.nodes.length - 1; i >= 0; i--) {
		const baseOffset = layout.nodeOffsets[i]!;
		if (baseOffset > pageOffset) continue;
		const node = layout.nodes[i]!;
		const nodeLen = node.textContent?.length ?? 0;
		const offsetInLayer = pageOffset - baseOffset;
		if (offsetInLayer > nodeLen) {
			// pageOffset falls in the separator ' ' between this and next node —
			// snap to end of this node.
			return { node: node.firstChild ?? node, offset: nodeLen };
		}
		// Walk text nodes inside the layerNode
		let acc = 0;
		const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
		let current: Node | null = walker.nextNode();
		while (current) {
			const len = current.textContent?.length ?? 0;
			if (acc + len >= offsetInLayer) {
				return { node: current, offset: offsetInLayer - acc };
			}
			acc += len;
			current = walker.nextNode();
		}
		// Fallback: layerNode has no text children, use itself
		return { node, offset: offsetInLayer };
	}
	return null;
}

export interface MappedRange {
	startContainer: Node;
	startOffset: number;
	endContainer: Node;
	endOffset: number;
}

export function mapAnchorToDomRange(
	pageEl: HTMLElement,
	anchor: PdfAnchor,
): MappedRange | null {
	const layout = layoutPage(pageEl);
	const match = findAnchor(
		layout.pageText,
		anchor.text,
		anchor.contextBefore,
		anchor.contextAfter,
		anchor.occurrenceIndex,
	);
	if (!match) return null;

	const start = pageOffsetToDomPosition(layout, match.start);
	const end = pageOffsetToDomPosition(layout, match.end);
	if (!start || !end) return null;

	return {
		startContainer: start.node,
		startOffset: start.offset,
		endContainer: end.node,
		endOffset: end.offset,
	};
}
