import { describe, it, expect } from 'vitest';
import { normalizeOrder, leafCost, nodeCost } from '../../../src/core/smartCodes/predicateNormalizer';

describe('predicateNormalizer', () => {
	it('reordena AND children por custo crescente', () => {
		const result = normalizeOrder({ op: 'AND', children: [
			{ kind: 'smartCode', smartCodeId: 'sc_x' },
			{ kind: 'engineType', engine: 'pdf' },
			{ kind: 'hasCode', codeId: 'c_a' },
		]});
		expect(result).toEqual({ op: 'AND', children: [
			{ kind: 'engineType', engine: 'pdf' },
			{ kind: 'hasCode', codeId: 'c_a' },
			{ kind: 'smartCode', smartCodeId: 'sc_x' },
		]});
	});

	it('preserva semântica em OR', () => {
		const result = normalizeOrder({ op: 'OR', children: [
			{ kind: 'relationExists', codeId: 'c_y' },
			{ kind: 'engineType', engine: 'csv' },
		]});
		expect((result as any).children[0]).toEqual({ kind: 'engineType', engine: 'csv' });
	});

	it('NOT recursivamente normaliza child', () => {
		const result = normalizeOrder({ op: 'NOT', child: { op: 'AND', children: [
			{ kind: 'smartCode', smartCodeId: 'sc_x' },
			{ kind: 'hasCode', codeId: 'c_a' },
		]}});
		expect((result as any).child.children[0].kind).toBe('hasCode');
	});

	it('leafCost: engineType < hasCode < smartCode', () => {
		expect(leafCost({ kind: 'engineType', engine: 'pdf' })).toBeLessThan(leafCost({ kind: 'hasCode', codeId: 'c' }));
		expect(leafCost({ kind: 'hasCode', codeId: 'c' })).toBeLessThan(leafCost({ kind: 'smartCode', smartCodeId: 'sc' }));
	});

	it('nodeCost: AND soma children', () => {
		const cost = nodeCost({ op: 'AND', children: [
			{ kind: 'engineType', engine: 'pdf' },  // 1
			{ kind: 'hasCode', codeId: 'c' },        // 4
		]});
		expect(cost).toBe(5);
	});
});
