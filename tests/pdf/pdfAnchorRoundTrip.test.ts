/**
 * Round-trip integration test:
 * DOM → capture anchor → resolve offsets in consolidated PlainText → QDPX-ish
 * → extractAnchorFromPlainText → find anchor in (possibly different) DOM.
 *
 * Uses a mocked pdfjs-like doc + jsdom DOM, so it doesn't need real PDF rendering.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildPlainText, type PdfLikeDocument } from '../../src/pdf/pdfPlainText';
import { captureAnchorFromDomRange } from '../../src/pdf/textAnchorCapture';
import { resolveMarkerOffsets } from '../../src/pdf/resolveMarkerOffsets';
import { extractAnchorFromPlainText } from '../../src/pdf/extractAnchorFromPlainText';
import { findAnchor } from '../../src/pdf/textAnchor';

function makePageEl(nodeTexts: string[]): HTMLElement {
	const page = document.createElement('div');
	for (const text of nodeTexts) {
		const span = document.createElement('span');
		span.className = 'textLayerNode';
		span.textContent = text;
		page.appendChild(span);
	}
	document.body.appendChild(page);
	return page;
}

function makeDoc(pagesItems: string[][]): PdfLikeDocument {
	return {
		numPages: pagesItems.length,
		getPage: async (n: number) => ({
			getTextContent: async () => ({ items: pagesItems[n - 1]!.map((str) => ({ str })) }),
		}),
	};
}

describe('PDF anchor round-trip (export → import)', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('round-trip preserva seleção dentro de uma única página', async () => {
		// 1. User seleciona "quick brown fox" na página 0 do viewer
		const page = makePageEl(['The quick brown fox jumps']);
		const textNode = page.firstElementChild!.firstChild!;
		const originalRange = { startContainer: textNode, startOffset: 4, endContainer: textNode, endOffset: 19 };
		const originalAnchor = captureAnchorFromDomRange(page, originalRange)!;
		expect(originalAnchor.text).toBe('quick brown fox');

		// 2. Export: monta PlainText do doc pdfjs (mesmo content dos textLayerNodes)
		const doc = makeDoc([['The quick brown fox jumps']]);
		const { plainText, pageStartOffsets } = await buildPlainText(doc);

		const offsets = resolveMarkerOffsets(plainText, pageStartOffsets, { page: 0, ...originalAnchor })!;
		expect(plainText.slice(offsets.start, offsets.end)).toBe('quick brown fox');

		// 3. Import em outro vault: extrai anchor das offsets
		const extracted = extractAnchorFromPlainText(plainText, pageStartOffsets, offsets.start, offsets.end)!;
		expect(extracted.page).toBe(0);
		expect(extracted.anchor).toEqual(originalAnchor);

		// 4. Novo DOM render (mesmo texto, digamos que o destino tem o mesmo PDF) — resolve anchor
		const destPage = makePageEl(['The quick brown fox jumps']);
		const destMatch = findAnchor(
			Array.from(destPage.querySelectorAll('.textLayerNode')).map((n) => n.textContent ?? '').join(' '),
			extracted.anchor.text,
			extracted.anchor.contextBefore,
			extracted.anchor.contextAfter,
			extracted.anchor.occurrenceIndex,
		);
		expect(destMatch).toEqual({ start: 4, end: 19 });
	});

	it('round-trip entre páginas diferentes preserva page number', async () => {
		const page0 = makePageEl(['Page one content']);
		const page1 = makePageEl(['Page two content']);

		// Seleciona "two" na page1
		const textNode = page1.firstElementChild!.firstChild!;
		const originalAnchor = captureAnchorFromDomRange(page1, {
			startContainer: textNode,
			startOffset: 5,
			endContainer: textNode,
			endOffset: 8,
		})!;
		expect(originalAnchor.text).toBe('two');

		// PDF doc tem 2 páginas
		const doc = makeDoc([['Page one content'], ['Page two content']]);
		const { plainText, pageStartOffsets } = await buildPlainText(doc);

		const offsets = resolveMarkerOffsets(plainText, pageStartOffsets, { page: 1, ...originalAnchor })!;

		const extracted = extractAnchorFromPlainText(plainText, pageStartOffsets, offsets.start, offsets.end)!;
		expect(extracted.page).toBe(1);
		expect(extracted.anchor).toEqual(originalAnchor);
	});

	it('round-trip preserva occurrenceIndex (contexts idênticos)', async () => {
		// Texto onde o mesmo padrão de context repete — só occurrenceIndex desambigua
		const page = makePageEl(['abc xy abc xy abc']);
		const textNode = page.firstElementChild!.firstChild!;
		// Seleciona o SEGUNDO "abc" (offset 7..10) — contextBefore='xy ', contextAfter=' xy'
		// O terceiro "abc" também tem contextBefore='xy ' e contextAfter='' (truncado no fim)
		// então pode ou não duplicar context. Vou testar cenário com 3 matches e context idêntico.
		const originalAnchor = captureAnchorFromDomRange(page, {
			startContainer: textNode,
			startOffset: 7,
			endContainer: textNode,
			endOffset: 10,
		})!;
		expect(originalAnchor.text).toBe('abc');

		const doc = makeDoc([['abc xy abc xy abc']]);
		const { plainText, pageStartOffsets } = await buildPlainText(doc);
		const offsets = resolveMarkerOffsets(plainText, pageStartOffsets, { page: 0, ...originalAnchor })!;
		expect(plainText.slice(offsets.start, offsets.end)).toBe('abc');

		const extracted = extractAnchorFromPlainText(plainText, pageStartOffsets, offsets.start, offsets.end)!;
		// Contract: capture e extract concordam
		expect(extracted.anchor).toEqual(originalAnchor);
	});
});
