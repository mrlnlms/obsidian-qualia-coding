/**
 * For the QDPX exporter: resolve absolute offsets in the consolidated
 * PlainText for a (page, text) pair.
 *
 * Strategy:
 *   1. Direct indexOf within the page. If hit, done.
 *   2. Otherwise, normalize whitespace (collapse `\s+` → single space) on both
 *      pageText and the marker text; search in the normalized version and map
 *      back to original offsets. Handles PDFs where pdfjs getTextContent()
 *      joins items with extra whitespace that the Obsidian DOM doesn't show.
 *
 * Returns `ambiguous: true` when the text appears more than once on the page.
 */

export interface OffsetResult {
	start: number;
	end: number;
	ambiguous: boolean;
}

/** Collapse runs of whitespace to a single space, keep a map back to original positions. */
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
	origIndex.push(src.length); // sentinel for end-of-string mapping
	return { text: out.join(''), origIndex };
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

	// Fast path: direct exact match
	const direct = pageText.indexOf(marker.text);
	if (direct >= 0) {
		const second = pageText.indexOf(marker.text, direct + 1);
		return {
			start: pageStart + direct,
			end: pageStart + direct + marker.text.length,
			ambiguous: second >= 0,
		};
	}

	// Fallback: normalize whitespace on both sides, then search
	const normPage = normalizeWithMap(pageText);
	const normMarker = marker.text.replace(/\s+/g, ' ').trim();
	if (normMarker.length === 0) return null;

	const normIdx = normPage.text.indexOf(normMarker);
	if (normIdx < 0) return null;

	const origStart = normPage.origIndex[normIdx];
	const origEnd = normPage.origIndex[normIdx + normMarker.length];
	if (origStart === undefined || origEnd === undefined) return null;

	const normSecond = normPage.text.indexOf(normMarker, normIdx + 1);

	return {
		start: pageStart + origStart,
		end: pageStart + origEnd,
		ambiguous: normSecond >= 0,
	};
}
