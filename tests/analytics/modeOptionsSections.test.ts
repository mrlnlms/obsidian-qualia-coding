import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConsolidatedData, FilterConfig, UnifiedMarker, UnifiedCode, SourceType } from '../../src/analytics/data/dataTypes';
import type { AnalyticsViewContext, ViewMode, SortMode, GroupMode, DisplayMode, CooccSortMode } from '../../src/analytics/views/analyticsViewContext';

// ── Patch HTMLElement with Obsidian-specific methods ──

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
		(el as any).createEl = function (tag: string, opts?: { cls?: string; text?: string; type?: string; attr?: Record<string, string>; value?: string }) {
			const el = document.createElement(tag);
			if (opts?.cls) el.className = opts.cls;
			if (opts?.text) el.textContent = opts.text;
			if (opts?.type) (el as any).type = opts.type;
			if (opts?.value) (el as any).value = opts.value;
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

// ── Imports (after patching) ──

import { renderGraphOptionsSection } from '../../src/analytics/views/modes/graphMode';
import { renderMatrixSortSection } from '../../src/analytics/views/modes/docMatrixMode';
import { renderEvolutionFileSection } from '../../src/analytics/views/modes/evolutionMode';
import { renderWordCloudOptionsSection } from '../../src/analytics/views/modes/wordCloudMode';
import { renderACMOptionsSection } from '../../src/analytics/views/modes/acmMode';
import { renderMDSOptionsSection } from '../../src/analytics/views/modes/mdsMode';
import { renderDendrogramOptionsSection } from '../../src/analytics/views/modes/dendrogramMode';
import { renderLagOptionsSection } from '../../src/analytics/views/modes/lagSequentialMode';
import { renderPolarOptionsSection } from '../../src/analytics/views/modes/polarMode';
import { renderChiSquareOptionsSection } from '../../src/analytics/views/modes/chiSquareMode';
import { renderDecisionTreeOptionsSection } from '../../src/analytics/views/modes/decisionTreeMode';
import { renderSourceComparisonOptionsSection } from '../../src/analytics/views/modes/sourceComparisonMode';

// ── Mock statsEngine to avoid heavy computation in evolution/polar/decision-tree ──

vi.mock('../../src/analytics/data/statsEngine', () => ({
	calculateEvolution: vi.fn(() => ({
		codes: ['Alpha', 'Beta'],
		colors: ['#a', '#b'],
		files: ['notes/doc1.md', 'notes/doc2.md'],
		points: [],
	})),
	calculatePolarCoordinates: vi.fn(() => ({ focalCode: 'Alpha', maxLag: 5, vectors: [] })),
	calculateChiSquare: vi.fn(() => ({ entries: [], categories: [], groupBy: 'source' })),
	calculateSourceComparison: vi.fn(() => ({ entries: [], activeSources: [], sourceTotals: {} })),
	calculateCooccurrence: vi.fn(() => ({ codes: [], colors: [], matrix: [], maxValue: 0 })),
	calculateFrequency: vi.fn(() => []),
	calculateLagSequential: vi.fn(() => ({ codes: [], zScores: [], transitions: [], expected: [], totalTransitions: 0, lag: 1 })),
	calculateDocumentCodeMatrix: vi.fn(() => ({ files: [], codes: [], colors: [], matrix: [], maxValue: 0 })),
}));

vi.mock('../../src/analytics/data/decisionTreeEngine', () => ({
	buildDecisionTree: vi.fn(() => ({
		root: { id: 0, depth: 0, n: 0, nPositive: 0, nNegative: 0, prediction: 0, accuracy: 0, correct: 0, errors: 0, children: [] },
		outcomeCode: 'Alpha',
		outcomeColor: '#a',
		accuracy: 0,
		aPriori: 0,
		tau: 0,
		totalMarkers: 0,
		predictors: [],
		errorLeaves: [],
	})),
}));

vi.mock('../../src/analytics/data/clusterEngine', () => ({
	buildDendrogram: vi.fn(() => null),
	cutDendrogram: vi.fn(() => []),
	calculateSilhouette: vi.fn(() => ({ avgScore: 0, scores: [] })),
}));

// ── Helpers ──

function makeCode(name: string, color: string = '#6200EE'): UnifiedCode {
	return { name, color, sources: ['markdown'] };
}

function createTestData(codes: UnifiedCode[] = []): ConsolidatedData {
	return {
		markers: [],
		codes,
		sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false },
		lastUpdated: Date.now(),
	};
}

function createFilters(): FilterConfig {
	return {
		sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
		codes: [],
		excludeCodes: [],
		minFrequency: 1,
	};
}

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
		data: createTestData([makeCode('Alpha', '#a'), makeCode('Beta', '#b'), makeCode('Gamma', '#c')]),
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
		wcStopWordsLang: 'none' as any,
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

// ════════════════════════════════════════════════════════════════
// renderGraphOptionsSection (graphMode)
// ════════════════════════════════════════════════════════════════

describe('renderGraphOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'graph' });
	});

	it('creates a section with title "Graph options"', () => {
		renderGraphOptionsSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title).not.toBeNull();
		expect(title!.textContent).toBe('Graph options');
	});

	it('creates a checkbox for edge labels and a number input for min weight', () => {
		renderGraphOptionsSection(ctx);
		const checkbox = ctx.configPanelEl!.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox).not.toBeNull();
		expect(checkbox.checked).toBe(true); // showEdgeLabels default

		const numberInput = ctx.configPanelEl!.querySelector('input[type="number"]') as HTMLInputElement;
		expect(numberInput).not.toBeNull();
		expect(numberInput.value).toBe('1');
	});

	it('initial checkbox state reflects ctx.showEdgeLabels=false', () => {
		ctx.showEdgeLabels = false;
		renderGraphOptionsSection(ctx);
		const checkbox = ctx.configPanelEl!.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox.checked).toBe(false);
	});

	it('toggling checkbox calls scheduleUpdate', () => {
		renderGraphOptionsSection(ctx);
		const checkbox = ctx.configPanelEl!.querySelector('input[type="checkbox"]') as HTMLInputElement;
		checkbox.checked = false;
		checkbox.dispatchEvent(new Event('change'));
		expect(ctx.showEdgeLabels).toBe(false);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('changing number input updates minEdgeWeight and calls scheduleUpdate', () => {
		renderGraphOptionsSection(ctx);
		const numberInput = ctx.configPanelEl!.querySelector('input[type="number"]') as HTMLInputElement;
		numberInput.value = '3';
		numberInput.dispatchEvent(new Event('input'));
		expect(ctx.minEdgeWeight).toBe(3);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('ignores invalid number input (less than 1)', () => {
		renderGraphOptionsSection(ctx);
		const numberInput = ctx.configPanelEl!.querySelector('input[type="number"]') as HTMLInputElement;
		numberInput.value = '0';
		numberInput.dispatchEvent(new Event('input'));
		expect(ctx.minEdgeWeight).toBe(1); // unchanged
		expect(ctx.scheduleUpdate).not.toHaveBeenCalled();
	});
});

// ════════════════════════════════════════════════════════════════
// renderMatrixSortSection (docMatrixMode)
// ════════════════════════════════════════════════════════════════

describe('renderMatrixSortSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'doc-matrix' });
	});

	it('creates a section with title "Sort files"', () => {
		renderMatrixSortSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Sort files');
	});

	it('creates 2 radio buttons for sort modes', () => {
		renderMatrixSortSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(2);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['alpha', 'total']);
	});

	it('checks the radio matching current matrixSortMode', () => {
		ctx.matrixSortMode = 'total';
		renderMatrixSortSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checked = Array.from(radios).find((r) => r.checked);
		expect(checked!.value).toBe('total');
	});

	it('calls scheduleUpdate when radio changes', () => {
		renderMatrixSortSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="total"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.matrixSortMode).toBe('total');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('clicking row label triggers radio change', () => {
		renderMatrixSortSection(ctx);
		const rows = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row');
		rows[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(ctx.matrixSortMode).toBe('total');
		expect(ctx.scheduleUpdate).toHaveBeenCalled();
	});
});

// ════════════════════════════════════════════════════════════════
// renderEvolutionFileSection (evolutionMode)
// ════════════════════════════════════════════════════════════════

describe('renderEvolutionFileSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'evolution' });
	});

	it('creates a section with title "File"', () => {
		renderEvolutionFileSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('File');
	});

	it('creates a select element with "All files" option', () => {
		renderEvolutionFileSection(ctx);
		const select = ctx.configPanelEl!.querySelector('select') as HTMLSelectElement;
		expect(select).not.toBeNull();
		const options = Array.from(select.querySelectorAll('option'));
		expect(options[0]!.textContent).toBe('All files');
		// The first option is the "all files" sentinel (selected by default)
		expect((options[0] as HTMLOptionElement).selected).toBe(true);
	});

	it('includes files from evolution result as options', () => {
		renderEvolutionFileSection(ctx);
		const options = ctx.configPanelEl!.querySelectorAll('option');
		// "All files" + 2 files from mock
		expect(options.length).toBe(3);
		expect((options[1] as HTMLOptionElement).value).toBe('notes/doc1.md');
		expect((options[1] as HTMLOptionElement).textContent).toBe('doc1.md'); // basename
	});

	it('selects "All files" by default when evolutionFile is empty', () => {
		renderEvolutionFileSection(ctx);
		const options = ctx.configPanelEl!.querySelectorAll('option');
		expect((options[0] as HTMLOptionElement).selected).toBe(true);
		expect(options[0]!.textContent).toBe('All files');
	});

	it('calls scheduleUpdate when file selection changes', () => {
		renderEvolutionFileSection(ctx);
		const select = ctx.configPanelEl!.querySelector('select') as HTMLSelectElement;
		select.value = 'notes/doc1.md';
		select.dispatchEvent(new Event('change'));
		expect(ctx.evolutionFile).toBe('notes/doc1.md');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('does not render if ctx.data is null', () => {
		ctx.data = null;
		renderEvolutionFileSection(ctx);
		expect(ctx.configPanelEl!.children.length).toBe(0);
	});
});

// ════════════════════════════════════════════════════════════════
// renderWordCloudOptionsSection (wordCloudMode)
// ════════════════════════════════════════════════════════════════

describe('renderWordCloudOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'word-cloud' });
	});

	it('creates a section with title "Word Cloud"', () => {
		renderWordCloudOptionsSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Word Cloud');
	});

	it('creates 3 radio buttons for stop words language', () => {
		renderWordCloudOptionsSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(3);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['pt', 'en', 'both']);
	});

	it('creates 2 number inputs for min length and max words', () => {
		renderWordCloudOptionsSection(ctx);
		const numberInputs = ctx.configPanelEl!.querySelectorAll('input[type="number"]');
		expect(numberInputs).toHaveLength(2);
		expect((numberInputs[0] as HTMLInputElement).value).toBe('3'); // wcMinWordLength
		expect((numberInputs[1] as HTMLInputElement).value).toBe('100'); // wcMaxWords
	});

	it('changing stop words radio calls scheduleUpdate', () => {
		renderWordCloudOptionsSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="pt"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.wcStopWordsLang).toBe('pt');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('changing min length input updates ctx and calls scheduleUpdate', () => {
		renderWordCloudOptionsSection(ctx);
		const numberInputs = ctx.configPanelEl!.querySelectorAll('input[type="number"]');
		const lenInput = numberInputs[0] as HTMLInputElement;
		lenInput.value = '4';
		lenInput.dispatchEvent(new Event('input'));
		expect(ctx.wcMinWordLength).toBe(4);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('changing max words input updates ctx and calls scheduleUpdate', () => {
		renderWordCloudOptionsSection(ctx);
		const numberInputs = ctx.configPanelEl!.querySelectorAll('input[type="number"]');
		const maxInput = numberInputs[1] as HTMLInputElement;
		maxInput.value = '50';
		maxInput.dispatchEvent(new Event('input'));
		expect(ctx.wcMaxWords).toBe(50);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});
});

// ════════════════════════════════════════════════════════════════
// renderACMOptionsSection (acmMode)
// ════════════════════════════════════════════════════════════════

describe('renderACMOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'acm' });
	});

	it('creates a section with title "MCA Biplot"', () => {
		renderACMOptionsSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('MCA Biplot');
	});

	it('creates 2 checkboxes for markers and code labels', () => {
		renderACMOptionsSection(ctx);
		const checkboxes = ctx.configPanelEl!.querySelectorAll('input[type="checkbox"]');
		expect(checkboxes).toHaveLength(2);
		expect((checkboxes[0] as HTMLInputElement).checked).toBe(true); // acmShowMarkers
		expect((checkboxes[1] as HTMLInputElement).checked).toBe(true); // acmShowCodeLabels
	});

	it('toggling "Show markers" checkbox calls scheduleUpdate', () => {
		renderACMOptionsSection(ctx);
		const cb = ctx.configPanelEl!.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
		cb.checked = false;
		cb.dispatchEvent(new Event('change'));
		expect(ctx.acmShowMarkers).toBe(false);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('toggling "Show code labels" checkbox calls scheduleUpdate', () => {
		renderACMOptionsSection(ctx);
		const cb = ctx.configPanelEl!.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement;
		cb.checked = false;
		cb.dispatchEvent(new Event('change'));
		expect(ctx.acmShowCodeLabels).toBe(false);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('clicking row label toggles checkbox', () => {
		renderACMOptionsSection(ctx);
		const rows = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row');
		// Click first row (Show markers) — currently true, should toggle to false
		rows[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(ctx.acmShowMarkers).toBe(false);
		expect(ctx.scheduleUpdate).toHaveBeenCalled();
	});
});

// ════════════════════════════════════════════════════════════════
// renderMDSOptionsSection (mdsMode)
// ════════════════════════════════════════════════════════════════

describe('renderMDSOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'mds' });
	});

	it('creates a section with title "MDS Map"', () => {
		renderMDSOptionsSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('MDS Map');
	});

	it('creates 2 radio buttons for mode and 1 checkbox for labels', () => {
		renderMDSOptionsSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(2);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['codes', 'files']);

		const checkbox = ctx.configPanelEl!.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox).not.toBeNull();
		expect(checkbox.checked).toBe(true); // mdsShowLabels
	});

	it('checks the radio matching current mdsMode', () => {
		ctx.mdsMode = 'files';
		renderMDSOptionsSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checked = Array.from(radios).find((r) => r.checked);
		expect(checked!.value).toBe('files');
	});

	it('changing radio calls scheduleUpdate', () => {
		renderMDSOptionsSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="files"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.mdsMode).toBe('files');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('toggling labels checkbox calls scheduleUpdate', () => {
		renderMDSOptionsSection(ctx);
		const cb = ctx.configPanelEl!.querySelector('input[type="checkbox"]') as HTMLInputElement;
		cb.checked = false;
		cb.dispatchEvent(new Event('change'));
		expect(ctx.mdsShowLabels).toBe(false);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});
});

// ════════════════════════════════════════════════════════════════
// renderDendrogramOptionsSection (dendrogramMode)
// ════════════════════════════════════════════════════════════════

describe('renderDendrogramOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'dendrogram' });
	});

	it('creates a section with title "Mode"', () => {
		renderDendrogramOptionsSection(ctx);
		const titles = ctx.configPanelEl!.querySelectorAll('.codemarker-config-section-title');
		expect(titles[0]!.textContent).toBe('Mode');
	});

	it('creates 2 radio buttons for codes/files mode', () => {
		renderDendrogramOptionsSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(2);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['codes', 'files']);
	});

	it('creates a range slider for cut distance', () => {
		renderDendrogramOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		expect(slider).not.toBeNull();
		expect(slider.min).toBe('0.01');
		expect(slider.max).toBe('1.0');
		expect(slider.value).toBe('0.5');
	});

	it('displays cut distance value in section title', () => {
		renderDendrogramOptionsSection(ctx);
		const titles = ctx.configPanelEl!.querySelectorAll('.codemarker-config-section-title');
		expect(titles[1]!.textContent).toBe('Cut Distance: 0.50');
	});

	it('changing slider updates dendrogramCutDistance and calls scheduleUpdate', () => {
		renderDendrogramOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		slider.value = '0.75';
		slider.dispatchEvent(new Event('input'));
		expect(ctx.dendrogramCutDistance).toBeCloseTo(0.75);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('slider updates the cut distance label text', () => {
		renderDendrogramOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		slider.value = '0.33';
		slider.dispatchEvent(new Event('input'));
		const titles = ctx.configPanelEl!.querySelectorAll('.codemarker-config-section-title');
		expect(titles[1]!.textContent).toBe('Cut Distance: 0.33');
	});

	it('changing radio updates dendrogramMode and calls scheduleUpdate', () => {
		renderDendrogramOptionsSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="files"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.dendrogramMode).toBe('files');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});
});

// ════════════════════════════════════════════════════════════════
// renderLagOptionsSection (lagSequentialMode)
// ════════════════════════════════════════════════════════════════

describe('renderLagOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'lag-sequential' });
	});

	it('creates a section with title containing lag value', () => {
		renderLagOptionsSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Lag: 1');
	});

	it('creates a range slider with min=1, max=5', () => {
		renderLagOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		expect(slider).not.toBeNull();
		expect(slider.min).toBe('1');
		expect(slider.max).toBe('5');
		expect(slider.value).toBe('1');
	});

	it('initial slider value reflects ctx.lagValue', () => {
		ctx.lagValue = 3;
		renderLagOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		expect(slider.value).toBe('3');
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Lag: 3');
	});

	it('changing slider updates lagValue and calls scheduleUpdate', () => {
		renderLagOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		slider.value = '4';
		slider.dispatchEvent(new Event('input'));
		expect(ctx.lagValue).toBe(4);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('slider updates the title text with new lag value', () => {
		renderLagOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		slider.value = '5';
		slider.dispatchEvent(new Event('input'));
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Lag: 5');
	});
});

// ════════════════════════════════════════════════════════════════
// renderPolarOptionsSection (polarMode)
// ════════════════════════════════════════════════════════════════

describe('renderPolarOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'polar-coords' });
	});

	it('creates a section with title "Polar Coordinates"', () => {
		renderPolarOptionsSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Polar Coordinates');
	});

	it('creates a select dropdown for focal code', () => {
		renderPolarOptionsSection(ctx);
		const select = ctx.configPanelEl!.querySelector('select') as HTMLSelectElement;
		expect(select).not.toBeNull();
		const options = Array.from(select.querySelectorAll('option'));
		// Codes sorted: Alpha, Beta, Gamma
		expect(options.map((o) => o.value)).toEqual(['Alpha', 'Beta', 'Gamma']);
	});

	it('auto-selects first code when polarFocalCode is empty', () => {
		renderPolarOptionsSection(ctx);
		expect(ctx.polarFocalCode).toBe('Alpha'); // auto-set by the function
	});

	it('creates a range slider for max lag', () => {
		renderPolarOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		expect(slider).not.toBeNull();
		expect(slider.min).toBe('1');
		expect(slider.max).toBe('5');
		expect(slider.value).toBe('5');
	});

	it('changing select calls scheduleUpdate', () => {
		renderPolarOptionsSection(ctx);
		const select = ctx.configPanelEl!.querySelector('select') as HTMLSelectElement;
		select.value = 'Beta';
		select.dispatchEvent(new Event('change'));
		expect(ctx.polarFocalCode).toBe('Beta');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('changing slider on "change" event calls scheduleUpdate', () => {
		renderPolarOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		slider.value = '3';
		slider.dispatchEvent(new Event('change'));
		expect(ctx.polarMaxLag).toBe(3);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('does not render if ctx.data is null', () => {
		ctx.data = null;
		renderPolarOptionsSection(ctx);
		expect(ctx.configPanelEl!.children.length).toBe(0);
	});
});

// ════════════════════════════════════════════════════════════════
// renderChiSquareOptionsSection (chiSquareMode)
// ════════════════════════════════════════════════════════════════

describe('renderChiSquareOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'chi-square' });
	});

	it('creates a section with title "Chi-Square"', () => {
		renderChiSquareOptionsSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Chi-Square');
	});

	it('creates 2 radio buttons for group-by modes', () => {
		renderChiSquareOptionsSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(radios).toHaveLength(2);
		const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
		expect(values).toEqual(['source', 'file']);
	});

	it('checks the radio matching current chiGroupBy', () => {
		ctx.chiGroupBy = 'file';
		renderChiSquareOptionsSection(ctx);
		const radios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
		const checked = Array.from(radios).find((r) => r.checked);
		expect(checked!.value).toBe('file');
	});

	it('changing radio calls scheduleUpdate', () => {
		renderChiSquareOptionsSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="file"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.chiGroupBy).toBe('file');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('has a "Group by" sublabel', () => {
		renderChiSquareOptionsSection(ctx);
		const sublabel = ctx.configPanelEl!.querySelector('.codemarker-config-sublabel');
		expect(sublabel).not.toBeNull();
		expect(sublabel!.textContent).toBe('Group by');
	});
});

// ════════════════════════════════════════════════════════════════
// renderDecisionTreeOptionsSection (decisionTreeMode)
// ════════════════════════════════════════════════════════════════

describe('renderDecisionTreeOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'decision-tree' });
	});

	it('creates a section with title "Decision Tree"', () => {
		renderDecisionTreeOptionsSection(ctx);
		const title = ctx.configPanelEl!.querySelector('.codemarker-config-section-title');
		expect(title!.textContent).toBe('Decision Tree');
	});

	it('creates a select dropdown for outcome code', () => {
		renderDecisionTreeOptionsSection(ctx);
		const select = ctx.configPanelEl!.querySelector('select') as HTMLSelectElement;
		expect(select).not.toBeNull();
		const options = Array.from(select.querySelectorAll('option'));
		expect(options.map((o) => o.value)).toEqual(['Alpha', 'Beta', 'Gamma']);
	});

	it('auto-selects first code when dtOutcomeCode is empty', () => {
		renderDecisionTreeOptionsSection(ctx);
		expect(ctx.dtOutcomeCode).toBe('Alpha');
	});

	it('creates a range slider for max depth', () => {
		renderDecisionTreeOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		expect(slider).not.toBeNull();
		expect(slider.min).toBe('1');
		expect(slider.max).toBe('6');
		expect(slider.value).toBe('5');
	});

	it('changing select calls scheduleUpdate', () => {
		renderDecisionTreeOptionsSection(ctx);
		const select = ctx.configPanelEl!.querySelector('select') as HTMLSelectElement;
		select.value = 'Gamma';
		select.dispatchEvent(new Event('change'));
		expect(ctx.dtOutcomeCode).toBe('Gamma');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('changing slider on "change" event calls scheduleUpdate', () => {
		renderDecisionTreeOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		slider.value = '3';
		slider.dispatchEvent(new Event('change'));
		expect(ctx.dtMaxDepth).toBe(3);
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('slider "input" event updates label text without calling scheduleUpdate', () => {
		renderDecisionTreeOptionsSection(ctx);
		const slider = ctx.configPanelEl!.querySelector('input[type="range"]') as HTMLInputElement;
		slider.value = '2';
		slider.dispatchEvent(new Event('input'));
		expect(ctx.dtMaxDepth).toBe(2);
		// scheduleUpdate should NOT be called on "input", only on "change"
		expect(ctx.scheduleUpdate).not.toHaveBeenCalled();
		// Label should update
		const sublabel = ctx.configPanelEl!.querySelectorAll('.codemarker-config-sublabel');
		const depthLabel = Array.from(sublabel).find((el) => el.textContent?.includes('Max Depth'));
		expect(depthLabel!.textContent).toBe('Max Depth: 2');
	});

	it('does not render if ctx.data is null', () => {
		ctx.data = null;
		renderDecisionTreeOptionsSection(ctx);
		expect(ctx.configPanelEl!.children.length).toBe(0);
	});
});

// ════════════════════════════════════════════════════════════════
// renderSourceComparisonOptionsSection (sourceComparisonMode)
// ════════════════════════════════════════════════════════════════

describe('renderSourceComparisonOptionsSection', () => {
	let ctx: AnalyticsViewContext;

	beforeEach(() => {
		ctx = createMockCtx({ viewMode: 'source-comparison' });
	});

	it('creates two sections: "Sub-view" and "Display"', () => {
		renderSourceComparisonOptionsSection(ctx);
		const titles = ctx.configPanelEl!.querySelectorAll('.codemarker-config-section-title');
		expect(titles).toHaveLength(2);
		expect(titles[0]!.textContent).toBe('Sub-view');
		expect(titles[1]!.textContent).toBe('Display');
	});

	it('creates 2 radios for sub-view (chart/table) and 3 for display mode', () => {
		renderSourceComparisonOptionsSection(ctx);
		const allRadios = ctx.configPanelEl!.querySelectorAll('input[type="radio"]');
		expect(allRadios).toHaveLength(5);

		const subViewRadios = ctx.configPanelEl!.querySelectorAll('input[name="srcCompSubView"]');
		expect(subViewRadios).toHaveLength(2);
		const subValues = Array.from(subViewRadios).map((r) => (r as HTMLInputElement).value);
		expect(subValues).toEqual(['chart', 'table']);

		const displayRadios = ctx.configPanelEl!.querySelectorAll('input[name="srcCompDisplayMode"]');
		expect(displayRadios).toHaveLength(3);
		const dispValues = Array.from(displayRadios).map((r) => (r as HTMLInputElement).value);
		expect(dispValues).toEqual(['count', 'percent-code', 'percent-source']);
	});

	it('checks correct defaults: chart and count', () => {
		renderSourceComparisonOptionsSection(ctx);
		const chartRadio = ctx.configPanelEl!.querySelector('input[value="chart"]') as HTMLInputElement;
		const countRadio = ctx.configPanelEl!.querySelector('input[value="count"]') as HTMLInputElement;
		expect(chartRadio.checked).toBe(true);
		expect(countRadio.checked).toBe(true);
	});

	it('changing sub-view radio calls scheduleUpdate', () => {
		renderSourceComparisonOptionsSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="table"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.srcCompSubView).toBe('table');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('changing display mode radio calls scheduleUpdate', () => {
		renderSourceComparisonOptionsSection(ctx);
		const radio = ctx.configPanelEl!.querySelector('input[value="percent-code"]') as HTMLInputElement;
		radio.dispatchEvent(new Event('change'));
		expect(ctx.srcCompDisplayMode).toBe('percent-code');
		expect(ctx.scheduleUpdate).toHaveBeenCalledTimes(1);
	});

	it('clicking row label triggers radio change', () => {
		renderSourceComparisonOptionsSection(ctx);
		const rows = ctx.configPanelEl!.querySelectorAll('.codemarker-config-row');
		// Click the "Table" row (second row, index 1)
		rows[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(ctx.srcCompSubView).toBe('table');
		expect(ctx.scheduleUpdate).toHaveBeenCalled();
	});
});
