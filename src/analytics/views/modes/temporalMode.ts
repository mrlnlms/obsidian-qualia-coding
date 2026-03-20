import { Notice } from "obsidian";
import type { FilterConfig, TemporalResult } from "../../data/dataTypes";
import { calculateTemporal } from "../../data/statsEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { buildCsv } from "../shared/chartHelpers";

export async function renderTemporalChart(ctx: AnalyticsViewContext, filters: FilterConfig): Promise<void> {
  if (!ctx.chartContainer || !ctx.data) return;
  const generation = ctx.renderGeneration;

  const result = calculateTemporal(ctx.data, filters);

  if (result.series.length === 0) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No temporal data available. Markers need a createdAt timestamp.",
    });
    return;
  }

  const { Chart, registerables } = await import("chart.js");
  Chart.register(...registerables);
  await import("chartjs-adapter-date-fns");
  if (!ctx.isRenderCurrent(generation)) return;

  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.height = "500px";
  wrapper.style.position = "relative";
  const canvas = wrapper.createEl("canvas");

  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || "#dcddde";
  const gridColor = styles.getPropertyValue("--background-modifier-border").trim() || "#333";

  const datasets = result.series.map((s) => ({
    label: s.code,
    data: s.points.map((p) => ({ x: p.date, y: p.count })),
    borderColor: s.color,
    backgroundColor: s.color + "33",
    borderWidth: 2,
    pointRadius: 2,
    pointHoverRadius: 5,
    fill: false,
    tension: 0.2,
  }));

  new Chart(canvas, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "time",
          time: {
            unit: "day",
            displayFormats: { day: "MMM d", week: "MMM d", month: "MMM yyyy" },
            tooltipFormat: "PPp",
          },
          title: { display: true, text: "Date", color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor, maxRotation: 45 },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Cumulative Count", color: textColor },
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            stepSize: 1,
            callback: (value: any) => Number.isInteger(value) ? value : "",
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: { color: textColor, boxWidth: 12, padding: 10, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (tooltipCtx: any) => {
              const date = new Date(tooltipCtx.parsed.x);
              return `${tooltipCtx.dataset.label}: ${tooltipCtx.parsed.y} (${date.toLocaleDateString()})`;
            },
          },
        },
        title: {
          display: true,
          text: "Coding Evolution Over Time",
          color: textColor,
          font: { size: 13 },
        },
      },
    },
  });
}

export function renderMiniTemporal(canvas: HTMLCanvasElement, temporal: TemporalResult): void {
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx || temporal.series.length === 0) return;

  const W = canvas.width;
  const H = canvas.height;
  const pad = 12;
  const isDark = document.body.classList.contains("theme-dark");

  const [minDate, maxDate] = temporal.dateRange;
  const dateRange = maxDate - minDate || 1;
  let maxCount = 0;
  for (const s of temporal.series) {
    for (const p of s.points) {
      if (p.count > maxCount) maxCount = p.count;
    }
  }
  if (maxCount === 0) maxCount = 1;

  // Grid
  canvasCtx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  canvasCtx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad + ((H - 2 * pad) * i) / 4;
    canvasCtx.beginPath(); canvasCtx.moveTo(pad, y); canvasCtx.lineTo(W - pad, y); canvasCtx.stroke();
  }

  // Lines
  for (const s of temporal.series) {
    if (s.points.length < 2) continue;
    canvasCtx.strokeStyle = s.color;
    canvasCtx.lineWidth = 1.5;
    canvasCtx.beginPath();
    for (let i = 0; i < s.points.length; i++) {
      const x = pad + ((s.points[i]!.date - minDate) / dateRange) * (W - 2 * pad);
      const y = H - pad - (s.points[i]!.count / maxCount) * (H - 2 * pad);
      if (i === 0) canvasCtx.moveTo(x, y); else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
  }
}

export function exportTemporalCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const result = calculateTemporal(ctx.data, filters);
  if (result.series.length === 0) {
    new Notice("No temporal data to export.");
    return;
  }

  const rows: string[][] = [["code", "date", "cumulative_count"]];
  for (const s of result.series) {
    for (const p of s.points) {
      rows.push([s.code, new Date(p.date).toISOString(), String(p.count)]);
    }
  }
  const csvContent = buildCsv(rows);
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = `codemarker-temporal-${date}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
