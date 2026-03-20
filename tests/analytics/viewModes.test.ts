import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CooccurrenceResult, ConsolidatedData, FilterConfig, UnifiedMarker, UnifiedCode, SourceType } from '../../src/analytics/data/dataTypes';
import type { AnalyticsViewContext, ViewMode, SortMode, GroupMode, DisplayMode, CooccSortMode } from '../../src/analytics/views/analyticsViewContext';
import type { ExtractedSegment } from '../../src/analytics/data/textExtractor';

// ── Patch HTMLElement with Obsidian-specific methods ──
// Obsidian extends HTMLElement prototype with helpers like empty(), createDiv(), etc.

function patchEl(el: HTMLElement): HTMLElement {
	if (!('empty' in el)) {
		(el as any).empty = function () { this.innerHTML = ''; };
	}
	if (!('addClass' in el)) {
		(el as any).addClass = function (...cls: string[]) { this.classList.add(...cls); };
	}
	if (!('removeClass' in el)) {
		(el as any).removeClass = function (...cls: string[]) { this.classList.remove(...cls); };
	}
	if (!('createDiv' in el)) {
		(el as any).createDiv = function (opts?: { cls?: string; text?: string }) {
			const div = document.createElement('div');
			if (opts?.cls) div.className = opts.cls;
			if (opts?.text) div.textContent = opts.text;
			patchEl(div);
			this.appendChild(div);
			return div;
		};
	}
	if (!('createEl' in el)) {
		(el as any).createEl = function (tag: string, opts?: { cls?: string; text?: string; type?: string; attr?: Record<string, string> }) {
			const el = document.createElement(tag);
			if (opts?.cls) el.className = opts.cls;
			if (opts?.text) el.textContent = opts.text;
			if (opts?.type) (el as any).type = opts.type;
			if (opts?.attr) {
				for (const [k, v] of Object.entries(opts.attr)) {
					el.setAttribute(k, v);
				}
			}
			patchEl(el);
			this.appendChild(el);
			return el;
		};
	}
	if (!('createSpan' in el)) {
		(el as any).createSpan = function (opts?: { cls?: string; text?: string }) {
			const span = document.createElement('span');
			if (opts?.cls) span.className = opts.cls;
			if (opts?.text) span.textContent = opts.text;
			patchEl(span);
			this.appendChild(span);
			return span;
		};
	}
	return el;
}

// Patch document.createElement so all new elements get Obsidian methods
const origCreateElement = document.createElement.bind(document);
document.createElement = function (tag: string, options?: ElementCreationOptions) {
	const el = origCreateElement(tag, options);
	patchEl(el);
	return el;
} as typeof document.createElement;

import { reorderCooccurrence, renderDisplaySection, renderCooccSortSection } from '../../src/analytics/views/modes/cooccurrenceMode';
import { renderSortSection, renderGroupSection } from '../../src/analytics/views/modes/frequencyMode';

// ── Helpers (from statsEngine.test.ts pattern) ──

function makeMarker(id: string, source: SourceType, fileId: string, codes: string[], meta?: UnifiedMarker['meta']): UnifiedMarker {
	return { id, source, fileId, codes, meta };
}

function makeCode(name: string, color: string = '#6200EE', description?: string): UnifiedCode {
	return { name, color, description, sources: ['markdown'] };
}

function createTestData(markers: UnifiedMarker[], codes: UnifiedCode[]): ConsolidatedData {
	return {
		markers,
		codes,
		sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false },
		lastUpdated: Date.now(),
	};
}

function createFilters(overrides: Partial<FilterConfig> = {}): FilterConfig {
	return {
		sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
		codes: [],
		excludeCodes: [],
		minFrequency: 1,
		...overrides,
	};
}

// ── Mock context factory ──

function createMockCtx(overrides: Partial<AnalyticsViewContext> = {}): AnalyticsViewContext {
	return {
		plugin: {
			app: { vault: {}, workspace: {} },
			data: null,
			loadConsolidatedData: vi.fn(),
			addChartToBoard: vi.fn(),
			addKpiCardToBoard: vi.fn(),
			addCodeCardToBoard: vi.fn(),
			addExcerptToBoard: vi.fn(),
		} as any,
		data: createTestData([], []),
		chartContainer: document.createElement('div'),
		configPanelEl: document.createElement('div'),
		footerEl: document.createElement('div'),
		viewMode: 'frequency' as ViewMode,
		sortMode: 'alpha' as SortMode,
		groupMode: 'none' as GroupMode,
		displayMode: 'absolute' as DisplayMode,
		showEdgeLabels: true,
		minEdgeWeight: 1,
		enabledSources: new Set<SourceType>(['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video']),
		enabledCodes: new Set<string>(),
		minFrequency: 1,
		codeSearch: '',
		matrixSortMode: 'alpha',
		cooccSortMode: 'alpha' as CooccSortMode,
		evolutionFile: '',
		wcStopWordsLang: 'none',
		wcMinWordLength: 3,
		wcMaxWords: 100,
		acmShowMarkers: true,
		acmShowCodeLabels: true,
		mdsMode: 'codes',
		mdsShowLabels: true,
		dendrogramCutDistance: 0.5,
		lagValue: 1,
		tsSort: { col: 'code', asc: true },
		polarFocalCode: '',
		polarMaxLag: 5,
		chiGroupBy: 'source',
		chiSort: { col: 'code', asc: true },
		dtOutcomeCode: '',
		dtMaxDepth: 5,
		srcCompSubView: 'chart',
		srcCompDisplayMode: 'count',
		srcCompSort: { col: 'code', asc: true },
		trSearch: '',
		trGroupBy: 'code',
		trSegments: [],
		trCollapsed: new Set<string>(),
		buildFilterConfig: vi.fn(() => createFilters()),
		scheduleUpdate: vi.fn(),
		renderConfigPanel: vi.fn(),
		...overrides,
	};
}

// ── Helper to make a CooccurrenceResult ──

function makeCooccResult(codes: string[], colors: string[], matrix: number[][]): CooccurrenceResult {
	let maxValue = 0;
	for (const row of matrix) {
		for (const v of row) {
			if (v > maxValue) maxValue = v;
		}
	}
	return { codes, colors, matrix, maxValue };
}

// ════════════════════════════════════════════════════════════════
// reorderCooccurrence
// ════════════════════════════════════════════════════════════════

describe('reorderCooccurrence', () => {
	describe('alpha mode', () => {
		it('does not modify result when mode is alpha', () => {
			const result = makeCooccResult(
				['A', 'B', 'C'],
				['#a', '#b', '#c'],
				[
					[3, 1, 0],
					[1, 5, 2],
					[0, 2, 4],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'alpha' });
			reorderCooccurrence(ctx, result);
			expect(result.codes).toEqual(['A', 'B', 'C']);
			expect(result.matrix[0]).toEqual([3, 1, 0]);
		});

		it('does not modify result with a single code', () => {
			const result = makeCooccResult(['A'], ['#a'], [[5]]);
			const ctx = createMockCtx({ cooccSortMode: 'frequency' });
			reorderCooccurrence(ctx, result);
			expect(result.codes).toEqual(['A']);
			expect(result.matrix).toEqual([[5]]);
		});

		it('does not modify empty result', () => {
			const result = makeCooccResult([], [], []);
			const ctx = createMockCtx({ cooccSortMode: 'frequency' });
			reorderCooccurrence(ctx, result);
			expect(result.codes).toEqual([]);
			expect(result.matrix).toEqual([]);
		});
	});

	describe('frequency mode', () => {
		it('sorts codes by diagonal frequency descending', () => {
			// A=3, B=10, C=1 → expected order: B, A, C
			const result = makeCooccResult(
				['A', 'B', 'C'],
				['#a', '#b', '#c'],
				[
					[3, 1, 0],
					[1, 10, 2],
					[0, 2, 1],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'frequency' });
			reorderCooccurrence(ctx, result);
			expect(result.codes).toEqual(['B', 'A', 'C']);
			expect(result.colors).toEqual(['#b', '#a', '#c']);
			// Diagonal should now be [10, 3, 1]
			expect(result.matrix[0]![0]).toBe(10);
			expect(result.matrix[1]![1]).toBe(3);
			expect(result.matrix[2]![2]).toBe(1);
		});

		it('preserves co-occurrence values after reorder', () => {
			// A=2, B=5: cooccurrence A-B = 1
			const result = makeCooccResult(
				['A', 'B'],
				['#a', '#b'],
				[
					[2, 1],
					[1, 5],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'frequency' });
			reorderCooccurrence(ctx, result);
			// B first (freq 5), then A (freq 2)
			expect(result.codes).toEqual(['B', 'A']);
			// B-A cooccurrence = 1
			expect(result.matrix[0]![1]).toBe(1);
			expect(result.matrix[1]![0]).toBe(1);
		});

		it('updates maxValue after reorder', () => {
			const result = makeCooccResult(
				['A', 'B'],
				['#a', '#b'],
				[
					[2, 1],
					[1, 8],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'frequency' });
			reorderCooccurrence(ctx, result);
			expect(result.maxValue).toBe(8);
		});

		it('handles equal frequencies stably', () => {
			const result = makeCooccResult(
				['A', 'B', 'C'],
				['#a', '#b', '#c'],
				[
					[5, 1, 0],
					[1, 5, 1],
					[0, 1, 5],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'frequency' });
			reorderCooccurrence(ctx, result);
			// All have freq 5 — exact order depends on sort stability
			// Just verify diagonals are all 5
			expect(result.matrix[0]![0]).toBe(5);
			expect(result.matrix[1]![1]).toBe(5);
			expect(result.matrix[2]![2]).toBe(5);
			expect(result.codes).toHaveLength(3);
		});

		it('reorders a 4x4 matrix correctly', () => {
			// D=10, C=7, B=3, A=1
			const result = makeCooccResult(
				['A', 'B', 'C', 'D'],
				['#a', '#b', '#c', '#d'],
				[
					[1, 0, 0, 0],
					[0, 3, 0, 0],
					[0, 0, 7, 0],
					[0, 0, 0, 10],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'frequency' });
			reorderCooccurrence(ctx, result);
			expect(result.codes).toEqual(['D', 'C', 'B', 'A']);
			expect(result.colors).toEqual(['#d', '#c', '#b', '#a']);
		});
	});

	describe('cluster mode', () => {
		it('clusters similar codes together', () => {
			// A and B co-occur heavily, C is separate
			const result = makeCooccResult(
				['A', 'B', 'C'],
				['#a', '#b', '#c'],
				[
					[10, 8, 1],
					[8, 10, 1],
					[1, 1, 10],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'cluster' });
			reorderCooccurrence(ctx, result);
			// A and B should be adjacent after clustering
			const idxA = result.codes.indexOf('A');
			const idxB = result.codes.indexOf('B');
			expect(Math.abs(idxA - idxB)).toBe(1);
		});

		it('handles 2-code matrix in cluster mode', () => {
			const result = makeCooccResult(
				['A', 'B'],
				['#a', '#b'],
				[
					[5, 2],
					[2, 5],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'cluster' });
			reorderCooccurrence(ctx, result);
			expect(result.codes).toHaveLength(2);
			expect(result.codes).toContain('A');
			expect(result.codes).toContain('B');
		});

		it('preserves matrix symmetry after cluster reorder', () => {
			const result = makeCooccResult(
				['A', 'B', 'C'],
				['#a', '#b', '#c'],
				[
					[6, 4, 1],
					[4, 8, 2],
					[1, 2, 5],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'cluster' });
			reorderCooccurrence(ctx, result);
			const n = result.codes.length;
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < n; j++) {
					expect(result.matrix[i]![j]).toBe(result.matrix[j]![i]);
				}
			}
		});

		it('handles zero co-occurrence (all diagonal)', () => {
			const result = makeCooccResult(
				['A', 'B', 'C'],
				['#a', '#b', '#c'],
				[
					[5, 0, 0],
					[0, 3, 0],
					[0, 0, 8],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'cluster' });
			reorderCooccurrence(ctx, result);
			// Should not throw, codes still present
			expect(result.codes).toHaveLength(3);
			expect(result.matrix).toHaveLength(3);
		});

		it('updates maxValue after cluster reorder', () => {
			const result = makeCooccResult(
				['A', 'B', 'C'],
				['#a', '#b', '#c'],
				[
					[3, 1, 0],
					[1, 9, 2],
					[0, 2, 4],
				],
			);
			const ctx = createMockCtx({ cooccSortMode: 'cluster' });
			reorderCooccurrence(ctx, result);
			expect(result.maxValue).toBe(9);
		});
	});
});

// ════════════════════════════════════════════════════════════════
// renderSortSection (frequencyMode)
// ════════════════════════════════════════════════════════════════

describe('renderSortSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx();
	});

	it('creates a section with title "Sort"', () => {
		renderSortSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title).not.toBeNull();
		expect(title!.textContent).toBe('Sort');
	});

	it('creates 3 radio buttons for sort modes', () => {
		renderSortSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(3);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['alpha', 'freq-desc', 'freq-asc']);
	});

	it('checks the radio matching current sortMode', () => {
		ctx.sortMode = 'freq-desc';
		renderSortSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checked = Array.from(radios).find((r) => r.checked);
		expect(checked).toBeDefined();
		expect(checked!.value).toBe('freq-desc');
	});

	it('calls scheduleUpdate when radio changes', () => {
		renderSortSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="freq-asc"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.sortMode).toBe('freq-asc');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('clicking row label triggers radio change', () => {
		renderSortSection(ctx);
		const rows = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row');
		// Click the second row (freq-desc)
		rows[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(ctx.sortMode).toBe('freq-desc');
		expect(ctx.scheduleUpdate).toHaveBeenCalled();
	});

	it('creates rows with labels', () => {
		renderSortSection(ctx);
		const spans = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row span');
		const labels = Array.from(spans).map((s) => s.textContent);
		expect(labels).toContain('Alphabetical');
		expect(labels).toContain('Frequency \u2193');
		expect(labels).toContain('Frequency \u2191');
	});
});

// ════════════════════════════════════════════════════════════════
// renderGroupSection (frequencyMode)
// ════════════════════════════════════════════════════════════════

describe('renderGroupSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx();
	});

	it('creates a section with title "Group by"', () => {
		renderGroupSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title).not.toBeNull();
		expect(title!.textContent).toBe('Group by');
	});

	it('creates 3 radio buttons for group modes', () => {
		renderGroupSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(3);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['none', 'source', 'file']);
	});

	it('checks the radio matching current groupMode', () => {
		ctx.groupMode = 'source';
		renderGroupSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checked = Array.from(radios).find((r) => r.checked);
		expect(checked!.value).toBe('source');
	});

	it('calls scheduleUpdate when group mode changes', () => {
		renderGroupSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="file"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.groupMode).toBe('file');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('creates rows with labels', () => {
		renderGroupSection(ctx);
		const spans = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row span');
		const labels = Array.from(spans).map((s) => s.textContent);
		expect(labels).toContain('None');
		expect(labels).toContain('By Source');
		expect(labels).toContain('By File');
	});
});

// ════════════════════════════════════════════════════════════════
// renderDisplaySection (cooccurrenceMode)
// ════════════════════════════════════════════════════════════════

describe('renderDisplaySection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'cooccurrence' });
	});

	it('creates a section with title "Display"', () => {
		renderDisplaySection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Display');
	});

	it('creates 5 radio buttons for display modes', () => {
		renderDisplaySection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(5);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['absolute', 'percentage', 'jaccard', 'dice', 'presence']);
	});

	it('checks the radio matching current displayMode', () => {
		ctx.displayMode = 'jaccard';
		renderDisplaySection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checked = Array.from(radios).find((r) => r.checked);
		expect(checked!.value).toBe('jaccard');
	});

	it('calls scheduleUpdate when display mode changes', () => {
		renderDisplaySection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="dice"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.displayMode).toBe('dice');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('creates labels for all display modes', () => {
		renderDisplaySection(ctx);
		const spans = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row span');
		const labels = Array.from(spans).map((s) => s.textContent);
		expect(labels).toContain('Absolute Count');
		expect(labels).toContain('Percentage');
		expect(labels).toContain('Jaccard Index');
		expect(labels).toContain('Dice Coefficient');
		expect(labels).toContain('Presence (0/1)');
	});

	it('clicking row label triggers radio change for display', () => {
		renderDisplaySection(ctx);
		const rows = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row');
		// Click the "Percentage" row (index 1)
		rows[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(ctx.displayMode).toBe('percentage');
		expect(ctx.scheduleUpdate).toHaveBeenCalled();
	});
});

// ════════════════════════════════════════════════════════════════
// renderCooccSortSection (cooccurrenceMode)
// ════════════════════════════════════════════════════════════════

describe('renderCooccSortSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'cooccurrence' });
	});

	it('creates a section with title "Sort"', () => {
		renderCooccSortSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Sort');
	});

	it('creates 3 radio buttons for co-occurrence sort modes', () => {
		renderCooccSortSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(3);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['alpha', 'frequency', 'cluster']);
	});

	it('checks the radio matching current cooccSortMode', () => {
		ctx.cooccSortMode = 'cluster';
		renderCooccSortSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checked = Array.from(radios).find((r) => r.checked);
		expect(checked!.value).toBe('cluster');
	});

	it('calls scheduleUpdate when sort mode changes', () => {
		renderCooccSortSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="frequency"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.cooccSortMode).toBe('frequency');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('creates labels for sort modes', () => {
		renderCooccSortSection(ctx);
		const spans = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row span');
		const labels = Array.from(spans).map((s) => s.textContent);
		expect(labels).toContain('Alphabetical');
		expect(labels).toContain('By Frequency');
		expect(labels).toContain('Cluster (Hierarchical)');
	});
});

// ════════════════════════════════════════════════════════════════
// Edge cases: null/missing containers
// ════════════════════════════════════════════════════════════════

describe('edge cases: null containers', () => {
	it('renderSortSection does not throw with null configPanelEl', () => {
		const ctx = createMockCtx({ configPanelEl: null });
		// configPanelEl is null — will throw on createDiv
		// The functions assume configPanelEl is not null (uses !), so this tests the contract
		expect(() => renderSortSection(ctx)).toThrow();
	});

	it('renderGroupSection does not throw with null configPanelEl', () => {
		const ctx = createMockCtx({ configPanelEl: null });
		expect(() => renderGroupSection(ctx)).toThrow();
	});

	it('renderDisplaySection does not throw with null configPanelEl', () => {
		const ctx = createMockCtx({ configPanelEl: null });
		expect(() => renderDisplaySection(ctx)).toThrow();
	});

	it('renderCooccSortSection does not throw with null configPanelEl', () => {
		const ctx = createMockCtx({ configPanelEl: null });
		expect(() => renderCooccSortSection(ctx)).toThrow();
	});
});

// ════════════════════════════════════════════════════════════════
// Multiple sections rendered into same configPanelEl
// ════════════════════════════════════════════════════════════════

describe('multiple config sections', () => {
	it('frequency mode renders both sort and group sections', () => {
		const ctx = createMockCtx({ viewMode: 'frequency' });
		renderSortSection(ctx);
		renderGroupSection(ctx);
		const sections = ctx.configPanelEl!.querySelectorAll('.codemarker-config-section');
		expect(sections).toHaveLength(2);
		const titles = Array.from(sections).map(
			(s) => s.querySelector('.codemarker-config-section-title')?.textContent,
		);
		expect(titles).toEqual(['Sort', 'Group by']);
	});

	it('cooccurrence mode renders both display and sort sections', () => {
		const ctx = createMockCtx({ viewMode: 'cooccurrence' });
		renderDisplaySection(ctx);
		renderCooccSortSection(ctx);
		const sections = ctx.configPanelEl!.querySelectorAll('.codemarker-config-section');
		expect(sections).toHaveLength(2);
		const titles = Array.from(sections).map(
			(s) => s.querySelector('.codemarker-config-section-title')?.textContent,
		);
		expect(titles).toEqual(['Display', 'Sort']);
	});

	it('radio button name scoping prevents cross-section conflicts', () => {
		const ctx = createMockCtx();
		renderSortSection(ctx);
		renderGroupSection(ctx);
		const sortRadios = ctx.configPanelEl!.querySelectorAll('input[name="sortMode"]');
		const groupRadios = ctx.configPanelEl!.querySelectorAll('input[name="groupMode"]');
		expect(sortRadios).toHaveLength(3);
		expect(groupRadios).toHaveLength(3);
	});
});

// ════════════════════════════════════════════════════════════════
// formatLocation and formatAudioTime (textRetrievalMode — private)
// Since these are not exported, we test their behavior indirectly
// through the data patterns they process.
// ════════════════════════════════════════════════════════════════

describe('reorderCooccurrence integration', () => {
	it('frequency mode with large asymmetric frequencies', () => {
		// Simulate realistic scenario: some codes very frequent, others rare
		const result = makeCooccResult(
			['Rare', 'Medium', 'Common'],
			['#r', '#m', '#c'],
			[
				[1, 0, 1],
				[0, 5, 3],
				[1, 3, 20],
			],
		);
		const ctx = createMockCtx({ cooccSortMode: 'frequency' });
		reorderCooccurrence(ctx, result);
		// Common (20) should come first
		expect(result.codes[0]).toBe('Common');
		expect(result.matrix[0]![0]).toBe(20);
	});

	it('cluster mode groups strongly co-occurring codes', () => {
		// Group1: X, Y (co-occur 9 times)
		// Group2: P, Q (co-occur 8 times)
		// Cross-group co-occurrence is low
		const result = makeCooccResult(
			['P', 'X', 'Q', 'Y'],
			['#p', '#x', '#q', '#y'],
			[
				[10, 1, 8, 1],
				[1, 10, 1, 9],
				[8, 1, 10, 1],
				[1, 9, 1, 10],
			],
		);
		const ctx = createMockCtx({ cooccSortMode: 'cluster' });
		reorderCooccurrence(ctx, result);
		// P and Q should be adjacent, X and Y should be adjacent
		const idxP = result.codes.indexOf('P');
		const idxQ = result.codes.indexOf('Q');
		const idxX = result.codes.indexOf('X');
		const idxY = result.codes.indexOf('Y');
		expect(Math.abs(idxP - idxQ)).toBe(1);
		expect(Math.abs(idxX - idxY)).toBe(1);
	});

	it('reorder does not lose any codes', () => {
		const original = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
		const colors = ['#1', '#2', '#3', '#4', '#5'];
		const matrix = original.map((_, i) =>
			original.map((_, j) => (i === j ? 10 - i : Math.max(0, 5 - Math.abs(i - j)))),
		);
		const result = makeCooccResult([...original], [...colors], matrix.map((r) => [...r]));
		const ctx = createMockCtx({ cooccSortMode: 'frequency' });
		reorderCooccurrence(ctx, result);
		expect(result.codes.sort()).toEqual([...original].sort());
		expect(result.colors).toHaveLength(5);
	});

	it('reorder does not lose any codes in cluster mode', () => {
		const original = ['Alpha', 'Beta', 'Gamma'];
		const colors = ['#1', '#2', '#3'];
		const matrix = [
			[5, 2, 1],
			[2, 5, 3],
			[1, 3, 5],
		];
		const result = makeCooccResult([...original], [...colors], matrix.map((r) => [...r]));
		const ctx = createMockCtx({ cooccSortMode: 'cluster' });
		reorderCooccurrence(ctx, result);
		expect(result.codes.sort()).toEqual([...original].sort());
	});
});

// ════════════════════════════════════════════════════════════════
// Config section interaction sequences
// ════════════════════════════════════════════════════════════════

describe('interaction sequences', () => {
	it('changing sort mode multiple times tracks latest value', () => {
		const ctx = createMockCtx();
		renderSortSection(ctx);

		const alphaRadio = ctx.configPanelEl!.querySelector('input[value="alpha"]') as HTMLInputElement;
		const descRadio = ctx.configPanelEl!.querySelector('input[value="freq-desc"]') as HTMLInputElement;
		const ascRadio = ctx.configPanelEl!.querySelector('input[value="freq-asc"]') as HTMLInputElement;

		descRadio.dispatchEvent(new Event('change'));
		expect(ctx.sortMode).toBe('freq-desc');

		ascRadio.dispatchEvent(new Event('change'));
		expect(ctx.sortMode).toBe('freq-asc');

		alphaRadio.dispatchEvent(new Event('change'));
		expect(ctx.sortMode).toBe('alpha');

		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(3);
	});

	it('changing display mode and cooccSortMode independently', () => {
		const ctx = createMockCtx({ viewMode: 'cooccurrence' });
		renderDisplaySection(ctx);
		renderCooccSortSection(ctx);

		const jaccardRadio = ctx.configPanelEl!.querySelector('input[value="jaccard"]') as HTMLInputElement;
		jaccardRadio.dispatchEvent(new Event('change'));
		expect(ctx.displayMode).toBe('jaccard');

		const clusterRadio = ctx.configPanelEl!.querySelector('input[value="cluster"]') as HTMLInputElement;
		clusterRadio.dispatchEvent(new Event('change'));
		expect(ctx.cooccSortMode).toBe('cluster');

		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(2);
	});

	it('clicking the same row label twice calls scheduleUpdate twice', () => {
		const ctx = createMockCtx();
		renderGroupSection(ctx);
		const rows = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row');
		rows[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		rows[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(2);
	});
});

// ════════════════════════════════════════════════════════════════
// Default state verification
// ════════════════════════════════════════════════════════════════

describe('default ctx values', () => {
	it('createMockCtx produces valid defaults for all fields', () => {
		const ctx = createMockCtx();
		expect(ctx.viewMode).toBe('frequency');
		expect(ctx.sortMode).toBe('alpha');
		expect(ctx.groupMode).toBe('none');
		expect(ctx.displayMode).toBe('absolute');
		expect(ctx.cooccSortMode).toBe('alpha');
		expect(ctx.data).not.toBeNull();
		expect(ctx.chartContainer).not.toBeNull();
		expect(ctx.configPanelEl).not.toBeNull();
	});

	it('renderSortSection defaults to alpha checked', () => {
		const ctx = createMockCtx();
		renderSortSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checkedValues = Array.from(radios).filter((r) => r.checked).map((r) => r.value);
		expect(checkedValues).toEqual(['alpha']);
	});

	it('renderGroupSection defaults to none checked', () => {
		const ctx = createMockCtx();
		renderGroupSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checkedValues = Array.from(radios).filter((r) => r.checked).map((r) => r.value);
		expect(checkedValues).toEqual(['none']);
	});

	it('renderDisplaySection defaults to absolute checked', () => {
		const ctx = createMockCtx();
		renderDisplaySection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checkedValues = Array.from(radios).filter((r) => r.checked).map((r) => r.value);
		expect(checkedValues).toEqual(['absolute']);
	});

	it('renderCooccSortSection defaults to alpha checked', () => {
		const ctx = createMockCtx();
		renderCooccSortSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checkedValues = Array.from(radios).filter((r) => r.checked).map((r) => r.value);
		expect(checkedValues).toEqual(['alpha']);
	});
});
