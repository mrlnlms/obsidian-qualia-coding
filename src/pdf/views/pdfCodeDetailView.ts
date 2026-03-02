/**
 * PDF Code Detail View — extends BaseCodeDetailView.
 * Gains for free: search filter, memo, color override, delete code/segment,
 * segments-by-file tree, editable description, hover sync.
 */

import { WorkspaceLeaf, TFile } from 'obsidian';
import { BaseCodeDetailView } from '../../core/baseCodeDetailView';
import { BaseMarker } from '../../core/types';
import { PdfCodingModel } from '../pdfCodingModel';
import { PdfSidebarAdapter, PdfBaseMarker } from './pdfSidebarAdapter';

export const PDF_CODE_DETAIL_VIEW_TYPE = 'qualia-pdf-detail';

export class PdfCodeDetailView extends BaseCodeDetailView {
	private pdfModel: PdfCodingModel;

	constructor(leaf: WorkspaceLeaf, model: PdfCodingModel) {
		super(leaf, new PdfSidebarAdapter(model));
		this.pdfModel = model;
	}

	getViewType(): string {
		return PDF_CODE_DETAIL_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.codeName) return this.codeName;
		return 'PDF Code Detail';
	}

	getMarkerLabel(marker: BaseMarker): string {
		const pdf = marker as PdfBaseMarker;
		if (pdf.isShape && pdf.shapeLabel) return pdf.shapeLabel;
		const text = pdf.text;
		if (text) {
			return text.length > 60 ? text.substring(0, 60) + '...' : text;
		}
		return `Page ${pdf.page}`;
	}

	getMarkerText(marker: BaseMarker): string | null {
		const pdf = marker as PdfBaseMarker;
		if (pdf.isShape) return null;
		return pdf.text || null;
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
