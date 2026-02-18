import { App, FileView, Modal, Setting, TFile, WorkspaceLeaf, setIcon, SuggestModal } from "obsidian";
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz } from "ag-grid-community";
import * as Papa from "papaparse";
import type CsvViewerPlugin from "./main";
import { CodingModel } from "./coding/codingModel";
import { CsvCodeFormModal } from "./coding/codeFormModal";

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
  public gridApi: GridApi | null = null;
  private originalHeaders: string[] = [];
  private headerObserver: MutationObserver | null = null;
  plugin: CsvViewerPlugin;
  private navHandler: ((evt: any) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CsvViewerPlugin) {
    super(leaf);
    this.plugin = plugin;
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

    const infoText = infoBar.createEl("span");
    infoText.textContent = `${parsed.data.length.toLocaleString()} rows × ${headers.length} columns`;

    const gearBtn = infoBar.createEl("span");
    gearBtn.style.cursor = "pointer";
    gearBtn.style.color = "var(--text-muted)";
    gearBtn.style.display = "flex";
    setIcon(gearBtn, "settings");
    const svg = gearBtn.querySelector("svg");
    if (svg) { svg.style.width = "16px"; svg.style.height = "16px"; }
    gearBtn.addEventListener("click", () => {
      if (this.gridApi) {
        new ColumnToggleModal(this.app, this.gridApi, this.originalHeaders, this.plugin, this.file!.path).open();
      }
    });

    this.originalHeaders = headers;

    // Feed row data cache for side panel text lookup
    this.plugin.model.setRowData(file.path, parsed.data);

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
      onCellClicked: (event: any) => {
        console.log('[DIAG-3] onCellClicked fired', event.colDef?.field, event.event?.target?.className);
        const target = event.event?.target as HTMLElement | undefined;
        if (!target) return;
        const actionEl = target.closest('[data-action]') as HTMLElement | null;
        if (!actionEl) return;

        const action = actionEl.getAttribute('data-action');
        const markerId = actionEl.getAttribute('data-marker-id');
        const codeName = actionEl.getAttribute('data-code-name');
        if (!markerId || !codeName) return;

        if (action === 'open-detail') {
          this.plugin.revealCodeDetailPanel(markerId, codeName);
        } else if (action === 'remove-code') {
          this.plugin.model.removeCodeFromMarker(markerId, codeName);
          this.gridApi?.refreshCells({ force: true });
        }
      },
    });

    // Inject custom header buttons
    const headerRoot = wrapper.querySelector(".ag-header");
    if (headerRoot) {
      const inject = () => this.injectHeaderButtons(wrapper);
      inject();
      this.headerObserver = new MutationObserver(inject);
      this.headerObserver.observe(headerRoot, { childList: true, subtree: true });
    }

    // Listen for navigation events from side panels
    this.navHandler = (evt: any) => {
      if (!this.gridApi || !this.file) return;
      if (evt.file !== this.file.path) return;
      this.gridApi.ensureIndexVisible(evt.row, 'middle');
      const rowNode = this.gridApi.getDisplayedRowAtIndex(evt.row);
      if (rowNode) {
        this.gridApi.flashCells({ rowNodes: [rowNode], flashDuration: 1500 });
      }
    };
    this.app.workspace.on('codemarker-csv:navigate' as any, this.navHandler);
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

      if (!cell.querySelector(".csv-header-btn")) {
        if (isCodSeg || isCodFrow) {
          const btn = this.createHeaderIcon(isCodSeg ? "info" : "tag", isCodSeg ? "2.5" : "3");
          btn.className = "csv-header-btn ag-header-icon " + btn.className;

          if (isCodSeg) {
            let tooltip: HTMLElement | null = null;
            btn.addEventListener("mouseenter", () => {
              tooltip = document.createElement("div");
              tooltip.className = "csv-header-tooltip";
              tooltip.textContent = "Esta coluna exibe os códigos aplicados aos segmentos da coluna de origem. Para adicionar códigos, clique no ícone 🏷 na célula da coluna de origem. Para remover, clique no × do código aqui.";
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
            // cod-frow header: open code picker to add code to all visible rows
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (!this.gridApi || !this.file) return;
              const filePath = this.file.path;
              new CodePickerModal(this.app, this.plugin.model, (codeName) => {
                if (!this.gridApi) return;
                const rowCount = this.gridApi.getDisplayedRowCount();
                for (let i = 0; i < rowCount; i++) {
                  this.plugin.model.addRowMarker(filePath, i, colId, codeName);
                }
                this.gridApi.refreshCells({ force: true });
              }).open();
            });
          }

          labelContainer.insertBefore(btn, labelDiv);
        }
      }

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
    if (this.navHandler) {
      this.app.workspace.off('codemarker-csv:navigate' as any, this.navHandler);
      this.navHandler = null;
    }
    if (this.headerObserver) {
      this.headerObserver.disconnect();
      this.headerObserver = null;
    }
    if (this.gridApi) {
      this.gridApi.destroy();
      this.gridApi = null;
    }
    if (this.file) {
      this.plugin.model.clearRowData(this.file.path);
    }
    this.contentEl.empty();
  }
}

// ── Cell Renderers (use CodingModel) ─────────────────────────

/** Renderer for source column when cod-seg is active: text + tag button */
function sourceTagBtnRenderer(params: any) {
  const plugin: CsvViewerPlugin = params.plugin;
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
    const rowIdx = params.node?.rowIndex ?? params.rowIndex ?? 0;
    const filePath = params.filePath;
    if (!filePath || !plugin) return;

    new CodePickerModal(plugin.app, plugin.model, (codeName) => {
      plugin.model.addSegmentMarker(filePath, rowIdx, segField, 0, (params.value ?? "").length, codeName);
      params.api.refreshCells({ force: true });
    }).open();
  });

  wrapper.appendChild(text);
  wrapper.appendChild(btn);
  return wrapper;
}

// Toggle: show tag button inside cod-seg cells?
const COD_SEG_CELL_TAG_BTN = false;

// Subtle background for coding columns
const COD_SEG_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--interactive-accent) 8%, transparent)",
  fontStyle: "italic",
  fontSize: "calc(var(--ag-font-size, 14px) + 1px)",
};
const COD_FROW_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--text-muted) 3%, transparent)",
};

function codCellRenderer(params: any) {
  const plugin: CsvViewerPlugin = params.plugin;
  const model: CodingModel | undefined = plugin?.model;
  const filePath: string = params.filePath ?? '';
  const field: string = params.colDef.field;
  const getRow = () => params.node?.rowIndex ?? params.rowIndex ?? 0;

  const wrapper = document.createElement("div");
  wrapper.className = "csv-cod-seg-cell";

  const text = document.createElement("span");
  text.className = "csv-cod-seg-text";
  text.textContent = params.value ?? "";

  // Tag chips area — driven by CodingModel
  const tagsArea = document.createElement("span");
  tagsArea.className = "csv-tag-area";

  if (model && filePath) {
    const codes = model.getCodesForCell(filePath, getRow(), field);
    for (const { codeName, markerId, color } of codes) {
      const chip = document.createElement("span");
      chip.className = "csv-tag-chip";
      chip.style.backgroundColor = hexToRgba(color, 0.18);
      chip.style.color = color;
      chip.style.cursor = "pointer";
      chip.textContent = codeName;
      // Data attributes for event delegation
      chip.setAttribute('data-marker-id', markerId);
      chip.setAttribute('data-code-name', codeName);
      chip.setAttribute('data-action', 'open-detail');

      // × button
      const x = document.createElement("span");
      x.className = "csv-tag-chip-x";
      x.textContent = "×";
      x.setAttribute('data-marker-id', markerId);
      x.setAttribute('data-code-name', codeName);
      x.setAttribute('data-action', 'remove-code');
      chip.appendChild(x);
      tagsArea.appendChild(chip);
    }
  }

  wrapper.appendChild(text);
  wrapper.appendChild(tagsArea);

  // Tag button — opens code picker
  const showBtn = field.endsWith("_cod-seg") ? COD_SEG_CELL_TAG_BTN : true;
  if (showBtn) {
    const btn = document.createElement("span");
    btn.className = "csv-cod-seg-btn";
    setIcon(btn, "tag");
    const svg = btn.querySelector("svg");
    if (svg) { svg.style.width = "14px"; svg.style.height = "14px"; svg.style.strokeWidth = "3"; svg.style.color = "var(--text-normal)"; }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!plugin || !filePath) return;

      const isSeg = field.endsWith("_cod-seg");
      new CodePickerModal(plugin.app, plugin.model, (codeName) => {
        if (isSeg) {
          plugin.model.addSegmentMarker(filePath, getRow(), field, 0, (params.value ?? "").length, codeName);
        } else {
          plugin.model.addRowMarker(filePath, getRow(), field, codeName);
        }
        params.api.refreshCells({ force: true });
      }).open();
    });
    wrapper.appendChild(btn);
  }

  return wrapper;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Code Picker Modal ───────────────────────────────────────

interface CodePickerItem {
  name: string;
  color: string;
  isNew?: boolean;
}

class CodePickerModal extends SuggestModal<CodePickerItem> {
  private model: CodingModel;
  private onPick: (codeName: string) => void;

  constructor(app: App, model: CodingModel, onPick: (codeName: string) => void) {
    super(app);
    this.model = model;
    this.onPick = onPick;
    this.setPlaceholder("Type to search or create a code...");
  }

  getSuggestions(query: string): CodePickerItem[] {
    const q = query.trim().toLowerCase();
    let items: CodePickerItem[] = this.model.registry.getAll()
      .map(d => ({ name: d.name, color: d.color }));

    if (q) {
      items = items.filter(i => i.name.toLowerCase().includes(q));
      if (!items.some(i => i.name.toLowerCase() === q)) {
        items.unshift({ name: query.trim(), color: this.model.registry.peekNextPaletteColor(), isNew: true });
      }
    }
    return items;
  }

  renderSuggestion(item: CodePickerItem, el: HTMLElement): void {
    const row = el.createDiv({ cls: 'codemarker-explorer-row' });
    const swatch = row.createSpan({ cls: 'codemarker-detail-swatch' });
    swatch.style.backgroundColor = item.color;
    row.createSpan({ text: item.isNew ? `Create "${item.name}"` : item.name });
  }

  onChooseSuggestion(item: CodePickerItem): void {
    if (item.isNew) {
      new CsvCodeFormModal(this.app, item.name, item.color, (name, color, desc) => {
        this.model.registry.create(name, color, desc);
        this.onPick(name);
      }).open();
    } else {
      this.onPick(item.name);
    }
  }
}

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

// ── Column Toggle Modal ─────────────────────────────────────

class ColumnToggleModal extends Modal {
  private gridApi: GridApi;
  private originalHeaders: string[];
  private plugin: CsvViewerPlugin;
  private filePath: string;

  constructor(app: import("obsidian").App, gridApi: GridApi, originalHeaders: string[], plugin: CsvViewerPlugin, filePath: string) {
    super(app);
    this.gridApi = gridApi;
    this.originalHeaders = originalHeaders;
    this.plugin = plugin;
    this.filePath = filePath;
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

      const segCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
      new Setting(segCell).addToggle((t) =>
        t.setValue(existingCols.has(segField)).onChange((v) => {
          this.toggleCodingColumn(segField, header, "cod-seg", v);
          updateCommentState();
        })
      );

      const frowCell = row.createEl("span", { cls: "csv-col-toggle-cell" });
      new Setting(frowCell).addToggle((t) =>
        t.setValue(existingCols.has(frowField)).onChange((v) => {
          this.toggleCodingColumn(frowField, header, "cod-frow", v);
          updateCommentState();
        })
      );

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

    const filePath = this.filePath;

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
          cellRenderer: (params: any) => {
            console.log('[DIAG-2] TEST renderer called for', params.colDef?.field);
            const el = document.createElement('span');
            el.textContent = '🔴 TEST';
            el.style.color = 'red';
            el.style.fontWeight = 'bold';
            return el;
          },
          cellRendererParams: { plugin: this.plugin, filePath },
          autoHeight: true,
          wrapText: true,
        };
        colDefs.splice(insertIdx, 0, newCol);
      }

      if (isCodSeg) {
        const srcDef = colDefs[srcIdx] as any;
        if (srcDef) {
          srcDef.cellRenderer = sourceTagBtnRenderer;
          srcDef.cellRendererParams = { codSegField: field, plugin: this.plugin, filePath };
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
    console.log('[DIAG-1] Columns after toggle:', this.gridApi.getColumns()?.map(c => c.getColId()));
    console.log('[DIAG-1] ColDefs with renderer:', colDefs.filter((c: any) => c.cellRenderer).map((c: any) => ({ field: c.field, renderer: c.cellRenderer?.name || 'inline' })));
  }

  onClose() {
    this.contentEl.empty();
  }
}
