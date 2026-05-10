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
});
