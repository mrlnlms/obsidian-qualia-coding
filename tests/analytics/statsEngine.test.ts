import { describe, it, expect } from 'vitest';
import {
	calculateFrequency,
	calculateCooccurrence,
	calculateDocumentCodeMatrix,
	calculateEvolution,
	calculateTemporal,
	calculateTextStats,
	calculateSourceComparison,
	calculateOverlap,
	calculateChiSquare,
	calculateLagSequential,
	calculatePolarCoordinates,
} from '../../src/analytics/data/statsEngine';
import type {
	ConsolidatedData,
	FilterConfig,
	UnifiedMarker,
	UnifiedCode,
	SourceType,
} from '../../src/analytics/data/dataTypes';
import type { ExtractedSegment } from '../../src/analytics/data/textExtractor';

function createFilters(overrides: Partial<FilterConfig> = {}): FilterConfig {
	return {
		sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
		codes: [],
		excludeCodes: [],
		minFrequency: 1,
		...overrides,
	};
}

function makeMarker(id: string, source: SourceType, file: string, codes: string[], meta?: UnifiedMarker['meta']): UnifiedMarker {
	return { id, source, file, codes, meta };
}

function makeCode(name: string, color: string = '#6200EE'): UnifiedCode {
	return { name, color, sources: ['markdown'] };
}

function createTestData(markers: UnifiedMarker[], codes: UnifiedCode[]): ConsolidatedData {
	return {
		markers,
		codes,
		sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false },
		lastUpdated: Date.now(),
	};
}

// ── calculateFrequency ────────────────────────────────────────

describe('calculateFrequency', () => {
	it('returns empty for empty data', () => {
		const data = createTestData([], []);
		expect(calculateFrequency(data, createFilters())).toEqual([]);
	});

	it('counts a single code', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['codeA'])],
			[makeCode('codeA', '#AAA')],
		);
		const result = calculateFrequency(data, createFilters());
		expect(result).toHaveLength(1);
		expect(result[0].code).toBe('codeA');
		expect(result[0].total).toBe(1);
		expect(result[0].color).toBe('#AAA');
	});

	it('counts multiple codes across markers', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['codeA', 'codeB']),
				makeMarker('m2', 'markdown', 'f1', ['codeA']),
				makeMarker('m3', 'pdf', 'f2', ['codeB']),
			],
			[makeCode('codeA', '#A'), makeCode('codeB', '#B')],
		);
		const result = calculateFrequency(data, createFilters());
		const freqA = result.find(r => r.code === 'codeA')!;
		const freqB = result.find(r => r.code === 'codeB')!;
		expect(freqA.total).toBe(2);
		expect(freqB.total).toBe(2);
	});

	it('filters by source', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['codeA']),
				makeMarker('m2', 'pdf', 'f2', ['codeA']),
			],
			[makeCode('codeA')],
		);
		const result = calculateFrequency(data, createFilters({ sources: ['pdf'] }));
		expect(result).toHaveLength(1);
		expect(result[0].total).toBe(1);
		expect(result[0].bySource.pdf).toBe(1);
		expect(result[0].bySource.markdown).toBe(0);
	});

	it('respects minFrequency filter', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['rare'])],
			[makeCode('rare')],
		);
		const result = calculateFrequency(data, createFilters({ minFrequency: 2 }));
		expect(result).toEqual([]);
	});

	it('respects excludeCodes filter', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['keep', 'exclude']),
			],
			[makeCode('keep'), makeCode('exclude')],
		);
		const result = calculateFrequency(data, createFilters({ excludeCodes: ['exclude'] }));
		expect(result).toHaveLength(1);
		expect(result[0].code).toBe('keep');
	});

	it('tracks byFile counts', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['codeA']),
				makeMarker('m2', 'markdown', 'f2', ['codeA']),
				makeMarker('m3', 'markdown', 'f1', ['codeA']),
			],
			[makeCode('codeA')],
		);
		const result = calculateFrequency(data, createFilters());
		expect(result[0].byFile['f1']).toBe(2);
		expect(result[0].byFile['f2']).toBe(1);
	});
});

// ── calculateCooccurrence ─────────────────────────────────────

describe('calculateCooccurrence', () => {
	it('returns empty for no markers', () => {
		const data = createTestData([], []);
		const result = calculateCooccurrence(data, createFilters());
		expect(result.codes).toEqual([]);
		expect(result.matrix).toEqual([]);
	});

	it('counts pairwise co-occurrence', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['A', 'B'])],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateCooccurrence(data, createFilters());
		expect(result.codes).toEqual(['A', 'B']);
		// Diagonal = frequency, off-diagonal = co-occurrence
		const ai = result.codes.indexOf('A');
		const bi = result.codes.indexOf('B');
		expect(result.matrix[ai][ai]).toBe(1); // A frequency
		expect(result.matrix[bi][bi]).toBe(1); // B frequency
		expect(result.matrix[ai][bi]).toBe(1); // co-occurrence
		expect(result.matrix[bi][ai]).toBe(1); // symmetric
	});

	it('no co-occurrence when codes are on separate markers', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f1', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateCooccurrence(data, createFilters());
		const ai = result.codes.indexOf('A');
		const bi = result.codes.indexOf('B');
		expect(result.matrix[ai][bi]).toBe(0);
	});

	it('excludes self-cooccurrence in off-diagonal', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['A'])],
			[makeCode('A')],
		);
		const result = calculateCooccurrence(data, createFilters());
		// Only diagonal entry
		expect(result.codes).toEqual(['A']);
		expect(result.matrix[0][0]).toBe(1);
	});
});

// ── calculateDocumentCodeMatrix ───────────────────────────────

describe('calculateDocumentCodeMatrix', () => {
	it('returns empty for no markers', () => {
		const data = createTestData([], []);
		const result = calculateDocumentCodeMatrix(data, createFilters());
		expect(result.files).toEqual([]);
		expect(result.codes).toEqual([]);
	});

	it('builds matrix for single doc', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f1', ['A', 'B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateDocumentCodeMatrix(data, createFilters());
		expect(result.files).toEqual(['f1']);
		const ai = result.codes.indexOf('A');
		const bi = result.codes.indexOf('B');
		expect(result.matrix[0][ai]).toBe(2); // A appears in 2 markers
		expect(result.matrix[0][bi]).toBe(1); // B appears in 1 marker
	});

	it('builds matrix for multiple docs', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f2', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateDocumentCodeMatrix(data, createFilters());
		expect(result.files).toHaveLength(2);
		expect(result.codes).toHaveLength(2);
	});
});

// ── calculateEvolution ────────────────────────────────────────

describe('calculateEvolution', () => {
	it('returns empty for no markers with position', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['A'])],
			[makeCode('A')],
		);
		const result = calculateEvolution(data, createFilters());
		expect(result.points).toEqual([]);
	});

	it('produces points for markers with fromLine', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A'], { fromLine: 5, toLine: 10 }),
				makeMarker('m2', 'markdown', 'f1', ['A'], { fromLine: 1, toLine: 3 }),
			],
			[makeCode('A')],
		);
		const result = calculateEvolution(data, createFilters());
		expect(result.points).toHaveLength(2);
		// Points should be sorted by position
		expect(result.points[0].fromLine).toBeLessThanOrEqual(result.points[1].fromLine);
	});

	it('returns sorted files list', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'z-file', ['A'], { fromLine: 1 }),
				makeMarker('m2', 'markdown', 'a-file', ['A'], { fromLine: 1 }),
			],
			[makeCode('A')],
		);
		const result = calculateEvolution(data, createFilters());
		expect(result.files).toEqual(['a-file', 'z-file']);
	});
});

// ── calculateTemporal ─────────────────────────────────────────

describe('calculateTemporal', () => {
	it('returns empty for markers without createdAt', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['A'])],
			[makeCode('A')],
		);
		const result = calculateTemporal(data, createFilters());
		expect(result.codes).toEqual([]);
		expect(result.series).toEqual([]);
	});

	it('builds cumulative series from timestamps', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A'], { createdAt: 1000 }),
				makeMarker('m2', 'markdown', 'f1', ['A'], { createdAt: 2000 }),
				makeMarker('m3', 'markdown', 'f1', ['A'], { createdAt: 3000 }),
			],
			[makeCode('A')],
		);
		const result = calculateTemporal(data, createFilters());
		expect(result.codes).toEqual(['A']);
		expect(result.series).toHaveLength(1);
		const points = result.series[0].points;
		expect(points).toHaveLength(3);
		expect(points[0].count).toBe(1);
		expect(points[1].count).toBe(2);
		expect(points[2].count).toBe(3);
	});

	it('sets correct dateRange', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A'], { createdAt: 500 }),
				makeMarker('m2', 'markdown', 'f1', ['A'], { createdAt: 5000 }),
			],
			[makeCode('A')],
		);
		const result = calculateTemporal(data, createFilters());
		expect(result.dateRange).toEqual([500, 5000]);
	});

	it('respects filters.codes — only includes specified codes', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A', 'B'], { createdAt: 1000 }),
				makeMarker('m2', 'markdown', 'f1', ['B'], { createdAt: 2000 }),
			],
			[makeCode('A'), makeCode('B')],
		);
		const filters = createFilters({ codes: ['A'] });
		const result = calculateTemporal(data, filters);
		// Only A should appear, not B
		expect(result.codes).toEqual(['A']);
		expect(result.series).toHaveLength(1);
		expect(result.series[0].code).toBe('A');
	});

	it('returns [0, 0] dateRange for empty qualified codes', () => {
		const data = createTestData([], []);
		const result = calculateTemporal(data, createFilters());
		expect(result.dateRange).toEqual([0, 0]);
	});
});

// ── calculateTextStats ────────────────────────────────────────

describe('calculateTextStats', () => {
	it('returns empty for no segments', () => {
		const result = calculateTextStats([], new Map());
		expect(result.codes).toEqual([]);
		expect(result.global.totalSegments).toBe(0);
		expect(result.global.totalWords).toBe(0);
	});

	it('counts words and characters', () => {
		const segments: ExtractedSegment[] = [
			{ markerId: 'm1', source: 'markdown', file: 'f1', codes: ['A'], text: 'hello world foo' },
		];
		const colors = new Map([['A', '#AAA']]);
		const result = calculateTextStats(segments, colors);
		expect(result.codes).toHaveLength(1);
		expect(result.codes[0].totalWords).toBe(3);
		expect(result.codes[0].uniqueWords).toBe(3);
		expect(result.codes[0].segmentCount).toBe(1);
		expect(result.codes[0].color).toBe('#AAA');
	});

	it('calculates TTR (type-token ratio)', () => {
		const segments: ExtractedSegment[] = [
			{ markerId: 'm1', source: 'markdown', file: 'f1', codes: ['A'], text: 'the the the cat' },
		];
		const result = calculateTextStats(segments, new Map());
		// 4 total words, 2 unique (the, cat)
		expect(result.codes[0].totalWords).toBe(4);
		expect(result.codes[0].uniqueWords).toBe(2);
		expect(result.codes[0].ttr).toBe(0.5);
	});

	it('skips image source segments', () => {
		const segments: ExtractedSegment[] = [
			{ markerId: 'm1', source: 'image', file: 'f1', codes: ['A'], text: 'should be skipped' },
		];
		const result = calculateTextStats(segments, new Map());
		expect(result.codes).toEqual([]);
	});

	it('computes global stats across codes', () => {
		const segments: ExtractedSegment[] = [
			{ markerId: 'm1', source: 'markdown', file: 'f1', codes: ['A'], text: 'hello world' },
			{ markerId: 'm2', source: 'markdown', file: 'f1', codes: ['B'], text: 'foo bar' },
		];
		const result = calculateTextStats(segments, new Map());
		expect(result.global.totalSegments).toBe(2);
		expect(result.global.totalWords).toBe(4);
	});

	it('handles segments with empty text', () => {
		const segments: ExtractedSegment[] = [
			{ markerId: 'm1', source: 'markdown', file: 'f1', codes: ['A'], text: '' },
		];
		const result = calculateTextStats(segments, new Map());
		expect(result.codes).toEqual([]);
	});
});

// ── calculateSourceComparison ─────────────────────────────────

describe('calculateSourceComparison', () => {
	it('returns empty for no markers', () => {
		const data = createTestData([], []);
		const result = calculateSourceComparison(data, createFilters());
		expect(result.entries).toEqual([]);
		expect(result.activeSources).toEqual([]);
	});

	it('compares codes across source types', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'pdf', 'f2', ['A']),
				makeMarker('m3', 'markdown', 'f1', ['A']),
			],
			[makeCode('A', '#AAA')],
		);
		const result = calculateSourceComparison(data, createFilters());
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].total).toBe(3);
		expect(result.entries[0].bySource.markdown).toBe(2);
		expect(result.entries[0].bySource.pdf).toBe(1);
		expect(result.activeSources).toContain('markdown');
		expect(result.activeSources).toContain('pdf');
	});
});

// ── calculateOverlap ──────────────────────────────────────────

describe('calculateOverlap', () => {
	it('returns empty for no markers', () => {
		const data = createTestData([], []);
		const result = calculateOverlap(data, createFilters());
		expect(result.codes).toEqual([]);
		expect(result.matrix).toEqual([]);
	});

	it('detects overlapping markers', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A'], { fromLine: 1, toLine: 10, fromCh: 0, toCh: 50 }),
				makeMarker('m2', 'markdown', 'f1', ['B'], { fromLine: 5, toLine: 15, fromCh: 0, toCh: 50 }),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateOverlap(data, createFilters());
		const ai = result.codes.indexOf('A');
		const bi = result.codes.indexOf('B');
		// Off-diagonal should be > 0 for overlap
		expect(result.matrix[ai][bi]).toBeGreaterThan(0);
	});

	it('no overlap for non-overlapping markers', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A'], { fromLine: 1, toLine: 5, fromCh: 0, toCh: 50 }),
				makeMarker('m2', 'markdown', 'f1', ['B'], { fromLine: 100, toLine: 110, fromCh: 0, toCh: 50 }),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateOverlap(data, createFilters());
		const ai = result.codes.indexOf('A');
		const bi = result.codes.indexOf('B');
		expect(result.matrix[ai][bi]).toBe(0);
	});

	it('detects overlap for PDF markers on same page (zero-width range)', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'pdf', 'f1', ['A'], { page: 3, fromLine: 3, toLine: 3 }),
				makeMarker('m2', 'pdf', 'f1', ['B'], { page: 3, fromLine: 3, toLine: 3 }),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateOverlap(data, createFilters());
		const ai = result.codes.indexOf('A');
		const bi = result.codes.indexOf('B');
		expect(result.matrix[ai][bi]).toBeGreaterThan(0);
	});

	it('detects overlap for csv-row markers on same row (zero-width range)', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'csv-row', 'f1', ['A'], { row: 5, fromLine: 5, toLine: 5 }),
				makeMarker('m2', 'csv-row', 'f1', ['B'], { row: 5, fromLine: 5, toLine: 5 }),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateOverlap(data, createFilters());
		const ai = result.codes.indexOf('A');
		const bi = result.codes.indexOf('B');
		expect(result.matrix[ai][bi]).toBeGreaterThan(0);
	});

	it('skips image markers and reports in skippedSources', () => {
		const data = createTestData(
			[makeMarker('m1', 'image', 'f1', ['A'])],
			[makeCode('A')],
		);
		const result = calculateOverlap(data, createFilters());
		expect(result.skippedSources).toContain('image');
	});
});

// ── calculateChiSquare ────────────────────────────────────────

describe('calculateChiSquare', () => {
	it('returns empty when fewer than 2 categories', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['A'])],
			[makeCode('A')],
		);
		const result = calculateChiSquare(data, createFilters(), 'source');
		expect(result.entries).toEqual([]);
	});

	it('computes chi-square for code across sources', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f1', ['A']),
				makeMarker('m3', 'pdf', 'f2', ['A']),
				makeMarker('m4', 'pdf', 'f2', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateChiSquare(data, createFilters(), 'source');
		expect(result.categories).toHaveLength(2);
		expect(result.entries.length).toBeGreaterThan(0);
		for (const entry of result.entries) {
			expect(entry.df).toBe(1); // K-1 = 2-1
			expect(entry.chiSquare).toBeGreaterThanOrEqual(0);
			expect(typeof entry.pValue).toBe('number');
			expect(typeof entry.cramersV).toBe('number');
		}
	});

	it('groups by file', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f2', ['A']),
				makeMarker('m3', 'markdown', 'f2', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateChiSquare(data, createFilters(), 'file');
		expect(result.groupBy).toBe('file');
		expect(result.categories).toContain('f1');
		expect(result.categories).toContain('f2');
	});
});

// ── calculateLagSequential ────────────────────────────────────

describe('calculateLagSequential', () => {
	it('returns empty for no markers', () => {
		const data = createTestData([], []);
		const result = calculateLagSequential(data, createFilters(), 1);
		expect(result.codes).toEqual([]);
		expect(result.totalTransitions).toBe(0);
	});

	it('counts transitions at lag 1', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A'], { fromLine: 1 }),
				makeMarker('m2', 'markdown', 'f1', ['B'], { fromLine: 5 }),
				makeMarker('m3', 'markdown', 'f1', ['A'], { fromLine: 10 }),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateLagSequential(data, createFilters(), 1);
		expect(result.lag).toBe(1);
		expect(result.totalTransitions).toBeGreaterThan(0);
		expect(result.codes).toHaveLength(2);
		// Transitions matrix should be NxN
		expect(result.transitions.length).toBe(2);
		expect(result.transitions[0].length).toBe(2);
	});

	it('computes expected and zScores', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A'], { fromLine: 1 }),
				makeMarker('m2', 'markdown', 'f1', ['B'], { fromLine: 5 }),
				makeMarker('m3', 'markdown', 'f1', ['A'], { fromLine: 10 }),
				makeMarker('m4', 'markdown', 'f1', ['B'], { fromLine: 15 }),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateLagSequential(data, createFilters(), 1);
		expect(result.expected.length).toBe(2);
		expect(result.zScores.length).toBe(2);
		// All expected values should be finite numbers
		for (const row of result.expected) {
			for (const val of row) {
				expect(isFinite(val)).toBe(true);
			}
		}
	});

	it('handles lag larger than marker count', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['A'], { fromLine: 1 })],
			[makeCode('A')],
		);
		const result = calculateLagSequential(data, createFilters(), 5);
		expect(result.totalTransitions).toBe(0);
	});
});

// ── calculatePolarCoordinates ─────────────────────────────────

describe('calculatePolarCoordinates', () => {
	it('returns empty vectors for no markers', () => {
		const data = createTestData([], []);
		const result = calculatePolarCoordinates(data, createFilters(), 'A');
		expect(result.vectors).toEqual([]);
		expect(result.focalCode).toBe('A');
	});

	it('returns empty vectors when focal code not found', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['B'], { fromLine: 1 })],
			[makeCode('B')],
		);
		const result = calculatePolarCoordinates(data, createFilters(), 'nonexistent');
		expect(result.vectors).toEqual([]);
	});

	it('computes vectors with radius and angle', () => {
		const markers: UnifiedMarker[] = [];
		// Create enough markers for meaningful lag analysis
		for (let i = 0; i < 20; i++) {
			const code = i % 2 === 0 ? 'A' : 'B';
			markers.push(makeMarker(`m${i}`, 'markdown', 'f1', [code], { fromLine: i * 10 }));
		}
		const data = createTestData(markers, [makeCode('A'), makeCode('B')]);
		const result = calculatePolarCoordinates(data, createFilters(), 'A', 3);
		expect(result.focalCode).toBe('A');
		expect(result.maxLag).toBe(3);
		if (result.vectors.length > 0) {
			const v = result.vectors[0];
			expect(typeof v.radius).toBe('number');
			expect(typeof v.angle).toBe('number');
			expect([1, 2, 3, 4]).toContain(v.quadrant);
			expect(typeof v.significant).toBe('boolean');
		}
	});

	it('excludes focal code from vectors', () => {
		const markers: UnifiedMarker[] = [];
		for (let i = 0; i < 10; i++) {
			markers.push(makeMarker(`m${i}`, 'markdown', 'f1', ['A', 'B'], { fromLine: i }));
		}
		const data = createTestData(markers, [makeCode('A'), makeCode('B')]);
		const result = calculatePolarCoordinates(data, createFilters(), 'A', 2);
		const focalInVectors = result.vectors.find(v => v.code === 'A');
		expect(focalInVectors).toBeUndefined();
	});
});

// ══════════════════════════════════════════════════════════════
// GAP FILLING — expanded coverage for under-tested functions
// ══════════════════════════════════════════════════════════════

// ── applyFilters (tested via calculateFrequency) ─────────────

describe('applyFilters (via calculateFrequency)', () => {
	const allMarkers = [
		makeMarker('m1', 'markdown', 'f1', ['A']),
		makeMarker('m2', 'pdf', 'f2', ['B']),
		makeMarker('m3', 'image', 'f3', ['A', 'B']),
		makeMarker('m4', 'audio', 'f4', ['C']),
	];
	const allCodes = [makeCode('A', '#f00'), makeCode('B', '#0f0'), makeCode('C', '#00f')];

	it('filters by sources', () => {
		const data = createTestData(allMarkers, allCodes);
		const result = calculateFrequency(data, createFilters({ sources: ['markdown'] }));
		// Only markdown markers → only code A
		expect(result.every(r => r.bySource.markdown > 0 || r.count === 0)).toBe(true);
	});

	it('filters by codes', () => {
		const data = createTestData(allMarkers, allCodes);
		const result = calculateFrequency(data, createFilters({ codes: ['A'] }));
		expect(result.map(r => r.code)).toContain('A');
		expect(result.find(r => r.code === 'C')).toBeUndefined();
	});

	it('excludes codes', () => {
		const data = createTestData(allMarkers, allCodes);
		const result = calculateFrequency(data, createFilters({ excludeCodes: ['C'] }));
		expect(result.find(r => r.code === 'C')).toBeUndefined();
	});

	it('empty sources filter returns nothing', () => {
		const data = createTestData(allMarkers, allCodes);
		const result = calculateFrequency(data, createFilters({ sources: [] }));
		expect(result).toEqual([]);
	});

	it('combined sources + codes', () => {
		const data = createTestData(allMarkers, allCodes);
		const result = calculateFrequency(data, createFilters({ sources: ['markdown', 'image'], codes: ['A'] }));
		expect(result).toHaveLength(1);
		expect(result[0].code).toBe('A');
	});

	it('minFrequency affects result count', () => {
		const data = createTestData(allMarkers, allCodes);
		const allResult = calculateFrequency(data, createFilters({ minFrequency: 1 }));
		const filteredResult = calculateFrequency(data, createFilters({ minFrequency: 2 }));
		// Higher minFrequency should return same or fewer results
		expect(filteredResult.length).toBeLessThanOrEqual(allResult.length);
	});
});

// ── calculateSourceComparison (expanded) ─────────────────────

describe('calculateSourceComparison (expanded)', () => {
	it('computes percentages correctly', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f1', ['A']),
				makeMarker('m3', 'pdf', 'f2', ['A']),
				makeMarker('m4', 'pdf', 'f2', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateSourceComparison(data, createFilters());
		const entryA = result.entries.find(e => e.code === 'A')!;
		expect(entryA.total).toBe(3);
		// pct of code: 2/3 markdown, 1/3 pdf
		expect(entryA.bySourcePctOfCode.markdown).toBeCloseTo(66.7, 0);
		expect(entryA.bySourcePctOfCode.pdf).toBeCloseTo(33.3, 0);
	});

	it('handles source with zero markers for a code', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['A'])],
			[makeCode('A')],
		);
		const result = calculateSourceComparison(data, createFilters());
		const entryA = result.entries.find(e => e.code === 'A')!;
		expect(entryA.bySource.pdf).toBe(0);
		expect(entryA.bySource.image).toBe(0);
	});

	it('activeSources only includes sources with markers', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'audio', 'f2', ['A']),
			],
			[makeCode('A')],
		);
		const result = calculateSourceComparison(data, createFilters());
		expect(result.activeSources).toContain('markdown');
		expect(result.activeSources).toContain('audio');
		expect(result.activeSources).not.toContain('pdf');
	});

	it('respects source filter', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'pdf', 'f2', ['A']),
			],
			[makeCode('A')],
		);
		const result = calculateSourceComparison(data, createFilters({ sources: ['markdown'] }));
		const entryA = result.entries.find(e => e.code === 'A')!;
		expect(entryA.total).toBe(1);
		expect(entryA.bySource.pdf).toBe(0);
	});
});

// ── calculateChiSquare (expanded) ────────────────────────────

describe('calculateChiSquare (expanded)', () => {
	it('chi-square value is non-negative', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f1', ['A']),
				makeMarker('m3', 'pdf', 'f2', ['A']),
				makeMarker('m4', 'pdf', 'f2', ['B']),
				makeMarker('m5', 'markdown', 'f1', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateChiSquare(data, createFilters(), 'source');
		for (const e of result.entries) {
			expect(e.chiSquare).toBeGreaterThanOrEqual(0);
		}
	});

	it('p-value is between 0 and 1', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'pdf', 'f2', ['A']),
				makeMarker('m3', 'markdown', 'f1', ['B']),
				makeMarker('m4', 'pdf', 'f2', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateChiSquare(data, createFilters(), 'source');
		for (const e of result.entries) {
			expect(e.pValue).toBeGreaterThanOrEqual(0);
			expect(e.pValue).toBeLessThanOrEqual(1);
		}
	});

	it('Cramers V is between 0 and 1', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'pdf', 'f2', ['A']),
				makeMarker('m3', 'markdown', 'f1', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateChiSquare(data, createFilters(), 'source');
		for (const e of result.entries) {
			expect(e.cramersV).toBeGreaterThanOrEqual(0);
			expect(e.cramersV).toBeLessThanOrEqual(1);
		}
	});

	it('significant flag matches p < 0.05', () => {
		const markers: UnifiedMarker[] = [];
		// Create strong association: A always in markdown, B always in pdf
		for (let i = 0; i < 20; i++) {
			markers.push(makeMarker(`ma${i}`, 'markdown', 'f1', ['A']));
			markers.push(makeMarker(`mb${i}`, 'pdf', 'f2', ['B']));
		}
		const data = createTestData(markers, [makeCode('A'), makeCode('B')]);
		const result = calculateChiSquare(data, createFilters(), 'source');
		for (const e of result.entries) {
			expect(e.significant).toBe(e.pValue < 0.05);
		}
	});
});

// ── calculateDocumentCodeMatrix (expanded) ───────────────────

describe('calculateDocumentCodeMatrix (expanded)', () => {
	it('matrix dimensions match files x codes', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f2', ['B']),
				makeMarker('m3', 'markdown', 'f2', ['A', 'B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateDocumentCodeMatrix(data, createFilters());
		expect(result.files.length).toBeGreaterThanOrEqual(2);
		expect(result.codes.length).toBeGreaterThanOrEqual(2);
		expect(result.matrix.length).toBe(result.files.length);
		expect(result.matrix[0].length).toBe(result.codes.length);
	});

	it('counts markers per file per code correctly', () => {
		const data = createTestData(
			[
				makeMarker('m1', 'markdown', 'f1', ['A']),
				makeMarker('m2', 'markdown', 'f1', ['A']),
				makeMarker('m3', 'markdown', 'f1', ['B']),
			],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateDocumentCodeMatrix(data, createFilters());
		const fileIdx = result.files.indexOf('f1');
		const codeAIdx = result.codes.indexOf('A');
		const codeBIdx = result.codes.indexOf('B');
		expect(result.matrix[fileIdx][codeAIdx]).toBe(2);
		expect(result.matrix[fileIdx][codeBIdx]).toBe(1);
	});

	it('marker with multiple codes counts once per code', () => {
		const data = createTestData(
			[makeMarker('m1', 'markdown', 'f1', ['A', 'B'])],
			[makeCode('A'), makeCode('B')],
		);
		const result = calculateDocumentCodeMatrix(data, createFilters());
		const fileIdx = result.files.indexOf('f1');
		const codeAIdx = result.codes.indexOf('A');
		const codeBIdx = result.codes.indexOf('B');
		expect(result.matrix[fileIdx][codeAIdx]).toBe(1);
		expect(result.matrix[fileIdx][codeBIdx]).toBe(1);
	});
});
