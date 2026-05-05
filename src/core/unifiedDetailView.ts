/**
 * Unified Code Detail — single sidebar view for ALL engines (markdown, PDF, etc.).
 * Detects marker type and delegates label/text/navigation/path to the appropriate logic.
 */

import { WorkspaceLeaf } from 'obsidian';
import { BaseCodeDetailView, type AuditAccess, type MemoMaterializerAccess } from './baseCodeDetailView';
import type { BaseMarker, SidebarModelInterface } from './types';
import type { CodeMarkerModel, Marker } from '../markdown/models/codeMarkerModel';
import { isPdfMarker, isImageMarker, isCsvMarker, isAudioMarker, isVideoMarker, shortenPath as _shortenPath, getMarkerLabel as _getMarkerLabel } from './markerResolvers';
import { navigateToMarker } from './navigateToMarker';

export const CODE_DETAIL_VIEW_TYPE = 'qualia-code-detail';

export class UnifiedCodeDetailView extends BaseCodeDetailView {
	private mdModel: CodeMarkerModel | null;

	constructor(
		leaf: WorkspaceLeaf,
		model: SidebarModelInterface,
		mdModel: CodeMarkerModel | null,
		auditAccess?: AuditAccess,
		memoAccess?: MemoMaterializerAccess,
	) {
		super(leaf, model, auditAccess, memoAccess);
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
		await navigateToMarker(this.app, marker, this.mdModel);
	}

	shortenPath(fileId: string): string {
		return _shortenPath(fileId);
	}
}
