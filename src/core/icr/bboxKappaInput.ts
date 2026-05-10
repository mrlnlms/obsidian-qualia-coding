/**
 * Converte AlignmentEvent[] em CodedMarker[] compatível com KappaInput.
 *
 * Mapping:
 * - matched(a, b) at index i → 2 markers (coder A e B), AMBOS com range.from=i, range.to=i+1.
 *   Os 2 markers colidem na mesma char-key em explodeMarkersToCharLabels — comportamento
 *   desejado: a unit `i` tem AMBOS coders presentes (concordância espacial).
 * - unmatched_a(a) at index i → 1 marker do coder A no índice `i`. Coder B ausente nessa
 *   unit (motor κ trata como `__none__`).
 * - unmatched_b(b) at index i → simétrico.
 *
 * `iou` em matched events é metadata pra reporting downstream (não entra no κ).
 */

import type { AlignmentEvent } from './bboxMatcher';
import type { CoderId } from './coderTypes';
import type { CodedMarker } from './kappaInput';

interface BboxRef {
	id: string;
	codeIds: string[];
}

export function fromEvents(
	events: AlignmentEvent[],
	scope: string,
	coders: { a: CoderId; b: CoderId },
	bboxesA: BboxRef[],
	bboxesB: BboxRef[],
): CodedMarker[] {
	const markers: CodedMarker[] = [];
	const locator = `bbox:${scope}`;

	events.forEach((event, i) => {
		if (event.kind === 'matched') {
			markers.push({
				coderId: coders.a,
				range: { fileId: scope, locator, from: i, to: i + 1 },
				codeIds: bboxesA[event.aIndex]!.codeIds,
			});
			markers.push({
				coderId: coders.b,
				range: { fileId: scope, locator, from: i, to: i + 1 },
				codeIds: bboxesB[event.bIndex]!.codeIds,
			});
		} else if (event.kind === 'unmatched_a') {
			markers.push({
				coderId: coders.a,
				range: { fileId: scope, locator, from: i, to: i + 1 },
				codeIds: bboxesA[event.aIndex]!.codeIds,
			});
		} else {
			markers.push({
				coderId: coders.b,
				range: { fileId: scope, locator, from: i, to: i + 1 },
				codeIds: bboxesB[event.bIndex]!.codeIds,
			});
		}
	});

	return markers;
}
