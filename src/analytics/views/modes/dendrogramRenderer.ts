/**
 * Pure dendrogram renderer. No Obsidian deps; consumed by both
 * `dendrogramMode` (R-mode codes) and `filesDendrogramMode` (Q-mode files).
 *
 * Computes hierarchical cluster + cut + silhouette from a distance matrix,
 * then draws the canvas. Returns the cluster artifacts so callers (e.g. S3
 * cluster drill-down) can map clusterIdx → leafIndices → fileIds/codeIds.
 */

import {
  buildDendrogram,
  cutDendrogram,
  calculateSilhouette,
  type DendrogramNode,
  type SilhouetteResult,
} from "../../data/clusterEngine";

export interface DendrogramRenderResult {
  root: DendrogramNode | null;
  assignments: number[];
  silhouette: SilhouetteResult | null;
  /** Cluster index → ordered list of original indices (leaves) belonging to it. */
  clusterToLeaves: number[][];
  /** Per-cluster color (HSL, deterministic by cluster index). */
  clusterColors: string[];
}

export interface DendrogramFullOptions {
  container: HTMLElement;
  distMatrix: number[][];
  names: string[];
  colors: string[];
  cutDistance: number;
  isDark: boolean;
  textColor: string;
  /** Optional click handler — fires when user clicks on a cluster swatch in the labels column. */
  onClusterClick?: (clusterIdx: number, leafIndices: number[]) => void;
  /** Optional cluster idx to render with selection emphasis. */
  selectedCluster?: number | null;
}

/**
 * Computes cluster artifacts from a distance matrix without rendering. Used by
 * callers that need cluster→leaves mapping ahead of UI (e.g. when applying a
 * cluster filter cross-view).
 */
export function computeClusterArtifacts(
  distMatrix: number[][],
  names: string[],
  colors: string[],
  cutDistance: number,
): DendrogramRenderResult {
  const root = buildDendrogram(distMatrix, names, colors);
  if (!root) {
    return { root: null, assignments: [], silhouette: null, clusterToLeaves: [], clusterColors: [] };
  }

  const assignments = cutDendrogram(root, cutDistance);
  const silhouette = calculateSilhouette(distMatrix, assignments, names, colors);

  const clusterToLeaves: number[][] = [];
  for (let i = 0; i < assignments.length; i++) {
    const c = assignments[i]!;
    if (!clusterToLeaves[c]) clusterToLeaves[c] = [];
    clusterToLeaves[c]!.push(i);
  }

  const nClusters = clusterToLeaves.length;
  const clusterColors: string[] = [];
  for (let i = 0; i < nClusters; i++) {
    const hue = (i * 137.5) % 360;
    clusterColors.push(`hsl(${hue}, 65%, 55%)`);
  }

  return { root, assignments, silhouette, clusterToLeaves, clusterColors };
}

export function renderDendrogramFull(opts: DendrogramFullOptions): DendrogramRenderResult {
  const { container, distMatrix, names, colors, cutDistance, isDark, textColor, onClusterClick, selectedCluster } = opts;

  const artifacts = computeClusterArtifacts(distMatrix, names, colors, cutDistance);
  if (!artifacts.root || !artifacts.silhouette) return artifacts;

  const wrapper = container.createDiv();
  wrapper.style.position = "relative";
  wrapper.style.overflow = "auto";

  const leaves: DendrogramNode[] = [];
  function collectLeaves(node: DendrogramNode): void {
    if (!node.left && !node.right) { leaves.push(node); return; }
    if (node.left) collectLeaves(node.left);
    if (node.right) collectLeaves(node.right);
  }
  collectLeaves(artifacts.root);

  const nLeaves = leaves.length;
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
  if (onClusterClick) canvas.style.cursor = "pointer";

  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx) return artifacts;

  const maxDist = artifacts.root.distance || 1;

  const leafY = new Map<number, number>();
  for (let i = 0; i < nLeaves; i++) {
    leafY.set(leaves[i]!.id, padTop + i * rowHeight + rowHeight / 2);
  }

  // Labels
  canvasCtx.font = "11px sans-serif";
  canvasCtx.textAlign = "right";
  canvasCtx.textBaseline = "middle";
  for (let i = 0; i < nLeaves; i++) {
    const leaf = leaves[i]!;
    const y = leafY.get(leaf.id)!;
    const clusterIdx = artifacts.assignments[leaf.leafIndices[0]!]!;
    const isSelected = selectedCluster != null && clusterIdx === selectedCluster;

    canvasCtx.fillStyle = artifacts.clusterColors[clusterIdx] ?? textColor;
    canvasCtx.fillRect(labelWidth - 18, y - 5, 10, 10);
    if (isSelected) {
      canvasCtx.strokeStyle = textColor;
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeRect(labelWidth - 19, y - 6, 12, 12);
      canvasCtx.lineWidth = 1;
    }
    canvasCtx.fillStyle = textColor;
    const rawLabel = leaf.label ?? "";
    const label = rawLabel.length > 16 ? rawLabel.slice(0, 15) + "…" : rawLabel;
    canvasCtx.fillText(label, labelWidth - 22, y);
  }

  // Tree
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

    canvasCtx!.strokeStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
    canvasCtx!.lineWidth = 1.5;
    canvasCtx!.beginPath(); canvasCtx!.moveTo(x, ly); canvasCtx!.lineTo(x, ry); canvasCtx!.stroke();
    canvasCtx!.beginPath(); canvasCtx!.moveTo(lx, ly); canvasCtx!.lineTo(x, ly); canvasCtx!.stroke();
    canvasCtx!.beginPath(); canvasCtx!.moveTo(rx, ry); canvasCtx!.lineTo(x, ry); canvasCtx!.stroke();
    drawNode(node.left);
    drawNode(node.right);
  }
  drawNode(artifacts.root);

  // Cut line
  const cutX = distToX(cutDistance);
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

  // Silhouette plot
  const silLeft = treeRight + 40;
  canvasCtx.font = "11px sans-serif";
  canvasCtx.fillStyle = textColor;
  canvasCtx.textAlign = "left";
  canvasCtx.textBaseline = "bottom";
  const sil = artifacts.silhouette;
  const quality = sil.avgScore > 0.5 ? "good" : sil.avgScore > 0.25 ? "fair" : "weak";
  canvasCtx.fillText(`Silhouette (avg: ${sil.avgScore.toFixed(3)} — ${quality})`, silLeft, padTop - 8);

  const zeroX = silLeft + silWidth / 2;
  canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(zeroX, padTop);
  canvasCtx.lineTo(zeroX, padTop + nLeaves * rowHeight);
  canvasCtx.stroke();

  const avgX = zeroX + (sil.avgScore * silWidth) / 2;
  canvasCtx.strokeStyle = "#F44336";
  canvasCtx.lineWidth = 1;
  canvasCtx.setLineDash([4, 3]);
  canvasCtx.beginPath();
  canvasCtx.moveTo(avgX, padTop);
  canvasCtx.lineTo(avgX, padTop + nLeaves * rowHeight);
  canvasCtx.stroke();
  canvasCtx.setLineDash([]);

  const scoreByIndex = new Map(sil.scores.map((s) => [s.index, s]));
  for (let i = 0; i < nLeaves; i++) {
    const leaf = leaves[i]!;
    const origIdx = leaf.leafIndices[0]!;
    const entry = scoreByIndex.get(origIdx);
    if (!entry) continue;

    const y = leafY.get(leaf.id)!;
    const barW = (entry.score * silWidth) / 2;
    const clusterIdx = artifacts.assignments[origIdx]!;

    canvasCtx.fillStyle = artifacts.clusterColors[clusterIdx] ?? "#6200EE";
    if (barW >= 0) {
      canvasCtx.fillRect(zeroX, y - rowHeight / 2 + 2, barW, rowHeight - 4);
    } else {
      canvasCtx.fillRect(zeroX + barW, y - rowHeight / 2 + 2, -barW, rowHeight - 4);
    }
  }

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
        const entry = scoreByIndex.get(origIdx);
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

  // Click handler — clicking on a label/swatch row fires onClusterClick with that cluster.
  if (onClusterClick) {
    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Only react to clicks within the labels column (left of the tree).
      if (mx > labelWidth) return;
      for (let i = 0; i < nLeaves; i++) {
        const leaf = leaves[i]!;
        const y = leafY.get(leaf.id)!;
        if (Math.abs(my - y) >= rowHeight / 2) continue;
        const origIdx = leaf.leafIndices[0]!;
        const clusterIdx = artifacts.assignments[origIdx]!;
        const leavesOfCluster = artifacts.clusterToLeaves[clusterIdx] ?? [];
        onClusterClick(clusterIdx, leavesOfCluster);
        return;
      }
    });
  }

  return artifacts;
}

export function renderDendrogramMini(canvas: HTMLCanvasElement, distMatrix: number[][], names: string[], colors: string[], isDark: boolean): void {
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx) return;
  const root = buildDendrogram(distMatrix, names, colors);
  if (!root) return;

  const W = canvas.width;
  const H = canvas.height;
  const pad = 8;

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

/**
 * Build CSV rows for a dendrogram run. Returns `null` if cluster artifacts
 * could not be computed (e.g. empty matrix).
 */
export function buildDendrogramExportRows(
  distMatrix: number[][],
  names: string[],
  colors: string[],
  cutDistance: number,
): string[][] | null {
  const artifacts = computeClusterArtifacts(distMatrix, names, colors, cutDistance);
  if (!artifacts.silhouette) return null;
  const rows: string[][] = [["name", "cluster", "silhouette_score"]];
  for (const s of artifacts.silhouette.scores) {
    rows.push([s.name, String(s.cluster), String(s.score)]);
  }
  return rows;
}
