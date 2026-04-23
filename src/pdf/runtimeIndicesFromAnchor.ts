/**
 * Derives runtime indices (beginIndex/beginOffset/endIndex/endOffset) from a
 * portable anchor. Indices are meaningful only while a given page render is
 * live — they feed `computeMergedHighlightRects`, handles positioning, etc.
 * Never persist them; resolve from anchor each time.
 */

import { mapAnchorToDomRange } from './textAnchorRender';
import { getTextLayerNode, getOffsetInTextLayerNode } from './pdfViewerAccess';
import type { PdfAnchor } from './pdfCodingTypes';

export interface RuntimeIndices {
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
}

function resolveLayerIndex(layerNode: HTMLElement): number | null {
	const dataIdx = layerNode.getAttribute('data-idx');
	if (dataIdx !== null) return parseInt(dataIdx, 10);
	const parent = layerNode.parentElement;
	if (!parent) return null;
	const siblings = parent.querySelectorAll('.textLayerNode');
	for (let i = 0; i < siblings.length; i++) {
		if (siblings[i] === layerNode) return i;
	}
	return null;
}

export function runtimeIndicesFromAnchor(
	pageEl: HTMLElement,
	anchor: PdfAnchor,
): RuntimeIndices | null {
	const mapped = mapAnchorToDomRange(pageEl, anchor);
	if (!mapped) return null;

	const startLayer = getTextLayerNode(pageEl, mapped.startContainer);
	const endLayer = getTextLayerNode(pageEl, mapped.endContainer);
	if (!startLayer || !endLayer) return null;

	const beginIndex = resolveLayerIndex(startLayer);
	const endIndex = resolveLayerIndex(endLayer);
	if (beginIndex === null || endIndex === null) return null;

	const beginOffset = getOffsetInTextLayerNode(startLayer, mapped.startContainer, mapped.startOffset);
	const endOffset = getOffsetInTextLayerNode(endLayer, mapped.endContainer, mapped.endOffset);
	if (beginOffset === null || endOffset === null) return null;

	return { beginIndex, beginOffset, endIndex, endOffset };
}
