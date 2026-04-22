import { Notice } from "obsidian";
import type { FilterConfig, UnifiedMarker, FrequencyResult } from "../../data/dataTypes";
import { TextExtractor } from "../../data/textExtractor";
import { calculateWordFrequencies, type WordFrequencyResult } from "../../data/wordFrequency";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { TooltipItem } from "chart.js";
// Force chartjs-chart-wordcloud module augmentation (registers 'wordCloud' in ChartTypeRegistry)
import type {} from "chartjs-chart-wordcloud";
import { buildCsv } from "../shared/chartHelpers";

export function renderWordCloudOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
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
    radio.checked = ctx.wcStopWordsLang === value;
    row.createSpan({ text: label });
    radio.addEventListener("change", () => {
      ctx.wcStopWordsLang = value;
      ctx.scheduleUpdate();
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
    attr: { type: "number", min: "2", max: "6", value: String(ctx.wcMinWordLength) },
  });
  lenInput.addEventListener("input", () => {
    const v = parseInt(lenInput.value);
    if (!isNaN(v) && v >= 2 && v <= 6) { ctx.wcMinWordLength = v; ctx.scheduleUpdate(); }
  });

  // Max words
  const maxRow = section.createDiv({ cls: "codemarker-config-row" });
  maxRow.createSpan({ text: "Max words" });
  const maxInput = maxRow.createEl("input", {
    cls: "codemarker-config-number",
    attr: { type: "number", min: "20", max: "200", value: String(ctx.wcMaxWords) },
  });
  maxInput.addEventListener("input", () => {
    const v = parseInt(maxInput.value);
    if (!isNaN(v) && v >= 20 && v <= 200) { ctx.wcMaxWords = v; ctx.scheduleUpdate(); }
  });
}

export function renderWordCloud(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const filtered = ctx.data.markers.filter((m) =>
    filters.sources.includes(m.source) &&
    m.codes.some((c) => !filters.excludeCodes.includes(c))
  );

  if (filtered.length === 0) {
    ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "No data matches current filters." });
    return;
  }

  const loadingEl = ctx.chartContainer.createDiv({ cls: "codemarker-wc-loading", text: "Extracting text..." });
  const gen = ctx.renderGeneration;
  loadAndRenderWordCloud(ctx, filtered, loadingEl, gen);
}

async function loadAndRenderWordCloud(
  ctx: AnalyticsViewContext,
  markers: UnifiedMarker[],
  loadingEl: HTMLElement,
  generation: number,
): Promise<void> {
  if (!ctx.chartContainer) return;

  const extractor = new TextExtractor(ctx.plugin.app.vault);
  const segments = await extractor.extractBatch(markers);
  if (!ctx.isRenderCurrent(generation)) return;
  loadingEl.remove();

  const results = calculateWordFrequencies(segments, {
    stopWordsLang: ctx.wcStopWordsLang,
    minWordLength: ctx.wcMinWordLength,
    maxWords: ctx.wcMaxWords,
  });

  if (results.length === 0) {
    ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "No words found." });
    return;
  }

  renderWordCloudChart(ctx, results);
}

async function renderWordCloudChart(ctx: AnalyticsViewContext, results: WordFrequencyResult[]): Promise<void> {
  if (!ctx.chartContainer) return;

  const { Chart, registerables } = await import("chart.js");
  Chart.register(...registerables);

  const { WordCloudController, WordElement } = await import("chartjs-chart-wordcloud");
  Chart.register(WordCloudController, WordElement);

  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.height = "600px";
  wrapper.style.position = "relative";
  const canvas = wrapper.createEl("canvas");

  const maxCount = results[0]?.count ?? 1;
  const minCount = results[results.length - 1]?.count ?? 1;

  // Map code id → color (segment.codes carries codeIds post Phase C)
  const codeColorMap = new Map<string, string>();
  if (ctx.data) {
    for (const c of ctx.data.codes) codeColorMap.set(c.id, c.color);
  }

  // Color each word by its most frequent code
  const wordColors = results.map((r) => {
    if (r!.codes.length > 0) return codeColorMap.get(r!.codes[0]!) ?? "#888888";
    return "#888888";
  });

  ctx.activeChartInstance = new Chart(canvas, {
    type: "wordCloud",
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
            label: (tooltipCtx: TooltipItem<'wordCloud'>) => {
              const idx = tooltipCtx.dataIndex;
              const r = results[idx];
              return `${r!.word}: ${r!.count} (${r!.codes.slice(0, 3).join(", ")})`;
            },
          },
        },
      },
    },
  });
}

export function renderMiniWordCloud(canvas: HTMLCanvasElement, freq: FrequencyResult[]): void {
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
    const size = 9 + (r!.total / maxVal) * 14;
    ctx.font = `${Math.round(size)}px sans-serif`;
    ctx.fillStyle = r!.color;
    const label = r!.code.length > 8 ? r!.code.slice(0, 7) + "\u2026" : r!.code;
    ctx.fillText(label, x, y);
  }
}

export function exportWordCloudCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const filtered = ctx.data.markers.filter((m) =>
    filters.sources.includes(m.source) &&
    m.codes.some((c) => !filters.excludeCodes.includes(c))
  );

  // We need to extract text synchronously — if segments aren't cached, just export what we can
  // Use a simpler approach: export from last rendered data
  new Notice("Extracting text for export...");
  const extractor = new TextExtractor(ctx.plugin.app.vault);
  extractor.extractBatch(filtered).then((segments) => {
    const results = calculateWordFrequencies(segments, {
      stopWordsLang: ctx.wcStopWordsLang,
      minWordLength: ctx.wcMinWordLength,
      maxWords: ctx.wcMaxWords,
    });

    const rows: string[][] = [["word", "count", "codes"]];
    for (const r of results) {
      rows.push([r.word, String(r.count), r.codes.join("; ")]);
    }
    const csvContent = buildCsv(rows);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-wordcloud-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  });
}
