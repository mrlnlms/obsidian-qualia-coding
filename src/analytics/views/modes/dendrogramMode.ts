import { Notice } from "obsidian";
import type { FilterConfig } from "../../data/dataTypes";
import { calculateCooccurrence } from "../../data/statsEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { downloadCsv } from "../shared/chartHelpers";
import {
  renderDendrogramFull,
  renderDendrogramMini as renderMiniFromRenderer,
  buildDendrogramExportRows,
} from "./dendrogramRenderer";

/**
 * Builds Jaccard distance matrix between codes from co-occurrence:
 * d(i,j) = 1 - co(i,j) / (freq(i) + freq(j) - co(i,j))
 */
function buildCodesDistanceMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const D: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { row.push(0); continue; }
      const freqI = matrix[i]![i]!;
      const freqJ = matrix[j]![j]!;
      const coij = matrix[i]![j]!;
      const union = freqI + freqJ - coij;
      row.push(union > 0 ? 1 - coij / union : 1);
    }
    D.push(row);
  }
  return D;
}

export function renderDendrogramOptionsSection(ctx: AnalyticsViewContext): void {
  const cutSection = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  cutSection.createDiv({ cls: "codemarker-config-section-title", text: `Cut Distance: ${ctx.dendrogramCutDistance.toFixed(2)}` });
  const slider = cutSection.createEl("input", { type: "range" });
  slider.min = "0.01";
  slider.max = "1.0";
  slider.step = "0.01";
  slider.value = String(ctx.dendrogramCutDistance);
  slider.style.width = "100%";
  slider.addEventListener("input", () => {
    ctx.dendrogramCutDistance = parseFloat(slider.value);
    cutSection.querySelector(".codemarker-config-section-title")!.textContent = `Cut Distance: ${ctx.dendrogramCutDistance.toFixed(2)}`;
    ctx.scheduleUpdate();
  });
}

export function renderDendrogramView(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const result = calculateCooccurrence(ctx.data, filters);
  if (result.codes.length < 3) {
    ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "Need at least 3 codes for dendrogram." });
    return;
  }

  const distMatrix = buildCodesDistanceMatrix(result.matrix);
  const isDark = document.body.classList.contains("theme-dark");
  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  renderDendrogramFull({
    container: ctx.chartContainer,
    distMatrix,
    names: result.codes,
    colors: result.colors,
    cutDistance: ctx.dendrogramCutDistance,
    isDark,
    textColor,
  });
}

export function renderMiniDendrogram(ctx: AnalyticsViewContext, canvas: HTMLCanvasElement, filters: FilterConfig): void {
  if (!ctx.data) return;
  const result = calculateCooccurrence(ctx.data, filters);
  if (result.codes.length < 3) return;

  const distMatrix = buildCodesDistanceMatrix(result.matrix);
  const isDark = document.body.classList.contains("theme-dark");
  renderMiniFromRenderer(canvas, distMatrix, result.codes, result.colors, isDark);
}

export function buildDendrogramRows(ctx: AnalyticsViewContext): string[][] | null {
  if (!ctx.data) return null;
  const filters = ctx.buildFilterConfig();
  const result = calculateCooccurrence(ctx.data, filters);
  if (result.codes.length < 3) return null;

  const distMatrix = buildCodesDistanceMatrix(result.matrix);
  return buildDendrogramExportRows(distMatrix, result.codes, result.colors, ctx.dendrogramCutDistance);
}

export function exportDendrogramCSV(ctx: AnalyticsViewContext, date: string): void {
  const rows = buildDendrogramRows(ctx);
  if (!rows) { new Notice("Insufficient data."); return; }
  downloadCsv(rows, `codemarker-dendrogram-${date}.csv`);
}
