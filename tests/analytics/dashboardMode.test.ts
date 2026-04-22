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
		enabledSources: new Set(['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video']),
		enabledCodes: new Set(),
		disabledCodes: new Set(),
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
