/**
 * PDF margin-panel measurement and document-level rendering.
 * Page snapshots remain percentage based; the rendered rails use global pixels.
 */

import type { MarginRailLayout } from '../core/marginPanelLayout';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { PDFPageView } from './pdfTypings';
import type { PdfMarker, PdfMarkerPageProjection, PdfShapeMarker } from './pdfCodingTypes';
import { computeMergedHighlightRects, getMarkerVerticalBounds } from './highlightGeometry';
import { getTextLayerInfo } from './pdfViewerAccess';
import { getShapeVerticalBounds } from './drawLayer';
import { NON_EDITABLE_MARKER_COLOR } from './markerAppearance';
import {
	pdfMarginRailKey,
	type PdfMarginPageSnapshot,
	type PdfMarginVisualSegment,
} from './pdfMarginPanelLayout';

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

export interface MarginPanelOwnerLabel {
	abbreviation: string;
	fullName: string;
}

export interface MarginPanelCallbacks {
	onLabelClick: (markerId: string, codeName: string) => void;
	onHover: (markerId: string | null, codeName: string | null) => void;
}

export function collectMarginPanelPageSnapshot(
	pageView: PDFPageView,
	markers: PdfMarkerPageProjection[],
	registry: CodeDefinitionRegistry,
	shapes?: PdfShapeMarker[],
	ownerLabelForMarker?: (marker: PdfMarker | PdfShapeMarker) => MarginPanelOwnerLabel,
	isMarkerEditable?: (marker: PdfMarker | PdfShapeMarker) => boolean,
): PdfMarginPageSnapshot {
	const entries: PdfMarginVisualSegment[] = [];
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

			const bounds = getMarkerVerticalBounds(
				mergedRects,
				pageView as unknown as { pdfPage: { view: [number, number, number, number] } },
			);
			if (!bounds) continue;
			appendEntries(
				entries,
				marker,
				pageView.id,
				marker.renderSegmentIndex,
				marker.renderSegmentCount,
				bounds.topPct,
				bounds.bottomPct,
				registry,
				ownerLabelForMarker,
				isMarkerEditable,
			);
		}
	}

	for (const shape of shapes ?? []) {
		if (shape.codes.length === 0) continue;
		const bounds = getShapeVerticalBounds(shape.coords);
		appendEntries(
			entries,
			shape,
			pageView.id,
			0,
			1,
			bounds.topPct,
			bounds.bottomPct,
			registry,
			ownerLabelForMarker,
			isMarkerEditable,
		);
	}

	return { pageNumber: pageView.id, entries };
}

export function pdfMarginPanelBarWidth(rails: readonly MarginRailLayout[]): number {
	if (rails.length === 0) return 0;
	const maxLane = Math.max(...rails.map((rail) => rail.lane));
	return (maxLane + 1) * COLUMN_WIDTH + PANEL_PADDING * 2;
}

export function renderPdfMarginPanel(
	container: HTMLElement,
	rails: readonly MarginRailLayout[],
	callbacks: MarginPanelCallbacks,
): number {
	clearPdfMarginPanel(container);
	const panelWidth = pdfMarginPanelBarWidth(rails);
	if (panelWidth === 0) return 0;

	const panel = document.createElement('div');
	panel.className = PANEL_CLASS;
	panel.style.width = `${panelWidth}px`;

	for (const rail of rails) {
		const colCenter = panelWidth - PANEL_PADDING
			- (rail.lane + 1) * COLUMN_WIDTH
			+ COLUMN_WIDTH / 2;

		const line = createRailElement('div', LINE_CLASS, rail);
		line.style.top = `${rail.top}px`;
		line.style.height = `${rail.bottom - rail.top}px`;
		line.style.left = `${colCenter - LINE_WIDTH / 2}px`;
		line.style.width = `${LINE_WIDTH}px`;
		line.style.backgroundColor = rail.color;
		panel.appendChild(line);

		const topTick = createRailElement('div', TICK_CLASS, rail);
		topTick.style.top = `${rail.top}px`;
		topTick.style.left = `${colCenter}px`;
		topTick.style.width = `${TICK_LENGTH}px`;
		topTick.style.height = `${LINE_WIDTH}px`;
		topTick.style.backgroundColor = rail.color;
		panel.appendChild(topTick);

		const bottomTick = createRailElement('div', TICK_CLASS, rail);
		bottomTick.style.top = `${rail.bottom}px`;
		bottomTick.style.left = `${colCenter}px`;
		bottomTick.style.width = `${TICK_LENGTH}px`;
		bottomTick.style.height = `${LINE_WIDTH}px`;
		bottomTick.style.backgroundColor = rail.color;
		bottomTick.style.transform = `translateY(-${LINE_WIDTH}px)`;
		panel.appendChild(bottomTick);

		const dot = createRailElement('div', DOT_CLASS, rail);
		dot.style.top = `${rail.center}px`;
		dot.style.left = `${colCenter - DOT_SIZE / 2}px`;
		dot.style.width = `${DOT_SIZE}px`;
		dot.style.height = `${DOT_SIZE}px`;
		dot.style.backgroundColor = rail.color;
		dot.style.transform = `translateY(-${DOT_SIZE / 2}px)`;
		panel.appendChild(dot);
	}

	for (const label of resolveLabelCenters(rails)) {
		const labelEl = createRailElement('div', LABEL_CLASS, label.rail);
		labelEl.dataset.coderName = label.rail.ownerName ?? '';
		labelEl.style.top = `${label.actualCenter}px`;
		labelEl.style.right = `${panelWidth + 2}px`;
		labelEl.style.color = label.rail.color;
		labelEl.title = label.rail.ownerName
			? `${label.rail.ownerName} · ${label.rail.codeName}`
			: label.rail.codeName;
		labelEl.textContent = label.rail.ownerAbbreviation
			? `${label.rail.ownerAbbreviation} · ${label.rail.codeName}`
			: label.rail.codeName;
		panel.appendChild(labelEl);
	}

	panel.addEventListener('mouseenter', handlePanelHover(callbacks), true);
	panel.addEventListener('mouseover', handlePanelHover(callbacks), true);
	panel.addEventListener('mouseleave', () => callbacks.onHover(null, null));
	panel.addEventListener('click', (event) => {
		const target = (event.target as HTMLElement).closest?.('[data-marker-id]') as HTMLElement | null;
		if (!target?.classList.contains(LABEL_CLASS)) return;
		const markerId = target.dataset.markerId;
		const codeName = target.dataset.codeName;
		if (!markerId || !codeName) return;
		event.stopPropagation();
		callbacks.onLabelClick(markerId, codeName);
	});

	container.appendChild(panel);
	return panelWidth;
}

export function clearPdfMarginPanel(container: HTMLElement): void {
	for (const panel of container.querySelectorAll(`.${PANEL_CLASS}`)) panel.remove();
}

export function applyHoverToMarginPanel(
	container: HTMLElement,
	markerId: string | null,
): void {
	const elements = container.querySelectorAll<HTMLElement>(
		`.${PANEL_CLASS} [data-marker-id]`,
	);
	for (const element of elements) {
		element.classList.toggle(
			HOVERED_CLASS,
			!!markerId && element.dataset.markerId === markerId,
		);
	}
}

function appendEntries(
	entries: PdfMarginVisualSegment[],
	marker: PdfMarker | PdfShapeMarker,
	pageNumber: number,
	segmentIndex: number,
	segmentCount: number,
	topPct: number,
	bottomPct: number,
	registry: CodeDefinitionRegistry,
	ownerLabelForMarker?: (marker: PdfMarker | PdfShapeMarker) => MarginPanelOwnerLabel,
	isMarkerEditable?: (marker: PdfMarker | PdfShapeMarker) => boolean,
): void {
	const editable = isMarkerEditable?.(marker) !== false;
	const owner = ownerLabelForMarker?.(marker);
	for (const codeApplication of marker.codes) {
		const definition = registry.getById(codeApplication.codeId);
		entries.push({
			key: pdfMarginRailKey(marker.id, codeApplication.codeId),
			markerId: marker.id,
			codeId: codeApplication.codeId,
			codeName: definition?.name ?? codeApplication.codeId,
			color: editable
				? marker.colorOverride ?? definition?.color ?? '#FFEB3B'
				: NON_EDITABLE_MARKER_COLOR,
			ownerAbbreviation: owner?.abbreviation,
			ownerName: owner?.fullName,
			editable,
			pageNumber,
			segmentIndex,
			segmentCount,
			topPct,
			bottomPct,
		});
	}
}

function createRailElement<K extends keyof HTMLElementTagNameMap>(
	tagName: K,
	className: string,
	rail: MarginRailLayout,
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tagName);
	element.className = className;
	element.dataset.markerId = rail.markerId;
	element.dataset.codeId = rail.codeId;
	element.dataset.codeName = rail.codeName;
	return element;
}

function resolveLabelCenters(rails: readonly MarginRailLayout[]): Array<{
	rail: MarginRailLayout;
	actualCenter: number;
}> {
	const labels = rails
		.map((rail) => ({ rail, actualCenter: rail.center }))
		.sort((a, b) => b.rail.lane - a.rail.lane);
	const placedCenters: number[] = [];

	for (const label of labels) {
		const collides = (center: number) => placedCenters.some(
			(placed) => Math.abs(center - placed) < LABEL_HEIGHT,
		);
		for (let step = 1; collides(label.actualCenter) && step <= 50; step++) {
			label.actualCenter = label.rail.center + step * LABEL_HEIGHT;
		}
		placedCenters.push(label.actualCenter);
	}

	return labels;
}

function handlePanelHover(callbacks: MarginPanelCallbacks) {
	return (event: MouseEvent) => {
		const target = (event.target as HTMLElement).closest?.('[data-marker-id]') as HTMLElement | null;
		if (target) {
			callbacks.onHover(
				target.dataset.markerId ?? null,
				target.dataset.codeName ?? null,
			);
		}
	};
}
