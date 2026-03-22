import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PdfSidebarAdapter } from '../../src/pdf/views/pdfSidebarAdapter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { PdfMarker, PdfShapeMarker } from '../../src/pdf/pdfCodingTypes';
import type { CodeApplication } from '../../src/core/types';
import { hasCode } from '../../src/core/codeApplicationHelpers';

// ── Mock PdfCodingModel ──

function createMockModel() {
	const registry = new CodeDefinitionRegistry();
	const textMarkers: PdfMarker[] = [];
	const shapeMarkers: PdfShapeMarker[] = [];

	return {
		registry,
		onChange: vi.fn(),
		offChange: vi.fn(),
		onHoverChange: vi.fn(),
		offHoverChange: vi.fn(),
		setHoverState: vi.fn(),
		getHoverMarkerId: vi.fn(() => null),

		// text markers
		getAllMarkers: vi.fn(() => textMarkers),
		getMarkersForFile: vi.fn((fileId: string) => textMarkers.filter(m => m.fileId === fileId)),
		findMarkerById: vi.fn((id: string) => textMarkers.find(m => m.id === id)),
		removeCodeFromMarker: vi.fn((id: string, codeId: string) => {
			const m = textMarkers.find(x => x.id === id);
			if (m) m.codes = m.codes.filter(c => c.codeId !== codeId);
		}),
		removeAllCodesFromMarker: vi.fn(),
		removeMarker: vi.fn(() => true),

		// shapes
		getAllShapes: vi.fn(() => shapeMarkers),
		getShapesForFile: vi.fn((fileId: string) => shapeMarkers.filter(s => s.fileId === fileId)),
		findShapeById: vi.fn((id: string) => shapeMarkers.find(s => s.id === id)),
		deleteShape: vi.fn(),
		removeCodeFromShape: vi.fn((id: string, codeId: string) => {
			const s = shapeMarkers.find(x => x.id === id);
			if (s) s.codes = s.codes.filter(c => c.codeId !== codeId);
		}),
		getShapeLabel: vi.fn((s: PdfShapeMarker) => `${s.shape} on page ${s.page}`),

		// persistence
		save: vi.fn(),
		notify: vi.fn(),

		// helpers to push test data
		_textMarkers: textMarkers,
		_shapeMarkers: shapeMarkers,
	};
}

type MockModel = ReturnType<typeof createMockModel>;

function mkTextMarker(overrides: Partial<PdfMarker> = {}): PdfMarker {
	return {
		id: 'tm-1',
		fileId: 'doc.pdf',
		page: 1,
		beginIndex: 0,
		beginOffset: 0,
		endIndex: 0,
		endOffset: 10,
		text: 'Hello world',
		codes: [{ codeId: 'code-a-id' }],
		createdAt: 1000,
		updatedAt: 1000,
		...overrides,
	};
}

function mkShapeMarker(overrides: Partial<PdfShapeMarker> = {}): PdfShapeMarker {
	return {
		id: 'sm-1',
		fileId: 'doc.pdf',
		page: 2,
		shape: 'rect',
		coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
		codes: [{ codeId: 'code-b-id' }],
		createdAt: 2000,
		updatedAt: 2000,
		...overrides,
	};
}

let model: MockModel;
let adapter: PdfSidebarAdapter;

beforeEach(() => {
	model = createMockModel();
	adapter = new PdfSidebarAdapter(model as any);
});

// ── Constructor ──

describe('constructor', () => {
	it('sets registry from model', () => {
		expect(adapter.registry).toBe(model.registry);
	});
});

// ── getAllMarkers ──

describe('getAllMarkers', () => {
	it('returns empty array when no markers', () => {
		expect(adapter.getAllMarkers()).toEqual([]);
	});

	it('converts text markers to PdfBaseMarker', () => {
		model._textMarkers.push(mkTextMarker());
		const result = adapter.getAllMarkers();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			markerType: 'pdf',
			id: 'tm-1',
			fileId: 'doc.pdf',
			page: 1,
			isShape: false,
			text: 'Hello world',
			codes: [{ codeId: 'code-a-id' }],
		});
	});

	it('converts shape markers to PdfBaseMarker', () => {
		model._shapeMarkers.push(mkShapeMarker());
		const result = adapter.getAllMarkers();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			markerType: 'pdf',
			id: 'sm-1',
			page: 2,
			isShape: true,
			text: '',
		});
		expect(result[0].shapeLabel).toBeDefined();
	});

	it('merges text and shape markers', () => {
		model._textMarkers.push(mkTextMarker());
		model._shapeMarkers.push(mkShapeMarker());
		const result = adapter.getAllMarkers();
		expect(result).toHaveLength(2);
		expect(result[0].isShape).toBe(false);
		expect(result[1].isShape).toBe(true);
	});

	it('preserves memo and colorOverride from text marker', () => {
		model._textMarkers.push(mkTextMarker({ memo: 'note', colorOverride: '#ff0000' }));
		const result = adapter.getAllMarkers();
		expect(result[0].memo).toBe('note');
		expect(result[0].colorOverride).toBe('#ff0000');
	});

	it('preserves memo and colorOverride from shape marker', () => {
		model._shapeMarkers.push(mkShapeMarker({ memo: 'shape note', colorOverride: '#00ff00' }));
		const result = adapter.getAllMarkers();
		expect(result[0].memo).toBe('shape note');
		expect(result[0].colorOverride).toBe('#00ff00');
	});
});

// ── getMarkerById ──

describe('getMarkerById', () => {
	it('returns null when not found', () => {
		expect(adapter.getMarkerById('nonexistent')).toBeNull();
	});

	it('finds text marker by id', () => {
		const tm = mkTextMarker();
		model._textMarkers.push(tm);
		const result = adapter.getMarkerById('tm-1');
		expect(result).not.toBeNull();
		expect(result!.isShape).toBe(false);
		expect(result!.id).toBe('tm-1');
	});

	it('finds shape marker by id when text lookup misses', () => {
		const sm = mkShapeMarker();
		model._shapeMarkers.push(sm);
		const result = adapter.getMarkerById('sm-1');
		expect(result).not.toBeNull();
		expect(result!.isShape).toBe(true);
		expect(result!.id).toBe('sm-1');
	});

	it('prefers text marker when id matches both', () => {
		const tm = mkTextMarker({ id: 'shared-id' });
		const sm = mkShapeMarker({ id: 'shared-id' });
		model._textMarkers.push(tm);
		model._shapeMarkers.push(sm);
		const result = adapter.getMarkerById('shared-id');
		expect(result!.isShape).toBe(false);
	});
});

// ── getAllFileIds ──

describe('getAllFileIds', () => {
	it('returns empty array when no markers', () => {
		expect(adapter.getAllFileIds()).toEqual([]);
	});

	it('merges file ids from text and shape markers', () => {
		model._textMarkers.push(mkTextMarker({ fileId: 'a.pdf' }));
		model._shapeMarkers.push(mkShapeMarker({ fileId: 'b.pdf' }));
		const ids = adapter.getAllFileIds();
		expect(ids).toContain('a.pdf');
		expect(ids).toContain('b.pdf');
	});

	it('deduplicates file ids', () => {
		model._textMarkers.push(mkTextMarker({ fileId: 'a.pdf' }));
		model._shapeMarkers.push(mkShapeMarker({ fileId: 'a.pdf' }));
		const ids = adapter.getAllFileIds();
		expect(ids).toHaveLength(1);
		expect(ids[0]).toBe('a.pdf');
	});
});

// ── getMarkersForFile ──

describe('getMarkersForFile', () => {
	it('returns empty when no markers match', () => {
		expect(adapter.getMarkersForFile('none.pdf')).toEqual([]);
	});

	it('returns text and shape markers for the given file', () => {
		model._textMarkers.push(mkTextMarker({ fileId: 'doc.pdf' }));
		model._shapeMarkers.push(mkShapeMarker({ fileId: 'doc.pdf' }));
		model._textMarkers.push(mkTextMarker({ id: 'tm-other', fileId: 'other.pdf' }));
		const result = adapter.getMarkersForFile('doc.pdf');
		expect(result).toHaveLength(2);
	});
});

// ── saveMarkers ──

describe('saveMarkers', () => {
	it('delegates to model.save()', () => {
		adapter.saveMarkers();
		expect(model.save).toHaveBeenCalledOnce();
	});
});

// ── updateDecorations ──

describe('updateDecorations', () => {
	it('calls model.notify()', () => {
		adapter.updateDecorations('doc.pdf');
		expect(model.notify).toHaveBeenCalledOnce();
	});
});

// ── updateMarkerFields ──

describe('updateMarkerFields', () => {
	it('updates memo on text marker', () => {
		const tm = mkTextMarker();
		model._textMarkers.push(tm);
		adapter.updateMarkerFields('tm-1', { memo: 'updated' });
		expect(tm.memo).toBe('updated');
		expect(model.notify).toHaveBeenCalled();
	});

	it('updates colorOverride on text marker', () => {
		const tm = mkTextMarker();
		model._textMarkers.push(tm);
		adapter.updateMarkerFields('tm-1', { colorOverride: '#abc' });
		expect(tm.colorOverride).toBe('#abc');
	});

	it('updates memo on shape marker when text lookup misses', () => {
		const sm = mkShapeMarker();
		model._shapeMarkers.push(sm);
		adapter.updateMarkerFields('sm-1', { memo: 'shape memo' });
		expect(sm.memo).toBe('shape memo');
		expect(model.notify).toHaveBeenCalled();
	});

	it('updates updatedAt timestamp', () => {
		const tm = mkTextMarker();
		model._textMarkers.push(tm);
		const before = Date.now();
		adapter.updateMarkerFields('tm-1', { memo: 'x' });
		expect(tm.updatedAt).toBeGreaterThanOrEqual(before);
	});

	it('is a no-op when marker not found', () => {
		adapter.updateMarkerFields('nonexistent', { memo: 'x' });
		expect(model.notify).not.toHaveBeenCalled();
	});
});

// ── removeMarker ──

describe('removeMarker', () => {
	it('removes text marker via removeAllCodesFromMarker', () => {
		const tm = mkTextMarker();
		model._textMarkers.push(tm);
		const result = adapter.removeMarker('tm-1');
		expect(result).toBe(true);
		expect(model.removeAllCodesFromMarker).toHaveBeenCalledWith('tm-1');
	});

	it('removes shape marker via deleteShape', () => {
		const sm = mkShapeMarker();
		model._shapeMarkers.push(sm);
		const result = adapter.removeMarker('sm-1');
		expect(result).toBe(true);
		expect(model.deleteShape).toHaveBeenCalledWith('sm-1');
	});

	it('returns false when marker not found', () => {
		const result = adapter.removeMarker('nonexistent');
		expect(result).toBe(false);
	});
});

// ── deleteCode ──

describe('deleteCode', () => {
	it('removes code from text markers', () => {
		const defA = model.registry.create('A');
		const defB = model.registry.create('B');
		model._textMarkers.push(mkTextMarker({ id: 'tm-1', codes: [{ codeId: defA.id }, { codeId: defB.id }] }));
		model._textMarkers.push(mkTextMarker({ id: 'tm-2', codes: [{ codeId: defB.id }] }));
		adapter.deleteCode(defA.id);
		expect(model.removeCodeFromMarker).toHaveBeenCalledWith('tm-1', defA.id);
		expect(model.removeCodeFromMarker).not.toHaveBeenCalledWith('tm-2', defA.id);
	});

	it('removes code from shape markers', () => {
		const defX = model.registry.create('X');
		model._shapeMarkers.push(mkShapeMarker({ id: 'sm-1', codes: [{ codeId: defX.id }] }));
		adapter.deleteCode(defX.id);
		expect(model.removeCodeFromShape).toHaveBeenCalledWith('sm-1', defX.id);
	});

	it('deletes code definition from registry', () => {
		const def = model.registry.create('ToDelete');
		adapter.deleteCode(def.id);
		expect(model.registry.getByName('ToDelete')).toBeUndefined();
	});

	it('calls saveMarkers after cleanup', () => {
		const def = model.registry.create('X');
		adapter.deleteCode(def.id);
		expect(model.save).toHaveBeenCalledOnce();
	});
});
