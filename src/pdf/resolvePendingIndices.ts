/**
 * Resolves DOM indices for imported markers that have placeholder (0,0,0,0)
 * indices. Uses text-search in the page's outer `.textLayerNode` elements.
 *
 * Runs on page render: if a marker is pending AND its text can be found,
 * indices are computed and written back to the marker (silent save). After
 * that, the normal render path pints the highlight.
 */

import type { PdfMarker } from './pdfCodingTypes';

export interface ResolvedIndices {
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
}

/** A marker is "pending" when all indices are zero — the state produced by
 *  qdpxImporter when it lacks DOM info. Selections from the viewer always
 *  produce non-zero indices (empty selections are rejected), so false positives
 *  are not a concern. */
export function isMarkerPending(marker: PdfMarker): boolean {
	return marker.beginIndex === 0 && marker.beginOffset === 0
		&& marker.endIndex === 0 && marker.endOffset === 0;
}

function orderedOuterTextLayerNodes(pageEl: HTMLElement): HTMLElement[] {
	const all = Array.from(pageEl.querySelectorAll<HTMLElement>('.textLayerNode'));
	const outer = all.filter((n) => {
		let p = n.parentElement;
		while (p && p !== pageEl) {
			if (p.classList.contains('textLayerNode')) return false;
			p = p.parentElement;
		}
		return true;
	});
	const hasDataIdx = outer.some((n) => n.hasAttribute('data-idx'));
	if (!hasDataIdx) return outer;
	return outer.slice().sort((a, b) => {
		return parseInt(a.getAttribute('data-idx') ?? '0', 10)
			- parseInt(b.getAttribute('data-idx') ?? '0', 10);
	});
}

/** Collapse runs of whitespace to a single space, keep map back to src position. */
function normalizeWithMap(src: string): { text: string; origIndex: number[] } {
	const out: string[] = [];
	const origIndex: number[] = [];
	let lastWasSpace = false;
	for (let i = 0; i < src.length; i++) {
		const ch = src[i]!;
		const isSpace = /\s/.test(ch);
		if (isSpace) {
			if (lastWasSpace) continue;
			out.push(' ');
			origIndex.push(i);
			lastWasSpace = true;
		} else {
			out.push(ch);
			origIndex.push(i);
			lastWasSpace = false;
		}
	}
	origIndex.push(src.length);
	return { text: out.join(''), origIndex };
}

export function resolvePendingIndices(pageEl: HTMLElement, text: string): ResolvedIndices | null {
	const nodes = orderedOuterTextLayerNodes(pageEl);
	if (nodes.length === 0) return null;

	const nodeStarts: number[] = [];
	let pageText = '';
	for (let i = 0; i < nodes.length; i++) {
		nodeStarts.push(pageText.length);
		pageText += nodes[i]!.textContent ?? '';
		if (i < nodes.length - 1) pageText += ' ';
	}

	// Try direct first, fall back to whitespace-normalized search.
	let origStart = pageText.indexOf(text);
	let origEnd = origStart >= 0 ? origStart + text.length : -1;

	if (origStart < 0) {
		const normPage = normalizeWithMap(pageText);
		const normText = text.replace(/\s+/g, ' ').trim();
		if (normText.length === 0) return null;
		const normIdx = normPage.text.indexOf(normText);
		if (normIdx < 0) return null;
		const s = normPage.origIndex[normIdx];
		const e = normPage.origIndex[normIdx + normText.length];
		if (s === undefined || e === undefined) return null;
		origStart = s;
		origEnd = e;
	}

	const findPosition = (pageOffset: number) => {
		for (let i = nodes.length - 1; i >= 0; i--) {
			const base = nodeStarts[i]!;
			if (base > pageOffset) continue;
			const nodeLen = nodes[i]!.textContent?.length ?? 0;
			const offsetInNode = Math.min(nodeLen, pageOffset - base);
			const idxAttr = nodes[i]!.getAttribute('data-idx');
			const index = idxAttr !== null ? parseInt(idxAttr, 10) : i;
			return { index, offsetInNode };
		}
		return null;
	};

	const begin = findPosition(origStart);
	const end = findPosition(origEnd);
	if (!begin || !end) return null;

	return {
		beginIndex: begin.index,
		beginOffset: begin.offsetInNode,
		endIndex: end.index,
		endOffset: end.offsetInNode,
	};
}
