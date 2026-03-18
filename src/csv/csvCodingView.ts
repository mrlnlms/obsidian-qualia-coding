import { FileView, TFile, Vault, WorkspaceLeaf, setIcon } from 'obsidian';
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz, type ColDef } from 'ag-grid-community';
import * as Papa from 'papaparse';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { EditorView, drawSelection, tooltips } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { codingCellRenderer, sourceTagBtnRenderer } from './codingCellRenderer';
import { openBatchCodingPopover } from './codingMenu';
import { createMarkerStateField, updateFileMarkersEffect, setFileIdEffect } from '../markdown/cm6/markerStateField';
import { createMarkerViewPlugin } from '../markdown/cm6/markerViewPlugin';
import { createSelectionMenuField } from '../markdown/cm6/selectionMenuField';
import { createHoverMenuExtension } from '../markdown/cm6/hoverMenuExtension';
import { createMarginPanelExtension } from '../markdown/cm6/marginPanelExtension';
import { registerStandaloneEditor, unregisterStandaloneEditor } from '../markdown/cm6/utils/viewLookupUtils';
import type { Marker } from '../markdown/models/codeMarkerModel';
import { ColumnToggleModal, COD_SEG_STYLE, COD_FROW_STYLE } from './columnToggleModal';
import type { SegmentMarker } from './codingTypes';
import type QualiaCodingPlugin from '../main';
import type { CsvCodingModel } from './codingModel';

ModuleRegistry.registerModules([AllCommunityModule]);

interface TabularData {
	headers: string[];
	rows: Record<string, any>[];
}

async function parseTabularFile(file: TFile, vault: Vault): Promise<TabularData> {
	if (file.extension === 'parquet') {
		const buffer = await vault.adapter.readBinary(file.path);
		const rows = await parquetReadObjects({ file: buffer, compressors }) as Record<string, any>[];
		const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
		return { headers, rows };
	}
	const raw = await vault.read(file);
	const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve) => {
		Papa.parse<Record<string, string>>(raw, {
			header: true,
			skipEmptyLines: true,
			worker: true,
			complete: resolve,
		});
	});
	if (parsed.errors.length > 0 && parsed.data.length === 0) {
		throw new Error(parsed.errors[0]!.message);
	}
	return { headers: parsed.meta.fields ?? [], rows: parsed.data };
}

export const CSV_CODING_VIEW_TYPE = 'qualia-csv';

// ── AG Grid theme mapped to Obsidian CSS vars ──
const obsidianTheme = themeQuartz.withParams({
	backgroundColor: 'var(--background-primary)',
	foregroundColor: 'var(--text-normal)',
	headerBackgroundColor: 'var(--background-secondary)',
	headerTextColor: 'var(--text-normal)',
	borderColor: 'var(--background-modifier-border)',
	rowHoverColor: 'var(--background-modifier-hover)',
	selectedRowBackgroundColor: 'var(--background-modifier-hover)',
	accentColor: 'var(--interactive-accent)',
	oddRowBackgroundColor: 'var(--background-primary)',
	fontFamily: 'var(--font-text)',
	fontSize: 14,
});

// ── Main FileView ──
export class CsvCodingView extends FileView {
	private plugin: QualiaCodingPlugin;
	private csvModel: CsvCodingModel;
	private gridApi: GridApi | null = null;
	private originalHeaders: string[] = [];
	private headerObserver: MutationObserver | null = null;
	private gridWrapper: HTMLElement | null = null;

	// Segment editor state
	private editorPanel: HTMLElement | null = null;
	private editorView: EditorView | null = null;
	private editorContext: { file: string; row: number; column: string } | null = null;
	private labelObserver: MutationObserver | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, csvModel: CsvCodingModel) {
		super(leaf);
		this.plugin = plugin;
		this.csvModel = csvModel;
	}

	getViewType(): string { return CSV_CODING_VIEW_TYPE; }
	getDisplayText(): string { return this.file?.name ?? 'Qualia CSV'; }
	getIcon(): string { return 'table'; }
	canAcceptExtension(extension: string): boolean { return extension === 'csv' || extension === 'parquet'; }

	async onLoadFile(file: TFile): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		const loading = contentEl.createEl('p');
		loading.textContent = file.extension === 'parquet' ? 'Loading Parquet...' : 'Loading CSV...';
		loading.style.margin = '8px 12px';
		loading.style.fontSize = '12px';
		loading.style.color = 'var(--text-muted)';

		let result: TabularData;
		try {
			result = await parseTabularFile(file, this.app.vault);
		} catch (e) {
			contentEl.empty();
			contentEl.createEl('p', { text: `Error: ${(e as Error).message}` });
			return;
		}

		if (this.file !== file) return;
		contentEl.empty();

		const { headers, rows } = result;
		if (headers.length === 0) {
			contentEl.createEl('p', { text: 'No columns found.' });
			return;
		}

		// Info bar
		const infoBar = contentEl.createEl('div');
		infoBar.style.display = 'flex';
		infoBar.style.alignItems = 'center';
		infoBar.style.justifyContent = 'flex-end';
		infoBar.style.gap = '6px';
		infoBar.style.padding = '4px 12px';
		infoBar.style.fontSize = '12px';
		infoBar.style.color = 'var(--text-muted)';
		infoBar.style.borderBottom = 'none';

		infoBar.createEl('span', { text: `${rows.length.toLocaleString()} rows \u00d7 ${headers.length} columns` });

		const gearBtn = infoBar.createEl('span');
		gearBtn.style.cursor = 'pointer';
		gearBtn.style.color = 'var(--text-muted)';
		gearBtn.style.display = 'flex';
		setIcon(gearBtn, 'settings');
		const svg = gearBtn.querySelector('svg');
		if (svg) { svg.style.width = '16px'; svg.style.height = '16px'; }
		gearBtn.addEventListener('click', () => {
			if (this.gridApi) {
				new ColumnToggleModal(this.app, this.gridApi, this.originalHeaders, this.csvModel, this.file?.path ?? '', this).open();
			}
		});

		this.originalHeaders = headers;

		// Grid wrapper
		const wrapper = contentEl.createEl('div');
		wrapper.style.height = 'calc(100% - 40px)';
		wrapper.style.width = '100%';
		this.gridWrapper = wrapper;

		// Populate rowDataCache for sidebar views
		this.csvModel.rowDataCache.set(file.path, rows);

		this.gridApi = createGrid(wrapper, {
			theme: obsidianTheme,
			columnDefs: headers.map((h: string) => ({ field: h, headerName: h })),
			defaultColDef: { sortable: true, filter: true, resizable: true },
			rowData: rows,
			enableCellTextSelection: true,
			domLayout: 'normal',
		});

		// Listen for navigation events from sidebar views
		const navHandler = (detail: any) => {
			if (!this.gridApi || detail?.file !== file.path) return;
			this.gridApi.ensureIndexVisible(detail.row, 'middle');
			const rowNode = this.gridApi.getDisplayedRowAtIndex(detail.row);
			if (rowNode) {
				this.gridApi.flashCells({ rowNodes: [rowNode], fadeDuration: 1500 });
			}
		};
		this.registerEvent(
			this.app.workspace.on('qualia-csv:navigate', navHandler)
		);

		// Inject custom header buttons via MutationObserver
		const headerRoot = wrapper.querySelector('.ag-header');
		if (headerRoot) {
			const inject = () => this.injectHeaderButtons(wrapper);
			inject();
			this.headerObserver = new MutationObserver(inject);
			this.headerObserver.observe(headerRoot, { childList: true, subtree: true });
		}
	}

	private injectHeaderButtons(wrapper: HTMLElement) {
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
					const btn = this.createHeaderIcon(isCodSeg ? 'info' : 'tag', isCodSeg ? '2.5' : '3');
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
							if (this.gridApi && this.file) {
								openBatchCodingPopover(btn, this.csvModel, this.file.path, sourceColumn, this.gridApi, this.app);
							}
						});
					}

					labelContainer.insertBefore(btn, labelDiv);
				}
			}

			if (isComment && !cell.querySelector('.csv-header-wrap-btn')) {
				const wrapBtn = this.createHeaderIcon('wrap-text', '2.5');
				wrapBtn.className = 'csv-header-wrap-btn ag-header-icon ' + wrapBtn.className;

				const col = this.gridApi?.getColumn(colId);
				const colDef = col ? col.getColDef() : null;
				const isWrapped = colDef?.wrapText ?? true;
				wrapBtn.style.opacity = isWrapped ? '0.8' : '0.3';

				wrapBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					if (!this.gridApi) return;
					const colDefs = this.gridApi.getColumnDefs();
					if (!colDefs) return;
					const def = colDefs.find((c) => (c as ColDef).field === colId) as ColDef | undefined;
					if (!def) return;
					const nowWrapped = def.wrapText ?? true;
					(def as ColDef).wrapText = !nowWrapped;
					(def as ColDef).autoHeight = !nowWrapped;
					(def as ColDef).cellClass = !nowWrapped ? 'csv-comment-cell' : 'csv-comment-cell-nowrap';
					this.gridApi.setGridOption('columnDefs', colDefs);
				});

				labelContainer.insertBefore(wrapBtn, labelDiv);
			}
		}
	}

	private createHeaderIcon(icon: string, strokeWidth: string): HTMLElement {
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

	// ─── Segment Editor (CM6 split panel) ────────────────────

	openSegmentEditor(file: string, row: number, column: string, cellText: string) {
		if (
			this.editorContext &&
			this.editorContext.file === file &&
			this.editorContext.row === row &&
			this.editorContext.column === column
		) {
			this.closeSegmentEditor();
			return;
		}

		this.closeSegmentEditor();
		this.editorContext = { file, row, column };

		const virtualFileId = `csv:${file}:${row}:${column}`;

		if (this.gridWrapper) {
			this.gridWrapper.style.height = 'calc(60% - 40px)';
		}

		this.editorPanel = this.contentEl.createEl('div');
		this.editorPanel.className = 'csv-segment-editor-panel';
		this.editorPanel.style.height = '40%';
		this.editorPanel.style.borderTop = '2px solid var(--background-modifier-border)';
		this.editorPanel.style.display = 'flex';
		this.editorPanel.style.flexDirection = 'column';

		const header = this.editorPanel.createEl('div');
		header.className = 'csv-segment-editor-header';
		header.style.display = 'flex';
		header.style.alignItems = 'center';
		header.style.justifyContent = 'space-between';
		header.style.padding = '4px 12px';
		header.style.fontSize = '12px';
		header.style.color = 'var(--text-muted)';
		header.style.backgroundColor = 'var(--background-secondary)';
		header.style.flexShrink = '0';

		header.createSpan({ text: `Row ${row + 1} \u00b7 ${column}` });

		const closeBtn = header.createSpan();
		closeBtn.style.cursor = 'pointer';
		closeBtn.style.display = 'flex';
		setIcon(closeBtn, 'x');
		const svg = closeBtn.querySelector('svg');
		if (svg) { svg.style.width = '16px'; svg.style.height = '16px'; }
		closeBtn.addEventListener('click', () => this.closeSegmentEditor());

		const editorContainer = this.editorPanel.createEl('div');
		editorContainer.style.flex = '1';
		editorContainer.style.overflow = 'auto';

		const mdModel = this.plugin.markdownModel!;

		// Sync code definitions from shared registry so colors resolve in CM6
		for (const def of this.csvModel.registry.getAll()) {
			if (!mdModel.registry.getByName(def.name)) {
				mdModel.registry.importDefinition(def);
			}
		}

		const segmentMarkers = this.csvModel.getSegmentMarkersForCell(file, row, column);
		this.populateMarkersFromSegments(virtualFileId, segmentMarkers, cellText);

		this.editorView = new EditorView({
			state: EditorState.create({
				doc: cellText,
				extensions: [
					EditorView.editable.of(false),
					EditorState.readOnly.of(true),
					drawSelection(),
					tooltips({ parent: document.body }),
					createMarkerStateField(mdModel),
					createMarkerViewPlugin(mdModel),
					createSelectionMenuField(mdModel),
					createHoverMenuExtension(mdModel),
					createMarginPanelExtension(mdModel),
					EditorView.theme({
						'&': {
							backgroundColor: 'var(--background-secondary)',
							color: 'var(--text-normal)',
							height: '100%',
						},
						'.cm-content': {
							fontFamily: "Georgia, 'Times New Roman', serif",
							fontSize: '28px',
							padding: '8px 0',
						},
						'.cm-activeLine': {
							backgroundColor: 'transparent',
						},
						'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
							backgroundColor: 'rgba(var(--interactive-accent-rgb, 66, 133, 244), 0.25) !important',
						},
					}),
				],
			}),
			parent: editorContainer,
		});

		registerStandaloneEditor(this.editorView, virtualFileId);
		mdModel.registerStandaloneEditor(virtualFileId, this.editorView);

		this.editorView.dispatch({
			effects: [
				setFileIdEffect.of({ fileId: virtualFileId }),
				updateFileMarkersEffect.of({ fileId: virtualFileId }),
			]
		});

		this.alignMarginLabels();

		// Suppress hover/handles for 500ms after creation
		this.editorView.dom.style.pointerEvents = 'none';
		const ev = this.editorView;
		setTimeout(() => {
			if (ev.dom) ev.dom.style.pointerEvents = '';
		}, 500);

		if (this.gridApi) {
			setTimeout(() => this.gridApi?.setGridOption('domLayout', 'normal'), 50);
		}
	}

	private alignMarginLabels() {
		if (!this.editorView) return;
		const panel = this.editorView.scrollDOM.querySelector('.codemarker-margin-panel');
		if (!panel) return;

		const ORIGINAL_LABEL_HEIGHT = 16;
		const editorView = this.editorView;

		const patchLabels = () => {
			if (!editorView?.dom) return;

			const lineH = editorView.defaultLineHeight;
			const contentPaddingTop = parseFloat(getComputedStyle(editorView.contentDOM).paddingTop) || 0;

			const labels = panel.querySelectorAll<HTMLElement>('.codemarker-margin-label');
			if (labels.length === 0) return;

			const heightShift = (lineH - ORIGINAL_LABEL_HEIGHT) / 2;
			if (Math.abs(contentPaddingTop) < 0.5 && Math.abs(heightShift) < 0.5) return;

			const allPositioned = panel.querySelectorAll<HTMLElement>('[style*="top"]');
			for (const el of Array.from(allPositioned)) {
				const origTop = parseFloat(el.style.top);
				if (isNaN(origTop)) continue;

				if (el.classList.contains('codemarker-margin-label')) {
					const labelShift = (lineH - ORIGINAL_LABEL_HEIGHT) / 2;
					el.style.top = `${origTop + contentPaddingTop - labelShift}px`;
					el.style.lineHeight = `${lineH}px`;
				} else {
					el.style.top = `${origTop + contentPaddingTop}px`;
				}
			}
		};

		this.labelObserver = new MutationObserver(() => {
			requestAnimationFrame(patchLabels);
		});
		this.labelObserver.observe(panel, { childList: true });
	}

	private populateMarkersFromSegments(virtualFileId: string, segments: SegmentMarker[], cellText: string) {
		const mdModel = this.plugin.markdownModel!;
		mdModel.clearMarkersForFile(virtualFileId);

		const lines = cellText.split('\n');
		const lineStarts: number[] = [0];
		for (let i = 0; i < lines.length - 1; i++) {
			lineStarts.push(lineStarts[i]! + lines[i]!.length + 1);
		}

		const offsetToPos = (offset: number): { line: number; ch: number } => {
			for (let i = lineStarts.length - 1; i >= 0; i--) {
				if (offset >= lineStarts[i]!) {
					return { line: i, ch: offset - lineStarts[i]! };
				}
			}
			return { line: 0, ch: 0 };
		};

		for (const seg of segments) {
			if (seg.codes.length === 0) continue;
			const marker: Marker = {
				markerType: 'markdown',
				id: seg.id,
				fileId: virtualFileId,
				range: {
					from: offsetToPos(seg.from),
					to: offsetToPos(seg.to),
				},
				color: this.csvModel.registry.getColorForCodes(seg.codes) ?? '#6200EE',
				codes: [...seg.codes],
				createdAt: seg.createdAt,
				updatedAt: seg.updatedAt,
			};
			mdModel.addMarkerDirect(virtualFileId, marker);
		}
	}

	closeSegmentEditor() {
		if (this.labelObserver) {
			this.labelObserver.disconnect();
			this.labelObserver = null;
		}
		if (this.editorView && this.editorContext) {
			const { file, row, column } = this.editorContext;
			const virtualFileId = `csv:${file}:${row}:${column}`;

			this.syncMarkersBackToCsvModel(virtualFileId, file, row, column);

			const mdModel = this.plugin.markdownModel!;
			unregisterStandaloneEditor(this.editorView);
			mdModel.unregisterStandaloneEditor(virtualFileId);
			mdModel.clearMarkersForFile(virtualFileId);

			this.editorView.destroy();
			this.editorView = null;
		} else if (this.editorView) {
			this.editorView.destroy();
			this.editorView = null;
		}
		if (this.editorPanel) {
			this.editorPanel.remove();
			this.editorPanel = null;
		}
		this.editorContext = null;

		if (this.gridWrapper) {
			this.gridWrapper.style.height = 'calc(100% - 40px)';
		}
		if (this.gridApi) {
			setTimeout(() => this.gridApi?.setGridOption('domLayout', 'normal'), 50);
		}
		if (this.gridApi) {
			setTimeout(() => this.gridApi?.refreshCells({ force: true }), 100);
		}
	}

	private syncMarkersBackToCsvModel(virtualFileId: string, file: string, row: number, column: string) {
		const mdModel = this.plugin.markdownModel!;
		const mdMarkers = mdModel.getMarkersForFile(virtualFileId);

		if (!this.editorView) return;
		const doc = this.editorView.state.doc;

		this.csvModel.deleteSegmentMarkersForCell(file, row, column);

		for (const marker of mdMarkers) {
			if (marker.codes.length === 0) continue;
			try {
				const fromOffset = doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
				const toOffset = doc.line(marker.range.to.line + 1).from + marker.range.to.ch;

				const snapshot = { fileId: file, row, column, from: fromOffset, to: toOffset, text: '' };
				const segMarker = this.csvModel.findOrCreateSegmentMarker(snapshot);
				segMarker.codes = [...marker.codes];
				segMarker.updatedAt = marker.updatedAt;
			} catch (e) {
				console.warn('[Qualia CSV] Error syncing marker back:', e);
			}
		}

		this.csvModel.notifyAndSave();
	}

	refreshSegmentEditor() {
		if (this.editorView && this.editorContext) {
			const { file, row, column } = this.editorContext;
			const virtualFileId = `csv:${file}:${row}:${column}`;
			this.editorView.dispatch({
				effects: updateFileMarkersEffect.of({ fileId: virtualFileId }),
			});
		}
	}

	async onUnloadFile(): Promise<void> {
		this.closeSegmentEditor();
		if (this.file) {
			this.csvModel.rowDataCache.delete(this.file.path);
		}
		if (this.headerObserver) {
			this.headerObserver.disconnect();
			this.headerObserver = null;
		}
		if (this.gridApi) {
			this.gridApi.destroy();
			this.gridApi = null;
		}
		this.contentEl.empty();
	}
}
