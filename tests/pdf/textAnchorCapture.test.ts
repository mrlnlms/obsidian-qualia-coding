/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { captureAnchorFromDomRange } from '../../src/pdf/textAnchorCapture';

/**
 * Builds a pageEl with N `.textLayerNode` children, each wrapping a single text node.
 * Mirrors how pdfjs textLayerBuilder renders (one span per textItem, with text content).
 */
function makePageEl(nodeTexts: string[]): HTMLElement {
	const page = document.createElement('div');
	page.className = 'textLayer';
	for (const text of nodeTexts) {
		const span = document.createElement('span');
		span.className = 'textLayerNode';
		span.textContent = text;
		page.appendChild(span);
	}
	return page;
}

function makeRange(
	startNode: Node,
	startOffset: number,
	endNode: Node,
	endOffset: number,
): { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number } {
	return { startContainer: startNode, startOffset, endContainer: endNode, endOffset };
}

describe('captureAnchorFromDomRange', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('captura seleção dentro de um único textLayerNode', () => {
		const page = makePageEl(['hello world foo']);
		document.body.appendChild(page);
		const textNode = page.firstElementChild!.firstChild!;
		// selecionando "world" (offset 6..11)
		const range = makeRange(textNode, 6, textNode, 11);
		const anchor = captureAnchorFromDomRange(page, range);
		expect(anchor).not.toBeNull();
		expect(anchor!.text).toBe('world');
		expect(anchor!.contextBefore).toBe('hello ');
		expect(anchor!.contextAfter).toBe(' foo');
		expect(anchor!.occurrenceIndex).toBe(0);
	});

	it('captura seleção que atravessa dois textLayerNode', () => {
		// pageText = "abc def" (joined com ' ')
		const page = makePageEl(['abc', 'def']);
		document.body.appendChild(page);
		const node1 = page.children[0]!.firstChild!;
		const node2 = page.children[1]!.firstChild!;
		// selecionando "c d" — offset 2 no primeiro (final do "c") até offset 1 no segundo (depois do "d")
		// no pageText "abc def", "c d" está em offsets 2..5
		const range = makeRange(node1, 2, node2, 1);
		const anchor = captureAnchorFromDomRange(page, range);
		expect(anchor).not.toBeNull();
		expect(anchor!.text).toBe('c d');
		expect(anchor!.contextBefore).toBe('ab');
		expect(anchor!.contextAfter).toBe('ef');
	});

	it('contextBefore truncado quando seleção está no início da página', () => {
		const page = makePageEl(['hello world']);
		document.body.appendChild(page);
		const textNode = page.firstElementChild!.firstChild!;
		const range = makeRange(textNode, 0, textNode, 5);
		const anchor = captureAnchorFromDomRange(page, range);
		expect(anchor!.text).toBe('hello');
		expect(anchor!.contextBefore).toBe('');
		expect(anchor!.contextAfter).toBe(' world');
		expect(anchor!.contextAfter.length).toBeLessThanOrEqual(30);
	});

	it('contextAfter truncado quando seleção está no fim da página', () => {
		const page = makePageEl(['hello world']);
		document.body.appendChild(page);
		const textNode = page.firstElementChild!.firstChild!;
		const range = makeRange(textNode, 6, textNode, 11);
		const anchor = captureAnchorFromDomRange(page, range);
		expect(anchor!.text).toBe('world');
		expect(anchor!.contextAfter).toBe('');
	});

	it('occurrenceIndex conta ocorrências anteriores do text na pageText', () => {
		// pageText = "foo bar foo baz"
		const page = makePageEl(['foo bar foo baz']);
		document.body.appendChild(page);
		const textNode = page.firstElementChild!.firstChild!;
		// seleciona o segundo "foo" (offset 8..11)
		const range = makeRange(textNode, 8, textNode, 11);
		const anchor = captureAnchorFromDomRange(page, range);
		expect(anchor!.text).toBe('foo');
		expect(anchor!.occurrenceIndex).toBe(1);
	});

	it('occurrenceIndex=0 quando text é único', () => {
		const page = makePageEl(['alpha beta gamma']);
		document.body.appendChild(page);
		const textNode = page.firstElementChild!.firstChild!;
		const range = makeRange(textNode, 6, textNode, 10);
		const anchor = captureAnchorFromDomRange(page, range);
		expect(anchor!.text).toBe('beta');
		expect(anchor!.occurrenceIndex).toBe(0);
	});

	it('respeita data-idx quando presente (reordena nodes)', () => {
		const page = document.createElement('div');
		// ordem DOM: [b, a] — mas data-idx indica lógica: [a, b] (idx=1, idx=0)
		const span1 = document.createElement('span');
		span1.className = 'textLayerNode';
		span1.textContent = 'bbb';
		span1.setAttribute('data-idx', '1');
		const span2 = document.createElement('span');
		span2.className = 'textLayerNode';
		span2.textContent = 'aaa';
		span2.setAttribute('data-idx', '0');
		page.appendChild(span1);
		page.appendChild(span2);
		document.body.appendChild(page);
		// pageText lógico = "aaa bbb"; seleciona "aaa" via textNode de span2
		const range = makeRange(span2.firstChild!, 0, span2.firstChild!, 3);
		const anchor = captureAnchorFromDomRange(page, range);
		expect(anchor!.text).toBe('aaa');
		expect(anchor!.contextBefore).toBe('');
		expect(anchor!.contextAfter).toBe(' bbb');
	});

	it('retorna null se startContainer não está dentro de um textLayerNode', () => {
		const page = makePageEl(['hello']);
		document.body.appendChild(page);
		// range fora do page (body)
		const range = makeRange(document.body, 0, document.body, 0);
		const anchor = captureAnchorFromDomRange(page, range);
		expect(anchor).toBeNull();
	});
});
