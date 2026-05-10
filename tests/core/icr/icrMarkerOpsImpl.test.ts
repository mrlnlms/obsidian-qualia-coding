import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IcrMarkerOpsImpl } from '../../../src/core/icr/icrMarkerOpsImpl';
import type { Marker as MarkdownMarker } from '../../../src/markdown/models/codeMarkerModel';
import type { RowMarker } from '../../../src/csv/csvCodingTypes';
import type { CodeApplication } from '../../../src/core/types';

type CoderId = string;

interface FakeMarkdownModel {
	insertMarkerRaw: ReturnType<typeof vi.fn>;
	removeMarker: ReturnType<typeof vi.fn>;
	getMarkerById: (id: string) => MarkdownMarker | null;
	getMarkersForFile: (id: string) => MarkdownMarker[];
	addCodeToMarker: ReturnType<typeof vi.fn>;
	removeCodeFromMarker: ReturnType<typeof vi.fn>;
	getSettings: () => { defaultColor: string };
	store: Map<string, MarkdownMarker>;
}

interface FakeCsvModel {
	insertMarkerRaw: ReturnType<typeof vi.fn>;
	removeMarker: ReturnType<typeof vi.fn>;
	findMarkerById: (id: string) => RowMarker | null;
	getRowMarkersForCell: (file: string, rowId: number, col: string) => RowMarker[];
	addCodeToMarker: ReturnType<typeof vi.fn>;
	removeCodeFromMarker: ReturnType<typeof vi.fn>;
	store: Map<string, RowMarker>;
}

function makeFakeMarkdownModel(): FakeMarkdownModel {
	const store = new Map<string, MarkdownMarker>();
	const model: FakeMarkdownModel = {
		store,
		insertMarkerRaw: vi.fn((m: MarkdownMarker) => store.set(m.id, m)),
		removeMarker: vi.fn((id: string) => store.delete(id)),
		getMarkerById: (id: string) => store.get(id) ?? null,
		getMarkersForFile: (fileId: string) => Array.from(store.values()).filter(m => m.fileId === fileId),
		addCodeToMarker: vi.fn((id: string, codeId: string) => {
			const m = store.get(id);
			if (m && !m.codes.some(c => c.codeId === codeId)) m.codes.push({ codeId });
		}),
		removeCodeFromMarker: vi.fn((id: string, codeId: string) => {
			const m = store.get(id);
			if (m) m.codes = m.codes.filter(c => c.codeId !== codeId);
		}),
		getSettings: () => ({ defaultColor: '#abc' }),
	};
	return model;
}

function makeFakeCsvModel(): FakeCsvModel {
	const store = new Map<string, RowMarker>();
	return {
		store,
		insertMarkerRaw: vi.fn((m: RowMarker) => store.set(m.id, m)),
		removeMarker: vi.fn((id: string) => store.delete(id)),
		findMarkerById: (id: string) => store.get(id) ?? null,
		getRowMarkersForCell: (file: string, rowId: number, col: string) =>
			Array.from(store.values()).filter(m => m.fileId === file && m.sourceRowId === rowId && m.column === col),
		addCodeToMarker: vi.fn((id: string, codeId: string) => {
			const m = store.get(id);
			if (m && !m.codes.some(c => c.codeId === codeId)) m.codes.push({ codeId });
		}),
		removeCodeFromMarker: vi.fn((id: string, codeId: string) => {
			const m = store.get(id);
			if (m) m.codes = m.codes.filter(c => c.codeId !== codeId);
		}),
	};
}

function makeFakePlugin(mdModel: FakeMarkdownModel | null, csvModel: FakeCsvModel | null) {
	return {
		markdownModel: mdModel,
		csvModel,
		app: { workspace: { getLeavesOfType: () => [] } },
	} as unknown as Parameters<typeof IcrMarkerOpsImpl.prototype.constructor>[0];
}

let mdModel: FakeMarkdownModel;
let csvModel: FakeCsvModel;
let ops: IcrMarkerOpsImpl;

beforeEach(() => {
	mdModel = makeFakeMarkdownModel();
	csvModel = makeFakeCsvModel();
	ops = new IcrMarkerOpsImpl(makeFakePlugin(mdModel, csvModel) as never);
});

describe('IcrMarkerOpsImpl — markdown', () => {
	it('createMarker insere via markdownModel.insertMarkerRaw com codedBy', () => {
		const r = ops.createMarker('markdown', {
			fileId: 'F1.md',
			bounds: { kind: 'text', from: 100, to: 250 },
			codeIds: ['c_alpha'],
			codedBy: 'consensus:default',
		});
		expect(r.markerId).toBeTruthy();
		expect(mdModel.insertMarkerRaw).toHaveBeenCalledTimes(1);
		const inserted = mdModel.store.get(r.markerId)!;
		expect(inserted.codedBy).toBe('consensus:default');
		expect(inserted.codes).toEqual([{ codeId: 'c_alpha' }]);
		expect(inserted.fileId).toBe('F1.md');
	});

	it('createMarker rejeita bounds não-text pra markdown', () => {
		expect(() =>
			ops.createMarker('markdown', {
				fileId: 'F1.md',
				bounds: { kind: 'csvRow', rowIndex: 5 },
				codeIds: ['c_alpha'],
				codedBy: 'human:alice',
			}),
		).toThrow(/markdown-requires-text-bounds/);
	});

	it('removeMarker delega ao markdownModel.removeMarker', () => {
		const r = ops.createMarker('markdown', {
			fileId: 'F1.md',
			bounds: { kind: 'text', from: 0, to: 10 },
			codeIds: ['c_x'],
			codedBy: 'human:alice',
		});
		ops.removeMarker('markdown', 'F1.md', r.markerId);
		expect(mdModel.removeMarker).toHaveBeenCalledWith(r.markerId);
		expect(mdModel.store.has(r.markerId)).toBe(false);
	});

	it('updateMarker remove codes antigos e adiciona novos via diff', () => {
		const r = ops.createMarker('markdown', {
			fileId: 'F1.md',
			bounds: { kind: 'text', from: 0, to: 10 },
			codeIds: ['c_old'],
			codedBy: 'human:alice',
		});
		const newCodes: CodeApplication[] = [{ codeId: 'c_new' }];
		ops.updateMarker('markdown', 'F1.md', r.markerId, { codes: newCodes });
		expect(mdModel.removeCodeFromMarker).toHaveBeenCalledWith(r.markerId, 'c_old', true);
		expect(mdModel.addCodeToMarker).toHaveBeenCalledWith(r.markerId, 'c_new');
	});

	it('serializeMarker retorna JSON snapshot do marker', () => {
		const r = ops.createMarker('markdown', {
			fileId: 'F1.md',
			bounds: { kind: 'text', from: 50, to: 100 },
			codeIds: ['c_alpha'],
			codedBy: 'human:alice',
		});
		const snap = ops.serializeMarker('markdown', 'F1.md', r.markerId);
		expect(snap.markerId).toBe(r.markerId);
		expect(snap.engine).toBe('markdown');
		expect(snap.fileId).toBe('F1.md');
		expect(snap.serialized).toMatchObject({ id: r.markerId, codedBy: 'human:alice' });
	});

	it('restoreMarker re-insere via insertMarkerRaw', () => {
		const r = ops.createMarker('markdown', {
			fileId: 'F1.md',
			bounds: { kind: 'text', from: 0, to: 10 },
			codeIds: ['c_x'],
			codedBy: 'human:alice',
		});
		const snap = ops.serializeMarker('markdown', 'F1.md', r.markerId);
		mdModel.removeMarker(r.markerId);
		expect(mdModel.store.has(r.markerId)).toBe(false);

		ops.restoreMarker(snap);
		expect(mdModel.store.has(r.markerId)).toBe(true);
	});

	it('restoreMarker no-op se snapshot.serialized é null', () => {
		ops.restoreMarker({ markerId: 'm1', engine: 'markdown', fileId: 'F1.md', serialized: null });
		expect(mdModel.insertMarkerRaw).not.toHaveBeenCalled();
	});
});

describe('IcrMarkerOpsImpl — csvRow', () => {
	it('createMarker pra csvRow exige bounds csvRow', () => {
		expect(() =>
			ops.createMarker('csvRow', {
				fileId: 'F.csv',
				bounds: { kind: 'text', from: 0, to: 10 },
				codeIds: ['c_x'],
				codedBy: 'human:alice',
			}),
		).toThrow(/csvRow-requires-csvRow-bounds/);
	});

	it('createMarker pra csvRow insere RowMarker com sourceRowId + column', () => {
		const r = ops.createMarker('csvRow', {
			fileId: 'F.csv',
			bounds: { kind: 'csvRow', rowIndex: 7, column: 'response' },
			codeIds: ['c_x'],
			codedBy: 'human:alice',
		});
		const inserted = csvModel.store.get(r.markerId)!;
		expect(inserted.sourceRowId).toBe(7);
		expect(inserted.column).toBe('response');
		expect(inserted.codedBy).toBe('human:alice');
	});

	it('findMarkersInRegion retorna markers com codedBy via getRowMarkersForCell', () => {
		ops.createMarker('csvRow', {
			fileId: 'F.csv',
			bounds: { kind: 'csvRow', rowIndex: 7, column: 'response' },
			codeIds: ['c_x'],
			codedBy: 'human:alice',
		});
		ops.createMarker('csvRow', {
			fileId: 'F.csv',
			bounds: { kind: 'csvRow', rowIndex: 7, column: 'response' },
			codeIds: ['c_y'],
			codedBy: 'human:bob',
		});
		const found = ops.findMarkersInRegion({
			fileId: 'F.csv', engine: 'csvRow',
			bounds: { kind: 'csvRow', rowIndex: 7, column: 'response' },
		});
		expect(found.map(m => m.codedBy).sort()).toEqual(['human:alice', 'human:bob']);
	});
});

describe('IcrMarkerOpsImpl — engines fora de slice', () => {
	it('createMarker pra pdf-text lança engine-not-supported', () => {
		expect(() =>
			ops.createMarker('pdf', {
				fileId: 'F.pdf',
				bounds: { kind: 'text', from: 0, to: 10 },
				codeIds: ['c_x'],
				codedBy: 'human:alice',
			}),
		).toThrow(/engine-not-supported-in-slice/);
	});

	it('createMarker pra audio lança engine-not-supported', () => {
		expect(() =>
			ops.createMarker('audio', {
				fileId: 'F.mp3',
				bounds: { kind: 'temporal', fromMs: 0, toMs: 1000 },
				codeIds: ['c_x'],
				codedBy: 'human:alice',
			}),
		).toThrow(/engine-not-supported-in-slice/);
	});

	it('findMarkersInRegion pra pdfShape lança engine-not-supported', () => {
		expect(() =>
			ops.findMarkersInRegion({
				fileId: 'F.pdf', engine: 'pdfShape',
				bounds: { kind: 'text', from: 0, to: 10 },
			}),
		).toThrow(/engine-not-supported-in-slice/);
	});
});
