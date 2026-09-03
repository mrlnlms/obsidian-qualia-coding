import { describe, expect, it } from 'vitest';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';
import type { PdfExportData } from '../../src/pdf/pdfExportData';
import {
	buildPdfExportMap,
	projectPdfMarker,
	QdpxPdfProjectionError,
} from '../../src/export/qdpxPdfProjection';

function marker(overrides: Partial<PdfMarker> = {}): PdfMarker {
	return {
		markerType: 'pdf', id: 'marker-1', fileId: 'paper.pdf', page: 1,
		beginIndex: 0, beginOffset: 1, endIndex: 1, endOffset: 2,
		text: 'Alpha be', codes: [], createdAt: 1, updatedAt: 1,
		...overrides,
	};
}

function exportData(): PdfExportData {
	return {
		plainText: 'Alpha beta\fGamma',
		pageStartOffsets: [0, 11],
		pageDims: { 0: { width: 200, height: 100 }, 1: { width: 200, height: 100 } },
		pageTextItems: [
			[
				{ str: ' Alpha ', dir: 'ltr', width: 70, height: 10, transform: [1, 0, 0, 1, 10, 70] },
				{ str: 'beta', dir: 'ltr', width: 40, height: 10, transform: [1, 0, 0, 1, 100, 70] },
			],
			[{ str: 'Gamma', dir: 'ltr', width: 50, height: 10, transform: [1, 0, 0, 1, 20, 60] }],
		],
	};
}

describe('QDPX PDF projection', () => {
	it('maps trimmed item offsets directly into the canonical representation', () => {
		const projected = projectPdfMarker(marker(), buildPdfExportMap(exportData()));
		expect(projected).toMatchObject({
			startPosition: 0,
			endPosition: 8,
			text: 'Alpha be',
			fragments: [{
				page: 1,
				startPosition: 0,
				endPosition: 8,
				text: 'Alpha be',
				bbox: { firstX: 20, firstY: 20, secondX: 120, secondY: 30 },
			}],
		});
	});

	it('projects a logical two-page marker through the form-feed separator', () => {
		const input = marker({
			text: 'Alpha beta\fGamma',
			segments: [
				{ page: 1, beginIndex: 0, beginOffset: 1, endIndex: 1, endOffset: 4, text: 'Alpha beta', resolution: 'resolved' },
				{ page: 2, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5, text: 'Gamma', resolution: 'resolved' },
			],
		});
		const projected = projectPdfMarker(input, buildPdfExportMap(exportData()));
		expect(projected.startPosition).toBe(0);
		expect(projected.endPosition).toBe(16);
		expect(projected.text).toBe('Alpha beta\fGamma');
		expect(projected.fragments.map((fragment) => [fragment.page, fragment.startPosition, fragment.endPosition])).toEqual([
			[1, 0, 10],
			[2, 11, 16],
		]);
	});

	it('uses character rectangles for a partial item when available', () => {
		const data = exportData();
		data.plainText = 'abcd';
		data.pageStartOffsets = [0];
		data.pageTextItems = [[{
			str: 'abcd', width: 40, height: 10, transform: [1, 0, 0, 1, 0, 70],
			chars: [
				{ c: 'a', u: 'a', r: [10, 70, 20, 80] },
				{ c: 'b', u: 'b', r: [20, 70, 30, 80] },
				{ c: 'c', u: 'c', r: [30, 70, 40, 80] },
				{ c: 'd', u: 'd', r: [40, 70, 50, 80] },
			],
		}]];
		delete data.pageDims[1];
		const projected = projectPdfMarker(marker({
			beginIndex: 0, beginOffset: 1, endIndex: 0, endOffset: 3, text: 'bc',
		}), buildPdfExportMap(data));
		expect(projected.fragments[0]!.bbox).toEqual({ firstX: 20, firstY: 20, secondX: 40, secondY: 30 });
	});

	it('does not relocate a marker to repeated matching text', () => {
		const data = exportData();
		data.plainText = 'Alpha beta Alpha beta';
		data.pageStartOffsets = [0];
		data.pageTextItems = [[
			...data.pageTextItems[0]!,
			{ str: 'Alpha', width: 50, height: 10, transform: [1, 0, 0, 1, 10, 50] },
			{ str: 'beta', width: 40, height: 10, transform: [1, 0, 0, 1, 70, 50] },
		]];
		const projected = projectPdfMarker(marker(), buildPdfExportMap(data));
		expect(projected.startPosition).toBe(0);
		expect(projected.endPosition).toBe(8);
	});

	it('accepts PDF item-boundary spacing around a superscript without relocating endpoints', () => {
		const data: PdfExportData = {
			plainText: 'mud” 7', pageStartOffsets: [0], pageDims: { 0: { width: 100, height: 100 } },
			pageTextItems: [[
				{ str: 'mud”', width: 40, height: 10, transform: [1, 0, 0, 1, 10, 70] },
				{ str: '7', width: 5, height: 5, transform: [1, 0, 0, 1, 51, 78] },
			]],
		};
		const projected = projectPdfMarker(marker({
			beginIndex: 0, beginOffset: 0, endIndex: 1, endOffset: 1, text: 'mud”7',
		}), buildPdfExportMap(data));

		expect(projected.startPosition).toBe(0);
		expect(projected.endPosition).toBe(6);
		expect(projected.text).toBe('mud” 7');
	});

	it.each([
		['pending segment', marker({ beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 0 })],
		['missing page', marker({ page: 3 })],
		['missing item', marker({ beginIndex: 8 })],
		['offset past item', marker({ beginOffset: 99 })],
		['reversed range', marker({ beginIndex: 1, beginOffset: 3, endIndex: 0, endOffset: 2 })],
		['text mismatch', marker({ text: 'something else' })],
	])('rejects %s instead of silently omitting the marker', (_label, input) => {
		expect(() => projectPdfMarker(input, buildPdfExportMap(exportData()))).toThrow(QdpxPdfProjectionError);
	});

	it('counts representation offsets as Unicode codepoints', () => {
		const data: PdfExportData = {
			plainText: 'a😀b', pageStartOffsets: [0], pageDims: { 0: { width: 40, height: 20 } },
			pageTextItems: [[{ str: 'a😀b', width: 40, height: 10, transform: [1, 0, 0, 1, 0, 5] }]],
		};
		const projected = projectPdfMarker(marker({
			beginIndex: 0, beginOffset: 1, endIndex: 0, endOffset: 3, text: '😀',
		}), buildPdfExportMap(data));
		expect(projected.startPosition).toBe(1);
		expect(projected.endPosition).toBe(2);
		expect(projected.text).toBe('😀');
	});
});
