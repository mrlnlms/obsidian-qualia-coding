import { FileView, Modal, Setting, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz } from "ag-grid-community";
import * as Papa from "papaparse";
import { EditorView, lineNumbers, drawSelection, highlightActiveLine, tooltips } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { codingCellRenderer, sourceTagBtnRenderer } from "./grid/codingCellRenderer";
import { createMarkerStateField, updateFileMarkersEffect, setFileIdEffect } from "./cm6/markerStateField";
import { createMarkerViewPlugin } from "./cm6/markerViewPlugin";
import { createSelectionMenuField } from "./cm6/selectionMenuField";
import { createHoverMenuExtension } from "./cm6/hoverMenuExtension";
import { createMarginPanelExtension } from "./cm6/marginPanelExtension";
import { registerStandaloneEditor, unregisterStandaloneEditor } from "./cm6/utils/viewLookupUtils";
import type { Marker } from "./models/codeMarkerModel";
import type { SegmentMarker } from "./coding/codingTypes";
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
  private gridWrapper: HTMLElement | null = null;

  // Segment editor state
  private editorPanel: HTMLElement | null = null;
  private editorView: EditorView | null = null;
  private editorContext: { file: string; row: number; column: string } | null = null;
  private labelObserver: MutationObserver | null = null;

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
        new ColumnToggleModal(this.app, this.gridApi, this.originalHeaders, this.plugin, this.file?.path ?? "", this).open();
      }
    });

    this.originalHeaders = headers;

    // Grid wrapper
    const wrapper = contentEl.createEl("div");
    wrapper.style.height = "calc(100% - 40px)";
    wrapper.style.width = "100%";
    this.gridWrapper = wrapper;

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

  // ─── Segment Editor (CM6 split panel) ────────────────────

  openSegmentEditor(file: string, row: number, column: string, cellText: string) {
    // Toggle: if same context is already open, close it
    if (
      this.editorContext &&
      this.editorContext.file === file &&
      this.editorContext.row === row &&
      this.editorContext.column === column
    ) {
      this.closeSegmentEditor();
      return;
    }

    // Close any existing editor first
    this.closeSegmentEditor();

    this.editorContext = { file, row, column };

    // Virtual fileId unique to this cell — never collides with real markdown paths
    const virtualFileId = `csv:${file}:${row}:${column}`;

    // Adjust grid height
    if (this.gridWrapper) {
      this.gridWrapper.style.height = "calc(60% - 40px)";
    }

    // Create editor panel
    this.editorPanel = this.contentEl.createEl("div");
    this.editorPanel.className = "csv-segment-editor-panel";
    this.editorPanel.style.height = "40%";
    this.editorPanel.style.borderTop = "2px solid var(--background-modifier-border)";
    this.editorPanel.style.display = "flex";
    this.editorPanel.style.flexDirection = "column";

    // Header bar
    const header = this.editorPanel.createEl("div");
    header.className = "csv-segment-editor-header";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.padding = "4px 12px";
    header.style.fontSize = "12px";
    header.style.color = "var(--text-muted)";
    header.style.backgroundColor = "var(--background-secondary)";
    header.style.flexShrink = "0";

    header.createSpan({ text: `Row ${row + 1} · ${column}` });

    const closeBtn = header.createSpan();
    closeBtn.style.cursor = "pointer";
    closeBtn.style.display = "flex";
    setIcon(closeBtn, "x");
    const svg = closeBtn.querySelector("svg");
    if (svg) { svg.style.width = "16px"; svg.style.height = "16px"; }
    closeBtn.addEventListener("click", () => this.closeSegmentEditor());

    // CM6 editor container
    const editorContainer = this.editorPanel.createEl("div");
    editorContainer.style.flex = "1";
    editorContainer.style.overflow = "auto";

    const mdModel = this.plugin.model;

    // Sync code definitions from CSV registry → markdown registry
    // so that colors and code names resolve correctly in CM6 extensions
    for (const def of this.plugin.csvModel.registry.getAll()) {
      if (!mdModel.registry.getByName(def.name)) {
        mdModel.registry.importDefinition(def as any);
      }
    }

    // Convert existing CSV segment markers → CodeMarkerModel markers
    const segmentMarkers = this.plugin.csvModel.getSegmentMarkersForCell(file, row, column);
    this.populateMarkersFromSegments(virtualFileId, segmentMarkers, cellText);

    this.editorView = new EditorView({
      state: EditorState.create({
        doc: cellText,
        extensions: [
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          lineNumbers(),
          drawSelection(),
          highlightActiveLine(),
          // Render tooltips at body level to prevent clipping in the compact panel
          tooltips({ parent: document.body }),
          // Full markdown CM6 extensions
          createMarkerStateField(mdModel),
          createMarkerViewPlugin(mdModel),
          createSelectionMenuField(mdModel),
          createHoverMenuExtension(mdModel),
          createMarginPanelExtension(mdModel),
          EditorView.theme({
            "&": {
              backgroundColor: "var(--background-primary)",
              color: "var(--text-normal)",
              height: "100%",
            },
            ".cm-content": {
              fontFamily: "var(--font-text)",
              fontSize: "14px",
              padding: "8px 0",
            },
            ".cm-gutters": {
              backgroundColor: "var(--background-secondary)",
              color: "var(--text-muted)",
              borderRight: "1px solid var(--background-modifier-border)",
            },
            ".cm-activeLine": {
              backgroundColor: "var(--background-modifier-hover)",
            },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              backgroundColor: "rgba(var(--interactive-accent-rgb, 66, 133, 244), 0.25) !important",
            },
          }),
        ],
      }),
      parent: editorContainer,
    });

    // Register this standalone editor so the lookup utils find it
    registerStandaloneEditor(this.editorView, virtualFileId);
    mdModel.registerStandaloneEditor(virtualFileId, this.editorView);

    // Send file ID + trigger initial marker render
    this.editorView.dispatch({
      effects: [
        setFileIdEffect.of({ fileId: virtualFileId }),
        updateFileMarkersEffect.of({ fileId: virtualFileId }),
      ]
    });

    // Align margin panel labels with editor line height.
    // The margin panel uses LABEL_HEIGHT=16px, but this editor may have taller lines.
    // We observe the panel for DOM changes and patch label lineHeight to match.
    this.alignMarginLabels();

    // Suppress hover/handles for 500ms after creation — prevents the mouse
    // position at creation time from triggering unwanted hover menus
    this.editorView.dom.style.pointerEvents = 'none';
    const ev = this.editorView;
    setTimeout(() => {
      if (ev.dom) ev.dom.style.pointerEvents = '';
    }, 500);

    // Notify grid to resize
    if (this.gridApi) {
      setTimeout(() => this.gridApi?.setGridOption("domLayout", "normal"), 50);
    }
  }

  /**
   * Observe the margin panel and patch label lineHeight to match editor lines.
   * This only affects this standalone editor — the markdown editor is untouched.
   */
  private alignMarginLabels() {
    if (!this.editorView) return;

    const panel = this.editorView.scrollDOM.querySelector('.codemarker-margin-panel');
    console.log('[CSV alignMarginLabels] panel found:', !!panel);
    if (!panel) return;

    const ORIGINAL_LABEL_HEIGHT = 16;
    const editorView = this.editorView;

    const patchLabels = () => {
      if (!editorView?.dom) return;

      const lineH = editorView.defaultLineHeight;
      const contentPaddingTop = parseFloat(getComputedStyle(editorView.contentDOM).paddingTop) || 0;
      const firstBlock = editorView.lineBlockAt(0);

      const labels = panel.querySelectorAll<HTMLElement>('.codemarker-margin-label');
      console.log('[CSV patchLabels]', {
        lineH,
        contentPaddingTop,
        firstBlockTop: firstBlock?.top,
        contentOffsetTop: editorView.contentDOM.offsetTop,
        labels: labels.length,
      });

      if (labels.length === 0) return;

      // The margin panel calculates label positions using lineBlockAt().top + contentDOM.offsetTop.
      // If .cm-content has padding-top, the visual line position is shifted down by that padding,
      // but lineBlockAt() does NOT include it — so labels end up above the actual text.
      // Also adjust for line height difference (LABEL_HEIGHT=16 vs actual).
      const heightShift = (lineH - ORIGINAL_LABEL_HEIGHT) / 2;
      const totalShift = heightShift + contentPaddingTop;

      if (Math.abs(contentPaddingTop) < 0.5 && Math.abs(heightShift) < 0.5) return;

      // Shift ALL positioned elements (bars, ticks, dots, labels) by contentPaddingTop
      const allPositioned = panel.querySelectorAll<HTMLElement>('[style*="top"]');
      for (const el of Array.from(allPositioned)) {
        const origTop = parseFloat(el.style.top);
        if (isNaN(origTop)) continue;

        el.style.top = `${origTop + contentPaddingTop}px`;
        if (el.classList.contains('codemarker-margin-label')) {
          el.style.lineHeight = `${lineH}px`;
        }
      }
    };

    // Patch after initial render + each panel DOM rebuild
    this.labelObserver = new MutationObserver(() => {
      console.log('[CSV] MutationObserver fired');
      requestAnimationFrame(patchLabels);
    });
    this.labelObserver.observe(panel, { childList: true });
  }

  /**
   * Convert CSV SegmentMarkers (char offsets) → CodeMarkerModel Markers (line/ch)
   * and store under the virtualFileId.
   */
  private populateMarkersFromSegments(virtualFileId: string, segments: SegmentMarker[], cellText: string) {
    const mdModel = this.plugin.model;

    // Clear any stale markers from previous sessions (prevents duplication)
    mdModel.clearMarkersForFile(virtualFileId);

    // Build a line index for offset → {line, ch} conversion
    const lines = cellText.split('\n');
    const lineStarts: number[] = [0];
    for (let i = 0; i < lines.length - 1; i++) {
      lineStarts.push(lineStarts[i]! + lines[i]!.length + 1); // +1 for '\n'
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
        id: seg.id,
        fileId: virtualFileId,
        range: {
          from: offsetToPos(seg.from),
          to: offsetToPos(seg.to),
        },
        color: this.plugin.csvModel.registry.getColorForCodes(seg.codes) ?? this.plugin.settings.defaultColor,
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

      // Sync markers back from CodeMarkerModel → CodingModel
      this.syncMarkersBackToCsvModel(virtualFileId, file, row, column);

      // Unregister standalone editor
      const mdModel = this.plugin.model;
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

    // Restore grid height
    if (this.gridWrapper) {
      this.gridWrapper.style.height = "calc(100% - 40px)";
    }
    if (this.gridApi) {
      setTimeout(() => this.gridApi?.setGridOption("domLayout", "normal"), 50);
    }

    // Refresh grid to show updated coding columns
    if (this.gridApi) {
      setTimeout(() => this.gridApi?.refreshCells({ force: true }), 100);
    }
  }

  /**
   * Sync markers from CodeMarkerModel (line/ch) back to CodingModel (char offsets).
   */
  private syncMarkersBackToCsvModel(virtualFileId: string, file: string, row: number, column: string) {
    const mdModel = this.plugin.model;
    const csvModel = this.plugin.csvModel;
    const mdMarkers = mdModel.getMarkersForFile(virtualFileId);

    if (!this.editorView) return;
    const doc = this.editorView.state.doc;

    // Delete all existing segments for this cell (will be re-created from mdMarkers)
    csvModel.deleteSegmentMarkersForCell(file, row, column);

    // Convert CodeMarkerModel markers back to SegmentMarkers
    for (const marker of mdMarkers) {
      if (marker.codes.length === 0) continue;
      try {
        const fromOffset = doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
        const toOffset = doc.line(marker.range.to.line + 1).from + marker.range.to.ch;

        const snapshot = { file, row, column, from: fromOffset, to: toOffset, text: '' };
        const segMarker = csvModel.findOrCreateSegmentMarker(snapshot);
        // Set codes directly
        segMarker.codes = [...marker.codes];
        segMarker.updatedAt = marker.updatedAt;
      } catch (e) {
        console.warn('[CodeMarker CSV] Error syncing marker back:', e);
      }
    }

    csvModel.notifyAndSave();
  }

  /** Refresh CM6 decorations (called after coding changes) */
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
  private csvView: CsvCodingView;

  constructor(app: import("obsidian").App, gridApi: GridApi, originalHeaders: string[], plugin: CsvCodingPlugin, filePath: string, csvView: CsvCodingView) {
    super(app);
    this.gridApi = gridApi;
    this.originalHeaders = originalHeaders;
    this.model = plugin.csvModel;
    this.filePath = filePath;
    this.plugin = plugin;
    this.csvView = csvView;
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
          srcDef.cellRendererParams = { codSegField: field, model: this.model, gridApi: this.gridApi, file: this.filePath, plugin: this.plugin, csvView: this.csvView };
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
