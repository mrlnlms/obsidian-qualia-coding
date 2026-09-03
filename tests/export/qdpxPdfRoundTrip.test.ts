import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { DataManager } from '../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { CoderRegistry } from '../../src/core/icr/coderRegistry';
import { CaseVariablesRegistry } from '../../src/core/caseVariables/caseVariablesRegistry';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';
import { exportProject } from '../../src/export/qdpxExporter';
import { importQdpx } from '../../src/import/qdpxImporter';

vi.mock('../../src/pdf/pdfExportData', () => ({
	loadPdfExportData: vi.fn(async () => ({
		plainText: `alpha quotation begins on first page${String.fromCharCode(12)}and continues clearly on second page`,
		pageStartOffsets: [0, 37],
		pageDims: { 0: { width: 100, height: 100 }, 1: { width: 100, height: 100 } },
		pageTextItems: [
			[{ str: 'alpha quotation begins on first page', dir: 'ltr', width: 80, height: 10, transform: [1, 0, 0, 1, 10, 70] }],
			[{ str: 'and continues clearly on second page', dir: 'ltr', width: 80, height: 10, transform: [1, 0, 0, 1, 10, 60] }],
		],
	})),
}));

const SELECTION = '11111111-1111-4111-8111-111111111111';
const CONTINUATION = '22222222-2222-4222-8222-222222222222';
const CARLA = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const JOAO = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';

function plugin() {
	let stored: unknown = null;
	return {
		loadData: vi.fn(async () => stored),
		saveData: vi.fn(async (data) => { stored = data; }),
	};
}

function sourceApp() {
	return {
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => ({ path, extension: 'pdf' })),
			readBinary: vi.fn(async () => new Uint8Array([37, 80, 68, 70]).buffer),
		},
	};
}

function marker(id: string, coderId: string, coderGuid: string, codeId: string, codingBase: number): PdfMarker {
	const codingGuid = (offset: number) => `${codingBase + offset}`.padStart(8, '0') + '-3333-4333-8333-333333333333';
	return {
		markerType: 'pdf', id, fileId: 'paper.pdf', page: 1,
		beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 36,
		text: `alpha quotation begins on first page${String.fromCharCode(12)}and continues clearly on second page`,
		segments: [
			{ page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 36, text: 'alpha quotation begins on first page', importedSelectionGuid: SELECTION, resolution: 'resolved' },
			{ page: 2, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 36, text: 'and continues clearly on second page', importedSelectionGuid: CONTINUATION, resolution: 'resolved' },
		],
		codes: [{
			codeId, magnitude: 'high',
			qdpx: {
				source: 'refi-qda-coding',
				sourceCodingGuids: [codingGuid(0), codingGuid(1), codingGuid(2)],
				creatingUserGuid: coderGuid,
				creationDateTime: '2026-01-02T00:00:00.000Z',
			},
		}],
		memo: { content: 'shared memo' }, codedBy: coderId,
		importedQdpxSelection: {
			source: 'refi-qda-selection', selectionGuid: SELECTION,
			selectionGuids: [SELECTION, CONTINUATION], creatingUserGuid: CARLA,
			name: 'alpha quotation begins on first page and continues clearly on second page', creationDateTime: '2026-01-01T00:00:00.000Z',
		},
		createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
		updatedAt: Date.parse('2026-01-01T00:00:00.000Z'),
	};
}

describe('PDF QDPX Qualia round-trip', () => {
	let data: DataManager;
	let codes: CodeDefinitionRegistry;
	let coders: CoderRegistry;

	beforeEach(async () => {
		data = new DataManager(plugin() as any);
		await data.load();
		codes = new CodeDefinitionRegistry();
		coders = new CoderRegistry();
	});

	it('exports, imports, and re-exports one shared multipage quotation without coder duplication', async () => {
		const carla = coders.resolveOrCreateExternalHuman('Carla', { scheme: 'refi-qda-user-guid', value: CARLA });
		const joao = coders.resolveOrCreateExternalHuman('João', { scheme: 'refi-qda-user-guid', value: JOAO });
		const code = codes.create('Theme', '#ff0000');
		const pdf = data.section('pdf');
		pdf.markers.push(
			marker('carla-marker', carla.id, CARLA, code.id, 10000000),
			marker('joao-marker', joao.id, JOAO, code.id, 20000000),
		);
		data.setSection('pdf', pdf);

		const options = {
			format: 'qdpx' as const, includeSources: true, fileName: 'roundtrip.qdpx',
			vaultName: 'Roundtrip', pluginVersion: '1.0.0',
		};
		const first = await exportProject(sourceApp() as any, data, codes, coders, options, new CaseVariablesRegistry());
		const firstXml = strFromU8(unzipSync(first.data as Uint8Array)['project.qde']!);
		expect(firstXml.match(/<PDFSelection /g)).toHaveLength(2);
		expect(firstXml.match(/<PlainTextSelection /g)).toHaveLength(1);
		expect(firstXml.match(/<Coding /g)).toHaveLength(6);
		expect(firstXml.match(/<User /g)).toHaveLength(2);

		const importedData = new DataManager(plugin() as any);
		await importedData.load();
		const importedCodes = new CodeDefinitionRegistry();
		const importedCoders = new CoderRegistry();
		const importedFiles = new Map<string, string | ArrayBuffer>();
		const importApp = {
			vault: {
				adapter: {
					exists: vi.fn(async () => false), mkdir: vi.fn(async () => undefined),
					write: vi.fn(async (path: string, content: string) => { importedFiles.set(path, content); }),
					writeBinary: vi.fn(async (path: string, content: ArrayBuffer) => { importedFiles.set(path, content); }),
				},
			},
		};
		await importQdpx(
			new Uint8Array(first.data as Uint8Array).buffer,
			importApp as any, importedData, importedCodes,
			{ conflictStrategy: 'merge', keepOriginalSources: true, projectName: 'Roundtrip', participation: { mode: 'read-only' } },
			{ coderRegistry: importedCoders, setCodingParticipation: vi.fn() },
		);

		const importedMarkers = importedData.section('pdf').markers;
		expect(importedMarkers).toHaveLength(2);
		expect(importedMarkers.every((item) => item.segments?.length === 2)).toBe(true);
		expect(importedMarkers.every((item) => item.codes[0]?.magnitude === 'high')).toBe(true);
		expect(importedMarkers.every((item) => item.memo?.content === 'shared memo')).toBe(true);

		const second = await exportProject(
			sourceApp() as any, importedData, importedCodes, importedCoders,
			{ ...options, fileName: 'roundtrip-2.qdpx' }, new CaseVariablesRegistry(),
		);
		const secondXml = strFromU8(unzipSync(second.data as Uint8Array)['project.qde']!);
		expect(secondXml.match(/<PDFSelection /g)).toHaveLength(2);
		expect(secondXml.match(/<PlainTextSelection /g)).toHaveLength(1);
		expect(secondXml.match(/<Coding /g)).toHaveLength(6);
		expect([...secondXml.matchAll(/<PDFSelection guid="([^"]+)"/g)].map((match) => match[1])).toEqual([SELECTION, CONTINUATION]);
	});
});
