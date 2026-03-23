# Phase B: Virtual Folders Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add virtual folders as organizational containers in the Codebook Panel. Folders group codes visually without affecting hierarchy, analytics, or queries. A code belongs to at most one folder. Folder metaphor follows Obsidian's File Explorer.

**Architecture:** Three layers: (1) data model — `folder?` field on CodeDefinition + `folders` record on QualiaData.registry, registry CRUD for folders, (2) tree rendering — folders as collapsible rows with folder icon in the codebook tree, integrated into `buildFlatTree` and virtual scroll, (3) interactions — drag codes into/out of folders, context menus for folder rename/delete and code "Move to folder", "New Folder" button in toolbar. Folders have no analytical meaning — analytics, counts, and hierarchy remain unchanged.

**Tech Stack:** TypeScript strict, Vitest + jsdom, Obsidian API (ItemView, Menu, FuzzySuggestModal)

**Spec:** `docs/superpowers/specs/2026-03-22-codebook-evolution-design.md` (Fase B — Pastas Virtuais)

**Prerequisite:** Phase A complete — hierarchy (parentId, childrenOrder, mergedFrom), codebook tree, drag-drop, context menu, merge modal all working. 1676 tests passing.

**Out of scope:** QDPX export mapping for folders (spec says `isCodable='false'` or `<Set>`). Will be addressed when the REFI-QDA export plan is executed — the export module doesn't exist yet.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `tests/core/folderRegistry.test.ts` | Tests for folder CRUD in registry (create, rename, delete, assign, unassign) |
| `tests/core/folderTree.test.ts` | Tests for `buildFlatTree` with folders, folder expand/collapse, search filtering |

### Modified files

| File | Changes |
|------|---------|
| `src/core/types.ts:66-78` | Add `folder?: string` to CodeDefinition. Add `folders` to registry section of QualiaData |
| `src/core/codeDefinitionRegistry.ts` | Add folder CRUD: `createFolder`, `renameFolder`, `deleteFolder`, `setCodeFolder`. Add `folders` Map, serialize/deserialize |
| `src/core/hierarchyHelpers.ts` | Update `buildFlatTree` to interleave folder rows; add `FlatFolderNode` to union type |
| `src/core/codebookTreeRenderer.ts` | Render folder rows (folder icon, name, expand/collapse, count), handle folder in drag-drop targets |
| `src/core/codebookDragDrop.ts` | Handle drop-on-folder (assign code to folder), drop-on-root-zone (remove from folder) |
| `src/core/codebookContextMenu.ts` | Wire `promptMoveTo` to folder picker modal. Add `showFolderContextMenu` for folder right-click |
| `src/core/detailListRenderer.ts` | Add "New Folder" button to toolbar |
| `src/core/baseCodeDetailView.ts` | Track folder expanded state. Wire folder context menu + folder creation + folder drag-drop callbacks |
| `styles.css` | Folder row styles (icon, indent, background), drop-on-folder highlight |

---

## Chunk 1: Data Model — Folder CRUD in Registry

### Task 1: Add folder field to CodeDefinition and folders to QualiaData

**Files:**
- Modify: `src/core/types.ts:66-78`

- [ ] **Step 1: Add `folder?` to CodeDefinition interface**

```typescript
// src/core/types.ts — CodeDefinition interface (line 66-78)
// Add after mergedFrom:
export interface CodeDefinition {
	id: string;
	name: string;
	color: string;
	description?: string;
	paletteIndex: number;
	createdAt: number;
	updatedAt: number;
	// Hierarchy (Phase A)
	parentId?: string;
	childrenOrder: string[];
	mergedFrom?: string[];
	// Virtual folders (Phase B)
	folder?: string;        // folder id — undefined = no folder (root level)
}
```

- [ ] **Step 2: Add `FolderDefinition` interface and update registry type in QualiaData**

```typescript
// src/core/types.ts — Add before QualiaData
export interface FolderDefinition {
	id: string;
	name: string;
	createdAt: number;
}
```

Update the `registry` section of `QualiaData`:

```typescript
// src/core/types.ts:87-91 — Update registry type
registry: {
	definitions: Record<string, CodeDefinition>;
	nextPaletteIndex: number;
	folders: Record<string, FolderDefinition>;
};
```

Update `createDefaultData()` registry:

```typescript
registry: { definitions: {}, nextPaletteIndex: 0, folders: {} },
```

- [ ] **Step 3: Run `npm run build` to check for type errors**

Run: `npm run build 2>&1 | head -30`
Expected: Type errors in files that access `registry` section — this is expected and will be fixed in Task 2.

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "feat: adiciona folder? em CodeDefinition e FolderDefinition em QualiaData"
```

### Task 2: Add folder CRUD methods to CodeDefinitionRegistry

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Test: `tests/core/folderRegistry.test.ts`

- [ ] **Step 1: Write failing tests for folder CRUD**

```typescript
// tests/core/folderRegistry.test.ts
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

	it('getAllFolders returns all folders sorted by name', () => {
		registry.createFolder('Zebra');
		registry.createFolder('Alpha');
		const all = registry.getAllFolders();
		expect(all.map(f => f.name)).toEqual(['Alpha', 'Zebra']);
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

	it('deleteFolder removes folder and clears code.folder references', () => {
		const folder = registry.createFolder('ToDelete');
		const code = registry.create('MyCode');
		registry.setCodeFolder(code.id, folder.id);
		expect(code.folder).toBe(folder.id);

		registry.deleteFolder(folder.id);
		expect(registry.getFolderById(folder.id)).toBeUndefined();
		expect(code.folder).toBeUndefined();
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
		registry.setCodeFolder(code.id, registry.getAllFolders()[0]!.id);

		const json = registry.toJSON();
		const restored = CodeDefinitionRegistry.fromJSON(json);

		expect(restored.getAllFolders().length).toBe(1);
		expect(restored.getAllFolders()[0]!.name).toBe('F1');
		const restoredCode = restored.getByName('Code1');
		expect(restoredCode?.folder).toBe(restored.getAllFolders()[0]!.id);
	});

	it('fromJSON handles missing folders gracefully', () => {
		const restored = CodeDefinitionRegistry.fromJSON({ definitions: {}, nextPaletteIndex: 0 });
		expect(restored.getAllFolders()).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/core/folderRegistry.test.ts 2>&1 | tail -20`
Expected: FAIL — methods don't exist yet.

- [ ] **Step 3: Implement folder CRUD in CodeDefinitionRegistry**

Add private field after `onMutateListeners` (line 29):

```typescript
private folders: Map<string, FolderDefinition> = new Map();
```

Add import at top:

```typescript
import type { CodeDefinition, FolderDefinition } from './types';
```

Add folder methods before the `// --- Hierarchy mutations ---` section (before line 193):

```typescript
// --- Folder CRUD ---

createFolder(name: string): FolderDefinition {
	// Dedup by name
	for (const f of this.folders.values()) {
		if (f.name === name) return f;
	}
	const folder: FolderDefinition = {
		id: this.generateId(),
		name,
		createdAt: Date.now(),
	};
	this.folders.set(folder.id, folder);
	for (const fn of this.onMutateListeners) fn();
	return folder;
}

getFolderById(id: string): FolderDefinition | undefined {
	return this.folders.get(id);
}

getAllFolders(): FolderDefinition[] {
	return Array.from(this.folders.values())
		.sort((a, b) => a.name.localeCompare(b.name));
}

renameFolder(id: string, name: string): boolean {
	const folder = this.folders.get(id);
	if (!folder) return false;
	if (folder.name === name) return true; // no-op
	// Reject duplicate name
	for (const f of this.folders.values()) {
		if (f.id !== id && f.name === name) return false;
	}
	folder.name = name;
	for (const fn of this.onMutateListeners) fn();
	return true;
}

deleteFolder(id: string): boolean {
	if (!this.folders.has(id)) return false;
	// Clear folder reference from all codes
	for (const def of this.definitions.values()) {
		if (def.folder === id) {
			def.folder = undefined;
		}
	}
	this.folders.delete(id);
	for (const fn of this.onMutateListeners) fn();
	return true;
}

setCodeFolder(codeId: string, folderId: string | undefined): boolean {
	const def = this.definitions.get(codeId);
	if (!def) return false;
	if (folderId !== undefined && !this.folders.has(folderId)) return false;
	def.folder = folderId;
	def.updatedAt = Date.now();
	for (const fn of this.onMutateListeners) fn();
	return true;
}

getCodesInFolder(folderId: string): CodeDefinition[] {
	return this.getAll().filter(d => d.folder === folderId);
}
```

Update `toJSON()` (around line 288):

```typescript
toJSON(): { definitions: Record<string, CodeDefinition>; nextPaletteIndex: number; folders: Record<string, FolderDefinition> } {
	const definitions: Record<string, CodeDefinition> = {};
	for (const [id, def] of this.definitions.entries()) {
		definitions[id] = def;
	}
	const folders: Record<string, FolderDefinition> = {};
	for (const [id, f] of this.folders.entries()) {
		folders[id] = f;
	}
	return { definitions, nextPaletteIndex: this.nextPaletteIndex, folders };
}
```

Update `fromJSON()` (around line 296):

```typescript
static fromJSON(data: any): CodeDefinitionRegistry {
	const registry = new CodeDefinitionRegistry();

	if (data?.definitions) {
		for (const id in data.definitions) {
			const def = data.definitions[id] as CodeDefinition;
			def.id = id;
			if (!def.childrenOrder) def.childrenOrder = [];
			registry.definitions.set(id, def);
			registry.nameIndex.set(def.name, id);
		}
	}
	if (data?.folders) {
		for (const id in data.folders) {
			const f = data.folders[id] as FolderDefinition;
			f.id = id;
			registry.folders.set(id, f);
		}
	}
	if (typeof data?.nextPaletteIndex === 'number') {
		registry.nextPaletteIndex = data.nextPaletteIndex;
	}

	return registry;
}
```

Update `clear()` to also clear folders:

```typescript
clear(): void {
	this.definitions.clear();
	this.nameIndex.clear();
	this.folders.clear();
	this.nextPaletteIndex = 0;
	for (const fn of this.onMutateListeners) fn();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/core/folderRegistry.test.ts -v 2>&1 | tail -30`
Expected: All PASS.

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `npm run test 2>&1 | tail -10`
Expected: All existing tests pass. Build may have type errors from `QualiaData.registry` change — fix `createDefaultData` and `dataManager.clearAllSections` to include `folders: {}`.

- [ ] **Step 6: Fix type errors if any**

In `src/core/types.ts` — `createDefaultData()`:
```typescript
registry: { definitions: {}, nextPaletteIndex: 0, folders: {} },
```

In `src/core/dataManager.ts` — `clearAllSections()`:
```typescript
this.data.registry = { definitions: {}, nextPaletteIndex: 0, folders: {} };
```

- [ ] **Step 7: Run build + tests**

Run: `npm run build 2>&1 | tail -5 && npm run test 2>&1 | tail -5`
Expected: Clean build, all tests pass.

- [ ] **Step 8: Commit**

```bash
~/.claude/scripts/commit.sh "feat: folder CRUD no registry — createFolder, renameFolder, deleteFolder, setCodeFolder + serializacao"
```

---

## Chunk 2: Tree Rendering — Folders in buildFlatTree + Codebook Tree

### Task 3: Extend buildFlatTree to support folder nodes

**Files:**
- Modify: `src/core/hierarchyHelpers.ts`
- Test: `tests/core/folderTree.test.ts`

- [ ] **Step 1: Write failing tests for folder tree building**

```typescript
// tests/core/folderTree.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildFlatTree, buildCountIndex, type FlatTreeNode } from '../../src/core/hierarchyHelpers';
import type { BaseMarker, CodeApplication } from '../../src/core/types';

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
		const c3 = registry.create('Neutro'); // unfiled
		registry.setCodeFolder(c1.id, folder.id);
		registry.setCodeFolder(c2.id, folder.id);

		const nodes = buildFlatTree(registry, new Set());
		// Folder first, then unfiled codes alphabetically
		expect(nodes[0]!.type).toBe('folder');
		expect(nodes[0]!.name).toBe('Emocoes');
		// Unfiled code after folders
		const unfiledIdx = nodes.findIndex(n => n.type === 'code' && n.type === 'code' && n.def.name === 'Neutro');
		expect(unfiledIdx).toBeGreaterThan(0);
	});

	it('codes inside a collapsed folder are hidden', () => {
		const folder = registry.createFolder('F1');
		const code = registry.create('A');
		registry.setCodeFolder(code.id, folder.id);

		const nodes = buildFlatTree(registry, new Set()); // folder not expanded
		const codeNodes = nodes.filter(n => n.type === 'code');
		// Code A should not appear (folder collapsed)
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
		registry.create('Neutro'); // unfiled, doesn't match

		const nodes = buildFlatTree(registry, new Set(), 'Ale');
		// Should show folder (auto-expanded) + matching code
		expect(nodes.some(n => n.type === 'folder' && n.name === 'Emocoes')).toBe(true);
		expect(nodes.some(n => n.type === 'code' && n.def.name === 'Alegria')).toBe(true);
		// Should NOT show non-matching unfiled code
		expect(nodes.some(n => n.type === 'code' && n.def.name === 'Neutro')).toBe(false);
	});

	it('empty folder still appears in tree', () => {
		registry.createFolder('Empty');
		const nodes = buildFlatTree(registry, new Set());
		expect(nodes.some(n => n.type === 'folder' && n.name === 'Empty')).toBe(true);
	});

	it('folder count = total codes in folder (not aggregate of hierarchy)', () => {
		const folder = registry.createFolder('F1');
		const c1 = registry.create('A');
		const c2 = registry.create('B');
		registry.setCodeFolder(c1.id, folder.id);
		registry.setCodeFolder(c2.id, folder.id);

		const nodes = buildFlatTree(registry, new Set());
		const folderNode = nodes.find(n => n.type === 'folder')!;
		expect(folderNode.codeCount).toBe(2);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/core/folderTree.test.ts 2>&1 | tail -20`
Expected: FAIL — `FlatTreeNode` doesn't have `type` field yet.

- [ ] **Step 3: Update `FlatTreeNode` to support folder nodes**

Modify `src/core/hierarchyHelpers.ts`. Change the `FlatTreeNode` type to a discriminated union:

```typescript
// ─── Types ───────────────────────────────────────────────────────

export interface FlatCodeNode {
	type: 'code';
	def: CodeDefinition;
	depth: number;
	hasChildren: boolean;
	isExpanded: boolean;
}

export interface FlatFolderNode {
	type: 'folder';
	folderId: string;
	name: string;
	depth: 0;
	hasChildren: boolean;
	isExpanded: boolean;
	codeCount: number;  // total codes assigned to this folder
}

export type FlatTreeNode = FlatCodeNode | FlatFolderNode;
```

Keep the old interface name as an alias for backwards compat — actually, since the tree renderer and all consumers are internal, just update them all.

- [ ] **Step 4: Update `buildFlatTree` to emit folder nodes**

```typescript
export function buildFlatTree(
	registry: CodeDefinitionRegistry,
	expanded: Set<string>,
	searchQuery?: string,
): FlatTreeNode[] {
	const folders = registry.getAllFolders();

	// If searching, compute which codes/folders to show
	let visibleCodeIds: Set<string> | null = null;
	let visibleFolderIds: Set<string> | null = null;
	let forceExpanded: Set<string> | null = null;

	if (searchQuery && searchQuery.trim().length > 0) {
		const query = searchQuery.trim().toLowerCase();
		visibleCodeIds = new Set<string>();
		visibleFolderIds = new Set<string>();
		forceExpanded = new Set<string>();

		for (const def of registry.getAll()) {
			if (def.name.toLowerCase().includes(query)) {
				visibleCodeIds.add(def.id);
				// Add all ancestors (hierarchy)
				for (const ancestor of registry.getAncestors(def.id)) {
					visibleCodeIds.add(ancestor.id);
					forceExpanded.add(ancestor.id);
				}
				// If code is in a folder, show and expand folder
				if (def.folder) {
					visibleFolderIds.add(def.folder);
					forceExpanded.add(`folder:${def.folder}`);
				}
			}
		}
	}

	const result: FlatTreeNode[] = [];

	// Visit codes recursively (hierarchy-aware)
	const visitCodes = (codes: CodeDefinition[], depth: number): void => {
		for (const def of codes) {
			if (visibleCodeIds && !visibleCodeIds.has(def.id)) continue;

			const children = registry.getChildren(def.id);
			const hasChildren = children.length > 0;
			const isExpanded = forceExpanded?.has(def.id) || expanded.has(def.id);

			result.push({ type: 'code', def, depth, hasChildren, isExpanded: hasChildren && isExpanded });

			if (hasChildren && isExpanded) {
				visitCodes(children, depth + 1);
			}
		}
	};

	// 1. Render folders (sorted by name)
	for (const folder of folders) {
		if (visibleFolderIds && !visibleFolderIds.has(folder.id)) continue;

		const codesInFolder = registry.getCodesInFolder(folder.id);
		// Only root-level codes in folder (children follow their parents)
		const rootCodesInFolder = codesInFolder.filter(c => !c.parentId || !codesInFolder.some(p => p.id === c.parentId));
		const folderExpKey = `folder:${folder.id}`;
		const isExpanded = forceExpanded?.has(folderExpKey) || expanded.has(folderExpKey);

		result.push({
			type: 'folder',
			folderId: folder.id,
			name: folder.name,
			depth: 0,
			hasChildren: codesInFolder.length > 0,
			isExpanded: (codesInFolder.length > 0) && isExpanded,
			codeCount: codesInFolder.length,
		});

		if (isExpanded) {
			visitCodes(rootCodesInFolder, 1);
		}
	}

	// 2. Render unfiled root codes
	const unfiledRoots = registry.getRootCodes().filter(d => !d.folder);
	if (visibleCodeIds) {
		visitCodes(unfiledRoots.filter(d => visibleCodeIds!.has(d.id)), 0);
	} else {
		visitCodes(unfiledRoots, 0);
	}

	return result;
}
```

- [ ] **Step 5: Update `CountIndex` types** — no changes needed. `buildCountIndex` only counts markers per code, not folders. Folders don't have counts in the analytics sense.

- [ ] **Step 6: Run tests**

Run: `npm run test -- tests/core/folderTree.test.ts -v 2>&1 | tail -30`
Expected: All PASS.

- [ ] **Step 7: Update codebookTreeRenderer to handle the new union type**

**Important:** Do NOT commit between Steps 3-4 and this step — the build is broken until the renderer is updated. This step and the next (Task 4) must be committed together.

### Task 4: Update codebookTreeRenderer to render folder rows

**Files:**
- Modify: `src/core/codebookTreeRenderer.ts`

- [ ] **Step 1: Update CodebookTreeCallbacks to support folder interactions**

```typescript
export interface CodebookTreeCallbacks {
	onCodeClick(codeId: string): void;
	onCodeRightClick(codeId: string, event: MouseEvent): void;
	onToggleExpand(codeId: string): void;
	onFolderToggleExpand(folderId: string): void;
	onFolderRightClick(folderId: string, event: MouseEvent): void;
}
```

- [ ] **Step 2: Update renderRow to handle FlatFolderNode vs FlatCodeNode**

Replace the `renderRow` function with two functions:

```typescript
function renderRow(
	node: FlatTreeNode,
	counts: CountIndex,
	index: number,
	callbacks: CodebookTreeCallbacks,
): HTMLElement {
	if (node.type === 'folder') {
		return renderFolderRow(node, index, callbacks);
	}
	return renderCodeRow(node, counts, index, callbacks);
}

function renderFolderRow(
	node: FlatFolderNode,
	index: number,
	callbacks: CodebookTreeCallbacks,
): HTMLElement {
	const row = document.createElement('div');
	row.className = 'codebook-tree-row codebook-folder-row';
	row.style.position = 'absolute';
	row.style.top = `${index * ROW_HEIGHT}px`;
	row.style.height = `${ROW_HEIGHT}px`;
	row.style.width = '100%';
	row.dataset.folderId = node.folderId;

	// Chevron
	const chevron = document.createElement('span');
	chevron.className = 'codebook-tree-chevron';
	if (node.isExpanded) chevron.classList.add('is-expanded');
	setIcon(chevron, 'chevron-right');
	chevron.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onFolderToggleExpand(node.folderId);
	});
	row.appendChild(chevron);

	// Folder icon
	const icon = document.createElement('span');
	icon.className = 'codebook-tree-folder-icon';
	setIcon(icon, node.isExpanded ? 'folder-open' : 'folder');
	row.appendChild(icon);

	// Name
	const name = document.createElement('span');
	name.className = 'codebook-tree-name codebook-folder-name';
	name.textContent = node.name;
	row.appendChild(name);

	// Code count badge
	if (node.codeCount > 0) {
		const badge = document.createElement('span');
		badge.className = 'codebook-tree-count';
		badge.textContent = `${node.codeCount}`;
		badge.title = `${node.codeCount} codes in folder`;
		row.appendChild(badge);
	}

	// Right-click → folder context menu
	row.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		callbacks.onFolderRightClick(node.folderId, e);
	});

	// Click → toggle expand
	row.addEventListener('click', () => {
		callbacks.onFolderToggleExpand(node.folderId);
	});

	return row;
}
```

Rename the old `renderRow` (that handles codes) to `renderCodeRow` and add the type import:

```typescript
import type { FlatTreeNode, FlatCodeNode, FlatFolderNode, CountIndex } from './hierarchyHelpers';

function renderCodeRow(
	node: FlatCodeNode,
	counts: CountIndex,
	index: number,
	callbacks: CodebookTreeCallbacks,
): HTMLElement {
	// ... existing code, unchanged, just uses node.def directly
	// since node is now typed as FlatCodeNode
}
```

- [ ] **Step 3: Make folder rows valid drag-drop targets**

In `codebookTreeRenderer.ts`, add `data-folder-id` attribute to folder rows (already done in Step 2). The drag-drop module will pick these up in Task 5.

- [ ] **Step 4: Run tests + build**

Run: `npm run test -- tests/core/folderTree.test.ts -v 2>&1 | tail -30 && npm run build 2>&1 | tail -15`
Expected: Tree tests pass. Build may have type errors in `baseCodeDetailView.ts` (missing folder callbacks) — will fix in Task 6.

- [ ] **Step 5: Commit Tasks 3 + 4 together** (single commit, build was broken between them)

```bash
~/.claude/scripts/commit.sh "feat: buildFlatTree + codebookTreeRenderer renderizam pastas como FlatFolderNode"
```

### Task 5: Update drag-drop to support folder targets

**Files:**
- Modify: `src/core/codebookDragDrop.ts`

- [ ] **Step 1: Add folder callbacks to DragDropCallbacks**

```typescript
export interface DragDropCallbacks {
	onReparent(codeId: string, newParentId: string | undefined): void;
	onMoveToFolder(codeId: string, folderId: string | undefined): void;
	onMergeDrop(sourceId: string, targetId: string): void;
	setDragMode(mode: 'reorganize' | 'merge'): void;
	refresh(): void;
}
```

- [ ] **Step 2: Update drag-over and drop handlers to detect folder rows**

Add a `findFolderRow` helper:

```typescript
const findFolderRow = (el: EventTarget | null): HTMLElement | null => {
	if (!(el instanceof HTMLElement)) return null;
	return el.closest<HTMLElement>('[data-folder-id]');
};
```

In `onDragOver`, after the root zone check, add folder detection:

```typescript
// Check folder row
const folderRow = findFolderRow(e.target);
if (folderRow && getMode() === 'reorganize') {
	folderRow.classList.add('is-folder-drop-target');
	return;
}
```

In `onDrop`, after root zone handling, add:

```typescript
// Drop on folder row
const folderRow = findFolderRow(e.target);
if (folderRow && getMode() === 'reorganize') {
	const folderId = folderRow.dataset.folderId;
	if (folderId && draggedCodeId) {
		callbacks.onMoveToFolder(draggedCodeId, folderId);
	}
	cleanupDrag();
	return;
}
```

Update `clearDropIndicators` to include folder highlight:

```typescript
const clearDropIndicators = () => {
	for (const el of Array.from(container.querySelectorAll('.is-drop-target, .is-merge-target, .is-folder-drop-target'))) {
		el.classList.remove('is-drop-target', 'is-merge-target', 'is-folder-drop-target');
	}
};
```

In `onDrop` for root zone, also remove from folder:

```typescript
if (isRootZone(e.target)) {
	const mode = getMode();
	if (mode === 'reorganize') {
		callbacks.onReparent(draggedCodeId, undefined);
		callbacks.onMoveToFolder(draggedCodeId, undefined);
	}
	cleanupDrag();
	return;
}
```

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -15`
Expected: Type errors where `DragDropCallbacks` is constructed without `onMoveToFolder` — fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "feat: drag-drop suporta drop em folder row e remove-from-folder no root zone"
```

---

## Chunk 3: UI Integration — Context Menus, Toolbar, Wiring

### Task 6: Wire folder interactions in BaseCodeDetailView

**Files:**
- Modify: `src/core/baseCodeDetailView.ts`
- Modify: `src/core/codebookContextMenu.ts`
- Modify: `src/core/detailListRenderer.ts`

- [ ] **Step 1: Add folder expanded state to BaseCodeDetailView**

In `baseCodeDetailView.ts`, add to private fields (around line 31):

```typescript
protected folderExpanded: Set<string> = new Set<string>();
```

Update `getTreeState()`:

```typescript
protected getTreeState(): CodebookTreeState {
	// Merge folder expanded keys into the expanded set
	const merged = new Set<string>(this.treeExpanded);
	for (const fId of this.folderExpanded) {
		merged.add(`folder:${fId}`);
	}
	return {
		expanded: merged,
		searchQuery: this.searchQuery,
		dragMode: this.treeDragMode,
	};
}
```

- [ ] **Step 2: Update listCallbacks to include folder callbacks**

In `listCallbacks()`:

```typescript
onFolderToggleExpand: (folderId: string) => {
	if (this.folderExpanded.has(folderId)) {
		this.folderExpanded.delete(folderId);
	} else {
		this.folderExpanded.add(folderId);
	}
	if (this.listContentZone) {
		renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
	}
},
onFolderRightClick: (folderId: string, event: MouseEvent) => {
	showFolderContextMenu(event, folderId, this.model.registry, {
		promptRenameFolder: (id) => {
			const folder = this.model.registry.getFolderById(id);
			if (!folder) return;
			const newName = prompt('Rename folder:', folder.name);
			if (newName && newName.trim() && newName.trim() !== folder.name) {
				const ok = this.model.registry.renameFolder(id, newName.trim());
				if (ok) {
					this.model.saveMarkers();
				} else {
					new Notice('A folder with that name already exists.');
				}
			}
		},
		promptDeleteFolder: (id) => {
			const folder = this.model.registry.getFolderById(id);
			if (!folder) return;
			if (confirm(`Delete folder "${folder.name}"? Codes will be moved to root.`)) {
				this.model.registry.deleteFolder(id);
				this.model.saveMarkers();
			}
		},
	});
},
```

- [ ] **Step 3: Update drag-drop setup to pass `onMoveToFolder`**

In `renderList()`, update the `setupDragDrop` callbacks:

```typescript
onMoveToFolder: (codeId, folderId) => {
	this.model.registry.setCodeFolder(codeId, folderId);
	this.model.saveMarkers();
	if (folderId) this.folderExpanded.add(folderId);
},
```

Also update the `onReparent` in root zone drop — when dropping on root zone in reorganize mode, the code should also be unfoldered. The root zone handler in `codebookDragDrop.ts` already calls both `onReparent` and `onMoveToFolder`.

- [ ] **Step 4: Wire `promptMoveTo` — build folder list inline in context menu**

The approach: `showCodeContextMenu` already receives `registry`, so it builds the folder picker inline. The `promptMoveTo` callback receives `(codeId, folderId | undefined)` — the context menu resolves which folder, the callback just applies.

Update `codebookContextMenu.ts` — replace the "Move to..." item (line 43-45) with inline folder list:

```typescript
// Replace the single "Move to..." item with:
const folders = registry.getAllFolders();
if (folders.length > 0) {
	for (const folder of folders) {
		menu.addItem(item =>
			item.setTitle(`Move to ${folder.name}`)
				.setIcon('folder')
				.setChecked(def.folder === folder.id)
				.onClick(() => callbacks.promptMoveTo(codeId, folder.id)),
		);
	}
	if (def.folder) {
		menu.addItem(item =>
			item.setTitle('Remove from folder')
				.setIcon('folder-minus')
				.onClick(() => callbacks.promptMoveTo(codeId, undefined)),
		);
	}
} else {
	menu.addItem(item =>
		item.setTitle('Move to folder...')
			.setIcon('folder-input')
			.setDisabled(true),
	);
}
```

Update `ContextMenuCallbacks` interface — change `promptMoveTo` signature:

```typescript
promptMoveTo(codeId: string, folderId: string | undefined): void;
```

Implement in `baseCodeDetailView.ts` — `contextMenuCallbacks()`:

```typescript
promptMoveTo: (codeId: string, folderId: string | undefined) => {
	this.model.registry.setCodeFolder(codeId, folderId);
	this.model.saveMarkers();
	if (folderId) this.folderExpanded.add(folderId);
},
```

- [ ] **Step 5: Add `showFolderContextMenu` to codebookContextMenu.ts**

```typescript
export interface FolderContextMenuCallbacks {
	promptRenameFolder(folderId: string): void;
	promptDeleteFolder(folderId: string): void;
}

export function showFolderContextMenu(
	event: MouseEvent,
	folderId: string,
	registry: CodeDefinitionRegistry,
	callbacks: FolderContextMenuCallbacks,
): void {
	const folder = registry.getFolderById(folderId);
	if (!folder) return;

	const menu = new Menu();

	menu.addItem(item =>
		item.setTitle('Rename').setIcon('pencil').onClick(() => callbacks.promptRenameFolder(folderId)),
	);

	menu.addSeparator();

	menu.addItem(item =>
		item.setTitle('Delete folder').setIcon('trash-2').onClick(() => callbacks.promptDeleteFolder(folderId)),
	);

	menu.showAtMouseEvent(event);
}
```

- [ ] **Step 6: Add "New Folder" button to toolbar**

In `detailListRenderer.ts`, in `renderCodebookToolbar`, add after the "New Code" button:

```typescript
// New Folder button
const newFolderBtn = toolbar.createEl('button', { cls: 'codebook-new-folder-btn' });
const folderIcon = newFolderBtn.createSpan();
setIcon(folderIcon, 'folder-plus');
newFolderBtn.createSpan({ text: 'New Folder' });
newFolderBtn.addEventListener('click', () => {
	showNewFolderInput(toolbar, model);
});
```

Add `showNewFolderInput`:

```typescript
function showNewFolderInput(toolbar: HTMLElement, model: SidebarModelInterface): void {
	if (toolbar.querySelector('.codebook-new-folder-input-wrap')) return;

	const wrap = toolbar.createDiv({ cls: 'codebook-new-folder-input-wrap' });
	const input = wrap.createEl('input', {
		cls: 'codebook-new-code-input',
		attr: { type: 'text', placeholder: 'Folder name...' },
	});
	input.focus();

	const submit = () => {
		const name = input.value.trim();
		if (name) {
			model.registry.createFolder(name);
			model.saveMarkers();
		}
		wrap.remove();
	};

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); submit(); }
		if (e.key === 'Escape') { wrap.remove(); }
	});
	input.addEventListener('blur', () => {
		setTimeout(() => { if (wrap.isConnected) wrap.remove(); }, 150);
	});
}
```

- [ ] **Step 7: Add import for `showFolderContextMenu` in baseCodeDetailView.ts**

```typescript
import { showCodeContextMenu, showFolderContextMenu, type ContextMenuCallbacks, type FolderContextMenuCallbacks } from './codebookContextMenu';
```

- [ ] **Step 9: Run build + tests**

Run: `npm run build 2>&1 | tail -15 && npm run test 2>&1 | tail -10`
Expected: Clean build, all tests pass.

- [ ] **Step 10: Commit**

```bash
~/.claude/scripts/commit.sh "feat: context menu de pasta, Move to folder, New Folder no toolbar, folder drag-drop"
```

### Task 7: Add CSS for folder rows

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add folder styles**

```css
/* ─── Folder rows ─────────────────────────────────────── */

.codebook-folder-row {
	font-weight: 500;
}

.codebook-tree-folder-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	margin-right: 4px;
	color: var(--text-muted);
}

.codebook-folder-name {
	color: var(--text-muted);
}

.codebook-folder-row:hover .codebook-folder-name {
	color: var(--text-normal);
}

/* Drag-drop: folder as drop target */
.codebook-folder-row.is-folder-drop-target {
	background-color: var(--background-modifier-hover);
	outline: 1px dashed var(--interactive-accent);
	outline-offset: -1px;
}

/* New Folder button */
.codebook-new-folder-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
	color: var(--text-muted);
	background: transparent;
	border: none;
	padding: 2px 6px;
	border-radius: var(--radius-s);
	font-size: var(--font-ui-small);
}

.codebook-new-folder-btn:hover {
	color: var(--text-normal);
	background: var(--background-modifier-hover);
}

.codebook-new-folder-input-wrap {
	padding: 4px 0;
}
```

- [ ] **Step 2: Commit**

```bash
~/.claude/scripts/commit.sh "feat: CSS para folder rows, drop target, e botao New Folder"
```

### Task 8: Final integration test + edge cases

**Files:**
- Test: `tests/core/folderRegistry.test.ts` (add edge cases)
- Test: `tests/core/folderTree.test.ts` (add edge cases)

- [ ] **Step 1: Add edge case tests to folderRegistry.test.ts**

```typescript
describe('folder + hierarchy interaction', () => {
	it('child code inherits no folder from parent (folders are independent of hierarchy)', () => {
		const folder = registry.createFolder('F1');
		const parent = registry.create('Parent');
		const child = registry.create('Child');
		registry.setCodeFolder(parent.id, folder.id);
		registry.setParent(child.id, parent.id);
		// Child does NOT automatically get parent's folder
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
		expect(registry.getAllFolders()).toEqual([]);
	});

	it('renameFolder with same name is a no-op success', () => {
		const folder = registry.createFolder('Same');
		const ok = registry.renameFolder(folder.id, 'Same');
		expect(ok).toBe(true);
	});
});
```

- [ ] **Step 2: Add folder + search + count edge case tests to folderTree.test.ts**

```typescript
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
		// No entry for folder id
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
```

- [ ] **Step 3: Run all tests**

Run: `npm run test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 4: Run build**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "test: edge cases de pastas — hierarquia independente, clear, search vazio"
```

- [ ] **Step 6: Copy build artifacts to demo vault**

Run: `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

Manual test checklist:
1. Open demo vault in Obsidian
2. Create a folder via "New Folder" button
3. Drag a code into the folder
4. Expand/collapse folder
5. Right-click folder → Rename, Delete
6. Right-click code → "Move to folder..." shows folder picker
7. Drop code on root zone → removes from folder
8. Search filters codes inside folders correctly
9. Verify analytics/counts are NOT affected by folders
