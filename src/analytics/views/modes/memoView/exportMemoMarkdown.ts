import { Notice, normalizePath, TFile } from "obsidian";
import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { MemoViewFilters, MemoViewResult } from "../../../data/dataTypes";
import { aggregateMemos } from "../../../data/memoView";
import { readAllData } from "../../../data/dataReader";

export interface MarkdownBuildOptions {
	date: string;
	resolveGroupName: (groupId: string) => string;
}

/** Pure function: builds Markdown string from a MemoViewResult. Testable without vault. */
export function buildMemoMarkdown(result: MemoViewResult, opts: MarkdownBuildOptions): string {
	const lines: string[] = [];
	lines.push(`# Analytic Memos · ${opts.date}`);
	lines.push("");

	const cov = result.coverage;
	lines.push(`> **Coverage:** ${cov.codesWithMemo}/${cov.codesTotal} codes · ${cov.markersWithMemo}/${cov.markersTotal} markers · ${cov.groupsWithMemo}/${cov.groupsTotal} groups · ${cov.relationsWithMemo}/${cov.relationsTotal} relations`);
	lines.push("");
	lines.push("---");
	lines.push("");

	if (result.byCode) {
		for (const sec of result.byCode) {
			const headingLevel = Math.min(sec.depth + 2, 6);
			const heading = "#".repeat(headingLevel);
			lines.push(`${heading} ${sec.codeName}`);
			if (sec.groupIds.length > 0) {
				const names = sec.groupIds.map(opts.resolveGroupName).join(", ");
				lines.push(`**Groups:** ${names}`);
			}
			lines.push("");

			if (sec.codeMemo) {
				lines.push(`**Code memo:**`);
				lines.push(`> ${sec.codeMemo.replace(/\n/g, "\n> ")}`);
				lines.push("");
			}

			if (sec.groupMemos.length > 0) {
				lines.push("**Group memos:**");
				for (const gm of sec.groupMemos) {
					if (gm.kind !== "group") continue;
					lines.push(`- *${gm.groupName}:* ${gm.memo}`);
				}
				lines.push("");
			}

			if (sec.relationMemos.length > 0) {
				lines.push("**Relations:**");
				for (const rm of sec.relationMemos) {
					if (rm.kind !== "relation") continue;
					const arrow = rm.directed ? "→" : "↔";
					const tag = rm.level === "code" ? "*(code-level)*" : `*(application-level, [[${rm.markerId}]])*`;
					lines.push(`- ${arrow} ${rm.label} "${rm.targetName}" ${tag}: ${rm.memo}`);
				}
				lines.push("");
			}

			if (sec.markerMemos.length > 0) {
				lines.push(`**Marker memos (${sec.markerMemos.length}):**`);
				lines.push("");
				for (const mm of sec.markerMemos) {
					if (mm.kind !== "marker") continue;
					lines.push(`- **[[${mm.fileId}]]** · ${mm.sourceType}`);
					const excerptLines = mm.excerpt.split("\n").map((l) => `  > ${l}`).join("\n");
					lines.push(excerptLines);
					lines.push("");
					lines.push(`  *Marker memo:* ${mm.memo}`);
					lines.push("");
				}
			}

			lines.push("---");
			lines.push("");
		}
	}

	if (result.byFile) {
		for (const sec of result.byFile) {
			lines.push(`## ${sec.fileName} *(${sec.sourceType})*`);
			lines.push("");
			for (const mm of sec.markerMemos) {
				if (mm.kind !== "marker") continue;
				const excerptLines = mm.excerpt.split("\n").map((l) => `> ${l}`).join("\n");
				lines.push(excerptLines);
				lines.push("");
				lines.push(`*Marker memo:* ${mm.memo}`);
				lines.push("");
			}
			lines.push("---");
			lines.push("");
		}
	}

	return lines.join("\n");
}

export async function exportMemoMarkdown(ctx: AnalyticsViewContext, date: string): Promise<void> {
	const allData = readAllData(ctx.plugin.dataManager);
	const filters: MemoViewFilters = {
		...ctx.buildFilterConfig(),
		showTypes: ctx.mvShowTypes,
		groupBy: ctx.mvGroupBy,
		markerLimit: "all",
	};
	const result = aggregateMemos(allData, ctx.plugin.registry, filters, ctx.plugin.caseVariablesRegistry, { cache: ctx.plugin.smartCodeCache, registry: ctx.plugin.smartCodeRegistry });

	const md = buildMemoMarkdown(result, {
		date,
		resolveGroupName: (id) => ctx.plugin.registry.getGroup(id)?.name ?? id,
	});

	const folder = "Analytic Memos";
	const vault = ctx.plugin.app.vault;
	if (!(await vault.adapter.exists(folder))) {
		await vault.createFolder(folder);
	}
	let path = normalizePath(`${folder}/${date}.md`);
	if (await vault.adapter.exists(path)) {
		const ts = new Date().toISOString().slice(11, 16).replace(":", "");
		path = normalizePath(`${folder}/${date}-${ts}.md`);
	}
	const file = await vault.create(path, md);
	if (file instanceof TFile) {
		await ctx.plugin.app.workspace.getLeaf(true).openFile(file);
	}
	new Notice(`Exported memos to ${path}`);
}
