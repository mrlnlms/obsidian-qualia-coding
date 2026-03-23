import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataManager } from '../../src/core/dataManager';
import { createDefaultData } from '../../src/core/types';
import type { QualiaData } from '../../src/core/types';
import type { Plugin } from 'obsidian';

function createMockPlugin(initialData: any = null) {
	let stored = initialData;
	return {
		loadData: vi.fn(async () => stored),
		saveData: vi.fn(async (data: any) => { stored = data; }),
	} as unknown as Plugin;
}

let dm: DataManager;
let plugin: ReturnType<typeof createMockPlugin>;

beforeEach(() => {
	vi.useFakeTimers();
	plugin = createMockPlugin();
	dm = new DataManager(plugin as unknown as Plugin);
});

afterEach(() => {
	vi.useRealTimers();
});

// ── load ──────────────────────────────────────────────────────

describe('load', () => {
	it('creates defaults when loadData returns null', async () => {
		await dm.load();
		const data = dm.getAll();
		const defaults = createDefaultData();
		expect(data.registry).toEqual(defaults.registry);
		expect(data.markdown.settings).toEqual(defaults.markdown.settings);
		expect(data.csv).toEqual(defaults.csv);
	});

	it('fills missing sections from defaults on partial data', async () => {
		const partial = { registry: { definitions: {}, nextPaletteIndex: 3 } };
		plugin = createMockPlugin(partial);
		dm = new DataManager(plugin as unknown as Plugin);
		await dm.load();
		const data = dm.getAll();
		expect(data.registry.nextPaletteIndex).toBe(3);
		// Missing sections should be filled from defaults
		expect(data.csv).toEqual(createDefaultData().csv);
		expect(data.image).toEqual(createDefaultData().image);
	});

	it('merges nested markdown settings with defaults', async () => {
		const partial = {
			...createDefaultData(),
			markdown: { markers: {}, settings: { defaultColor: '#FF0000' } },
		};
		plugin = createMockPlugin(partial);
		dm = new DataManager(plugin as unknown as Plugin);
		await dm.load();
		const data = dm.getAll();
		// Custom value preserved
		expect(data.markdown.settings.defaultColor).toBe('#FF0000');
		// Default values filled in for missing keys
		expect(data.markdown.settings.markerOpacity).toBe(0.4);
		expect(data.markdown.settings.showHandlesOnHover).toBe(true);
	});

	it('preserves existing data when all sections present', async () => {
		const full = createDefaultData();
		full.registry.nextPaletteIndex = 7;
		plugin = createMockPlugin(full);
		dm = new DataManager(plugin as unknown as Plugin);
		await dm.load();
		expect(dm.getAll().registry.nextPaletteIndex).toBe(7);
	});
});

// ── section ───────────────────────────────────────────────────

describe('section', () => {
	it('returns the correct section by typed key', async () => {
		await dm.load();
		const csv = dm.section('csv');
		expect(csv).toEqual({ segmentMarkers: [], rowMarkers: [] });
	});

	it('returns the correct section for registry', async () => {
		await dm.load();
		const reg = dm.section('registry');
		expect(reg.definitions).toEqual({});
		expect(reg.nextPaletteIndex).toBe(0);
	});
});

// ── setSection ────────────────────────────────────────────────

describe('setSection', () => {
	it('updates data for a typed key', async () => {
		await dm.load();
		dm.setSection('csv', { segmentMarkers: [{ id: '1' }], rowMarkers: [] } as any);
		expect(dm.section('csv').segmentMarkers).toHaveLength(1);
	});

	it('works with string key overload', async () => {
		await dm.load();
		dm.setSection('customKey' as any, { foo: 'bar' } as any);
		expect(dm.section('customKey' as any)).toEqual({ foo: 'bar' });
	});
});

// ── getAll ────────────────────────────────────────────────────

describe('getAll', () => {
	it('returns full data snapshot', async () => {
		await dm.load();
		const all = dm.getAll();
		expect(all).toHaveProperty('registry');
		expect(all).toHaveProperty('markdown');
		expect(all).toHaveProperty('csv');
		expect(all).toHaveProperty('image');
		expect(all).toHaveProperty('pdf');
		expect(all).toHaveProperty('audio');
		expect(all).toHaveProperty('video');
	});
});

// ── flush ─────────────────────────────────────────────────────

describe('flush', () => {
	it('calls saveData on the plugin', async () => {
		await dm.load();
		await dm.flush();
		expect((plugin as any).saveData).toHaveBeenCalled();
	});

	it('saves the current data state', async () => {
		await dm.load();
		dm.setSection('csv', { segmentMarkers: [{ id: 'x' }], rowMarkers: [] } as any);
		// Clear the timer so flush isn't called automatically
		vi.clearAllTimers();
		await dm.flush();
		const savedArg = (plugin as any).saveData.mock.calls.at(-1)?.[0];
		expect(savedArg.csv.segmentMarkers).toHaveLength(1);
	});
});

// ── markDirty ─────────────────────────────────────────────────

describe('markDirty', () => {
	it('schedules a save after 500ms', async () => {
		await dm.load();
		dm.markDirty();
		expect((plugin as any).saveData).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(500);
		expect((plugin as any).saveData).toHaveBeenCalled();
	});

	it('debounces multiple markDirty calls', async () => {
		await dm.load();
		dm.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		dm.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		// Only 400ms since last markDirty — should not have saved yet
		expect((plugin as any).saveData).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(300);
		expect((plugin as any).saveData).toHaveBeenCalledTimes(1);
	});

	it('setSection triggers markDirty automatically', async () => {
		await dm.load();
		dm.setSection('csv', { segmentMarkers: [], rowMarkers: [] });
		await vi.advanceTimersByTimeAsync(500);
		expect((plugin as any).saveData).toHaveBeenCalled();
	});
});

// ── clearAllSections ──────────────────────────────────────────

describe('clearAllSections', () => {
	it('resets all engine data', async () => {
		await dm.load();
		dm.setSection('csv', { segmentMarkers: [{ id: '1' }], rowMarkers: [{ id: '2' }] } as any);
		vi.clearAllTimers();
		await dm.clearAllSections();
		const data = dm.getAll();
		expect(data.csv.segmentMarkers).toEqual([]);
		expect(data.csv.rowMarkers).toEqual([]);
		expect(data.pdf.markers).toEqual([]);
		expect(data.pdf.shapes).toEqual([]);
		expect(data.image.markers).toEqual([]);
		expect(data.audio.files).toEqual([]);
		expect(data.video.files).toEqual([]);
		expect(data.markdown.markers).toEqual({});
		expect(data.registry.definitions).toEqual({});
		expect(data.registry.nextPaletteIndex).toBe(0);
		expect(data.registry.folders).toEqual({});
		expect(data.registry.rootOrder).toEqual([]);
	});

	it('preserves per-engine settings', async () => {
		const initial = createDefaultData();
		initial.markdown.settings.defaultColor = '#CUSTOM';
		initial.image.settings.autoOpenImages = false;
		initial.audio.settings.defaultZoom = 100;
		initial.video.settings.videoFit = 'cover';
		plugin = createMockPlugin(initial);
		dm = new DataManager(plugin as unknown as Plugin);
		await dm.load();
		await dm.clearAllSections();
		const data = dm.getAll();
		expect(data.markdown.settings.defaultColor).toBe('#CUSTOM');
		expect(data.image.settings.autoOpenImages).toBe(false);
		expect(data.audio.settings.defaultZoom).toBe(100);
		expect(data.video.settings.videoFit).toBe('cover');
	});

	it('calls flush after clearing', async () => {
		await dm.load();
		await dm.clearAllSections();
		expect((plugin as any).saveData).toHaveBeenCalled();
	});
});

// ── Settings deep merge ──────────────────────────────────────

describe('settings deep merge on load', () => {
	it('merges all engine settings with defaults, preserving custom values', async () => {
		const plugin = createMockPlugin({
			registry: { definitions: {}, nextPaletteIndex: 0 },
			markdown: { markers: {}, settings: { defaultColor: '#custom' } },
			csv: { segmentMarkers: [], rowMarkers: [] },
			image: { markers: [], settings: { autoOpenImages: false } },
			pdf: { markers: [], shapes: [] },
			audio: { files: [], settings: { defaultZoom: 80 } },
			video: { files: [], settings: { defaultZoom: 80, videoFit: 'cover' } },
		});
		const dm = new DataManager(plugin);
		await dm.load();

		// markdown: custom preserved, defaults filled
		expect(dm.section('markdown').settings.defaultColor).toBe('#custom');
		expect(dm.section('markdown').settings.markerOpacity).toBe(0.4);

		// image: custom preserved, defaults filled
		expect(dm.section('image').settings.autoOpenImages).toBe(false);
		expect(dm.section('image').settings.fileStates).toEqual({});

		// audio: custom preserved, defaults filled
		expect(dm.section('audio').settings.defaultZoom).toBe(80);
		expect(dm.section('audio').settings.regionOpacity).toBe(0.4);
		expect(dm.section('audio').settings.fileStates).toEqual({});

		// video: custom preserved, defaults filled
		expect(dm.section('video').settings.defaultZoom).toBe(80);
		expect(dm.section('video').settings.videoFit).toBe('cover');
		expect(dm.section('video').settings.regionOpacity).toBe(0.4);
		expect(dm.section('video').settings.fileStates).toEqual({});
	});

	it('fills all defaults when settings are completely missing', async () => {
		const plugin = createMockPlugin({
			registry: { definitions: {}, nextPaletteIndex: 0 },
			markdown: { markers: {} },
			csv: { segmentMarkers: [], rowMarkers: [] },
			image: { markers: [] },
			pdf: { markers: [], shapes: [] },
			audio: { files: [] },
			video: { files: [] },
		});
		const dm = new DataManager(plugin);
		await dm.load();

		expect(dm.section('markdown').settings.defaultColor).toBe('#6200EE');
		expect(dm.section('image').settings.autoOpenImages).toBe(true);
		expect(dm.section('audio').settings.defaultZoom).toBe(50);
		expect(dm.section('video').settings.videoFit).toBe('contain');
	});

	it('deep merges nested objects inside settings (future-proof)', async () => {
		// Simulate a future scenario where settings gain nested structure.
		// The deep merge should fill new nested defaults without wiping persisted nested values.
		const plugin = createMockPlugin({
			registry: { definitions: {}, nextPaletteIndex: 0 },
			markdown: { markers: {}, settings: { defaultColor: '#custom' } },
			csv: { segmentMarkers: [], rowMarkers: [] },
			image: { markers: [], settings: { autoOpenImages: false, fileStates: { 'img.png': { zoom: 2, panX: 10, panY: 20 } } } },
			pdf: { markers: [], shapes: [] },
			audio: { files: [], settings: { defaultZoom: 80, fileStates: { 'a.mp3': { zoom: 3, lastPosition: 42 } } } },
			video: { files: [], settings: { defaultZoom: 80, videoFit: 'cover', fileStates: {} } },
		});
		const dm = new DataManager(plugin);
		await dm.load();

		// Persisted nested fileStates should survive the merge
		const imgStates = dm.section('image').settings.fileStates;
		expect(imgStates['img.png']).toEqual({ zoom: 2, panX: 10, panY: 20 });

		const audioStates = dm.section('audio').settings.fileStates;
		expect(audioStates['a.mp3']).toEqual({ zoom: 3, lastPosition: 42 });
	});
});
