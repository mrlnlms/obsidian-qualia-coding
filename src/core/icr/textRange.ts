/**
 * TextRange — espaço linear de coordenadas normalizado por engine.
 *
 * Adapter por engine converte marker → TextRange. Comparações κ usam (fileId, locator)
 * como scope: markers em scopes diferentes não comparam.
 */

import type { Marker } from '../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../csv/csvCodingTypes';
import type { MediaMarker } from '../../media/mediaTypes';

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

/** Resolução temporal pra audio/video em segundos por tick.
 *  - `1` (default): unit = 1s. Alinhado com ATLAS.ti 25. Sub-segundo invisível.
 *  - `0.1`: unit = 100ms. Pra conversation analysis / turn-taking.
 *  - `0.01`: unit = 10ms. Pra prosody / micro-events.
 *  Granularidades menores aumentam unit space (totalUnits) linearmente — caso de uso forte. */
export type TemporalResolution = 1 | 0.1 | 0.01;

/** Áudio/vídeo — overlap temporal em ticks de `resolution` segundos.
 *  Math.floor/ceil arredonda pra inteiro (conservador, cobre todo segmento parcial).
 *  Em `resolution=1` (default), unit é 1 segundo — comportamento histórico preservado.
 *
 *  Snap-to-int (epsilon=1e-9) absorve ruído FP de `value/resolution` quando o valor é
 *  matematicamente exato — ex.: 0.07/0.01 = 7.000000000000001 em FP, snap → 7, evita
 *  ceil rebondar pra 8. */
const SNAP_EPS = 1e-9;

function snapAndRound(value: number, op: 'floor' | 'ceil'): number {
	const rounded = Math.round(value);
	if (Math.abs(value - rounded) < SNAP_EPS) return rounded;
	return op === 'floor' ? Math.floor(value) : Math.ceil(value);
}

export function extractMediaRange(m: MediaMarker, resolution: number = 1): TextRange {
	return {
		fileId: m.fileId,
		locator: m.markerType,
		from: snapAndRound(m.from / resolution, 'floor'),
		to: snapAndRound(m.to / resolution, 'ceil'),
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
