
import { setIcon } from 'obsidian';
import type { GridApi, ColDef } from 'ag-grid-community';
import { openBatchCodingPopover } from './csvCodingMenu';
import type { CsvCodingModel } from './csvCodingModel';

export interface HeaderInjectionContext {
	gridApi: GridApi | null;
	csvModel: CsvCodingModel;
	filePath: string | undefined;
	app: import('obsidian').App;
}

export function injectHeaderButtons(wrapper: HTMLElement, ctx: HeaderInjectionContext): void {
	const headerCells = wrapper.querySelectorAll<HTMLElement>('.ag-header-cell');
	for (const cell of Array.from(headerCells)) {
		const colId = cell.getAttribute('col-id');
		if (!colId) continue;
		const isCodSeg = colId.endsWith('_cod-seg');
		const isCodFrow = colId.endsWith('_cod-frow');
		const isComment = colId.endsWith('_comment');
		if (!isCodSeg && !isCodFrow && !isComment) continue;

		const labelContainer = cell.querySelector('.ag-cell-label-container');
		if (!labelContainer) continue;
		const labelDiv = labelContainer.querySelector('.ag-header-cell-label');

		if (!cell.querySelector('.csv-header-btn')) {
			if (isCodSeg || isCodFrow) {
				const btn = createHeaderIcon(isCodSeg ? 'info' : 'tag', isCodSeg ? '2.5' : '3');
				btn.className = 'csv-header-btn ag-header-icon ' + btn.className;

				if (isCodSeg) {
					let tooltip: HTMLElement | null = null;
					btn.addEventListener('mouseenter', () => {
						tooltip = document.createElement('div');
						tooltip.className = 'csv-header-tooltip';
						tooltip.textContent = 'This column shows codes applied to text segments. Use the coding panel to add segment codes.';
						document.body.appendChild(tooltip);
						const rect = btn.getBoundingClientRect();
						tooltip.style.left = `${rect.left + rect.width / 2}px`;
						tooltip.style.top = `${rect.bottom + 6}px`;
					});
					btn.addEventListener('mouseleave', () => {
						if (tooltip) { tooltip.remove(); tooltip = null; }
					});
					btn.addEventListener('click', (e) => e.stopPropagation());
				} else {
					btn.addEventListener('click', (e) => {
						e.stopPropagation();
						const sourceColumn = colId.replace(/_cod-frow$/, '');
						if (ctx.gridApi && ctx.filePath) {
							openBatchCodingPopover(btn, ctx.csvModel, ctx.filePath, sourceColumn, ctx.gridApi, ctx.app);
						}
					});
				}

				labelContainer.insertBefore(btn, labelDiv);
			}
		}

		if (isComment && !cell.querySelector('.csv-header-wrap-btn')) {
			const wrapBtn = createHeaderIcon('wrap-text', '2.5');
			wrapBtn.className = 'csv-header-wrap-btn ag-header-icon ' + wrapBtn.className;

			const col = ctx.gridApi?.getColumn(colId);
			const colDef = col ? col.getColDef() : null;
			const isWrapped = colDef?.wrapText ?? true;
			wrapBtn.dataset.wrapped = String(isWrapped);
			wrapBtn.style.opacity = isWrapped ? '0.8' : '0.3';

			wrapBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (!ctx.gridApi) return;
				const colDefs = ctx.gridApi.getColumnDefs();
				if (!colDefs) return;
				const def = colDefs.find((c) => (c as ColDef).field === colId) as ColDef | undefined;
				if (!def) return;
				const nowWrapped = def.wrapText ?? true;
				const nextWrapped = !nowWrapped;
				(def as ColDef).wrapText = nextWrapped;
				(def as ColDef).autoHeight = nextWrapped;
				(def as ColDef).cellClass = nextWrapped ? 'csv-comment-cell' : 'csv-comment-cell-nowrap';
				wrapBtn.dataset.wrapped = String(nextWrapped);
				ctx.gridApi.setGridOption('columnDefs', colDefs);
			});

			labelContainer.insertBefore(wrapBtn, labelDiv);
		}
	}
}

function createHeaderIcon(icon: string, strokeWidth: string): HTMLElement {
	const btn = document.createElement('span');
	btn.style.cursor = 'pointer';
	btn.style.display = 'inline-flex';
	btn.style.alignItems = 'center';
	btn.style.opacity = '0.5';
	btn.style.marginRight = '4px';
	btn.style.padding = '6px';
	btn.style.borderRadius = '4px';
	btn.style.transition = 'background-color 0.2s, opacity 0.2s';
	btn.style.position = 'relative';
	setIcon(btn, icon);
	const svg = btn.querySelector('svg');
	if (svg) { svg.style.width = '14px'; svg.style.height = '14px'; svg.style.strokeWidth = strokeWidth; svg.style.color = 'var(--text-normal)'; }
	btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.backgroundColor = 'var(--ag-row-hover-color, rgba(0,0,0,0.08))'; });
	btn.addEventListener('mouseleave', () => {
		const colWrapped = btn.dataset.wrapped;
		btn.style.opacity = colWrapped === 'false' ? '0.3' : '0.5';
		btn.style.backgroundColor = 'transparent';
	});
	return btn;
}
