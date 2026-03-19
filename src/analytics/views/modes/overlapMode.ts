
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig, CooccurrenceResult, OverlapResult } from "../../data/dataTypes";
import { calculateOverlap } from "../../data/statsEngine";
import { heatmapColor, isLightColor, computeDisplayMatrix } from "../shared/chartHelpers";
import { reorderCooccurrence } from "./cooccurrenceMode";

export function renderOverlapMatrix(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const result = calculateOverlap(ctx.data, filters);

  if (result.codes.length < 2) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "Need at least 2 codes with positional data for overlap analysis.",
    });
    return;
  }

  // Skipped sources notice
  if (result.skippedSources.length > 0) {
    const notice = ctx.chartContainer.createDiv({ cls: "codemarker-overlap-notice" });
    notice.textContent = `Skipped sources (no positional data): ${result.skippedSources.join(", ")}`;
  }

  // Meta info
  const meta = ctx.chartContainer.createDiv({ cls: "codemarker-overlap-meta" });
  const fileCount = new Set(ctx.data.markers.filter((m) => filters.sources.includes(m.source)).map((m) => m.fileId)).size;
  meta.textContent = `${result.totalPairsChecked} marker pairs checked across ${fileCount} files`;

  // Reorder using co-occurrence sort logic (same interface)
  const asCooc: CooccurrenceResult = {
    codes: [...result.codes],
    colors: [...result.colors],
    matrix: result.matrix.map((r) => [...r]),
    maxValue: result.maxValue,
  };
  reorderCooccurrence(ctx, asCooc);

  const n = asCooc.codes.length;
  const cellSize = n > 25 ? 35 : n > 15 ? Math.max(35, Math.floor(500 / n)) : 60;
  const labelSpace = 120;

  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.position = "relative";
  wrapper.style.overflow = "auto";

  const canvas = wrapper.createEl("canvas");
  const totalW = labelSpace + n * cellSize;
  const totalH = labelSpace + n * cellSize;
  canvas.width = totalW;
  canvas.height = totalH;
  canvas.style.width = `${totalW}px`;
  canvas.style.height = `${totalH}px`;

  const canvasCtx = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  const displayMatrix = computeDisplayMatrix(asCooc, ctx.displayMode);
  const isNormalized = ctx.displayMode === "jaccard" || ctx.displayMode === "dice";

  // Draw cells
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = labelSpace + j * cellSize;
      const y = labelSpace + i * cellSize;
      const rawVal = asCooc.matrix[i]![j]!;
      const dispVal = displayMatrix[i]![j]!;

      const heatVal = isNormalized ? dispVal : rawVal;
      const heatMax = isNormalized ? 1 : asCooc.maxValue;
      canvasCtx.fillStyle = heatmapColor(heatVal!, heatMax!, isDark);
      canvasCtx.fillRect(x, y, cellSize, cellSize);

      if (i === j) {
        canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)";
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }

      canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      canvasCtx.lineWidth = 0.5;
      canvasCtx.strokeRect(x, y, cellSize, cellSize);

      let textVal: string;
      if (isNormalized) {
        textVal = dispVal!.toFixed(2);
      } else if (ctx.displayMode === "percentage" && i !== j) {
        textVal = `${dispVal!.toFixed(0)}%`;
      } else {
        textVal = `${dispVal}`;
      }
      const textBright = isLightColor(heatmapColor(heatVal!, heatMax!, isDark));
      canvasCtx.fillStyle = textBright ? "#1a1a1a" : "#f0f0f0";
      canvasCtx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
      canvasCtx.textAlign = "center";
      canvasCtx.textBaseline = "middle";
      canvasCtx.fillText(textVal, x + cellSize / 2, y + cellSize / 2);
    }
  }

  // Left labels
  canvasCtx.fillStyle = textColor;
  canvasCtx.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
  canvasCtx.textAlign = "right";
  canvasCtx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const y = labelSpace + i * cellSize + cellSize / 2;
    const label = asCooc.codes[i]!.length > 15
      ? asCooc.codes[i]!.slice(0, 14) + "\u2026"
      : asCooc.codes[i];
    canvasCtx.fillText(label!, labelSpace - 6, y);
  }

  // Top labels (rotated)
  canvasCtx.save();
  canvasCtx.textAlign = "left";
  canvasCtx.textBaseline = "middle";
  for (let j = 0; j < n; j++) {
    const x = labelSpace + j * cellSize + cellSize / 2;
    canvasCtx.save();
    canvasCtx.translate(x, labelSpace - 6);
    canvasCtx.rotate(-Math.PI / 4);
    const label = asCooc.codes[j]!.length > 15
      ? asCooc.codes[j]!.slice(0, 14) + "\u2026"
      : asCooc.codes[j];
    canvasCtx.fillText(label!, 0, 0);
    canvasCtx.restore();
  }
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

    if (col >= 0 && col < n && row >= 0 && row < n) {
      const val = asCooc.matrix[row]![col]!;
      const dispVal = displayMatrix[row]![col]!;
      const suffix = ctx.displayMode === "percentage" && row !== col ? "%" : "";
      let dispText: string;
      if (row === col) {
        dispText = `${asCooc.codes[row]}: ${val} markers`;
      } else if (isNormalized) {
        dispText = `${asCooc.codes[row]} \u2229 ${asCooc.codes[col]}: ${dispVal!.toFixed(2)} overlap`;
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

export function renderMiniMatrix(ctx: AnalyticsViewContext, canvas: HTMLCanvasElement, codes: string[], colors: string[], matrix: number[][], maxValue: number): void {
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx || codes.length < 2) return;

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
      canvasCtx.fillStyle = heatmapColor(matrix[i]![j]!, maxValue, isDark);
      canvasCtx.fillRect(x, y, cellSize, cellSize);
    }
  }
}

export function exportOverlapCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const result = calculateOverlap(ctx.data, filters);
  const rows: string[][] = [["", ...result.codes]];
  for (let i = 0; i < result.codes.length; i++) {
    rows.push([result.codes[i]!, ...result.matrix[i]!.map(String)]);
  }
  const csvContent = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = `codemarker-code-overlap-${date}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
