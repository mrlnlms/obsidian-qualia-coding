import type { FilterConfig, LagResult } from "../../data/dataTypes";
import { calculateLagSequential } from "../../data/statsEngine";
import { divergentColor, isDivergentLight , downloadCsv } from "../shared/chartHelpers";
import type { AnalyticsViewContext } from "../analyticsViewContext";

export function renderLagOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: `Lag: ${ctx.lagValue}` });
  const slider = section.createEl("input", { type: "range" });
  slider.min = "1";
  slider.max = "5";
  slider.step = "1";
  slider.value = String(ctx.lagValue);
  slider.style.width = "100%";
  slider.addEventListener("input", () => {
    ctx.lagValue = parseInt(slider.value, 10);
    section.querySelector(".codemarker-config-section-title")!.textContent = `Lag: ${ctx.lagValue}`;
    ctx.scheduleUpdate();
  });
}

export function renderLagSequential(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const result = calculateLagSequential(ctx.data, filters, ctx.lagValue, { cache: ctx.plugin.smartCodeCache, registry: ctx.plugin.smartCodeRegistry }, ctx.plugin.caseVariablesRegistry);

  if (result.codes.length < 2 || result.totalTransitions === 0) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "Not enough sequential data for lag analysis. Need markers with positional info in the same files.",
    });
    return;
  }

  const n = result.codes.length;
  const cellSize = n > 25 ? 35 : n > 15 ? Math.max(35, Math.floor(500 / n)) : 60;
  const labelSpace = 120;

  const wrapper = ctx.chartContainer.createDiv();
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

  const canvasCtx = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  const styles2 = getComputedStyle(document.body);
  const textColor = styles2.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  // Find max |z| for scaling
  let maxZ = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const absZ = Math.abs(result.zScores[i]![j]!);
      if (absZ > maxZ) maxZ = absZ;
    }
  }
  if (maxZ === 0) maxZ = 1;

  // Draw cells with divergent color scale
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = labelSpace + j * cellSize;
      const y = labelSpace + i * cellSize;
      const z = result.zScores[i]![j]!;

      // Divergent: blue (negative) → white → red (positive)
      canvasCtx.fillStyle = divergentColor(z!, maxZ, isDark);
      canvasCtx.fillRect(x, y, cellSize, cellSize);

      // Significance border
      if (Math.abs(z!) > 1.96) {
        canvasCtx.strokeStyle = isDark ? "#fff" : "#000";
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }

      // Cell border
      canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      canvasCtx.lineWidth = 0.5;
      canvasCtx.strokeRect(x, y, cellSize, cellSize);

      // Z-score text
      const zText = z!.toFixed(1);
      const bgBright = isDivergentLight(z!, maxZ, isDark);
      canvasCtx.fillStyle = bgBright ? "#1a1a1a" : "#f0f0f0";
      canvasCtx.font = `${Math.min(11, cellSize * 0.28)}px sans-serif`;
      canvasCtx.textAlign = "center";
      canvasCtx.textBaseline = "middle";
      canvasCtx.fillText(zText, x + cellSize / 2, y + cellSize / 2);

      // Significance asterisk
      if (Math.abs(z!) > 1.96) {
        canvasCtx.fillText("*", x + cellSize / 2 + canvasCtx.measureText(zText).width / 2 + 3, y + cellSize / 2 - 4);
      }
    }
  }

  // Row labels (Given code)
  canvasCtx.fillStyle = textColor;
  canvasCtx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
  canvasCtx.textAlign = "right";
  canvasCtx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const y = labelSpace + i * cellSize + cellSize / 2;
    const label = result.codes[i]!.length > 15 ? result.codes[i]!.slice(0, 14) + "\u2026" : result.codes[i]!;
    canvasCtx.fillText(label!, labelSpace - 6, y);
  }

  // Column labels (Target code, rotated)
  canvasCtx.save();
  canvasCtx.textAlign = "left";
  canvasCtx.textBaseline = "middle";
  for (let j = 0; j < n; j++) {
    const x = labelSpace + j * cellSize + cellSize / 2;
    canvasCtx.save();
    canvasCtx.translate(x, labelSpace - 6);
    canvasCtx.rotate(-Math.PI / 4);
    const label = result.codes[j]!.length > 15 ? result.codes[j]!.slice(0, 14) + "\u2026" : result.codes[j]!;
    canvasCtx.fillText(label!, 0, 0);
    canvasCtx.restore();
  }
  canvasCtx.restore();

  // Axis labels
  canvasCtx.font = "11px sans-serif";
  canvasCtx.fillStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  canvasCtx.textAlign = "center";
  canvasCtx.textBaseline = "top";
  canvasCtx.fillText("Target (t + lag)", labelSpace + (n * cellSize) / 2, labelSpace + n * cellSize + 8);
  canvasCtx.save();
  canvasCtx.translate(12, labelSpace + (n * cellSize) / 2);
  canvasCtx.rotate(-Math.PI / 2);
  canvasCtx.textAlign = "center";
  canvasCtx.fillText("Given (t)", 0, 0);
  canvasCtx.restore();

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
      const z = result.zScores[row]![col]!;
      const obs = result.transitions[row]![col]!;
      const exp = result.expected[row]![col]!;
      const sig = Math.abs(z!) > 1.96 ? "p < .05" : "n.s.";
      tooltip.textContent = `${result.codes[row]} → ${result.codes[col]}: obs=${obs}, exp=${exp!.toFixed(1)}, z=${z!.toFixed(2)} (${sig})`;
      tooltip.style.display = "";
      tooltip.style.left = `${mx + 12}px`;
      tooltip.style.top = `${my + 12}px`;
    } else {
      tooltip.style.display = "none";
    }
  });

  canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
}

export function renderMiniLag(canvas: HTMLCanvasElement, lag: LagResult): void {
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx || lag.codes.length < 2) return;

  const W = canvas.width;
  const H = canvas.height;
  const n = lag.codes.length;
  const pad = 10;
  const cellSize = Math.min((W - 2 * pad) / n, (H - 2 * pad) / n);
  const offsetX = (W - n * cellSize) / 2;
  const offsetY = (H - n * cellSize) / 2;
  const isDark = document.body.classList.contains("theme-dark");
  let maxZ = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = Math.abs(lag.zScores[i]![j]!); if (a > maxZ) maxZ = a; }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = offsetX + j * cellSize;
      const y = offsetY + i * cellSize;
      canvasCtx.fillStyle = divergentColor(lag.zScores[i]![j]!, maxZ, isDark);
      canvasCtx.fillRect(x, y, cellSize, cellSize);
    }
  }
}

export function buildLagRows(ctx: AnalyticsViewContext): string[][] | null {
  if (!ctx.data) return null;
  const filters = ctx.buildFilterConfig();
  const result = calculateLagSequential(ctx.data, filters, ctx.lagValue, { cache: ctx.plugin.smartCodeCache, registry: ctx.plugin.smartCodeRegistry }, ctx.plugin.caseVariablesRegistry);

  const rows: string[][] = [["source_code", "target_code", "observed", "expected", "z_score", "significant"]];
  for (let i = 0; i < result.codes.length; i++) {
    for (let j = 0; j < result.codes.length; j++) {
      rows.push([
        result.codes[i]!,
        result.codes[j]!,
        String(result.transitions[i]![j]!),
        String(result.expected[i]![j]!),
        String(result.zScores[i]![j]!),
        Math.abs(result.zScores[i]![j]!) > 1.96 ? "yes" : "no",
      ]);
    }
  }
  return rows;
}

export function exportLagCSV(ctx: AnalyticsViewContext, date: string): void {
  const rows = buildLagRows(ctx);
  if (!rows) return;
  downloadCsv(rows, `codemarker-lag-sequential-${date}.csv`);
}
