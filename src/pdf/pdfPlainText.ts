/**
 * Build a canonical PlainText representation of a PDF for QDPX round-trip.
 *
 * - Items within a page join with ' ' (single space)
 * - Pages separate with '\f' (form feed)
 *
 * This is the same convention used to concatenate `.textLayerNode` textContent
 * when capturing/rendering anchors in the Obsidian viewer — keeps export/import
 * and runtime in a single textual universe.
 */

/**
 * Minimal duck-typed interface — compatible with pdfjs-dist PDFDocumentProxy
 * but lets us test without loading the real pdfjs.
 */
export interface PdfLikeDocument {
	numPages: number;
	getPage(n: number): Promise<{
		getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
	}>;
}

export interface PlainTextResult {
	plainText: string;
	/** Offset (inclusive) where each page begins in plainText. Length === numPages. */
	pageStartOffsets: number[];
}

export async function buildPlainText(doc: PdfLikeDocument): Promise<PlainTextResult> {
	const pageStartOffsets: number[] = [];
	let plainText = '';

	for (let i = 1; i <= doc.numPages; i++) {
		pageStartOffsets.push(plainText.length);
		const page = await doc.getPage(i);
		const content = await page.getTextContent();
		// Strip leading/trailing whitespace from each item so that items with
		// embedded padding (e.g. "Language: " + " Evaluating") don't produce
		// double spaces after join. Matches the Obsidian DOM text layer, which
		// renders items adjacently with clean single spacing.
		const pageText = content.items
			.map((item) => (item.str ?? '').trim())
			.filter((s) => s.length > 0)
			.join(' ');
		plainText += pageText;
		if (i < doc.numPages) plainText += '\f';
	}

	return { plainText, pageStartOffsets };
}
