import type { App } from "obsidian";
import type { MemoEntry } from "../../../data/dataTypes";

export interface MarkerCardOptions {
	app: App;
	onSourceClick?: (markerId: string, fileId: string) => void;
}

export function renderMarkerCard(parent: HTMLElement, entry: MemoEntry, opts: MarkerCardOptions): void {
	if (entry.kind !== "marker") return;
	const card = parent.createDiv({ cls: "memo-view-marker-card" });

	const header = card.createDiv({ cls: "memo-view-marker-header" });
	const sourceChip = header.createSpan({ cls: "memo-view-source-chip" });
	sourceChip.setText(`${entry.fileId} · ${entry.sourceType}`);
	if (opts.onSourceClick) {
		sourceChip.addClass("memo-view-source-chip-clickable");
		sourceChip.addEventListener("click", () => opts.onSourceClick?.(entry.markerId, entry.fileId));
	}

	const excerptEl = card.createDiv({ cls: "memo-view-excerpt" });
	const raw = entry.excerpt;
	if (raw === "(no excerpt)" || raw.trim() === "") {
		excerptEl.createEl("em", { text: "(no excerpt)", cls: "memo-view-excerpt-empty" });
	} else {
		const truncated = raw.length > 500 ? raw.slice(0, 500) + " …" : raw;
		excerptEl.createEl("blockquote", { text: truncated });
	}

	const memoEl = card.createDiv({ cls: "memo-view-marker-memo" });
	memoEl.createEl("p", { text: entry.memo });
}
