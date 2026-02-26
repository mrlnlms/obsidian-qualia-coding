import { EditorView } from "@codemirror/view";
import { Text } from "@codemirror/state";
import { App, MarkdownView } from "obsidian";
import { CodeMarkerModel } from "../../models/codeMarkerModel";
import { getViewForFile } from "./viewLookupUtils";

/**
 * Convert a CM6 offset to an Obsidian-style {line, ch} position.
 * Pure function — uses only CM6 doc API (no Editor wrapper needed).
 */
export function cm6OffsetToPos(doc: Text, offset: number): { line: number; ch: number } {
	const clamped = Math.max(0, Math.min(offset, doc.length));
	const lineObj = doc.lineAt(clamped);
	return { line: lineObj.number - 1, ch: clamped - lineObj.from };
}

export interface MarkerHitResult {
	markerId: string | null;   // winner for menu — null if partial overlap
	hoveredIds: string[];      // all IDs that should have hover visual
	isPartialOverlap: boolean; // true → suppress menu
}

/**
 * Classify markers at a given position: detect nesting vs partial overlap.
 */
export function classifyMarkersAtPos(
	pos: number,
	fileId: string,
	model: CodeMarkerModel,
	view: EditorView,
	app: App
): MarkerHitResult {
	const found = collectMarkersAtPos(pos, fileId, model, view, app);

	if (found.length === 0) {
		return { markerId: null, hoveredIds: [], isPartialOverlap: false };
	}

	if (found.length === 1) {
		return { markerId: found[0]!.id, hoveredIds: [found[0]!.id], isPartialOverlap: false };
	}

	// Check all pairs for partial overlap
	let hasPartial = false;
	for (let i = 0; i < found.length && !hasPartial; i++) {
		for (let j = i + 1; j < found.length; j++) {
			const a = found[i]!, b = found[j]!;
			const aContainsB = a.from <= b.from && a.to >= b.to;
			const bContainsA = b.from <= a.from && b.to >= a.to;
			if (!aContainsB && !bContainsA) {
				hasPartial = true;
				break;
			}
		}
	}

	if (hasPartial) {
		return {
			markerId: null,
			hoveredIds: found.map(f => f.id),
			isPartialOverlap: true,
		};
	}

	// All nested — smallest wins (same sort as before)
	found.sort((a, b) => {
		const aContainsB = a.from <= b.from && a.to >= b.to;
		const bContainsA = b.from <= a.from && b.to >= a.to;
		if (aContainsB) return 1;
		if (bContainsA) return -1;
		return b.from - a.from;
	});

	return { markerId: found[0]!.id, hoveredIds: [found[0]!.id], isPartialOverlap: false };
}

/**
 * Collect all markers whose offset range contains `pos`.
 */
function collectMarkersAtPos(
	pos: number,
	fileId: string,
	model: CodeMarkerModel,
	view: EditorView,
	app: App
): Array<{ id: string; from: number; to: number; size: number }> {
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

	return found;
}

/**
 * Find the smallest (most specific) marker at a given position.
 * Wrapper around classifyMarkersAtPos for backward compatibility.
 */
export function findSmallestMarkerAtPos(
	pos: number,
	fileId: string,
	model: CodeMarkerModel,
	view: EditorView,
	app: App
): string | null {
	return classifyMarkersAtPos(pos, fileId, model, view, app).markerId;
}

