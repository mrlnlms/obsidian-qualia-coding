import { describe, it, expect, beforeEach } from 'vitest';
import { SmartCodeRegistry, rewriteCodeRef, diffPredicateLeaves, type SmartCodeAuditEvent } from '../../../src/core/smartCodes/smartCodeRegistryApi';
import { createDefaultData } from '../../../src/core/types';
import type { PredicateNode, QualiaData } from '../../../src/core/types';

describe('SmartCodeRegistry CRUD', () => {
	let data: QualiaData;
	let auditEvents: SmartCodeAuditEvent[];
	let mutateCalls: string[];
	let registry: SmartCodeRegistry;

	beforeEach(() => {
		data = createDefaultData();
		auditEvents = [];
		mutateCalls = [];
		registry = SmartCodeRegistry.fromJSON(data.smartCodes);
		registry.setAuditListener((e) => auditEvents.push(e));
		registry.addOnMutate((id) => mutateCalls.push(id));
	});

	it('create adiciona ao section + audit sc_created + mutate emit com id', () => {
		const sc = registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		expect(data.smartCodes.definitions[sc.id]).toBeDefined();
		expect(data.smartCodes.order).toContain(sc.id);
		expect(sc.id.startsWith('sc_')).toBe(true);
		expect(sc.color).toBeTruthy();
		expect(auditEvents).toHaveLength(1);
		expect(auditEvents[0].type).toBe('sc_created');
		expect(auditEvents[0].codeId).toBe(sc.id);
		expect(mutateCalls).toEqual([sc.id]);
	});

	it('create com color custom usa paletteIndex -1', () => {
		const sc = registry.create({ name: 'X', color: '#abc', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		expect(sc.color).toBe('#abc');
		expect(sc.paletteIndex).toBe(-1);
	});

	it('update com predicate change emite sc_predicate_edited', () => {
		const sc = registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		auditEvents.length = 0;
		registry.update(sc.id, { predicate: { kind: 'hasCode', codeId: 'c_b' }});
		expect(auditEvents).toHaveLength(1);
		expect(auditEvents[0].type).toBe('sc_predicate_edited');
	});

	it('update com memo change emite sc_memo_edited', () => {
		const sc = registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }, memo: '' });
		auditEvents.length = 0;
		registry.update(sc.id, { memo: 'note' });
		expect(auditEvents.find(e => e.type === 'sc_memo_edited')).toBeDefined();
	});

	it('setColor não emite audit mas emite mutate', () => {
		const sc = registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		auditEvents.length = 0;
		mutateCalls.length = 0;
		registry.setColor(sc.id, '#abc');
		expect(auditEvents).toHaveLength(0);
		expect(mutateCalls).toEqual([sc.id]);
		expect(data.smartCodes.definitions[sc.id]!.color).toBe('#abc');
	});

	it('delete remove + emite sc_deleted', () => {
		const sc = registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		auditEvents.length = 0;
		expect(registry.delete(sc.id)).toBe(true);
		expect(data.smartCodes.definitions[sc.id]).toBeUndefined();
		expect(data.smartCodes.order).not.toContain(sc.id);
		expect(auditEvents[0].type).toBe('sc_deleted');
	});

	it('autoRewriteOnMerge re-escreve hasCode + emite sc_auto_rewritten_on_merge', () => {
		const sc = registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_source' }});
		auditEvents.length = 0;
		const result = registry.autoRewriteOnMerge('c_source', 'c_target');
		expect(result.rewritten).toEqual([sc.id]);
		expect((data.smartCodes.definitions[sc.id]!.predicate as any).codeId).toBe('c_target');
		expect(auditEvents[0].type).toBe('sc_auto_rewritten_on_merge');
	});

	it('autoRewriteOnMerge não toca smart code que não referencia source', () => {
		const sc = registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_other' }});
		const result = registry.autoRewriteOnMerge('c_source', 'c_target');
		expect(result.rewritten).toEqual([]);
		expect((data.smartCodes.definitions[sc.id]!.predicate as any).codeId).toBe('c_other');
	});

	it('getAll respeita order', () => {
		const a = registry.create({ name: 'A', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		const b = registry.create({ name: 'B', predicate: { kind: 'hasCode', codeId: 'c_b' }});
		expect(registry.getAll().map(s => s.id)).toEqual([a.id, b.id]);
	});

	it('getDefinitionsRef retorna mesma reference do section.definitions', () => {
		registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		expect(registry.getDefinitionsRef()).toBe(data.smartCodes.definitions);
	});

	it('toJSON retorna o section persistido', () => {
		registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		expect(registry.toJSON()).toBe(data.smartCodes);
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

describe('SmartCodeRegistry incremental cache hookup', () => {
	it('addOnMutate listener recebe id mudado em cada CRUD', () => {
		const data = createDefaultData();
		const registry = SmartCodeRegistry.fromJSON(data.smartCodes);
		const calls: string[] = [];
		registry.addOnMutate((id) => calls.push(id));

		const sc = registry.create({ name: 'X', predicate: { kind: 'hasCode', codeId: 'c_a' }});
		registry.update(sc.id, { name: 'Y' });
		registry.delete(sc.id);

		expect(calls).toEqual([sc.id, sc.id, sc.id]);
	});
});
