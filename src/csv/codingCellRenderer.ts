import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { CsvCodingModel } from './codingModel';
import type { GridApi } from 'ag-grid-community';
import type { CsvCodingView } from './csvCodingView';
import { openCsvCodingPopover } from './codingMenu';

/** Cell renderer for cod-seg and cod-frow columns — tag chips + action button */
export function codingCellRenderer(params: any): HTMLElement {
	const wrapper = document.createElement('div');
	wrapper.className = 'csv-cod-seg-cell';

	const field: string = params.colDef.field;
	const row: number = params.node?.rowIndex ?? params.rowIndex ?? 0;
	const model: CsvCodingModel | undefined = params.model;
	const gridApi: GridApi | undefined = params.gridApi;
	const file: string = params.file ?? '';
	const csvView: CsvCodingView | undefined = params.csvView;
	const app: App | undefined = params.app;
	const isFrow = field.endsWith('_cod-frow');
	const isSeg = field.endsWith('_cod-seg');

	const sourceColumn = isFrow
		? field.replace(/_cod-frow$/, '')
		: isSeg
			? field.replace(/_cod-seg$/, '')
			: field;

	const tagsArea = document.createElement('span');
	tagsArea.className = 'csv-tag-area';

	if (model) {
		const codes = isFrow
			? model.getCodesForCell(file, row, sourceColumn, 'row')
			: model.getCodesForCell(file, row, sourceColumn, 'segment');

		for (const codeName of codes) {
			const def = model.registry.getByName(codeName);
			const color = def?.color ?? '#888';

			const chip = document.createElement('span');
			chip.className = 'csv-tag-chip';
			chip.style.backgroundColor = hexToRgba(color, 0.18);
			chip.style.color = color;
			chip.style.border = `1px solid ${hexToRgba(color, 0.35)}`;
			chip.style.cursor = 'pointer';

			const label = document.createElement('span');
			label.textContent = codeName;
			chip.appendChild(label);

			chip.addEventListener('click', (e) => {
				e.stopPropagation();
				if (!model) return;

				const markers = isFrow
					? model.getRowMarkersForCell(file, row, sourceColumn)
					: model.getSegmentMarkersForCell(file, row, sourceColumn);
				const marker = markers.find(m => m.codes.includes(codeName));
				if (marker) {
					// Dispatch detail event for sidebar
					(csvView as any)?.app?.workspace?.trigger('qualia-csv:detail', {
						markerId: marker.id,
						codeName,
					});
				}

				if (isSeg && csvView) {
					const rowNode = gridApi?.getDisplayedRowAtIndex(row);
					const cellText: string = rowNode?.data?.[sourceColumn] ?? '';
					csvView.openSegmentEditor(file, row, sourceColumn, cellText);
				}
			});

			if (isFrow && model && gridApi) {
				const xBtn = document.createElement('span');
				xBtn.className = 'csv-tag-chip-x';
				xBtn.textContent = '\u00d7';
				xBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					const markers = model.getRowMarkersForCell(file, row, sourceColumn);
					for (const m of markers) {
						if (m.codes.includes(codeName)) {
							model.removeCodeFromMarker(m.id, codeName);
						}
					}
					gridApi.refreshCells({ force: true });
				});
				chip.appendChild(xBtn);
			}

			tagsArea.appendChild(chip);
		}
	}

	wrapper.appendChild(tagsArea);

	if (isFrow) {
		const btn = document.createElement('span');
		btn.className = 'csv-cod-seg-btn';
		setIcon(btn, 'tag');
		const svg = btn.querySelector('svg');
		if (svg) { svg.style.width = '14px'; svg.style.height = '14px'; svg.style.strokeWidth = '3'; svg.style.color = 'var(--text-normal)'; }

		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (model && gridApi && app) {
				openCsvCodingPopover(btn, model, file, row, sourceColumn, gridApi, app);
			}
		});
		wrapper.appendChild(btn);
	}

	return wrapper;
}

/** Renderer for source column when cod-seg is active: text + tag button */
export function sourceTagBtnRenderer(params: any): HTMLElement {
	const wrapper = document.createElement('div');
	wrapper.className = 'csv-cod-seg-cell';

	const text = document.createElement('span');
	text.className = 'csv-cod-seg-text';
	text.style.flex = '1';
	text.textContent = params.value ?? '';

	const btn = document.createElement('span');
	btn.className = 'csv-cod-seg-btn';
	setIcon(btn, 'tag');
	const svg = btn.querySelector('svg');
	if (svg) { svg.style.width = '14px'; svg.style.height = '14px'; svg.style.strokeWidth = '3'; svg.style.color = 'var(--text-normal)'; }

	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		const segField: string = params.codSegField;
		const row = params.node?.rowIndex ?? params.rowIndex ?? 0;
		const file: string = params.file ?? '';
		const csvView: CsvCodingView | undefined = params.csvView;
		const cellText: string = params.value ?? '';

		if (csvView) {
			const sourceColumn = segField.replace(/_cod-seg$/, '');
			csvView.openSegmentEditor(file, row, sourceColumn, cellText);
		}
	});

	wrapper.appendChild(text);
	wrapper.appendChild(btn);
	return wrapper;
}

/** Convert hex color to rgba string */
export function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace('#', '');
	const r = parseInt(h.substring(0, 2), 16);
	const g = parseInt(h.substring(2, 4), 16);
	const b = parseInt(h.substring(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
