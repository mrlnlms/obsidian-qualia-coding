import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig } from "../../data/dataTypes";

export function renderCodeMetadataView(ctx: AnalyticsViewContext, _filters: FilterConfig): void {
  const container = ctx.chartContainer;
  if (!container) return;
  container.empty();
  container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
    text: "Code × Metadata — render WIP",
  });
}

export function renderCodeMetadataOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl?.createDiv({ cls: "codemarker-config-section" });
  if (!section) return;
  section.createDiv({ cls: "codemarker-config-section-title", text: "Code × Metadata" });
  section.createDiv({ text: "Options WIP" });
}

export function exportCodeMetadataCSV(_ctx: AnalyticsViewContext, _date: string): void {
  // WIP — implementado no Chunk 4
}
