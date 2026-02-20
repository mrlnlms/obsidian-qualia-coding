import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import type CodeMarkerAnalyticsPlugin from "../main";
import type { ConsolidatedData, FilterConfig, CooccurrenceResult, DocCodeMatrixResult, EvolutionResult, TemporalResult, LagResult, PolarCoordResult, ChiSquareResult, SourceComparisonResult, OverlapResult, SourceType } from "../data/dataTypes";
import { calculateFrequency, calculateCooccurrence, calculateDocumentCodeMatrix, calculateEvolution, calculateTemporal, calculateTextStats, calculateLagSequential, calculatePolarCoordinates, calculateChiSquare, calculateSourceComparison, calculateOverlap } from "../data/statsEngine";
import { TextExtractor, type ExtractedSegment } from "../data/textExtractor";
import { calculateWordFrequencies, type WordFrequencyResult, type StopWordsLang } from "../data/wordFrequency";
import { calculateMCA, type MCAResult } from "../data/mcaEngine";
import { calculateMDS, type MDSResult, type MDSMode } from "../data/mdsEngine";
import { hierarchicalCluster, buildDendrogram, cutDendrogram, calculateSilhouette, type DendrogramNode } from "../data/clusterEngine";
import { buildDecisionTree, type DecisionTreeNode, type DecisionTreeResult } from "../data/decisionTreeEngine";

export const ANALYTICS_VIEW_TYPE = "codemarker-analytics";

export type ViewMode = "dashboard" | "frequency" | "cooccurrence" | "graph" | "doc-matrix" | "evolution" | "text-retrieval" | "word-cloud" | "acm" | "mds" | "temporal" | "text-stats" | "dendrogram" | "lag-sequential" | "polar-coords" | "chi-square" | "decision-tree" | "source-comparison" | "code-overlap";
export type SortMode = "alpha" | "freq-desc" | "freq-asc";
export type MatrixSortMode = "alpha" | "total";
export type GroupMode = "none" | "source" | "file";
export type DisplayMode = "absolute" | "percentage" | "jaccard" | "dice" | "presence";
export type CooccSortMode = "alpha" | "frequency" | "cluster";

export class AnalyticsView extends ItemView {
  private plugin: CodeMarkerAnalyticsPlugin;
  private data: ConsolidatedData | null = null;

  // Config state
  private viewMode: ViewMode = "dashboard";
  private sortMode: SortMode = "freq-desc";
  private groupMode: GroupMode = "none";
  private displayMode: DisplayMode = "absolute";
  private showEdgeLabels = true;
  private minEdgeWeight = 1;
  private enabledSources = new Set(["markdown", "csv-segment", "csv-row", "image", "pdf", "audio", "video"]);
  private enabledCodes = new Set<string>();
  private minFrequency = 1;
  private codeSearch = "";
  private matrixSortMode: MatrixSortMode = "alpha";
  private cooccSortMode: CooccSortMode = "alpha";
  private evolutionFile = "";  // "" = all files

  // Word Cloud state
  private wcStopWordsLang: StopWordsLang = "both";
  private wcMinWordLength = 3;
  private wcMaxWords = 100;

  // ACM state
  private acmShowMarkers = true;
  private acmShowCodeLabels = true;

  // MDS state
  private mdsMode: MDSMode = "codes";
  private mdsShowLabels = true;

  // Dendrogram state
  private dendrogramMode: "codes" | "files" = "codes";
  private dendrogramCutDistance = 0.5;

  // Lag Sequential state
  private lagValue = 1;

  // Text Stats state
  private tsSort: { col: string; asc: boolean } = { col: "totalWords", asc: false };

  // Polar Coordinates state
  private polarFocalCode = "";
  private polarMaxLag = 5;

  // Chi-Square state
  private chiGroupBy: "source" | "file" = "source";
  private chiSort: { col: string; asc: boolean } = { col: "pValue", asc: true };

  // Decision Tree state
  private dtOutcomeCode = "";
  private dtMaxDepth = 4;

  // Source Comparison state
  private srcCompSubView: "chart" | "table" = "chart";
  private srcCompDisplayMode: "count" | "percent-code" | "percent-source" = "count";
  private srcCompSort: { col: string; asc: boolean } = { col: "total", asc: false };

  // Text Retrieval state
  private trSearch = "";
  private trGroupBy: "code" | "file" = "code";
  private trSegments: ExtractedSegment[] = [];
  private trCollapsed = new Set<string>();

  // DOM refs
  private chartContainer: HTMLElement | null = null;
  private configPanelEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CodeMarkerAnalyticsPlugin) {
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
  }

  private renderConfigPanel(): void {
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
      this.renderSortSection();
      this.renderGroupSection();
    }
    // ── Display + Sort (co-occurrence) ──
    if (this.viewMode === "cooccurrence") {
      this.renderDisplaySection();
      this.renderCooccSortSection();
    }
    // ── Graph options ──
    if (this.viewMode === "graph") {
      this.renderGraphOptionsSection();
    }
    // ── Doc-matrix sort ──
    if (this.viewMode === "doc-matrix") {
      this.renderMatrixSortSection();
    }
    // ── Evolution file selector ──
    if (this.viewMode === "evolution") {
      this.renderEvolutionFileSection();
    }
    // ── Word Cloud options ──
    if (this.viewMode === "word-cloud") {
      this.renderWordCloudOptionsSection();
    }
    // ── ACM options ──
    if (this.viewMode === "acm") {
      this.renderACMOptionsSection();
    }
    // ── MDS options ──
    if (this.viewMode === "mds") {
      this.renderMDSOptionsSection();
    }
    // ── Dendrogram options ──
    if (this.viewMode === "dendrogram") {
      this.renderDendrogramOptionsSection();
    }
    // ── Lag Sequential options ──
    if (this.viewMode === "lag-sequential") {
      this.renderLagOptionsSection();
    }
    // ── Polar Coordinates options ──
    if (this.viewMode === "polar-coords") {
      this.renderPolarOptionsSection();
    }
    // ── Chi-Square options ──
    if (this.viewMode === "chi-square") {
      this.renderChiSquareOptionsSection();
    }
    // ── Decision Tree options ──
    if (this.viewMode === "decision-tree") {
      this.renderDecisionTreeOptionsSection();
    }
    // ── Source Comparison options ──
    if (this.viewMode === "source-comparison") {
      this.renderSourceComparisonOptionsSection();
    }
    // ── Code Overlap options (reuses co-occurrence display/sort) ──
    if (this.viewMode === "code-overlap") {
      this.renderDisplaySection();
      this.renderCooccSortSection();
    }
    // ── Codes ──
    this.renderCodesSection();
    // ── Min frequency ──
    this.renderMinFreqSection();
  }

  private renderSourcesSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Sources" });

    const sources: Array<{ label: string; keys: string[]; active: boolean }> = [
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

  private renderSortSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Sort" });

    for (const [value, label] of [
      ["alpha", "Alphabetical"],
      ["freq-desc", "Frequency \u2193"],
      ["freq-asc", "Frequency \u2191"],
    ] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "sortMode";
      radio.value = value;
      radio.checked = this.sortMode === value;
      row.createSpan({ text: label });

      radio.addEventListener("change", () => {
        this.sortMode = value;
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

  private renderGroupSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Group by" });

    for (const [value, label] of [
      ["none", "None"],
      ["source", "By Source"],
      ["file", "By File"],
    ] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "groupMode";
      radio.value = value;
      radio.checked = this.groupMode === value;
      row.createSpan({ text: label });

      radio.addEventListener("change", () => {
        this.groupMode = value;
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

  private renderDisplaySection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Display" });

    for (const [value, label] of [
      ["absolute", "Absolute Count"],
      ["percentage", "Percentage"],
      ["jaccard", "Jaccard Index"],
      ["dice", "Dice Coefficient"],
      ["presence", "Presence (0/1)"],
    ] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "displayMode";
      radio.value = value;
      radio.checked = this.displayMode === value;
      row.createSpan({ text: label });

      radio.addEventListener("change", () => {
        this.displayMode = value;
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

  private renderCooccSortSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Sort" });

    for (const [value, label] of [
      ["alpha", "Alphabetical"],
      ["frequency", "By Frequency"],
      ["cluster", "Cluster (Hierarchical)"],
    ] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "cooccSortMode";
      radio.value = value;
      radio.checked = this.cooccSortMode === value;
      row.createSpan({ text: label });

      radio.addEventListener("change", () => {
        this.cooccSortMode = value;
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

  private buildFilterConfig(): FilterConfig {
    const codes = Array.from(this.enabledCodes);
    const allCodeNames = this.data?.codes.map((c) => c.name) ?? [];
    const excludeCodes = allCodeNames.filter((c) => !this.enabledCodes.has(c));

    return {
      sources: Array.from(this.enabledSources) as any[],
      codes: [], // empty = all (filtering via excludeCodes instead)
      excludeCodes,
      minFrequency: this.minFrequency,
    };
  }

  private scheduleUpdate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.updateChart(), 200);
  }

  private updateChart(): void {
    if (!this.chartContainer || !this.data) return;
    this.chartContainer.empty();

    const filters = this.buildFilterConfig();

    if (this.viewMode === "dashboard") {
      this.renderDashboard(filters);
    } else if (this.viewMode === "frequency") {
      this.renderFrequencyChart(filters);
    } else if (this.viewMode === "cooccurrence") {
      this.renderCooccurrenceMatrix(filters);
    } else if (this.viewMode === "doc-matrix") {
      this.renderDocCodeMatrix(filters);
    } else if (this.viewMode === "evolution") {
      this.renderEvolutionChart(filters);
    } else if (this.viewMode === "text-retrieval") {
      this.renderTextRetrieval(filters);
    } else if (this.viewMode === "word-cloud") {
      this.renderWordCloud(filters);
    } else if (this.viewMode === "acm") {
      this.renderACMBiplot(filters);
    } else if (this.viewMode === "mds") {
      this.renderMDSMap(filters);
    } else if (this.viewMode === "temporal") {
      this.renderTemporalChart(filters);
    } else if (this.viewMode === "text-stats") {
      this.renderTextStats(filters);
    } else if (this.viewMode === "dendrogram") {
      this.renderDendrogramView(filters);
    } else if (this.viewMode === "lag-sequential") {
      this.renderLagSequential(filters);
    } else if (this.viewMode === "polar-coords") {
      this.renderPolarCoordinates(filters);
    } else if (this.viewMode === "chi-square") {
      this.renderChiSquareView(filters);
    } else if (this.viewMode === "decision-tree") {
      this.renderDecisionTreeView(filters);
    } else if (this.viewMode === "source-comparison") {
      this.renderSourceComparison(filters);
    } else if (this.viewMode === "code-overlap") {
      this.renderOverlapMatrix(filters);
    } else {
      this.renderNetworkGraph(filters);
    }

    this.updateFooter();
  }

  // ─── Dashboard ───

  private renderDashboard(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const dashboard = this.chartContainer.createDiv({ cls: "codemarker-dashboard" });

    // ── KPIs ──
    const filtered = this.data.markers.filter((m) => filters.sources.includes(m.source));
    const freq = calculateFrequency(this.data, filters);
    freq.sort((a, b) => b.total - a.total);

    const totalMarkers = filtered.length;
    const totalCodes = this.data.codes.length;
    const totalFiles = new Set(filtered.map((m) => m.file)).size;
    const activeSources = [
      this.data.sources.markdown,
      this.data.sources.csv,
      this.data.sources.image,
      this.data.sources.pdf,
    ].filter(Boolean).length;
    const mostUsedCode = freq.length > 0 ? freq[0].code : "—";
    const avgCodesPerMarker = filtered.length > 0
      ? (filtered.reduce((s, m) => s + m.codes.length, 0) / filtered.length).toFixed(1)
      : "0";

    const kpiGrid = dashboard.createDiv({ cls: "codemarker-kpi-grid" });
    const kpis: Array<{ value: string; label: string }> = [
      { value: String(totalMarkers), label: "Total Markers" },
      { value: String(totalCodes), label: "Total Codes" },
      { value: String(totalFiles), label: "Total Files" },
      { value: String(activeSources), label: "Active Sources" },
      { value: mostUsedCode, label: "Most Used Code" },
      { value: avgCodesPerMarker, label: "Avg Codes/Marker" },
    ];

    for (const kpi of kpis) {
      const card = kpiGrid.createDiv({ cls: "codemarker-kpi-card" });
      card.createDiv({ cls: "codemarker-kpi-value", text: kpi.value });
      card.createDiv({ cls: "codemarker-kpi-label", text: kpi.label });
    }

    // ── Thumbnails ──
    const thumbGrid = dashboard.createDiv({ cls: "codemarker-thumbnail-grid" });

    const thumbnails: Array<{ mode: ViewMode; title: string; render: (canvas: HTMLCanvasElement) => void }> = [
      {
        mode: "frequency",
        title: "Frequency Bars",
        render: (c) => this.renderMiniFrequency(c, freq),
      },
      {
        mode: "cooccurrence",
        title: "Co-occurrence Matrix",
        render: (c) => {
          const cooc = calculateCooccurrence(this.data!, filters);
          this.renderMiniCooccurrence(c, cooc);
        },
      },
      {
        mode: "graph",
        title: "Network Graph",
        render: (c) => {
          const cooc = calculateCooccurrence(this.data!, filters);
          this.renderMiniNetwork(c, cooc, freq);
        },
      },
      {
        mode: "doc-matrix",
        title: "Document-Code Matrix",
        render: (c) => {
          const dm = calculateDocumentCodeMatrix(this.data!, filters);
          this.renderMiniDocMatrix(c, dm);
        },
      },
      {
        mode: "evolution",
        title: "Code Evolution",
        render: (c) => {
          const evo = calculateEvolution(this.data!, filters);
          this.renderMiniEvolution(c, evo);
        },
      },
      {
        mode: "word-cloud",
        title: "Word Cloud",
        render: (c) => this.renderMiniWordCloud(c, freq),
      },
      {
        mode: "acm",
        title: "MCA Biplot",
        render: (c) => this.renderMiniACM(c, filters),
      },
      {
        mode: "mds",
        title: "MDS Map",
        render: (c) => this.renderMiniMDS(c, freq),
      },
      {
        mode: "temporal",
        title: "Temporal Analysis",
        render: (c) => {
          const temporal = calculateTemporal(this.data!, filters);
          this.renderMiniTemporal(c, temporal);
        },
      },
      {
        mode: "text-stats",
        title: "Text Statistics",
        render: (c) => this.renderMiniTextStats(c, freq),
      },
      {
        mode: "dendrogram",
        title: "Dendrogram",
        render: (c) => this.renderMiniDendrogram(c, filters),
      },
      {
        mode: "lag-sequential",
        title: "Lag Sequential",
        render: (c) => {
          const lag = calculateLagSequential(this.data!, filters, 1);
          this.renderMiniLag(c, lag);
        },
      },
      {
        mode: "polar-coords",
        title: "Polar Coordinates",
        render: (c) => this.renderMiniPolar(c, filters),
      },
      {
        mode: "chi-square",
        title: "Chi-Square Tests",
        render: (c) => this.renderMiniChiSquare(c, filters),
      },
      {
        mode: "decision-tree",
        title: "Decision Tree",
        render: (c) => this.renderMiniDecisionTree(c, filters),
      },
      {
        mode: "source-comparison",
        title: "Source Comparison",
        render: (c) => this.renderMiniSourceComparison(c, freq),
      },
      {
        mode: "code-overlap",
        title: "Code Overlap",
        render: (c) => {
          const overlap = calculateOverlap(this.data!, filters);
          this.renderMiniMatrix(c, overlap.codes, overlap.colors, overlap.matrix, overlap.maxValue);
        },
      },
    ];

    for (const thumb of thumbnails) {
      const card = thumbGrid.createDiv({ cls: "codemarker-thumbnail-card" });
      card.createDiv({ cls: "codemarker-thumbnail-title", text: thumb.title });
      const canvas = card.createEl("canvas", { cls: "codemarker-thumbnail-canvas" });
      canvas.width = 280;
      canvas.height = 180;

      try {
        thumb.render(canvas);
      } catch {
        // If rendering fails, leave blank
      }

      card.addEventListener("click", () => {
        this.viewMode = thumb.mode;
        this.renderConfigPanel();
        this.scheduleUpdate();
      });
    }
  }

  private renderMiniFrequency(canvas: HTMLCanvasElement, freq: import("../data/dataTypes").FrequencyResult[]): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || freq.length === 0) return;

    const W = canvas.width;
    const H = canvas.height;
    const top8 = freq.slice(0, 8);
    const maxVal = top8[0]?.total ?? 1;
    const barHeight = Math.min(18, (H - 20) / top8.length - 2);
    const leftPad = 80;
    const rightPad = 10;
    const barAreaW = W - leftPad - rightPad;

    const isDark = document.body.classList.contains("theme-dark");
    const textColor = isDark ? "#b0b0b0" : "#444";

    for (let i = 0; i < top8.length; i++) {
      const r = top8[i];
      const y = 10 + i * (barHeight + 4);
      const barW = Math.max(2, (r.total / maxVal) * barAreaW);

      // Label
      ctx.fillStyle = textColor;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const label = r.code.length > 10 ? r.code.slice(0, 9) + "\u2026" : r.code;
      ctx.fillText(label, leftPad - 6, y + barHeight / 2);

      // Bar
      ctx.fillStyle = r.color;
      ctx.fillRect(leftPad, y, barW, barHeight);
    }
  }

  private renderMiniCooccurrence(canvas: HTMLCanvasElement, cooc: CooccurrenceResult): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || cooc.codes.length < 2) return;

    const W = canvas.width;
    const H = canvas.height;
    const n = cooc.codes.length;
    const pad = 10;
    const cellSize = Math.min((W - 2 * pad) / n, (H - 2 * pad) / n);
    const offsetX = (W - n * cellSize) / 2;
    const offsetY = (H - n * cellSize) / 2;
    const isDark = document.body.classList.contains("theme-dark");

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = offsetX + j * cellSize;
        const y = offsetY + i * cellSize;
        ctx.fillStyle = this.heatmapColor(cooc.matrix[i][j], cooc.maxValue, isDark);
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  private renderMiniNetwork(canvas: HTMLCanvasElement, cooc: CooccurrenceResult, freq: import("../data/dataTypes").FrequencyResult[]): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || cooc.codes.length < 2) return;

    const W = canvas.width;
    const H = canvas.height;
    const n = cooc.codes.length;
    const freqMap = new Map(freq.map((f) => [f.code, f.total]));
    const maxFreq = Math.max(...cooc.codes.map((c) => freqMap.get(c) ?? 1));

    // Build edges
    interface MiniEdge { i: number; j: number; weight: number; }
    const edges: MiniEdge[] = [];
    let maxWeight = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const w = cooc.matrix[i][j];
        if (w > 0) {
          edges.push({ i, j, weight: w });
          if (w > maxWeight) maxWeight = w;
        }
      }
    }

    // Positions — circle init then 50 iterations of force
    const nodes = cooc.codes.map((code, i) => {
      const angle = (2 * Math.PI * i) / n;
      const spread = Math.min(W, H) * 0.3;
      const f = freqMap.get(code) ?? 1;
      const radius = 4 + (f / maxFreq) * 10;
      return { x: W / 2 + Math.cos(angle) * spread, y: H / 2 + Math.sin(angle) * spread, vx: 0, vy: 0, radius };
    });

    for (let iter = 0; iter < 50; iter++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 3000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx += fx; nodes[i].vy += fy;
          nodes[j].vx -= fx; nodes[j].vy -= fy;
        }
      }
      for (const edge of edges) {
        const ni = nodes[edge.i]; const nj = nodes[edge.j];
        const dx = nj.x - ni.x; const dy = nj.y - ni.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = dist * 0.008 * (maxWeight > 0 ? edge.weight / maxWeight : 1);
        ni.vx += (dx / dist) * force; ni.vy += (dy / dist) * force;
        nj.vx -= (dx / dist) * force; nj.vy -= (dy / dist) * force;
      }
      for (const node of nodes) {
        node.vx += (W / 2 - node.x) * 0.01;
        node.vy += (H / 2 - node.y) * 0.01;
        node.vx *= 0.85; node.vy *= 0.85;
        node.x += node.vx; node.y += node.vy;
        node.x = Math.max(node.radius + 2, Math.min(W - node.radius - 2, node.x));
        node.y = Math.max(node.radius + 2, Math.min(H - node.radius - 2, node.y));
      }
    }

    const isDark = document.body.classList.contains("theme-dark");

    // Draw edges
    for (const edge of edges) {
      const ni = nodes[edge.i]; const nj = nodes[edge.j];
      const opacity = maxWeight > 0 ? 0.15 + (edge.weight / maxWeight) * 0.4 : 0.3;
      ctx.beginPath(); ctx.moveTo(ni.x, ni.y); ctx.lineTo(nj.x, nj.y);
      ctx.strokeStyle = isDark ? `rgba(180,180,200,${opacity})` : `rgba(80,80,100,${opacity})`;
      ctx.lineWidth = 1 + (maxWeight > 0 ? (edge.weight / maxWeight) * 2 : 0);
      ctx.stroke();
    }

    // Draw nodes
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      ctx.beginPath(); ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = cooc.colors[i]; ctx.fill();
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1; ctx.stroke();
    }
  }

  private renderMiniDocMatrix(canvas: HTMLCanvasElement, dm: DocCodeMatrixResult): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || dm.files.length === 0 || dm.codes.length === 0) return;

    const W = canvas.width;
    const H = canvas.height;
    const nFiles = dm.files.length;
    const nCodes = dm.codes.length;
    const pad = 10;
    const cellW = Math.min((W - 2 * pad) / nCodes, 20);
    const cellH = Math.min((H - 2 * pad) / nFiles, 20);
    const offsetX = (W - nCodes * cellW) / 2;
    const offsetY = (H - nFiles * cellH) / 2;
    const isDark = document.body.classList.contains("theme-dark");

    for (let fi = 0; fi < nFiles; fi++) {
      for (let ci = 0; ci < nCodes; ci++) {
        const x = offsetX + ci * cellW;
        const y = offsetY + fi * cellH;
        ctx.fillStyle = this.heatmapColor(dm.matrix[fi][ci], dm.maxValue, isDark);
        ctx.fillRect(x, y, cellW, cellH);
      }
    }
  }

  private renderMiniEvolution(canvas: HTMLCanvasElement, evo: EvolutionResult): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || evo.codes.length === 0 || evo.points.length === 0) return;

    const W = canvas.width;
    const H = canvas.height;
    const nCodes = evo.codes.length;
    const codeIndex = new Map(evo.codes.map((c, i) => [c, i]));
    const pad = 10;
    const laneHeight = Math.min(20, (H - 2 * pad) / nCodes);
    const plotTop = (H - nCodes * laneHeight) / 2;
    const isDark = document.body.classList.contains("theme-dark");

    // Lane separators
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i < nCodes; i++) {
      const y = plotTop + i * laneHeight;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    }

    // Draw points
    for (const p of evo.points) {
      const ci = codeIndex.get(p.code);
      if (ci == null) continue;
      const x = pad + p.position * (W - 2 * pad);
      const y = plotTop + ci * laneHeight + laneHeight / 2;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
    }
  }

  private renderFrequencyChart(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const results = calculateFrequency(this.data, filters);

    if (results.length === 0) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No data matches current filters.",
      });
      return;
    }

    // Sort
    switch (this.sortMode) {
      case "alpha":
        results.sort((a, b) => a.code.localeCompare(b.code));
        break;
      case "freq-desc":
        results.sort((a, b) => b.total - a.total);
        break;
      case "freq-asc":
        results.sort((a, b) => a.total - b.total);
        break;
    }

    // Lazy import Chart.js
    this.renderBarChart(results);
  }

  private async renderBarChart(results: import("../data/dataTypes").FrequencyResult[]): Promise<void> {
    if (!this.chartContainer) return;

    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);

    // Container for scrolling if many codes
    const height = Math.max(300, results.length * 35);
    const wrapper = this.chartContainer.createDiv();
    wrapper.style.height = `${height}px`;
    wrapper.style.position = "relative";

    const canvas = wrapper.createEl("canvas");

    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || "#dcddde";
    const borderColor = styles.getPropertyValue("--background-modifier-border").trim() || "#333";

    const labels = results.map((r) => r.code);

    let datasets: any[];

    if (this.groupMode === "source") {
      const sourceColors: Record<string, string> = {
        markdown: "#42A5F5",
        "csv-segment": "#66BB6A",
        "csv-row": "#81C784",
        image: "#FFA726",
        pdf: "#EF5350",
        audio: "#AB47BC",
      };
      datasets = [
        {
          label: "Markdown",
          data: results.map((r) => r.bySource.markdown),
          backgroundColor: "#42A5F5",
        },
        {
          label: "CSV Segment",
          data: results.map((r) => r.bySource["csv-segment"]),
          backgroundColor: "#66BB6A",
        },
        {
          label: "CSV Row",
          data: results.map((r) => r.bySource["csv-row"]),
          backgroundColor: "#81C784",
        },
        {
          label: "Image",
          data: results.map((r) => r.bySource.image),
          backgroundColor: "#FFA726",
        },
        {
          label: "PDF",
          data: results.map((r) => r.bySource.pdf),
          backgroundColor: "#EF5350",
        },
        {
          label: "Audio",
          data: results.map((r) => r.bySource.audio),
          backgroundColor: "#AB47BC",
        },
      ].filter((ds) => ds.data.some((v: number) => v > 0));
    } else if (this.groupMode === "file") {
      // Collect all files
      const allFiles = new Set<string>();
      for (const r of results) {
        for (const f of Object.keys(r.byFile)) allFiles.add(f);
      }
      const fileList = Array.from(allFiles).sort();
      const fileColors = this.generateFileColors(fileList.length);
      datasets = fileList.map((file, i) => ({
        label: file.split("/").pop() ?? file,
        data: results.map((r) => r.byFile[file] ?? 0),
        backgroundColor: fileColors[i],
      }));
    } else {
      datasets = [
        {
          label: "Count",
          data: results.map((r) => r.total),
          backgroundColor: results.map((r) => r.color),
        },
      ];
    }

    new Chart(canvas, {
      type: "bar",
      data: { labels, datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: this.groupMode !== "none",
            position: "top",
            labels: { color: textColor },
          },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                if (this.groupMode === "none" && items.length > 0) {
                  const idx = items[0].dataIndex;
                  const r = results[idx];
                  const parts: string[] = [];
                  if (r.bySource.markdown > 0) parts.push(`MD: ${r.bySource.markdown}`);
                  if (r.bySource["csv-segment"] > 0) parts.push(`CSV-seg: ${r.bySource["csv-segment"]}`);
                  if (r.bySource["csv-row"] > 0) parts.push(`CSV-row: ${r.bySource["csv-row"]}`);
                  if (r.bySource.image > 0) parts.push(`Img: ${r.bySource.image}`);
                  if (r.bySource.pdf > 0) parts.push(`PDF: ${r.bySource.pdf}`);
                  if (r.bySource.audio > 0) parts.push(`Audio: ${r.bySource.audio}`);
                  return parts.join(", ");
                }
                return "";
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            stacked: this.groupMode !== "none",
            ticks: { stepSize: 1, color: textColor },
            grid: { color: borderColor },
          },
          y: {
            stacked: this.groupMode !== "none",
            grid: { display: false },
            ticks: { color: textColor, font: { size: 12 } },
          },
        },
      },
    });
  }

  /**
   * Reorder co-occurrence matrix in place based on cooccSortMode.
   */
  private reorderCooccurrence(result: CooccurrenceResult): void {
    const n = result.codes.length;
    if (n < 2 || this.cooccSortMode === "alpha") return; // already alpha-sorted

    let order: number[];

    if (this.cooccSortMode === "frequency") {
      // Sort by diagonal (frequency) descending
      const indices = Array.from({ length: n }, (_, i) => i);
      indices.sort((a, b) => result.matrix[b][b] - result.matrix[a][a]);
      order = indices;
    } else {
      // Cluster: build Jaccard distance matrix from co-occurrence, then hierarchical cluster
      const distMatrix: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row: number[] = [];
        for (let j = 0; j < n; j++) {
          if (i === j) {
            row.push(0);
          } else {
            const freqI = result.matrix[i][i];
            const freqJ = result.matrix[j][j];
            const coij = result.matrix[i][j];
            const union = freqI + freqJ - coij;
            row.push(union > 0 ? 1 - coij / union : 1);
          }
        }
        distMatrix.push(row);
      }
      const clusterResult = hierarchicalCluster(distMatrix);
      order = clusterResult.indices;
    }

    // Apply reordering
    const newCodes = order.map((i) => result.codes[i]);
    const newColors = order.map((i) => result.colors[i]);
    const newMatrix: number[][] = [];
    for (const i of order) {
      const row: number[] = [];
      for (const j of order) {
        row.push(result.matrix[i][j]);
      }
      newMatrix.push(row);
    }

    result.codes = newCodes;
    result.colors = newColors;
    result.matrix = newMatrix;
    // Recompute maxValue
    let maxValue = 0;
    for (const row of newMatrix) {
      for (const v of row) {
        if (v > maxValue) maxValue = v;
      }
    }
    result.maxValue = maxValue;
  }

  private renderCooccurrenceMatrix(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const result = calculateCooccurrence(this.data, filters);

    if (result.codes.length < 2) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "Need at least 2 codes for co-occurrence matrix.",
      });
      return;
    }

    // Apply sort reordering
    this.reorderCooccurrence(result);

    const n = result.codes.length;
    const cellSize = n > 25 ? 35 : n > 15 ? Math.max(35, Math.floor(500 / n)) : 60;
    const labelSpace = 120;

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.position = "relative";
    wrapper.style.overflow = "auto";

    const canvas = wrapper.createEl("canvas");
    const totalW = labelSpace + n * cellSize;
    const totalH = labelSpace + n * cellSize;
    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${totalH}px`;

    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");

    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

    // Prepare display values
    const displayMatrix = this.computeDisplayMatrix(result);
    const isNormalized = this.displayMode === "jaccard" || this.displayMode === "dice";

    // Draw cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = labelSpace + j * cellSize;
        const y = labelSpace + i * cellSize;
        const rawVal = result.matrix[i][j];
        const dispVal = displayMatrix[i][j];

        // Cell background — for Jaccard/Dice use display value (0-1) for coloring
        const heatVal = isNormalized ? dispVal : rawVal;
        const heatMax = isNormalized ? 1 : result.maxValue;
        ctx.fillStyle = this.heatmapColor(heatVal, heatMax, isDark);
        ctx.fillRect(x, y, cellSize, cellSize);

        // Diagonal highlight
        if (i === j) {
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }

        // Cell border
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // Value text
        let textVal: string;
        if (isNormalized) {
          textVal = dispVal.toFixed(2);
        } else if (this.displayMode === "percentage" && i !== j) {
          textVal = `${dispVal.toFixed(0)}%`;
        } else {
          textVal = `${dispVal}`;
        }
        const textBright = this.isLightColor(this.heatmapColor(heatVal, heatMax, isDark));
        ctx.fillStyle = textBright ? "#1a1a1a" : "#f0f0f0";
        ctx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(textVal, x + cellSize / 2, y + cellSize / 2);
      }
    }

    // Draw left labels
    ctx.fillStyle = textColor;
    ctx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const y = labelSpace + i * cellSize + cellSize / 2;
      const label = result.codes[i].length > 15
        ? result.codes[i].slice(0, 14) + "\u2026"
        : result.codes[i];
      ctx.fillText(label, labelSpace - 6, y);
    }

    // Draw top labels (rotated)
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let j = 0; j < n; j++) {
      const x = labelSpace + j * cellSize + cellSize / 2;
      ctx.save();
      ctx.translate(x, labelSpace - 6);
      ctx.rotate(-Math.PI / 4);
      const label = result.codes[j].length > 15
        ? result.codes[j].slice(0, 14) + "\u2026"
        : result.codes[j];
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Tooltip
    const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
    tooltip.style.display = "none";

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const col = Math.floor((mx - labelSpace) / cellSize);
      const row = Math.floor((my - labelSpace) / cellSize);

      if (col >= 0 && col < n && row >= 0 && row < n) {
        const val = result.matrix[row][col];
        const dispVal = displayMatrix[row][col];
        const suffix = this.displayMode === "percentage" && row !== col ? "%" : "";
        let dispText: string;
        if (row === col) {
          dispText = `${result.codes[row]}: ${val} total`;
        } else if (isNormalized) {
          dispText = `${result.codes[row]} \u00d7 ${result.codes[col]}: ${dispVal.toFixed(2)}`;
        } else {
          dispText = `${result.codes[row]} \u00d7 ${result.codes[col]}: ${dispVal}${suffix}`;
        }
        const text = dispText;
        tooltip.textContent = text;
        tooltip.style.display = "";
        tooltip.style.left = `${mx + 12}px`;
        tooltip.style.top = `${my + 12}px`;
      } else {
        tooltip.style.display = "none";
      }
    });

    canvas.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  }

  // ─── Network Graph ───

  private renderGraphOptionsSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Graph options" });

    // Edge labels toggle
    const labelRow = section.createDiv({ cls: "codemarker-config-row" });
    const labelCb = labelRow.createEl("input", { type: "checkbox" });
    labelCb.checked = this.showEdgeLabels;
    labelRow.createSpan({ text: "Show edge weights" });
    labelCb.addEventListener("change", () => {
      this.showEdgeLabels = labelCb.checked;
      this.scheduleUpdate();
    });
    labelRow.addEventListener("click", (e) => {
      if (e.target !== labelCb) { labelCb.checked = !labelCb.checked; labelCb.dispatchEvent(new Event("change")); }
    });

    // Min edge weight
    const weightRow = section.createDiv({ cls: "codemarker-config-row" });
    weightRow.createSpan({ text: "Min edge weight" });
    const weightInput = weightRow.createEl("input", {
      cls: "codemarker-config-number",
      attr: { type: "number", min: "1", value: String(this.minEdgeWeight) },
    });
    weightInput.style.marginLeft = "auto";
    weightInput.addEventListener("input", () => {
      const val = parseInt(weightInput.value);
      if (!isNaN(val) && val >= 1) {
        this.minEdgeWeight = val;
        this.scheduleUpdate();
      }
    });
  }

  private renderNetworkGraph(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const cooc = calculateCooccurrence(this.data, filters);
    const freq = calculateFrequency(this.data, filters);

    if (cooc.codes.length < 2) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "Need at least 2 codes for network graph.",
      });
      return;
    }

    const n = cooc.codes.length;
    const freqMap = new Map(freq.map((f) => [f.code, f.total]));

    // Build edges
    interface Edge { i: number; j: number; weight: number; }
    const edges: Edge[] = [];
    let maxWeight = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const w = cooc.matrix[i][j];
        if (w >= this.minEdgeWeight) {
          edges.push({ i, j, weight: w });
          if (w > maxWeight) maxWeight = w;
        }
      }
    }

    if (edges.length === 0) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No co-occurrence edges above the minimum weight.",
      });
      return;
    }

    // Canvas setup
    const wrapper = this.chartContainer.createDiv();
    wrapper.style.position = "relative";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";

    const canvas = wrapper.createEl("canvas");
    const rect = this.chartContainer.getBoundingClientRect();
    const W = Math.max(600, rect.width - 32);
    const H = Math.max(400, rect.height - 32);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

    // Node sizing based on frequency
    const maxFreq = Math.max(...cooc.codes.map((c) => freqMap.get(c) ?? 1));
    const minRadius = 16;
    const maxRadius = 40;

    // Initialize positions in a circle
    interface Node { x: number; y: number; vx: number; vy: number; radius: number; }
    const nodes: Node[] = cooc.codes.map((code, i) => {
      const angle = (2 * Math.PI * i) / n;
      const spread = Math.min(W, H) * 0.35;
      const f = freqMap.get(code) ?? 1;
      const radius = minRadius + ((f / maxFreq) * (maxRadius - minRadius));
      return {
        x: W / 2 + Math.cos(angle) * spread,
        y: H / 2 + Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
        radius,
      };
    });

    // Force-directed simulation
    const iterations = 300;
    const repulsion = 8000;
    const attraction = 0.005;
    const damping = 0.9;
    const centerGravity = 0.01;

    for (let iter = 0; iter < iterations; iter++) {
      // Repulsion between all pairs
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx += fx;
          nodes[i].vy += fy;
          nodes[j].vx -= fx;
          nodes[j].vy -= fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const ni = nodes[edge.i];
        const nj = nodes[edge.j];
        const dx = nj.x - ni.x;
        const dy = nj.y - ni.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = dist * attraction * (edge.weight / maxWeight);
        const fx = (dx / Math.max(dist, 1)) * force;
        const fy = (dy / Math.max(dist, 1)) * force;
        ni.vx += fx;
        ni.vy += fy;
        nj.vx -= fx;
        nj.vy -= fy;
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (W / 2 - node.x) * centerGravity;
        node.vy += (H / 2 - node.y) * centerGravity;
      }

      // Apply velocities with damping
      for (const node of nodes) {
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
        // Clamp to canvas bounds
        node.x = Math.max(node.radius + 5, Math.min(W - node.radius - 5, node.x));
        node.y = Math.max(node.radius + 5, Math.min(H - node.radius - 5, node.y));
      }
    }

    // ── Draw ──

    // Edges
    for (const edge of edges) {
      const ni = nodes[edge.i];
      const nj = nodes[edge.j];
      const thickness = 1 + (edge.weight / maxWeight) * 5;
      const opacity = 0.2 + (edge.weight / maxWeight) * 0.6;

      ctx.beginPath();
      ctx.moveTo(ni.x, ni.y);
      ctx.lineTo(nj.x, nj.y);
      ctx.strokeStyle = isDark
        ? `rgba(180, 180, 200, ${opacity})`
        : `rgba(80, 80, 100, ${opacity})`;
      ctx.lineWidth = thickness;
      ctx.stroke();

      // Edge weight label
      if (this.showEdgeLabels && edge.weight > 0) {
        const mx = (ni.x + nj.x) / 2;
        const my = (ni.y + nj.y) / 2;
        ctx.font = "10px sans-serif";
        ctx.fillStyle = isDark ? "rgba(180,180,200,0.7)" : "rgba(80,80,100,0.7)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(edge.weight), mx, my);
      }
    }

    // Nodes
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const color = cooc.colors[i];

      // Shadow
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      // Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      // Border
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      const label = cooc.codes[i].length > 12
        ? cooc.codes[i].slice(0, 11) + "\u2026"
        : cooc.codes[i];
      ctx.font = `bold ${Math.max(10, Math.min(13, node.radius * 0.5))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Text color contrasting with node
      const bright = this.isLightColor(color);
      ctx.fillStyle = bright ? "#1a1a1a" : "#f0f0f0";
      ctx.fillText(label, node.x, node.y);
    }

    // Tooltip on hover
    const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
    tooltip.style.display = "none";

    canvas.addEventListener("mousemove", (e) => {
      const cr = canvas.getBoundingClientRect();
      const mx = e.clientX - cr.left;
      const my = e.clientY - cr.top;

      // Check nodes
      for (let i = 0; i < n; i++) {
        const node = nodes[i];
        const dx = mx - node.x;
        const dy = my - node.y;
        if (dx * dx + dy * dy <= node.radius * node.radius) {
          const f = freqMap.get(cooc.codes[i]) ?? 0;
          // Find connected edges
          const connections = edges
            .filter((e) => e.i === i || e.j === i)
            .map((e) => {
              const other = e.i === i ? cooc.codes[e.j] : cooc.codes[e.i];
              return `${other} (${e.weight})`;
            });
          let text = `${cooc.codes[i]}: ${f} markers`;
          if (connections.length > 0) {
            text += `\nLinks: ${connections.join(", ")}`;
          }
          tooltip.style.whiteSpace = "pre";
          tooltip.textContent = text;
          tooltip.style.display = "";
          tooltip.style.left = `${mx + 12}px`;
          tooltip.style.top = `${my + 12}px`;
          canvas.style.cursor = "pointer";
          return;
        }
      }
      tooltip.style.display = "none";
      canvas.style.cursor = "default";
    });

    canvas.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
      canvas.style.cursor = "default";
    });
  }

  // ─── Document-Code Matrix ───

  private renderMatrixSortSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Sort files" });

    for (const [value, label] of [
      ["alpha", "Alphabetical"],
      ["total", "By total markers"],
    ] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "matrixSortMode";
      radio.value = value;
      radio.checked = this.matrixSortMode === value;
      row.createSpan({ text: label });

      radio.addEventListener("change", () => {
        this.matrixSortMode = value;
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

  private renderDocCodeMatrix(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const result = calculateDocumentCodeMatrix(this.data, filters);

    if (result.files.length === 0 || result.codes.length === 0) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No data matches current filters.",
      });
      return;
    }

    // Sort files
    let fileOrder = result.files.map((f, i) => i);
    if (this.matrixSortMode === "total") {
      const fileTotals = result.files.map((_, fi) =>
        result.matrix[fi].reduce((a, b) => a + b, 0)
      );
      fileOrder.sort((a, b) => fileTotals[b] - fileTotals[a]);
    }

    const nFiles = result.files.length;
    const nCodes = result.codes.length;
    const cellSize = nFiles > 20 || nCodes > 20
      ? Math.max(30, Math.floor(500 / Math.max(nFiles, nCodes)))
      : 50;
    const labelSpaceLeft = 150;
    const labelSpaceTop = 120;

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.position = "relative";
    wrapper.style.overflow = "auto";

    const canvas = wrapper.createEl("canvas");
    const totalW = labelSpaceLeft + nCodes * cellSize;
    const totalH = labelSpaceTop + nFiles * cellSize;
    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${totalH}px`;

    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

    // Draw cells
    for (let fi = 0; fi < nFiles; fi++) {
      const fileIdx = fileOrder[fi];
      for (let ci = 0; ci < nCodes; ci++) {
        const x = labelSpaceLeft + ci * cellSize;
        const y = labelSpaceTop + fi * cellSize;
        const val = result.matrix[fileIdx][ci];

        ctx.fillStyle = this.heatmapColor(val, result.maxValue, isDark);
        ctx.fillRect(x, y, cellSize, cellSize);

        // Cell border
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // Value text
        if (val > 0) {
          const textBright = this.isLightColor(this.heatmapColor(val, result.maxValue, isDark));
          ctx.fillStyle = textBright ? "#1a1a1a" : "#f0f0f0";
          ctx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(val), x + cellSize / 2, y + cellSize / 2);
        }
      }
    }

    // Left labels (file basenames)
    ctx.fillStyle = textColor;
    ctx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let fi = 0; fi < nFiles; fi++) {
      const fileIdx = fileOrder[fi];
      const y = labelSpaceTop + fi * cellSize + cellSize / 2;
      const basename = result.files[fileIdx].split("/").pop() ?? result.files[fileIdx];
      const label = basename.length > 20 ? basename.slice(0, 19) + "\u2026" : basename;
      ctx.fillText(label, labelSpaceLeft - 6, y);
    }

    // Top labels (codes, rotated)
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let ci = 0; ci < nCodes; ci++) {
      const x = labelSpaceLeft + ci * cellSize + cellSize / 2;
      ctx.save();
      ctx.translate(x, labelSpaceTop - 6);
      ctx.rotate(-Math.PI / 4);
      const label = result.codes[ci].length > 15
        ? result.codes[ci].slice(0, 14) + "\u2026"
        : result.codes[ci];
      ctx.fillStyle = result.colors[ci];
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Tooltip
    const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
    tooltip.style.display = "none";

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const col = Math.floor((mx - labelSpaceLeft) / cellSize);
      const row = Math.floor((my - labelSpaceTop) / cellSize);

      if (col >= 0 && col < nCodes && row >= 0 && row < nFiles) {
        const fileIdx = fileOrder[row];
        const val = result.matrix[fileIdx][col];
        const basename = result.files[fileIdx].split("/").pop() ?? result.files[fileIdx];
        tooltip.textContent = `${basename} \u00d7 ${result.codes[col]}: ${val} marker${val !== 1 ? "s" : ""}`;
        tooltip.style.display = "";
        tooltip.style.left = `${mx + 12}px`;
        tooltip.style.top = `${my + 12}px`;
      } else {
        tooltip.style.display = "none";
      }
    });

    canvas.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  }

  // ─── Code Evolution ───

  private renderEvolutionFileSection(): void {
    if (!this.data) return;
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "File" });

    const filters = this.buildFilterConfig();
    const evoResult = calculateEvolution(this.data, filters);

    const select = section.createEl("select", { cls: "codemarker-config-select" });
    const allOpt = select.createEl("option", { text: "All files", value: "" });
    if (this.evolutionFile === "") allOpt.selected = true;

    for (const f of evoResult.files) {
      const basename = f.split("/").pop() ?? f;
      const opt = select.createEl("option", { text: basename, value: f });
      if (this.evolutionFile === f) opt.selected = true;
    }

    select.addEventListener("change", () => {
      this.evolutionFile = select.value;
      this.scheduleUpdate();
    });
  }

  private renderEvolutionChart(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const result = calculateEvolution(this.data, filters);

    // Filter by selected file
    const points = this.evolutionFile
      ? result.points.filter((p) => p.file === this.evolutionFile)
      : result.points;

    if (points.length === 0) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No positional data available for current filters.",
      });
      return;
    }

    const codes = result.codes;
    const nCodes = codes.length;
    const codeIndex = new Map(codes.map((c, i) => [c, i]));

    // Canvas setup
    const wrapper = this.chartContainer.createDiv();
    wrapper.style.position = "relative";
    wrapper.style.overflow = "auto";

    const laneHeight = 40;
    const paddingLeft = 140;
    const paddingRight = 30;
    const paddingTop = 40;
    const paddingBottom = 40;
    const chartWidth = Math.max(600, (this.chartContainer.getBoundingClientRect().width || 700) - 32);
    const chartHeight = paddingTop + nCodes * laneHeight + paddingBottom;

    const canvas = wrapper.createEl("canvas");
    canvas.width = chartWidth;
    canvas.height = chartHeight;
    canvas.style.width = `${chartWidth}px`;
    canvas.style.height = `${chartHeight}px`;

    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const laneLineColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

    const plotLeft = paddingLeft;
    const plotRight = chartWidth - paddingRight;
    const plotWidth = plotRight - plotLeft;

    // Draw vertical grid lines at 0%, 25%, 50%, 75%, 100%
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = "10px sans-serif";
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let pct = 0; pct <= 100; pct += 25) {
      const x = plotLeft + (pct / 100) * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, paddingTop + nCodes * laneHeight);
      ctx.stroke();
      ctx.fillText(`${pct}%`, x, paddingTop + nCodes * laneHeight + 6);
    }

    // Draw lane separators and code labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < nCodes; i++) {
      const y = paddingTop + i * laneHeight;

      // Lane separator
      if (i > 0) {
        ctx.strokeStyle = laneLineColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();
      }

      // Code label
      const label = codes[i].length > 18 ? codes[i].slice(0, 17) + "\u2026" : codes[i];
      ctx.fillStyle = result.colors[i];
      ctx.font = "12px sans-serif";
      ctx.fillText(label, paddingLeft - 8, y + laneHeight / 2);
    }

    // Draw points
    const drawnPoints: Array<{ x: number; y: number; point: typeof points[0] }> = [];
    for (const p of points) {
      const ci = codeIndex.get(p.code);
      if (ci == null) continue;
      const x = plotLeft + p.position * plotWidth;
      const y = paddingTop + ci * laneHeight + laneHeight / 2;
      const radius = 6;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      drawnPoints.push({ x, y, point: p });
    }

    // Tooltip
    const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
    tooltip.style.display = "none";

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      for (const dp of drawnPoints) {
        const dx = mx - dp.x;
        const dy = my - dp.y;
        if (dx * dx + dy * dy <= 64) { // 8px radius hit area
          const p = dp.point;
          const basename = p.file.split("/").pop() ?? p.file;
          const lineInfo = p.fromLine === p.toLine
            ? `line ${p.fromLine}`
            : `lines ${p.fromLine}-${p.toLine}`;
          tooltip.textContent = `${p.code} @ ${lineInfo} in ${basename}`;
          tooltip.style.display = "";
          tooltip.style.left = `${mx + 12}px`;
          tooltip.style.top = `${my + 12}px`;
          canvas.style.cursor = "pointer";
          return;
        }
      }
      tooltip.style.display = "none";
      canvas.style.cursor = "default";
    });

    canvas.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
      canvas.style.cursor = "default";
    });
  }

  // ─── Text Retrieval ───

  private renderTextRetrieval(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const container = this.chartContainer.createDiv({ cls: "codemarker-tr-wrapper" });

    // Toolbar
    const toolbar = container.createDiv({ cls: "codemarker-tr-toolbar" });

    const searchInput = toolbar.createEl("input", {
      cls: "codemarker-tr-search",
      attr: { type: "text", placeholder: "Search codes or text..." },
    });
    searchInput.value = this.trSearch;
    searchInput.addEventListener("input", () => {
      this.trSearch = searchInput.value;
      this.renderSegments(contentEl, this.trSegments);
    });

    const groupToggle = toolbar.createDiv({ cls: "codemarker-tr-group-toggle" });
    for (const [value, label] of [["code", "By Code"], ["file", "By File"]] as const) {
      const btn = groupToggle.createDiv({
        cls: "codemarker-tr-group-btn" + (this.trGroupBy === value ? " is-active" : ""),
        text: label,
      });
      btn.addEventListener("click", () => {
        this.trGroupBy = value;
        this.trCollapsed.clear();
        this.renderSegments(contentEl, this.trSegments);
        // Update active state
        groupToggle.querySelectorAll(".codemarker-tr-group-btn").forEach((el) => el.removeClass("is-active"));
        btn.addClass("is-active");
      });
    }

    const contentEl = container.createDiv({ cls: "codemarker-tr-content" });

    // Filter markers per current filters
    const filtered = this.data.markers.filter((m) =>
      filters.sources.includes(m.source) &&
      m.codes.some((c) => !filters.excludeCodes.includes(c))
    );

    if (filtered.length === 0) {
      contentEl.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No markers match current filters.",
      });
      return;
    }

    // Show loading
    const loadingEl = contentEl.createDiv({ cls: "codemarker-tr-loading", text: "Extracting text..." });

    this.loadAndRenderSegments(filtered, contentEl, loadingEl);
  }

  private async loadAndRenderSegments(
    markers: import("../data/dataTypes").UnifiedMarker[],
    container: HTMLElement,
    loadingEl: HTMLElement
  ): Promise<void> {
    const extractor = new TextExtractor(this.plugin.app.vault);
    this.trSegments = await extractor.extractBatch(markers);
    loadingEl.remove();
    this.renderSegments(container, this.trSegments);
  }

  private renderSegments(container: HTMLElement, segments: ExtractedSegment[]): void {
    // Clear previous content but keep toolbar (toolbar is sibling in wrapper)
    container.empty();

    if (segments.length === 0) {
      container.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No segments to display.",
      });
      return;
    }

    // Apply search filter
    const query = this.trSearch.toLowerCase();
    const filtered = query
      ? segments.filter((s) =>
          s.codes.some((c) => c.toLowerCase().includes(query)) ||
          s.text.toLowerCase().includes(query) ||
          s.file.toLowerCase().includes(query)
        )
      : segments;

    if (filtered.length === 0) {
      container.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No results match your search.",
      });
      return;
    }

    // Code color map
    const codeColorMap = new Map<string, string>();
    if (this.data) {
      for (const c of this.data.codes) codeColorMap.set(c.name, c.color);
    }

    if (this.trGroupBy === "code") {
      // Group by code
      const byCode = new Map<string, ExtractedSegment[]>();
      for (const seg of filtered) {
        for (const code of seg.codes) {
          const list = byCode.get(code) || [];
          list.push(seg);
          byCode.set(code, list);
        }
      }
      const sortedCodes = Array.from(byCode.keys()).sort();
      for (const code of sortedCodes) {
        this.renderCodeGroup(container, code, byCode.get(code)!, codeColorMap);
      }
    } else {
      // Group by file
      const byFile = new Map<string, ExtractedSegment[]>();
      for (const seg of filtered) {
        const list = byFile.get(seg.file) || [];
        list.push(seg);
        byFile.set(seg.file, list);
      }
      const sortedFiles = Array.from(byFile.keys()).sort();
      for (const file of sortedFiles) {
        this.renderFileGroup(container, file, byFile.get(file)!, codeColorMap);
      }
    }
  }

  private renderCodeGroup(
    container: HTMLElement,
    code: string,
    segments: ExtractedSegment[],
    codeColorMap: Map<string, string>
  ): void {
    const section = container.createDiv({ cls: "codemarker-tr-section" });
    const header = section.createDiv({ cls: "codemarker-tr-section-header" });
    const isCollapsed = this.trCollapsed.has("code:" + code);

    const chevron = header.createDiv({ cls: "codemarker-tr-chevron" + (isCollapsed ? " is-collapsed" : "") });
    setIcon(chevron, "chevron-down");

    const swatch = header.createDiv({ cls: "codemarker-tr-swatch" });
    swatch.style.backgroundColor = codeColorMap.get(code) ?? "#6200EE";

    header.createDiv({ cls: "codemarker-tr-section-title", text: code });
    header.createDiv({ cls: "codemarker-tr-section-count", text: `(${segments.length})` });

    const body = section.createDiv({ cls: "codemarker-tr-section-body" });
    if (isCollapsed) body.style.display = "none";

    header.addEventListener("click", () => {
      const key = "code:" + code;
      if (this.trCollapsed.has(key)) {
        this.trCollapsed.delete(key);
        body.style.display = "";
        chevron.removeClass("is-collapsed");
      } else {
        this.trCollapsed.add(key);
        body.style.display = "none";
        chevron.addClass("is-collapsed");
      }
    });

    for (const seg of segments) {
      this.renderSegmentCard(body, seg, codeColorMap);
    }
  }

  private renderFileGroup(
    container: HTMLElement,
    file: string,
    segments: ExtractedSegment[],
    codeColorMap: Map<string, string>
  ): void {
    const section = container.createDiv({ cls: "codemarker-tr-section" });
    const header = section.createDiv({ cls: "codemarker-tr-section-header" });
    const isCollapsed = this.trCollapsed.has("file:" + file);

    const chevron = header.createDiv({ cls: "codemarker-tr-chevron" + (isCollapsed ? " is-collapsed" : "") });
    setIcon(chevron, "chevron-down");

    const iconEl = header.createDiv({ cls: "codemarker-tr-file-icon" });
    setIcon(iconEl, "file-text");

    const basename = file.split("/").pop() ?? file;
    header.createDiv({ cls: "codemarker-tr-section-title", text: basename });
    header.createDiv({ cls: "codemarker-tr-section-count", text: `(${segments.length})` });

    const body = section.createDiv({ cls: "codemarker-tr-section-body" });
    if (isCollapsed) body.style.display = "none";

    header.addEventListener("click", () => {
      const key = "file:" + file;
      if (this.trCollapsed.has(key)) {
        this.trCollapsed.delete(key);
        body.style.display = "";
        chevron.removeClass("is-collapsed");
      } else {
        this.trCollapsed.add(key);
        body.style.display = "none";
        chevron.addClass("is-collapsed");
      }
    });

    for (const seg of segments) {
      this.renderSegmentCard(body, seg, codeColorMap);
    }
  }

  private renderSegmentCard(
    container: HTMLElement,
    seg: ExtractedSegment,
    codeColorMap: Map<string, string>
  ): void {
    const card = container.createDiv({ cls: "codemarker-tr-card" });

    // Header row: source badge + file link + location
    const cardHeader = card.createDiv({ cls: "codemarker-tr-card-header" });

    // Source badge
    const badgeCls = seg.source === "audio"
      ? "is-audio"
      : seg.source === "video"
      ? "is-video"
      : seg.source === "markdown"
      ? "is-markdown"
      : seg.source === "csv-segment"
      ? "is-csv-segment"
      : seg.source === "csv-row"
      ? "is-csv-row"
      : seg.source === "pdf"
      ? "is-pdf"
      : "is-image";
    const badgeText = seg.source === "audio"
      ? "AUD"
      : seg.source === "video"
      ? "VID"
      : seg.source === "markdown"
      ? "MD"
      : seg.source === "csv-segment"
      ? "CSV"
      : seg.source === "csv-row"
      ? "ROW"
      : seg.source === "pdf"
      ? "PDF"
      : "IMG";
    cardHeader.createDiv({ cls: `codemarker-tr-source-badge ${badgeCls}`, text: badgeText });

    // File link
    const basename = seg.file.split("/").pop() ?? seg.file;
    const fileLink = cardHeader.createDiv({ cls: "codemarker-tr-file-link", text: basename });
    fileLink.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navigateToSegment(seg);
    });

    // Location
    const loc = this.formatLocation(seg);
    if (loc) {
      cardHeader.createDiv({ cls: "codemarker-tr-location", text: loc });
    }

    // Text content
    const text = seg.text.length > 500 ? seg.text.slice(0, 497) + "..." : seg.text;
    card.createDiv({ cls: "codemarker-tr-text", text: text || "[empty]" });

    // Code chips
    const chips = card.createDiv({ cls: "codemarker-tr-chips" });
    for (const code of seg.codes) {
      const chip = chips.createDiv({ cls: "codemarker-tr-chip" });
      const dot = chip.createDiv({ cls: "codemarker-tr-chip-dot" });
      dot.style.backgroundColor = codeColorMap.get(code) ?? "#6200EE";
      chip.createSpan({ text: code });
    }

    // Click card to navigate
    card.addEventListener("click", () => this.navigateToSegment(seg));
  }

  private formatAudioTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "0:00.0";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  }

  private formatLocation(seg: ExtractedSegment): string {
    if (seg.source === "audio") {
      const from = seg.meta?.audioFrom;
      const to = seg.meta?.audioTo;
      if (from != null && to != null) return this.formatAudioTime(from) + " \u2013 " + this.formatAudioTime(to);
      return "";
    }
    if (seg.source === "video") {
      const from = seg.meta?.videoFrom;
      const to = seg.meta?.videoTo;
      if (from != null && to != null) return this.formatAudioTime(from) + " \u2013 " + this.formatAudioTime(to);
      return "";
    }
    if (seg.source === "csv-row") {
      const row = seg.meta?.row;
      const col = seg.meta?.column;
      if (row != null && col) return `Row ${row}:${col}`;
      if (row != null) return `Row ${row}`;
      return "";
    }
    if (seg.source === "csv-segment") {
      const row = seg.meta?.row;
      const col = seg.meta?.column;
      if (row != null && col) return `Row ${row}:${col}`;
      return "";
    }
    if (seg.source === "image") {
      return seg.meta?.regionType ?? "region";
    }
    if (seg.source === "pdf") {
      const page = seg.meta?.page;
      return page != null ? `Page ${page + 1}` : "";
    }
    // Markdown
    const from = seg.fromLine;
    const to = seg.toLine;
    if (from != null && to != null) {
      return from === to ? `L${from + 1}` : `L${from + 1}\u2013${to + 1}`;
    }
    return "";
  }

  private navigateToSegment(seg: ExtractedSegment): void {
    const file = seg.file;
    if (seg.source === "audio") {
      const seekTo = seg.meta?.audioFrom ?? 0;
      (this.plugin.app.workspace as any).trigger('codemarker-audio:seek', {
        file: seg.file,
        seekTo,
      });
      return;
    }
    if (seg.source === "video") {
      const seekTo = seg.meta?.videoFrom ?? 0;
      (this.plugin.app.workspace as any).trigger('codemarker-video:seek', {
        file: seg.file,
        seekTo,
      });
      return;
    }
    this.plugin.app.workspace.openLinkText(file, "", "tab").then(() => {
      // Try to scroll to line for markdown files
      if (seg.source === "markdown" && seg.fromLine != null) {
        setTimeout(() => {
          const leaf = this.plugin.app.workspace.getLeaf();
          const view = leaf?.view;
          if (view && "editor" in view) {
            const editor = (view as any).editor;
            if (editor?.setCursor) {
              editor.setCursor({ line: seg.fromLine ?? 0, ch: seg.fromCh ?? 0 });
              editor.scrollIntoView(
                { from: { line: seg.fromLine ?? 0, ch: 0 }, to: { line: seg.toLine ?? seg.fromLine ?? 0, ch: 0 } },
                true
              );
            }
          }
        }, 200);
      }
    });
  }

  private computeDisplayMatrix(result: CooccurrenceResult): number[][] {
    const n = result.codes.length;
    const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const raw = result.matrix[i][j];
        if (this.displayMode === "absolute") {
          m[i][j] = raw;
        } else if (this.displayMode === "presence") {
          m[i][j] = raw > 0 ? 1 : 0;
        } else if (this.displayMode === "jaccard") {
          if (i === j) {
            m[i][j] = raw > 0 ? 1 : 0;
          } else {
            const union = result.matrix[i][i] + result.matrix[j][j] - raw;
            m[i][j] = union > 0 ? Math.round((raw / union) * 100) / 100 : 0;
          }
        } else if (this.displayMode === "dice") {
          if (i === j) {
            m[i][j] = raw > 0 ? 1 : 0;
          } else {
            const sum = result.matrix[i][i] + result.matrix[j][j];
            m[i][j] = sum > 0 ? Math.round((2 * raw / sum) * 100) / 100 : 0;
          }
        } else {
          // percentage
          if (i === j) {
            m[i][j] = raw;
          } else {
            const minFreq = Math.min(result.matrix[i][i], result.matrix[j][j]);
            m[i][j] = minFreq > 0 ? Math.round((raw / minFreq) * 100) : 0;
          }
        }
      }
    }
    return m;
  }

  private heatmapColor(value: number, maxValue: number, isDark: boolean): string {
    if (value === 0 || maxValue === 0) return isDark ? "#2a2a2a" : "#f5f5f5";
    const intensity = value / maxValue;
    if (isDark) {
      const r = Math.round(42 + intensity * (229 - 42));
      const g = Math.round(42 + intensity * (57 - 42));
      const b = Math.round(42 + intensity * (53 - 42));
      return `rgb(${r},${g},${b})`;
    } else {
      const r = Math.round(245 + intensity * (229 - 245));
      const g = Math.round(245 + intensity * (57 - 245));
      const b = Math.round(245 + intensity * (53 - 245));
      return `rgb(${r},${g},${b})`;
    }
  }

  private isLightColor(color: string): boolean {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return true;
    const [, r, g, b] = match.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }

  private generateFileColors(count: number): string[] {
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 137.5) % 360; // golden angle for good distribution
      colors.push(`hsl(${hue}, 60%, 55%)`);
    }
    return colors;
  }

  // ─── Word Cloud ───

  private renderWordCloudOptionsSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Word Cloud" });

    // Stop words language
    const langLabel = section.createDiv({ cls: "codemarker-config-sublabel", text: "Stop words" });
    for (const [value, label] of [
      ["pt", "PT"],
      ["en", "EN"],
      ["both", "PT + EN"],
    ] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "wcStopWords";
      radio.value = value;
      radio.checked = this.wcStopWordsLang === value;
      row.createSpan({ text: label });
      radio.addEventListener("change", () => {
        this.wcStopWordsLang = value;
        this.scheduleUpdate();
      });
      row.addEventListener("click", (e) => {
        if (e.target !== radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); }
      });
    }

    // Min word length
    const lenRow = section.createDiv({ cls: "codemarker-config-row" });
    lenRow.createSpan({ text: "Min length" });
    const lenInput = lenRow.createEl("input", {
      cls: "codemarker-config-number",
      attr: { type: "number", min: "2", max: "6", value: String(this.wcMinWordLength) },
    });
    lenInput.addEventListener("input", () => {
      const v = parseInt(lenInput.value);
      if (!isNaN(v) && v >= 2 && v <= 6) { this.wcMinWordLength = v; this.scheduleUpdate(); }
    });

    // Max words
    const maxRow = section.createDiv({ cls: "codemarker-config-row" });
    maxRow.createSpan({ text: "Max words" });
    const maxInput = maxRow.createEl("input", {
      cls: "codemarker-config-number",
      attr: { type: "number", min: "20", max: "200", value: String(this.wcMaxWords) },
    });
    maxInput.addEventListener("input", () => {
      const v = parseInt(maxInput.value);
      if (!isNaN(v) && v >= 20 && v <= 200) { this.wcMaxWords = v; this.scheduleUpdate(); }
    });
  }

  private renderWordCloud(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const filtered = this.data.markers.filter((m) =>
      filters.sources.includes(m.source) &&
      m.codes.some((c) => !filters.excludeCodes.includes(c))
    );

    if (filtered.length === 0) {
      this.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "No data matches current filters." });
      return;
    }

    const loadingEl = this.chartContainer.createDiv({ cls: "codemarker-wc-loading", text: "Extracting text..." });
    this.loadAndRenderWordCloud(filtered, loadingEl);
  }

  private async loadAndRenderWordCloud(
    markers: import("../data/dataTypes").UnifiedMarker[],
    loadingEl: HTMLElement,
  ): Promise<void> {
    if (!this.chartContainer) return;

    const extractor = new TextExtractor(this.plugin.app.vault);
    const segments = await extractor.extractBatch(markers);
    loadingEl.remove();

    const results = calculateWordFrequencies(segments, {
      stopWordsLang: this.wcStopWordsLang,
      minWordLength: this.wcMinWordLength,
      maxWords: this.wcMaxWords,
    });

    if (results.length === 0) {
      this.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "No words found." });
      return;
    }

    this.renderWordCloudChart(results);
  }

  private async renderWordCloudChart(results: WordFrequencyResult[]): Promise<void> {
    if (!this.chartContainer) return;

    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);

    const { WordCloudController, WordElement } = await import("chartjs-chart-wordcloud");
    Chart.register(WordCloudController, WordElement);

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.height = "600px";
    wrapper.style.position = "relative";
    const canvas = wrapper.createEl("canvas");

    const maxCount = results[0]?.count ?? 1;
    const minCount = results[results.length - 1]?.count ?? 1;

    // Map code names to colors from data
    const codeColorMap = new Map<string, string>();
    if (this.data) {
      for (const c of this.data.codes) codeColorMap.set(c.name, c.color);
    }

    // Color each word by its most frequent code
    const wordColors = results.map((r) => {
      if (r.codes.length > 0) return codeColorMap.get(r.codes[0]) ?? "#888888";
      return "#888888";
    });

    new Chart(canvas, {
      type: "wordCloud" as any,
      data: {
        labels: results.map((r) => r.word),
        datasets: [{
          label: "Word Frequency",
          data: results.map((r) => {
            const norm = maxCount > minCount
              ? 10 + ((r.count - minCount) / (maxCount - minCount)) * 60
              : 30;
            return norm;
          }),
          color: wordColors,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const idx = ctx.dataIndex;
                const r = results[idx];
                return `${r.word}: ${r.count} (${r.codes.slice(0, 3).join(", ")})`;
              },
            },
          },
        },
      },
    });
  }

  private renderMiniWordCloud(canvas: HTMLCanvasElement, freq: import("../data/dataTypes").FrequencyResult[]): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || freq.length === 0) return;

    const W = canvas.width;
    const H = canvas.height;
    const isDark = document.body.classList.contains("theme-dark");
    const textColor = isDark ? "#b0b0b0" : "#444";

    // Mini placeholder: show code names as a word cloud approximation
    const top12 = freq.slice(0, 12);
    const maxVal = top12[0]?.total ?? 1;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Place words in a grid-like pattern
    const cols = 3;
    const rows = Math.ceil(top12.length / cols);
    const cellW = W / cols;
    const cellH = H / rows;

    for (let i = 0; i < top12.length; i++) {
      const r = top12[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = cellW * (col + 0.5);
      const y = cellH * (row + 0.5);
      const size = 9 + (r.total / maxVal) * 14;
      ctx.font = `${Math.round(size)}px sans-serif`;
      ctx.fillStyle = r.color;
      const label = r.code.length > 8 ? r.code.slice(0, 7) + "\u2026" : r.code;
      ctx.fillText(label, x, y);
    }
  }

  private exportWordCloudCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const filtered = this.data.markers.filter((m) =>
      filters.sources.includes(m.source) &&
      m.codes.some((c) => !filters.excludeCodes.includes(c))
    );

    // We need to extract text synchronously — if segments aren't cached, just export what we can
    // Use a simpler approach: export from last rendered data
    new Notice("Extracting text for export...");
    const extractor = new TextExtractor(this.plugin.app.vault);
    extractor.extractBatch(filtered).then((segments) => {
      const results = calculateWordFrequencies(segments, {
        stopWordsLang: this.wcStopWordsLang,
        minWordLength: this.wcMinWordLength,
        maxWords: this.wcMaxWords,
      });

      const rows: string[][] = [["word", "count", "codes"]];
      for (const r of results) {
        rows.push([`"${r.word}"`, String(r.count), `"${r.codes.join("; ")}"`]);
      }
      const csvContent = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const link = document.createElement("a");
      link.download = `codemarker-wordcloud-${date}.csv`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  // ─── ACM (MCA Biplot) ───

  private renderACMOptionsSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "MCA Biplot" });

    // Show markers toggle
    const markersRow = section.createDiv({ cls: "codemarker-config-row" });
    const markersCb = markersRow.createEl("input", { type: "checkbox" });
    markersCb.checked = this.acmShowMarkers;
    markersRow.createSpan({ text: "Show markers" });
    markersCb.addEventListener("change", () => {
      this.acmShowMarkers = markersCb.checked;
      this.scheduleUpdate();
    });
    markersRow.addEventListener("click", (e) => {
      if (e.target !== markersCb) { markersCb.checked = !markersCb.checked; markersCb.dispatchEvent(new Event("change")); }
    });

    // Show code labels toggle
    const labelsRow = section.createDiv({ cls: "codemarker-config-row" });
    const labelsCb = labelsRow.createEl("input", { type: "checkbox" });
    labelsCb.checked = this.acmShowCodeLabels;
    labelsRow.createSpan({ text: "Show code labels" });
    labelsCb.addEventListener("change", () => {
      this.acmShowCodeLabels = labelsCb.checked;
      this.scheduleUpdate();
    });
    labelsRow.addEventListener("click", (e) => {
      if (e.target !== labelsCb) { labelsCb.checked = !labelsCb.checked; labelsCb.dispatchEvent(new Event("change")); }
    });
  }

  private renderACMBiplot(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const enabledCodeNames = Array.from(this.enabledCodes);
    const enabledColors = enabledCodeNames.map((name) => {
      const def = this.data!.codes.find((c) => c.name === name);
      return def?.color ?? "#888888";
    });

    const filtered = this.data.markers.filter((m) =>
      filters.sources.includes(m.source) &&
      m.codes.some((c) => !filters.excludeCodes.includes(c))
    );

    if (filtered.length < 2 || enabledCodeNames.length < 2) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "MCA requires at least 2 codes and 2 markers.",
      });
      return;
    }

    const loadingEl = this.chartContainer.createDiv({ cls: "codemarker-wc-loading", text: "Computing MCA..." });
    this.loadAndRenderACM(filtered, enabledCodeNames, enabledColors, loadingEl);
  }

  private async loadAndRenderACM(
    markers: import("../data/dataTypes").UnifiedMarker[],
    codes: string[],
    colors: string[],
    loadingEl: HTMLElement,
  ): Promise<void> {
    if (!this.chartContainer) return;

    const result = await calculateMCA(markers, codes, colors);
    loadingEl.remove();

    if (!result) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "Insufficient data for MCA (need \u22652 active codes with \u22652 markers).",
      });
      return;
    }

    this.renderACMChart(result);
  }

  private async renderACMChart(result: MCAResult): Promise<void> {
    if (!this.chartContainer) return;

    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.height = "600px";
    wrapper.style.position = "relative";
    const canvas = wrapper.createEl("canvas");

    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || "#dcddde";
    const gridColor = styles.getPropertyValue("--background-modifier-border").trim() || "#333";

    const [pct1, pct2] = result.inertiaExplained;

    const datasets: any[] = [];

    // Code points (larger, colored, labeled)
    datasets.push({
      label: "Codes",
      data: result.codePoints.map((p) => ({ x: p.x, y: p.y })),
      backgroundColor: result.codePoints.map((p) => p.color),
      borderColor: result.codePoints.map((p) => p.color),
      borderWidth: 2,
      pointRadius: 8,
      pointHoverRadius: 10,
      pointStyle: "rectRounded",
    });

    // Marker points (smaller, semi-transparent)
    if (this.acmShowMarkers && result.markerPoints.length > 0) {
      const sourceColors: Record<string, string> = {
        markdown: "#42A5F5",
        "csv-segment": "#66BB6A",
        "csv-row": "#81C784",
        image: "#FFA726",
        pdf: "#EF5350",
        audio: "#AB47BC",
        video: "#7E57C2",
      };
      datasets.push({
        label: "Markers",
        data: result.markerPoints.map((p) => ({ x: p.x, y: p.y })),
        backgroundColor: result.markerPoints.map((p) => {
          const c = sourceColors[p.source] ?? "#888";
          return c + "80"; // 50% alpha
        }),
        borderColor: "transparent",
        pointRadius: 3,
        pointHoverRadius: 5,
      });
    }

    const showLabels = this.acmShowCodeLabels;
    const codePoints = result.codePoints;

    const tickCallback = (value: any) => {
      const n = Number(value);
      if (Math.abs(n) < 1e-10) return "0";
      return n.toFixed(2);
    };

    new Chart(canvas, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: `Dimension 1 (${pct1}%)`, color: textColor },
            grid: { color: gridColor },
            ticks: { color: textColor, callback: tickCallback },
          },
          y: {
            title: { display: true, text: `Dimension 2 (${pct2}%)`, color: textColor },
            grid: { color: gridColor },
            ticks: { color: textColor, callback: tickCallback },
          },
        },
        plugins: {
          legend: { labels: { color: textColor } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const dsIdx = ctx.datasetIndex;
                const idx = ctx.dataIndex;
                if (dsIdx === 0) {
                  const cp = codePoints[idx];
                  return `${cp.name} (${cp.x.toFixed(2)}, ${cp.y.toFixed(2)})`;
                } else {
                  const mp = result.markerPoints[idx];
                  return `${mp.file} [${mp.codes.slice(0, 3).join(", ")}]`;
                }
              },
            },
          },
        },
      },
      plugins: showLabels ? [{
        id: "codeLabelPlugin",
        afterDraw: (chart: any) => {
          const ctx2 = chart.ctx;
          const meta = chart.getDatasetMeta(0);
          if (!meta.data.length) return;
          ctx2.save();
          ctx2.font = "bold 11px sans-serif";
          ctx2.textBaseline = "bottom";
          ctx2.fillStyle = textColor;

          // Simple label collision avoidance
          const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
          const LH = 14; // label height

          for (let i = 0; i < meta.data.length; i++) {
            const pt = meta.data[i];
            const label = codePoints[i].name;
            const tw = ctx2.measureText(label).width;
            let lx = pt.x - tw / 2;
            let ly = pt.y - 12;

            // Nudge if overlapping
            for (const p of placed) {
              if (lx < p.x + p.w && lx + tw > p.x && ly < p.y + p.h && ly + LH > p.y) {
                ly = p.y - LH - 2; // move above
              }
            }

            ctx2.fillText(label, lx, ly + LH);
            placed.push({ x: lx, y: ly, w: tw, h: LH });
          }
          ctx2.restore();
        },
      }] : [],
    });
  }

  private renderMiniACM(canvas: HTMLCanvasElement, filters: FilterConfig): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || !this.data) return;

    const W = canvas.width;
    const H = canvas.height;
    const isDark = document.body.classList.contains("theme-dark");

    // Quick sync MCA computation for thumbnail — use full data
    const codes = this.data.codes.map((c) => c.name);
    const colors = this.data.codes.map((c) => c.color);
    const filtered = this.data.markers.filter((m) => filters.sources.includes(m.source));

    if (filtered.length < 2 || codes.length < 2) {
      ctx.fillStyle = isDark ? "#b0b0b0" : "#888";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Insufficient data", W / 2, H / 2);
      return;
    }

    // Build indicator matrix inline (simplified sync version)
    const codeSet = new Set(codes);
    const valid = filtered.filter((m) => m.codes.some((c) => codeSet.has(c)));
    if (valid.length < 2) return;

    // Just draw a placeholder scatter with code positions approximated
    const codeFreqs = new Map<string, number>();
    for (const m of valid) {
      for (const c of m.codes) {
        if (codeSet.has(c)) codeFreqs.set(c, (codeFreqs.get(c) ?? 0) + 1);
      }
    }

    const activeCodes = codes.filter((c) => (codeFreqs.get(c) ?? 0) > 0);
    if (activeCodes.length < 2) return;

    // Simple circular layout as thumbnail placeholder
    const n = Math.min(activeCodes.length, 12);
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.35;

    // Axes
    ctx.strokeStyle = isDark ? "rgba(180,180,180,0.2)" : "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10, cy); ctx.lineTo(W - 10, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 10); ctx.lineTo(cx, H - 10); ctx.stroke();

    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const cIdx = this.data.codes.findIndex((c) => c.name === activeCodes[i]);
      const color = cIdx >= 0 ? this.data.codes[cIdx].color : "#888";

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  private exportACMCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const codes = Array.from(this.enabledCodes);
    const colors = codes.map((name) => {
      const def = this.data!.codes.find((c) => c.name === name);
      return def?.color ?? "#888888";
    });

    const filtered = this.data.markers.filter((m) =>
      filters.sources.includes(m.source) &&
      m.codes.some((c) => !filters.excludeCodes.includes(c))
    );

    new Notice("Computing MCA for export...");
    calculateMCA(filtered, codes, colors).then((result) => {
      if (!result) {
        new Notice("Insufficient data for MCA export.");
        return;
      }

      const rows: string[][] = [["type", "name", "dim1", "dim2", "file", "codes"]];
      for (const cp of result.codePoints) {
        rows.push(["code", `"${cp.name}"`, cp.x.toFixed(4), cp.y.toFixed(4), "", ""]);
      }
      for (const mp of result.markerPoints) {
        rows.push(["marker", `"${mp.id}"`, mp.x.toFixed(4), mp.y.toFixed(4), `"${mp.file}"`, `"${mp.codes.join("; ")}"`]);
      }
      const csvContent = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const link = document.createElement("a");
      link.download = `codemarker-mca-${date}.csv`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  // ─── MDS Map ───

  private renderMDSOptionsSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "MDS Map" });

    // Project mode: Codes / Files
    for (const [value, label] of [
      ["codes", "Codes"],
      ["files", "Files"],
    ] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "mdsMode";
      radio.value = value;
      radio.checked = this.mdsMode === value;
      row.createSpan({ text: label });
      radio.addEventListener("change", () => {
        this.mdsMode = value;
        this.scheduleUpdate();
      });
      row.addEventListener("click", (e) => {
        if (e.target !== radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); }
      });
    }

    // Show labels toggle
    const labelsRow = section.createDiv({ cls: "codemarker-config-row" });
    const labelsCb = labelsRow.createEl("input", { type: "checkbox" });
    labelsCb.checked = this.mdsShowLabels;
    labelsRow.createSpan({ text: "Show labels" });
    labelsCb.addEventListener("change", () => {
      this.mdsShowLabels = labelsCb.checked;
      this.scheduleUpdate();
    });
    labelsRow.addEventListener("click", (e) => {
      if (e.target !== labelsCb) { labelsCb.checked = !labelsCb.checked; labelsCb.dispatchEvent(new Event("change")); }
    });
  }

  private renderMDSMap(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const filtered = this.data.markers.filter((m) =>
      filters.sources.includes(m.source) &&
      m.codes.some((c) => !filters.excludeCodes.includes(c))
    );

    if (filtered.length < 3) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "MDS requires at least 3 entities with data.",
      });
      return;
    }

    const loadingEl = this.chartContainer.createDiv({ cls: "codemarker-wc-loading", text: "Computing MDS..." });
    this.loadAndRenderMDS(filtered, loadingEl);
  }

  private async loadAndRenderMDS(
    markers: import("../data/dataTypes").UnifiedMarker[],
    loadingEl: HTMLElement,
  ): Promise<void> {
    if (!this.chartContainer || !this.data) return;

    const result = await calculateMDS(
      markers,
      this.data.codes,
      this.mdsMode,
      Array.from(this.enabledSources) as any[],
    );
    loadingEl.remove();

    if (!result) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: `Insufficient data for MDS (need \u22653 ${this.mdsMode === "codes" ? "codes with markers" : "files with codes"}).`,
      });
      return;
    }

    this.renderMDSChart(result);
  }

  private async renderMDSChart(result: MDSResult): Promise<void> {
    if (!this.chartContainer) return;

    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.height = "600px";
    wrapper.style.position = "relative";
    const canvas = wrapper.createEl("canvas");

    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || "#dcddde";
    const gridColor = styles.getPropertyValue("--background-modifier-border").trim() || "#333";

    const [var1, var2] = result.varianceExplained;
    const maxSize = Math.max(...result.points.map((p) => p.size), 1);

    const tickCallback = (value: any) => {
      const n = Number(value);
      if (Math.abs(n) < 1e-10) return "0";
      return n.toFixed(2);
    };

    const showLabels = this.mdsShowLabels;
    const pts = result.points;

    new Chart(canvas, {
      type: "scatter",
      data: {
        datasets: [{
          label: result.mode === "codes" ? "Codes" : "Files",
          data: pts.map((p) => ({ x: p.x, y: p.y })),
          backgroundColor: pts.map((p) => p.color + "CC"),
          borderColor: pts.map((p) => p.color),
          borderWidth: 1.5,
          pointRadius: pts.map((p) => 4 + (p.size / maxSize) * 12),
          pointHoverRadius: pts.map((p) => 6 + (p.size / maxSize) * 14),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: `Dim 1 (${var1}%)`, color: textColor },
            grid: { color: gridColor },
            ticks: { color: textColor, callback: tickCallback },
          },
          y: {
            title: { display: true, text: `Dim 2 (${var2}%)`, color: textColor },
            grid: { color: gridColor },
            ticks: { color: textColor, callback: tickCallback },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const p = pts[ctx.dataIndex];
                const sizeLabel = result.mode === "codes" ? "markers" : "markers";
                return `${p.name} (${p.size} ${sizeLabel})`;
              },
            },
          },
          title: {
            display: true,
            text: `MDS — ${result.mode === "codes" ? "Code" : "File"} Proximity (Stress: ${result.stress})`,
            color: textColor,
            font: { size: 13 },
          },
        },
      },
      plugins: showLabels ? [{
        id: "mdsLabelPlugin",
        afterDraw: (chart: any) => {
          const ctx2 = chart.ctx;
          const meta = chart.getDatasetMeta(0);
          if (!meta.data.length) return;
          ctx2.save();
          ctx2.font = "bold 11px sans-serif";
          ctx2.textBaseline = "bottom";
          ctx2.fillStyle = textColor;

          const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
          const LH = 14;

          for (let i = 0; i < meta.data.length; i++) {
            const pt = meta.data[i];
            const label = pts[i].name.length > 20 ? pts[i].name.slice(0, 19) + "\u2026" : pts[i].name;
            const tw = ctx2.measureText(label).width;
            let lx = pt.x - tw / 2;
            let ly = pt.y - 14;

            for (const p of placed) {
              if (lx < p.x + p.w && lx + tw > p.x && ly < p.y + p.h && ly + LH > p.y) {
                ly = p.y - LH - 2;
              }
            }

            ctx2.fillText(label, lx, ly + LH);
            placed.push({ x: lx, y: ly, w: tw, h: LH });
          }
          ctx2.restore();
        },
      }] : [],
    });
  }

  private renderMiniMDS(canvas: HTMLCanvasElement, freq: import("../data/dataTypes").FrequencyResult[]): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || freq.length < 3) return;

    const W = canvas.width;
    const H = canvas.height;
    const isDark = document.body.classList.contains("theme-dark");

    const n = Math.min(freq.length, 10);
    const cx = W / 2;
    const cy = H / 2;
    const maxFreq = freq[0]?.total ?? 1;

    // Draw axes
    ctx.strokeStyle = isDark ? "rgba(180,180,180,0.2)" : "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10, cy); ctx.lineTo(W - 10, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 10); ctx.lineTo(cx, H - 10); ctx.stroke();

    // Approximate positions using force layout (quick 30 iterations)
    const nodes = freq.slice(0, n).map((r, i) => {
      const angle = (2 * Math.PI * i) / n;
      const spread = Math.min(W, H) * 0.3;
      return {
        x: cx + Math.cos(angle) * spread,
        y: cy + Math.sin(angle) * spread,
        vx: 0, vy: 0,
        radius: 3 + (r.total / maxFreq) * 8,
        color: r.color,
      };
    });

    for (let iter = 0; iter < 30; iter++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 2000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx += fx; nodes[i].vy += fy;
          nodes[j].vx -= fx; nodes[j].vy -= fy;
        }
      }
      for (const node of nodes) {
        node.vx += (cx - node.x) * 0.02;
        node.vy += (cy - node.y) * 0.02;
        node.vx *= 0.8; node.vy *= 0.8;
        node.x += node.vx; node.y += node.vy;
        node.x = Math.max(node.radius + 2, Math.min(W - node.radius - 2, node.x));
        node.y = Math.max(node.radius + 2, Math.min(H - node.radius - 2, node.y));
      }
    }

    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private exportMDSCSV(date: string): void {
    if (!this.data) return;
    const filtered = this.data.markers.filter((m) =>
      this.enabledSources.has(m.source) &&
      m.codes.some((c) => this.enabledCodes.has(c))
    );

    new Notice("Computing MDS for export...");
    calculateMDS(
      filtered,
      this.data.codes,
      this.mdsMode,
      Array.from(this.enabledSources) as any[],
    ).then((result) => {
      if (!result) {
        new Notice("Insufficient data for MDS export.");
        return;
      }

      const rows: string[][] = [["name", "dim1", "dim2", "size", "mode"]];
      for (const p of result.points) {
        rows.push([`"${p.name}"`, p.x.toFixed(4), p.y.toFixed(4), String(p.size), result.mode]);
      }
      const csvContent = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const link = document.createElement("a");
      link.download = `codemarker-mds-${date}.csv`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  // ─── Temporal Analysis ───

  private async renderTemporalChart(filters: FilterConfig): Promise<void> {
    if (!this.chartContainer || !this.data) return;

    const result = calculateTemporal(this.data, filters);

    if (result.series.length === 0) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No temporal data available. Markers need a createdAt timestamp.",
      });
      return;
    }

    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);
    await import("chartjs-adapter-date-fns");

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.height = "500px";
    wrapper.style.position = "relative";
    const canvas = wrapper.createEl("canvas");

    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || "#dcddde";
    const gridColor = styles.getPropertyValue("--background-modifier-border").trim() || "#333";

    const datasets = result.series.map((s) => ({
      label: s.code,
      data: s.points.map((p) => ({ x: p.date, y: p.count })),
      borderColor: s.color,
      backgroundColor: s.color + "33",
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      fill: false,
      tension: 0.2,
    }));

    new Chart(canvas, {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: {
              unit: "day",
              displayFormats: { day: "MMM d", week: "MMM d", month: "MMM yyyy" },
              tooltipFormat: "PPp",
            },
            title: { display: true, text: "Date", color: textColor },
            grid: { color: gridColor },
            ticks: { color: textColor, maxRotation: 45 },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Cumulative Count", color: textColor },
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              stepSize: 1,
              callback: (value: any) => Number.isInteger(value) ? value : "",
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { color: textColor, boxWidth: 12, padding: 10, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const date = new Date(ctx.parsed.x);
                return `${ctx.dataset.label}: ${ctx.parsed.y} (${date.toLocaleDateString()})`;
              },
            },
          },
          title: {
            display: true,
            text: "Coding Evolution Over Time",
            color: textColor,
            font: { size: 13 },
          },
        },
      },
    });
  }

  private renderMiniTemporal(canvas: HTMLCanvasElement, temporal: TemporalResult): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || temporal.series.length === 0) return;

    const W = canvas.width;
    const H = canvas.height;
    const pad = 12;
    const isDark = document.body.classList.contains("theme-dark");

    const [minDate, maxDate] = temporal.dateRange;
    const dateRange = maxDate - minDate || 1;
    let maxCount = 0;
    for (const s of temporal.series) {
      for (const p of s.points) {
        if (p.count > maxCount) maxCount = p.count;
      }
    }
    if (maxCount === 0) maxCount = 1;

    // Grid
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad + ((H - 2 * pad) * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    }

    // Lines
    for (const s of temporal.series) {
      if (s.points.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i++) {
        const x = pad + ((s.points[i].date - minDate) / dateRange) * (W - 2 * pad);
        const y = H - pad - (s.points[i].count / maxCount) * (H - 2 * pad);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private exportTemporalCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const result = calculateTemporal(this.data, filters);
    if (result.series.length === 0) {
      new Notice("No temporal data to export.");
      return;
    }

    const rows: string[][] = [["code", "date", "cumulative_count"]];
    for (const s of result.series) {
      for (const p of s.points) {
        rows.push([`"${s.code}"`, new Date(p.date).toISOString(), String(p.count)]);
      }
    }
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-temporal-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ─── Text Statistics ───

  private renderTextStats(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const filtered = this.data.markers.filter((m) =>
      filters.sources.includes(m.source) &&
      m.codes.some((c) => !filters.excludeCodes.includes(c))
    );

    if (filtered.length === 0) {
      this.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "No data matches current filters." });
      return;
    }

    const loadingEl = this.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "Extracting text..." });
    this.loadAndRenderTextStats(filtered, loadingEl);
  }

  private async loadAndRenderTextStats(
    markers: import("../data/dataTypes").UnifiedMarker[],
    loadingEl: HTMLElement,
  ): Promise<void> {
    if (!this.chartContainer || !this.data) return;

    const extractor = new TextExtractor(this.plugin.app.vault);
    const segments = await extractor.extractBatch(markers);
    loadingEl.remove();

    const codeColors = new Map(this.data.codes.map((c) => [c.name, c.color]));
    const result = calculateTextStats(segments, codeColors);

    if (result.codes.length === 0) {
      this.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "No text data available." });
      return;
    }

    const wrapper = this.chartContainer.createDiv({ cls: "codemarker-ts-wrapper" });

    // Global summary
    const summary = wrapper.createDiv({ cls: "codemarker-ts-summary" });
    summary.innerHTML = `<strong>${result.global.totalSegments}</strong> segments · <strong>${result.global.totalWords}</strong> words · <strong>${result.global.uniqueWords}</strong> unique · TTR: <strong>${result.global.ttr.toFixed(3)}</strong>`;

    // Table
    const table = wrapper.createEl("table", { cls: "codemarker-ts-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");

    const columns: Array<{ key: string; label: string; numeric: boolean }> = [
      { key: "code", label: "Code", numeric: false },
      { key: "segmentCount", label: "Segments", numeric: true },
      { key: "totalWords", label: "Words", numeric: true },
      { key: "uniqueWords", label: "Unique", numeric: true },
      { key: "ttr", label: "TTR", numeric: true },
      { key: "avgWordsPerSegment", label: "Avg Words", numeric: true },
      { key: "avgCharsPerSegment", label: "Avg Chars", numeric: true },
    ];

    for (const col of columns) {
      const th = headerRow.createEl("th", { text: col.label, cls: "codemarker-ts-th" });
      const arrow = this.tsSort.col === col.key ? (this.tsSort.asc ? " ▲" : " ▼") : "";
      th.textContent = col.label + arrow;
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        if (this.tsSort.col === col.key) {
          this.tsSort.asc = !this.tsSort.asc;
        } else {
          this.tsSort = { col: col.key, asc: col.numeric ? false : true };
        }
        this.scheduleUpdate();
      });
    }

    // Sort
    const sortKey = this.tsSort.col as keyof typeof result.codes[0];
    const sorted = [...result.codes].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") {
        return this.tsSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = va as number;
      const nb = vb as number;
      return this.tsSort.asc ? na - nb : nb - na;
    });

    const maxTTR = Math.max(...result.codes.map((c) => c.ttr), 0.001);

    const tbody = table.createEl("tbody");
    for (const entry of sorted) {
      const tr = tbody.createEl("tr");

      // Code cell with swatch
      const tdCode = tr.createEl("td");
      const swatch = tdCode.createSpan({ cls: "codemarker-config-swatch" });
      swatch.style.backgroundColor = entry.color;
      swatch.style.display = "inline-block";
      swatch.style.marginRight = "6px";
      tdCode.createSpan({ text: entry.code });

      tr.createEl("td", { text: String(entry.segmentCount), cls: "codemarker-ts-num" });
      tr.createEl("td", { text: String(entry.totalWords), cls: "codemarker-ts-num" });
      tr.createEl("td", { text: String(entry.uniqueWords), cls: "codemarker-ts-num" });

      // TTR cell with bar
      const tdTTR = tr.createEl("td", { cls: "codemarker-ts-num" });
      const barWrap = tdTTR.createDiv({ cls: "codemarker-ts-ttr-bar" });
      const bar = barWrap.createDiv({ cls: "codemarker-ts-ttr-fill" });
      bar.style.width = `${(entry.ttr / maxTTR) * 100}%`;
      bar.style.backgroundColor = entry.ttr > 0.7 ? "#4CAF50" : entry.ttr > 0.4 ? "#FFC107" : "#F44336";
      tdTTR.createSpan({ text: entry.ttr.toFixed(3), cls: "codemarker-ts-ttr-val" });

      tr.createEl("td", { text: String(entry.avgWordsPerSegment), cls: "codemarker-ts-num" });
      tr.createEl("td", { text: String(entry.avgCharsPerSegment), cls: "codemarker-ts-num" });
    }
  }

  private renderMiniTextStats(canvas: HTMLCanvasElement, freq: import("../data/dataTypes").FrequencyResult[]): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || freq.length === 0) return;
    const W = canvas.width;
    const H = canvas.height;
    const pad = 12;
    const isDark = document.body.classList.contains("theme-dark");
    const top5 = freq.slice(0, 5);
    const maxVal = Math.max(...top5.map((f) => f.total), 1);
    const barH = Math.min(20, (H - 2 * pad) / top5.length - 4);

    for (let i = 0; i < top5.length; i++) {
      const y = pad + i * (barH + 4);
      const w = (top5[i].total / maxVal) * (W - 2 * pad - 60);
      ctx.fillStyle = top5[i].color;
      ctx.fillRect(pad + 50, y, w, barH);
      ctx.fillStyle = isDark ? "#ccc" : "#333";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const label = top5[i].code.length > 6 ? top5[i].code.slice(0, 5) + "\u2026" : top5[i].code;
      ctx.fillText(label, pad + 46, y + barH / 2);
    }
  }

  private exportTextStatsCSV(date: string): void {
    if (!this.data) return;

    const filtered = this.data.markers.filter((m) => this.enabledSources.has(m.source) && m.codes.some((c) => this.enabledCodes.has(c)));
    const loadAndExport = async () => {
      const extractor = new TextExtractor(this.plugin.app.vault);
      const segments = await extractor.extractBatch(filtered);
      const codeColors = new Map(this.data!.codes.map((c) => [c.name, c.color]));
      const result = calculateTextStats(segments, codeColors);

      const rows: string[][] = [["code", "segments", "total_words", "unique_words", "ttr", "avg_words_per_segment", "avg_chars_per_segment"]];
      for (const e of result.codes) {
        rows.push([`"${e.code}"`, String(e.segmentCount), String(e.totalWords), String(e.uniqueWords), String(e.ttr), String(e.avgWordsPerSegment), String(e.avgCharsPerSegment)]);
      }
      const csvContent = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const link = document.createElement("a");
      link.download = `codemarker-text-stats-${date}.csv`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    };
    loadAndExport();
  }

  // ─── Dendrogram + Silhouette ───

  private renderDendrogramOptionsSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Mode" });

    for (const [value, label] of [["codes", "Codes"], ["files", "Files"]] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "dendrogramMode";
      radio.value = value;
      radio.checked = this.dendrogramMode === value;
      row.createSpan({ text: label });
      radio.addEventListener("change", () => { this.dendrogramMode = value; this.scheduleUpdate(); });
      row.addEventListener("click", (e) => { if (e.target !== radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); } });
    }

    // Cut distance slider
    const cutSection = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    cutSection.createDiv({ cls: "codemarker-config-section-title", text: `Cut Distance: ${this.dendrogramCutDistance.toFixed(2)}` });
    const slider = cutSection.createEl("input", { type: "range" });
    slider.min = "0.01";
    slider.max = "1.0";
    slider.step = "0.01";
    slider.value = String(this.dendrogramCutDistance);
    slider.style.width = "100%";
    slider.addEventListener("input", () => {
      this.dendrogramCutDistance = parseFloat(slider.value);
      cutSection.querySelector(".codemarker-config-section-title")!.textContent = `Cut Distance: ${this.dendrogramCutDistance.toFixed(2)}`;
      this.scheduleUpdate();
    });
  }

  private renderDendrogramView(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const result = calculateCooccurrence(this.data, filters);
    if (result.codes.length < 3) {
      this.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "Need at least 3 codes/files for dendrogram." });
      return;
    }

    // Build Jaccard distance matrix from co-occurrence
    const n = result.codes.length;
    const distMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) { row.push(0); continue; }
        const freqI = result.matrix[i][i];
        const freqJ = result.matrix[j][j];
        const coij = result.matrix[i][j];
        const union = freqI + freqJ - coij;
        row.push(union > 0 ? 1 - coij / union : 1);
      }
      distMatrix.push(row);
    }

    const root = buildDendrogram(distMatrix, result.codes, result.colors);
    if (!root) return;

    const assignments = cutDendrogram(root, this.dendrogramCutDistance);
    const silhouette = calculateSilhouette(distMatrix, assignments, result.codes, result.colors);

    // Determine cluster colors
    const nClusters = new Set(assignments).size;
    const clusterColors: string[] = [];
    for (let i = 0; i < nClusters; i++) {
      const hue = (i * 137.5) % 360;
      clusterColors.push(`hsl(${hue}, 65%, 55%)`);
    }

    this.renderDendrogramCanvas(root, assignments, clusterColors, silhouette);
  }

  private renderDendrogramCanvas(
    root: DendrogramNode,
    assignments: number[],
    clusterColors: string[],
    silhouette: import("../data/clusterEngine").SilhouetteResult,
  ): void {
    if (!this.chartContainer) return;

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.position = "relative";
    wrapper.style.overflow = "auto";

    // Collect leaves in tree order
    const leaves: DendrogramNode[] = [];
    function collectLeaves(node: DendrogramNode): void {
      if (!node.left && !node.right) { leaves.push(node); return; }
      if (node.left) collectLeaves(node.left);
      if (node.right) collectLeaves(node.right);
    }
    collectLeaves(root);

    const nLeaves = leaves.length;
    const isDark = document.body.classList.contains("theme-dark");
    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

    // Layout constants
    const labelWidth = 130;
    const treeWidth = 300;
    const silWidth = 200;
    const padTop = 30;
    const padBottom = 30;
    const rowHeight = 22;
    const chartWidth = labelWidth + treeWidth + 40 + silWidth + 40;
    const chartHeight = padTop + nLeaves * rowHeight + padBottom + 50;

    const canvas = wrapper.createEl("canvas");
    canvas.width = chartWidth;
    canvas.height = chartHeight;
    canvas.style.width = `${chartWidth}px`;
    canvas.style.height = `${chartHeight}px`;

    const ctx = canvas.getContext("2d")!;
    const maxDist = root.distance || 1;

    // Map leaf to y position (in tree order)
    const leafY = new Map<number, number>();
    for (let i = 0; i < nLeaves; i++) {
      leafY.set(leaves[i].id, padTop + i * rowHeight + rowHeight / 2);
    }

    // Draw labels
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < nLeaves; i++) {
      const leaf = leaves[i];
      const y = leafY.get(leaf.id)!;
      const clusterIdx = assignments[leaf.leafIndices[0]];
      ctx.fillStyle = clusterColors[clusterIdx] ?? textColor;

      // Swatch
      ctx.fillRect(labelWidth - 18, y - 5, 10, 10);
      ctx.fillStyle = textColor;
      const label = (leaf.label ?? "").length > 16 ? (leaf.label ?? "").slice(0, 15) + "\u2026" : (leaf.label ?? "");
      ctx.fillText(label, labelWidth - 22, y);
    }

    // Draw dendrogram tree (recursive)
    const treeLeft = labelWidth + 10;
    const treeRight = labelWidth + treeWidth;

    function distToX(d: number): number {
      return treeLeft + (d / maxDist) * (treeRight - treeLeft);
    }

    function getNodeY(node: DendrogramNode): number {
      if (!node.left && !node.right) return leafY.get(node.id) ?? 0;
      const ly = node.left ? getNodeY(node.left) : 0;
      const ry = node.right ? getNodeY(node.right) : 0;
      return (ly + ry) / 2;
    }

    function drawNode(node: DendrogramNode): void {
      if (!node.left || !node.right) return;

      const x = distToX(node.distance);
      const ly = getNodeY(node.left);
      const ry = getNodeY(node.right);
      const lx = node.left.left ? distToX(node.left.distance) : treeLeft;
      const rx = node.right.left ? distToX(node.right.distance) : treeLeft;

      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;

      // Vertical line connecting children
      ctx.beginPath();
      ctx.moveTo(x, ly);
      ctx.lineTo(x, ry);
      ctx.stroke();

      // Horizontal lines to children
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(x, ly);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(x, ry);
      ctx.stroke();

      drawNode(node.left);
      drawNode(node.right);
    }

    drawNode(root);

    // Draw cut line
    const cutX = distToX(this.dendrogramCutDistance);
    ctx.strokeStyle = "#F44336";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(cutX, padTop - 10);
    ctx.lineTo(cutX, padTop + nLeaves * rowHeight + 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // Distance axis
    ctx.font = "10px sans-serif";
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const axisY = padTop + nLeaves * rowHeight + 15;
    for (let d = 0; d <= 1; d += 0.25) {
      const x = distToX(d * maxDist);
      ctx.fillText((d * maxDist).toFixed(2), x, axisY);
    }

    // ── Silhouette plot ──
    const silLeft = treeRight + 40;
    const silRight = silLeft + silWidth;

    // Title
    ctx.font = "11px sans-serif";
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const quality = silhouette.avgScore > 0.5 ? "good" : silhouette.avgScore > 0.25 ? "fair" : "weak";
    ctx.fillText(`Silhouette (avg: ${silhouette.avgScore.toFixed(3)} — ${quality})`, silLeft, padTop - 8);

    // Zero line
    const zeroX = silLeft + silWidth / 2;
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zeroX, padTop);
    ctx.lineTo(zeroX, padTop + nLeaves * rowHeight);
    ctx.stroke();

    // Avg line
    const avgX = zeroX + (silhouette.avgScore * silWidth) / 2;
    ctx.strokeStyle = "#F44336";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(avgX, padTop);
    ctx.lineTo(avgX, padTop + nLeaves * rowHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Map silhouette scores to leaf order
    const scoreByIndex = new Map(silhouette.scores.map((s) => [s.index, s]));
    for (let i = 0; i < nLeaves; i++) {
      const leaf = leaves[i];
      const origIdx = leaf.leafIndices[0];
      const entry = scoreByIndex.get(origIdx);
      if (!entry) continue;

      const y = leafY.get(leaf.id)!;
      const barW = (entry.score * silWidth) / 2;
      const clusterIdx = assignments[origIdx];

      ctx.fillStyle = clusterColors[clusterIdx] ?? "#6200EE";
      if (barW >= 0) {
        ctx.fillRect(zeroX, y - rowHeight / 2 + 2, barW, rowHeight - 4);
      } else {
        ctx.fillRect(zeroX + barW, y - rowHeight / 2 + 2, -barW, rowHeight - 4);
      }
    }

    // Silhouette axis labels
    ctx.font = "9px sans-serif";
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      const x = zeroX + (v * silWidth) / 2;
      ctx.fillText(v.toFixed(1), x, axisY);
    }

    // Tooltip
    const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
    tooltip.style.display = "none";
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const my = e.clientY - rect.top;
      for (let i = 0; i < nLeaves; i++) {
        const y = leafY.get(leaves[i].id)!;
        if (Math.abs(my - y) < rowHeight / 2) {
          const origIdx = leaves[i].leafIndices[0];
          const entry = scoreByIndex.get(origIdx);
          if (entry) {
            tooltip.textContent = `${entry.name}: silhouette = ${entry.score.toFixed(3)}, cluster ${entry.cluster}`;
            tooltip.style.display = "";
            tooltip.style.left = `${e.clientX - rect.left + 12}px`;
            tooltip.style.top = `${my + 12}px`;
            return;
          }
        }
      }
      tooltip.style.display = "none";
    });
    canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
  }

  private renderMiniDendrogram(canvas: HTMLCanvasElement, filters: FilterConfig): void {
    if (!this.data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const result = calculateCooccurrence(this.data, filters);
    if (result.codes.length < 3) return;

    const n = result.codes.length;
    const distMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) { row.push(0); continue; }
        const freqI = result.matrix[i][i];
        const freqJ = result.matrix[j][j];
        const coij = result.matrix[i][j];
        const union = freqI + freqJ - coij;
        row.push(union > 0 ? 1 - coij / union : 1);
      }
      distMatrix.push(row);
    }

    const root = buildDendrogram(distMatrix, result.codes, result.colors);
    if (!root) return;

    const W = canvas.width;
    const H = canvas.height;
    const pad = 8;
    const isDark = document.body.classList.contains("theme-dark");

    const leaves: DendrogramNode[] = [];
    function collect(node: DendrogramNode): void {
      if (!node.left && !node.right) { leaves.push(node); return; }
      if (node.left) collect(node.left);
      if (node.right) collect(node.right);
    }
    collect(root);

    const nLeaves = leaves.length;
    const maxDist = root.distance || 1;
    const leafYMap = new Map<number, number>();
    for (let i = 0; i < nLeaves; i++) {
      leafYMap.set(leaves[i].id, pad + (i / (nLeaves - 1 || 1)) * (H - 2 * pad));
    }

    function distToX(d: number): number { return pad + (d / maxDist) * (W - 2 * pad); }
    function getNodeY(node: DendrogramNode): number {
      if (!node.left && !node.right) return leafYMap.get(node.id) ?? 0;
      return ((node.left ? getNodeY(node.left) : 0) + (node.right ? getNodeY(node.right) : 0)) / 2;
    }

    function drawNode(node: DendrogramNode): void {
      if (!node.left || !node.right) return;
      const x = distToX(node.distance);
      const ly = getNodeY(node.left);
      const ry = getNodeY(node.right);
      const lx = node.left.left ? distToX(node.left.distance) : pad;
      const rx = node.right.left ? distToX(node.right.distance) : pad;

      ctx!.strokeStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
      ctx!.lineWidth = 1;
      ctx!.beginPath(); ctx!.moveTo(x, ly); ctx!.lineTo(x, ry); ctx!.stroke();
      ctx!.beginPath(); ctx!.moveTo(lx, ly); ctx!.lineTo(x, ly); ctx!.stroke();
      ctx!.beginPath(); ctx!.moveTo(rx, ry); ctx!.lineTo(x, ry); ctx!.stroke();
      drawNode(node.left);
      drawNode(node.right);
    }

    drawNode(root);
  }

  private exportDendrogramCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const result = calculateCooccurrence(this.data, filters);
    if (result.codes.length < 3) { new Notice("Insufficient data."); return; }

    const n = result.codes.length;
    const distMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) { row.push(0); continue; }
        const freqI = result.matrix[i][i]; const freqJ = result.matrix[j][j]; const coij = result.matrix[i][j];
        const union = freqI + freqJ - coij;
        row.push(union > 0 ? 1 - coij / union : 1);
      }
      distMatrix.push(row);
    }

    const root = buildDendrogram(distMatrix, result.codes, result.colors);
    if (!root) return;
    const assignments = cutDendrogram(root, this.dendrogramCutDistance);
    const sil = calculateSilhouette(distMatrix, assignments, result.codes, result.colors);

    const rows: string[][] = [["name", "cluster", "silhouette_score"]];
    for (const s of sil.scores) {
      rows.push([`"${s.name}"`, String(s.cluster), String(s.score)]);
    }
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-dendrogram-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ─── Lag Sequential Analysis ───

  private renderLagOptionsSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: `Lag: ${this.lagValue}` });
    const slider = section.createEl("input", { type: "range" });
    slider.min = "1";
    slider.max = "5";
    slider.step = "1";
    slider.value = String(this.lagValue);
    slider.style.width = "100%";
    slider.addEventListener("input", () => {
      this.lagValue = parseInt(slider.value, 10);
      section.querySelector(".codemarker-config-section-title")!.textContent = `Lag: ${this.lagValue}`;
      this.scheduleUpdate();
    });
  }

  private renderLagSequential(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const result = calculateLagSequential(this.data, filters, this.lagValue);

    if (result.codes.length < 2 || result.totalTransitions === 0) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "Not enough sequential data for lag analysis. Need markers with positional info in the same files.",
      });
      return;
    }

    const n = result.codes.length;
    const cellSize = n > 25 ? 35 : n > 15 ? Math.max(35, Math.floor(500 / n)) : 60;
    const labelSpace = 120;

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.position = "relative";
    wrapper.style.overflow = "auto";

    // Title
    const title = wrapper.createDiv();
    title.style.padding = "8px 0";
    title.style.fontSize = "13px";
    title.style.fontWeight = "bold";
    title.textContent = `Lag Sequential Analysis (lag = ${result.lag}, ${result.totalTransitions} transitions)`;

    const canvas = wrapper.createEl("canvas");
    const totalW = labelSpace + n * cellSize;
    const totalH = labelSpace + n * cellSize;
    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${totalH}px`;

    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    const styles2 = getComputedStyle(document.body);
    const textColor = styles2.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

    // Find max |z| for scaling
    let maxZ = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const absZ = Math.abs(result.zScores[i][j]);
        if (absZ > maxZ) maxZ = absZ;
      }
    }
    if (maxZ === 0) maxZ = 1;

    // Draw cells with divergent color scale
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = labelSpace + j * cellSize;
        const y = labelSpace + i * cellSize;
        const z = result.zScores[i][j];

        // Divergent: blue (negative) → white → red (positive)
        ctx.fillStyle = this.divergentColor(z, maxZ, isDark);
        ctx.fillRect(x, y, cellSize, cellSize);

        // Significance border
        if (Math.abs(z) > 1.96) {
          ctx.strokeStyle = isDark ? "#fff" : "#000";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }

        // Cell border
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // Z-score text
        const zText = z.toFixed(1);
        const bgBright = this.isDivergentLight(z, maxZ, isDark);
        ctx.fillStyle = bgBright ? "#1a1a1a" : "#f0f0f0";
        ctx.font = `${Math.min(11, cellSize * 0.28)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(zText, x + cellSize / 2, y + cellSize / 2);

        // Significance asterisk
        if (Math.abs(z) > 1.96) {
          ctx.fillText("*", x + cellSize / 2 + ctx.measureText(zText).width / 2 + 3, y + cellSize / 2 - 4);
        }
      }
    }

    // Row labels (Given code)
    ctx.fillStyle = textColor;
    ctx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const y = labelSpace + i * cellSize + cellSize / 2;
      const label = result.codes[i].length > 15 ? result.codes[i].slice(0, 14) + "\u2026" : result.codes[i];
      ctx.fillText(label, labelSpace - 6, y);
    }

    // Column labels (Target code, rotated)
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let j = 0; j < n; j++) {
      const x = labelSpace + j * cellSize + cellSize / 2;
      ctx.save();
      ctx.translate(x, labelSpace - 6);
      ctx.rotate(-Math.PI / 4);
      const label = result.codes[j].length > 15 ? result.codes[j].slice(0, 14) + "\u2026" : result.codes[j];
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Axis labels
    ctx.font = "11px sans-serif";
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Target (t + lag)", labelSpace + (n * cellSize) / 2, labelSpace + n * cellSize + 8);
    ctx.save();
    ctx.translate(12, labelSpace + (n * cellSize) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Given (t)", 0, 0);
    ctx.restore();

    // Tooltip
    const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
    tooltip.style.display = "none";

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const col = Math.floor((mx - labelSpace) / cellSize);
      const row = Math.floor((my - labelSpace) / cellSize);

      if (row >= 0 && row < n && col >= 0 && col < n) {
        const z = result.zScores[row][col];
        const obs = result.transitions[row][col];
        const exp = result.expected[row][col];
        const sig = Math.abs(z) > 1.96 ? "p < .05" : "n.s.";
        tooltip.textContent = `${result.codes[row]} → ${result.codes[col]}: obs=${obs}, exp=${exp.toFixed(1)}, z=${z.toFixed(2)} (${sig})`;
        tooltip.style.display = "";
        tooltip.style.left = `${mx + 12}px`;
        tooltip.style.top = `${my + 12}px`;
      } else {
        tooltip.style.display = "none";
      }
    });

    canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
  }

  private divergentColor(z: number, maxZ: number, isDark: boolean): string {
    const intensity = Math.min(Math.abs(z) / Math.max(maxZ, 3), 1);
    if (z > 0) {
      // Red (activation)
      if (isDark) {
        const r = Math.round(42 + intensity * (229 - 42));
        const g = Math.round(42 + intensity * (57 - 42));
        const b = Math.round(42 + intensity * (53 - 42));
        return `rgb(${r},${g},${b})`;
      } else {
        const r = Math.round(255 - intensity * (255 - 229));
        const g = Math.round(255 - intensity * (255 - 57));
        const b = Math.round(255 - intensity * (255 - 53));
        return `rgb(${r},${g},${b})`;
      }
    } else {
      // Blue (inhibition)
      if (isDark) {
        const r = Math.round(42 + intensity * (33 - 42));
        const g = Math.round(42 + intensity * (150 - 42));
        const b = Math.round(42 + intensity * (243 - 42));
        return `rgb(${r},${g},${b})`;
      } else {
        const r = Math.round(255 - intensity * (255 - 33));
        const g = Math.round(255 - intensity * (255 - 150));
        const b = Math.round(255 - intensity * (255 - 243));
        return `rgb(${r},${g},${b})`;
      }
    }
  }

  private isDivergentLight(z: number, maxZ: number, isDark: boolean): boolean {
    const intensity = Math.min(Math.abs(z) / Math.max(maxZ, 3), 1);
    if (isDark) return intensity < 0.3;
    return intensity < 0.5;
  }

  private renderMiniLag(canvas: HTMLCanvasElement, lag: LagResult): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || lag.codes.length < 2) return;

    const W = canvas.width;
    const H = canvas.height;
    const n = lag.codes.length;
    const pad = 10;
    const cellSize = Math.min((W - 2 * pad) / n, (H - 2 * pad) / n);
    const offsetX = (W - n * cellSize) / 2;
    const offsetY = (H - n * cellSize) / 2;
    const isDark = document.body.classList.contains("theme-dark");
    let maxZ = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = Math.abs(lag.zScores[i][j]); if (a > maxZ) maxZ = a; }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = offsetX + j * cellSize;
        const y = offsetY + i * cellSize;
        ctx.fillStyle = this.divergentColor(lag.zScores[i][j], maxZ, isDark);
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  private exportLagCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const result = calculateLagSequential(this.data, filters, this.lagValue);

    const rows: string[][] = [["source_code", "target_code", "observed", "expected", "z_score", "significant"]];
    for (let i = 0; i < result.codes.length; i++) {
      for (let j = 0; j < result.codes.length; j++) {
        rows.push([
          `"${result.codes[i]}"`,
          `"${result.codes[j]}"`,
          String(result.transitions[i][j]),
          String(result.expected[i][j]),
          String(result.zScores[i][j]),
          Math.abs(result.zScores[i][j]) > 1.96 ? "yes" : "no",
        ]);
      }
    }
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-lag-sequential-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ─── Polar Coordinate Analysis ───

  private renderPolarOptionsSection(): void {
    if (!this.data) return;
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Polar Coordinates" });

    // Focal code dropdown
    const focalLabel = section.createDiv({ cls: "codemarker-config-sublabel", text: "Focal Code" });
    const select = section.createEl("select", { cls: "codemarker-config-select" });
    const codes = this.data.codes.map((c) => c.name).sort();
    if (!this.polarFocalCode && codes.length > 0) this.polarFocalCode = codes[0];
    for (const code of codes) {
      const opt = select.createEl("option", { text: code, value: code });
      if (code === this.polarFocalCode) opt.selected = true;
    }
    select.addEventListener("change", () => {
      this.polarFocalCode = select.value;
      this.scheduleUpdate();
    });

    // Max lag slider
    section.createDiv({ cls: "codemarker-config-sublabel", text: `Max Lag: ${this.polarMaxLag}` });
    const slider = section.createEl("input");
    slider.type = "range";
    slider.min = "1";
    slider.max = "5";
    slider.value = String(this.polarMaxLag);
    slider.style.width = "100%";
    slider.addEventListener("input", () => {
      this.polarMaxLag = Number(slider.value);
      const label = section.querySelector(".codemarker-config-sublabel:last-of-type");
      if (label) label.textContent = `Max Lag: ${this.polarMaxLag}`;
    });
    slider.addEventListener("change", () => {
      this.polarMaxLag = Number(slider.value);
      this.scheduleUpdate();
    });
  }

  private renderPolarCoordinates(filters: FilterConfig): void {
    if (!this.data || !this.chartContainer) return;
    const container = this.chartContainer;

    // Ensure focal code is set
    const codes = this.data.codes.map((c) => c.name).sort();
    if (!this.polarFocalCode && codes.length > 0) this.polarFocalCode = codes[0];

    const result = calculatePolarCoordinates(this.data, filters, this.polarFocalCode, this.polarMaxLag);
    if (result.vectors.length === 0) {
      container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
        text: "Not enough data for polar coordinate analysis. Need at least 2 codes with transitions.",
      });
      return;
    }

    const title = container.createDiv();
    title.style.cssText = "font-size:14px;font-weight:600;margin-bottom:8px;";
    title.textContent = `Polar Coordinates — Focal: ${result.focalCode} (max lag: ${result.maxLag})`;

    const canvas = container.createEl("canvas");
    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width - 32, rect.height - 60, 600);
    canvas.width = size;
    canvas.height = size;
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";

    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    const textColor = isDark ? "#ddd" : "#333";
    const gridColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
    const cx = size / 2;
    const cy = size / 2;

    // Find max extent
    let maxExtent = 3;
    for (const v of result.vectors) {
      const ext = Math.max(Math.abs(v.zProspective), Math.abs(v.zRetrospective));
      if (ext > maxExtent) maxExtent = ext;
    }
    maxExtent = Math.ceil(maxExtent) + 0.5;
    const margin = 50;
    const plotR = (size / 2) - margin;
    const scale = plotR / maxExtent;

    // Background
    ctx.fillStyle = isDark ? "#1e1e1e" : "#fafafa";
    ctx.fillRect(0, 0, size, size);

    // Grid circles
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let r = 1; r <= Math.ceil(maxExtent); r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, cy);
    ctx.lineTo(size - margin, cy);
    ctx.moveTo(cx, margin);
    ctx.lineTo(cx, size - margin);
    ctx.stroke();

    // Significance circle (r = 1.96)
    ctx.strokeStyle = isDark ? "rgba(255,100,100,0.4)" : "rgba(200,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, 1.96 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Quadrant labels
    ctx.font = "11px sans-serif";
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)";
    ctx.textAlign = "center";
    ctx.fillText("Q I: Mutual Activation", cx + plotR / 2, margin + 14);
    ctx.fillText("Q II: Retro. Activation", cx - plotR / 2, margin + 14);
    ctx.fillText("Q III: Mutual Inhibition", cx - plotR / 2, size - margin - 6);
    ctx.fillText("Q IV: Prosp. Activation", cx + plotR / 2, size - margin - 6);

    // Axis labels
    ctx.fillStyle = textColor;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("z Prospective →", size - margin - 40, cy + 16);
    ctx.save();
    ctx.translate(margin - 12, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("z Retrospective →", 0, 0);
    ctx.restore();

    // Plot vectors
    for (const v of result.vectors) {
      const px = cx + v.zProspective * scale;
      const py = cy - v.zRetrospective * scale; // Y inverted

      // Line from center
      ctx.strokeStyle = v.significant ? v.color : (isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)");
      ctx.lineWidth = v.significant ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.stroke();

      // Dot
      ctx.beginPath();
      ctx.arc(px, py, v.significant ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = v.color;
      ctx.globalAlpha = v.significant ? 1 : 0.4;
      ctx.fill();
      if (v.significant) {
        ctx.strokeStyle = isDark ? "#fff" : "#000";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Label (significant only)
      if (v.significant) {
        ctx.font = "10px sans-serif";
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.fillText(v.code, px + 7, py + 3);
      }
    }

    // Tooltip
    const tooltip = container.createDiv({ cls: "codemarker-heatmap-tooltip" });
    tooltip.style.display = "none";
    canvas.addEventListener("mousemove", (e) => {
      const br = canvas.getBoundingClientRect();
      const mx = e.clientX - br.left;
      const my = e.clientY - br.top;
      let found = false;
      for (const v of result.vectors) {
        const px = cx + v.zProspective * scale;
        const py = cy - v.zRetrospective * scale;
        const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
        if (dist < 8) {
          tooltip.style.display = "block";
          tooltip.style.left = `${e.clientX - container.getBoundingClientRect().left + 12}px`;
          tooltip.style.top = `${e.clientY - container.getBoundingClientRect().top + 12}px`;
          tooltip.textContent = `${result.focalCode} → ${v.code}: z_p=${v.zProspective}, z_r=${v.zRetrospective}, r=${v.radius}, θ=${v.angle}° (Q${v.quadrant}) ${v.significant ? "★" : "n.s."}`;
          found = true;
          break;
        }
      }
      if (!found) tooltip.style.display = "none";
    });
    canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
  }

  private renderMiniPolar(canvas: HTMLCanvasElement, filters: FilterConfig): void {
    if (!this.data) return;
    const codes = this.data.codes.map((c) => c.name).sort();
    const focal = codes[0] ?? "";
    if (!focal) return;
    const result = calculatePolarCoordinates(this.data, filters, focal, 5);

    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    ctx.fillStyle = isDark ? "#1e1e1e" : "#fafafa";
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    let maxExtent = 3;
    for (const v of result.vectors) {
      const ext = Math.max(Math.abs(v.zProspective), Math.abs(v.zRetrospective));
      if (ext > maxExtent) maxExtent = ext;
    }
    maxExtent = Math.ceil(maxExtent) + 0.5;
    const plotR = Math.min(W, H) / 2 - 20;
    const scale = plotR / maxExtent;

    // Axes
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(20, cy); ctx.lineTo(W - 20, cy);
    ctx.moveTo(cx, 20); ctx.lineTo(cx, H - 20);
    ctx.stroke();

    // Significance circle
    ctx.strokeStyle = isDark ? "rgba(255,100,100,0.3)" : "rgba(200,0,0,0.2)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, 1.96 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vectors
    for (const v of result.vectors) {
      const px = cx + v.zProspective * scale;
      const py = cy - v.zRetrospective * scale;
      ctx.beginPath();
      ctx.arc(px, py, v.significant ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = v.color;
      ctx.globalAlpha = v.significant ? 0.9 : 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private exportPolarCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const codes = this.data.codes.map((c) => c.name).sort();
    if (!this.polarFocalCode && codes.length > 0) this.polarFocalCode = codes[0];
    const result = calculatePolarCoordinates(this.data, filters, this.polarFocalCode, this.polarMaxLag);

    const rows: string[][] = [["focal", "conditioned", "z_prospective", "z_retrospective", "radius", "angle", "quadrant", "significant"]];
    for (const v of result.vectors) {
      rows.push([result.focalCode, v.code, String(v.zProspective), String(v.zRetrospective), String(v.radius), String(v.angle), String(v.quadrant), v.significant ? "yes" : "no"]);
    }
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-polar-coords-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ─── Chi-Square Independence Tests ───

  private renderChiSquareOptionsSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Chi-Square" });

    section.createDiv({ cls: "codemarker-config-sublabel", text: "Group by" });
    for (const [val, label] of [["source", "Source Type"], ["file", "File"]] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "chiGroupBy";
      radio.value = val;
      radio.checked = this.chiGroupBy === val;
      row.createSpan({ text: label });
      radio.addEventListener("change", () => {
        this.chiGroupBy = val;
        this.scheduleUpdate();
      });
    }
  }

  private renderChiSquareView(filters: FilterConfig): void {
    if (!this.data || !this.chartContainer) return;
    const container = this.chartContainer;
    const result = calculateChiSquare(this.data, filters, this.chiGroupBy);

    if (result.entries.length === 0) {
      container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
        text: "Not enough data for chi-square tests. Need at least 2 categories and codes with sufficient frequency.",
      });
      return;
    }

    const wrapper = container.createDiv({ cls: "codemarker-ts-wrapper" });

    // Summary
    const summary = wrapper.createDiv({ cls: "codemarker-ts-summary" });
    const sigCount = result.entries.filter((e) => e.significant).length;
    for (const [val, label] of [
      [String(result.entries.length), "Codes Tested"],
      [String(sigCount), "Significant (p<0.05)"],
      [String(result.categories.length), "Categories"],
      [result.groupBy === "source" ? "Source" : "File", "Group By"],
    ]) {
      const card = summary.createDiv({ cls: "codemarker-ts-summary-card" });
      card.createDiv({ cls: "codemarker-ts-summary-value", text: val });
      card.createDiv({ cls: "codemarker-ts-summary-label", text: label });
    }

    // Sort entries
    const entries = [...result.entries];
    const col = this.chiSort.col;
    const asc = this.chiSort.asc;
    entries.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (col === "code") { va = a.code; vb = b.code; }
      else if (col === "chiSquare") { va = a.chiSquare; vb = b.chiSquare; }
      else if (col === "df") { va = a.df; vb = b.df; }
      else if (col === "pValue") { va = a.pValue; vb = b.pValue; }
      else if (col === "cramersV") { va = a.cramersV; vb = b.cramersV; }
      else { va = a.pValue; vb = b.pValue; }
      if (typeof va === "string") return asc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return asc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    const tableWrap = wrapper.createDiv({ cls: "codemarker-ts-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "codemarker-ts-table" });

    // Header
    const thead = table.createEl("thead");
    const hrow = thead.createEl("tr");
    const columns = [
      { key: "code", label: "Code" },
      { key: "chiSquare", label: "χ²" },
      { key: "df", label: "df" },
      { key: "pValue", label: "p-value" },
      { key: "cramersV", label: "Cramér's V" },
      { key: "sig", label: "Sig." },
    ];
    for (const { key, label } of columns) {
      const th = hrow.createEl("th");
      th.textContent = label;
      if (key !== "sig") {
        const arrow = this.chiSort.col === key ? (this.chiSort.asc ? " ▲" : " ▼") : "";
        th.createSpan({ cls: "sort-arrow", text: arrow });
        th.addEventListener("click", () => {
          if (this.chiSort.col === key) this.chiSort.asc = !this.chiSort.asc;
          else { this.chiSort.col = key; this.chiSort.asc = key === "code"; }
          this.scheduleUpdate();
        });
      }
    }

    // Body
    const tbody = table.createEl("tbody");
    const maxV = Math.max(...entries.map((e) => e.cramersV), 0.001);

    for (const entry of entries) {
      const row = tbody.createEl("tr");

      // Code
      const codeCell = row.createEl("td");
      const codeWrap = codeCell.createDiv({ cls: "codemarker-ts-code-cell" });
      const swatch = codeWrap.createDiv({ cls: "codemarker-ts-swatch" });
      swatch.style.backgroundColor = entry.color;
      codeWrap.createSpan({ text: entry.code });

      // χ²
      const chiCell = row.createEl("td", { cls: "codemarker-ts-num" });
      chiCell.textContent = entry.chiSquare.toFixed(3);

      // df
      const dfCell = row.createEl("td", { cls: "codemarker-ts-num" });
      dfCell.textContent = String(entry.df);

      // p-value
      const pCell = row.createEl("td", { cls: "codemarker-ts-num" });
      const pStr = entry.pValue < 0.001 ? "<0.001" : entry.pValue.toFixed(4);
      pCell.textContent = pStr;
      if (entry.significant) {
        pCell.style.fontWeight = "600";
        pCell.style.color = "var(--text-accent)";
      }

      // Cramér's V with bar
      const vCell = row.createEl("td");
      const vWrap = vCell.createDiv({ cls: "codemarker-ts-ttr-cell" });
      const vBar = vWrap.createDiv({ cls: "codemarker-ts-ttr-bar" });
      const vFill = vBar.createDiv({ cls: "codemarker-ts-ttr-fill" });
      vFill.style.width = `${(entry.cramersV / maxV) * 100}%`;
      // Color gradient: low = blue-ish, high = purple
      const hue = 260 - entry.cramersV * 60;
      vFill.style.backgroundColor = `hsl(${hue}, 60%, 55%)`;
      vWrap.createDiv({ cls: "codemarker-ts-ttr-val", text: entry.cramersV.toFixed(3) });

      // Significance
      const sigCell = row.createEl("td", { cls: "codemarker-ts-num" });
      if (entry.pValue < 0.001) sigCell.textContent = "***";
      else if (entry.pValue < 0.01) sigCell.textContent = "**";
      else if (entry.pValue < 0.05) sigCell.textContent = "*";
      else sigCell.textContent = "n.s.";
      if (entry.significant) sigCell.style.fontWeight = "600";
    }
  }

  private renderMiniChiSquare(canvas: HTMLCanvasElement, filters: FilterConfig): void {
    if (!this.data) return;
    const result = calculateChiSquare(this.data, filters, "source");
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    ctx.fillStyle = isDark ? "#1e1e1e" : "#fafafa";
    ctx.fillRect(0, 0, W, H);

    // Top 5 codes by Cramér's V
    const top = result.entries.slice(0, 5).sort((a, b) => b.cramersV - a.cramersV);
    if (top.length === 0) return;

    const maxV = Math.max(...top.map((e) => e.cramersV), 0.01);
    const barH = Math.min(24, (H - 40) / top.length);
    const barAreaW = W - 40;
    const startY = (H - top.length * barH) / 2;

    for (let i = 0; i < top.length; i++) {
      const e = top[i];
      const y = startY + i * barH;
      const w = (e.cramersV / maxV) * barAreaW;
      ctx.fillStyle = e.color;
      ctx.globalAlpha = e.significant ? 0.8 : 0.3;
      ctx.fillRect(20, y + 2, w, barH - 4);
      ctx.globalAlpha = 1;
    }
  }

  private exportChiSquareCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const result = calculateChiSquare(this.data, filters, this.chiGroupBy);

    const rows: string[][] = [["code", "chi_square", "df", "p_value", "cramers_v", "significant"]];
    for (const e of result.entries) {
      rows.push([e.code, String(e.chiSquare), String(e.df), String(e.pValue), String(e.cramersV), e.significant ? "yes" : "no"]);
    }
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-chi-square-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ─── Decision Tree (CHAID) ───

  private renderDecisionTreeOptionsSection(): void {
    if (!this.data) return;
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Decision Tree" });

    // Outcome code dropdown
    section.createDiv({ cls: "codemarker-config-sublabel", text: "Outcome Code" });
    const select = section.createEl("select", { cls: "codemarker-config-select" });
    const codes = this.data.codes.map((c) => c.name).sort();
    if (!this.dtOutcomeCode && codes.length > 0) this.dtOutcomeCode = codes[0];
    for (const code of codes) {
      const opt = select.createEl("option", { text: code, value: code });
      if (code === this.dtOutcomeCode) opt.selected = true;
    }
    select.addEventListener("change", () => {
      this.dtOutcomeCode = select.value;
      this.scheduleUpdate();
    });

    // Max depth slider
    const depthLabel = section.createDiv({ cls: "codemarker-config-sublabel", text: `Max Depth: ${this.dtMaxDepth}` });
    const slider = section.createEl("input");
    slider.type = "range";
    slider.min = "1";
    slider.max = "6";
    slider.value = String(this.dtMaxDepth);
    slider.style.width = "100%";
    slider.addEventListener("input", () => {
      this.dtMaxDepth = Number(slider.value);
      depthLabel.textContent = `Max Depth: ${this.dtMaxDepth}`;
    });
    slider.addEventListener("change", () => {
      this.dtMaxDepth = Number(slider.value);
      this.scheduleUpdate();
    });
  }

  private renderDecisionTreeView(filters: FilterConfig): void {
    if (!this.data || !this.chartContainer) return;
    const container = this.chartContainer;

    const codes = this.data.codes.map((c) => c.name).sort();
    if (!this.dtOutcomeCode && codes.length > 0) this.dtOutcomeCode = codes[0];

    const result = buildDecisionTree(this.data, filters, this.dtOutcomeCode, this.dtMaxDepth, 2);

    if (result.totalMarkers === 0 || result.predictors.length === 0) {
      container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
        text: "Not enough data to build a decision tree. Need at least 2 codes with sufficient frequency.",
      });
      return;
    }

    // Wrapper
    const wrapper = container.createDiv({ cls: "codemarker-dt-wrapper" });

    // Title bar with metrics
    const header = wrapper.createDiv({ cls: "codemarker-dt-header" });
    header.createEl("strong", { text: `Decision Tree — Outcome: ${result.outcomeCode}` });

    const metricsBar = wrapper.createDiv({ cls: "codemarker-dt-metrics" });
    for (const [val, label] of [
      [`${(result.accuracy * 100).toFixed(1)}%`, "Accuracy"],
      [`${(result.aPriori * 100).toFixed(1)}%`, "A Priori"],
      [result.tau.toFixed(3), "Klecka's τ"],
      [String(result.totalMarkers), "Markers"],
      [String(result.predictors.length), "Predictors"],
    ]) {
      const card = metricsBar.createDiv({ cls: "codemarker-dt-metric-card" });
      card.createDiv({ cls: "codemarker-dt-metric-val", text: val });
      card.createDiv({ cls: "codemarker-dt-metric-label", text: label });
    }

    // Tree container (scrollable)
    const treeContainer = wrapper.createDiv({ cls: "codemarker-dt-tree" });
    this.renderTreeNode(treeContainer, result.root, result, 0);

    // Error analysis section
    if (result.errorLeaves.length > 0) {
      const errorSection = wrapper.createDiv({ cls: "codemarker-dt-error-section" });
      errorSection.createEl("strong", { text: `Error Analysis (${result.errorLeaves.reduce((s, e) => s + e.errors, 0)} misclassified markers)` });

      for (const leaf of result.errorLeaves) {
        const row = errorSection.createDiv({ cls: "codemarker-dt-error-row" });
        row.createSpan({ text: `Node #${leaf.nodeId}: ${leaf.errors} errors` });
        row.createSpan({ cls: "codemarker-dt-error-path", text: leaf.path });

        const btn = row.createEl("button", { cls: "codemarker-dt-error-btn", text: "View in Text Retrieval" });
        btn.addEventListener("click", () => {
          // Switch to text-retrieval mode (user can inspect the markers)
          this.viewMode = "text-retrieval";
          this.scheduleUpdate();
          new Notice(`Switched to Text Retrieval. ${leaf.errors} misclassified markers from node #${leaf.nodeId}.`);
        });
      }
    }
  }

  private renderTreeNode(
    parent: HTMLElement,
    node: DecisionTreeNode,
    result: DecisionTreeResult,
    childIndex: number,
  ): void {
    const nodeEl = parent.createDiv({ cls: "codemarker-dt-node" });

    // Edge label (for non-root)
    if (node.depth > 0) {
      const edgeLabel = nodeEl.createDiv({ cls: "codemarker-dt-edge-label" });
      edgeLabel.textContent = childIndex === 0 ? "Absent" : "Present";
    }

    const card = nodeEl.createDiv({ cls: "codemarker-dt-card" });

    const isLeaf = node.children.length === 0;
    if (isLeaf) card.classList.add("is-leaf");

    // Prediction badge
    const predBadge = card.createDiv({ cls: "codemarker-dt-pred-badge" });
    predBadge.textContent = node.prediction === 1 ? "✓ Present" : "✗ Absent";
    predBadge.classList.add(node.prediction === 1 ? "is-positive" : "is-negative");

    // Stats
    const stats = card.createDiv({ cls: "codemarker-dt-card-stats" });
    stats.createSpan({ text: `n = ${node.n}` });
    stats.createSpan({ cls: "codemarker-dt-stat-sep", text: "·" });
    stats.createSpan({ text: `${(node.accuracy * 100).toFixed(1)}%` });
    stats.createSpan({ cls: "codemarker-dt-stat-sep", text: "·" });
    stats.createSpan({ text: `${node.correct} ✓` });
    stats.createSpan({ cls: "codemarker-dt-stat-sep", text: "·" });
    stats.createSpan({ text: `${node.errors} ✗` });

    // Distribution bar
    const distBar = card.createDiv({ cls: "codemarker-dt-dist-bar" });
    const posPct = node.n > 0 ? (node.nPositive / node.n) * 100 : 0;
    const posSegment = distBar.createDiv({ cls: "codemarker-dt-dist-pos" });
    posSegment.style.width = `${posPct}%`;
    posSegment.style.backgroundColor = result.outcomeColor;

    // Split info
    if (node.split) {
      const splitInfo = card.createDiv({ cls: "codemarker-dt-split-info" });
      const swatch = splitInfo.createSpan({ cls: "codemarker-dt-split-swatch" });
      swatch.style.backgroundColor = node.split.predictorColor;
      splitInfo.createSpan({ text: node.split.predictor });
      splitInfo.createSpan({ cls: "codemarker-dt-split-chi", text: `χ²=${node.split.chiSquare}, p=${node.split.pValue < 0.001 ? "<.001" : node.split.pValue.toFixed(3)}` });
    }

    // Children
    if (node.children.length > 0) {
      const childrenContainer = nodeEl.createDiv({ cls: "codemarker-dt-children" });
      for (let i = 0; i < node.children.length; i++) {
        this.renderTreeNode(childrenContainer, node.children[i], result, i);
      }
    }
  }

  private renderMiniDecisionTree(canvas: HTMLCanvasElement, filters: FilterConfig): void {
    if (!this.data) return;
    const codes = this.data.codes.map((c) => c.name).sort();
    const outcome = codes[0] ?? "";
    if (!outcome) return;
    const result = buildDecisionTree(this.data, filters, outcome, 3, 2);

    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    ctx.fillStyle = isDark ? "#1e1e1e" : "#fafafa";
    ctx.fillRect(0, 0, W, H);

    // Draw mini tree structure
    const nodePositions = new Map<number, { x: number; y: number }>();

    function layoutNode(node: DecisionTreeNode, x: number, y: number, width: number): void {
      nodePositions.set(node.id, { x, y });
      if (node.children.length > 0) {
        const childWidth = width / node.children.length;
        for (let i = 0; i < node.children.length; i++) {
          const cx = x - width / 2 + childWidth * (i + 0.5);
          layoutNode(node.children[i], cx, y + 40, childWidth);
        }
      }
    }

    layoutNode(result.root, W / 2, 25, W - 40);

    // Draw edges
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    function drawEdges(node: DecisionTreeNode): void {
      const pos = nodePositions.get(node.id)!;
      for (const child of node.children) {
        const cPos = nodePositions.get(child.id)!;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y + 8);
        ctx.lineTo(cPos.x, cPos.y - 8);
        ctx.stroke();
        drawEdges(child);
      }
    }
    drawEdges(result.root);

    // Draw nodes
    for (const [id, pos] of nodePositions) {
      // Find node for color
      let isLeaf = false;
      let prediction = 0;
      function findNode(n: DecisionTreeNode): DecisionTreeNode | null {
        if (n.id === id) return n;
        for (const c of n.children) { const r = findNode(c); if (r) return r; }
        return null;
      }
      const node = findNode(result.root);
      if (node) {
        isLeaf = node.children.length === 0;
        prediction = node.prediction;
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isLeaf ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = prediction === 1 ? result.outcomeColor : (isDark ? "#555" : "#ccc");
      ctx.fill();
      if (isLeaf) {
        ctx.strokeStyle = isDark ? "#fff" : "#333";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Accuracy label
    ctx.font = "11px sans-serif";
    ctx.fillStyle = isDark ? "#aaa" : "#666";
    ctx.textAlign = "center";
    ctx.fillText(`Acc: ${(result.accuracy * 100).toFixed(0)}%, τ=${result.tau.toFixed(2)}`, W / 2, H - 10);
  }

  private exportDecisionTreeCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const codes = this.data.codes.map((c) => c.name).sort();
    if (!this.dtOutcomeCode && codes.length > 0) this.dtOutcomeCode = codes[0];
    const result = buildDecisionTree(this.data, filters, this.dtOutcomeCode, this.dtMaxDepth, 2);

    const rows: string[][] = [["node_id", "depth", "n", "n_positive", "n_negative", "prediction", "accuracy", "correct", "errors", "split_predictor", "split_chi_square", "split_p_value", "is_leaf"]];

    function collectNodes(node: DecisionTreeNode): void {
      rows.push([
        String(node.id),
        String(node.depth),
        String(node.n),
        String(node.nPositive),
        String(node.nNegative),
        node.prediction === 1 ? "present" : "absent",
        String(node.accuracy),
        String(node.correct),
        String(node.errors),
        node.split?.predictor ?? "",
        node.split ? String(node.split.chiSquare) : "",
        node.split ? String(node.split.pValue) : "",
        node.children.length === 0 ? "yes" : "no",
      ]);
      for (const child of node.children) collectNodes(child);
    }
    collectNodes(result.root);

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-decision-tree-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ─── Source Comparison ───

  private renderSourceComparisonOptionsSection(): void {
    const section = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    section.createDiv({ cls: "codemarker-config-section-title", text: "Sub-view" });

    for (const [value, label] of [["chart", "Chart"], ["table", "Table"]] as const) {
      const row = section.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "srcCompSubView";
      radio.value = value;
      radio.checked = this.srcCompSubView === value;
      row.createSpan({ text: label });
      radio.addEventListener("change", () => {
        this.srcCompSubView = value;
        this.scheduleUpdate();
      });
      row.addEventListener("click", (e) => {
        if (e.target !== radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); }
      });
    }

    const modeSection = this.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
    modeSection.createDiv({ cls: "codemarker-config-section-title", text: "Display" });

    for (const [value, label] of [["count", "Count"], ["percent-code", "% of Code"], ["percent-source", "% of Source"]] as const) {
      const row = modeSection.createDiv({ cls: "codemarker-config-row" });
      const radio = row.createEl("input", { type: "radio" });
      radio.name = "srcCompDisplayMode";
      radio.value = value;
      radio.checked = this.srcCompDisplayMode === value;
      row.createSpan({ text: label });
      radio.addEventListener("change", () => {
        this.srcCompDisplayMode = value;
        this.scheduleUpdate();
      });
      row.addEventListener("click", (e) => {
        if (e.target !== radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); }
      });
    }
  }

  private renderSourceComparison(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;
    const result = calculateSourceComparison(this.data, filters);

    if (result.entries.length === 0) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "No coded data found for source comparison.",
      });
      return;
    }

    if (this.srcCompSubView === "chart") {
      this.renderSourceComparisonChart(result, this.chartContainer);
    } else {
      this.renderSourceComparisonTable(result, this.chartContainer);
    }
  }

  private readonly SOURCE_COLORS: Record<string, string> = {
    markdown: "#42A5F5",
    "csv-segment": "#66BB6A",
    "csv-row": "#81C784",
    image: "#FFA726",
    pdf: "#EF5350",
    audio: "#AB47BC",
    video: "#7E57C2",
  };

  private renderSourceComparisonChart(result: SourceComparisonResult, container: HTMLElement): void {
    const entries = result.entries;
    const sources = result.activeSources;
    const n = entries.length;
    const barGroupHeight = 22;
    const barH = Math.max(4, Math.floor((barGroupHeight - 2) / sources.length));
    const rowHeight = barGroupHeight + 8;
    const labelSpace = 120;
    const rightPad = 60;
    const topPad = 30;

    const wrapper = container.createDiv();
    wrapper.style.position = "relative";
    wrapper.style.overflow = "auto";

    const totalW = Math.max(600, (container.getBoundingClientRect().width || 600) - 32);
    const totalH = topPad + n * rowHeight + 20;

    const canvas = wrapper.createEl("canvas");
    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${totalH}px`;

    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

    // Find max value for bar scaling
    let maxVal = 1;
    for (const e of entries) {
      for (const s of sources) {
        let val: number;
        if (this.srcCompDisplayMode === "percent-code") val = e.bySourcePctOfCode[s];
        else if (this.srcCompDisplayMode === "percent-source") val = e.bySourcePctOfSrc[s];
        else val = e.bySource[s];
        if (val > maxVal) maxVal = val;
      }
    }

    const barAreaW = totalW - labelSpace - rightPad;

    // Legend
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "middle";
    let legendX = labelSpace;
    for (const s of sources) {
      ctx.fillStyle = this.SOURCE_COLORS[s] ?? "#888";
      ctx.fillRect(legendX, 6, 10, 10);
      ctx.fillStyle = textColor;
      const label = s === "csv-segment" ? "CSV-Seg" : s === "csv-row" ? "CSV-Row" : s.charAt(0).toUpperCase() + s.slice(1);
      ctx.textAlign = "left";
      ctx.fillText(label, legendX + 14, 12);
      legendX += ctx.measureText(label).width + 28;
    }

    // Bars
    for (let i = 0; i < n; i++) {
      const e = entries[i];
      const baseY = topPad + i * rowHeight;

      // Code label
      ctx.fillStyle = textColor;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const label = e.code.length > 14 ? e.code.slice(0, 13) + "\u2026" : e.code;
      ctx.fillText(label, labelSpace - 8, baseY + barGroupHeight / 2);

      // Swatch
      ctx.fillStyle = e.color;
      ctx.fillRect(labelSpace - 6 - ctx.measureText(label).width - 14, baseY + barGroupHeight / 2 - 5, 10, 10);

      for (let si = 0; si < sources.length; si++) {
        const s = sources[si];
        let val: number;
        if (this.srcCompDisplayMode === "percent-code") val = e.bySourcePctOfCode[s];
        else if (this.srcCompDisplayMode === "percent-source") val = e.bySourcePctOfSrc[s];
        else val = e.bySource[s];

        const barW = Math.max(0, (val / maxVal) * barAreaW);
        const y = baseY + si * barH;

        ctx.fillStyle = this.SOURCE_COLORS[s] ?? "#888";
        ctx.fillRect(labelSpace, y, barW, barH - 1);

        // Value label
        if (val > 0) {
          ctx.fillStyle = textColor;
          ctx.font = "9px sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const suffix = this.srcCompDisplayMode !== "count" ? "%" : "";
          ctx.fillText(`${val}${suffix}`, labelSpace + barW + 4, y + barH / 2);
        }
      }
    }
  }

  private renderSourceComparisonTable(result: SourceComparisonResult, container: HTMLElement): void {
    const wrapper = container.createDiv({ cls: "codemarker-ts-wrapper" });
    const tableWrap = wrapper.createDiv({ cls: "codemarker-ts-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "codemarker-ts-table" });

    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");

    const columns = [
      { key: "code", label: "Code" },
      { key: "total", label: "Total" },
      ...result.activeSources.map((s) => ({
        key: s,
        label: s === "csv-segment" ? "CSV-Seg" : s === "csv-row" ? "CSV-Row" : s.charAt(0).toUpperCase() + s.slice(1),
      })),
    ];

    for (const col of columns) {
      const th = headerRow.createEl("th");
      th.textContent = col.label;
      if (col.key !== "code") th.addClass("codemarker-ts-num");
      const arrow = this.srcCompSort.col === col.key ? (this.srcCompSort.asc ? " \u25b2" : " \u25bc") : "";
      if (arrow) {
        const span = th.createSpan({ cls: "sort-arrow", text: arrow });
      }
      th.addEventListener("click", () => {
        if (this.srcCompSort.col === col.key) {
          this.srcCompSort.asc = !this.srcCompSort.asc;
        } else {
          this.srcCompSort = { col: col.key, asc: col.key === "code" };
        }
        this.scheduleUpdate();
      });
    }

    // Sort entries
    const entries = [...result.entries];
    entries.sort((a, b) => {
      const col = this.srcCompSort.col;
      const asc = this.srcCompSort.asc ? 1 : -1;
      if (col === "code") return a.code.localeCompare(b.code) * asc;
      if (col === "total") return (a.total - b.total) * asc;
      const sKey = col as SourceType;
      const aVal = this.srcCompDisplayMode === "percent-code" ? a.bySourcePctOfCode[sKey]
        : this.srcCompDisplayMode === "percent-source" ? a.bySourcePctOfSrc[sKey]
        : a.bySource[sKey];
      const bVal = this.srcCompDisplayMode === "percent-code" ? b.bySourcePctOfCode[sKey]
        : this.srcCompDisplayMode === "percent-source" ? b.bySourcePctOfSrc[sKey]
        : b.bySource[sKey];
      return ((aVal ?? 0) - (bVal ?? 0)) * asc;
    });

    const tbody = table.createEl("tbody");
    for (const e of entries) {
      const tr = tbody.createEl("tr");
      // Code cell
      const codeCell = tr.createEl("td");
      const codeCellInner = codeCell.createDiv({ cls: "codemarker-ts-code-cell" });
      const swatch = codeCellInner.createSpan({ cls: "codemarker-ts-swatch" });
      swatch.style.backgroundColor = e.color;
      codeCellInner.createSpan({ text: e.code });

      // Total
      tr.createEl("td", { cls: "codemarker-ts-num", text: String(e.total) });

      // Per source
      for (const s of result.activeSources) {
        let val: number;
        if (this.srcCompDisplayMode === "percent-code") val = e.bySourcePctOfCode[s];
        else if (this.srcCompDisplayMode === "percent-source") val = e.bySourcePctOfSrc[s];
        else val = e.bySource[s];
        const suffix = this.srcCompDisplayMode !== "count" ? "%" : "";
        const td = tr.createEl("td", { cls: "codemarker-ts-num", text: `${val}${suffix}` });
        // Heat bar
        if (val > 0 && this.srcCompDisplayMode === "count") {
          const maxSrc = result.sourceTotals[s] || 1;
          const pct = Math.min(100, (e.bySource[s] / maxSrc) * 100);
          td.style.background = `linear-gradient(90deg, ${this.SOURCE_COLORS[s] ?? "#888"}22 ${pct}%, transparent ${pct}%)`;
        }
      }
    }
  }

  private renderMiniSourceComparison(canvas: HTMLCanvasElement, freq: import("../data/dataTypes").FrequencyResult[]): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || freq.length === 0) return;

    const W = canvas.width;
    const H = canvas.height;
    const top8 = freq.slice(0, 8);
    const barHeight = Math.min(16, (H - 10) / top8.length - 2);
    const leftPad = 60;
    const rightPad = 10;
    const barAreaW = W - leftPad - rightPad;
    const isDark = document.body.classList.contains("theme-dark");
    const textColor = isDark ? "#b0b0b0" : "#444";

    for (let i = 0; i < top8.length; i++) {
      const r = top8[i];
      const y = 5 + i * (barHeight + 3);
      let offset = 0;

      // Label
      ctx.fillStyle = textColor;
      ctx.font = "9px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const label = r.code.length > 8 ? r.code.slice(0, 7) + "\u2026" : r.code;
      ctx.fillText(label, leftPad - 4, y + barHeight / 2);

      // Stacked bar
      const total = r.total || 1;
      for (const s of ["markdown", "csv-segment", "csv-row", "image", "pdf", "audio", "video"] as const) {
        const val = r.bySource[s];
        if (val <= 0) continue;
        const barW = (val / total) * barAreaW;
        ctx.fillStyle = this.SOURCE_COLORS[s] ?? "#888";
        ctx.fillRect(leftPad + offset, y, barW, barHeight);
        offset += barW;
      }
    }
  }

  private exportSourceComparisonCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const result = calculateSourceComparison(this.data, filters);
    const allSources: SourceType[] = ["markdown", "csv-segment", "csv-row", "image", "pdf", "audio", "video"];
    const header = ["code", "total", ...allSources.map((s) => `${s}_count`), ...allSources.map((s) => `${s}_pct_of_code`), ...allSources.map((s) => `${s}_pct_of_source`)];
    const rows = [header];
    for (const e of result.entries) {
      rows.push([
        e.code,
        String(e.total),
        ...allSources.map((s) => String(e.bySource[s])),
        ...allSources.map((s) => String(e.bySourcePctOfCode[s])),
        ...allSources.map((s) => String(e.bySourcePctOfSrc[s])),
      ]);
    }
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-source-comparison-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ─── Code Overlap ───

  private renderOverlapMatrix(filters: FilterConfig): void {
    if (!this.chartContainer || !this.data) return;

    const result = calculateOverlap(this.data, filters);

    if (result.codes.length < 2) {
      this.chartContainer.createDiv({
        cls: "codemarker-analytics-empty",
        text: "Need at least 2 codes with positional data for overlap analysis.",
      });
      return;
    }

    // Skipped sources notice
    if (result.skippedSources.length > 0) {
      const notice = this.chartContainer.createDiv({ cls: "codemarker-overlap-notice" });
      notice.textContent = `Skipped sources (no positional data): ${result.skippedSources.join(", ")}`;
    }

    // Meta info
    const meta = this.chartContainer.createDiv({ cls: "codemarker-overlap-meta" });
    const fileCount = new Set(this.data.markers.filter((m) => filters.sources.includes(m.source as any)).map((m) => m.file)).size;
    meta.textContent = `${result.totalPairsChecked} marker pairs checked across ${fileCount} files`;

    // Reorder using co-occurrence sort logic (same interface)
    const asCooc: CooccurrenceResult = {
      codes: [...result.codes],
      colors: [...result.colors],
      matrix: result.matrix.map((r) => [...r]),
      maxValue: result.maxValue,
    };
    this.reorderCooccurrence(asCooc);

    const n = asCooc.codes.length;
    const cellSize = n > 25 ? 35 : n > 15 ? Math.max(35, Math.floor(500 / n)) : 60;
    const labelSpace = 120;

    const wrapper = this.chartContainer.createDiv();
    wrapper.style.position = "relative";
    wrapper.style.overflow = "auto";

    const canvas = wrapper.createEl("canvas");
    const totalW = labelSpace + n * cellSize;
    const totalH = labelSpace + n * cellSize;
    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${totalH}px`;

    const ctx = canvas.getContext("2d")!;
    const isDark = document.body.classList.contains("theme-dark");
    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

    const displayMatrix = this.computeDisplayMatrix(asCooc);
    const isNormalized = this.displayMode === "jaccard" || this.displayMode === "dice";

    // Draw cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = labelSpace + j * cellSize;
        const y = labelSpace + i * cellSize;
        const rawVal = asCooc.matrix[i][j];
        const dispVal = displayMatrix[i][j];

        const heatVal = isNormalized ? dispVal : rawVal;
        const heatMax = isNormalized ? 1 : asCooc.maxValue;
        ctx.fillStyle = this.heatmapColor(heatVal, heatMax, isDark);
        ctx.fillRect(x, y, cellSize, cellSize);

        if (i === j) {
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }

        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);

        let textVal: string;
        if (isNormalized) {
          textVal = dispVal.toFixed(2);
        } else if (this.displayMode === "percentage" && i !== j) {
          textVal = `${dispVal.toFixed(0)}%`;
        } else {
          textVal = `${dispVal}`;
        }
        const textBright = this.isLightColor(this.heatmapColor(heatVal, heatMax, isDark));
        ctx.fillStyle = textBright ? "#1a1a1a" : "#f0f0f0";
        ctx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(textVal, x + cellSize / 2, y + cellSize / 2);
      }
    }

    // Left labels
    ctx.fillStyle = textColor;
    ctx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const y = labelSpace + i * cellSize + cellSize / 2;
      const label = asCooc.codes[i].length > 15
        ? asCooc.codes[i].slice(0, 14) + "\u2026"
        : asCooc.codes[i];
      ctx.fillText(label, labelSpace - 6, y);
    }

    // Top labels (rotated)
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let j = 0; j < n; j++) {
      const x = labelSpace + j * cellSize + cellSize / 2;
      ctx.save();
      ctx.translate(x, labelSpace - 6);
      ctx.rotate(-Math.PI / 4);
      const label = asCooc.codes[j].length > 15
        ? asCooc.codes[j].slice(0, 14) + "\u2026"
        : asCooc.codes[j];
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Tooltip
    const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
    tooltip.style.display = "none";

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const col = Math.floor((mx - labelSpace) / cellSize);
      const row = Math.floor((my - labelSpace) / cellSize);

      if (col >= 0 && col < n && row >= 0 && row < n) {
        const val = asCooc.matrix[row][col];
        const dispVal = displayMatrix[row][col];
        const suffix = this.displayMode === "percentage" && row !== col ? "%" : "";
        let dispText: string;
        if (row === col) {
          dispText = `${asCooc.codes[row]}: ${val} markers`;
        } else if (isNormalized) {
          dispText = `${asCooc.codes[row]} \u2229 ${asCooc.codes[col]}: ${dispVal.toFixed(2)} overlap`;
        } else {
          dispText = `${asCooc.codes[row]} \u2229 ${asCooc.codes[col]}: ${dispVal}${suffix} overlaps`;
        }
        tooltip.textContent = dispText;
        tooltip.style.display = "";
        tooltip.style.left = `${mx + 12}px`;
        tooltip.style.top = `${my + 12}px`;
      } else {
        tooltip.style.display = "none";
      }
    });

    canvas.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  }

  private renderMiniMatrix(canvas: HTMLCanvasElement, codes: string[], colors: string[], matrix: number[][], maxValue: number): void {
    const ctx = canvas.getContext("2d");
    if (!ctx || codes.length < 2) return;

    const W = canvas.width;
    const H = canvas.height;
    const n = codes.length;
    const pad = 10;
    const cellSize = Math.min((W - 2 * pad) / n, (H - 2 * pad) / n);
    const offsetX = (W - n * cellSize) / 2;
    const offsetY = (H - n * cellSize) / 2;
    const isDark = document.body.classList.contains("theme-dark");

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = offsetX + j * cellSize;
        const y = offsetY + i * cellSize;
        ctx.fillStyle = this.heatmapColor(matrix[i][j], maxValue, isDark);
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  private exportOverlapCSV(date: string): void {
    if (!this.data) return;
    const filters = this.buildFilterConfig();
    const result = calculateOverlap(this.data, filters);
    const rows: string[][] = [["", ...result.codes]];
    for (let i = 0; i < result.codes.length; i++) {
      rows.push([result.codes[i], ...result.matrix[i].map(String)]);
    }
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-code-overlap-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

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

    if (this.viewMode === "word-cloud") {
      this.exportWordCloudCSV(date);
      return;
    }
    if (this.viewMode === "acm") {
      this.exportACMCSV(date);
      return;
    }
    if (this.viewMode === "mds") {
      this.exportMDSCSV(date);
      return;
    }
    if (this.viewMode === "temporal") {
      this.exportTemporalCSV(date);
      return;
    }
    if (this.viewMode === "text-stats") {
      this.exportTextStatsCSV(date);
      return;
    }
    if (this.viewMode === "dendrogram") {
      this.exportDendrogramCSV(date);
      return;
    }
    if (this.viewMode === "lag-sequential") {
      this.exportLagCSV(date);
      return;
    }
    if (this.viewMode === "polar-coords") {
      this.exportPolarCSV(date);
      return;
    }
    if (this.viewMode === "chi-square") {
      this.exportChiSquareCSV(date);
      return;
    }
    if (this.viewMode === "decision-tree") {
      this.exportDecisionTreeCSV(date);
      return;
    }
    if (this.viewMode === "source-comparison") {
      this.exportSourceComparisonCSV(date);
      return;
    }
    if (this.viewMode === "code-overlap") {
      this.exportOverlapCSV(date);
      return;
    }

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
          if (result.matrix[i][j] > 0) {
            rows.push([result.codes[i], result.codes[j], String(result.matrix[i][j])]);
          }
        }
      }
      csvContent = rows.map((r) => r.join(",")).join("\n");
      filename = `codemarker-graph-${date}.csv`;
    } else if (this.viewMode === "doc-matrix") {
      const result = calculateDocumentCodeMatrix(this.data, filters);
      const rows: string[][] = [["file", ...result.codes]];
      for (let fi = 0; fi < result.files.length; fi++) {
        rows.push([result.files[fi], ...result.matrix[fi].map(String)]);
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
        rows.push([result.codes[i], ...result.matrix[i].map(String)]);
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
}
