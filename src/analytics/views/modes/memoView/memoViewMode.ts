import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { FilterConfig, MemoViewFilters } from "../../../data/dataTypes";
import { aggregateMemos } from "../../../data/memoView";
import { readAllData } from "../../../data/dataReader";
import { renderCoverageBanner } from "./renderCoverageBanner";
import { renderCodeSection } from "./renderCodeSection";

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

  const total = result.coverage.codesWithMemo + result.coverage.groupsWithMemo +
                result.coverage.relationsWithMemo + result.coverage.markersWithMemo;
  if (total === 0) {
    wrapper.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No memos yet. Add memos in Code Detail, Group panel, or marker context to see them here.",
    });
    return;
  }

  if (!result.byCode || result.byCode.length === 0) {
    wrapper.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No memos match current filters.",
    });
    return;
  }

  for (const sec of result.byCode) {
    renderCodeSection(wrapper, sec, {
      app: ctx.plugin.app,
      ctx,
      markerLimit: ctx.mvMarkerLimit,
      expanded: ctx.mvExpanded,
      onToggleExpand: (codeId) => {
        if (ctx.mvExpanded.has(codeId)) ctx.mvExpanded.delete(codeId);
        else ctx.mvExpanded.add(codeId);
        ctx.scheduleUpdate();
      },
      resolveGroupName: (gid) => ctx.plugin.registry.getGroup(gid)?.name ?? gid,
    });
  }
}

export function renderMemoViewOptions(_ctx: AnalyticsViewContext): void {
  // Próxima chunk
}
