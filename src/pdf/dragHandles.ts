/**
 * Drag handles for PDF highlights.
 * Renders SVG lollipop handles at start/end of each highlight marker,
 * allowing the user to resize the marked range by dragging.
 *
 * SVG structure mirrors markdown's renderOneHandle (markerViewPlugin.ts:228-299)
 * exactly: <svg> → <g transform="translate(cx, groupY)"> → <rect> + <circle>.
 */

import type { PDFPageView } from './pdfTypings';
import type { PdfMarker } from './pdfCodingTypes';
import { getTextLayerInfo, getTextLayerNode, getOffsetInTextLayerNode } from './pdfViewerAccess';
import type { MarkerRenderInfo } from './highlightRenderer';

// ── Proportional sizing (matches markdown ratios) ──
// Markdown: ballSize = fontSize * 0.75, barW = fontSize * 0.125, barL = lineHeight * 1.1
// PDF: derive from rectEl height (≈ lineHeight of that text)
const BALL_RATIO = 0.38;    // ballRadius / rectHeight  (≈ fontSize*0.375 / lineHeight)
const BAR_W_RATIO = 0.065;  // barWidth / rectHeight    (≈ fontSize*0.125 / lineHeight)
const BAR_L_RATIO = 1.1;    // barLength / rectHeight
const MIN_BALL = 3;
const MAX_BALL = 8;

interface HandleSizes {
	ballRadius: number;
	barWidth: number;
	barLength: number;
	rectHeight: number;
}

function computeSizes(rectEl: HTMLElement): HandleSizes {
	const h = rectEl.getBoundingClientRect().height || 14;
	const ballRadius = Math.min(MAX_BALL, Math.max(MIN_BALL, h * BALL_RATIO));
	const barWidth = Math.max(1.5, h * BAR_W_RATIO);
	const barLength = h * BAR_L_RATIO;
	return { ballRadius, barWidth, barLength, rectHeight: h };
}

const HANDLE_CLASS = 'codemarker-pdf-handle';
const HANDLE_START_CLASS = 'codemarker-pdf-handle-start';
const HANDLE_END_CLASS = 'codemarker-pdf-handle-end';

export interface DragHandleCallbacks {
	onRangeUpdate: (markerId: string, changes: {
		beginIndex?: number; beginOffset?: number;
		endIndex?: number; endOffset?: number;
		text?: string;
	}) => void;
	/** Live preview during drag — updates model silently + re-renders highlights only (no handle rebuild). */
	onRangePreview?: (markerId: string, changes: {
		beginIndex?: number; beginOffset?: number;
		endIndex?: number; endOffset?: number;
		text?: string;
	}) => void;
	onDragStateChange?: (isDragging: boolean) => void;
	onHandleHover?: (markerId: string | null) => void;
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

	// Compute sizes from the first rect (represents line height at that text)
	const startSizes = computeSizes(firstRectEl);
	const endSizes = computeSizes(lastRectEl);

	// Start handle — top-left of first rect
	const startHandle = createHandleSvg('start', info.color, startSizes);
	startHandle.classList.add(HANDLE_CLASS, HANDLE_START_CLASS);
	startHandle.dataset.markerId = marker.id;
	startHandle.dataset.handleType = 'start';
	positionHandle(startHandle, firstRectEl, 'start', startSizes);
	layer.appendChild(startHandle);

	// End handle — bottom-right of last rect
	const endHandle = createHandleSvg('end', info.color, endSizes);
	endHandle.classList.add(HANDLE_CLASS, HANDLE_END_CLASS);
	endHandle.dataset.markerId = marker.id;
	endHandle.dataset.handleType = 'end';
	positionHandle(endHandle, lastRectEl, 'end', endSizes);
	layer.appendChild(endHandle);

	// Handle visibility is controlled centrally by showHandlesForMarker()
	// in highlightRenderer.ts (via hover tracking on the page div).
	// Keep handles visible while hovering over the handle itself.
	const keepVisible = () => {
		startHandle.classList.add('codemarker-pdf-handle-visible');
		endHandle.classList.add('codemarker-pdf-handle-visible');
	};
	startHandle.addEventListener('mouseenter', keepVisible);
	endHandle.addEventListener('mouseenter', keepVisible);

	// Handle hover → notify model (bidirectional with margin panel)
	if (callbacks.onHandleHover) {
		const onEnter = () => callbacks.onHandleHover!(marker.id);
		const onLeave = () => {
			if (document.body.classList.contains('codemarker-pdf-dragging')) return;
			callbacks.onHandleHover!(null);
		};
		startHandle.addEventListener('mouseenter', onEnter);
		startHandle.addEventListener('mouseleave', onLeave);
		endHandle.addEventListener('mouseenter', onEnter);
		endHandle.addEventListener('mouseleave', onLeave);
	}

	// Drag interactions
	setupDrag(startHandle, 'start', marker, pageView, callbacks);
	setupDrag(endHandle, 'end', marker, pageView, callbacks);
}

// ── SVG Handle Creation ──
// Mirrors markdown's renderOneHandle exactly:
//   <svg width=ballSize height=rectHeight*2>
//     <g transform="translate(cx, groupY)">
//       <rect> (bar: x=-barWidth/2, y=0, height=barLength)
//       <circle> (ball: cx=0, cy=0 for start, cy=barLength for end)
//     </g>
//   </svg>

function createHandleSvg(type: 'start' | 'end', color: string, sizes: HandleSizes): HTMLElement {
	const { ballRadius, barWidth, barLength, rectHeight } = sizes;
	const ballSize = ballRadius * 2;
	const strokeWidth = barWidth * 0.75;
	const rx = barWidth / 2;

	const container = document.createElement('div');
	container.style.position = 'absolute';
	container.style.overflow = 'visible';
	container.style.pointerEvents = 'auto';
	container.style.zIndex = '10';

	const svgNs = 'http://www.w3.org/2000/svg';
	// Markdown: svg height = lineHeight * 2
	const svgHeight = rectHeight * 2;

	const svg = document.createElementNS(svgNs, 'svg');
	svg.setAttribute('width', `${ballSize}`);
	svg.setAttribute('height', `${svgHeight}`);
	svg.style.overflow = 'visible';
	svg.style.cursor = type === 'start' ? 'w-resize' : 'e-resize';

	// Markdown: groupY = start ? lineHeight * 0.1 : lineHeight * 0.3
	const groupY = type === 'start' ? rectHeight * 0.1 : rectHeight * 0.3;
	const group = document.createElementNS(svgNs, 'g');
	group.setAttribute('transform', `translate(${ballSize / 2}, ${groupY})`);

	// Bar (always starts at y=0 within the group)
	const bar = document.createElementNS(svgNs, 'rect');
	bar.setAttribute('x', `${-barWidth / 2}`);
	bar.setAttribute('y', '0');
	bar.setAttribute('width', `${barWidth}`);
	bar.setAttribute('height', `${barLength}`);
	bar.setAttribute('fill', color);
	bar.setAttribute('rx', `${rx}`);

	// Circle: at top of bar (start) or bottom of bar (end)
	const circle = document.createElementNS(svgNs, 'circle');
	circle.setAttribute('cx', '0');
	circle.setAttribute('cy', type === 'start' ? '0' : `${barLength}`);
	circle.setAttribute('r', `${ballRadius}`);
	circle.setAttribute('fill', color);
	circle.setAttribute('stroke', 'white');
	circle.setAttribute('stroke-width', `${strokeWidth}`);

	group.appendChild(bar);
	group.appendChild(circle);
	svg.appendChild(group);

	container.appendChild(svg);
	return container;
}

// ── Handle Positioning ──
// Mirrors markdown: svg.style.left = x - ballSize/2, svg.style.top = y - lineHeight * 0.15
// where (x, y) = coords of the marker start/end character (top-left of char).
// In PDF, rectEl.style.left/top/width/height are CSS % values for the rect.

function positionHandle(handle: HTMLElement, rectEl: HTMLElement, type: 'start' | 'end', sizes: HandleSizes): void {
	const { ballRadius, rectHeight } = sizes;
	const ballSize = ballRadius * 2;
	// Markdown: top = y - lineHeight * 0.15
	const topOffset = rectHeight * 0.15;

	if (type === 'start') {
		// x = rect left edge, y = rect top (same as markdown's coordsAtPos.top)
		handle.style.left = `calc(${rectEl.style.left} - ${ballSize / 2}px)`;
		handle.style.top = `calc(${rectEl.style.top} - ${topOffset}px)`;
	} else {
		// x = rect right edge, y = rect top (top of the last line, NOT bottom)
		// Markdown: coordsAtPos(toOffset) returns top of the char line
		const rectRight = `calc(${rectEl.style.left} + ${rectEl.style.width})`;
		handle.style.left = `calc(${rectRight} - ${ballSize / 2}px)`;
		handle.style.top = `calc(${rectEl.style.top} - ${topOffset}px)`;
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

		let lastMoveTime = 0;

		const onMove = (moveEvt: MouseEvent) => {
			moveEvt.preventDefault();

			// Throttle to ~60fps
			const now = Date.now();
			if (now - lastMoveTime < 16) return;
			lastMoveTime = now;

			// Hit-test at current cursor position
			const hitResult = hitTestTextLayer(pageView, moveEvt.clientX, moveEvt.clientY);
			if (!hitResult) return;

			// Validate range won't invert
			const preview = callbacks.onRangePreview ?? callbacks.onRangeUpdate;
			if (type === 'start') {
				if (hitResult.index > marker.endIndex ||
					(hitResult.index === marker.endIndex && hitResult.offset >= marker.endOffset)) return;
				const newText = extractText(pageView, hitResult.index, hitResult.offset, marker.endIndex, marker.endOffset);
				preview(marker.id, {
					beginIndex: hitResult.index,
					beginOffset: hitResult.offset,
					text: newText ?? marker.text,
				});
			} else {
				if (hitResult.index < marker.beginIndex ||
					(hitResult.index === marker.beginIndex && hitResult.offset <= marker.beginOffset)) return;
				const newText = extractText(pageView, marker.beginIndex, marker.beginOffset, hitResult.index, hitResult.offset);
				preview(marker.id, {
					endIndex: hitResult.index,
					endOffset: hitResult.offset,
					text: newText ?? marker.text,
				});
			}
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

	const pageEl = pageView.div;
	const textLayerNode = getTextLayerNode(pageEl, node);
	if (!textLayerNode) return null;

	const idxAttr = textLayerNode.getAttribute('data-idx');
	let index: number;
	if (idxAttr !== null) {
		index = parseInt(idxAttr, 10);
	} else {
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

		if (i < endIndex && item.hasEOL) result += '\n';
		else if (i < endIndex) result += ' ';
	}

	return result.trim() || null;
}
