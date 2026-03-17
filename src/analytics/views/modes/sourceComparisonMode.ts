
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig, SourceComparisonResult, SourceType } from "../../data/dataTypes";
import type { FrequencyResult } from "../../data/dataTypes";
import { calculateSourceComparison } from "../../data/statsEngine";
import { SOURCE_COLORS } from "../shared/chartHelpers";

export function renderSourceComparisonOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Sub-view" });

  for (const [value, label] of [["chart", "Chart"], ["table", "Table"]] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "srcCompSubView";
    radio.value = value;
    radio.checked = ctx.srcCompSubView === value;
    row.createSpan({ text: label });
    radio.addEventListener("change", () => {
      ctx.srcCompSubView = value;
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); }
    });
  }

  const modeSection = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  modeSection.createDiv({ cls: "codemarker-config-section-title", text: "Display" });

  for (const [value, label] of [["count", "Count"], ["percent-code", "% of Code"], ["percent-source", "% of Source"]] as const) {
    const row = modeSection.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "srcCompDisplayMode";
    radio.value = value;
    radio.checked = ctx.srcCompDisplayMode === value;
    row.createSpan({ text: label });
    radio.addEventListener("change", () => {
      ctx.srcCompDisplayMode = value;
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); }
    });
  }
}

export function renderSourceComparison(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;
  const result = calculateSourceComparison(ctx.data, filters);

  if (result.entries.length === 0) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No coded data found for source comparison.",
    });
    return;
  }

  if (ctx.srcCompSubView === "chart") {
    renderSourceComparisonChart(ctx, result, ctx.chartContainer);
  } else {
    renderSourceComparisonTable(ctx, result, ctx.chartContainer);
  }
}

export function renderSourceComparisonChart(ctx: AnalyticsViewContext, result: SourceComparisonResult, container: HTMLElement): void {
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

  const canvasCtx = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  // Find max value for bar scaling
  let maxVal = 1;
  for (const e of entries) {
    for (const s of sources) {
      let val: number;
      if (ctx.srcCompDisplayMode === "percent-code") val = e.bySourcePctOfCode[s];
      else if (ctx.srcCompDisplayMode === "percent-source") val = e.bySourcePctOfSrc[s];
      else val = e.bySource[s];
      if (val > maxVal) maxVal = val;
    }
  }

  const barAreaW = totalW - labelSpace - rightPad;

  // Legend
  canvasCtx.font = "10px sans-serif";
  canvasCtx.textBaseline = "middle";
  let legendX = labelSpace;
  for (const s of sources) {
    canvasCtx.fillStyle = SOURCE_COLORS[s] ?? "#888";
    canvasCtx.fillRect(legendX, 6, 10, 10);
    canvasCtx.fillStyle = textColor;
    const label = s === "csv-segment" ? "CSV-Seg" : s === "csv-row" ? "CSV-Row" : s.charAt(0).toUpperCase() + s.slice(1);
    canvasCtx.textAlign = "left";
    canvasCtx.fillText(label, legendX + 14, 12);
    legendX += canvasCtx.measureText(label).width + 28;
  }

  // Bars
  for (let i = 0; i < n; i++) {
    const e = entries[i];
    const baseY = topPad + i * rowHeight;

    // Code label
    canvasCtx.fillStyle = textColor;
    canvasCtx.font = "11px sans-serif";
    canvasCtx.textAlign = "right";
    canvasCtx.textBaseline = "middle";
    const label = e!.code.length > 14 ? e!.code.slice(0, 13) + "\u2026" : e!.code;
    canvasCtx.fillText(label, labelSpace - 8, baseY + barGroupHeight / 2);

    // Swatch
    canvasCtx.fillStyle = e!.color;
    canvasCtx.fillRect(labelSpace - 6 - canvasCtx.measureText(label).width - 14, baseY + barGroupHeight / 2 - 5, 10, 10);

    for (let si = 0; si < sources.length; si++) {
      const s = sources[si]!;
      let val: number;
      if (ctx.srcCompDisplayMode === "percent-code") val = e!.bySourcePctOfCode[s];
      else if (ctx.srcCompDisplayMode === "percent-source") val = e!.bySourcePctOfSrc[s];
      else val = e!.bySource[s];

      const barW = Math.max(0, (val / maxVal) * barAreaW);
      const y = baseY + si * barH;

      canvasCtx.fillStyle = SOURCE_COLORS[s] ?? "#888";
      canvasCtx.fillRect(labelSpace, y, barW, barH - 1);

      // Value label
      if (val > 0) {
        canvasCtx.fillStyle = textColor;
        canvasCtx.font = "9px sans-serif";
        canvasCtx.textAlign = "left";
        canvasCtx.textBaseline = "middle";
        const suffix = ctx.srcCompDisplayMode !== "count" ? "%" : "";
        canvasCtx.fillText(`${val}${suffix}`, labelSpace + barW + 4, y + barH / 2);
      }
    }
  }
}

export function renderSourceComparisonTable(ctx: AnalyticsViewContext, result: SourceComparisonResult, container: HTMLElement): void {
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
    const arrow = ctx.srcCompSort.col === col.key ? (ctx.srcCompSort.asc ? " \u25b2" : " \u25bc") : "";
    if (arrow) {
      th.createSpan({ cls: "sort-arrow", text: arrow });
    }
    th.addEventListener("click", () => {
      if (ctx.srcCompSort.col === col.key) {
        ctx.srcCompSort.asc = !ctx.srcCompSort.asc;
      } else {
        ctx.srcCompSort = { col: col.key, asc: col.key === "code" };
      }
      ctx.scheduleUpdate();
    });
  }

  // Sort entries
  const entries = [...result.entries];
  entries.sort((a, b) => {
    const col = ctx.srcCompSort.col;
    const asc = ctx.srcCompSort.asc ? 1 : -1;
    if (col === "code") return a.code.localeCompare(b.code) * asc;
    if (col === "total") return (a.total - b.total) * asc;
    const sKey = col as SourceType;
    const aVal = ctx.srcCompDisplayMode === "percent-code" ? a.bySourcePctOfCode[sKey]
      : ctx.srcCompDisplayMode === "percent-source" ? a.bySourcePctOfSrc[sKey]
      : a.bySource[sKey];
    const bVal = ctx.srcCompDisplayMode === "percent-code" ? b.bySourcePctOfCode[sKey]
      : ctx.srcCompDisplayMode === "percent-source" ? b.bySourcePctOfSrc[sKey]
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
      if (ctx.srcCompDisplayMode === "percent-code") val = e.bySourcePctOfCode[s];
      else if (ctx.srcCompDisplayMode === "percent-source") val = e.bySourcePctOfSrc[s];
      else val = e.bySource[s];
      const suffix = ctx.srcCompDisplayMode !== "count" ? "%" : "";
      const td = tr.createEl("td", { cls: "codemarker-ts-num", text: `${val}${suffix}` });
      // Heat bar
      if (val > 0 && ctx.srcCompDisplayMode === "count") {
        const maxSrc = result.sourceTotals[s] || 1;
        const pct = Math.min(100, (e.bySource[s] / maxSrc) * 100);
        td.style.background = `linear-gradient(90deg, ${SOURCE_COLORS[s] ?? "#888"}22 ${pct}%, transparent ${pct}%)`;
      }
    }
  }
}

export function renderMiniSourceComparison(ctx: AnalyticsViewContext, canvas: HTMLCanvasElement, freq: FrequencyResult[]): void {
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx || freq.length === 0) return;

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
    canvasCtx.fillStyle = textColor;
    canvasCtx.font = "9px sans-serif";
    canvasCtx.textAlign = "right";
    canvasCtx.textBaseline = "middle";
    const label = r!.code.length > 8 ? r!.code.slice(0, 7) + "\u2026" : r!.code;
    canvasCtx.fillText(label, leftPad - 4, y + barHeight / 2);

    // Stacked bar
    const total = r!.total || 1;
    for (const s of ["markdown", "csv-segment", "csv-row", "image", "pdf", "audio", "video"] as const) {
      const val = r!.bySource[s];
      if (val <= 0) continue;
      const barW = (val / total) * barAreaW;
      canvasCtx.fillStyle = SOURCE_COLORS[s] ?? "#888";
      canvasCtx.fillRect(leftPad + offset, y, barW, barHeight);
      offset += barW;
    }
  }
}

export function exportSourceComparisonCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const result = calculateSourceComparison(ctx.data, filters);
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
