import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { DataManager } from '../../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { exportTabular } from '../../../src/export/tabular/tabularExporter';
import { TFile } from '../../mocks/obsidian';
import type { App, Plugin } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

function mockApp(files: Record<string, string> = {}): App {
	return {
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => {
				if (!(path in files)) return null;
				const file = new TFile();
				file.path = path;
				file.extension = path.split('.').pop() ?? '';
				return file;
			}),
			read: vi.fn(async (file: TFile) => files[file.path] ?? ''),
		},
	} as unknown as App;
}

let dm: DataManager;
let reg: CodeDefinitionRegistry;

beforeEach(async () => {
	dm = new DataManager(mockPlugin());
	await dm.load();
	reg = new CodeDefinitionRegistry();
});

describe('exportTabular', () => {
	it('empty project yields zip with 5 CSVs + README (relations off)', async () => {
		const result = await exportTabular(mockApp(), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const files = unzipSync(result.data);
		expect(Object.keys(files).sort()).toEqual([
			'README.md', 'case_variables.csv', 'code_applications.csv', 'codes.csv', 'groups.csv', 'segments.csv',
		]);
	});

	it('relations on → 5 CSVs + README', async () => {
		const result = await exportTabular(mockApp(), dm, reg, {
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

		const result = await exportTabular(mockApp(), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const readme = strFromU8(unzipSync(result.data)['README.md']!);
		expect(readme).toContain('Warnings');
		expect(readme).toContain('ghost');
	});

	it('CSV source missing → warning, segments[csv] emitted with empty text', async () => {
		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'missing.csv', row: 0, column: 'a', from: 0, to: 1, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);

		const result = await exportTabular(mockApp(), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		expect(result.warnings.some(w => /cannot read/i.test(w))).toBe(true);
		const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
		expect(segments).toContain('sg1');
	});

	it('CSV source readable → text resolved from the cell', async () => {
		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'x.csv', row: 0, column: 'col', from: 0, to: 5, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);
		const app = mockApp({ 'x.csv': 'col\nhello world' });

		const result = await exportTabular(app, dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
		expect(segments).toContain('hello');
	});
});
