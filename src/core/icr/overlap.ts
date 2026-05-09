/**
 * computeOverlap — intersect 2 TextRanges.
 *
 * Returns null se scope difere (fileId ou locator) ou se não há overlap.
 */

import type { TextRange } from './textRange';

export interface CharRange {
	from: number;
	to: number;
}

export function computeOverlap(a: TextRange, b: TextRange): CharRange | null {
	if (a.fileId !== b.fileId || a.locator !== b.locator) return null;
	const from = Math.max(a.from, b.from);
	const to = Math.min(a.to, b.to);
	if (from >= to) return null;
	return { from, to };
}
