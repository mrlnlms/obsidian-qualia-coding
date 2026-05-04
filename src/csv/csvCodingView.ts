import { FileView, TFile, Vault, WorkspaceLeaf, setIcon } from 'obsidian';
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz } from 'ag-grid-community';
import * as Papa from 'papaparse';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { ColumnToggleModal } from './columnToggleModal';
import { injectHeaderButtons } from './csvHeaderInjection';
import { SegmentEditor } from './segmentEditor';
import type QualiaCodingPlugin from '../main';
import type { CsvCodingModel } from './csvCodingModel';
import { visibilityEventBus } from '../core/visibilityEventBus';
import type { IRowNode } from 'ag-grid-community';

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
	csvModel: CsvCodingModel;
	gridApi: GridApi | null = null;
	private originalHeaders: string[] = [];
	private headerObserver: MutationObserver | null = null;
	gridWrapper: HTMLElement | null = null;
	private segmentEditor: SegmentEditor;
	private readyResolve: (() => void) | null = null;
	private readyPromise: Promise<void> = new Promise(r => { this.readyResolve = r; });
	private unsubscribeVisibility?: () => void;

	get markdownModel() { return this.plugin.markdownModel!; }

	constructor(leaf: WorkspaceLeaf, plugin: QualiaCodingPlugin, csvModel: CsvCodingModel) {
		super(leaf);
		this.plugin = plugin;
		this.csvModel = csvModel;
		this.segmentEditor = new SegmentEditor(this);
	}

	getViewType(): string { return CSV_CODING_VIEW_TYPE; }
	getDisplayText(): string { return this.file?.name ?? 'Qualia CSV'; }
	getIcon(): string { return 'table'; }
	canAcceptExtension(extension: string): boolean { return extension === 'csv' || extension === 'parquet'; }

	/**
	 * Banner inline pedindo confirmação antes de carregar arquivo grande.
	 * Resolve `true` se user clicou "Load anyway", `false` se cancelou ou navegou.
	 * Sem lazy loading ainda, decode na main thread pode travar Obsidian.
	 */
	private async confirmLoadLargeFile(file: TFile, sizeBytes: number, thresholdBytes: number): Promise<boolean> {
		const { contentEl } = this;
		contentEl.empty();

		const banner = contentEl.createDiv({ cls: 'qualia-tabular-size-warning' });
		banner.createEl('h3', { text: '⚠️ Large file' });
		const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
		const limitMb = (thresholdBytes / (1024 * 1024)).toFixed(0);
		banner.createEl('p', {
			text: `${file.name} is ${sizeMb} MB (limit: ${limitMb} MB for ${file.extension}).`,
		});
		banner.createEl('p', {
			text: 'Loading large tabular files into memory may freeze Obsidian. Lazy loading is not yet supported.',
			cls: 'qualia-tabular-size-warning-hint',
		});

		return new Promise<boolean>((resolve) => {
			const actions = banner.createDiv({ cls: 'qualia-tabular-size-warning-actions' });
			const cancelBtn = actions.createEl('button', { text: 'Cancel' });
			const proceedBtn = actions.createEl('button', { text: 'Load anyway', cls: 'mod-warning' });
			cancelBtn.addEventListener('click', () => resolve(false));
			proceedBtn.addEventListener('click', () => resolve(true));
		});
	}

	async onLoadFile(file: TFile): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		// Size guard: arquivo grande pode travar Obsidian (sem lazy loading ainda).
		// Defaults calibrados em bench empírico (2026-04-24): parquet 50 MB / csv 100 MB.
		// User pode ajustar em Settings → Qualia Coding → Tabular files.
		const sizeBytes = file.stat.size;
		const csvSettings = this.plugin.dataManager.section('csv') as { settings?: { parquetSizeWarningMB?: number; csvSizeWarningMB?: number } } | undefined;
		const parquetMB = csvSettings?.settings?.parquetSizeWarningMB ?? 50;
		const csvMB = csvSettings?.settings?.csvSizeWarningMB ?? 100;
		const thresholdBytes = (file.extension === 'parquet' ? parquetMB : csvMB) * 1024 * 1024;
		if (sizeBytes > thresholdBytes) {
			const proceed = await this.confirmLoadLargeFile(file, sizeBytes, thresholdBytes);
			if (!proceed) {
				this.readyResolve?.();
				this.leaf.detach();
				return;
			}
			contentEl.empty();
		}

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
			this.readyResolve?.();
			return;
		}

		if (this.file !== file) { this.readyResolve?.(); return; }
		contentEl.empty();

		const { headers, rows } = result;
		if (headers.length === 0) {
			contentEl.createEl('p', { text: 'No columns found.' });
			this.readyResolve?.();
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

		// Signal readiness for callers awaiting waitUntilReady()
		this.readyResolve?.();

		// Subscribe to visibility changes
		this.unsubscribeVisibility?.();
		this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));

		// Inject custom header buttons via MutationObserver
		const headerRoot = wrapper.querySelector('.ag-header');
		if (headerRoot) {
			const ctx = { gridApi: this.gridApi, csvModel: this.csvModel, filePath: this.file?.path, app: this.app };
			const inject = () => injectHeaderButtons(wrapper, ctx);
			inject();
			this.headerObserver = new MutationObserver(inject);
			this.headerObserver.observe(headerRoot, { childList: true, subtree: true });
		}
	}

	// ─── Navigation ─────────────────────────────────────────

	waitUntilReady(): Promise<void> {
		return this.readyPromise;
	}

	navigateToRow(sourceRowId: number, column?: string) {
		if (!this.gridApi) return;
		// In eager mode (Fase 0) without sort/filter, sourceRowId == display index.
		// When sort is active, this navigates to the wrong visual row — same behavior as
		// pre-Fase-0; the proper resolution lands in Fase 4 (display_row mapping table).
		this.gridApi.ensureIndexVisible(sourceRowId, 'middle');
		const rowNode = this.gridApi.getDisplayedRowAtIndex(sourceRowId);
		if (rowNode) {
			const flashOpts: { rowNodes: any[]; fadeDuration: number; columns?: string[] } = {
				rowNodes: [rowNode],
				fadeDuration: 1500,
			};
			if (column) flashOpts.columns = [column];
			this.gridApi.flashCells(flashOpts);
		}
	}

	// ─── Segment Editor delegates ────────────────────────────

	openSegmentEditor(file: string, sourceRowId: number, column: string, cellText: string) {
		this.segmentEditor.open(file, sourceRowId, column, cellText);
	}

	closeSegmentEditor() {
		this.segmentEditor.close();
	}

	refreshSegmentEditor() {
		this.segmentEditor.refresh();
	}

	// ─── Visibility ─────────────────────────────────────────

	refreshVisibility(affectedCodeIds: Set<string>): void {
		if (!this.gridApi) return;
		const fileId = this.file?.path ?? '';
		if (!fileId) return;
		const affectedRows = this.findRowsWithCodes(affectedCodeIds, fileId);
		if (affectedRows.length === 0) return;
		this.gridApi.refreshCells({
			rowNodes: affectedRows,
			force: true,
		});
	}

	private findRowsWithCodes(codeIds: Set<string>, fileId: string): IRowNode[] {
		const rowNodes: IRowNode[] = [];
		const relevant = this.csvModel.getMarkersForFile(fileId)
			.filter(m => m.codes.some(app => codeIds.has(app.codeId)));
		const rowIndices = new Set(relevant.map(m => m.sourceRowId));
		rowIndices.forEach(rowIdx => {
			const node = this.gridApi!.getRowNode(`${rowIdx}`);
			if (node) rowNodes.push(node);
		});
		return rowNodes;
	}

	async onUnloadFile(): Promise<void> {
		// Reset readiness for next file load
		this.readyPromise = new Promise(r => { this.readyResolve = r; });
		this.unsubscribeVisibility?.();
		this.unsubscribeVisibility = undefined;
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
