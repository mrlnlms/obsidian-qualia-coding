import { Notice } from "obsidian";
import type { FilterConfig } from "../../data/dataTypes";
import { buildFileQModeData, preFilterMarkersForQMode } from "../../data/qModeData";
import { buildJaccardDistanceMatrix } from "../../data/distanceMatrix";
import {
  renderDendrogramFull,
  renderDendrogramMini as renderMiniFromRenderer,
  buildDendrogramExportRows,
} from "./dendrogramRenderer";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { downloadCsv } from "../shared/chartHelpers";

const N_FILES_WARN_THRESHOLD = 200;

export function renderFilesDendrogramOptionsSection(ctx: AnalyticsViewContext): void {
  const cutSection = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  cutSection.createDiv({
    cls: "codemarker-config-section-title",
    text: `Cut Distance: ${ctx.filesDendrogramCutDistance.toFixed(2)}`,
  });
  const slider = cutSection.createEl("input", { type: "range" });
  slider.min = "0.01";
  slider.max = "1.0";
  slider.step = "0.01";
  slider.value = String(ctx.filesDendrogramCutDistance);
  slider.style.width = "100%";
  slider.addEventListener("input", () => {
    ctx.filesDendrogramCutDistance = parseFloat(slider.value);
    cutSection.querySelector(".codemarker-config-section-title")!.textContent =
      `Cut Distance: ${ctx.filesDendrogramCutDistance.toFixed(2)}`;
    // Cluster IDs change with cut distance — drop any active cluster filter
    // so it doesn't reference stale leaf groupings.
    if (ctx.selectedFileCluster) {
      ctx.selectedFileCluster = null;
    }
    ctx.scheduleUpdate();
  });
}

export function renderFilesDendrogramView(ctx: AnalyticsViewContext, _filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const filtered = preFilterMarkersForQMode(ctx.data.markers, ctx.enabledSources, ctx.enabledCodes);
  const qData = buildFileQModeData(filtered);

  if (qData.fileIds.length < 3) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "Files Dendrogram needs at least 3 files with codes.",
    });
    return;
  }

  // N>200 warning gate (lazy/heavy compute)
  if (qData.fileIds.length > N_FILES_WARN_THRESHOLD && !ctx.qModeBypassCap) {
    const warn = ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty" });
    warn.createDiv({
      text: `Q-mode clustering with ${qData.fileIds.length} documents may take a few seconds.`,
    });
    warn.createEl("br");
    const btn = warn.createEl("button", { text: "Compute anyway" });
    btn.style.marginTop = "12px";
    btn.addEventListener("click", () => {
      ctx.qModeBypassCap = true;
      ctx.scheduleUpdate();
    });
    return;
  }

  const distMatrix = buildJaccardDistanceMatrix(qData.fileSets);
  const isDark = document.body.classList.contains("theme-dark");
  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  const guidance = ctx.chartContainer.createDiv({ cls: "codemarker-qmode-guidance" });
  guidance.style.fontSize = "12px";
  guidance.style.opacity = "0.7";
  guidance.style.marginBottom = "8px";
  guidance.textContent = "Click a cluster swatch (left column) to filter all Analytics views by that cluster.";

  renderDendrogramFull({
    container: ctx.chartContainer,
    distMatrix,
    names: qData.fileNames,
    colors: qData.fileColors,
    cutDistance: ctx.filesDendrogramCutDistance,
    isDark,
    textColor,
    selectedCluster: ctx.selectedFileCluster?.clusterIdx ?? null,
    onClusterClick: (clusterIdx, leafIndices) => {
      const fileIds = leafIndices.map((i) => qData.fileIds[i]!).filter((f) => !!f);
      // Toggle: if clicking the active cluster again, clear it
      if (ctx.selectedFileCluster?.clusterIdx === clusterIdx) {
        ctx.selectedFileCluster = null;
      } else {
        ctx.selectedFileCluster = { clusterIdx, fileIds };
      }
      ctx.scheduleUpdate();
    },
  });
}

export function renderMiniFilesDendrogram(ctx: AnalyticsViewContext, canvas: HTMLCanvasElement, _filters: FilterConfig): void {
  if (!ctx.data) return;
  const filtered = preFilterMarkersForQMode(ctx.data.markers, ctx.enabledSources, ctx.enabledCodes);
  const qData = buildFileQModeData(filtered);
  if (qData.fileIds.length < 3) return;
  if (qData.fileIds.length > N_FILES_WARN_THRESHOLD && !ctx.qModeBypassCap) return;

  const distMatrix = buildJaccardDistanceMatrix(qData.fileSets);
  const isDark = document.body.classList.contains("theme-dark");
  renderMiniFromRenderer(canvas, distMatrix, qData.fileNames, qData.fileColors, isDark);
}

export function buildFilesDendrogramRows(ctx: AnalyticsViewContext): string[][] | null {
  if (!ctx.data) return null;
  const filtered = preFilterMarkersForQMode(ctx.data.markers, ctx.enabledSources, ctx.enabledCodes);
  const qData = buildFileQModeData(filtered);
  if (qData.fileIds.length < 3) return null;

  const distMatrix = buildJaccardDistanceMatrix(qData.fileSets);
  return buildDendrogramExportRows(distMatrix, qData.fileNames, qData.fileColors, ctx.filesDendrogramCutDistance);
}

export function exportFilesDendrogramCSV(ctx: AnalyticsViewContext, date: string): void {
  const rows = buildFilesDendrogramRows(ctx);
  if (!rows) { new Notice("Insufficient data."); return; }
  downloadCsv(rows, `codemarker-files-dendrogram-${date}.csv`);
}
