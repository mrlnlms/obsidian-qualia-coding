import { describe, expect, it } from 'vitest';
import type { QdpxPdfSelectionUnit } from '../../src/export/qdpxPdfGrouping';
import { serializeQdpxPdfSelectionUnit } from '../../src/export/qdpxPdfSerializer';

function unit(): QdpxPdfSelectionUnit {
	return {
		key: 'unit',
		selectionGuid: '11111111-1111-4111-8111-111111111111',
		markerIds: ['m1', 'm2'], sourceId: 'paper.pdf', name: 'alpha beta',
		creationDateTime: '2026-01-01T00:00:00.000Z',
		creatingUserGuid: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
		startPosition: 10, endPosition: 30, text: `alpha${String.fromCharCode(12)}beta`,
		fragments: [
			{ page: 1, startPosition: 10, endPosition: 15, text: 'alpha', selectionGuid: '11111111-1111-4111-8111-111111111111', bbox: { firstX: 1, firstY: 2, secondX: 3, secondY: 4 } },
			{ page: 2, startPosition: 16, endPosition: 30, text: 'beta', selectionGuid: '22222222-2222-4222-8222-222222222222', bbox: { firstX: 5, firstY: 6, secondX: 7, secondY: 8 } },
		],
		codings: [{
			application: { codeId: 'code-a', magnitude: 'high' }, markerId: 'm1',
			creatingUserGuid: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
			creationDateTime: '2026-01-02T00:00:00.000Z', semanticKey: 'coding-a',
			pdfCodingGuids: ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'],
			plainTextCodingGuid: '55555555-5555-4555-8555-555555555555',
		}],
		memo: { content: 'selection memo' },
	};
}

describe('QDPX PDF serializer', () => {
	it('emits paired text/visual selections and ordered continuation topology', async () => {
		const serialized = await serializeQdpxPdfSelectionUnit(unit(), {
			projectKey: 'project', sourceName: 'paper.pdf', codeGuidFor: () => '66666666-6666-4666-8666-666666666666',
		});

		expect(serialized.plainTextSelectionXml).toContain('guid="11111111-1111-4111-8111-111111111111"');
		expect(serialized.plainTextSelectionXml).toContain('startPosition="10" endPosition="30"');
		expect(serialized.plainTextSelectionXml).toContain('guid="55555555-5555-4555-8555-555555555555"');
		expect(serialized.pdfSelectionsXml.match(/<PDFSelection /g)).toHaveLength(2);
		expect(serialized.pdfSelectionsXml).toContain('page="0"');
		expect(serialized.pdfSelectionsXml).toContain('page="1"');
		expect(serialized.pdfSelectionsXml).toContain('guid="33333333-3333-4333-8333-333333333333"');
		expect(serialized.pdfSelectionsXml).toContain('guid="44444444-4444-4444-8444-444444444444"');
		expect(serialized.continuedByLinks).toEqual([]);
	});

	it('repeats the semantic Coding set with distinct physical GUIDs and shared memo', async () => {
		const serialized = await serializeQdpxPdfSelectionUnit(unit(), {
			projectKey: 'project', sourceName: 'paper.pdf', codeGuidFor: () => '66666666-6666-4666-8666-666666666666',
		});
		const xml = [serialized.plainTextSelectionXml, serialized.pdfSelectionsXml].join(String.fromCharCode(10));
		expect(xml.match(/<Coding /g)).toHaveLength(3);
		expect(new Set([...xml.matchAll(/<Coding guid="([^"]+)"/g)].map((match) => match[1])).size).toBe(3);
		expect(xml.match(/<NoteRef /g)).toHaveLength(6);
		expect(serialized.notesXml.some((note) => note.includes('selection memo'))).toBe(true);
		expect(serialized.notesXml.filter((note) => note.includes('[Magnitude: high]'))).toHaveLength(3);
	});

	it('serializes PDF bounding boxes as schema-valid integers', async () => {
		const input = unit();
		input.fragments[0]!.bbox = { firstX: 1.4, firstY: 2.5, secondX: 3.6, secondY: 4.49 };
		const serialized = await serializeQdpxPdfSelectionUnit(input, {
			projectKey: 'project', sourceName: 'paper.pdf', codeGuidFor: () => '66666666-6666-4666-8666-666666666666',
		});

		expect(serialized.pdfSelectionsXml).toContain('firstX="1" firstY="3" secondX="4" secondY="4"');
	});
});
