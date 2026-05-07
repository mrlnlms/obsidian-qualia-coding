
import { Modal, Setting } from 'obsidian';
import type { GridApi, ColDef } from 'ag-grid-community';
import { codingCellRenderer, sourceTagBtnRenderer } from './csvCodingCellRenderer';
import type { CsvCodingModel } from './csvCodingModel';

// Minimal interface to avoid circular import with csvCodingView
export interface CsvViewRef {
	openSegmentEditor(file: string, sourceRowId: number, column: string, cellText: string): void;
	/** True when the underlying grid uses Infinite Row Model — `autoHeight` is unsupported. */
	isLazyMode?(): boolean;
}

// ── Column styles (shared with csvCodingView) ──
export const COD_SEG_STYLE = {
	backgroundColor: 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)',
	fontStyle: 'italic',
	fontSize: 'calc(var(--ag-font-size, 14px) + 1px)',
};
export const COD_FROW_STYLE = {
	backgroundColor: 'color-mix(in srgb, var(--text-muted) 3%, transparent)',
};

// ── Multiline cell editor for comment columns ──
export class CommentCellEditor {
	private textarea!: HTMLTextAreaElement;

	init(params: any) {
		this.textarea = document.createElement('textarea');
		this.textarea.className = 'csv-comment-editor';
		this.textarea.value = params.value ?? '';
		this.textarea.addEventListener('keydown', (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.stopPropagation();
				const start = this.textarea.selectionStart;
				const end = this.textarea.selectionEnd;
				const val = this.textarea.value;
				this.textarea.value = val.substring(0, start) + '\n' + val.substring(end);
				this.textarea.selectionStart = this.textarea.selectionEnd = start + 1;
			}
		});
	}

	getGui() { return this.textarea; }
	afterGuiAttached() { this.textarea.focus(); }
	getValue() { return this.textarea.value; }
	isPopup() { return false; }
}

// ── Column Toggle Modal ──
export class ColumnToggleModal extends Modal {
	private gridApi: GridApi;
	private originalHeaders: string[];
	private model: CsvCodingModel;
	private filePath: string;
	private csvView: CsvViewRef;

	constructor(app: import('obsidian').App, gridApi: GridApi, originalHeaders: string[], model: CsvCodingModel, filePath: string, csvView: CsvViewRef) {
		super(app);
		this.gridApi = gridApi;
		this.originalHeaders = originalHeaders;
		this.model = model;
		this.filePath = filePath;
		this.csvView = csvView;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('csv-col-modal');
		this.setTitle('Column settings');

		const headerRow = contentEl.createEl('div', { cls: 'csv-col-row csv-col-header' });
		headerRow.createEl('span', { cls: 'csv-col-name', text: 'Column' });
		headerRow.createEl('span', { cls: 'csv-col-toggle-label', text: 'Visible' });
		headerRow.createEl('span', { cls: 'csv-col-toggle-label', text: 'Cod. Segments' });
		headerRow.createEl('span', { cls: 'csv-col-toggle-label', text: 'Cod. Full Row' });
		headerRow.createEl('span', { cls: 'csv-col-toggle-label', text: 'Comment' });

		const existingCols = new Set(
			(this.gridApi.getColumns() ?? []).map(c => c.getColId())
		);

		for (const header of this.originalHeaders) {
			const segField = `${header}_cod-seg`;
			const frowField = `${header}_cod-frow`;
			const commentField = `${header}_comment`;

			const row = contentEl.createEl('div', { cls: 'csv-col-row' });
			row.createEl('span', { cls: 'csv-col-name', text: header });

			const visCell = row.createEl('span', { cls: 'csv-col-toggle-cell' });
			const col = this.gridApi.getColumn(header);
			new Setting(visCell).addToggle((t) =>
				t.setValue(col ? col.isVisible() : false).onChange((v) => {
					this.gridApi.setColumnsVisible([header], v);
				})
			);

			let commentToggle: any;

			const hasCoding = () => {
				const cols = new Set((this.gridApi.getColumns() ?? []).map(c => c.getColId()));
				return cols.has(segField) || cols.has(frowField);
			};

			const updateCommentState = () => {
				const enabled = hasCoding();
				commentToggle?.setDisabled(!enabled);
				if (!enabled && commentToggle?.getValue()) {
					commentToggle.setValue(false);
					this.toggleCodingColumn(commentField, header, 'comment', false);
				}
			};

			const segCell = row.createEl('span', { cls: 'csv-col-toggle-cell' });
			new Setting(segCell).addToggle((t) =>
				t.setValue(existingCols.has(segField)).onChange((v) => {
					this.toggleCodingColumn(segField, header, 'cod-seg', v);
					updateCommentState();
				})
			);

			const frowCell = row.createEl('span', { cls: 'csv-col-toggle-cell' });
			new Setting(frowCell).addToggle((t) =>
				t.setValue(existingCols.has(frowField)).onChange((v) => {
					this.toggleCodingColumn(frowField, header, 'cod-frow', v);
					updateCommentState();
				})
			);

			const commentCell = row.createEl('span', { cls: 'csv-col-toggle-cell' });
			const hasAnyCoding = existingCols.has(segField) || existingCols.has(frowField);
			new Setting(commentCell).addToggle((t) => {
				commentToggle = t;
				t.setValue(existingCols.has(commentField))
					.setDisabled(!hasAnyCoding)
					.onChange((v) => {
						this.toggleCodingColumn(commentField, header, 'comment', v);
					});
			});
		}
	}

	private toggleCodingColumn(field: string, sourceHeader: string, suffix: string, add: boolean) {
		applyVirtualColumnToggle({
			gridApi: this.gridApi,
			model: this.model,
			filePath: this.filePath,
			csvView: this.csvView,
			app: this.app,
			field, sourceHeader,
			suffix: suffix as 'cod-seg' | 'cod-frow' | 'comment',
			add,
			persist: true,
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ── Standalone toggle entry point ──
//
// Extracted from `ColumnToggleModal.toggleCodingColumn` so `csvCodingView` pode
// chamar no file-open pra restaurar virtual cols persistidas em data.json sem
// instanciar a Modal (que abre UI). `persist: false` no restore — senão o
// próprio restore re-grava as mesmas entries, criando ruído de save.

export interface ApplyVirtualColumnToggleParams {
	gridApi: GridApi;
	model: CsvCodingModel;
	filePath: string;
	csvView: CsvViewRef;
	app: import('obsidian').App;
	field: string;
	sourceHeader: string;
	suffix: 'cod-seg' | 'cod-frow' | 'comment';
	add: boolean;
	/** Default true. Restore path passa false pra não re-gravar entries que já vieram do persist. */
	persist?: boolean;
}

export function applyVirtualColumnToggle(p: ApplyVirtualColumnToggleParams): void {
	const colDefs = p.gridApi.getColumnDefs();
	if (!colDefs) return;
	const isCodSeg = p.suffix === 'cod-seg';
	const isFrow = p.suffix === 'cod-frow';
	const isComment = p.suffix === 'comment';

	if (p.add) {
		const srcIdx = colDefs.findIndex((c) => (c as ColDef).field === p.sourceHeader);
		if (srcIdx === -1) return;  // source col não existe (parquet schema mudou) — skip silent

		let insertIdx = srcIdx + 1;
		if (isFrow || isComment) {
			while (insertIdx < colDefs.length) {
				const f: string = (colDefs[insertIdx] as ColDef).field ?? '';
				if (f.startsWith(p.sourceHeader + '_cod-')) { insertIdx++; } else { break; }
			}
		}
		if (isComment) {
			while (insertIdx < colDefs.length) {
				const f: string = (colDefs[insertIdx] as ColDef).field ?? '';
				if (f === p.sourceHeader + '_comment') { insertIdx++; } else { break; }
			}
		}

		// AG Grid forbids autoHeight + wrapText with Infinite Row Model (lazy mode).
		// And lazy mode can't sort virtual columns (cod-seg/cod-frow/comment) because
		// DuckDB has no data for them — would emit "column not found" Binder Error.
		const lazy = p.csvView.isLazyMode?.() ?? false;
		const wrap = !lazy;
		const sortable = !lazy;

		if (isComment) {
			// valueGetter lê do CsvCodingModel (RowMarker.comment), não do row data
			// (parquet/CSV não têm a coluna). valueSetter persiste via setCellComment
			// — também emite onMarkerMutation pro sync com Smart Codes / temp table futura.
			const newCol: ColDef = {
				field: p.field,
				headerName: `${p.sourceHeader}_comment`,
				editable: true,
				cellEditor: CommentCellEditor,
				cellStyle: COD_FROW_STYLE,
				headerClass: 'csv-coding-header-comment',
				cellClass: wrap ? 'csv-comment-cell' : 'csv-comment-cell-nowrap',
				sortable,
				filter: true,
				resizable: true,
				autoHeight: wrap,
				wrapText: wrap,
				valueGetter: (params) => {
					const sourceRowId = toNumberSafe(params.data?.__source_row)
						?? params.node?.sourceRowIndex
						?? params.node?.rowIndex
						?? 0;
					return p.model.getCellComment(p.filePath, sourceRowId, p.sourceHeader);
				},
				valueSetter: (params) => {
					const sourceRowId = toNumberSafe(params.data?.__source_row)
						?? params.node?.sourceRowIndex
						?? params.node?.rowIndex
						?? 0;
					const value = String(params.newValue ?? '');
					p.model.setCellComment(p.filePath, sourceRowId, p.sourceHeader, value);
					return true;  // AG Grid refresca a célula
				},
			};
			colDefs.splice(insertIdx, 0, newCol);
		} else {
			const newCol: ColDef = {
				field: p.field,
				headerName: `${p.sourceHeader}_${p.suffix}`,
				editable: false,
				cellStyle: isFrow ? COD_FROW_STYLE : COD_SEG_STYLE,
				headerClass: isFrow ? 'csv-coding-header-frow' : 'csv-coding-header-seg',
				sortable,
				filter: true,
				resizable: true,
				cellRenderer: codingCellRenderer,
				cellRendererParams: { model: p.model, gridApi: p.gridApi, file: p.filePath, csvView: p.csvView, app: p.app },
				autoHeight: wrap,
				wrapText: wrap,
			};
			colDefs.splice(insertIdx, 0, newCol);
		}

		if (isCodSeg) {
			const srcDef = colDefs[srcIdx] as ColDef;
			if (srcDef) {
				srcDef.cellRenderer = sourceTagBtnRenderer;
				srcDef.cellRendererParams = { codSegField: p.field, model: p.model, gridApi: p.gridApi, file: p.filePath, csvView: p.csvView, app: p.app };
			}
		}
	} else {
		const idx = colDefs.findIndex((c) => (c as ColDef).field === p.field);
		if (idx >= 0) colDefs.splice(idx, 1);

		if (isCodSeg) {
			const srcDef = colDefs.find((c) => (c as ColDef).field === p.sourceHeader) as ColDef | undefined;
			if (srcDef) {
				delete srcDef.cellRenderer;
				delete srcDef.cellRendererParams;
			}
		}
	}

	p.gridApi.setGridOption('columnDefs', colDefs);

	if (p.persist !== false) {
		if (p.add) p.model.addEnabledVirtualColumn(p.filePath, p.field);
		else p.model.removeEnabledVirtualColumn(p.filePath, p.field);
	}
}

// ── Restore: re-aplica virtual cols persistidas em data.json ──
//
// Chamado pelo `csvCodingView` após criação do gridApi (eager + lazy). GC lazy:
// entries cuja source col não existe nos headers atuais são removidas e a lista
// limpa é re-persistida. Restore não dispara persist (passamos persist=false).

export function restoreEnabledVirtualColumns(params: {
	gridApi: GridApi;
	model: CsvCodingModel;
	filePath: string;
	csvView: CsvViewRef;
	app: import('obsidian').App;
	originalHeaders: string[];
}): void {
	const persisted = params.model.getEnabledVirtualColumns(params.filePath);
	if (persisted.length === 0) return;

	const headerSet = new Set(params.originalHeaders);
	const validEntries: string[] = [];

	for (const field of persisted) {
		const m = field.match(/^(.+)_(cod-frow|cod-seg|comment)$/);
		if (!m) continue;
		const sourceHeader = m[1]!;
		const suffix = m[2] as 'cod-frow' | 'cod-seg' | 'comment';
		if (!headerSet.has(sourceHeader)) continue;  // GC: source col sumiu do parquet

		applyVirtualColumnToggle({
			gridApi: params.gridApi,
			model: params.model,
			filePath: params.filePath,
			csvView: params.csvView,
			app: params.app,
			field, sourceHeader, suffix, add: true,
			persist: false,
		});
		validEntries.push(field);
	}

	// GC: persiste lista limpa se houver drift
	if (validEntries.length !== persisted.length) {
		params.model.setEnabledVirtualColumns(params.filePath, validEntries);
	}
}

function toNumberSafe(v: unknown): number | null {
	if (v == null) return null;
	if (typeof v === 'number') return v;
	if (typeof v === 'bigint') return Number(v);
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}
