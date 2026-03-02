/**
 * PDF Code Explorer — extends BaseCodeExplorerView.
 * Gains for free: persistent toolbar, search filter, collapse logic,
 * ExtraButtonComponent icons, footer, hover sync.
 */

import { WorkspaceLeaf, TFile } from 'obsidian';
import { BaseCodeExplorerView } from '../../core/baseCodeExplorerView';
import { BaseMarker } from '../../core/types';
import { PdfCodingModel } from '../pdfCodingModel';
import { PdfSidebarAdapter, PdfBaseMarker } from './pdfSidebarAdapter';

export const PDF_CODE_EXPLORER_VIEW_TYPE = 'qualia-pdf-explorer';

export class PdfCodeExplorerView extends BaseCodeExplorerView {
	private pdfModel: PdfCodingModel;

	constructor(leaf: WorkspaceLeaf, model: PdfCodingModel) {
		super(leaf, new PdfSidebarAdapter(model));
		this.pdfModel = model;
	}

	getViewType(): string {
		return PDF_CODE_EXPLORER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'PDF Code Explorer';
	}

	getMarkerLabel(marker: BaseMarker): string {
		const pdf = marker as PdfBaseMarker;
		if (pdf.isShape && pdf.shapeLabel) return pdf.shapeLabel;
		const text = pdf.text;
		if (text) {
			return text.length > 50 ? text.substring(0, 50) + '...' : text;
		}
		return `Page ${pdf.page}`;
	}

	navigateToMarker(marker: BaseMarker): void {
		const pdf = marker as PdfBaseMarker;
		const file = this.app.vault.getAbstractFileByPath(pdf.fileId);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			leaf.openFile(file, { eState: { subpath: `#page=${pdf.page}` } });
		}
	}

	shortenPath(fileId: string): string {
		const parts = fileId.split('/');
		return (parts[parts.length - 1] ?? fileId).replace('.pdf', '');
	}
}
