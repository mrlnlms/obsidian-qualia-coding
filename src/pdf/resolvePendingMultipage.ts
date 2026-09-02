import type { PdfMarkerPageProjection, PdfMarkerRangeChanges } from './pdfCodingTypes';
import { resolvePendingIndicesWithDiagnostics } from './resolvePendingIndices';

const BOUNDARY_TEXT_LENGTH = 80;
const UNIQUE_KEY_LENGTH = 32;

function orderedTextLayerNodes(pageEl: HTMLElement): HTMLElement[] {
	const all = Array.from(pageEl.querySelectorAll<HTMLElement>('.textLayerNode'));
	const outer = all.filter((node) => {
		let parent = node.parentElement;
		while (parent && parent !== pageEl) {
			if (parent.classList.contains('textLayerNode')) return false;
			parent = parent.parentElement;
		}
		return true;
	});
	return outer.sort((a, b) => nodeIndex(a, 0) - nodeIndex(b, 0));
}

function nodeIndex(node: HTMLElement, fallback: number): number {
	const value = node.getAttribute('data-idx');
	if (value === null) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function findNodePosition(nodes: HTMLElement[], index: number): number {
	return nodes.findIndex((node, fallback) => nodeIndex(node, fallback) === index);
}

function extractText(
	nodes: HTMLElement[],
	beginIndex: number,
	beginOffset: number,
	endIndex: number,
	endOffset: number,
): string | null {
	const beginPosition = findNodePosition(nodes, beginIndex);
	const endPosition = findNodePosition(nodes, endIndex);
	if (beginPosition < 0 || endPosition < beginPosition) return null;
	return nodes.slice(beginPosition, endPosition + 1)
		.map((node, relativeIndex, selected) => {
			const text = node.textContent ?? '';
			const from = relativeIndex === 0 ? beginOffset : 0;
			const to = relativeIndex === selected.length - 1 ? endOffset : text.length;
			return text.slice(from, to);
		})
		.join(' ')
		.trim();
}

function boundaryText(logicalText: string, side: 'start' | 'end'): string {
	const text = logicalText.replace(/\f/g, ' ').trim();
	return side === 'start'
		? text.slice(0, BOUNDARY_TEXT_LENGTH)
		: text.slice(-BOUNDARY_TEXT_LENGTH);
}

function normalizedKey(text: string): string {
	return text
		.normalize('NFKC')
		.toLocaleLowerCase()
		.replace(/\uFFFD|\u00AD/g, '')
		.replace(/[^\p{L}\p{N}]/gu, '')
		.replace(/fff/g, 'ffi')
		.replace(/ff/g, 'fi');
}

function hasUniqueBoundaryKey(nodes: HTMLElement[], boundary: string, side: 'start' | 'end'): boolean {
	const pageKey = normalizedKey(nodes.map((node) => node.textContent ?? '').join(' '));
	const boundaryKey = normalizedKey(boundary);
	const length = Math.min(UNIQUE_KEY_LENGTH, boundaryKey.length);
	if (length === 0) return false;
	const needle = side === 'start'
		? boundaryKey.slice(0, length)
		: boundaryKey.slice(-length);
	const first = pageKey.indexOf(needle);
	return first >= 0 && pageKey.indexOf(needle, first + 1) < 0;
}

/** Resolve an endpoint-only pending segment after its viewer page is available. */
export function resolvePendingMultipageProjection(
	pageEl: HTMLElement,
	projection: PdfMarkerPageProjection,
): PdfMarkerRangeChanges | null {
	if (projection.renderSegmentCount < 2
		|| projection.renderSegmentIndex < 0
		|| projection.renderSegmentIndex >= projection.renderSegmentCount) return null;
	const nodes = orderedTextLayerNodes(pageEl);
	if (nodes.length === 0) return null;

	const firstNode = nodes[0]!;
	const lastNode = nodes[nodes.length - 1]!;
	let beginIndex = nodeIndex(firstNode, 0);
	let beginOffset = 0;
	let endIndex = nodeIndex(lastNode, nodes.length - 1);
	let endOffset = lastNode.textContent?.length ?? 0;

	if (projection.renderSegmentIndex === 0) {
		const boundary = boundaryText(projection.logicalText, 'start');
		if (!hasUniqueBoundaryKey(nodes, boundary, 'start')) return null;
		const resolved = resolvePendingIndicesWithDiagnostics(
			pageEl,
			boundary,
			{ allowWindowFallback: false },
		).resolved;
		if (!resolved) return null;
		beginIndex = resolved.beginIndex;
		beginOffset = resolved.beginOffset;
	} else if (projection.renderSegmentIndex === projection.renderSegmentCount - 1) {
		const boundary = boundaryText(projection.logicalText, 'end');
		if (!hasUniqueBoundaryKey(nodes, boundary, 'end')) return null;
		const resolved = resolvePendingIndicesWithDiagnostics(
			pageEl,
			boundary,
			{ allowWindowFallback: false },
		).resolved;
		if (!resolved) return null;
		endIndex = resolved.endIndex;
		endOffset = resolved.endOffset;
	}

	const text = extractText(nodes, beginIndex, beginOffset, endIndex, endOffset);
	if (!text) return null;
	return { beginIndex, beginOffset, endIndex, endOffset, text };
}
