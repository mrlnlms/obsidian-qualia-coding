import type { App } from "obsidian";
import type { FileMemoSection } from "../../../data/dataTypes";
import type { AnalyticsViewContext } from "../../analyticsViewContext";
import { renderMarkerCard } from "./renderMarkerCard";

export interface FileSectionOptions {
	app: App;
	ctx: AnalyticsViewContext;
	resolveCodeName: (id: string) => string;
	resolveCodeColor: (id: string) => string;
}

export function renderFileSection(
	parent: HTMLElement,
	section: FileMemoSection,
	opts: FileSectionOptions,
): void {
	const sec = parent.createDiv({ cls: "memo-view-file-section" });
	const header = sec.createDiv({ cls: "memo-view-file-header" });
	header.createSpan({ cls: "memo-view-file-name", text: section.fileName });
	header.createSpan({ cls: "memo-view-source-chip", text: ` · ${section.sourceType}` });

	if (section.codeIdsUsed.length > 0) {
		const chips = sec.createDiv({ cls: "memo-view-code-chips" });
		chips.createSpan({ cls: "memo-view-code-chips-label", text: "Codes used: " });
		for (const id of section.codeIdsUsed) {
			const chip = chips.createSpan({ cls: "memo-view-code-chip", text: opts.resolveCodeName(id) });
			const dot = chip.createSpan({ cls: "memo-view-color-dot memo-view-color-dot-inline" });
			dot.style.background = opts.resolveCodeColor(id);
			chip.prepend(dot);
		}
	}

	const block = sec.createDiv({ cls: "memo-view-marker-memos" });
	block.createEl("strong", { text: `Marker memos (${section.markerMemos.length}):` });
	for (const mm of section.markerMemos) {
		renderMarkerCard(block, mm, { app: opts.app, ctx: opts.ctx });
	}
}
