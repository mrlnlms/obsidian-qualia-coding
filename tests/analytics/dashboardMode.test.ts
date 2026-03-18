import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('obsidian', () => ({
	Notice: vi.fn(),
	setIcon: vi.fn(),
}));

vi.mock('../../src/analytics/data/statsEngine', () => ({
	calculateFrequency: vi.fn(() => []),
	calculateCooccurrence: vi.fn(() => ({ codes: [], colors: [], matrix: [], maxValue: 0 })),
	calculateDocumentCodeMatrix: vi.fn(() => ({ files: [], codes: [], colors: [], matrix: [], maxValue: 0 })),
	calculateEvolution: vi.fn(() => ({ codes: [], colors: [], points: [], files: [] })),
	calculateLagSequential: vi.fn(() => ({ codes: [], colors: [], lag: 1, transitions: [], expected: [], zScores: [], totalTransitions: 0 })),
	calculateOverlap: vi.fn(() => ({ codes: [], colors: [], matrix: [], maxValue: 0 })),
	calculateTemporal: vi.fn(() => ({ codes: [], colors: [], series: [], dateRange: [0, 0] })),
}));

// ── Patch HTMLElement with Obsidian-specific DOM helpers ─────────────
// Obsidian extends HTMLElement prototype with createDiv(), createEl(), etc.

function patchEl(el: HTMLElement): HTMLElement {
	if (!('empty' in el)) {
		(el as any).empty = function () { this.innerHTML = ''; };
	}
	if (!('addClass' in el)) {
		(el as any).addClass = function (...cls: string[]) { this.classList.add(...cls); };
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
			const child = document.createElement(tag);
			if (opts?.cls) child.className = opts.cls;
			if (opts?.text) child.textContent = opts.text;
			if (opts?.type) (child as any).type = opts.type;
			if (opts?.attr) {
				for (const [k, v] of Object.entries(opts.attr)) {
					child.setAttribute(k, v);
				}
			}
			patchEl(child);
			this.appendChild(child);
			return child;
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

// Patch document.createElement so all new elements have these methods
const origCreateElement = document.createElement.bind(document);
document.createElement = function (tag: string, options?: ElementCreationOptions) {
	const el = origCreateElement(tag, options);
	patchEl(el);
	return el;
} as typeof document.createElement;

// ── Imports ─────────────────────────────────────────────────────────

import { renderDashboard } from '../../src/analytics/views/modes/dashboardMode';
import type { AnalyticsViewContext } from '../../src/analytics/views/analyticsViewContext';
import type { ConsolidatedData, FilterConfig } from '../../src/analytics/data/dataTypes';

// ── Helpers ─────────────────────────────────────────────────────────

function makeSources(overrides: Partial<ConsolidatedData['sources']> = {}): ConsolidatedData['sources'] {
	return {
		markdown: false,
		csv: false,
		image: false,
		pdf: false,
		audio: false,
		video: false,
		...overrides,
	};
}

function makeData(sourcesOverrides: Partial<ConsolidatedData['sources']> = {}): ConsolidatedData {
	return {
		markers: [],
		codes: [],
		sources: makeSources(sourcesOverrides),
		lastUpdated: 0,
	};
}

function makeCtx(data: ConsolidatedData): AnalyticsViewContext {
	const container = document.createElement('div');
	return {
		plugin: {
			addKpiCardToBoard: vi.fn(),
		} as any,
		data,
		chartContainer: container,
		configPanelEl: null,
		footerEl: null,
		viewMode: 'dashboard',
		sortMode: 'alpha',
		groupMode: 'none',
		displayMode: 'absolute',
		showEdgeLabels: false,
		minEdgeWeight: 0,
		enabledSources: new Set(),
		enabledCodes: new Set(),
		minFrequency: 1,
		codeSearch: '',
		matrixSortMode: 'alpha',
		cooccSortMode: 'alpha',
		evolutionFile: '',
		wcStopWordsLang: 'en',
		wcMinWordLength: 3,
		wcMaxWords: 50,
		acmShowMarkers: false,
		acmShowCodeLabels: false,
		mdsMode: 'classic',
		mdsShowLabels: false,
		dendrogramMode: 'codes',
		dendrogramCutDistance: 0.5,
		lagValue: 1,
		tsSort: { col: 'code', asc: true },
		polarFocalCode: '',
		polarMaxLag: 3,
		chiGroupBy: 'source',
		chiSort: { col: 'code', asc: true },
		dtOutcomeCode: '',
		dtMaxDepth: 3,
		srcCompSubView: 'chart',
		srcCompDisplayMode: 'count',
		srcCompSort: { col: 'code', asc: true },
		trSearch: '',
		trGroupBy: 'code',
		trSegments: [],
		trCollapsed: new Set(),
		buildFilterConfig: () => ({
			sources: [],
			codes: [],
			excludeCodes: [],
			minFrequency: 1,
		}),
		scheduleUpdate: vi.fn(),
		renderConfigPanel: vi.fn(),
	};
}

const defaultFilters: FilterConfig = {
	sources: [],
	codes: [],
	excludeCodes: [],
	minFrequency: 1,
};

// ── Helper to extract KPI value by label ────────────────────────────

function getKpiValue(container: HTMLElement, label: string): string | null {
	const cards = container.querySelectorAll('.codemarker-kpi-card');
	for (const card of Array.from(cards)) {
		const labelEl = card.querySelector('.codemarker-kpi-label');
		if (labelEl?.textContent === label) {
			return card.querySelector('.codemarker-kpi-value')?.textContent ?? null;
		}
	}
	return null;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('renderDashboard — Active Sources KPI', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows "6" when all 6 sources are active', () => {
		const data = makeData({ markdown: true, csv: true, image: true, pdf: true, audio: true, video: true });
		const ctx = makeCtx(data);
		renderDashboard(ctx, defaultFilters);
		expect(getKpiValue(ctx.chartContainer!, 'Active Sources')).toBe('6');
	});

	it('shows "1" when only audio is active', () => {
		const data = makeData({ audio: true });
		const ctx = makeCtx(data);
		renderDashboard(ctx, defaultFilters);
		expect(getKpiValue(ctx.chartContainer!, 'Active Sources')).toBe('1');
	});

	it('shows "1" when only video is active', () => {
		const data = makeData({ video: true });
		const ctx = makeCtx(data);
		renderDashboard(ctx, defaultFilters);
		expect(getKpiValue(ctx.chartContainer!, 'Active Sources')).toBe('1');
	});

	it('shows "0" when no sources are active', () => {
		const data = makeData();
		const ctx = makeCtx(data);
		renderDashboard(ctx, defaultFilters);
		expect(getKpiValue(ctx.chartContainer!, 'Active Sources')).toBe('0');
	});

	it('shows "4" when only markdown, csv, image, pdf are active (legacy behavior)', () => {
		const data = makeData({ markdown: true, csv: true, image: true, pdf: true });
		const ctx = makeCtx(data);
		renderDashboard(ctx, defaultFilters);
		expect(getKpiValue(ctx.chartContainer!, 'Active Sources')).toBe('4');
	});
});
