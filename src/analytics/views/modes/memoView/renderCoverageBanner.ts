import type { CoverageStats } from "../../../data/dataTypes";

export function renderCoverageBanner(parent: HTMLElement, coverage: CoverageStats): void {
  const banner = parent.createDiv({ cls: "memo-view-coverage-banner" });
  banner.createSpan({ text: `${coverage.codesWithMemo}/${coverage.codesTotal} codes` });
  banner.createSpan({ text: " · " });
  banner.createSpan({ text: `${coverage.groupsWithMemo}/${coverage.groupsTotal} groups` });
  banner.createSpan({ text: " · " });
  banner.createSpan({ text: `${coverage.relationsWithMemo}/${coverage.relationsTotal} relations` });
  banner.createSpan({ text: " · " });
  banner.createSpan({ text: `${coverage.markersWithMemo}/${coverage.markersTotal} markers` });
}
