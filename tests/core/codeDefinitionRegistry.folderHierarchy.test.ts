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
});
