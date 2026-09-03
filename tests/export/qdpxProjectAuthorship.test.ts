import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { DataManager } from '../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { CoderRegistry } from '../../src/core/icr/coderRegistry';
import { CaseVariablesRegistry } from '../../src/core/caseVariables/caseVariablesRegistry';
import { exportProject, isValidUuid } from '../../src/export/qdpxExporter';
import { QdpxExportValidationError } from '../../src/export/qdpxExportAudit';
import { importQdpx } from '../../src/import/qdpxImporter';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';
import { loadPdfExportData } from '../../src/pdf/pdfExportData';

vi.mock('../../src/pdf/pdfExportData', () => ({
	loadPdfExportData: vi.fn(async () => ({
		plainText: 'quoted passage',
		pageStartOffsets: [0],
		pageTextItems: [[{
			str: 'quoted passage', dir: 'ltr', width: 140, height: 10,
			transform: [1, 0, 0, 1, 10, 700],
		}]],
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
		beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 14,
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

		const sourceFile = { path: 'paper.pdf', extension: 'pdf', stat: { size: 4, mtime: 0, ctime: 0 } };
		const exportApp = {
			vault: {
				getAbstractFileByPath: vi.fn(() => sourceFile),
				readBinary: vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer),
			},
		};
		const options = {
			format: 'qdpx' as const, includeSources: true, fileName: 'authors.qdpx',
			vaultName: 'Authorship', pluginVersion: '1.0.0',
		};
		const result = await exportProject(
			exportApp as any,
			dataManager,
			codeRegistry,
			coderRegistry,
			options,
			new CaseVariablesRegistry(),
		);

		const xml = strFromU8(unzipSync(result.data as Uint8Array)['project.qde']!);
		const userGuids = [...xml.matchAll(/<User guid="([^"]+)"/g)].map((match) => match[1]);
		const authorGuids = [...xml.matchAll(/<Coding [^>]*creatingUser="([^"]+)"/g)].map((match) => match[1]);
		const defaultGuid = coderRegistry.getById('human:default')?.externalIdentities?.[0]?.value;

		expect(userGuids).toHaveLength(3);
		expect(userGuids).toEqual([CARLA_GUID, JOAO_GUID, defaultGuid]);
		expect(authorGuids).toEqual([
			CARLA_GUID, JOAO_GUID, defaultGuid,
			CARLA_GUID, JOAO_GUID, defaultGuid,
		]);
		expect(defaultGuid && isValidUuid(defaultGuid)).toBe(true);
		expect(xml).not.toContain('name="Unused"');
		expect((xml.match(/<Coding /g) ?? [])).toHaveLength(8);
		expect(result.warnings).toEqual([
			'QDPX marker 550e8400-e29b-41d4-a716-446655440013: explicitly unattributed owner — exported without creatingUser',
		]);

		let identityMutations = 0;
		coderRegistry.addOnMutate(() => identityMutations++);
		await exportProject(
			exportApp as any, dataManager, codeRegistry, coderRegistry,
			options, new CaseVariablesRegistry(),
		);
		expect(identityMutations).toBe(0);
		expect(coderRegistry.getById('human:default')?.externalIdentities?.[0]?.value).toBe(defaultGuid);

		const importedPlugin = mockPlugin();
		const importedData = new DataManager(importedPlugin as any);
		await importedData.load();
		const importedCodes = new CodeDefinitionRegistry();
		const importedCoders = new CoderRegistry();
		const setCodingParticipation = vi.fn();
		const importedFiles = new Map<string, string | ArrayBuffer>();
		const importApp = {
			vault: {
				adapter: {
					exists: vi.fn(async () => false),
					mkdir: vi.fn(async () => undefined),
					write: vi.fn(async (path: string, content: string) => { importedFiles.set(path, content); }),
					writeBinary: vi.fn(async (path: string, content: ArrayBuffer) => { importedFiles.set(path, content); }),
				},
			},
		};

		await importQdpx(
			new Uint8Array(result.data as Uint8Array).buffer,
			importApp as any,
			importedData,
			importedCodes,
			{
				conflictStrategy: 'merge', keepOriginalSources: true,
				projectName: 'Authorship', participation: { mode: 'read-only' },
			},
			{ coderRegistry: importedCoders, setCodingParticipation } as any,
		);

		const importedMarkers = importedData.section('pdf').markers;
		const authoredMarkers = importedMarkers.filter((candidate) => candidate.codedBy);
		const ownerlessMarker = importedMarkers.find((candidate) => !candidate.codedBy);
		const codingGuidsByAuthor = new Map<string, string[]>();
		for (const [guid, author] of
			[...xml.matchAll(/<Coding guid="([^"]+)"[^>]*creatingUser="([^"]+)"/g)]
				.map((match) => [match[1]!, match[2]!] as const)) {
			codingGuidsByAuthor.set(author, [...(codingGuidsByAuthor.get(author) ?? []), guid]);
		}

		expect(setCodingParticipation).toHaveBeenCalledWith('read-only');
		expect(importedMarkers).toHaveLength(4);
		expect(authoredMarkers.map((candidate) => candidate.codedBy)).toEqual([
			`human:qdpx:${CARLA_GUID}`,
			`human:qdpx:${JOAO_GUID}`,
			`human:qdpx:${defaultGuid}`,
		]);
		for (const candidate of authoredMarkers) {
			const authorGuid = candidate.codedBy!.slice('human:qdpx:'.length);
			expect(candidate.codes[0]?.qdpx?.sourceCodingGuids).toEqual(codingGuidsByAuthor.get(authorGuid));
			expect(candidate.codes[0]?.qdpx?.creatingUserGuid).toBe(authorGuid);
			expect(candidate.codes[0]?.qdpx?.creationDateTime).toBe('2026-01-02T03:04:05.000Z');
		}
		expect(ownerlessMarker?.importedQdpxSelection?.unattributedOwner).toBe(true);
		expect(importedFiles.has('imports/Authorship/paper.pdf')).toBe(true);
		expect(importedFiles.has('imports/Authorship/qdpx-import-audit.md')).toBe(true);
	});

	it('rejects an active PDF load failure with a structured audit', async () => {
		const codeId = codeRegistry.create('Theme', '#ff0000').id;
		const pdf = dataManager.section('pdf');
		pdf.markers.push(marker('active-marker', codeId, 'human:default'));
		dataManager.setSection('pdf', pdf);
		vi.mocked(loadPdfExportData).mockRejectedValueOnce(new Error('broken PDF'));
		const app = {
			vault: { getAbstractFileByPath: vi.fn(() => ({ path: 'paper.pdf', extension: 'pdf' })) },
		};

		await expect(exportProject(
			app as any, dataManager, codeRegistry, coderRegistry,
			{ format: 'qdpx', includeSources: false, fileName: 'failed.qdpx', vaultName: 'Audit', pluginVersion: '1.0.0' },
			new CaseVariablesRegistry(),
		)).rejects.toMatchObject({
			name: 'QdpxExportValidationError',
			audit: { issues: [expect.objectContaining({ kind: 'source-load', sourceId: 'paper.pdf' })] },
		} satisfies Partial<QdpxExportValidationError>);
	});

	it('omits markers whose source was removed from the current corpus', async () => {
		const codeId = codeRegistry.create('Theme', '#ff0000').id;
		const pdf = dataManager.section('pdf');
		pdf.markers.push(marker('orphan-marker', codeId, 'human:default'));
		dataManager.setSection('pdf', pdf);
		const result = await exportProject(
			{ vault: { getAbstractFileByPath: vi.fn(() => null) } } as any,
			dataManager, codeRegistry, coderRegistry,
			{ format: 'qdpx', includeSources: false, fileName: 'snapshot.qdpx', vaultName: 'Audit', pluginVersion: '1.0.0' },
			new CaseVariablesRegistry(),
		);
		expect(result.audit).toMatchObject({ omittedOrphanMarkers: 1, activePdfSources: 0, issues: [] });
		const xml = strFromU8(unzipSync(result.data as Uint8Array)['project.qde']!);
		expect(xml).not.toContain('<PDFSource');
	});
});
