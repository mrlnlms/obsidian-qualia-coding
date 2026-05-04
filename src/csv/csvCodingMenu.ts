/**
 * CSV coding popovers — thin wrappers around the shared openCodingPopover().
 *
 * Two entry points:
 *   1. openCsvCodingPopover  — single cell (row + column)
 *   2. openBatchCodingPopover — all visible/filtered rows in a column
 */

import { type App } from 'obsidian';
import type { CsvCodingModel } from './csvCodingModel';
import type { GridApi } from 'ag-grid-community';
import { findCodeApplication, setMagnitude } from '../core/codeApplicationHelpers';
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
	sourceRowId: number,
	column: string,
	gridApi: GridApi,
	app: App,
	anchorRect?: DOMRect,
): void {
	const savedRect = anchorRect ?? anchorEl.getBoundingClientRect();
	const pos = { x: savedRect.left, y: savedRect.bottom + 4 };

	const getMarker = () => model.findOrCreateRowMarker(file, sourceRowId, column);
	const existingMarker = model.getRowMarkersForCell(file, sourceRowId, column)[0];
	const isHoverMode = !!existingMarker;

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => {
			const current = model.getRowMarkersForCell(file, sourceRowId, column)[0];
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
			const current = model.getRowMarkersForCell(file, sourceRowId, column)[0];
			if (!current) return undefined;
			return findCodeApplication(current.codes, codeId)?.magnitude;
		},
		setMagnitudeForCode: (codeId, value) => {
			const current = model.getRowMarkersForCell(file, sourceRowId, column)[0];
			if (!current) return;
			current.codes = setMagnitude(current.codes, codeId, value);
			current.updatedAt = Date.now();
			model.saveMarkers();
			gridApi.refreshCells({ force: true });
		},
		getRelationsForCode: (codeId) => {
			const current = model.getRowMarkersForCell(file, sourceRowId, column)[0];
			return findCodeApplication(current?.codes ?? [], codeId)?.relations ?? [];
		},
		setRelationsForCode: (codeId, relations) => {
			const current = model.getRowMarkersForCell(file, sourceRowId, column)[0];
			if (!current) return;
			const ca = findCodeApplication(current.codes, codeId);
			if (ca) {
				ca.relations = relations.length > 0 ? relations : undefined;
				current.updatedAt = Date.now();
				model.saveMarkers();
				gridApi.refreshCells({ force: true });
			}
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
		showRelationsSection: model.dm.section('general').showRelationsInPopover,
		className: 'codemarker-popover',
		onClose: () => {
			gridApi.refreshCells({ force: true });
		},
		onRebuild: () => {
			openCsvCodingPopover(anchorEl, model, file, sourceRowId, column, gridApi, app, savedRect);
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
 * Applies/removes codes to ALL filtered rows in the column.
 *
 * The set of filtered rows is collected via `getFilteredSourceRowIds` — caller
 * decides the strategy (`forEachNodeAfterFilterAndSort` in eager mode, SQL
 * `WHERE` in lazy mode). The popover itself is mode-agnostic.
 */
export async function openBatchCodingPopover(
	anchorEl: HTMLElement,
	model: CsvCodingModel,
	file: string,
	column: string,
	gridApi: GridApi,
	app: App,
	getFilteredSourceRowIds: () => Promise<number[]>,
	anchorRect?: DOMRect,
): Promise<void> {
	const savedRect = anchorRect ?? anchorEl.getBoundingClientRect();
	const pos = { x: savedRect.left, y: savedRect.bottom + 4 };

	const filteredSourceRowIds = await getFilteredSourceRowIds();

	// "Active" = codes present in EVERY filtered row. Computed via set intersection
	// (single pass over rowMarkers, early-exit). Skipped on huge datasets — the hint
	// is only useful when applying to a focused subset; on 600k+ rows the intersection
	// is almost always empty anyway.
	const FULLY_ACTIVE_LIMIT = 5000;
	let fullyActiveIds = new Set<string>();
	if (filteredSourceRowIds.length > 0 && filteredSourceRowIds.length <= FULLY_ACTIVE_LIMIT) {
		fullyActiveIds = model.getCodeIntersectionForRows(file, filteredSourceRowIds, column);
	}
	const idToName = new Map(model.registry.getAll().map(c => [c.id, c.name]));
	const fullyActiveCodes: string[] = [];
	for (const id of fullyActiveIds) {
		const name = idToName.get(id);
		if (name) fullyActiveCodes.push(name);
	}

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => [...fullyActiveCodes],
		addCode: (name) => {
			let def = model.registry.getByName(name);
			if (!def) def = model.registry.create(name);
			model.addCodeToManyRows(file, filteredSourceRowIds, column, def.id);
			gridApi.refreshCells({ force: true });
		},
		removeCode: (name) => {
			const def = model.registry.getByName(name);
			if (!def) return;
			model.removeCodeFromManyRows(file, filteredSourceRowIds, column, def.id);
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
		badge: `Apply to ${filteredSourceRowIds.length.toLocaleString()} visible row${filteredSourceRowIds.length !== 1 ? 's' : ''}`,
		className: 'codemarker-popover',
		onRebuild: () => {
			void openBatchCodingPopover(anchorEl, model, file, column, gridApi, app, getFilteredSourceRowIds, savedRect);
		},
		deleteAction: {
			label: 'Remove All Codes',
			icon: 'trash',
			onDelete: () => {
				model.removeAllRowMarkersFromMany(file, filteredSourceRowIds, column);
				gridApi.refreshCells({ force: true });
			},
		},
	};

	openCodingPopover(adapter, options);
}
