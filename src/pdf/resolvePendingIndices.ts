/**
 * Resolves DOM indices for imported markers that have placeholder (0,0,0,0)
 * indices. Uses text-search in the page's outer `.textLayerNode` elements.
 *
 * Runs on page render: if a marker is pending AND its text can be found,
 * indices are computed and written back to the marker (silent save). After
 * that, the normal render path pints the highlight.
 */

import type { ImportedPdfTextContext, PdfMarker, PdfSelectionBBoxHint } from './pdfCodingTypes';

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
	bboxTextLayerNodeCount?: number;
	bboxAttempted?: boolean;
	bboxIgnoredPageMismatch?: boolean;
	bboxTextPreview?: string;
	bboxBestPrefixKeyLength?: number;
	bboxBestWindowKeyLength?: number;
	bboxBestWindowTextPreview?: string;
	plainTextContextAttempted?: boolean;
	plainTextContextBestWindowKeyLength?: number;
	plainTextContextWindowTextPreview?: string;
	resolvedBy?: 'page-text' | 'bbox-text' | 'window-text' | 'plain-text-context';
	bestPrefixKeyLength?: number;
	bestWindowKeyLength?: number;
	bestWindowTextPreview?: string;
	candidateRejected?: 'internal-match';
}

export interface PendingResolutionResult {
	resolved: ResolvedIndices | null;
	diagnostics: PendingResolutionDiagnostics;
}

export interface PendingResolutionOptions {
	bboxHint?: PdfSelectionBBoxHint;
	pageNumber?: number;
	allowWindowFallback?: boolean;
	minWindowKeyLength?: number;
	plainTextContext?: ImportedPdfTextContext;
}

const MIN_SEARCH_KEY_LENGTH = 24;
const DEFAULT_MIN_UNIQUE_KEY_LENGTH = 32;
const BBOX_MIN_UNIQUE_KEY_LENGTH = 24;
const MAX_ANCHOR_KEY_LENGTH = 160;
const KEY_LENGTH_STEP = 8;
const WINDOW_KEY_OFFSET_STEP = 16;
const MIN_BEST_WINDOW_KEY_LENGTH = 24;
const MIN_PLAIN_TEXT_CONTEXT_KEY_LENGTH = 8;
const MIN_PLAIN_TEXT_CONTEXT_WINDOW_LENGTH = 48;

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

function intersects(a: DOMRect, b: DOMRect): boolean {
	return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function nodesNearBBox(pageEl: HTMLElement, nodes: HTMLElement[], bbox: PdfSelectionBBoxHint): HTMLElement[] {
	const pageRect = pageEl.getBoundingClientRect();
	if (pageRect.width <= 0 || pageRect.height <= 0) return [];

	const left = pageRect.left + (bbox.x / 100) * pageRect.width;
	const top = pageRect.top + (bbox.y / 100) * pageRect.height;
	const width = (bbox.w / 100) * pageRect.width;
	const height = (bbox.h / 100) * pageRect.height;
	const padX = Math.max(24, pageRect.width * 0.03);
	const padY = Math.max(18, pageRect.height * 0.02);
	const target = new DOMRect(
		left - padX,
		top - padY,
		Math.max(1, width) + padX * 2,
		Math.max(1, height) + padY * 2,
	);

	return nodes.filter((node) => {
		const rect = node.getBoundingClientRect();
		if (rect.width <= 0 && rect.height <= 0) return false;
		return intersects(rect, target);
	});
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

function normalizeAtlasLigatureAliases(key: string): string {
	return key.replace(/fff/g, 'ffi').replace(/ff/g, 'fi');
}

function findUniqueSearchKeyRange(
	pageKey: ReturnType<typeof normalizeSearchKeyWithMap>,
	textKey: string,
	minLength = DEFAULT_MIN_UNIQUE_KEY_LENGTH,
): { start: number; end: number } | null {
	const maxLen = Math.min(MAX_ANCHOR_KEY_LENGTH, textKey.length);
	for (let len = maxLen; len >= minLength; len -= KEY_LENGTH_STEP) {
		const prefix = textKey.slice(0, len);
		const idx = pageKey.text.indexOf(prefix);
		if (idx < 0) continue;
		if (pageKey.text.indexOf(prefix, idx + 1) >= 0) continue;

		const start = pageKey.startIndex[idx];
		const pageSlice = pageKey.text.slice(idx, idx + textKey.length);
		const fullKeyFitsAtAnchor = normalizeAtlasLigatureAliases(pageSlice) === normalizeAtlasLigatureAliases(textKey);
		const keyEnd = idx + (fullKeyFitsAtAnchor ? textKey.length : prefix.length) - 1;
		const end = pageKey.endIndex[keyEnd];
		if (start === undefined || end === undefined) return null;
		return { start, end };
	}
	return null;
}

function findUniqueWindowSearchKeyRange(
	pageKey: ReturnType<typeof normalizeSearchKeyWithMap>,
	textKey: string,
	minLength: number,
): { start: number; end: number; length: number; textKeyOffset: number } | null {
	const maxLen = Math.min(MAX_ANCHOR_KEY_LENGTH, textKey.length);
	for (let len = maxLen; len >= minLength; len -= KEY_LENGTH_STEP) {
		for (let textKeyOffset = 0; textKeyOffset + len <= textKey.length; textKeyOffset += WINDOW_KEY_OFFSET_STEP) {
			const window = textKey.slice(textKeyOffset, textKeyOffset + len);
			const idx = pageKey.text.indexOf(window);
			if (idx < 0) continue;
			if (pageKey.text.indexOf(window, idx + 1) >= 0) continue;

			const start = pageKey.startIndex[idx];
			const end = pageKey.endIndex[idx + len - 1];
			if (start === undefined || end === undefined) return null;
			return { start, end, length: len, textKeyOffset };
		}
	}
	return null;
}

function findNodePosition(nodes: HTMLElement[], nodeStarts: number[], pageOffset: number): { index: number; offsetInNode: number } | null {
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
}

function pageOffsetsToResolvedIndices(
	nodes: HTMLElement[],
	nodeStarts: number[],
	start: number,
	end: number,
): ResolvedIndices | null {
	const begin = findNodePosition(nodes, nodeStarts, start);
	const finish = findNodePosition(nodes, nodeStarts, end);
	if (!begin || !finish) return null;
	return {
		beginIndex: begin.index,
		beginOffset: begin.offsetInNode,
		endIndex: finish.index,
		endOffset: finish.offsetInNode,
	};
}

function nodeArrayPosition(nodes: HTMLElement[], index: number): number {
	for (let i = 0; i < nodes.length; i++) {
		const dataIndex = nodes[i]!.getAttribute('data-idx');
		if ((dataIndex === null ? i : parseInt(dataIndex, 10)) === index) return i;
	}
	return -1;
}

function extractResolvedRangeText(nodes: HTMLElement[], resolved: ResolvedIndices): string {
	let beginPosition = nodeArrayPosition(nodes, resolved.beginIndex);
	let endPosition = nodeArrayPosition(nodes, resolved.endIndex);
	if (beginPosition < 0 || endPosition < 0) return '';
	if (endPosition < beginPosition) [beginPosition, endPosition] = [endPosition, beginPosition];

	let endOffset = resolved.endOffset;
	if (endOffset === 0 && endPosition > beginPosition) {
		endPosition--;
		endOffset = nodes[endPosition]?.textContent?.length ?? 0;
	}

	const parts: string[] = [];
	for (let position = beginPosition; position <= endPosition; position++) {
		const value = nodes[position]?.textContent ?? '';
		const start = position === beginPosition ? Math.min(resolved.beginOffset, value.length) : 0;
		const end = position === endPosition ? Math.min(endOffset, value.length) : value.length;
		if (end > start) parts.push(value.slice(start, end));
	}
	return parts.join(' ');
}

/** Reject a candidate that found only an internal window of the quotation. */
function startsAtExpectedText(nodes: HTMLElement[], text: string, resolved: ResolvedIndices): boolean {
	const expectedKey = normalizeAtlasLigatureAliases(normalizeSearchKey(text));
	const coveredKey = normalizeAtlasLigatureAliases(normalizeSearchKey(extractResolvedRangeText(nodes, resolved)));
	const prefixLength = Math.min(32, expectedKey.length, coveredKey.length);
	return prefixLength >= MIN_PLAIN_TEXT_CONTEXT_KEY_LENGTH
		&& coveredKey.slice(0, prefixLength) === expectedKey.slice(0, prefixLength);
}

function resolveInOrderedNodes(nodes: HTMLElement[], text: string, options: { minUniqueKeyLength?: number; allowWindowFallback?: boolean; minWindowKeyLength?: number } = {}): PendingResolutionResult {
	const { pageText, nodeStarts } = buildPageText(nodes);
	let windowFallbackMatch: { length: number; textKeyOffset: number } | null = null;

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
			if (textKey.length < MIN_SEARCH_KEY_LENGTH) {
				return {
					resolved: null,
					diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length),
				};
			}
			const keyRange = findUniqueSearchKeyRange(pageKey, textKey, options.minUniqueKeyLength ?? DEFAULT_MIN_UNIQUE_KEY_LENGTH);
			if (keyRange) {
				origStart = keyRange.start;
				origEnd = keyRange.end;
			} else if (options.allowWindowFallback) {
				const windowRange = findUniqueWindowSearchKeyRange(pageKey, textKey, options.minWindowKeyLength ?? 96);
				if (!windowRange) {
					return {
						resolved: null,
						diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length),
					};
				}
				origStart = windowRange.start;
				origEnd = windowRange.end;
				windowFallbackMatch = { length: windowRange.length, textKeyOffset: windowRange.textKeyOffset };
			} else {
				return {
					resolved: null,
					diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length),
				};
			}
		}
	}

	const resolved = pageOffsetsToResolvedIndices(nodes, nodeStarts, origStart, origEnd);
	if (!resolved) {
		return {
			resolved: null,
			diagnostics: makeDiagnostics('position-map-failed', text, pageText.length, nodes.length),
		};
	}
	if (!startsAtExpectedText(nodes, text, resolved)) {
		return {
			resolved: null,
			diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length, {
				candidateRejected: 'internal-match',
				...(windowFallbackMatch ? {
					bestWindowKeyLength: windowFallbackMatch.length,
					bestWindowTextPreview: previewWindowFromTextKeyOffset(text, windowFallbackMatch.textKeyOffset),
					resolvedBy: 'window-text' as const,
				} : {}),
			}),
		};
	}

	return {
		resolved,
		diagnostics: makeDiagnostics('resolved', text, pageText.length, nodes.length, windowFallbackMatch ? {
			bestWindowKeyLength: windowFallbackMatch.length,
			bestWindowTextPreview: previewWindowFromTextKeyOffset(text, windowFallbackMatch.textKeyOffset),
			resolvedBy: 'window-text',
		} : undefined),
	};
}

function resolveWithPlainTextContext(nodes: HTMLElement[], text: string, context: ImportedPdfTextContext): PendingResolutionResult {
	const { pageText, nodeStarts } = buildPageText(nodes);
	const pageKey = normalizeSearchKeyWithMap(pageText);
	const contextText = `${context.before}${context.exact}${context.after}`;
	const contextKey = normalizeSearchKeyWithMap(contextText);
	const textKey = normalizeSearchKey(text);

	if (textKey.length < MIN_PLAIN_TEXT_CONTEXT_KEY_LENGTH || contextKey.text.length < textKey.length) {
		return {
			resolved: null,
			diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length, {
				plainTextContextAttempted: true,
				plainTextContextBestWindowKeyLength: 0,
			}),
		};
	}

	const textKeyStart = contextKey.text.indexOf(textKey);
	if (textKeyStart < 0 || contextKey.text.indexOf(textKey, textKeyStart + 1) >= 0) {
		return {
			resolved: null,
			diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length, {
				plainTextContextAttempted: true,
				plainTextContextBestWindowKeyLength: 0,
			}),
		};
	}

	const textKeyEnd = textKeyStart + textKey.length;
	const maxLen = Math.min(MAX_ANCHOR_KEY_LENGTH, contextKey.text.length);
	const minLen = Math.min(maxLen, Math.max(MIN_PLAIN_TEXT_CONTEXT_WINDOW_LENGTH, textKey.length));
	let bestWindowLength = 0;
	let bestWindowPreview = '';

	for (let len = maxLen; len >= minLen; len -= KEY_LENGTH_STEP) {
		const minStart = Math.max(0, textKeyEnd - len);
		const maxStart = Math.min(textKeyStart, contextKey.text.length - len);
		if (minStart > maxStart) continue;

		const starts = new Set<number>([
			Math.max(minStart, Math.min(maxStart, textKeyStart - Math.floor((len - textKey.length) / 2))),
			minStart,
			maxStart,
		]);
		for (const windowStart of starts) {
			const windowKey = contextKey.text.slice(windowStart, windowStart + len);
			const pageWindowStart = pageKey.text.indexOf(windowKey);
			if (pageWindowStart < 0) continue;
			if (pageKey.text.indexOf(windowKey, pageWindowStart + 1) >= 0) {
				bestWindowLength = Math.max(bestWindowLength, len);
				continue;
			}

			const markerPageKeyStart = pageWindowStart + (textKeyStart - windowStart);
			const markerPageKeyEnd = markerPageKeyStart + textKey.length;
			const rawStart = pageKey.startIndex[markerPageKeyStart];
			const rawEnd = pageKey.endIndex[markerPageKeyEnd - 1];
			if (rawStart === undefined || rawEnd === undefined) {
				return {
					resolved: null,
					diagnostics: makeDiagnostics('position-map-failed', text, pageText.length, nodes.length, {
						plainTextContextAttempted: true,
						plainTextContextBestWindowKeyLength: len,
					}),
				};
			}

			const resolved = pageOffsetsToResolvedIndices(nodes, nodeStarts, rawStart, rawEnd);
			if (!resolved) {
				return {
					resolved: null,
					diagnostics: makeDiagnostics('position-map-failed', text, pageText.length, nodes.length, {
						plainTextContextAttempted: true,
						plainTextContextBestWindowKeyLength: len,
					}),
				};
			}
			if (!startsAtExpectedText(nodes, text, resolved)) {
				continue;
			}

			bestWindowPreview = previewWindowFromTextKeyOffset(contextText, windowStart);
			return {
				resolved,
				diagnostics: makeDiagnostics('resolved', text, pageText.length, nodes.length, {
					plainTextContextAttempted: true,
					plainTextContextBestWindowKeyLength: len,
					plainTextContextWindowTextPreview: bestWindowPreview,
					resolvedBy: 'plain-text-context',
				}),
			};
		}
	}

	return {
		resolved: null,
		diagnostics: makeDiagnostics('not-found', text, pageText.length, nodes.length, {
			plainTextContextAttempted: true,
			plainTextContextBestWindowKeyLength: bestWindowLength,
			plainTextContextWindowTextPreview: bestWindowPreview,
		}),
	};
}

function bestPrefixKeyLength(pageKeyText: string, textKey: string): number {
	const maxLen = Math.min(MAX_ANCHOR_KEY_LENGTH, textKey.length);
	for (let len = maxLen; len >= MIN_PLAIN_TEXT_CONTEXT_KEY_LENGTH; len -= KEY_LENGTH_STEP) {
		if (pageKeyText.includes(textKey.slice(0, len))) return len;
	}
	return 0;
}

function findBestWindowKeyMatch(pageKeyText: string, textKey: string): { length: number; textKeyOffset: number } {
	const maxLen = Math.min(MAX_ANCHOR_KEY_LENGTH, textKey.length);
	for (let len = maxLen; len >= MIN_BEST_WINDOW_KEY_LENGTH; len -= KEY_LENGTH_STEP) {
		for (let start = 0; start + len <= textKey.length; start += WINDOW_KEY_OFFSET_STEP) {
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

function diagnoseTextInNodes(nodes: HTMLElement[], text: string): Partial<PendingResolutionDiagnostics> {
	if (nodes.length === 0) {
		return { bboxTextLayerNodeCount: 0, bboxBestPrefixKeyLength: 0, bboxBestWindowKeyLength: 0, bboxTextPreview: '' };
	}

	const { pageText } = buildPageText(nodes);
	const pageKey = normalizeSearchKeyWithMap(pageText);
	const textKey = normalizeSearchKey(text);
	const bestWindow = findBestWindowKeyMatch(pageKey.text, textKey);
	return {
		bboxTextLayerNodeCount: nodes.length,
		bboxTextPreview: previewSearchText(pageText),
		bboxBestPrefixKeyLength: bestPrefixKeyLength(pageKey.text, textKey),
		bboxBestWindowKeyLength: bestWindow.length,
		bboxBestWindowTextPreview: bestWindow.length > 0 ? previewWindowFromTextKeyOffset(text, bestWindow.textKeyOffset) : '',
	};
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

export function resolvePendingIndicesWithDiagnostics(pageEl: HTMLElement, text: string, options: PendingResolutionOptions = {}): PendingResolutionResult {
	const nodes = orderedOuterTextLayerNodes(pageEl);
	if (nodes.length === 0) {
		return {
			resolved: null,
			diagnostics: makeDiagnostics('no-text-layer-nodes', text, 0, 0),
		};
	}

	const pageResult = resolveInOrderedNodes(nodes, text, {
		allowWindowFallback: options.allowWindowFallback,
		minWindowKeyLength: options.minWindowKeyLength,
	});
	if (pageResult.resolved) {
		return {
			resolved: pageResult.resolved,
			diagnostics: { ...pageResult.diagnostics, resolvedBy: pageResult.diagnostics.resolvedBy ?? 'page-text' },
		};
	}

	const bboxIgnoredPageMismatch = !!options.bboxHint && options.bboxHint.page !== options.pageNumber;
	const bboxHint = options.bboxHint && !bboxIgnoredPageMismatch ? options.bboxHint : undefined;
	const bboxNodes = bboxHint ? nodesNearBBox(pageEl, nodes, bboxHint) : [];
	const bboxDiagnostics = bboxHint ? diagnoseTextInNodes(bboxNodes, text) : {};
	if (bboxNodes.length > 0) {
		const bboxResult = resolveInOrderedNodes(bboxNodes, text, { minUniqueKeyLength: BBOX_MIN_UNIQUE_KEY_LENGTH });
		if (bboxResult.resolved) {
			return {
				resolved: bboxResult.resolved,
				diagnostics: {
					...bboxResult.diagnostics,
					textLayerNodeCount: nodes.length,
					bboxTextLayerNodeCount: bboxNodes.length,
					bboxAttempted: true,
					...bboxDiagnostics,
					resolvedBy: 'bbox-text',
				},
			};
		}
	}

	const plainTextContextResult = options.plainTextContext
		? resolveWithPlainTextContext(nodes, text, options.plainTextContext)
		: null;
	if (plainTextContextResult?.resolved) {
		return plainTextContextResult;
	}

	const diagnostics = makeDiagnostics(
		pageResult.diagnostics.reason,
		text,
		pageResult.diagnostics.pageTextLength,
		nodes.length,
		diagnosePendingTextSearch(pageEl, text),
	);
	if (bboxHint) diagnostics.bboxAttempted = true;
	if (bboxIgnoredPageMismatch) diagnostics.bboxIgnoredPageMismatch = true;
	Object.assign(diagnostics, bboxDiagnostics);
	if (plainTextContextResult) {
		Object.assign(diagnostics, {
			plainTextContextAttempted: true,
			plainTextContextBestWindowKeyLength: plainTextContextResult.diagnostics.plainTextContextBestWindowKeyLength,
			plainTextContextWindowTextPreview: plainTextContextResult.diagnostics.plainTextContextWindowTextPreview,
		});
	}
	return { resolved: null, diagnostics };
}

export function resolvePendingIndices(pageEl: HTMLElement, text: string): ResolvedIndices | null {
	return resolvePendingIndicesWithDiagnostics(pageEl, text).resolved;
}
