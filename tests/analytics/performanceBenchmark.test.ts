/**
 * Performance benchmark for analytics calculate* functions.
 *
 * Generates synthetic ConsolidatedData at various scales and measures
 * execution time. Results are logged to console — thresholds are generous
 * (tests always pass unless something is catastrophically slow).
 *
 * Run with: npx vitest run tests/analytics/performanceBenchmark.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
	calculateFrequency,
	calculateCooccurrence,
	calculateDocumentCodeMatrix,
	calculateEvolution,
	calculateTemporal,
	calculateTextStats,
	calculateLagSequential,
	calculatePolarCoordinates,
	calculateChiSquare,
	calculateSourceComparison,
	calculateOverlap,
} from '../../src/analytics/data/statsEngine';
import { calculateMCA } from '../../src/analytics/data/mcaEngine';
import { calculateMDS } from '../../src/analytics/data/mdsEngine';
import { buildDecisionTree } from '../../src/analytics/data/decisionTreeEngine';
import { hierarchicalCluster, buildDendrogram } from '../../src/analytics/data/clusterEngine';
import type { ConsolidatedData, FilterConfig, UnifiedMarker, UnifiedCode, SourceType } from '../../src/analytics/data/dataTypes';
import type { ExtractedSegment } from '../../src/analytics/data/textExtractor';

// ── Synthetic data generator ──────────────────────────────────

const SOURCES: SourceType[] = ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'];
const PALETTE = ['#E53935', '#8E24AA', '#1E88E5', '#43A047', '#FB8C00', '#6D4C41', '#546E7A', '#D81B60', '#00ACC1', '#7CB342'];

function generateData(markerCount: number, codeCount: number, fileCount: number): {
	data: ConsolidatedData;
	filters: FilterConfig;
	segments: ExtractedSegment[];
} {
	const codes: UnifiedCode[] = [];
	for (let c = 0; c < codeCount; c++) {
		codes.push({ name: `code_${c}`, color: PALETTE[c % PALETTE.length]!, sources: ['markdown'] });
	}

	const files: string[] = [];
	for (let f = 0; f < fileCount; f++) {
		files.push(`folder/file_${f}.md`);
	}

	const markers: UnifiedMarker[] = [];
	const baseTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago

	for (let i = 0; i < markerCount; i++) {
		const fileIdx = i % fileCount;
		const source = SOURCES[i % SOURCES.length]!;
		// Each marker gets 1-3 codes
		const numCodes = 1 + (i % 3);
		const markerCodes: string[] = [];
		for (let c = 0; c < numCodes; c++) {
			markerCodes.push(`code_${(i + c) % codeCount}`);
		}

		const fromLine = Math.floor(i / fileCount) * 2;
		const toLine = fromLine + 1;

		markers.push({
			id: `m_${i}`,
			source,
			fileId: files[fileIdx]!,
			codes: markerCodes,
			meta: {
				fromLine,
				toLine,
				fromCh: 0,
				toCh: 20,
				page: i % 10,
				pdfText: `text segment ${i}`,
				audioFrom: i * 0.5,
				audioTo: i * 0.5 + 2,
				videoFrom: i * 0.5,
				videoTo: i * 0.5 + 2,
				row: i % 50,
				column: `col_${i % 5}`,
				createdAt: baseTime + i * 60000, // 1 marker per minute
			},
		});
	}

	const segments: ExtractedSegment[] = markers.map((m) => ({
		markerId: m.id,
		source: m.source,
		fileId: m.fileId,
		codes: m.codes,
		text: `This is synthetic text content for marker ${m.id} with some words for statistics.`,
		fromLine: m.meta?.fromLine,
		toLine: m.meta?.toLine,
	}));

	return {
		data: {
			markers,
			codes,
			sources: { markdown: true, csv: true, image: true, pdf: true, audio: true, video: true },
			lastUpdated: Date.now(),
		},
		filters: {
			sources: [...SOURCES],
			codes: [],
			excludeCodes: [],
			minFrequency: 1,
		},
		segments,
	};
}

// ── Benchmark helper ──────────────────────────────────────────

function bench(label: string, fn: () => void): number {
	const start = performance.now();
	fn();
	const ms = performance.now() - start;
	return ms;
}

async function benchAsync(label: string, fn: () => Promise<void>): Promise<number> {
	const start = performance.now();
	await fn();
	const ms = performance.now() - start;
	return ms;
}

// ── Scales to test ────────────────────────────────────────────

const SCALES = [
	{ markers: 100, codes: 10, files: 10, label: 'small (100 markers)', maxMs: 2000 },
	{ markers: 500, codes: 20, files: 30, label: 'medium (500 markers)', maxMs: 3000 },
	{ markers: 1000, codes: 30, files: 50, label: 'large (1000 markers)', maxMs: 5000 },
	{ markers: 5000, codes: 50, files: 100, label: 'xl (5000 markers)', maxMs: 10000 },
];

// ── Tests ─────────────────────────────────────────────────────

describe('analytics performance benchmark', () => {
	const results: Array<{ scale: string; fn: string; ms: number }> = [];

	for (const scale of SCALES) {
		const { data, filters, segments } = generateData(scale.markers, scale.codes, scale.files);
		const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

		describe(scale.label, () => {
			it('calculateFrequency', () => {
				const ms = bench('frequency', () => calculateFrequency(data, filters));
				results.push({ scale: scale.label, fn: 'frequency', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateCooccurrence', () => {
				const ms = bench('cooccurrence', () => calculateCooccurrence(data, filters));
				results.push({ scale: scale.label, fn: 'cooccurrence', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateDocumentCodeMatrix', () => {
				const ms = bench('docMatrix', () => calculateDocumentCodeMatrix(data, filters));
				results.push({ scale: scale.label, fn: 'docMatrix', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateEvolution', () => {
				const ms = bench('evolution', () => calculateEvolution(data, filters));
				results.push({ scale: scale.label, fn: 'evolution', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateTemporal', () => {
				const ms = bench('temporal', () => calculateTemporal(data, filters));
				results.push({ scale: scale.label, fn: 'temporal', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateTextStats', () => {
				const ms = bench('textStats', () => calculateTextStats(segments, codeColors));
				results.push({ scale: scale.label, fn: 'textStats', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateLagSequential', () => {
				const ms = bench('lagSequential', () => calculateLagSequential(data, filters, 1));
				results.push({ scale: scale.label, fn: 'lagSequential', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculatePolarCoordinates', () => {
				const focalCode = data.codes[0]?.name ?? '';
				const ms = bench('polarCoords', () => calculatePolarCoordinates(data, filters, focalCode, 5));
				results.push({ scale: scale.label, fn: 'polarCoords', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateChiSquare', () => {
				const ms = bench('chiSquare', () => calculateChiSquare(data, filters, 'source'));
				results.push({ scale: scale.label, fn: 'chiSquare', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateSourceComparison', () => {
				const ms = bench('sourceComparison', () => calculateSourceComparison(data, filters));
				results.push({ scale: scale.label, fn: 'sourceComparison', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateOverlap', () => {
				const ms = bench('overlap', () => calculateOverlap(data, filters));
				results.push({ scale: scale.label, fn: 'overlap', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateMCA', async () => {
				const codes = data.codes.map((c) => c.name);
				const colors = data.codes.map((c) => c.color);
				const filtered = data.markers.filter((m) => filters.sources.includes(m.source));
				const ms = await benchAsync('mca', async () => { await calculateMCA(filtered, codes, colors); });
				results.push({ scale: scale.label, fn: 'mca', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('calculateMDS', async () => {
				const filtered = data.markers.filter((m) => filters.sources.includes(m.source));
				const ms = await benchAsync('mds', async () => {
					await calculateMDS(filtered, data.codes, 'codes', [...SOURCES]);
				});
				results.push({ scale: scale.label, fn: 'mds', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('buildDecisionTree', () => {
				const outcome = data.codes[0]?.name ?? '';
				const ms = bench('decisionTree', () => buildDecisionTree(data, filters, outcome, 4, 2));
				results.push({ scale: scale.label, fn: 'decisionTree', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});

			it('hierarchicalCluster (from cooccurrence)', () => {
				const cooc = calculateCooccurrence(data, filters);
				const n = cooc.codes.length;
				// Build Jaccard distance matrix
				const distMatrix: number[][] = [];
				for (let i = 0; i < n; i++) {
					const row: number[] = [];
					for (let j = 0; j < n; j++) {
						if (i === j) { row.push(0); continue; }
						const fi = cooc.matrix[i]![i]!;
						const fj = cooc.matrix[j]![j]!;
						const co = cooc.matrix[i]![j]!;
						const union = fi + fj - co;
						row.push(union > 0 ? 1 - co / union : 1);
					}
					distMatrix.push(row);
				}
				const ms = bench('cluster', () => {
					hierarchicalCluster(distMatrix);
					buildDendrogram(distMatrix, cooc.codes, cooc.colors);
				});
				results.push({ scale: scale.label, fn: 'cluster', ms });
				expect(ms).toBeLessThan(scale.maxMs);
			});
		});
	}

	// Print summary table at the end
	it('prints benchmark summary', () => {
		console.log('\n╔══════════════════════════════════════════════════════════════╗');
		console.log('║              ANALYTICS PERFORMANCE BENCHMARK                ║');
		console.log('╠══════════════════════════════════════════════════════════════╣');
		console.log('║ Scale                  │ Function         │ Time (ms)       ║');
		console.log('╠════════════════════════╪══════════════════╪═════════════════╣');
		for (const r of results) {
			const scale = r.scale.padEnd(22);
			const fn = r.fn.padEnd(16);
			const ms = r.ms.toFixed(1).padStart(8);
			const warn = r.ms > 100 ? ' ⚠️' : r.ms > 50 ? ' ⚡' : '   ';
			console.log(`║ ${scale} │ ${fn} │ ${ms} ms${warn} ║`);
		}
		console.log('╚══════════════════════════════════════════════════════════════╝');
		console.log('Legend: ⚠️ >100ms (investigate)  ⚡ >50ms (watch)');
		expect(true).toBe(true);
	});
});
