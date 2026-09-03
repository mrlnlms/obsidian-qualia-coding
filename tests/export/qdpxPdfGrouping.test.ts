import { describe, expect, it } from 'vitest';
import type { CodeApplication } from '../../src/core/types';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';
import type { ProjectedPdfMarker } from '../../src/export/qdpxPdfProjection';
import { buildQdpxPdfSelectionUnits } from '../../src/export/qdpxPdfGrouping';
import { deterministicQdpxGuid } from '../../src/export/qdpxStableGuid';

const SHARED = '11111111-1111-4111-8111-111111111111';
const PDF_CODING = '22222222-2222-4222-8222-222222222222';
const TEXT_CODING = '33333333-3333-4333-8333-333333333333';

function application(codeId: string, coder: string, guids = [PDF_CODING, TEXT_CODING]): CodeApplication {
	return {
		codeId,
		qdpx: {
			source: 'refi-qda-coding', sourceCodingGuids: guids,
			creatingUserGuid: coder, creationDateTime: '2026-01-01T00:00:00Z',
		},
	};
}

function projected(id: string, coder: string, codeId: string, overrides: Partial<PdfMarker> = {}): ProjectedPdfMarker {
	const marker: PdfMarker = {
		markerType: 'pdf', id, fileId: 'paper.pdf', page: 1,
		beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5,
		text: 'alpha', codes: [application(codeId, coder)], codedBy: `human:qdpx:${coder}`,
		importedQdpxSelection: {
			source: 'refi-qda-selection', selectionGuid: SHARED,
			creatingUserGuid: coder, name: 'alpha', creationDateTime: '2026-01-01T00:00:00Z',
		},
		createdAt: 1, updatedAt: 1,
		...overrides,
	};
	return {
		marker, startPosition: 0, endPosition: 5, text: marker.text,
		fragments: [{
			page: 1, startPosition: 0, endPosition: 5, text: marker.text,
			bbox: { firstX: 1, firstY: 2, secondX: 3, secondY: 4 },
		}],
	};
}

const context = {
	projectKey: 'project-1',
	authorGuidFor: (marker: PdfMarker) => marker.codes[0]?.qdpx?.creatingUserGuid,
};

describe('QDPX PDF grouping', () => {
	it('regroups coder-owned imported siblings and unions semantic codings', async () => {
		const carla = projected('carla', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'code-a');
		const joao = projected('joao', 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', 'code-b');
		joao.marker.importedQdpxSelection = { ...carla.marker.importedQdpxSelection! };
		const result = await buildQdpxPdfSelectionUnits('paper.pdf', [carla, joao], context);

		expect(result.units).toHaveLength(1);
		expect(result.units[0]!.selectionGuid).toBe(SHARED);
		expect(result.units[0]!.markerIds).toEqual(['carla', 'joao']);
		expect(result.units[0]!.codings).toHaveLength(2);
		expect(result.selectionGuidByMarkerId.get('carla')).toBe(SHARED);
		expect(new Set(result.units[0]!.codings.flatMap((coding) => [coding.plainTextCodingGuid, ...coding.pdfCodingGuids])).size).toBe(4);
	});

	it('never merges coincident native markers', async () => {
		const a = projected('native-a', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'code-a', { importedQdpxSelection: undefined });
		const b = projected('native-b', 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', 'code-a', { importedQdpxSelection: undefined });
		const result = await buildQdpxPdfSelectionUnits('paper.pdf', [a, b], context);
		expect(result.units).toHaveLength(2);
		expect(result.units[0]!.selectionGuid).not.toBe(result.units[1]!.selectionGuid);
	});

	it.each(['range', 'memo', 'relation', 'metadata'] as const)('splits an imported group after incompatible %s changes', async (change) => {
		const a = projected('a', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'code-a');
		const b = projected('b', 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', 'code-b');
		b.marker.importedQdpxSelection = { ...a.marker.importedQdpxSelection! };
		if (change === 'range') {
			b.endPosition = 4;
			b.text = 'alph';
			b.fragments[0] = { ...b.fragments[0]!, endPosition: 4, text: 'alph' };
		} else if (change === 'memo') {
			b.marker.memo = { content: 'different' };
		} else if (change === 'relation') {
			b.marker.codes[0]!.relations = [{ label: 'supports', target: 'code-z', directed: true }];
		} else {
			b.marker.importedQdpxSelection!.name = 'different';
		}

		const result = await buildQdpxPdfSelectionUnits('paper.pdf', [a, b], context);
		expect(result.units).toHaveLength(2);
		expect(result.units.every((unit) => unit.selectionGuid !== SHARED)).toBe(true);
	});

	it('produces stable identifiers for the same native semantic input', async () => {
		const input = projected('native', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'code-a', { importedQdpxSelection: undefined });
		const first = await buildQdpxPdfSelectionUnits('paper.pdf', [input], context);
		const second = await buildQdpxPdfSelectionUnits('paper.pdf', [input], context);
		expect(second.units[0]).toEqual(first.units[0]);
	});

	it('derives a valid deterministic UUIDv8', async () => {
		const first = await deterministicQdpxGuid('same');
		expect(first).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-8[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
		expect(await deterministicQdpxGuid('same')).toBe(first);
		expect(await deterministicQdpxGuid('different')).not.toBe(first);
	});
});
