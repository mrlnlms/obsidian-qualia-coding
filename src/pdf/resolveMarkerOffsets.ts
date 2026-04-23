/**
 * For the QDPX exporter: resolve absolute offsets in the consolidated
 * PlainText for a given (page, text) from a marker. Uses indexOf within
 * the target page. Returns ambiguous=true when text appears more than once
 * on the page (exporter emits a warning).
 */

export interface OffsetResult {
	start: number;
	end: number;
	ambiguous: boolean;
}

export function resolveMarkerOffsets(
	plainText: string,
	pageStartOffsets: number[],
	marker: { page: number; text: string },
): OffsetResult | null {
	const pageStart = pageStartOffsets[marker.page];
	if (pageStart === undefined) return null;
	const pageEnd = pageStartOffsets[marker.page + 1] ?? plainText.length;
	const pageText = plainText.slice(pageStart, pageEnd);

	const first = pageText.indexOf(marker.text);
	if (first < 0) return null;

	const second = pageText.indexOf(marker.text, first + 1);
	return {
		start: pageStart + first,
		end: pageStart + first + marker.text.length,
		ambiguous: second >= 0,
	};
}
