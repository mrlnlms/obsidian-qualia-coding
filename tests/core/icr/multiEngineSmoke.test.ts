/**
 * Smoke Slice 4 — multi-engine reporter exercitando 3 unit families:
 * - text-likes (markdown) → chars
 * - temporal (audio) → segundos
 * - categorical (csvRow) → unit pré-definida
 *
 * Verifica que reporter calcula per-engine corretamente + emite
 * aggregateWarnings pra unidades incomparáveis.
 */

import { describe, it, expect } from 'vitest';
import { reportKappa, type EngineKappaInput } from '../../../src/core/icr/reporter';

describe('Slice 4 multi-engine smoke', () => {
	it('handles markdown + audio + csvRow simultaneously with cross-unit warning', () => {
		const inputs: EngineKappaInput[] = [
			// Markdown: per-char overlap
			{
				engine: 'markdown',
				kappaInput: {
					markers: [
						{ coderId: 'a', range: { fileId: 'e1.md', locator: '', from: 0, to: 100 }, codeIds: ['c1'] },
						{ coderId: 'b', range: { fileId: 'e1.md', locator: '', from: 0, to: 100 }, codeIds: ['c1'] },
					],
					sources: [{ fileId: 'e1.md', locator: '', totalUnits: 200 }],
					coders: ['a', 'b'],
				},
			},
			// Audio: temporal seconds
			{
				engine: 'audio',
				kappaInput: {
					markers: [
						{ coderId: 'a', range: { fileId: 'a.mp3', locator: 'audio', from: 10, to: 30 }, codeIds: ['c2'] },
						{ coderId: 'b', range: { fileId: 'a.mp3', locator: 'audio', from: 10, to: 30 }, codeIds: ['c2'] },
					],
					sources: [{ fileId: 'a.mp3', locator: 'audio', totalUnits: 60 }],
					coders: ['a', 'b'],
				},
			},
			// CSV row: categorical
			{
				engine: 'csvRow',
				kappaInput: {
					units: [
						{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
						{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'b' },
						{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'a' },
						{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'b' },
					],
					coders: ['a', 'b'],
				},
			},
		];

		const r = reportKappa(inputs);

		// Per-engine: cada engine teve perfect agreement → cohenKappa['a|b'] === 1.0
		expect(r.byEngine.markdown?.cohenKappa['a|b']).toBeCloseTo(1.0, 2);
		expect(r.byEngine.audio?.cohenKappa['a|b']).toBeCloseTo(1.0, 2);
		expect(r.byEngine.csvRow?.cohenKappa['a|b']).toBeCloseTo(1.0, 2);

		// Categorical engine: alphaBinary/cuAlpha = 1 (vacuous)
		expect(r.byEngine.csvRow?.alphaBinary).toBe(1);
		expect(r.byEngine.csvRow?.cuAlpha).toBe(1);

		// Cross-unit warning
		expect(r.aggregateWarnings.length).toBeGreaterThan(0);
		expect(r.aggregateWarnings[0]).toContain('incomparable units');

		// Aggregate Cohen κ funciona (todos 1, peso ponderado dá 1)
		expect(r.aggregate.cohenKappa['a|b']).toBeCloseTo(1.0, 2);

		// Weights refletem nº de markers (text-likes/temporal) ou nº de units (categorical)
		expect(r.weights.markdown).toBe(2);
		expect(r.weights.audio).toBe(2);
		expect(r.weights.csvRow).toBe(4);
	});

	it('handles audio with boundary disagreement', () => {
		const inputs: EngineKappaInput[] = [
			{
				engine: 'audio',
				kappaInput: {
					// A marca 0-10s, B marca 5-15s. Overlap em 5-10s.
					markers: [
						{ coderId: 'a', range: { fileId: 'a.mp3', locator: 'audio', from: 0, to: 10 }, codeIds: ['c1'] },
						{ coderId: 'b', range: { fileId: 'a.mp3', locator: 'audio', from: 5, to: 15 }, codeIds: ['c1'] },
					],
					sources: [{ fileId: 'a.mp3', locator: 'audio', totalUnits: 30 }],
					coders: ['a', 'b'],
				},
			},
		];
		const r = reportKappa(inputs);
		// Boundary disagreement → κ < 1 mas > 0
		expect(r.byEngine.audio?.cohenKappa['a|b']).toBeLessThan(1);
		// α-binary: chars marked vs not — A marca 10s, B marca 10s, overlap 5s
		expect(r.byEngine.audio?.alphaBinary).toBeLessThan(1);
	});
});
