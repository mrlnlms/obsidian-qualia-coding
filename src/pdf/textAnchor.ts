/**
 * Pure text-anchor resolution.
 *
 * Given a page's plain text and a marker's anchor (text + contexts + occurrence
 * index), finds the {start, end} character offsets within pageText.
 *
 * Semantics:
 * - Lists all occurrences of `text` in pageText
 * - Filters those whose preceding characters match contextBefore AND whose
 *   following characters match contextAfter (empty contexts match anything)
 * - Returns the filtered match at `occurrenceIndex` (0-based)
 * - Returns null if no filtered match exists at that index
 */
export interface AnchorRange {
	start: number;
	end: number;
}

export function findAnchor(
	pageText: string,
	text: string,
	contextBefore: string,
	contextAfter: string,
	occurrenceIndex: number,
): AnchorRange | null {
	if (text.length === 0) return null;

	const matches: AnchorRange[] = [];
	let searchFrom = 0;
	while (true) {
		const idx = pageText.indexOf(text, searchFrom);
		if (idx < 0) break;

		const before = pageText.slice(Math.max(0, idx - contextBefore.length), idx);
		const after = pageText.slice(idx + text.length, idx + text.length + contextAfter.length);

		if (before === contextBefore && after === contextAfter) {
			matches.push({ start: idx, end: idx + text.length });
		}

		searchFrom = idx + 1;
	}

	return matches[occurrenceIndex] ?? null;
}
