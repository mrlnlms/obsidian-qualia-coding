import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseSidebarAdapter } from '../../src/core/baseSidebarAdapter';
import type { AdapterModel } from '../../src/core/baseSidebarAdapter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { BaseMarker } from '../../src/core/types';

function createMockAdapterModel(): AdapterModel {
	return {
		registry: new CodeDefinitionRegistry(),
		onChange: vi.fn(),
		offChange: vi.fn(),
		onHoverChange: vi.fn(),
		offHoverChange: vi.fn(),
		setHoverState: vi.fn(),
		getHoverMarkerId: vi.fn(() => null),
		getHoverMarkerIds: vi.fn(() => []),
		getAllMarkers: vi.fn(() => []),
		removeCodeFromMarker: vi.fn(),
		findMarkerById: vi.fn(() => null),
	};
}

class TestAdapter extends BaseSidebarAdapter {
	getAllMarkers(): BaseMarker[] { return []; }
	getMarkerById(): BaseMarker | null { return null; }
	getAllFileIds(): string[] { return []; }
	getMarkersForFile(): BaseMarker[] { return []; }
	saveMarkers = vi.fn();
	updateDecorations(): void {}
	removeMarker(): boolean { return false; }
	protected override notifyAfterFieldUpdate = vi.fn();
	// deleteCode and updateMarkerFields inherited from base — NOT overridden
}

let model: AdapterModel;
let adapter: TestAdapter;

beforeEach(() => {
	model = createMockAdapterModel();
	adapter = new TestAdapter(model);
});

// ── Constructor ───────────────────────────────────────────────

describe('constructor', () => {
	it('sets registry from model', () => {
		expect(adapter.registry).toBe(model.registry);
	});
});

// ── onChange / offChange ──────────────────────────────────────

describe('onChange', () => {
	it('registers listener on model', () => {
		const fn = vi.fn();
		adapter.onChange(fn);
		expect(model.onChange).toHaveBeenCalledWith(fn);
	});
});

describe('offChange', () => {
	it('removes listener from model', () => {
		const fn = vi.fn();
		adapter.onChange(fn);
		adapter.offChange(fn);
		expect(model.offChange).toHaveBeenCalledWith(fn);
	});

	it('is a no-op for unregistered fn', () => {
		const fn = vi.fn();
		adapter.offChange(fn);
		expect(model.offChange).not.toHaveBeenCalled();
	});
});

// ── onHoverChange / offHoverChange ────────────────────────────

describe('onHoverChange', () => {
	it('wraps callback before registering on model', () => {
		const fn = vi.fn();
		adapter.onHoverChange(fn);
		expect(model.onHoverChange).toHaveBeenCalledTimes(1);
		// The model receives a wrapper, not the original fn
		const registeredWrapper = (model.onHoverChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(registeredWrapper).not.toBe(fn);
	});

	it('wrapper calls original fn when invoked', () => {
		const fn = vi.fn();
		adapter.onHoverChange(fn);
		const registeredWrapper = (model.onHoverChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		registeredWrapper('extra', 'args');
		expect(fn).toHaveBeenCalledTimes(1);
		// Wrapper discards args — fn() is called with no args
		expect(fn).toHaveBeenCalledWith();
	});
});

describe('offHoverChange', () => {
	it('removes the correct wrapper from model', () => {
		const fn = vi.fn();
		adapter.onHoverChange(fn);
		const registeredWrapper = (model.onHoverChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		adapter.offHoverChange(fn);
		expect(model.offHoverChange).toHaveBeenCalledWith(registeredWrapper);
	});

	it('is a no-op for unregistered fn', () => {
		const fn = vi.fn();
		adapter.offHoverChange(fn);
		expect(model.offHoverChange).not.toHaveBeenCalled();
	});
});

// ── setHoverState ─────────────────────────────────────────────

describe('setHoverState', () => {
	it('delegates to model', () => {
		adapter.setHoverState('marker-1', 'code-a');
		expect(model.setHoverState).toHaveBeenCalledWith('marker-1', 'code-a');
	});

	it('delegates null to model', () => {
		adapter.setHoverState(null, null);
		expect(model.setHoverState).toHaveBeenCalledWith(null, null);
	});
});

// ── getHoverMarkerId ──────────────────────────────────────────

describe('getHoverMarkerId', () => {
	it('delegates to model', () => {
		(model.getHoverMarkerId as ReturnType<typeof vi.fn>).mockReturnValue('hovered');
		expect(adapter.getHoverMarkerId()).toBe('hovered');
	});

	it('returns null when model returns null', () => {
		expect(adapter.getHoverMarkerId()).toBeNull();
	});
});

// ── getHoverMarkerIds ─────────────────────────────────────────

describe('getHoverMarkerIds', () => {
	it('delegates to model.getHoverMarkerIds when available', () => {
		(model.getHoverMarkerIds as ReturnType<typeof vi.fn>).mockReturnValue(['h1', 'h2']);
		expect(adapter.getHoverMarkerIds()).toEqual(['h1', 'h2']);
	});

	it('falls back to [getHoverMarkerId()] when getHoverMarkerIds absent', () => {
		const modelWithoutIds = { ...model, getHoverMarkerIds: undefined };
		const adapterWithout = new TestAdapter(modelWithoutIds as AdapterModel);
		(modelWithoutIds.getHoverMarkerId as ReturnType<typeof vi.fn>).mockReturnValue('h1');
		expect(adapterWithout.getHoverMarkerIds()).toEqual(['h1']);
	});

	it('returns [] via fallback when model has no hover', () => {
		const modelWithoutIds = { ...model, getHoverMarkerIds: undefined };
		const adapterWithout = new TestAdapter(modelWithoutIds as AdapterModel);
		(modelWithoutIds.getHoverMarkerId as ReturnType<typeof vi.fn>).mockReturnValue(null);
		expect(adapterWithout.getHoverMarkerIds()).toEqual([]);
	});
});

// ── Multiple listeners ────────────────────────────────────────

describe('multiple listeners', () => {
	it('tracks listeners independently', () => {
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		adapter.onChange(fn1);
		adapter.onChange(fn2);
		adapter.offChange(fn1);
		// fn1 removed, fn2 still registered
		expect(model.offChange).toHaveBeenCalledTimes(1);
		expect(model.offChange).toHaveBeenCalledWith(fn1);
	});

	it('tracks hover listeners independently', () => {
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		adapter.onHoverChange(fn1);
		adapter.onHoverChange(fn2);
		adapter.offHoverChange(fn1);
		// Should have removed fn1's wrapper via offHoverChange on model
		// onHoverChange called 2x, offHoverChange called 1x for fn1's wrapper
		expect(model.offHoverChange).toHaveBeenCalledTimes(1);
	});

	it('prevents duplicate onChange registration for same fn', () => {
		const fn = vi.fn();
		adapter.onChange(fn);
		adapter.onChange(fn); // second call should be no-op
		expect(model.onChange).toHaveBeenCalledTimes(1);
	});

	it('re-registering onHoverChange cleans up previous wrapper', () => {
		const fn = vi.fn();
		adapter.onHoverChange(fn);
		const firstWrapper = (model.onHoverChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		adapter.onHoverChange(fn); // re-register same fn
		// Should have removed first wrapper before registering new one
		expect(model.offHoverChange).toHaveBeenCalledWith(firstWrapper);
		expect(model.onHoverChange).toHaveBeenCalledTimes(2);
	});
});

// ── deleteCode (shared implementation) ───────────────────────

describe('deleteCode', () => {
	it('removes code from all markers via model.removeCodeFromMarker', () => {
		vi.mocked(model.getAllMarkers).mockReturnValue([
			{ id: 'm1', codes: ['A', 'B'] },
			{ id: 'm2', codes: ['A'] },
			{ id: 'm3', codes: ['B'] },
		]);
		adapter.deleteCode('A');
		expect(model.removeCodeFromMarker).toHaveBeenCalledWith('m1', 'A', true);
		expect(model.removeCodeFromMarker).toHaveBeenCalledWith('m2', 'A', true);
		expect(model.removeCodeFromMarker).not.toHaveBeenCalledWith('m3', 'A', true);
	});

	it('deletes code definition from registry', () => {
		vi.mocked(model.getAllMarkers).mockReturnValue([]);
		const def = model.registry.create('TestCode');
		adapter.deleteCode('TestCode');
		expect(model.registry.getByName('TestCode')).toBeUndefined();
	});

	it('calls saveMarkers after cleanup', () => {
		vi.mocked(model.getAllMarkers).mockReturnValue([]);
		adapter.deleteCode('X');
		expect(adapter.saveMarkers).toHaveBeenCalledOnce();
	});

	it('handles empty markers array', () => {
		vi.mocked(model.getAllMarkers).mockReturnValue([]);
		adapter.deleteCode('nonexistent');
		expect(model.removeCodeFromMarker).not.toHaveBeenCalled();
		expect(adapter.saveMarkers).toHaveBeenCalledOnce();
	});
});

// ── updateMarkerFields (shared implementation) ───────────────

describe('updateMarkerFields', () => {
	it('updates memo on marker via findMarkerById', () => {
		const marker = { memo: 'old', colorOverride: undefined, updatedAt: 0 };
		vi.mocked(model.findMarkerById).mockReturnValue(marker);
		adapter.updateMarkerFields('m1', { memo: 'new memo' });
		expect(model.findMarkerById).toHaveBeenCalledWith('m1');
		expect(marker.memo).toBe('new memo');
	});

	it('updates colorOverride on marker', () => {
		const marker = { memo: undefined, colorOverride: '#old', updatedAt: 0 };
		vi.mocked(model.findMarkerById).mockReturnValue(marker);
		adapter.updateMarkerFields('m1', { colorOverride: '#new' });
		expect(marker.colorOverride).toBe('#new');
	});

	it('updates both memo and colorOverride', () => {
		const marker = { memo: 'old', colorOverride: '#old', updatedAt: 0 };
		vi.mocked(model.findMarkerById).mockReturnValue(marker);
		adapter.updateMarkerFields('m1', { memo: 'new', colorOverride: '#new' });
		expect(marker.memo).toBe('new');
		expect(marker.colorOverride).toBe('#new');
	});

	it('sets updatedAt to current time', () => {
		const marker = { memo: undefined, colorOverride: undefined, updatedAt: 0 };
		vi.mocked(model.findMarkerById).mockReturnValue(marker);
		const before = Date.now();
		adapter.updateMarkerFields('m1', { memo: 'x' });
		expect(marker.updatedAt).toBeGreaterThanOrEqual(before);
	});

	it('calls notifyAfterFieldUpdate', () => {
		const marker = { memo: undefined, colorOverride: undefined, updatedAt: 0 };
		vi.mocked(model.findMarkerById).mockReturnValue(marker);
		adapter.updateMarkerFields('m1', { memo: 'x' });
		expect(adapter['notifyAfterFieldUpdate']).toHaveBeenCalledOnce();
	});

	it('is a no-op when marker not found', () => {
		vi.mocked(model.findMarkerById).mockReturnValue(null);
		adapter.updateMarkerFields('missing', { memo: 'x' });
		expect(adapter['notifyAfterFieldUpdate']).not.toHaveBeenCalled();
	});

	it('can set memo to undefined', () => {
		const marker = { memo: 'old', colorOverride: undefined, updatedAt: 0 };
		vi.mocked(model.findMarkerById).mockReturnValue(marker);
		adapter.updateMarkerFields('m1', { memo: undefined });
		expect(marker.memo).toBeUndefined();
	});
});
