import { Notice } from "obsidian";
import type { FilterConfig } from "../../data/dataTypes";
import { calculateCooccurrence } from "../../data/statsEngine";
import { buildDendrogram, cutDendrogram, calculateSilhouette, type DendrogramNode } from "../../data/clusterEngine";
import type { SilhouetteResult } from "../../data/clusterEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { downloadCsv } from "../shared/chartHelpers";

export function renderDendrogramOptionsSection(ctx: AnalyticsViewContext): void {
  // Cut distance slider
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
    ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty", text: "Need at least 3 codes/files for dendrogram." });
    return;
  }

  // Build Jaccard distance matrix from co-occurrence
  const n = result.codes.length;
  const distMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { row.push(0); continue; }
      const freqI = result.matrix[i]![i]!;
      const freqJ = result.matrix[j]![j]!;
      const coij = result.matrix[i]![j]!;
      const union = freqI! + freqJ! - coij!;
      row.push(union > 0 ? 1 - coij! / union : 1);
    }
    distMatrix.push(row);
  }

  const root = buildDendrogram(distMatrix, result.codes, result.colors);
  if (!root) return;

  const assignments = cutDendrogram(root, ctx.dendrogramCutDistance);
  const silhouette = calculateSilhouette(distMatrix, assignments, result.codes, result.colors);

  // Determine cluster colors
  const nClusters = new Set(assignments).size;
  const clusterColors: string[] = [];
  for (let i = 0; i < nClusters; i++) {
    const hue = (i * 137.5) % 360;
    clusterColors.push(`hsl(${hue}, 65%, 55%)`);
  }

  renderDendrogramCanvas(ctx, root, assignments, clusterColors, silhouette);
}

export function renderDendrogramCanvas(
  ctx: AnalyticsViewContext,
  root: DendrogramNode,
  assignments: number[],
  clusterColors: string[],
  silhouette: SilhouetteResult,
): void {
  if (!ctx.chartContainer) return;

  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.position = "relative";
  wrapper.style.overflow = "auto";

  // Collect leaves in tree order
  const leaves: DendrogramNode[] = [];
  function collectLeaves(node: DendrogramNode): void {
    if (!node.left && !node.right) { leaves.push(node); return; }
    if (node.left) collectLeaves(node.left);
    if (node.right) collectLeaves(node.right);
  }
  collectLeaves(root);

  const nLeaves = leaves.length;
  const isDark = document.body.classList.contains("theme-dark");
  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  // Layout constants
  const labelWidth = 130;
  const treeWidth = 300;
  const silWidth = 200;
  const padTop = 30;
  const padBottom = 30;
  const rowHeight = 22;
  const chartWidth = labelWidth + treeWidth + 40 + silWidth + 40;
  const chartHeight = padTop + nLeaves * rowHeight + padBottom + 50;

  const canvas = wrapper.createEl("canvas");
  canvas.width = chartWidth;
  canvas.height = chartHeight;
  canvas.style.width = `${chartWidth}px`;
  canvas.style.height = `${chartHeight}px`;

  const canvasCtx = canvas.getContext("2d")!;
  const maxDist = root.distance || 1;

  // Map leaf to y position (in tree order)
  const leafY = new Map<number, number>();
  for (let i = 0; i < nLeaves; i++) {
    leafY.set(leaves[i]!.id, padTop + i * rowHeight + rowHeight / 2);
  }

  // Draw labels
  canvasCtx.font = "11px sans-serif";
  canvasCtx.textAlign = "right";
  canvasCtx.textBaseline = "middle";
  for (let i = 0; i < nLeaves; i++) {
    const leaf = leaves[i]!;
    const y = leafY.get(leaf.id)!;
    const clusterIdx = assignments[leaf.leafIndices[0]!]!;
    canvasCtx.fillStyle = clusterColors[clusterIdx!] ?? textColor;

    // Swatch
    canvasCtx.fillRect(labelWidth - 18, y - 5, 10, 10);
    canvasCtx.fillStyle = textColor;
    const label = (leaf.label ?? "").length > 16 ? (leaf.label ?? "").slice(0, 15) + "\u2026" : (leaf.label ?? "");
    canvasCtx.fillText(label, labelWidth - 22, y);
  }

  // Draw dendrogram tree (recursive)
  const treeLeft = labelWidth + 10;
  const treeRight = labelWidth + treeWidth;

  function distToX(d: number): number {
    return treeLeft + (d / maxDist) * (treeRight - treeLeft);
  }

  function getNodeY(node: DendrogramNode): number {
    if (!node.left && !node.right) return leafY.get(node.id) ?? 0;
    const ly = node.left ? getNodeY(node.left) : 0;
    const ry = node.right ? getNodeY(node.right) : 0;
    return (ly + ry) / 2;
  }

  function drawNode(node: DendrogramNode): void {
    if (!node.left || !node.right) return;

    const x = distToX(node.distance);
    const ly = getNodeY(node.left);
    const ry = getNodeY(node.right);
    const lx = node.left.left ? distToX(node.left.distance) : treeLeft;
    const rx = node.right.left ? distToX(node.right.distance) : treeLeft;

    canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
    canvasCtx.lineWidth = 1.5;

    // Vertical line connecting children
    canvasCtx.beginPath();
    canvasCtx.moveTo(x, ly);
    canvasCtx.lineTo(x, ry);
    canvasCtx.stroke();

    // Horizontal lines to children
    canvasCtx.beginPath();
    canvasCtx.moveTo(lx, ly);
    canvasCtx.lineTo(x, ly);
    canvasCtx.stroke();

    canvasCtx.beginPath();
    canvasCtx.moveTo(rx, ry);
    canvasCtx.lineTo(x, ry);
    canvasCtx.stroke();

    drawNode(node.left);
    drawNode(node.right);
  }

  drawNode(root);

  // Draw cut line
  const cutX = distToX(ctx.dendrogramCutDistance);
  canvasCtx.strokeStyle = "#F44336";
  canvasCtx.lineWidth = 2;
  canvasCtx.setLineDash([6, 4]);
  canvasCtx.beginPath();
  canvasCtx.moveTo(cutX, padTop - 10);
  canvasCtx.lineTo(cutX, padTop + nLeaves * rowHeight + 10);
  canvasCtx.stroke();
  canvasCtx.setLineDash([]);

  // Distance axis
  canvasCtx.font = "10px sans-serif";
  canvasCtx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  canvasCtx.textAlign = "center";
  canvasCtx.textBaseline = "top";
  const axisY = padTop + nLeaves * rowHeight + 15;
  for (let d = 0; d <= 1; d += 0.25) {
    const x = distToX(d * maxDist);
    canvasCtx.fillText((d * maxDist).toFixed(2), x, axisY);
  }

  // ── Silhouette plot ──
  const silLeft = treeRight + 40;

  // Title
  canvasCtx.font = "11px sans-serif";
  canvasCtx.fillStyle = textColor;
  canvasCtx.textAlign = "left";
  canvasCtx.textBaseline = "bottom";
  const quality = silhouette.avgScore > 0.5 ? "good" : silhouette.avgScore > 0.25 ? "fair" : "weak";
  canvasCtx.fillText(`Silhouette (avg: ${silhouette.avgScore.toFixed(3)} — ${quality})`, silLeft, padTop - 8);

  // Zero line
  const zeroX = silLeft + silWidth / 2;
  canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(zeroX, padTop);
  canvasCtx.lineTo(zeroX, padTop + nLeaves * rowHeight);
  canvasCtx.stroke();

  // Avg line
  const avgX = zeroX + (silhouette.avgScore * silWidth) / 2;
  canvasCtx.strokeStyle = "#F44336";
  canvasCtx.lineWidth = 1;
  canvasCtx.setLineDash([4, 3]);
  canvasCtx.beginPath();
  canvasCtx.moveTo(avgX, padTop);
  canvasCtx.lineTo(avgX, padTop + nLeaves * rowHeight);
  canvasCtx.stroke();
  canvasCtx.setLineDash([]);

  // Map silhouette scores to leaf order
  const scoreByIndex = new Map(silhouette.scores.map((s) => [s.index, s]));
  for (let i = 0; i < nLeaves; i++) {
    const leaf = leaves[i]!;
    const origIdx = leaf.leafIndices[0]!;
    const entry = scoreByIndex.get(origIdx);
    if (!entry) continue;

    const y = leafY.get(leaf.id)!;
    const barW = (entry.score * silWidth) / 2;
    const clusterIdx = assignments[origIdx]!;

    canvasCtx.fillStyle = clusterColors[clusterIdx] ?? "#6200EE";
    if (barW >= 0) {
      canvasCtx.fillRect(zeroX, y - rowHeight / 2 + 2, barW, rowHeight - 4);
    } else {
      canvasCtx.fillRect(zeroX + barW, y - rowHeight / 2 + 2, -barW, rowHeight - 4);
    }
  }

  // Silhouette axis labels
  canvasCtx.font = "9px sans-serif";
  canvasCtx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  canvasCtx.textAlign = "center";
  canvasCtx.textBaseline = "top";
  for (const v of [-1, -0.5, 0, 0.5, 1]) {
    const x = zeroX + (v * silWidth) / 2;
    canvasCtx.fillText(v.toFixed(1), x, axisY);
  }

  // Tooltip
  const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
  tooltip.style.display = "none";
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const my = e.clientY - rect.top;
    for (let i = 0; i < nLeaves; i++) {
      const y = leafY.get(leaves[i]!.id)!;
      if (Math.abs(my - y) < rowHeight / 2) {
        const origIdx = leaves[i]!.leafIndices[0]!;
        const entry = scoreByIndex.get(origIdx!);
        if (entry) {
          tooltip.textContent = `${entry.name}: silhouette = ${entry.score.toFixed(3)}, cluster ${entry.cluster}`;
          tooltip.style.display = "";
          tooltip.style.left = `${e.clientX - rect.left + 12}px`;
          tooltip.style.top = `${my + 12}px`;
          return;
        }
      }
    }
    tooltip.style.display = "none";
  });
  canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
}

export function renderMiniDendrogram(ctx: AnalyticsViewContext, canvas: HTMLCanvasElement, filters: FilterConfig): void {
  if (!ctx.data) return;
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx) return;

  const result = calculateCooccurrence(ctx.data, filters);
  if (result.codes.length < 3) return;

  const n = result.codes.length;
  const distMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { row.push(0); continue; }
      const freqI = result.matrix[i]![i]!;
      const freqJ = result.matrix[j]![j]!;
      const coij = result.matrix[i]![j]!;
      const union = freqI! + freqJ! - coij!;
      row.push(union > 0 ? 1 - coij! / union : 1);
    }
    distMatrix.push(row);
  }

  const root = buildDendrogram(distMatrix, result.codes, result.colors);
  if (!root) return;

  const W = canvas.width;
  const H = canvas.height;
  const pad = 8;
  const isDark = document.body.classList.contains("theme-dark");

  const leaves: DendrogramNode[] = [];
  function collect(node: DendrogramNode): void {
    if (!node.left && !node.right) { leaves.push(node); return; }
    if (node.left) collect(node.left);
    if (node.right) collect(node.right);
  }
  collect(root);

  const nLeaves = leaves.length;
  const maxDist = root.distance || 1;
  const leafYMap = new Map<number, number>();
  for (let i = 0; i < nLeaves; i++) {
    leafYMap.set(leaves[i]!.id, pad + (i / (nLeaves - 1 || 1)) * (H - 2 * pad));
  }

  function distToX(d: number): number { return pad + (d / maxDist) * (W - 2 * pad); }
  function getNodeY(node: DendrogramNode): number {
    if (!node.left && !node.right) return leafYMap.get(node.id) ?? 0;
    return ((node.left ? getNodeY(node.left) : 0) + (node.right ? getNodeY(node.right) : 0)) / 2;
  }

  function drawNode(node: DendrogramNode): void {
    if (!node.left || !node.right) return;
    const x = distToX(node.distance);
    const ly = getNodeY(node.left);
    const ry = getNodeY(node.right);
    const lx = node.left.left ? distToX(node.left.distance) : pad;
    const rx = node.right.left ? distToX(node.right.distance) : pad;

    canvasCtx!.strokeStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
    canvasCtx!.lineWidth = 1;
    canvasCtx!.beginPath(); canvasCtx!.moveTo(x, ly); canvasCtx!.lineTo(x, ry); canvasCtx!.stroke();
    canvasCtx!.beginPath(); canvasCtx!.moveTo(lx, ly); canvasCtx!.lineTo(x, ly); canvasCtx!.stroke();
    canvasCtx!.beginPath(); canvasCtx!.moveTo(rx, ry); canvasCtx!.lineTo(x, ry); canvasCtx!.stroke();
    drawNode(node.left);
    drawNode(node.right);
  }

  drawNode(root);
}

export function buildDendrogramRows(ctx: AnalyticsViewContext): string[][] | null {
  if (!ctx.data) return null;
  const filters = ctx.buildFilterConfig();
  const result = calculateCooccurrence(ctx.data, filters);
  if (result.codes.length < 3) return null;

  const n = result.codes.length;
  const distMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { row.push(0); continue; }
      const freqI = result.matrix[i]![i]!; const freqJ = result.matrix[j]![j]!; const coij = result.matrix[i]![j]!;
      const union = freqI! + freqJ! - coij!;
      row.push(union > 0 ? 1 - coij! / union : 1);
    }
    distMatrix.push(row);
  }

  const root = buildDendrogram(distMatrix, result.codes, result.colors);
  if (!root) return null;
  const assignments = cutDendrogram(root, ctx.dendrogramCutDistance);
  const sil = calculateSilhouette(distMatrix, assignments, result.codes, result.colors);

  const rows: string[][] = [["name", "cluster", "silhouette_score"]];
  for (const s of sil.scores) {
    rows.push([s.name, String(s.cluster), String(s.score)]);
  }
  return rows;
}

export function exportDendrogramCSV(ctx: AnalyticsViewContext, date: string): void {
  const rows = buildDendrogramRows(ctx);
  if (!rows) { new Notice("Insufficient data."); return; }
  downloadCsv(rows, `codemarker-dendrogram-${date}.csv`);
}
