import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaSidebarAdapter } from '../../src/media/mediaSidebarAdapter';
import { MediaCodingModel } from '../../src/media/mediaCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { BaseMediaSettings } from '../../src/media/mediaTypes';
import type { CodeApplication } from '../../src/core/types';

// ── Mock DataManager ──

function createMockDm(initial: Record<string, any> = {}) {
	const store: Record<string, any> = { ...initial };
	return {
		section: (k: string) => store[k] ?? {},
		setSection: (k: string, v: any) => { store[k] = v; },
		markDirty: vi.fn(),
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
let adapter: MediaSidebarAdapter<any, any>;

beforeEach(() => {
	vi.useFakeTimers();
	registry = new CodeDefinitionRegistry();
	const dm = createMockDm();
	model = new MediaCodingModel(dm as any, registry, 'audio', DEFAULT_SETTINGS);
	adapter = new MediaSidebarAdapter(model, 'audio');
});

// ── constructor ──

describe('constructor', () => {
	it('sets registry from model', () => {
		expect(adapter.registry).toBe(registry);
	});
});

// ── markerToBase (via getAllMarkers) ──

describe('markerToBase', () => {
	it('creates correct MediaBaseMarker from MediaMarker', () => {
		const marker = model.findOrCreateMarker('file.mp3', 1.5, 3.5);
		const def = registry.create('Theme');
		model.addCodeToMarker(marker.id, def.id);
		vi.advanceTimersByTime(600);

		const baseMarkers = adapter.getAllMarkers();
		expect(baseMarkers).toHaveLength(1);
		const bm = baseMarkers[0]!;
		expect(bm.id).toBe(marker.id);
		expect(bm.startTime).toBe(1.5);
		expect(bm.endTime).toBe(3.5);
		expect(bm.mediaType).toBe('audio');
		expect(bm.codes.some((c: CodeApplication) => c.codeId === def.id)).toBe(true);
		expect(bm.markerLabel).toBeTruthy();
	});
});

// ── getAllMarkers ──

describe('getAllMarkers', () => {
	it('returns empty array when no markers', () => {
		expect(adapter.getAllMarkers()).toEqual([]);
	});

	it('maps all model markers through markerToBase', () => {
		model.findOrCreateMarker('a.mp3', 0, 5);
		model.findOrCreateMarker('b.mp3', 1, 6);
		const all = adapter.getAllMarkers();
		expect(all).toHaveLength(2);
		for (const m of all) {
			expect(m.mediaType).toBe('audio');
		}
	});
});

// ── getMarkerById ──

describe('getMarkerById', () => {
	it('returns mapped marker for existing id', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 10);
		const result = adapter.getMarkerById(marker.id);
		expect(result).not.toBeNull();
		expect(result!.id).toBe(marker.id);
		expect(result!.startTime).toBe(0);
		expect(result!.endTime).toBe(10);
	});

	it('returns null for unknown id', () => {
		expect(adapter.getMarkerById('nonexistent')).toBeNull();
	});
});

// ── updateMarkerFields ──

describe('updateMarkerFields', () => {
	it('applies memo field to marker', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		adapter.updateMarkerFields(marker.id, { memo: 'test note' });
		expect(marker.memo).toBe('test note');
	});

	it('applies colorOverride field to marker', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		adapter.updateMarkerFields(marker.id, { colorOverride: '#ff0000' });
		expect(marker.colorOverride).toBe('#ff0000');
	});

	it('updates updatedAt timestamp', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		const before = marker.updatedAt;
		vi.advanceTimersByTime(1000);
		adapter.updateMarkerFields(marker.id, { memo: 'x' });
		expect(marker.updatedAt).toBeGreaterThan(before);
	});

	it('does nothing for unknown marker id', () => {
		// Should not throw
		expect(() => adapter.updateMarkerFields('nonexistent', { memo: 'x' })).not.toThrow();
	});
});

// ── removeMarker ──

describe('removeMarker', () => {
	it('delegates to model and returns true for existing marker', () => {
		const marker = model.findOrCreateMarker('file.mp3', 0, 5);
		expect(adapter.removeMarker(marker.id)).toBe(true);
		expect(model.findMarkerById(marker.id)).toBeUndefined();
	});

	it('returns false for unknown marker', () => {
		expect(adapter.removeMarker('nonexistent')).toBe(false);
	});
});

// ── deleteCode ──

describe('deleteCode', () => {
	it('removes code from all markers and deletes from registry', () => {
		const m1 = model.findOrCreateMarker('file.mp3', 0, 5);
		const m2 = model.findOrCreateMarker('file.mp3', 6, 10);
		const themeDef = registry.create('Theme');
		const otherDef = registry.create('Other');
		model.addCodeToMarker(m1.id, themeDef.id);
		model.addCodeToMarker(m2.id, themeDef.id);
		model.addCodeToMarker(m2.id, otherDef.id);
		vi.advanceTimersByTime(600);

		adapter.deleteCode(themeDef.id);
		vi.advanceTimersByTime(600);

		// Theme removed from registry
		expect(registry.getByName('Theme')).toBeUndefined();
		// Other still present
		expect(registry.getByName('Other')).toBeDefined();
	});
});

// ── saveMarkers ──

describe('saveMarkers', () => {
	it('delegates to model.saveMarkers without error', () => {
		model.findOrCreateMarker('file.mp3', 0, 5);
		expect(() => adapter.saveMarkers()).not.toThrow();
	});
});

// ── updateDecorations ──

describe('updateDecorations', () => {
	it('delegates to model.notifyChange without error', () => {
		expect(() => adapter.updateDecorations('file.mp3')).not.toThrow();
	});
});
