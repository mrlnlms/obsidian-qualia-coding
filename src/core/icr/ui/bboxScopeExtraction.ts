/**
 * bboxScopeExtraction — Cohen κ per-pair pra pdfShape + image markers.
 *
 * Pathway separado de `scopeExtraction.ts` (cohort-level pra text-likes).
 * Bbox adapter (`bboxAdapter.buildKappaInput`) é per-pair (slice 6); UI
 * Compare Coders consome via este helper, retornando Cohen κ direto.
 *
 * Modes:
 * - 'unified': pdfShape + image num único KappaInput → engine label `'spatial-bbox'`
 *   (label só pra UI; reporter recebe `engine: 'pdfShape'` e calcula normal).
 *   Heatmap mostra como 1 coluna; matriz Mode A combina com text-likes.
 * - 'split': 2 KappaInputs separados (1 só pdfShape, 1 só image). Heatmap
 *   mostra 2 colunas distintas. User toggle `splitBboxEngines` no toolbar.
 *
 * α-binary, cu-α, Fleiss e α nominal **não são produzidos** por este helper —
 * bbox adapter reduz a binary categorical (matched / unmatched_a / unmatched_b),
 * pra qual só Cohen κ pareado faz sentido. Caller que quiser outros coeficientes
 * em bbox precisa de pathway diferente (fora de E2).
 */

import type { PdfShapeMarker } from '../../../pdf/pdfCodingTypes';
import type { ImageMarker } from '../../../image/imageCodingTypes';
import type { CoderId } from '../coderTypes';
import type { ComparisonScope } from './compareCodersTypes';
import { buildKappaInput } from '../bboxAdapter';
import { reportKappa } from '../reporter';

export interface BboxModels {
	pdf?: { getAllShapes(): PdfShapeMarker[] };
	image?: { getAllMarkers(): ImageMarker[] };
}

export interface BboxKappaParams {
	models: BboxModels;
	scope: ComparisonScope;
	pair: [CoderId, CoderId];
	mode: 'unified' | 'split';
	theta: number;
}

export interface BboxKappaResult {
	/** mode unified: pdfShape ∪ image como engine virtual 'spatial-bbox'. */
	spatialBbox?: number;
	/** mode split: pdfShape standalone. */
	pdfShape?: number;
	/** mode split: image standalone. */
	image?: number;
}

export function computeBboxKappaForPair(params: BboxKappaParams): BboxKappaResult {
	const { models, scope, pair, mode, theta } = params;
	const pdfAll = models.pdf?.getAllShapes() ?? [];
	const imgAll = models.image?.getAllMarkers() ?? [];

	const pdfFiltered = filterMarkers(pdfAll, scope, pair);
	const imgFiltered = filterMarkers(imgAll, scope, pair);

	if (pdfFiltered.length === 0 && imgFiltered.length === 0) return {};

	if (mode === 'unified') {
		const k = computePair(pdfFiltered, imgFiltered, pair, theta);
		return k !== undefined ? { spatialBbox: k } : {};
	}

	// split
	const result: BboxKappaResult = {};
	if (pdfFiltered.length > 0) {
		const pdfK = computePair(pdfFiltered, [], pair, theta);
		if (pdfK !== undefined) result.pdfShape = pdfK;
	}
	if (imgFiltered.length > 0) {
		const imgK = computePair([], imgFiltered, pair, theta);
		if (imgK !== undefined) result.image = imgK;
	}
	return result;
}

function computePair(
	pdfShapeMarkers: PdfShapeMarker[],
	imageMarkers: ImageMarker[],
	pair: [CoderId, CoderId],
	theta: number,
): number | undefined {
	if (pdfShapeMarkers.length === 0 && imageMarkers.length === 0) return undefined;
	const input = buildKappaInput({
		pdfShapeMarkers, imageMarkers,
		coders: { a: pair[0], b: pair[1] },
		theta,
	});
	if (input.markers.length === 0) return undefined;
	const report = reportKappa([{ engine: 'pdfShape', kappaInput: input }]);
	return report.aggregate.cohenKappa[`${pair[0]}|${pair[1]}`]
		?? report.aggregate.cohenKappa[`${pair[1]}|${pair[0]}`];
}

type AnyBboxMarker = PdfShapeMarker | ImageMarker;

function filterMarkers<T extends AnyBboxMarker>(markers: T[], scope: ComparisonScope, pair: [CoderId, CoderId]): T[] {
	return markers.filter(m => {
		if (m.codedBy !== pair[0] && m.codedBy !== pair[1]) return false;
		if (scope.codeIds && !m.codes.some(c => scope.codeIds!.includes(c.codeId))) return false;
		if (scope.fileIds && !scope.fileIds.includes(m.fileId)) return false;
		return true;
	});
}
