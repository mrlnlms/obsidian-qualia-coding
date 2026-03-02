/**
 * Unified Code Detail — single sidebar view for ALL engines (markdown, PDF, etc.).
 * Detects marker type and delegates label/text/navigation/path to the appropriate logic.
 */

import { WorkspaceLeaf, MarkdownView, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { BaseCodeDetailView } from './baseCodeDetailView';
import type { BaseMarker, SidebarModelInterface } from './types';
import type { CodeMarkerModel, Marker } from '../markdown/models/codeMarkerModel';
import type { PdfBaseMarker } from '../pdf/views/pdfSidebarAdapter';
import type { ImageBaseMarker } from '../image/views/imageSidebarAdapter';
import type { CsvBaseMarker } from '../csv/views/csvSidebarAdapter';
import type { AudioBaseMarker } from '../audio/views/audioSidebarAdapter';
import type { VideoBaseMarker } from '../video/views/videoSidebarAdapter';

export const CODE_DETAIL_VIEW_TYPE = 'qualia-code-detail';

export class UnifiedCodeDetailView extends BaseCodeDetailView {
	private mdModel: CodeMarkerModel | null;

	constructor(leaf: WorkspaceLeaf, model: SidebarModelInterface, mdModel: CodeMarkerModel | null) {
		super(leaf, model);
		this.mdModel = mdModel;
	}

	getViewType(): string {
		return CODE_DETAIL_VIEW_TYPE;
	}

	getMarkerLabel(marker: BaseMarker): string {
		if (isPdfMarker(marker)) {
			if (marker.isShape && marker.shapeLabel) return marker.shapeLabel;
			const text = marker.text;
			if (text) return text.length > 60 ? text.substring(0, 60) + '...' : text;
			return `Page ${marker.page}`;
		}
		if (isImageMarker(marker)) {
			return marker.shapeLabel;
		}
		if (isCsvMarker(marker)) {
			if (marker.markerText) {
				return marker.markerText.length > 60 ? marker.markerText.substring(0, 60) + '...' : marker.markerText;
			}
			return marker.markerLabel;
		}
		if (isAudioMarker(marker)) {
			return marker.markerLabel;
		}
		if (isVideoMarker(marker)) {
			return marker.markerLabel;
		}
		// Markdown
		const md = marker as Marker;
		if (!this.mdModel) return md.text ? (md.text.length > 60 ? md.text.substring(0, 60) + '...' : md.text) : `Line ${md.range.from.line + 1}`;
		const view = this.mdModel.getViewForFile(md.fileId);
		if (!view?.editor) {
			if (md.text) return md.text.length > 60 ? md.text.substring(0, 60) + '...' : md.text;
			return `Line ${md.range.from.line + 1}`;
		}
		try {
			const text = view.editor.getRange(md.range.from, md.range.to);
			return text.length > 60 ? text.substring(0, 60) + '...' : text;
		} catch {
			if (md.text) return md.text.length > 60 ? md.text.substring(0, 60) + '...' : md.text;
			return `Line ${md.range.from.line + 1}`;
		}
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
			const file = this.app.vault.getAbstractFileByPath(marker.fileId);
			if (file instanceof TFile) {
				const leaf = this.app.workspace.getLeaf(false);
				leaf.openFile(file, { eState: { subpath: `#page=${marker.page}` } });
			}
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
		const name = parts[parts.length - 1] ?? fileId;
		return name.replace(/\.(md|pdf|csv|parquet|png|jpg|jpeg|gif|bmp|webp|avif|svg|mp3|m4a|wav|ogg|flac|aac|wma|aiff|opus|webm|mp4|ogv)$/i, '');
	}
}

function isPdfMarker(marker: BaseMarker): marker is PdfBaseMarker {
	return 'page' in marker && 'isShape' in marker;
}

function isImageMarker(marker: BaseMarker): marker is ImageBaseMarker {
	return 'shape' in marker && 'shapeLabel' in marker;
}

function isCsvMarker(marker: BaseMarker): marker is CsvBaseMarker {
	return 'rowIndex' in marker && 'columnId' in marker;
}

function isAudioMarker(marker: BaseMarker): marker is AudioBaseMarker {
	return 'mediaType' in marker && (marker as any).mediaType === 'audio';
}

function isVideoMarker(marker: BaseMarker): marker is VideoBaseMarker {
	return 'mediaType' in marker && (marker as any).mediaType === 'video';
}
