import { EditorView } from "@codemirror/view";
import { App, MarkdownView } from "obsidian";

// ── Standalone editor registry (for CSV segment editors, etc.) ──

const standaloneByFileId = new Map<string, EditorView>();
const fileIdByEditor = new WeakMap<EditorView, string>();

export function registerStandaloneEditor(editorView: EditorView, fileId: string): void {
	standaloneByFileId.set(fileId, editorView);
	fileIdByEditor.set(editorView, fileId);
}

export function unregisterStandaloneEditor(editorView: EditorView): void {
	const fileId = fileIdByEditor.get(editorView);
	if (fileId) {
		standaloneByFileId.delete(fileId);
		fileIdByEditor.delete(editorView);
	}
}

/**
 * Find a MarkdownView by file path.
 * Also checks standalone editors for virtual fileIds (e.g. csv:...).
 */
export function getViewForFile(fileId: string, app: App): MarkdownView | null {
	// Check standalone first (virtual fileIds like csv:...)
	const standalone = standaloneByFileId.get(fileId);
	if (standalone) {
		return createStandaloneViewWrapper(standalone) as any;
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
 * Checks standalone registry first, then workspace leaves.
 */
export function findFileIdForEditorView(editorView: EditorView, app: App): string | null {
	// Check standalone first
	const standaloneFileId = fileIdByEditor.get(editorView);
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

/**
 * Create a minimal wrapper that looks like a MarkdownView for standalone EditorViews.
 * Used by CodeMarkerModel methods that need view.editor.
 */
function createStandaloneViewWrapper(editorView: EditorView): { editor: any } {
	return {
		editor: {
			cm: editorView,
			posToOffset(pos: { line: number; ch: number }): number {
				const line = editorView.state.doc.line(pos.line + 1);
				return line.from + pos.ch;
			},
			offsetToPos(offset: number): { line: number; ch: number } {
				const line = editorView.state.doc.lineAt(offset);
				return { line: line.number - 1, ch: offset - line.from };
			},
			getRange(from: { line: number; ch: number }, to: { line: number; ch: number }): string {
				const fromOffset = editorView.state.doc.line(from.line + 1).from + from.ch;
				const toOffset = editorView.state.doc.line(to.line + 1).from + to.ch;
				return editorView.state.sliceDoc(fromOffset, toOffset);
			},
		},
	};
}
