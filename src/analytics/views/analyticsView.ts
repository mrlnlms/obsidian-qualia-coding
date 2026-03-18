
import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import type { AnalyticsPluginAPI } from "../index";
import type { ConsolidatedData, FilterConfig, SourceType } from "../data/dataTypes";
import type { ExtractedSegment } from "../data/textExtractor";
import type { StopWordsLang } from "../data/wordFrequency";
import type { MDSMode } from "../data/mdsEngine";
export type { ViewMode, SortMode, MatrixSortMode, GroupMode, DisplayMode, CooccSortMode } from "./analyticsViewContext";
import type { ViewMode, SortMode, MatrixSortMode, GroupMode, DisplayMode, CooccSortMode } from "./analyticsViewContext";
import { MODE_REGISTRY } from "./modes/modeRegistry";
import { renderSourcesSection, renderViewModeSection, renderCodesSection, renderMinFreqSection } from "./configSections";

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
  minFrequency = 1;
  codeSearch = "";
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
  dendrogramMode: "codes" | "files" = "codes";
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

  // Text Retrieval state
  trSearch = "";
  trGroupBy: "code" | "file" = "code";
  trSegments: ExtractedSegment[] = [];
  trCollapsed = new Set<string>();

  // DOM refs
  chartContainer: HTMLElement | null = null;
  configPanelEl: HTMLElement | null = null;
  footerEl: HTMLElement | null = null;
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
      this.enabledCodes = new Set(this.data.codes.map((c) => c.name));
    }
    this.renderView();
  }

  async onClose(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.contentEl.empty();
  }

  onDataRefreshed(): void {
    this.data = this.plugin.data;
    if (this.data) {
      // Keep existing enabled codes, add any new ones
      for (const c of this.data.codes) {
        if (!this.enabledCodes.has(c.name)) {
          this.enabledCodes.add(c.name);
        }
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
      empty.createEl("h3", { text: "No CodeMarker data found" });
      const p = empty.createEl("p");
      p.innerHTML = [
        "Install and use one or more CodeMarker plugins to start coding:",
        "&bull; obsidian-codemarker-v2 (Markdown)",
        "&bull; obsidian-codemarker-csv (CSV)",
        "&bull; obsidian-codemarker-image (Image)",
        "&bull; obsidian-codemarker-pdf (PDF)",
        "&bull; obsidian-codemarker-audio (Audio)",
        "&bull; obsidian-codemarker-video (Video)",
        "",
        "Then return here to visualize your analysis.",
      ].join("<br>");
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
    refreshBtn.addEventListener("click", async () => {
      this.data = await this.plugin.loadConsolidatedData();
      if (this.data) {
        this.enabledCodes = new Set(this.data.codes.map((c) => c.name));
      }
      this.renderView();
    });
  }

  private renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: "codemarker-analytics-toolbar" });

    const refreshBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.createSpan({ text: "Refresh" });
    refreshBtn.addEventListener("click", async () => {
      this.data = await this.plugin.loadConsolidatedData();
      if (this.data) {
        for (const c of this.data.codes) {
          if (!this.enabledCodes.has(c.name)) this.enabledCodes.add(c.name);
        }
      }
      this.renderView();
    });

    const pngBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(pngBtn, "image");
    pngBtn.createSpan({ text: "Export PNG" });
    pngBtn.addEventListener("click", () => this.exportPNG());

    const csvBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(csvBtn, "file-spreadsheet");
    csvBtn.createSpan({ text: "Export CSV" });
    csvBtn.addEventListener("click", () => this.exportCSV());

    const boardBtn = toolbar.createDiv({ cls: "codemarker-analytics-toolbar-btn" });
    setIcon(boardBtn, "layout-dashboard");
    boardBtn.createSpan({ text: "Add to Board" });
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
  }

  // ─── Core logic ───

  buildFilterConfig(): FilterConfig {
    const allCodeNames = this.data?.codes.map((c) => c.name) ?? [];
    const excludeCodes = allCodeNames.filter((c) => !this.enabledCodes.has(c));

    return {
      sources: Array.from(this.enabledSources),
      codes: [], // empty = all (filtering via excludeCodes instead)
      excludeCodes,
      minFrequency: this.minFrequency,
    };
  }

  scheduleUpdate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.updateChart(), 200);
  }

  // ─── Chart rendering ───

  private updateChart(): void {
    if (!this.chartContainer || !this.data) return;
    this.chartContainer.empty();
    MODE_REGISTRY[this.viewMode].render(this, this.buildFilterConfig());
    this.updateFooter();
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
