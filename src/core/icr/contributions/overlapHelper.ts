/**
 * findOverlappingLocalMarkers — dado um marker incoming + lista de locals,
 * retorna locals que sobrepõem espacialmente. Usa helpers existentes do kappa motor
 * (extract*Range + computeOverlap).
 *
 * Engine cobertos: markdown, pdf, csvSegment (alinhado com PayloadV1).
 *
 * Markdown overlap requer sourceText (extractMarkdownRange precisa pra resolver
 * line/ch em char absoluto). Quando ausente, retorna [] — modo degraded
 * documentado em spec/plan. PDF e CSV são puros, funcionam sem source.
 */

import { extractMarkdownRange, extractPdfRanges, extractCsvSegmentRange } from '../textRange';
import type { TextRange } from '../textRange';
import { computeOverlap } from '../overlap';

export type EngineForOverlap = 'markdown' | 'pdf' | 'csvSegment';

export function findOverlappingLocalMarkers<M extends { id: string; fileId: string }>(
	engine: EngineForOverlap,
	incoming: M,
	local: M[],
	sourceText?: string,
): M[] {
	const incRanges = extractRanges(engine, incoming, sourceText);
	if (!incRanges.length) return [];

	const matches: M[] = [];
	for (const l of local) {
		if (l.fileId !== incoming.fileId) continue;
		const localRanges = extractRanges(engine, l, sourceText);
		// computeOverlap retorna null se locator difere ou sem overlap (verificado overlap.ts:14)
		if (incRanges.some(incRange => localRanges.some(localRange => computeOverlap(incRange, localRange) !== null))) {
			matches.push(l);
		}
	}
	return matches;
}

function extractRanges(engine: EngineForOverlap, marker: any, sourceText?: string): TextRange[] {
	if (engine === 'markdown') {
		if (!sourceText) return []; // modo degraded
		return [extractMarkdownRange(marker, sourceText)];
	}
	if (engine === 'pdf') return extractPdfRanges(marker);
	if (engine === 'csvSegment') return [extractCsvSegmentRange(marker)];
	return [];
}
