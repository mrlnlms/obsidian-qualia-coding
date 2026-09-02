import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { DataManager } from '../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { CoderRegistry } from '../../src/core/icr/coderRegistry';
import { CaseVariablesRegistry } from '../../src/core/caseVariables/caseVariablesRegistry';
import { exportProject, isValidUuid } from '../../src/export/qdpxExporter';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';

vi.mock('../../src/pdf/pdfExportData', () => ({
	loadPdfExportData: vi.fn(async () => ({
		plainText: 'quoted passage',
		pageStartOffsets: [0],
		pageDims: { 0: { width: 612, height: 792 } },
	})),
}));

const CARLA_GUID = '11111111-1111-4111-8111-111111111111';
const JOAO_GUID = '22222222-2222-4222-8222-222222222222';

function mockPlugin() {
	let stored: unknown = null;
	return {
		loadData: vi.fn(async () => stored),
		saveData: vi.fn(async (data) => { stored = data; }),
	};
}

function marker(id: string, codeId: string, codedBy?: string, unattributed = false): PdfMarker {
	return {
		markerType: 'pdf', id, fileId: 'paper.pdf', page: 1,
		beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 13,
		text: 'quoted passage',
		codes: [{ codeId }],
		codedBy,
		importedQdpxSelection: unattributed ? {
			source: 'refi-qda-selection', selectionGuid: `${id}-source`, unattributedOwner: true,
		} : undefined,
		createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
		updatedAt: Date.parse('2026-01-02T03:04:05.000Z'),
	};
}

describe('full QDPX project authorship', () => {
	let dataManager: DataManager;
	let codeRegistry: CodeDefinitionRegistry;
	let coderRegistry: CoderRegistry;

	beforeEach(async () => {
		dataManager = new DataManager(mockPlugin() as any);
		await dataManager.load();
		codeRegistry = new CodeDefinitionRegistry();
		coderRegistry = new CoderRegistry();
	});

	it('exports one referenced User per coder and leaves ownerless Coding unattributed', async () => {
		const carla = coderRegistry.resolveOrCreateExternalHuman('Carla', {
			scheme: 'refi-qda-user-guid', value: CARLA_GUID,
		});
		const joao = coderRegistry.resolveOrCreateExternalHuman('João', {
			scheme: 'refi-qda-user-guid', value: JOAO_GUID,
		});
		coderRegistry.createHuman('Unused');
		const codeId = codeRegistry.create('Theme', '#ff0000').id;

		const pdf = dataManager.section('pdf');
		pdf.markers.push(
			marker('550e8400-e29b-41d4-a716-446655440010', codeId, carla.id),
			marker('550e8400-e29b-41d4-a716-446655440011', codeId, joao.id),
			marker('550e8400-e29b-41d4-a716-446655440012', codeId, 'human:default'),
			marker('550e8400-e29b-41d4-a716-446655440013', codeId, undefined, true),
		);
		dataManager.setSection('pdf', pdf);

		const result = await exportProject(
			{ vault: {} } as any,
			dataManager,
			codeRegistry,
			coderRegistry,
			{
				format: 'qdpx', includeSources: false, fileName: 'authors.qdpx',
				vaultName: 'Authorship', pluginVersion: '1.0.0',
			},
			new CaseVariablesRegistry(),
		);

		const xml = strFromU8(unzipSync(result.data as Uint8Array)['project.qde']!);
		const userGuids = [...xml.matchAll(/<User guid="([^"]+)"/g)].map((match) => match[1]);
		const authorGuids = [...xml.matchAll(/<Coding [^>]*creatingUser="([^"]+)"/g)].map((match) => match[1]);
		const defaultGuid = coderRegistry.getById('human:default')?.externalIdentities?.[0]?.value;

		expect(userGuids).toHaveLength(3);
		expect(userGuids).toEqual([CARLA_GUID, JOAO_GUID, defaultGuid]);
		expect(authorGuids).toEqual([CARLA_GUID, JOAO_GUID, defaultGuid]);
		expect(defaultGuid && isValidUuid(defaultGuid)).toBe(true);
		expect(xml).not.toContain('name="Unused"');
		expect((xml.match(/<Coding /g) ?? [])).toHaveLength(4);
		expect(result.warnings).toEqual([
			'QDPX marker 550e8400-e29b-41d4-a716-446655440013: explicitly unattributed owner — exported without creatingUser',
		]);
	});
});
