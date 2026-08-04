/**
 * Resolves DOM indices for imported markers that have placeholder (0,0,0,0)
 * indices. Uses text-search in the page's outer `.textLayerNode` elements.
 *
 * Runs on page render: if a marker is pending AND its text can be found,
 * indices are computed and written back to the marker (silent save). After
 * that, the normal render path pints the highlight.
 */

import type { PdfMarker } from './pdfCodingTypes';

export interface ResolvedIndices {
	beginIndex: number;
	beginOffset: number;
	endIndex: number;
	endOffset: number;
}

export interface PendingResolutionDiagnostics {
	reason: 'resolved' | 'no-text-layer-nodes' | 'empty-search-text' | 'not-found' | 'position-map-failed';
	searchTextLength: number;
	searchTextPreview: string;
	pageTextLength: number;
	textLayerNodeCount: number;
	bestPrefixKeyLength?: number;
	bestWindowKeyLength?: number;
	bestWindowTextPreview?: string;
}

export interface PendingResolutionResult {
	resolved: ResolvedIndices | null;
	diagnostics: PendingResolutionDiagnostics;
}

/** A marker is "pending" when all indices are zero — the state produced by
 *  qdpxImporter when it lacks DOM info. Selections from the viewer always
 *  produce non-zero indices (empty selections are rejected), so false positives
 *  are not a concern. */
export function isMarkerPending(marker: PdfMarker): boolean {
	return marker.beginIndex === 0 && marker.beginOffset === 0
		&& marker.endIndex === 0 && marker.endOffset === 0;
}

function orderedOuterTextLayerNodes(pageEl: HTMLElement): HTMLElement[] {
	const all = Array.from(pageEl.querySelectorAll<HTMLElement>('.textLayerNode'));
	const outer = all.filter((n) => {
		let p = n.parentElement;
		while (p && p !== pageEl) {
			if (p.classList.contains('textLayerNode')) return false;
			p = p.parentElement;
		}
		return true;
	});
	const hasDataIdx = outer.some((n) => n.hasAttribute('data-idx'));
	if (!hasDataIdx) return outer;
	return outer.slice().sort((a, b) => {
		return parseInt(a.getAttribute('data-idx') ?? '0', 10)
			- parseInt(b.getAttribute('data-idx') ?? '0', 10);
	});
}

function previewSearchText(text: string): string {
	return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function buildPageText(nodes: HTMLElement[]): { pageText: string; nodeStarts: number[] } {
	const nodeStarts: number[] = [];
	let pageText = '';
	for (let i = 0; i < nodes.length; i++) {
		nodeStarts.push(pageText.length);
		pageText += nodes[i]!.textContent ?? '';
		if (i < nodes.length - 1) pageText += ' ';
	}
	return { pageText, nodeStarts };
}

function makeDiagnostics(
	reason: PendingResolutionDiagnostics['reason'],
	text: string,
	pageTextLength: number,
	textLayerNodeCount: number,
	matchDiagnostics?: Partial<PendingResolutionDiagnostics>,
): PendingResolutionDiagnostics {
	return {
		reason,
		searchTextLength: text.length,
		searchTextPreview: previewSearchText(text),
		pageTextLength,
		textLayerNodeCount,
		...matchDiagnostics,
	};
}

/** Collapse runs of whitespace to a single space, keep map back to src position. */
function normalizeWithMap(src: string): { text: string; origIndex: number[] } {
	const out: string[] = [];
	const origIndex: number[] = [];
	let lastWasSpace = false;
	for (let i = 0; i < src.length; i++) {
		const ch = src[i]!;
		const isSpace = /\s/.test(ch);
		if (isSpace) {
			if (lastWasSpace) continue;
			out.push(' ');
			origIndex.push(i);
			lastWasSpace = true;
		} else {
			out.push(ch);
			origIndex.push(i);
			lastWasSpace = false;
		}
	}
	origIndex.push(src.length);
	return { text: out.join(''), origIndex };
}

function isSearchKeyChar(ch: string): boolean {
	return /[\p{L}\p{N}]/u.test(ch);
}

/**
 * Build a conservative search key for text extracted through different PDF
 * pipelines. It ignores layout punctuation/whitespace, soft hyphens and
 * replacement chars, but keeps enough lexical content that long quotations
 * should still be unique within a page.
 */
function normalizeSearchKeyWithMap(src: string): { text: string; startIndex: number[]; endIndex: number[] } {
	const out: string[] = [];
	const startIndex: number[] = [];
	const endIndex: number[] = [];

	for (let i = 0; i < src.length;) {
		const cp = src.codePointAt(i);
		if (cp === undefined) break;
		const raw = String.fromCodePoint(cp);
		const rawStart = i;
		const rawEnd = i + raw.length;
		i = rawEnd;

		if (raw === '\uFFFD' || raw === '\u00AD') continue;

		for (const ch of raw.normalize('NFKC').toLocaleLowerCase()) {
			if (!isSearchKeyChar(ch)) continue;
			out.push(ch);
			startIndex.push(rawStart);
			endIndex.push(rawEnd);
		}
	}

	return { text: out.join(''), startIndex, endIndex };
}

function normalizeSearchKey(src: string): string {
	return normalizeSearchKeyWithMap(src).text;
}

function findUniqueSearchKeyRange(
	pageKey: ReturnType<typeof normalizeSearchKeyWithMap>,
	textKey: string,
): { start: number; end: number } | null {
	const maxLen = Math.min(160, textKey.length);
	for (let len = maxLen; len >= 32; len -= 16) {
		const prefix = textKey.slice(0, len);
		const idx = pageKey.text.indexOf(prefix);
		if (idx < 0) continue;
		if (pageKey.text.indexOf(prefix, idx + 1) >= 0) continue;

		const start = pageKey.startIndex[idx];
		const end = pageKey.endIndex[idx + prefix.length - 1];
		if (start === undefined || end === undefined) return null;
		return { start, end };
	}
	return null;
}

function bestPrefixKeyLength(pageKeyText: string, textKey: string): number {
	const maxLen = Math.min(160, textKey.length);
	for (let len = maxLen; len >= 8; len -= 8) {
		if (pageKeyText.includes(textKey.slice(0, len))) return len;
	}
	return 0;
}

function findBestWindowKeyMatch(pageKeyText: string, textKey: string): { length: number; textKeyOffset: number } {
	const maxLen = Math.min(160, textKey.length);
	for (let len = maxLen; len >= 24; len -= 8) {
		for (let start = 0; start + len <= textKey.length; start += 16) {
			const window = textKey.slice(start, start + len);
			if (pageKeyText.includes(window)) return { length: len, textKeyOffset: start };
		}
	}
	return { length: 0, textKeyOffset: 0 };
}

function previewWindowFromTextKeyOffset(text: string, textKeyOffset: number): string {
	if (textKeyOffset <= 0) return previewSearchText(text);

	let keyCount = 0;
	let rawStart = 0;
	for (let i = 0; i < text.length;) {
		const cp = text.codePointAt(i);
		if (cp === undefined) break;
		const raw = String.fromCodePoint(cp);
		const rawEnd = i + raw.length;
		if (raw !== '\uFFFD' && raw !== '\u00AD') {
			for (const ch of raw.normalize('NFKC').toLocaleLowerCase()) {
				if (!isSearchKeyChar(ch)) continue;
				if (keyCount >= textKeyOffset) {
					rawStart = i;
					return previewSearchText(text.slice(rawStart));
				}
				keyCount++;
			}
		}
		i = rawEnd;
	}
	return previewSearchText(text);
}

export function diagnosePendingTextSearch(pageEl: HTMLElement, text: string): Partial<PendingResolutionDiagnostics> {
	const nodes = orderedOuterTextLayerNodes(pageEl);
	if (nodes.length === 0) {
		return { pageTextLength: 0, textLayerNodeCount: 0, bestPrefixKeyLength: 0, bestWindowKeyLength: 0 };
	}

	const { pageText } = buildPageText(nodes);
	const pageKey = normalizeSearchKeyWithMap(pageText);
	const textKey = normalizeSearchKey(text);
	const bestWindow = findBestWindowKeyMatch(pageKey.text, textKey);
	return {
		pageTextLength: pageText.length,
		textLayerNodeCount: nodes.length,
		bestPrefixKeyLength: bestPrefixKeyLength(pageKey.text, textKey),
		bestWindowKeyLength: bestWindow.length,
		bestWindowTextPreview: bestWindow.length > 0 ? previewWindowFromTextKeyOffset(text, bestWindow.textKeyOffset) : '',
	};
}

export function resolvePendingIndicesWithDiagnostics(pageEl: HTMLElement, text: string): PendingResolutionResult {
	const nodes = orderedOuterTextLayerNodes(pageEl);
	if (nodes.length === 0) {
		return {
			resolved: null,
			diagnostics: makeDiagnostics('no-text-layer-nodes', text, 0, 0),
		};
	}

	const { pageText, nodeStarts } = buildPageText(nodes);

	// Try direct first, fall back to whitespace-normalized search.
	let origStart = pageText.indexOf(text);
	let origEnd = origStart >= 0 ? origStart + text.length : -1;

	if (origStart < 0) {
		const normPage = normalizeWithMap(pageText);
		const normText = text.replace(/\s+/g, ' ').trim();
		if (normText.length === 0) {
			return {
				resolved: null,
				diagnostics: makeDiagnostics('empty-search-text', text, pageText.length, nodes.length),
			};
		}
		const normIdx = normPage.text.indexOf(normText);
		if (normIdx >= 0) {
			const s = normPage.origIndex[normIdx];
			const e = normPage.origIndex[normIdx + normText.length];
			if (s === undefined || e === undefined) {
				return {
					resolved: null,
					diagnostics: makeDiagnostics('position-map-failed', text, pageText.length, nodes.length),
				};
			}
			origStart = s;
			origEnd = e;
		} else {
			const pageKey = normalizeSearchKeyWithMap(pageText);
			const textKey = normalizeSearchKey(text);
			if (textKey.length < 24) {
				return {
					resolved: null,
					diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length, diagnosePendingTextSearch(pageEl, text)),
				};
			}
			let keyRange = findUniqueSearchKeyRange(pageKey, textKey);
			if (!keyRange) {
				return {
					resolved: null,
					diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length, diagnosePendingTextSearch(pageEl, text)),
				};
			}
			origStart = keyRange.start;
			origEnd = keyRange.end;
		}
	}

	const findPosition = (pageOffset: number) => {
		for (let i = nodes.length - 1; i >= 0; i--) {
			const base = nodeStarts[i]!;
			if (base > pageOffset) continue;
			const nodeLen = nodes[i]!.textContent?.length ?? 0;
			const offsetInNode = Math.min(nodeLen, pageOffset - base);
			const idxAttr = nodes[i]!.getAttribute('data-idx');
			const index = idxAttr !== null ? parseInt(idxAttr, 10) : i;
			return { index, offsetInNode };
		}
		return null;
	};

	const begin = findPosition(origStart);
	const end = findPosition(origEnd);
	if (!begin || !end) {
		return {
			resolved: null,
			diagnostics: makeDiagnostics('position-map-failed', text, pageText.length, nodes.length),
		};
	}

	return {
		resolved: {
			beginIndex: begin.index,
			beginOffset: begin.offsetInNode,
			endIndex: end.index,
			endOffset: end.offsetInNode,
		},
		diagnostics: makeDiagnostics('resolved', text, pageText.length, nodes.length),
	};
}

export function resolvePendingIndices(pageEl: HTMLElement, text: string): ResolvedIndices | null {
	return resolvePendingIndicesWithDiagnostics(pageEl, text).resolved;
}
