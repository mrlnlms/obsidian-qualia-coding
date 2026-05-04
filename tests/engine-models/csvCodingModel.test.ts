import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CsvCodingModel } from '../../src/csv/csvCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { CodeApplication } from '../../src/core/types';

function ca(...codeIds: string[]): CodeApplication[] {
	return codeIds.map(codeId => ({ codeId }));
}

// ── Mock DataManager ──

function createMockDm(initial: Record<string, any> = {}) {
	const store: Record<string, any> = { ...initial };
	return {
		section: (k: string) => {
			if (!store[k]) store[k] = { segmentMarkers: [], rowMarkers: [] };
			return store[k];
		},
		setSection: (k: string, v: any) => { store[k] = v; },
		markDirty: vi.fn(),
	};
}

let model: CsvCodingModel;
let registry: CodeDefinitionRegistry;
let dm: ReturnType<typeof createMockDm>;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
	dm = createMockDm();
	model = new CsvCodingModel(dm as any, registry);
});

// ── Segment Markers ──

describe('findOrCreateSegmentMarker', () => {
	it('creates a new segment marker', () => {
		const marker = model.findOrCreateSegmentMarker({
			fileId: 'data.csv', sourceRowId:0, column: 'text', from: 0, to: 10, text: 'hello',
		});
		expect(marker).toBeDefined();
		expect(marker.fileId).toBe('data.csv');
		expect(marker.sourceRowId).toBe(0);
		expect(marker.column).toBe('text');
		expect(marker.from).toBe(0);
		expect(marker.to).toBe(10);
		expect(marker.codes).toEqual([]);
	});

	it('returns existing segment marker for same snapshot', () => {
		const snap = { fileId: 'data.csv', sourceRowId:0, column: 'text', from: 0, to: 10, text: 'hello' };
		const first = model.findOrCreateSegmentMarker(snap);
		const second = model.findOrCreateSegmentMarker(snap);
		expect(second.id).toBe(first.id);
	});
});

// ── Row Markers ──

describe('findOrCreateRowMarker', () => {
	it('creates a new row marker', () => {
		const marker = model.findOrCreateRowMarker('data.csv', 2, 'name');
		expect(marker.fileId).toBe('data.csv');
		expect(marker.sourceRowId).toBe(2);
		expect(marker.column).toBe('name');
		expect(marker.codes).toEqual([]);
	});

	it('returns existing row marker for same cell', () => {
		const first = model.findOrCreateRowMarker('data.csv', 2, 'name');
		const second = model.findOrCreateRowMarker('data.csv', 2, 'name');
		expect(second.id).toBe(first.id);
	});
});

// ── findMarkerById ──

describe('findMarkerById', () => {
	it('finds segment marker by id', () => {
		const seg = model.findOrCreateSegmentMarker({
			fileId: 'f.csv', sourceRowId:0, column: 'c', from: 0, to: 5, text: 'x',
		});
		expect(model.findMarkerById(seg.id)).toBe(seg);
	});

	it('finds row marker by id', () => {
		const row = model.findOrCreateRowMarker('f.csv', 0, 'c');
		expect(model.findMarkerById(row.id)).toBe(row);
	});

	it('returns undefined for unknown id', () => {
		expect(model.findMarkerById('nonexistent')).toBeUndefined();
	});
});

// ── getAllMarkers ──

describe('getAllMarkers', () => {
	it('returns segments and rows combined', () => {
		model.findOrCreateSegmentMarker({
			fileId: 'f.csv', sourceRowId:0, column: 'c', from: 0, to: 5, text: 'x',
		});
		model.findOrCreateRowMarker('f.csv', 1, 'c');
		expect(model.getAllMarkers()).toHaveLength(2);
	});

	it('returns empty array when no markers', () => {
		expect(model.getAllMarkers()).toEqual([]);
	});
});

// ── addCodeToMarker ──

describe('addCodeToMarker', () => {
	it('adds code as CodeApplication', () => {
		const marker = model.findOrCreateRowMarker('f.csv', 0, 'c');
		model.addCodeToMarker(marker.id, 'code_theme');
		expect(marker.codes).toEqual(ca('code_theme'));
	});

	it('does not add duplicate code', () => {
		const marker = model.findOrCreateRowMarker('f.csv', 0, 'c');
		model.addCodeToMarker(marker.id, 'code_theme');
		model.addCodeToMarker(marker.id, 'code_theme');
		expect(marker.codes).toEqual(ca('code_theme'));
	});

	it('does nothing for unknown marker id', () => {
		model.addCodeToMarker('nonexistent', 'code_theme');
		// no marker found — nothing happens
	});
});

// ── removeCodeFromMarker ──

describe('removeCodeFromMarker', () => {
	it('removes code and deletes marker if empty', () => {
		const marker = model.findOrCreateRowMarker('f.csv', 0, 'c');
		model.addCodeToMarker(marker.id, 'code_theme');
		model.removeCodeFromMarker(marker.id, 'code_theme');
		expect(model.findMarkerById(marker.id)).toBeUndefined();
	});

	it('keeps marker when keepIfEmpty is true', () => {
		const marker = model.findOrCreateRowMarker('f.csv', 0, 'c');
		model.addCodeToMarker(marker.id, 'code_theme');
		model.removeCodeFromMarker(marker.id, 'code_theme', true);
		expect(model.findMarkerById(marker.id)).toBeDefined();
		expect(marker.codes).toEqual([]);
	});

	it('does nothing for unknown marker', () => {
		expect(() => model.removeCodeFromMarker('nonexistent', 'code_theme')).not.toThrow();
	});
});

// ── getMarkersForFile ──

describe('getMarkersForFile', () => {
	it('filters markers by fileId', () => {
		model.findOrCreateRowMarker('a.csv', 0, 'c');
		model.findOrCreateRowMarker('b.csv', 0, 'c');
		model.findOrCreateSegmentMarker({
			fileId: 'a.csv', sourceRowId:1, column: 'c', from: 0, to: 5, text: 'x',
		});
		expect(model.getMarkersForFile('a.csv')).toHaveLength(2);
		expect(model.getMarkersForFile('b.csv')).toHaveLength(1);
		expect(model.getMarkersForFile('c.csv')).toEqual([]);
	});
});

// ── getAllFileIds ──

describe('getAllFileIds', () => {
	it('returns unique file paths', () => {
		model.findOrCreateRowMarker('a.csv', 0, 'c');
		model.findOrCreateRowMarker('a.csv', 1, 'c');
		model.findOrCreateRowMarker('b.csv', 0, 'c');
		const ids = model.getAllFileIds();
		expect(ids).toHaveLength(2);
		expect(ids).toContain('a.csv');
		expect(ids).toContain('b.csv');
	});
});

// ── migrateFilePath ──

describe('migrateFilePath', () => {
	it('renames file path for all markers', () => {
		model.findOrCreateRowMarker('old.csv', 0, 'c');
		model.findOrCreateSegmentMarker({
			fileId: 'old.csv', sourceRowId:1, column: 'c', from: 0, to: 5, text: 'x',
		});
		model.migrateFilePath('old.csv', 'new.csv');
		expect(model.getMarkersForFile('new.csv')).toHaveLength(2);
		expect(model.getMarkersForFile('old.csv')).toEqual([]);
	});

	it('migrates rowDataCache key', () => {
		model.rowDataCache.set('old.csv', [{ col: 'val' }]);
		model.migrateFilePath('old.csv', 'new.csv');
		expect(model.rowDataCache.has('old.csv')).toBe(false);
		expect(model.rowDataCache.get('new.csv')).toEqual([{ col: 'val' }]);
	});

	it('does nothing for unknown path', () => {
		model.findOrCreateRowMarker('a.csv', 0, 'c');
		model.migrateFilePath('nonexistent.csv', 'new.csv');
		expect(model.getMarkersForFile('a.csv')).toHaveLength(1);
	});
});

// ── removeMarker ──

describe('removeMarker', () => {
	it('removes segment marker', () => {
		const seg = model.findOrCreateSegmentMarker({
			fileId: 'f.csv', sourceRowId:0, column: 'c', from: 0, to: 5, text: 'x',
		});
		expect(model.removeMarker(seg.id)).toBe(true);
		expect(model.findMarkerById(seg.id)).toBeUndefined();
	});

	it('removes row marker', () => {
		const row = model.findOrCreateRowMarker('f.csv', 0, 'c');
		expect(model.removeMarker(row.id)).toBe(true);
		expect(model.findMarkerById(row.id)).toBeUndefined();
	});

	it('returns false for non-existent id', () => {
		expect(model.removeMarker('nonexistent')).toBe(false);
	});
});

// ── setHoverState / getHoverMarkerIds ──

describe('setHoverState / getHoverMarkerIds', () => {
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

// ── getMarkerLabel ──

describe('getMarkerLabel', () => {
	it('returns label for segment marker', () => {
		const seg = model.findOrCreateSegmentMarker({
			fileId: 'f.csv', sourceRowId:2, column: 'notes', from: 0, to: 5, text: 'x',
		});
		const label = model.getMarkerLabel(seg);
		expect(label).toBe('Row 3 · notes (seg)');
	});

	it('returns label for row marker', () => {
		const row = model.findOrCreateRowMarker('f.csv', 0, 'name');
		const label = model.getMarkerLabel(row);
		expect(label).toBe('Row 1 · name');
	});
});

// ── constructor normalization ──

describe('constructor normalization', () => {
	it('persists normalized markers when any codeId was rewritten', () => {
		const def = registry.create('LegacyCode', '#FF0000');
		const existing = {
			csv: {
				segmentMarkers: [{ id: 's-legacy', fileId: 'data.csv', sourceRowId:0, column: 'text', from: 0, to: 5, codes: [{ codeId: 'LegacyCode' }], createdAt: 1, updatedAt: 1 }],
				rowMarkers: [],
			},
		};
		const dmLegacy = createMockDm(existing);
		const setSection = vi.spyOn(dmLegacy, 'setSection');
		new CsvCodingModel(dmLegacy as any, registry);

		// codeId should now be the canonical UUID
		const marker = dmLegacy.section('csv').segmentMarkers[0];
		expect(marker.codes[0].codeId).toBe(def.id);

		// setSection must have been called (mutated = true branch)
		expect(setSection).toHaveBeenCalled();
	});

	it('does not persist when all codeIds are canonical', () => {
		const def = registry.create('CanonicalCode', '#00FF00');
		const existing = {
			csv: {
				segmentMarkers: [],
				rowMarkers: [{ id: 'r-canonical', fileId: 'data.csv', sourceRowId:0, column: 'name', codes: [{ codeId: def.id }], createdAt: 1, updatedAt: 1 }],
			},
		};
		const dmCanonical = createMockDm(existing);
		const setSection = vi.spyOn(dmCanonical, 'setSection');
		new CsvCodingModel(dmCanonical as any, registry);

		// Marker should be unchanged
		const marker = dmCanonical.section('csv').rowMarkers[0];
		expect(marker.codes[0].codeId).toBe(def.id);

		// setSection must NOT have been called (mutated = false branch)
		expect(setSection).not.toHaveBeenCalled();
	});
});
