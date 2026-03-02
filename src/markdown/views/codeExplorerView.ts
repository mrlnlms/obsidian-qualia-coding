import { WorkspaceLeaf, MarkdownView, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { BaseCodeExplorerView } from '../../core/baseCodeExplorerView';
import { BaseMarker, SidebarModelInterface } from '../../core/types';
import { CodeMarkerModel, Marker } from '../models/codeMarkerModel';

export const CODE_EXPLORER_VIEW_TYPE = 'qualia-code-explorer';

export class CodeExplorerView extends BaseCodeExplorerView {
	private mdModel: CodeMarkerModel;

	constructor(leaf: WorkspaceLeaf, model: CodeMarkerModel) {
		super(leaf, model as unknown as SidebarModelInterface);
		this.mdModel = model;
	}

	getViewType(): string {
		return CODE_EXPLORER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Code Explorer';
	}

	getMarkerLabel(marker: BaseMarker): string {
		const md = marker as Marker;
		const view = this.mdModel.getViewForFile(md.fileId);
		if (!view?.editor) return `Line ${md.range.from.line + 1}`;
		try {
			const text = view.editor.getRange(md.range.from, md.range.to);
			return text.length > 60 ? text.substring(0, 60) + '...' : text;
		} catch {
			return `Line ${md.range.from.line + 1}`;
		}
	}

	async navigateToMarker(marker: BaseMarker): Promise<void> {
		const md = marker as Marker;

		// If file isn't open, open it first
		let view = this.mdModel.getViewForFile(md.fileId);
		if (!view?.editor) {
			const file = this.app.vault.getAbstractFileByPath(md.fileId);
			if (!(file instanceof TFile)) return;
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			// Wait for the editor to be ready
			view = leaf.view instanceof MarkdownView ? leaf.view : null;
			if (!view?.editor) return;
		}

		try {
			// @ts-ignore
			const offset = view.editor.posToOffset(md.range.from);
			// @ts-ignore
			const editorView: EditorView = view.editor.cm;
			if (editorView) {
				editorView.dispatch({
					effects: EditorView.scrollIntoView(offset, { y: 'center' }),
				});
			}
			view.editor.setCursor(md.range.from);
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		} catch {
			view.editor.setCursor(md.range.from);
		}
	}

	shortenPath(fileId: string): string {
		const parts = fileId.split('/');
		return (parts[parts.length - 1] ?? fileId).replace(/\.md$/, '');
	}
}
