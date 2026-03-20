
import { Notice } from "obsidian";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig, ChiSquareResult } from "../../data/dataTypes";
import { calculateChiSquare } from "../../data/statsEngine";
import { buildCsv } from "../shared/chartHelpers";

export function renderChiSquareOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Chi-Square" });

  section.createDiv({ cls: "codemarker-config-sublabel", text: "Group by" });
  for (const [val, label] of [["source", "Source Type"], ["file", "File"]] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "chiGroupBy";
    radio.value = val;
    radio.checked = ctx.chiGroupBy === val;
    row.createSpan({ text: label });
    radio.addEventListener("change", () => {
      ctx.chiGroupBy = val;
      ctx.scheduleUpdate();
    });
  }
}

export function renderChiSquareView(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.data || !ctx.chartContainer) return;
  const container = ctx.chartContainer;
  const result = calculateChiSquare(ctx.data, filters, ctx.chiGroupBy);

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
  const col = ctx.chiSort.col;
  const asc = ctx.chiSort.asc;
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
      const arrow = ctx.chiSort.col === key ? (ctx.chiSort.asc ? " ▲" : " ▼") : "";
      th.createSpan({ cls: "sort-arrow", text: arrow });
      th.addEventListener("click", () => {
        if (ctx.chiSort.col === key) ctx.chiSort.asc = !ctx.chiSort.asc;
        else { ctx.chiSort.col = key; ctx.chiSort.asc = key === "code"; }
        ctx.scheduleUpdate();
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

export function renderMiniChiSquare(ctx: AnalyticsViewContext, canvas: HTMLCanvasElement, filters: FilterConfig): void {
  if (!ctx.data) return;
  const result = calculateChiSquare(ctx.data, filters, "source");
  const W = canvas.width;
  const H = canvas.height;
  const canvasCtx = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  canvasCtx.fillStyle = isDark ? "#1e1e1e" : "#fafafa";
  canvasCtx.fillRect(0, 0, W, H);

  // Top 5 codes by Cramér's V
  const top = [...result.entries].sort((a, b) => b.cramersV - a.cramersV).slice(0, 5);
  if (top.length === 0) return;

  const maxV = Math.max(...top.map((e) => e.cramersV), 0.01);
  const barH = Math.min(24, (H - 40) / top.length);
  const barAreaW = W - 40;
  const startY = (H - top.length * barH) / 2;

  for (let i = 0; i < top.length; i++) {
    const e = top[i];
    const y = startY + i * barH;
    const w = (e!.cramersV / maxV) * barAreaW;
    canvasCtx.fillStyle = e!.color;
    canvasCtx.globalAlpha = e!.significant ? 0.8 : 0.3;
    canvasCtx.fillRect(20, y + 2, w, barH - 4);
    canvasCtx.globalAlpha = 1;
  }
}

export function exportChiSquareCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const result = calculateChiSquare(ctx.data, filters, ctx.chiGroupBy);

  const rows: string[][] = [["code", "chi_square", "df", "p_value", "cramers_v", "significant"]];
  for (const e of result.entries) {
    rows.push([e.code, String(e.chiSquare), String(e.df), String(e.pValue), String(e.cramersV), e.significant ? "yes" : "no"]);
  }
  const csvContent = buildCsv(rows);
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = `codemarker-chi-square-${date}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
