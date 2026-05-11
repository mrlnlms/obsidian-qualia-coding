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

describe('IcrMarkerOpsImpl — engines fora de slice (Slice E5b: bbox pendente)', () => {
	it('findMarkersInRegion pra pdfShape lança engine-not-supported', () => {
		expect(() =>
			ops.findMarkersInRegion({
				fileId: 'F.pdf', engine: 'pdfShape',
				bounds: { kind: 'text', from: 0, to: 10 },
			}),
		).toThrow(/engine-not-supported-in-slice/);
	});

	it('createMarker pra image lança engine-not-supported', () => {
		expect(() =>
			ops.createMarker('image', {
				fileId: 'F.png',
				bounds: { kind: 'text', from: 0, to: 10 },
				codeIds: ['c_x'],
				codedBy: 'human:alice',
			}),
		).toThrow(/engine-not-supported-in-slice/);
	});
});

// ─── Slice E5a — 4 engines novas ───────────────────────────

import type { PdfMarker } from '../../../src/pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../src/csv/csvCodingTypes';
import type { MediaMarker } from '../../../src/media/mediaTypes';

function makeFakePdfModel() {
	const store = new Map<string, PdfMarker>();
	return {
		store,
		insertMarkerRaw: vi.fn((m: PdfMarker) => { store.set(m.id, m); }),
		removeMarker: vi.fn((id: string) => store.delete(id)),
		findMarkerById: (id: string) => store.get(id),
		getMarkersForFile: (fileId: string) => Array.from(store.values()).filter(m => m.fileId === fileId),
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

function makeFakeCsvSegmentModel() {
	const store = new Map<string, SegmentMarker>();
	return {
		store,
		insertMarkerRaw: vi.fn((m: SegmentMarker) => { store.set(m.id, m); }),
		removeMarker: vi.fn((id: string) => store.delete(id)),
		findMarkerById: (id: string) => store.get(id) ?? null,
		getRowMarkersForCell: () => [],
		getSegmentMarkersForCell: (file: string, rowId: number, col: string) =>
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

function makeFakeMediaModel(kind: 'audio' | 'video') {
	const store = new Map<string, MediaMarker>();
	return {
		store,
		kind,
		insertMarkerRaw: vi.fn((m: MediaMarker) => { store.set(m.id, m); }),
		removeMarker: vi.fn((id: string) => store.delete(id)),
		findMarkerById: (id: string) => store.get(id),
		getMarkersForFile: (fileId: string) => Array.from(store.values()).filter(m => m.fileId === fileId),
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

describe('IcrMarkerOpsImpl — pdf (E5a)', () => {
	it('createMarker insere via pdfModel.insertMarkerRaw com page + chars + codedBy', () => {
		const pdfModel = makeFakePdfModel();
		const plugin = { pdfModel, app: {} } as never;
		const opsLocal = new IcrMarkerOpsImpl(plugin);
		const r = opsLocal.createMarker('pdf', {
			fileId: 'doc.pdf',
			bounds: { kind: 'pdfText', page: 3, from: 100, to: 200 },
			codeIds: ['c_alpha'],
			codedBy: 'consensus:default',
		});
		expect(pdfModel.insertMarkerRaw).toHaveBeenCalledTimes(1);
		const inserted = pdfModel.store.get(r.markerId)!;
		expect(inserted.page).toBe(3);
		expect(inserted.beginIndex).toBe(100);
		expect(inserted.endIndex).toBe(200);
		expect(inserted.codedBy).toBe('consensus:default');
	});

	it('createMarker rejeita bounds não-pdfText', () => {
		const pdfModel = makeFakePdfModel();
		const opsLocal = new IcrMarkerOpsImpl({ pdfModel, app: {} } as never);
		expect(() =>
			opsLocal.createMarker('pdf', {
				fileId: 'doc.pdf',
				bounds: { kind: 'text', from: 0, to: 10 },
				codeIds: ['c_x'],
				codedBy: 'human:alice',
			}),
		).toThrow(/pdf-requires-pdfText-bounds/);
	});

	it('findMarkersInRegion filtra por page + overlap em chars', () => {
		const pdfModel = makeFakePdfModel();
		const opsLocal = new IcrMarkerOpsImpl({ pdfModel, app: {} } as never);
		pdfModel.store.set('p1', { id: 'p1', fileId: 'doc.pdf', page: 1, beginIndex: 10, endIndex: 50, beginOffset: 0, endOffset: 0, text: '', codes: [], codedBy: 'human:alice', markerType: 'pdf', createdAt: 0, updatedAt: 0 } as PdfMarker);
		pdfModel.store.set('p2', { id: 'p2', fileId: 'doc.pdf', page: 1, beginIndex: 100, endIndex: 150, beginOffset: 0, endOffset: 0, text: '', codes: [], codedBy: 'human:bob', markerType: 'pdf', createdAt: 0, updatedAt: 0 } as PdfMarker);
		pdfModel.store.set('p3', { id: 'p3', fileId: 'doc.pdf', page: 2, beginIndex: 10, endIndex: 50, beginOffset: 0, endOffset: 0, text: '', codes: [], codedBy: 'human:carla', markerType: 'pdf', createdAt: 0, updatedAt: 0 } as PdfMarker);

		const found = opsLocal.findMarkersInRegion({
			fileId: 'doc.pdf', engine: 'pdf',
			bounds: { kind: 'pdfText', page: 1, from: 30, to: 60 },
		});
		expect(found.map(m => m.markerId)).toEqual(['p1']); // p2 fora do range, p3 página diferente
	});
});

describe('IcrMarkerOpsImpl — csvSegment (E5a)', () => {
	it('createMarker insere via csvModel.insertMarkerRaw com row+column+from/to', () => {
		const csvModelLocal = makeFakeCsvSegmentModel();
		const opsLocal = new IcrMarkerOpsImpl({ csvModel: csvModelLocal, app: {} } as never);
		const r = opsLocal.createMarker('csvSegment', {
			fileId: 'data.csv',
			bounds: { kind: 'csvSegment', rowIndex: 5, column: 'comment', from: 10, to: 30 },
			codeIds: ['c_x'],
			codedBy: 'human:alice',
		});
		expect(csvModelLocal.insertMarkerRaw).toHaveBeenCalledTimes(1);
		const inserted = csvModelLocal.store.get(r.markerId)!;
		expect(inserted.sourceRowId).toBe(5);
		expect(inserted.column).toBe('comment');
		expect(inserted.from).toBe(10);
		expect(inserted.to).toBe(30);
	});

	it('findMarkersInRegion filtra por cell + overlap', () => {
		const csvModelLocal = makeFakeCsvSegmentModel();
		const opsLocal = new IcrMarkerOpsImpl({ csvModel: csvModelLocal, app: {} } as never);
		csvModelLocal.store.set('s1', { id: 's1', fileId: 'data.csv', sourceRowId: 5, column: 'c', from: 10, to: 50, codes: [], codedBy: 'human:alice', markerType: 'csv', createdAt: 0, updatedAt: 0 } as SegmentMarker);
		csvModelLocal.store.set('s2', { id: 's2', fileId: 'data.csv', sourceRowId: 6, column: 'c', from: 10, to: 50, codes: [], codedBy: 'human:bob', markerType: 'csv', createdAt: 0, updatedAt: 0 } as SegmentMarker);

		const found = opsLocal.findMarkersInRegion({
			fileId: 'data.csv', engine: 'csvSegment',
			bounds: { kind: 'csvSegment', rowIndex: 5, column: 'c', from: 30, to: 60 },
		});
		expect(found.map(m => m.markerId)).toEqual(['s1']);
	});
});

describe('IcrMarkerOpsImpl — audio/video (E5a)', () => {
	it('audio createMarker insere via audioModel.insertMarkerRaw com fromMs/toMs', () => {
		const audioModel = makeFakeMediaModel('audio');
		const opsLocal = new IcrMarkerOpsImpl({ audioModel, app: {} } as never);
		const r = opsLocal.createMarker('audio', {
			fileId: 'song.mp3',
			bounds: { kind: 'temporal', fromMs: 1000, toMs: 5000 },
			codeIds: ['c_x'],
			codedBy: 'human:alice',
		});
		expect(audioModel.insertMarkerRaw).toHaveBeenCalledTimes(1);
		const inserted = audioModel.store.get(r.markerId)!;
		expect(inserted.from).toBe(1000);
		expect(inserted.to).toBe(5000);
		expect(inserted.markerType).toBe('audio');
	});

	it('video createMarker usa videoModel + markerType=video', () => {
		const videoModel = makeFakeMediaModel('video');
		const opsLocal = new IcrMarkerOpsImpl({ videoModel, app: {} } as never);
		const r = opsLocal.createMarker('video', {
			fileId: 'clip.mp4',
			bounds: { kind: 'temporal', fromMs: 0, toMs: 2000 },
			codeIds: ['c_x'],
			codedBy: 'human:bob',
		});
		const inserted = videoModel.store.get(r.markerId)!;
		expect(inserted.markerType).toBe('video');
	});

	it('createMarker rejeita bounds não-temporal', () => {
		const audioModel = makeFakeMediaModel('audio');
		const opsLocal = new IcrMarkerOpsImpl({ audioModel, app: {} } as never);
		expect(() =>
			opsLocal.createMarker('audio', {
				fileId: 'F.mp3',
				bounds: { kind: 'text', from: 0, to: 10 },
				codeIds: ['c_x'],
				codedBy: 'human:alice',
			}),
		).toThrow(/audio-requires-temporal-bounds/);
	});

	it('findMarkersInRegion filtra por overlap temporal', () => {
		const audioModel = makeFakeMediaModel('audio');
		const opsLocal = new IcrMarkerOpsImpl({ audioModel, app: {} } as never);
		audioModel.store.set('a1', { id: 'a1', fileId: 'song.mp3', from: 1000, to: 3000, codes: [], codedBy: 'human:alice', markerType: 'audio', createdAt: 0, updatedAt: 0 } as MediaMarker);
		audioModel.store.set('a2', { id: 'a2', fileId: 'song.mp3', from: 5000, to: 7000, codes: [], codedBy: 'human:bob', markerType: 'audio', createdAt: 0, updatedAt: 0 } as MediaMarker);

		const found = opsLocal.findMarkersInRegion({
			fileId: 'song.mp3', engine: 'audio',
			bounds: { kind: 'temporal', fromMs: 2000, toMs: 4000 },
		});
		expect(found.map(m => m.markerId)).toEqual(['a1']);
	});
});
