import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageCodingModel } from '../../src/image/imageCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { NormalizedCoords } from '../../src/image/imageCodingTypes';
import type { CodeApplication } from '../../src/core/types';
import { hasCode } from '../../src/core/codeApplicationHelpers';

function ca(...codeIds: string[]): CodeApplication[] {
	return codeIds.map(codeId => ({ codeId }));
}

// ── Mock DataManager ──

function createMockDm(initial: Record<string, any> = {}) {
	const store: Record<string, any> = { ...initial };
	return {
		section: (k: string) => {
			if (!store[k]) store[k] = { markers: [], settings: { autoOpenImages: true, fileStates: {} } };
			return store[k];
		},
		setSection: (k: string, v: any) => { store[k] = v; },
		markDirty: vi.fn(),
	};
}

const rectCoords: NormalizedCoords = { type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
const ellipseCoords: NormalizedCoords = { type: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3 };

let model: ImageCodingModel;
let registry: CodeDefinitionRegistry;
let dm: ReturnType<typeof createMockDm>;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
	dm = createMockDm();
	model = new ImageCodingModel(dm as any, registry);
});

// ── createMarker ──

describe('createMarker', () => {
	it('creates marker with shape and coords', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		expect(marker.id).toBeTruthy();
		expect(marker.fileId).toBe('img.png');
		expect(marker.shape).toBe('rect');
		expect(marker.coords).toEqual(rectCoords);
		expect(marker.codes).toEqual([]);
	});

	it('creates marker with ellipse shape', () => {
		const marker = model.createMarker('img.png', 'ellipse', ellipseCoords);
		expect(marker.shape).toBe('ellipse');
	});
});

// ── findMarkerById ──

describe('findMarkerById', () => {
	it('finds existing marker by id', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		expect(model.findMarkerById(marker.id)).toBe(marker);
	});

	it('returns undefined for unknown id', () => {
		expect(model.findMarkerById('nonexistent')).toBeUndefined();
	});
});

// ── addCodeToMarker ──

describe('addCodeToMarker', () => {
	it('adds code to marker', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		const result = model.addCodeToMarker(marker.id, 'code_theme_a');
		expect(result).toBe(true);
		expect(hasCode(marker.codes, 'code_theme_a')).toBe(true);
	});

	it('does not add duplicate code', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		model.addCodeToMarker(marker.id, 'code_theme_a');
		model.addCodeToMarker(marker.id, 'code_theme_a');
		expect(marker.codes.filter(c => c.codeId === 'code_theme_a')).toHaveLength(1);
	});

	it('returns false for unknown marker id', () => {
		expect(model.addCodeToMarker('nonexistent', 'code_theme_a')).toBe(false);
	});
});

// ── removeCodeFromMarker ──

describe('removeCodeFromMarker', () => {
	it('removes code and deletes marker if empty', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		model.addCodeToMarker(marker.id, 'code_theme_a');
		model.removeCodeFromMarker(marker.id, 'code_theme_a');
		expect(model.findMarkerById(marker.id)).toBeUndefined();
	});

	it('keeps marker when keepIfEmpty is true', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		model.addCodeToMarker(marker.id, 'code_theme_a');
		model.removeCodeFromMarker(marker.id, 'code_theme_a', true);
		expect(model.findMarkerById(marker.id)).toBeDefined();
		expect(marker.codes).toEqual([]);
	});

	it('returns false for unknown marker', () => {
		expect(model.removeCodeFromMarker('nonexistent', 'code_theme_a')).toBe(false);
	});

	it('returns false if code not present on marker', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		model.addCodeToMarker(marker.id, 'code_theme_a');
		expect(model.removeCodeFromMarker(marker.id, 'code_theme_b')).toBe(false);
	});
});

// ── removeMarker ──

describe('removeMarker', () => {
	it('removes existing marker and returns true', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		expect(model.removeMarker(marker.id)).toBe(true);
		expect(model.findMarkerById(marker.id)).toBeUndefined();
	});

	it('returns false for non-existent marker', () => {
		expect(model.removeMarker('nonexistent')).toBe(false);
	});
});

// ── getMarkersForFile ──

describe('getMarkersForFile', () => {
	it('returns markers for specific file', () => {
		model.createMarker('a.png', 'rect', rectCoords);
		model.createMarker('a.png', 'ellipse', ellipseCoords);
		model.createMarker('b.png', 'rect', rectCoords);
		expect(model.getMarkersForFile('a.png')).toHaveLength(2);
		expect(model.getMarkersForFile('b.png')).toHaveLength(1);
		expect(model.getMarkersForFile('c.png')).toEqual([]);
	});
});

// ── getAllFileIds ──

describe('getAllFileIds', () => {
	it('returns unique file paths', () => {
		model.createMarker('a.png', 'rect', rectCoords);
		model.createMarker('a.png', 'ellipse', ellipseCoords);
		model.createMarker('b.png', 'rect', rectCoords);
		const ids = model.getAllFileIds();
		expect(ids).toHaveLength(2);
		expect(ids).toContain('a.png');
		expect(ids).toContain('b.png');
	});
});

// ── migrateFilePath ──

describe('migrateFilePath', () => {
	it('renames file path on all matching markers', () => {
		model.createMarker('old.png', 'rect', rectCoords);
		model.createMarker('old.png', 'ellipse', ellipseCoords);
		model.migrateFilePath('old.png', 'new.png');
		expect(model.getMarkersForFile('new.png')).toHaveLength(2);
		expect(model.getMarkersForFile('old.png')).toEqual([]);
	});

	it('does nothing for unknown path', () => {
		model.createMarker('a.png', 'rect', rectCoords);
		model.migrateFilePath('nonexistent.png', 'new.png');
		expect(model.getMarkersForFile('a.png')).toHaveLength(1);
	});
});

// ── getMarkerLabel ──

describe('getMarkerLabel', () => {
	it('returns Rectangle for rect shape', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		expect(model.getMarkerLabel(marker)).toBe('Rectangle');
	});

	it('returns Ellipse for ellipse shape', () => {
		const marker = model.createMarker('img.png', 'ellipse', { type: 'rect', x: 0, y: 0, w: 1, h: 1 });
		(marker as any).shape = 'ellipse';
		expect(model.getMarkerLabel(marker)).toBe('Ellipse');
	});

	it('returns Polygon for polygon shape', () => {
		const polyCoords: NormalizedCoords = { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] };
		const marker = model.createMarker('img.png', 'polygon', polyCoords);
		expect(model.getMarkerLabel(marker)).toBe('Polygon');
	});

	it('returns Region for unknown shape', () => {
		const marker = model.createMarker('img.png', 'rect', rectCoords);
		(marker as any).shape = 'freehand';
		expect(model.getMarkerLabel(marker)).toBe('Region');
	});
});

// ── constructor normalization ──

describe('constructor normalization', () => {
	it('persists normalized markers when any codeId was rewritten in constructor', () => {
		const def = registry.create('LegacyCode', '#FF0000');
		const existing = {
			image: {
				markers: [{ id: 'm-legacy', fileId: 'img.png', shape: 'rect', coords: rectCoords, codes: [{ codeId: 'LegacyCode' }], createdAt: 1, updatedAt: 1 }],
				settings: { autoOpenImages: true, fileStates: {} },
			},
		};
		const dmLegacy = createMockDm(existing);
		new ImageCodingModel(dmLegacy as any, registry);

		// codeId should now be the canonical UUID
		const marker = dmLegacy.section('image').markers[0];
		expect(marker.codes[0].codeId).toBe(def.id);

		// markDirty must have been called (mutated = true branch)
		expect(dmLegacy.markDirty).toHaveBeenCalled();
	});

	it('does not markDirty when all codeIds are canonical', () => {
		const def = registry.create('CanonicalCode', '#00FF00');
		const existing = {
			image: {
				markers: [{ id: 'm-canonical', fileId: 'img.png', shape: 'rect', coords: rectCoords, codes: [{ codeId: def.id }], createdAt: 1, updatedAt: 1 }],
				settings: { autoOpenImages: true, fileStates: {} },
			},
		};
		const dmCanonical = createMockDm(existing);
		new ImageCodingModel(dmCanonical as any, registry);

		// Marker should be unchanged
		const marker = dmCanonical.section('image').markers[0];
		expect(marker.codes[0].codeId).toBe(def.id);

		// markDirty must NOT have been called (mutated = false branch)
		expect(dmCanonical.markDirty).not.toHaveBeenCalled();
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
