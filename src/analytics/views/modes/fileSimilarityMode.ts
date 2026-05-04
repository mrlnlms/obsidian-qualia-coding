import { Notice } from "obsidian";
import type { FilterConfig } from "../../data/dataTypes";
import {
  buildFileQModeData,
  buildSimilarityRows,
  preFilterMarkersForQMode,
  type FileQModeData,
  type FileSimilarityRow,
} from "../../data/qModeData";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { downloadCsv } from "../shared/chartHelpers";

const N_FILES_WARN_THRESHOLD = 200;

function loadQData(ctx: AnalyticsViewContext): FileQModeData | null {
  if (!ctx.data) return null;
  const filtered = preFilterMarkersForQMode(ctx.data.markers, ctx.enabledSources, ctx.enabledCodes);
  const qData = buildFileQModeData(filtered);
  return qData;
}

export function renderFileSimilarityOptionsSection(ctx: AnalyticsViewContext): void {
  if (!ctx.configPanelEl) return;
  const qData = loadQData(ctx);
  if (!qData || qData.fileIds.length < 2) return;

  const section = ctx.configPanelEl.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Reference file" });

  const select = section.createEl("select", { cls: "codemarker-config-select" });
  // Auto-select first file if none chosen yet, or if previous ref disappeared from filtered set.
  if (!ctx.fileSimilarityRefFileId || !qData.fileIds.includes(ctx.fileSimilarityRefFileId)) {
    ctx.fileSimilarityRefFileId = qData.fileIds[0]!;
  }
  for (let i = 0; i < qData.fileIds.length; i++) {
    const opt = select.createEl("option", {
      text: qData.fileNames[i]!,
      value: qData.fileIds[i]!,
    });
    if (qData.fileIds[i] === ctx.fileSimilarityRefFileId) opt.selected = true;
  }
  select.addEventListener("change", () => {
    ctx.fileSimilarityRefFileId = select.value;
    ctx.scheduleUpdate();
  });
}

export function renderFileSimilarityView(ctx: AnalyticsViewContext, _filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const qData = loadQData(ctx);
  if (!qData || qData.fileIds.length < 2) {
    ctx.chartContainer.createDiv({
      cls: "codemarker-analytics-empty",
      text: "File Similarity needs at least 2 files with codes.",
    });
    return;
  }

  if (qData.fileIds.length > N_FILES_WARN_THRESHOLD && !ctx.qModeBypassCap) {
    const warn = ctx.chartContainer.createDiv({ cls: "codemarker-analytics-empty" });
    warn.createDiv({
      text: `Q-mode similarity with ${qData.fileIds.length} documents may take a few seconds.`,
    });
    warn.createEl("br");
    const btn = warn.createEl("button", { text: "Compute anyway" });
    btn.style.marginTop = "12px";
    btn.addEventListener("click", () => {
      ctx.qModeBypassCap = true;
      ctx.scheduleUpdate();
    });
    return;
  }

  // Resolve ref index (must exist in current filtered set)
  let refIdx = qData.fileIds.indexOf(ctx.fileSimilarityRefFileId ?? "");
  if (refIdx < 0) {
    refIdx = 0;
    ctx.fileSimilarityRefFileId = qData.fileIds[0]!;
  }

  const rows = buildSimilarityRows(qData, refIdx);
  renderSimilarityTable(ctx, qData, refIdx, rows);
}

function renderSimilarityTable(
  ctx: AnalyticsViewContext,
  qData: FileQModeData,
  refIdx: number,
  rows: FileSimilarityRow[],
): void {
  if (!ctx.chartContainer) return;

  const wrapper = ctx.chartContainer.createDiv({ cls: "codemarker-file-similarity" });

  // Header card — reference info
  const refSet = qData.fileSets[refIdx]!;
  const refMarkers = qData.markerCounts[refIdx]!;
  const refName = qData.fileNames[refIdx]!;

  const card = wrapper.createDiv({ cls: "codemarker-file-similarity-header" });
  card.style.padding = "12px";
  card.style.border = "1px solid var(--background-modifier-border)";
  card.style.borderRadius = "6px";
  card.style.marginBottom = "12px";

  const refLine = card.createDiv();
  refLine.style.fontSize = "13px";
  refLine.style.fontWeight = "600";
  refLine.style.marginBottom = "4px";
  const swatch = refLine.createSpan();
  swatch.style.display = "inline-block";
  swatch.style.width = "10px";
  swatch.style.height = "10px";
  swatch.style.background = qData.fileColors[refIdx]!;
  swatch.style.marginRight = "8px";
  swatch.style.verticalAlign = "middle";
  refLine.createSpan({ text: `Reference: ${refName}` });

  const refMeta = card.createDiv();
  refMeta.style.fontSize = "12px";
  refMeta.style.opacity = "0.7";
  refMeta.textContent = `${refSet.size} unique codes · ${refMarkers} markers · ${rows.length} comparable files`;

  if (rows.length > 0) {
    const sumSim = rows.reduce((s, r) => s + r.similarity, 0);
    const avg = sumSim / rows.length;
    const meta2 = card.createDiv();
    meta2.style.fontSize = "12px";
    meta2.style.opacity = "0.7";
    meta2.textContent = `Average similarity to others: ${avg.toFixed(3)}`;
  }

  const hint = card.createDiv();
  hint.style.fontSize = "11px";
  hint.style.opacity = "0.6";
  hint.style.marginTop = "6px";
  hint.textContent = "Click a row to set that file as the new reference.";

  // Table
  const table = wrapper.createEl("table", { cls: "codemarker-file-similarity-table" });
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "12px";

  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  for (const label of ["File", "Similarity", "Shared", "Only Ref", "Only Other", "Markers"]) {
    const th = headerRow.createEl("th", { text: label });
    th.style.textAlign = label === "File" ? "left" : "right";
    th.style.padding = "6px 10px";
    th.style.borderBottom = "1px solid var(--background-modifier-border)";
    th.style.fontWeight = "600";
  }

  const tbody = table.createEl("tbody");
  if (rows.length === 0) {
    const emptyRow = tbody.createEl("tr");
    const td = emptyRow.createEl("td", { text: "No other files to compare." });
    td.colSpan = 6;
    td.style.padding = "16px";
    td.style.textAlign = "center";
    td.style.opacity = "0.6";
    return;
  }

  // Heat color helper for similarity column
  function simToColor(sim: number): string {
    // 0 = neutral, 1 = strong accent — use Obsidian accent var with alpha
    const alpha = Math.max(0.05, Math.min(0.55, sim * 0.6));
    return `rgba(98, 0, 238, ${alpha.toFixed(3)})`;
  }

  for (const row of rows) {
    const tr = tbody.createEl("tr");
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      ctx.fileSimilarityRefFileId = row.fileId;
      ctx.renderConfigPanel();
      ctx.scheduleUpdate();
    });
    tr.addEventListener("mouseenter", () => {
      tr.style.background = "var(--background-modifier-hover)";
    });
    tr.addEventListener("mouseleave", () => {
      tr.style.background = "";
    });

    // File column with swatch
    const tdFile = tr.createEl("td");
    tdFile.style.padding = "6px 10px";
    tdFile.style.borderBottom = "1px solid var(--background-modifier-border-hover)";
    const fSwatch = tdFile.createSpan();
    fSwatch.style.display = "inline-block";
    fSwatch.style.width = "8px";
    fSwatch.style.height = "8px";
    fSwatch.style.background = row.fileColor;
    fSwatch.style.marginRight = "8px";
    fSwatch.style.verticalAlign = "middle";
    tdFile.createSpan({ text: row.fileName });

    // Similarity column with heat fill
    const tdSim = tr.createEl("td", { text: row.similarity.toFixed(3) });
    tdSim.style.textAlign = "right";
    tdSim.style.padding = "6px 10px";
    tdSim.style.borderBottom = "1px solid var(--background-modifier-border-hover)";
    tdSim.style.background = simToColor(row.similarity);
    tdSim.style.fontVariantNumeric = "tabular-nums";
    tdSim.style.fontWeight = "600";

    for (const value of [row.sharedCount, row.onlyRefCount, row.onlyOtherCount, row.markerCounts]) {
      const td = tr.createEl("td", { text: String(value) });
      td.style.textAlign = "right";
      td.style.padding = "6px 10px";
      td.style.borderBottom = "1px solid var(--background-modifier-border-hover)";
      td.style.fontVariantNumeric = "tabular-nums";
    }
  }
}

export function buildFileSimilarityRows(ctx: AnalyticsViewContext): string[][] | null {
  const qData = loadQData(ctx);
  if (!qData || qData.fileIds.length < 2) return null;

  const refIdx = qData.fileIds.indexOf(ctx.fileSimilarityRefFileId ?? "");
  if (refIdx < 0) return null;

  const rows = buildSimilarityRows(qData, refIdx);
  const refName = qData.fileNames[refIdx]!;

  const csv: string[][] = [
    ["reference", "file", "similarity", "shared_codes", "only_reference", "only_other", "markers"],
  ];
  for (const r of rows) {
    csv.push([
      refName,
      r.fileName,
      r.similarity.toFixed(4),
      String(r.sharedCount),
      String(r.onlyRefCount),
      String(r.onlyOtherCount),
      String(r.markerCounts),
    ]);
  }
  return csv;
}

export function exportFileSimilarityCSV(ctx: AnalyticsViewContext, date: string): void {
  const rows = buildFileSimilarityRows(ctx);
  if (!rows) {
    new Notice("Insufficient data.");
    return;
  }
  downloadCsv(rows, `codemarker-file-similarity-${date}.csv`);
}
