
import { Notice } from "obsidian";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig } from "../../data/dataTypes";
import { buildDecisionTree, type DecisionTreeNode, type DecisionTreeResult } from "../../data/decisionTreeEngine";

export function renderDecisionTreeOptionsSection(ctx: AnalyticsViewContext): void {
  if (!ctx.data) return;
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Decision Tree" });

  // Outcome code dropdown
  section.createDiv({ cls: "codemarker-config-sublabel", text: "Outcome Code" });
  const select = section.createEl("select", { cls: "codemarker-config-select" });
  const codes = ctx.data.codes.map((c) => c.name).sort();
  if (!ctx.dtOutcomeCode && codes.length > 0) ctx.dtOutcomeCode = codes[0]!;
  for (const code of codes) {
    const opt = select.createEl("option", { text: code, value: code });
    if (code === ctx.dtOutcomeCode) opt.selected = true;
  }
  select.addEventListener("change", () => {
    ctx.dtOutcomeCode = select.value;
    ctx.scheduleUpdate();
  });

  // Max depth slider
  const depthLabel = section.createDiv({ cls: "codemarker-config-sublabel", text: `Max Depth: ${ctx.dtMaxDepth}` });
  const slider = section.createEl("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "6";
  slider.value = String(ctx.dtMaxDepth);
  slider.style.width = "100%";
  slider.addEventListener("input", () => {
    ctx.dtMaxDepth = Number(slider.value);
    depthLabel.textContent = `Max Depth: ${ctx.dtMaxDepth}`;
  });
  slider.addEventListener("change", () => {
    ctx.dtMaxDepth = Number(slider.value);
    ctx.scheduleUpdate();
  });
}

export function renderDecisionTreeView(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.data || !ctx.chartContainer) return;
  const container = ctx.chartContainer;

  const codes = ctx.data.codes.map((c) => c.name).sort();
  if (!ctx.dtOutcomeCode && codes.length > 0) ctx.dtOutcomeCode = codes[0]!;

  const result = buildDecisionTree(ctx.data, filters, ctx.dtOutcomeCode, ctx.dtMaxDepth, 2);

  if (result.totalMarkers === 0 || result.predictors.length === 0) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "Not enough data to build a decision tree. Need at least 2 codes with sufficient frequency.",
    });
    return;
  }

  // Wrapper
  const wrapper = container.createDiv({ cls: "codemarker-dt-wrapper" });

  // Title bar with metrics
  const header = wrapper.createDiv({ cls: "codemarker-dt-header" });
  header.createEl("strong", { text: `Decision Tree — Outcome: ${result.outcomeCode}` });

  const metricsBar = wrapper.createDiv({ cls: "codemarker-dt-metrics" });
  for (const [val, label] of [
    [`${(result.accuracy * 100).toFixed(1)}%`, "Accuracy"],
    [`${(result.aPriori * 100).toFixed(1)}%`, "A Priori"],
    [result.tau.toFixed(3), "Klecka's τ"],
    [String(result.totalMarkers), "Markers"],
    [String(result.predictors.length), "Predictors"],
  ]) {
    const card = metricsBar.createDiv({ cls: "codemarker-dt-metric-card" });
    card.createDiv({ cls: "codemarker-dt-metric-val", text: val });
    card.createDiv({ cls: "codemarker-dt-metric-label", text: label });
  }

  // Tree container (scrollable)
  const treeContainer = wrapper.createDiv({ cls: "codemarker-dt-tree" });
  renderTreeNode(ctx, treeContainer, result.root, result, 0);

  // Error analysis section
  if (result.errorLeaves.length > 0) {
    const errorSection = wrapper.createDiv({ cls: "codemarker-dt-error-section" });
    errorSection.createEl("strong", { text: `Error Analysis (${result.errorLeaves.reduce((s, e) => s + e.errors, 0)} misclassified markers)` });

    for (const leaf of result.errorLeaves) {
      const row = errorSection.createDiv({ cls: "codemarker-dt-error-row" });
      row.createSpan({ text: `Node #${leaf.nodeId}: ${leaf.errors} errors` });
      row.createSpan({ cls: "codemarker-dt-error-path", text: leaf.path });

      const btn = row.createEl("button", { cls: "codemarker-dt-error-btn", text: "View in Text Retrieval" });
      btn.addEventListener("click", () => {
        // Switch to text-retrieval mode (user can inspect the markers)
        ctx.viewMode = "text-retrieval";
        ctx.scheduleUpdate();
        new Notice(`Switched to Text Retrieval. ${leaf.errors} misclassified markers from node #${leaf.nodeId}.`);
      });
    }
  }
}

export function renderTreeNode(
  ctx: AnalyticsViewContext,
  parent: HTMLElement,
  node: DecisionTreeNode,
  result: DecisionTreeResult,
  childIndex: number,
): void {
  const nodeEl = parent.createDiv({ cls: "codemarker-dt-node" });

  // Edge label (for non-root)
  if (node.depth > 0) {
    const edgeLabel = nodeEl.createDiv({ cls: "codemarker-dt-edge-label" });
    edgeLabel.textContent = childIndex === 0 ? "Absent" : "Present";
  }

  const card = nodeEl.createDiv({ cls: "codemarker-dt-card" });

  const isLeaf = node.children.length === 0;
  if (isLeaf) card.classList.add("is-leaf");

  // Prediction badge
  const predBadge = card.createDiv({ cls: "codemarker-dt-pred-badge" });
  predBadge.textContent = node.prediction === 1 ? "✓ Present" : "✗ Absent";
  predBadge.classList.add(node.prediction === 1 ? "is-positive" : "is-negative");

  // Stats
  const stats = card.createDiv({ cls: "codemarker-dt-card-stats" });
  stats.createSpan({ text: `n = ${node.n}` });
  stats.createSpan({ cls: "codemarker-dt-stat-sep", text: "·" });
  stats.createSpan({ text: `${(node.accuracy * 100).toFixed(1)}%` });
  stats.createSpan({ cls: "codemarker-dt-stat-sep", text: "·" });
  stats.createSpan({ text: `${node.correct} ✓` });
  stats.createSpan({ cls: "codemarker-dt-stat-sep", text: "·" });
  stats.createSpan({ text: `${node.errors} ✗` });

  // Distribution bar
  const distBar = card.createDiv({ cls: "codemarker-dt-dist-bar" });
  const posPct = node.n > 0 ? (node.nPositive / node.n) * 100 : 0;
  const negPct = 100 - posPct;
  const posSegment = distBar.createDiv({ cls: "codemarker-dt-dist-pos" });
  posSegment.style.width = `${posPct}%`;
  posSegment.style.backgroundColor = result.outcomeColor;
  posSegment.title = `Present: ${posPct.toFixed(1)}% (${node.nPositive}/${node.n})`;
  distBar.title = `Present: ${posPct.toFixed(1)}% · Absent: ${negPct.toFixed(1)}%`;

  // Split info
  if (node.split) {
    const splitInfo = card.createDiv({ cls: "codemarker-dt-split-info" });
    const swatch = splitInfo.createSpan({ cls: "codemarker-dt-split-swatch" });
    swatch.style.backgroundColor = node.split.predictorColor;
    splitInfo.createSpan({ text: node.split.predictor });
    splitInfo.createSpan({ cls: "codemarker-dt-split-chi", text: `χ²=${node.split.chiSquare}, p=${node.split.pValue < 0.001 ? "<.001" : node.split.pValue.toFixed(3)}` });
  }

  // Children
  if (node.children.length > 0) {
    const childrenContainer = nodeEl.createDiv({ cls: "codemarker-dt-children" });
    for (let i = 0; i < node.children.length; i++) {
      renderTreeNode(ctx, childrenContainer, node.children[i]!, result, i);
    }
  }
}

export function renderMiniDecisionTree(ctx: AnalyticsViewContext, canvas: HTMLCanvasElement, filters: FilterConfig): void {
  if (!ctx.data) return;
  const codes = ctx.data.codes.map((c) => c.name).sort();
  const outcome = codes[0] ?? "";
  if (!outcome) return;
  const result = buildDecisionTree(ctx.data, filters, outcome, 3, 2);

  const W = canvas.width;
  const H = canvas.height;
  const canvasCtx = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  canvasCtx.fillStyle = isDark ? "#1e1e1e" : "#fafafa";
  canvasCtx.fillRect(0, 0, W, H);

  // Draw mini tree structure
  const nodePositions = new Map<number, { x: number; y: number }>();

  function layoutNode(node: DecisionTreeNode, x: number, y: number, width: number): void {
    nodePositions.set(node.id, { x, y });
    if (node.children.length > 0) {
      const childWidth = width / node.children.length;
      for (let i = 0; i < node.children.length; i++) {
        const cx = x - width / 2 + childWidth * (i + 0.5);
        layoutNode(node.children[i]!, cx, y + 40, childWidth);
      }
    }
  }

  layoutNode(result.root, W / 2, 25, W - 40);

  // Draw edges
  canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
  canvasCtx.lineWidth = 1;
  function drawEdges(node: DecisionTreeNode): void {
    const pos = nodePositions.get(node.id)!;
    for (const child of node.children) {
      const cPos = nodePositions.get(child.id)!;
      canvasCtx.beginPath();
      canvasCtx.moveTo(pos.x, pos.y + 8);
      canvasCtx.lineTo(cPos.x, cPos.y - 8);
      canvasCtx.stroke();
      drawEdges(child);
    }
  }
  drawEdges(result.root);

  // Draw nodes
  for (const [id, pos] of nodePositions) {
    // Find node for color
    let isLeaf = false;
    let prediction = 0;
    function findNode(n: DecisionTreeNode): DecisionTreeNode | null {
      if (n.id === id) return n;
      for (const c of n.children) { const r = findNode(c); if (r) return r; }
      return null;
    }
    const node = findNode(result.root);
    if (node) {
      isLeaf = node.children.length === 0;
      prediction = node.prediction;
    }

    canvasCtx.beginPath();
    canvasCtx.arc(pos.x, pos.y, isLeaf ? 6 : 5, 0, Math.PI * 2);
    canvasCtx.fillStyle = prediction === 1 ? result.outcomeColor : (isDark ? "#555" : "#ccc");
    canvasCtx.fill();
    if (isLeaf) {
      canvasCtx.strokeStyle = isDark ? "#fff" : "#333";
      canvasCtx.lineWidth = 1;
      canvasCtx.stroke();
    }
  }

  // Accuracy label
  canvasCtx.font = "11px sans-serif";
  canvasCtx.fillStyle = isDark ? "#aaa" : "#666";
  canvasCtx.textAlign = "center";
  canvasCtx.fillText(`Acc: ${(result.accuracy * 100).toFixed(0)}%, τ=${result.tau.toFixed(2)}`, W / 2, H - 10);
}

export function exportDecisionTreeCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const codes = ctx.data.codes.map((c) => c.name).sort();
  if (!ctx.dtOutcomeCode && codes.length > 0) ctx.dtOutcomeCode = codes[0]!;
  const result = buildDecisionTree(ctx.data, filters, ctx.dtOutcomeCode, ctx.dtMaxDepth, 2);

  const rows: string[][] = [["node_id", "depth", "n", "n_positive", "n_negative", "prediction", "accuracy", "correct", "errors", "split_predictor", "split_chi_square", "split_p_value", "is_leaf"]];

  function collectNodes(node: DecisionTreeNode): void {
    rows.push([
      String(node.id),
      String(node.depth),
      String(node.n),
      String(node.nPositive),
      String(node.nNegative),
      node.prediction === 1 ? "present" : "absent",
      String(node.accuracy),
      String(node.correct),
      String(node.errors),
      node.split?.predictor ?? "",
      node.split ? String(node.split.chiSquare) : "",
      node.split ? String(node.split.pValue) : "",
      node.children.length === 0 ? "yes" : "no",
    ]);
    for (const child of node.children) collectNodes(child);
  }
  collectNodes(result.root);

  const csvContent = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = `codemarker-decision-tree-${date}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
