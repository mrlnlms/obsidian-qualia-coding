/**
 * Unified Code Detail — single sidebar view for ALL engines (markdown, PDF, etc.).
 * Detects marker type and delegates label/text/navigation/path to the appropriate logic.
 */

import { WorkspaceLeaf, MarkdownView, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { BaseCodeDetailView, type AuditAccess } from './baseCodeDetailView';
import type { BaseMarker, SidebarModelInterface } from './types';
import type { CodeMarkerModel, Marker } from '../markdown/models/codeMarkerModel';
import { isPdfMarker, isImageMarker, isCsvMarker, isAudioMarker, isVideoMarker, shortenPath as _shortenPath, getMarkerLabel as _getMarkerLabel } from './markerResolvers';

export const CODE_DETAIL_VIEW_TYPE = 'qualia-code-detail';

export class UnifiedCodeDetailView extends BaseCodeDetailView {
	private mdModel: CodeMarkerModel | null;

	constructor(leaf: WorkspaceLeaf, model: SidebarModelInterface, mdModel: CodeMarkerModel | null, auditAccess?: AuditAccess) {
		super(leaf, model, auditAccess);
		this.mdModel = mdModel;
	}

	getViewType(): string {
		return CODE_DETAIL_VIEW_TYPE;
	}

	getMarkerLabel(marker: BaseMarker): string {
		return _getMarkerLabel(marker, this.mdModel);
	}

	getMarkerText(marker: BaseMarker): string | null {
		if (isPdfMarker(marker)) {
			if (marker.isShape) return null;
			return marker.text || null;
		}
		if (isImageMarker(marker)) {
			return null;
		}
		if (isCsvMarker(marker)) {
			return marker.markerText;
		}
		if (isAudioMarker(marker)) {
			return marker.markerText;
		}
		if (isVideoMarker(marker)) {
			return marker.markerText;
		}
		// Markdown
		const md = marker as Marker;
		if (!this.mdModel) return md.text || null;
		const view = this.mdModel.getViewForFile(md.fileId);
		if (!view?.editor) return md.text || null;
		try {
			return view.editor.getRange(md.range.from, md.range.to);
		} catch {
			return md.text || null;
		}
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
