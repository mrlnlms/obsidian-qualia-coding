import { describe, expect, it } from 'vitest';
import type { PdfMarkerPageProjection } from '../../src/pdf/pdfCodingTypes';
import { resolvePendingMultipageProjection } from '../../src/pdf/resolvePendingMultipage';

const firstText = 'The distinctive quotation begins here and continues through everything remaining on this page';
const lastText = 'Everything on the final page precedes the distinctive ending of this logical quotation';
const logicalText = `${firstText} ${lastText}`;

function page(...texts: string[]): HTMLElement {
	const el = document.createElement('div');
	texts.forEach((text, index) => {
		const node = document.createElement('span');
		node.className = 'textLayerNode';
		node.dataset.idx = String(index);
		node.textContent = text;
		el.appendChild(node);
	});
	return el;
}

function projection(index: number, count: number): PdfMarkerPageProjection {
	return {
		markerType: 'pdf',
		id: 'logical',
		fileId: 'doc.pdf',
		page: index + 1,
		beginIndex: 0,
		beginOffset: 0,
		endIndex: 0,
		endOffset: 0,
		text: '',
		logicalText,
		segments: [],
		renderSegmentIndex: index,
		renderSegmentCount: count,
		renderSegmentResolution: 'pending',
		codes: [],
		createdAt: 1,
		updatedAt: 1,
	};
}

describe('resolvePendingMultipageProjection', () => {
	it('resolves the quote prefix through the end of the first page', () => {
		const result = resolvePendingMultipageProjection(
			page('unrelated introduction', firstText, 'native footer'),
			projection(0, 2),
		);
		expect(result).toEqual({
			beginIndex: 1,
			beginOffset: 0,
			endIndex: 2,
			endOffset: 'native footer'.length,
			text: `${firstText} native footer`,
		});
	});

	it('resolves the beginning of the final page through the quote suffix', () => {
		const result = resolvePendingMultipageProjection(
			page('native header', lastText, 'unrelated appendix'),
			projection(1, 2),
		);
		expect(result).toEqual({
			beginIndex: 0,
			beginOffset: 0,
			endIndex: 1,
			endOffset: lastText.length,
			text: `native header ${lastText}`,
		});
	});

	it('uses the complete text layer for intermediate pages', () => {
		const result = resolvePendingMultipageProjection(
			page('header', 'body', 'footer'),
			projection(1, 3),
		);
		expect(result).toEqual({
			beginIndex: 0,
			beginOffset: 0,
			endIndex: 2,
			endOffset: 6,
			text: 'header body footer',
		});
	});

	it('fails closed when a boundary cannot be located uniquely', () => {
		const repeated = 'The distinctive quotation begins here and continues';
		expect(resolvePendingMultipageProjection(
			page(repeated, repeated),
			projection(0, 2),
		)).toBeNull();
	});
});
