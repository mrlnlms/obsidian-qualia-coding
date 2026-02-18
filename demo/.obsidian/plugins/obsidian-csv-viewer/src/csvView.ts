import { App, FileView, Modal, Setting, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz } from "ag-grid-community";
import * as Papa from "papaparse";

ModuleRegistry.registerModules([AllCommunityModule]);

export const CSV_VIEW_TYPE = "csv-viewer";

// ── Test tag pool ────────────────────────────────────────────
const TEST_TAGS = [
  { name: "Red tag", bg: "#fdddd5", color: "#9a3412" },
  { name: "Yellow tag", bg: "#fef3c7", color: "#92400e" },
  { name: "Green tag", bg: "#d1fae5", color: "#065f46" },
  { name: "Blue tag", bg: "#dbeafe", color: "#1e40af" },
  { name: "Purple tag", bg: "#e9d5ff", color: "#6b21a8" },
];

// State: tags per cell (module-level, non-persistent — test only)
const cellTags = new Map<string, Set<string>>();

function cellKey(rowIndex: number, field: string): string {
  return `${rowIndex}:${field}`;
}

function addNextTag(rowIndex: number, field: string): void {
  const key = cellKey(rowIndex, field);
  if (!cellTags.has(key)) cellTags.set(key, new Set());
  const tags = cellTags.get(key)!;
  const next = TEST_TAGS.find(t => !tags.has(t.name));
  if (next) tags.add(next.name);
}

function removeTag(rowIndex: number, field: string, tagName: string): void {
  const key = cellKey(rowIndex, field);
  const tags = cellTags.get(key);
  if (tags) {
    tags.delete(tagName);
    if (tags.size === 0) cellTags.delete(key);
  }
}

function getTagsForCell(rowIndex: number, field: string): string[] {
  const tags = cellTags.get(cellKey(rowIndex, field));
  return tags ? Array.from(tags) : [];
}

function getTagDef(name: string) {
  return TEST_TAGS.find(t => t.name === name);
}

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
      if (!colId || !colId.endsWith("_cod-frow")) continue;

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
        if (!this.gridApi) return;
        const rowCount = this.gridApi.getDisplayedRowCount();
        for (let i = 0; i < rowCount; i++) {
          addNextTag(i, colId);
        }
        this.gridApi.refreshCells({ force: true });
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

/** Renderer for source column when cod-seg is active: text + tag button (right-aligned) */
function sourceTagBtnRenderer(params: any) {
  const wrapper = document.createElement("div");
  wrapper.className = "csv-cod-seg-cell";

  const text = document.createElement("span");
  text.className = "csv-cod-seg-text";
  text.style.flex = "1";
  text.textContent = params.value ?? "";

  const btn = document.createElement("span");
  btn.className = "csv-cod-seg-btn";
  setIcon(btn, "tag");
  const svg = btn.querySelector("svg");
  if (svg) { svg.style.width = "14px"; svg.style.height = "14px"; svg.style.strokeWidth = "3"; svg.style.color = "var(--text-normal)"; }

  const segField: string = params.codSegField;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    addNextTag(params.rowIndex, segField);
    params.api.refreshCells({ force: true });
  });

  wrapper.appendChild(text);
  wrapper.appendChild(btn);
  return wrapper;
}

// Subtle background for coding columns
const COD_SEG_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--interactive-accent) 8%, transparent)",
};
const COD_FROW_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--text-accent) 8%, transparent)",
};

function codCellRenderer(params: any) {
  const wrapper = document.createElement("div");
  wrapper.className = "csv-cod-seg-cell";

  const text = document.createElement("span");
  text.className = "csv-cod-seg-text";
  text.textContent = params.value ?? "";

  // Tag chips area
  const field: string = params.colDef.field;
  const rowIndex: number = params.rowIndex;
  const tagsArea = document.createElement("span");
  tagsArea.className = "csv-tag-area";

  const tags = getTagsForCell(rowIndex, field);
  for (const tagName of tags) {
    const def = getTagDef(tagName);
    if (!def) continue;

    const chip = document.createElement("span");
    chip.className = "csv-tag-chip";
    chip.style.backgroundColor = def.bg;
    chip.style.color = def.color;
    chip.textContent = def.name;

    const x = document.createElement("span");
    x.className = "csv-tag-chip-x";
    x.textContent = "×";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      removeTag(rowIndex, field, tagName);
      params.api.refreshCells({ force: true });
    });
    chip.appendChild(x);
    tagsArea.appendChild(chip);
  }

  const btn = document.createElement("span");
  btn.className = "csv-cod-seg-btn";
  setIcon(btn, "tag");
  const svg = btn.querySelector("svg");
  if (svg) { svg.style.width = "14px"; svg.style.height = "14px"; svg.style.strokeWidth = "3"; svg.style.color = "var(--text-normal)"; }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    addNextTag(rowIndex, field);
    params.api.refreshCells({ force: true });
  });

  wrapper.appendChild(text);
  wrapper.appendChild(tagsArea);
  wrapper.appendChild(btn);
  return wrapper;
}

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
    const isCodSeg = suffix === "cod-seg";

    if (add) {
      // Find position: right after the source column
      const idx = colDefs.findIndex((c: any) => c.field === sourceHeader);
      const isFrow = suffix === "cod-frow";
      const newCol: any = {
        field,
        headerName: `${sourceHeader}_${suffix}`,
        editable: true,
        cellStyle: isFrow ? COD_FROW_STYLE : COD_SEG_STYLE,
        headerClass: isFrow ? "csv-coding-header-frow" : "csv-coding-header-seg",
        sortable: true,
        filter: true,
        resizable: true,
        cellRenderer: codCellRenderer,
        cellRendererParams: { app: this.app },
        autoHeight: true,
        wrapText: true,
      };
      colDefs.splice(idx + 1, 0, newCol);

      // Add tag button to source column
      if (isCodSeg) {
        const srcDef = colDefs[idx] as any;
        if (srcDef) {
          srcDef.cellRenderer = sourceTagBtnRenderer;
          srcDef.cellRendererParams = { codSegField: field };
        }
      }
    } else {
      const idx = colDefs.findIndex((c: any) => c.field === field);
      if (idx >= 0) colDefs.splice(idx, 1);

      // Remove tag button from source column
      if (isCodSeg) {
        const srcDef = colDefs.find((c: any) => c.field === sourceHeader) as any;
        if (srcDef) {
          delete srcDef.cellRenderer;
          delete srcDef.cellRendererParams;
        }
      }
    }

    this.gridApi.setGridOption("columnDefs", colDefs);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Tag Modals ──────────────────────────────────────────────

class CodFrowHeaderModal extends Modal {
  private sourceCol: string;

  constructor(app: App, sourceCol: string) {
    super(app);
    this.sourceCol = sourceCol;
  }

  onOpen() {
    const { contentEl } = this;
    this.setTitle(`Tag Full Row — ${this.sourceCol}`);
    contentEl.createEl("p", { text: `Column: ${this.sourceCol}` });
    contentEl.createEl("p", { text: "Apply a code to all rows via this column header.", cls: "setting-item-description" });
  }

  onClose() { this.contentEl.empty(); }
}

class CodSegCellModal extends Modal {
  private sourceCol: string;
  private rowIndex: number;
  private sourceValue: string;

  constructor(app: App, sourceCol: string, rowIndex: number, sourceValue: string) {
    super(app);
    this.sourceCol = sourceCol;
    this.rowIndex = rowIndex;
    this.sourceValue = sourceValue;
  }

  onOpen() {
    const { contentEl } = this;
    this.setTitle(`Tag Segment — Row ${this.rowIndex}`);
    contentEl.createEl("p", { text: `Column: ${this.sourceCol}` });
    contentEl.createEl("p", { text: `Text: "${this.sourceValue}"`, cls: "setting-item-description" });
  }

  onClose() { this.contentEl.empty(); }
}

class CodFrowCellModal extends Modal {
  private sourceCol: string;
  private rowIndex: number;
  private rowData: Record<string, string>;

  constructor(app: App, sourceCol: string, rowIndex: number, rowData: Record<string, string>) {
    super(app);
    this.sourceCol = sourceCol;
    this.rowIndex = rowIndex;
    this.rowData = rowData;
  }

  onOpen() {
    const { contentEl } = this;
    this.setTitle(`Tag Full Row — Row ${this.rowIndex}`);
    contentEl.createEl("p", { text: `Column: ${this.sourceCol}` });
    const list = contentEl.createEl("ul");
    for (const [key, val] of Object.entries(this.rowData)) {
      if (key.includes("_cod-")) continue; // skip coding columns
      list.createEl("li", { text: `${key}: ${val}` });
    }
  }

  onClose() { this.contentEl.empty(); }
}
