import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../src/core/dataManager';
import { createPdfMarker, type ParsedSelection } from '../../src/import/qdpxImporter';
import type { Plugin } from 'obsidian';
import type { PdfShapeMarker } from '../../src/core/types';

function createMockPlugin() {
	let stored: any = null;
	return {
		loadData: vi.fn(async () => stored),
		saveData: vi.fn(async (data: any) => { stored = data; }),
	} as unknown as Plugin;
}

function makeShapeSelection(): ParsedSelection {
	return {
		guid: 'shape-1',
		type: 'PDFSelection',
		codeGuids: [],
		noteGuids: [],
		page: 0,
		firstX: 100,
		firstY: 700,
		secondX: 200,
		secondY: 500,
	};
}

function makeResult() {
	return {
		codesCreated: 0,
		codesMerged: 0,
		sourcesImported: 0,
		segmentsCreated: 0,
		memosImported: 0,
		relationsImported: 0,
		warnings: [] as string[],
	};
}

describe('createPdfMarker — shape dims (BACKLOG §11 I1)', () => {
	let dm: DataManager;

	beforeEach(async () => {
		dm = new DataManager(createMockPlugin());
		await dm.load();
	});

	it('uses real page dims from pdfDims when available (A4)', () => {
		const sel = makeShapeSelection();
		const pdfDims = { 0: { width: 595, height: 842 } };
		const result = makeResult();

		const count = createPdfMarker(
			sel, 'test.pdf',
			[{ codeId: 'c1' }], undefined, 0,
			dm, result,
			null, null,   // pdfPlainText / pdfPageStartOffsets (not needed for shape)
			pdfDims,
		);

		expect(count).toBe(1);
		const shapes = dm.section('pdf').shapes as PdfShapeMarker[];
		expect(shapes).toHaveLength(1);
		const coords = shapes[0]!.coords as { x: number; w: number };
		// firstX=100, pageWidth=595, percent scale → x ≈ 16.8% (not 100/612*100 ≈ 16.3%)
		expect(coords.x).toBeCloseTo((100 / 595) * 100, 4);
		expect(coords.w).toBeCloseTo(((200 - 100) / 595) * 100, 4);
	});

	it('falls back to 612x792 (US Letter) when pdfDims is null', () => {
		const sel = makeShapeSelection();
		const result = makeResult();

		const count = createPdfMarker(
			sel, 'test.pdf',
			[{ codeId: 'c1' }], undefined, 0,
			dm, result,
			null, null,
			null, // no dims
		);

		expect(count).toBe(1);
		const shapes = dm.section('pdf').shapes as PdfShapeMarker[];
		expect(shapes).toHaveLength(1);
		const coords = shapes[0]!.coords as { x: number; w: number };
		expect(coords.x).toBeCloseTo((100 / 612) * 100, 4);
		expect(coords.w).toBeCloseTo(((200 - 100) / 612) * 100, 4);
	});

	it('falls back to 612x792 when pdfDims has dims for other pages but not this one', () => {
		const sel = makeShapeSelection(); // page: 0
		const pdfDims = { 1: { width: 595, height: 842 } }; // only page 1
		const result = makeResult();

		createPdfMarker(
			sel, 'test.pdf',
			[{ codeId: 'c1' }], undefined, 0,
			dm, result,
			null, null,
			pdfDims,
		);

		const shapes = dm.section('pdf').shapes as PdfShapeMarker[];
		const coords = shapes[0]!.coords as { x: number };
		expect(coords.x).toBeCloseTo((100 / 612) * 100, 4);
	});
});
