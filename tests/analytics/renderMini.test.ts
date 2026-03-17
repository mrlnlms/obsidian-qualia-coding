import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('obsidian', () => ({ Notice: vi.fn() }));

vi.mock('../../src/analytics/data/statsEngine', () => ({
	calculateLagSequential: vi.fn(),
	calculatePolarCoordinates: vi.fn(),
	calculateChiSquare: vi.fn(),
	calculateCooccurrence: vi.fn(),
	calculateSourceComparison: vi.fn(),
	calculateFrequency: vi.fn(),
}));

vi.mock('../../src/analytics/data/clusterEngine', () => ({
	buildDendrogram: vi.fn(),
	cutDendrogram: vi.fn(),
	calculateSilhouette: vi.fn(),
}));

vi.mock('../../src/analytics/data/decisionTreeEngine', () => ({
	buildDecisionTree: vi.fn(),
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

// ── Imports ─────────────────────────────────────────────────────────

import type {
	FrequencyResult,
	CooccurrenceResult,
	DocCodeMatrixResult,
	EvolutionResult,
	TemporalResult,
	LagResult,
	FilterConfig,
	SourceType,
} from '../../src/analytics/data/dataTypes';

// Group 1 — simple data
import {
	renderMiniFrequency,
	renderMiniCooccurrence,
	renderMiniNetwork,
	renderMiniDocMatrix,
} from '../../src/analytics/views/modes/dashboardMode';
import { renderMiniTemporal } from '../../src/analytics/views/modes/temporalMode';
import { renderMiniLag } from '../../src/analytics/views/modes/lagSequentialMode';
import { renderMiniEvolution } from '../../src/analytics/views/modes/evolutionMode';
import { renderMiniTextStats } from '../../src/analytics/views/modes/textStatsMode';
import { renderMiniMDS } from '../../src/analytics/views/modes/mdsMode';
import { renderMiniWordCloud } from '../../src/analytics/views/modes/wordCloudMode';

// Group 2 — context-aware
import { renderMiniPolar } from '../../src/analytics/views/modes/polarMode';
import { renderMiniACM } from '../../src/analytics/views/modes/acmMode';
import { renderMiniDendrogram } from '../../src/analytics/views/modes/dendrogramMode';
import { renderMiniDecisionTree } from '../../src/analytics/views/modes/decisionTreeMode';
import { renderMiniChiSquare } from '../../src/analytics/views/modes/chiSquareMode';
import { renderMiniSourceComparison } from '../../src/analytics/views/modes/sourceComparisonMode';

// Group 3 — special
import { renderMiniMatrix } from '../../src/analytics/views/modes/overlapMode';

// Mocked modules (for configuring return values)
import { calculatePolarCoordinates } from '../../src/analytics/data/statsEngine';
import { calculateChiSquare } from '../../src/analytics/data/statsEngine';
import { calculateCooccurrence } from '../../src/analytics/data/statsEngine';
import { buildDendrogram } from '../../src/analytics/data/clusterEngine';
import { buildDecisionTree } from '../../src/analytics/data/decisionTreeEngine';

// ── Helpers ─────────────────────────────────────────────────────────

function createMockCanvas(w = 200, h = 120) {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = {
		fillRect: vi.fn(), strokeRect: vi.fn(), clearRect: vi.fn(),
		fillText: vi.fn(), measureText: vi.fn(() => ({ width: 30 })),
		beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
		arc: vi.fn(), stroke: vi.fn(), fill: vi.fn(), closePath: vi.fn(),
		save: vi.fn(), restore: vi.fn(),
		rotate: vi.fn(), translate: vi.fn(), scale: vi.fn(),
		setLineDash: vi.fn(), getLineDash: vi.fn(() => []),
		createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
		fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
		font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '',
	};
	vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as any);
	return { canvas, ctx };
}

const allSourcesZero: Record<SourceType, number> = {
	markdown: 0, 'csv-segment': 0, 'csv-row': 0, image: 0, pdf: 0, audio: 0, video: 0,
};

function makeFreq(codes = ['A', 'B', 'C']): FrequencyResult[] {
	return codes.map((code, i) => ({
		code,
		color: `#${i}00`,
		total: (i + 1) * 5,
		bySource: { ...allSourcesZero, markdown: (i + 1) * 5 },
		byFile: { 'f.md': (i + 1) * 5 },
	}));
}

function makeCooc(codes = ['A', 'B', 'C']): CooccurrenceResult {
	const n = codes.length;
	const matrix = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 5 : 2)),
	);
	return { codes, colors: codes.map((_, i) => `#${i}00`), matrix, maxValue: 5 };
}

function makeDocMatrix(): DocCodeMatrixResult {
	return {
		files: ['f1.md', 'f2.md'],
		codes: ['A', 'B'],
		colors: ['#f00', '#0f0'],
		matrix: [[3, 1], [2, 4]],
		maxValue: 4,
	};
}

function makeTemporal(): TemporalResult {
	return {
		codes: ['A'],
		colors: ['#f00'],
		series: [{ code: 'A', color: '#f00', points: [{ date: 1000, count: 3 }, { date: 2000, count: 5 }] }],
		dateRange: [1000, 2000],
	};
}

function makeLag(): LagResult {
	return {
		codes: ['A', 'B'],
		colors: ['#f00', '#0f0'],
		lag: 1,
		transitions: [[2, 3], [1, 4]],
		expected: [[2.5, 2.5], [2.5, 2.5]],
		zScores: [[0.5, -0.5], [-0.5, 0.5]],
		totalTransitions: 10,
	};
}

function makeEvolution(): EvolutionResult {
	return {
		codes: ['A', 'B'],
		colors: ['#f00', '#0f0'],
		points: [
			{ code: 'A', color: '#f00', file: 'f.md', position: 0.2, fromLine: 1, toLine: 5, markerId: 'm1' },
			{ code: 'B', color: '#0f0', file: 'f.md', position: 0.7, fromLine: 10, toLine: 15, markerId: 'm2' },
		],
		files: ['f.md'],
	};
}

function createMockCtx(overrides = {}): any {
	return {
		plugin: { app: { vault: {} } },
		data: {
			markers: [{ id: 'm1', source: 'markdown', file: 'f.md', codes: ['A'] }],
			codes: [
				{ name: 'A', color: '#f00', sources: ['markdown'] },
				{ name: 'B', color: '#0f0', sources: ['markdown'] },
			],
			sources: ['markdown'],
			files: ['f.md'],
		},
		enabledSources: new Set(['markdown']),
		enabledCodes: new Set(['A', 'B']),
		polarFocalCode: 'A',
		polarMaxLag: 3,
		chiGroupBy: 'source',
		dendrogramMode: 'codes',
		dendrogramCutDistance: 0.5,
		dtOutcomeCode: 'A',
		dtMaxDepth: 3,
		displayMode: 'absolute',
		cooccSortMode: 'alpha',
		buildFilterConfig: () => ({
			sources: ['markdown'] as SourceType[],
			codes: ['A', 'B'],
			excludeCodes: [],
			minFrequency: 1,
		}),
		scheduleUpdate: vi.fn(),
		...overrides,
	};
}

const defaultFilters: FilterConfig = {
	sources: ['markdown'],
	codes: ['A', 'B'],
	excludeCodes: [],
	minFrequency: 1,
};

// ── Tests ───────────────────────────────────────────────────────────

describe('renderMini* functions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Group 1: Simple data ─────────────────────────────────────

	describe('renderMiniFrequency', () => {
		it('returns early with empty data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniFrequency(canvas, []);
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniFrequency(canvas, makeFreq());
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});

	describe('renderMiniCooccurrence', () => {
		it('returns early with insufficient data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniCooccurrence(canvas, { codes: ['A'], colors: ['#f00'], matrix: [[1]], maxValue: 1 });
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniCooccurrence(canvas, makeCooc());
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});

	describe('renderMiniNetwork', () => {
		it('returns early with insufficient data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniNetwork(canvas, { codes: ['A'], colors: ['#f00'], matrix: [[1]], maxValue: 1 }, makeFreq(['A']));
			expect(ctx.beginPath).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniNetwork(canvas, makeCooc(), makeFreq());
			expect(ctx.beginPath).toHaveBeenCalled();
		});
	});

	describe('renderMiniDocMatrix', () => {
		it('returns early with empty files', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniDocMatrix(canvas, { files: [], codes: ['A'], colors: ['#f00'], matrix: [], maxValue: 0 });
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniDocMatrix(canvas, makeDocMatrix());
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});

	describe('renderMiniTemporal', () => {
		it('returns early with empty series', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniTemporal(canvas, { codes: [], colors: [], series: [], dateRange: [0, 0] });
			expect(ctx.beginPath).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniTemporal(canvas, makeTemporal());
			expect(ctx.beginPath).toHaveBeenCalled();
		});
	});

	describe('renderMiniLag', () => {
		it('returns early with insufficient codes', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniLag(canvas, { codes: ['A'], colors: ['#f00'], lag: 1, transitions: [[1]], expected: [[1]], zScores: [[0]], totalTransitions: 1 });
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniLag(canvas, makeLag());
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});

	describe('renderMiniEvolution', () => {
		it('returns early with empty data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniEvolution(canvas, { codes: [], colors: [], points: [], files: [] });
			expect(ctx.fillRect).not.toHaveBeenCalled();
			expect(ctx.beginPath).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniEvolution(canvas, makeEvolution());
			expect(ctx.beginPath).toHaveBeenCalled();
		});
	});

	describe('renderMiniTextStats', () => {
		it('returns early with empty data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniTextStats(canvas, []);
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniTextStats(canvas, makeFreq());
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});

	describe('renderMiniMDS', () => {
		it('returns early with fewer than 3 codes', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniMDS(canvas, makeFreq(['A', 'B']));
			expect(ctx.beginPath).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniMDS(canvas, makeFreq(['A', 'B', 'C', 'D']));
			expect(ctx.beginPath).toHaveBeenCalled();
		});
	});

	describe('renderMiniWordCloud', () => {
		it('returns early with empty data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniWordCloud(canvas, []);
			expect(ctx.fillText).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			renderMiniWordCloud(canvas, makeFreq());
			expect(ctx.fillText).toHaveBeenCalled();
		});
	});

	// ── Group 2: Context-aware ───────────────────────────────────

	describe('renderMiniPolar', () => {
		it('returns early with no data', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx({ data: null });
			renderMiniPolar(mockCtx, canvas, defaultFilters);
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid context', () => {
			const mockPolarResult = {
				focalCode: 'A',
				focalColor: '#f00',
				vectors: [
					{ code: 'B', color: '#0f0', zProspective: 1.5, zRetrospective: 2.1, radius: 2.58, angle: 54.5, quadrant: 1 as const, significant: true },
				],
				maxLag: 3,
			};
			vi.mocked(calculatePolarCoordinates).mockReturnValue(mockPolarResult);

			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx();
			renderMiniPolar(mockCtx, canvas, defaultFilters);
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});

	describe('renderMiniACM', () => {
		it('returns early with no data', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx({ data: null });
			renderMiniACM(canvas, mockCtx, defaultFilters);
			expect(ctx.beginPath).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid context', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx({
				data: {
					markers: [
						{ id: 'm1', source: 'markdown', file: 'f.md', codes: ['A', 'B'] },
						{ id: 'm2', source: 'markdown', file: 'f.md', codes: ['B'] },
						{ id: 'm3', source: 'markdown', file: 'g.md', codes: ['A'] },
					],
					codes: [
						{ name: 'A', color: '#f00', sources: ['markdown'] },
						{ name: 'B', color: '#0f0', sources: ['markdown'] },
					],
					sources: ['markdown'],
					files: ['f.md', 'g.md'],
				},
			});
			renderMiniACM(canvas, mockCtx, defaultFilters);
			expect(ctx.beginPath).toHaveBeenCalled();
		});
	});

	describe('renderMiniDendrogram', () => {
		it('returns early with no data', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx({ data: null });
			renderMiniDendrogram(mockCtx, canvas, defaultFilters);
			expect(ctx.beginPath).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid context', () => {
			const mockCooc: CooccurrenceResult = {
				codes: ['A', 'B', 'C'],
				colors: ['#f00', '#0f0', '#00f'],
				matrix: [[5, 2, 1], [2, 3, 1], [1, 1, 4]],
				maxValue: 5,
			};
			vi.mocked(calculateCooccurrence).mockReturnValue(mockCooc);

			const mockRoot = {
				id: 2,
				left: { id: 0, left: null, right: null, distance: 0, leafIndices: [0], label: 'A', color: '#f00' },
				right: {
					id: 3,
					left: { id: 1, left: null, right: null, distance: 0, leafIndices: [1], label: 'B', color: '#0f0' },
					right: { id: 2, left: null, right: null, distance: 0, leafIndices: [2], label: 'C', color: '#00f' },
					distance: 0.4,
					leafIndices: [1, 2],
				},
				distance: 0.7,
				leafIndices: [0, 1, 2],
			};
			vi.mocked(buildDendrogram).mockReturnValue(mockRoot as any);

			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx();
			renderMiniDendrogram(mockCtx, canvas, defaultFilters);
			expect(ctx.beginPath).toHaveBeenCalled();
		});
	});

	describe('renderMiniDecisionTree', () => {
		it('returns early with no data', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx({ data: null });
			renderMiniDecisionTree(mockCtx, canvas, defaultFilters);
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid context', () => {
			const mockResult = {
				outcomeCode: 'A',
				outcomeColor: '#f00',
				root: {
					id: 0, depth: 0, n: 10, nPositive: 6, nNegative: 4,
					prediction: 1, accuracy: 0.6, correct: 6, errors: 4,
					children: [], split: null,
				},
				accuracy: 0.6,
				aPriori: 0.5,
				tau: 0.2,
				importance: [],
			};
			vi.mocked(buildDecisionTree).mockReturnValue(mockResult as any);

			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx();
			renderMiniDecisionTree(mockCtx, canvas, defaultFilters);
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});

	describe('renderMiniChiSquare', () => {
		it('returns early with no data', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx({ data: null });
			renderMiniChiSquare(mockCtx, canvas, defaultFilters);
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid context', () => {
			const mockResult = {
				groupBy: 'source' as const,
				categories: ['markdown', 'pdf'],
				entries: [
					{
						code: 'A', color: '#f00', chiSquare: 5, df: 1, pValue: 0.02,
						cramersV: 0.4, significant: true, observed: [[3, 2]], expected: [[2.5, 2.5]],
					},
				],
			};
			vi.mocked(calculateChiSquare).mockReturnValue(mockResult);

			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx();
			renderMiniChiSquare(mockCtx, canvas, defaultFilters);
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});

	describe('renderMiniSourceComparison', () => {
		it('returns early with empty freq', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx();
			renderMiniSourceComparison(mockCtx, canvas, []);
			expect(ctx.fillText).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx();
			renderMiniSourceComparison(mockCtx, canvas, makeFreq());
			expect(ctx.fillText).toHaveBeenCalled();
		});
	});

	// ── Group 3: Special ─────────────────────────────────────────

	describe('renderMiniMatrix', () => {
		it('returns early with fewer than 2 codes', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx();
			renderMiniMatrix(mockCtx, canvas, ['A'], ['#f00'], [[1]], 1);
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it('draws on canvas with valid data', () => {
			const { canvas, ctx } = createMockCanvas();
			const mockCtx = createMockCtx();
			renderMiniMatrix(mockCtx, canvas, ['A', 'B'], ['#f00', '#0f0'], [[3, 1], [1, 4]], 4);
			expect(ctx.fillRect).toHaveBeenCalled();
		});
	});
});
