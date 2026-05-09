import { describe, it, expect } from 'vitest';
import { reportKappa, type EngineKappaInput } from '../../../src/core/icr/reporter';

describe('reportKappa', () => {
	it('returns per-engine + aggregate when multiple engines have data', () => {
		const inputs: EngineKappaInput[] = [
			{
				engine: 'markdown',
				kappaInput: {
					markers: [
						{ coderId: 'a', range: { fileId: 'f1.md', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
						{ coderId: 'b', range: { fileId: 'f1.md', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
					],
					sources: [{ fileId: 'f1.md', locator: '', totalUnits: 20 }],
					coders: ['a', 'b'],
				},
			},
			{
				engine: 'pdf',
				kappaInput: {
					markers: [
						{ coderId: 'a', range: { fileId: 'f1.pdf', locator: 'page:1', from: 0, to: 5 }, codeIds: ['c1'] },
						{ coderId: 'b', range: { fileId: 'f1.pdf', locator: 'page:1', from: 5, to: 10 }, codeIds: ['c1'] },
					],
					sources: [{ fileId: 'f1.pdf', locator: 'page:1', totalUnits: 20 }],
					coders: ['a', 'b'],
				},
			},
		];

		const r = reportKappa(inputs);
		expect(r.byEngine.markdown?.cohenKappa['a|b']).toBeCloseTo(1.0, 3);
		expect(r.byEngine.pdf?.cohenKappa['a|b']).toBeLessThan(0.5);
		// Aggregate: weighted average por #markers (markdown=2, pdf=2 — média simples)
		expect(r.aggregate.cohenKappa['a|b']).toBeGreaterThan(0);
		expect(r.aggregate.cohenKappa['a|b']).toBeLessThan(1);
	});

	it('weights array reflects markers per engine', () => {
		const inputs: EngineKappaInput[] = [
			{
				engine: 'markdown',
				kappaInput: {
					markers: [
						{ coderId: 'a', range: { fileId: 'f1.md', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
					],
					sources: [{ fileId: 'f1.md', locator: '', totalUnits: 20 }],
					coders: ['a'],
				},
			},
			{
				engine: 'csvSegment',
				kappaInput: {
					markers: [
						{ coderId: 'a', range: { fileId: 'f1.csv', locator: 'row:0|col:r', from: 0, to: 5 }, codeIds: ['c1'] },
						{ coderId: 'a', range: { fileId: 'f1.csv', locator: 'row:1|col:r', from: 0, to: 5 }, codeIds: ['c1'] },
						{ coderId: 'a', range: { fileId: 'f1.csv', locator: 'row:2|col:r', from: 0, to: 5 }, codeIds: ['c1'] },
					],
					sources: [{ fileId: 'f1.csv', locator: 'row:0|col:r', totalUnits: 10 }],
					coders: ['a'],
				},
			},
		];

		const r = reportKappa(inputs);
		expect(r.weights.markdown).toBe(1);
		expect(r.weights.csvSegment).toBe(3);
	});

	it('aggregate is vacuous (1) when all engines have 0 markers', () => {
		const inputs: EngineKappaInput[] = [
			{
				engine: 'markdown',
				kappaInput: {
					markers: [],
					sources: [{ fileId: 'f1.md', locator: '', totalUnits: 10 }],
					coders: ['a', 'b'],
				},
			},
		];
		const r = reportKappa(inputs);
		expect(r.aggregate.fleissKappa).toBe(1);
	});

	it('emits aggregateWarning when mixing chars + seconds engines', () => {
		const inputs: EngineKappaInput[] = [
			{
				engine: 'markdown',
				kappaInput: {
					markers: [{ coderId: 'a', range: { fileId: 'f.md', locator: '', from: 0, to: 5 }, codeIds: ['c1'] }],
					sources: [{ fileId: 'f.md', locator: '', totalUnits: 100 }],
					coders: ['a'],
				},
			},
			{
				engine: 'audio',
				kappaInput: {
					markers: [{ coderId: 'a', range: { fileId: 'f.mp3', locator: 'audio', from: 0, to: 5 }, codeIds: ['c1'] }],
					sources: [{ fileId: 'f.mp3', locator: 'audio', totalUnits: 60 }],
					coders: ['a'],
				},
			},
		];
		const r = reportKappa(inputs);
		expect(r.aggregateWarnings.length).toBeGreaterThan(0);
		expect(r.aggregateWarnings[0]).toContain('incomparable units');
	});

	it('does NOT emit aggregateWarning when only same-unit-family engines', () => {
		const inputs: EngineKappaInput[] = [
			{
				engine: 'markdown',
				kappaInput: {
					markers: [{ coderId: 'a', range: { fileId: 'f.md', locator: '', from: 0, to: 5 }, codeIds: ['c1'] }],
					sources: [{ fileId: 'f.md', locator: '', totalUnits: 100 }],
					coders: ['a'],
				},
			},
			{
				engine: 'pdf',
				kappaInput: {
					markers: [{ coderId: 'a', range: { fileId: 'f.pdf', locator: 'page:1', from: 0, to: 5 }, codeIds: ['c1'] }],
					sources: [{ fileId: 'f.pdf', locator: 'page:1', totalUnits: 100 }],
					coders: ['a'],
				},
			},
		];
		const r = reportKappa(inputs);
		expect(r.aggregateWarnings.length).toBe(0);
	});
});
