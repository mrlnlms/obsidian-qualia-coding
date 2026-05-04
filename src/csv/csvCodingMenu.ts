/**
 * CSV coding popovers — thin wrappers around the shared openCodingPopover().
 *
 * Two entry points:
 *   1. openCsvCodingPopover  — single cell (row + column)
 *   2. openBatchCodingPopover — all visible/filtered rows in a column
 */

import { Notice, type App } from 'obsidian';
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
	isLazy?: boolean,
): void {
	// Batch coding in lazy mode (AG Grid Infinite Row Model) requires a SQL
	// predicate path — `forEachNodeAfterFilterAndSort` only sees rows in the
	// current page cache, not the full dataset. Phase 5 brings a predicate-builder
	// modal; until then we block batch in lazy with a clear notice. Caller passes
	// `isLazy` explicitly so we don't need to introspect AG Grid internals.
	if (isLazy) {
		new Notice('Batch coding em modo lazy ainda não implementado — use o botão de tag em cada célula. Predicate-based batch chega na próxima fase.', 8000);
		return;
	}

	const savedRect = anchorRect ?? anchorEl.getBoundingClientRect();
	const pos = { x: savedRect.left, y: savedRect.bottom + 4 };

	// Collect stable source row IDs — node.sourceRowIndex is the original data position,
	// unaffected by sort/filter. Maps directly to our persisted sourceRowId.
	const filteredSourceRowIds: number[] = [];
	gridApi.forEachNodeAfterFilterAndSort(node => {
		filteredSourceRowIds.push(node.sourceRowIndex);
	});

	// "Active" = codes present in ALL visible rows
	const allCodes = model.registry.getAll();
	const fullyActiveCodes: string[] = [];
	for (const codeDef of allCodes) {
		let count = 0;
		for (const sourceRowId of filteredSourceRowIds) {
			if (model.getRowMarkersForCell(file, sourceRowId, column).some(m => hasCode(m.codes, codeDef.id))) {
				count++;
			}
		}
		if (count === filteredSourceRowIds.length && filteredSourceRowIds.length > 0) {
			fullyActiveCodes.push(codeDef.name);
		}
	}

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => [...fullyActiveCodes],
		addCode: (name) => {
			let def = model.registry.getByName(name);
			if (!def) def = model.registry.create(name);
			for (const sourceRowId of filteredSourceRowIds) {
				const m = model.findOrCreateRowMarker(file, sourceRowId, column);
				model.addCodeToMarker(m.id, def.id);
			}
			gridApi.refreshCells({ force: true });
		},
		removeCode: (name) => {
			const def = model.registry.getByName(name);
			if (!def) return;
			for (const sourceRowId of filteredSourceRowIds) {
				const m = model.findOrCreateRowMarker(file, sourceRowId, column);
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
		badge: `Apply to ${filteredSourceRowIds.length} visible row${filteredSourceRowIds.length !== 1 ? 's' : ''}`,
		className: 'codemarker-popover',
		onRebuild: () => {
			openBatchCodingPopover(anchorEl, model, file, column, gridApi, app, savedRect);
		},
		deleteAction: {
			label: 'Remove All Codes',
			icon: 'trash',
			onDelete: () => {
				for (const sourceRowId of filteredSourceRowIds) {
					const markers = model.getRowMarkersForCell(file, sourceRowId, column);
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
