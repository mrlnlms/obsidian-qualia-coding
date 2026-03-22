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

// ── setParent ───────────────────────────────────────────────

describe('CodeDefinitionRegistry — setParent', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('sets parentId and updates childrenOrder', () => {
		const parent = registry.create('Parent');
		const child = registry.create('Child');
		const ok = registry.setParent(child.id, parent.id);
		expect(ok).toBe(true);
		expect(registry.getById(child.id)!.parentId).toBe(parent.id);
		expect(registry.getById(parent.id)!.childrenOrder).toContain(child.id);
	});

	it('removes from old parent when reparenting', () => {
		const p1 = registry.create('P1');
		const p2 = registry.create('P2');
		const child = registry.create('Child');
		registry.setParent(child.id, p1.id);
		registry.setParent(child.id, p2.id);
		expect(registry.getById(p1.id)!.childrenOrder).not.toContain(child.id);
		expect(registry.getById(p2.id)!.childrenOrder).toContain(child.id);
		expect(registry.getById(child.id)!.parentId).toBe(p2.id);
	});

	it('promotes to root when parentId is undefined', () => {
		const parent = registry.create('Parent');
		const child = registry.create('Child');
		registry.setParent(child.id, parent.id);
		const ok = registry.setParent(child.id, undefined);
		expect(ok).toBe(true);
		expect(registry.getById(child.id)!.parentId).toBeUndefined();
		expect(registry.getById(parent.id)!.childrenOrder).not.toContain(child.id);
	});

	it('rejects self-parenting', () => {
		const code = registry.create('Self');
		expect(registry.setParent(code.id, code.id)).toBe(false);
		expect(code.parentId).toBeUndefined();
	});

	it('rejects cycle (grandpa cannot become child of child)', () => {
		const grandpa = registry.create('Grandpa');
		const parent = registry.create('Parent');
		const child = registry.create('Child');
		registry.setParent(parent.id, grandpa.id);
		registry.setParent(child.id, parent.id);
		// Try to make grandpa a child of child → cycle
		expect(registry.setParent(grandpa.id, child.id)).toBe(false);
		expect(grandpa.parentId).toBeUndefined();
	});

	it('rejects nonexistent parent', () => {
		const code = registry.create('Code');
		expect(registry.setParent(code.id, 'nonexistent')).toBe(false);
	});

	it('fires onMutate on success, not on rejection', () => {
		const parent = registry.create('Parent');
		const child = registry.create('Child');
		let callCount = 0;
		registry.addOnMutate(() => callCount++);
		callCount = 0; // reset after setup
		registry.setParent(child.id, parent.id);
		expect(callCount).toBe(1);
		registry.setParent(child.id, child.id); // reject
		expect(callCount).toBe(1); // no change
	});

	it('preserves childrenOrder order when adding multiple children', () => {
		const parent = registry.create('Parent');
		const c1 = registry.create('C1');
		const c2 = registry.create('C2');
		const c3 = registry.create('C3');
		registry.setParent(c1.id, parent.id);
		registry.setParent(c2.id, parent.id);
		registry.setParent(c3.id, parent.id);
		expect(registry.getById(parent.id)!.childrenOrder).toEqual([c1.id, c2.id, c3.id]);
	});
});

// ── delete with hierarchy ───────────────────────────────────

describe('CodeDefinitionRegistry — delete with hierarchy', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('children become root when parent deleted', () => {
		const parent = registry.create('Parent');
		const c1 = registry.create('C1');
		const c2 = registry.create('C2');
		registry.setParent(c1.id, parent.id);
		registry.setParent(c2.id, parent.id);
		registry.delete(parent.id);
		expect(registry.getById(c1.id)!.parentId).toBeUndefined();
		expect(registry.getById(c2.id)!.parentId).toBeUndefined();
	});

	it('removed from own parent childrenOrder when deleted', () => {
		const parent = registry.create('Parent');
		const c1 = registry.create('C1');
		const c2 = registry.create('C2');
		registry.setParent(c1.id, parent.id);
		registry.setParent(c2.id, parent.id);
		registry.delete(c1.id);
		expect(registry.getById(parent.id)!.childrenOrder).toEqual([c2.id]);
	});
});
