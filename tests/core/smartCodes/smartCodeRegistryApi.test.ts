import { describe, it, expect, beforeEach } from 'vitest';
import { SmartCodeApi, rewriteCodeRef, diffPredicateLeaves } from '../../../src/core/smartCodes/smartCodeRegistryApi';
import { createDefaultData } from '../../../src/core/types';
import type { AuditEntry, PredicateNode, QualiaData } from '../../../src/core/types';

describe('SmartCodeApi CRUD', () => {
	let data: QualiaData;
	let auditLog: AuditEntry[];
	let api: SmartCodeApi;

	beforeEach(() => {
		data = createDefaultData();
		auditLog = [];
		api = new SmartCodeApi({
			data,
			auditEmit: (e) => { auditLog.push({ ...e, id: `a${auditLog.length}` } as AuditEntry); },
		});
	});

	it('createSmartCode adiciona ao registry + audit sc_created', () => {
		const sc = api.createSmartCode({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		expect(data.registry.smartCodes[sc.id]).toBeDefined();
		expect(data.registry.smartCodeOrder).toContain(sc.id);
		expect(sc.id.startsWith('sc_')).toBe(true);
		expect(sc.color).toBeTruthy();
		expect(auditLog).toHaveLength(1);
		expect(auditLog[0].type).toBe('sc_created');
	});

	it('createSmartCode com color custom usa paletteIndex -1', () => {
		const sc = api.createSmartCode({ name: 'X', color: '#abc', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		expect(sc.color).toBe('#abc');
		expect(sc.paletteIndex).toBe(-1);
	});

	it('updateSmartCode com predicate change emite sc_predicate_edited', () => {
		const sc = api.createSmartCode({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		auditLog.length = 0;
		api.updateSmartCode(sc.id, { predicate: { kind: 'hasCode', codeId: 'c_b' }});
		expect(auditLog).toHaveLength(1);
		expect(auditLog[0].type).toBe('sc_predicate_edited');
	});

	it('updateSmartCode com memo change emite sc_memo_edited', () => {
		const sc = api.createSmartCode({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }, memo: '' });
		auditLog.length = 0;
		api.updateSmartCode(sc.id, { memo: 'note' });
		expect(auditLog.find(e => e.type === 'sc_memo_edited')).toBeDefined();
	});

	it('setSmartCodeColor não emite audit', () => {
		const sc = api.createSmartCode({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		auditLog.length = 0;
		api.setSmartCodeColor(sc.id, '#abc');
		expect(auditLog).toHaveLength(0);
		expect(data.registry.smartCodes[sc.id].color).toBe('#abc');
	});

	it('deleteSmartCode remove + emite sc_deleted', () => {
		const sc = api.createSmartCode({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		auditLog.length = 0;
		expect(api.deleteSmartCode(sc.id)).toBe(true);
		expect(data.registry.smartCodes[sc.id]).toBeUndefined();
		expect(data.registry.smartCodeOrder).not.toContain(sc.id);
		expect(auditLog[0].type).toBe('sc_deleted');
	});

	it('autoRewriteOnMerge re-escreve hasCode + emite sc_auto_rewritten_on_merge', () => {
		const sc = api.createSmartCode({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_source' }});
		auditLog.length = 0;
		const result = api.autoRewriteOnMerge('c_source', 'c_target');
		expect(result.rewritten).toEqual([sc.id]);
		expect((data.registry.smartCodes[sc.id].predicate as any).codeId).toBe('c_target');
		expect(auditLog[0].type).toBe('sc_auto_rewritten_on_merge');
	});

	it('autoRewriteOnMerge não toca smart code que não referencia source', () => {
		const sc = api.createSmartCode({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_other' }});
		const result = api.autoRewriteOnMerge('c_source', 'c_target');
		expect(result.rewritten).toEqual([]);
		expect((data.registry.smartCodes[sc.id].predicate as any).codeId).toBe('c_other');
	});

	it('listSmartCodes respeita smartCodeOrder', () => {
		const a = api.createSmartCode({ name: 'A', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		const b = api.createSmartCode({ name: 'B', predicate: { kind: 'hasCode', codeId: 'c_b' }});
		expect(api.listSmartCodes().map(s => s.id)).toEqual([a.id, b.id]);
	});
});

describe('rewriteCodeRef', () => {
	it('substitui hasCode.codeId quando match', () => {
		const result = rewriteCodeRef({ kind: 'hasCode', codeId: 'c_a' }, 'c_a', 'c_b');
		expect(result).toEqual({ kind: 'hasCode', codeId: 'c_b' });
	});

	it('returns mesma referência quando não match (preserva identity)', () => {
		const node: PredicateNode = { kind: 'hasCode', codeId: 'c_x' };
		const result = rewriteCodeRef(node, 'c_a', 'c_b');
		expect(result).toBe(node);
	});

	it('walks AND/OR/NOT recursivamente', () => {
		const result = rewriteCodeRef(
			{ op: 'AND', children: [
				{ kind: 'hasCode', codeId: 'c_a' },
				{ op: 'OR', children: [{ kind: 'magnitudeGte', codeId: 'c_a', n: 3 }, { kind: 'hasCode', codeId: 'c_x' }]},
			]},
			'c_a', 'c_b',
		);
		expect((result as any).children[0].codeId).toBe('c_b');
		expect((result as any).children[1].children[0].codeId).toBe('c_b');
		expect((result as any).children[1].children[1].codeId).toBe('c_x');
	});

	it('relationExists rewriteia codeId E targetCodeId', () => {
		const result = rewriteCodeRef({ kind: 'relationExists', codeId: 'c_a', targetCodeId: 'c_a' }, 'c_a', 'c_b');
		expect(result).toEqual({ kind: 'relationExists', codeId: 'c_b', targetCodeId: 'c_b' });
	});
});

describe('diffPredicateLeaves', () => {
	it('detecta added leaf kinds', () => {
		const old: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
		const next: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'inFolder', folderId: 'f_x' }]};
		const diff = diffPredicateLeaves(old, next);
		expect(diff.addedLeafKinds).toEqual(['inFolder']);
	});

	it('detecta removed leaf kinds', () => {
		const old: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'inFolder', folderId: 'f_x' }]};
		const next: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
		const diff = diffPredicateLeaves(old, next);
		expect(diff.removedLeafKinds).toEqual(['inFolder']);
	});

	it('changedLeafCount: c_a → c_b conta como 1', () => {
		const old: PredicateNode = { kind: 'hasCode', codeId: 'c_a' };
		const next: PredicateNode = { kind: 'hasCode', codeId: 'c_b' };
		const diff = diffPredicateLeaves(old, next);
		expect(diff.changedLeafCount).toBe(1);
	});
});
