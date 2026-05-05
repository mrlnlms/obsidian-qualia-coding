import { Notice } from "obsidian";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig, CodeMetadataResult } from "../../data/dataTypes";
import { calculateCodeMetadata } from "../../data/statsEngine";
import { heatmapColor, isLightColor, downloadCsv } from "../shared/chartHelpers";

export function renderCodeMetadataView(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  const container = ctx.chartContainer;
  if (!container) return;
  container.empty();

  const registry = ctx.plugin.caseVariablesRegistry;
  const allVarNames = registry.getAllVariableNames();
  const validNames = allVarNames.filter((n) => registry.getValuesForVariable(n).length > 0);

  if (allVarNames.length === 0) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No Case Variables defined. Add them in the side panel to use this view.",
    });
    return;
  }

  const variableName = ctx.cmVariable;
  if (!variableName) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "Select a Case Variable in the options panel to see the heatmap.",
    });
    return;
  }

  if (!validNames.includes(variableName)) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: `No files have a value for "${variableName}".`,
    });
    return;
  }

  if (!ctx.data) return;
  const result = calculateCodeMetadata(ctx.data, filters, variableName, registry, {
    includeMissing: !ctx.cmHideMissing,
  }, { cache: ctx.plugin.smartCodeCache, registry: ctx.plugin.smartCodeRegistry });

  if (result.grandTotal === 0) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No data after filters.",
    });
    return;
  }

  if (result.codes.length === 0 || result.values.length === 0) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No data for this variable after filters.",
    });
    return;
  }

  if (result.values.length === 1) {
    const warn = container.createDiv({ cls: "codemarker-analytics-warning" });
    warn.createEl("p", { text: "Only one value — no contingency. χ² disabled." });
  }

  // Banner condicional: dimensão = variável filtrada
  if (filters.caseVariableFilter && filters.caseVariableFilter.name === variableName) {
    const banner = container.createDiv({ cls: "codemarker-cm-banner" });
    banner.createEl("p", {
      text: `Filtering by "${variableName}" while using as dimension — only "${filters.caseVariableFilter.value}" will appear.`,
    });
  }

  drawHeatmap(container, ctx, result);
}

function drawHeatmap(
  container: HTMLElement,
  ctx: AnalyticsViewContext,
  result: CodeMetadataResult,
): void {
  const wrapper = container.createDiv({ cls: "codemarker-cm-wrapper" });

  const cellSize = 36;
  const labelColWidth = 200;
  const statsColWidth = 140;
  const headerHeight = 80;
  const padding = 8;

  const R = result.codes.length;
  const C = result.values.length;
  const canvasWidth = labelColWidth + C * cellSize + statsColWidth + padding * 2;
  const canvasHeight = headerHeight + R * cellSize + padding * 2;

  const canvas = wrapper.createEl("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  const cctx = canvas.getContext("2d")!;
  cctx.font = "12px sans-serif";
  cctx.textBaseline = "middle";

  const isDark = document.body.classList.contains("theme-dark");

  // ─── Aplicar sort: cria índices ordenados ───
  const sortedIdx = sortIndices(result, ctx.cmSort);
  const codes = sortedIdx.map((i) => result.codes[i]!);
  const stats = sortedIdx.map((i) => result.stats[i]);
  const matrix = sortedIdx.map((i) => result.matrix[i]!);
  const rowTotals = sortedIdx.map((i) => result.rowTotals[i]!);

  const displayValues = computeDisplayMatrix(matrix, rowTotals, result.colTotals, ctx.cmDisplay);
  const maxValue = Math.max(...displayValues.flat(), 0);
  const statsX = labelColWidth + C * cellSize + padding;

  // ─── Header (column labels — rotacionados) ───
  cctx.fillStyle = "var(--text-normal)";
  cctx.textAlign = "left";
  for (let c = 0; c < C; c++) {
    const x = labelColWidth + c * cellSize + cellSize / 2 + padding;
    const y = headerHeight - 6 + padding;
    cctx.save();
    cctx.translate(x, y);
    cctx.rotate(-Math.PI / 4);
    cctx.fillText(truncateLabel(result.values[c]!, 14), 0, 0);
    cctx.restore();
  }

  // ─── Header coluna Code (clicável) ───
  const codesHeaderArrow =
    ctx.cmSort.col === "name" || ctx.cmSort.col === "total" ? (ctx.cmSort.asc ? " ▲" : " ▼") : "";
  const codesHeaderLabel =
    ctx.cmSort.col === "name" ? "Code" : ctx.cmSort.col === "total" ? "Total" : "Code";
  cctx.fillStyle = "var(--text-muted)";
  cctx.textAlign = "left";
  cctx.fillText(`${codesHeaderLabel}${codesHeaderArrow}`, padding, headerHeight - 6 + padding);

  // ─── Header coluna Stats (clicável) ───
  const statsHeaderArrow =
    ctx.cmSort.col === "chi2" || ctx.cmSort.col === "p" ? (ctx.cmSort.asc ? " ▲" : " ▼") : "";
  const statsHeaderLabel =
    ctx.cmSort.col === "chi2" ? "χ² · p (by χ²)" : ctx.cmSort.col === "p" ? "χ² · p (by p)" : "χ² · p";
  cctx.fillStyle = "var(--text-muted)";
  cctx.fillText(`${statsHeaderLabel}${statsHeaderArrow}`, statsX, headerHeight - 6 + padding);

  // ─── Code labels (left column) ───
  cctx.textAlign = "left";
  for (let r = 0; r < R; r++) {
    const code = codes[r]!;
    const y = headerHeight + r * cellSize + cellSize / 2 + padding;
    cctx.fillStyle = code.color;
    cctx.fillRect(padding, y - 6, 12, 12);
    cctx.fillStyle = "var(--text-normal)";
    const labelText = code.isSmart ? `⚡ ${code.name}` : code.name;
    cctx.fillText(truncateLabel(labelText, 22), padding + 18, y);
  }

  // ─── Cells ───
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const value = displayValues[r]![c]!;
      const x = labelColWidth + c * cellSize + padding;
      const y = headerHeight + r * cellSize + padding;
      const cellColor = heatmapColor(value, maxValue, isDark);
      cctx.fillStyle = cellColor;
      cctx.fillRect(x, y, cellSize - 1, cellSize - 1);
      if (value > 0) {
        cctx.fillStyle = isLightColor(cellColor) ? "#222" : "#fff";
        cctx.textAlign = "center";
        cctx.fillText(formatCellValue(value, ctx.cmDisplay), x + cellSize / 2, y + cellSize / 2);
      }
    }
  }

  // ─── Stats column ───
  cctx.textAlign = "left";
  for (let r = 0; r < R; r++) {
    const stat = stats[r];
    const y = headerHeight + r * cellSize + cellSize / 2 + padding;
    if (stat == null) {
      cctx.fillStyle = "var(--text-muted)";
      cctx.fillText("—", statsX, y);
    } else {
      const chiText = stat.chiSquare.toFixed(2);
      const pText = stat.pValue.toFixed(4);
      const sigMark = stat.significant ? "*" : "";
      cctx.fillStyle = "var(--text-normal)";
      cctx.fillText(`χ²=${chiText} · p=${pText}${sigMark}`, statsX, y);
    }
  }

  // ─── Click handlers (sort) ───
  canvas.addEventListener("click", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (y > headerHeight) {
      // Click em célula — reservado pra drill-down futuro
      return;
    }
    if (x >= statsX && x < canvasWidth - padding) {
      ctx.cmSort = nextStatsSort(ctx.cmSort);
      ctx.scheduleUpdate();
      return;
    }
    if (x >= padding && x < labelColWidth) {
      ctx.cmSort = nextCodeSort(ctx.cmSort);
      ctx.scheduleUpdate();
    }
  });

  // ─── Tooltip de hover ───
  const tooltip = wrapper.createDiv({ cls: "codemarker-cm-tooltip" });
  tooltip.style.position = "absolute";
  tooltip.style.pointerEvents = "none";
  tooltip.style.display = "none";

  canvas.addEventListener("mousemove", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (y < headerHeight || x < labelColWidth || x >= labelColWidth + C * cellSize) {
      tooltip.style.display = "none";
      return;
    }
    const c = Math.floor((x - labelColWidth - padding) / cellSize);
    const r = Math.floor((y - headerHeight - padding) / cellSize);
    if (r < 0 || r >= R || c < 0 || c >= C) {
      tooltip.style.display = "none";
      return;
    }
    const code = codes[r]!;
    const value = result.values[c]!;
    const count = matrix[r]![c]!;
    const rowTot = rowTotals[r]!;
    const colTot = result.colTotals[c]!;
    const pctRow = rowTot > 0 ? ((count / rowTot) * 100).toFixed(1) : "—";
    const pctCol = colTot > 0 ? ((count / colTot) * 100).toFixed(1) : "—";

    const codeLabel = code.isSmart ? `⚡ ${code.name}` : code.name;
    tooltip.innerHTML =
      `<strong>${escapeHtml(codeLabel)}</strong> × <em>${escapeHtml(value)}</em><br>` +
      `Count: ${count}<br>% row: ${pctRow}%<br>% col: ${pctCol}%`;
    tooltip.style.left = `${ev.offsetX + 10}px`;
    tooltip.style.top = `${ev.offsetY + 10}px`;
    tooltip.style.display = "block";
  });
  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}

function sortIndices(
  result: CodeMetadataResult,
  sort: AnalyticsViewContext["cmSort"],
): number[] {
  const idx = result.codes.map((_, i) => i);
  const dir = sort.asc ? 1 : -1;
  idx.sort((a, b) => {
    let va: number | string;
    let vb: number | string;
    if (sort.col === "total") {
      va = result.rowTotals[a]!;
      vb = result.rowTotals[b]!;
    } else if (sort.col === "name") {
      va = result.codes[a]!.name.toLowerCase();
      vb = result.codes[b]!.name.toLowerCase();
    } else if (sort.col === "chi2") {
      va = result.stats[a]?.chiSquare ?? -Infinity;
      vb = result.stats[b]?.chiSquare ?? -Infinity;
    } else {
      // p
      va = result.stats[a]?.pValue ?? Infinity;
      vb = result.stats[b]?.pValue ?? Infinity;
    }
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb) * dir;
    }
    return ((va as number) - (vb as number)) * dir;
  });
  return idx;
}

function nextStatsSort(cur: AnalyticsViewContext["cmSort"]): AnalyticsViewContext["cmSort"] {
  const order: Array<AnalyticsViewContext["cmSort"]> = [
    { col: "chi2", asc: false },
    { col: "chi2", asc: true },
    { col: "p", asc: true },
    { col: "p", asc: false },
  ];
  const idx = order.findIndex((s) => s.col === cur.col && s.asc === cur.asc);
  return idx === -1 ? order[0]! : order[(idx + 1) % order.length]!;
}

function nextCodeSort(cur: AnalyticsViewContext["cmSort"]): AnalyticsViewContext["cmSort"] {
  const order: Array<AnalyticsViewContext["cmSort"]> = [
    { col: "total", asc: false },
    { col: "total", asc: true },
    { col: "name", asc: true },
    { col: "name", asc: false },
  ];
  const idx = order.findIndex((s) => s.col === cur.col && s.asc === cur.asc);
  return idx === -1 ? order[0]! : order[(idx + 1) % order.length]!;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function computeDisplayMatrix(
  matrix: number[][],
  rowTotals: number[],
  colTotals: number[],
  display: AnalyticsViewContext["cmDisplay"],
): number[][] {
  const R = matrix.length;
  const C = R > 0 ? matrix[0]!.length : 0;
  const out: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const raw = matrix[r]![c]!;
      if (display === "count") {
        out[r]![c] = raw;
      } else if (display === "pct-row") {
        const tot = rowTotals[r]!;
        out[r]![c] = tot > 0 ? raw / tot : 0;
      } else if (display === "pct-col") {
        const tot = colTotals[c]!;
        out[r]![c] = tot > 0 ? raw / tot : 0;
      }
    }
  }
  return out;
}

function formatCellValue(v: number, display: AnalyticsViewContext["cmDisplay"]): string {
  if (display === "count") return String(v);
  return `${(v * 100).toFixed(0)}%`;
}

function truncateLabel(s: string, maxChars: number): string {
  return s.length <= maxChars ? s : s.slice(0, maxChars - 1) + "…";
}

export function renderCodeMetadataOptionsSection(ctx: AnalyticsViewContext): void {
  const panel = ctx.configPanelEl;
  if (!panel) return;
  const section = panel.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Code × Metadata" });

  // ─── Variable dropdown ───
  const registry = ctx.plugin.caseVariablesRegistry;
  const allNames = registry.getAllVariableNames();
  const validNames = allNames.filter((n) => registry.getValuesForVariable(n).length > 0);

  const varRow = section.createDiv({ cls: "codemarker-config-row" });
  varRow.createDiv({ cls: "codemarker-config-sublabel", text: "Variable" });
  const varSelect = varRow.createEl("select");
  varSelect.createEl("option", { value: "", text: "— Select —" });
  for (const name of validNames) {
    const opt = varSelect.createEl("option", { value: name, text: name });
    if (ctx.cmVariable === name) opt.selected = true;
  }
  varSelect.addEventListener("change", () => {
    ctx.cmVariable = varSelect.value || null;
    ctx.scheduleUpdate();
  });

  // ─── Display radios ───
  section.createDiv({ cls: "codemarker-config-sublabel", text: "Display" });
  for (const [val, label] of [
    ["count", "Count"],
    ["pct-row", "% by row (code)"],
    ["pct-col", "% by column (value)"],
  ] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "cmDisplay";
    radio.value = val;
    radio.checked = ctx.cmDisplay === val;
    row.createSpan({ text: label });
    const setDisplay = () => {
      ctx.cmDisplay = val;
      ctx.scheduleUpdate();
    };
    radio.addEventListener("change", setDisplay);
    row.addEventListener("click", (ev) => {
      if (ev.target !== radio) {
        radio.checked = true;
        setDisplay();
      }
    });
  }

  // ─── Hide missing checkbox ───
  const missingRow = section.createDiv({ cls: "codemarker-config-row" });
  const missingCheck = missingRow.createEl("input", { type: "checkbox" });
  missingCheck.checked = ctx.cmHideMissing;
  missingRow.createSpan({ text: "Hide (missing) column" });
  const setMissing = () => {
    ctx.cmHideMissing = missingCheck.checked;
    ctx.scheduleUpdate();
  };
  missingCheck.addEventListener("change", setMissing);
  missingRow.addEventListener("click", (ev) => {
    if (ev.target !== missingCheck) {
      missingCheck.checked = !missingCheck.checked;
      setMissing();
    }
  });
}

export function buildCodeMetadataRows(ctx: AnalyticsViewContext): string[][] | null {
  if (!ctx.data || !ctx.cmVariable) return null;
  const filters = ctx.buildFilterConfig();
  const registry = ctx.plugin.caseVariablesRegistry;
  const result = calculateCodeMetadata(ctx.data, filters, ctx.cmVariable, registry, {
    includeMissing: !ctx.cmHideMissing,
  }, { cache: ctx.plugin.smartCodeCache, registry: ctx.plugin.smartCodeRegistry });
  if (result.codes.length === 0) return null;

  const header = ["code", "total", ...result.values, "chi2", "df", "p", "cramers_v"];
  const rows: string[][] = [header];
  for (let r = 0; r < result.codes.length; r++) {
    const stat = result.stats[r];
    const row = [
      result.codes[r]!.name,
      String(result.rowTotals[r]),
      ...result.matrix[r]!.map(String),
      stat ? String(stat.chiSquare) : "",
      stat ? String(stat.df) : "",
      stat ? String(stat.pValue) : "",
      stat ? String(stat.cramersV) : "",
    ];
    rows.push(row);
  }
  return rows;
}

export function exportCodeMetadataCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.cmVariable) {
    new Notice("Nothing to export — select a variable first");
    return;
  }
  const rows = buildCodeMetadataRows(ctx);
  if (!rows) {
    new Notice("Nothing to export — no codes after filters");
    return;
  }
  downloadCsv(rows, `codemarker-code-metadata-${ctx.cmVariable}-${date}.csv`);
}
