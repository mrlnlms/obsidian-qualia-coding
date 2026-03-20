
import { Notice } from "obsidian";
import type { FilterConfig, UnifiedMarker, FrequencyResult } from "../../data/dataTypes";
import { calculateMDS, type MDSResult } from "../../data/mdsEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { buildCsv } from "../shared/chartHelpers";

export function renderMDSOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "MDS Map" });

  // Project mode: Codes / Files
  for (const [value, label] of [
    ["codes", "Codes"],
    ["files", "Files"],
  ] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "mdsMode";
    radio.value = value;
    radio.checked = ctx.mdsMode === value;
    row.createSpan({ text: label });
    radio.addEventListener("change", () => {
      ctx.mdsMode = value;
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); }
    });
  }

  // Show labels toggle
  const labelsRow = section.createDiv({ cls: "codemarker-config-row" });
  const labelsCb = labelsRow.createEl("input", { type: "checkbox" });
  labelsCb.checked = ctx.mdsShowLabels;
  labelsRow.createSpan({ text: "Show labels" });
  labelsCb.addEventListener("change", () => {
    ctx.mdsShowLabels = labelsCb.checked;
    ctx.scheduleUpdate();
  });
  labelsRow.addEventListener("click", (e) => {
    if (e.target !== labelsCb) { labelsCb.checked = !labelsCb.checked; labelsCb.dispatchEvent(new Event("change")); }
  });
}

export function renderMDSMap(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const filtered = ctx.data.markers.filter((m) =>
    filters.sources.includes(m.source) &&
    m.codes.some((c) => !filters.excludeCodes.includes(c))
  );

  if (filtered.length < 3) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "MDS requires at least 3 entities with data.",
    });
    return;
  }

  // Filter marker codes to only include enabled codes
  const enabledCodes = ctx.enabledCodes;
  const filteredWithCodes = filtered.map(m => ({
    ...m,
    codes: m.codes.filter(c => enabledCodes.has(c)),
  })).filter(m => m.codes.length > 0);

  if (filteredWithCodes.length < 3) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "MDS requires at least 3 entities with data.",
    });
    return;
  }

  const loadingEl = ctx.chartContainer.createDiv({ cls: "codemarker-wc-loading", text: "Computing MDS..." });
  const gen = ctx.renderGeneration;
  loadAndRenderMDS(ctx, filteredWithCodes, loadingEl, gen);
}

async function loadAndRenderMDS(
  ctx: AnalyticsViewContext,
  markers: UnifiedMarker[],
  loadingEl: HTMLElement,
  generation: number,
): Promise<void> {
  if (!ctx.chartContainer || !ctx.data) return;

  const result = await calculateMDS(
    markers,
    ctx.data.codes,
    ctx.mdsMode,
    Array.from(ctx.enabledSources),
  );
  if (!ctx.isRenderCurrent(generation)) return;
  loadingEl.remove();

  if (!result) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: `Insufficient data for MDS (need \u22653 ${ctx.mdsMode === "codes" ? "codes with markers" : "files with codes"}).`,
    });
    return;
  }

  renderMDSChart(ctx, result);
}

async function renderMDSChart(ctx: AnalyticsViewContext, result: MDSResult): Promise<void> {
  if (!ctx.chartContainer) return;

  const { Chart, registerables } = await import("chart.js");
  Chart.register(...registerables);

  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.height = "600px";
  wrapper.style.position = "relative";
  const canvas = wrapper.createEl("canvas");

  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || "#dcddde";
  const gridColor = styles.getPropertyValue("--background-modifier-border").trim() || "#333";

  const [var1, var2] = result.varianceExplained;
  const maxSize = Math.max(...result.points.map((p) => p.size), 1);

  const tickCallback = (value: any) => {
    const n = Number(value);
    if (Math.abs(n) < 1e-10) return "0";
    return n.toFixed(2);
  };

  const showLabels = ctx.mdsShowLabels;
  const pts = result.points;

  ctx.activeChartInstance = new Chart(canvas, {
    type: "scatter",
    data: {
      datasets: [{
        label: result.mode === "codes" ? "Codes" : "Files",
        data: pts.map((p) => ({ x: p.x, y: p.y })),
        backgroundColor: pts.map((p) => p.color + "CC"),
        borderColor: pts.map((p) => p.color),
        borderWidth: 1.5,
        pointRadius: pts.map((p) => 4 + (p.size / maxSize) * 12),
        pointHoverRadius: pts.map((p) => 6 + (p.size / maxSize) * 14),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: `Dim 1 (${var1}%)`, color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor, callback: tickCallback },
        },
        y: {
          title: { display: true, text: `Dim 2 (${var2}%)`, color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor, callback: tickCallback },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (tooltipCtx: any) => {
              const p = pts[tooltipCtx.dataIndex];
              const sizeLabel = result.mode === "codes" ? "markers" : "markers";
              return `${p!.name} (${p!.size} ${sizeLabel})`;
            },
          },
        },
        title: {
          display: true,
          text: `MDS — ${result.mode === "codes" ? "Code" : "File"} Proximity (Stress: ${result.stress})`,
          color: textColor,
          font: { size: 13 },
        },
      },
    },
    plugins: showLabels ? [{
      id: "mdsLabelPlugin",
      afterDraw: (chart: any) => {
        const ctx2 = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta.data.length) return;
        ctx2.save();
        ctx2.font = "bold 11px sans-serif";
        ctx2.textBaseline = "bottom";
        ctx2.fillStyle = textColor;

        const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
        const LH = 14;

        for (let i = 0; i < meta.data.length; i++) {
          const pt = meta.data[i];
          const label = pts[i]!.name.length > 20 ? pts[i]!.name.slice(0, 19) + "\u2026" : pts[i]!.name;
          const tw = ctx2.measureText(label).width;
          let lx = pt.x - tw / 2;
          let ly = pt.y - 14;

          for (const p of placed) {
            if (lx < p.x + p.w && lx + tw > p.x && ly < p.y + p.h && ly + LH > p.y) {
              ly = p.y - LH - 2;
            }
          }

          ctx2.fillText(label, lx, ly + LH);
          placed.push({ x: lx, y: ly, w: tw, h: LH });
        }
        ctx2.restore();
      },
    }] : [],
  });
}

export function renderMiniMDS(canvas: HTMLCanvasElement, freq: FrequencyResult[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || freq.length < 3) return;

  const W = canvas.width;
  const H = canvas.height;
  const isDark = document.body.classList.contains("theme-dark");

  const n = Math.min(freq.length, 10);
  const cx = W / 2;
  const cy = H / 2;
  const maxFreq = freq[0]?.total ?? 1;

  // Draw axes
  ctx.strokeStyle = isDark ? "rgba(180,180,180,0.2)" : "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, cy); ctx.lineTo(W - 10, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 10); ctx.lineTo(cx, H - 10); ctx.stroke();

  // Approximate positions using force layout (quick 30 iterations)
  const nodes = freq.slice(0, n).map((r, i) => {
    const angle = (2 * Math.PI * i) / n;
    const spread = Math.min(W, H) * 0.3;
    return {
      x: cx + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread,
      vx: 0, vy: 0,
      radius: 3 + (r.total / maxFreq) * 8,
      color: r.color,
    };
  });

  for (let iter = 0; iter < 30; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[i]!.x - nodes[j]!.x;
        const dy = nodes[i]!.y - nodes[j]!.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 2000 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i]!.vx += fx; nodes[i]!.vy += fy;
        nodes[j]!.vx -= fx; nodes[j]!.vy -= fy;
      }
    }
    for (const node of nodes) {
      node.vx += (cx - node.x) * 0.02;
      node.vy += (cy - node.y) * 0.02;
      node.vx *= 0.8; node.vy *= 0.8;
      node.x += node.vx; node.y += node.vy;
      node.x = Math.max(node.radius + 2, Math.min(W - node.radius - 2, node.x));
      node.y = Math.max(node.radius + 2, Math.min(H - node.radius - 2, node.y));
    }
  }

  for (const node of nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.fill();
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function exportMDSCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filtered = ctx.data.markers.filter((m) =>
    ctx.enabledSources.has(m.source) &&
    m.codes.some((c) => ctx.enabledCodes.has(c))
  );

  new Notice("Computing MDS for export...");
  calculateMDS(
    filtered,
    ctx.data.codes,
    ctx.mdsMode,
    Array.from(ctx.enabledSources),
  ).then((result) => {
    if (!result) {
      new Notice("Insufficient data for MDS export.");
      return;
    }

    const rows: string[][] = [["name", "dim1", "dim2", "size", "mode"]];
    for (const p of result.points) {
      rows.push([p.name, p.x.toFixed(4), p.y.toFixed(4), String(p.size), result.mode]);
    }
    const csvContent = buildCsv(rows);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-mds-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  });
}
