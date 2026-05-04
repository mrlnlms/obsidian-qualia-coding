import { describe, it, expect } from 'vitest';
import { getNodeAt, addChildToGroup, removeNodeAt, moveNode, changeOperator, replaceLeafAt } from '../../../src/core/smartCodes/builderTreeOps';
import type { PredicateNode } from '../../../src/core/smartCodes/types';

describe('getNodeAt', () => {
	it('returns root for empty path', () => {
		const p: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
		expect(getNodeAt(p, [])).toBe(p);
	});
	it('returns nested by path', () => {
		const leaf: PredicateNode = { kind: 'hasCode', codeId: 'c_a' };
		const p: PredicateNode = { op: 'AND', children: [{ op: 'OR', children: [leaf]}]};
		expect(getNodeAt(p, [0, 0])).toBe(leaf);
	});
	it('returns NOT child via path [0]', () => {
		const leaf: PredicateNode = { kind: 'hasCode', codeId: 'c_a' };
		const p: PredicateNode = { op: 'NOT', child: leaf };
		expect(getNodeAt(p, [0])).toBe(leaf);
	});
	it('returns undefined for invalid path', () => {
		const p: PredicateNode = { kind: 'hasCode', codeId: 'c_a' };
		expect(getNodeAt(p, [0])).toBeUndefined();
	});
});

describe('addChildToGroup', () => {
	it('adiciona child ao final do group root', () => {
		const p: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
		const newLeaf: PredicateNode = { kind: 'hasCode', codeId: 'c_b' };
		const result = addChildToGroup(p, [], newLeaf);
		expect((result as any).children).toHaveLength(2);
		expect((result as any).children[1]).toEqual(newLeaf);
	});
	it('adiciona child em group nested', () => {
		const p: PredicateNode = { op: 'AND', children: [{ op: 'OR', children: [{ kind: 'hasCode', codeId: 'c_a' }]}]};
		const result = addChildToGroup(p, [0], { kind: 'hasCode', codeId: 'c_b' });
		expect((result as any).children[0].children).toHaveLength(2);
	});
	it('no-op se parentPath aponta pra leaf', () => {
		const p: PredicateNode = { kind: 'hasCode', codeId: 'c_a' };
		expect(addChildToGroup(p, [], { kind: 'hasCode', codeId: 'c_b' })).toEqual(p);
	});
});

describe('removeNodeAt', () => {
	it('remove child do AND group', () => {
		const p: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'hasCode', codeId: 'c_b' }]};
		const result = removeNodeAt(p, [0]);
		expect((result as any).children).toHaveLength(1);
		expect((result as any).children[0].codeId).toBe('c_b');
	});
	it('no-op se path vazio (não pode deletar root)', () => {
		const p: PredicateNode = { kind: 'hasCode', codeId: 'c_a' };
		expect(removeNodeAt(p, [])).toEqual(p);
	});
	it('remove em group nested', () => {
		const p: PredicateNode = { op: 'AND', children: [{ op: 'OR', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'hasCode', codeId: 'c_b' }]}]};
		const result = removeNodeAt(p, [0, 0]);
		expect((result as any).children[0].children).toHaveLength(1);
		expect((result as any).children[0].children[0].codeId).toBe('c_b');
	});
});

describe('changeOperator', () => {
	it('muda AND pra OR preservando children', () => {
		const p: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'hasCode', codeId: 'c_b' }]};
		const result = changeOperator(p, [], 'OR');
		expect((result as any).op).toBe('OR');
		expect((result as any).children).toHaveLength(2);
	});
	it('muda AND→NOT pega primeiro child', () => {
		const p: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'hasCode', codeId: 'c_b' }]};
		const result = changeOperator(p, [], 'NOT');
		expect((result as any).op).toBe('NOT');
		expect((result as any).child.codeId).toBe('c_a');
	});
	it('muda NOT→AND envolve child em children', () => {
		const p: PredicateNode = { op: 'NOT', child: { kind: 'hasCode', codeId: 'c_a' }};
		const result = changeOperator(p, [], 'AND');
		expect((result as any).op).toBe('AND');
		expect((result as any).children[0].codeId).toBe('c_a');
	});
});

describe('replaceLeafAt', () => {
	it('substitui leaf no path', () => {
		const p: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
		const result = replaceLeafAt(p, [0], { kind: 'inFolder', folderId: 'f_x' });
		expect((result as any).children[0]).toEqual({ kind: 'inFolder', folderId: 'f_x' });
	});
	it('substitui root leaf', () => {
		const p: PredicateNode = { kind: 'hasCode', codeId: 'c_a' };
		const result = replaceLeafAt(p, [], { kind: 'inFolder', folderId: 'f_x' });
		expect(result).toEqual({ kind: 'inFolder', folderId: 'f_x' });
	});
});

describe('moveNode', () => {
	it('move leaf entre AND children (reorder)', () => {
		const p: PredicateNode = { op: 'AND', children: [
			{ kind: 'hasCode', codeId: 'c_a' },
			{ kind: 'hasCode', codeId: 'c_b' },
			{ kind: 'hasCode', codeId: 'c_c' },
		]};
		// Move c_c (idx 2) pra posição 0
		const result = moveNode(p, [2], [], 0);
		expect((result as any).children.map((c: any) => c.codeId)).toEqual(['c_c', 'c_a', 'c_b']);
	});
});
