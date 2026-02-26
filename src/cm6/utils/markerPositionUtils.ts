import { EditorView } from "@codemirror/view";
import { App, MarkdownView } from "obsidian";
import { CodeMarkerModel } from "../../models/codeMarkerModel";
import { getViewForFile } from "./viewLookupUtils";

/**
 * Find the smallest (most specific) marker at a given position.
 */
export function findSmallestMarkerAtPos(
	pos: number,
	fileId: string,
	model: CodeMarkerModel,
	view: EditorView,
	app: App
): string | null {
	const markers = model.getMarkersForFile(fileId);
	const found: Array<{ id: string; from: number; to: number; size: number }> = [];

	for (const marker of markers) {
		try {
			let startOffset: number, endOffset: number;

			try {
				startOffset = view.state.doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
				endOffset = view.state.doc.line(marker.range.to.line + 1).from + marker.range.to.ch;
			} catch {
				const targetView = getViewForFile(fileId, app);
				if (!targetView?.editor) continue;
				// @ts-ignore
				startOffset = targetView.editor.posToOffset(marker.range.from);
				// @ts-ignore
				endOffset = targetView.editor.posToOffset(marker.range.to);
			}

			if (startOffset == null || endOffset == null) continue;

			if (pos >= startOffset && pos <= endOffset) {
				found.push({ id: marker.id, from: startOffset, to: endOffset, size: endOffset - startOffset });
			}
		} catch {
			continue;
		}
	}

	if (found.length === 0) return null;

	// Smart priority: nesting vs partial intersection
	found.sort((a, b) => {
		const aContainsB = a.from <= b.from && a.to >= b.to;
		const bContainsA = b.from <= a.from && b.to >= a.to;

		if (aContainsB) return 1;  // B is nested inside A → B wins (comes first)
		if (bContainsA) return -1; // A is nested inside B → A wins (comes first)

		// Partial intersection: higher `from` wins (starts further in doc = "on top")
		return b.from - a.from;
	});

	return found[0]!.id;
}

