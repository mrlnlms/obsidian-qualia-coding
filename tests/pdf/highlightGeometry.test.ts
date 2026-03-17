import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/pdf/pdfViewerAccess', () => ({
	getNodeAndOffsetOfTextPos: () => null,
}));

import {
	computeMergedHighlightRects,
	getMarkerVerticalBounds,
	type MergedRect,
} from '../../src/pdf/highlightGeometry';
import type { Rect, TextContentItem, TextLayerInfo } from '../../src/pdf/pdfTypings';

// ── Factories ────────────────────────────────────────────────

function makeChar(c: string, x1: number, y1: number, x2: number, y2: number) {
	return { c, u: c, r: [x1, y1, x2, y2] as Rect };
}

function makeItemWithChars(
	str: string,
	chars: ReturnType<typeof makeChar>[],
	overrides: Partial<TextContentItem> = {},
): TextContentItem {
	return {
		str,
		chars,
		dir: 'ltr',
		width: 100,
		height: 12,
		transform: [1, 0, 0, 1, 0, 0],
		fontName: 'g_d0_f1',
		hasEOL: false,
		...overrides,
	};
}

function makeItemNoChars(
	str: string,
	tx: number,
	ty: number,
	width: number,
	height: number,
): TextContentItem {
	return {
		str,
		dir: 'ltr',
		width,
		height,
		transform: [1, 0, 0, 1, tx, ty],
		fontName: 'g_d0_f1',
		hasEOL: false,
	};
}

function makeDiv(): HTMLElement {
	return document.createElement('span');
}

function makeTextLayer(
	items: TextContentItem[],
	divs?: HTMLElement[],
): TextLayerInfo {
	return {
		textContentItems: items,
		textDivs: divs ?? items.map(() => makeDiv()),
	};
}

/** Build a simple chars array where each character is 10 units wide on a single line at y=100..112. */
function lineChars(str: string, startX = 0, y = 100, charWidth = 10, charHeight = 12) {
	return [...str].map((c, i) =>
		makeChar(c, startX + i * charWidth, y, startX + (i + 1) * charWidth, y + charHeight),
	);
}

function makePageView(viewBox: [number, number, number, number]) {
	return { pdfPage: { view: viewBox } };
}

// ── computeMergedHighlightRects ──────────────────────────────

describe('computeMergedHighlightRects', () => {
	// 1. Single item, full selection
	it('returns one rect for a single fully-selected item (chars path)', () => {
		const chars = lineChars('Hello');
		const item = makeItemWithChars('Hello', chars);
		const tl = makeTextLayer([item]);

		const result = computeMergedHighlightRects(tl, 0, 0, 0, 5);
		expect(result).toHaveLength(1);
		expect(result[0].rect).toEqual([0, 100, 50, 112]);
		expect(result[0].indices).toEqual([0]);
	});

	// 2. Single item, partial selection (begin/end offsets)
	it('returns a rect covering only the selected characters', () => {
		const chars = lineChars('Hello');
		const item = makeItemWithChars('Hello', chars);
		const tl = makeTextLayer([item]);

		// Select "ell" (offset 1..4)
		const result = computeMergedHighlightRects(tl, 0, 1, 0, 4);
		expect(result).toHaveLength(1);
		expect(result[0].rect).toEqual([10, 100, 40, 112]);
	});

	// 3. Multiple items on same line -> merged into one rect
	it('merges adjacent items on the same line', () => {
		const item1 = makeItemWithChars('Hello ', lineChars('Hello ', 0));
		const item2 = makeItemWithChars('World', lineChars('World', 60));
		const tl = makeTextLayer([item1, item2]);

		const result = computeMergedHighlightRects(tl, 0, 0, 1, 5);
		expect(result).toHaveLength(1);
		// merged: x from 0 to 110, y from 100 to 112
		expect(result[0].rect).toEqual([0, 100, 110, 112]);
		expect(result[0].indices).toEqual([0, 1]);
	});

	// 4. Multiple items on different lines -> separate rects
	it('produces separate rects for items on different lines', () => {
		const item1 = makeItemWithChars('Line1', lineChars('Line1', 0, 200));
		const item2 = makeItemWithChars('Line2', lineChars('Line2', 0, 100));
		const tl = makeTextLayer([item1, item2]);

		const result = computeMergedHighlightRects(tl, 0, 0, 1, 5);
		expect(result).toHaveLength(2);
		expect(result[0].indices).toEqual([0]);
		expect(result[1].indices).toEqual([1]);
	});

	// 5. Empty text layer
	it('returns empty array for empty text layer', () => {
		const tl = makeTextLayer([]);
		const result = computeMergedHighlightRects(tl, 0, 0, 0, 0);
		expect(result).toEqual([]);
	});

	// 6. beginIndex === endIndex with offsets
	it('handles single item with begin and end offsets', () => {
		const chars = lineChars('ABCDEF');
		const item = makeItemWithChars('ABCDEF', chars);
		const tl = makeTextLayer([item]);

		// Select "CD" (offset 2..4)
		const result = computeMergedHighlightRects(tl, 0, 2, 0, 4);
		expect(result).toHaveLength(1);
		expect(result[0].rect).toEqual([20, 100, 40, 112]);
	});

	// 7. endOffset=0 -> adjusts to end of previous item
	it('adjusts endOffset=0 to end of previous item', () => {
		const item1 = makeItemWithChars('ABC', lineChars('ABC', 0));
		const item2 = makeItemWithChars('DEF', lineChars('DEF', 30, 200));
		const tl = makeTextLayer([item1, item2]);

		// endIndex=1, endOffset=0 → should adjust to endIndex=0, endOffset=3
		const result = computeMergedHighlightRects(tl, 0, 0, 1, 0);
		expect(result).toHaveLength(1);
		expect(result[0].rect).toEqual([0, 100, 30, 112]);
		expect(result[0].indices).toEqual([0]);
	});

	// 8. Items with no chars -> falls back to DOM range (jsdom returns zero rects → null)
	it('falls back to DOM range when chars are missing', () => {
		const item = makeItemNoChars('Hello', 50, 200, 100, 12);
		const div = makeDiv();
		div.textContent = 'Hello';
		document.body.appendChild(div);

		// jsdom Range lacks getBoundingClientRect — polyfill with zero rect
		const origCreateRange = document.createRange.bind(document);
		const zeroRect = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
		vi.spyOn(document, 'createRange').mockImplementation(() => {
			const range = origCreateRange();
			range.getBoundingClientRect = () => zeroRect as DOMRect;
			return range;
		});

		const tl = makeTextLayer([item], [div]);

		// parentRect width/height = 0 → returns null → empty result
		const result = computeMergedHighlightRects(tl, 0, 0, 0, 5);
		expect(result).toEqual([]);

		vi.restoreAllMocks();
		document.body.removeChild(div);
	});

	// 9. Missing textDiv -> skipped
	it('skips items where textDiv is missing', () => {
		const item1 = makeItemWithChars('ABC', lineChars('ABC', 0));
		const item2 = makeItemWithChars('DEF', lineChars('DEF', 30));
		// Only provide one div (index 0), leave index 1 undefined
		const tl: TextLayerInfo = {
			textContentItems: [item1, item2],
			textDivs: [makeDiv()],
		};

		const result = computeMergedHighlightRects(tl, 0, 0, 1, 3);
		expect(result).toHaveLength(1);
		expect(result[0].indices).toEqual([0]);
	});

	// 10. Empty string items -> skipped
	it('skips items with empty str', () => {
		const item1 = makeItemWithChars('ABC', lineChars('ABC', 0));
		const item2 = makeItemWithChars('', []);
		const item3 = makeItemWithChars('DEF', lineChars('DEF', 30));
		const tl = makeTextLayer([item1, item2, item3]);

		const result = computeMergedHighlightRects(tl, 0, 0, 2, 3);
		expect(result).toHaveLength(1); // all on same y, merged
		expect(result[0].indices).toEqual([0, 2]);
	});

	// 17. Rectangle merging - horizontal (same line)
	it('merges rects horizontally when on the same line', () => {
		// Three items on the same line
		const item1 = makeItemWithChars('A', lineChars('A', 0, 100));
		const item2 = makeItemWithChars('B', lineChars('B', 10, 100));
		const item3 = makeItemWithChars('C', lineChars('C', 20, 100));
		const tl = makeTextLayer([item1, item2, item3]);

		const result = computeMergedHighlightRects(tl, 0, 0, 2, 1);
		expect(result).toHaveLength(1);
		expect(result[0].indices).toEqual([0, 1, 2]);
	});

	// 18. Rectangle merging - vertical (same column, tall chars)
	it('merges rects vertically when they are tall and aligned', () => {
		// Two tall narrow chars stacked vertically (height/width > 0.85, aligned left/right)
		const tallChar1 = [makeChar('|', 50, 200, 60, 220)]; // width=10, height=20, ratio=2
		const tallChar2 = [makeChar('|', 50, 180, 60, 200)]; // immediately below
		const item1 = makeItemWithChars('|', tallChar1);
		const item2 = makeItemWithChars('|', tallChar2);
		const tl = makeTextLayer([item1, item2]);

		const result = computeMergedHighlightRects(tl, 0, 0, 1, 1);
		expect(result).toHaveLength(1);
		expect(result[0].indices).toEqual([0, 1]);
		expect(result[0].rect).toEqual([50, 180, 60, 220]);
	});

	// 19. Non-mergeable rects stay separate
	it('keeps non-mergeable rects separate', () => {
		// Two items far apart vertically AND horizontally, neither horizontal nor vertical merge
		const chars1 = [makeChar('A', 0, 300, 10, 312)];
		const chars2 = [makeChar('B', 200, 100, 210, 112)];
		const item1 = makeItemWithChars('A', chars1);
		const item2 = makeItemWithChars('B', chars2);
		const tl = makeTextLayer([item1, item2]);

		const result = computeMergedHighlightRects(tl, 0, 0, 1, 1);
		expect(result).toHaveLength(2);
		expect(result[0].indices).toEqual([0]);
		expect(result[1].indices).toEqual([1]);
	});

	it('handles selection within a single character', () => {
		const chars = lineChars('AB');
		const item = makeItemWithChars('AB', chars);
		const tl = makeTextLayer([item]);

		// Select just "A" (offset 0..1)
		const result = computeMergedHighlightRects(tl, 0, 0, 0, 1);
		expect(result).toHaveLength(1);
		expect(result[0].rect).toEqual([0, 100, 10, 112]);
	});

	it('returns empty when beginOffset exceeds chars length', () => {
		const chars = lineChars('AB');
		const item = makeItemWithChars('AB', chars);
		const tl = makeTextLayer([item]);

		const result = computeMergedHighlightRects(tl, 0, 10, 0, 11);
		expect(result).toEqual([]);
	});

	it('handles endOffset larger than string length gracefully', () => {
		const chars = lineChars('ABC');
		const item = makeItemWithChars('ABC', chars);
		const tl = makeTextLayer([item]);

		// endOffset=100, should clamp to trimmedChars.length
		const result = computeMergedHighlightRects(tl, 0, 0, 0, 100);
		expect(result).toHaveLength(1);
		expect(result[0].rect).toEqual([0, 100, 30, 112]);
	});

	it('handles multiple items spanning three lines', () => {
		const item1 = makeItemWithChars('Line1', lineChars('Line1', 0, 300));
		const item2 = makeItemWithChars('Line2', lineChars('Line2', 0, 200));
		const item3 = makeItemWithChars('Line3', lineChars('Line3', 0, 100));
		const tl = makeTextLayer([item1, item2, item3]);

		const result = computeMergedHighlightRects(tl, 0, 0, 2, 5);
		expect(result).toHaveLength(3);
	});

	it('endOffset=0 with beginIndex === endIndex does not adjust', () => {
		const item = makeItemWithChars('ABC', lineChars('ABC', 0));
		const tl = makeTextLayer([item]);

		// beginIndex=0, endIndex=0, endOffset=0 → adjEndIndex stays 0 (not > beginIndex)
		// offsetTo = min(0, 3) - 1 = -1, so null returned
		const result = computeMergedHighlightRects(tl, 0, 0, 0, 0);
		expect(result).toEqual([]);
	});
});

// ── getMarkerVerticalBounds ──────────────────────────────────

describe('getMarkerVerticalBounds', () => {
	// 11. Single rect -> correct CSS % conversion
	it('computes correct CSS % for a single rect', () => {
		// Page viewBox: [0, 0, 612, 792] (US Letter)
		const pageView = makePageView([0, 0, 612, 792]);
		const rects: MergedRect[] = [
			{ rect: [50, 700, 200, 750], indices: [0] },
		];

		const result = getMarkerVerticalBounds(rects, pageView);
		expect(result).not.toBeNull();
		// cssTop = 100 * (792 - 750) / 792 = 100 * 42/792 ≈ 5.303
		// cssBottom = 100 * (792 - 700) / 792 = 100 * 92/792 ≈ 11.616
		expect(result!.topPct).toBeCloseTo(5.303, 2);
		expect(result!.bottomPct).toBeCloseTo(11.616, 2);
	});

	// 12. Multiple rects -> min/max bounds
	it('uses min/max across multiple rects', () => {
		const pageView = makePageView([0, 0, 100, 1000]);
		const rects: MergedRect[] = [
			{ rect: [0, 800, 100, 900], indices: [0] },
			{ rect: [0, 200, 100, 300], indices: [1] },
		];

		const result = getMarkerVerticalBounds(rects, pageView);
		expect(result).not.toBeNull();
		// minBottom = 200, maxTop = 900
		// cssTop = 100 * (1000 - 900) / 1000 = 10
		// cssBottom = 100 * (1000 - 200) / 1000 = 80
		expect(result!.topPct).toBe(10);
		expect(result!.bottomPct).toBe(80);
	});

	// 13. Empty rects -> returns null
	it('returns null for empty rects array', () => {
		const pageView = makePageView([0, 0, 612, 792]);
		const result = getMarkerVerticalBounds([], pageView);
		expect(result).toBeNull();
	});

	// 14. Full page -> 0% to 100%
	it('returns 0% to 100% for full page coverage', () => {
		const pageView = makePageView([0, 0, 612, 792]);
		const rects: MergedRect[] = [
			{ rect: [0, 0, 612, 792], indices: [0] },
		];

		const result = getMarkerVerticalBounds(rects, pageView);
		expect(result).not.toBeNull();
		expect(result!.topPct).toBe(0);
		expect(result!.bottomPct).toBe(100);
	});

	// 15. PDF y-axis inversion (bottom-left to top-left)
	it('inverts PDF y-axis correctly (bottom content has higher CSS %)', () => {
		const pageView = makePageView([0, 0, 612, 792]);
		// Rect near bottom of page (low y values in PDF coords)
		const rects: MergedRect[] = [
			{ rect: [50, 10, 200, 50], indices: [0] },
		];

		const result = getMarkerVerticalBounds(rects, pageView);
		expect(result).not.toBeNull();
		// cssTop = 100 * (792 - 50) / 792 ≈ 93.69
		// cssBottom = 100 * (792 - 10) / 792 ≈ 98.74
		expect(result!.topPct).toBeGreaterThan(90);
		expect(result!.bottomPct).toBeGreaterThan(95);
	});

	// 16. Clamping to 0-100 range
	it('clamps values to 0-100 range', () => {
		const pageView = makePageView([0, 0, 612, 792]);
		// Rect extends beyond page bounds
		const rects: MergedRect[] = [
			{ rect: [0, -50, 612, 850], indices: [0] },
		];

		const result = getMarkerVerticalBounds(rects, pageView);
		expect(result).not.toBeNull();
		// maxTop = 850, cssTop = 100 * (792 - 850) / 792 = negative → clamped to 0
		// minBottom = -50, cssBottom = 100 * (792 - (-50)) / 792 = 106.3 → clamped to 100
		expect(result!.topPct).toBe(0);
		expect(result!.bottomPct).toBe(100);
	});

	it('handles non-zero page origin', () => {
		// viewBox with non-zero y origin: [0, 100, 612, 892] → pageHeight = 792
		const pageView = makePageView([0, 100, 612, 892]);
		const rects: MergedRect[] = [
			{ rect: [50, 500, 200, 600], indices: [0] },
		];

		const result = getMarkerVerticalBounds(rects, pageView);
		expect(result).not.toBeNull();
		// pageHeight = 892 - 100 = 792
		// cssTop = 100 * (892 - 600) / 792 = 100 * 292/792 ≈ 36.87
		// cssBottom = 100 * (892 - 500) / 792 = 100 * 392/792 ≈ 49.49
		expect(result!.topPct).toBeCloseTo(36.87, 1);
		expect(result!.bottomPct).toBeCloseTo(49.49, 1);
	});

	it('handles rect where bottom > top (inverted rect values)', () => {
		const pageView = makePageView([0, 0, 612, 792]);
		// The function takes min/max of rect[1] and rect[3]
		const rects: MergedRect[] = [
			{ rect: [50, 750, 200, 700], indices: [0] },
		];

		const result = getMarkerVerticalBounds(rects, pageView);
		expect(result).not.toBeNull();
		// minBottom = min(750, 700) = 700, maxTop = max(750, 700) = 750
		expect(result!.topPct).toBeCloseTo(5.303, 2);
		expect(result!.bottomPct).toBeCloseTo(11.616, 2);
	});
});
