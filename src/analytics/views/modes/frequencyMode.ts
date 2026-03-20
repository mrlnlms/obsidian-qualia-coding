
import { setIcon, Notice } from "obsidian";
import type { FilterConfig, FrequencyResult } from "../../data/dataTypes";
import { calculateFrequency } from "../../data/statsEngine";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { generateFileColors , buildCsv } from "../shared/chartHelpers";

export function renderSortSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Sort" });

  for (const [value, label] of [
    ["alpha", "Alphabetical"],
    ["freq-desc", "Frequency \u2193"],
    ["freq-asc", "Frequency \u2191"],
  ] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "sortMode";
    radio.value = value;
    radio.checked = ctx.sortMode === value;
    row.createSpan({ text: label });

    radio.addEventListener("change", () => {
      ctx.sortMode = value;
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
      }
    });
  }
}

export function renderGroupSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Group by" });

  for (const [value, label] of [
    ["none", "None"],
    ["source", "By Source"],
    ["file", "By File"],
  ] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "groupMode";
    radio.value = value;
    radio.checked = ctx.groupMode === value;
    row.createSpan({ text: label });

    radio.addEventListener("change", () => {
      ctx.groupMode = value;
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
      }
    });
  }
}

export function renderFrequencyChart(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const results = calculateFrequency(ctx.data, filters);

  if (results.length === 0) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No data matches current filters.",
    });
    return;
  }

  // Sort
  switch (ctx.sortMode) {
    case "alpha":
      results.sort((a, b) => a.code.localeCompare(b.code));
      break;
    case "freq-desc":
      results.sort((a, b) => b.total - a.total);
      break;
    case "freq-asc":
      results.sort((a, b) => a.total - b.total);
      break;
  }

  // Lazy import Chart.js
  renderBarChart(ctx, results);
}

async function renderBarChart(ctx: AnalyticsViewContext, results: FrequencyResult[]): Promise<void> {
  if (!ctx.chartContainer) return;

  const { Chart, registerables } = await import("chart.js");
  Chart.register(...registerables);

  // Container for scrolling if many codes
  const height = Math.max(300, results.length * 35);
  const wrapper = ctx.chartContainer.createDiv();
  wrapper.style.height = `${height}px`;
  wrapper.style.position = "relative";

  const canvas = wrapper.createEl("canvas");

  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue("--text-normal").trim() || "#dcddde";
  const borderColor = styles.getPropertyValue("--background-modifier-border").trim() || "#333";

  const labels = results.map((r) => r.code);

  let datasets: any[];

  if (ctx.groupMode === "source") {
    datasets = [
      {
        label: "Markdown",
        data: results.map((r) => r.bySource.markdown),
        backgroundColor: "#42A5F5",
      },
      {
        label: "CSV Segment",
        data: results.map((r) => r.bySource["csv-segment"]),
        backgroundColor: "#66BB6A",
      },
      {
        label: "CSV Row",
        data: results.map((r) => r.bySource["csv-row"]),
        backgroundColor: "#81C784",
      },
      {
        label: "Image",
        data: results.map((r) => r.bySource.image),
        backgroundColor: "#FFA726",
      },
      {
        label: "PDF",
        data: results.map((r) => r.bySource.pdf),
        backgroundColor: "#EF5350",
      },
      {
        label: "Audio",
        data: results.map((r) => r.bySource.audio),
        backgroundColor: "#AB47BC",
      },
      {
        label: "Video",
        data: results.map((r) => r.bySource.video),
        backgroundColor: "#7E57C2",
      },
    ].filter((ds) => ds.data.some((v: number) => v > 0));
  } else if (ctx.groupMode === "file") {
    // Collect all files
    const allFiles = new Set<string>();
    for (const r of results) {
      for (const f of Object.keys(r.byFile)) allFiles.add(f);
    }
    const fileList = Array.from(allFiles).sort();
    const fileColors = generateFileColors(fileList.length);
    datasets = fileList.map((file, i) => ({
      label: file.split("/").pop() ?? file,
      data: results.map((r) => r.byFile[file] ?? 0),
      backgroundColor: fileColors[i],
    }));
  } else {
    datasets = [
      {
        label: "Count",
        data: results.map((r) => r.total),
        backgroundColor: results.map((r) => r.color),
      },
    ];
  }

  ctx.activeChartInstance = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: ctx.groupMode !== "none",
          position: "top",
          labels: { color: textColor },
        },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              if (ctx.groupMode === "none" && items.length > 0) {
                const idx = items[0]!.dataIndex;
                const r = results[idx];
                const parts: string[] = [];
                if (r!.bySource.markdown > 0) parts.push(`MD: ${r!.bySource.markdown}`);
                if (r!.bySource["csv-segment"] > 0) parts.push(`CSV-seg: ${r!.bySource["csv-segment"]}`);
                if (r!.bySource["csv-row"] > 0) parts.push(`CSV-row: ${r!.bySource["csv-row"]}`);
                if (r!.bySource.image > 0) parts.push(`Img: ${r!.bySource.image}`);
                if (r!.bySource.pdf > 0) parts.push(`PDF: ${r!.bySource.pdf}`);
                if (r!.bySource.audio > 0) parts.push(`Audio: ${r!.bySource.audio}`);
                if (r!.bySource.video > 0) parts.push(`Video: ${r!.bySource.video}`);
                return parts.join(", ");
              }
              return "";
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          stacked: ctx.groupMode !== "none",
          ticks: { stepSize: 1, color: textColor },
          grid: { color: borderColor },
        },
        y: {
          stacked: ctx.groupMode !== "none",
          grid: { display: false },
          ticks: { color: textColor, font: { size: 12 } },
        },
      },
    },
  });

  // Code list table with "Add to Board" buttons
  renderFrequencyCodeList(ctx, results);
}

export function exportFrequencyCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data) return;
  const filters = ctx.buildFilterConfig();
  const results = calculateFrequency(ctx.data, filters);

  const rows = [["code", "total", "markdown", "csv_segment", "csv_row", "image", "pdf", "audio", "video"]];
  for (const r of results) {
    rows.push([
      r.code,
      String(r.total),
      String(r.bySource.markdown),
      String(r.bySource["csv-segment"]),
      String(r.bySource["csv-row"]),
      String(r.bySource.image),
      String(r.bySource.pdf),
      String(r.bySource.audio),
      String(r.bySource.video),
    ]);
  }
  const csvContent = buildCsv(rows);
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = `codemarker-frequency-${date}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderFrequencyCodeList(ctx: AnalyticsViewContext, results: FrequencyResult[]): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const table = ctx.chartContainer.createDiv({ cls: "codemarker-freq-code-list" });
  const header = table.createDiv({ cls: "codemarker-freq-code-list-header" });
  header.createSpan({ text: "Code" });
  header.createSpan({ text: "Count" });
  header.createSpan({ text: "" }); // action column

  // Build a lookup for descriptions from consolidated data
  const codeDescMap = new Map<string, string>();
  const codeSourcesMap = new Map<string, string[]>();
  if (ctx.data) {
    for (const c of ctx.data.codes) {
      codeDescMap.set(c.name, c.description ?? "");
      codeSourcesMap.set(c.name, c.sources);
    }
  }

  for (const r of results) {
    const row = table.createDiv({ cls: "codemarker-freq-code-list-row" });

    // Drag & drop to board
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      const desc = codeDescMap.get(r.code) ?? "";
      const sources = codeSourcesMap.get(r.code) ?? [];
      const payload = JSON.stringify({ type: "codemarker-code-card", codeName: r.code, color: r.color, description: desc, markerCount: r.total, sources });
      e.dataTransfer!.setData("text/plain", payload);
      e.dataTransfer!.effectAllowed = "copy";
      row.addClass("codemarker-freq-row-dragging");
    });
    row.addEventListener("dragend", () => {
      row.removeClass("codemarker-freq-row-dragging");
    });

    const nameCell = row.createDiv({ cls: "codemarker-freq-code-list-name" });
    const swatch = nameCell.createDiv({ cls: "codemarker-freq-code-list-swatch" });
    swatch.style.backgroundColor = r.color;
    nameCell.createSpan({ text: r.code });

    row.createDiv({ cls: "codemarker-freq-code-list-count", text: String(r.total) });

    const actionCell = row.createDiv({ cls: "codemarker-freq-code-list-action" });
    const boardBtn = actionCell.createDiv({ cls: "codemarker-tr-board-btn", attr: { "aria-label": "Add to Research Board" } });
    setIcon(boardBtn, "layout-dashboard");
    boardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const desc = codeDescMap.get(r.code) ?? "";
      const sources = codeSourcesMap.get(r.code) ?? [];
      ctx.plugin.addCodeCardToBoard(r.code, r.color, desc, r.total, sources);
      new Notice(`Added "${r.code}" to Research Board`);
    });
  }
}
