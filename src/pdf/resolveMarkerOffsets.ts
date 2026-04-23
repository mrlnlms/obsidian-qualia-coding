/**
 * Maps a marker's page-local anchor to absolute offsets in the consolidated
 * PlainText (as produced by buildPlainText). Used at export time.
 */

import { findAnchor } from './textAnchor';
import type { PdfAnchor } from './pdfCodingTypes';

export interface MarkerAnchorLocator extends PdfAnchor {
	page: number;
}

export function resolveMarkerOffsets(
	plainText: string,
	pageStartOffsets: number[],
	marker: MarkerAnchorLocator,
): { start: number; end: number } | null {
	const pageStart = pageStartOffsets[marker.page];
	if (pageStart === undefined) return null;

	const pageEnd = pageStartOffsets[marker.page + 1] ?? plainText.length;
	const pageText = plainText.slice(pageStart, pageEnd);

	const match = findAnchor(
		pageText,
		marker.text,
		marker.contextBefore,
		marker.contextAfter,
		marker.occurrenceIndex,
	);
	if (!match) return null;

	return {
		start: pageStart + match.start,
		end: pageStart + match.end,
	};
}
