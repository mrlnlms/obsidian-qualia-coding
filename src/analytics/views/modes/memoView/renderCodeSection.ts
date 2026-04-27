import type { App } from "obsidian";
import type { CodeMemoSection } from "../../../data/dataTypes";
import { renderMarkerCard } from "./renderMarkerCard";

export interface CodeSectionOptions {
	app: App;
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
	header.createSpan({ cls: "memo-view-code-name", text: section.codeName });

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
		block.createEl("p", { text: section.codeMemo });
	}

	// Group memos
	if (section.groupMemos.length > 0) {
		const block = sec.createDiv({ cls: "memo-view-group-memos" });
		block.createEl("strong", { text: "Group memos:" });
		for (const gm of section.groupMemos) {
			if (gm.kind !== "group") continue;
			const row = block.createDiv({ cls: "memo-view-group-memo-row" });
			row.createSpan({ cls: "memo-view-group-memo-name", text: `${gm.groupName}: ` });
			row.createSpan({ text: gm.memo });
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
			row.setText(`${arrow} ${rm.label} "${rm.targetName}" ${levelTag}: ${rm.memo}`);
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
			renderMarkerCard(block, mm, { app: opts.app });
		}
		if (remaining > 0) {
			const btn = block.createEl("button", { text: `Show ${remaining} more`, cls: "memo-view-show-more" });
			btn.addEventListener("click", () => opts.onToggleExpand(section.codeId));
		}
	}
}
