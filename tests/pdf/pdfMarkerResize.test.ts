import { describe, expect, it } from 'vitest';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';
import {
	acceptPdfMarkerDragGeometry,
	beginPdfMarkerDrag,
	buildPdfMarkerGeometry,
	comparePdfDocumentEndpoints,
	finishPdfMarkerDrag,
	getPdfMarkerGeometry,
	getPdfMarkerEndpoints,
	pdfMarkerGeometryPages,
	type PdfResizePageText,
} from '../../src/pdf/pdfMarkerResize';

function marker(overrides: Partial<PdfMarker> = {}): PdfMarker {
	return {
		markerType: 'pdf',
		id: 'marker-1',
		fileId: 'document.pdf',
		page: 1,
		beginIndex: 0,
		beginOffset: 0,
		endIndex: 0,
		endOffset: 5,
		text: 'alpha',
		codes: [],
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

const pages: PdfResizePageText[] = [
	{ page: 1, items: [{ str: 'alpha beta', hasEOL: false }] },
	{ page: 2, items: [{ str: 'middle page', hasEOL: false }] },
	{ page: 3, items: [{ str: 'gamma delta', hasEOL: false }] },
];

describe('PDF marker resize geometry', () => {
	it('orders endpoints by page, index, then offset', () => {
		expect(comparePdfDocumentEndpoints(
			{ page: 1, index: 9, offset: 9 },
			{ page: 2, index: 0, offset: 0 },
		)).toBeLessThan(0);
		expect(comparePdfDocumentEndpoints(
			{ page: 2, index: 1, offset: 4 },
			{ page: 2, index: 1, offset: 5 },
		)).toBeLessThan(0);
	});

	it('turns one page into scalar geometry', () => {
		const result = buildPdfMarkerGeometry(marker(),
			{ page: 1, index: 0, offset: 0 },
			{ page: 1, index: 0, offset: 5 },
			pages);
		expect(result).toEqual({
			page: 1,
			beginIndex: 0,
			beginOffset: 0,
			endIndex: 0,
			endOffset: 5,
			text: 'alpha',
		});
	});

	it('builds partial boundaries and complete middle pages', () => {
		const result = buildPdfMarkerGeometry(marker(),
			{ page: 1, index: 0, offset: 6 },
			{ page: 3, index: 0, offset: 5 },
			pages);
		expect(result?.segments?.map((segment) => [segment.page, segment.text]))
			.toEqual([[1, 'beta'], [2, 'middle page'], [3, 'gamma']]);
		expect(result?.text).toBe('beta\fmiddle page\fgamma');
		expect(result).toMatchObject({
			page: 1,
			beginIndex: 0,
			beginOffset: 6,
			endIndex: 0,
			endOffset: 10,
		});
	});

	it('converts multipage geometry back to one page', () => {
		const logical = marker({
			text: 'alpha\fmiddle',
			segments: [
				{ page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10, text: 'alpha beta' },
				{ page: 2, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 6, text: 'middle' },
			],
		});
		const result = buildPdfMarkerGeometry(logical,
			{ page: 2, index: 0, offset: 0 },
			{ page: 2, index: 0, offset: 6 },
			pages);
		expect(result).toEqual({
			page: 2,
			beginIndex: 0,
			beginOffset: 0,
			endIndex: 0,
			endOffset: 6,
			text: 'middle',
		});
	});

	it('preserves page-specific optional metadata without mutating the marker', () => {
		const logical = marker({
			segments: [{
				page: 1,
				beginIndex: 0,
				beginOffset: 0,
				endIndex: 0,
				endOffset: 5,
				text: 'alpha',
				importedSelectionGuid: 'selection-1',
				resolution: 'resolved',
			}],
		});
		const result = buildPdfMarkerGeometry(logical,
			{ page: 1, index: 0, offset: 6 },
			{ page: 2, index: 0, offset: 6 },
			pages);
		expect(result?.segments?.[0]).toMatchObject({
			importedSelectionGuid: 'selection-1',
			beginOffset: 6,
			text: 'beta',
		});
		expect(logical.segments?.[0]).toMatchObject({ beginOffset: 0, text: 'alpha' });
	});

	it('rejects equal, inverted, missing-page and invalid item endpoints', () => {
		const same = { page: 1, index: 0, offset: 2 };
		expect(buildPdfMarkerGeometry(marker(), same, same, pages)).toBeNull();
		expect(buildPdfMarkerGeometry(marker(), { page: 3, index: 0, offset: 1 }, { page: 2, index: 0, offset: 1 }, pages)).toBeNull();
		expect(buildPdfMarkerGeometry(marker(), { page: 1, index: 0, offset: 1 }, { page: 4, index: 0, offset: 1 }, pages)).toBeNull();
		expect(buildPdfMarkerGeometry(marker(), { page: 1, index: 1, offset: 0 }, { page: 2, index: 0, offset: 1 }, pages)).toBeNull();
	});

	it('reads logical endpoints and reports every affected page', () => {
		const logical = marker({
			segments: [
				{ page: 1, beginIndex: 0, beginOffset: 2, endIndex: 0, endOffset: 10, text: 'pha beta' },
				{ page: 2, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 6, text: 'middle' },
			],
		});
		expect(getPdfMarkerEndpoints(logical)).toEqual({
			start: { page: 1, index: 0, offset: 2 },
			end: { page: 2, index: 0, offset: 6 },
		});
		expect([...pdfMarkerGeometryPages({
			...logical,
			segments: logical.segments,
		})]).toEqual([1, 2]);

		const lastPageProjection = {
			...logical,
			page: 2,
			beginIndex: 0,
			beginOffset: 0,
			endIndex: 0,
			endOffset: 6,
			text: 'middle',
		};
		expect(getPdfMarkerGeometry(lastPageProjection)).toMatchObject({
			page: 1,
			beginOffset: 2,
			text: 'pha beta\fmiddle',
		});
	});

	it('commits only a detached last-valid drag geometry', () => {
		const transaction = beginPdfMarkerDrag(marker());
		const candidate = buildPdfMarkerGeometry(marker(),
			{ page: 1, index: 0, offset: 0 },
			{ page: 2, index: 0, offset: 6 },
			pages)!;
		acceptPdfMarkerDragGeometry(transaction, candidate);
		candidate.segments![0]!.text = 'mutated outside';
		const finished = finishPdfMarkerDrag(transaction)!;
		expect(finished.segments![0]!.text).toBe('alpha beta');
		finished.segments![0]!.text = 'mutated result';
		expect(finishPdfMarkerDrag(transaction)?.segments?.[0]?.text).toBe('alpha beta');
		expect(finishPdfMarkerDrag(beginPdfMarkerDrag(marker()))).toBeNull();
	});
});
