import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildFlatTree, buildCountIndex, createExpandedState } from '../../src/core/hierarchyHelpers';
import type { FlatFolderNode } from '../../src/core/hierarchyHelpers';
import type { BaseMarker } from '../../src/core/types';

let registry: CodeDefinitionRegistry;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
});

function makeMarker(codeIds: string[]): BaseMarker {
	return {
		markerType: 'markdown',
		id: Math.random().toString(36),
		fileId: 'test.md',
		codes: codeIds.map(codeId => ({ codeId })),
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
}

describe('buildFlatTree with folders', () => {
	it('folders appear at root level before unfiled codes', () => {
		const folder = registry.createFolder('Emocoes');
		const c1 = registry.create('Alegria');
		const c2 = registry.create('Raiva');
		registry.create('Neutro'); // unfiled
		registry.setCodeFolder(c1.id, folder.id);
		registry.setCodeFolder(c2.id, folder.id);

		const nodes = buildFlatTree(registry, createExpandedState());
		expect(nodes[0]!.type).toBe('folder');
		expect((nodes[0] as any).name).toBe('Emocoes');
		const unfiledIdx = nodes.findIndex(n => n.type === 'code' && n.type === 'code' && n.def.name === 'Neutro');
		expect(unfiledIdx).toBeGreaterThan(0);
	});

	it('codes inside a collapsed folder are hidden', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('A');
		registry.setCodeFolder(code.id, folder.id);

		const nodes = buildFlatTree(registry, createExpandedState());
		const codeNodes = nodes.filter(n => n.type === 'code');
		expect(codeNodes.find(n => n.type === 'code' && n.def.name === 'A')).toBeUndefined();
	});

	it('codes inside an expanded folder appear at depth 1', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('A');
		registry.setCodeFolder(code.id, folder.id);

		const expanded = createExpandedState();
		expanded.folders.add(folder.id);
		const nodes = buildFlatTree(registry, expanded);
		const codeNode = nodes.find(n => n.type === 'code' && n.def.name === 'A');
		expect(codeNode).toBeDefined();
		expect(codeNode!.depth).toBe(1);
	});

	it('hierarchy inside folders: parent at depth 1, child at depth 2', () => {
		const folder = registry.createFolder('F1');
		const parent = registry.create('Parent');
		const child = registry.create('Child');
		registry.setCodeFolder(parent.id, folder.id);
		registry.setParent(child.id, parent.id);

		const expanded = createExpandedState();
		expanded.folders.add(folder.id);
		expanded.codes.add(parent.id);
		const nodes = buildFlatTree(registry, expanded);
		const parentNode = nodes.find(n => n.type === 'code' && n.def.name === 'Parent');
		const childNode = nodes.find(n => n.type === 'code' && n.def.name === 'Child');
		expect(parentNode!.depth).toBe(1);
		expect(childNode!.depth).toBe(2);
	});

	it('search matches codes inside folders and shows folder', () => {
		const folder = registry.createFolder('Emocoes');
		const code = registry.create('Alegria');
		registry.setCodeFolder(code.id, folder.id);
		registry.create('Neutro');

		const nodes = buildFlatTree(registry, createExpandedState(), 'Ale');
		expect(nodes.some(n => n.type === 'folder' && (n as any).name === 'Emocoes')).toBe(true);
		expect(nodes.some(n => n.type === 'code' && n.def.name === 'Alegria')).toBe(true);
		expect(nodes.some(n => n.type === 'code' && n.def.name === 'Neutro')).toBe(false);
	});

	it('empty folder still appears in tree', () => {
		registry.createFolder('Empty');
		const nodes = buildFlatTree(registry, createExpandedState());
		expect(nodes.some(n => n.type === 'folder' && (n as any).name === 'Empty')).toBe(true);
	});

	it('folder count = total codes in folder', () => {
		const folder = registry.createFolder('F1');
		const c1 = registry.create('A');
		const c2 = registry.create('B');
		registry.setCodeFolder(c1.id, folder.id);
		registry.setCodeFolder(c2.id, folder.id);

		const nodes = buildFlatTree(registry, createExpandedState());
		const folderNode = nodes.find(n => n.type === 'folder')!;
		expect((folderNode as any).codeCount).toBe(2);
	});
});

describe('buildCountIndex unaffected by folders', () => {
	it('buildCountIndex ignores folders — only counts codes', () => {
		const folder = registry.createFolder('F1');
		const c1 = registry.create('A');
		const c2 = registry.create('B');
		registry.setCodeFolder(c1.id, folder.id);

		const markers = [makeMarker([c1.id]), makeMarker([c2.id])];
		const index = buildCountIndex(registry, markers);

		expect(index.get(c1.id)?.direct).toBe(1);
		expect(index.get(c2.id)?.direct).toBe(1);
		expect(index.has(folder.id)).toBe(false);
	});
});

describe('folder edge cases in tree', () => {
	it('code moved between folders: only appears in new folder', () => {
		const f1 = registry.createFolder('F1');
		const f2 = registry.createFolder('F2');
		const code = registry.create('A');
		registry.setCodeFolder(code.id, f1.id);
		registry.setCodeFolder(code.id, f2.id);

		const expanded = createExpandedState();
		expanded.folders.add(f1.id);
		expanded.folders.add(f2.id);
		const nodes = buildFlatTree(registry, expanded);
		const codeNodes = nodes.filter(n => n.type === 'code' && n.def.name === 'A');
		expect(codeNodes.length).toBe(1);
	});

	it('search that matches no codes shows empty tree', () => {
		registry.createFolder('F1');
		registry.create('Alpha');
		const nodes = buildFlatTree(registry, createExpandedState(), 'zzzzz');
		expect(nodes.length).toBe(0);
	});
});

describe('nested folders', () => {
	it('renders nested folder at depth 1', () => {
		const root = registry.createFolder('root');
		const sub = registry.createFolder('sub', root.id);

		const expanded = createExpandedState();
		expanded.folders.add(root.id);
		const tree = buildFlatTree(registry, expanded);

		expect(tree.length).toBe(2);
		expect(tree[0]).toMatchObject({ type: 'folder', folderId: root.id, depth: 0 });
		expect(tree[1]).toMatchObject({ type: 'folder', folderId: sub.id, depth: 1 });
	});

	it('renders deep nesting (depth 3)', () => {
		const a = registry.createFolder('a');
		const b = registry.createFolder('b', a.id);
		const c = registry.createFolder('c', b.id);
		const d = registry.createFolder('d', c.id);

		const expanded = createExpandedState();
		expanded.folders.add(a.id);
		expanded.folders.add(b.id);
		expanded.folders.add(c.id);
		const tree = buildFlatTree(registry, expanded);

		const depths = tree.filter(n => n.type === 'folder').map(n => (n as any).depth);
		expect(depths).toEqual([0, 1, 2, 3]);
		expect((tree.find(n => n.type === 'folder' && n.folderId === d.id) as any)).toBeDefined();
	});

	it('subfolder collapsed hides nested folders and codes', () => {
		const root = registry.createFolder('root');
		const sub = registry.createFolder('sub', root.id);
		const code = registry.create('code', '#000');
		registry.setCodeFolder(code.id, sub.id);

		const expanded = createExpandedState();
		expanded.folders.add(root.id); // root expanded, sub collapsed

		const tree = buildFlatTree(registry, expanded);
		const ids = tree.map(n => n.type === 'folder' ? n.folderId : n.def.id);
		expect(ids).toEqual([root.id, sub.id]);
	});

	it('hasChildren true if folder has subfolders OR codes', () => {
		const root1 = registry.createFolder('root1');
		registry.createFolder('sub', root1.id);
		const root2 = registry.createFolder('root2');
		const code = registry.create('code', '#000');
		registry.setCodeFolder(code.id, root2.id);

		const expanded = createExpandedState();
		const tree = buildFlatTree(registry, expanded);

		const folder1 = tree.find(n => n.type === 'folder' && n.folderId === root1.id) as FlatFolderNode;
		const folder2 = tree.find(n => n.type === 'folder' && n.folderId === root2.id) as FlatFolderNode;
		expect(folder1.hasChildren).toBe(true);
		expect(folder2.hasChildren).toBe(true);
	});

	it('search auto-expands folder ancestors when matching code is in deep folder', () => {
		const a = registry.createFolder('a');
		const b = registry.createFolder('b', a.id);
		const code = registry.create('special', '#000');
		registry.setCodeFolder(code.id, b.id);

		const tree = buildFlatTree(registry, createExpandedState(), 'special');
		const ids = tree.map(n => n.type === 'folder' ? n.folderId : n.def.id);
		expect(ids).toContain(a.id);
		expect(ids).toContain(b.id);
		expect(ids).toContain(code.id);
	});
});
