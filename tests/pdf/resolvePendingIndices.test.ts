/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePendingIndices, isMarkerPending } from '../../src/pdf/resolvePendingIndices';

function makePage(nodes: string[]): HTMLElement {
	const page = document.createElement('div');
	nodes.forEach((t, i) => {
		const s = document.createElement('span');
		s.className = 'textLayerNode';
		s.setAttribute('data-idx', String(i));
		s.textContent = t;
		page.appendChild(s);
	});
	document.body.appendChild(page);
	return page;
}

describe('isMarkerPending', () => {
	it('true quando todos indices são 0', () => {
		expect(isMarkerPending({ beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 0 } as any)).toBe(true);
	});
	it('false se algum indice é não-zero', () => {
		expect(isMarkerPending({ beginIndex: 0, beginOffset: 0, endIndex: 1, endOffset: 0 } as any)).toBe(false);
	});
});

describe('resolvePendingIndices', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('resolve texto único dentro de um layerNode', () => {
		const page = makePage(['hello world foo']);
		const r = resolvePendingIndices(page, 'world');
		expect(r).toEqual({ beginIndex: 0, beginOffset: 6, endIndex: 0, endOffset: 11 });
	});

	it('resolve texto que cruza dois layerNodes', () => {
		const page = makePage(['abc', 'def']);
		// pageText = "abc def"; "c d" vai de node 0 offset 2 até node 1 offset 1
		const r = resolvePendingIndices(page, 'c d');
		expect(r).toEqual({ beginIndex: 0, beginOffset: 2, endIndex: 1, endOffset: 1 });
	});

	it('retorna null quando texto não existe', () => {
		const page = makePage(['hello']);
		expect(resolvePendingIndices(page, 'xyz')).toBeNull();
	});

	it('tolera whitespace diferente (DOM single space vs texto com newline)', () => {
		const page = makePage(['International Handbook', 'of Survey Methodology']);
		// DOM pageText: "International Handbook of Survey Methodology"
		// Marker text might have \n from cross-line capture
		const r = resolvePendingIndices(page, 'International Handbook\nof Survey');
		expect(r).not.toBeNull();
	});
});
