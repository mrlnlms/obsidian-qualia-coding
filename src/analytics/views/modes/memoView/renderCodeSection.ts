import type { App } from "obsidian";
import type { CodeMemoSection } from "../../../data/dataTypes";
import type { AnalyticsViewContext } from "../../analyticsViewContext";
import { renderMarkerCard } from "./renderMarkerCard";
import { renderMemoEditor } from "./renderMemoEditor";
import {
	onSaveCodeMemo,
	onSaveGroupMemo,
	onSaveCodeRelationMemo,
	onSaveAppRelationMemo,
} from "./onSaveHandlers";

export interface CodeSectionOptions {
	app: App;
	ctx: AnalyticsViewContext;
	markerLimit: 5 | 10 | 25 | "all";
	expanded: Set<string>;
	onToggleExpand: (codeId: string) => void;
	resolveGroupName: (groupId: string) => string;
}

export function renderCodeSection(
	parent: HTMLElement,
	section: CodeMemoSection,
	opts: CodeSectionOptions,
): void {
	const isHollow = !section.codeMemo
		&& section.groupMemos.length === 0
		&& section.relationMemos.length === 0
		&& section.markerMemos.length === 0
		&& section.hasAnyMemoInSubtree;

	const sec = parent.createDiv({
		cls: isHollow ? "memo-view-code-section memo-view-hollow" : "memo-view-code-section",
	});
	const indent = Math.min(section.depth * 16, 80);
	sec.style.setProperty("--memo-view-depth-indent", `${indent}px`);

	// Header
	const header = sec.createDiv({ cls: "memo-view-code-header" });
	const colorDot = header.createSpan({ cls: "memo-view-color-dot" });
	colorDot.style.background = section.color;
	header.createSpan({ cls: "memo-view-code-name", text: section.isSmart ? `⚡ ${section.codeName}` : section.codeName });

	if (section.groupIds.length > 0) {
		const chips = header.createDiv({ cls: "memo-view-group-chips" });
		for (const gid of section.groupIds) {
			chips.createSpan({ cls: "memo-view-group-chip", text: opts.resolveGroupName(gid) });
		}
	}

	if (isHollow) return; // só header pra contexto da hierarquia

	// Code memo
	if (section.codeMemo) {
		const block = sec.createDiv({ cls: "memo-view-code-memo" });
		block.createEl("strong", { text: "Code memo:" });
		renderMemoEditor(block, section.codeMemo, (v) => onSaveCodeMemo(opts.ctx, section.codeId, v), opts.ctx);
	}

	// Group memos
	if (section.groupMemos.length > 0) {
		const block = sec.createDiv({ cls: "memo-view-group-memos" });
		block.createEl("strong", { text: "Group memos:" });
		for (const gm of section.groupMemos) {
			if (gm.kind !== "group") continue;
			const row = block.createDiv({ cls: "memo-view-group-memo-row" });
			row.createSpan({ cls: "memo-view-group-memo-name", text: `${gm.groupName}` });
			renderMemoEditor(row, gm.memo, (v) => onSaveGroupMemo(opts.ctx, gm.groupId, v), opts.ctx);
		}
	}

	// Relation memos
	if (section.relationMemos.length > 0) {
		const block = sec.createDiv({ cls: "memo-view-relation-memos" });
		block.createEl("strong", { text: "Relations:" });
		for (const rm of section.relationMemos) {
			if (rm.kind !== "relation") continue;
			const arrow = rm.directed ? "→" : "↔";
			const levelTag = rm.level === "code" ? "(code-level)" : `(app-level, ${rm.markerId})`;
			const row = block.createDiv({ cls: "memo-view-relation-row" });
			row.createSpan({ cls: "memo-view-relation-label", text: `${arrow} ${rm.label} "${rm.targetName}" ${levelTag}` });
			const onSave = rm.level === "code"
				? (v: string) => onSaveCodeRelationMemo(opts.ctx, rm.codeId, rm.label, rm.targetId, v)
				: (v: string) => onSaveAppRelationMemo(opts.ctx, rm.engineType!, rm.markerId!, rm.codeId, rm.label, rm.targetId, v);
			renderMemoEditor(row, rm.memo, onSave, opts.ctx);
		}
	}

	// Marker memos
	if (section.markerMemos.length > 0) {
		const block = sec.createDiv({ cls: "memo-view-marker-memos" });
		const isExpanded = opts.expanded.has(section.codeId) || opts.markerLimit === "all";
		const limit = isExpanded
			? section.markerMemos.length
			: typeof opts.markerLimit === "number"
				? opts.markerLimit
				: section.markerMemos.length;
		const visible = section.markerMemos.slice(0, limit);
		const remaining = section.markerMemos.length - limit;

		block.createEl("strong", { text: `Marker memos (${section.markerMemos.length}):` });
		for (const mm of visible) {
			renderMarkerCard(block, mm, { app: opts.app, ctx: opts.ctx });
		}
		if (remaining > 0) {
			const btn = block.createEl("button", { text: `Show ${remaining} more`, cls: "memo-view-show-more" });
			btn.addEventListener("click", () => opts.onToggleExpand(section.codeId));
		}
	}
}
