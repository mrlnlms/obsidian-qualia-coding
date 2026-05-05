
import type { FilterConfig, CooccurrenceResult } from "../../data/dataTypes";
import { calculateCooccurrence } from "../../data/statsEngine";
import { hierarchicalCluster } from "../../data/clusterEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { heatmapColor, isLightColor, computeDisplayMatrix , downloadCsv } from "../shared/chartHelpers";

export function renderDisplaySection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
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
    radio.checked = ctx.displayMode === value;
    row.createSpan({ text: label });

    radio.addEventListener("change", () => {
      ctx.displayMode = value;
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
      }
    });
  }
}

export function renderCooccSortSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
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
    radio.checked = ctx.cooccSortMode === value;
    row.createSpan({ text: label });

    radio.addEventListener("change", () => {
      ctx.cooccSortMode = value;
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
      }
    });
  }
}

/**
 * Reorder co-occurrence matrix in place based on cooccSortMode.
 */
export function reorderCooccurrence(ctx: AnalyticsViewContext, result: CooccurrenceResult): void {
  const n = result.codes.length;
  if (n < 2 || ctx.cooccSortMode === "alpha") return; // already alpha-sorted

  let order: number[];

  if (ctx.cooccSortMode === "frequency") {
    // Sort by diagonal (frequency) descending
    const indices = Array.from({ length: n }, (_, i) => i);
    indices.sort((a, b) => result.matrix[b]![b]! - result.matrix[a]![a]!);
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
          const freqI = result.matrix[i]![i]!;
          const freqJ = result.matrix[j]![j]!;
          const coij = result.matrix[i]![j]!;
          const union = freqI! + freqJ! - coij!;
          row.push(union > 0 ? 1 - coij! / union : 1);
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
  const newIsSmart = result.isSmart ? order.map((i) => result.isSmart![i]!) : undefined;
  const newMatrix: number[][] = [];
  for (const i of order) {
    const row: number[] = [];
    for (const j of order) {
      row.push(result.matrix[i]![j]!);
    }
    newMatrix.push(row);
  }

  result.codes = newCodes as string[];
  result.colors = newColors as string[];
  result.matrix = newMatrix;
  if (newIsSmart) result.isSmart = newIsSmart;
  // Recompute maxValue
  let maxValue = 0;
  for (const row of newMatrix) {
    for (const v of row) {
      if (v > maxValue) maxValue = v;
    }
  }
  result.maxValue = maxValue;
}

export function buildCooccurrenceRows(ctx: AnalyticsViewContext): string[][] | null {
  if (!ctx.data) return null;
  const filters = ctx.buildFilterConfig();
  const result = calculateCooccurrence(ctx.data, filters, {
    cache: ctx.plugin.smartCodeCache,
    registry: ctx.plugin.smartCodeRegistry,
  }, ctx.plugin.caseVariablesRegistry);

  const rows: string[][] = [["", ...result.codes]];
  for (let i = 0; i < result.codes.length; i++) {
    rows.push([result.codes[i]!, ...result.matrix[i]!.map(String)]);
  }
  return rows;
}

export function exportCooccurrenceCSV(ctx: AnalyticsViewContext, date: string): void {
  const rows = buildCooccurrenceRows(ctx);
  if (!rows) return;
  downloadCsv(rows, `codemarker-cooccurrence-${date}.csv`);
}

export function renderCooccurrenceMatrix(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const result = calculateCooccurrence(ctx.data, filters, {
    cache: ctx.plugin.smartCodeCache,
    registry: ctx.plugin.smartCodeRegistry,
  }, ctx.plugin.caseVariablesRegistry);

  if (result.codes.length < 2) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "Need at least 2 codes for co-occurrence matrix.",
    });
    return;
  }

  // Apply sort reordering
  reorderCooccurrence(ctx, result);

  const n = result.codes.length;
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

  const c2d = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");

  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  // Prepare display values
  const displayMatrix = computeDisplayMatrix(result, ctx.displayMode);
  const isNormalized = ctx.displayMode === "jaccard" || ctx.displayMode === "dice";

  // Draw cells
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = labelSpace + j * cellSize;
      const y = labelSpace + i * cellSize;
      const rawVal = result.matrix[i]![j]!;
      const dispVal = displayMatrix[i]![j]!;

      // Cell background — for Jaccard/Dice use display value (0-1) for coloring
      const heatVal = isNormalized ? dispVal : rawVal;
      const heatMax = isNormalized ? 1 : result.maxValue;
      c2d.fillStyle = heatmapColor(heatVal!, heatMax!, isDark);
      c2d.fillRect(x, y, cellSize, cellSize);

      // Diagonal highlight
      if (i === j) {
        c2d.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)";
        c2d.lineWidth = 2;
        c2d.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }

      // Cell border
      c2d.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      c2d.lineWidth = 0.5;
      c2d.strokeRect(x, y, cellSize, cellSize);

      // Value text
      let textVal: string;
      if (isNormalized) {
        textVal = dispVal!.toFixed(2);
      } else if (ctx.displayMode === "percentage" && i !== j) {
        textVal = `${dispVal!.toFixed(0)}%`;
      } else {
        textVal = `${dispVal}`;
      }
      const textBright = isLightColor(heatmapColor(heatVal!, heatMax!, isDark));
      c2d.fillStyle = textBright ? "#1a1a1a" : "#f0f0f0";
      c2d.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
      c2d.textAlign = "center";
      c2d.textBaseline = "middle";
      c2d.fillText(textVal, x + cellSize / 2, y + cellSize / 2);
    }
  }

  // Helper: prefixa \u26a1 pra SC labels antes de truncar (mant\u00e9m \u00edcone vis\u00edvel mesmo quando trunca).
  const formatLabel = (i: number): string => {
    const isSC = result.isSmart?.[i] === true;
    const raw = result.codes[i]!;
    const prefix = isSC ? "\u26a1 " : "";
    const maxLen = 15;
    return prefix + (raw.length > maxLen ? raw.slice(0, maxLen - 1) + "\u2026" : raw);
  };

  // Draw left labels
  c2d.fillStyle = textColor;
  c2d.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
  c2d.textAlign = "right";
  c2d.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const y = labelSpace + i * cellSize + cellSize / 2;
    c2d.fillText(formatLabel(i), labelSpace - 6, y);
  }

  // Draw top labels (rotated)
  c2d.save();
  c2d.textAlign = "left";
  c2d.textBaseline = "middle";
  for (let j = 0; j < n; j++) {
    const x = labelSpace + j * cellSize + cellSize / 2;
    c2d.save();
    c2d.translate(x, labelSpace - 6);
    c2d.rotate(-Math.PI / 4);
    c2d.fillText(formatLabel(j), 0, 0);
    c2d.restore();
  }
  c2d.restore();

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
      const val = result.matrix[row]![col]!;
      const dispVal = displayMatrix[row]![col]!;
      const suffix = ctx.displayMode === "percentage" && row !== col ? "%" : "";
      const labelRow = (result.isSmart?.[row] ? "\u26a1 " : "") + result.codes[row]!;
      const labelCol = (result.isSmart?.[col] ? "\u26a1 " : "") + result.codes[col]!;
      let dispText: string;
      if (row === col) {
        dispText = `${labelRow}: ${val} total`;
      } else if (isNormalized) {
        dispText = `${labelRow} \u00d7 ${labelCol}: ${dispVal!.toFixed(2)}`;
      } else {
        dispText = `${labelRow} \u00d7 ${labelCol}: ${dispVal}${suffix}`;
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
