
import { setIcon, Notice, MarkdownView } from "obsidian";
import type { FilterConfig, UnifiedMarker } from "../../data/dataTypes";
import { TextExtractor, type ExtractedSegment } from "../../data/textExtractor";
import type { AnalyticsViewContext } from "../analyticsViewContext";

export function renderTextRetrieval(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  if (!ctx.chartContainer || !ctx.data) return;

  const container = ctx.chartContainer.createDiv({ cls: "codemarker-tr-wrapper" });

  // Toolbar
  const toolbar = container.createDiv({ cls: "codemarker-tr-toolbar" });

  const searchInput = toolbar.createEl("input", {
    cls: "codemarker-tr-search",
    attr: { type: "text", placeholder: "Search codes or text..." },
  });
  searchInput.value = ctx.trSearch;
  searchInput.addEventListener("input", () => {
    ctx.trSearch = searchInput.value;
    renderSegments(ctx, contentEl, ctx.trSegments);
  });

  const groupToggle = toolbar.createDiv({ cls: "codemarker-tr-group-toggle" });
  for (const [value, label] of [["code", "By Code"], ["file", "By File"]] as const) {
    const btn = groupToggle.createDiv({
      cls: "codemarker-tr-group-btn" + (ctx.trGroupBy === value ? " is-active" : ""),
      text: label,
    });
    btn.addEventListener("click", () => {
      ctx.trGroupBy = value;
      ctx.trCollapsed.clear();
      renderSegments(ctx, contentEl, ctx.trSegments);
      // Update active state
      groupToggle.querySelectorAll(".codemarker-tr-group-btn").forEach((el) => el.removeClass("is-active"));
      btn.addClass("is-active");
    });
  }

  const contentEl = container.createDiv({ cls: "codemarker-tr-content" });

  // Filter markers per current filters (+ optional marker ID filter from other modes)
  let filtered = ctx.data.markers.filter((m) =>
    filters.sources.includes(m.source) &&
    m.codes.some((c) => !filters.excludeCodes.includes(c))
  );
  if (ctx.trMarkerFilter) {
    filtered = filtered.filter((m) => ctx.trMarkerFilter!.has(m.id));
  }

  // Show filter banner with actual count after all filters applied
  if (ctx.trMarkerFilter) {
    const banner = container.insertBefore(
      createDiv({ cls: "codemarker-tr-filter-banner" }),
      contentEl,
    );
    banner.createSpan({ text: `Filtered: ${filtered.length} markers` });
    const clearBtn = banner.createEl("button", { text: "Show all", cls: "codemarker-tr-filter-clear" });
    clearBtn.addEventListener("click", () => {
      ctx.trMarkerFilter = null;
      ctx.scheduleUpdate();
    });
  }

  if (filtered.length === 0) {
    contentEl.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No markers match current filters.",
    });
    return;
  }

  // Show loading
  const loadingEl = contentEl.createDiv({ cls: "codemarker-tr-loading", text: "Extracting text..." });

  const gen = ctx.renderGeneration;
  loadAndRenderSegments(ctx, filtered, contentEl, loadingEl, gen);
}

async function loadAndRenderSegments(
  ctx: AnalyticsViewContext,
  markers: UnifiedMarker[],
  container: HTMLElement,
  loadingEl: HTMLElement,
  generation: number,
): Promise<void> {
  const extractor = new TextExtractor(ctx.plugin.app.vault);
  ctx.trSegments = await extractor.extractBatch(markers);
  if (!ctx.isRenderCurrent(generation)) return;
  loadingEl.remove();
  renderSegments(ctx, container, ctx.trSegments);
}

function renderSegments(ctx: AnalyticsViewContext, container: HTMLElement, segments: ExtractedSegment[]): void {
  // Clear previous content but keep toolbar (toolbar is sibling in wrapper)
  container.empty();

  if (segments.length === 0) {
    container.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No segments to display.",
    });
    return;
  }

  // Apply search filter
  const query = ctx.trSearch.toLowerCase();
  const filtered = query
    ? segments.filter((s) =>
        s.codes.some((c) => c.toLowerCase().includes(query)) ||
        s.text.toLowerCase().includes(query) ||
        s.fileId.toLowerCase().includes(query)
      )
    : segments;

  if (filtered.length === 0) {
    container.createDiv({
      cls: "codemarker-analytics-empty",
      text: "No results match your search.",
    });
    return;
  }

  // Code maps keyed by id (segment.codes carry codeIds post Phase C)
  const codeColorMap = new Map<string, string>();
  const codeNameMap = new Map<string, string>();
  if (ctx.data) {
    for (const c of ctx.data.codes) {
      codeColorMap.set(c.id, c.color);
      codeNameMap.set(c.id, c.name);
    }
  }

  if (ctx.trGroupBy === "code") {
    // Group by code (key=codeId)
    const byCode = new Map<string, ExtractedSegment[]>();
    for (const seg of filtered) {
      for (const code of seg.codes) {
        const list = byCode.get(code) || [];
        list.push(seg);
        byCode.set(code, list);
      }
    }
    const sortedCodeIds = Array.from(byCode.keys()).sort((a, b) => (codeNameMap.get(a) ?? a).localeCompare(codeNameMap.get(b) ?? b));
    for (const codeId of sortedCodeIds) {
      renderCodeGroup(ctx, container, codeId, codeNameMap.get(codeId) ?? codeId, byCode.get(codeId)!, codeColorMap, codeNameMap);
    }
  } else {
    // Group by file
    const byFile = new Map<string, ExtractedSegment[]>();
    for (const seg of filtered) {
      const list = byFile.get(seg.fileId) || [];
      list.push(seg);
      byFile.set(seg.fileId, list);
    }
    const sortedFiles = Array.from(byFile.keys()).sort();
    for (const file of sortedFiles) {
      renderFileGroup(ctx, container, file, byFile.get(file)!, codeColorMap, codeNameMap);
    }
  }
}

function renderCodeGroup(
  ctx: AnalyticsViewContext,
  container: HTMLElement,
  codeId: string,
  displayName: string,
  segments: ExtractedSegment[],
  codeColorMap: Map<string, string>,
  codeNameMap: Map<string, string>,
): void {
  const section = container.createDiv({ cls: "codemarker-tr-section" });
  const header = section.createDiv({ cls: "codemarker-tr-section-header" });
  const isCollapsed = ctx.trCollapsed.has("code:" + codeId);

  const chevron = header.createDiv({ cls: "codemarker-tr-chevron" + (isCollapsed ? " is-collapsed" : "") });
  setIcon(chevron, "chevron-down");

  const swatch = header.createDiv({ cls: "codemarker-tr-swatch" });
  swatch.style.backgroundColor = codeColorMap.get(codeId) ?? "#6200EE";

  header.createDiv({ cls: "codemarker-tr-section-title", text: displayName });
  header.createDiv({ cls: "codemarker-tr-section-count", text: `(${segments.length})` });

  const body = section.createDiv({ cls: "codemarker-tr-section-body" });
  if (isCollapsed) body.style.display = "none";

  header.addEventListener("click", () => {
    const key = "code:" + codeId;
    if (ctx.trCollapsed.has(key)) {
      ctx.trCollapsed.delete(key);
      body.style.display = "";
      chevron.removeClass("is-collapsed");
    } else {
      ctx.trCollapsed.add(key);
      body.style.display = "none";
      chevron.addClass("is-collapsed");
    }
  });

  for (const seg of segments) {
    renderSegmentCard(ctx, body, seg, codeColorMap, codeNameMap);
  }
}

function renderFileGroup(
  ctx: AnalyticsViewContext,
  container: HTMLElement,
  file: string,
  segments: ExtractedSegment[],
  codeColorMap: Map<string, string>,
  codeNameMap: Map<string, string>,
): void {
  const section = container.createDiv({ cls: "codemarker-tr-section" });
  const header = section.createDiv({ cls: "codemarker-tr-section-header" });
  const isCollapsed = ctx.trCollapsed.has("file:" + file);

  const chevron = header.createDiv({ cls: "codemarker-tr-chevron" + (isCollapsed ? " is-collapsed" : "") });
  setIcon(chevron, "chevron-down");

  const iconEl = header.createDiv({ cls: "codemarker-tr-file-icon" });
  setIcon(iconEl, "file-text");

  const basename = file.split("/").pop() ?? file;
  header.createDiv({ cls: "codemarker-tr-section-title", text: basename });
  header.createDiv({ cls: "codemarker-tr-section-count", text: `(${segments.length})` });

  const body = section.createDiv({ cls: "codemarker-tr-section-body" });
  if (isCollapsed) body.style.display = "none";

  header.addEventListener("click", () => {
    const key = "file:" + file;
    if (ctx.trCollapsed.has(key)) {
      ctx.trCollapsed.delete(key);
      body.style.display = "";
      chevron.removeClass("is-collapsed");
    } else {
      ctx.trCollapsed.add(key);
      body.style.display = "none";
      chevron.addClass("is-collapsed");
    }
  });

  for (const seg of segments) {
    renderSegmentCard(ctx, body, seg, codeColorMap, codeNameMap);
  }
}

function renderSegmentCard(
  ctx: AnalyticsViewContext,
  container: HTMLElement,
  seg: ExtractedSegment,
  codeColorMap: Map<string, string>,
  codeNameMap: Map<string, string>,
): void {
  const card = container.createDiv({ cls: "codemarker-tr-card" });

  // Header row: source badge + file link + location
  const cardHeader = card.createDiv({ cls: "codemarker-tr-card-header" });

  // Source badge
  const badgeCls = seg.source === "audio"
    ? "is-audio"
    : seg.source === "video"
    ? "is-video"
    : seg.source === "markdown"
    ? "is-markdown"
    : seg.source === "csv-segment"
    ? "is-csv-segment"
    : seg.source === "csv-row"
    ? "is-csv-row"
    : seg.source === "pdf"
    ? "is-pdf"
    : "is-image";
  const badgeText = seg.source === "audio"
    ? "AUD"
    : seg.source === "video"
    ? "VID"
    : seg.source === "markdown"
    ? "MD"
    : seg.source === "csv-segment"
    ? "CSV"
    : seg.source === "csv-row"
    ? "ROW"
    : seg.source === "pdf"
    ? "PDF"
    : "IMG";
  cardHeader.createDiv({ cls: `codemarker-tr-source-badge ${badgeCls}`, text: badgeText });

  // File link
  const basename = seg.fileId.split("/").pop() ?? seg.fileId;
  const fileLink = cardHeader.createDiv({ cls: "codemarker-tr-file-link", text: basename });
  fileLink.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateToSegment(ctx, seg);
  });

  // Location
  const loc = formatLocation(seg);
  if (loc) {
    cardHeader.createDiv({ cls: "codemarker-tr-location", text: loc });
  }

  // Text content
  const text = seg.text.length > 500 ? seg.text.slice(0, 497) + "..." : seg.text;
  card.createDiv({ cls: "codemarker-tr-text", text: text || "[empty]" });

  // Footer row: code chips + add-to-board button
  const footer = card.createDiv({ cls: "codemarker-tr-card-footer" });

  // Code chips (seg.codes carries codeIds; render display names)
  const chips = footer.createDiv({ cls: "codemarker-tr-chips" });
  for (const codeId of seg.codes) {
    const chip = chips.createDiv({ cls: "codemarker-tr-chip" });
    const dot = chip.createDiv({ cls: "codemarker-tr-chip-dot" });
    dot.style.backgroundColor = codeColorMap.get(codeId) ?? "#6200EE";
    chip.createSpan({ text: codeNameMap.get(codeId) ?? codeId });
  }

  // Add to Board button
  const boardBtn = footer.createDiv({ cls: "codemarker-tr-board-btn", attr: { "aria-label": "Add to Research Board" } });
  setIcon(boardBtn, "layout-dashboard");
  boardBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const loc = formatLocation(seg);
    const colors = seg.codes.map((c) => codeColorMap.get(c) ?? "#6200EE");
    ctx.plugin.addExcerptToBoard(seg.text, seg.fileId, seg.source, loc, seg.codes, colors);
    new Notice("Added excerpt to Research Board");
  });

  // Click card to navigate
  card.addEventListener("click", () => navigateToSegment(ctx, seg));
}

export function formatAudioTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00.0";
  const rounded = Math.round(seconds * 10) / 10;
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function formatLocation(seg: ExtractedSegment): string {
  if (seg.source === "audio") {
    const from = seg.meta?.audioFrom;
    const to = seg.meta?.audioTo;
    if (from != null && to != null) return formatAudioTime(from) + " \u2013 " + formatAudioTime(to);
    return "";
  }
  if (seg.source === "video") {
    const from = seg.meta?.videoFrom;
    const to = seg.meta?.videoTo;
    if (from != null && to != null) return formatAudioTime(from) + " \u2013 " + formatAudioTime(to);
    return "";
  }
  if (seg.source === "csv-row") {
    const row = seg.meta?.row;
    const col = seg.meta?.column;
    if (row != null && col) return `Row ${row}:${col}`;
    if (row != null) return `Row ${row}`;
    return "";
  }
  if (seg.source === "csv-segment") {
    const row = seg.meta?.row;
    const col = seg.meta?.column;
    if (row != null && col) return `Row ${row}:${col}`;
    return "";
  }
  if (seg.source === "image") {
    return seg.meta?.regionType ?? "region";
  }
  if (seg.source === "pdf") {
    const page = seg.meta?.page;
    return page != null ? `Page ${page}` : "";
  }
  // Markdown
  const from = seg.fromLine;
  const to = seg.toLine;
  if (from != null && to != null) {
    return from === to ? `L${from + 1}` : `L${from + 1}\u2013${to + 1}`;
  }
  return "";
}

function navigateToSegment(ctx: AnalyticsViewContext, seg: ExtractedSegment): void {
  const file = seg.fileId;
  const ws = ctx.plugin.app.workspace;

  switch (seg.source) {
    case "audio":
      ws.trigger('qualia-audio:navigate', { file, seekTo: seg.meta?.audioFrom ?? 0 });
      return;
    case "video":
      ws.trigger('qualia-video:navigate', { file, seekTo: seg.meta?.videoFrom ?? 0 });
      return;
    case "csv-segment":
    case "csv-row":
      ws.trigger('qualia-csv:navigate', { file, row: seg.meta?.row ?? 0, column: seg.meta?.column });
      return;
    case "image":
      ws.trigger('qualia-image:navigate', { file, markerId: seg.markerId });
      return;
    case "pdf":
      ws.trigger('qualia-pdf:navigate', { file, page: seg.meta?.page ?? 1 });
      return;
    case "markdown": {
      // Reuse existing leaf or open in new tab, then scroll to segment
      const existingLeaf = ws.getLeavesOfType("markdown")
        .find(l => l.view instanceof MarkdownView && l.view.file?.path === file);

      const openPromise = existingLeaf
        ? (ws.setActiveLeaf(existingLeaf, { focus: true }), Promise.resolve())
        : ws.openLinkText(file, "", "tab");

      openPromise.then(() => {
        if (seg.fromLine != null) {
          setTimeout(() => {
            const view = ws.getActiveViewOfType(MarkdownView);
            if (view && view.file?.path === file) {
              const editor = view.editor;
              if (editor?.setCursor) {
                editor.setCursor({ line: seg.fromLine ?? 0, ch: seg.fromCh ?? 0 });
                editor.scrollIntoView(
                  { from: { line: seg.fromLine ?? 0, ch: 0 }, to: { line: seg.toLine ?? seg.fromLine ?? 0, ch: 0 } },
                  true,
                );
              }
            }
          }, 200);
        }
      });
      return;
    }
  }
}
