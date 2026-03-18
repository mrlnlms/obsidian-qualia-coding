import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CodeMarkerModel, Marker } from '../../src/markdown/models/codeMarkerModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { DEFAULT_SETTINGS } from '../../src/markdown/models/settings';

// ── Mock Plugin ──

function createMockPlugin(markdownData?: Record<string, any>) {
	const store: Record<string, any> = {
		markdown: { markers: {}, settings: { ...DEFAULT_SETTINGS }, ...markdownData },
		registry: { definitions: {}, nextPaletteIndex: 0 },
	};
	return {
		dataManager: {
			section: (k: string) => store[k] ?? {},
			setSection: vi.fn((k: string, v: any) => { store[k] = v; }),
			markDirty: vi.fn(),
		},
		app: {
			workspace: {
				getLeavesOfType: vi.fn(() => []),
				getActiveViewOfType: vi.fn(() => null),
			},
		},
		updateFileMarkersEffect: null,
	};
}

// ── Helpers ──

function makeMarker(overrides: Partial<Marker> = {}): Marker {
	return {
		id: overrides.id ?? `m-${Math.random().toString(36).slice(2, 8)}`,
		fileId: overrides.fileId ?? 'test.md',
		range: overrides.range ?? { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } },
		color: overrides.color ?? '#6200EE',
		codes: overrides.codes ?? ['codeA'],
		text: overrides.text ?? 'sample',
		createdAt: overrides.createdAt ?? 1000,
		updatedAt: overrides.updatedAt ?? 1000,
		...(overrides.memo !== undefined ? { memo: overrides.memo } : {}),
		...(overrides.colorOverride !== undefined ? { colorOverride: overrides.colorOverride } : {}),
	};
}

function addTestMarker(model: CodeMarkerModel, fileId: string, codes: string[], id?: string): Marker {
	const marker = makeMarker({ fileId, codes, id: id ?? `m-${Math.random().toString(36).slice(2, 8)}` });
	model.addMarkerDirect(fileId, marker);
	return marker;
}

let model: CodeMarkerModel;
let registry: CodeDefinitionRegistry;
let plugin: ReturnType<typeof createMockPlugin>;

beforeEach(() => {
	vi.useFakeTimers();
	registry = new CodeDefinitionRegistry();
	plugin = createMockPlugin();
	model = new CodeMarkerModel(plugin as any, registry);
});

afterEach(() => {
	vi.useRealTimers();
});

// ── 1. Constructor ──

describe('constructor', () => {
	it('initializes with empty markers', () => {
		expect(model.getAllMarkers()).toEqual([]);
		expect(model.getAllFileIds()).toEqual([]);
	});

	it('stores registry reference', () => {
		expect(model.registry).toBe(registry);
	});

	it('stores plugin reference', () => {
		expect(model.plugin).toBe(plugin);
	});
});

// ── 2. getMarkersForFile ──

describe('getMarkersForFile', () => {
	it('returns empty array for unknown file', () => {
		expect(model.getMarkersForFile('unknown.md')).toEqual([]);
	});

	it('returns markers for known file', () => {
		const m = addTestMarker(model, 'a.md', ['code1']);
		const result = model.getMarkersForFile('a.md');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(m.id);
	});

	it('does not return markers from other files', () => {
		addTestMarker(model, 'a.md', ['code1']);
		addTestMarker(model, 'b.md', ['code2']);
		expect(model.getMarkersForFile('a.md')).toHaveLength(1);
		expect(model.getMarkersForFile('b.md')).toHaveLength(1);
	});
});

// ── 3. getAllMarkers ──

describe('getAllMarkers', () => {
	it('returns empty when no markers', () => {
		expect(model.getAllMarkers()).toEqual([]);
	});

	it('returns markers from all files', () => {
		addTestMarker(model, 'a.md', ['c1']);
		addTestMarker(model, 'b.md', ['c2']);
		expect(model.getAllMarkers()).toHaveLength(2);
	});

	it('filters out csv: prefixed files', () => {
		addTestMarker(model, 'a.md', ['c1']);
		addTestMarker(model, 'csv:data.csv:0:col', ['c2']);
		expect(model.getAllMarkers()).toHaveLength(1);
		expect(model.getAllMarkers()[0].fileId).toBe('a.md');
	});
});

// ── 4. getAllFileIds ──

describe('getAllFileIds', () => {
	it('returns empty when no markers', () => {
		expect(model.getAllFileIds()).toEqual([]);
	});

	it('returns file ids', () => {
		addTestMarker(model, 'a.md', ['c1']);
		addTestMarker(model, 'b.md', ['c2']);
		const ids = model.getAllFileIds();
		expect(ids).toContain('a.md');
		expect(ids).toContain('b.md');
	});

	it('filters out csv: prefixed files', () => {
		addTestMarker(model, 'a.md', ['c1']);
		addTestMarker(model, 'csv:data.csv:0:col', ['c2']);
		const ids = model.getAllFileIds();
		expect(ids).toEqual(['a.md']);
	});
});

// ── 5. getMarkerById ──

describe('getMarkerById', () => {
	it('finds marker across files', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		addTestMarker(model, 'b.md', ['c2'], 'id-2');
		const found = model.getMarkerById('id-2');
		expect(found).not.toBeNull();
		expect(found!.id).toBe('id-2');
	});

	it('returns null for unknown marker', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		expect(model.getMarkerById('unknown')).toBeNull();
	});
});

// ── 6. addCodeToMarker ──

describe('addCodeToMarker', () => {
	it('adds code to existing marker', () => {
		const m = addTestMarker(model, 'a.md', [], 'id-1');
		const result = model.addCodeToMarker('id-1', 'newCode');
		expect(result).toBe(true);
		expect(m.codes).toContain('newCode');
	});

	it('creates registry entry for new code', () => {
		addTestMarker(model, 'a.md', [], 'id-1');
		model.addCodeToMarker('id-1', 'brandNew');
		expect(registry.getByName('brandNew')).toBeDefined();
	});

	it('uses provided color for new registry entry', () => {
		addTestMarker(model, 'a.md', [], 'id-1');
		model.addCodeToMarker('id-1', 'colored', '#FF0000');
		expect(registry.getByName('colored')!.color).toBe('#FF0000');
	});

	it('does not duplicate existing code in marker', () => {
		addTestMarker(model, 'a.md', ['existingCode'], 'id-1');
		registry.create('existingCode');
		const result = model.addCodeToMarker('id-1', 'existingCode');
		expect(result).toBe(false);
		expect(model.getMarkerById('id-1')!.codes).toEqual(['existingCode']);
	});

	it('returns false for unknown marker', () => {
		expect(model.addCodeToMarker('nonexistent', 'code')).toBe(false);
	});

	it('sets updatedAt timestamp', () => {
		const m = addTestMarker(model, 'a.md', [], 'id-1');
		const before = m.updatedAt;
		vi.advanceTimersByTime(100);
		model.addCodeToMarker('id-1', 'code');
		expect(m.updatedAt).toBeGreaterThan(before);
	});

	it('calls saveMarkers after adding', () => {
		addTestMarker(model, 'a.md', [], 'id-1');
		model.addCodeToMarker('id-1', 'code');
		expect(plugin.dataManager.setSection).toHaveBeenCalled();
	});
});

// ── 7. removeCodeFromMarker ──

describe('removeCodeFromMarker', () => {
	it('removes code from marker', () => {
		const m = addTestMarker(model, 'a.md', ['c1', 'c2'], 'id-1');
		const result = model.removeCodeFromMarker('id-1', 'c1');
		expect(result).toBe(true);
		expect(m.codes).toEqual(['c2']);
	});

	it('deletes marker when last code removed and keepIfEmpty=false', () => {
		addTestMarker(model, 'a.md', ['onlyCode'], 'id-1');
		model.removeCodeFromMarker('id-1', 'onlyCode', false);
		expect(model.getMarkerById('id-1')).toBeNull();
	});

	it('keeps marker when last code removed and keepIfEmpty=true', () => {
		addTestMarker(model, 'a.md', ['onlyCode'], 'id-1');
		model.removeCodeFromMarker('id-1', 'onlyCode', true);
		const m = model.getMarkerById('id-1');
		expect(m).not.toBeNull();
		expect(m!.codes).toEqual([]);
	});

	it('returns false for unknown marker', () => {
		expect(model.removeCodeFromMarker('nonexistent', 'code')).toBe(false);
	});

	it('returns false when code not in marker', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		expect(model.removeCodeFromMarker('id-1', 'notThere')).toBe(false);
	});

	it('sets updatedAt on removal', () => {
		const m = addTestMarker(model, 'a.md', ['c1', 'c2'], 'id-1');
		const before = m.updatedAt;
		vi.advanceTimersByTime(100);
		model.removeCodeFromMarker('id-1', 'c1');
		expect(m.updatedAt).toBeGreaterThan(before);
	});
});

// ── 8. removeAllCodesFromMarker ──

describe('removeAllCodesFromMarker', () => {
	it('removes marker entirely', () => {
		addTestMarker(model, 'a.md', ['c1', 'c2'], 'id-1');
		const result = model.removeAllCodesFromMarker('id-1');
		expect(result).toBe(true);
		expect(model.getMarkerById('id-1')).toBeNull();
	});

	it('returns false for unknown marker', () => {
		expect(model.removeAllCodesFromMarker('nonexistent')).toBe(false);
	});
});

// ── 9. cleanupEmptyMarker ──

describe('cleanupEmptyMarker', () => {
	it('removes marker with no codes', () => {
		addTestMarker(model, 'a.md', [], 'id-1');
		const result = model.cleanupEmptyMarker('id-1');
		expect(result).toBe(true);
		expect(model.getMarkerById('id-1')).toBeNull();
	});

	it('does not remove marker that has codes', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		const result = model.cleanupEmptyMarker('id-1');
		expect(result).toBe(false);
		expect(model.getMarkerById('id-1')).not.toBeNull();
	});

	it('returns false for unknown marker', () => {
		expect(model.cleanupEmptyMarker('nonexistent')).toBe(false);
	});
});

// ── 10. removeMarker ──

describe('removeMarker', () => {
	it('removes and returns true', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		expect(model.removeMarker('id-1')).toBe(true);
		expect(model.getMarkerById('id-1')).toBeNull();
	});

	it('returns false for unknown marker', () => {
		expect(model.removeMarker('nonexistent')).toBe(false);
	});

	it('calls saveMarkers on removal', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		plugin.dataManager.setSection.mockClear();
		model.removeMarker('id-1');
		expect(plugin.dataManager.setSection).toHaveBeenCalled();
	});
});

// ── 11. updateMarkerFields ──

describe('updateMarkerFields', () => {
	it('updates memo', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		model.updateMarkerFields('id-1', { memo: 'note text' });
		expect(model.getMarkerById('id-1')!.memo).toBe('note text');
	});

	it('updates colorOverride', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		model.updateMarkerFields('id-1', { colorOverride: '#FF0000' });
		expect(model.getMarkerById('id-1')!.colorOverride).toBe('#FF0000');
	});

	it('updates updatedAt', () => {
		const m = addTestMarker(model, 'a.md', ['c1'], 'id-1');
		const before = m.updatedAt;
		vi.advanceTimersByTime(100);
		model.updateMarkerFields('id-1', { memo: 'x' });
		expect(m.updatedAt).toBeGreaterThan(before);
	});

	it('no-op for unknown marker', () => {
		plugin.dataManager.setSection.mockClear();
		model.updateMarkerFields('nonexistent', { memo: 'x' });
		// setSection not called because marker not found
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
	});

	it('calls saveMarkers', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		plugin.dataManager.setSection.mockClear();
		model.updateMarkerFields('id-1', { memo: 'y' });
		expect(plugin.dataManager.setSection).toHaveBeenCalled();
	});
});

// ── 12. updateMarker ──

describe('updateMarker', () => {
	it('replaces marker in file array', () => {
		const m = addTestMarker(model, 'a.md', ['c1'], 'id-1');
		const updated = { ...m, text: 'updated text', codes: ['c1', 'c2'] };
		model.updateMarker(updated);
		const found = model.getMarkerById('id-1');
		expect(found!.text).toBe('updated text');
		expect(found!.codes).toEqual(['c1', 'c2']);
	});

	it('no-op for marker with unknown fileId', () => {
		const m = makeMarker({ fileId: 'unknown.md', id: 'id-1' });
		plugin.dataManager.setSection.mockClear();
		model.updateMarker(m);
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
	});

	it('no-op for marker with unknown id in existing file', () => {
		addTestMarker(model, 'a.md', ['c1'], 'id-1');
		const m = makeMarker({ fileId: 'a.md', id: 'id-unknown' });
		plugin.dataManager.setSection.mockClear();
		model.updateMarker(m);
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
	});
});

// ── 13. saveMarkers ──

describe('saveMarkers', () => {
	it('calls dataManager.setSection for markdown', () => {
		addTestMarker(model, 'a.md', ['c1']);
		plugin.dataManager.setSection.mockClear();
		model.saveMarkers();
		const calls = plugin.dataManager.setSection.mock.calls;
		const mdCall = calls.find((c: any[]) => c[0] === 'markdown');
		expect(mdCall).toBeDefined();
		expect(mdCall![1].markers['a.md']).toHaveLength(1);
	});

	it('calls dataManager.setSection for registry', () => {
		plugin.dataManager.setSection.mockClear();
		model.saveMarkers();
		const calls = plugin.dataManager.setSection.mock.calls;
		const regCall = calls.find((c: any[]) => c[0] === 'registry');
		expect(regCall).toBeDefined();
	});

	it('skips csv: files in save output', () => {
		addTestMarker(model, 'csv:data.csv:0:col', ['c1']);
		addTestMarker(model, 'a.md', ['c2']);
		plugin.dataManager.setSection.mockClear();
		model.saveMarkers();
		const calls = plugin.dataManager.setSection.mock.calls;
		const mdCall = calls.find((c: any[]) => c[0] === 'markdown');
		expect(mdCall![1].markers).not.toHaveProperty('csv:data.csv:0:col');
		expect(mdCall![1].markers).toHaveProperty('a.md');
	});

	it('preserves existing settings in markdown section', () => {
		model.saveMarkers();
		const calls = plugin.dataManager.setSection.mock.calls;
		const mdCall = calls.find((c: any[]) => c[0] === 'markdown');
		expect(mdCall![1].settings).toEqual(DEFAULT_SETTINGS);
	});
});

// ── 14. markDirtyForSave / flushPendingSave ──

describe('markDirtyForSave / flushPendingSave', () => {
	it('debounces save to 2s', () => {
		addTestMarker(model, 'a.md', ['c1']);
		plugin.dataManager.setSection.mockClear();
		model.markDirtyForSave();
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
		vi.advanceTimersByTime(2000);
		expect(plugin.dataManager.setSection).toHaveBeenCalled();
	});

	it('resets timer on repeated calls', () => {
		addTestMarker(model, 'a.md', ['c1']);
		plugin.dataManager.setSection.mockClear();
		model.markDirtyForSave();
		vi.advanceTimersByTime(1500);
		model.markDirtyForSave();
		vi.advanceTimersByTime(1500);
		// Only 1500ms since last call — not saved yet
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
		vi.advanceTimersByTime(500);
		expect(plugin.dataManager.setSection).toHaveBeenCalled();
	});

	it('flushPendingSave forces immediate save', () => {
		addTestMarker(model, 'a.md', ['c1']);
		plugin.dataManager.setSection.mockClear();
		model.markDirtyForSave();
		model.flushPendingSave();
		expect(plugin.dataManager.setSection).toHaveBeenCalled();
	});

	it('flushPendingSave is no-op when not dirty', () => {
		plugin.dataManager.setSection.mockClear();
		model.flushPendingSave();
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
	});
});

// ── 15. migrateFilePath ──

describe('migrateFilePath', () => {
	it('moves markers to new path', () => {
		addTestMarker(model, 'old.md', ['c1'], 'id-1');
		model.migrateFilePath('old.md', 'new.md');
		expect(model.getMarkersForFile('old.md')).toEqual([]);
		expect(model.getMarkersForFile('new.md')).toHaveLength(1);
	});

	it('updates fileId on migrated markers', () => {
		addTestMarker(model, 'old.md', ['c1'], 'id-1');
		model.migrateFilePath('old.md', 'new.md');
		const m = model.getMarkerById('id-1');
		expect(m!.fileId).toBe('new.md');
	});

	it('no-op when old path has no markers', () => {
		plugin.dataManager.setSection.mockClear();
		model.migrateFilePath('nonexistent.md', 'new.md');
		// markDirtyForSave would be called, but since no markers found, function returns early
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
	});

	it('marks dirty for save', () => {
		addTestMarker(model, 'old.md', ['c1']);
		plugin.dataManager.setSection.mockClear();
		model.migrateFilePath('old.md', 'new.md');
		// markDirtyForSave was called — advance timer to trigger
		vi.advanceTimersByTime(2000);
		expect(plugin.dataManager.setSection).toHaveBeenCalled();
	});
});

// ── 16. onChange / offChange ──

describe('onChange / offChange', () => {
	it('listener called on saveMarkers', () => {
		const fn = vi.fn();
		model.onChange(fn);
		model.saveMarkers();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('offChange removes listener', () => {
		const fn = vi.fn();
		model.onChange(fn);
		model.offChange(fn);
		model.saveMarkers();
		expect(fn).not.toHaveBeenCalled();
	});

	it('multiple listeners all called', () => {
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		model.onChange(fn1);
		model.onChange(fn2);
		model.saveMarkers();
		expect(fn1).toHaveBeenCalledTimes(1);
		expect(fn2).toHaveBeenCalledTimes(1);
	});
});

// ── 17. setHoverState / getHoverMarkerId / getHoverCodeName ──

describe('hover state', () => {
	it('initial hover state is null', () => {
		expect(model.getHoverMarkerId()).toBeNull();
		expect(model.getHoverCodeName()).toBeNull();
		expect(model.getHoverMarkerIds()).toEqual([]);
	});

	it('setHoverState updates markerId and codeName', () => {
		model.setHoverState('m1', 'codeA');
		expect(model.getHoverMarkerId()).toBe('m1');
		expect(model.getHoverCodeName()).toBe('codeA');
	});

	it('setHoverState with null clears state', () => {
		model.setHoverState('m1', 'codeA');
		model.setHoverState(null, null);
		expect(model.getHoverMarkerId()).toBeNull();
		expect(model.getHoverCodeName()).toBeNull();
	});

	it('setHoverState sets hoveredIds from explicit array', () => {
		model.setHoverState('m1', null, ['m1', 'm2', 'm3']);
		expect(model.getHoverMarkerIds()).toEqual(['m1', 'm2', 'm3']);
	});

	it('setHoverState derives hoveredIds from markerId when array not provided', () => {
		model.setHoverState('m1', null);
		expect(model.getHoverMarkerIds()).toEqual(['m1']);
	});

	it('setHoverState(null) produces empty hoveredIds', () => {
		model.setHoverState(null, null);
		expect(model.getHoverMarkerIds()).toEqual([]);
	});

	it('no-op when same state set again', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.setHoverState('m1', 'codeA');
		expect(fn).toHaveBeenCalledTimes(1);
		model.setHoverState('m1', 'codeA');
		// Should not fire again — same state
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

// ── 18. onHoverChange / offHoverChange ──

describe('onHoverChange / offHoverChange', () => {
	it('listener called on hover state change', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.setHoverState('m1', null);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('offHoverChange removes listener', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.offHoverChange(fn);
		model.setHoverState('m1', null);
		expect(fn).not.toHaveBeenCalled();
	});
});

// ── 19. isPositionBefore / isPositionAfter ──

describe('isPositionBefore', () => {
	it('returns true when line is before', () => {
		expect(model.isPositionBefore({ line: 1, ch: 5 }, { line: 2, ch: 0 })).toBe(true);
	});

	it('returns false when line is after', () => {
		expect(model.isPositionBefore({ line: 3, ch: 0 }, { line: 2, ch: 0 })).toBe(false);
	});

	it('returns true when same line, ch is before or equal', () => {
		expect(model.isPositionBefore({ line: 1, ch: 3 }, { line: 1, ch: 5 })).toBe(true);
		expect(model.isPositionBefore({ line: 1, ch: 5 }, { line: 1, ch: 5 })).toBe(true);
	});

	it('returns false when same line, ch is after', () => {
		expect(model.isPositionBefore({ line: 1, ch: 6 }, { line: 1, ch: 5 })).toBe(false);
	});
});

describe('isPositionAfter', () => {
	it('returns true when line is after', () => {
		expect(model.isPositionAfter({ line: 3, ch: 0 }, { line: 2, ch: 5 })).toBe(true);
	});

	it('returns false when line is before', () => {
		expect(model.isPositionAfter({ line: 1, ch: 0 }, { line: 2, ch: 0 })).toBe(false);
	});

	it('returns true when same line, ch is after or equal', () => {
		expect(model.isPositionAfter({ line: 1, ch: 7 }, { line: 1, ch: 5 })).toBe(true);
		expect(model.isPositionAfter({ line: 1, ch: 5 }, { line: 1, ch: 5 })).toBe(true);
	});

	it('returns false when same line, ch is before', () => {
		expect(model.isPositionAfter({ line: 1, ch: 3 }, { line: 1, ch: 5 })).toBe(false);
	});
});

// ── 20. deleteCode ──

describe('deleteCode', () => {
	it('removes code from all markers and deletes empty markers', () => {
		registry.create('codeX', '#F00');
		addTestMarker(model, 'a.md', ['codeX'], 'id-1');
		addTestMarker(model, 'b.md', ['codeX', 'codeY'], 'id-2');
		model.deleteCode('codeX');
		// id-1 had only codeX, should be deleted
		expect(model.getMarkerById('id-1')).toBeNull();
		// id-2 still has codeY
		const m2 = model.getMarkerById('id-2');
		expect(m2).not.toBeNull();
		expect(m2!.codes).toEqual(['codeY']);
	});

	it('removes code definition from registry', () => {
		const def = registry.create('codeX');
		addTestMarker(model, 'a.md', ['codeX'], 'id-1');
		model.deleteCode('codeX');
		expect(registry.getById(def.id)).toBeUndefined();
	});

	it('no-op when code not in registry', () => {
		plugin.dataManager.setSection.mockClear();
		model.deleteCode('nonexistent');
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
	});

	it('handles markers in multiple files', () => {
		registry.create('codeZ');
		addTestMarker(model, 'a.md', ['codeZ'], 'id-1');
		addTestMarker(model, 'b.md', ['codeZ'], 'id-2');
		addTestMarker(model, 'c.md', ['other'], 'id-3');
		model.deleteCode('codeZ');
		expect(model.getMarkerById('id-1')).toBeNull();
		expect(model.getMarkerById('id-2')).toBeNull();
		expect(model.getMarkerById('id-3')).not.toBeNull();
	});
});

// ── 21. loadMarkers ──

describe('loadMarkers', () => {
	it('loads markers from dataManager', () => {
		plugin = createMockPlugin({
			markers: {
				'file.md': [makeMarker({ fileId: 'file.md', id: 'id-1', codes: ['c1'] })],
			},
		});
		model = new CodeMarkerModel(plugin as any, registry);
		model.loadMarkers();
		expect(model.getMarkersForFile('file.md')).toHaveLength(1);
		expect(model.getMarkerById('id-1')).not.toBeNull();
	});

	it('migrates old code field to codes array', () => {
		const oldMarker = {
			id: 'id-old',
			fileId: 'file.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#6200EE',
			code: 'legacyCode',
			text: 'sample',
			createdAt: 1000,
			updatedAt: 1000,
		};
		plugin = createMockPlugin({ markers: { 'file.md': [oldMarker] } });
		model = new CodeMarkerModel(plugin as any, registry);
		model.loadMarkers();
		const loaded = model.getMarkerById('id-old');
		expect(loaded).not.toBeNull();
		expect(loaded!.codes).toEqual(['legacyCode']);
		expect((loaded as any).code).toBeUndefined();
	});

	it('migrates empty code field to empty codes array', () => {
		const oldMarker = {
			id: 'id-old2',
			fileId: 'file.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#6200EE',
			code: '',
			text: 'sample',
			createdAt: 1000,
			updatedAt: 1000,
		};
		plugin = createMockPlugin({ markers: { 'file.md': [oldMarker] } });
		model = new CodeMarkerModel(plugin as any, registry);
		model.loadMarkers();
		const loaded = model.getMarkerById('id-old2');
		expect(loaded!.codes).toEqual([]);
	});

	it('handles empty markers object', () => {
		plugin = createMockPlugin({ markers: {} });
		model = new CodeMarkerModel(plugin as any, registry);
		model.loadMarkers();
		expect(model.getAllMarkers()).toEqual([]);
	});

	it('handles null/undefined markers', () => {
		plugin = createMockPlugin({ markers: null });
		model = new CodeMarkerModel(plugin as any, registry);
		model.loadMarkers();
		expect(model.getAllMarkers()).toEqual([]);
	});
});

// ── 22. clearAllMarkers ──

describe('clearAllMarkers', () => {
	it('empties all markers', () => {
		addTestMarker(model, 'a.md', ['c1']);
		addTestMarker(model, 'b.md', ['c2']);
		model.clearAllMarkers();
		expect(model.getAllMarkers()).toEqual([]);
		expect(model.getAllFileIds()).toEqual([]);
	});

	it('calls dataManager.setSection with empty markers', () => {
		addTestMarker(model, 'a.md', ['c1']);
		plugin.dataManager.setSection.mockClear();
		model.clearAllMarkers();
		const calls = plugin.dataManager.setSection.mock.calls;
		const mdCall = calls.find((c: any[]) => c[0] === 'markdown');
		expect(mdCall).toBeDefined();
		expect(mdCall![1].markers).toEqual({});
	});

	it('notifies change listeners', () => {
		const fn = vi.fn();
		model.onChange(fn);
		model.clearAllMarkers();
		expect(fn).toHaveBeenCalled();
	});
});

// ── 23. addMarkerDirect ──

describe('addMarkerDirect', () => {
	it('adds marker without saving', () => {
		plugin.dataManager.setSection.mockClear();
		const m = makeMarker({ fileId: 'a.md', id: 'direct-1' });
		model.addMarkerDirect('a.md', m);
		expect(model.getMarkerById('direct-1')).not.toBeNull();
		expect(plugin.dataManager.setSection).not.toHaveBeenCalled();
	});

	it('adds multiple markers to same file', () => {
		model.addMarkerDirect('a.md', makeMarker({ fileId: 'a.md', id: 'd1' }));
		model.addMarkerDirect('a.md', makeMarker({ fileId: 'a.md', id: 'd2' }));
		expect(model.getMarkersForFile('a.md')).toHaveLength(2);
	});
});

// ── 24. clearMarkersForFile ──

describe('clearMarkersForFile', () => {
	it('removes all markers for a file', () => {
		addTestMarker(model, 'a.md', ['c1']);
		addTestMarker(model, 'a.md', ['c2']);
		addTestMarker(model, 'b.md', ['c3']);
		model.clearMarkersForFile('a.md');
		expect(model.getMarkersForFile('a.md')).toEqual([]);
		expect(model.getMarkersForFile('b.md')).toHaveLength(1);
	});

	it('no-op for unknown file', () => {
		model.clearMarkersForFile('nonexistent.md');
		// Should not throw
		expect(model.getAllMarkers()).toEqual([]);
	});
});

// ── 25. registerStandaloneEditor / unregisterStandaloneEditor ──

describe('registerStandaloneEditor / unregisterStandaloneEditor', () => {
	it('registers standalone editor', () => {
		const fakeEditor = {} as any;
		model.registerStandaloneEditor('csv:file.csv:0:col', fakeEditor);
		// No direct getter, but updateMarkersForFile should attempt dispatch on standalone
		// Just verify it doesn't throw
		expect(() => model.registerStandaloneEditor('csv:file.csv:0:col', fakeEditor)).not.toThrow();
	});

	it('unregisters standalone editor', () => {
		const fakeEditor = {} as any;
		model.registerStandaloneEditor('csv:file.csv:0:col', fakeEditor);
		model.unregisterStandaloneEditor('csv:file.csv:0:col');
		// Should not throw
		expect(() => model.unregisterStandaloneEditor('csv:file.csv:0:col')).not.toThrow();
	});
});

// ── 26. getAllCodes ──

describe('getAllCodes', () => {
	it('returns empty when no codes in registry', () => {
		expect(model.getAllCodes()).toEqual([]);
	});

	it('returns code items from registry', () => {
		registry.create('Alpha', '#111');
		registry.create('Beta', '#222');
		const codes = model.getAllCodes();
		expect(codes).toHaveLength(2);
		expect(codes.map(c => c.name)).toContain('Alpha');
		expect(codes.map(c => c.name)).toContain('Beta');
	});

	it('includes color and createdAt', () => {
		registry.create('Code1', '#AAA');
		const codes = model.getAllCodes();
		expect(codes[0].color).toBe('#AAA');
		expect(codes[0].createdAt).toBeGreaterThan(0);
	});
});

// ── 27. getSettings / updateSettings ──

describe('getSettings / updateSettings', () => {
	it('returns default settings', () => {
		expect(model.getSettings()).toEqual(DEFAULT_SETTINGS);
	});

	it('updates partial settings', () => {
		model.updateSettings({ defaultColor: '#FF0000' });
		expect(model.getSettings().defaultColor).toBe('#FF0000');
		// Other settings preserved
		expect(model.getSettings().markerOpacity).toBe(DEFAULT_SETTINGS.markerOpacity);
	});

	it('calls dataManager.markDirty', () => {
		model.updateSettings({ markerOpacity: 0.8 });
		expect(plugin.dataManager.markDirty).toHaveBeenCalled();
	});
});

// ── 28. getAutoRevealOnSegmentClick ──

describe('getAutoRevealOnSegmentClick', () => {
	it('returns default value', () => {
		expect(model.getAutoRevealOnSegmentClick()).toBe(true);
	});
});

// ── 29. setCodeDescription / getCodeDescription ──

describe('setCodeDescription / getCodeDescription', () => {
	it('sets and gets description', () => {
		registry.create('MyCode');
		model.setCodeDescription('MyCode', 'A description');
		expect(model.getCodeDescription('MyCode')).toBe('A description');
	});

	it('returns empty string for unknown code', () => {
		expect(model.getCodeDescription('nonexistent')).toBe('');
	});

	it('trims whitespace and clears empty description', () => {
		registry.create('MyCode');
		model.setCodeDescription('MyCode', '   ');
		// Empty after trim → stored as undefined → returned as ''
		expect(model.getCodeDescription('MyCode')).toBe('');
	});
});

// ── 30. renameCode ──

describe('renameCode', () => {
	it('renames code in all markers', () => {
		registry.create('OldName');
		model.addMarkerDirect('f1', {
			markerType: 'markdown', id: 'm1', fileId: 'f1',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } },
			color: '#6200EE', codes: ['OldName'], createdAt: 1, updatedAt: 1,
		});
		model.addMarkerDirect('f2', {
			markerType: 'markdown', id: 'm2', fileId: 'f2',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } },
			color: '#6200EE', codes: ['OldName', 'Other'], createdAt: 1, updatedAt: 1,
		});

		model.renameCode('OldName', 'NewName');

		const m1 = model.getMarkerById('m1');
		const m2 = model.getMarkerById('m2');
		expect(m1?.codes).toEqual(['NewName']);
		expect(m2?.codes).toContain('NewName');
		expect(m2?.codes).toContain('Other');
		expect(m2?.codes).not.toContain('OldName');
	});

	it('does nothing when code not found in markers', () => {
		registry.create('A');
		model.addMarkerDirect('f1', {
			markerType: 'markdown', id: 'm1', fileId: 'f1',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } },
			color: '#6200EE', codes: ['A'], createdAt: 1, updatedAt: 1,
		});

		model.renameCode('NonExistent', 'Whatever');

		expect(model.getMarkerById('m1')?.codes).toEqual(['A']);
	});
});
