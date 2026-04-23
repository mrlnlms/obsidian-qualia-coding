/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mapAnchorToDomRange } from '../../src/pdf/textAnchorRender';

function makePageEl(nodeTexts: string[]): HTMLElement {
	const page = document.createElement('div');
	for (const text of nodeTexts) {
		const span = document.createElement('span');
		span.className = 'textLayerNode';
		span.textContent = text;
		page.appendChild(span);
	}
	return page;
}

describe('mapAnchorToDomRange', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('mapeia anchor de texto único dentro de um layerNode', () => {
		const page = makePageEl(['hello world foo']);
		document.body.appendChild(page);
		const range = mapAnchorToDomRange(page, {
			text: 'world',
			contextBefore: 'hello ',
			contextAfter: ' foo',
			occurrenceIndex: 0,
		});
		expect(range).not.toBeNull();
		const textNode = page.firstElementChild!.firstChild!;
		expect(range!.startContainer).toBe(textNode);
		expect(range!.startOffset).toBe(6);
		expect(range!.endContainer).toBe(textNode);
		expect(range!.endOffset).toBe(11);
	});

	it('retorna null quando anchor não encontra match', () => {
		const page = makePageEl(['hello world']);
		document.body.appendChild(page);
		const range = mapAnchorToDomRange(page, {
			text: 'xyz',
			contextBefore: '',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(range).toBeNull();
	});

	it('mapeia anchor que atravessa dois layerNodes', () => {
		// pageText = "abc def"; "c d" vai do final do node0 ao início do node1
		const page = makePageEl(['abc', 'def']);
		document.body.appendChild(page);
		const range = mapAnchorToDomRange(page, {
			text: 'c d',
			contextBefore: 'ab',
			contextAfter: 'ef',
			occurrenceIndex: 0,
		});
		expect(range).not.toBeNull();
		const node0 = page.children[0]!.firstChild!;
		const node1 = page.children[1]!.firstChild!;
		expect(range!.startContainer).toBe(node0);
		expect(range!.startOffset).toBe(2);
		expect(range!.endContainer).toBe(node1);
		expect(range!.endOffset).toBe(1);
	});

	it('mapeia N-ésima ocorrência via occurrenceIndex', () => {
		const page = makePageEl(['aaa aaa aaa']);
		document.body.appendChild(page);
		const node = page.firstElementChild!.firstChild!;
		const r0 = mapAnchorToDomRange(page, { text: 'aaa', contextBefore: '', contextAfter: '', occurrenceIndex: 0 });
		const r1 = mapAnchorToDomRange(page, { text: 'aaa', contextBefore: '', contextAfter: '', occurrenceIndex: 1 });
		const r2 = mapAnchorToDomRange(page, { text: 'aaa', contextBefore: '', contextAfter: '', occurrenceIndex: 2 });
		expect(r0!.startOffset).toBe(0);
		expect(r1!.startOffset).toBe(4);
		expect(r2!.startOffset).toBe(8);
		expect(r0!.startContainer).toBe(node);
	});

	it('respeita data-idx quando presente', () => {
		const page = document.createElement('div');
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
		// pageText lógico = "aaa bbb"
		const range = mapAnchorToDomRange(page, {
			text: 'aaa',
			contextBefore: '',
			contextAfter: ' bbb',
			occurrenceIndex: 0,
		});
		expect(range).not.toBeNull();
		expect(range!.startContainer).toBe(span2.firstChild);
		expect(range!.startOffset).toBe(0);
		expect(range!.endContainer).toBe(span2.firstChild);
		expect(range!.endOffset).toBe(3);
	});

	it('round-trip: capture então render deve recuperar range equivalente', async () => {
		const { captureAnchorFromDomRange } = await import('../../src/pdf/textAnchorCapture');
		const page = makePageEl(['The quick brown fox', 'jumps over the lazy dog']);
		document.body.appendChild(page);
		const node1 = page.children[1]!.firstChild!;
		const originalRange = {
			startContainer: node1,
			startOffset: 0,
			endContainer: node1,
			endOffset: 5,
		}; // "jumps"
		const anchor = captureAnchorFromDomRange(page, originalRange)!;
		const mapped = mapAnchorToDomRange(page, anchor);
		expect(mapped).not.toBeNull();
		expect(mapped!.startContainer).toBe(originalRange.startContainer);
		expect(mapped!.startOffset).toBe(originalRange.startOffset);
		expect(mapped!.endContainer).toBe(originalRange.endContainer);
		expect(mapped!.endOffset).toBe(originalRange.endOffset);
	});
});
