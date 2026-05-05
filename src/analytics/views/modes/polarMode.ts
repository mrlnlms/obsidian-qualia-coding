import type { FilterConfig, PolarCoordResult } from "../../data/dataTypes";
import { calculatePolarCoordinates } from "../../data/statsEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { downloadCsv } from "../shared/chartHelpers";

export function renderPolarOptionsSection(ctx: AnalyticsViewContext): void {
  if (!ctx.data) return;
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Polar Coordinates" });

  // Focal code dropdown — value=id, label=name
  const focalLabel = section.createDiv({ cls: "codemarker-config-sublabel", text: "Focal Code" });
  const select = section.createEl("select", { cls: "codemarker-config-select" });
  const enabledDefs = ctx.data.codes.filter(c => ctx.enabledCodes.has(c.id)).slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!ctx.polarFocalCode || !ctx.enabledCodes.has(ctx.polarFocalCode)) ctx.polarFocalCode = enabledDefs[0]?.id ?? "";
  for (const def of enabledDefs) {
    const opt = select.createEl("option", { text: def.name, value: def.id });
    if (def.id === ctx.polarFocalCode) opt.selected = true;
  }
  select.addEventListener("change", () => {
    ctx.polarFocalCode = select.value;
    ctx.scheduleUpdate();
  });

  // Max lag slider
  section.createDiv({ cls: "codemarker-config-sublabel", text: `Max Lag: ${ctx.polarMaxLag}` });
  const slider = section.createEl("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "5";
  slider.value = String(ctx.polarMaxLag);
  slider.style.width = "100%";
  slider.addEventListener("input", () => {
    ctx.polarMaxLag = Number(slider.value);
    const label = section.querySelector(".codemarker-config-sublabel:last-of-type");
    if (label) label.textContent = `Max Lag: ${ctx.polarMaxLag}`;
  });
  slider.addEventListener("change", () => {
    ctx.polarMaxLag = Number(slider.value);
    ctx.scheduleUpdate();
  });
}

export function renderPolarCoordinates(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.data || !ctx.chartContainer) return;
  const container = ctx.chartContainer;

  // Ensure focal code is set (id-keyed)
  const enabledDefs = ctx.data.codes.filter(c => ctx.enabledCodes.has(c.id)).slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!ctx.polarFocalCode || !ctx.enabledCodes.has(ctx.polarFocalCode)) ctx.polarFocalCode = enabledDefs[0]?.id ?? "";

  const result = calculatePolarCoordinates(ctx.data, filters, ctx.polarFocalCode, ctx.polarMaxLag, { cache: ctx.plugin.smartCodeCache, registry: ctx.plugin.smartCodeRegistry }, ctx.plugin.caseVariablesRegistry);
  if (result.vectors.length === 0) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "Not enough data for polar coordinate analysis. Need at least 2 codes with transitions.",
    });
    return;
  }

  const title = container.createDiv();
  title.style.cssText = "font-size:14px;font-weight:600;margin-bottom:8px;";
  title.textContent = `Polar Coordinates — Focal: ${result.focalCode} (max lag: ${result.maxLag})`;

  const canvas = container.createEl("canvas");
  const rect = container.getBoundingClientRect();
  const size = Math.min(rect.width - 32, rect.height - 60, 600);
  canvas.width = size;
  canvas.height = size;
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";

  const canvasCtx = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  const textColor = isDark ? "#ddd" : "#333";
  const gridColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  const cx = size / 2;
  const cy = size / 2;

  // Find max extent
  let maxExtent = 3;
  for (const v of result.vectors) {
    const ext = Math.max(Math.abs(v.zProspective), Math.abs(v.zRetrospective));
    if (ext > maxExtent) maxExtent = ext;
  }
  maxExtent = Math.ceil(maxExtent) + 0.5;
  const margin = 50;
  const plotR = (size / 2) - margin;
  const scale = plotR / maxExtent;

  // Background
  canvasCtx.fillStyle = isDark ? "#1e1e1e" : "#fafafa";
  canvasCtx.fillRect(0, 0, size, size);

  // Grid circles
  canvasCtx.strokeStyle = gridColor;
  canvasCtx.lineWidth = 0.5;
  for (let r = 1; r <= Math.ceil(maxExtent); r++) {
    canvasCtx.beginPath();
    canvasCtx.arc(cx, cy, r * scale, 0, Math.PI * 2);
    canvasCtx.stroke();
  }

  // Axes
  canvasCtx.strokeStyle = gridColor;
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(margin, cy);
  canvasCtx.lineTo(size - margin, cy);
  canvasCtx.moveTo(cx, margin);
  canvasCtx.lineTo(cx, size - margin);
  canvasCtx.stroke();

  // Significance circle (r = 1.96)
  canvasCtx.strokeStyle = isDark ? "rgba(255,100,100,0.4)" : "rgba(200,0,0,0.3)";
  canvasCtx.lineWidth = 1.5;
  canvasCtx.setLineDash([6, 4]);
  canvasCtx.beginPath();
  canvasCtx.arc(cx, cy, 1.96 * scale, 0, Math.PI * 2);
  canvasCtx.stroke();
  canvasCtx.setLineDash([]);

  // Quadrant labels
  canvasCtx.font = "11px sans-serif";
  canvasCtx.fillStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)";
  canvasCtx.textAlign = "center";
  canvasCtx.fillText("Q I: Mutual Activation", cx + plotR / 2, margin + 14);
  canvasCtx.fillText("Q II: Retro. Activation", cx - plotR / 2, margin + 14);
  canvasCtx.fillText("Q III: Mutual Inhibition", cx - plotR / 2, size - margin - 6);
  canvasCtx.fillText("Q IV: Prosp. Activation", cx + plotR / 2, size - margin - 6);

  // Axis labels
  canvasCtx.fillStyle = textColor;
  canvasCtx.font = "12px sans-serif";
  canvasCtx.textAlign = "center";
  canvasCtx.fillText("z Prospective →", size - margin - 40, cy + 16);
  canvasCtx.save();
  canvasCtx.translate(margin - 12, cy);
  canvasCtx.rotate(-Math.PI / 2);
  canvasCtx.fillText("z Retrospective →", 0, 0);
  canvasCtx.restore();

  // Plot vectors
  for (const v of result.vectors) {
    const px = cx + v.zProspective * scale;
    const py = cy - v.zRetrospective * scale; // Y inverted

    // Line from center
    canvasCtx.strokeStyle = v.significant ? v.color : (isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)");
    canvasCtx.lineWidth = v.significant ? 1.5 : 0.8;
    canvasCtx.beginPath();
    canvasCtx.moveTo(cx, cy);
    canvasCtx.lineTo(px, py);
    canvasCtx.stroke();

    // Dot
    canvasCtx.beginPath();
    canvasCtx.arc(px, py, v.significant ? 5 : 3, 0, Math.PI * 2);
    canvasCtx.fillStyle = v.color;
    canvasCtx.globalAlpha = v.significant ? 1 : 0.4;
    canvasCtx.fill();
    if (v.significant) {
      canvasCtx.strokeStyle = isDark ? "#fff" : "#000";
      canvasCtx.lineWidth = 1;
      canvasCtx.stroke();
    }
    canvasCtx.globalAlpha = 1;

    // Label (significant only)
    if (v.significant) {
      canvasCtx.font = "10px sans-serif";
      canvasCtx.fillStyle = textColor;
      canvasCtx.textAlign = "left";
      canvasCtx.fillText(v.code, px + 7, py + 3);
    }
  }

  // Tooltip
  const tooltip = container.createDiv({ cls: "codemarker-heatmap-tooltip" });
  tooltip.style.display = "none";
  canvas.addEventListener("mousemove", (e) => {
    const br = canvas.getBoundingClientRect();
    const mx = e.clientX - br.left;
    const my = e.clientY - br.top;
    let found = false;
    for (const v of result.vectors) {
      const px = cx + v.zProspective * scale;
      const py = cy - v.zRetrospective * scale;
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (dist < 8) {
        tooltip.style.display = "block";
        tooltip.style.left = `${e.clientX - container.getBoundingClientRect().left + 12}px`;
        tooltip.style.top = `${e.clientY - container.getBoundingClientRect().top + 12}px`;
        tooltip.textContent = `${result.focalCode} → ${v.code}: z_p=${v.zProspective}, z_r=${v.zRetrospective}, r=${v.radius}, θ=${v.angle}° (Q${v.quadrant}) ${v.significant ? "★" : "n.s."}`;
        found = true;
        break;
      }
    }
    if (!found) tooltip.style.display = "none";
  });
  canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
}

export function renderMiniPolar(ctx: AnalyticsViewContext, canvas: HTMLCanvasElement, filters: FilterConfig): void {
  if (!ctx.data) return;
  const enabledDefs = ctx.data.codes.filter(c => ctx.enabledCodes.has(c.id)).slice().sort((a, b) => a.name.localeCompare(b.name));
  const focalId = enabledDefs[0]?.id ?? "";
  if (!focalId) return;
  const result = calculatePolarCoordinates(ctx.data, filters, focalId, 5, { cache: ctx.plugin.smartCodeCache, registry: ctx.plugin.smartCodeRegistry }, ctx.plugin.caseVariablesRegistry);

  const W = canvas.width;
  const H = canvas.height;
  const canvasCtx = canvas.getContext("2d")!;
  const isDark = document.body.classList.contains("theme-dark");
  canvasCtx.fillStyle = isDark ? "#1e1e1e" : "#fafafa";
  canvasCtx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  let maxExtent = 3;
  for (const v of result.vectors) {
    const ext = Math.max(Math.abs(v.zProspective), Math.abs(v.zRetrospective));
    if (ext > maxExtent) maxExtent = ext;
  }
  maxExtent = Math.ceil(maxExtent) + 0.5;
  const plotR = Math.min(W, H) / 2 - 20;
  const scale = plotR / maxExtent;

  // Axes
  canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
  canvasCtx.lineWidth = 0.5;
  canvasCtx.beginPath();
  canvasCtx.moveTo(20, cy); canvasCtx.lineTo(W - 20, cy);
  canvasCtx.moveTo(cx, 20); canvasCtx.lineTo(cx, H - 20);
  canvasCtx.stroke();

  // Significance circle
  canvasCtx.strokeStyle = isDark ? "rgba(255,100,100,0.3)" : "rgba(200,0,0,0.2)";
  canvasCtx.setLineDash([4, 3]);
  canvasCtx.beginPath();
  canvasCtx.arc(cx, cy, 1.96 * scale, 0, Math.PI * 2);
  canvasCtx.stroke();
  canvasCtx.setLineDash([]);

  // Vectors
  for (const v of result.vectors) {
    const px = cx + v.zProspective * scale;
    const py = cy - v.zRetrospective * scale;
    canvasCtx.beginPath();
    canvasCtx.arc(px, py, v.significant ? 3 : 2, 0, Math.PI * 2);
    canvasCtx.fillStyle = v.color;
    canvasCtx.globalAlpha = v.significant ? 0.9 : 0.3;
    canvasCtx.fill();
    canvasCtx.globalAlpha = 1;
  }
}

export function buildPolarRows(ctx: AnalyticsViewContext): string[][] | null {
  if (!ctx.data) return null;
  const filters = ctx.buildFilterConfig();
  const enabledDefs = ctx.data.codes.filter(c => ctx.enabledCodes.has(c.id)).slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!ctx.polarFocalCode || !ctx.enabledCodes.has(ctx.polarFocalCode)) ctx.polarFocalCode = enabledDefs[0]?.id ?? "";
  const result = calculatePolarCoordinates(ctx.data, filters, ctx.polarFocalCode, ctx.polarMaxLag, { cache: ctx.plugin.smartCodeCache, registry: ctx.plugin.smartCodeRegistry }, ctx.plugin.caseVariablesRegistry);

  const rows: string[][] = [["focal", "conditioned", "z_prospective", "z_retrospective", "radius", "angle", "quadrant", "significant"]];
  for (const v of result.vectors) {
    rows.push([result.focalCode, v.code, String(v.zProspective), String(v.zRetrospective), String(v.radius), String(v.angle), String(v.quadrant), v.significant ? "yes" : "no"]);
  }
  return rows;
}

export function exportPolarCSV(ctx: AnalyticsViewContext, date: string): void {
  const rows = buildPolarRows(ctx);
  if (!rows) return;
  downloadCsv(rows, `codemarker-polar-coords-${date}.csv`);
}
