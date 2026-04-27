import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig, CodeMetadataResult } from "../../data/dataTypes";
import { calculateCodeMetadata } from "../../data/statsEngine";
import { heatmapColor, isLightColor } from "../shared/chartHelpers";

export function renderCodeMetadataView(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  const container = ctx.chartContainer;
  if (!container) return;
  container.empty();

  const registry = ctx.plugin.caseVariablesRegistry;
  const variableName = ctx.cmVariable;

  if (!variableName) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "Select a Case Variable in the options panel to see the heatmap.",
    });
    return;
  }

  if (!ctx.data) return;
  const result = calculateCodeMetadata(ctx.data, filters, variableName, registry, {
    includeMissing: !ctx.cmHideMissing,
  });

  if (result.codes.length === 0 || result.values.length === 0) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No data for this variable after filters.",
    });
    return;
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

  const displayValues = computeDisplayMatrix(result, ctx.cmDisplay);
  const maxValue = Math.max(...displayValues.flat(), 0);

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

  // ─── Code labels (left column) ───
  cctx.textAlign = "left";
  for (let r = 0; r < R; r++) {
    const code = result.codes[r]!;
    const y = headerHeight + r * cellSize + cellSize / 2 + padding;
    cctx.fillStyle = code.color;
    cctx.fillRect(padding, y - 6, 12, 12);
    cctx.fillStyle = "var(--text-normal)";
    cctx.fillText(truncateLabel(code.name, 22), padding + 18, y);
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
  const statsX = labelColWidth + C * cellSize + padding;
  cctx.textAlign = "left";
  cctx.fillStyle = "var(--text-muted)";
  cctx.fillText("χ² · p", statsX, headerHeight - 6 + padding);

  for (let r = 0; r < R; r++) {
    const stat = result.stats[r];
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
}

function computeDisplayMatrix(
  result: CodeMetadataResult,
  display: AnalyticsViewContext["cmDisplay"],
): number[][] {
  const R = result.codes.length;
  const C = result.values.length;
  const out: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const raw = result.matrix[r]![c]!;
      if (display === "count") {
        out[r]![c] = raw;
      } else if (display === "pct-row") {
        const tot = result.rowTotals[r]!;
        out[r]![c] = tot > 0 ? raw / tot : 0;
      } else if (display === "pct-col") {
        const tot = result.colTotals[c]!;
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

export function exportCodeMetadataCSV(_ctx: AnalyticsViewContext, _date: string): void {
  // WIP — implementado no Chunk 4
}
