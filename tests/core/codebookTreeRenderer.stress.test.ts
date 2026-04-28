/**
 * Stress tests for the codebook tree renderer.
 *
 * Goals:
 *  - Validate row recycling: scrolling should preserve DOM nodes for rows
 *    that stay visible, not destroy + recreate them every frame.
 *  - Detect performance regressions in initial render with 5000+ codes.
 *  - Verify cleanup when scrolling far (no leaked DOM nodes).
 *
 * Thresholds are generous — goal is regression detection, not hard limits.
 */

import { describe, it, expect, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { renderCodebookTree } from '../../src/core/codebookTreeRenderer';
import { createExpandedState } from '../../src/core/hierarchyHelpers';
import type { BaseMarker, SidebarModelInterface } from '../../src/core/types';

// ── Helpers ───────────────────────────────────────────────────

function makeStubModel(codeCount: number): SidebarModelInterface {
	const registry = new CodeDefinitionRegistry();
	for (let i = 0; i < codeCount; i++) {
		registry.create(`code_${String(i).padStart(5, '0')}`);
	}
	const markers: BaseMarker[] = [];
	return {
		registry,
		getAllMarkers: () => markers,
	} as unknown as SidebarModelInterface;
}

/** Create a host element with fake layout (clientHeight) and a mutable scrollTop. */
function makeHost(viewportHeight: number): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	// The scroll child is created inside renderCodebookTree; we stub layout
	// afterwards via querySelector.
	return container;
}

function stubLayout(scrollEl: HTMLElement, viewportHeight: number): void {
	Object.defineProperty(scrollEl, 'clientHeight', {
		configurable: true,
		get: () => viewportHeight,
	});
}

function setScroll(scrollEl: HTMLElement, px: number): void {
	Object.defineProperty(scrollEl, 'scrollTop', {
		configurable: true,
		get: () => px,
	});
	scrollEl.dispatchEvent(new Event('scroll'));
}

function makeCallbacks() {
	return {
		onCodeClick: vi.fn(),
		onCodeRightClick: vi.fn(),
		onToggleExpand: vi.fn(),
		onFolderToggleExpand: vi.fn(),
		onFolderRightClick: vi.fn(),
	};
}

// ── Tests ─────────────────────────────────────────────────────

describe('codebookTreeRenderer stress + recycling', () => {
	it('renders only visible rows with 5000 codes (not 5000 DOM nodes)', () => {
		const model = makeStubModel(5000);
		const container = makeHost(500);
		const state = { expanded: createExpandedState(), searchQuery: '', dragMode: 'reorganize' as const, selectedGroupId: null, selectedCodeIds: new Set<string>() };

		renderCodebookTree(container, model, state, makeCallbacks());

		const scrollEl = container.querySelector('.codebook-tree-scroll') as HTMLElement;
		stubLayout(scrollEl, 500);
		// Kick a scroll event so the renderer reads the stubbed clientHeight
		setScroll(scrollEl, 0);

		const spacer = scrollEl.querySelector('.codebook-tree-spacer') as HTMLElement;
		// Visible rows at scroll=0 with 500px viewport and 30px rows =
		// ~17 visible + 10 buffer = ~27 rows. Well under 5000.
		expect(spacer.children.length).toBeLessThan(50);
		expect(spacer.children.length).toBeGreaterThan(10);
	});

	it('initial render of 5000 codes runs under 300ms', () => {
		const model = makeStubModel(5000);
		const container = makeHost(500);
		const state = { expanded: createExpandedState(), searchQuery: '', dragMode: 'reorganize' as const, selectedGroupId: null, selectedCodeIds: new Set<string>() };

		const start = performance.now();
		renderCodebookTree(container, model, state, makeCallbacks());
		const ms = performance.now() - start;

		expect(ms).toBeLessThan(300);
	});

	it('recycles rows on small scrolls: overlapping rows keep the same DOM node', () => {
		const model = makeStubModel(5000);
		const container = makeHost(500);
		const state = { expanded: createExpandedState(), searchQuery: '', dragMode: 'reorganize' as const, selectedGroupId: null, selectedCodeIds: new Set<string>() };

		renderCodebookTree(container, model, state, makeCallbacks());
		const scrollEl = container.querySelector('.codebook-tree-scroll') as HTMLElement;
		stubLayout(scrollEl, 500);

		// First render at scroll=0
		setScroll(scrollEl, 0);
		const spacer = scrollEl.querySelector('.codebook-tree-spacer') as HTMLElement;
		// Snapshot which row elements exist for which indexes.
		const snapshotByIndex = new Map<number, Element>();
		for (const el of Array.from(spacer.children)) {
			const top = parseInt((el as HTMLElement).style.top);
			const idx = top / 30; // ROW_HEIGHT = 30
			snapshotByIndex.set(idx, el);
		}
		const snapshotSize = snapshotByIndex.size;
		expect(snapshotSize).toBeGreaterThan(10);

		// Scroll by a small amount — most indexes remain visible
		setScroll(scrollEl, 60); // 2 rows down

		let reusedCount = 0;
		let totalCurrent = 0;
		for (const el of Array.from(spacer.children)) {
			totalCurrent++;
			const top = parseInt((el as HTMLElement).style.top);
			const idx = top / 30;
			if (snapshotByIndex.get(idx) === el) reusedCount++;
		}

		// At least 80% of visible rows should be the SAME DOM element as before
		// (if the renderer recreated everything, reusedCount would be 0).
		expect(reusedCount / totalCurrent).toBeGreaterThan(0.8);
	});

	it('cleans up DOM nodes after a long-distance scroll (no leak)', () => {
		const model = makeStubModel(5000);
		const container = makeHost(500);
		const state = { expanded: createExpandedState(), searchQuery: '', dragMode: 'reorganize' as const, selectedGroupId: null, selectedCodeIds: new Set<string>() };

		renderCodebookTree(container, model, state, makeCallbacks());
		const scrollEl = container.querySelector('.codebook-tree-scroll') as HTMLElement;
		stubLayout(scrollEl, 500);

		// Jump to scroll position far away (code #2000 = 2000 * 30 = 60000px)
		setScroll(scrollEl, 60000);

		const spacer = scrollEl.querySelector('.codebook-tree-spacer') as HTMLElement;
		// Still only ~30 rows visible, not accumulating.
		expect(spacer.children.length).toBeLessThan(50);
	});

	it('handles rapid sequential scrolls without accumulating rows', () => {
		const model = makeStubModel(5000);
		const container = makeHost(500);
		const state = { expanded: createExpandedState(), searchQuery: '', dragMode: 'reorganize' as const, selectedGroupId: null, selectedCodeIds: new Set<string>() };

		renderCodebookTree(container, model, state, makeCallbacks());
		const scrollEl = container.querySelector('.codebook-tree-scroll') as HTMLElement;
		stubLayout(scrollEl, 500);

		const start = performance.now();
		for (let scrollPx = 0; scrollPx < 3000; scrollPx += 30) {
			setScroll(scrollEl, scrollPx);
		}
		const ms = performance.now() - start;

		const spacer = scrollEl.querySelector('.codebook-tree-spacer') as HTMLElement;
		expect(spacer.children.length).toBeLessThan(50);
		expect(ms).toBeLessThan(500); // 100 scroll events in under 500ms
	});
});
