
import { Modal, Setting } from 'obsidian';
import type { GridApi, ColDef } from 'ag-grid-community';
import { codingCellRenderer, sourceTagBtnRenderer } from './csvCodingCellRenderer';
import type { CsvCodingModel } from './csvCodingModel';

// Minimal interface to avoid circular import with csvCodingView
export interface CsvViewRef {
	openSegmentEditor(file: string, sourceRowId: number, column: string, cellText: string): void;
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
		const colDefs = this.gridApi.getColumnDefs();
		if (!colDefs) return;
		const isCodSeg = suffix === 'cod-seg';
		const isFrow = suffix === 'cod-frow';
		const isComment = suffix === 'comment';

		if (add) {
			const srcIdx = colDefs.findIndex((c) => (c as ColDef).field === sourceHeader);
			let insertIdx = srcIdx + 1;

			if (isFrow || isComment) {
				while (insertIdx < colDefs.length) {
					const f: string = (colDefs[insertIdx] as ColDef).field ?? '';
					if (f.startsWith(sourceHeader + '_cod-')) { insertIdx++; } else { break; }
				}
			}
			if (isComment) {
				while (insertIdx < colDefs.length) {
					const f: string = (colDefs[insertIdx] as ColDef).field ?? '';
					if (f === sourceHeader + '_comment') { insertIdx++; } else { break; }
				}
			}

			if (isComment) {
				const newCol: ColDef = {
					field,
					headerName: `${sourceHeader}_comment`,
					editable: true,
					cellEditor: CommentCellEditor,
					cellStyle: COD_FROW_STYLE,
					headerClass: 'csv-coding-header-comment',
					cellClass: 'csv-comment-cell',
					sortable: true,
					filter: true,
					resizable: true,
					autoHeight: true,
					wrapText: true,
				};
				colDefs.splice(insertIdx, 0, newCol);
			} else {
				const newCol: ColDef = {
					field,
					headerName: `${sourceHeader}_${suffix}`,
					editable: false,
					cellStyle: isFrow ? COD_FROW_STYLE : COD_SEG_STYLE,
					headerClass: isFrow ? 'csv-coding-header-frow' : 'csv-coding-header-seg',
					sortable: true,
					filter: true,
					resizable: true,
					cellRenderer: codingCellRenderer,
					cellRendererParams: { model: this.model, gridApi: this.gridApi, file: this.filePath, csvView: this.csvView, app: this.app },
					autoHeight: true,
					wrapText: true,
				};
				colDefs.splice(insertIdx, 0, newCol);
			}

			if (isCodSeg) {
				const srcDef = colDefs[srcIdx] as ColDef;
				if (srcDef) {
					srcDef.cellRenderer = sourceTagBtnRenderer;
					srcDef.cellRendererParams = { codSegField: field, model: this.model, gridApi: this.gridApi, file: this.filePath, csvView: this.csvView, app: this.app };
				}
			}
		} else {
			const idx = colDefs.findIndex((c) => (c as ColDef).field === field);
			if (idx >= 0) colDefs.splice(idx, 1);

			if (isCodSeg) {
				const srcDef = colDefs.find((c) => (c as ColDef).field === sourceHeader) as ColDef | undefined;
				if (srcDef) {
					delete srcDef.cellRenderer;
					delete srcDef.cellRendererParams;
				}
			}
		}

		this.gridApi.setGridOption('columnDefs', colDefs);
	}

	onClose() {
		this.contentEl.empty();
	}
}
