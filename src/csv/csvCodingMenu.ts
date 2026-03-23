/**
 * CSV coding popovers — thin wrappers around the shared openCodingPopover().
 *
 * Two entry points:
 *   1. openCsvCodingPopover  — single cell (row + column)
 *   2. openBatchCodingPopover — all visible/filtered rows in a column
 */

import type { App } from 'obsidian';
import type { CsvCodingModel } from './csvCodingModel';
import type { GridApi } from 'ag-grid-community';
import { hasCode, findCodeApplication, setMagnitude } from '../core/codeApplicationHelpers';
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
		getActiveCodes: () => {
			const current = model.getRowMarkersForCell(file, row, column)[0];
			if (!current) return [];
			return current.codes
				.map(c => model.registry.getById(c.codeId)?.name)
				.filter((n): n is string => !!n);
		},
		addCode: (name) => {
			let def = model.registry.getByName(name);
			if (!def) def = model.registry.create(name);
			const m = getMarker();
			model.addCodeToMarker(m.id, def.id);
			gridApi.refreshCells({ force: true });
		},
		removeCode: (name) => {
			const def = model.registry.getByName(name);
			if (!def) return;
			const m = getMarker();
			model.removeCodeFromMarker(m.id, def.id, true);
			gridApi.refreshCells({ force: true });
		},
		getMemo: () => '',
		setMemo: () => {},
		getMagnitudeForCode: (codeId) => {
			const current = model.getRowMarkersForCell(file, row, column)[0];
			if (!current) return undefined;
			return findCodeApplication(current.codes, codeId)?.magnitude;
		},
		setMagnitudeForCode: (codeId, value) => {
			const current = model.getRowMarkersForCell(file, row, column)[0];
			if (!current) return;
			current.codes = setMagnitude(current.codes, codeId, value);
			current.updatedAt = Date.now();
			model.saveMarkers();
			gridApi.refreshCells({ force: true });
		},
		save: () => model.saveMarkers(),
		onRefresh: () => {
			gridApi.refreshCells({ force: true });
		},
	};

	const options: CodingPopoverOptions = {
		pos,
		app,
		isHoverMode,
		showMagnitudeSection: model.dm.section('general').showMagnitudeInPopover,
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
					for (const ca of [...existingMarker.codes]) {
						model.removeCodeFromMarker(existingMarker.id, ca.codeId);
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

	// Collect stable (data) row indices — sourceRowIndex is unaffected by sort/filter
	const filteredRows: number[] = [];
	gridApi.forEachNodeAfterFilterAndSort(node => {
		filteredRows.push(node.sourceRowIndex);
	});

	// "Active" = codes present in ALL visible rows
	const allCodes = model.registry.getAll();
	const fullyActiveCodes: string[] = [];
	for (const codeDef of allCodes) {
		let count = 0;
		for (const row of filteredRows) {
			if (model.getRowMarkersForCell(file, row, column).some(m => hasCode(m.codes, codeDef.id))) {
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
			let def = model.registry.getByName(name);
			if (!def) def = model.registry.create(name);
			for (const row of filteredRows) {
				const m = model.findOrCreateRowMarker(file, row, column);
				model.addCodeToMarker(m.id, def.id);
			}
			gridApi.refreshCells({ force: true });
		},
		removeCode: (name) => {
			const def = model.registry.getByName(name);
			if (!def) return;
			for (const row of filteredRows) {
				const m = model.findOrCreateRowMarker(file, row, column);
				model.removeCodeFromMarker(m.id, def.id, true);
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
						for (const ca of [...m.codes]) {
							model.removeCodeFromMarker(m.id, ca.codeId);
						}
					}
				}
				gridApi.refreshCells({ force: true });
			},
		},
	};

	openCodingPopover(adapter, options);
}
