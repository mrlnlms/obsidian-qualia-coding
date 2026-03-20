/**
 * PDF coding popover — thin wrappers around the shared openCodingPopover().
 *
 * Two entry points:
 *   - openPdfCodingPopover() — text selections (hover + selection mode)
 *   - openShapeCodingPopover() — drawn shapes (always hover mode)
 *
 * PDF-specific logic: cross-page marker resolution, find-or-create,
 * hover grace from highlightRenderer, note field mapping.
 */

import type { App } from 'obsidian';
import type { PdfCodingModel } from './pdfCodingModel';
import type { PdfSelectionResult } from './selectionCapture';
import type { PdfMarker } from './pdfCodingTypes';
import { cancelHoverCloseTimer, startHoverCloseTimer } from './highlightRenderer';
import { openCodingPopover, type CodingPopoverAdapter, type CodingPopoverOptions } from '../core/codingPopover';

/**
 * Opens a coding popover for PDF text selections.
 * Supports single or multiple selection results (cross-page).
 *
 * @param hoverMarkerId — if provided, opens in hover mode (existing marker).
 *   undefined = selection mode (new marker).
 */
export function openPdfCodingPopover(
	mouseEvent: MouseEvent | null,
	model: PdfCodingModel,
	selectionResults: PdfSelectionResult | PdfSelectionResult[],
	onHighlightRefresh: () => void,
	savedPos?: { x: number; y: number },
	app?: App,
	hoverMarkerId?: string,
	onCloseCleanup?: () => void,
): void {
	const results = Array.isArray(selectionResults) ? selectionResults : [selectionResults];
	const pos = savedPos ?? (mouseEvent ? { x: mouseEvent.clientX, y: mouseEvent.clientY } : { x: 0, y: 0 });

	// Lazy marker resolution (created on first code add)
	const getMarkers = (): PdfMarker[] =>
		results.map(r =>
			model.findOrCreateMarker(r.file, r.page, r.beginIndex, r.beginOffset, r.endIndex, r.endOffset, r.text),
		);

	// Determine hover vs selection mode
	const firstResult = results[0]!;
	const existingMarker = hoverMarkerId
		? model.findMarkerById(hoverMarkerId)
		: model.findExistingMarker(
			firstResult.file, firstResult.page,
			firstResult.beginIndex, firstResult.beginOffset,
			firstResult.endIndex, firstResult.endOffset,
		);
	const isHoverMode = !!hoverMarkerId && !!existingMarker;

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => {
			const current = hoverMarkerId
				? model.findMarkerById(hoverMarkerId)
				: model.findExistingMarker(
					firstResult.file, firstResult.page,
					firstResult.beginIndex, firstResult.beginOffset,
					firstResult.endIndex, firstResult.endOffset,
				);
			return current ? [...current.codes] : [];
		},
		addCode: (name) => {
			for (const m of getMarkers()) model.addCodeToMarker(m.id, name);
		},
		removeCode: (name) => {
			for (const m of getMarkers()) model.removeCodeFromMarker(m.id, name, true);
		},
		getMemo: () => {
			const m = hoverMarkerId
				? model.findMarkerById(hoverMarkerId)
				: model.findExistingMarker(
					firstResult.file, firstResult.page,
					firstResult.beginIndex, firstResult.beginOffset,
					firstResult.endIndex, firstResult.endOffset,
				);
			return m?.memo ?? '';
		},
		setMemo: (value) => {
			// Re-query marker — it may have been lazily created after addCode
			const markers = getMarkers();
			for (const m of markers) {
				m.memo = value || undefined;
				m.updatedAt = Date.now();
			}
			model.save();
		},
		save: () => model.save(),
		onRefresh: onHighlightRefresh,
		onNavClick: (codeName, isActive) => {
			if (isActive && existingMarker) {
				document.dispatchEvent(new CustomEvent('codemarker:label-click', {
					detail: { markerId: existingMarker.id, codeName },
				}));
			} else {
				document.dispatchEvent(new CustomEvent('codemarker:code-click', {
					detail: { codeName },
				}));
			}
		},
	};

	const options: CodingPopoverOptions = {
		pos,
		app,
		isHoverMode,
		badge: results.length > 1 ? `Selection spans ${results.length} pages` : undefined,
		className: 'codemarker-popover',
		hoverGrace: {
			cancel: cancelHoverCloseTimer,
			start: startHoverCloseTimer,
		},
		onClose: onCloseCleanup,
		onRebuild: () => {
			openPdfCodingPopover(mouseEvent, model, results, onHighlightRefresh, pos, app, hoverMarkerId);
		},
		deleteAction: isHoverMode ? {
			label: 'Delete Marker',
			icon: 'trash',
			onDelete: () => {
				for (const r of results) {
					const existing = model.findExistingMarker(r.file, r.page, r.beginIndex, r.beginOffset, r.endIndex, r.endOffset);
					if (existing) model.removeAllCodesFromMarker(existing.id);
				}
				onHighlightRefresh();
			},
		} : undefined,
	};

	openCodingPopover(adapter, options);
}

/**
 * Opens a coding popover for a drawn shape (rect/ellipse/polygon).
 * Shapes are always "hover mode" — the shape already exists.
 */
export function openShapeCodingPopover(
	pos: { x: number; y: number },
	model: PdfCodingModel,
	shapeId: string,
	onRefresh: () => void,
	app?: App,
): void {
	const shape = model.findShapeById(shapeId);
	if (!shape) return;

	const shapeNames: Record<string, string> = { rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon' };

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => [...shape.codes],
		addCode: (name) => model.addCodeToShape(shapeId, name),
		removeCode: (name) => model.removeCodeFromShape(shapeId, name, true),
		getMemo: () => shape.memo ?? '',
		setMemo: (value) => {
			shape.memo = value || undefined;
			shape.updatedAt = Date.now();
			model.save();
		},
		save: () => model.save(),
		onRefresh,
		onNavClick: (codeName, isActive) => {
			if (isActive) {
				document.dispatchEvent(new CustomEvent('codemarker:label-click', {
					detail: { markerId: shapeId, codeName },
				}));
			} else {
				document.dispatchEvent(new CustomEvent('codemarker:code-click', {
					detail: { codeName },
				}));
			}
		},
	};

	const options: CodingPopoverOptions = {
		pos,
		app,
		isHoverMode: true,
		badge: shapeNames[shape.shape] || shape.shape,
		className: 'codemarker-popover',
		hoverGrace: {
			cancel: cancelHoverCloseTimer,
			start: startHoverCloseTimer,
		},
		onRebuild: () => openShapeCodingPopover(pos, model, shapeId, onRefresh, app),
		deleteAction: {
			label: 'Delete Shape',
			icon: 'trash',
			onDelete: () => {
				model.removeAllCodesFromShape(shapeId);
				onRefresh();
			},
		},
	};

	openCodingPopover(adapter, options);
}
