/**
 * Contract test: replicates the Obsidian PDF viewer's textLayer DOM structure
 * (nested .textLayerNode — outer spans with data-idx containing inner char spans).
 *
 * Capture → serialize anchor → Render must resolve on the SAME DOM. If this
 * breaks, the capture and render paths diverged.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { captureAnchorFromDomRange } from '../../src/pdf/textAnchorCapture';
import { mapAnchorToDomRange } from '../../src/pdf/textAnchorRender';

/**
 * Build a pageEl that mirrors the Obsidian/pdf.js structure:
 *
 *   <div class="page">
 *     <div class="textLayer">
 *       <span class="textLayerNode" data-idx="0">
 *         <span class="textLayerNode">T</span>
 *         <span class="textLayerNode">h</span>
 *         <span class="textLayerNode">e</span>
 *         ...
 *       </span>
 *       <span class="textLayerNode" data-idx="1">...</span>
 *     </div>
 *   </div>
 *
 * Outer spans have data-idx; inner spans do not.
 */
function makeNestedTextLayer(outerTexts: string[]): HTMLElement {
	const page = document.createElement('div');
	page.className = 'page';
	const textLayer = document.createElement('div');
	textLayer.className = 'textLayer';
	outerTexts.forEach((text, i) => {
		const outer = document.createElement('span');
		outer.className = 'textLayerNode';
		outer.setAttribute('data-idx', String(i));
		for (const ch of text) {
			const inner = document.createElement('span');
			inner.className = 'textLayerNode';
			inner.textContent = ch;
			outer.appendChild(inner);
		}
		textLayer.appendChild(outer);
	});
	page.appendChild(textLayer);
	document.body.appendChild(page);
	return page;
}

describe('anchor capture ↔ render contract with Obsidian-style nested textLayer', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('pageText built by layoutPage must NOT contain duplicated outer text', () => {
		const page = makeNestedTextLayer(['abc', 'def']);
		// Expected pageText: "abc def" (len 7). If bug: "abcabc defdef" or similar.
		// We assert by probing capture round-trip.
		const outer0 = page.querySelector<HTMLElement>('.textLayerNode[data-idx="0"]')!;
		const aNode = outer0.children[0]!.firstChild!; // 'a'
		const cNode = outer0.children[2]!.firstChild!; // 'c'

		const anchor = captureAnchorFromDomRange(page, {
			startContainer: aNode,
			startOffset: 0,
			endContainer: cNode,
			endOffset: 1,
		});
		expect(anchor).not.toBeNull();
		expect(anchor!.text).toBe('abc'); // NOT "abc" + garbage
	});

	it('round-trip: capture anchor from nested DOM → render resolves on the SAME DOM', () => {
		const page = makeNestedTextLayer(['The quick brown fox', 'jumps over the lazy dog']);
		// Select "quick brown" — starts at char index 4 (q) of outer[0]
		const outer0 = page.querySelector<HTMLElement>('.textLayerNode[data-idx="0"]')!;
		const qNode = outer0.children[4]!.firstChild!; // 'q'
		const nNode = outer0.children[14]!.firstChild!; // 'n' (end of 'brown')
		const anchor = captureAnchorFromDomRange(page, {
			startContainer: qNode,
			startOffset: 0,
			endContainer: nNode,
			endOffset: 1,
		});
		expect(anchor).not.toBeNull();
		expect(anchor!.text).toBe('quick brown');

		// Now render: resolve the anchor back to a DOM range
		const mapped = mapAnchorToDomRange(page, anchor!);
		expect(mapped).not.toBeNull();
	});

	it('round-trip: selection that spans two outer nodes', () => {
		const page = makeNestedTextLayer(['Hello', 'World']);
		// pageText = "Hello World"; select "lo Wo" (offset 3..8 in pageText)
		const outer0 = page.querySelector<HTMLElement>('.textLayerNode[data-idx="0"]')!;
		const outer1 = page.querySelector<HTMLElement>('.textLayerNode[data-idx="1"]')!;
		const lNode = outer0.children[3]!.firstChild!; // 'l' (2nd)
		const oNode = outer1.children[1]!.firstChild!; // 'o'
		const anchor = captureAnchorFromDomRange(page, {
			startContainer: lNode,
			startOffset: 0,
			endContainer: oNode,
			endOffset: 1,
		});
		expect(anchor).not.toBeNull();
		expect(anchor!.text).toBe('lo Wo');

		const mapped = mapAnchorToDomRange(page, anchor!);
		expect(mapped).not.toBeNull();
	});

	it('flat layer (no nesting) still works — backwards compatibility', () => {
		// Plain textLayer without inner char spans
		const page = document.createElement('div');
		const textLayer = document.createElement('div');
		textLayer.className = 'textLayer';
		['hello', 'world'].forEach((t, i) => {
			const span = document.createElement('span');
			span.className = 'textLayerNode';
			span.setAttribute('data-idx', String(i));
			span.textContent = t;
			textLayer.appendChild(span);
		});
		page.appendChild(textLayer);
		document.body.appendChild(page);

		const textNode = textLayer.children[0]!.firstChild!;
		const anchor = captureAnchorFromDomRange(page, {
			startContainer: textNode,
			startOffset: 1,
			endContainer: textNode,
			endOffset: 4,
		});
		expect(anchor!.text).toBe('ell');
		const mapped = mapAnchorToDomRange(page, anchor!);
		expect(mapped).not.toBeNull();
	});
});
