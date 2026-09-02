import type { PdfMarkerSegment } from '../pdf/pdfCodingTypes';
import { resolvePendingIndicesInTextContentItems } from '../pdf/resolvePendingIndices';
import type { ParsedSelection } from './qdpxImporter';

export interface QdpxPdfMultipageGroup {
	groupId: string;
	anchorGuid: string;
	name: string;
	fragments: ParsedSelection[];
	plainTextSelection: ParsedSelection;
	selectionGuids: string[];
	viewerPages: number[];
}

export interface QdpxMultipageResolution {
	strategy: 'resolved' | 'pending';
	text: string;
	segments: PdfMarkerSegment[];
	reason?: 'pdf-unavailable' | 'start-not-found' | 'end-not-found' | 'ambiguous' | 'dom-range-not-found';
}

export interface ResolveQdpxMultipageRangeArgs {
	group: QdpxPdfMultipageGroup;
	qdpxPlainText: string | null;
	pdfPlainText: string | null;
	pdfPageStartOffsets: number[] | null;
	pdfPageTextItems: Array<Array<{ str?: string }>> | null;
}

interface NormalizedMappedText {
	text: string;
	rawStart: number[];
	rawEnd: number[];
}

interface BoundaryMatch {
	status: 'resolved' | 'not-found' | 'ambiguous';
	rawStart?: number;
	rawEnd?: number;
}

function normalizeSelectionName(name: string | undefined): string {
	return (name ?? '')
		.normalize('NFKC')
		.replace(/\uFFFD|\u00AD/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLocaleLowerCase();
}

function semanticCodingSignature(selection: ParsedSelection): string {
	const semantic = (selection.codings ?? []).map((coding) =>
		`${coding.creatingUserGuid ?? ''}\u0000${coding.codeGuid}`,
	);
	const fallback = semantic.length > 0
		? semantic
		: (selection.codeGuids ?? []).map((codeGuid) => `\u0000${codeGuid}`);
	return fallback.sort().join('\u0001');
}

function groupKey(selection: ParsedSelection): string {
	return [
		normalizeSelectionName(selection.name),
		selection.createdAt ?? '',
		semanticCodingSignature(selection),
	].join('\u0002');
}

/** Detect Atlas multipage quotations from structural selection evidence only. */
export function detectQdpxPdfMultipageGroups(
	selections: ParsedSelection[],
): QdpxPdfMultipageGroup[] {
	const plainByGuid = new Map<string, ParsedSelection[]>();
	for (const selection of selections) {
		if (selection.type !== 'PlainTextSelection' || !selection.guid) continue;
		plainByGuid.set(selection.guid, [...(plainByGuid.get(selection.guid) ?? []), selection]);
	}

	const candidates = new Map<string, ParsedSelection[]>();
	for (const selection of selections) {
		if (selection.type !== 'PDFSelection'
			|| !selection.guid
			|| !normalizeSelectionName(selection.name)
			|| !selection.createdAt
			|| selection.page === undefined) continue;
		const key = groupKey(selection);
		candidates.set(key, [...(candidates.get(key) ?? []), selection]);
	}

	const groups: QdpxPdfMultipageGroup[] = [];
	for (const selectionsWithKey of candidates.values()) {
		if (selectionsWithKey.length < 2) continue;
		const ordered = [...selectionsWithKey].sort((a, b) => a.page! - b.page!);
		if (new Set(ordered.map((selection) => selection.page)).size !== ordered.length) continue;

		let runStart = 0;
		for (let index = 1; index <= ordered.length; index++) {
			const continuesRun = index < ordered.length
				&& ordered[index]!.page === ordered[index - 1]!.page! + 1;
			if (continuesRun) continue;
			const fragments = ordered.slice(runStart, index);
			runStart = index;
			if (fragments.length < 2) continue;

			const anchors = fragments.flatMap((fragment) => {
				const matches = plainByGuid.get(fragment.guid) ?? [];
				return matches.length === 1 ? [{ fragment, plain: matches[0]! }] : [];
			});
			if (anchors.length !== 1) continue;
			const anchor = anchors[0]!;
			groups.push({
				groupId: anchor.fragment.guid,
				anchorGuid: anchor.fragment.guid,
				name: anchor.fragment.name ?? '',
				fragments,
				plainTextSelection: anchor.plain,
				selectionGuids: fragments.map((fragment) => fragment.guid),
				viewerPages: fragments.map((fragment) => fragment.page! + 1),
			});
		}
	}

	return groups.sort((a, b) => {
		const pageDifference = a.viewerPages[0]! - b.viewerPages[0]!;
		return pageDifference !== 0 ? pageDifference : a.groupId.localeCompare(b.groupId);
	});
}

function normalizeMappedText(src: string): NormalizedMappedText {
	const chars: string[] = [];
	const rawStart: number[] = [];
	const rawEnd: number[] = [];
	for (let offset = 0; offset < src.length;) {
		const codePoint = src.codePointAt(offset);
		if (codePoint === undefined) break;
		const raw = String.fromCodePoint(codePoint);
		const start = offset;
		offset += raw.length;
		if (raw === '\uFFFD' || raw === '\u00AD') continue;
		for (const normalized of raw.normalize('NFKC').toLocaleLowerCase()) {
			if (!/[\p{L}\p{N}]/u.test(normalized)) continue;
			chars.push(normalized);
			rawStart.push(start);
			rawEnd.push(offset);
		}
	}

	const aliased = chars.join('').replace(/fff/g, 'ffi').replace(/ff/g, 'fi');
	return { text: aliased, rawStart, rawEnd };
}

function countOccurrences(haystack: string, needle: string): { count: number; index: number } {
	let count = 0;
	let index = -1;
	for (let from = 0;;) {
		const found = haystack.indexOf(needle, from);
		if (found < 0) break;
		if (index < 0) index = found;
		count++;
		from = found + 1;
	}
	return { count, index };
}

function findBoundary(
	page: NormalizedMappedText,
	expected: string,
	side: 'start' | 'end',
): BoundaryMatch {
	const maxLength = Math.min(160, expected.length);
	const minLength = Math.min(24, maxLength);
	if (minLength === 0 || page.text.length === 0) return { status: 'not-found' };

	for (let length = maxLength; length >= minLength; length -= 8) {
		const needle = side === 'start'
			? expected.slice(0, length)
			: expected.slice(expected.length - length);
		const occurrence = countOccurrences(page.text, needle);
		if (occurrence.count > 1) return { status: 'ambiguous' };
		if (occurrence.count === 0) continue;
		const rawStart = page.rawStart[occurrence.index];
		const rawEnd = page.rawEnd[occurrence.index + needle.length - 1];
		if (rawStart === undefined || rawEnd === undefined) return { status: 'not-found' };
		return { status: 'resolved', rawStart, rawEnd };
	}
	return { status: 'not-found' };
}

function logicalTextFromQdpx(group: QdpxPdfMultipageGroup, qdpxPlainText: string | null): string {
	const { startPosition, endPosition } = group.plainTextSelection;
	if (qdpxPlainText !== null
		&& startPosition !== undefined
		&& endPosition !== undefined
		&& startPosition >= 0
		&& startPosition < endPosition
		&& endPosition <= qdpxPlainText.length) {
		return qdpxPlainText.slice(startPosition, endPosition);
	}
	return group.name;
}

function pendingSegments(group: QdpxPdfMultipageGroup): PdfMarkerSegment[] {
	return group.fragments.map((fragment) => ({
		page: fragment.page! + 1,
		beginIndex: 0,
		beginOffset: 0,
		endIndex: 0,
		endOffset: 0,
		text: '',
		importedSelectionGuid: fragment.guid,
		resolution: 'pending',
	}));
}

function pendingResolution(
	group: QdpxPdfMultipageGroup,
	text: string,
	reason: NonNullable<QdpxMultipageResolution['reason']>,
): QdpxMultipageResolution {
	return { strategy: 'pending', text, segments: pendingSegments(group), reason };
}

function pageRawBounds(
	viewerPage: number,
	pdfPlainText: string,
	pageStartOffsets: number[],
): { start: number; end: number } | null {
	const pageIndex = viewerPage - 1;
	const start = pageStartOffsets[pageIndex];
	if (start === undefined) return null;
	const next = pageStartOffsets[pageIndex + 1];
	const end = next === undefined
		? pdfPlainText.length
		: next > 0 && pdfPlainText[next - 1] === '\f' ? next - 1 : next;
	return start <= end ? { start, end } : null;
}

/** Resolve a logical Atlas quotation in PDF.js text, then map it to page ranges. */
export function resolveQdpxMultipageRange(
	args: ResolveQdpxMultipageRangeArgs,
): QdpxMultipageResolution {
	const logicalText = logicalTextFromQdpx(args.group, args.qdpxPlainText);
	if (!args.pdfPlainText || !args.pdfPageStartOffsets || !args.pdfPageTextItems) {
		return pendingResolution(args.group, logicalText, 'pdf-unavailable');
	}

	const firstPage = args.group.viewerPages[0]!;
	const lastPage = args.group.viewerPages[args.group.viewerPages.length - 1]!;
	const firstBounds = pageRawBounds(firstPage, args.pdfPlainText, args.pdfPageStartOffsets);
	const lastBounds = pageRawBounds(lastPage, args.pdfPlainText, args.pdfPageStartOffsets);
	if (!firstBounds || !lastBounds) return pendingResolution(args.group, logicalText, 'pdf-unavailable');

	const expected = normalizeMappedText(logicalText).text;
	const firstRaw = args.pdfPlainText.slice(firstBounds.start, firstBounds.end);
	const lastRaw = args.pdfPlainText.slice(lastBounds.start, lastBounds.end);
	const start = findBoundary(normalizeMappedText(firstRaw), expected, 'start');
	const end = findBoundary(normalizeMappedText(lastRaw), expected, 'end');
	if (start.status === 'ambiguous' || end.status === 'ambiguous') {
		return pendingResolution(args.group, logicalText, 'ambiguous');
	}
	if (start.status !== 'resolved') return pendingResolution(args.group, logicalText, 'start-not-found');
	if (end.status !== 'resolved') return pendingResolution(args.group, logicalText, 'end-not-found');

	let hasPendingDomRange = false;
	const segments = args.group.fragments.map((fragment, index): PdfMarkerSegment => {
		const viewerPage = fragment.page! + 1;
		const bounds = pageRawBounds(viewerPage, args.pdfPlainText!, args.pdfPageStartOffsets!);
		if (!bounds) {
			hasPendingDomRange = true;
			return pendingSegments(args.group)[index]!;
		}
		const globalStart = index === 0 ? firstBounds.start + start.rawStart! : bounds.start;
		const globalEnd = index === args.group.fragments.length - 1
			? lastBounds.start + end.rawEnd!
			: bounds.end;
		const text = args.pdfPlainText!.slice(globalStart, globalEnd);
		const items = args.pdfPageTextItems![viewerPage - 1] ?? [];
		const resolved = resolvePendingIndicesInTextContentItems(items, text).resolved;
		if (!resolved) hasPendingDomRange = true;
		return {
			page: viewerPage,
			beginIndex: resolved?.beginIndex ?? 0,
			beginOffset: resolved?.beginOffset ?? 0,
			endIndex: resolved?.endIndex ?? 0,
			endOffset: resolved?.endOffset ?? 0,
			text,
			importedSelectionGuid: fragment.guid,
			resolution: resolved ? 'resolved' : 'pending',
		};
	});

	return {
		strategy: hasPendingDomRange ? 'pending' : 'resolved',
		text: segments.map((segment) => segment.text).join('\f'),
		segments,
		reason: hasPendingDomRange ? 'dom-range-not-found' : undefined,
	};
}
