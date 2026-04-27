import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { FilterConfig, MemoViewFilters } from "../../../data/dataTypes";
import { aggregateMemos } from "../../../data/memoView";
import { readAllData } from "../../../data/dataReader";
import { renderCoverageBanner } from "./renderCoverageBanner";

export function renderMemoView(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  const container = ctx.chartContainer;
  if (!container) return;
  container.empty();

  const allData = readAllData(ctx.plugin.dataManager);
  const memoFilters: MemoViewFilters = {
    ...filters,
    showTypes: ctx.mvShowTypes,
    groupBy: ctx.mvGroupBy,
    markerLimit: ctx.mvMarkerLimit,
  };
  const result = aggregateMemos(allData, ctx.plugin.registry, memoFilters, ctx.plugin.caseVariablesRegistry);

  const wrapper = container.createDiv({ cls: "memo-view-wrapper" });
  renderCoverageBanner(wrapper, result.coverage);

  // Empty state mínimo
  const total = result.coverage.codesWithMemo + result.coverage.groupsWithMemo +
                result.coverage.relationsWithMemo + result.coverage.markersWithMemo;
  if (total === 0) {
    wrapper.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No memos yet. Add memos in Code Detail, Group panel, or marker context to see them here.",
    });
    return;
  }

  // Sections render — placeholder. Próxima chunk popula.
  if (result.byCode) {
    for (const sec of result.byCode) {
      const sectionEl = wrapper.createDiv({ cls: "memo-view-code-section" });
      sectionEl.createEl("h3", { text: sec.codeName });
    }
  }
}

export function renderMemoViewOptions(_ctx: AnalyticsViewContext): void {
  // Próxima chunk
}
