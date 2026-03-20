import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedModelAdapter } from '../../src/core/unifiedModelAdapter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { BaseMarker, SidebarModelInterface } from '../../src/core/types';

function makeMarker(id: string, fileId: string, codes: string[] = ['code1']): BaseMarker {
	return { id, fileId, codes, createdAt: Date.now(), updatedAt: Date.now() };
}

function createMockModel(markers: BaseMarker[]): SidebarModelInterface {
	return {
		registry: new CodeDefinitionRegistry(),
		getAllMarkers: () => markers,
		getMarkerById: (id: string) => markers.find(m => m.id === id) ?? null,
		getAllFileIds: () => [...new Set(markers.map(m => m.fileId))],
		getMarkersForFile: (fid: string) => markers.filter(m => m.fileId === fid),
		saveMarkers: vi.fn(),
		updateMarkerFields: vi.fn(),
		updateDecorations: vi.fn(),
		removeMarker: vi.fn(() => true),
		deleteCode: vi.fn(),
		setHoverState: vi.fn(),
		getHoverMarkerId: () => null,
		getHoverMarkerIds: () => [],
		onChange: vi.fn(),
		offChange: vi.fn(),
		onHoverChange: vi.fn(),
		offHoverChange: vi.fn(),
	};
}

let registry: CodeDefinitionRegistry;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
});

// ── getAllMarkers ──────────────────────────────────────────────

describe('getAllMarkers', () => {
	it('merges markers from all models', () => {
		const m1 = [makeMarker('a', 'f1'), makeMarker('b', 'f1')];
		const m2 = [makeMarker('c', 'f2')];
		const adapter = new UnifiedModelAdapter(registry, [createMockModel(m1), createMockModel(m2)]);
		expect(adapter.getAllMarkers()).toHaveLength(3);
	});

	it('returns empty when no models', () => {
		const adapter = new UnifiedModelAdapter(registry, []);
		expect(adapter.getAllMarkers()).toEqual([]);
	});

	it('returns empty when all models have no markers', () => {
		const adapter = new UnifiedModelAdapter(registry, [createMockModel([]), createMockModel([])]);
		expect(adapter.getAllMarkers()).toEqual([]);
	});
});

// ── getMarkerById ─────────────────────────────────────────────

describe('getMarkerById', () => {
	it('finds marker in first model', () => {
		const m1 = [makeMarker('a', 'f1')];
		const adapter = new UnifiedModelAdapter(registry, [createMockModel(m1), createMockModel([])]);
		expect(adapter.getMarkerById('a')?.id).toBe('a');
	});

	it('finds marker in second model', () => {
		const m2 = [makeMarker('b', 'f2')];
		const adapter = new UnifiedModelAdapter(registry, [createMockModel([]), createMockModel(m2)]);
		expect(adapter.getMarkerById('b')?.id).toBe('b');
	});

	it('returns null when not found', () => {
		const adapter = new UnifiedModelAdapter(registry, [createMockModel([makeMarker('a', 'f1')])]);
		expect(adapter.getMarkerById('nonexistent')).toBeNull();
	});
});

// ── getAllFileIds ──────────────────────────────────────────────

describe('getAllFileIds', () => {
	it('deduplicates file ids across models', () => {
		const m1 = [makeMarker('a', 'f1')];
		const m2 = [makeMarker('b', 'f1'), makeMarker('c', 'f2')];
		const adapter = new UnifiedModelAdapter(registry, [createMockModel(m1), createMockModel(m2)]);
		const ids = adapter.getAllFileIds();
		expect(ids).toHaveLength(2);
		expect(ids).toContain('f1');
		expect(ids).toContain('f2');
	});

	it('returns empty when no models', () => {
		const adapter = new UnifiedModelAdapter(registry, []);
		expect(adapter.getAllFileIds()).toEqual([]);
	});
});

// ── getMarkersForFile ─────────────────────────────────────────

describe('getMarkersForFile', () => {
	it('returns markers from correct model', () => {
		const m1 = [makeMarker('a', 'f1')];
		const m2 = [makeMarker('b', 'f2'), makeMarker('c', 'f1')];
		const adapter = new UnifiedModelAdapter(registry, [createMockModel(m1), createMockModel(m2)]);
		const result = adapter.getMarkersForFile('f1');
		expect(result).toHaveLength(2);
		expect(result.map(r => r.id).sort()).toEqual(['a', 'c']);
	});

	it('returns empty for unknown file', () => {
		const adapter = new UnifiedModelAdapter(registry, [createMockModel([makeMarker('a', 'f1')])]);
		expect(adapter.getMarkersForFile('unknown')).toEqual([]);
	});
});

// ── updateMarkerFields ────────────────────────────────────────

describe('updateMarkerFields', () => {
	it('delegates to the model that owns the marker', () => {
		const m1 = [makeMarker('a', 'f1')];
		const m2 = [makeMarker('b', 'f2')];
		const model1 = createMockModel(m1);
		const model2 = createMockModel(m2);
		const adapter = new UnifiedModelAdapter(registry, [model1, model2]);
		adapter.updateMarkerFields('b', { memo: 'test' });
		expect(model2.updateMarkerFields).toHaveBeenCalledWith('b', { memo: 'test' });
		expect(model1.updateMarkerFields).not.toHaveBeenCalled();
	});
});

// ── removeMarker ──────────────────────────────────────────────

describe('removeMarker', () => {
	it('delegates to the model that owns the marker', () => {
		const m1 = [makeMarker('a', 'f1')];
		const m2 = [makeMarker('b', 'f2')];
		const model1 = createMockModel(m1);
		const model2 = createMockModel(m2);
		const adapter = new UnifiedModelAdapter(registry, [model1, model2]);
		adapter.removeMarker('b');
		expect(model2.removeMarker).toHaveBeenCalledWith('b');
		expect(model1.removeMarker).not.toHaveBeenCalled();
	});

	it('returns false when marker not found', () => {
		const adapter = new UnifiedModelAdapter(registry, [createMockModel([])]);
		expect(adapter.removeMarker('nonexistent')).toBe(false);
	});
});

// ── deleteCode ────────────────────────────────────────────────

describe('deleteCode', () => {
	it('calls deleteCode on all models', () => {
		const model1 = createMockModel([]);
		const model2 = createMockModel([]);
		const adapter = new UnifiedModelAdapter(registry, [model1, model2]);
		adapter.deleteCode('myCode');
		expect(model1.deleteCode).toHaveBeenCalledWith('myCode');
		expect(model2.deleteCode).toHaveBeenCalledWith('myCode');
	});
});

// ── onChange / offChange ──────────────────────────────────────

describe('onChange / offChange', () => {
	it('propagates onChange to all models', () => {
		const model1 = createMockModel([]);
		const model2 = createMockModel([]);
		const adapter = new UnifiedModelAdapter(registry, [model1, model2]);
		const fn = vi.fn();
		adapter.onChange(fn);
		expect(model1.onChange).toHaveBeenCalledTimes(1);
		expect(model2.onChange).toHaveBeenCalledTimes(1);
	});

	it('propagates offChange to all models', () => {
		const model1 = createMockModel([]);
		const model2 = createMockModel([]);
		const adapter = new UnifiedModelAdapter(registry, [model1, model2]);
		const fn = vi.fn();
		adapter.onChange(fn);
		adapter.offChange(fn);
		expect(model1.offChange).toHaveBeenCalledTimes(1);
		expect(model2.offChange).toHaveBeenCalledTimes(1);
	});
});

// ── setHoverState ─────────────────────────────────────────────

describe('setHoverState', () => {
	it('sets hover on the owning model and clears others', () => {
		const m1 = [makeMarker('a', 'f1')];
		const m2 = [makeMarker('b', 'f2')];
		const model1 = createMockModel(m1);
		const model2 = createMockModel(m2);
		const adapter = new UnifiedModelAdapter(registry, [model1, model2]);
		adapter.setHoverState('a', 'code1');
		expect(model1.setHoverState).toHaveBeenCalledWith('a', 'code1', undefined);
		expect(model2.setHoverState).toHaveBeenCalledWith(null, null);
	});

	it('clears all models when markerId is null', () => {
		const model1 = createMockModel([makeMarker('a', 'f1')]);
		const model2 = createMockModel([makeMarker('b', 'f2')]);
		const adapter = new UnifiedModelAdapter(registry, [model1, model2]);
		adapter.setHoverState(null, null);
		expect(model1.setHoverState).toHaveBeenCalledWith(null, null);
		expect(model2.setHoverState).toHaveBeenCalledWith(null, null);
	});
});

// ── getHoverMarkerId / getHoverMarkerIds ──────────────────────

describe('getHoverMarkerId', () => {
	it('returns null when no model has hover', () => {
		const adapter = new UnifiedModelAdapter(registry, [createMockModel([]), createMockModel([])]);
		expect(adapter.getHoverMarkerId()).toBeNull();
	});

	it('returns id from model that has hover state', () => {
		const model1 = createMockModel([]);
		(model1 as any).getHoverMarkerId = () => 'hovered-1';
		const adapter = new UnifiedModelAdapter(registry, [model1]);
		expect(adapter.getHoverMarkerId()).toBe('hovered-1');
	});
});

describe('getHoverMarkerIds', () => {
	it('returns empty when no model has hover', () => {
		const adapter = new UnifiedModelAdapter(registry, [createMockModel([])]);
		expect(adapter.getHoverMarkerIds()).toEqual([]);
	});

	it('returns ids from model that has hover state', () => {
		const model1 = createMockModel([]);
		(model1 as any).getHoverMarkerIds = () => ['h1', 'h2'];
		const adapter = new UnifiedModelAdapter(registry, [model1]);
		expect(adapter.getHoverMarkerIds()).toEqual(['h1', 'h2']);
	});
});

// ── Empty adapter ─────────────────────────────────────────────

describe('empty adapter (no models)', () => {
	it('all read methods return empty', () => {
		const adapter = new UnifiedModelAdapter(registry, []);
		expect(adapter.getAllMarkers()).toEqual([]);
		expect(adapter.getMarkerById('x')).toBeNull();
		expect(adapter.getAllFileIds()).toEqual([]);
		expect(adapter.getMarkersForFile('x')).toEqual([]);
		expect(adapter.getHoverMarkerId()).toBeNull();
		expect(adapter.getHoverMarkerIds()).toEqual([]);
		expect(adapter.removeMarker('x')).toBe(false);
	});
});

// ── cache ─────────────────────────────────────────────────────

function createMockModelWithListeners(markers: BaseMarker[]): SidebarModelInterface & { triggerChange(): void } {
	const listeners = new Set<() => void>();
	return {
		registry: new CodeDefinitionRegistry(),
		getAllMarkers: () => markers,
		getMarkerById: (id: string) => markers.find(m => m.id === id) ?? null,
		getAllFileIds: () => [...new Set(markers.map(m => m.fileId))],
		getMarkersForFile: (fid: string) => markers.filter(m => m.fileId === fid),
		saveMarkers: vi.fn(),
		updateMarkerFields: vi.fn(),
		updateDecorations: vi.fn(),
		removeMarker: vi.fn(() => true),
		deleteCode: vi.fn(),
		setHoverState: vi.fn(),
		getHoverMarkerId: () => null,
		getHoverMarkerIds: () => [],
		onChange: (fn: () => void) => { listeners.add(fn); },
		offChange: (fn: () => void) => { listeners.delete(fn); },
		onHoverChange: vi.fn(),
		offHoverChange: vi.fn(),
		triggerChange() { for (const fn of listeners) fn(); },
	};
}

describe('cache', () => {
	it('getAllMarkers returns correct data on first call', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const m2 = createMockModelWithListeners([makeMarker('b', 'f2')]);
		const adapter = new UnifiedModelAdapter(registry, [m1, m2]);
		adapter.onChange(vi.fn());
		const result = adapter.getAllMarkers();
		expect(result).toHaveLength(2);
		expect(result.map(r => r.id).sort()).toEqual(['a', 'b']);
	});

	it('second call without change returns same array reference', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		const first = adapter.getAllMarkers();
		const second = adapter.getAllMarkers();
		expect(first).toBe(second);
	});

	it('after model change, getAllMarkers returns new array', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		const first = adapter.getAllMarkers();
		m1.triggerChange();
		const second = adapter.getAllMarkers();
		expect(first).not.toBe(second);
	});

	it('getMarkersForFile returns correct markers', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1'), makeMarker('b', 'f2')]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		const result = adapter.getMarkersForFile('f1');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('a');
	});

	it('getMarkersForFile uses cache (same reference)', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		const first = adapter.getMarkersForFile('f1');
		const second = adapter.getMarkersForFile('f1');
		expect(first).toBe(second);
	});

	it('getAllFileIds returns deduped list from index', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1'), makeMarker('b', 'f1')]);
		const m2 = createMockModelWithListeners([makeMarker('c', 'f2')]);
		const adapter = new UnifiedModelAdapter(registry, [m1, m2]);
		adapter.onChange(vi.fn());
		const ids = adapter.getAllFileIds();
		expect(ids).toHaveLength(2);
		expect(ids).toContain('f1');
		expect(ids).toContain('f2');
	});

	it('multiple changes before query = 1 rebuild', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const spy = vi.spyOn(m1, 'getAllMarkers');
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		m1.triggerChange();
		m1.triggerChange();
		m1.triggerChange();
		adapter.getAllMarkers();
		// 1 call from rebuild (not 3)
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('change in 1 engine invalidates everything', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const m2 = createMockModelWithListeners([makeMarker('b', 'f2')]);
		const adapter = new UnifiedModelAdapter(registry, [m1, m2]);
		adapter.onChange(vi.fn());
		const firstAll = adapter.getAllMarkers();
		const firstFile = adapter.getMarkersForFile('f1');
		m2.triggerChange();
		const secondAll = adapter.getAllMarkers();
		const secondFile = adapter.getMarkersForFile('f1');
		expect(firstAll).not.toBe(secondAll);
		expect(firstFile).not.toBe(secondFile);
	});

	it('getMarkersForFile for unknown fileId returns []', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		expect(adapter.getMarkersForFile('nonexistent')).toEqual([]);
	});

	it('cache works with 0 markers', () => {
		const m1 = createMockModelWithListeners([]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		expect(adapter.getAllMarkers()).toEqual([]);
		expect(adapter.getAllFileIds()).toEqual([]);
		expect(adapter.getMarkerById('x')).toBeNull();
	});

	it('getMarkerById returns marker via index', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1'), makeMarker('b', 'f2')]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		const marker = adapter.getMarkerById('b');
		expect(marker).not.toBeNull();
		expect(marker!.id).toBe('b');
	});

	it('getMarkerById returns null for unknown id', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		adapter.onChange(vi.fn());
		expect(adapter.getMarkerById('nonexistent')).toBeNull();
	});

	it('offChange removes listener correctly (wrapper identity preserved)', () => {
		const m1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [m1]);
		const fn = vi.fn();
		adapter.onChange(fn);
		// trigger should call fn
		m1.triggerChange();
		expect(fn).toHaveBeenCalledTimes(1);
		// remove listener
		adapter.offChange(fn);
		fn.mockClear();
		m1.triggerChange();
		expect(fn).not.toHaveBeenCalled();
	});
});
