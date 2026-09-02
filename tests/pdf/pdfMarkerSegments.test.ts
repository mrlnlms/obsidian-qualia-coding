import { describe, expect, it } from 'vitest';
import type { PdfMarker, PdfMarkerSegment } from '../../src/pdf/pdfCodingTypes';
import {
	getPdfMarkerSegments,
	isMultipagePdfMarker,
	isPdfMarkerSegmentPending,
	joinPdfMarkerSegmentText,
	projectPdfMarkerToPage,
	samePdfMarkerSegments,
	syncPdfMarkerFirstSegmentProjection,
} from '../../src/pdf/pdfMarkerSegments';

function marker(overrides: Partial<PdfMarker> = {}): PdfMarker {
	return {
		markerType: 'pdf',
		id: 'marker-1',
		fileId: 'document.pdf',
		page: 3,
		beginIndex: 4,
		beginOffset: 1,
		endIndex: 8,
		endOffset: 2,
		text: 'legacy',
		codes: [],
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

function segment(
	page: number,
	beginIndex: number,
	beginOffset: number,
	endIndex: number,
	endOffset: number,
	text: string,
): PdfMarkerSegment {
	return {
		page,
		beginIndex,
		beginOffset,
		endIndex,
		endOffset,
		text,
		resolution: 'resolved',
	};
}

describe('PDF marker segments', () => {
	it('reads a legacy scalar marker as one implicit resolved segment', () => {
		expect(getPdfMarkerSegments(marker())).toEqual([{
			page: 3,
			beginIndex: 4,
			beginOffset: 1,
			endIndex: 8,
			endOffset: 2,
			text: 'legacy',
			importedPdfSelectionBBox: undefined,
			resolution: 'resolved',
		}]);
	});

	it('treats an all-zero legacy imported range as pending', () => {
		const [implicit] = getPdfMarkerSegments(marker({
			beginIndex: 0,
			beginOffset: 0,
			endIndex: 0,
			endOffset: 0,
		}));
		expect(isPdfMarkerSegmentPending(implicit!)).toBe(true);
	});

	it('projects a logical marker to one page without changing its logical identity', () => {
		const logical = marker({
			page: 6,
			beginIndex: 10,
			beginOffset: 2,
			endIndex: 30,
			endOffset: 4,
			text: 'first\fsecond',
			segments: [
				segment(6, 10, 2, 30, 4, 'first'),
				segment(7, 0, 0, 5, 6, 'second'),
			],
		});

		expect(isMultipagePdfMarker(logical)).toBe(true);
		expect(projectPdfMarkerToPage(logical, 7)).toEqual([
			expect.objectContaining({
				id: logical.id,
				page: 7,
				beginIndex: 0,
				endIndex: 5,
				text: 'second',
				logicalText: 'first\fsecond',
				renderSegmentIndex: 1,
				renderSegmentCount: 2,
				renderSegmentResolution: 'resolved',
			}),
		]);
		expect(projectPdfMarkerToPage(logical, 8)).toEqual([]);
	});

	it('keeps projections detached from the persisted segment array', () => {
		const logical = marker({
			segments: [segment(6, 1, 0, 2, 3, 'first'), segment(7, 4, 0, 5, 3, 'second')],
		});
		const projection = projectPdfMarkerToPage(logical, 7)[0]!;

		projection.endOffset = 99;
		projection.segments![1]!.endOffset = 88;

		expect(logical.segments![1]!.endOffset).toBe(3);
	});

	it('joins local text in page order and compares semantic geometry', () => {
		const segments = [segment(6, 1, 0, 2, 3, 'first'), segment(7, 4, 0, 5, 3, 'second')];
		expect(joinPdfMarkerSegmentText(segments)).toBe('first\fsecond');
		expect(samePdfMarkerSegments(segments, segments.map((item) => ({ ...item })))).toBe(true);
		expect(samePdfMarkerSegments(segments, [segments[0]!, { ...segments[1]!, endOffset: 4 }])).toBe(false);
	});

	it('synchronizes only the first-segment compatibility projection', () => {
		const logical = marker({
			page: 99,
			text: 'stale',
			segments: [segment(6, 1, 2, 3, 4, 'first'), segment(7, 5, 6, 7, 8, 'second')],
		});

		syncPdfMarkerFirstSegmentProjection(logical);

		expect(logical).toMatchObject({
			page: 6,
			beginIndex: 1,
			beginOffset: 2,
			endIndex: 3,
			endOffset: 4,
			text: 'first\fsecond',
		});
		expect(logical.segments![1]!.text).toBe('second');
	});
});
