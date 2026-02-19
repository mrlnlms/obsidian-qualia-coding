import { FileView, Modal, Setting, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz } from "ag-grid-community";
import * as Papa from "papaparse";
import { codingCellRenderer, sourceTagBtnRenderer } from "./grid/codingCellRenderer";
import type CsvCodingPlugin from "./main";

ModuleRegistry.registerModules([AllCommunityModule]);

export const CSV_CODING_VIEW_TYPE = "codemarker-csv";

// ── AG Grid theme mapped to Obsidian CSS vars ──
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

// ── Column styles ──
const COD_SEG_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--interactive-accent) 8%, transparent)",
  fontStyle: "italic",
  fontSize: "calc(var(--ag-font-size, 14px) + 1px)",
};
const COD_FROW_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--text-muted) 3%, transparent)",
};

// ── Multiline cell editor for comment columns ──
class CommentCellEditor {
  private textarea!: HTMLTextAreaElement;
  private params: any;

  init(params: any) {
    this.params = params;
    this.textarea = document.createElement("textarea");
    this.textarea.className = "csv-comment-editor";
    this.textarea.value = params.value ?? "";
    this.textarea.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.stopPropagation();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const val = this.textarea.value;
        this.textarea.value = val.substring(0, start) + "\n" + val.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 1;
      }
    });
  }

  getGui() { return this.textarea; }
  afterGuiAttached() { this.textarea.focus(); }
  getValue() { return this.textarea.value; }
  isPopup() { return false; }
}

// ── Main FileView ──
export class CsvCodingView extends FileView {
  private plugin: CsvCodingPlugin;
  private gridApi: GridApi | null = null;
  private originalHeaders: string[] = [];
  private headerObserver: MutationObserver | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CsvCodingPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return CSV_CODING_VIEW_TYPE; }
  getDisplayText(): string { return this.file?.name ?? "CodeMarker CSV"; }
  getIcon(): string { return "table"; }
  canAcceptExtension(extension: string): boolean { return extension === "csv"; }

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

    const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve) => {
      Papa.parse<Record<string, string>>(raw, {
        header: true,
        skipEmptyLines: true,
        worker: true,
        complete: resolve,
      });
    });

    if (this.file !== file) return;
    contentEl.empty();

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      contentEl.createEl("p", { text: `Error parsing CSV: ${parsed.errors[0].message}` });
      return;
    }

    const headers = parsed.meta.fields;
    if (!headers || headers.length === 0) {
      contentEl.createEl("p", { text: "No columns found in CSV file." });
      return;
    }

    // Info bar
    const infoBar = contentEl.createEl("div");
    infoBar.style.display = "flex";
    infoBar.style.alignItems = "center";
    infoBar.style.justifyContent = "flex-end";
    infoBar.style.gap = "6px";
    infoBar.style.padding = "4px 12px";
    infoBar.style.fontSize = "12px";
    infoBar.style.color = "var(--text-muted)";
    infoBar.style.borderBottom = "none";

    infoBar.createEl("span", { text: `${parsed.data.length.toLocaleString()} rows × ${headers.length} columns` });

    const gearBtn = infoBar.createEl("span");
    gearBtn.style.cursor = "pointer";
    gearBtn.style.color = "var(--text-muted)";
    gearBtn.style.display = "flex";
    setIcon(gearBtn, "settings");
    const svg = gearBtn.querySelector("svg");
    if (svg) { svg.style.width = "16px"; svg.style.height = "16px"; }
    gearBtn.addEventListener("click", () => {
      if (this.gridApi) {
        new ColumnToggleModal(this.app, this.gridApi, this.originalHeaders, this.plugin, this.file?.path ?? "").open();
      }
    });

    this.originalHeaders = headers;

    // Grid wrapper
    const wrapper = contentEl.createEl("div");
    wrapper.style.height = "calc(100% - 40px)";
    wrapper.style.width = "100%";

    // Populate rowDataCache for sidebar views
    this.plugin.csvModel.rowDataCache.set(file.path, parsed.data);

    this.gridApi = createGrid(wrapper, {
      theme: obsidianTheme,
      columnDefs: headers.map((h: string) => ({ field: h, headerName: h })),
      defaultColDef: { sortable: true, filter: true, resizable: true },
      rowData: parsed.data,
      enableCellTextSelection: true,
      domLayout: "normal",
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
      (this.app.workspace as any).on('codemarker-csv:navigate', navHandler)
    );

    // Inject custom header buttons via MutationObserver
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
      const colId = cell.getAttribute("col-id");
      if (!colId) continue;
      const isCodSeg = colId.endsWith("_cod-seg");
      const isCodFrow = colId.endsWith("_cod-frow");
      const isComment = colId.endsWith("_comment");
      if (!isCodSeg && !isCodFrow && !isComment) continue;

      const labelContainer = cell.querySelector(".ag-cell-label-container");
      if (!labelContainer) continue;
      const labelDiv = labelContainer.querySelector(".ag-header-cell-label");

      // Main action button (info / tag)
      if (!cell.querySelector(".csv-header-btn")) {
        if (isCodSeg || isCodFrow) {
          const btn = this.createHeaderIcon(isCodSeg ? "info" : "tag", isCodSeg ? "2.5" : "3");
          btn.className = "csv-header-btn ag-header-icon " + btn.className;

          if (isCodSeg) {
            let tooltip: HTMLElement | null = null;
            btn.addEventListener("mouseenter", () => {
              tooltip = document.createElement("div");
              tooltip.className = "csv-header-tooltip";
              tooltip.textContent = "This column shows codes applied to text segments. Use the coding panel to add segment codes.";
              document.body.appendChild(tooltip);
              const rect = btn.getBoundingClientRect();
              tooltip.style.left = `${rect.left + rect.width / 2}px`;
              tooltip.style.top = `${rect.bottom + 6}px`;
            });
            btn.addEventListener("mouseleave", () => {
              if (tooltip) { tooltip.remove(); tooltip = null; }
            });
            btn.addEventListener("click", (e) => e.stopPropagation());
          } else {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              // TODO: Phase 3 — open full-row coding popover
            });
          }

          labelContainer.insertBefore(btn, labelDiv);
        }
      }

      // Wrap toggle button — only for comment columns
      if (isComment && !cell.querySelector(".csv-header-wrap-btn")) {
        const wrapBtn = this.createHeaderIcon("wrap-text", "2.5");
        wrapBtn.className = "csv-header-wrap-btn ag-header-icon " + wrapBtn.className;

        const col = this.gridApi?.getColumn(colId);
        const colDef = col ? (col.getColDef() as any) : null;
        const isWrapped = colDef?.wrapText ?? true;
        wrapBtn.style.opacity = isWrapped ? "0.8" : "0.3";

        wrapBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!this.gridApi) return;
          const colDefs = this.gridApi.getColumnDefs();
          if (!colDefs) return;
          const def = colDefs.find((c: any) => c.field === colId) as any;
          if (!def) return;
          const nowWrapped = def.wrapText ?? true;
          def.wrapText = !nowWrapped;
          def.autoHeight = !nowWrapped;
          def.cellClass = !nowWrapped ? "csv-comment-cell" : "csv-comment-cell-nowrap";
          this.gridApi.setGridOption("columnDefs", colDefs);
        });

        labelContainer.insertBefore(wrapBtn, labelDiv);
      }
    }
  }

  private createHeaderIcon(icon: string, strokeWidth: string): HTMLElement {
    const btn = document.createElement("span");
    btn.style.cursor = "pointer";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.opacity = "0.5";
    btn.style.marginRight = "4px";
    btn.style.padding = "6px";
    btn.style.borderRadius = "4px";
    btn.style.transition = "background-color 0.2s, opacity 0.2s";
    btn.style.position = "relative";
    setIcon(btn, icon);
    const svg = btn.querySelector("svg");
    if (svg) { svg.style.width = "14px"; svg.style.height = "14px"; svg.style.strokeWidth = strokeWidth; svg.style.color = "var(--text-normal)"; }
    btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; btn.style.backgroundColor = "var(--ag-row-hover-color, rgba(0,0,0,0.08))"; });
    btn.addEventListener("mouseleave", () => {
      const colWrapped = btn.dataset.wrapped;
      btn.style.opacity = colWrapped === "false" ? "0.3" : "0.5";
      btn.style.backgroundColor = "transparent";
    });
    return btn;
  }

  async onUnloadFile(): Promise<void> {
    // Clear rowDataCache for this file
    if (this.file) {
      this.plugin.csvModel.rowDataCache.delete(this.file.path);
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

// ── Column Toggle Modal ──
class ColumnToggleModal extends Modal {
  private gridApi: GridApi;
  private originalHeaders: string[];
  private model: import("./coding/codingModel").CodingModel;
  private filePath: string;
  private plugin: CsvCodingPlugin;

  constructor(app: import("obsidian").App, gridApi: GridApi, originalHeaders: string[], plugin: CsvCodingPlugin, filePath: string) {
    super(app);
    this.gridApi = gridApi;
    this.originalHeaders = originalHeaders;
    this.model = plugin.csvModel;
    this.filePath = filePath;
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("csv-col-modal");
    this.setTitle("Column settings");

    const headerRow = contentEl.createEl("div", { cls: "csv-col-row csv-col-header" });
    headerRow.createEl("span", { cls: "csv-col-name", text: "Column" });
    headerRow.createEl("span", { cls: "csv-col-toggle-label", text: "Visible" });
    headerRow.createEl("span", { cls: "csv-col-toggle-label", text: "Cod. Segments" });
    headerRow.createEl("span", { cls: "csv-col-toggle-label", text: "Cod. Full Row" });
    headerRow.createEl("span", { cls: "csv-col-toggle-label", text: "Comment" });

    const existingCols = new Set(
      (this.gridApi.getColumns() ?? []).map(c => c.getColId())
    );

    for (const header of this.originalHeaders) {
      const segField = `${header}_cod-seg`;
      const frowField = `${header}_cod-frow`;
      const commentField = `${header}_comment`;

      const row = contentEl.createEl("div", { cls: "csv-col-row" });
      row.createEl("span", { cls: "csv-col-name", text: header });

      // Visible toggle
      const visCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
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
          this.toggleCodingColumn(commentField, header, "comment", false);
        }
      };

      // Coding Segments toggle
      const segCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
      new Setting(segCell).addToggle((t) =>
        t.setValue(existingCols.has(segField)).onChange((v) => {
          this.toggleCodingColumn(segField, header, "cod-seg", v);
          updateCommentState();
        })
      );

      // Coding Full Row toggle
      const frowCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
      new Setting(frowCell).addToggle((t) =>
        t.setValue(existingCols.has(frowField)).onChange((v) => {
          this.toggleCodingColumn(frowField, header, "cod-frow", v);
          updateCommentState();
        })
      );

      // Comment toggle
      const commentCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
      const hasAnyCoding = existingCols.has(segField) || existingCols.has(frowField);
      new Setting(commentCell).addToggle((t) => {
        commentToggle = t;
        t.setValue(existingCols.has(commentField))
          .setDisabled(!hasAnyCoding)
          .onChange((v) => {
            this.toggleCodingColumn(commentField, header, "comment", v);
          });
      });
    }
  }

  private toggleCodingColumn(field: string, sourceHeader: string, suffix: string, add: boolean) {
    const colDefs = this.gridApi.getColumnDefs();
    if (!colDefs) return;
    const isCodSeg = suffix === "cod-seg";
    const isFrow = suffix === "cod-frow";
    const isComment = suffix === "comment";

    if (add) {
      const srcIdx = colDefs.findIndex((c: any) => c.field === sourceHeader);
      let insertIdx = srcIdx + 1;

      if (isFrow || isComment) {
        while (insertIdx < colDefs.length) {
          const f: string = (colDefs[insertIdx] as any).field ?? "";
          if (f.startsWith(sourceHeader + "_cod-")) { insertIdx++; } else { break; }
        }
      }
      if (isComment) {
        while (insertIdx < colDefs.length) {
          const f: string = (colDefs[insertIdx] as any).field ?? "";
          if (f === sourceHeader + "_comment") { insertIdx++; } else { break; }
        }
      }

      if (isComment) {
        const newCol: any = {
          field,
          headerName: `${sourceHeader}_comment`,
          editable: true,
          cellEditor: CommentCellEditor,
          cellStyle: COD_FROW_STYLE,
          headerClass: "csv-coding-header-comment",
          cellClass: "csv-comment-cell",
          sortable: true,
          filter: true,
          resizable: true,
          autoHeight: true,
          wrapText: true,
        };
        colDefs.splice(insertIdx, 0, newCol);
      } else {
        const newCol: any = {
          field,
          headerName: `${sourceHeader}_${suffix}`,
          editable: false,
          cellStyle: isFrow ? COD_FROW_STYLE : COD_SEG_STYLE,
          headerClass: isFrow ? "csv-coding-header-frow" : "csv-coding-header-seg",
          sortable: true,
          filter: true,
          resizable: true,
          cellRenderer: codingCellRenderer,
          cellRendererParams: { model: this.model, gridApi: this.gridApi, file: this.filePath, plugin: this.plugin },
          autoHeight: true,
          wrapText: true,
        };
        colDefs.splice(insertIdx, 0, newCol);
      }

      if (isCodSeg) {
        const srcDef = colDefs[srcIdx] as any;
        if (srcDef) {
          srcDef.cellRenderer = sourceTagBtnRenderer;
          srcDef.cellRendererParams = { codSegField: field, model: this.model, gridApi: this.gridApi, file: this.filePath, plugin: this.plugin };
        }
      }
    } else {
      const idx = colDefs.findIndex((c: any) => c.field === field);
      if (idx >= 0) colDefs.splice(idx, 1);

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
