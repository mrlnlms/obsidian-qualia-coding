import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyticsViewContext } from '../../src/analytics/views/analyticsViewContext';
import type { ConsolidatedData, FilterConfig, FrequencyResult, SourceType, UnifiedCode, UnifiedMarker } from '../../src/analytics/data/dataTypes';

// ── Mocks ──

vi.mock('obsidian', () => ({ Notice: vi.fn(), MarkdownView: class {}, setIcon: vi.fn() }));

const ChartMock = vi.fn();
(ChartMock as any).register = vi.fn();
vi.mock('chart.js', () => ({
	Chart: ChartMock,
	registerables: [],
}));
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('chartjs-chart-wordcloud', () => ({
	WordCloudController: class {},
	WordElement: class {},
}));

vi.mock('../../src/analytics/data/statsEngine', () => ({
	calculateFrequency: vi.fn(),
	calculateTemporal: vi.fn(),
	calculateCooccurrence: vi.fn(),
	calculateOverlap: vi.fn(),
	calculateSourceComparison: vi.fn(),
	calculateEvolution: vi.fn(),
	calculateDocumentCodeMatrix: vi.fn(),
	calculateLagSequential: vi.fn(),
	calculatePolarCoordinates: vi.fn(),
	calculateChiSquare: vi.fn(),
	calculateTextStats: vi.fn(),
}));

vi.mock('../../src/analytics/data/mcaEngine', () => ({
	calculateMCA: vi.fn(),
}));

vi.mock('../../src/analytics/data/mdsEngine', () => ({
	calculateMDS: vi.fn(),
}));

vi.mock('../../src/analytics/data/textExtractor', () => ({
	TextExtractor: class { extractBatch = vi.fn().mockResolvedValue([]); },
}));

vi.mock('../../src/analytics/data/wordFrequency', () => ({
	calculateWordFrequencies: vi.fn(),
}));

// ── Imports (after mocks) ──

import { calculateFrequency, calculateTemporal } from '../../src/analytics/data/statsEngine';
import { calculateMCA } from '../../src/analytics/data/mcaEngine';
import { calculateMDS } from '../../src/analytics/data/mdsEngine';
import { calculateWordFrequencies } from '../../src/analytics/data/wordFrequency';

import { renderFrequencyChart } from '../../src/analytics/views/modes/frequencyMode';
import { renderTemporalChart } from '../../src/analytics/views/modes/temporalMode';
import { renderACMBiplot } from '../../src/analytics/views/modes/acmMode';
import { renderMDSMap } from '../../src/analytics/views/modes/mdsMode';
import { renderWordCloud } from '../../src/analytics/views/modes/wordCloudMode';

// ── Patch HTMLElement ──

function patchEl(el: HTMLElement): HTMLElement {
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
		(el as any).createEl = function (tag: string, opts?: any) {
			const el = document.createElement(tag);
			if (opts?.cls) el.className = opts.cls;
			if (opts?.text) el.textContent = opts.text;
			patchEl(el);
			this.appendChild(el);
			return el;
		};
	}
	if (!('createSpan' in el)) {
		(el as any).createSpan = function (opts?: any) {
			const span = document.createElement('span');
			if (opts?.text) span.textContent = opts.text;
			patchEl(span);
			this.appendChild(span);
			return span;
		};
	}
	if (!('empty' in el)) {
		(el as any).empty = function () { this.innerHTML = ''; };
	}
	return el;
}

const origCreateElement = document.createElement.bind(document);
document.createElement = function (tag: string, options?: ElementCreationOptions) {
	const el = origCreateElement(tag, options);
	patchEl(el);
	return el;
} as typeof document.createElement;

// ── Helpers ──

function makeCode(name: string, color = '#6200EE'): UnifiedCode {
	return { name, color, sources: ['markdown'] };
}

function makeMarker(id: string, source: SourceType, file: string, codes: string[], meta?: UnifiedMarker['meta']): UnifiedMarker {
	return { id, source, file, codes, meta };
}

function createTestData(): ConsolidatedData {
	return {
		markers: [makeMarker('m1', 'markdown', 'f.md', ['A']), makeMarker('m2', 'markdown', 'f.md', ['B'])],
		codes: [makeCode('A', '#f00'), makeCode('B', '#0f0')],
		sources: ['markdown'],
		files: ['f.md'],
	};
}

function createFilters(): FilterConfig {
	return { sources: ['markdown'], codes: ['A', 'B'], excludeCodes: [], minFrequency: 1 };
}

function createMockCtx(overrides: Partial<AnalyticsViewContext> = {}): AnalyticsViewContext {
	const container = document.createElement('div');
	patchEl(container);
	return {
		plugin: { app: { vault: {} } } as any,
		data: createTestData(),
		chartContainer: container,
		configPanelEl: null,
		footerEl: null,
		viewMode: 'frequency',
		sortMode: 'alpha',
		groupMode: 'none',
		displayMode: 'absolute',
		showEdgeLabels: false,
		minEdgeWeight: 1,
		enabledSources: new Set(['markdown'] as SourceType[]),
		enabledCodes: new Set(['A', 'B']),
		minFrequency: 0,
		codeSearch: '',
		matrixSortMode: 'alpha',
		cooccSortMode: 'alpha',
		evolutionFile: '',
		wcStopWordsLang: 'en',
		wcMinWordLength: 3,
		wcMaxWords: 100,
		acmShowMarkers: true,
		acmShowCodeLabels: true,
		mdsMode: 'codes',
		mdsShowLabels: true,
		dendrogramMode: 'codes',
		dendrogramCutDistance: 0.5,
		lagValue: 1,
		tsSort: { col: 'code', asc: true },
		polarFocalCode: 'A',
		polarMaxLag: 5,
		chiGroupBy: 'source',
		chiSort: { col: 'code', asc: true },
		dtOutcomeCode: 'A',
		dtMaxDepth: 3,
		srcCompSubView: 'chart',
		srcCompDisplayMode: 'count',
		srcCompSort: { col: 'code', asc: true },
		trSearch: '',
		trGroupBy: 'code',
		trSegments: [],
		trCollapsed: new Set(),
		renderGeneration: 0,
		buildFilterConfig: () => createFilters(),
		scheduleUpdate: vi.fn(),
		renderConfigPanel: vi.fn(),
		isRenderCurrent: (gen: number) => gen === 0,
		...overrides,
	} as AnalyticsViewContext;
}

beforeEach(() => {
	ChartMock.mockClear();
	(ChartMock as any).register.mockClear();
});

// ══════════════════════════════════════════════════════════════

describe('renderFrequencyChart', () => {
	it('returns early without data', () => {
		renderFrequencyChart(createMockCtx({ data: null }), createFilters());
		expect(ChartMock).not.toHaveBeenCalled();
	});

	it('returns early without chartContainer', () => {
		renderFrequencyChart(createMockCtx({ chartContainer: null }), createFilters());
		expect(ChartMock).not.toHaveBeenCalled();
	});

	it('shows empty message when no results', () => {
		vi.mocked(calculateFrequency).mockReturnValue([]);
		const ctx = createMockCtx();
		renderFrequencyChart(ctx, createFilters());
		expect(ctx.chartContainer!.querySelector('.codemarker-analytics-empty')).not.toBeNull();
		expect(ChartMock).not.toHaveBeenCalled();
	});

	it('creates Chart with data', async () => {
		vi.mocked(calculateFrequency).mockReturnValue([
			{ code: 'A', color: '#f00', total: 5, bySource: { markdown: 5, 'csv-segment': 0, 'csv-row': 0, image: 0, pdf: 0, audio: 0, video: 0 }, byFile: {} },
		]);
		const ctx = createMockCtx();
		renderFrequencyChart(ctx, createFilters());
		// renderBarChart is async internally, wait for it
		await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
		expect(ChartMock).toHaveBeenCalledOnce();
		expect(ChartMock.mock.calls[0][1].type).toBe('bar');
	});
});

describe('renderTemporalChart', () => {
	it('returns early without data', async () => {
		await renderTemporalChart(createMockCtx({ data: null }), createFilters());
		expect(ChartMock).not.toHaveBeenCalled();
	});

	it('shows empty when no series', async () => {
		vi.mocked(calculateTemporal).mockReturnValue({ series: [], dateRange: [0, 0], codes: [], colors: [] });
		const ctx = createMockCtx();
		await renderTemporalChart(ctx, createFilters());
		expect(ctx.chartContainer!.querySelector('.codemarker-analytics-empty')).not.toBeNull();
	});

	it('creates line Chart with temporal data', async () => {
		vi.mocked(calculateTemporal).mockReturnValue({
			series: [{ code: 'A', color: '#f00', points: [{ date: 1700000000000, count: 1 }] }],
			dateRange: [1700000000000, 1700000000000],
			codes: ['A'],
			colors: ['#f00'],
		});
		const ctx = createMockCtx();
		await renderTemporalChart(ctx, createFilters());
		expect(ChartMock).toHaveBeenCalledOnce();
		expect(ChartMock.mock.calls[0][1].type).toBe('line');
	});
});

describe('renderACMBiplot', () => {
	it('returns early without data', () => {
		renderACMBiplot(createMockCtx({ data: null }), createFilters());
		expect(ChartMock).not.toHaveBeenCalled();
	});

	it('shows empty message with insufficient data', () => {
		const ctx = createMockCtx({ enabledCodes: new Set(['A']) }); // only 1 code
		renderACMBiplot(ctx, createFilters());
		expect(ctx.chartContainer!.querySelector('.codemarker-analytics-empty')).not.toBeNull();
		expect(ChartMock).not.toHaveBeenCalled();
	});
});

describe('renderMDSMap', () => {
	it('returns early without data', () => {
		renderMDSMap(createMockCtx({ data: null }), createFilters());
		expect(ChartMock).not.toHaveBeenCalled();
	});

	it('shows empty message with insufficient data', () => {
		const ctx = createMockCtx({ enabledCodes: new Set(['A']) }); // only 1 code
		renderMDSMap(ctx, createFilters());
		expect(ctx.chartContainer!.querySelector('.codemarker-analytics-empty')).not.toBeNull();
		expect(ChartMock).not.toHaveBeenCalled();
	});
});

describe('renderWordCloud', () => {
	it('returns early without data', () => {
		renderWordCloud(createMockCtx({ data: null }), createFilters());
		expect(ChartMock).not.toHaveBeenCalled();
	});

	it('creates wordCloud Chart after text extraction', async () => {
		vi.mocked(calculateWordFrequencies).mockReturnValue([
			{ word: 'hello', count: 5, codes: ['A'], sources: ['markdown'] },
		] as any);
		const ctx = createMockCtx();
		renderWordCloud(ctx, createFilters());
		await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
		expect(ChartMock).toHaveBeenCalledOnce();
		expect(ChartMock.mock.calls[0][1].type).toBe('wordCloud');
	});
});
