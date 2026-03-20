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

		// Navigation is handled via navigateToRow() called directly from csv/index.ts

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

	navigateToRow(row: number) {
		if (!this.gridApi) return;
		this.gridApi.ensureIndexVisible(row, 'middle');
		const rowNode = this.gridApi.getDisplayedRowAtIndex(row);
		if (rowNode) {
			this.gridApi.flashCells({ rowNodes: [rowNode], fadeDuration: 1500 });
		}
	}

	// ─── Segment Editor delegates ────────────────────────────

	openSegmentEditor(file: string, row: number, column: string, cellText: string) {
		this.segmentEditor.open(file, row, column, cellText);
	}

	closeSegmentEditor() {
		this.segmentEditor.close();
	}

	refreshSegmentEditor() {
		this.segmentEditor.refresh();
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
