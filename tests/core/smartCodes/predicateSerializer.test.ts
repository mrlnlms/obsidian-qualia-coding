import { describe, it, expect } from 'vitest';
import { predicateToJson, predicateFromJson } from '../../../src/core/smartCodes/predicateSerializer';
import type { PredicateNode } from '../../../src/core/smartCodes/types';

describe('predicateSerializer', () => {
	it('round-trips simple AND predicate', () => {
		const p: PredicateNode = { op: 'AND', children: [
			{ kind: 'hasCode', codeId: 'c_x' },
			{ kind: 'caseVarEquals', variable: 'role', value: 'junior' },
		]};
		const json = predicateToJson(p);
		expect(predicateFromJson(json)).toEqual(p);
	});

	it('round-trips deeply nested with all leaves', () => {
		const p: PredicateNode = { op: 'AND', children: [
			{ op: 'OR', children: [
				{ kind: 'hasCode', codeId: 'c_x' },
				{ kind: 'inFolder', folderId: 'f_x' },
			]},
			{ op: 'NOT', child: { kind: 'magnitudeGte', codeId: 'c_y', n: 3 }},
			{ kind: 'engineType', engine: 'pdf' },
			{ kind: 'smartCode', smartCodeId: 'sc_other' },
		]};
		const json = predicateToJson(p);
		expect(predicateFromJson(json)).toEqual(p);
	});

	it('produces canonical key order (deterministic)', () => {
		const p1: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_x' }]};
		const p2 = JSON.parse(JSON.stringify(p1)) as PredicateNode;
		expect(predicateToJson(p1)).toBe(predicateToJson(p2));
	});

	it('serializa leaf hasCode com codeId antes de kind (alphabetical)', () => {
		const p: PredicateNode = { kind: 'hasCode', codeId: 'c_x' };
		expect(predicateToJson(p)).toBe('{"codeId":"c_x","kind":"hasCode"}');
	});
});
