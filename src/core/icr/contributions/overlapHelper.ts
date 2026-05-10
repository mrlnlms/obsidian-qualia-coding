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

import { extractMarkdownRange, extractPdfRange, extractCsvSegmentRange } from '../textRange';
import type { TextRange } from '../textRange';
import { computeOverlap } from '../overlap';

export type EngineForOverlap = 'markdown' | 'pdf' | 'csvSegment';

export function findOverlappingLocalMarkers<M extends { id: string; fileId: string }>(
	engine: EngineForOverlap,
	incoming: M,
	local: M[],
	sourceText?: string,
): M[] {
	const incRange = extractRange(engine, incoming, sourceText);
	if (!incRange) return [];

	const matches: M[] = [];
	for (const l of local) {
		if (l.fileId !== incoming.fileId) continue;
		const lRange = extractRange(engine, l, sourceText);
		if (!lRange) continue;
		// computeOverlap retorna null se locator difere ou sem overlap (verificado overlap.ts:14)
		if (computeOverlap(incRange, lRange) !== null) {
			matches.push(l);
		}
	}
	return matches;
}

function extractRange(engine: EngineForOverlap, marker: any, sourceText?: string): TextRange | null {
	if (engine === 'markdown') {
		if (!sourceText) return null; // modo degraded
		return extractMarkdownRange(marker, sourceText);
	}
	if (engine === 'pdf') return extractPdfRange(marker);
	if (engine === 'csvSegment') return extractCsvSegmentRange(marker);
	return null;
}
