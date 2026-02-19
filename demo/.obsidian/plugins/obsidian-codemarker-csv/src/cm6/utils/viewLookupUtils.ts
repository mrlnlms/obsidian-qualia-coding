import { EditorView } from "@codemirror/view";
import { App, MarkdownView } from "obsidian";

// ── Standalone Editor Registry ──
// Allows standalone CM6 EditorViews (e.g. CSV segment editor) to be found
// by the same lookup functions used by markdown extensions.

const standaloneRegistry = new WeakMap<EditorView, string>();  // editorView → fileId
const editorViewRegistry = new Map<string, EditorView>();       // fileId → editorView

export function registerStandaloneEditor(editorView: EditorView, fileId: string): void {
	standaloneRegistry.set(editorView, fileId);
	editorViewRegistry.set(fileId, editorView);
}

export function unregisterStandaloneEditor(editorView: EditorView): void {
	const fileId = standaloneRegistry.get(editorView);
	if (fileId) {
		editorViewRegistry.delete(fileId);
	}
	standaloneRegistry.delete(editorView);
}

/**
 * Compatibility wrapper: provides the subset of MarkdownView that CM6 extensions use.
 * Wraps posToOffset/offsetToPos using the CM6 doc API.
 */
function createStandaloneViewWrapper(editorView: EditorView): MarkdownView {
	const editor = {
		// @ts-ignore — CM6 extensions access this via @ts-ignore anyway
		cm: editorView,
		posToOffset(pos: { line: number; ch: number }): number {
			const doc = editorView.state.doc;
			const lineInfo = doc.line(pos.line + 1); // CM6 lines are 1-based
			return lineInfo.from + pos.ch;
		},
		offsetToPos(offset: number): { line: number; ch: number } {
			const doc = editorView.state.doc;
			const lineInfo = doc.lineAt(offset);
			return { line: lineInfo.number - 1, ch: offset - lineInfo.from };
		},
	};
	// Return a minimal object typed as MarkdownView for compatibility
	return { editor } as unknown as MarkdownView;
}

/**
 * Find a MarkdownView (or standalone wrapper) by file path.
 */
export function getViewForFile(fileId: string, app: App): MarkdownView | null {
	// Check standalone registry first
	const standaloneView = editorViewRegistry.get(fileId);
	if (standaloneView) {
		return createStandaloneViewWrapper(standaloneView);
	}

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
	// Check standalone registry first
	const standaloneFileId = standaloneRegistry.get(editorView);
	if (standaloneFileId) return standaloneFileId;

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
