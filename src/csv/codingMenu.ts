/**
 * CSV coding popovers — thin wrappers around the shared openCodingPopover().
 *
 * Two entry points:
 *   1. openCsvCodingPopover  — single cell (row + column)
 *   2. openBatchCodingPopover — all visible/filtered rows in a column
 */

import type { App } from 'obsidian';
import type { CsvCodingModel } from './codingModel';
import type { GridApi } from 'ag-grid-community';
import {
	openCodingPopover,
	type CodingPopoverAdapter,
	type CodingPopoverOptions,
} from '../core/codingPopover';

/**
 * Opens a coding popover for a single CSV cell.
 */
export function openCsvCodingPopover(
	anchorEl: HTMLElement,
	model: CsvCodingModel,
	file: string,
	row: number,
	column: string,
	gridApi: GridApi,
	app: App,
	anchorRect?: DOMRect,
): void {
	const savedRect = anchorRect ?? anchorEl.getBoundingClientRect();
	const pos = { x: savedRect.left, y: savedRect.bottom + 4 };

	const getMarker = () => model.findOrCreateRowMarker(file, row, column);
	const existingMarker = model.getRowMarkersForCell(file, row, column)[0];
	const isHoverMode = !!existingMarker;

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => existingMarker ? [...existingMarker.codes] : [],
		addCode: (name) => {
			const m = getMarker();
			model.addCodeToMarker(m.id, name);
			gridApi.refreshCells({ force: true });
		},
		removeCode: (name) => {
			const m = getMarker();
			model.removeCodeFromMarker(m.id, name, true);
			gridApi.refreshCells({ force: true });
		},
		getMemo: () => '',
		setMemo: () => {},
		save: () => model.saveMarkers(),
		onRefresh: () => {
			gridApi.refreshCells({ force: true });
		},
	};

	const options: CodingPopoverOptions = {
		pos,
		app,
		isHoverMode,
		className: 'codemarker-popover',
		onClose: () => {
			gridApi.refreshCells({ force: true });
		},
		onRebuild: () => {
			openCsvCodingPopover(anchorEl, model, file, row, column, gridApi, app, savedRect);
		},
		deleteAction: isHoverMode ? {
			label: 'Remove All Codes',
			icon: 'trash',
			onDelete: () => {
				if (existingMarker) {
					for (const code of [...existingMarker.codes]) {
						model.removeCodeFromMarker(existingMarker.id, code);
					}
					gridApi.refreshCells({ force: true });
				}
			},
		} : undefined,
	};

	openCodingPopover(adapter, options);
}

/**
 * Opens a batch coding popover for a column header.
 * Applies/removes codes to ALL visible (filtered) rows at once.
 */
export function openBatchCodingPopover(
	anchorEl: HTMLElement,
	model: CsvCodingModel,
	file: string,
	column: string,
	gridApi: GridApi,
	app: App,
	anchorRect?: DOMRect,
): void {
	const savedRect = anchorRect ?? anchorEl.getBoundingClientRect();
	const pos = { x: savedRect.left, y: savedRect.bottom + 4 };

	// Collect visible (filtered) row indices
	const filteredRows: number[] = [];
	gridApi.forEachNodeAfterFilterAndSort(node => {
		if (node.rowIndex != null) filteredRows.push(node.rowIndex);
	});

	// "Active" = codes present in ALL visible rows
	const allCodes = model.registry.getAll();
	const fullyActiveCodes: string[] = [];
	for (const codeDef of allCodes) {
		let count = 0;
		for (const row of filteredRows) {
			if (model.getRowMarkersForCell(file, row, column).some(m => m.codes.includes(codeDef.name))) {
				count++;
			}
		}
		if (count === filteredRows.length && filteredRows.length > 0) {
			fullyActiveCodes.push(codeDef.name);
		}
	}

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => [...fullyActiveCodes],
		addCode: (name) => {
			for (const row of filteredRows) {
				const m = model.findOrCreateRowMarker(file, row, column);
				model.addCodeToMarker(m.id, name);
			}
			gridApi.refreshCells({ force: true });
		},
		removeCode: (name) => {
			for (const row of filteredRows) {
				const m = model.findOrCreateRowMarker(file, row, column);
				model.removeCodeFromMarker(m.id, name, true);
			}
			gridApi.refreshCells({ force: true });
		},
		getMemo: () => '',
		setMemo: () => {},
		save: () => model.saveMarkers(),
		onRefresh: () => {
			gridApi.refreshCells({ force: true });
		},
	};

	const options: CodingPopoverOptions = {
		pos,
		app,
		isHoverMode: false,
		badge: `Apply to ${filteredRows.length} visible row${filteredRows.length !== 1 ? 's' : ''}`,
		className: 'codemarker-popover',
		onRebuild: () => {
			openBatchCodingPopover(anchorEl, model, file, column, gridApi, app, savedRect);
		},
		deleteAction: {
			label: 'Remove All Codes',
			icon: 'trash',
			onDelete: () => {
				for (const row of filteredRows) {
					const markers = model.getRowMarkersForCell(file, row, column);
					for (const m of markers) {
						for (const code of [...m.codes]) {
							model.removeCodeFromMarker(m.id, code);
						}
					}
				}
				gridApi.refreshCells({ force: true });
			},
		},
	};

	openCodingPopover(adapter, options);
}
