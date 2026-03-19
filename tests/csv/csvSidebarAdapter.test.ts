import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CsvSidebarAdapter } from '../../src/csv/views/csvSidebarAdapter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { SegmentMarker, RowMarker, CsvMarker } from '../../src/csv/csvCodingTypes';

// ── Mock CsvCodingModel ──

function createMockModel() {
	const registry = new CodeDefinitionRegistry();
	const markers: CsvMarker[] = [];

	return {
		registry,
		onChange: vi.fn(),
		offChange: vi.fn(),
		onHoverChange: vi.fn(),
		offHoverChange: vi.fn(),
		setHoverState: vi.fn(),
		getHoverMarkerId: vi.fn(() => null),

		getAllMarkers: vi.fn(() => markers),
		getMarkersForFile: vi.fn((fileId: string) => markers.filter(m => m.fileId === fileId)),
		getAllFileIds: vi.fn(() => [...new Set(markers.map(m => m.fileId))]),
		findMarkerById: vi.fn((id: string) => markers.find(m => m.id === id)),
		removeCodeFromMarker: vi.fn((id: string, code: string) => {
			const m = markers.find(x => x.id === id);
			if (m) m.codes = m.codes.filter(c => c !== code);
		}),
		removeMarker: vi.fn((id: string) => {
			const idx = markers.findIndex(m => m.id === id);
			if (idx >= 0) { markers.splice(idx, 1); return true; }
			return false;
		}),

		saveMarkers: vi.fn(),
		notifyAndSave: vi.fn(),

		getMarkerLabel: vi.fn((m: CsvMarker) => `Row ${m.row}, ${m.column}`),
		getMarkerText: vi.fn((m: CsvMarker) => 'from' in m ? 'segment text' : null),

		_markers: markers,
	};
}

type MockModel = ReturnType<typeof createMockModel>;

function mkSegment(overrides: Partial<SegmentMarker> = {}): SegmentMarker {
	return {
		id: 'seg-1',
		fileId: 'data.csv',
		row: 0,
		column: 'comment',
		from: 0,
		to: 10,
		codes: ['Theme'],
		createdAt: 1000,
		updatedAt: 1000,
		...overrides,
	};
}

function mkRowMarker(overrides: Partial<RowMarker> = {}): RowMarker {
	return {
		id: 'row-1',
		fileId: 'data.csv',
		row: 1,
		column: 'category',
		codes: ['Category'],
		createdAt: 2000,
		updatedAt: 2000,
		...overrides,
	};
}

let model: MockModel;
let adapter: CsvSidebarAdapter;

beforeEach(() => {
	model = createMockModel();
	adapter = new CsvSidebarAdapter(model as any);
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

	it('converts segment marker to CsvBaseMarker with isSegment=true', () => {
		model._markers.push(mkSegment());
		const result = adapter.getAllMarkers();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			markerType: 'csv',
			id: 'seg-1',
			fileId: 'data.csv',
			rowIndex: 0,
			columnId: 'comment',
			isSegment: true,
			codes: ['Theme'],
		});
	});

	it('converts row marker to CsvBaseMarker with isSegment=false', () => {
		model._markers.push(mkRowMarker());
		const result = adapter.getAllMarkers();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			markerType: 'csv',
			id: 'row-1',
			isSegment: false,
		});
	});

	it('includes markerLabel from model', () => {
		model._markers.push(mkSegment());
		const result = adapter.getAllMarkers();
		expect(result[0].markerLabel).toBe('Row 0, comment');
	});

	it('includes markerText from model (segment has text, row has null)', () => {
		model._markers.push(mkSegment());
		model._markers.push(mkRowMarker());
		const result = adapter.getAllMarkers();
		expect(result[0].markerText).toBe('segment text');
		expect(result[1].markerText).toBeNull();
	});

	it('preserves memo and colorOverride', () => {
		model._markers.push(mkSegment({ memo: 'note', colorOverride: '#abc' }));
		const result = adapter.getAllMarkers();
		expect(result[0].memo).toBe('note');
		expect(result[0].colorOverride).toBe('#abc');
	});
});

// ── getMarkerById ──

describe('getMarkerById', () => {
	it('returns null when not found', () => {
		expect(adapter.getMarkerById('nope')).toBeNull();
	});

	it('finds marker by id', () => {
		model._markers.push(mkSegment());
		const result = adapter.getMarkerById('seg-1');
		expect(result).not.toBeNull();
		expect(result!.id).toBe('seg-1');
	});
});

// ── getAllFileIds ──

describe('getAllFileIds', () => {
	it('delegates to model.getAllFileIds()', () => {
		model._markers.push(mkSegment({ fileId: 'a.csv' }));
		model._markers.push(mkRowMarker({ fileId: 'b.csv' }));
		const ids = adapter.getAllFileIds();
		expect(ids).toContain('a.csv');
		expect(ids).toContain('b.csv');
		expect(model.getAllFileIds).toHaveBeenCalledOnce();
	});
});

// ── getMarkersForFile ──

describe('getMarkersForFile', () => {
	it('returns only markers for the given file', () => {
		model._markers.push(mkSegment({ fileId: 'data.csv' }));
		model._markers.push(mkRowMarker({ fileId: 'other.csv' }));
		const result = adapter.getMarkersForFile('data.csv');
		expect(result).toHaveLength(1);
		expect(result[0].fileId).toBe('data.csv');
	});
});

// ── saveMarkers ──

describe('saveMarkers', () => {
	it('delegates to model.saveMarkers()', () => {
		adapter.saveMarkers();
		expect(model.saveMarkers).toHaveBeenCalledOnce();
	});
});

// ── updateDecorations ──

describe('updateDecorations', () => {
	it('calls model.notifyAndSave()', () => {
		adapter.updateDecorations('data.csv');
		expect(model.notifyAndSave).toHaveBeenCalledOnce();
	});
});

// ── removeMarker ──

describe('removeMarker', () => {
	it('removes marker and calls notifyAndSave', () => {
		model._markers.push(mkSegment());
		const result = adapter.removeMarker('seg-1');
		expect(result).toBe(true);
		expect(model.notifyAndSave).toHaveBeenCalledOnce();
	});

	it('returns false when marker not found', () => {
		const result = adapter.removeMarker('nonexistent');
		expect(result).toBe(false);
		expect(model.notifyAndSave).not.toHaveBeenCalled();
	});
});

// ── notifyAfterFieldUpdate (called via updateMarkerFields) ──

describe('notifyAfterFieldUpdate (via updateMarkerFields)', () => {
	it('calls model.notifyAndSave() instead of just notify', () => {
		const seg = mkSegment();
		model._markers.push(seg);
		adapter.updateMarkerFields('seg-1', { memo: 'updated' });
		expect(model.notifyAndSave).toHaveBeenCalledOnce();
	});

	it('updates memo on marker', () => {
		const seg = mkSegment();
		model._markers.push(seg);
		adapter.updateMarkerFields('seg-1', { memo: 'new memo' });
		expect(seg.memo).toBe('new memo');
	});

	it('updates colorOverride on marker', () => {
		const seg = mkSegment();
		model._markers.push(seg);
		adapter.updateMarkerFields('seg-1', { colorOverride: '#fff' });
		expect(seg.colorOverride).toBe('#fff');
	});

	it('sets updatedAt to current time', () => {
		const seg = mkSegment({ updatedAt: 100 });
		model._markers.push(seg);
		const before = Date.now();
		adapter.updateMarkerFields('seg-1', { memo: 'x' });
		expect(seg.updatedAt).toBeGreaterThanOrEqual(before);
	});

	it('is a no-op when marker not found', () => {
		adapter.updateMarkerFields('missing', { memo: 'x' });
		expect(model.notifyAndSave).not.toHaveBeenCalled();
	});
});

// ── deleteCode (inherited from base) ──

describe('deleteCode', () => {
	it('removes code from markers that have it', () => {
		model._markers.push(mkSegment({ id: 's1', codes: ['A', 'B'] }));
		model._markers.push(mkRowMarker({ id: 'r1', codes: ['B'] }));
		adapter.deleteCode('A');
		expect(model.removeCodeFromMarker).toHaveBeenCalledWith('s1', 'A', true);
		expect(model.removeCodeFromMarker).not.toHaveBeenCalledWith('r1', 'A', true);
	});

	it('deletes code definition from registry', () => {
		model.registry.create('Gone');
		adapter.deleteCode('Gone');
		expect(model.registry.getByName('Gone')).toBeUndefined();
	});

	it('calls saveMarkers after cleanup', () => {
		adapter.deleteCode('X');
		expect(model.saveMarkers).toHaveBeenCalledOnce();
	});
});

// ── renameCode (inherited from base) ──

describe('renameCode', () => {
	it('renames code in markers', () => {
		const seg = mkSegment({ codes: ['Old'] });
		model._markers.push(seg);
		adapter.renameCode('Old', 'New');
		expect(seg.codes).toContain('New');
		expect(seg.codes).not.toContain('Old');
	});

	it('calls save and notifyAndSave', () => {
		adapter.renameCode('A', 'B');
		expect(model.saveMarkers).toHaveBeenCalledOnce();
		expect(model.notifyAndSave).toHaveBeenCalledOnce();
	});
});
