/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computeAnchorRects, resolveAnchorRange } from '../../src/pdf/anchorHighlight';

function makePageEl(nodeTexts: string[]): HTMLElement {
	const page = document.createElement('div');
	page.className = 'page';
	for (const text of nodeTexts) {
		const span = document.createElement('span');
		span.className = 'textLayerNode';
		span.textContent = text;
		page.appendChild(span);
	}
	document.body.appendChild(page);
	return page;
}

describe('computeAnchorRects', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('resolveAnchorRange retorna Range válido pra anchor que casa', () => {
		const page = makePageEl(['hello world']);
		const range = resolveAnchorRange(page, {
			text: 'world',
			contextBefore: 'hello ',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(range).not.toBeNull();
		expect(range!.startOffset).toBe(6);
		expect(range!.endOffset).toBe(11);
	});

	it('resolveAnchorRange retorna null pra anchor sem match', () => {
		const page = makePageEl(['hello world']);
		const range = resolveAnchorRange(page, {
			text: 'xyz',
			contextBefore: '',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(range).toBeNull();
	});

	it('computeAnchorRects retorna array (vazio em jsdom sem layout)', () => {
		const page = makePageEl(['hello world']);
		const rects = computeAnchorRects(page, {
			text: 'world',
			contextBefore: 'hello ',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(Array.isArray(rects)).toBe(true);
	});

	it('computeAnchorRects retorna null quando anchor não casa', () => {
		const page = makePageEl(['hello world']);
		expect(
			computeAnchorRects(page, { text: 'xyz', contextBefore: '', contextAfter: '', occurrenceIndex: 0 }),
		).toBeNull();
	});
});
