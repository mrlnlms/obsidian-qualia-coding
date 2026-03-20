
import type { FilterConfig } from "../../data/dataTypes";
import { calculateCooccurrence, calculateFrequency } from "../../data/statsEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { isLightColor , buildCsv } from "../shared/chartHelpers";

export function renderGraphOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Graph options" });

  // Edge labels toggle
  const labelRow = section.createDiv({ cls: "codemarker-config-row" });
  const labelCb = labelRow.createEl("input", { type: "checkbox" });
  labelCb.checked = ctx.showEdgeLabels;
  labelRow.createSpan({ text: "Show edge weights" });
  labelCb.addEventListener("change", () => {
    ctx.showEdgeLabels = labelCb.checked;
    ctx.scheduleUpdate();
  });
  labelRow.addEventListener("click", (e) => {
    if (e.target !== labelCb) { labelCb.checked = !labelCb.checked; labelCb.dispatchEvent(new Event("change")); }
  });

  // Min edge weight
  const weightRow = section.createDiv({ cls: "codemarker-config-row" });
  weightRow.createSpan({ text: "Min edge weight" });
  const weightInput = weightRow.createEl("input", {
    cls: "codemarker-config-number",
    attr: { type: "number", min: "1", value: String(ctx.minEdgeWeight) },
  });
  weightInput.style.marginLeft = "auto";
  weightInput.addEventListener("input", () => {
    const val = parseInt(weightInput.value);
    if (!isNaN(val) && val >= 1) {
      ctx.minEdgeWeight = val;
      ctx.scheduleUpdate();
    }
  });
}

export function exportGraphCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const result = calculateCooccurrence(ctx.data, filters);

  const rows = [["source", "target", "weight"]];
  for (let i = 0; i < result.codes.length; i++) {
    for (let j = i + 1; j < result.codes.length; j++) {
      if (result.matrix[i]![j]! > 0) {
        rows.push([result.codes[i]!, result.codes[j]!, String(result.matrix[i]![j]!)]);
      }
    }
  }
  const csvContent = buildCsv(rows);
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = `codemarker-graph-${date}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

export function renderNetworkGraph(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const cooc = calculateCooccurrence(ctx.data, filters);
  const freq = calculateFrequency(ctx.data, filters);

  if (cooc.codes.length < 2) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "Need at least 2 codes for network graph.",
    });
    return;
  }

  const n = cooc.codes.length;
  const freqMap = new Map(freq.map((f) => [f.code, f.total]));

  // Build edges
  interface Edge { i: number; j: number; weight: number; }
  const edges: Edge[] = [];
  let maxWeight = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = cooc.matrix[i]![j]!;
      if (w! >= ctx.minEdgeWeight) {
        edges.push({ i, j, weight: w! });
        if (w! > maxWeight) maxWeight = w!;
      }
    }
  }

  if (edges.length === 0) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No co-occurrence edges above the minimum weight.",
    });
    return;
  }

  // Canvas setup
  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.position = "relative";
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";

  const canvas = wrapper.createEl("canvas");
  const rect = ctx.chartContainer.getBoundingClientRect();
  const W = Math.max(600, rect.width - 32);
  const H = Math.max(400, rect.height - 32);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const c2d = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

  // Node sizing based on frequency
  const maxFreq = Math.max(...cooc.codes.map((c) => freqMap.get(c) ?? 1));
  const minRadius = 16;
  const maxRadius = 40;

  // Initialize positions in a circle
  interface Node { x: number; y: number; vx: number; vy: number; radius: number; }
  const nodes: Node[] = cooc.codes.map((code, i) => {
    const angle = (2 * Math.PI * i) / n;
    const spread = Math.min(W, H) * 0.35;
    const f = freqMap.get(code) ?? 1;
    const radius = minRadius + ((f / maxFreq) * (maxRadius - minRadius));
    return {
      x: W / 2 + Math.cos(angle) * spread,
      y: H / 2 + Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
      radius,
    };
  });

  // Force-directed simulation
  const iterations = 300;
  const repulsion = 8000;
  const attraction = 0.005;
  const damping = 0.9;
  const centerGravity = 0.01;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[i]!.x - nodes[j]!.x;
        const dy = nodes[i]!.y - nodes[j]!.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i]!.vx += fx;
        nodes[i]!.vy += fy;
        nodes[j]!.vx -= fx;
        nodes[j]!.vy -= fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const ni = nodes[edge.i];
      const nj = nodes[edge.j];
      const dx = nj!.x - ni!.x;
      const dy = nj!.y - ni!.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const force = dist * attraction * (edge.weight / maxWeight);
      const fx = (dx / Math.max(dist, 1)) * force;
      const fy = (dy / Math.max(dist, 1)) * force;
      ni!.vx += fx;
      ni!.vy += fy;
      nj!.vx -= fx;
      nj!.vy -= fy;
    }

    // Center gravity
    for (const node of nodes) {
      node.vx += (W / 2 - node.x) * centerGravity;
      node.vy += (H / 2 - node.y) * centerGravity;
    }

    // Apply velocities with damping
    for (const node of nodes) {
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
      // Clamp to canvas bounds
      node.x = Math.max(node.radius + 5, Math.min(W - node.radius - 5, node.x));
      node.y = Math.max(node.radius + 5, Math.min(H - node.radius - 5, node.y));
    }
  }

  // ── Draw ──

  // Edges
  for (const edge of edges) {
    const ni = nodes[edge.i];
    const nj = nodes[edge.j];
    const thickness = 1 + (edge.weight / maxWeight) * 5;
    const opacity = 0.2 + (edge.weight / maxWeight) * 0.6;

    c2d.beginPath();
    c2d.moveTo(ni!.x, ni!.y);
    c2d.lineTo(nj!.x, nj!.y);
    c2d.strokeStyle = isDark
      ? `rgba(180, 180, 200, ${opacity})`
      : `rgba(80, 80, 100, ${opacity})`;
    c2d.lineWidth = thickness;
    c2d.stroke();

    // Edge weight label
    if (ctx.showEdgeLabels && edge.weight > 0) {
      const mx = (ni!.x + nj!.x) / 2;
      const my = (ni!.y + nj!.y) / 2;
      c2d.font = "10px sans-serif";
      c2d.fillStyle = isDark ? "rgba(180,180,200,0.7)" : "rgba(80,80,100,0.7)";
      c2d.textAlign = "center";
      c2d.textBaseline = "middle";
      c2d.fillText(String(edge.weight), mx, my);
    }
  }

  // Nodes
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const color = cooc.colors[i];

    // Shadow
    c2d.save();
    c2d.shadowColor = "rgba(0,0,0,0.2)";
    c2d.shadowBlur = 6;
    c2d.shadowOffsetX = 0;
    c2d.shadowOffsetY = 2;

    // Circle
    c2d.beginPath();
    c2d.arc(node!.x, node!.y, node!.radius, 0, Math.PI * 2);
    c2d.fillStyle = color!;
    c2d.fill();
    c2d.restore();

    // Border
    c2d.beginPath();
    c2d.arc(node!.x, node!.y, node!.radius, 0, Math.PI * 2);
    c2d.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
    c2d.lineWidth = 1.5;
    c2d.stroke();

    // Label
    const label = cooc.codes[i]!.length > 12
      ? cooc.codes[i]!.slice(0, 11) + "\u2026"
      : cooc.codes[i];
    c2d.font = `bold ${Math.max(10, Math.min(13, node!.radius * 0.5))}px sans-serif`;
    c2d.textAlign = "center";
    c2d.textBaseline = "middle";
    // Text color contrasting with node
    const bright = isLightColor(color!);
    c2d.fillStyle = bright ? "#1a1a1a" : "#f0f0f0";
    c2d.fillText(label!, node!.x, node!.y);
  }

  // Tooltip on hover
  const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
  tooltip.style.display = "none";

  canvas.addEventListener("mousemove", (e) => {
    const cr = canvas.getBoundingClientRect();
    const mx = e.clientX - cr.left;
    const my = e.clientY - cr.top;

    // Check nodes
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const dx = mx - node!.x;
      const dy = my - node!.y;
      if (dx * dx + dy * dy <= node!.radius * node!.radius) {
        const f = freqMap.get(cooc.codes[i]!) ?? 0;
        // Find connected edges
        const connections = edges
          .filter((e) => e.i === i || e.j === i)
          .map((e) => {
            const other = e.i === i ? cooc.codes[e.j] : cooc.codes[e.i];
            return `${other} (${e.weight})`;
          });
        let text = `${cooc.codes[i]}: ${f} markers`;
        if (connections.length > 0) {
          text += `\nLinks: ${connections.join(", ")}`;
        }
        tooltip.style.whiteSpace = "pre";
        tooltip.textContent = text;
        tooltip.style.display = "";
        tooltip.style.left = `${mx + 12}px`;
        tooltip.style.top = `${my + 12}px`;
        canvas.style.cursor = "pointer";
        return;
      }
    }
    tooltip.style.display = "none";
    canvas.style.cursor = "default";
  });

  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
    canvas.style.cursor = "default";
  });
}
