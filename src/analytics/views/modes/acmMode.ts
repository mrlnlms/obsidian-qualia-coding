
import { Notice } from "obsidian";
import type { FilterConfig, UnifiedMarker } from "../../data/dataTypes";
import { calculateMCA, type MCAResult } from "../../data/mcaEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { buildCsv } from "../shared/chartHelpers";

export function renderACMOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "MCA Biplot" });

  // Show markers toggle
  const markersRow = section.createDiv({ cls: "codemarker-config-row" });
  const markersCb = markersRow.createEl("input", { type: "checkbox" });
  markersCb.checked = ctx.acmShowMarkers;
  markersRow.createSpan({ text: "Show markers" });
  markersCb.addEventListener("change", () => {
    ctx.acmShowMarkers = markersCb.checked;
    ctx.scheduleUpdate();
  });
  markersRow.addEventListener("click", (e) => {
    if (e.target !== markersCb) { markersCb.checked = !markersCb.checked; markersCb.dispatchEvent(new Event("change")); }
  });

  // Show code labels toggle
  const labelsRow = section.createDiv({ cls: "codemarker-config-row" });
  const labelsCb = labelsRow.createEl("input", { type: "checkbox" });
  labelsCb.checked = ctx.acmShowCodeLabels;
  labelsRow.createSpan({ text: "Show code labels" });
  labelsCb.addEventListener("change", () => {
    ctx.acmShowCodeLabels = labelsCb.checked;
    ctx.scheduleUpdate();
  });
  labelsRow.addEventListener("click", (e) => {
    if (e.target !== labelsCb) { labelsCb.checked = !labelsCb.checked; labelsCb.dispatchEvent(new Event("change")); }
  });
}

export function renderACMBiplot(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const enabledCodeIds = Array.from(ctx.enabledCodes);
  const enabledColors = enabledCodeIds.map((id) => {
    const def = ctx.data!.codes.find((c) => c.id === id);
    return def?.color ?? "#888888";
  });
  // Display labels (names) for chart axes
  const enabledCodeNames = enabledCodeIds.map((id) => {
    const def = ctx.data!.codes.find((c) => c.id === id);
    return def?.name ?? id;
  });

  const enabledCodesSet = ctx.enabledCodes;
  const filtered = ctx.data.markers.filter((m) =>
    filters.sources.includes(m.source) &&
    m.codes.some((c) => !filters.excludeCodes.includes(c))
  ).map(m => ({
    ...m,
    codes: m.codes.filter(c => enabledCodesSet.has(c)),
  })).filter(m => m.codes.length > 0);

  if (filtered.length < 2 || enabledCodeNames.length < 2) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "MCA requires at least 2 codes and 2 markers.",
    });
    return;
  }

  const generation = ctx.renderGeneration;
  const loadingEl = ctx.chartContainer.createDiv({ cls: "codemarker-wc-loading", text: "Computing MCA..." });
  loadAndRenderACM(ctx, filtered, enabledCodeNames, enabledColors, loadingEl, generation);
}

async function loadAndRenderACM(
  ctx: AnalyticsViewContext,
  markers: UnifiedMarker[],
  codes: string[],
  colors: string[],
  loadingEl: HTMLElement,
  generation: number,
): Promise<void> {
  if (!ctx.chartContainer) return;

  const result = await calculateMCA(markers, codes, colors);
  if (!ctx.isRenderCurrent(generation)) return;
  loadingEl.remove();

  if (!result) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "Insufficient data for MCA (need \u22652 active codes with \u22652 markers).",
    });
    return;
  }

  renderACMChart(ctx, result);
}

async function renderACMChart(ctx: AnalyticsViewContext, result: MCAResult): Promise<void> {
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

  const [pct1, pct2] = result.inertiaExplained;

  const datasets: any[] = [];

  // Code points (larger, colored, labeled)
  datasets.push({
    label: "Codes",
    data: result.codePoints.map((p) => ({ x: p.x, y: p.y })),
    backgroundColor: result.codePoints.map((p) => p.color),
    borderColor: result.codePoints.map((p) => p.color),
    borderWidth: 2,
    pointRadius: 8,
    pointHoverRadius: 10,
    pointStyle: "rectRounded",
  });

  // Marker points (smaller, semi-transparent)
  if (ctx.acmShowMarkers && result.markerPoints.length > 0) {
    const sourceColors: Record<string, string> = {
      markdown: "#42A5F5",
      "csv-segment": "#66BB6A",
      "csv-row": "#81C784",
      image: "#FFA726",
      pdf: "#EF5350",
      audio: "#AB47BC",
      video: "#7E57C2",
    };
    datasets.push({
      label: "Markers",
      data: result.markerPoints.map((p) => ({ x: p.x, y: p.y })),
      backgroundColor: result.markerPoints.map((p) => {
        const c = sourceColors[p.source] ?? "#888";
        return c + "80"; // 50% alpha
      }),
      borderColor: "transparent",
      pointRadius: 3,
      pointHoverRadius: 5,
    });
  }

  const showLabels = ctx.acmShowCodeLabels;
  const codePoints = result.codePoints;

  const tickCallback = (value: any) => {
    const n = Number(value);
    if (Math.abs(n) < 1e-10) return "0";
    return n.toFixed(2);
  };

  ctx.activeChartInstance = new Chart(canvas, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: `Dimension 1 (${pct1}%)`, color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor, callback: tickCallback },
        },
        y: {
          title: { display: true, text: `Dimension 2 (${pct2}%)`, color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor, callback: tickCallback },
        },
      },
      plugins: {
        legend: { labels: { color: textColor } },
        tooltip: {
          callbacks: {
            label: (tooltipCtx: any) => {
              const dsIdx = tooltipCtx.datasetIndex;
              const idx = tooltipCtx.dataIndex;
              if (dsIdx === 0) {
                const cp = codePoints[idx];
                return `${cp!.name} (${cp!.x.toFixed(2)}, ${cp!.y.toFixed(2)})`;
              } else {
                const mp = result.markerPoints[idx];
                return `${mp!.fileId} [${mp!.codes.slice(0, 3).join(", ")}]`;
              }
            },
          },
        },
      },
    },
    plugins: showLabels ? [{
      id: "codeLabelPlugin",
      afterDraw: (chart: any) => {
        const ctx2 = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta.data.length) return;
        ctx2.save();
        ctx2.font = "bold 11px sans-serif";
        ctx2.textBaseline = "bottom";
        ctx2.fillStyle = textColor;

        // Simple label collision avoidance
        const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
        const LH = 14; // label height

        for (let i = 0; i < meta.data.length; i++) {
          const pt = meta.data[i];
          const label = codePoints[i]!.name;
          const tw = ctx2.measureText(label).width;
          let lx = pt.x - tw / 2;
          let ly = pt.y - 12;

          // Nudge if overlapping
          for (const p of placed) {
            if (lx < p.x + p.w && lx + tw > p.x && ly < p.y + p.h && ly + LH > p.y) {
              ly = p.y - LH - 2; // move above
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

export function renderMiniACM(canvas: HTMLCanvasElement, ctx: AnalyticsViewContext, filters: FilterConfig): void {
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx || !ctx.data) return;

  const W = canvas.width;
  const H = canvas.height;
  const isDark = document.body.classList.contains("theme-dark");

  // Quick sync MCA computation for thumbnail — respect enabledCodes (set of ids)
  const enabledCodes = ctx.enabledCodes;
  const enabledDefs = ctx.data.codes.filter((c) => enabledCodes.has(c.id));
  const ids = enabledDefs.map((c) => c.id);
  const filtered = ctx.data.markers.filter((m) =>
    filters.sources.includes(m.source) &&
    m.codes.some((c) => enabledCodes.has(c))
  ).map(m => ({ ...m, codes: m.codes.filter(c => enabledCodes.has(c)) }));

  if (filtered.length < 2 || ids.length < 2) {
    canvasCtx.fillStyle = isDark ? "#b0b0b0" : "#888";
    canvasCtx.font = "11px sans-serif";
    canvasCtx.textAlign = "center";
    canvasCtx.fillText("Insufficient data", W / 2, H / 2);
    return;
  }

  // Build indicator matrix inline (simplified sync version)
  const idSet = new Set(ids);
  const valid = filtered.filter((m) => m.codes.some((c) => idSet.has(c)));
  if (valid.length < 2) return;

  // Just draw a placeholder scatter with code positions approximated
  const codeFreqs = new Map<string, number>();
  for (const m of valid) {
    for (const c of m.codes) {
      if (idSet.has(c)) codeFreqs.set(c, (codeFreqs.get(c) ?? 0) + 1);
    }
  }

  const activeIds = ids.filter((id) => (codeFreqs.get(id) ?? 0) > 0);
  if (activeIds.length < 2) return;

  // Simple circular layout as thumbnail placeholder
  const n = Math.min(activeIds.length, 12);
  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.min(W, H) * 0.35;

  // Axes
  canvasCtx.strokeStyle = isDark ? "rgba(180,180,180,0.2)" : "rgba(0,0,0,0.1)";
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath(); canvasCtx.moveTo(10, cy); canvasCtx.lineTo(W - 10, cy); canvasCtx.stroke();
  canvasCtx.beginPath(); canvasCtx.moveTo(cx, 10); canvasCtx.lineTo(cx, H - 10); canvasCtx.stroke();

  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const def = ctx.data.codes.find((c) => c.id === activeIds[i]);
    const color = def?.color ?? "#888";

    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 5, 0, Math.PI * 2);
    canvasCtx.fillStyle = color;
    canvasCtx.fill();
  }
}

export function exportACMCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const ids = Array.from(ctx.enabledCodes);
  const codes = ids.map((id) => ctx.data!.codes.find((c) => c.id === id)?.name ?? id);
  const colors = ids.map((id) => ctx.data!.codes.find((c) => c.id === id)?.color ?? "#888888");

  const enabledCodesSet = ctx.enabledCodes;
  const filtered = ctx.data.markers.filter((m) =>
    filters.sources.includes(m.source) &&
    m.codes.some((c) => !filters.excludeCodes.includes(c))
  ).map(m => ({
    ...m,
    codes: m.codes.filter(c => enabledCodesSet.has(c)),
  })).filter(m => m.codes.length > 0);

  new Notice("Computing MCA for export...");
  calculateMCA(filtered, codes, colors).then((result) => {
    if (!result) {
      new Notice("Insufficient data for MCA export.");
      return;
    }

    const rows: string[][] = [["type", "name", "dim1", "dim2", "file", "codes"]];
    for (const cp of result.codePoints) {
      rows.push(["code", cp.name, cp.x.toFixed(4), cp.y.toFixed(4), "", ""]);
    }
    for (const mp of result.markerPoints) {
      rows.push(["marker", mp.id, mp.x.toFixed(4), mp.y.toFixed(4), mp.fileId, mp.codes.join("; ")]);
    }
    const csvContent = buildCsv(rows);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `codemarker-mca-${date}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  });
}
