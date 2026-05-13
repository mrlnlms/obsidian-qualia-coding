import { describe, it, expect } from 'vitest';
import { reportKappa, reportKappaAsync, bumpReportCache, type EngineKappaInput } from '../../../src/core/icr/reporter';

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
		expect(r.byEngine.markdown?.cohenKappa['a|b']?.value).toBeCloseTo(1.0, 3);
		expect(r.byEngine.pdf?.cohenKappa['a|b']?.value).toBeLessThan(0.5);
		// Aggregate: weighted average por #markers (markdown=2, pdf=2 — média simples)
		expect(r.aggregate.cohenKappa['a|b']?.value).toBeGreaterThan(0);
		expect(r.aggregate.cohenKappa['a|b']?.value).toBeLessThan(1);
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

	it('accepts pdfShape and image as engine ids', () => {
		const inputs: EngineKappaInput[] = [
			{ engine: 'pdfShape', kappaInput: { markers: [], sources: [], coders: ['a', 'b'] } },
			{ engine: 'image', kappaInput: { markers: [], sources: [], coders: ['a', 'b'] } },
		];
		const r = reportKappa(inputs);
		expect(r.byEngine.pdfShape).toBeDefined();
		expect(r.byEngine.image).toBeDefined();
	});

	it('propagates distance pra coeficientes paramétricos + cacheKey distingue δ', () => {
		// Cenário multi-label: 3 chars, 2 coders. δ_nominal reduz a 'a' (agreement);
		// δ_jaccard separa subset/lateral (disagreement parcial) → α difere.
		const inputs: EngineKappaInput[] = [{
			engine: 'markdown',
			kappaInput: {
				markers: [
					{ coderId: 'a', range: { fileId: 'multi.md', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
					{ coderId: 'a', range: { fileId: 'multi.md', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b'] },
					{ coderId: 'a', range: { fileId: 'multi.md', locator: '', from: 2, to: 3 }, codeIds: ['a', 'b'] },
					{ coderId: 'b', range: { fileId: 'multi.md', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
					{ coderId: 'b', range: { fileId: 'multi.md', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b', 'c'] },
					{ coderId: 'b', range: { fileId: 'multi.md', locator: '', from: 2, to: 3 }, codeIds: ['a', 'c'] },
				],
				sources: [{ fileId: 'multi.md', locator: '', totalUnits: 3 }],
				coders: ['a', 'b'],
			},
		}];

		bumpReportCache();  // limpa cache pra evitar leak entre tests
		const r_jaccard = reportKappa(inputs, 'distance-test::δ-jaccard', 'jaccard');
		const inputs2 = [{ ...inputs[0]! }];  // ref nova pra burlar WeakMap identity cache
		const r_nominal = reportKappa(inputs2, 'distance-test::δ-nominal', 'nominal');

		// Valores α diferentes — Jaccard separa multi-label que nominal funde.
		expect(r_jaccard.aggregate.alphaNominal).not.toBeCloseTo(r_nominal.aggregate.alphaNominal, 4);

		// Cache hit retorna mesmo valor pra mesma cacheKey
		const inputs3 = [{ ...inputs[0]! }];
		const r_jaccard_again = reportKappa(inputs3, 'distance-test::δ-jaccard', 'jaccard');
		expect(r_jaccard_again.aggregate.alphaNominal).toBe(r_jaccard.aggregate.alphaNominal);
	});

	it('reportKappaAsync (via sync fallback em jsdom) propaga distance', async () => {
		const inputs: EngineKappaInput[] = [{
			engine: 'markdown',
			kappaInput: {
				markers: [
					{ coderId: 'a', range: { fileId: 'multi-async.md', locator: '', from: 0, to: 3 }, codeIds: ['a', 'b'] },
					{ coderId: 'b', range: { fileId: 'multi-async.md', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
					{ coderId: 'b', range: { fileId: 'multi-async.md', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b', 'c'] },
					{ coderId: 'b', range: { fileId: 'multi-async.md', locator: '', from: 2, to: 3 }, codeIds: ['a', 'c'] },
				],
				sources: [{ fileId: 'multi-async.md', locator: '', totalUnits: 3 }],
				coders: ['a', 'b'],
			},
		}];

		bumpReportCache();
		const r_jaccard = await reportKappaAsync(inputs, 'async-test::δ-jaccard', 'jaccard');
		const inputs2 = [{ ...inputs[0]! }];
		const r_nominal = await reportKappaAsync(inputs2, 'async-test::δ-nominal', 'nominal');
		expect(r_jaccard.aggregate.alphaNominal).not.toBeCloseTo(r_nominal.aggregate.alphaNominal, 4);
	});

	it('emits warning when bbox engines combined with text-likes (incomparable units)', () => {
		const inputs: EngineKappaInput[] = [
			{
				engine: 'markdown',
				kappaInput: {
					markers: [{ coderId: 'a', range: { fileId: 'a.md', locator: '', from: 0, to: 5 }, codeIds: ['c1'] }],
					sources: [{ fileId: 'a.md', locator: '', totalUnits: 100 }],
					coders: ['a', 'b'],
				},
			},
			{
				engine: 'pdfShape',
				kappaInput: {
					markers: [{ coderId: 'a', range: { fileId: 'b.pdf:page:1', locator: 'bbox:b.pdf:page:1', from: 0, to: 1 }, codeIds: ['c1'] }],
					sources: [{ fileId: 'b.pdf:page:1', locator: 'bbox:b.pdf:page:1', totalUnits: 5 }],
					coders: ['a', 'b'],
				},
			},
		];
		const r = reportKappa(inputs);
		expect(r.aggregateWarnings.some(w => w.includes('incomparable'))).toBe(true);
	});
});
