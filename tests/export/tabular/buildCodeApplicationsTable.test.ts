import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { buildCodeApplicationsTable, CODE_APPS_HEADER } from '../../../src/export/tabular/buildCodeApplicationsTable';
import type { Plugin } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

let dm: DataManager;
let reg: CodeDefinitionRegistry;
let c1Id: string;
let c2Id: string;

beforeEach(async () => {
	dm = new DataManager(mockPlugin());
	await dm.load();
	reg = new CodeDefinitionRegistry();
	c1Id = reg.create('Code 1', '#f00').id;
	c2Id = reg.create('Code 2', '#0f0').id;
});

describe('buildCodeApplicationsTable', () => {
	it('returns header + empty body when no markers', () => {
		const { rows, warnings } = buildCodeApplicationsTable(dm, reg);
		expect(rows[0]).toEqual(CODE_APPS_HEADER);
		expect(rows).toHaveLength(1);
		expect(warnings).toEqual([]);
	});

	it('emits one row per (segment, code) pair', () => {
		const section = dm.section('markdown');
		section.markers['note.md'] = [{
			markerType: 'markdown',
			id: 's1', fileId: 'note.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#f00',
			codes: [{ codeId: c1Id }, { codeId: c2Id }],
			createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', section);

		const { rows } = buildCodeApplicationsTable(dm, reg);
		expect(rows).toHaveLength(3);
		expect(rows[1]).toEqual(['s1', c1Id, '']);
		expect(rows[2]).toEqual(['s1', c2Id, '']);
	});

	it('fills magnitude when present', () => {
		const section = dm.section('markdown');
		section.markers['note.md'] = [{
			markerType: 'markdown',
			id: 's1', fileId: 'note.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#f00',
			codes: [{ codeId: c1Id, magnitude: 'high' }],
			createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', section);

		const { rows } = buildCodeApplicationsTable(dm, reg);
		expect(rows[1]).toEqual(['s1', c1Id, 'high']);
	});

	it('skips orphan codeId + emits warning', () => {
		const section = dm.section('markdown');
		section.markers['note.md'] = [{
			markerType: 'markdown',
			id: 's1', fileId: 'note.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#f00',
			codes: [{ codeId: 'ghost' }, { codeId: c1Id }],
			createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', section);

		const { rows, warnings } = buildCodeApplicationsTable(dm, reg);
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual(['s1', c1Id, '']);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/orphan/i);
		expect(warnings[0]).toContain('ghost');
	});

	it('visits markers across all 8 sourceTypes', () => {
		const md = dm.section('markdown');
		md.markers['x.md'] = [{
			markerType: 'markdown', id: 'md1', fileId: 'x.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } },
			color: '#000', codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', md);

		const pdf = dm.section('pdf');
		pdf.markers.push({ id: 'pdf1', fileId: 'x.pdf', page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 1, text: 'a', codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0 });
		pdf.shapes.push({ id: 'shp1', fileId: 'x.pdf', page: 1, shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, codes: [{ codeId: c2Id }], createdAt: 0, updatedAt: 0 });
		dm.setSection('pdf', pdf);

		const img = dm.section('image');
		img.markers.push({ id: 'img1', fileId: 'x.png', shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 }, codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0 });
		dm.setSection('image', img);

		const audio = dm.section('audio');
		audio.files = [{ path: 'x.mp3', markers: [{ id: 'au1', fileId: 'x.mp3', from: 0, to: 1, codes: [{ codeId: c2Id }], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('audio', audio);

		const video = dm.section('video');
		video.files = [{ path: 'x.mp4', markers: [{ id: 'vd1', fileId: 'x.mp4', from: 0, to: 1, codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('video', video);

		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'x.csv', row: 0, column: 'a', from: 0, to: 1, codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0 });
		csv.rowMarkers.push({ id: 'rw1', fileId: 'x.csv', row: 0, column: 'a', codes: [{ codeId: c2Id }], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);

		const { rows } = buildCodeApplicationsTable(dm, reg);
		const segIds = rows.slice(1).map(r => r[0]);
		expect(segIds).toEqual(expect.arrayContaining(['md1', 'pdf1', 'shp1', 'img1', 'au1', 'vd1', 'sg1', 'rw1']));
		expect(segIds).toHaveLength(8);
	});
});
