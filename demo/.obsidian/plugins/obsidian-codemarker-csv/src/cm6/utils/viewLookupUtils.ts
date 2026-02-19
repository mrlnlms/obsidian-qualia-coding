import { EditorView } from "@codemirror/view";
import { App, MarkdownView } from "obsidian";

/**
 * Find a MarkdownView by file path.
 */
export function getViewForFile(fileId: string, app: App): MarkdownView | null {
	const leaves = app.workspace.getLeavesOfType('markdown');
	for (const leaf of leaves) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file?.path === fileId) {
			return view;
		}
	}
	return null;
}

/**
 * Given a CM6 EditorView, find the file path it belongs to.
 */
export function findFileIdForEditorView(editorView: EditorView, app: App): string | null {
	const leaves = app.workspace.getLeavesOfType('markdown');
	for (const leaf of leaves) {
		const leafView = leaf.view;
		if (leafView instanceof MarkdownView && leafView.editor) {
			try {
				// @ts-ignore
				const cmView = leafView.editor.cm;
				if (cmView === editorView) {
					return leafView.file?.path || null;
				}
			} catch {
				continue;
			}
		}
	}
	return null;
}
