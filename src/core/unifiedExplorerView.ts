/**
 * Unified Code Explorer — single sidebar view for ALL engines (markdown, PDF, etc.).
 * Detects marker type and delegates label/navigation/path to the appropriate logic.
 */

import { WorkspaceLeaf, MarkdownView, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { BaseCodeExplorerView } from './baseCodeExplorerView';
import type { BaseMarker, SidebarModelInterface } from './types';
import type { CodeMarkerModel, Marker } from '../markdown/models/codeMarkerModel';
import { isPdfMarker, isImageMarker, isCsvMarker, isAudioMarker, isVideoMarker, shortenPath as _shortenPath, getMarkerLabel as _getMarkerLabel } from './markerResolvers';

export const CODE_EXPLORER_VIEW_TYPE = 'qualia-code-explorer';

export class UnifiedCodeExplorerView extends BaseCodeExplorerView {
	private mdModel: CodeMarkerModel | null;

	constructor(leaf: WorkspaceLeaf, model: SidebarModelInterface, mdModel: CodeMarkerModel | null) {
		super(leaf, model);
		this.mdModel = mdModel;
	}

	getViewType(): string {
		return CODE_EXPLORER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Code Explorer';
	}

	getMarkerLabel(marker: BaseMarker): string {
		return _getMarkerLabel(marker, this.mdModel, 50);
	}

	async navigateToMarker(marker: BaseMarker): Promise<void> {
		if (isPdfMarker(marker)) {
			this.app.workspace.trigger('qualia-pdf:navigate', {
				file: marker.fileId,
				page: marker.page,
			});
			return;
		}
		if (isImageMarker(marker)) {
			this.app.workspace.trigger('qualia-image:navigate', {
				file: marker.fileId,
				markerId: marker.id,
			});
			return;
		}
		if (isCsvMarker(marker)) {
			this.app.workspace.trigger('qualia-csv:navigate', {
				file: marker.fileId,
				row: marker.rowIndex,
				column: marker.columnId,
			});
			return;
		}
		if (isAudioMarker(marker)) {
			this.app.workspace.trigger('qualia-audio:navigate', {
				file: marker.fileId,
				seekTo: marker.startTime,
			});
			return;
		}
		if (isVideoMarker(marker)) {
			this.app.workspace.trigger('qualia-video:navigate', {
				file: marker.fileId,
				seekTo: marker.startTime,
			});
			return;
		}
		// Markdown
		const md = marker as Marker;
		if (!this.mdModel) return;

		let view = this.mdModel.getViewForFile(md.fileId);
		if (!view?.editor) {
			const file = this.app.vault.getAbstractFileByPath(md.fileId);
			if (!(file instanceof TFile)) return;
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			view = leaf.view instanceof MarkdownView ? leaf.view : null;
			if (!view?.editor) return;
		}

		try {
			const offset = view.editor.posToOffset(md.range.from);
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
		return _shortenPath(fileId);
	}
}
