import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('CodeDefinitionRegistry — hierarchy fields', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('new code has no parentId by default', () => {
		const code = registry.create('Alpha');
		expect(code.parentId).toBeUndefined();
	});

	it('new code has empty childrenOrder by default', () => {
		const code = registry.create('Beta');
		expect(code.childrenOrder).toEqual([]);
	});

	it('new code has no mergedFrom by default', () => {
		const code = registry.create('Gamma');
		expect(code.mergedFrom).toBeUndefined();
	});
});

// ── Query methods ───────────────────────────────────────────

describe('CodeDefinitionRegistry — hierarchy queries', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	// Helper: manually wire parent-child relationship
	function wireParent(childId: string, parentId: string) {
		const child = registry.getById(childId)!;
		const parent = registry.getById(parentId)!;
		child.parentId = parentId;
		parent.childrenOrder.push(childId);
	}

	describe('getRootCodes', () => {
		it('returns codes without parentId', () => {
			const a = registry.create('A');
			const b = registry.create('B');
			const roots = registry.getRootCodes();
			expect(roots.map(r => r.id)).toContain(a.id);
			expect(roots.map(r => r.id)).toContain(b.id);
		});

		it('excludes codes with parentId', () => {
			const parent = registry.create('Parent');
			const child = registry.create('Child');
			wireParent(child.id, parent.id);
			const roots = registry.getRootCodes();
			expect(roots.map(r => r.id)).toContain(parent.id);
			expect(roots.map(r => r.id)).not.toContain(child.id);
		});
	});

	describe('getChildren', () => {
		it('returns direct children in childrenOrder', () => {
			const parent = registry.create('Parent');
			const c1 = registry.create('C1');
			const c2 = registry.create('C2');
			wireParent(c1.id, parent.id);
			wireParent(c2.id, parent.id);
			const children = registry.getChildren(parent.id);
			expect(children.map(c => c.id)).toEqual([c1.id, c2.id]);
		});

		it('returns empty array for leaf', () => {
			const leaf = registry.create('Leaf');
			expect(registry.getChildren(leaf.id)).toEqual([]);
		});
	});

	describe('getAncestors', () => {
		it('returns ancestors bottom-up', () => {
			const grandpa = registry.create('Grandpa');
			const parent = registry.create('Parent');
			const child = registry.create('Child');
			wireParent(parent.id, grandpa.id);
			wireParent(child.id, parent.id);
			const ancestors = registry.getAncestors(child.id);
			expect(ancestors.map(a => a.id)).toEqual([parent.id, grandpa.id]);
		});

		it('returns empty array for root', () => {
			const root = registry.create('Root');
			expect(registry.getAncestors(root.id)).toEqual([]);
		});
	});

	describe('getDescendants', () => {
		it('returns all descendants depth-first', () => {
			const root = registry.create('Root');
			const c1 = registry.create('C1');
			const c2 = registry.create('C2');
			const gc1 = registry.create('GC1');
			wireParent(c1.id, root.id);
			wireParent(c2.id, root.id);
			wireParent(gc1.id, c1.id);
			const desc = registry.getDescendants(root.id);
			expect(desc.map(d => d.id)).toEqual([c1.id, gc1.id, c2.id]);
		});
	});

	describe('getDepth', () => {
		it('returns 0 for root', () => {
			const root = registry.create('Root');
			expect(registry.getDepth(root.id)).toBe(0);
		});

		it('returns correct depth for nested', () => {
			const grandpa = registry.create('Grandpa');
			const parent = registry.create('Parent');
			const child = registry.create('Child');
			wireParent(parent.id, grandpa.id);
			wireParent(child.id, parent.id);
			expect(registry.getDepth(child.id)).toBe(2);
			expect(registry.getDepth(parent.id)).toBe(1);
		});
	});
});
