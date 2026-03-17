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
	};
}

class TestAdapter extends BaseSidebarAdapter {
	getAllMarkers(): BaseMarker[] { return []; }
	getMarkerById(): BaseMarker | null { return null; }
	getAllFileIds(): string[] { return []; }
	getMarkersForFile(): BaseMarker[] { return []; }
	saveMarkers(): void {}
	updateMarkerFields(): void {}
	updateDecorations(): void {}
	removeMarker(): boolean { return false; }
	deleteCode(): void {}
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
	it('returns [id] when model has hover', () => {
		(model.getHoverMarkerId as ReturnType<typeof vi.fn>).mockReturnValue('h1');
		expect(adapter.getHoverMarkerIds()).toEqual(['h1']);
	});

	it('returns [] when model has no hover', () => {
		expect(adapter.getHoverMarkerIds()).toEqual([]);
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
		expect(model.offHoverChange).toHaveBeenCalledTimes(1);
		// Should have removed the wrapper for fn1, not fn2
		const wrapper1 = (model.onHoverChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(model.offHoverChange).toHaveBeenCalledWith(wrapper1);
	});
});
