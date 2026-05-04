/**
 * Integration tests for Fase 6 Slice B (exports lazy-aware). Covers the 3 real
 * defects the slice fixed:
 *
 *   1. Parquet markers exported with empty text (Papa.parse only handles CSV).
 *   2. Tabular CSV export uses csvModel.getMarkerText cache when populated, so
 *      lazy/closed files don't trigger a full vault re-parse.
 *   3. QDPX export now includes CSV/parquet in <Sources> via custom namespace
 *      `qualia:TabularSource` (Decisão 5 of parquet-lazy-design.md).
 *
 * Uses a real 8-row parquet fixture (tests/fixtures/sample.parquet) with
 * columns Name/Role/Score/Comment. Vault is mocked to return the fixture
 * bytes; downstream resolveExportTexts → parseTabularFile (hyparquet) runs
 * for real.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import * as fs from 'fs';
import * as path from 'path';
import { DataManager } from '../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { CsvCodingModel } from '../../src/csv/csvCodingModel';
import { CaseVariablesRegistry } from '../../src/core/caseVariables/caseVariablesRegistry';
import { exportTabular } from '../../src/export/tabular/tabularExporter';
import { exportProject } from '../../src/export/qdpxExporter';
import { parseSources } from '../../src/import/qdpxImporter';
import { parseXml } from '../../src/import/xmlParser';
import { TFile } from '../mocks/obsidian';
import type { Plugin } from 'obsidian';
import type QualiaCodingPlugin from '../../src/main';

const PARQUET_PATH = path.resolve(__dirname, '../fixtures/sample.parquet');
const parquetBytes = fs.readFileSync(PARQUET_PATH);

function mockObsidianPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

interface VaultFiles {
	parquet?: Record<string, Uint8Array>;
	text?: Record<string, string>;
}

function mockPlugin(dm: DataManager, csvModel: CsvCodingModel, files: VaultFiles = {}): QualiaCodingPlugin {
	const findFile = (p: string) => {
		const ext = p.split('.').pop() ?? '';
		const exists = (files.parquet && p in files.parquet) || (files.text && p in files.text);
		if (!exists) return null;
		const file = new TFile();
		file.path = p;
		file.extension = ext;
		const size = files.parquet?.[p]?.byteLength ?? files.text?.[p]?.length ?? 0;
		file.stat = { size, mtime: 0, ctime: 0 };
		return file;
	};
	const app = {
		vault: {
			getName: vi.fn(() => 'test-vault'),
			getAbstractFileByPath: vi.fn(findFile),
			read: vi.fn(async (file: TFile) => files.text?.[file.path] ?? ''),
			adapter: {
				readBinary: vi.fn(async (p: string) => {
					const bytes = files.parquet?.[p];
					if (bytes) {
						// Node fs.readFileSync returns a Buffer whose underlying
						// `.buffer` may not be a plain ArrayBuffer (hyparquet rejects
						// it). Copy into a fresh Uint8Array so `.buffer` is a clean
						// ArrayBuffer of exactly the right byte length.
						const u8 = new Uint8Array(bytes.byteLength);
						u8.set(bytes);
						return u8.buffer;
					}
					const text = files.text?.[p];
					if (text != null) return new TextEncoder().encode(text).buffer;
					throw new Error(`File not found: ${p}`);
				}),
			},
			readBinary: vi.fn(async (file: TFile) => {
				const bytes = files.parquet?.[file.path];
				if (bytes) {
					const u8 = new Uint8Array(bytes.byteLength);
					u8.set(bytes);
					return u8.buffer;
				}
				const text = files.text?.[file.path];
				if (text != null) return new TextEncoder().encode(text).buffer;
				throw new Error(`File not found: ${file.path}`);
			}),
		},
	};
	return {
		app,
		dataManager: dm,
		csvModel,
		getDuckDB: vi.fn(),
		manifest: { version: '0.0.1-test' },
	} as unknown as QualiaCodingPlugin;
}

let dm: DataManager;
let reg: CodeDefinitionRegistry;
let csvModel: CsvCodingModel;
let caseVars: CaseVariablesRegistry;

beforeEach(async () => {
	dm = new DataManager(mockObsidianPlugin());
	await dm.load();
	reg = new CodeDefinitionRegistry();
	csvModel = new CsvCodingModel(dm, reg);
	caseVars = new CaseVariablesRegistry();
});

describe('Fase 6 Slice B — exports lazy-aware', () => {
	describe('tabular export: parquet text resolution (was empty before fix)', () => {
		it('segment marker in parquet → segments.csv has cell content', async () => {
			const codeId = reg.create('Skills', '#abc').id;
			const csv = dm.section('csv');
			// Row 0 column "Comment" = "Excellent qualitative analysis skills" → from 0 to 9 = "Excellent"
			csv.segmentMarkers.push({
				id: 'sg1',
				fileId: 'data.parquet',
				sourceRowId: 0,
				column: 'Comment',
				from: 0,
				to: 9,
				codes: [{ codeId }],
				createdAt: 0,
				updatedAt: 0,
			});
			dm.setSection('csv', csv);
			csvModel.reload();

			const result = await exportTabular(
				mockPlugin(dm, csvModel, { parquet: { 'data.parquet': parquetBytes } }),
				dm, reg,
				{ fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1' },
			);
			expect(result.warnings).toEqual([]);
			const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
			expect(segments).toContain('Excellent');
			expect(segments).toContain('sg1');
		});

		it('row marker in parquet → segments.csv has full cell content', async () => {
			const codeId = reg.create('Person', '#def').id;
			const csv = dm.section('csv');
			// Row 1 column "Name" = "Bob"
			csv.rowMarkers.push({
				id: 'rm1',
				fileId: 'data.parquet',
				sourceRowId: 1,
				column: 'Name',
				codes: [{ codeId }],
				createdAt: 0,
				updatedAt: 0,
			});
			dm.setSection('csv', csv);
			csvModel.reload();

			const result = await exportTabular(
				mockPlugin(dm, csvModel, { parquet: { 'data.parquet': parquetBytes } }),
				dm, reg,
				{ fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1' },
			);
			const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
			expect(segments).toContain('Bob');
			expect(segments).toContain('rm1');
		});
	});

	describe('tabular export: cache hit short-circuits parse', () => {
		it('markerTextCache populated → vault.adapter.readBinary not called', async () => {
			const codeId = reg.create('C', '#fff').id;
			const csv = dm.section('csv');
			csv.segmentMarkers.push({
				id: 'sg1', fileId: 'data.parquet', sourceRowId: 5, column: 'Comment',
				from: 0, to: 6, codes: [{ codeId }], createdAt: 0, updatedAt: 0,
			});
			dm.setSection('csv', csv);
			csvModel.reload();
			// Pre-populate the cache directly — simulates what `prepopulateMarkerCaches`
			// does at startup for OPFS-cached lazy files.
			csvModel.cacheMarkerText('sg1', 'CACHED');

			const plugin = mockPlugin(dm, csvModel, { parquet: { 'data.parquet': parquetBytes } });
			const result = await exportTabular(plugin, dm, reg, {
				fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
			});
			const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
			expect(segments).toContain('CACHED');
			// Cache hit means no need to re-parse the file.
			expect(plugin.app.vault.adapter.readBinary).not.toHaveBeenCalled();
		});
	});

	describe('QDPX export: <Sources> embedding (Decisão 5)', () => {
		it('includeSources=true with parquet markers → zip has sources/<guid>.parquet + qualia:TabularSource XML', async () => {
			const codeId = reg.create('Skills', '#abc').id;
			const csv = dm.section('csv');
			csv.segmentMarkers.push({
				id: 'sg1', fileId: 'data.parquet', sourceRowId: 0, column: 'Comment',
				from: 0, to: 9, codes: [{ codeId }], createdAt: 0, updatedAt: 0,
			});
			dm.setSection('csv', csv);
			csvModel.reload();

			const plugin = mockPlugin(dm, csvModel, { parquet: { 'data.parquet': parquetBytes } });
			const result = await exportProject(plugin.app as any, dm, reg, {
				format: 'qdpx',
				includeSources: true,
				fileName: 'out.qdpx',
				vaultName: 'test-vault',
				pluginVersion: '0.0.1',
			}, caseVars);

			expect(typeof result.data).not.toBe('string');
			const files = unzipSync(result.data as Uint8Array);
			const fileNames = Object.keys(files);

			// Source file embedded in the zip.
			const sourceFiles = fileNames.filter(n => n.startsWith('sources/') && n.endsWith('.parquet'));
			expect(sourceFiles.length).toBe(1);

			// project.qde XML structure.
			const projectXml = strFromU8(files['project.qde']!);
			expect(projectXml).toContain('xmlns:qualia="urn:qualia-coding:extensions:1.0"');
			expect(projectXml).toContain('<qualia:TabularSource');
			expect(projectXml).toContain('name="data.parquet"');
			expect(projectXml).toContain('<qualia:CellSelection');
			expect(projectXml).toContain('qualia:sourceRowId="0"');
			expect(projectXml).toContain('qualia:column="Comment"');
			expect(projectXml).toContain('qualia:from="0"');
			expect(projectXml).toContain('qualia:to="9"');
		});

		it('includeSources=false → no source file in zip but XML still references relative path', async () => {
			const codeId = reg.create('C', '#000').id;
			const csv = dm.section('csv');
			csv.rowMarkers.push({
				id: 'rm1', fileId: 'data.parquet', sourceRowId: 2, column: 'Role',
				codes: [{ codeId }], createdAt: 0, updatedAt: 0,
			});
			dm.setSection('csv', csv);
			csvModel.reload();

			const plugin = mockPlugin(dm, csvModel, { parquet: { 'data.parquet': parquetBytes } });
			const result = await exportProject(plugin.app as any, dm, reg, {
				format: 'qdpx',
				includeSources: false,
				fileName: 'out.qdpx',
				vaultName: 'test-vault',
				pluginVersion: '0.0.1',
			}, caseVars);

			const files = unzipSync(result.data as Uint8Array);
			const fileNames = Object.keys(files);
			expect(fileNames.filter(n => n.startsWith('sources/'))).toEqual([]);
			const projectXml = strFromU8(files['project.qde']!);
			expect(projectXml).toContain('path="relative://data.parquet"');
		});

		it('round-trip: exported QDPX parses back into ParsedSource[] with tabular selections', async () => {
			const segCodeId = reg.create('Skill', '#abc').id;
			const rowCodeId = reg.create('Person', '#def').id;
			const csv = dm.section('csv');
			csv.segmentMarkers.push({
				id: 'sg1', fileId: 'data.parquet', sourceRowId: 0, column: 'Comment',
				from: 0, to: 9, codes: [{ codeId: segCodeId }], createdAt: 0, updatedAt: 0,
			});
			csv.rowMarkers.push({
				id: 'rm1', fileId: 'data.parquet', sourceRowId: 1, column: 'Name',
				codes: [{ codeId: rowCodeId }], createdAt: 0, updatedAt: 0,
			});
			dm.setSection('csv', csv);
			csvModel.reload();

			const plugin = mockPlugin(dm, csvModel, { parquet: { 'data.parquet': parquetBytes } });
			const result = await exportProject(plugin.app as any, dm, reg, {
				format: 'qdpx',
				includeSources: true,
				fileName: 'out.qdpx',
				vaultName: 'test-vault',
				pluginVersion: '0.0.1',
			}, caseVars);

			const files = unzipSync(result.data as Uint8Array);
			const projectXml = strFromU8(files['project.qde']!);
			const doc = parseXml(projectXml);
			const sources = parseSources(doc);

			const tabularSources = sources.filter(s => s.type === 'tabular');
			expect(tabularSources).toHaveLength(1);
			const tab = tabularSources[0]!;
			expect(tab.name).toBe('data.parquet');
			expect(tab.selections).toHaveLength(2);

			// Segment marker round-trips with from/to.
			const seg = tab.selections.find(s => s.cellFrom !== undefined);
			expect(seg).toBeDefined();
			expect(seg!.sourceRowId).toBe(0);
			expect(seg!.column).toBe('Comment');
			expect(seg!.cellFrom).toBe(0);
			expect(seg!.cellTo).toBe(9);

			// Row marker has sourceRowId/column but no from/to.
			const row = tab.selections.find(s => s.cellFrom === undefined);
			expect(row).toBeDefined();
			expect(row!.sourceRowId).toBe(1);
			expect(row!.column).toBe('Name');
			expect(row!.cellTo).toBeUndefined();
		});

		it('row marker without from/to → CellSelection has no qualia:from/to attrs', async () => {
			const codeId = reg.create('C', '#000').id;
			const csv = dm.section('csv');
			csv.rowMarkers.push({
				id: 'rm1', fileId: 'data.parquet', sourceRowId: 3, column: 'Score',
				codes: [{ codeId }], createdAt: 0, updatedAt: 0,
			});
			dm.setSection('csv', csv);
			csvModel.reload();

			const plugin = mockPlugin(dm, csvModel, { parquet: { 'data.parquet': parquetBytes } });
			const result = await exportProject(plugin.app as any, dm, reg, {
				format: 'qdpx',
				includeSources: true,
				fileName: 'out.qdpx',
				vaultName: 'test-vault',
				pluginVersion: '0.0.1',
			}, caseVars);

			const files = unzipSync(result.data as Uint8Array);
			const projectXml = strFromU8(files['project.qde']!);
			// Row marker selection: column + sourceRowId, no from/to (segment-only).
			const rowSelMatch = projectXml.match(/<qualia:CellSelection[^>]*qualia:column="Score"[^>]*>/);
			expect(rowSelMatch).toBeTruthy();
			expect(rowSelMatch![0]).not.toContain('qualia:from');
			expect(rowSelMatch![0]).not.toContain('qualia:to');
		});
	});
});
