/**
 * Loads a PDF via pdfjs headless and extracts everything the QDPX exporter needs
 * in a single pass: consolidated PlainText with per-page offsets (for text
 * markers) and per-page dimensions (for shape markers).
 *
 * No caching. Run once at export time.
 */

import type { Vault } from 'obsidian';
import { buildPlainText } from './pdfPlainText';

export interface PdfExportData {
	plainText: string;
	pageStartOffsets: number[];
	pageDims: Record<number, { width: number; height: number }>;
}

export async function loadPdfExportData(
	vault: Vault,
	filePath: string,
): Promise<PdfExportData> {
	const buffer = await vault.adapter.readBinary(filePath);
	const pdfjsLib = window.pdfjsLib as unknown as { getDocument(src: any): { promise: Promise<any> } };
	const doc = await pdfjsLib.getDocument(new Uint8Array(buffer)).promise;

	try {
		const pageDims: Record<number, { width: number; height: number }> = {};
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const viewport = page.getViewport({ scale: 1 });
			// Convert 1-based pdfjs index to 0-based plugin index
			pageDims[i - 1] = { width: viewport.width, height: viewport.height };
		}

		const { plainText, pageStartOffsets } = await buildPlainText(doc);

		return { plainText, pageStartOffsets, pageDims };
	} finally {
		if (typeof doc.destroy === 'function') await doc.destroy();
	}
}
