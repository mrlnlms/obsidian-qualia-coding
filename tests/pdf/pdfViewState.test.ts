import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPdfViewState, destroyPdfViewState } from '../../src/pdf/pdfViewState';

describe('PdfViewState', () => {
	const el = document.createElement('div');

	afterEach(() => destroyPdfViewState(el));

	it('creates state on first access', () => {
		const state = getPdfViewState(el);
		expect(state.hoverOpenTimer).toBeNull();
		expect(state.hoverCloseTimer).toBeNull();
		expect(state.currentHoverMarkerId).toBeNull();
		expect(state.shapeHoverTimer).toBeNull();
		expect(state.currentHoverShapeId).toBeNull();
		expect(state.containerEl).toBe(el);
	});

	it('returns same state on subsequent access', () => {
		const a = getPdfViewState(el);
		const b = getPdfViewState(el);
		expect(a).toBe(b);
	});

	it('different elements get different states', () => {
		const el2 = document.createElement('div');
		const a = getPdfViewState(el);
		const b = getPdfViewState(el2);
		expect(a).not.toBe(b);
		destroyPdfViewState(el2);
	});

	it('destroy clears timers and prevents callbacks', () => {
		vi.useFakeTimers();
		const callback = vi.fn();
		const state = getPdfViewState(el);
		state.hoverOpenTimer = setTimeout(callback, 100);
		state.hoverCloseTimer = setTimeout(callback, 100);
		state.shapeHoverTimer = setTimeout(callback, 100);
		destroyPdfViewState(el);
		vi.advanceTimersByTime(200);
		expect(callback).not.toHaveBeenCalled();
		// After destroy, new access creates fresh state
		const fresh = getPdfViewState(el);
		expect(fresh.hoverOpenTimer).toBeNull();
		vi.useRealTimers();
	});
});
