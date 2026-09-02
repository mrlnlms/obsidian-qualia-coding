import { describe, expect, it } from 'vitest';
import {
	buildPdfMarginPanelLayout,
	pdfMarginRailKey,
	type PdfMarginPagePlacement,
	type PdfMarginPageSnapshot,
	type PdfMarginVisualSegment,
} from '../../src/pdf/pdfMarginPanelLayout';

function segment(overrides: Partial<PdfMarginVisualSegment> = {}): PdfMarginVisualSegment {
	return {
		key: pdfMarginRailKey('m1', 'c1'),
		markerId: 'm1',
		codeId: 'c1',
		codeName: 'Team self-organization',
		color: '#008866',
		ownerAbbreviation: 'JD',
		ownerName: 'Jessica Diaz',
		editable: false,
		pageNumber: 6,
		segmentIndex: 0,
		segmentCount: 2,
		topPct: 10,
		bottomPct: 95,
		...overrides,
	};
}

const placements: PdfMarginPagePlacement[] = [
	{ pageNumber: 6, topPx: 100, heightPx: 1000 },
	{ pageNumber: 7, topPx: 1120, heightPx: 1000 },
];

describe('buildPdfMarginPanelLayout', () => {
	const first: PdfMarginPageSnapshot = { pageNumber: 6, entries: [segment()] };
	const last: PdfMarginPageSnapshot = {
		pageNumber: 7,
		entries: [segment({
			pageNumber: 7,
			segmentIndex: 1,
			topPct: 5,
			bottomPct: 40,
		})],
	};

	it('projects one rail across the real page gap', () => {
		expect(buildPdfMarginPanelLayout([first, last], placements)[0])
			.toMatchObject({ top: 200, bottom: 1520, center: 860, lane: 0 });
	});

	it('uses page boundaries for partial rails', () => {
		expect(buildPdfMarginPanelLayout([first], placements)[0])
			.toMatchObject({ top: 200, bottom: 1100, center: 650 });
		expect(buildPdfMarginPanelLayout([last], placements)[0])
			.toMatchObject({ top: 1120, bottom: 1520, center: 1320 });
	});

	it('converges independently of page arrival order', () => {
		expect(buildPdfMarginPanelLayout([first, last], placements))
			.toEqual(buildPdfMarginPanelLayout([last, first], placements));
	});

	it('keeps codes and coders independent', () => {
		const entries = [
			segment(),
			segment({
				key: pdfMarginRailKey('m1', 'c2'),
				codeId: 'c2',
				codeName: 'Automation',
			}),
			segment({
				key: pdfMarginRailKey('m2', 'c1'),
				markerId: 'm2',
				ownerAbbreviation: 'JEPM',
			}),
		];
		const result = buildPdfMarginPanelLayout([{ pageNumber: 6, entries }], placements);
		expect(result).toHaveLength(3);
		expect(result.map((rail) => rail.lane)).toEqual([0, 1, 2]);
	});

	it('reprojects percentages after zoom', () => {
		const zoomed = [
			{ pageNumber: 6, topPx: 200, heightPx: 2000 },
			{ pageNumber: 7, topPx: 2240, heightPx: 2000 },
		];
		expect(buildPdfMarginPanelLayout([first, last], zoomed)[0])
			.toMatchObject({ top: 400, bottom: 3040, center: 1720 });
	});
});
