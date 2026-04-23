/**
 * For the QDPX importer: given PlainTextSelection offsets, extracts the text
 * and the page number it belongs to.
 */

export interface ExtractedSelection {
	page: number;
	text: string;
}

export function extractAnchorFromPlainText(
	plainText: string,
	pageStartOffsets: number[],
	startPosition: number,
	endPosition: number,
): ExtractedSelection | null {
	if (startPosition < 0 || endPosition > plainText.length || startPosition >= endPosition) {
		return null;
	}

	let pageIdx = 0;
	for (let i = 0; i < pageStartOffsets.length; i++) {
		if (pageStartOffsets[i]! <= startPosition) pageIdx = i;
		else break;
	}

	const text = plainText.slice(startPosition, endPosition);
	// Convert 0-based page index to 1-based (consistent with the viewer).
	return { page: pageIdx + 1, text };
}
