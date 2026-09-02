import type { PdfMarker, PdfMarkerSegment } from './pdfCodingTypes';
import type { TextContentItem } from './pdfTypings';
import { getPdfMarkerSegments, joinPdfMarkerSegmentText, samePdfMarkerSegments } from './pdfMarkerSegments';

export interface PdfDocumentEndpoint {
	page: number;
	index: number;
	offset: number;
}

export interface PdfResizePageText {
	page: number;
	items: readonly Pick<TextContentItem, 'str' | 'hasEOL'>[];
}

export interface PdfMarkerGeometry {
	page: number;
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
	text: string;
	segments?: PdfMarkerSegment[];
}

export interface PdfMarkerDragTransaction {
	originalGeometry: PdfMarkerGeometry;
	lastValidGeometry: PdfMarkerGeometry | null;
}

function cloneGeometry(geometry: PdfMarkerGeometry): PdfMarkerGeometry {
	return {
		...geometry,
		segments: geometry.segments?.map((segment) => ({ ...segment })),
	};
}

export function comparePdfDocumentEndpoints(
	a: PdfDocumentEndpoint,
	b: PdfDocumentEndpoint,
): number {
	return a.page - b.page || a.index - b.index || a.offset - b.offset;
}

export function getPdfMarkerEndpoints(marker: PdfMarker): {
	start: PdfDocumentEndpoint;
	end: PdfDocumentEndpoint;
} {
	const segments = getPdfMarkerSegments(marker);
	const first = segments[0]!;
	const last = segments[segments.length - 1]!;
	return {
		start: {
			page: first.page,
			index: first.beginIndex,
			offset: first.beginOffset,
		},
		end: {
			page: last.page,
			index: last.endIndex,
			offset: last.endOffset,
		},
	};
}

export function getPdfMarkerGeometry(marker: PdfMarker): PdfMarkerGeometry {
	const first = marker.segments?.[0];
	return {
		page: first?.page ?? marker.page,
		beginIndex: first?.beginIndex ?? marker.beginIndex,
		beginOffset: first?.beginOffset ?? marker.beginOffset,
		endIndex: first?.endIndex ?? marker.endIndex,
		endOffset: first?.endOffset ?? marker.endOffset,
		text: marker.segments ? joinPdfMarkerSegmentText(marker.segments) : marker.text,
		segments: marker.segments?.map((segment) => ({ ...segment })),
	};
}

function isValidEndpoint(
	endpoint: PdfDocumentEndpoint,
	page: PdfResizePageText | undefined,
): page is PdfResizePageText {
	if (!page || !Number.isInteger(endpoint.index) || !Number.isInteger(endpoint.offset)) return false;
	const item = page.items[endpoint.index];
	return endpoint.index >= 0
		&& endpoint.offset >= 0
		&& item !== undefined
		&& endpoint.offset <= item.str.length;
}

function extractPageText(
	items: PdfResizePageText['items'],
	beginIndex: number,
	beginOffset: number,
	endIndex: number,
	endOffset: number,
): string {
	let result = '';
	for (let index = beginIndex; index <= endIndex; index++) {
		const item = items[index]!;
		const from = index === beginIndex ? beginOffset : 0;
		const to = index === endIndex ? endOffset : item.str.length;
		result += item.str.slice(from, to);
		if (index < endIndex) result += item.hasEOL ? '\n' : ' ';
	}
	return result.trim();
}

export function buildPdfMarkerGeometry(
	marker: PdfMarker,
	start: PdfDocumentEndpoint,
	end: PdfDocumentEndpoint,
	pages: readonly PdfResizePageText[],
): PdfMarkerGeometry | null {
	if (comparePdfDocumentEndpoints(start, end) >= 0) return null;

	const pagesByNumber = new Map(pages.map((page) => [page.page, page]));
	const startPage = pagesByNumber.get(start.page);
	const endPage = pagesByNumber.get(end.page);
	if (!isValidEndpoint(start, startPage) || !isValidEndpoint(end, endPage)) return null;

	const priorByPage = new Map(
		getPdfMarkerSegments(marker).map((segment) => [segment.page, segment]),
	);
	const segments: PdfMarkerSegment[] = [];

	for (let pageNumber = start.page; pageNumber <= end.page; pageNumber++) {
		const page = pagesByNumber.get(pageNumber);
		if (!page || page.items.length === 0) return null;

		const lastIndex = page.items.length - 1;
		const beginIndex = pageNumber === start.page ? start.index : 0;
		const beginOffset = pageNumber === start.page ? start.offset : 0;
		const endIndex = pageNumber === end.page ? end.index : lastIndex;
		const endOffset = pageNumber === end.page
			? end.offset
			: page.items[lastIndex]!.str.length;

		if (beginIndex > endIndex || (beginIndex === endIndex && beginOffset >= endOffset)) return null;
		const beginItem = page.items[beginIndex];
		const endItem = page.items[endIndex];
		if (!beginItem || !endItem
			|| beginOffset < 0 || beginOffset > beginItem.str.length
			|| endOffset < 0 || endOffset > endItem.str.length) return null;

		segments.push({
			...priorByPage.get(pageNumber),
			page: pageNumber,
			beginIndex,
			beginOffset,
			endIndex,
			endOffset,
			text: extractPageText(page.items, beginIndex, beginOffset, endIndex, endOffset),
		});
	}

	const first = segments[0]!;
	if (segments.length === 1) {
		return {
			page: first.page,
			beginIndex: first.beginIndex,
			beginOffset: first.beginOffset,
			endIndex: first.endIndex,
			endOffset: first.endOffset,
			text: first.text,
		};
	}

	return {
		page: first.page,
		beginIndex: first.beginIndex,
		beginOffset: first.beginOffset,
		endIndex: first.endIndex,
		endOffset: first.endOffset,
		text: joinPdfMarkerSegmentText(segments),
		segments,
	};
}

export function pdfMarkerGeometryPages(geometry: PdfMarkerGeometry): Set<number> {
	return new Set(geometry.segments?.map((segment) => segment.page) ?? [geometry.page]);
}

export function samePdfMarkerGeometry(a: PdfMarkerGeometry, b: PdfMarkerGeometry): boolean {
	if (a.page !== b.page
		|| a.beginIndex !== b.beginIndex
		|| a.beginOffset !== b.beginOffset
		|| a.endIndex !== b.endIndex
		|| a.endOffset !== b.endOffset
		|| a.text !== b.text) return false;
	if (!a.segments && !b.segments) return true;
	if (!a.segments || !b.segments) return false;
	return samePdfMarkerSegments(a.segments, b.segments);
}

export function beginPdfMarkerDrag(marker: PdfMarker): PdfMarkerDragTransaction {
	return {
		originalGeometry: getPdfMarkerGeometry(marker),
		lastValidGeometry: null,
	};
}

export function acceptPdfMarkerDragGeometry(
	transaction: PdfMarkerDragTransaction,
	geometry: PdfMarkerGeometry,
): void {
	transaction.lastValidGeometry = samePdfMarkerGeometry(
		transaction.originalGeometry,
		geometry,
	) ? null : cloneGeometry(geometry);
}

export function finishPdfMarkerDrag(
	transaction: PdfMarkerDragTransaction,
): PdfMarkerGeometry | null {
	return transaction.lastValidGeometry ? cloneGeometry(transaction.lastValidGeometry) : null;
}
