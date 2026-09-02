import {
	layoutMarginRails,
	type MarginRailInput,
	type MarginRailLayout,
} from '../core/marginPanelLayout';

export function pdfMarginRailKey(markerId: string, codeId: string): string {
	return JSON.stringify([markerId, codeId]);
}

export interface PdfMarginVisualSegment extends Omit<MarginRailInput, 'top' | 'bottom'> {
	pageNumber: number;
	segmentIndex: number;
	segmentCount: number;
	topPct: number;
	bottomPct: number;
}

export interface PdfMarginPageSnapshot {
	pageNumber: number;
	entries: PdfMarginVisualSegment[];
}

export interface PdfMarginPagePlacement {
	pageNumber: number;
	topPx: number;
	heightPx: number;
}

interface PlacedSegment {
	entry: PdfMarginVisualSegment;
	placement: PdfMarginPagePlacement;
}

export function buildPdfMarginRailInputs(
	snapshots: readonly PdfMarginPageSnapshot[],
	placements: readonly PdfMarginPagePlacement[],
): MarginRailInput[] {
	const placementByPage = new Map(
		placements.map((placement) => [placement.pageNumber, placement]),
	);
	const groups = new Map<string, PlacedSegment[]>();

	for (const snapshot of snapshots) {
		for (const entry of snapshot.entries) {
			const placement = placementByPage.get(entry.pageNumber);
			if (!placement) continue;
			const group = groups.get(entry.key) ?? [];
			group.push({ entry, placement });
			groups.set(entry.key, group);
		}
	}

	const inputs: MarginRailInput[] = [];
	for (const key of [...groups.keys()].sort()) {
		const segments = groups.get(key)!;
		segments.sort((a, b) =>
			a.entry.segmentIndex - b.entry.segmentIndex
			|| a.entry.pageNumber - b.entry.pageNumber,
		);

		const first = segments[0]!;
		const last = segments[segments.length - 1]!;
		const hasFirstEndpoint = first.entry.segmentIndex === 0;
		const hasLastEndpoint = last.entry.segmentIndex === last.entry.segmentCount - 1;
		const top = hasFirstEndpoint
			? projectPercentage(first.entry.topPct, first.placement)
			: first.placement.topPx;
		const bottom = hasLastEndpoint
			? projectPercentage(last.entry.bottomPct, last.placement)
			: last.placement.topPx + last.placement.heightPx;

		inputs.push({
			key,
			markerId: first.entry.markerId,
			codeId: first.entry.codeId,
			codeName: first.entry.codeName,
			color: first.entry.color,
			ownerAbbreviation: first.entry.ownerAbbreviation,
			ownerName: first.entry.ownerName,
			editable: first.entry.editable,
			top,
			bottom,
		});
	}

	return inputs;
}

export function buildPdfMarginPanelLayout(
	snapshots: readonly PdfMarginPageSnapshot[],
	placements: readonly PdfMarginPagePlacement[],
): MarginRailLayout[] {
	return layoutMarginRails(buildPdfMarginRailInputs(snapshots, placements));
}

function projectPercentage(
	percentage: number,
	placement: PdfMarginPagePlacement,
): number {
	return placement.topPx + placement.heightPx * percentage / 100;
}
