import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../../src/core/dataManager';
import { buildSegmentsTable } from '../../../src/export/tabular/buildSegmentsTable';
import type { Plugin } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

let dm: DataManager;
beforeEach(async () => {
	dm = new DataManager(mockPlugin());
	await dm.load();
});

describe('buildSegmentsTable', () => {
	it('header has shape columns when includeShapeCoords=true', () => {
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		expect(rows[0]).toContain('shape_type');
		expect(rows[0]).toContain('shape_coords');
	});

	it('header omits shape columns when includeShapeCoords=false', () => {
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: false });
		expect(rows[0]).not.toContain('shape_type');
		expect(rows[0]).not.toContain('shape_coords');
	});

	it('markdown marker: engine=markdown, sourceType=markdown, line/ch filled', () => {
		const s = dm.section('markdown');
		s.markers['x.md'] = [{
			markerType: 'markdown', id: 'md1', fileId: 'x.md',
			range: { from: { line: 3, ch: 4 }, to: { line: 5, ch: 6 } },
			color: '#000', codes: [], text: 'hello', memo: '',
			createdAt: 1700000000000, updatedAt: 1700000001000,
		}];
		dm.setSection('markdown', s);

		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const row = rows[1]!;
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(row[i('engine')]).toBe('markdown');
		expect(row[i('sourceType')]).toBe('markdown');
		expect(row[i('text')]).toBe('hello');
		expect(row[i('line_from')]).toBe(3);
		expect(row[i('ch_from')]).toBe(4);
		expect(row[i('line_to')]).toBe(5);
		expect(row[i('ch_to')]).toBe(6);
		expect(row[i('page')]).toBe('');
		expect(row[i('createdAt')]).toBe('2023-11-14T22:13:20.000Z');
	});

	it('csv_segment marker: text resolved from csvTexts map', () => {
		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'x.csv', row: 0, column: 'col', from: 10, to: 20, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);
		const texts = new Map([['sg1', 'hello world']]);
		const { rows } = buildSegmentsTable(dm, texts, { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('text')]).toBe('hello world');
		expect(rows[1]![i('sourceType')]).toBe('csv_segment');
	});

	it('csv_row marker: text resolved from csvTexts map (full cell)', () => {
		const csv = dm.section('csv');
		csv.rowMarkers.push({ id: 'rw1', fileId: 'x.csv', row: 0, column: 'col', codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);
		const texts = new Map([['rw1', 'Maria Silva']]);
		const { rows } = buildSegmentsTable(dm, texts, { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('text')]).toBe('Maria Silva');
		expect(rows[1]![i('sourceType')]).toBe('csv_row');
	});

	it('media marker: from/to in seconds converted to ms (int)', () => {
		const audio = dm.section('audio');
		audio.files = [{ path: 'x.mp3', markers: [{ id: 'au1', fileId: 'x.mp3', from: 1.5, to: 3.25, codes: [], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('audio', audio);
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('time_from')]).toBe(1500);
		expect(rows[1]![i('time_to')]).toBe(3250);
	});

	it('media marker with NaN time: empty cells + warning, segment emitted', () => {
		const audio = dm.section('audio');
		audio.files = [{ path: 'x.mp3', markers: [{ id: 'au1', fileId: 'x.mp3', from: NaN, to: 2, codes: [], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('audio', audio);
		const { rows, warnings } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		expect(rows).toHaveLength(2);
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('time_from')]).toBe('');
		expect(rows[1]![i('time_to')]).toBe(2000);
		expect(warnings.some(w => /NaN/i.test(w))).toBe(true);
	});

	it('pdf_shape marker: shape_coords as JSON when includeShapeCoords=true', () => {
		const pdf = dm.section('pdf');
		pdf.shapes.push({ id: 'sh1', fileId: 'x.pdf', page: 1, shape: 'rect', coords: { type: 'rect', x: 10, y: 20, w: 30, h: 40 }, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('pdf', pdf);
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('shape_type')]).toBe('rect');
		expect(JSON.parse(rows[1]![i('shape_coords')] as string)).toEqual({ type: 'rect', x: 10, y: 20, w: 30, h: 40 });
	});

	it('pdf_shape marker: shape columns absent when includeShapeCoords=false', () => {
		const pdf = dm.section('pdf');
		pdf.shapes.push({ id: 'sh1', fileId: 'x.pdf', page: 1, shape: 'rect', coords: { type: 'rect', x: 10, y: 20, w: 30, h: 40 }, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('pdf', pdf);
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: false });
		expect(rows[0]).not.toContain('shape_type');
		expect(rows).toHaveLength(2);
	});

	it('pdf_text marker: engine=pdf, sourceType=pdf_text, page/offsets filled', () => {
		const pdf = dm.section('pdf');
		pdf.markers.push({
			id: 'pt1', fileId: 'x.pdf', page: 3,
			beginIndex: 5, beginOffset: 10, endIndex: 7, endOffset: 20,
			text: 'quoted passage', codes: [], createdAt: 0, updatedAt: 0,
		});
		dm.setSection('pdf', pdf);

		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('engine')]).toBe('pdf');
		expect(rows[1]![i('sourceType')]).toBe('pdf_text');
		expect(rows[1]![i('page')]).toBe(3);
		expect(rows[1]![i('begin_index')]).toBe(5);
		expect(rows[1]![i('begin_offset')]).toBe(10);
		expect(rows[1]![i('end_index')]).toBe(7);
		expect(rows[1]![i('end_offset')]).toBe(20);
		expect(rows[1]![i('text')]).toBe('quoted passage');
	});

	it('image marker: engine=image, sourceType=image, shape_coords JSON', () => {
		const img = dm.section('image');
		img.markers.push({
			id: 'im1', fileId: 'x.png', shape: 'ellipse',
			coords: { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2 },
			codes: [], createdAt: 0, updatedAt: 0,
		});
		dm.setSection('image', img);

		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('engine')]).toBe('image');
		expect(rows[1]![i('sourceType')]).toBe('image');
		expect(rows[1]![i('shape_type')]).toBe('ellipse');
		expect(JSON.parse(rows[1]![i('shape_coords')] as string)).toEqual({ type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2 });
		expect(rows[1]![i('text')]).toBe('');
	});

	it('video marker: engine=video, sourceType=video, time in ms', () => {
		const video = dm.section('video');
		video.files = [{ path: 'x.mp4', markers: [{ id: 'vd1', fileId: 'x.mp4', from: 10, to: 15, codes: [], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('video', video);

		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('engine')]).toBe('video');
		expect(rows[1]![i('sourceType')]).toBe('video');
		expect(rows[1]![i('time_from')]).toBe(10000);
		expect(rows[1]![i('time_to')]).toBe(15000);
	});

	it('shape marker with malformed coords: shape columns empty + warning, segment emitted', () => {
		const pdf = dm.section('pdf');
		pdf.shapes.push({ id: 'sh1', fileId: 'x.pdf', page: 1, shape: 'rect', coords: null as any, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('pdf', pdf);

		const { rows, warnings } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		expect(rows).toHaveLength(2); // segment still emitted
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('shape_type')]).toBe('');
		expect(rows[1]![i('shape_coords')]).toBe('');
		expect(warnings.some(w => /malformed/i.test(w))).toBe(true);
	});

	it('pdf_shape marker: engine=pdf, sourceType=pdf_shape', () => {
		const pdf = dm.section('pdf');
		pdf.shapes.push({ id: 'sh1', fileId: 'x.pdf', page: 1, shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('pdf', pdf);

		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('engine')]).toBe('pdf');
		expect(rows[1]![i('sourceType')]).toBe('pdf_shape');
	});
});
