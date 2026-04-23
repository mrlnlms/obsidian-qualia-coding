/**
 * Inverse of resolveMarkerOffsets: given absolute offsets in the consolidated
 * PlainText (coming from a QDPX PlainTextSelection), reconstructs a portable
 * anchor plus the page it lives on.
 */

import type { PdfAnchor } from './pdfCodingTypes';

const CONTEXT_CHARS = 30;

export interface ExtractedAnchor {
	page: number;
	anchor: PdfAnchor;
}

export function extractAnchorFromPlainText(
	plainText: string,
	pageStartOffsets: number[],
	startPosition: number,
	endPosition: number,
): ExtractedAnchor | null {
	if (startPosition < 0 || endPosition > plainText.length || startPosition >= endPosition) {
		return null;
	}

	// Determine the page that owns startPosition (last offset <= startPosition)
	let page = 0;
	for (let i = 0; i < pageStartOffsets.length; i++) {
		if (pageStartOffsets[i]! <= startPosition) page = i;
		else break;
	}

	const pageStart = pageStartOffsets[page]!;
	const pageEnd = pageStartOffsets[page + 1] ?? plainText.length;
	const pageText = plainText.slice(pageStart, pageEnd);

	const localStart = startPosition - pageStart;
	const localEnd = endPosition - pageStart;
	if (localEnd > pageText.length) return null;

	const text = pageText.slice(localStart, localEnd);
	const contextBefore = pageText.slice(Math.max(0, localStart - CONTEXT_CHARS), localStart);
	const contextAfter = pageText.slice(localEnd, localEnd + CONTEXT_CHARS);

	// Align with findAnchor: count prior matches whose contexts also match.
	let occurrenceIndex = 0;
	let searchFrom = 0;
	while (true) {
		const idx = pageText.indexOf(text, searchFrom);
		if (idx < 0 || idx >= localStart) break;
		const before = pageText.slice(Math.max(0, idx - contextBefore.length), idx);
		const after = pageText.slice(idx + text.length, idx + text.length + contextAfter.length);
		if (before === contextBefore && after === contextAfter) occurrenceIndex++;
		searchFrom = idx + 1;
	}

	return { page, anchor: { text, contextBefore, contextAfter, occurrenceIndex } };
}
