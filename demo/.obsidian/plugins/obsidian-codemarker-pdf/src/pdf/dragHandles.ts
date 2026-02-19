/**
 * Drag handles for PDF highlights.
 * Renders SVG lollipop handles at start/end of each highlight marker,
 * allowing the user to resize the marked range by dragging.
 * Design adapted from codemarker-v2 handleWidget.ts.
 */

import type { PDFPageView } from '../pdfTypings';
import type { PdfMarker } from '../coding/pdfCodingTypes';
import { getTextLayerInfo, getTextLayerNode, getOffsetInTextLayerNode } from './pdfViewerAccess';
import type { MarkerRenderInfo } from './highlightRenderer';

// ── Constants (proportional to a ~14px base) ──
const BALL_RADIUS = 4;
const BAR_WIDTH = 2;
const BAR_LENGTH = 16;
const HANDLE_CLASS = 'codemarker-pdf-handle';
const HANDLE_START_CLASS = 'codemarker-pdf-handle-start';
const HANDLE_END_CLASS = 'codemarker-pdf-handle-end';

export interface DragHandleCallbacks {
	onRangeUpdate: (markerId: string, changes: {
		beginIndex?: number; beginOffset?: number;
		endIndex?: number; endOffset?: number;
		text?: string;
	}) => void;
	onDragStateChange?: (isDragging: boolean) => void;
}

/**
 * Attach drag handles to a rendered marker's first and last highlight rects.
 */
export function attachDragHandles(
	info: MarkerRenderInfo,
	pageView: PDFPageView,
	callbacks: DragHandleCallbacks,
): void {
	const { marker, firstRectEl, lastRectEl } = info;
	const layer = firstRectEl.parentElement;
	if (!layer) return;

	// Start handle — top-left of first rect
	const startHandle = createHandleSvg('start', info.color);
	startHandle.classList.add(HANDLE_CLASS, HANDLE_START_CLASS);
	startHandle.dataset.markerId = marker.id;
	startHandle.dataset.handleType = 'start';
	positionHandle(startHandle, firstRectEl, 'start');
	layer.appendChild(startHandle);

	// End handle — bottom-right of last rect
	const endHandle = createHandleSvg('end', info.color);
	endHandle.classList.add(HANDLE_CLASS, HANDLE_END_CLASS);
	endHandle.dataset.markerId = marker.id;
	endHandle.dataset.handleType = 'end';
	positionHandle(endHandle, lastRectEl, 'end');
	layer.appendChild(endHandle);

	// Show handles on highlight hover
	const allRects = layer.querySelectorAll<HTMLElement>(`[data-marker-id="${marker.id}"].codemarker-pdf-highlight`);
	const showHandles = () => {
		startHandle.classList.add('codemarker-pdf-handle-visible');
		endHandle.classList.add('codemarker-pdf-handle-visible');
	};
	const hideHandles = () => {
		if (document.body.classList.contains('codemarker-pdf-dragging')) return;
		startHandle.classList.remove('codemarker-pdf-handle-visible');
		endHandle.classList.remove('codemarker-pdf-handle-visible');
	};

	for (const rect of Array.from(allRects)) {
		rect.addEventListener('mouseenter', showHandles);
		rect.addEventListener('mouseleave', hideHandles);
	}
	startHandle.addEventListener('mouseenter', showHandles);
	startHandle.addEventListener('mouseleave', hideHandles);
	endHandle.addEventListener('mouseenter', showHandles);
	endHandle.addEventListener('mouseleave', hideHandles);

	// Drag interactions
	setupDrag(startHandle, 'start', marker, pageView, callbacks);
	setupDrag(endHandle, 'end', marker, pageView, callbacks);
}

// ── SVG Handle Creation ──

function createHandleSvg(type: 'start' | 'end', color: string): HTMLElement {
	const container = document.createElement('div');
	container.style.position = 'absolute';
	container.style.overflow = 'visible';
	container.style.pointerEvents = 'auto';
	container.style.zIndex = '10';

	const svgNs = 'http://www.w3.org/2000/svg';
	const totalHeight = BAR_LENGTH + BALL_RADIUS * 2;
	const totalWidth = BALL_RADIUS * 2;

	const svg = document.createElementNS(svgNs, 'svg');
	svg.setAttribute('width', `${totalWidth}`);
	svg.setAttribute('height', `${totalHeight}`);
	svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
	svg.style.overflow = 'visible';
	svg.style.cursor = type === 'start' ? 'w-resize' : 'e-resize';

	const cx = BALL_RADIUS;

	if (type === 'start') {
		// Ball on top, bar below
		const circle = document.createElementNS(svgNs, 'circle');
		circle.setAttribute('cx', `${cx}`);
		circle.setAttribute('cy', `${BALL_RADIUS}`);
		circle.setAttribute('r', `${BALL_RADIUS}`);
		circle.setAttribute('fill', color);
		svg.appendChild(circle);

		const bar = document.createElementNS(svgNs, 'rect');
		bar.setAttribute('x', `${cx - BAR_WIDTH / 2}`);
		bar.setAttribute('y', `${BALL_RADIUS * 2}`);
		bar.setAttribute('width', `${BAR_WIDTH}`);
		bar.setAttribute('height', `${BAR_LENGTH}`);
		bar.setAttribute('fill', color);
		bar.setAttribute('rx', '1');
		svg.appendChild(bar);
	} else {
		// Bar on top, ball at bottom
		const bar = document.createElementNS(svgNs, 'rect');
		bar.setAttribute('x', `${cx - BAR_WIDTH / 2}`);
		bar.setAttribute('y', '0');
		bar.setAttribute('width', `${BAR_WIDTH}`);
		bar.setAttribute('height', `${BAR_LENGTH}`);
		bar.setAttribute('fill', color);
		bar.setAttribute('rx', '1');
		svg.appendChild(bar);

		const circle = document.createElementNS(svgNs, 'circle');
		circle.setAttribute('cx', `${cx}`);
		circle.setAttribute('cy', `${BAR_LENGTH + BALL_RADIUS}`);
		circle.setAttribute('r', `${BALL_RADIUS}`);
		circle.setAttribute('fill', color);
		svg.appendChild(circle);
	}

	container.appendChild(svg);
	return container;
}

// ── Handle Positioning ──

function positionHandle(handle: HTMLElement, rectEl: HTMLElement, type: 'start' | 'end'): void {
	// Position relative to the highlight layer (same parent)
	// Read the rect's CSS positioning (which is in %)
	const totalHeight = BAR_LENGTH + BALL_RADIUS * 2;

	if (type === 'start') {
		// Top-left of the first rect, handle extends upward
		handle.style.left = `calc(${rectEl.style.left} - ${BALL_RADIUS}px)`;
		handle.style.top = `calc(${rectEl.style.top} - ${totalHeight}px)`;
	} else {
		// Bottom-right of the last rect, handle extends downward
		const rectRight = `calc(${rectEl.style.left} + ${rectEl.style.width})`;
		handle.style.left = `calc(${rectRight} - ${BALL_RADIUS}px)`;
		handle.style.top = `calc(${rectEl.style.top} + ${rectEl.style.height})`;
	}
}

// ── Drag Logic ──

function setupDrag(
	handle: HTMLElement,
	type: 'start' | 'end',
	marker: PdfMarker,
	pageView: PDFPageView,
	callbacks: DragHandleCallbacks,
): void {
	handle.addEventListener('mousedown', (e) => {
		e.preventDefault();
		e.stopPropagation();

		document.body.classList.add('codemarker-pdf-dragging');
		callbacks.onDragStateChange?.(true);

		const onMove = (moveEvt: MouseEvent) => {
			moveEvt.preventDefault();
			// Visual feedback could be added here (e.g., temporary highlight preview)
			// For now, the actual update happens on mouseup
		};

		const onUp = (upEvt: MouseEvent) => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			document.body.classList.remove('codemarker-pdf-dragging');
			callbacks.onDragStateChange?.(false);

			// Hit-test the text layer at the drop position
			const hitResult = hitTestTextLayer(pageView, upEvt.clientX, upEvt.clientY);
			if (!hitResult) return;

			// Validate: start can't go past end, end can't go before start
			if (type === 'start') {
				if (hitResult.index > marker.endIndex ||
					(hitResult.index === marker.endIndex && hitResult.offset >= marker.endOffset)) {
					return; // Would invert the range
				}

				// Extract new text
				const newText = extractText(pageView, hitResult.index, hitResult.offset, marker.endIndex, marker.endOffset);
				callbacks.onRangeUpdate(marker.id, {
					beginIndex: hitResult.index,
					beginOffset: hitResult.offset,
					text: newText ?? marker.text,
				});
			} else {
				if (hitResult.index < marker.beginIndex ||
					(hitResult.index === marker.beginIndex && hitResult.offset <= marker.beginOffset)) {
					return; // Would invert the range
				}

				const newText = extractText(pageView, marker.beginIndex, marker.beginOffset, hitResult.index, hitResult.offset);
				callbacks.onRangeUpdate(marker.id, {
					endIndex: hitResult.index,
					endOffset: hitResult.offset,
					text: newText ?? marker.text,
				});
			}
		};

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	});
}

// ── Text Layer Hit Test ──

interface HitTestResult {
	index: number;
	offset: number;
}

/**
 * Convert a client coordinate to a text layer index/offset.
 * Uses caretPositionFromPoint (or caretRangeFromPoint fallback) to find
 * the character position under the cursor.
 */
function hitTestTextLayer(pageView: PDFPageView, clientX: number, clientY: number): HitTestResult | null {
	const textLayerInfo = getTextLayerInfo(pageView);
	if (!textLayerInfo) return null;

	// Use the browser's caret API to find the text position
	let node: Node | null = null;
	let offsetInNode = 0;

	if ('caretPositionFromPoint' in document) {
		const pos = (document as any).caretPositionFromPoint(clientX, clientY);
		if (pos) {
			node = pos.offsetNode;
			offsetInNode = pos.offset;
		}
	} else if ('caretRangeFromPoint' in (document as any)) {
		const range = (document as any).caretRangeFromPoint(clientX, clientY) as Range | null;
		if (range) {
			node = range.startContainer;
			offsetInNode = range.startOffset;
		}
	}

	if (!node) return null;

	// Walk up to find the textLayerNode
	const pageEl = pageView.div;
	const textLayerNode = getTextLayerNode(pageEl, node);
	if (!textLayerNode) return null;

	// Get data-idx
	const idxAttr = textLayerNode.getAttribute('data-idx');
	let index: number;
	if (idxAttr !== null) {
		index = parseInt(idxAttr, 10);
	} else {
		// Fallback: find index among siblings
		const parent = textLayerNode.parentElement;
		if (!parent) return null;
		const nodes = parent.querySelectorAll('.textLayerNode');
		let found = -1;
		for (let i = 0; i < nodes.length; i++) {
			if (nodes[i] === textLayerNode) { found = i; break; }
		}
		if (found < 0) return null;
		index = found;
	}

	// Calculate offset within the textLayerNode
	const offset = getOffsetInTextLayerNode(textLayerNode, node, offsetInNode);
	if (offset === null) return null;

	return { index, offset };
}

/**
 * Extract text from the text layer between two index/offset positions.
 */
function extractText(
	pageView: PDFPageView,
	beginIndex: number, beginOffset: number,
	endIndex: number, endOffset: number,
): string | null {
	const textLayerInfo = getTextLayerInfo(pageView);
	if (!textLayerInfo) return null;

	const { textContentItems } = textLayerInfo;
	let result = '';

	for (let i = beginIndex; i <= endIndex; i++) {
		const item = textContentItems[i];
		if (!item) continue;

		const str = item.str;
		const from = i === beginIndex ? beginOffset : 0;
		const to = i === endIndex ? endOffset : str.length;
		result += str.slice(from, to);

		// Add space between items (except at the end)
		if (i < endIndex && item.hasEOL) result += '\n';
		else if (i < endIndex) result += ' ';
	}

	return result.trim() || null;
}
