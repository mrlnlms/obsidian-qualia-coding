import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('CodeDefinitionRegistry — folder hierarchy', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	describe('getRootFolders', () => {
		it('returns only root folders (no parentId), respecting folderOrder', () => {
			const a = registry.createFolder('A');
			const b = registry.createFolder('B');
			const c = registry.createFolder('C');
			// Set b as child of a (parentId), keep a and c as root
			(registry as any).folders.get(b.id).parentId = a.id;
			// Default folderOrder após createFolder: [a.id, b.id, c.id]; remover b da raiz
			(registry as any).folderOrder = [a.id, c.id];

			const roots = registry.getRootFolders();
			expect(roots.map(f => f.id)).toEqual([a.id, c.id]);
		});

		it('returns empty array when no folders exist', () => {
			expect(registry.getRootFolders()).toEqual([]);
		});
	});

	describe('getChildFolders', () => {
		it('returns children of given parent, respecting subfolderOrder', () => {
			const parent = registry.createFolder('parent');
			const c1 = registry.createFolder('c1');
			const c2 = registry.createFolder('c2');
			(registry as any).folders.get(c1.id).parentId = parent.id;
			(registry as any).folders.get(c2.id).parentId = parent.id;
			(registry as any).folders.get(parent.id).subfolderOrder = [c1.id, c2.id];

			expect(registry.getChildFolders(parent.id).map(f => f.id)).toEqual([c1.id, c2.id]);
		});

		it('falls back to alphabetical order when subfolderOrder is missing', () => {
			const parent = registry.createFolder('parent');
			const z = registry.createFolder('zebra');
			const a = registry.createFolder('apple');
			(registry as any).folders.get(z.id).parentId = parent.id;
			(registry as any).folders.get(a.id).parentId = parent.id;
			// sem subfolderOrder

			const children = registry.getChildFolders(parent.id);
			expect(children.map(f => f.name)).toEqual(['apple', 'zebra']);
		});

		it('returns empty array when folder has no children', () => {
			const f = registry.createFolder('f');
			expect(registry.getChildFolders(f.id)).toEqual([]);
		});
	});

	describe('getFolderAncestors / getFolderDescendants', () => {
		it('getFolderAncestors returns chain from immediate parent to root', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b');
			const c = registry.createFolder('c');
			(registry as any).folders.get(b.id).parentId = a.id;
			(registry as any).folders.get(c.id).parentId = b.id;

			expect(registry.getFolderAncestors(c.id).map(f => f.id)).toEqual([b.id, a.id]);
		});

		it('getFolderDescendants returns recursive descendants (DFS)', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b');
			const c = registry.createFolder('c');
			const d = registry.createFolder('d');
			(registry as any).folders.get(b.id).parentId = a.id;
			(registry as any).folders.get(c.id).parentId = a.id;
			(registry as any).folders.get(d.id).parentId = b.id;

			const desc = registry.getFolderDescendants(a.id);
			const ids = new Set(desc.map(f => f.id));
			expect(ids).toEqual(new Set([b.id, c.id, d.id]));
		});

		it('getFolderAncestors returns [] for root folder', () => {
			const a = registry.createFolder('a');
			expect(registry.getFolderAncestors(a.id)).toEqual([]);
		});

		it('getFolderDescendants returns [] for leaf folder', () => {
			const a = registry.createFolder('a');
			expect(registry.getFolderDescendants(a.id)).toEqual([]);
		});

		it('getFolderDescendants does not infinite-loop on cycle (defensive)', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b');
			// Force a cycle via direct mutation
			(registry as any).folders.get(a.id).parentId = b.id;
			(registry as any).folders.get(b.id).parentId = a.id;

			// Should terminate (no infinite loop)
			const desc = registry.getFolderDescendants(a.id);
			// Acceptable behavior: returns descendants seen until cycle detected
			expect(desc.length).toBeLessThan(10); // sanity bound
		});
	});

	describe('createFolder with parentId', () => {
		it('creates root folder when parentId omitted, appends to folderOrder', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b');
			expect((registry as any).folderOrder).toEqual([a.id, b.id]);
			expect(a.parentId).toBeUndefined();
		});

		it('creates child folder when parentId given, appends to subfolderOrder of parent', () => {
			const parent = registry.createFolder('parent');
			const child = registry.createFolder('child', parent.id);

			expect(child.parentId).toBe(parent.id);
			const parentDef = (registry as any).folders.get(parent.id);
			expect(parentDef.subfolderOrder).toEqual([child.id]);
		});

		it('does not add child to root folderOrder', () => {
			const parent = registry.createFolder('parent');
			const child = registry.createFolder('child', parent.id);
			expect((registry as any).folderOrder).toEqual([parent.id]);
		});

		it('createFolder with invalid parentId falls back to root', () => {
			const f = registry.createFolder('orphan', 'nonexistent-id');
			expect(f.parentId).toBeUndefined();
			expect((registry as any).folderOrder).toContain(f.id);
		});
	});

	describe('setFolderParent', () => {
		it('moves root folder to nested', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b');
			expect(registry.setFolderParent(b.id, a.id)).toBe(true);
			expect((registry as any).folders.get(b.id).parentId).toBe(a.id);
			// Removido de folderOrder, adicionado a subfolderOrder
			expect((registry as any).folderOrder).toEqual([a.id]);
			expect((registry as any).folders.get(a.id).subfolderOrder).toEqual([b.id]);
		});

		it('promotes nested to root (parentId = undefined)', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b', a.id);
			expect(registry.setFolderParent(b.id, undefined)).toBe(true);
			expect((registry as any).folders.get(b.id).parentId).toBeUndefined();
			expect((registry as any).folderOrder).toContain(b.id);
			expect((registry as any).folders.get(a.id).subfolderOrder).toEqual([]);
		});

		it('rejects cycle (A -> B -> C, attempt A under C)', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b', a.id);
			const c = registry.createFolder('c', b.id);
			expect(registry.setFolderParent(a.id, c.id)).toBe(false);
			expect((registry as any).folders.get(a.id).parentId).toBeUndefined();
		});

		it('rejects self-parent', () => {
			const a = registry.createFolder('a');
			expect(registry.setFolderParent(a.id, a.id)).toBe(false);
		});

		it('rejects non-existent parent', () => {
			const a = registry.createFolder('a');
			expect(registry.setFolderParent(a.id, 'nonexistent')).toBe(false);
		});

		it('inserts before sibling when insertBefore given', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b');
			const c = registry.createFolder('c');
			expect(registry.setFolderParent(c.id, undefined, b.id)).toBe(true);
			expect((registry as any).folderOrder).toEqual([a.id, c.id, b.id]);
		});

		it('no-op silently when target parent is current parent and zone=inside', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b', a.id);
			// Tenta setar pra mesmo parent — deve retornar true sem mexer (idempotente)
			expect(registry.setFolderParent(b.id, a.id)).toBe(true);
			expect((registry as any).folders.get(a.id).subfolderOrder).toEqual([b.id]);
		});
	});

	describe('deleteFolder cascade', () => {
		it('deletes folder, all descendant folders, and all codes within (recursive)', () => {
			const root = registry.createFolder('root');
			const sub = registry.createFolder('sub', root.id);
			const subsub = registry.createFolder('subsub', sub.id);

			const codeRoot = registry.create('codeRoot', '#000');
			registry.setCodeFolder(codeRoot.id, root.id);
			const codeSub = registry.create('codeSub', '#000');
			registry.setCodeFolder(codeSub.id, sub.id);
			const codeSubsub = registry.create('codeSubsub', '#000');
			registry.setCodeFolder(codeSubsub.id, subsub.id);

			const deleted = registry.deleteFolder(root.id);
			expect(deleted).toBe(true);

			expect(registry.getFolderById(root.id)).toBeUndefined();
			expect(registry.getFolderById(sub.id)).toBeUndefined();
			expect(registry.getFolderById(subsub.id)).toBeUndefined();
			expect(registry.getById(codeRoot.id)).toBeUndefined();
			expect(registry.getById(codeSub.id)).toBeUndefined();
			expect(registry.getById(codeSubsub.id)).toBeUndefined();

			expect((registry as any).folderOrder).not.toContain(root.id);
		});

		it("removes deleted folder from parent's subfolderOrder", () => {
			const parent = registry.createFolder('parent');
			const child = registry.createFolder('child', parent.id);

			registry.deleteFolder(child.id);
			expect((registry as any).folders.get(parent.id).subfolderOrder).toEqual([]);
		});

		it('returns false for non-existent folder', () => {
			expect(registry.deleteFolder('nonexistent')).toBe(false);
		});

		it('deleteFolder cascade fires onMutate once (not N+1)', () => {
			const f = registry.createFolder('f');
			const c1 = registry.create('c1', '#000'); registry.setCodeFolder(c1.id, f.id);
			const c2 = registry.create('c2', '#000'); registry.setCodeFolder(c2.id, f.id);
			const c3 = registry.create('c3', '#000'); registry.setCodeFolder(c3.id, f.id);

			let fireCount = 0;
			const listener = () => { fireCount++; };
			registry.addOnMutate(listener);
			registry.deleteFolder(f.id);
			registry.removeOnMutate(listener);

			expect(fireCount).toBe(1);
		});
	});

	describe('clear()', () => {
		it('resets folderOrder', () => {
			registry.createFolder('a');
			registry.createFolder('b');
			expect((registry as any).folderOrder.length).toBe(2);
			registry.clear();
			expect((registry as any).folderOrder).toEqual([]);
		});
	});

	describe('JSON round-trip with nested folders', () => {
		it('preserves parentId and subfolderOrder', () => {
			const a = registry.createFolder('a');
			const b = registry.createFolder('b', a.id);
			const c = registry.createFolder('c', a.id);

			const json = registry.toJSON();
			const restored = CodeDefinitionRegistry.fromJSON(json);  // static!

			const restoredA = restored.getFolderById(a.id)!;
			expect(restoredA.subfolderOrder).toEqual([b.id, c.id]);
			expect(restored.getFolderById(b.id)?.parentId).toBe(a.id);
			expect((restored as any).folderOrder).toEqual([a.id]);
		});
	});
});
