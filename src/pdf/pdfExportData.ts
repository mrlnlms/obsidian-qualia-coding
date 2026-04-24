/**
 * Loads a PDF via pdfjs headless and extracts everything the QDPX exporter needs
 * in a single pass: consolidated PlainText with per-page offsets (for text
 * markers) and per-page dimensions (for shape markers).
 *
 * No caching. Run once at export time.
 */

import type { App, TFile } from 'obsidian';
import { buildPlainText } from './pdfPlainText';

export interface PdfExportData {
	plainText: string;
	pageStartOffsets: number[];
	pageDims: Record<number, { width: number; height: number }>;
}

/**
 * `window.pdfjsLib` is only populated after the Obsidian core PDF viewer
 * opens a PDF for the first time. In a fresh vault where no PDF has been
 * opened yet, imports would fall back to US Letter defaults (612x792).
 * Force-load the lib by opening the file in a temporary leaf, then detach.
 */
async function ensurePdfJsLoaded(app: App, filePath: string): Promise<void> {
	if ((window as any).pdfjsLib) return;
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!file || !('stat' in file)) {
		throw new Error(`PDF not found in vault: ${filePath}`);
	}
	const leaf = app.workspace.getLeaf('tab');
	// Hide the leaf chrome so the user doesn't see a momentary blank PDF tab.
	const tabHeader = (leaf as any).tabHeaderEl as HTMLElement | undefined;
	const container = (leaf as any).containerEl as HTMLElement | undefined;
	tabHeader?.style.setProperty('display', 'none');
	container?.style.setProperty('visibility', 'hidden');
	try {
		await leaf.openFile(file as TFile, { active: false });
		const start = Date.now();
		while (!(window as any).pdfjsLib && Date.now() - start < 5000) {
			await new Promise(r => setTimeout(r, 50));
		}
	} finally {
		leaf.detach();
	}
	if (!(window as any).pdfjsLib) {
		throw new Error('pdfjsLib did not load within 5s timeout');
	}
}

export async function loadPdfExportData(
	app: App,
	filePath: string,
): Promise<PdfExportData> {
	await ensurePdfJsLoaded(app, filePath);
	const buffer = await app.vault.adapter.readBinary(filePath);
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
