
import { setIcon, Notice } from "obsidian";
import type { FilterConfig, CooccurrenceResult, DocCodeMatrixResult, EvolutionResult, FrequencyResult } from "../../data/dataTypes";
import { calculateFrequency, calculateCooccurrence, calculateDocumentCodeMatrix, calculateEvolution, calculateLagSequential, calculateOverlap, calculateTemporal } from "../../data/statsEngine";
import type { AnalyticsViewContext, ViewMode } from "../analyticsViewContext";
import { heatmapColor } from "../shared/chartHelpers";

export function renderDashboard(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const dashboard = ctx.chartContainer.createDiv({ cls: "codemarker-dashboard" });

  // ── KPIs ──
  const filtered = ctx.data.markers.filter((m) => filters.sources.includes(m.source));
  const freq = calculateFrequency(ctx.data, filters);
  freq.sort((a, b) => b.total - a.total);

  const totalMarkers = filtered.length;
  const totalCodes = ctx.data.codes.length;
  const totalFiles = new Set(filtered.map((m) => m.file)).size;
  const activeSources = [
    ctx.data.sources.markdown,
    ctx.data.sources.csv,
    ctx.data.sources.image,
    ctx.data.sources.pdf,
    ctx.data.sources.audio,
    ctx.data.sources.video,
  ].filter(Boolean).length;
  const mostUsedCode = freq.length > 0 ? freq[0]!.code : "\u2014";
  const avgCodesPerMarker = filtered.length > 0
    ? (filtered.reduce((s, m) => s + m.codes.length, 0) / filtered.length).toFixed(1)
    : "0";

  const kpiGrid = dashboard.createDiv({ cls: "codemarker-kpi-grid" });
  const kpis: Array<{ value: string; label: string; accent: string }> = [
    { value: String(totalMarkers), label: "Total Markers", accent: "#42A5F5" },
    { value: String(totalCodes), label: "Total Codes", accent: "#6200EE" },
    { value: String(totalFiles), label: "Total Files", accent: "#66BB6A" },
    { value: String(activeSources), label: "Active Sources", accent: "#FFA726" },
    { value: mostUsedCode, label: "Most Used Code", accent: "#EF5350" },
    { value: avgCodesPerMarker, label: "Avg Codes/Marker", accent: "#AB47BC" },
  ];

  for (const kpi of kpis) {
    const card = kpiGrid.createDiv({ cls: "codemarker-kpi-card" });
    card.createDiv({ cls: "codemarker-kpi-value", text: kpi.value });
    card.createDiv({ cls: "codemarker-kpi-label", text: kpi.label });

    const boardBtn = card.createDiv({ cls: "codemarker-kpi-board-btn", attr: { "aria-label": "Add to Research Board" } });
    setIcon(boardBtn, "layout-dashboard");
    boardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.plugin.addKpiCardToBoard(kpi.value, kpi.label, kpi.accent);
      new Notice(`Added "${kpi.label}" to Research Board`);
    });
  }

  // ── Thumbnails ──
  const thumbGrid = dashboard.createDiv({ cls: "codemarker-thumbnail-grid" });

  const thumbnails: Array<{ mode: ViewMode; title: string; render: (canvas: HTMLCanvasElement) => void }> = [
    {
      mode: "frequency",
      title: "Frequency Bars",
      render: (c) => renderMiniFrequency(c, freq),
    },
    {
      mode: "cooccurrence",
      title: "Co-occurrence Matrix",
      render: (c) => {
        const cooc = calculateCooccurrence(ctx.data!, filters);
        renderMiniCooccurrence(c, cooc);
      },
    },
    {
      mode: "graph",
      title: "Network Graph",
      render: (c) => {
        const cooc = calculateCooccurrence(ctx.data!, filters);
        renderMiniNetwork(c, cooc, freq);
      },
    },
    {
      mode: "doc-matrix",
      title: "Document-Code Matrix",
      render: (c) => {
        const dm = calculateDocumentCodeMatrix(ctx.data!, filters);
        renderMiniDocMatrix(c, dm);
      },
    },
    {
      mode: "evolution",
      title: "Code Evolution",
      render: (c) => {
        const evo = calculateEvolution(ctx.data!, filters);
        renderMiniEvolution(c, evo);
      },
    },
    {
      mode: "word-cloud",
      title: "Word Cloud",
      render: (c) => (ctx as any).renderMiniWordCloud(c, freq),
    },
    {
      mode: "acm",
      title: "MCA Biplot",
      render: (c) => (ctx as any).renderMiniACM(c, filters),
    },
    {
      mode: "mds",
      title: "MDS Map",
      render: (c) => (ctx as any).renderMiniMDS(c, freq),
    },
    {
      mode: "temporal",
      title: "Temporal Analysis",
      render: (c) => {
        const temporal = calculateTemporal(ctx.data!, filters);
        (ctx as any).renderMiniTemporal(c, temporal);
      },
    },
    {
      mode: "text-stats",
      title: "Text Statistics",
      render: (c) => (ctx as any).renderMiniTextStats(c, freq),
    },
    {
      mode: "dendrogram",
      title: "Dendrogram",
      render: (c) => (ctx as any).renderMiniDendrogram(c, filters),
    },
    {
      mode: "lag-sequential",
      title: "Lag Sequential",
      render: (c) => {
        const lag = calculateLagSequential(ctx.data!, filters, 1);
        (ctx as any).renderMiniLag(c, lag);
      },
    },
    {
      mode: "polar-coords",
      title: "Polar Coordinates",
      render: (c) => (ctx as any).renderMiniPolar(c, filters),
    },
    {
      mode: "chi-square",
      title: "Chi-Square Tests",
      render: (c) => (ctx as any).renderMiniChiSquare(c, filters),
    },
    {
      mode: "decision-tree",
      title: "Decision Tree",
      render: (c) => (ctx as any).renderMiniDecisionTree(c, filters),
    },
    {
      mode: "source-comparison",
      title: "Source Comparison",
      render: (c) => (ctx as any).renderMiniSourceComparison(c, freq),
    },
    {
      mode: "code-overlap",
      title: "Code Overlap",
      render: (c) => {
        const overlap = calculateOverlap(ctx.data!, filters);
        (ctx as any).renderMiniMatrix(c, overlap.codes, overlap.colors, overlap.matrix, overlap.maxValue);
      },
    },
  ];

  for (const thumb of thumbnails) {
    const card = thumbGrid.createDiv({ cls: "codemarker-thumbnail-card" });
    card.createDiv({ cls: "codemarker-thumbnail-title", text: thumb.title });
    const canvas = card.createEl("canvas", { cls: "codemarker-thumbnail-canvas" });
    canvas.width = 280;
    canvas.height = 180;

    try {
      thumb.render(canvas);
    } catch {
      // If rendering fails, leave blank
    }

    card.addEventListener("click", () => {
      ctx.viewMode = thumb.mode;
      ctx.renderConfigPanel();
      ctx.scheduleUpdate();
    });
  }
}

export function renderMiniFrequency(canvas: HTMLCanvasElement, freq: FrequencyResult[]): void {
  const c2d = canvas.getContext("2d");
  if (!c2d || freq.length === 0) return;

  const W = canvas.width;
  const H = canvas.height;
  const top8 = freq.slice(0, 8);
  const maxVal = top8[0]?.total ?? 1;
  const barHeight = Math.min(18, (H - 20) / top8.length - 2);
  const leftPad = 80;
  const rightPad = 10;
  const barAreaW = W - leftPad - rightPad;

  const isDark = document.body.classList.contains("theme-dark");
  const textColor = isDark ? "#b0b0b0" : "#444";

  for (let i = 0; i < top8.length; i++) {
    const r = top8[i];
    const y = 10 + i * (barHeight + 4);
    const barW = Math.max(2, (r!.total / maxVal) * barAreaW);

    // Label
    c2d.fillStyle = textColor;
    c2d.font = "10px sans-serif";
    c2d.textAlign = "right";
    c2d.textBaseline = "middle";
    const label = r!.code.length > 10 ? r!.code.slice(0, 9) + "\u2026" : r!.code;
    c2d.fillText(label, leftPad - 6, y + barHeight / 2);

    // Bar
    c2d.fillStyle = r!.color;
    c2d.fillRect(leftPad, y, barW, barHeight);
  }
}

export function renderMiniCooccurrence(canvas: HTMLCanvasElement, cooc: CooccurrenceResult): void {
  const c2d = canvas.getContext("2d");
  if (!c2d || cooc.codes.length < 2) return;

  const W = canvas.width;
  const H = canvas.height;
  const n = cooc.codes.length;
  const pad = 10;
  const cellSize = Math.min((W - 2 * pad) / n, (H - 2 * pad) / n);
  const offsetX = (W - n * cellSize) / 2;
  const offsetY = (H - n * cellSize) / 2;
  const isDark = document.body.classList.contains("theme-dark");

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = offsetX + j * cellSize;
      const y = offsetY + i * cellSize;
      c2d.fillStyle = heatmapColor(cooc.matrix[i]![j]!, cooc.maxValue, isDark);
      c2d.fillRect(x, y, cellSize, cellSize);
    }
  }
}

export function renderMiniNetwork(canvas: HTMLCanvasElement, cooc: CooccurrenceResult, freq: FrequencyResult[]): void {
  const c2d = canvas.getContext("2d");
  if (!c2d || cooc.codes.length < 2) return;

  const W = canvas.width;
  const H = canvas.height;
  const n = cooc.codes.length;
  const freqMap = new Map(freq.map((f) => [f.code, f.total]));
  const maxFreq = Math.max(...cooc.codes.map((c) => freqMap.get(c) ?? 1));

  // Build edges
  interface MiniEdge { i: number; j: number; weight: number; }
  const edges: MiniEdge[] = [];
  let maxWeight = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = cooc.matrix[i]![j]!;
      if (w! > 0) {
        edges.push({ i, j, weight: w! });
        if (w! > maxWeight) maxWeight = w!;
      }
    }
  }

  // Positions — circle init then 50 iterations of force
  const nodes = cooc.codes.map((code, i) => {
    const angle = (2 * Math.PI * i) / n;
    const spread = Math.min(W, H) * 0.3;
    const f = freqMap.get(code) ?? 1;
    const radius = 4 + (f / maxFreq) * 10;
    return { x: W / 2 + Math.cos(angle) * spread, y: H / 2 + Math.sin(angle) * spread, vx: 0, vy: 0, radius };
  });

  for (let iter = 0; iter < 50; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[i]!.x - nodes[j]!.x;
        const dy = nodes[i]!.y - nodes[j]!.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 3000 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i]!.vx += fx; nodes[i]!.vy += fy;
        nodes[j]!.vx -= fx; nodes[j]!.vy -= fy;
      }
    }
    for (const edge of edges) {
      const ni = nodes[edge.i]; const nj = nodes[edge.j];
      const dx = nj!.x - ni!.x; const dy = nj!.y - ni!.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = dist * 0.008 * (maxWeight > 0 ? edge.weight / maxWeight : 1);
      ni!.vx += (dx / dist) * force; ni!.vy += (dy / dist) * force;
      nj!.vx -= (dx / dist) * force; nj!.vy -= (dy / dist) * force;
    }
    for (const node of nodes) {
      node.vx += (W / 2 - node.x) * 0.01;
      node.vy += (H / 2 - node.y) * 0.01;
      node.vx *= 0.85; node.vy *= 0.85;
      node.x += node.vx; node.y += node.vy;
      node.x = Math.max(node.radius + 2, Math.min(W - node.radius - 2, node.x));
      node.y = Math.max(node.radius + 2, Math.min(H - node.radius - 2, node.y));
    }
  }

  const isDark = document.body.classList.contains("theme-dark");

  // Draw edges
  for (const edge of edges) {
    const ni = nodes[edge.i]; const nj = nodes[edge.j];
    const opacity = maxWeight > 0 ? 0.15 + (edge.weight / maxWeight) * 0.4 : 0.3;
    c2d.beginPath(); c2d.moveTo(ni!.x, ni!.y); c2d.lineTo(nj!.x, nj!.y);
    c2d.strokeStyle = isDark ? `rgba(180,180,200,${opacity})` : `rgba(80,80,100,${opacity})`;
    c2d.lineWidth = 1 + (maxWeight > 0 ? (edge.weight / maxWeight) * 2 : 0);
    c2d.stroke();
  }

  // Draw nodes
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    c2d.beginPath(); c2d.arc(node!.x, node!.y, node!.radius, 0, Math.PI * 2);
    c2d.fillStyle = cooc.colors[i]!; c2d.fill();
    c2d.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)";
    c2d.lineWidth = 1; c2d.stroke();
  }
}

export function renderMiniDocMatrix(canvas: HTMLCanvasElement, dm: DocCodeMatrixResult): void {
  const c2d = canvas.getContext("2d");
  if (!c2d || dm.files.length === 0 || dm.codes.length === 0) return;

  const W = canvas.width;
  const H = canvas.height;
  const nFiles = dm.files.length;
  const nCodes = dm.codes.length;
  const pad = 10;
  const cellW = Math.min((W - 2 * pad) / nCodes, 20);
  const cellH = Math.min((H - 2 * pad) / nFiles, 20);
  const offsetX = (W - nCodes * cellW) / 2;
  const offsetY = (H - nFiles * cellH) / 2;
  const isDark = document.body.classList.contains("theme-dark");

  for (let fi = 0; fi < nFiles; fi++) {
    for (let ci = 0; ci < nCodes; ci++) {
      const x = offsetX + ci * cellW;
      const y = offsetY + fi * cellH;
      c2d.fillStyle = heatmapColor(dm.matrix[fi]![ci]!, dm.maxValue, isDark);
      c2d.fillRect(x, y, cellW, cellH);
    }
  }
}

export function renderMiniEvolution(canvas: HTMLCanvasElement, evo: EvolutionResult): void {
  const c2d = canvas.getContext("2d");
  if (!c2d || evo.codes.length === 0 || evo.points.length === 0) return;

  const W = canvas.width;
  const H = canvas.height;
  const nCodes = evo.codes.length;
  const codeIndex = new Map(evo.codes.map((c, i) => [c, i]));
  const pad = 10;
  const laneHeight = Math.min(20, (H - 2 * pad) / nCodes);
  const plotTop = (H - nCodes * laneHeight) / 2;
  const isDark = document.body.classList.contains("theme-dark");

  // Lane separators
  c2d.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  c2d.lineWidth = 0.5;
  for (let i = 1; i < nCodes; i++) {
    const y = plotTop + i * laneHeight;
    c2d.beginPath(); c2d.moveTo(pad, y); c2d.lineTo(W - pad, y); c2d.stroke();
  }

  // Draw points
  for (const p of evo.points) {
    const ci = codeIndex.get(p.code);
    if (ci == null) continue;
    const x = pad + p.position * (W - 2 * pad);
    const y = plotTop + ci * laneHeight + laneHeight / 2;
    c2d.beginPath(); c2d.arc(x, y, 3, 0, Math.PI * 2);
    c2d.fillStyle = p.color; c2d.fill();
  }
}
