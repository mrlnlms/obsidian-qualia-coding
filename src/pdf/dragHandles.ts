/**
 * Drag handles for PDF highlights.
 * Renders SVG lollipop handles at start/end of each highlight marker,
 * allowing the user to resize the marked range by dragging.
 *
 * SVG structure mirrors markdown's renderOneHandle (markerViewPlugin.ts:228-299)
 * exactly: <svg> → <g transform="translate(cx, groupY)"> → <rect> + <circle>.
 */

import type { PDFPageView } from './pdfTypings';
import type { PdfMarker, PdfMarkerPageProjection } from './pdfCodingTypes';
import type { MarkerRenderInfo } from './highlightRenderer';
import {
	acceptPdfMarkerDragGeometry,
	beginPdfMarkerDrag,
	finishPdfMarkerDrag,
	type PdfDocumentEndpoint,
	type PdfMarkerGeometry,
} from './pdfMarkerResize';

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

export interface PdfDocumentHit {
	endpoint: PdfDocumentEndpoint;
	pageView: PDFPageView;
}

export interface LogicalHandleOptions {
	start: boolean;
	end: boolean;
}

export interface DragHandleCallbacks {
	resolveHit: (clientX: number, clientY: number) => PdfDocumentHit | null;
	buildGeometry: (
		markerId: string,
		type: 'start' | 'end',
		hit: PdfDocumentHit,
		originalGeometry: PdfMarkerGeometry,
	) => PdfMarkerGeometry | null;
	onGeometryPreview: (
		markerId: string,
		geometry: PdfMarkerGeometry,
		type: 'start' | 'end',
		handle: HTMLElement,
	) => void;
	onGeometryCommit: (markerId: string, geometry: PdfMarkerGeometry) => boolean | void;
	onGeometryRestore: (markerId: string, geometry: PdfMarkerGeometry) => void;
	onDragStateChange?: (isDragging: boolean, cancel: () => void) => void;
	onHandleHover?: (markerId: string | null) => void;
}

const activeDragTokens = new Set<() => void>();

export function logicalHandleOptions(
	projection: PdfMarkerPageProjection,
): LogicalHandleOptions {
	return {
		start: projection.renderSegmentIndex === 0,
		end: projection.renderSegmentIndex === projection.renderSegmentCount - 1,
	};
}

/** Attach only the logical endpoint roles represented by this page projection. */
export function attachLogicalDragHandles(
	info: MarkerRenderInfo,
	_pageView: PDFPageView,
	options: LogicalHandleOptions,
	callbacks: DragHandleCallbacks,
): void {
	const { marker, firstRectEl } = info;
	const layer = firstRectEl.parentElement;
	if (!layer) return;

	const handles: HTMLElement[] = [];
	if (options.start) {
		const handle = createAttachedHandle('start', info, layer);
		handles.push(handle);
		setupLogicalDrag(handle, 'start', marker, callbacks);
	}
	if (options.end) {
		const handle = createAttachedHandle('end', info, layer);
		handles.push(handle);
		setupLogicalDrag(handle, 'end', marker, callbacks);
	}

	const keepVisible = () => {
		for (const handle of Array.from(layer.querySelectorAll<HTMLElement>(
			`.${HANDLE_CLASS}[data-marker-id="${marker.id}"]`,
		))) handle.classList.add('codemarker-pdf-handle-visible');
	};
	for (const handle of handles) {
		handle.addEventListener('mouseenter', keepVisible);
		if (callbacks.onHandleHover) {
			handle.addEventListener('mouseenter', () => callbacks.onHandleHover!(marker.id));
			handle.addEventListener('mouseleave', () => {
				if (!document.body.classList.contains('codemarker-pdf-dragging')) {
					callbacks.onHandleHover!(null);
				}
			});
		}
	}
}

function createAttachedHandle(
	type: 'start' | 'end',
	info: MarkerRenderInfo,
	layer: HTMLElement,
): HTMLElement {
	const rect = type === 'start' ? info.firstRectEl : info.lastRectEl;
	const sizes = computeSizes(rect);
	const handle = createHandleSvg(type, info.color, sizes);
	handle.classList.add(HANDLE_CLASS, type === 'start' ? HANDLE_START_CLASS : HANDLE_END_CLASS);
	handle.dataset.markerId = info.marker.id;
	handle.dataset.handleType = type;
	positionHandle(handle, rect, type, sizes);
	layer.appendChild(handle);
	return handle;
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

function setupLogicalDrag(
	handle: HTMLElement,
	type: 'start' | 'end',
	marker: PdfMarker,
	callbacks: DragHandleCallbacks,
): void {
	handle.addEventListener('mousedown', (event) => {
		event.preventDefault();
		event.stopPropagation();

		const transaction = beginPdfMarkerDrag(marker);
		let lastMoveTime = 0;

		const onMove = (moveEvent: MouseEvent) => {
			moveEvent.preventDefault();
			const now = Date.now();
			if (now - lastMoveTime < 16) return;
			lastMoveTime = now;

			const hit = callbacks.resolveHit(moveEvent.clientX, moveEvent.clientY);
			if (!hit) return;
			const geometry = callbacks.buildGeometry(
				marker.id,
				type,
				hit,
				transaction.originalGeometry,
			);
			if (!geometry) return;
			acceptPdfMarkerDragGeometry(transaction, geometry);
			callbacks.onGeometryPreview(marker.id, geometry, type, handle);
		};

		let ended = false;
		const cleanup = () => {
			if (ended) return false;
			ended = true;
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			window.removeEventListener('blur', cancel);
			activeDragTokens.delete(cancel);
			if (activeDragTokens.size === 0) {
				document.body.classList.remove('codemarker-pdf-dragging');
			}
			callbacks.onDragStateChange?.(false, cancel);
			return true;
		};

		const cancel = () => {
			if (!cleanup()) return;
			callbacks.onGeometryRestore(marker.id, transaction.originalGeometry);
		};

		const onUp = () => {
			if (!cleanup()) return;

			const geometry = finishPdfMarkerDrag(transaction);
			if (geometry) {
				const committed = callbacks.onGeometryCommit(marker.id, geometry);
				if (committed === false) {
					callbacks.onGeometryRestore(marker.id, transaction.originalGeometry);
				}
			} else {
				callbacks.onGeometryRestore(marker.id, transaction.originalGeometry);
			}
		};

		activeDragTokens.add(cancel);
		document.body.classList.add('codemarker-pdf-dragging');
		callbacks.onDragStateChange?.(true, cancel);
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		window.addEventListener('blur', cancel);
	});
}
