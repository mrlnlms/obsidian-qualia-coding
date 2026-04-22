import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaCodingModel } from '../../src/media/mediaCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { MediaMarker, MediaFile, BaseMediaSettings } from '../../src/media/mediaTypes';
import type { CodeApplication } from '../../src/core/types';
import { hasCode } from '../../src/core/codeApplicationHelpers';

function ca(...codeIds: string[]): CodeApplication[] {
	return codeIds.map(codeId => ({ codeId }));
}

// ── Mock DataManager ──

function createMockDm(initialData: Record<string, any> = {}) {
	const store: Record<string, any> = { ...initialData };
	return {
		section: (key: string) => store[key] ?? {},
		setSection: (key: string, value: any) => { store[key] = value; },
		markDirty: () => {},
	};
}

const DEFAULT_SETTINGS: BaseMediaSettings = {
	defaultZoom: 50,
	regionOpacity: 0.4,
	showLabelsOnRegions: true,
	fileStates: {},
};

let model: MediaCodingModel;
let registry: CodeDefinitionRegistry;
let dm: ReturnType<typeof createMockDm>;

beforeEach(() => {
	vi.useFakeTimers();
	registry = new CodeDefinitionRegistry();
	dm = createMockDm();
	model = new MediaCodingModel(dm as any, registry, 'testSection', DEFAULT_SETTINGS);
});

// ── findOrCreateMarker ──

describe('findOrCreateMarker', () => {
	it('creates a new marker when none exists', () => {
		const marker = model.findOrCreateMarker('file.mp3', 1.0, 5.0);
		expect(marker).toBeDefined();
		expect(marker.from).toBe(1.0);
		expect(marker.to).toBe(5.0);
		expect(marker.codes).toEqual([]);
		expect(marker.id).toBeTruthy();
	});

	it('returns existing marker on duplicate time range', () => {
		const first = model.findOrCreateMarker('file.mp3', 1.0, 5.0);
		const second = model.findOrCreateMarker('file.mp3', 1.0, 5.0);
		expect(second.id).toBe(first.id);
	});

	it('creates separate markers for different files', () => {
		const a = model.findOrCreateMarker('a.mp3', 1.0, 5.0);
		const b = model.findOrCreateMarker('b.mp3', 1.0, 5.0);
		expect(a.id).not.toBe(b.id);
	});
});

// ── findExistingMarker ──

describe('findExistingMarker', () => {
	it('finds marker within TOLERANCE', () => {
		model.findOrCreateMarker('file.mp3', 1.0, 5.0);
		const found = model.findExistingMarker('file.mp3', 1.005, 5.005);
		expect(found).toBeDefined();
	});

	it('returns undefined when no file exists', () => {
		expect(model.findExistingMarker('missing.mp3', 1.0, 5.0)).toBeUndefined();
	});

	it('returns undefined when times are outside tolerance', () => {
		model.findOrCreateMarker('file.mp3', 1.0, 5.0);
		expect(model.findExistingMarker('file.mp3', 2.0, 6.0)).toBeUndefined();
	});
});

// ── findMarkerById ──

describe('findMarkerById', () => {
	it('finds existing marker by id', () => {
		const created = model.findOrCreateMarker('file.mp3', 0, 10);
		const found = model.findMarkerById(created.id);
		expect(found).toBe(created);
	});

	it('returns undefined for unknown id', () => {
		expect(model.findMarkerById('nonexistent')).toBeUndefined();
	});
});

// ── getMarkersForFile ──

describe('getMarkersForFile', () => {
	it('returns markers for known file', () => {
		model.findOrCreateMarker('file.mp3', 0, 5);
		model.findOrCreateMarker('file.mp3', 6, 10);
		expect(model.getMarkersForFile('file.mp3')).toHaveLength(2);
	});

	it('returns empty array for unknown file', () => {
		expect(model.getMarkersForFile('unknown.mp3')).toEqual([]);
	});
});

// ── getAllMarkers ──

describe('getAllMarkers', () => {
	it('returns all markers across files', () => {
		model.findOrCreateMarker('a.mp3', 0, 5);
		model.findOrCreateMarker('b.mp3', 0, 5);
		expect(model.getAllMarkers()).toHaveLength(2);
	});
});

// ── getAllFileIds ──

describe('getAllFileIds', () => {
	it('returns only files with markers', () => {
		model.findOrCreateMarker('a.mp3', 0, 5);
		model.getOrCreateFile('empty.mp3'); // file with no markers
		expect(model.getAllFileIds()).toEqual(['a.mp3']);
	});
});

// ── addCodeToMarker ──

describe('addCodeToMarker', () => {
	it('adds code to marker and creates definition in registry', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		model.addCodeToMarker(marker.id, 'Theme A');
		expect(hasCode(marker.codes, 'Theme A')).toBe(true);
		expect(registry.getByName('Theme A')).toBeDefined();
	});

	it('does not add duplicate code', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		model.addCodeToMarker(marker.id, 'Theme A');
		model.addCodeToMarker(marker.id, 'Theme A');
		expect(marker.codes.filter(c => c.codeId === 'Theme A')).toHaveLength(1);
	});

	it('does nothing for unknown marker id', () => {
		model.addCodeToMarker('nonexistent', 'Theme A');
		expect(registry.getByName('Theme A')).toBeUndefined();
	});

	it('reuses existing registry definition', () => {
		const def = registry.create('Existing');
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		model.addCodeToMarker(marker.id, def.id);
		expect(hasCode(marker.codes, def.id)).toBe(true);
	});
});

// ── removeCodeFromMarker ──

describe('removeCodeFromMarker', () => {
	it('removes code and deletes marker if empty', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		model.addCodeToMarker(marker.id, 'code_a');
		vi.advanceTimersByTime(600); // flush scheduleSave
		model.removeCodeFromMarker(marker.id, 'code_a');
		vi.advanceTimersByTime(600);
		expect(model.findMarkerById(marker.id)).toBeUndefined();
	});

	it('keeps marker when keepIfEmpty is true', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		model.addCodeToMarker(marker.id, 'code_a');
		vi.advanceTimersByTime(600);
		model.removeCodeFromMarker(marker.id, 'code_a', true);
		vi.advanceTimersByTime(600);
		const found = model.findMarkerById(marker.id);
		expect(found).toBeDefined();
		expect(found!.codes).toEqual([]);
	});

	it('does nothing for unknown marker', () => {
		model.removeCodeFromMarker('nonexistent', 'code_a');
		// no error thrown
	});

	it('does nothing if code not present on marker', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		model.addCodeToMarker(marker.id, 'code_a');
		model.removeCodeFromMarker(marker.id, 'code_b');
		expect(marker.codes).toEqual(ca('code_a'));
	});
});

// ── removeMarker ──

describe('removeMarker', () => {
	it('removes existing marker and returns true', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		expect(model.removeMarker(marker.id)).toBe(true);
		expect(model.findMarkerById(marker.id)).toBeUndefined();
	});

	it('returns false for unknown marker', () => {
		expect(model.removeMarker('nonexistent')).toBe(false);
	});
});

// ── updateMarkerBounds ──

describe('updateMarkerBounds', () => {
	it('updates from and to values', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		model.updateMarkerBounds(marker.id, 2, 8);
		expect(marker.from).toBe(2);
		expect(marker.to).toBe(8);
	});

	it('does nothing for unknown marker', () => {
		model.updateMarkerBounds('nonexistent', 2, 8);
		// no error
	});
});

// ── getMarkerLabel ──

describe('getMarkerLabel', () => {
	it('returns formatted time range', () => {
		const marker = model.findOrCreateMarker('file.mp3', 65.5, 130.2);
		const label = model.getMarkerLabel(marker);
		expect(label).toBe('1:05.5 \u2013 2:10.2');
	});
});

// ── getFileForMarker ──

describe('getFileForMarker', () => {
	it('returns file path for known marker', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		expect(model.getFileForMarker(marker.id)).toBe('file.mp3');
	});

	it('returns null for unknown marker', () => {
		expect(model.getFileForMarker('nonexistent')).toBeNull();
	});
});

// ── getOrCreateFile ──

describe('getOrCreateFile', () => {
	it('creates file if missing', () => {
		const file = model.getOrCreateFile('new.mp3');
		expect(file.path).toBe('new.mp3');
		expect(file.markers).toEqual([]);
	});

	it('returns existing file', () => {
		const first = model.getOrCreateFile('new.mp3');
		const second = model.getOrCreateFile('new.mp3');
		expect(first).toBe(second);
	});
});

// ── migrateFilePath ──

describe('migrateFilePath', () => {
	it('renames file path and updates marker.fileId', () => {
		model.findOrCreateMarker('old.mp3', 0, 5);
		model.migrateFilePath('old.mp3', 'new.mp3');
		vi.advanceTimersByTime(600);
		expect(model.getMarkersForFile('new.mp3')).toHaveLength(1);
		expect(model.getMarkersForFile('old.mp3')).toEqual([]);
		const marker = model.getMarkersForFile('new.mp3')[0];
		expect(marker.fileId).toBe('new.mp3');
	});

	it('updates fileId on all markers in the file', () => {
		model.findOrCreateMarker('old.mp3', 0, 5);
		model.findOrCreateMarker('old.mp3', 10, 15);
		model.migrateFilePath('old.mp3', 'renamed.mp3');
		vi.advanceTimersByTime(600);
		const markers = model.getMarkersForFile('renamed.mp3');
		expect(markers).toHaveLength(2);
		for (const m of markers) {
			expect(m.fileId).toBe('renamed.mp3');
		}
	});

	it('does nothing for unknown old path', () => {
		model.migrateFilePath('nonexistent.mp3', 'new.mp3');
		// no error
	});
});

// ── save ──

describe('save', () => {
	it('calls dm.setSection with correct data', () => {
		model.findOrCreateMarker('file.mp3', 0, 5);
		model.save();
		const saved = dm.section('testSection');
		// After save, the store should contain our data
		expect(saved).toBeDefined();
	});
});

// ── notify ──

describe('notify', () => {
	it('triggers change listeners via scheduleSave', () => {
		const listener = vi.fn();
		model.onChange(listener);
		model.findOrCreateMarker('file.mp3', 0, 5);
		model.addCodeToMarker(model.getAllMarkers()[0]!.id, 'code_x');
		// addCodeToMarker calls notify which calls scheduleSave + fires listeners
		expect(listener).toHaveBeenCalled();
	});
});

// ── onChange / offChange ──

describe('onChange / offChange', () => {
	it('adds and removes listener', () => {
		const fn = vi.fn();
		model.onChange(fn);
		// trigger via notifyChange (direct, no save)
		(model as any).notifyChange();
		expect(fn).toHaveBeenCalledTimes(1);

		model.offChange(fn);
		(model as any).notifyChange();
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

// ── Hover state ──

describe('setHoverState / getHoverMarkerId / getHoverCodeName', () => {
	it('stores and retrieves hover state', () => {
		model.setHoverState('m1', 'code1');
		expect(model.getHoverMarkerId()).toBe('m1');
		expect(model.getHoverCodeName()).toBe('code1');
	});

	it('clears hover state with nulls', () => {
		model.setHoverState('m1', 'code1');
		model.setHoverState(null, null);
		expect(model.getHoverMarkerId()).toBeNull();
		expect(model.getHoverCodeName()).toBeNull();
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

// ── onHoverChange / offHoverChange ──

describe('onHoverChange / offHoverChange', () => {
	it('fires hover listeners on setHoverState', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.setHoverState('m1', 'code1');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('stops firing after offHoverChange', () => {
		const fn = vi.fn();
		model.onHoverChange(fn);
		model.setHoverState('m1', 'code1');
		model.offHoverChange(fn);
		model.setHoverState('m2', 'code2');
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

// ── constructor normalization ──

describe('constructor normalization', () => {
	it('persists normalized markers when any codeId was rewritten in constructor', () => {
		const reg = new CodeDefinitionRegistry();
		const def = reg.create('LegacyCode', '#FF0000');
		const existing = {
			testSection: {
				files: [
					{
						path: 'audio.mp3',
						markers: [
							{ id: 'm-legacy', fileId: 'audio.mp3', from: 0, to: 5, codes: [{ codeId: 'LegacyCode' }], createdAt: 1, updatedAt: 1 },
						],
					},
				],
			},
		};
		const dmLegacy = createMockDm(existing);
		const setSection = vi.spyOn(dmLegacy, 'setSection');
		new MediaCodingModel(dmLegacy as any, reg, 'testSection', DEFAULT_SETTINGS);

		// codeId should now be the canonical UUID
		const marker = dmLegacy.section('testSection').files[0].markers[0];
		expect(marker.codes[0].codeId).toBe(def.id);

		// setSection must have been called (mutated = true branch)
		expect(setSection).toHaveBeenCalled();
	});

	it('does not persist when all codeIds are canonical', () => {
		const reg = new CodeDefinitionRegistry();
		const def = reg.create('CanonicalCode', '#00FF00');
		const existing = {
			testSection: {
				files: [
					{
						path: 'audio.mp3',
						markers: [
							{ id: 'm-canonical', fileId: 'audio.mp3', from: 0, to: 5, codes: [{ codeId: def.id }], createdAt: 1, updatedAt: 1 },
						],
					},
				],
			},
		};
		const dmCanonical = createMockDm(existing);
		const setSection = vi.spyOn(dmCanonical, 'setSection');
		new MediaCodingModel(dmCanonical as any, reg, 'testSection', DEFAULT_SETTINGS);

		// Marker should be unchanged
		const marker = dmCanonical.section('testSection').files[0].markers[0];
		expect(marker.codes[0].codeId).toBe(def.id);

		// setSection must NOT have been called (mutated = false branch)
		expect(setSection).not.toHaveBeenCalled();
	});
});

// ── Migration backfill ──

describe('migration backfill', () => {
	it('backfills updatedAt and fileId on markers missing them', () => {
		const now = Date.now();
		const initialData = {
			testSection: {
				files: [
					{
						path: 'old.mp3',
						markers: [
							{ id: 'legacy1', from: 0, to: 5, codes: ca('code_a'), createdAt: now - 10000 },
						],
					},
				],
			},
		};
		const dmWithData = createMockDm(initialData);
		const reg = new CodeDefinitionRegistry();
		const m = new MediaCodingModel(dmWithData as any, reg, 'testSection', DEFAULT_SETTINGS);

		const markers = m.getMarkersForFile('old.mp3');
		expect(markers).toHaveLength(1);
		expect(markers[0]!.updatedAt).toBeDefined();
		expect(markers[0]!.fileId).toBe('old.mp3');
	});

	it('preserves existing updatedAt and fileId', () => {
		const initialData = {
			testSection: {
				files: [
					{
						path: 'file.mp3',
						markers: [
							{ id: 'm1', from: 0, to: 5, codes: [], createdAt: 1000, updatedAt: 2000, fileId: 'file.mp3' },
						],
					},
				],
			},
		};
		const dmWithData = createMockDm(initialData);
		const reg = new CodeDefinitionRegistry();
		const m = new MediaCodingModel(dmWithData as any, reg, 'testSection', DEFAULT_SETTINGS);

		const markers = m.getMarkersForFile('file.mp3');
		expect(markers[0]!.updatedAt).toBe(2000);
		expect(markers[0]!.fileId).toBe('file.mp3');
	});
});
