import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConsolidatedData, FilterConfig, UnifiedMarker, UnifiedCode, SourceType } from '../../src/analytics/data/dataTypes';
import type { AnalyticsViewContext } from '../../src/analytics/views/analyticsViewContext';

// ── Mock obsidian (Notice) ──
vi.mock('obsidian', () => ({ Notice: vi.fn() }));

// ── Mock statsEngine ──
vi.mock('../../src/analytics/data/statsEngine', () => ({
	calculateTemporal: vi.fn(),
	calculateLagSequential: vi.fn(),
	calculatePolarCoordinates: vi.fn(),
	calculateChiSquare: vi.fn(),
	calculateOverlap: vi.fn(),
	calculateSourceComparison: vi.fn(),
	calculateCooccurrence: vi.fn(),
	calculateTextStats: vi.fn(),
}));

// ── Mock dendrogram + decision tree engines ──
vi.mock('../../src/analytics/data/clusterEngine', () => ({
	buildDendrogram: vi.fn(),
	cutDendrogram: vi.fn(),
	calculateSilhouette: vi.fn(),
}));

vi.mock('../../src/analytics/data/decisionTreeEngine', () => ({
	buildDecisionTree: vi.fn(),
}));

// ── Mock async engines ──
vi.mock('../../src/analytics/data/mcaEngine', () => ({
	calculateMCA: vi.fn(),
}));

vi.mock('../../src/analytics/data/mdsEngine', () => ({
	calculateMDS: vi.fn(),
}));

const mockExtractBatch = vi.fn().mockResolvedValue([]);
vi.mock('../../src/analytics/data/textExtractor', () => ({
	TextExtractor: class MockTextExtractor {
		extractBatch = mockExtractBatch;
	},
}));

vi.mock('../../src/analytics/data/wordFrequency', () => ({
	calculateWordFrequencies: vi.fn(),
}));

// ── Imports (after mocks) ──
import { calculateTemporal, calculateLagSequential, calculatePolarCoordinates, calculateChiSquare, calculateOverlap, calculateSourceComparison, calculateCooccurrence } from '../../src/analytics/data/statsEngine';
import { buildDendrogram, cutDendrogram, calculateSilhouette } from '../../src/analytics/data/clusterEngine';
import { buildDecisionTree } from '../../src/analytics/data/decisionTreeEngine';

import { exportTemporalCSV } from '../../src/analytics/views/modes/temporalMode';
import { exportLagCSV } from '../../src/analytics/views/modes/lagSequentialMode';
import { exportPolarCSV } from '../../src/analytics/views/modes/polarMode';
import { exportChiSquareCSV } from '../../src/analytics/views/modes/chiSquareMode';
import { exportOverlapCSV } from '../../src/analytics/views/modes/overlapMode';
import { exportSourceComparisonCSV } from '../../src/analytics/views/modes/sourceComparisonMode';
import { exportDendrogramCSV } from '../../src/analytics/views/modes/dendrogramMode';
import { exportDecisionTreeCSV } from '../../src/analytics/views/modes/decisionTreeMode';
import { exportACMCSV } from '../../src/analytics/views/modes/acmMode';
import { exportMDSCSV } from '../../src/analytics/views/modes/mdsMode';
import { exportWordCloudCSV } from '../../src/analytics/views/modes/wordCloudMode';
import { exportTextStatsCSV } from '../../src/analytics/views/modes/textStatsMode';
import { calculateMCA } from '../../src/analytics/data/mcaEngine';
import { calculateMDS } from '../../src/analytics/data/mdsEngine';
import { TextExtractor } from '../../src/analytics/data/textExtractor';
import { calculateWordFrequencies } from '../../src/analytics/data/wordFrequency';
import { calculateTextStats } from '../../src/analytics/data/statsEngine';

// ── Helpers ──

function makeMarker(id: string, source: SourceType, fileId: string, codes: string[], meta?: UnifiedMarker['meta']): UnifiedMarker {
	return { id, source, fileId, codes, meta };
}

function makeCode(name: string, color: string = '#6200EE'): UnifiedCode {
	return { name, color, sources: ['markdown'] };
}

function createTestData(markers: UnifiedMarker[] = [], codes: UnifiedCode[] = []): ConsolidatedData {
	return {
		markers,
		codes,
		sources: ['markdown'],
		files: [...new Set(markers.map(m => m.fileId))],
	};
}

function createMockCtx(overrides: Partial<AnalyticsViewContext> = {}): AnalyticsViewContext {
	const data = createTestData(
		[makeMarker('m1', 'markdown', 'f.md', ['A']), makeMarker('m2', 'markdown', 'f.md', ['B'])],
		[makeCode('A', '#ff0000'), makeCode('B', '#00ff00')],
	);
	return {
		plugin: { app: { vault: {} } } as any,
		data,
		chartContainer: null,
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
		buildFilterConfig: () => ({
			sources: ['markdown'] as SourceType[],
			codes: ['A', 'B'],
			excludeCodes: [],
			minFrequency: 0,
		}),
		renderGeneration: 0,
		scheduleUpdate: vi.fn(),
		renderConfigPanel: vi.fn(),
		isRenderCurrent: (gen: number) => gen === 0,
		...overrides,
	} as AnalyticsViewContext;
}

// ── Blob capture helper ──

let capturedBlobs: Blob[] = [];
let clickSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
	capturedBlobs = [];
	clickSpy = vi.fn();

	// Mock URL.createObjectURL to capture blobs
	vi.stubGlobal('URL', {
		createObjectURL: (blob: Blob) => {
			capturedBlobs.push(blob);
			return 'blob:mock';
		},
		revokeObjectURL: vi.fn(),
	});

	// Spy on link.click
	const origCreate = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
		const el = origCreate(tag, opts);
		if (tag === 'a') {
			el.click = clickSpy;
		}
		return el;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function getCapturedCSV(): Promise<string> {
	expect(capturedBlobs).toHaveLength(1);
	return capturedBlobs[0]!.text();
}

function csvRows(csv: string): string[][] {
	return csv.split('\n').map(r => r.split(','));
}

// ══════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════

describe('exportTemporalCSV', () => {
	it('early returns without data', () => {
		const ctx = createMockCtx({ data: null });
		exportTemporalCSV(ctx, '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('does not download when no series', () => {
		vi.mocked(calculateTemporal).mockReturnValue({ series: [], dateRange: [0, 0] });
		const ctx = createMockCtx();
		exportTemporalCSV(ctx, '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV with temporal data', async () => {
		vi.mocked(calculateTemporal).mockReturnValue({
			series: [
				{ code: 'A', color: '#ff0000', points: [{ date: 1700000000000, count: 1 }, { date: 1700100000000, count: 3 }] },
			],
			dateRange: [1700000000000, 1700100000000],
		});
		const ctx = createMockCtx();
		exportTemporalCSV(ctx, '2026-01-01');

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['code', 'date', 'cumulative_count']);
		expect(rows).toHaveLength(3); // header + 2 data rows
		expect(rows[1]![0]).toBe('A');
		expect(rows[1]![2]).toBe('1');
		expect(rows[2]![2]).toBe('3');
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

describe('exportLagCSV', () => {
	it('early returns without data', () => {
		exportLagCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV with lag data', async () => {
		vi.mocked(calculateLagSequential).mockReturnValue({
			codes: ['A', 'B'],
			colors: ['#ff0000', '#00ff00'],
			transitions: [[1, 2], [3, 0]],
			expected: [[0.5, 1.5], [2.5, 0.5]],
			zScores: [[0.7, 0.4], [0.3, -0.7]],
			totalTransitions: 6,
		});
		const ctx = createMockCtx();
		exportLagCSV(ctx, '2026-01-01');

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['source_code', 'target_code', 'observed', 'expected', 'z_score', 'significant']);
		// 2x2 matrix = 4 data rows + header
		expect(rows).toHaveLength(5);
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

describe('exportPolarCSV', () => {
	it('early returns without data', () => {
		exportPolarCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV with polar data', async () => {
		vi.mocked(calculatePolarCoordinates).mockReturnValue({
			focalCode: 'A',
			vectors: [
				{ code: 'B', zProspective: 1.5, zRetrospective: 2.0, radius: 2.5, angle: 53.1, quadrant: 'I', significant: true },
			],
		});
		const ctx = createMockCtx();
		exportPolarCSV(ctx, '2026-01-01');

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['focal', 'conditioned', 'z_prospective', 'z_retrospective', 'radius', 'angle', 'quadrant', 'significant']);
		expect(rows).toHaveLength(2); // header + 1 vector
		expect(rows[1]![0]).toBe('A');
		expect(rows[1]![1]).toBe('B');
		expect(rows[1]![7]).toBe('yes');
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

describe('exportChiSquareCSV', () => {
	it('early returns without data', () => {
		exportChiSquareCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV with chi-square data', async () => {
		vi.mocked(calculateChiSquare).mockReturnValue({
			entries: [
				{ code: 'A', chiSquare: 5.2, df: 1, pValue: 0.023, cramersV: 0.45, significant: true, observed: [], expected: [], categories: [] },
			],
		});
		const ctx = createMockCtx();
		exportChiSquareCSV(ctx, '2026-01-01');

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['code', 'chi_square', 'df', 'p_value', 'cramers_v', 'significant']);
		expect(rows).toHaveLength(2);
		expect(rows[1]![0]).toBe('A');
		expect(rows[1]![5]).toBe('yes');
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

describe('exportOverlapCSV', () => {
	it('early returns without data', () => {
		exportOverlapCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct matrix CSV', async () => {
		vi.mocked(calculateOverlap).mockReturnValue({
			codes: ['A', 'B'],
			colors: ['#ff0000', '#00ff00'],
			matrix: [[5, 2], [2, 3]],
			maxValue: 5,
			totalPairsChecked: 10,
			skippedSources: [],
		});
		const ctx = createMockCtx();
		exportOverlapCSV(ctx, '2026-01-01');

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['', 'A', 'B']); // header with code names
		expect(rows[1]).toEqual(['A', '5', '2']);
		expect(rows[2]).toEqual(['B', '2', '3']);
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

describe('exportSourceComparisonCSV', () => {
	it('early returns without data', () => {
		exportSourceComparisonCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV with source comparison data', async () => {
		const emptySrc = { markdown: 0, 'csv-segment': 0, 'csv-row': 0, image: 0, pdf: 0, audio: 0, video: 0 };
		vi.mocked(calculateSourceComparison).mockReturnValue({
			entries: [
				{
					code: 'A', color: '#ff0000', total: 5,
					bySource: { ...emptySrc, markdown: 5 },
					bySourcePctOfCode: { ...emptySrc, markdown: 100 },
					bySourcePctOfSrc: { ...emptySrc, markdown: 50 },
				},
			],
			sourceTotals: { ...emptySrc, markdown: 10 },
		});
		const ctx = createMockCtx();
		exportSourceComparisonCSV(ctx, '2026-01-01');

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		// header has code + total + 7 sources x 3 = 23 columns
		expect(rows[0]![0]).toBe('code');
		expect(rows[0]![1]).toBe('total');
		expect(rows).toHaveLength(2);
		expect(rows[1]![0]).toBe('A');
		expect(rows[1]![1]).toBe('5');
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

describe('exportDendrogramCSV', () => {
	it('early returns without data', () => {
		exportDendrogramCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV with dendrogram data', async () => {
		// Needs 3+ codes to pass the guard
		vi.mocked(calculateCooccurrence).mockReturnValue({
			codes: ['A', 'B', 'C'],
			colors: ['#ff0000', '#00ff00', '#0000ff'],
			matrix: [[5, 2, 1], [2, 3, 1], [1, 1, 4]],
			maxValue: 5,
		});
		vi.mocked(buildDendrogram).mockReturnValue({ label: 'root', children: [], distance: 0, size: 3 } as any);
		vi.mocked(cutDendrogram).mockReturnValue([[0, 1], [2]]);
		vi.mocked(calculateSilhouette).mockReturnValue({
			scores: [
				{ name: 'A', cluster: 0, score: 0.8 },
				{ name: 'B', cluster: 0, score: 0.7 },
				{ name: 'C', cluster: 1, score: 0.6 },
			],
			avgScore: 0.7,
		} as any);
		const ctx = createMockCtx();
		exportDendrogramCSV(ctx, '2026-01-01');

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['name', 'cluster', 'silhouette_score']);
		expect(rows).toHaveLength(4); // header + 3 codes
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

describe('exportDecisionTreeCSV', () => {
	it('early returns without data', () => {
		exportDecisionTreeCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV with decision tree data', async () => {
		vi.mocked(buildDecisionTree).mockReturnValue({
			root: {
				id: 0,
				depth: 0,
				n: 10,
				nPositive: 6,
				nNegative: 4,
				prediction: 1,
				accuracy: 0.6,
				correct: 6,
				errors: 4,
				split: null,
				children: [],
			},
			importance: [],
		} as any);
		const ctx = createMockCtx();
		exportDecisionTreeCSV(ctx, '2026-01-01');

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual([
			'node_id', 'depth', 'n', 'n_positive', 'n_negative',
			'prediction', 'accuracy', 'correct', 'errors',
			'split_predictor', 'split_chi_square', 'split_p_value', 'is_leaf',
		]);
		expect(rows).toHaveLength(2); // header + root node
		expect(rows[1]![0]).toBe('0');
		expect(rows[1]![5]).toBe('present'); // prediction=1
		expect(rows[1]![12]).toBe('yes'); // is_leaf (no children)
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

// ══════════════════════════════════════════════════════════════
// ASYNC EXPORT CSV FUNCTIONS
// ══════════════════════════════════════════════════════════════

async function flushPromises(): Promise<void> {
	await new Promise((r) => setTimeout(r, 0));
}

describe('exportACMCSV', () => {
	it('early returns without data', () => {
		exportACMCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV after async MCA', async () => {
		vi.mocked(calculateMCA).mockResolvedValue({
			codePoints: [{ name: 'A', x: 0.5, y: -0.3, color: '#f00' }],
			markerPoints: [{ id: 'm1', x: 0.1, y: 0.2, fileId: 'f.md', codes: ['A', 'B'], color: '#f00' }],
			inertia: [60, 30],
		} as any);
		const ctx = createMockCtx();
		exportACMCSV(ctx, '2026-01-01');
		await flushPromises();

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['type', 'name', 'dim1', 'dim2', 'file', 'codes']);
		expect(rows[1]![0]).toBe('code');
		expect(rows[2]![0]).toBe('marker');
		expect(clickSpy).toHaveBeenCalledOnce();
	});

	it('does not download when MCA returns null', async () => {
		vi.mocked(calculateMCA).mockResolvedValue(null);
		const ctx = createMockCtx();
		exportACMCSV(ctx, '2026-01-01');
		await flushPromises();
		expect(capturedBlobs).toHaveLength(0);
	});
});

describe('exportMDSCSV', () => {
	it('early returns without data', () => {
		exportMDSCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV after async MDS', async () => {
		vi.mocked(calculateMDS).mockResolvedValue({
			points: [
				{ name: 'A', x: 0.5, y: -0.3, size: 10, color: '#f00' },
				{ name: 'B', x: -0.2, y: 0.8, size: 5, color: '#0f0' },
			],
			stress: 0.12,
			mode: 'codes',
		} as any);
		const ctx = createMockCtx();
		exportMDSCSV(ctx, '2026-01-01');
		await flushPromises();

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['name', 'dim1', 'dim2', 'size', 'mode']);
		expect(rows).toHaveLength(3);
		expect(rows[1]![4]).toBe('codes');
		expect(clickSpy).toHaveBeenCalledOnce();
	});

	it('does not download when MDS returns null', async () => {
		vi.mocked(calculateMDS).mockResolvedValue(null);
		const ctx = createMockCtx();
		exportMDSCSV(ctx, '2026-01-01');
		await flushPromises();
		expect(capturedBlobs).toHaveLength(0);
	});
});

describe('exportWordCloudCSV', () => {
	it('early returns without data', () => {
		exportWordCloudCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV after async text extraction', async () => {
		vi.mocked(calculateWordFrequencies).mockReturnValue([
			{ word: 'hello', count: 5, codes: ['A'], sources: ['markdown'] },
			{ word: 'world', count: 3, codes: ['A', 'B'], sources: ['markdown'] },
		] as any);

		const ctx = createMockCtx();
		exportWordCloudCSV(ctx, '2026-01-01');
		await flushPromises();

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['word', 'count', 'codes']);
		expect(rows).toHaveLength(3);
		expect(rows[1]![0]).toBe('hello');
		expect(rows[1]![1]).toBe('5');
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});

describe('exportTextStatsCSV', () => {
	it('early returns without data', () => {
		exportTextStatsCSV(createMockCtx({ data: null }), '2026-01-01');
		expect(capturedBlobs).toHaveLength(0);
	});

	it('produces correct CSV after async text extraction', async () => {
		vi.mocked(calculateTextStats).mockReturnValue({
			codes: [
				{ code: 'A', color: '#f00', segmentCount: 3, totalWords: 50, uniqueWords: 30, ttr: 0.6, avgWordsPerSegment: 16.7, avgCharsPerSegment: 100 },
			],
			global: { totalSegments: 3, totalWords: 50, uniqueWords: 30, ttr: 0.6 },
		});

		const ctx = createMockCtx();
		exportTextStatsCSV(ctx, '2026-01-01');
		await flushPromises();

		const csv = await getCapturedCSV();
		const rows = csvRows(csv);
		expect(rows[0]).toEqual(['code', 'segments', 'total_words', 'unique_words', 'ttr', 'avg_words_per_segment', 'avg_chars_per_segment']);
		expect(rows).toHaveLength(2);
		expect(rows[1]![0]).toBe('A');
		expect(clickSpy).toHaveBeenCalledOnce();
	});
});
