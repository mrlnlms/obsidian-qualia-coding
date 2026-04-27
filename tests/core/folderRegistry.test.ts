import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

let registry: CodeDefinitionRegistry;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
});

describe('folder CRUD', () => {
	it('createFolder returns a FolderDefinition with generated id', () => {
		const folder = registry.createFolder('Emocoes');
		expect(folder.id).toBeTruthy();
		expect(folder.name).toBe('Emocoes');
		expect(folder.createdAt).toBeGreaterThan(0);
	});

	it('createFolder with duplicate name returns existing', () => {
		const f1 = registry.createFolder('Emocoes');
		const f2 = registry.createFolder('Emocoes');
		expect(f1.id).toBe(f2.id);
	});

	it('getRootFolders returns root folders in folderOrder (creation order)', () => {
		const f1 = registry.createFolder('zebra');
		const f2 = registry.createFolder('apple');
		const f3 = registry.createFolder('mango');

		// Ordem é a de criação (folderOrder), não alfabética
		expect(registry.getRootFolders().map(f => f.name)).toEqual(['zebra', 'apple', 'mango']);
	});

	it('getFolderById returns folder or undefined', () => {
		const folder = registry.createFolder('Test');
		expect(registry.getFolderById(folder.id)?.name).toBe('Test');
		expect(registry.getFolderById('nonexistent')).toBeUndefined();
	});

	it('renameFolder updates name', () => {
		const folder = registry.createFolder('Old');
		const ok = registry.renameFolder(folder.id, 'New');
		expect(ok).toBe(true);
		expect(registry.getFolderById(folder.id)?.name).toBe('New');
	});

	it('renameFolder rejects duplicate name', () => {
		registry.createFolder('Existing');
		const f2 = registry.createFolder('Other');
		const ok = registry.renameFolder(f2.id, 'Existing');
		expect(ok).toBe(false);
	});

	it('deleteFolder cascades: deletes folder and all codes within', () => {
		const folder = registry.createFolder('ToDelete');
		const code = registry.create('MyCode');
		registry.setCodeFolder(code.id, folder.id);
		expect(code.folder).toBe(folder.id);

		registry.deleteFolder(folder.id);
		expect(registry.getFolderById(folder.id)).toBeUndefined();
		// Cascade: code dentro do folder é deletado (markers viram orfãos)
		expect(registry.getById(code.id)).toBeUndefined();
	});

	it('createFolder fires onMutate', () => {
		const spy = vi.fn();
		registry.addOnMutate(spy);
		registry.createFolder('Test');
		expect(spy).toHaveBeenCalled();
	});

	it('deleteFolder fires onMutate', () => {
		const folder = registry.createFolder('Test');
		const spy = vi.fn();
		registry.addOnMutate(spy);
		registry.deleteFolder(folder.id);
		expect(spy).toHaveBeenCalled();
	});
});

describe('setCodeFolder', () => {
	it('assigns code to a folder', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('Code1');
		registry.setCodeFolder(code.id, folder.id);
		expect(code.folder).toBe(folder.id);
	});

	it('removes code from folder when folderId is undefined', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('Code1');
		registry.setCodeFolder(code.id, folder.id);
		registry.setCodeFolder(code.id, undefined);
		expect(code.folder).toBeUndefined();
	});

	it('rejects nonexistent folder', () => {
		const code = registry.create('Code1');
		const ok = registry.setCodeFolder(code.id, 'nonexistent');
		expect(ok).toBe(false);
	});

	it('rejects nonexistent code', () => {
		const folder = registry.createFolder('F1');
		const ok = registry.setCodeFolder('nonexistent', folder.id);
		expect(ok).toBe(false);
	});

	it('fires onMutate', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('Code1');
		const spy = vi.fn();
		registry.addOnMutate(spy);
		registry.setCodeFolder(code.id, folder.id);
		expect(spy).toHaveBeenCalled();
	});

	it('getCodesInFolder returns codes in a folder', () => {
		const folder = registry.createFolder('F1');
		const c1 = registry.create('A');
		const c2 = registry.create('B');
		registry.create('C'); // not in folder
		registry.setCodeFolder(c1.id, folder.id);
		registry.setCodeFolder(c2.id, folder.id);
		const codes = registry.getCodesInFolder(folder.id);
		expect(codes.map(c => c.name)).toEqual(['A', 'B']);
	});

	it('getCodesInFolder returns empty for unknown folder', () => {
		expect(registry.getCodesInFolder('nonexistent')).toEqual([]);
	});
});

describe('folder serialization', () => {
	it('toJSON includes folders', () => {
		registry.createFolder('F1');
		const json = registry.toJSON();
		expect(json.folders).toBeDefined();
		expect(Object.keys(json.folders).length).toBe(1);
	});

	it('fromJSON restores folders', () => {
		registry.createFolder('F1');
		const code = registry.create('Code1');
		registry.setCodeFolder(code.id, registry.getRootFolders()[0]!.id);

		const json = registry.toJSON();
		const restored = CodeDefinitionRegistry.fromJSON(json);

		expect(restored.getRootFolders().length).toBe(1);
		expect(restored.getRootFolders()[0]!.name).toBe('F1');
		const restoredCode = restored.getByName('Code1');
		expect(restoredCode?.folder).toBe(restored.getRootFolders()[0]!.id);
	});

	it('fromJSON handles missing folders gracefully', () => {
		const restored = CodeDefinitionRegistry.fromJSON({ definitions: {}, nextPaletteIndex: 0 });
		expect(restored.getRootFolders()).toEqual([]);
	});
});

describe('folder + hierarchy interaction', () => {
	it('child code inherits no folder from parent (folders are independent of hierarchy)', () => {
		const folder = registry.createFolder('F1');
		const parent = registry.create('Parent');
		const child = registry.create('Child');
		registry.setCodeFolder(parent.id, folder.id);
		registry.setParent(child.id, parent.id);
		expect(child.folder).toBeUndefined();
	});

	it('deleting a code does not affect its folder', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('CodeA');
		registry.setCodeFolder(code.id, folder.id);
		registry.delete(code.id);
		expect(registry.getFolderById(folder.id)).toBeDefined();
	});

	it('clear() removes folders too', () => {
		registry.createFolder('F1');
		registry.clear();
		expect(registry.getRootFolders()).toEqual([]);
	});

	it('renameFolder with same name is a no-op success', () => {
		const folder = registry.createFolder('Same');
		const ok = registry.renameFolder(folder.id, 'Same');
		expect(ok).toBe(true);
	});
});
