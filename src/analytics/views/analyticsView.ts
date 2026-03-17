
import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import type { AnalyticsPluginAPI } from "../index";
import type { ConsolidatedData, FilterConfig, SourceType } from "../data/dataTypes";
import { calculateFrequency, calculateCooccurrence, calculateDocumentCodeMatrix, calculateEvolution } from "../data/statsEngine";
import type { ExtractedSegment } from "../data/textExtractor";
import type { StopWordsLang } from "../data/wordFrequency";
import type { MDSMode } from "../data/mdsEngine";
export type { ViewMode, SortMode, MatrixSortMode, GroupMode, DisplayMode, CooccSortMode } from "./analyticsViewContext";
import type { ViewMode, SortMode, MatrixSortMode, GroupMode, DisplayMode, CooccSortMode } from "./analyticsViewContext";

// ─── Mode modules ───
import { renderDashboard } from "./modes/dashboardMode";
import { renderFrequencyChart, renderSortSection, renderGroupSection } from "./modes/frequencyMode";
import { renderCooccurrenceMatrix, renderDisplaySection, renderCooccSortSection } from "./modes/cooccurrenceMode";
import { renderNetworkGraph, renderGraphOptionsSection } from "./modes/graphMode";
import { renderDocCodeMatrix, renderMatrixSortSection } from "./modes/docMatrixMode";
import { renderEvolutionChart, renderEvolutionFileSection } from "./modes/evolutionMode";
import { renderTextRetrieval } from "./modes/textRetrievalMode";
import { renderWordCloud, renderWordCloudOptionsSection, exportWordCloudCSV } from "./modes/wordCloudMode";
import { renderACMBiplot, renderACMOptionsSection, exportACMCSV } from "./modes/acmMode";
import { renderMDSMap, renderMDSOptionsSection, exportMDSCSV } from "./modes/mdsMode";
import { renderTemporalChart, exportTemporalCSV } from "./modes/temporalMode";
import { renderTextStats, exportTextStatsCSV } from "./modes/textStatsMode";
import { renderDendrogramView, renderDendrogramOptionsSection, exportDendrogramCSV } from "./modes/dendrogramMode";
import { renderLagSequential, renderLagOptionsSection, exportLagCSV } from "./modes/lagSequentialMode";
import { renderPolarCoordinates, renderPolarOptionsSection, exportPolarCSV } from "./modes/polarMode";
import { renderChiSquareView, renderChiSquareOptionsSection, exportChiSquareCSV } from "./modes/chiSquareMode";
import { renderDecisionTreeView, renderDecisionTreeOptionsSection, exportDecisionTreeCSV } from "./modes/decisionTreeMode";
import { renderSourceComparison, renderSourceComparisonOptionsSection, exportSourceComparisonCSV } from "./modes/sourceComparisonMode";
import { renderOverlapMatrix, exportOverlapCSV } from "./modes/overlapMode";

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

  // ─── Config Panel (dispatcher) ───

  renderConfigPanel(): void {
    if (!this.configPanelEl || !this.data) return;
    this.configPanelEl.empty();

    if (this.viewMode === "dashboard" || this.viewMode === "text-retrieval") {
      this.configPanelEl.style.display = "none";
      return;
    }
    this.configPanelEl.style.display = "";

    // ── Sources ──
    this.renderSourcesSection();
    // ── View mode ──
    this.renderViewModeSection();
    // ── Sort (frequency only) ──
    if (this.viewMode === "frequency") {
      renderSortSection(this);
      renderGroupSection(this);
    }
    // ── Display + Sort (co-occurrence) ──
    if (this.viewMode === "cooccurrence") {
      renderDisplaySection(this);
      renderCooccSortSection(this);
    }
    // ── Graph options ──
    if (this.viewMode === "graph") {
      renderGraphOptionsSection(this);
    }
    // ── Doc-matrix sort ──
    if (this.viewMode === "doc-matrix") {
      renderMatrixSortSection(this);
    }
    // ── Evolution file selector ──
    if (this.viewMode === "evolution") {
      renderEvolutionFileSection(this);
    }
    // ── Word Cloud options ──
    if (this.viewMode === "word-cloud") {
      renderWordCloudOptionsSection(this);
    }
    // ── ACM options ──
    if (this.viewMode === "acm") {
      renderACMOptionsSection(this);
    }
    // ── MDS options ──
    if (this.viewMode === "mds") {
      renderMDSOptionsSection(this);
    }
    // ── Dendrogram options ──
    if (this.viewMode === "dendrogram") {
      renderDendrogramOptionsSection(this);
    }
    // ── Lag Sequential options ──
    if (this.viewMode === "lag-sequential") {
      renderLagOptionsSection(this);
    }
    // ── Polar Coordinates options ──
    if (this.viewMode === "polar-coords") {
      renderPolarOptionsSection(this);
    }
    // ── Chi-Square options ──
    if (this.viewMode === "chi-square") {
      renderChiSquareOptionsSection(this);
    }
    // ── Decision Tree options ──
    if (this.viewMode === "decision-tree") {
      renderDecisionTreeOptionsSection(this);
    }
    // ── Source Comparison options ──
    if (this.viewMode === "source-comparison") {
      renderSourceComparisonOptionsSection(this);
    }
    // ── Code Overlap options (reuses co-occurrence display/sort) ──
    if (this.viewMode === "code-overlap") {
      renderDisplaySection(this);
      renderCooccSortSection(this);
    }
    // ── Codes ──
    this.renderCodesSection();
    // ── Min frequency ──
    this.renderMinFreqSection();
  }

  // ─── Config sections that stay in core ───

  private renderSourcesSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Sources" });

    const sources: Array<{ label: string; keys: SourceType[]; active: boolean }> = [
      { label: "Markdown", keys: ["markdown"], active: this.data!.sources.markdown },
      { label: "CSV", keys: ["csv-segment", "csv-row"], active: this.data!.sources.csv },
      { label: "Image", keys: ["image"], active: this.data!.sources.image },
      { label: "PDF", keys: ["pdf"], active: this.data!.sources.pdf },
      { label: "Audio", keys: ["audio"], active: this.data!.sources.audio },
      { label: "Video", keys: ["video"], active: this.data!.sources.video },
    ];

    for (const src of sources) {
      const row = section.createDiv({
        cls: "codemarker-config-row" + (!src.active ? " is-disabled" : ""),
      });
      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = src.keys.every((k) => this.enabledSources.has(k));
      cb.disabled = !src.active;
      row.createSpan({ text: src.label });

      // Count
      if (src.active) {
        const count = this.data!.markers.filter((m) => src.keys.includes(m.source)).length;
        row.createSpan({ cls: "codemarker-config-count", text: `(${count})` });
      }

      cb.addEventListener("change", () => {
        for (const k of src.keys) {
          if (cb.checked) this.enabledSources.add(k);
          else this.enabledSources.delete(k);
        }
        this.scheduleUpdate();
      });
      row.addEventListener("click", (e) => {
        if (e.target !== cb && src.active) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("change"));
        }
      });
    }
  }

  private renderViewModeSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "View" });

    for (const [value, label] of [
      ["dashboard", "Dashboard"],
      ["frequency", "Frequency Bars"],
      ["cooccurrence", "Co-occurrence Matrix"],
      ["graph", "Network Graph"],
      ["doc-matrix", "Document-Code Matrix"],
      ["evolution", "Code Evolution"],
      ["text-retrieval", "Text Retrieval"],
      ["word-cloud", "Word Cloud"],
      ["acm", "MCA Biplot"],
      ["mds", "MDS Map"],
      ["temporal", "Temporal Analysis"],
      ["text-stats", "Text Statistics"],
      ["dendrogram", "Dendrogram"],
      ["lag-sequential", "Lag Sequential"],
      ["polar-coords", "Polar Coordinates"],
      ["chi-square", "Chi-Square Tests"],
      ["decision-tree", "Decision Tree"],
      ["source-comparison", "Source Comparison"],
      ["code-overlap", "Code Overlap"],
    ] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "viewMode";
      radio.value = value;
      radio.checked = this.viewMode === value;
      row.createSpan({ text: label });

      radio.addEventListener("change", () => {
        this.viewMode = value;
        this.renderConfigPanel();
        this.scheduleUpdate();
      });
      row.addEventListener("click", (e) => {
        if (e.target !== radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event("change"));
        }
      });
    }
  }

  private renderCodesSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Codes" });

    // Select all / Deselect all
    const actions = section.createDiv({ cls: "codemarker-config-actions" });
    const selectAll = actions.createSpan({ cls: "codemarker-config-action", text: "Select All" });
    const deselectAll = actions.createSpan({ cls: "codemarker-config-action", text: "Deselect All" });

    selectAll.addEventListener("click", () => {
      this.enabledCodes = new Set(this.data!.codes.map((c) => c.name));
      this.renderCodesSection();
      this.scheduleUpdate();
    });
    deselectAll.addEventListener("click", () => {
      this.enabledCodes.clear();
      this.renderCodesSection();
      this.scheduleUpdate();
    });

    // Search
    const search = section.createEl("input", {
      cls: "codemarker-config-search",
      attr: { type: "text", placeholder: "Search codes..." },
    });
    search.value = this.codeSearch;
    search.addEventListener("input", () => {
      this.codeSearch = search.value;
      this.renderCodesList(codesList);
    });

    const codesList = section.createDiv({ cls: "codemarker-config-codes-list" });
    this.renderCodesList(codesList);
  }

  private renderCodesList(container: HTMLElement): void {
    container.empty();

    // Count frequency for display
    const freq = new Map<string, number>();
    if (this.data) {
      for (const m of this.data.markers) {
        for (const c of m.codes) {
          freq.set(c, (freq.get(c) ?? 0) + 1);
        }
      }
    }

    const filtered = (this.data?.codes ?? []).filter(
      (c) => !this.codeSearch || c.name.toLowerCase().includes(this.codeSearch.toLowerCase())
    );

    for (const code of filtered) {
      const row = container.createDiv({ cls: "codemarker-config-row" });
      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = this.enabledCodes.has(code.name);

      const swatch = row.createDiv({ cls: "codemarker-config-swatch" });
      swatch.style.backgroundColor = code.color;

      row.createSpan({ text: code.name });
      row.createSpan({
        cls: "codemarker-config-count",
        text: `(${freq.get(code.name) ?? 0})`,
      });

      cb.addEventListener("change", () => {
        if (cb.checked) this.enabledCodes.add(code.name);
        else this.enabledCodes.delete(code.name);
        this.scheduleUpdate();
      });
      row.addEventListener("click", (e) => {
        if (e.target !== cb) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("change"));
        }
      });
    }
  }

  private renderMinFreqSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Min frequency" });

    const row = section.createDiv({ cls: "codemarker-config-row" });
    const input = row.createEl("input", {
      cls: "codemarker-config-number",
      attr: { type: "number", min: "1", value: String(this.minFrequency) },
    });
    input.addEventListener("input", () => {
      const val = parseInt(input.value);
      if (!isNaN(val) && val >= 1) {
        this.minFrequency = val;
        this.scheduleUpdate();
      }
    });
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

  // ─── Chart dispatcher ───

  private updateChart(): void {
    if (!this.chartContainer || !this.data) return;
    this.chartContainer.empty();

    const filters = this.buildFilterConfig();

    if (this.viewMode === "dashboard") {
      renderDashboard(this, filters);
    } else if (this.viewMode === "frequency") {
      renderFrequencyChart(this, filters);
    } else if (this.viewMode === "cooccurrence") {
      renderCooccurrenceMatrix(this, filters);
    } else if (this.viewMode === "doc-matrix") {
      renderDocCodeMatrix(this, filters);
    } else if (this.viewMode === "evolution") {
      renderEvolutionChart(this, filters);
    } else if (this.viewMode === "text-retrieval") {
      renderTextRetrieval(this, filters);
    } else if (this.viewMode === "word-cloud") {
      renderWordCloud(this, filters);
    } else if (this.viewMode === "acm") {
      renderACMBiplot(this, filters);
    } else if (this.viewMode === "mds") {
      renderMDSMap(this, filters);
    } else if (this.viewMode === "temporal") {
      renderTemporalChart(this, filters);
    } else if (this.viewMode === "text-stats") {
      renderTextStats(this, filters);
    } else if (this.viewMode === "dendrogram") {
      renderDendrogramView(this, filters);
    } else if (this.viewMode === "lag-sequential") {
      renderLagSequential(this, filters);
    } else if (this.viewMode === "polar-coords") {
      renderPolarCoordinates(this, filters);
    } else if (this.viewMode === "chi-square") {
      renderChiSquareView(this, filters);
    } else if (this.viewMode === "decision-tree") {
      renderDecisionTreeView(this, filters);
    } else if (this.viewMode === "source-comparison") {
      renderSourceComparison(this, filters);
    } else if (this.viewMode === "code-overlap") {
      renderOverlapMatrix(this, filters);
    } else {
      renderNetworkGraph(this, filters);
    }

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
    if (this.viewMode === "dashboard" || this.viewMode === "text-retrieval") {
      new Notice("Export PNG is not available for this view.");
      return;
    }
    const canvas = this.chartContainer?.querySelector("canvas");
    if (!canvas) return;

    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    const type = this.viewMode;
    link.download = `codemarker-${type}-${date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // ─── Export CSV (dispatcher) ───

  private exportCSV(): void {
    if (this.viewMode === "dashboard" || this.viewMode === "text-retrieval") {
      new Notice("Export CSV is not available for this view.");
      return;
    }
    if (!this.data) return;
    const filters = this.buildFilterConfig();

    let csvContent: string;
    let filename: string;
    const date = new Date().toISOString().slice(0, 10);

    // Modes with dedicated export functions
    if (this.viewMode === "word-cloud") {
      exportWordCloudCSV(this, date);
      return;
    }
    if (this.viewMode === "acm") {
      exportACMCSV(this, date);
      return;
    }
    if (this.viewMode === "mds") {
      exportMDSCSV(this, date);
      return;
    }
    if (this.viewMode === "temporal") {
      exportTemporalCSV(this, date);
      return;
    }
    if (this.viewMode === "text-stats") {
      exportTextStatsCSV(this, date);
      return;
    }
    if (this.viewMode === "dendrogram") {
      exportDendrogramCSV(this, date);
      return;
    }
    if (this.viewMode === "lag-sequential") {
      exportLagCSV(this, date);
      return;
    }
    if (this.viewMode === "polar-coords") {
      exportPolarCSV(this, date);
      return;
    }
    if (this.viewMode === "chi-square") {
      exportChiSquareCSV(this, date);
      return;
    }
    if (this.viewMode === "decision-tree") {
      exportDecisionTreeCSV(this, date);
      return;
    }
    if (this.viewMode === "source-comparison") {
      exportSourceComparisonCSV(this, date);
      return;
    }
    if (this.viewMode === "code-overlap") {
      exportOverlapCSV(this, date);
      return;
    }

    // Inline CSV exports for core modes
    if (this.viewMode === "frequency") {
      const results = calculateFrequency(this.data, filters);
      const rows = [["code", "total", "markdown", "csv_segment", "csv_row", "image", "pdf", "audio", "video"]];
      for (const r of results) {
        rows.push([
          r.code,
          String(r.total),
          String(r.bySource.markdown),
          String(r.bySource["csv-segment"]),
          String(r.bySource["csv-row"]),
          String(r.bySource.image),
          String(r.bySource.pdf),
          String(r.bySource.audio),
          String(r.bySource.video),
        ]);
      }
      csvContent = rows.map((r) => r.join(",")).join("\n");
      filename = `codemarker-frequency-${date}.csv`;
    } else if (this.viewMode === "graph") {
      const result = calculateCooccurrence(this.data, filters);
      const rows = [["source", "target", "weight"]];
      for (let i = 0; i < result.codes.length; i++) {
        for (let j = i + 1; j < result.codes.length; j++) {
          if (result.matrix[i]![j]! > 0) {
            rows.push([result.codes[i]!, result.codes[j]!, String(result.matrix[i]![j]!)]);
          }
        }
      }
      csvContent = rows.map((r) => r.join(",")).join("\n");
      filename = `codemarker-graph-${date}.csv`;
    } else if (this.viewMode === "doc-matrix") {
      const result = calculateDocumentCodeMatrix(this.data, filters);
      const rows: string[][] = [["file", ...result.codes]];
      for (let fi = 0; fi < result.files.length; fi++) {
        rows.push([result.files[fi]!, ...result.matrix[fi]!.map(String)]);
      }
      csvContent = rows.map((r) => r.join(",")).join("\n");
      filename = `codemarker-doc-matrix-${date}.csv`;
    } else if (this.viewMode === "evolution") {
      const result = calculateEvolution(this.data, filters);
      const pts = this.evolutionFile
        ? result.points.filter((p) => p.file === this.evolutionFile)
        : result.points;
      const rows: string[][] = [["file", "code", "position", "fromLine", "toLine"]];
      for (const p of pts) {
        rows.push([p.file, p.code, p.position.toFixed(4), String(p.fromLine), String(p.toLine)]);
      }
      csvContent = rows.map((r) => r.join(",")).join("\n");
      filename = `codemarker-evolution-${date}.csv`;
    } else {
      const result = calculateCooccurrence(this.data, filters);
      const rows: string[][] = [["", ...result.codes]];
      for (let i = 0; i < result.codes.length; i++) {
        rows.push([result.codes[i]!, ...result.matrix[i]!.map(String)]);
      }
      csvContent = rows.map((r) => r.join(",")).join("\n");
      filename = `codemarker-cooccurrence-${date}.csv`;
    }

    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ─── Add to Board ───

  private async addToBoard(): Promise<void> {
    if (this.viewMode === "dashboard" || this.viewMode === "text-retrieval") {
      new Notice("Add to Board is not available for this view.");
      return;
    }
    const canvas = this.chartContainer?.querySelector("canvas");
    if (!canvas) {
      new Notice("No chart to add to board.");
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");

    // Build a human-friendly title from the view mode
    const titles: Record<string, string> = {
      frequency: "Frequency Bars",
      cooccurrence: "Co-occurrence Matrix",
      graph: "Network Graph",
      "doc-matrix": "Document-Code Matrix",
      evolution: "Code Evolution",
      "word-cloud": "Word Cloud",
      acm: "MCA Biplot",
      mds: "MDS Map",
      temporal: "Temporal Analysis",
      "text-stats": "Text Statistics",
      dendrogram: "Dendrogram",
      "lag-sequential": "Lag Sequential",
      "polar-coords": "Polar Coordinates",
      "chi-square": "Chi-Square Tests",
      "decision-tree": "Decision Tree",
      "source-comparison": "Source Comparison",
      "code-overlap": "Code Overlap",
    };
    const title = titles[this.viewMode] ?? this.viewMode;

    await this.plugin.addChartToBoard(title, dataUrl, this.viewMode);
    new Notice(`Added "${title}" to Research Board`);
  }
}
