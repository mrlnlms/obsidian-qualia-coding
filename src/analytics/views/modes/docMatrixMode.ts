
import type { FilterConfig } from "../../data/dataTypes";
import { calculateDocumentCodeMatrix } from "../../data/statsEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { heatmapColor, isLightColor } from "../shared/chartHelpers";

export function renderMatrixSortSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Sort files" });

  for (const [value, label] of [
    ["alpha", "Alphabetical"],
    ["total", "By total markers"],
  ] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "matrixSortMode";
    radio.value = value;
    radio.checked = ctx.matrixSortMode === value;
    row.createSpan({ text: label });

    radio.addEventListener("change", () => {
      ctx.matrixSortMode = value;
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

export function exportDocMatrixCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const result = calculateDocumentCodeMatrix(ctx.data, filters);

  const rows: string[][] = [["file", ...result.codes]];
  for (let fi = 0; fi < result.files.length; fi++) {
    rows.push([result.files[fi]!, ...result.matrix[fi]!.map(String)]);
  }
  const csvContent = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = `codemarker-doc-matrix-${date}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

export function renderDocCodeMatrix(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const result = calculateDocumentCodeMatrix(ctx.data, filters);

  if (result.files.length === 0 || result.codes.length === 0) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No data matches current filters.",
    });
    return;
  }

  // Sort files
  let fileOrder = result.files.map((f, i) => i);
  if (ctx.matrixSortMode === "total") {
    const fileTotals = result.files.map((_, fi) =>
      result.matrix[fi]!.reduce((a, b) => a + b, 0)
    );
    fileOrder.sort((a, b) => fileTotals[b]! - fileTotals[a]!);
  }

  const nFiles = result.files.length;
  const nCodes = result.codes.length;
  const cellSize = nFiles > 20 || nCodes > 20
    ? Math.max(30, Math.floor(500 / Math.max(nFiles, nCodes)))
    : 50;
  const labelSpaceLeft = 150;
  const labelSpaceTop = 120;

  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.position = "relative";
  wrapper.style.overflow = "auto";

  const canvas = wrapper.createEl("canvas");
  const totalW = labelSpaceLeft + nCodes * cellSize;
  const totalH = labelSpaceTop + nFiles * cellSize;
  canvas.width = totalW;
  canvas.height = totalH;
  canvas.style.width = `${totalW}px`;
  canvas.style.height = `${totalH}px`;

  const c2d = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  // Draw cells
  for (let fi = 0; fi < nFiles; fi++) {
    const fileIdx = fileOrder[fi]!;
    for (let ci = 0; ci < nCodes; ci++) {
      const x = labelSpaceLeft + ci * cellSize;
      const y = labelSpaceTop + fi * cellSize;
      const val = result.matrix[fileIdx]![ci]!;

      c2d.fillStyle = heatmapColor(val, result.maxValue, isDark);
      c2d.fillRect(x, y, cellSize, cellSize);

      // Cell border
      c2d.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      c2d.lineWidth = 0.5;
      c2d.strokeRect(x, y, cellSize, cellSize);

      // Value text
      if (val > 0) {
        const textBright = isLightColor(heatmapColor(val, result.maxValue, isDark));
        c2d.fillStyle = textBright ? "#1a1a1a" : "#f0f0f0";
        c2d.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
        c2d.textAlign = "center";
        c2d.textBaseline = "middle";
        c2d.fillText(String(val), x + cellSize / 2, y + cellSize / 2);
      }
    }
  }

  // Left labels (file basenames)
  c2d.fillStyle = textColor;
  c2d.font = `${Math.min(12, cellSize * 0.3)}px sans-serif`;
  c2d.textAlign = "right";
  c2d.textBaseline = "middle";
  for (let fi = 0; fi < nFiles; fi++) {
    const fileIdx = fileOrder[fi]!;
    const y = labelSpaceTop + fi * cellSize + cellSize / 2;
    const basename = result.files[fileIdx]!.split("/").pop() ?? result.files[fileIdx]!;
    const label = basename.length > 20 ? basename.slice(0, 19) + "\u2026" : basename;
    c2d.fillText(label, labelSpaceLeft - 6, y);
  }

  // Top labels (codes, rotated)
  c2d.save();
  c2d.textAlign = "left";
  c2d.textBaseline = "middle";
  for (let ci = 0; ci < nCodes; ci++) {
    const x = labelSpaceLeft + ci * cellSize + cellSize / 2;
    c2d.save();
    c2d.translate(x, labelSpaceTop - 6);
    c2d.rotate(-Math.PI / 4);
    const label = result.codes[ci]!.length > 15
      ? result.codes[ci]!.slice(0, 14) + "\u2026"
      : result.codes[ci];
    c2d.fillStyle = result.colors[ci]!;
    c2d.fillText(label!, 0, 0);
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
    const col = Math.floor((mx - labelSpaceLeft) / cellSize);
    const row = Math.floor((my - labelSpaceTop) / cellSize);

    if (col >= 0 && col < nCodes && row >= 0 && row < nFiles) {
      const fileIdx = fileOrder[row]!;
      const val = result.matrix[fileIdx]![col]!;
      const basename = result.files[fileIdx]!.split("/").pop() ?? result.files[fileIdx]!;
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
