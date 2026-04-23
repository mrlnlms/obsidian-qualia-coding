/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runtimeIndicesFromAnchor } from '../../src/pdf/runtimeIndicesFromAnchor';

function makePageEl(nodeTexts: string[]): HTMLElement {
	const page = document.createElement('div');
	nodeTexts.forEach((text, i) => {
		const span = document.createElement('span');
		span.className = 'textLayerNode';
		span.textContent = text;
		span.setAttribute('data-idx', String(i));
		page.appendChild(span);
	});
	document.body.appendChild(page);
	return page;
}

describe('runtimeIndicesFromAnchor', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('resolve anchor em indices dentro de um único node', () => {
		const page = makePageEl(['hello world']);
		const indices = runtimeIndicesFromAnchor(page, {
			text: 'world',
			contextBefore: 'hello ',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(indices).toEqual({
			beginIndex: 0,
			beginOffset: 6,
			endIndex: 0,
			endOffset: 11,
		});
	});

	it('resolve anchor que atravessa nodes', () => {
		const page = makePageEl(['abc', 'def']);
		const indices = runtimeIndicesFromAnchor(page, {
			text: 'c d',
			contextBefore: 'ab',
			contextAfter: 'ef',
			occurrenceIndex: 0,
		});
		expect(indices).toEqual({
			beginIndex: 0,
			beginOffset: 2,
			endIndex: 1,
			endOffset: 1,
		});
	});

	it('retorna null quando anchor não casa', () => {
		const page = makePageEl(['hello']);
		const indices = runtimeIndicesFromAnchor(page, {
			text: 'xyz',
			contextBefore: '',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(indices).toBeNull();
	});
});
