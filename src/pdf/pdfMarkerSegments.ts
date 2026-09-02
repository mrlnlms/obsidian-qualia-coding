import type {
	PdfMarker,
	PdfMarkerPageProjection,
	PdfMarkerSegment,
} from './pdfCodingTypes';

function isScalarRangePending(marker: PdfMarker): boolean {
	return marker.beginIndex === 0
		&& marker.beginOffset === 0
		&& marker.endIndex === 0
		&& marker.endOffset === 0;
}

/** Read both legacy scalar markers and logical markers through one geometry API. */
export function getPdfMarkerSegments(marker: PdfMarker): readonly PdfMarkerSegment[] {
	if (marker.segments?.length) return marker.segments;
	return [{
		page: marker.page,
		beginIndex: marker.beginIndex,
		beginOffset: marker.beginOffset,
		endIndex: marker.endIndex,
		endOffset: marker.endOffset,
		text: marker.text,
		importedPdfSelectionBBox: marker.importedPdfSelectionBBox,
		resolution: isScalarRangePending(marker) ? 'pending' : 'resolved',
	}];
}

export function isMultipagePdfMarker(marker: PdfMarker): boolean {
	return (marker.segments?.length ?? 0) > 1;
}

export function isPdfMarkerSegmentPending(segment: PdfMarkerSegment): boolean {
	return segment.resolution === 'pending'
		|| (segment.beginIndex === 0
			&& segment.beginOffset === 0
			&& segment.endIndex === 0
			&& segment.endOffset === 0);
}

export function joinPdfMarkerSegmentText(segments: readonly PdfMarkerSegment[]): string {
	return segments.map((segment) => segment.text).join('\f');
}

export function samePdfMarkerSegments(
	a: readonly PdfMarkerSegment[],
	b: readonly PdfMarkerSegment[],
): boolean {
	if (a.length !== b.length) return false;
	return a.every((segment, index) => {
		const other = b[index];
		return other !== undefined
			&& segment.page === other.page
			&& segment.beginIndex === other.beginIndex
			&& segment.beginOffset === other.beginOffset
			&& segment.endIndex === other.endIndex
			&& segment.endOffset === other.endOffset
			&& segment.text === other.text;
	});
}

/** Keep legacy scalar fields as a read-compatible projection of segment zero. */
export function syncPdfMarkerFirstSegmentProjection(marker: PdfMarker): void {
	const first = marker.segments?.[0];
	if (!first) return;
	marker.page = first.page;
	marker.beginIndex = first.beginIndex;
	marker.beginOffset = first.beginOffset;
	marker.endIndex = first.endIndex;
	marker.endOffset = first.endOffset;
	marker.text = joinPdfMarkerSegmentText(marker.segments!);
	marker.importedPdfSelectionBBox = first.importedPdfSelectionBBox;
}

/** Build detached, non-persisted page views for existing per-page renderers. */
export function projectPdfMarkerToPage(
	marker: PdfMarker,
	page: number,
): PdfMarkerPageProjection[] {
	const segments = getPdfMarkerSegments(marker);
	return segments.flatMap((segment, index) => {
		if (segment.page !== page) return [];
		return [{
			...marker,
			segments: marker.segments?.map((item) => ({ ...item })),
			page: segment.page,
			beginIndex: segment.beginIndex,
			beginOffset: segment.beginOffset,
			endIndex: segment.endIndex,
			endOffset: segment.endOffset,
			text: segment.text,
			importedPdfSelectionBBox: segment.importedPdfSelectionBBox,
			renderSegmentIndex: index,
			renderSegmentCount: segments.length,
			renderSegmentResolution: segment.resolution ?? 'resolved',
			logicalText: marker.text,
		}];
	});
}
