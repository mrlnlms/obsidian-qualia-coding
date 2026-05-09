/**
 * TextRange — espaço linear de coordenadas normalizado por engine.
 *
 * Adapter por engine converte marker → TextRange. Comparações κ usam (fileId, locator)
 * como scope: markers em scopes diferentes não comparam.
 */

import type { Marker } from '../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../csv/csvCodingTypes';

export interface TextRange {
	fileId: string;
	/** markdown: '' | PDF: 'page:N' | CSV: 'row:R|col:C' */
	locator: string;
	from: number;  // inclusive
	to: number;    // exclusive
}

/** Markdown precisa de source text pra converter line/ch em char absoluto.
 *  Caller resolve source via vault.read antes de chamar. */
export function extractMarkdownRange(m: Marker, sourceText: string): TextRange {
	const fromAbs = lineChToAbsolute(sourceText, m.range.from.line, m.range.from.ch);
	const toAbs = lineChToAbsolute(sourceText, m.range.to.line, m.range.to.ch);
	return { fileId: m.fileId, locator: '', from: fromAbs, to: toAbs };
}

export function extractPdfRange(m: PdfMarker): TextRange {
	return { fileId: m.fileId, locator: `page:${m.page}`, from: m.beginIndex, to: m.endIndex };
}

export function extractCsvSegmentRange(m: SegmentMarker): TextRange {
	return {
		fileId: m.fileId,
		locator: `row:${m.sourceRowId}|col:${m.column}`,
		from: m.from,
		to: m.to,
	};
}

/** Converte (line 0-based, ch 0-based) em char offset absoluto no source. */
function lineChToAbsolute(src: string, line: number, ch: number): number {
	let pos = 0;
	let curLine = 0;
	for (let i = 0; i < src.length; i++) {
		if (curLine === line) return pos + ch;
		if (src[i] === '\n') curLine++;
		pos++;
	}
	return pos + ch;
}
