/**
 * Margin panel renderer for PDF pages.
 * Renders MAXQDA-style colored bars in the left margin showing which codes
 * are applied and where. Adapted from codemarker-v2 marginPanelExtension.ts.
 */

import type { PDFPageView } from '../pdfTypings';
import type { PdfMarker, PdfShapeMarker } from '../coding/pdfCodingTypes';
import type { CodeDefinitionRegistry } from '../coding/pdfCodingModel';
import { computeMergedHighlightRects } from './highlightGeometry';
import { getMarkerVerticalBounds } from './highlightGeometry';
import { getTextLayerInfo } from './pdfViewerAccess';
import { getShapeVerticalBounds } from './drawLayer';

// ── Constants ──
const LINE_WIDTH = 2;
const COLUMN_WIDTH = 10;
const DOT_SIZE = 7;
const TICK_LENGTH = 4;
const LABEL_HEIGHT = 16;
const PANEL_PADDING = 4;

const PANEL_CLASS = 'codemarker-pdf-margin-panel';
const LINE_CLASS = 'codemarker-pdf-margin-line';
const TICK_CLASS = 'codemarker-pdf-margin-tick';
const LABEL_CLASS = 'codemarker-pdf-margin-label';
const DOT_CLASS = 'codemarker-pdf-margin-dot';
const HOVERED_CLASS = 'codemarker-pdf-margin-hovered';

// ── Types ──
interface BarEntry {
	markerId: string;
	codeName: string;
	color: string;
	topPct: number;
	bottomPct: number;
	span: number;
	column: number;
}

interface LabelEntry {
	markerId: string;
	codeName: string;
	color: string;
	idealY: number;
	actualY: number;
	column: number;
}

export interface MarginPanelCallbacks {
	onLabelClick: (markerId: string, codeName: string) => void;
	onHover: (markerId: string | null, codeName: string | null) => void;
}

// ── Public API ──

export function renderMarginPanelForPage(
	pageView: PDFPageView,
	markers: PdfMarker[],
	registry: CodeDefinitionRegistry,
	callbacks: MarginPanelCallbacks,
	shapes?: PdfShapeMarker[],
): void {
	const pageDiv = pageView.div;
	clearMarginPanelForPage(pageDiv);

	if (markers.length === 0 && (!shapes || shapes.length === 0)) return;

	// Build bar entries: one per code per marker
	const bars: BarEntry[] = [];

	// Text markers
	const textLayerInfo = getTextLayerInfo(pageView);
	if (textLayerInfo) {
		for (const marker of markers) {
			if (marker.codes.length === 0) continue;

			let mergedRects;
			try {
				mergedRects = computeMergedHighlightRects(
					textLayerInfo,
					marker.beginIndex,
					marker.beginOffset,
					marker.endIndex,
					marker.endOffset,
				);
			} catch {
				continue;
			}

			const bounds = getMarkerVerticalBounds(mergedRects, pageView);
			if (!bounds) continue;

			for (const codeName of marker.codes) {
				const def = registry.getByName(codeName);
				const color = def?.color ?? '#FFEB3B';
				bars.push({
					markerId: marker.id,
					codeName,
					color,
					topPct: bounds.topPct,
					bottomPct: bounds.bottomPct,
					span: bounds.bottomPct - bounds.topPct,
					column: 0,
				});
			}
		}
	}

	// Shape markers
	if (shapes) {
		for (const shape of shapes) {
			if (shape.codes.length === 0) continue;

			const bounds = getShapeVerticalBounds(shape.coords);

			for (const codeName of shape.codes) {
				const def = registry.getByName(codeName);
				const color = def?.color ?? '#FFEB3B';
				bars.push({
					markerId: shape.id,
					codeName,
					color,
					topPct: bounds.topPct,
					bottomPct: bounds.bottomPct,
					span: bounds.bottomPct - bounds.topPct,
					column: 0,
				});
			}
		}
	}

	if (bars.length === 0) return;

	// Assign columns
	assignColumns(bars);

	// Resolve label positions
	const labels = resolveLabels(bars);

	// Compute panel width
	const maxColumn = Math.max(...bars.map(b => b.column));
	const panelWidth = (maxColumn + 1) * COLUMN_WIDTH + PANEL_PADDING * 2;

	// Create panel DOM
	const panel = document.createElement('div');
	panel.className = PANEL_CLASS;
	panel.style.width = `${panelWidth}px`;

	// Render bars, ticks, dots
	for (const bar of bars) {
		const colCenter = panelWidth - PANEL_PADDING - (bar.column + 1) * COLUMN_WIDTH + COLUMN_WIDTH / 2;

		// Vertical line
		const lineEl = document.createElement('div');
		lineEl.className = LINE_CLASS;
		lineEl.dataset.markerId = bar.markerId;
		lineEl.dataset.codeName = bar.codeName;
		lineEl.style.top = `${bar.topPct}%`;
		lineEl.style.height = `${bar.span}%`;
		lineEl.style.left = `${colCenter - LINE_WIDTH / 2}px`;
		lineEl.style.width = `${LINE_WIDTH}px`;
		lineEl.style.backgroundColor = bar.color;
		panel.appendChild(lineEl);

		// Top tick
		const topTick = document.createElement('div');
		topTick.className = TICK_CLASS;
		topTick.dataset.markerId = bar.markerId;
		topTick.dataset.codeName = bar.codeName;
		topTick.style.top = `${bar.topPct}%`;
		topTick.style.left = `${colCenter}px`;
		topTick.style.width = `${TICK_LENGTH}px`;
		topTick.style.height = `${LINE_WIDTH}px`;
		topTick.style.backgroundColor = bar.color;
		panel.appendChild(topTick);

		// Bottom tick
		const bottomTick = document.createElement('div');
		bottomTick.className = TICK_CLASS;
		bottomTick.dataset.markerId = bar.markerId;
		bottomTick.dataset.codeName = bar.codeName;
		bottomTick.style.top = `${bar.bottomPct}%`;
		bottomTick.style.left = `${colCenter}px`;
		bottomTick.style.width = `${TICK_LENGTH}px`;
		bottomTick.style.height = `${LINE_WIDTH}px`;
		bottomTick.style.backgroundColor = bar.color;
		bottomTick.style.transform = `translateY(-${LINE_WIDTH}px)`;
		panel.appendChild(bottomTick);

		// Dot at midpoint
		const dotY = (bar.topPct + bar.bottomPct) / 2;
		const dotEl = document.createElement('div');
		dotEl.className = DOT_CLASS;
		dotEl.dataset.markerId = bar.markerId;
		dotEl.dataset.codeName = bar.codeName;
		dotEl.style.top = `${dotY}%`;
		dotEl.style.left = `${colCenter - DOT_SIZE / 2}px`;
		dotEl.style.width = `${DOT_SIZE}px`;
		dotEl.style.height = `${DOT_SIZE}px`;
		dotEl.style.backgroundColor = bar.color;
		dotEl.style.transform = `translateY(-${DOT_SIZE / 2}px)`;
		panel.appendChild(dotEl);
	}

	// Render labels
	for (const label of labels) {
		const labelEl = document.createElement('div');
		labelEl.className = LABEL_CLASS;
		labelEl.dataset.markerId = label.markerId;
		labelEl.dataset.codeName = label.codeName;
		labelEl.style.top = `${label.actualY}%`;
		labelEl.style.right = `${panelWidth + 2}px`;
		labelEl.style.color = label.color;
		labelEl.textContent = label.codeName;
		panel.appendChild(labelEl);
	}

	// Attach event listeners
	panel.addEventListener('mouseenter', handlePanelHover(callbacks), true);
	panel.addEventListener('mouseover', handlePanelHover(callbacks), true);
	panel.addEventListener('mouseleave', () => {
		callbacks.onHover(null, null);
	});

	panel.addEventListener('click', (e) => {
		const target = (e.target as HTMLElement).closest?.('[data-marker-id]') as HTMLElement | null;
		if (!target) return;
		const markerId = target.dataset.markerId;
		const codeName = target.dataset.codeName;
		if (markerId && codeName && target.classList.contains(LABEL_CLASS)) {
			e.stopPropagation();
			callbacks.onLabelClick(markerId, codeName);
		}
	});

	pageDiv.appendChild(panel);
}

export function clearMarginPanelForPage(pageDiv: HTMLElement): void {
	const existing = pageDiv.querySelector(`.${PANEL_CLASS}`);
	if (existing) existing.remove();
}

export function applyHoverToMarginPanel(
	container: HTMLElement,
	markerId: string | null,
): void {
	const panels = Array.from(container.querySelectorAll<HTMLElement>(`.${PANEL_CLASS}`));
	for (const panel of panels) {
		const els = Array.from(panel.querySelectorAll<HTMLElement>('[data-marker-id]'));
		for (const el of els) {
			if (markerId && el.dataset.markerId === markerId) {
				el.classList.add(HOVERED_CLASS);
			} else {
				el.classList.remove(HOVERED_CLASS);
			}
		}
	}
}

// ── Column Allocation ──

function assignColumns(bars: BarEntry[]): void {
	// Sort by span descending (largest bars get innermost columns)
	bars.sort((a, b) => {
		if (b.span !== a.span) return b.span - a.span;
		return a.topPct - b.topPct;
	});

	const columnRanges: Array<Array<{ top: number; bottom: number }>> = [];

	for (const bar of bars) {
		let assigned = false;
		for (let col = 0; col < columnRanges.length; col++) {
			const ranges = columnRanges[col]!;
			const overlaps = ranges.some(
				r => bar.topPct < r.bottom && bar.bottomPct > r.top,
			);
			if (!overlaps) {
				bar.column = col;
				ranges.push({ top: bar.topPct, bottom: bar.bottomPct });
				assigned = true;
				break;
			}
		}
		if (!assigned) {
			bar.column = columnRanges.length;
			columnRanges.push([{ top: bar.topPct, bottom: bar.bottomPct }]);
		}
	}
}

// ── Label Collision Avoidance ──

function resolveLabels(bars: BarEntry[]): LabelEntry[] {
	const labels: LabelEntry[] = bars.map(b => {
		const midY = (b.topPct + b.bottomPct) / 2;
		return {
			markerId: b.markerId,
			codeName: b.codeName,
			color: b.color,
			idealY: midY,
			actualY: midY,
			column: b.column,
		};
	});

	// Outermost columns placed first (higher column = outermost)
	labels.sort((a, b) => b.column - a.column);

	// LABEL_HEIGHT as % of page: approximate as 1.5% (16px in ~1000px page)
	const labelHeightPct = 1.5;
	const placedYs: number[] = [];

	for (const label of labels) {
		let bestY = label.idealY;

		const collides = (y: number) =>
			placedYs.some(py => Math.abs(y - py) < labelHeightPct);

		if (collides(bestY)) {
			for (let step = 1; step <= 50; step++) {
				const yDown = label.idealY + step * labelHeightPct;
				if (!collides(yDown)) {
					bestY = yDown;
					break;
				}
			}
		}

		label.actualY = bestY;
		placedYs.push(bestY);
	}

	return labels;
}

// ── Event Helpers ──

function handlePanelHover(callbacks: MarginPanelCallbacks) {
	return (e: MouseEvent) => {
		const target = (e.target as HTMLElement).closest?.('[data-marker-id]') as HTMLElement | null;
		if (target) {
			const markerId = target.dataset.markerId ?? null;
			const codeName = target.dataset.codeName ?? null;
			callbacks.onHover(markerId, codeName);
		}
	};
}
