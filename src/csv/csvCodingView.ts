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
import { buildWhereClause, type AgFilterModel } from './duckdb/filterModelToSql';

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
	displayMap?: { name: string; orderBy: Array<{ column: string; descending: boolean }>; whereClause?: string };
	/**
	 * Cached current filter — recomputed on `filterChanged`. `whereClause` is the
	 * SQL fragment passed to DuckDB; `filteredCount` is what the datasource uses
	 * to signal `lastRow` to AG Grid Infinite. Both are absent when no filter is
	 * active (full-table queries).
	 */
	currentFilter?: { whereClause?: string; filteredCount: number };
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

	/**
	 * Inert "click to load" placeholder rendered during workspace restoration for
	 * files above the size threshold. Avoids racing the plugin bundle parse with
	 * an auto-triggered banner — user explicitly opts in to load by clicking.
	 */
	private renderDeferredLoadPlaceholder(file: TFile, sizeBytes: number, thresholdBytes: number): void {
		const { contentEl } = this;
		contentEl.empty();
		const banner = contentEl.createDiv({ cls: 'qualia-tabular-size-warning' });
		banner.createEl('h3', { text: 'Large file — load deferred' });
		const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
		const limitMb = (thresholdBytes / (1024 * 1024)).toFixed(0);
		banner.createEl('p', {
			text: `${file.name} (${sizeMb} MB, threshold ${limitMb} MB) was not auto-loaded on workspace restore to keep Obsidian responsive.`,
		});
		banner.createEl('p', {
			text: 'Click below to choose how to open this file.',
			cls: 'qualia-tabular-size-warning-hint',
		});
		const actions = banner.createDiv({ cls: 'qualia-tabular-size-warning-actions' });
		const openBtn = actions.createEl('button', { text: 'Open this file', cls: 'mod-cta' });
		openBtn.addEventListener('click', () => {
			// Non-blocking: same rationale as onLoadFile — awaiting the banner here
			// would freeze Obsidian's loadFile pipeline if the user switches files
			// before clicking a banner button.
			void this.confirmLoadLargeFile(file, sizeBytes, thresholdBytes).then(choice => {
				if (this.file !== file) return;
				if (choice === 'cancel') { this.leaf.detach(); return; }
				if (choice === 'lazy') { void this.setupLazyMode(file); return; }
				void this.loadEagerPath(file);
			});
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

		// Workspace restoration path: when Obsidian is reopening a saved layout that
		// included a leaf with a heavy file, do NOT auto-load. Auto-loading at this
		// stage races with plugin initialization (49MB bundle parse) and the user
		// perceives "Obsidian froze". Render an inert placeholder; user clicks to load.
		// Heuristic: `workspace.layoutReady` is false during restore, true on user open.
		if (sizeBytes > thresholdBytes && !this.app.workspace.layoutReady) {
			this.renderDeferredLoadPlaceholder(file, sizeBytes, thresholdBytes);
			this.readyResolve?.();
			return;
		}

		if (sizeBytes > thresholdBytes) {
			// CRITICAL: do NOT await the banner here. Awaiting blocks `onLoadFile` from
			// resolving, which freezes Obsidian's loadFile pipeline — the user can no
			// longer switch to any other file (markdown included). Render the banner
			// and return immediately; button handlers drive the next step asynchronously.
			//
			// `readyPromise` is NOT resolved here — callers awaiting waitUntilReady()
			// (e.g. `qualia-csv:navigate` reveal handler) need to wait for the grid
			// to be available. If the user cancels, we resolve below to unblock them
			// gracefully (gridApi stays null → navigateToRow becomes a no-op).
			void this.confirmLoadLargeFile(file, sizeBytes, thresholdBytes).then(choice => {
				// User may have switched to another file while the banner was up —
				// in that case onUnloadFile already ran and `this.file` no longer matches.
				if (this.file !== file) {
					this.readyResolve?.();
					return;
				}
				if (choice === 'cancel') {
					this.readyResolve?.();
					this.leaf.detach();
					return;
				}
				if (choice === 'lazy') { void this.setupLazyMode(file); return; }
				void this.loadEagerPath(file);
			});
			return;
		}

		return this.loadEagerPath(file);
	}

	/**
	 * Eager load path: read the entire file into memory (papaparse / hyparquet) and
	 * mount AG Grid Client-Side Row Model. Used when the file is below the size
	 * threshold OR when the user explicitly chose "Load full" on the warning banner.
	 */
	private async loadEagerPath(file: TFile): Promise<void> {
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

		// Inject custom header buttons via MutationObserver. Eager mode: source row IDs
		// for batch coding come from AG Grid's filtered/sorted node iterator (entire
		// dataset is in client memory).
		const headerRoot = wrapper.querySelector('.ag-header');
		if (headerRoot) {
			const ctx = {
				gridApi: this.gridApi,
				csvModel: this.csvModel,
				filePath: this.file?.path,
				app: this.app,
				getFilteredSourceRowIds: async (): Promise<number[]> => {
					const ids: number[] = [];
					this.gridApi?.forEachNodeAfterFilterAndSort(node => {
						ids.push(node.sourceRowIndex);
					});
					return ids;
				},
			};
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
				// `filter: true` enables AG Grid's built-in filter UI per column. The
				// datasource translates `params.filterModel` into a SQL WHERE fragment
				// via `buildWhereClause` so DuckDB does the actual filtering server-side
				// (client-side filtering is not viable in Infinite Row Model — only the
				// page cache is materialized). Virtual cod-seg/cod-frow/comment columns
				// override this to `false` in `columnToggleModal` because they don't
				// exist in the DuckDB schema.
				defaultColDef: { sortable: true, filter: true, resizable: true },
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
							// Filter out virtual cod-seg/cod-frow/comment columns — they don't
							// exist in DuckDB schema and would emit a Binder Error. Defense in
							// depth: ColumnToggleModal already sets `sortable: false` on those
							// in lazy mode, but the AG Grid sortModel could still contain them
							// if state was restored from elsewhere.
							const realCols = new Set(this.originalHeaders);
							const orderBy = (params.sortModel ?? [])
								.filter((s) => realCols.has(s.colId))
								.map((s) => ({
									column: s.colId,
									descending: s.sort === 'desc',
								}));
							const whereClause = this.lazyState.currentFilter?.whereClause;
							const effectiveTotal = this.lazyState.currentFilter?.filteredCount ?? this.lazyState.totalRows;
							const rows = await this.lazyState.rowProvider.getRowsByDisplayRange({
								offset: params.startRow,
								limit: params.endRow - params.startRow,
								orderBy,
								whereClause,
							});
							const lastRow = (params.startRow + rows.length) >= effectiveTotal
								? effectiveTotal
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
				// Filter change → recompute filtered count (so AG Grid's scrollbar shows
				// the right total) + rebuild display_row mapping (display index of any
				// given source row depends on which rows survive the filter). The grid
				// purges its row cache automatically on filter change.
				onFilterChanged: () => { void this.refreshLazyFilter(); },
			});

			this.readyResolve?.();

			// Subscribe to visibility changes (same as eager mode).
			this.unsubscribeVisibility?.();
			this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));

			// Inject custom header buttons via MutationObserver — same coding affordances
			// (cod-seg/cod-frow tag buttons) as eager mode. Lazy batch coding queries
			// DuckDB directly using the cached `whereClause` from `currentFilter`,
			// because AG Grid Infinite only sees the page cache (a few hundred rows).
			const headerRoot = wrapper.querySelector('.ag-header');
			if (headerRoot) {
				const ctx = {
					gridApi: this.gridApi,
					csvModel: this.csvModel,
					filePath: this.file?.path,
					app: this.app,
					getFilteredSourceRowIds: async (): Promise<number[]> => {
						if (!this.lazyState) return [];
						return this.lazyState.rowProvider.getFilteredSourceRowIds(
							this.lazyState.currentFilter?.whereClause,
						);
					},
				};
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
		// Filter out virtual columns (cod-seg/cod-frow/comment) — DuckDB schema
		// doesn't know them.
		const realCols = new Set(this.originalHeaders);
		const cols = this.gridApi.getColumns?.() ?? [];
		const sortedCols = cols
			.filter(c => c.getSort() != null && realCols.has(c.getColId()))
			.sort((a, b) => (a.getSortIndex() ?? 0) - (b.getSortIndex() ?? 0));
		const orderBy = sortedCols.map(c => ({
			column: c.getColId(),
			descending: c.getSort() === 'desc',
		}));
		const whereClause = this.lazyState.currentFilter?.whereClause;
		try {
			if (this.lazyState.displayMap) {
				const oldName = this.lazyState.displayMap.name;
				this.lazyState.displayMap = undefined;
				// Re-check after each await — onUnloadFile may have run concurrently.
				const provider = this.lazyState?.rowProvider;
				if (!provider) return;
				await provider.dropDisplayMap(oldName);
			}
			if (!this.lazyState) return;
			// No sort AND no filter → display index == source row index (natural order),
			// no mapping needed. Filter alone still requires a map because surviving rows
			// get re-numbered.
			if (orderBy.length === 0 && !whereClause) return;
			const provider = this.lazyState?.rowProvider;
			if (!provider) return;
			const name = await provider.buildDisplayMap(orderBy, whereClause);
			if (this.lazyState) this.lazyState.displayMap = { name, orderBy, whereClause };
		} catch (err) {
			console.warn('[qualia-csv lazy] refreshLazyDisplayMap failed', err);
		}
	}

	/**
	 * Filter change handler for lazy mode. The `whereClause` is updated SYNCHRONOUSLY
	 * before any async work — AG Grid purges its cache and re-invokes `datasource.getRows`
	 * within the same tick, and that call needs to see the new clause (otherwise it
	 * fetches rows without the filter applied and the grid shows stale data).
	 *
	 * The async tail recomputes `filteredCount` (drives Infinite Row Model's `lastRow`)
	 * and rebuilds the display_row map. During the brief window where filteredCount is
	 * stale, `lastRow` falls back to `totalRows` — slightly imprecise scrollbar, fine.
	 */
	private async refreshLazyFilter(): Promise<void> {
		if (!this.lazyState || !this.gridApi) return;
		const filterModel = this.gridApi.getFilterModel() as AgFilterModel | null;
		const whereClause = buildWhereClause(filterModel) ?? undefined;

		// Synchronous swap — getRows must see this on the next tick.
		if (whereClause) {
			this.lazyState.currentFilter = {
				whereClause,
				filteredCount: this.lazyState.totalRows,
			};
		} else {
			this.lazyState.currentFilter = undefined;
		}

		try {
			if (whereClause) {
				// Re-read lazyState after each await — onUnloadFile may have nulled it.
				const provider = this.lazyState?.rowProvider;
				if (!provider) return;
				const filteredCount = await provider.getRowCount(whereClause);
				if (this.lazyState?.currentFilter && this.lazyState.currentFilter.whereClause === whereClause) {
					this.lazyState.currentFilter.filteredCount = filteredCount;
				}
			}
			if (!this.lazyState) return;
			await this.refreshLazyDisplayMap();
		} catch (err) {
			console.warn('[qualia-csv lazy] refreshLazyFilter failed', err);
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

	isLazyMode(): boolean {
		return this.lazyState != null;
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

		// Snapshot + null `lazyState` BEFORE the async teardown. If anything during
		// `gridApi.destroy()` (or another concurrent path like `refreshLazyFilter`)
		// re-enters and reads `this.lazyState`, it sees null and skips work — avoids
		// double-dispose / double-dropDisplayMap on the same provider.
		const lazyState = this.lazyState;
		this.lazyState = null;
		if (lazyState && this.file) this.csvModel.unregisterLazyProvider(this.file.path);

		if (this.gridApi) {
			this.gridApi.destroy();
			this.gridApi = null;
		}

		// Lazy mode teardown — drop display map (if cached), dispose the RowProvider.
		// The DuckDB runtime itself stays alive (other lazy views may share it).
		if (lazyState) {
			const { rowProvider, displayMap } = lazyState;
			if (displayMap) {
				try { await rowProvider.dropDisplayMap(displayMap.name); } catch (e) { console.warn(e); }
			}
			try { await rowProvider.dispose(); } catch (e) { console.warn(e); }
		}
		this.contentEl.empty();
	}
}
