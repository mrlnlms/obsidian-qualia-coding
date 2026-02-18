import { FileView, Modal, Setting, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz } from "ag-grid-community";
import * as Papa from "papaparse";

ModuleRegistry.registerModules([AllCommunityModule]);

export const CSV_VIEW_TYPE = "csv-viewer";

const obsidianTheme = themeQuartz.withParams({
  backgroundColor: "var(--background-primary)",
  foregroundColor: "var(--text-normal)",
  headerBackgroundColor: "var(--background-secondary)",
  headerTextColor: "var(--text-normal)",
  borderColor: "var(--background-modifier-border)",
  rowHoverColor: "var(--background-modifier-hover)",
  selectedRowBackgroundColor: "var(--background-modifier-hover)",
  accentColor: "var(--interactive-accent)",
  oddRowBackgroundColor: "var(--background-primary)",
  fontFamily: "var(--font-text)",
  fontSize: 14,
});

export class CsvView extends FileView {
  private gridApi: GridApi | null = null;
  private originalHeaders: string[] = [];
  private headerObserver: MutationObserver | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return CSV_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.name ?? "CSV Viewer";
  }

  getIcon(): string {
    return "table";
  }

  canAcceptExtension(extension: string): boolean {
    return extension === "csv";
  }

  async onLoadFile(file: TFile): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    // Loading indicator
    const loading = contentEl.createEl("p");
    loading.textContent = "Loading CSV...";
    loading.style.margin = "8px 12px";
    loading.style.fontSize = "12px";
    loading.style.color = "var(--text-muted)";

    const raw = await this.app.vault.read(file);

    // Parse in background thread to avoid UI freeze on large files
    const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve) => {
      Papa.parse<Record<string, string>>(raw, {
        header: true,
        skipEmptyLines: true,
        worker: true,
        complete: resolve,
      });
    });

    // Check if file changed while parsing
    if (this.file !== file) return;

    contentEl.empty();

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      const err = contentEl.createEl("p");
      err.textContent = `Error parsing CSV: ${parsed.errors[0].message}`;
      return;
    }

    const headers = parsed.meta.fields;
    if (!headers || headers.length === 0) {
      const err = contentEl.createEl("p");
      err.textContent = "No columns found in CSV file.";
      return;
    }

    // Info bar — right-aligned
    const infoBar = contentEl.createEl("div");
    infoBar.style.display = "flex";
    infoBar.style.alignItems = "center";
    infoBar.style.justifyContent = "flex-end";
    infoBar.style.gap = "6px";
    infoBar.style.padding = "4px 12px";
    infoBar.style.fontSize = "12px";
    infoBar.style.color = "var(--text-muted)";
    infoBar.style.borderBottom = "none";

    const infoText = infoBar.createEl("span");
    infoText.textContent = `${parsed.data.length.toLocaleString()} rows × ${headers.length} columns`;

    const gearBtn = infoBar.createEl("span");
    gearBtn.style.cursor = "pointer";
    gearBtn.style.color = "var(--text-muted)";
    gearBtn.style.display = "flex";
    setIcon(gearBtn, "settings");
    // Make icon slightly larger than text
    const svg = gearBtn.querySelector("svg");
    if (svg) { svg.style.width = "16px"; svg.style.height = "16px"; }
    gearBtn.addEventListener("click", () => {
      if (this.gridApi) {
        new ColumnToggleModal(this.app, this.gridApi, this.originalHeaders).open();
      }
    });

    this.originalHeaders = headers;

    // Grid wrapper
    const wrapper = contentEl.createEl("div");
    wrapper.style.height = "calc(100% - 40px)";
    wrapper.style.width = "100%";

    this.gridApi = createGrid(wrapper, {
      theme: obsidianTheme,
      columnDefs: headers.map((h: string) => ({ field: h, headerName: h })),
      defaultColDef: { sortable: true, filter: true, resizable: true },
      rowData: parsed.data,
      enableCellTextSelection: true,
      domLayout: "normal",
    });

    // Inject custom header buttons — MutationObserver catches all DOM rebuilds
    // (scroll, column show/hide, sort, resize, etc.)
    const headerRoot = wrapper.querySelector(".ag-header");
    if (headerRoot) {
      const inject = () => this.injectHeaderButtons(wrapper);
      inject();
      this.headerObserver = new MutationObserver(inject);
      this.headerObserver.observe(headerRoot, { childList: true, subtree: true });
    }
  }

  private injectHeaderButtons(wrapper: HTMLElement) {
    const headerCells = wrapper.querySelectorAll<HTMLElement>(".ag-header-cell");
    for (const cell of Array.from(headerCells)) {
      // Skip if already injected
      if (cell.querySelector(".csv-header-btn")) continue;

      const colId = cell.getAttribute("col-id");
      if (!colId) continue;

      // Insert custom button into the label container (before filter, which has higher CSS order)
      const labelContainer = cell.querySelector(".ag-cell-label-container");
      if (!labelContainer) continue;

      const labelDiv = labelContainer.querySelector(".ag-header-cell-label");

      const btn = document.createElement("span");
      btn.className = "csv-header-btn ag-header-icon";
      btn.style.cursor = "pointer";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.opacity = "0.5";
      btn.style.marginRight = "10px";
      btn.style.padding = "6px";
      btn.style.borderRadius = "4px";
      btn.style.transition = "background-color 0.2s, opacity 0.2s";
      setIcon(btn, "tag");
      const svg = btn.querySelector("svg");
      if (svg) { svg.style.width = "14px"; svg.style.height = "14px"; svg.style.strokeWidth = "3"; svg.style.color = "var(--text-normal)"; }

      btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; btn.style.backgroundColor = "var(--ag-row-hover-color, rgba(0,0,0,0.08))"; });
      btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.5"; btn.style.backgroundColor = "transparent"; });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        console.log("Header button clicked:", colId); // TBD: wire action
      });

      // Insert before labelDiv in DOM → visually between label and filter (row-reverse)
      labelContainer.insertBefore(btn, labelDiv);
    }
  }

  async onUnloadFile(): Promise<void> {
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

// Subtle background for coding columns
const CODING_COL_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--interactive-accent) 8%, transparent)",
};

class ColumnToggleModal extends Modal {
  private gridApi: GridApi;
  private originalHeaders: string[];

  constructor(app: import("obsidian").App, gridApi: GridApi, originalHeaders: string[]) {
    super(app);
    this.gridApi = gridApi;
    this.originalHeaders = originalHeaders;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("csv-col-modal");
    this.setTitle("Column settings");

    // Header row
    const headerRow = contentEl.createEl("div", { cls: "csv-col-row csv-col-header" });
    headerRow.createEl("span", { cls: "csv-col-name", text: "Column" });
    headerRow.createEl("span", { cls: "csv-col-toggle-label", text: "Visible" });
    headerRow.createEl("span", { cls: "csv-col-toggle-label", text: "Cod. Segments" });
    headerRow.createEl("span", { cls: "csv-col-toggle-label", text: "Cod. Full Row" });

    // Track which coding columns exist
    const existingCols = new Set(
      (this.gridApi.getColumns() ?? []).map(c => c.getColId())
    );

    for (const header of this.originalHeaders) {
      const segField = `${header}_cod-seg`;
      const frowField = `${header}_cod-frow`;

      const row = contentEl.createEl("div", { cls: "csv-col-row" });

      // Column name
      row.createEl("span", { cls: "csv-col-name", text: header });

      // Visible toggle
      const visCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
      const col = this.gridApi.getColumn(header);
      new Setting(visCell).addToggle((t) =>
        t.setValue(col ? col.isVisible() : false).onChange((v) => {
          this.gridApi.setColumnsVisible([header], v);
        })
      );

      // Coding Segments toggle
      const segCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
      new Setting(segCell).addToggle((t) =>
        t.setValue(existingCols.has(segField)).onChange((v) => {
          this.toggleCodingColumn(segField, header, "cod-seg", v);
        })
      );

      // Coding Full Row toggle
      const frowCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
      new Setting(frowCell).addToggle((t) =>
        t.setValue(existingCols.has(frowField)).onChange((v) => {
          this.toggleCodingColumn(frowField, header, "cod-frow", v);
        })
      );
    }
  }

  private toggleCodingColumn(field: string, sourceHeader: string, suffix: string, add: boolean) {
    const colDefs = this.gridApi.getColumnDefs();
    if (!colDefs) return;

    if (add) {
      // Find position: right after the source column
      const idx = colDefs.findIndex((c: any) => c.field === sourceHeader);
      const newCol = {
        field,
        headerName: `${sourceHeader}_${suffix}`,
        editable: true,
        cellStyle: CODING_COL_STYLE,
        headerClass: "csv-coding-header",
        sortable: true,
        filter: true,
        resizable: true,
      };
      colDefs.splice(idx + 1, 0, newCol);
    } else {
      const idx = colDefs.findIndex((c: any) => c.field === field);
      if (idx >= 0) colDefs.splice(idx, 1);
    }

    this.gridApi.setGridOption("columnDefs", colDefs);
  }

  onClose() {
    this.contentEl.empty();
  }
}
