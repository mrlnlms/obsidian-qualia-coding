import { FileView, FileSystemAdapter, TFile, Vault, WorkspaceLeaf, setIcon } from 'obsidian';
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
import {
	DuckDBRowProvider,
	type TabularFileType,
	copyVaultFileToOPFS,
	opfsKeyFor,
} from './duckdb';

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

// ── Lazy-mode runtime state — populated when a file is opened above the size threshold ──
interface LazyState {
	rowProvider: DuckDBRowProvider;
	fileType: TabularFileType;
	totalRows: number;
	displayMap?: { name: string; orderBy: Array<{ column: string; descending: boolean }> };
}

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
	private lazyState: LazyState | null = null;

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
	 * Banner offering 3 paths for files above the size threshold:
	 *  - 'lazy'   → DuckDB-Wasm + OPFS (fast open, SQL-backed sort/filter)
	 *  - 'eager'  → load everything into memory (current behavior; may freeze)
	 *  - 'cancel' → user backed out
	 */
	private async confirmLoadLargeFile(file: TFile, sizeBytes: number, thresholdBytes: number): Promise<'lazy' | 'eager' | 'cancel'> {
		const { contentEl } = this;
		contentEl.empty();

		const banner = contentEl.createDiv({ cls: 'qualia-tabular-size-warning' });
		banner.createEl('h3', { text: '⚠️ Large file' });
		const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
		const limitMb = (thresholdBytes / (1024 * 1024)).toFixed(0);
		banner.createEl('p', {
			text: `${file.name} is ${sizeMb} MB (threshold: ${limitMb} MB for ${file.extension}).`,
		});
		banner.createEl('p', {
			text: 'Lazy mode opens the file via DuckDB-Wasm + OPFS (no full-memory load). Coding lands in the next phase — for now lazy mode is view-only.',
			cls: 'qualia-tabular-size-warning-hint',
		});

		return new Promise<'lazy' | 'eager' | 'cancel'>((resolve) => {
			const actions = banner.createDiv({ cls: 'qualia-tabular-size-warning-actions' });
			const cancelBtn = actions.createEl('button', { text: 'Cancel' });
			const eagerBtn = actions.createEl('button', { text: 'Load full (eager)' });
			const lazyBtn = actions.createEl('button', { text: 'Lazy mode', cls: 'mod-cta' });
			cancelBtn.addEventListener('click', () => resolve('cancel'));
			eagerBtn.addEventListener('click', () => resolve('eager'));
			lazyBtn.addEventListener('click', () => resolve('lazy'));
		});
	}

	async onLoadFile(file: TFile): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		// Size guard: arquivo grande pode travar Obsidian em modo eager.
		// Defaults calibrados em bench empírico (2026-04-24): parquet 50 MB / csv 100 MB.
		// Lazy mode (Fase 4) opens via DuckDB+OPFS — no full-memory materialization.
		const sizeBytes = file.stat.size;
		const csvSettings = this.plugin.dataManager.section('csv') as { settings?: { parquetSizeWarningMB?: number; csvSizeWarningMB?: number } } | undefined;
		const parquetMB = csvSettings?.settings?.parquetSizeWarningMB ?? 50;
		const csvMB = csvSettings?.settings?.csvSizeWarningMB ?? 100;
		const thresholdBytes = (file.extension === 'parquet' ? parquetMB : csvMB) * 1024 * 1024;
		if (sizeBytes > thresholdBytes) {
			const choice = await this.confirmLoadLargeFile(file, sizeBytes, thresholdBytes);
			if (choice === 'cancel') {
				this.readyResolve?.();
				this.leaf.detach();
				return;
			}
			if (choice === 'lazy') {
				return this.setupLazyMode(file);
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

	/**
	 * Lazy-mode bring-up: stream the vault file into OPFS, register it with DuckDB,
	 * back the AG Grid with an Infinite Row Model that paginates via SQL, and wire
	 * the same coding affordances eager mode uses (gear button, header injection,
	 * cell renderer chips). The cell renderer reads `__source_row` straight from
	 * the row data the datasource returns — see csvCodingCellRenderer's
	 * sourceRowId fallback chain.
	 *
	 * Out of scope here: preview of `marker.markerText` in sidebar/detail views
	 * for lazy files (would need an async cascade through SidebarModelInterface).
	 * Tracked in BACKLOG.md.
	 */
	private async setupLazyMode(file: TFile): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		const status = contentEl.createDiv({ cls: 'qualia-tabular-lazy-status' });
		status.style.padding = '8px 12px';
		status.style.fontSize = '12px';
		status.style.color = 'var(--text-muted)';
		status.textContent = 'Preparing lazy mode…';

		const fileType: TabularFileType = file.extension === 'parquet' ? 'parquet' : 'csv';

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			status.textContent = '❌ Lazy mode requires desktop FileSystemAdapter.';
			this.readyResolve?.();
			return;
		}
		const absPath = adapter.getFullPath(file.path);
		const vaultId = (this.app.vault as unknown as { getName: () => string }).getName?.() ?? 'default';
		const opfsKey = opfsKeyFor(vaultId, file.path);

		try {
			status.textContent = 'Copying to lazy cache (0%)…';
			const handle = await copyVaultFileToOPFS(absPath, opfsKey, file.stat.mtime, (w, t) => {
				const pct = t > 0 ? ((w / t) * 100).toFixed(0) : '?';
				const wMb = (w / (1024 * 1024)).toFixed(1);
				const tMb = (t / (1024 * 1024)).toFixed(1);
				status.textContent = `Copying to lazy cache (${pct}%) — ${wMb} / ${tMb} MB`;
			});

			status.textContent = 'Booting DuckDB-Wasm…';
			const runtime = await this.plugin.getDuckDB();

			status.textContent = 'Registering data source…';
			const rowProvider = await DuckDBRowProvider.create({
				runtime,
				fileHandle: handle,
				fileType,
			});
			const totalRows = await rowProvider.getRowCount();
			const columns = await rowProvider.getColumns();

			this.lazyState = { rowProvider, fileType, totalRows };
			this.originalHeaders = columns;
			// Surface markerText resolution to the model — sidebar/detail views
			// pick this up automatically via getMarkerTextAsync.
			this.csvModel.registerLazyProvider(file.path, rowProvider);

			contentEl.empty();

			// Info bar — same layout as eager mode + a lazy badge + gear button.
			const infoBar = contentEl.createEl('div');
			infoBar.style.display = 'flex';
			infoBar.style.alignItems = 'center';
			infoBar.style.justifyContent = 'space-between';
			infoBar.style.gap = '6px';
			infoBar.style.padding = '4px 12px';
			infoBar.style.fontSize = '12px';
			infoBar.style.color = 'var(--text-muted)';

			const badge = infoBar.createEl('span', { text: 'lazy mode' });
			badge.style.padding = '2px 8px';
			badge.style.borderRadius = '4px';
			badge.style.backgroundColor = 'var(--background-modifier-border)';
			badge.style.fontSize = '10px';
			badge.style.fontWeight = '600';
			badge.style.textTransform = 'uppercase';

			const rightSide = infoBar.createEl('div');
			rightSide.style.display = 'flex';
			rightSide.style.alignItems = 'center';
			rightSide.style.gap = '8px';
			rightSide.createEl('span', { text: `${totalRows.toLocaleString()} rows × ${columns.length} columns` });

			const gearBtn = rightSide.createEl('span');
			gearBtn.style.cursor = 'pointer';
			gearBtn.style.color = 'var(--text-muted)';
			gearBtn.style.display = 'flex';
			setIcon(gearBtn, 'settings');
			const gearSvg = gearBtn.querySelector('svg');
			if (gearSvg) { gearSvg.style.width = '16px'; gearSvg.style.height = '16px'; }
			gearBtn.addEventListener('click', () => {
				if (this.gridApi) {
					new ColumnToggleModal(this.app, this.gridApi, this.originalHeaders, this.csvModel, this.file?.path ?? '', this).open();
				}
			});

			// Grid wrapper
			const wrapper = contentEl.createEl('div');
			wrapper.style.height = 'calc(100% - 40px)';
			wrapper.style.width = '100%';
			this.gridWrapper = wrapper;

			// AG Grid Infinite Row Model — datasource pages via DuckDB.
			this.gridApi = createGrid(wrapper, {
				theme: obsidianTheme,
				columnDefs: columns.map((h) => ({ field: h, headerName: h })),
				defaultColDef: { sortable: true, filter: false, resizable: true },
				rowModelType: 'infinite',
				cacheBlockSize: 100,
				maxBlocksInCache: 10,
				rowBuffer: 20,
				datasource: {
					getRows: async (params) => {
						try {
							if (!this.lazyState) {
								params.failCallback();
								return;
							}
							const orderBy = (params.sortModel ?? []).map((s) => ({
								column: s.colId,
								descending: s.sort === 'desc',
							}));
							const rows = await this.lazyState.rowProvider.getRowsByDisplayRange({
								offset: params.startRow,
								limit: params.endRow - params.startRow,
								orderBy,
							});
							const lastRow = (params.startRow + rows.length) >= this.lazyState.totalRows
								? this.lazyState.totalRows
								: -1;
							params.successCallback(rows, lastRow);
						} catch (err) {
							console.error('[qualia-csv lazy] getRows failed', err);
							params.failCallback();
						}
					},
				},
				enableCellTextSelection: true,
				domLayout: 'normal',
				// Sort change → rebuild display_row mapping for responsive scroll-to-row
				// (spike Premise B addendum §14.5.2). The mapping is a DuckDB temp table
				// keyed by __source_row → display_row under the current sort.
				onSortChanged: () => { void this.refreshLazyDisplayMap(); },
			});

			this.readyResolve?.();

			// Subscribe to visibility changes (same as eager mode).
			this.unsubscribeVisibility?.();
			this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));

			// Inject custom header buttons via MutationObserver — enables the same
			// coding affordances (cod-seg/cod-frow column tag buttons) as eager mode.
			const headerRoot = wrapper.querySelector('.ag-header');
			if (headerRoot) {
				const ctx = { gridApi: this.gridApi, csvModel: this.csvModel, filePath: this.file?.path, app: this.app };
				const inject = () => injectHeaderButtons(wrapper, ctx);
				inject();
				this.headerObserver = new MutationObserver(inject);
				this.headerObserver.observe(headerRoot, { childList: true, subtree: true });
			}
		} catch (err) {
			contentEl.empty();
			contentEl.createEl('p', {
				text: `❌ Lazy mode failed: ${(err as Error).message}`,
			});
			console.error('[qualia-csv lazy] setup failed', err);
			this.readyResolve?.();
		}
	}

	// ─── Navigation ─────────────────────────────────────────

	waitUntilReady(): Promise<void> {
		return this.readyPromise;
	}

	/**
	 * Rebuilds the lazy-mode display_row mapping when the sort changes. Drops the
	 * stale map first to free DuckDB memory. No-op if not in lazy mode.
	 *
	 * Spike Premise B addendum §14.5.2: scroll-to-row in lazy mode without this
	 * caching has p99 ~214ms in 297MB; with this it's a single point lookup.
	 */
	private async refreshLazyDisplayMap(): Promise<void> {
		if (!this.lazyState || !this.gridApi) return;
		// AG Grid 33+ removed gridApi.getSortModel(). Iterate columns instead and
		// pick the ones with an active sort, ordered by sortIndex (multi-sort).
		const cols = this.gridApi.getColumns?.() ?? [];
		const sortedCols = cols
			.filter(c => c.getSort() != null)
			.sort((a, b) => (a.getSortIndex() ?? 0) - (b.getSortIndex() ?? 0));
		const orderBy = sortedCols.map(c => ({
			column: c.getColId(),
			descending: c.getSort() === 'desc',
		}));
		try {
			if (this.lazyState.displayMap) {
				const oldName = this.lazyState.displayMap.name;
				this.lazyState.displayMap = undefined;
				await this.lazyState.rowProvider.dropDisplayMap(oldName);
			}
			if (orderBy.length === 0) return; // no sort → no map needed
			const name = await this.lazyState.rowProvider.buildDisplayMap(orderBy);
			if (this.lazyState) this.lazyState.displayMap = { name, orderBy };
		} catch (err) {
			console.warn('[qualia-csv lazy] refreshLazyDisplayMap failed', err);
		}
	}

	async navigateToRow(sourceRowId: number, column?: string): Promise<void> {
		if (!this.gridApi) return;
		// In lazy mode with an active sort, sourceRowId != display index — resolve
		// via the display_row mapping table built on each sort change.
		let displayIndex = sourceRowId;
		if (this.lazyState?.displayMap) {
			const mapped = await this.lazyState.rowProvider.displayRowFor(
				this.lazyState.displayMap.name,
				sourceRowId,
			);
			if (mapped != null) displayIndex = mapped;
		}
		this.gridApi.ensureIndexVisible(displayIndex, 'middle');
		const rowNode = this.gridApi.getDisplayedRowAtIndex(displayIndex);
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
		// Lazy mode teardown — drop display map (if cached), unregister provider
		// from the model, dispose the RowProvider. The DuckDB runtime itself stays
		// alive (other lazy views may share it).
		if (this.lazyState) {
			const { rowProvider, displayMap } = this.lazyState;
			if (this.file) this.csvModel.unregisterLazyProvider(this.file.path);
			if (displayMap) {
				try { await rowProvider.dropDisplayMap(displayMap.name); } catch (e) { console.warn(e); }
			}
			try { await rowProvider.dispose(); } catch (e) { console.warn(e); }
			this.lazyState = null;
		}
		this.contentEl.empty();
	}
}
