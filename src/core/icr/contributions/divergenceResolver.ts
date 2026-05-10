/**
 * divergenceResolver — função pura que computa contagem N_in / N_out + breakdown
 * conforme spec §4.2. Espelha o que mergeCoderContribution(..., { dryRun: true })
 * faria ao Apply, mas isolado pra display no footer da view.
 *
 * Precedência: skipSource ⊃ skipCode ⊃ skipMarker ⊃ pending. Sem dupla contagem.
 */

import type { MergeResult, PayloadV1 } from '../transport/payloadTypes';
import type { ResolutionOverrides } from './contributionViewTypes';

export interface BreakdownResult {
	N_in: number;
	N_out: number;
	breakdown: {
		pending: number;
		skipSource: number;
		skipCode: number;
		skipMarker: number;
	};
}

export function computeBreakdown(
	merge: MergeResult,
	overrides: ResolutionOverrides,
	payload: PayloadV1,
): BreakdownResult {
	let skipSource = 0;
	let skipCode = 0;
	let skipMarker = 0;

	const visit = (markerId: string, fileId: string, codeIds: string[]): void => {
		// Precedência: skipSource > skipCode > skipMarker (early-return)
		if (overrides.sourceOverrides.get(fileId) === 'skip-source') {
			skipSource++;
			return;
		}
		if (codeIds.some(cid => overrides.perCodeSkip.has(cid))) {
			skipCode++;
			return;
		}
		if (overrides.perMarkerSkip.has(markerId)) {
			skipMarker++;
			return;
		}
	};

	// markdown
	for (const [fid, markers] of Object.entries(payload.markers.markdown)) {
		for (const m of markers) {
			const codeIds = (m as any).codes?.map((c: any) => c.codeId) ?? [];
			visit((m as any).id, fid, codeIds);
		}
	}
	// pdf
	for (const m of payload.markers.pdf) {
		const codeIds = (m as any).codes?.map((c: any) => c.codeId) ?? [];
		visit(m.id, m.fileId, codeIds);
	}
	// csvSegment
	for (const m of payload.markers.csvSegment) {
		const codeIds = (m as any).codes?.map((c: any) => c.codeId) ?? [];
		visit(m.id, m.fileId, codeIds);
	}

	// Pending puro = markers cujo source não remappeou (motor reportou) MENOS o que veio
	// de overrides explícitas (motor conta skip-source também em pendingMarkers).
	const overrideContrib = skipSource + skipCode + skipMarker;
	const pending = Math.max(0, merge.pendingMarkers - overrideContrib);
	const N_out = skipSource + skipCode + skipMarker + pending;

	const totalMarkers = countTotalMarkers(payload);
	const N_in = totalMarkers - N_out;

	return {
		N_in,
		N_out,
		breakdown: { pending, skipSource, skipCode, skipMarker },
	};
}

function countTotalMarkers(payload: PayloadV1): number {
	let total = 0;
	for (const markers of Object.values(payload.markers.markdown)) total += markers.length;
	total += payload.markers.pdf.length;
	total += payload.markers.csvSegment.length;
	return total;
}
