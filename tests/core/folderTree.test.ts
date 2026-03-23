import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildFlatTree, buildCountIndex } from '../../src/core/hierarchyHelpers';
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

		const nodes = buildFlatTree(registry, new Set());
		expect(nodes[0]!.type).toBe('folder');
		expect((nodes[0] as any).name).toBe('Emocoes');
		const unfiledIdx = nodes.findIndex(n => n.type === 'code' && n.type === 'code' && n.def.name === 'Neutro');
		expect(unfiledIdx).toBeGreaterThan(0);
	});

	it('codes inside a collapsed folder are hidden', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('A');
		registry.setCodeFolder(code.id, folder.id);

		const nodes = buildFlatTree(registry, new Set());
		const codeNodes = nodes.filter(n => n.type === 'code');
		expect(codeNodes.find(n => n.type === 'code' && n.def.name === 'A')).toBeUndefined();
	});

	it('codes inside an expanded folder appear at depth 1', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('A');
		registry.setCodeFolder(code.id, folder.id);

		const expanded = new Set<string>([`folder:${folder.id}`]);
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

		const expanded = new Set<string>([`folder:${folder.id}`, parent.id]);
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

		const nodes = buildFlatTree(registry, new Set(), 'Ale');
		expect(nodes.some(n => n.type === 'folder' && (n as any).name === 'Emocoes')).toBe(true);
		expect(nodes.some(n => n.type === 'code' && n.def.name === 'Alegria')).toBe(true);
		expect(nodes.some(n => n.type === 'code' && n.def.name === 'Neutro')).toBe(false);
	});

	it('empty folder still appears in tree', () => {
		registry.createFolder('Empty');
		const nodes = buildFlatTree(registry, new Set());
		expect(nodes.some(n => n.type === 'folder' && (n as any).name === 'Empty')).toBe(true);
	});

	it('folder count = total codes in folder', () => {
		const folder = registry.createFolder('F1');
		const c1 = registry.create('A');
		const c2 = registry.create('B');
		registry.setCodeFolder(c1.id, folder.id);
		registry.setCodeFolder(c2.id, folder.id);

		const nodes = buildFlatTree(registry, new Set());
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

		const expanded = new Set<string>([`folder:${f1.id}`, `folder:${f2.id}`]);
		const nodes = buildFlatTree(registry, expanded);
		const codeNodes = nodes.filter(n => n.type === 'code' && n.def.name === 'A');
		expect(codeNodes.length).toBe(1);
	});

	it('search that matches no codes shows empty tree', () => {
		registry.createFolder('F1');
		registry.create('Alpha');
		const nodes = buildFlatTree(registry, new Set(), 'zzzzz');
		expect(nodes.length).toBe(0);
	});
});
