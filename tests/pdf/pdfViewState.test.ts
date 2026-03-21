import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPdfViewState, destroyPdfViewState } from '../../src/pdf/pdfViewState';
import { cancelHoverPopover, startHoverCloseTimer, cancelHoverCloseTimer, HOVER_CLOSE_DELAY } from '../../src/pdf/highlightRenderer';

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

describe('cancelHoverPopover(state)', () => {
	it('clears pending hoverOpenTimer', () => {
		vi.useFakeTimers();
		const el = document.createElement('div');
		const state = getPdfViewState(el);
		const callback = vi.fn();
		state.hoverOpenTimer = setTimeout(callback, 500);

		cancelHoverPopover(state);

		expect(state.hoverOpenTimer).toBeNull();
		vi.advanceTimersByTime(600);
		expect(callback).not.toHaveBeenCalled();
		destroyPdfViewState(el);
		vi.useRealTimers();
	});

	it('no-ops when hoverOpenTimer is null', () => {
		const el = document.createElement('div');
		const state = getPdfViewState(el);
		expect(() => cancelHoverPopover(state)).not.toThrow();
		expect(state.hoverOpenTimer).toBeNull();
		destroyPdfViewState(el);
	});
});

describe('startHoverCloseTimer(state, closeFn)', () => {
	it('calls closeFn after HOVER_CLOSE_DELAY and resets state', () => {
		vi.useFakeTimers();
		const el = document.createElement('div');
		const state = getPdfViewState(el);
		state.currentHoverMarkerId = 'marker-1';
		const closeFn = vi.fn();

		startHoverCloseTimer(state, closeFn);

		expect(state.hoverCloseTimer).not.toBeNull();
		expect(closeFn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(HOVER_CLOSE_DELAY);

		expect(closeFn).toHaveBeenCalledOnce();
		expect(state.currentHoverMarkerId).toBeNull();
		expect(state.hoverCloseTimer).toBeNull();
		destroyPdfViewState(el);
		vi.useRealTimers();
	});

	it('replaces previous close timer', () => {
		vi.useFakeTimers();
		const el = document.createElement('div');
		const state = getPdfViewState(el);
		const firstClose = vi.fn();
		const secondClose = vi.fn();

		startHoverCloseTimer(state, firstClose);
		startHoverCloseTimer(state, secondClose);

		vi.advanceTimersByTime(HOVER_CLOSE_DELAY);

		expect(firstClose).not.toHaveBeenCalled();
		expect(secondClose).toHaveBeenCalledOnce();
		destroyPdfViewState(el);
		vi.useRealTimers();
	});
});

describe('cancelHoverCloseTimer(state)', () => {
	it('cancels pending close timer', () => {
		vi.useFakeTimers();
		const el = document.createElement('div');
		const state = getPdfViewState(el);
		const closeFn = vi.fn();

		startHoverCloseTimer(state, closeFn);
		cancelHoverCloseTimer(state);

		expect(state.hoverCloseTimer).toBeNull();
		vi.advanceTimersByTime(HOVER_CLOSE_DELAY + 100);
		expect(closeFn).not.toHaveBeenCalled();
		destroyPdfViewState(el);
		vi.useRealTimers();
	});

	it('no-ops when hoverCloseTimer is null', () => {
		const el = document.createElement('div');
		const state = getPdfViewState(el);
		expect(() => cancelHoverCloseTimer(state)).not.toThrow();
		expect(state.hoverCloseTimer).toBeNull();
		destroyPdfViewState(el);
	});
});

describe('scoped popover query isolation', () => {
	it('containerEl.querySelector finds only popovers within its own container', () => {
		const container1 = document.createElement('div');
		const container2 = document.createElement('div');
		document.body.appendChild(container1);
		document.body.appendChild(container2);

		const popover1 = document.createElement('div');
		popover1.className = 'codemarker-popover';
		popover1.textContent = 'Popover A';
		container1.appendChild(popover1);

		const popover2 = document.createElement('div');
		popover2.className = 'codemarker-popover';
		popover2.textContent = 'Popover B';
		container2.appendChild(popover2);

		const state1 = getPdfViewState(container1);
		const state2 = getPdfViewState(container2);

		const found1 = state1.containerEl.querySelector('.codemarker-popover') as HTMLElement;
		const found2 = state2.containerEl.querySelector('.codemarker-popover') as HTMLElement;

		expect(found1).toBe(popover1);
		expect(found2).toBe(popover2);
		expect(found1).not.toBe(found2);

		// Cleanup
		container1.remove();
		container2.remove();
		destroyPdfViewState(container1);
		destroyPdfViewState(container2);
	});
});
