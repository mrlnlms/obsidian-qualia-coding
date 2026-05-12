import { FileView, FileSystemAdapter, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz } from 'ag-grid-community';
import { ColumnToggleModal, restoreEnabledVirtualColumns } from './columnToggleModal';
import { QualiaMarkersTable } from './duckdb/qualiaMarkersTable';
import { BatchedMutationApplier } from './duckdb/batchedMutationApplier';
import { injectHeaderButtons } from './csvHeaderInjection';
import { SegmentEditor } from './segmentEditor';
import type QualiaCodingPlugin from '../main';
import type { CsvCodingModel } from './csvCodingModel';
import { visibilityEventBus } from '../core/visibilityEventBus';
import type { IRowNode } from 'ag-grid-community';
import { parseTabularFile, type TabularData } from './parseTabular';
import { formatLazyProgress } from './lazyProgressFormat';
import {
	DuckDBRowProvider,
	type TabularFileType,
	copyVaultFileToOPFS,
	opfsKeyFor,
	removeOPFSFile,
} from './duckdb';
import { buildWhereClause, type AgFilterModel } from './duckdb/filterModelToSql';
import { buildVirtualFilterClause, splitFilterModel, combineClauses } from './duckdb/virtualFilterResolver';
import { LazyTextFilter, type LazyTextFilterContext } from './duckdb/lazyTextFilter';
import type { RowMarker } from './csvCodingTypes';
import { computeRowGradient } from '../core/icr/ui/compareModeColoring';

ModuleRegistry.registerModules([AllCommunityModule]);

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
	private unsubscribeActiveCoder?: () => void;
	private lazyState: LazyState | null = null;
	/** onChange listener that tops up the marker preview cache when the user
	 *  codes new rows in lazy mode. Set on lazy load, cleared on unload. */
	private lazyChangeListener: (() => void) | null = null;
	/** Debounce timer for lazyChangeListener — burst writes (e.g. batch coding)
	 *  collapse into a single populateMissing pass. */
	private populateMissingTimer: number | null = null;
	/** Markers temp table DuckDB + applier (lazy mode only). Used pra filter
	 *  virtual cols (cod-frow, cod-seg, comment) + export parquet enriquecido. */
	private qualiaMarkersTable: QualiaMarkersTable | null = null;
	private batchedMutationApplier: BatchedMutationApplier | null = null;

	/** ICR Compare mode — quando setado, cellStyle dos columnDefs aplica
	 *  gradient por coder. Limpado por `clearCompareMode()`. */
	private compareModeContext: {
		markerIndex: Map<string, RowMarker[]>;
		coderColors: Map<string, string>;
	} | null = null;

	get markdownModel() { return this.plugin.markdownModel!; }

	/** Nome SQL da temp table de markers (lazy mode). null em eager. Pra callers de export. */
	get qualiaMarkersTableName(): string | null {
		return this.qualiaMarkersTable?.tableName ?? null;
	}

	/** Nome SQL da tabela do parquet/CSV registrada no DuckDB (lazy mode). null em eager. */
	get lazyOriginalTableName(): string | null {
		return this.lazyState?.rowProvider.tableName ?? null;
	}

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
	 * Inert "click to open" placeholder rendered during workspace restoration for
	 * files above the size threshold. Avoids racing the plugin bundle parse with
	 * an auto-triggered DuckDB boot — user explicitly opts in by clicking.
	 *
	 * Mode selection (lazy vs eager) is decided by the size threshold, not by the
	 * user. Click → setupLazyMode directly.
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
		const actions = banner.createDiv({ cls: 'qualia-tabular-size-warning-actions' });
		const openBtn = actions.createEl('button', { text: 'Open this file', cls: 'mod-cta' });
		openBtn.addEventListener('click', () => {
			if (this.file !== file) return;
			void this.setupLazyMode(file);
		});
	}

	async onLoadFile(file: TFile): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		// Size threshold: above this, the file opens in lazy mode (DuckDB + OPFS);
		// below, eager mode (full materialization). Defaults calibrados em bench
		// empírico (2026-04-24): parquet 50 MB / csv 100 MB. The user does NOT pick
		// the mode — system decides by size + open context.
		const sizeBytes = file.stat.size;
		const csvSettings = this.plugin.dataManager.section('csv') as { settings?: { parquetSizeWarningMB?: number; csvSizeWarningMB?: number } } | undefined;
		const parquetMB = csvSettings?.settings?.parquetSizeWarningMB ?? 50;
		const csvMB = csvSettings?.settings?.csvSizeWarningMB ?? 100;
		const thresholdBytes = (file.extension === 'parquet' ? parquetMB : csvMB) * 1024 * 1024;

		// Workspace restoration path: when Obsidian is reopening a saved layout that
		// included a leaf with a heavy file, do NOT auto-boot DuckDB. Auto-loading at
		// this stage races with plugin initialization (49MB bundle parse) and the
		// user perceives "Obsidian froze". Render an inert placeholder; user clicks
		// to load. Heuristic: `workspace.layoutReady` is false during restore.
		if (sizeBytes > thresholdBytes && !this.app.workspace.layoutReady) {
			this.renderDeferredLoadPlaceholder(file, sizeBytes, thresholdBytes);
			this.readyResolve?.();
			return;
		}

		if (sizeBytes > thresholdBytes) {
			return this.setupLazyMode(file);
		}

		return this.loadEagerPath(file);
	}

	/**
	 * Eager load path: read the entire file into memory (papaparse / hyparquet) and
	 * mount AG Grid Client-Side Row Model. Used when the file is below the size
	 * threshold. Above-threshold files always go through `setupLazyMode`.
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

		// Populate rowDataCache for sidebar views — `notifyListenersOnly` triggers
		// re-render of any open Code Detail/Explorer so marker labels switch from
		// the coordinate fallback (Row X · Column) to the actual cell content.
		this.csvModel.rowDataCache.set(file.path, rows);
		this.csvModel.notifyListenersOnly();

		this.gridApi = createGrid(wrapper, {
			theme: obsidianTheme,
			columnDefs: headers.map((h: string) => ({
				field: h,
				headerName: h,
				cellStyle: (params: { data?: Record<string, unknown>; node?: { rowIndex: number | null } }) => {
					const sourceRowId = (params.data?.sourceRowId as number | undefined) ?? params.node?.rowIndex ?? undefined;
					return this.cellStyleForCompareMode(h, sourceRowId === null ? undefined : sourceRowId);
				},
			})),
			defaultColDef: { sortable: true, filter: true, resizable: true },
			rowData: rows,
			enableCellTextSelection: true,
			domLayout: 'normal',
		});

		// Restaura virtual cols persistidas em data.json (cod-frow/cod-seg/comment).
		// GC interno: entries cuja source col não existe nos headers atuais são removidas.
		restoreEnabledVirtualColumns({
			gridApi: this.gridApi,
			model: this.csvModel,
			filePath: this.file?.path ?? '',
			csvView: this,
			app: this.app,
			originalHeaders: headers,
		});

		// Signal readiness for callers awaiting waitUntilReady()
		this.readyResolve?.();

		// Subscribe to visibility changes
		this.unsubscribeVisibility?.();
		this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));

		// Subscribe to active coder changes — refresh cells so codes/comments reflect
		// the active coder's view (other coders' work stays invisible outside compare mode).
		this.unsubscribeActiveCoder?.();
		this.unsubscribeActiveCoder = this.plugin.onActiveCoderChange(() => {
			this.gridApi?.refreshCells({ force: true });
		});

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
			status.textContent = '❌ Lazy mode could not access the local filesystem adapter.';
			this.readyResolve?.();
			return;
		}
		const absPath = adapter.getFullPath(file.path);
		const vaultId = (this.app.vault as unknown as { getName: () => string }).getName?.() ?? 'default';
		const opfsKey = opfsKeyFor(vaultId, file.path);

		try {
			status.textContent = 'Copying to lazy cache (0%)…';
			const copyStart = performance.now();
			const handle = await copyVaultFileToOPFS(absPath, opfsKey, file.stat.mtime, (w, t) => {
				const elapsed = performance.now() - copyStart;
				status.textContent = `Copying to lazy cache · ${formatLazyProgress(w, t, elapsed)}`;
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

			// Pre-populate marker preview cache so sidebar/detail blockquotes are
			// sync-ready right after open. Use the missing-only variant: when the
			// startup pre-populate already filled the cache (cross-session re-open
			// of an OPFS-cached file), this skips the redundant DuckDB scan and the
			// grid mounts ~1-2s sooner. First open of an uncached file pays the same
			// cost as before (all markers are missing).
			status.textContent = 'Loading marker previews…';
			try {
				const added = await this.csvModel.populateMissingMarkerTextsForFile(file.path, rowProvider);
				if (added > 0) this.csvModel.notifyListenersOnly();
			} catch (err) {
				console.warn('[qualia-csv lazy] populateMissingMarkerTextsForFile failed', err);
			}

			// Top up the cache on subsequent mutations (new markers from cell/batch
			// coding). Debounced so bursts collapse to a single fetch.
			this.lazyChangeListener = () => this.scheduleLazyPopulateMissing();
			this.csvModel.onChange(this.lazyChangeListener);

			// Build markers temp table pra filter de virtual cols + export.
			// Single insertArrowTable call — spike validou ~25ms warmup + 200μs/row,
			// irrelevante pra escalas típicas. Falha do build não bloqueia a view —
			// log + null leaves the table off, filter virtual cai pra `1=0` graciosamente.
			try {
				this.qualiaMarkersTable = new QualiaMarkersTable(runtime.conn, file.path, this.csvModel);
				await this.qualiaMarkersTable.build();
				this.batchedMutationApplier = new BatchedMutationApplier(
					this.qualiaMarkersTable,
					this.csvModel,
					file.path,
					() => { this.gridApi?.purgeInfiniteCache(); },
				);
			} catch (err) {
				console.error('[qualia-markers-tmp] build failed; virtual filter will be unavailable', err);
				this.qualiaMarkersTable = null;
				this.batchedMutationApplier = null;
			}

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

			// LazyTextFilter custom em todas colunas (real + virtual): faz pre-fetch
			// da query DuckDB + chama `gridApi.refreshInfiniteCache()` (em vez do
			// `purgeInfiniteCache` que o filter padrão dispara via filterChangedCallback).
			// Resultado: rows antigas ficam visíveis durante re-fetch, sem flash branco.
			// Ver `src/csv/duckdb/lazyTextFilter.ts`.
			const lazyTextContext = this.buildLazyTextFilterContext();

			// AG Grid Infinite Row Model — datasource pages via DuckDB.
			this.gridApi = createGrid(wrapper, {
				theme: obsidianTheme,
				columnDefs: columns.map((h) => ({
					field: h,
					headerName: h,
					filter: LazyTextFilter,
					filterParams: { context: lazyTextContext },
					cellStyle: (params: { data?: Record<string, unknown>; node?: { rowIndex: number | null } }) => {
						const sourceRowId = (params.data?.sourceRowId as number | undefined) ?? params.node?.rowIndex ?? undefined;
						return this.cellStyleForCompareMode(h, sourceRowId === null ? undefined : sourceRowId);
					},
				})),
				// `filter: true` enables AG Grid's built-in filter UI per column. The
				// datasource translates `params.filterModel` into a SQL WHERE fragment
				// via `buildWhereClause` so DuckDB does the actual filtering server-side
				// (client-side filtering is not viable in Infinite Row Model — only the
				// page cache is materialized). Virtual cod-seg/cod-frow/comment columns
				// override this to `false` in `columnToggleModal` because they don't
				// exist in the DuckDB schema.
				// `debounceMs: 250` reduz jank visual em filter contra Infinite Row Model:
				// AG Grid não conhece o novo rowCount até `getRows` retornar com lastRow,
				// então durante a latência DuckDB renderiza placeholder rows pelo viewport
				// (sintoma "todas as linhas reaparecem e encolhem"). Debounce coalesce
				// keystrokes — único refresh por pausa em vez de um por char.
				defaultColDef: { sortable: true, filter: true, resizable: true, filterParams: { debounceMs: 250 } },
				rowModelType: 'infinite',
				cacheBlockSize: 100,
				maxBlocksInCache: 10,
				rowBuffer: 20,
				// Tell AG Grid the dataset size up front. Without this it starts at
				// rowCount=1 and any `ensureIndexVisible(idx)` with idx>1 throws
				// error #88 (Invalid row index) until the first successCallback
				// arrives. With totalRows known from `rowProvider.getRowCount()`,
				// reveal works immediately even if the user navigates before the
				// first page block lands.
				infiniteInitialRowCount: totalRows,
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
							const requestedCount = params.endRow - params.startRow;
							const rows = await this.lazyState.rowProvider.getRowsByDisplayRange({
								offset: params.startRow,
								limit: requestedCount,
								orderBy,
								whereClause,
							});
							// Two paths to detect "no more rows":
							//   a) DuckDB returned a short page → definitive end (mais robusto:
							//      independente de filteredCount estar atualizado, que computa
							//      async em refreshLazyFilter — a brief stale window onde
							//      filteredCount=totalRows fazia AG Grid renderizar placeholder
							//      rows fantasma após o último match).
							//   b) Hit known effectiveTotal → end por contagem (preserva comportamento
							//      sem-filter onde page cheia coincide com total).
							let lastRow: number;
							if (rows.length < requestedCount) {
								lastRow = params.startRow + rows.length;
							} else if (params.startRow + rows.length >= effectiveTotal) {
								lastRow = effectiveTotal;
							} else {
								lastRow = -1;
							}
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

			// Restaura virtual cols persistidas em data.json (mesma logica do eager).
			// Em lazy, virtual cols não vão pro DuckDB schema; comment usa
			// valueGetter/Setter via model.getCellComment / setCellComment.
			restoreEnabledVirtualColumns({
				gridApi: this.gridApi,
				model: this.csvModel,
				filePath: this.file?.path ?? '',
				csvView: this,
				app: this.app,
				originalHeaders: this.originalHeaders,
			});

			this.readyResolve?.();

			// Subscribe to visibility changes (same as eager mode).
			this.unsubscribeVisibility?.();
			this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));

			// Subscribe to active coder changes (same as eager mode).
			this.unsubscribeActiveCoder?.();
			this.unsubscribeActiveCoder = this.plugin.onActiveCoderChange(() => {
				this.gridApi?.refreshCells({ force: true });
			});

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

	// ─── ICR Compare Mode ────────────────────────────────────

	/** Ativa coloring por coder na grid. cellStyle dos columnDefs consulta este
	 *  contexto pra gerar gradient quando há row markers no escopo. */
	setCompareMode(ctx: { markerIndex: Map<string, RowMarker[]>; coderColors: Map<string, string> }): void {
		this.compareModeContext = ctx;
		if (this.gridApi) this.gridApi.refreshCells({ force: true });
	}

	clearCompareMode(): void {
		this.compareModeContext = null;
		if (this.gridApi) this.gridApi.refreshCells({ force: true });
	}

	/** cellStyle callback compartilhado entre eager + lazy createGrid setups.
	 *  Retorna null quando não há compare mode ou cell sem markers. */
	private cellStyleForCompareMode(field: string, sourceRowId: number | undefined): { background: string } | null {
		if (!this.compareModeContext) return null;
		if (sourceRowId === undefined) return null;
		const key = `${sourceRowId}::${field}`;
		const cellMarkers = this.compareModeContext.markerIndex.get(key);
		if (!cellMarkers || cellMarkers.length === 0) return null;
		const apps = cellMarkers
			.filter(m => m.codedBy !== undefined)
			.map(m => ({
				coderId: m.codedBy as string,
				codeColor: this.compareModeContext!.coderColors.get(m.codedBy as string) ?? '#888888',
			}));
		const gradient = computeRowGradient(apps);
		return gradient ? { background: gradient } : null;
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
	private buildLazyTextFilterContext(): LazyTextFilterContext {
		return {
			getProvider: () => this.lazyState?.rowProvider ?? null,
			getMarkersTable: () => this.qualiaMarkersTable,
			getOriginalHeaders: () => this.originalHeaders,
			getRegistry: () => this.csvModel.registry,
			getCurrentFilterModel: () => (this.gridApi?.getFilterModel() ?? null) as AgFilterModel | null,
			getTotalRows: () => this.lazyState?.totalRows ?? 0,
			getGridApi: () => this.gridApi,
			applyPrefetched: (whereClause, filteredCount) => {
				if (!this.lazyState) return;
				this.lazyState.currentFilter = whereClause
					? { whereClause, filteredCount }
					: undefined;
			},
			scheduleDisplayMapRebuild: () => { void this.refreshLazyDisplayMap(); },
		};
	}

	/** Implementa CsvViewRef.getLazyFilterColDef — chamado pelo columnToggleModal
	 * pra aplicar o LazyTextFilter em virtual cols quando em lazy mode. */
	getLazyFilterColDef(): { filter: unknown; filterParams: unknown } | null {
		if (!this.lazyState) return null;
		return {
			filter: LazyTextFilter,
			filterParams: { context: this.buildLazyTextFilterContext() },
		};
	}

	private async refreshLazyFilter(): Promise<void> {
		if (!this.lazyState || !this.gridApi) return;
		// Marca o wrapper como "filtering" — CSS scoped esconde placeholder rows do
		// AG Grid Infinite Row Model durante a janela entre cache purge e
		// resposta do DuckDB. Sem isso, viewport flasheia placeholder rows enquanto
		// espera. Removido no async tail.
		this.gridWrapper?.classList.add('csv-coding-filtering');
		const fullModel = this.gridApi.getFilterModel() as AgFilterModel | null;
		const { real, virtual } = splitFilterModel(fullModel, this.originalHeaders);

		const realClause = buildWhereClause(real);
		// Virtual clause requer temp table viva — se build falhou (qualiaMarkersTable null),
		// virtual filters são descartados graciosamente (filtro real continua funcionando).
		const virtualClause = this.qualiaMarkersTable
			? buildVirtualFilterClause(virtual, {
				tableName: this.qualiaMarkersTable.tableName,
				codeRegistry: this.csvModel.registry,
			})
			: null;
		const whereClause = combineClauses([realClause, virtualClause]) ?? undefined;

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
		} finally {
			// Remove flag de filtering — placeholder rows voltam a ser visíveis em
			// scroll-triggered fetches normais. Wait 1 RAF pra garantir que AG Grid
			// já pintou as novas rows antes de descobrir o display change.
			requestAnimationFrame(() => {
				this.gridWrapper?.classList.remove('csv-coding-filtering');
			});
		}
	}

	/**
	 * Schedule a populate-missing pass against the marker preview cache. Called
	 * by the model.onChange listener registered in lazy mode. Debounced 100ms so
	 * burst mutations (batch coding) collapse to a single fetch.
	 */
	private scheduleLazyPopulateMissing(): void {
		if (!this.lazyState || !this.file) return;
		if (this.populateMissingTimer != null) {
			window.clearTimeout(this.populateMissingTimer);
		}
		this.populateMissingTimer = window.setTimeout(() => {
			this.populateMissingTimer = null;
			void this.runLazyPopulateMissing();
		}, 100);
	}

	private async runLazyPopulateMissing(): Promise<void> {
		const fileId = this.file?.path;
		const provider = this.lazyState?.rowProvider;
		if (!fileId || !provider) return;
		try {
			const added = await this.csvModel.populateMissingMarkerTextsForFile(fileId, provider);
			// Re-check after await — onUnloadFile may have nulled lazyState.
			if (added > 0 && this.lazyState && this.file?.path === fileId) {
				// notifyListenersOnly: no save (cache is derived state, not persisted).
				this.csvModel.notifyListenersOnly();
			}
		} catch (err) {
			console.warn('[qualia-csv lazy] runLazyPopulateMissing failed', err);
		}
	}

	async navigateToRow(sourceRowId: number, column?: string): Promise<void> {
		if (!this.gridApi) return;
		const api = this.gridApi;

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

		// `flashDuration` is set explicitly: in some v33 minor versions the default
		// behaves as 0 (silent flash). With both timings explicit the highlight is
		// visible for ~2s total (500ms full + 1500ms fade).
		const flash = (node: IRowNode): void => {
			const flashOpts: { rowNodes: IRowNode[]; flashDuration: number; fadeDuration: number; columns?: string[] } = {
				rowNodes: [node],
				flashDuration: 500,
				fadeDuration: 1500,
			};
			if (column) flashOpts.columns = [column];
			api.flashCells(flashOpts);
		};

		// Best-effort sync path (eager mode + lazy with warm cache): scroll + flash
		// in one shot. Fall through to async polling when the rowNode is still a
		// skeleton (Infinite Row Model: page block not fetched yet) or null.
		api.ensureIndexVisible(displayIndex, 'middle');
		if (column) api.ensureColumnVisible(column);
		const immediate = api.getDisplayedRowAtIndex(displayIndex);
		if (immediate?.data != null) {
			flash(immediate);
			return;
		}
		if (!this.lazyState) return;

		// Lazy: poll every 100ms for up to 5s. Re-issuing scroll on each tick
		// handles the just-mounted-grid case where the first ensureIndexVisible
		// got swallowed by a not-yet-measured viewport. RAF deferral on the flash
		// gives AG Grid a paint cycle to attach the cell DOM after data arrival —
		// flashCells silently no-ops when fired against an unrendered cell.
		// Polling is more robust than `modelUpdated` here because in v33 some
		// scroll-settle / row-render transitions don't always emit modelUpdated.
		let attempts = 0;
		const MAX_ATTEMPTS = 50;
		const tick = (): void => {
			attempts += 1;
			if (!this.gridApi) return;
			this.gridApi.ensureIndexVisible(displayIndex, 'middle');
			if (column) this.gridApi.ensureColumnVisible(column);
			const node = this.gridApi.getDisplayedRowAtIndex(displayIndex);
			if (node?.data != null) {
				requestAnimationFrame(() => {
					if (this.gridApi) flash(node);
				});
				return;
			}
			if (attempts < MAX_ATTEMPTS) {
				window.setTimeout(tick, 100);
			}
		};
		window.setTimeout(tick, 100);
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
		this.unsubscribeActiveCoder?.();
		this.unsubscribeActiveCoder = undefined;
		this.closeSegmentEditor();
		// Tear down lazy preview cache listener + drop cached previews. Done before
		// dropping rowDataCache so getMarkersForFile() still finds markers to evict.
		if (this.lazyChangeListener) {
			this.csvModel.offChange(this.lazyChangeListener);
			this.lazyChangeListener = null;
		}
		if (this.populateMissingTimer != null) {
			window.clearTimeout(this.populateMissingTimer);
			this.populateMissingTimer = null;
		}
		if (this.file) {
			this.csvModel.clearMarkerTextCacheForFile(this.file.path);
			this.csvModel.rowDataCache.delete(this.file.path);
		}
		if (this.headerObserver) {
			this.headerObserver.disconnect();
			this.headerObserver = null;
		}

		// Snapshot the file path before async teardown — `this.file` may be nulled
		// by Obsidian's leaf machinery while we're still awaiting cleanup.
		const filePathSnapshot = this.file?.path;

		// Snapshot + null `lazyState` BEFORE the async teardown. If anything during
		// `gridApi.destroy()` (or another concurrent path like `refreshLazyFilter`)
		// re-enters and reads `this.lazyState`, it sees null and skips work — avoids
		// double-dispose / double-dropDisplayMap on the same provider.
		const lazyState = this.lazyState;
		this.lazyState = null;
		if (lazyState && filePathSnapshot) this.csvModel.unregisterLazyProvider(filePathSnapshot);

		// Dispose mutation applier ANTES da temp table — pra interromper enqueue durante
		// drop. Applier dispose é sync (cancela RAF + offMarkerMutation); table dispose
		// é async (aguarda DROP TABLE).
		this.batchedMutationApplier?.dispose();
		this.batchedMutationApplier = null;
		if (this.qualiaMarkersTable) {
			try { await this.qualiaMarkersTable.dispose(); } catch (e) { console.warn('[qualia-markers-tmp] dispose failed', e); }
			this.qualiaMarkersTable = null;
		}

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

		// OPFS cleanup: when the user closes a lazy file, drop its OPFS copy so
		// disk usage doesn't silently grow. Re-open will copy again — the user
		// already pays the open-time wait, so the trade-off is "predictable disk
		// vs invisible cache". Skip when another leaf still has the same file
		// open (refcount via workspace iteration).
		if (lazyState && filePathSnapshot) {
			const stillOpen = this.app.workspace
				.getLeavesOfType(CSV_CODING_VIEW_TYPE)
				.some(l => l !== this.leaf && (l.view as CsvCodingView).file?.path === filePathSnapshot);
			if (!stillOpen) {
				const vaultId = this.app.vault.getName();
				const opfsKey = opfsKeyFor(vaultId, filePathSnapshot);
				try { await removeOPFSFile(opfsKey); } catch (e) { console.warn('[qualia-csv lazy] OPFS cleanup failed', e); }
			}
		}
		this.contentEl.empty();
	}
}
