import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PdfCodingModel } from '../../src/pdf/pdfCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { NormalizedShapeCoords, RectCoords, EllipseCoords, PolygonCoords } from '../../src/core/shapeTypes';

// ── Mock DataManager ──

function createMockDm(initial: Record<string, any> = {}) {
	const store: Record<string, any> = { ...initial };
	return {
		section: (k: string) => {
			if (!store[k]) store[k] = { markers: [], shapes: [] };
			return store[k];
		},
		setSection: vi.fn((k: string, v: any) => { store[k] = v; }),
		markDirty: vi.fn(),
	};
}

// ── Helpers ──

const rectCoords: RectCoords = { type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
const ellipseCoords: EllipseCoords = { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.2 };
const polyCoords: PolygonCoords = { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] };

function createMarkerVia(model: PdfCodingModel, file = 'doc.pdf', page = 1, text = 'hello world') {
	return model.findOrCreateMarker(file, page, 0, 0, 0, 10, text);
}

let model: PdfCodingModel;
let registry: CodeDefinitionRegistry;
let dm: ReturnType<typeof createMockDm>;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
	dm = createMockDm();
	model = new PdfCodingModel(dm as any, registry);
});

// ══════════════════════════════════════════════════════════════
// Marker CRUD
// ══════════════════════════════════════════════════════════════

describe('findOrCreateMarker', () => {
	it('creates a new marker with correct fields', () => {
		const m = model.findOrCreateMarker('doc.pdf', 2, 3, 5, 7, 11, 'some text');
		expect(m.id).toBeTruthy();
		expect(m.fileId).toBe('doc.pdf');
		expect(m.page).toBe(2);
		expect(m.beginIndex).toBe(3);
		expect(m.beginOffset).toBe(5);
		expect(m.endIndex).toBe(7);
		expect(m.endOffset).toBe(11);
		expect(m.text).toBe('some text');
		expect(m.codes).toEqual([]);
		expect(m.createdAt).toBeGreaterThan(0);
		expect(m.updatedAt).toBeGreaterThan(0);
	});

	it('returns existing marker when params match exactly', () => {
		const m1 = model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'hello');
		const m2 = model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'hello');
		expect(m1).toBe(m2);
	});

	it('creates separate markers when params differ', () => {
		const m1 = model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'a');
		const m2 = model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 20, 'b');
		expect(m1.id).not.toBe(m2.id);
	});
});

describe('findExistingMarker', () => {
	it('finds marker by exact params', () => {
		const m = model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'hello');
		const found = model.findExistingMarker('doc.pdf', 1, 0, 0, 0, 10);
		expect(found).toBe(m);
	});

	it('returns undefined when no match', () => {
		model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'hello');
		expect(model.findExistingMarker('doc.pdf', 1, 0, 0, 0, 99)).toBeUndefined();
	});

	it('returns undefined when file differs', () => {
		model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'hello');
		expect(model.findExistingMarker('other.pdf', 1, 0, 0, 0, 10)).toBeUndefined();
	});

	it('returns undefined when page differs', () => {
		model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'hello');
		expect(model.findExistingMarker('doc.pdf', 2, 0, 0, 0, 10)).toBeUndefined();
	});
});

describe('getMarkersForPage', () => {
	it('filters by file and page', () => {
		model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'a');
		model.findOrCreateMarker('doc.pdf', 1, 1, 0, 1, 10, 'b');
		model.findOrCreateMarker('doc.pdf', 2, 0, 0, 0, 10, 'c');
		model.findOrCreateMarker('other.pdf', 1, 0, 0, 0, 10, 'd');
		expect(model.getMarkersForPage('doc.pdf', 1)).toHaveLength(2);
		expect(model.getMarkersForPage('doc.pdf', 2)).toHaveLength(1);
		expect(model.getMarkersForPage('other.pdf', 1)).toHaveLength(1);
		expect(model.getMarkersForPage('doc.pdf', 3)).toEqual([]);
	});
});

describe('getMarkersForFile', () => {
	it('filters by file only', () => {
		model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'a');
		model.findOrCreateMarker('doc.pdf', 2, 0, 0, 0, 10, 'b');
		model.findOrCreateMarker('other.pdf', 1, 0, 0, 0, 10, 'c');
		expect(model.getMarkersForFile('doc.pdf')).toHaveLength(2);
		expect(model.getMarkersForFile('other.pdf')).toHaveLength(1);
		expect(model.getMarkersForFile('none.pdf')).toEqual([]);
	});
});

describe('findMarkerById', () => {
	it('finds existing marker', () => {
		const m = createMarkerVia(model);
		expect(model.findMarkerById(m.id)).toBe(m);
	});

	it('returns undefined for unknown id', () => {
		expect(model.findMarkerById('nonexistent')).toBeUndefined();
	});
});

describe('getAllMarkers', () => {
	it('returns a copy, not a reference', () => {
		createMarkerVia(model);
		createMarkerVia(model, 'b.pdf');
		const all = model.getAllMarkers();
		expect(all).toHaveLength(2);
		all.push({} as any);
		expect(model.getAllMarkers()).toHaveLength(2);
	});

	it('returns empty array when no markers', () => {
		expect(model.getAllMarkers()).toEqual([]);
	});
});

// ══════════════════════════════════════════════════════════════
// Code assignment
// ══════════════════════════════════════════════════════════════

describe('addCodeToMarker', () => {
	it('adds code and registers in registry', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'Theme A');
		expect(m.codes).toContain('Theme A');
		expect(registry.getByName('Theme A')).toBeDefined();
	});

	it('does not add duplicate code', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'Theme A');
		model.addCodeToMarker(m.id, 'Theme A');
		expect(m.codes.filter(c => c === 'Theme A')).toHaveLength(1);
	});

	it('calls notify on add', () => {
		const listener = vi.fn();
		model.onChange(listener);
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'Theme A');
		expect(listener).toHaveBeenCalled();
	});

	it('does nothing for unknown marker', () => {
		model.addCodeToMarker('nonexistent', 'Theme A');
		// Should not throw
		expect(model.getAllMarkers()).toEqual([]);
	});

	it('updates updatedAt timestamp', () => {
		const m = createMarkerVia(model);
		const before = m.updatedAt;
		// Small delay to ensure different timestamp
		vi.spyOn(Date, 'now').mockReturnValue(before + 1000);
		model.addCodeToMarker(m.id, 'Theme A');
		expect(m.updatedAt).toBe(before + 1000);
		vi.restoreAllMocks();
	});
});

describe('removeCodeFromMarker', () => {
	it('removes code and deletes marker when empty', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'Theme A');
		model.removeCodeFromMarker(m.id, 'Theme A');
		expect(model.findMarkerById(m.id)).toBeUndefined();
	});

	it('keeps marker when keepIfEmpty is true', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'Theme A');
		model.removeCodeFromMarker(m.id, 'Theme A', true);
		expect(model.findMarkerById(m.id)).toBeDefined();
		expect(m.codes).toEqual([]);
	});

	it('keeps marker when other codes remain', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'Theme A');
		model.addCodeToMarker(m.id, 'Theme B');
		model.removeCodeFromMarker(m.id, 'Theme A');
		expect(model.findMarkerById(m.id)).toBeDefined();
		expect(m.codes).toEqual(['Theme B']);
	});

	it('does nothing for unknown marker', () => {
		model.removeCodeFromMarker('nonexistent', 'Theme A');
		// Should not throw
	});

	it('calls notify', () => {
		const listener = vi.fn();
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'Theme A');
		model.onChange(listener);
		model.removeCodeFromMarker(m.id, 'Theme A');
		expect(listener).toHaveBeenCalled();
	});
});

describe('removeAllCodesFromMarker', () => {
	it('removes all codes and deletes marker', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'A');
		model.addCodeToMarker(m.id, 'B');
		model.addCodeToMarker(m.id, 'C');
		model.removeAllCodesFromMarker(m.id);
		expect(model.findMarkerById(m.id)).toBeUndefined();
	});

	it('does nothing for marker with no codes', () => {
		const m = createMarkerVia(model);
		const listener = vi.fn();
		model.onChange(listener);
		model.removeAllCodesFromMarker(m.id);
		expect(listener).not.toHaveBeenCalled();
	});

	it('does nothing for unknown marker', () => {
		model.removeAllCodesFromMarker('nonexistent');
		// Should not throw
	});
});

// ══════════════════════════════════════════════════════════════
// Range update
// ══════════════════════════════════════════════════════════════

describe('updateMarkerRange', () => {
	it('updates range fields', () => {
		const m = createMarkerVia(model);
		model.updateMarkerRange(m.id, { beginIndex: 5, endIndex: 15, text: 'new text' });
		expect(m.beginIndex).toBe(5);
		expect(m.endIndex).toBe(15);
		expect(m.text).toBe('new text');
	});

	it('calls notify', () => {
		const listener = vi.fn();
		model.onChange(listener);
		const m = createMarkerVia(model);
		model.updateMarkerRange(m.id, { beginOffset: 2 });
		expect(listener).toHaveBeenCalled();
	});

	it('updates updatedAt', () => {
		const m = createMarkerVia(model);
		const before = m.updatedAt;
		vi.spyOn(Date, 'now').mockReturnValue(before + 5000);
		model.updateMarkerRange(m.id, { endOffset: 20 });
		expect(m.updatedAt).toBe(before + 5000);
		vi.restoreAllMocks();
	});

	it('does nothing for unknown marker', () => {
		model.updateMarkerRange('nonexistent', { beginIndex: 5 });
		// Should not throw
	});
});

describe('updateMarkerRangeSilent', () => {
	it('updates fields without notify', () => {
		const listener = vi.fn();
		model.onChange(listener);
		const m = createMarkerVia(model);
		model.updateMarkerRangeSilent(m.id, { beginIndex: 5, text: 'silent' });
		expect(m.beginIndex).toBe(5);
		expect(m.text).toBe('silent');
		expect(listener).not.toHaveBeenCalled();
	});

	it('does not push undo entry', () => {
		const m = createMarkerVia(model);
		model.updateMarkerRangeSilent(m.id, { beginIndex: 5 });
		expect(model.undo()).toBe(false);
	});

	it('does nothing for unknown marker', () => {
		model.updateMarkerRangeSilent('nonexistent', { beginIndex: 5 });
		// Should not throw
	});
});

// ══════════════════════════════════════════════════════════════
// Undo system
// ══════════════════════════════════════════════════════════════

describe('undo', () => {
	it('undoes addCode — restores previous codes', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'A');
		model.addCodeToMarker(m.id, 'B');
		model.undo();
		expect(m.codes).toEqual(['A']);
	});

	it('undoes removeCode — restores codes on existing marker', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'A');
		model.addCodeToMarker(m.id, 'B');
		model.removeCodeFromMarker(m.id, 'A', true);
		model.undo();
		expect(m.codes).toContain('A');
		expect(m.codes).toContain('B');
	});

	it('undoes removeCode — re-creates deleted marker', () => {
		const m = createMarkerVia(model);
		const id = m.id;
		model.addCodeToMarker(id, 'A');
		model.removeCodeFromMarker(id, 'A'); // deletes marker
		expect(model.findMarkerById(id)).toBeUndefined();
		model.undo();
		const restored = model.findMarkerById(id);
		expect(restored).toBeDefined();
		expect(restored!.codes).toContain('A');
	});

	it('undoes removeAllCodes — restores all codes and re-creates marker', () => {
		const m = createMarkerVia(model);
		const id = m.id;
		model.addCodeToMarker(id, 'A');
		model.addCodeToMarker(id, 'B');
		model.removeAllCodesFromMarker(id);
		expect(model.findMarkerById(id)).toBeUndefined();
		model.undo();
		const restored = model.findMarkerById(id);
		expect(restored).toBeDefined();
		expect(restored!.codes).toEqual(['A', 'B']);
	});

	it('undoes resizeMarker — restores original range', () => {
		const m = createMarkerVia(model);
		const origBegin = m.beginIndex;
		const origEnd = m.endIndex;
		const origText = m.text;
		model.updateMarkerRange(m.id, { beginIndex: 99, endIndex: 200, text: 'changed' });
		model.undo();
		expect(m.beginIndex).toBe(origBegin);
		expect(m.endIndex).toBe(origEnd);
		expect(m.text).toBe(origText);
	});

	it('returns false when undo stack is empty', () => {
		expect(model.undo()).toBe(false);
	});

	it('returns true on successful undo', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'A');
		expect(model.undo()).toBe(true);
	});

	it('caps undo stack at MAX_UNDO (50)', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'base');
		// Push 55 undo entries via resize
		for (let i = 0; i < 55; i++) {
			model.updateMarkerRange(m.id, { beginIndex: i });
		}
		// Should be able to undo exactly 50 times (MAX_UNDO), then one more for addCode = 51 total
		// Actually: 55 resize + 1 addCode = 56, capped at 50
		let count = 0;
		while (model.undo()) count++;
		expect(count).toBe(50);
	});

	it('removeAllCodesFromMarker does not push per-code undo entries (suppressUndo)', () => {
		const m = createMarkerVia(model);
		const id = m.id;
		model.addCodeToMarker(id, 'A');
		model.addCodeToMarker(id, 'B');
		model.addCodeToMarker(id, 'C');
		// 3 addCode entries on stack now
		model.removeAllCodesFromMarker(id);
		// Should push exactly 1 removeAllCodes entry (not 3 removeCode entries)
		// Stack: 3 addCode + 1 removeAllCodes = 4
		model.undo(); // undo removeAllCodes — restores A, B, C
		const restored = model.findMarkerById(id);
		expect(restored).toBeDefined();
		expect(restored!.codes).toEqual(['A', 'B', 'C']);
	});

	it('calls notify after undo', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'A');
		const listener = vi.fn();
		model.onChange(listener);
		model.undo();
		expect(listener).toHaveBeenCalled();
	});
});

// ══════════════════════════════════════════════════════════════
// Persistence
// ══════════════════════════════════════════════════════════════

describe('load', () => {
	it('reads markers from dataManager section', () => {
		const existing = {
			pdf: {
				markers: [{ id: 'x', fileId: 'doc.pdf', page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5, text: 'hi', codes: ['A'], createdAt: 1, updatedAt: 1 }],
				shapes: [],
			},
		};
		dm = createMockDm(existing);
		model = new PdfCodingModel(dm as any, registry);
		model.load();
		expect(model.getAllMarkers()).toHaveLength(1);
		expect(model.getAllMarkers()[0].text).toBe('hi');
	});

	it('reads shapes from dataManager section', () => {
		const existing = {
			pdf: {
				markers: [],
				shapes: [{ id: 's1', fileId: 'doc.pdf', page: 1, shape: 'rect', coords: rectCoords, codes: [], createdAt: 1, updatedAt: 1 }],
			},
		};
		dm = createMockDm(existing);
		model = new PdfCodingModel(dm as any, registry);
		model.load();
		expect(model.getAllShapes()).toHaveLength(1);
	});

	it('handles empty section gracefully', () => {
		model.load();
		expect(model.getAllMarkers()).toEqual([]);
		expect(model.getAllShapes()).toEqual([]);
	});
});

describe('save', () => {
	it('writes markers and shapes to dataManager', () => {
		const m = createMarkerVia(model);
		model.createShape('doc.pdf', 1, rectCoords);
		model.save();
		expect(dm.setSection).toHaveBeenCalledWith('pdf', expect.objectContaining({
			markers: expect.any(Array),
			shapes: expect.any(Array),
		}));
	});
});

describe('notify', () => {
	it('calls save and all listeners', () => {
		const listener1 = vi.fn();
		const listener2 = vi.fn();
		model.onChange(listener1);
		model.onChange(listener2);
		model.notify();
		expect(dm.setSection).toHaveBeenCalled();
		expect(listener1).toHaveBeenCalled();
		expect(listener2).toHaveBeenCalled();
	});
});

// ══════════════════════════════════════════════════════════════
// Listener management
// ══════════════════════════════════════════════════════════════

describe('onChange / offChange', () => {
	it('adds a listener that gets called on notify', () => {
		const fn = vi.fn();
		model.onChange(fn);
		model.notify();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('removes listener via offChange', () => {
		const fn = vi.fn();
		model.onChange(fn);
		model.offChange(fn);
		model.notify();
		expect(fn).not.toHaveBeenCalled();
	});
});

describe('onHoverChange / offHoverChange', () => {
	it('adds hover listener', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.setHoverState('m1', 'code1');
		expect(fn).toHaveBeenCalledWith('m1', 'code1');
	});

	it('removes hover listener', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.offHoverChange(fn);
		model.setHoverState('m1', 'code1');
		expect(fn).not.toHaveBeenCalled();
	});
});

// ══════════════════════════════════════════════════════════════
// Hover state
// ══════════════════════════════════════════════════════════════

describe('setHoverState', () => {
	it('sets markerId and codeName', () => {
		model.setHoverState('m1', 'code1');
		expect(model.getHoverMarkerId()).toBe('m1');
	});

	it('no-ops when values unchanged', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.setHoverState('m1', 'code1');
		model.setHoverState('m1', 'code1');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('fires when markerId changes', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.setHoverState('m1', null);
		model.setHoverState('m2', null);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('fires when codeName changes', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.setHoverState('m1', 'a');
		model.setHoverState('m1', 'b');
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('clears hover with null', () => {
		model.setHoverState('m1', 'code1');
		model.setHoverState(null, null);
		expect(model.getHoverMarkerId()).toBeNull();
	});

	it('setHoverState with hoveredIds stores array', () => {
		model.setHoverState('m1', 'code-a', ['m1', 'm2']);
		expect(model.getHoverMarkerIds()).toEqual(['m1', 'm2']);
	});

	it('setHoverState without hoveredIds defaults to [markerId]', () => {
		model.setHoverState('m1', 'code-a');
		expect(model.getHoverMarkerIds()).toEqual(['m1']);
	});

	it('setHoverState(null) clears hoveredIds', () => {
		model.setHoverState('m1', 'code-a');
		model.setHoverState(null, null);
		expect(model.getHoverMarkerIds()).toEqual([]);
	});
});

// ══════════════════════════════════════════════════════════════
// File rename
// ══════════════════════════════════════════════════════════════

describe('migrateFilePath', () => {
	it('updates fileId on all matching markers', () => {
		model.findOrCreateMarker('old.pdf', 1, 0, 0, 0, 10, 'a');
		model.findOrCreateMarker('old.pdf', 2, 0, 0, 0, 10, 'b');
		model.migrateFilePath('old.pdf', 'new.pdf');
		expect(model.getMarkersForFile('new.pdf')).toHaveLength(2);
		expect(model.getMarkersForFile('old.pdf')).toEqual([]);
	});

	it('updates fileId on all matching shapes', () => {
		model.createShape('old.pdf', 1, rectCoords);
		model.createShape('old.pdf', 2, ellipseCoords);
		model.migrateFilePath('old.pdf', 'new.pdf');
		expect(model.getShapesForFile('new.pdf')).toHaveLength(2);
		expect(model.getShapesForFile('old.pdf')).toEqual([]);
	});

	it('calls save and listeners when changes found', () => {
		const listener = vi.fn();
		model.onChange(listener);
		model.findOrCreateMarker('old.pdf', 1, 0, 0, 0, 10, 'a');
		listener.mockClear();
		dm.setSection.mockClear();
		model.migrateFilePath('old.pdf', 'new.pdf');
		expect(dm.setSection).toHaveBeenCalled();
		expect(listener).toHaveBeenCalled();
	});

	it('does nothing for unknown path', () => {
		model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'a');
		const listener = vi.fn();
		model.onChange(listener);
		model.migrateFilePath('nonexistent.pdf', 'new.pdf');
		expect(listener).not.toHaveBeenCalled();
	});
});

// ══════════════════════════════════════════════════════════════
// Shape operations
// ══════════════════════════════════════════════════════════════

describe('createShape', () => {
	it('creates shape with correct fields', () => {
		const s = model.createShape('doc.pdf', 3, rectCoords);
		expect(s.id).toBeTruthy();
		expect(s.fileId).toBe('doc.pdf');
		expect(s.page).toBe(3);
		expect(s.shape).toBe('rect');
		expect(s.coords).toEqual(rectCoords);
		expect(s.codes).toEqual([]);
	});

	it('calls notify', () => {
		const fn = vi.fn();
		model.onChange(fn);
		model.createShape('doc.pdf', 1, rectCoords);
		expect(fn).toHaveBeenCalled();
	});
});

describe('updateShapeCoords', () => {
	it('updates coords and shape type', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		model.updateShapeCoords(s.id, ellipseCoords);
		expect(s.coords).toEqual(ellipseCoords);
		expect(s.shape).toBe('ellipse');
	});

	it('calls notify', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		const fn = vi.fn();
		model.onChange(fn);
		model.updateShapeCoords(s.id, ellipseCoords);
		expect(fn).toHaveBeenCalled();
	});

	it('does nothing for unknown shape', () => {
		model.updateShapeCoords('nonexistent', rectCoords);
		// Should not throw
	});
});

describe('deleteShape', () => {
	it('removes shape', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		model.deleteShape(s.id);
		expect(model.findShapeById(s.id)).toBeUndefined();
	});

	it('calls notify', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		const fn = vi.fn();
		model.onChange(fn);
		model.deleteShape(s.id);
		expect(fn).toHaveBeenCalled();
	});
});

describe('getShapesForPage', () => {
	it('filters by file and page', () => {
		model.createShape('doc.pdf', 1, rectCoords);
		model.createShape('doc.pdf', 1, ellipseCoords);
		model.createShape('doc.pdf', 2, rectCoords);
		model.createShape('other.pdf', 1, rectCoords);
		expect(model.getShapesForPage('doc.pdf', 1)).toHaveLength(2);
		expect(model.getShapesForPage('doc.pdf', 2)).toHaveLength(1);
		expect(model.getShapesForPage('other.pdf', 1)).toHaveLength(1);
		expect(model.getShapesForPage('doc.pdf', 3)).toEqual([]);
	});
});

describe('getShapesForFile', () => {
	it('filters by file', () => {
		model.createShape('doc.pdf', 1, rectCoords);
		model.createShape('doc.pdf', 2, rectCoords);
		model.createShape('other.pdf', 1, rectCoords);
		expect(model.getShapesForFile('doc.pdf')).toHaveLength(2);
		expect(model.getShapesForFile('other.pdf')).toHaveLength(1);
		expect(model.getShapesForFile('none.pdf')).toEqual([]);
	});
});

describe('getAllShapes', () => {
	it('returns a copy', () => {
		model.createShape('doc.pdf', 1, rectCoords);
		const all = model.getAllShapes();
		all.push({} as any);
		expect(model.getAllShapes()).toHaveLength(1);
	});
});

describe('findShapeById', () => {
	it('finds existing shape', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		expect(model.findShapeById(s.id)).toBe(s);
	});

	it('returns undefined for unknown id', () => {
		expect(model.findShapeById('nonexistent')).toBeUndefined();
	});
});

describe('addCodeToShape', () => {
	it('adds code and registers in registry', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		model.addCodeToShape(s.id, 'Region A');
		expect(s.codes).toContain('Region A');
		expect(registry.getByName('Region A')).toBeDefined();
	});

	it('does not add duplicate code', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		model.addCodeToShape(s.id, 'Region A');
		model.addCodeToShape(s.id, 'Region A');
		expect(s.codes.filter(c => c === 'Region A')).toHaveLength(1);
	});

	it('calls notify', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		const fn = vi.fn();
		model.onChange(fn);
		model.addCodeToShape(s.id, 'Region A');
		expect(fn).toHaveBeenCalled();
	});

	it('does nothing for unknown shape', () => {
		model.addCodeToShape('nonexistent', 'Region A');
		// Should not throw
	});
});

describe('removeCodeFromShape', () => {
	it('removes code and deletes shape when empty', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		model.addCodeToShape(s.id, 'Region A');
		model.removeCodeFromShape(s.id, 'Region A');
		expect(model.findShapeById(s.id)).toBeUndefined();
	});

	it('keeps shape when keepIfEmpty is true', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		model.addCodeToShape(s.id, 'Region A');
		model.removeCodeFromShape(s.id, 'Region A', true);
		expect(model.findShapeById(s.id)).toBeDefined();
		expect(s.codes).toEqual([]);
	});

	it('keeps shape when other codes remain', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		model.addCodeToShape(s.id, 'A');
		model.addCodeToShape(s.id, 'B');
		model.removeCodeFromShape(s.id, 'A');
		expect(model.findShapeById(s.id)).toBeDefined();
		expect(s.codes).toEqual(['B']);
	});

	it('does nothing for unknown shape', () => {
		model.removeCodeFromShape('nonexistent', 'A');
		// Should not throw
	});
});

describe('removeAllCodesFromShape', () => {
	it('clears codes and deletes shape', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		model.addCodeToShape(s.id, 'A');
		model.addCodeToShape(s.id, 'B');
		model.removeAllCodesFromShape(s.id);
		expect(model.findShapeById(s.id)).toBeUndefined();
	});

	it('does nothing for shape with no codes', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		const fn = vi.fn();
		model.onChange(fn);
		fn.mockClear();
		model.removeAllCodesFromShape(s.id);
		// Shape still exists since no codes to remove triggered early return
		expect(model.findShapeById(s.id)).toBeDefined();
	});

	it('does nothing for unknown shape', () => {
		model.removeAllCodesFromShape('nonexistent');
		// Should not throw
	});
});

describe('getShapeLabel', () => {
	it('formats Rectangle label', () => {
		const s = model.createShape('doc.pdf', 3, rectCoords);
		expect(model.getShapeLabel(s)).toBe('Rectangle — Page 3');
	});

	it('formats Ellipse label', () => {
		const s = model.createShape('doc.pdf', 1, ellipseCoords);
		expect(model.getShapeLabel(s)).toBe('Ellipse — Page 1');
	});

	it('formats Polygon label', () => {
		const s = model.createShape('doc.pdf', 5, polyCoords);
		expect(model.getShapeLabel(s)).toBe('Polygon — Page 5');
	});

	it('falls back to raw shape type for unknown', () => {
		const s = model.createShape('doc.pdf', 1, rectCoords);
		(s as any).shape = 'freehand';
		expect(model.getShapeLabel(s)).toBe('freehand — Page 1');
	});
});

// ══════════════════════════════════════════════════════════════
// Misc helpers
// ══════════════════════════════════════════════════════════════

describe('getMarkerText', () => {
	it('returns the marker text field', () => {
		const m = model.findOrCreateMarker('doc.pdf', 1, 0, 0, 0, 10, 'selected text');
		expect(model.getMarkerText(m)).toBe('selected text');
	});
});

describe('getMarkerLabel', () => {
	it('returns Page N format', () => {
		const m = model.findOrCreateMarker('doc.pdf', 7, 0, 0, 0, 10, 'text');
		expect(model.getMarkerLabel(m)).toBe('Page 7');
	});
});

describe('getAllCodes', () => {
	it('returns all code definitions from registry', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'Alpha');
		model.addCodeToMarker(m.id, 'Beta');
		const codes = model.getAllCodes();
		expect(codes).toHaveLength(2);
		expect(codes.map(c => c.name)).toContain('Alpha');
		expect(codes.map(c => c.name)).toContain('Beta');
	});
});

// ── removeAllCodesFromMarker ──

describe('removeAllCodesFromMarker', () => {
	it('removes marker and notifies once', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'CodeA');
		model.addCodeToMarker(m.id, 'CodeB');
		model.addCodeToMarker(m.id, 'CodeC');

		const listener = vi.fn();
		model.onChange(listener);
		listener.mockClear();

		model.removeAllCodesFromMarker(m.id);

		expect(listener).toHaveBeenCalledTimes(1);
		expect(model.findMarkerById(m.id)).toBeUndefined();
	});

	it('is undoable as single operation', () => {
		const m = createMarkerVia(model);
		model.addCodeToMarker(m.id, 'CodeA');
		model.addCodeToMarker(m.id, 'CodeB');

		model.removeAllCodesFromMarker(m.id);
		expect(model.findMarkerById(m.id)).toBeUndefined();

		model.undo();
		const restored = model.findMarkerById(m.id);
		expect(restored).toBeDefined();
		expect(restored!.codes).toEqual(['CodeA', 'CodeB']);
	});

	it('no-ops on nonexistent marker', () => {
		const listener = vi.fn();
		model.onChange(listener);
		listener.mockClear();

		model.removeAllCodesFromMarker('nonexistent');
		expect(listener).not.toHaveBeenCalled();
	});

	it('no-ops on marker with no codes', () => {
		const m = createMarkerVia(model);
		const listener = vi.fn();
		model.onChange(listener);
		listener.mockClear();

		model.removeAllCodesFromMarker(m.id);
		expect(listener).not.toHaveBeenCalled();
	});
});
