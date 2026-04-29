import { Notice } from "obsidian";
import type { FilterConfig, FrequencyResult, UnifiedMarker } from "../../data/dataTypes";
import { calculateTextStats } from "../../data/statsEngine";
import { TextExtractor } from "../../data/textExtractor";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { downloadCsv } from "../shared/chartHelpers";

export function renderTextStats(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const filtered = ctx.data.markers.filter((m) =>
    filters.sources.includes(m.source) &&
    m.codes.some((c) => !filters.excludeCodes.includes(c))
  );

  if (filtered.length === 0) {
    ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "No data matches current filters." });
    return;
  }

  const generation = ctx.renderGeneration;
  const loadingEl = ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "Extracting text..." });
  loadAndRenderTextStats(ctx, filtered, loadingEl, generation);
}

export async function loadAndRenderTextStats(
  ctx: AnalyticsViewContext,
  markers: UnifiedMarker[],
  loadingEl: HTMLElement,
  generation?: number,
): Promise<void> {
  if (!ctx.chartContainer || !ctx.data) return;

  const extractor = new TextExtractor(ctx.plugin.app.vault);
  const segments = await extractor.extractBatch(markers);
  if (generation !== undefined && !ctx.isRenderCurrent(generation)) return;
  loadingEl.remove();

  // Filter segment codes to only include enabled codes (multi-code segments may carry excluded codes)
  const enabledCodes = ctx.enabledCodes;
  const filteredSegments = segments.map(s => ({
    ...s,
    codes: s.codes.filter(c => enabledCodes.has(c)),
  })).filter(s => s.codes.length > 0);

  const codeDisplay = new Map(ctx.data.codes.map((c) => [c.id, { name: c.name, color: c.color }]));
  const result = calculateTextStats(filteredSegments, codeDisplay);

  if (result.codes.length === 0) {
    ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "No text data available." });
    return;
  }

  const wrapper = ctx.chartContainer.createDiv({ cls: "codemarker-ts-wrapper" });

  // Global summary
  const summary = wrapper.createDiv({ cls: "codemarker-ts-summary" });
  summary.createEl("strong", { text: String(result.global.totalSegments) });
  summary.appendText(" segments · ");
  summary.createEl("strong", { text: String(result.global.totalWords) });
  summary.appendText(" words · ");
  summary.createEl("strong", { text: String(result.global.uniqueWords) });
  summary.appendText(" unique · TTR: ");
  summary.createEl("strong", { text: result.global.ttr.toFixed(3) });

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
    const arrow = ctx.tsSort.col === col.key ? (ctx.tsSort.asc ? " ▲" : " ▼") : "";
    th.textContent = col.label + arrow;
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      if (ctx.tsSort.col === col.key) {
        ctx.tsSort.asc = !ctx.tsSort.asc;
      } else {
        ctx.tsSort = { col: col.key, asc: col.numeric ? false : true };
      }
      ctx.scheduleUpdate();
    });
  }

  // Sort
  const sortKey = ctx.tsSort.col as keyof typeof result.codes[0];
  const sorted = [...result.codes].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (typeof va === "string" && typeof vb === "string") {
      return ctx.tsSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    const na = va as number;
    const nb = vb as number;
    return ctx.tsSort.asc ? na - nb : nb - na;
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

export function renderMiniTextStats(canvas: HTMLCanvasElement, freq: FrequencyResult[]): void {
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx || freq.length === 0) return;
  const W = canvas.width;
  const H = canvas.height;
  const pad = 12;
  const isDark = document.body.classList.contains("theme-dark");
  const top5 = freq.slice(0, 5);
  const maxVal = Math.max(...top5.map((f) => f.total), 1);
  const barH = Math.min(20, (H - 2 * pad) / top5.length - 4);

  for (let i = 0; i < top5.length; i++) {
    const y = pad + i * (barH + 4);
    const w = (top5[i]!.total / maxVal) * (W - 2 * pad - 60);
    canvasCtx.fillStyle = top5[i]!.color;
    canvasCtx.fillRect(pad + 50, y, w, barH);
    canvasCtx.fillStyle = isDark ? "#ccc" : "#333";
    canvasCtx.font = "10px sans-serif";
    canvasCtx.textAlign = "right";
    canvasCtx.textBaseline = "middle";
    const label = top5[i]!.code.length > 6 ? top5[i]!.code.slice(0, 5) + "\u2026" : top5[i]!.code;
    canvasCtx.fillText(label, pad + 46, y + barH / 2);
  }
}

export async function buildTextStatsRows(ctx: AnalyticsViewContext): Promise<string[][] | null> {
  if (!ctx.data) return null;

  const enabledCodes = ctx.enabledCodes;
  const filtered = ctx.data.markers.filter((m) => ctx.enabledSources.has(m.source) && m.codes.some((c) => enabledCodes.has(c)));
  const extractor = new TextExtractor(ctx.plugin.app.vault);
  const segments = await extractor.extractBatch(filtered);
  const filteredSegments = segments.map(s => ({
    ...s,
    codes: s.codes.filter(c => enabledCodes.has(c)),
  })).filter(s => s.codes.length > 0);
  const codeDisplay = new Map(ctx.data!.codes.map((c) => [c.id, { name: c.name, color: c.color }]));
  const result = calculateTextStats(filteredSegments, codeDisplay);

  const rows: string[][] = [["code", "segments", "total_words", "unique_words", "ttr", "avg_words_per_segment", "avg_chars_per_segment"]];
  for (const e of result.codes) {
    rows.push([e.code, String(e.segmentCount), String(e.totalWords), String(e.uniqueWords), String(e.ttr), String(e.avgWordsPerSegment), String(e.avgCharsPerSegment)]);
  }
  return rows;
}

export function exportTextStatsCSV(ctx: AnalyticsViewContext, date: string): void {
  buildTextStatsRows(ctx).then((rows) => {
    if (!rows) return;
    downloadCsv(rows, `codemarker-text-stats-${date}.csv`);
  });
}
