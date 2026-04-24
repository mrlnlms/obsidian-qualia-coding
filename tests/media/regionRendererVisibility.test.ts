/**
 * Tests for Toggle Visibility filter in MediaRegionRenderer.renderMarkerRegion
 * and MediaViewCore.refreshVisibility.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaRegionRenderer } from '../../src/media/regionRenderer';
import type { MediaMarker } from '../../src/media/mediaTypes';
import type { CodeApplication } from '../../src/core/types';

// ── Minimal mocks ──

function makeRegistry(visibleMap: Record<string, Record<string, boolean>>) {
	return {
		isCodeVisibleInFile(codeId: string, fileId: string): boolean {
			return visibleMap[fileId]?.[codeId] ?? true;
		},
		getColorForCodeIds(_ids: string[]): string | undefined {
			return undefined;
		},
		getById(_id: string): { name: string } | undefined {
			return { name: _id };
		},
	};
}

function makeModel(visibleMap: Record<string, Record<string, boolean>> = {}) {
	return {
		registry: makeRegistry(visibleMap),
		settings: { regionOpacity: 0.4, showLabelsOnRegions: true },
		findMarkerById: (_id: string) => undefined as MediaMarker | undefined,
		getMarkersForFile: (_path: string) => [] as MediaMarker[],
		setHoverState: vi.fn(),
		getHoverMarkerId: () => null as string | null,
		onHoverChange: vi.fn(),
		offHoverChange: vi.fn(),
	};
}

type FakeRegion = { id: string; remove: ReturnType<typeof vi.fn> };

function makeRenderer() {
	const regions: FakeRegion[] = [];
	return {
		addRegion: vi.fn((opts: { id: string }) => {
			const r: FakeRegion = { id: opts.id, remove: vi.fn() };
			regions.push(r);
			return r;
		}),
		clearRegions: vi.fn(() => { regions.length = 0; }),
		readAccentHex: () => '#000000',
		getRegionsPlugin: () => null,
		getMinimapOverlay: () => null,
		_regions: regions,
	};
}

function ca(codeId: string): CodeApplication {
	return { codeId };
}

function makeMarker(id: string, fileId: string, codes: CodeApplication[]): MediaMarker {
	return { id, fileId, from: 0, to: 5, codes, createdAt: 0, updatedAt: 0 };
}

// ── Tests: renderMarkerRegion visibility filter ──

describe('MediaRegionRenderer.renderMarkerRegion — visibility filter', () => {
	let renderer: ReturnType<typeof makeRenderer>;

	beforeEach(() => {
		renderer = makeRenderer();
	});

	it('renders region when all codes are visible', () => {
		const model = makeModel({ 'file.mp3': { code1: true } });
		const rr = new MediaRegionRenderer(renderer as any, model as any);
		const marker = makeMarker('m1', 'file.mp3', [ca('code1')]);

		rr.renderMarkerRegion(marker);

		expect(renderer.addRegion).toHaveBeenCalledOnce();
	});

	it('skips render when all codes are hidden', () => {
		const model = makeModel({ 'file.mp3': { code1: false } });
		const rr = new MediaRegionRenderer(renderer as any, model as any);
		const marker = makeMarker('m1', 'file.mp3', [ca('code1')]);

		rr.renderMarkerRegion(marker);

		expect(renderer.addRegion).not.toHaveBeenCalled();
	});

	it('renders region when at least one code is visible (partial)', () => {
		// code1 hidden, code2 visible
		const model = makeModel({ 'file.mp3': { code1: false, code2: true } });
		const rr = new MediaRegionRenderer(renderer as any, model as any);
		const marker = makeMarker('m1', 'file.mp3', [ca('code1'), ca('code2')]);

		rr.renderMarkerRegion(marker);

		expect(renderer.addRegion).toHaveBeenCalledOnce();
	});

	it('skips render when marker has no codes (empty array)', () => {
		const model = makeModel();
		const rr = new MediaRegionRenderer(renderer as any, model as any);
		const marker = makeMarker('m1', 'file.mp3', []);

		rr.renderMarkerRegion(marker);

		// No codes means visibleCodes is empty → skip
		expect(renderer.addRegion).not.toHaveBeenCalled();
	});

	it('uses marker.fileId to query visibility (not a hardcoded path)', () => {
		// code1 hidden in file-A, visible in file-B
		const model = makeModel({ 'file-A.mp3': { code1: false }, 'file-B.mp3': { code1: true } });
		const rr = new MediaRegionRenderer(renderer as any, model as any);

		const markerA = makeMarker('mA', 'file-A.mp3', [ca('code1')]);
		const markerB = makeMarker('mB', 'file-B.mp3', [ca('code1')]);

		rr.renderMarkerRegion(markerA);
		expect(renderer.addRegion).not.toHaveBeenCalled();

		rr.renderMarkerRegion(markerB);
		expect(renderer.addRegion).toHaveBeenCalledOnce();
	});

	it('label chips only include visible codes', () => {
		// code1 visible, code2 hidden
		const model = makeModel({ 'file.mp3': { code1: true, code2: false } });
		const rr = new MediaRegionRenderer(renderer as any, model as any);
		const marker = makeMarker('m1', 'file.mp3', [ca('code1'), ca('code2')]);

		rr.renderMarkerRegion(marker);

		const call = renderer.addRegion.mock.calls[0]?.[0] as { content?: HTMLElement };
		const content = call?.content;
		expect(content).toBeDefined();
		const chips = content!.querySelectorAll('.codemarker-media-chip');
		expect(chips.length).toBe(1);
		expect(chips[0]!.textContent).toBe('code1');
	});
});

// ── Tests: MediaViewCore.refreshVisibility ──
// We test the pure logic by importing the class — but MediaViewCore requires
// heavy Obsidian/WaveSurfer deps, so we test the behaviour indirectly via a
// lightweight integration: a fake MediaViewCore-like object that mirrors the
// refreshVisibility logic.

describe('refreshVisibility — clear + re-render logic', () => {
	it('clears regions and re-renders only markers with visible codes', () => {
		const model = makeModel({ 'file.mp3': { cA: true, cB: false } });
		const renderer = makeRenderer();
		const rr = new MediaRegionRenderer(renderer as any, model as any);

		// Simulate two markers: m1 (cA visible) and m2 (cB hidden)
		const m1 = makeMarker('m1', 'file.mp3', [ca('cA')]);
		const m2 = makeMarker('m2', 'file.mp3', [ca('cB')]);
		const markers = [m1, m2];

		// Simulate refreshVisibility logic directly
		rr.clear();
		for (const m of markers) {
			const anyVisible = m.codes.some(app =>
				model.registry.isCodeVisibleInFile(app.codeId, m.fileId)
			);
			if (!anyVisible) continue;
			rr.renderMarkerRegion(m);
		}

		expect(renderer.clearRegions).toHaveBeenCalled();
		// Only m1 should have been rendered
		expect(renderer.addRegion).toHaveBeenCalledOnce();
		expect(renderer.addRegion.mock.calls[0]![0]).toMatchObject({ id: 'm1' });
	});

	it('renders nothing when all markers are fully hidden', () => {
		const model = makeModel({ 'file.mp3': { cA: false, cB: false } });
		const renderer = makeRenderer();
		const rr = new MediaRegionRenderer(renderer as any, model as any);

		const markers = [
			makeMarker('m1', 'file.mp3', [ca('cA')]),
			makeMarker('m2', 'file.mp3', [ca('cB')]),
		];

		rr.clear();
		for (const m of markers) {
			const anyVisible = m.codes.some(app =>
				model.registry.isCodeVisibleInFile(app.codeId, m.fileId)
			);
			if (!anyVisible) continue;
			rr.renderMarkerRegion(m);
		}

		expect(renderer.clearRegions).toHaveBeenCalled();
		expect(renderer.addRegion).not.toHaveBeenCalled();
	});
});
