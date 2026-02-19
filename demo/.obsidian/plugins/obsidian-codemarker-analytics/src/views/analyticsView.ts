import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import type CodeMarkerAnalyticsPlugin from "../main";
import type { ConsolidatedData, FilterConfig, CooccurrenceResult, DocCodeMatrixResult, EvolutionResult } from "../data/dataTypes";
import { calculateFrequency, calculateCooccurrence, calculateDocumentCodeMatrix, calculateEvolution } from "../data/statsEngine";
import { TextExtractor, type ExtractedSegment } from "../data/textExtractor";

export const ANALYTICS_VIEW_TYPE = "codemarker-analytics";

export type ViewMode = "dashboard" | "frequency" | "cooccurrence" | "graph" | "doc-matrix" | "evolution" | "text-retrieval";
export type SortMode = "alpha" | "freq-desc" | "freq-asc";
export type MatrixSortMode = "alpha" | "total";
export type GroupMode = "none" | "source" | "file";
export type DisplayMode = "absolute" | "percentage" | "presence";

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
  private enabledSources = new Set(["markdown", "csv-segment", "csv-row", "image", "pdf"]);
  private enabledCodes = new Set<string>();
  private minFrequency = 1;
  private codeSearch = "";
  private matrixSortMode: MatrixSortMode = "alpha";
  private evolutionFile = "";  // "" = all files

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

    if (!this.data || (!this.data.sources.markdown && !this.data.sources.csv && !this.data.sources.image && !this.data.sources.pdf)) {
      empty.createEl("h3", { text: "No CodeMarker data found" });
      const p = empty.createEl("p");
      p.innerHTML = [
        "Install and use one or more CodeMarker plugins to start coding:",
        "&bull; obsidian-codemarker-v2 (Markdown)",
        "&bull; obsidian-codemarker-csv (CSV)",
        "&bull; obsidian-codemarker-image (Image)",
        "&bull; obsidian-codemarker-pdf (PDF)",
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
    // ── Display (matrix only) ──
    if (this.viewMode === "cooccurrence") {
      this.renderDisplaySection();
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

    // Draw cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = labelSpace + j * cellSize;
        const y = labelSpace + i * cellSize;
        const rawVal = result.matrix[i][j];
        const dispVal = displayMatrix[i][j];

        // Cell background
        ctx.fillStyle = this.heatmapColor(rawVal, result.maxValue, isDark);
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
        const textVal = this.displayMode === "percentage" && i !== j
          ? `${dispVal.toFixed(0)}%`
          : `${dispVal}`;
        const textBright = this.isLightColor(this.heatmapColor(rawVal, result.maxValue, isDark));
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
        const text = row === col
          ? `${result.codes[row]}: ${val} total`
          : `${result.codes[row]} \u00d7 ${result.codes[col]}: ${dispVal}${suffix}`;
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
    const badgeCls = seg.source === "markdown"
      ? "is-markdown"
      : seg.source === "csv-segment"
      ? "is-csv-segment"
      : seg.source === "csv-row"
      ? "is-csv-row"
      : seg.source === "pdf"
      ? "is-pdf"
      : "is-image";
    const badgeText = seg.source === "markdown"
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

  private formatLocation(seg: ExtractedSegment): string {
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
        } else {
          // percentage
          if (i === j) {
            m[i][j] = raw; // diagonal stays as count
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

  private updateFooter(): void {
    if (!this.footerEl || !this.data) return;
    const ts = new Date(this.data.lastUpdated);
    const time = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const activeSources: string[] = [];
    if (this.data.sources.markdown) activeSources.push("markdown");
    if (this.data.sources.csv) activeSources.push("csv");
    if (this.data.sources.image) activeSources.push("image");
    if (this.data.sources.pdf) activeSources.push("pdf");

    this.footerEl.textContent = `Last updated: ${time} \u00b7 ${this.data.markers.length} markers \u00b7 ${this.data.codes.length} codes \u00b7 Sources: ${activeSources.join(", ") || "none"}`;
  }

  private exportPNG(): void {
    if (this.viewMode === "dashboard" || this.viewMode === "text-retrieval") {
      new Notice("Export PNG is not available for this view");
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
      new Notice("Export CSV is not available for this view");
      return;
    }
    if (!this.data) return;
    const filters = this.buildFilterConfig();

    let csvContent: string;
    let filename: string;
    const date = new Date().toISOString().slice(0, 10);

    if (this.viewMode === "frequency") {
      const results = calculateFrequency(this.data, filters);
      const rows = [["code", "total", "markdown", "csv_segment", "csv_row", "image"]];
      for (const r of results) {
        rows.push([
          r.code,
          String(r.total),
          String(r.bySource.markdown),
          String(r.bySource["csv-segment"]),
          String(r.bySource["csv-row"]),
          String(r.bySource.image),
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
