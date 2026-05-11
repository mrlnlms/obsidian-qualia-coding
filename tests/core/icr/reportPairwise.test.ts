import { describe, it, expect } from 'vitest';
import { reportPairwise, type EngineKappaInput } from '../../../src/core/icr/reporter';
import type { CoderId } from '../../../src/core/icr/coderTypes';
import type { CodedMarker, KappaInput } from '../../../src/core/icr/kappaInput';

function makeMarkdownInput(coderIds: CoderId[]): EngineKappaInput {
	const markers: CodedMarker[] = coderIds.map(coderId => ({
		coderId,
		range: { fileId: 'f1', locator: '', from: 0, to: 10 },
		codeIds: ['A'],
	}));
	const kappaInput: KappaInput = {
		markers,
		sources: [{ fileId: 'f1', locator: '', totalUnits: 100 }],
		coders: coderIds,
	};
	return { engine: 'markdown', kappaInput };
}

describe('reportPairwise', () => {
	it('retorna 1 report por par solicitado, na ordem pedida', () => {
		const inputs = [makeMarkdownInput(['human:a', 'human:b', 'human:c'])];
		const pairs: [CoderId, CoderId][] = [
			['human:a', 'human:b'],
			['human:a', 'human:c'],
			['human:b', 'human:c'],
		];
		const result = reportPairwise(inputs, pairs);
		expect(result).toHaveLength(3);
		expect(result[0]!.pair).toEqual(['human:a', 'human:b']);
		expect(result[1]!.pair).toEqual(['human:a', 'human:c']);
		expect(result[2]!.pair).toEqual(['human:b', 'human:c']);
	});

	it('Cohen κ aparece em aggregate.cohenKappa quando par concorda perfeitamente', () => {
		const inputs = [makeMarkdownInput(['human:a', 'human:b'])];
		const result = reportPairwise(inputs, [['human:a', 'human:b']]);
		const cohenTable = result[0]!.report.aggregate.cohenKappa;
		const value = cohenTable['human:a|human:b'] ?? cohenTable['human:b|human:a'];
		expect(value).toBeCloseTo(1.0);
	});

	it('Fleiss/α-binary/cu-α calculados sobre input filtrado ao par (excluindo coders fora do par)', () => {
		const inputs = [makeMarkdownInput(['human:a', 'human:b', 'human:c', 'human:d'])];
		const result = reportPairwise(inputs, [['human:a', 'human:b']]);
		expect(result[0]!.report.aggregate.alphaBinary).toBeCloseTo(1.0);
		expect(result[0]!.report.aggregate.cuAlpha).toBeCloseTo(1.0);
	});

	it('par com bounds disjuntos (sem agreement) retorna κ ≤ 0.5', () => {
		const markers: CodedMarker[] = [
			{ coderId: 'human:a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['A'] },
			{ coderId: 'human:b', range: { fileId: 'f1', locator: '', from: 50, to: 55 }, codeIds: ['B'] },
		];
		const input: EngineKappaInput = {
			engine: 'markdown',
			kappaInput: {
				markers,
				sources: [{ fileId: 'f1', locator: '', totalUnits: 100 }],
				coders: ['human:a', 'human:b'],
			},
		};
		const result = reportPairwise([input], [['human:a', 'human:b']]);
		const cohenTable = result[0]!.report.aggregate.cohenKappa;
		const value = cohenTable['human:a|human:b'] ?? cohenTable['human:b|human:a'];
		expect(value === undefined || value <= 0.5).toBe(true);
	});

	it('pares vazios retorna array vazio', () => {
		const inputs = [makeMarkdownInput(['human:a', 'human:b'])];
		expect(reportPairwise(inputs, [])).toEqual([]);
	});

	it('CategoricalKappaInput é filtrado por par via .units (coderId interno)', () => {
		const input: EngineKappaInput = {
			engine: 'csvRow',
			kappaInput: {
				units: [
					{ fileId: 'f.csv', sourceRowId: 1, column: 'col1', codeIds: ['X'], coderId: 'human:a' },
					{ fileId: 'f.csv', sourceRowId: 1, column: 'col1', codeIds: ['X'], coderId: 'human:b' },
					{ fileId: 'f.csv', sourceRowId: 1, column: 'col1', codeIds: ['Y'], coderId: 'human:c' },
				],
				coders: ['human:a', 'human:b', 'human:c'],
			},
		};
		const result = reportPairwise([input], [['human:a', 'human:b']]);
		// a e b concordam → κ alto. c (que diverge) não entra no input filtrado do par.
		const cohenTable = result[0]!.report.aggregate.cohenKappa;
		const value = cohenTable['human:a|human:b'] ?? cohenTable['human:b|human:a'];
		expect(value).toBeCloseTo(1.0);
	});

	describe('perPairInputs (slice E5b followup — bbox weighting)', () => {
		function makeBboxLikeInput(coderIds: [CoderId, CoderId], markersCount: number): EngineKappaInput {
			// Simula KappaInput shape do bbox adapter (markers como "events"): 2 coders concordando.
			const markers: CodedMarker[] = [];
			for (let i = 0; i < markersCount; i++) {
				markers.push({ coderId: coderIds[0], range: { fileId: 's1', locator: `bbox:${i}`, from: i, to: i + 1 }, codeIds: ['X'] });
				markers.push({ coderId: coderIds[1], range: { fileId: 's1', locator: `bbox:${i}`, from: i, to: i + 1 }, codeIds: ['X'] });
			}
			return {
				engine: 'pdfShape',
				kappaInput: {
					markers,
					sources: [{ fileId: 's1', locator: 'bbox:s1', totalUnits: markersCount }],
					coders: [coderIds[0], coderIds[1]],
				},
			};
		}

		it('inputs extras per-pair entram em reportKappa do par; aggregate ponderado por #markers', () => {
			// Text-like: 2 coders, 100 chars, agreement perfeito (κ=1).
			const textInput = makeMarkdownInput(['human:a', 'human:b']);
			// Bbox per-pair: 50 events agreement perfeito (κ=1).
			const bboxInput = makeBboxLikeInput(['human:a', 'human:b'], 50);

			const perPair = new Map<string, EngineKappaInput[]>([['human:a|human:b', [bboxInput]]]);
			const result = reportPairwise([textInput], [['human:a', 'human:b']], undefined, perPair);

			// Ambos engines tem κ=1; aggregate weighted = 1.
			const cohen = result[0]!.report.aggregate.cohenKappa['human:a|human:b']
				?? result[0]!.report.aggregate.cohenKappa['human:b|human:a'];
			expect(cohen).toBeCloseTo(1.0);

			// Confirma que AMBOS engines aparecem em byEngine.
			expect(result[0]!.report.byEngine.markdown).toBeDefined();
			expect(result[0]!.report.byEngine.pdfShape).toBeDefined();
			// Weights refletem #markers (text-like = 2 markers; bbox = 100 markers).
			expect(result[0]!.report.weights.markdown).toBe(2);
			expect(result[0]!.report.weights.pdfShape).toBe(100);
		});

		it('weighted average difere de avg 50/50 quando #markers diverge bruscamente', () => {
			// Text-like com 1000 markers, κ=1 (agreement perfeito artificial — same range)
			const textMarkers: CodedMarker[] = [];
			for (let i = 0; i < 500; i++) {
				textMarkers.push({ coderId: 'human:a', range: { fileId: 'f', locator: '', from: i, to: i + 1 }, codeIds: ['A'] });
				textMarkers.push({ coderId: 'human:b', range: { fileId: 'f', locator: '', from: i, to: i + 1 }, codeIds: ['A'] });
			}
			const textInput: EngineKappaInput = {
				engine: 'markdown',
				kappaInput: { markers: textMarkers, sources: [{ fileId: 'f', locator: '', totalUnits: 1000 }], coders: ['human:a', 'human:b'] },
			};
			// Bbox: 2 events, codes DIFERENTES (κ ≈ 0)
			const bboxMarkers: CodedMarker[] = [
				{ coderId: 'human:a', range: { fileId: 's', locator: 'bbox:0', from: 0, to: 1 }, codeIds: ['X'] },
				{ coderId: 'human:b', range: { fileId: 's', locator: 'bbox:0', from: 0, to: 1 }, codeIds: ['Y'] },
				{ coderId: 'human:a', range: { fileId: 's', locator: 'bbox:1', from: 1, to: 2 }, codeIds: ['X'] },
				{ coderId: 'human:b', range: { fileId: 's', locator: 'bbox:1', from: 1, to: 2 }, codeIds: ['Y'] },
			];
			const bboxInput: EngineKappaInput = {
				engine: 'pdfShape',
				kappaInput: { markers: bboxMarkers, sources: [{ fileId: 's', locator: 'bbox:s', totalUnits: 2 }], coders: ['human:a', 'human:b'] },
			};

			const perPair = new Map<string, EngineKappaInput[]>([['human:a|human:b', [bboxInput]]]);
			const result = reportPairwise([textInput], [['human:a', 'human:b']], undefined, perPair);

			const cohen = result[0]!.report.aggregate.cohenKappa['human:a|human:b']
				?? result[0]!.report.aggregate.cohenKappa['human:b|human:a'];

			// Avg 50/50 antigo daria (1 + 0) / 2 = 0.5
			// Weighted: text=1000 markers κ=1; bbox=4 markers κ≈0; (1*1000 + 0*4) / 1004 ≈ 0.996
			// Confirma que está MUITO mais perto de 1 que de 0.5
			expect(cohen).toBeGreaterThan(0.95);
		});

		it('perPair vazio cai no caminho normal (cohort-only)', () => {
			const inputs = [makeMarkdownInput(['human:a', 'human:b'])];
			const perPair = new Map<string, EngineKappaInput[]>();
			const result = reportPairwise(inputs, [['human:a', 'human:b']], undefined, perPair);
			expect(result).toHaveLength(1);
			expect(result[0]!.report.byEngine.markdown).toBeDefined();
			expect(result[0]!.report.byEngine.pdfShape).toBeUndefined();
		});
	});
});
