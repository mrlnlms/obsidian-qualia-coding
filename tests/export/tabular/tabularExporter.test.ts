import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { DataManager } from '../../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { CsvCodingModel } from '../../../src/csv/csvCodingModel';
import { exportTabular } from '../../../src/export/tabular/tabularExporter';
import { TFile } from '../../mocks/obsidian';
import type { Plugin } from 'obsidian';
import type QualiaCodingPlugin from '../../../src/main';

function mockObsidianPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

function mockPlugin(dm: DataManager, csvModel: CsvCodingModel, files: Record<string, string> = {}): QualiaCodingPlugin {
	const app = {
		vault: {
			getName: vi.fn(() => 'test-vault'),
			getAbstractFileByPath: vi.fn((path: string) => {
				if (!(path in files)) return null;
				const file = new TFile();
				file.path = path;
				file.extension = path.split('.').pop() ?? '';
				file.stat = { size: files[path]!.length, mtime: 0, ctime: 0 };
				return file;
			}),
			read: vi.fn(async (file: TFile) => files[file.path] ?? ''),
			adapter: { readBinary: vi.fn(async (path: string) => new TextEncoder().encode(files[path] ?? '').buffer) },
		},
	};
	return {
		app,
		dataManager: dm,
		csvModel,
		getDuckDB: vi.fn(),
	} as unknown as QualiaCodingPlugin;
}

let dm: DataManager;
let reg: CodeDefinitionRegistry;
let csvModel: CsvCodingModel;

beforeEach(async () => {
	dm = new DataManager(mockObsidianPlugin());
	await dm.load();
	reg = new CodeDefinitionRegistry();
	csvModel = new CsvCodingModel(dm, reg);
});

describe('exportTabular', () => {
	it('empty project yields zip with 5 CSVs + README (relations off)', async () => {
		const result = await exportTabular(mockPlugin(dm, csvModel), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const files = unzipSync(result.data);
		expect(Object.keys(files).sort()).toEqual([
			'README.md', 'case_variables.csv', 'code_applications.csv', 'codes.csv', 'groups.csv', 'segments.csv',
		]);
	});

	it('relations on → 5 CSVs + README', async () => {
		const result = await exportTabular(mockPlugin(dm, csvModel), dm, reg, {
			fileName: 'out.zip', includeRelations: true, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		expect(Object.keys(unzipSync(result.data))).toContain('relations.csv');
	});

	it('warnings bubble into README', async () => {
		reg.create('C1', '#000');
		const s = dm.section('markdown');
		s.markers['x.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'x.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } },
			color: '#000', codes: [{ codeId: 'ghost' }], createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', s);

		const result = await exportTabular(mockPlugin(dm, csvModel), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const readme = strFromU8(unzipSync(result.data)['README.md']!);
		expect(readme).toContain('Warnings');
		expect(readme).toContain('ghost');
	});

	it('CSV source missing → warning, segments[csv] emitted with empty text', async () => {
		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'missing.csv', sourceRowId:0, column: 'a', from: 0, to: 1, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);
		csvModel.reload();

		const result = await exportTabular(mockPlugin(dm, csvModel), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		expect(result.warnings.some(w => /file not found/i.test(w))).toBe(true);
		const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
		expect(segments).toContain('sg1');
	});

	it('CSV source readable → text resolved from the cell', async () => {
		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'x.csv', sourceRowId:0, column: 'col', from: 0, to: 5, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);
		csvModel.reload();

		const result = await exportTabular(mockPlugin(dm, csvModel, { 'x.csv': 'col\nhello world' }), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
		expect(segments).toContain('hello');
	});
});
