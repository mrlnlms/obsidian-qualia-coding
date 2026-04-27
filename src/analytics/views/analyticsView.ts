
import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import type { AnalyticsPluginAPI } from "../index";
import type { ConsolidatedData, FilterConfig, SourceType } from "../data/dataTypes";
import type { ExtractedSegment } from "../data/textExtractor";
import type { StopWordsLang } from "../data/wordFrequency";
import type { MDSMode } from "../data/mdsEngine";
export type { ViewMode, SortMode, MatrixSortMode, GroupMode, DisplayMode, CooccSortMode } from "./analyticsViewContext";
import type { ViewMode, SortMode, MatrixSortMode, GroupMode, DisplayMode, CooccSortMode } from "./analyticsViewContext";
import { MODE_REGISTRY } from "./modes/modeRegistry";
import { renderSourcesSection, renderViewModeSection, renderCodesSection, renderMinFreqSection, renderCaseVariablesFilter, renderGroupsFilter } from "./configSections";

export const ANALYTICS_VIEW_TYPE = "codemarker-analytics";

export class AnalyticsView extends ItemView {
  plugin: AnalyticsPluginAPI;
  data: ConsolidatedData | null = null;

  // Config state
  viewMode: ViewMode = "dashboard";
  sortMode: SortMode = "freq-desc";
  groupMode: GroupMode = "none";
  displayMode: DisplayMode = "absolute";
  showEdgeLabels = true;
  minEdgeWeight = 1;
  enabledSources = new Set<SourceType>(["markdown", "csv-segment", "csv-row", "image", "pdf", "audio", "video"]);
  enabledCodes = new Set<string>();
  disabledCodes = new Set<string>();
  minFrequency = 1;
  codeSearch = "";
  private clearAllHandler: (() => void) | null = null;
  private registryChangedHandler: (() => void) | null = null;
  renderGeneration = 0;
  matrixSortMode: MatrixSortMode = "alpha";
  cooccSortMode: CooccSortMode = "alpha";
  evolutionFile = "";  // "" = all files

  // Word Cloud state
  wcStopWordsLang: StopWordsLang = "both";
  wcMinWordLength = 3;
  wcMaxWords = 100;

  // ACM state
  acmShowMarkers = true;
  acmShowCodeLabels = true;

  // MDS state
  mdsMode: MDSMode = "codes";
  mdsShowLabels = true;

  // Dendrogram state
  dendrogramCutDistance = 0.5;

  // Lag Sequential state
  lagValue = 1;

  // Text Stats state
  tsSort: { col: string; asc: boolean } = { col: "totalWords", asc: false };

  // Polar Coordinates state
  polarFocalCode = "";
  polarMaxLag = 5;

  // Chi-Square state
  chiGroupBy: "source" | "file" = "source";
  chiSort: { col: string; asc: boolean } = { col: "pValue", asc: true };

  // Decision Tree state
  dtOutcomeCode = "";
  dtMaxDepth = 4;

  // Source Comparison state
  srcCompSubView: "chart" | "table" = "chart";
  srcCompDisplayMode: "count" | "percent-code" | "percent-source" = "count";
  srcCompSort: { col: string; asc: boolean } = { col: "total", asc: false };

  // Code × Metadata state
  cmVariable: string | null = null;
  cmDisplay: "count" | "pct-row" | "pct-col" = "count";
  cmHideMissing = false;
  cmSort: { col: "total" | "name" | "chi2" | "p"; asc: boolean } = { col: "total", asc: false };

  // Memo View state
  mvGroupBy: "code" | "file" = "code";
  mvShowTypes = { code: true, group: true, relation: true, marker: true };
  mvMarkerLimit: 5 | 10 | 25 | "all" = 10;
  mvExpanded: Set<string> = new Set();
  private refreshSuspendedCount = 0;

  // Relations Network state
  relationsLevel: 'code' | 'both' = 'both';
  relationsMinEdgeWeight = 1;

  // Case variable filter state
  caseVariableFilter: { name: string; value: string } | null = null;

  // Group filter state (Tier 1.5)
  groupFilter: string | null = null;

  // Text Retrieval state
  trSearch = "";
  trGroupBy: "code" | "file" = "code";
  trSegments: ExtractedSegment[] = [];
  trCollapsed = new Set<string>();
  trMarkerFilter: Set<string> | null = null;

  // DOM refs
  chartContainer: HTMLElement | null = null;
  configPanelEl: HTMLElement | null = null;
  footerEl: HTMLElement | null = null;
  activeChartInstance: import("chart.js").Chart | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AnalyticsPluginAPI) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return ANALYTICS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "CodeMarker Analytics";
  }

  getIcon(): string {
    return "bar-chart-2";
  }

  async onOpen(): Promise<void> {
    this.data = await this.plugin.loadConsolidatedData();
    // Enable all codes by default
    if (this.data) {
      this.enabledCodes = new Set(this.data.codes.map((c) => c.id));
    }
    this.renderView();

    // Sync on Clear All Markers — reload empty data
    this.clearAllHandler = () => {
      this.data = null;
      this.enabledCodes.clear();
      this.disabledCodes.clear();
      this.renderView();
    };
    document.addEventListener('qualia:clear-all', this.clearAllHandler);

    // Sync on registry changes (e.g. QDPX import creating groups while view is open)
    // Reload data + re-render config panel pra refletir groups novos no Filter by group section
    this.registryChangedHandler = async () => {
      this.data = await this.plugin.loadConsolidatedData();
      this.renderConfigPanel();
      this.scheduleUpdate();
    };
    document.addEventListener('qualia:registry-changed', this.registryChangedHandler);
  }

  async onClose(): Promise<void> {
    if (this.clearAllHandler) {
      document.removeEventListener('qualia:clear-all', this.clearAllHandler);
      this.clearAllHandler = null;
    }
    if (this.registryChangedHandler) {
      document.removeEventListener('qualia:registry-changed', this.registryChangedHandler);
      this.registryChangedHandler = null;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.activeChartInstance) {
      this.activeChartInstance.destroy();
      this.activeChartInstance = null;
    }
    this.contentEl.empty();
  }

  onDataRefreshed(): void {
    this.data = this.plugin.data;
    if (this.data) {
      // Only add codes that are genuinely new (not seen before)
      const knownCodes = new Set([...this.enabledCodes, ...this.disabledCodes]);
      for (const c of this.data.codes) {
        if (!knownCodes.has(c.id)) {
          this.enabledCodes.add(c.id);
        }
      }
      // Remove codes that no longer exist from both sets
      const currentNames = new Set(this.data.codes.map(c => c.id));
      for (const name of this.enabledCodes) {
        if (!currentNames.has(name)) this.enabledCodes.delete(name);
      }
      for (const name of this.disabledCodes) {
        if (!currentNames.has(name)) this.disabledCodes.delete(name);
      }
    }
    this.renderView();
  }

  private renderView(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("codemarker-analytics-view");

    if (!this.data || this.data.markers.length === 0) {
      this.renderEmptyState(contentEl);
      return;
    }

    // Toolbar
    this.renderToolbar(contentEl);

    // Body: config panel + chart area
    const body = contentEl.createDiv({ cls: "codemarker-analytics-body" });
    this.configPanelEl = body.createDiv({ cls: "codemarker-config-panel" });
    this.renderConfigPanel();

    const chartArea = body.createDiv({ cls: "codemarker-chart-area" });
    this.chartContainer = chartArea.createDiv({ cls: "codemarker-chart-container" });

    // Footer
    this.footerEl = contentEl.createDiv({ cls: "codemarker-analytics-footer" });

    this.updateChart();
  }

  private renderEmptyState(container: HTMLElement): void {
    const empty = container.createDiv({ cls: "codemarker-analytics-empty" });

    if (!this.data || (!this.data.sources.markdown && !this.data.sources.csv && !this.data.sources.image && !this.data.sources.pdf && !this.data.sources.audio && !this.data.sources.video)) {
      empty.createEl("h3", { text: "No coding data found" });
      empty.createEl("p", {
        text: "Start coding your documents (markdown, PDF, CSV, images, audio or video), then return here to visualize your analysis.",
      });
    } else {
      empty.createEl("h3", { text: "No coding data yet" });
      empty.createEl("p", {
        text: "Start coding your documents, then click Refresh to see your analysis.",
      });
    }

    // Refresh button
    const refreshBtn = empty.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.createSpan({ text: "Refresh" });
    refreshBtn.setAttribute("aria-label", "Refresh data");
    refreshBtn.addEventListener("click", async () => {
      this.data = await this.plugin.loadConsolidatedData();
      if (this.data) {
        // Reset all filters on empty-state refresh
        this.enabledCodes = new Set(this.data.codes.map((c) => c.id));
        this.disabledCodes.clear();
      }
      this.renderView();
    });
  }

  private renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: "codemarker-analytics-toolbar" });

    const refreshBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.createSpan({ text: "Refresh" });
    refreshBtn.setAttribute("aria-label", "Refresh data");
    refreshBtn.addEventListener("click", async () => {
      this.data = await this.plugin.loadConsolidatedData();
      if (this.data) {
        // Only add genuinely new codes, respect disabled
        const knownCodes = new Set([...this.enabledCodes, ...this.disabledCodes]);
        for (const c of this.data.codes) {
          if (!knownCodes.has(c.id)) this.enabledCodes.add(c.id);
        }
        // Remove codes that no longer exist
        const currentNames = new Set(this.data.codes.map(c => c.id));
        for (const name of this.enabledCodes) {
          if (!currentNames.has(name)) this.enabledCodes.delete(name);
        }
        for (const name of this.disabledCodes) {
          if (!currentNames.has(name)) this.disabledCodes.delete(name);
        }
      }
      this.renderView();
    });

    const pngBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(pngBtn, "image");
    pngBtn.createSpan({ text: "Export PNG" });
    pngBtn.setAttribute("aria-label", "Export chart as PNG");
    pngBtn.addEventListener("click", () => this.exportPNG());

    const csvBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(csvBtn, "file-spreadsheet");
    csvBtn.createSpan({ text: "Export CSV" });
    csvBtn.setAttribute("aria-label", "Export data as CSV");
    csvBtn.addEventListener("click", () => this.exportCSV());

    const refiBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(refiBtn, "file-output");
    refiBtn.createSpan({ text: "Export REFI-QDA" });
    refiBtn.setAttribute("aria-label", "Export as REFI-QDA (QDPX/QDC)");
    refiBtn.addEventListener("click", () => {
      this.plugin.openExportModal();
    });

    const importBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    importBtn.createSpan({ text: "Import REFI-QDA" });
    importBtn.setAttribute("aria-label", "Import REFI-QDA (QDPX/QDC)");
    importBtn.addEventListener("click", () => {
      this.plugin.openImportModal();
    });

    const boardBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(boardBtn, "layout-dashboard");
    boardBtn.createSpan({ text: "Add to Board" });
    boardBtn.setAttribute("aria-label", "Add chart to Research Board");
    boardBtn.addEventListener("click", () => this.addToBoard());
  }

  // ─── Config Panel ───

  renderConfigPanel(): void {
    if (!this.configPanelEl || !this.data) return;
    this.configPanelEl.empty();

    const entry = MODE_REGISTRY[this.viewMode];
    if (entry.canExport === false) {
      this.configPanelEl.style.display = "none";
      return;
    }
    this.configPanelEl.style.display = "";

    renderSourcesSection(this);
    renderViewModeSection(this);
    if (entry.renderOptions) entry.renderOptions(this);
    renderCodesSection(this);
    renderMinFreqSection(this);
    renderCaseVariablesFilter(
      this.configPanelEl,
      this.plugin.caseVariablesRegistry,
      { filter: this.caseVariableFilter },
      (f) => { this.caseVariableFilter = f; this.scheduleUpdate(); },
    );
    renderGroupsFilter(
      this.configPanelEl,
      this.plugin.registry,
      { filter: this.groupFilter },
      (f) => { this.groupFilter = f; this.scheduleUpdate(); },
    );
  }

  // ─── Core logic ───

  buildFilterConfig(): FilterConfig {
    const allCodeIds = this.data?.codes.map((c) => c.id) ?? [];
    const excludeCodes = allCodeIds.filter((c) => !this.enabledCodes.has(c));

    const groupFilter = this.groupFilter
      ? {
          groupId: this.groupFilter,
          memberCodeIds: this.plugin.registry.getCodesInGroup(this.groupFilter).map(c => c.id),
        }
      : undefined;

    return {
      sources: Array.from(this.enabledSources),
      codes: [], // empty = all (filtering via excludeCodes instead)
      excludeCodes,
      minFrequency: this.minFrequency,
      caseVariableFilter: this.caseVariableFilter ?? undefined,
      groupFilter,
    };
  }

  getCaseVariablesRegistry() {
    return this.plugin.caseVariablesRegistry;
  }

  scheduleUpdate(): void {
    if (this.refreshSuspendedCount > 0) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.updateChart(), 200);
  }

  suspendRefresh(): void {
    this.refreshSuspendedCount++;
  }

  resumeRefresh(): void {
    this.refreshSuspendedCount = Math.max(0, this.refreshSuspendedCount - 1);
  }

  // ─── Chart rendering ───

  private updateChart(): void {
    if (!this.chartContainer || !this.data) return;
    if (this.activeChartInstance) {
      this.activeChartInstance.destroy();
      this.activeChartInstance = null;
    }
    this.chartContainer.empty();
    this.renderGeneration++;

    // Pre-filter data by case variable so all 20 modes benefit automatically
    const savedData = this.data;
    if (this.caseVariableFilter) {
      const { name, value } = this.caseVariableFilter;
      const registry = this.plugin.caseVariablesRegistry;
      this.data = {
        ...savedData,
        markers: savedData.markers.filter((m) => {
          const vars = registry.getVariables(m.fileId);
          return vars[name] === value;
        }),
      };
    }

    try {
      MODE_REGISTRY[this.viewMode].render(this, this.buildFilterConfig());
    } finally {
      this.data = savedData;
    }

    this.updateFooter();
  }

  /** Check if the current render is still valid (not superseded by a newer updateChart call). */
  isRenderCurrent(generation: number): boolean {
    return generation === this.renderGeneration;
  }

  // ─── Footer ───

  private updateFooter(): void {
    if (!this.footerEl || !this.data) return;
    const ts = new Date(this.data.lastUpdated);
    const time = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const activeSources: string[] = [];
    if (this.data.sources.markdown) activeSources.push("markdown");
    if (this.data.sources.csv) activeSources.push("csv");
    if (this.data.sources.image) activeSources.push("image");
    if (this.data.sources.pdf) activeSources.push("pdf");
    if (this.data.sources.audio) activeSources.push("audio");
    if (this.data.sources.video) activeSources.push("video");

    this.footerEl.textContent = `Last updated: ${time} \u00b7 ${this.data.markers.length} markers \u00b7 ${this.data.codes.length} codes \u00b7 Sources: ${activeSources.join(", ") || "none"}`;
  }

  // ─── Export PNG ───

  private exportPNG(): void {
    const entry = MODE_REGISTRY[this.viewMode];
    if (entry.canExport === false) {
      new Notice("Export PNG is not available for this view.");
      return;
    }
    const canvas = this.chartContainer?.querySelector("canvas");
    if (!canvas) return;

    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.download = `codemarker-${this.viewMode}-${date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // ─── Export CSV ───

  private exportCSV(): void {
    const entry = MODE_REGISTRY[this.viewMode];
    if (!entry.exportCSV || !this.data) {
      new Notice("Export CSV is not available for this view.");
      return;
    }
    entry.exportCSV(this, new Date().toISOString().slice(0, 10));
  }

  // ─── Add to Board ───

  private async addToBoard(): Promise<void> {
    const entry = MODE_REGISTRY[this.viewMode];
    if (entry.canExport === false) {
      new Notice("Add to Board is not available for this view.");
      return;
    }
    const canvas = this.chartContainer?.querySelector("canvas");
    if (!canvas) {
      new Notice("No chart to add to board.");
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    await this.plugin.addChartToBoard(entry.label, dataUrl, this.viewMode);
    new Notice(`Added "${entry.label}" to Research Board`);
  }
}
