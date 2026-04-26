import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('Folder drag-drop semantics (logic-level)', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('drop folder INSIDE another folder → setFolderParent', () => {
		const a = registry.createFolder('a');
		const b = registry.createFolder('b');
		expect(registry.setFolderParent(b.id, a.id)).toBe(true);
		expect((registry as any).folders.get(b.id).parentId).toBe(a.id);
	});

	it('drop folder BEFORE root sibling → reorder folderOrder', () => {
		const a = registry.createFolder('a');
		const b = registry.createFolder('b');
		const c = registry.createFolder('c');
		expect(registry.setFolderParent(c.id, undefined, a.id)).toBe(true);
		expect((registry as any).folderOrder).toEqual([c.id, a.id, b.id]);
	});

	it('drop nested folder BEFORE root sibling promotes to root', () => {
		const a = registry.createFolder('a');
		const b = registry.createFolder('b', a.id);
		expect(registry.setFolderParent(b.id, undefined, a.id)).toBe(true);
		expect((registry as any).folders.get(b.id).parentId).toBeUndefined();
		expect((registry as any).folderOrder).toEqual([b.id, a.id]);
	});

	it('drop folder onto self rejected', () => {
		const a = registry.createFolder('a');
		expect(registry.setFolderParent(a.id, a.id)).toBe(false);
	});

	it('drop folder onto descendant rejected (cycle)', () => {
		const a = registry.createFolder('a');
		const b = registry.createFolder('b', a.id);
		expect(registry.setFolderParent(a.id, b.id)).toBe(false);
	});
});
