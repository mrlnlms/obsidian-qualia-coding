import type { PdfMarker, PdfMarkerSegment } from '../pdf/pdfCodingTypes';
import type { PdfExportData } from '../pdf/pdfExportData';
import type { PdfExportTextItem } from '../pdf/pdfPlainText';
import { getPdfMarkerSegments, isPdfMarkerSegmentPending } from '../pdf/pdfMarkerSegments';

export interface PdfCanonicalItem {
	sourceIndex: number;
	rawText: string;
	text: string;
	trimmedStart: number;
	trimmedEnd: number;
	globalStart: number;
	globalEnd: number;
	dir?: string;
	width?: number;
	height?: number;
	transform?: number[];
	chars?: PdfExportTextItem['chars'];
}

export interface PdfCanonicalPage {
	page: number;
	globalStart: number;
	globalEnd: number;
	width: number;
	height: number;
	items: PdfCanonicalItem[];
}

export interface PdfExportMap {
	plainText: string;
	pages: PdfCanonicalPage[];
}

export interface QdpxPdfBBox {
	firstX: number;
	firstY: number;
	secondX: number;
	secondY: number;
}

export interface ProjectedPdfFragment {
	page: number;
	startPosition: number;
	endPosition: number;
	text: string;
	bbox: QdpxPdfBBox;
}

export interface ProjectedPdfMarker {
	marker: PdfMarker;
	startPosition: number;
	endPosition: number;
	text: string;
	fragments: ProjectedPdfFragment[];
}

export class QdpxPdfProjectionError extends Error {
	constructor(
		public readonly markerId: string,
		public readonly fileId: string,
		public readonly reason: string,
	) {
		super(`PDF marker ${markerId} in ${fileId}: ${reason}`);
		this.name = 'QdpxPdfProjectionError';
	}
}

function codepointLength(value: string): number {
	return Array.from(value).length;
}

function sliceCodepoints(value: string, start: number, end: number): string {
	return Array.from(value).slice(start, end).join('');
}

function codepointOffsetForCodeUnits(value: string, codeUnits: number): number {
	return codepointLength(value.slice(0, codeUnits));
}

function normalizeText(value: string): string {
	const semantic = Array.from(
		value
			.normalize('NFKC')
			.replace(/\uFFFD|\u00AD/g, '')
			.toLocaleLowerCase(),
	)
		.filter((character) => /[\p{L}\p{N}]/u.test(character))
		.join('')
		.replace(/fff/g, 'ffi')
		.replace(/ff/g, 'fi');
	return semantic || value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function buildPdfExportMap(data: PdfExportData): PdfExportMap {
	const pages: PdfCanonicalPage[] = data.pageTextItems.map((sourceItems, pageIndex) => {
		const pageStartCodepoints = codepointLength(data.plainText.slice(0, data.pageStartOffsets[pageIndex] ?? 0));
		let cursor = pageStartCodepoints;
		let hasText = false;
		const items: PdfCanonicalItem[] = [];

		for (let sourceIndex = 0; sourceIndex < sourceItems.length; sourceIndex++) {
			const source = sourceItems[sourceIndex]!;
			const rawText = source.str ?? '';
			const text = rawText.trim();
			if (!text) continue;
			if (hasText) cursor += 1;
			const trimmedStart = rawText.length - rawText.trimStart().length;
			const trimmedEnd = rawText.trimEnd().length;
			const globalStart = cursor;
			const globalEnd = globalStart + codepointLength(text);
			items.push({
				sourceIndex,
				rawText,
				text,
				trimmedStart,
				trimmedEnd,
				globalStart,
				globalEnd,
				dir: source.dir,
				width: source.width,
				height: source.height,
				transform: source.transform ? [...source.transform] : undefined,
				chars: source.chars,
			});
			cursor = globalEnd;
			hasText = true;
		}

		const dims = data.pageDims[pageIndex];
		return {
			page: pageIndex + 1,
			globalStart: pageStartCodepoints,
			globalEnd: cursor,
			width: dims?.width ?? 0,
			height: dims?.height ?? 0,
			items,
		};
	});

	return { plainText: data.plainText, pages };
}

function fail(marker: PdfMarker, reason: string): never {
	throw new QdpxPdfProjectionError(marker.id, marker.fileId, reason);
}

function resolveEndpoint(
	marker: PdfMarker,
	page: PdfCanonicalPage,
	index: number,
	offset: number,
): number {
	if (!Number.isInteger(index) || !Number.isInteger(offset) || index < 0 || offset < 0) {
		return fail(marker, `invalid endpoint ${index}:${offset} on page ${page.page}`);
	}
	const item = page.items.find((candidate) => candidate.sourceIndex === index);
	if (!item) return fail(marker, `text item ${index} is unavailable on page ${page.page}`);
	if (offset > item.rawText.length) {
		return fail(marker, `offset ${offset} exceeds item ${index} length on page ${page.page}`);
	}
	const canonicalCodeUnits = Math.max(0, Math.min(item.text.length, offset - item.trimmedStart));
	return item.globalStart + codepointOffsetForCodeUnits(item.text, canonicalCodeUnits);
}

type PdfRect = [number, number, number, number];

function unionRects(rects: PdfRect[]): PdfRect | null {
	if (rects.length === 0) return null;
	return [
		Math.min(...rects.map((rect) => rect[0])),
		Math.min(...rects.map((rect) => rect[1])),
		Math.max(...rects.map((rect) => rect[2])),
		Math.max(...rects.map((rect) => rect[3])),
	];
}

function itemRect(item: PdfCanonicalItem, localStart: number, localEnd: number): PdfRect | null {
	if (localStart >= localEnd) return null;
	const rawPrefixCodepoints = codepointLength(item.rawText.slice(0, item.trimmedStart));
	const rawStart = rawPrefixCodepoints + localStart;
	const rawEnd = rawPrefixCodepoints + localEnd;
	const rawCodepoints = codepointLength(item.rawText);

	if (item.chars && item.chars.length >= rawCodepoints) {
		const selected = item.chars.slice(rawStart, rawEnd);
		return unionRects(selected.map((char) => char.r));
	}

	if (item.width === undefined || item.height === undefined || !item.transform || item.transform.length < 6) {
		return null;
	}
	const denominator = Math.max(1, rawCodepoints);
	let startRatio = rawStart / denominator;
	let endRatio = rawEnd / denominator;
	if (item.dir === 'rtl') {
		[startRatio, endRatio] = [1 - endRatio, 1 - startRatio];
	}
	const x = item.transform[4]!;
	const y = item.transform[5]!;
	return [x + item.width * startRatio, y, x + item.width * endRatio, y + item.height];
}

function projectBBox(
	marker: PdfMarker,
	page: PdfCanonicalPage,
	startPosition: number,
	endPosition: number,
): QdpxPdfBBox {
	const rects: PdfRect[] = [];
	for (const item of page.items) {
		const overlapStart = Math.max(startPosition, item.globalStart);
		const overlapEnd = Math.min(endPosition, item.globalEnd);
		if (overlapStart >= overlapEnd) continue;
		const rect = itemRect(item, overlapStart - item.globalStart, overlapEnd - item.globalStart);
		if (!rect) return fail(marker, `geometry is unavailable for item ${item.sourceIndex} on page ${page.page}`);
		rects.push(rect);
	}
	const union = unionRects(rects);
	if (!union || page.width <= 0 || page.height <= 0) {
		return fail(marker, `geometry is unavailable on page ${page.page}`);
	}
	return {
		firstX: Math.max(0, Math.min(page.width, union[0])),
		firstY: Math.max(0, Math.min(page.height, page.height - union[3])),
		secondX: Math.max(0, Math.min(page.width, union[2])),
		secondY: Math.max(0, Math.min(page.height, page.height - union[1])),
	};
}

function projectSegment(
	marker: PdfMarker,
	segment: PdfMarkerSegment,
	map: PdfExportMap,
): ProjectedPdfFragment {
	if (isPdfMarkerSegmentPending(segment)) return fail(marker, `segment on page ${segment.page} is pending`);
	const page = map.pages[segment.page - 1];
	if (!page) return fail(marker, `page ${segment.page} is unavailable`);
	const startPosition = resolveEndpoint(marker, page, segment.beginIndex, segment.beginOffset);
	const endPosition = resolveEndpoint(marker, page, segment.endIndex, segment.endOffset);
	if (startPosition >= endPosition) return fail(marker, `range on page ${segment.page} is empty or reversed`);
	const text = sliceCodepoints(map.plainText, startPosition, endPosition);
	if (!text) return fail(marker, `range on page ${segment.page} produced no text`);
	if (segment.text && normalizeText(segment.text) !== normalizeText(text)) {
		return fail(marker, `stored text does not match current PDF text on page ${segment.page}`);
	}
	return {
		page: segment.page,
		startPosition,
		endPosition,
		text,
		bbox: projectBBox(marker, page, startPosition, endPosition),
	};
}

export function projectPdfMarker(marker: PdfMarker, map: PdfExportMap): ProjectedPdfMarker {
	const segments = getPdfMarkerSegments(marker);
	if (segments.length === 0) return fail(marker, 'marker has no segments');
	const fragments = segments.map((segment) => projectSegment(marker, segment, map));
	for (let index = 1; index < fragments.length; index++) {
		const previous = fragments[index - 1]!;
		const current = fragments[index]!;
		if (current.page <= previous.page || current.startPosition <= previous.endPosition) {
			return fail(marker, 'segments are not in strictly increasing page order');
		}
	}
	const startPosition = fragments[0]!.startPosition;
	const endPosition = fragments[fragments.length - 1]!.endPosition;
	const text = sliceCodepoints(map.plainText, startPosition, endPosition);
	if (marker.text && normalizeText(marker.text) !== normalizeText(text)) {
		return fail(marker, 'stored logical text does not match current PDF text');
	}
	return { marker, startPosition, endPosition, text, fragments };
}
