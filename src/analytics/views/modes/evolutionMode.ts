
import type { FilterConfig, EvolutionResult } from "../../data/dataTypes";
import { calculateEvolution } from "../../data/statsEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";

export function renderEvolutionFileSection(ctx: AnalyticsViewContext): void {
  if (!ctx.data) return;
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "File" });

  const filters = ctx.buildFilterConfig();
  const evoResult = calculateEvolution(ctx.data, filters);

  const select = section.createEl("select", { cls: "codemarker-config-select" });
  const allOpt = select.createEl("option", { text: "All files", value: "" });
  if (ctx.evolutionFile === "") allOpt.selected = true;

  for (const f of evoResult.files) {
    const basename = f.split("/").pop() ?? f;
    const opt = select.createEl("option", { text: basename, value: f });
    if (ctx.evolutionFile === f) opt.selected = true;
  }

  select.addEventListener("change", () => {
    ctx.evolutionFile = select.value;
    ctx.scheduleUpdate();
  });
}

export function renderEvolutionChart(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const result = calculateEvolution(ctx.data, filters);

  // Filter by selected file
  const points = ctx.evolutionFile
    ? result.points.filter((p) => p.file === ctx.evolutionFile)
    : result.points;

  if (points.length === 0) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No positional data available for current filters.",
    });
    return;
  }

  const codes = result.codes;
  const nCodes = codes.length;
  const codeIndex = new Map(codes.map((c, i) => [c, i]));

  // Canvas setup
  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.position = "relative";
  wrapper.style.overflow = "auto";

  const laneHeight = 40;
  const paddingLeft = 140;
  const paddingRight = 30;
  const paddingTop = 40;
  const paddingBottom = 40;
  const chartWidth = Math.max(600, (ctx.chartContainer.getBoundingClientRect().width || 700) - 32);
  const chartHeight = paddingTop + nCodes * laneHeight + paddingBottom;

  const canvas = wrapper.createEl("canvas");
  canvas.width = chartWidth;
  canvas.height = chartHeight;
  canvas.style.width = `${chartWidth}px`;
  canvas.style.height = `${chartHeight}px`;

  const canvasCtx = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const laneLineColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

  const plotLeft = paddingLeft;
  const plotRight = chartWidth - paddingRight;
  const plotWidth = plotRight - plotLeft;

  // Draw vertical grid lines at 0%, 25%, 50%, 75%, 100%
  canvasCtx.strokeStyle = gridColor;
  canvasCtx.lineWidth = 1;
  canvasCtx.font = "10px sans-serif";
  canvasCtx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  canvasCtx.textAlign = "center";
  canvasCtx.textBaseline = "top";
  for (let pct = 0; pct <= 100; pct += 25) {
    const x = plotLeft + (pct / 100) * plotWidth;
    canvasCtx.beginPath();
    canvasCtx.moveTo(x, paddingTop);
    canvasCtx.lineTo(x, paddingTop + nCodes * laneHeight);
    canvasCtx.stroke();
    canvasCtx.fillText(`${pct}%`, x, paddingTop + nCodes * laneHeight + 6);
  }

  // Draw lane separators and code labels
  canvasCtx.textAlign = "right";
  canvasCtx.textBaseline = "middle";
  for (let i = 0; i < nCodes; i++) {
    const y = paddingTop + i * laneHeight;

    // Lane separator
    if (i > 0) {
      canvasCtx.strokeStyle = laneLineColor;
      canvasCtx.lineWidth = 0.5;
      canvasCtx.beginPath();
      canvasCtx.moveTo(plotLeft, y);
      canvasCtx.lineTo(plotRight, y);
      canvasCtx.stroke();
    }

    // Code label
    const label = codes[i]!.length > 18 ? codes[i]!.slice(0, 17) + "\u2026" : codes[i]!;
    canvasCtx.fillStyle = result.colors[i]!;
    canvasCtx.font = "12px sans-serif";
    canvasCtx.fillText(label!, paddingLeft - 8, y + laneHeight / 2);
  }

  // Draw points
  const drawnPoints: Array<{ x: number; y: number; point: typeof points[0] }> = [];
  for (const p of points) {
    const ci = codeIndex.get(p.code);
    if (ci == null) continue;
    const x = plotLeft + p.position * plotWidth;
    const y = paddingTop + ci * laneHeight + laneHeight / 2;
    const radius = 6;

    canvasCtx.beginPath();
    canvasCtx.arc(x, y, radius, 0, Math.PI * 2);
    canvasCtx.fillStyle = p.color;
    canvasCtx.fill();
    canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
    canvasCtx.lineWidth = 1;
    canvasCtx.stroke();

    drawnPoints.push({ x, y, point: p });
  }

  // Tooltip
  const tooltip = wrapper.createDiv({ cls: "codemarker-heatmap-tooltip" });
  tooltip.style.display = "none";

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const dp of drawnPoints) {
      const dx = mx - dp.x;
      const dy = my - dp.y;
      if (dx * dx + dy * dy <= 64) { // 8px radius hit area
        const p = dp.point;
        const basename = p.file.split("/").pop() ?? p.file;
        const lineInfo = p.fromLine === p.toLine
          ? `line ${p.fromLine}`
          : `lines ${p.fromLine}-${p.toLine}`;
        tooltip.textContent = `${p.code} @ ${lineInfo} in ${basename}`;
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

export function renderMiniEvolution(canvas: HTMLCanvasElement, evo: EvolutionResult): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || evo.codes.length === 0 || evo.points.length === 0) return;

  const W = canvas.width;
  const H = canvas.height;
  const nCodes = evo.codes.length;
  const codeIndex = new Map(evo.codes.map((c, i) => [c, i]));
  const pad = 10;
  const laneHeight = Math.min(20, (H - 2 * pad) / nCodes);
  const plotTop = (H - nCodes * laneHeight) / 2;
  const isDark = document.body.classList.contains("theme-dark");

  // Lane separators
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  ctx.lineWidth = 0.5;
  for (let i = 1; i < nCodes; i++) {
    const y = plotTop + i * laneHeight;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
  }

  // Draw points
  for (const p of evo.points) {
    const ci = codeIndex.get(p.code);
    if (ci == null) continue;
    const x = pad + p.position * (W - 2 * pad);
    const y = plotTop + ci * laneHeight + laneHeight / 2;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
  }
}
