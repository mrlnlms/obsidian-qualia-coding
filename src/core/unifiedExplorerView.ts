/**
 * Unified Code Explorer — single sidebar view for ALL engines (markdown, PDF, etc.).
 * Detects marker type and delegates label/navigation/path to the appropriate logic.
 */

import { WorkspaceLeaf } from 'obsidian';
import { BaseCodeExplorerView } from './baseCodeExplorerView';
import type { BaseMarker, SidebarModelInterface } from './types';
import type { CodeMarkerModel } from '../markdown/models/codeMarkerModel';
import { shortenPath as _shortenPath, getMarkerLabel as _getMarkerLabel } from './markerResolvers';
import { navigateToMarker } from './navigateToMarker';

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
		await navigateToMarker(this.app, marker, this.mdModel);
	}

	shortenPath(fileId: string): string {
		return _shortenPath(fileId);
	}
}
