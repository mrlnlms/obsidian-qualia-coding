import { Notice } from "obsidian";
import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { MemoViewFilters, MemoViewResult } from "../../../data/dataTypes";
import { aggregateMemos } from "../../../data/memoView";
import { readAllData } from "../../../data/dataReader";
import { buildCsv } from "../../shared/chartHelpers";

/** Pure function: builds CSV string from a MemoViewResult. Testable without DOM. */
export function buildMemoCSV(result: MemoViewResult): string {
	const header = ["entity_type", "entity_id", "code_id", "code_name", "file_id", "source_type", "level", "memo"];
	const rows: string[][] = [header];

	const seenGroups = new Set<string>();

	if (result.byCode) {
		for (const sec of result.byCode) {
			if (sec.codeMemo) {
				rows.push(["code", sec.codeId, sec.codeId, sec.codeName, "", "", "", sec.codeMemo]);
			}
			for (const gm of sec.groupMemos) {
				if (gm.kind !== "group") continue;
				if (seenGroups.has(gm.groupId)) continue; // group memo aparece em cada code que pertence ao group; dedup no export
				seenGroups.add(gm.groupId);
				rows.push(["group", gm.groupId, "", "", "", "", "", gm.memo]);
			}
			for (const rm of sec.relationMemos) {
				if (rm.kind !== "relation") continue;
				rows.push([
					"relation",
					"",
					rm.codeId,
					sec.codeName,
					rm.markerId ?? "",
					rm.engineType ?? "",
					rm.level,
					rm.memo,
				]);
			}
			for (const mm of sec.markerMemos) {
				if (mm.kind !== "marker") continue;
				rows.push(["marker", mm.markerId, mm.codeId, sec.codeName, mm.fileId, mm.sourceType, "", mm.memo]);
			}
		}
	}

	if (result.byFile) {
		for (const sec of result.byFile) {
			for (const mm of sec.markerMemos) {
				if (mm.kind !== "marker") continue;
				rows.push(["marker", mm.markerId, mm.codeId, "", mm.fileId, mm.sourceType, "", mm.memo]);
			}
		}
	}

	return buildCsv(rows);
}

export function exportMemoCSV(ctx: AnalyticsViewContext, date: string): void {
	const allData = readAllData(ctx.plugin.dataManager);
	const filters: MemoViewFilters = {
		...ctx.buildFilterConfig(),
		showTypes: ctx.mvShowTypes,
		groupBy: ctx.mvGroupBy,
		markerLimit: "all",
	};
	const result = aggregateMemos(allData, ctx.plugin.registry, filters, ctx.plugin.caseVariablesRegistry);

	const csv = buildMemoCSV(result);
	const rows = csv.trim().split("\n").length - 1; // excluding header
	if (rows === 0) {
		new Notice("No memos to export");
		return;
	}

	const blob = new Blob([csv], { type: "text/csv" });
	const link = document.createElement("a");
	link.download = `memo-view-${date}.csv`;
	link.href = URL.createObjectURL(blob);
	link.click();
	URL.revokeObjectURL(link.href);
	new Notice(`Exported ${rows} memos`);
}
