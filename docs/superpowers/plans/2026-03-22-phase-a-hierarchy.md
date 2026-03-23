# Phase A: Code Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add parent-child hierarchy to CodeDefinition (parentId, childrenOrder, mergedFrom), build a stack-based Codebook Panel with 3-level navigation, context menu, drag-drop reorganize/merge, merge modal, virtual scrolling for large trees, and hierarchical counts.

**Architecture:** Phase A builds in layers: (1) hierarchy fields + registry methods with cycle detection (pure logic, fully TDD), (2) tree helpers for building/counting hierarchical structures (pure, TDD), (3) Codebook Panel replacing the current Detail View with stack-based navigation and virtual scrolling, (4) context menu + drag-drop for reorganization, (5) merge modal with fuzzy search and segment reassignment. The Explorer view also gains hierarchy awareness. All UI code consults `obsidian-design` skill before CSS and `obsidian-cm6` skill before editor changes.

**Tech Stack:** TypeScript strict, Vitest + jsdom, Obsidian API (ItemView, Menu, Modal, FuzzySuggestModal)

**Spec:** `docs/superpowers/specs/2026-03-22-codebook-evolution-design.md` (Fase A + Navegacao e Interacao)

**Prerequisite:** Phase C complete — markers use `CodeApplication[]` with `codeId`. Helpers in `codeApplicationHelpers.ts`. Popover resolves name→id at UI boundary.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/core/hierarchyHelpers.ts` | Pure functions: tree building, cycle detection, aggregate counts, flatten for virtual scroll |
| `src/core/codebookTreeRenderer.ts` | Level 1 renderer: hierarchical tree with virtual scrolling, indent, collapse, counts, drag-drop zones |
| `src/core/codebookContextMenu.ts` | Context menu builder (Menu API) for codes in the Codebook tree |
| `src/core/codebookDragDrop.ts` | Drag-drop lifecycle: start, move, drop, visual feedback, mode toggle (reorganize/merge) |
| `src/core/mergeModal.ts` | Modal: fuzzy search destination, parent choice, impact preview, execute merge |
| `tests/core/hierarchyHelpers.test.ts` | Tests for tree building, cycle detection, counts |
| `tests/core/codeDefinitionRegistry.hierarchy.test.ts` | Tests for registry hierarchy methods |
| `tests/core/codebookTreeRenderer.test.ts` | Tests for virtual scroll, tree flattening, count display |
| `tests/core/mergeModal.test.ts` | Tests for merge logic (segment reassignment, mergedFrom tracking) |
| `tests/core/hierarchyStress.test.ts` | Stress tests: 5000 codes, deep hierarchy, render performance |

### Modified files

| File | Changes |
|------|---------|
| `src/core/types.ts:66-74` | Add `parentId?`, `childrenOrder?`, `mergedFrom?` to CodeDefinition |
| `src/core/codeDefinitionRegistry.ts` | Add hierarchy methods, update `delete()`, update `create()` to accept parentId, update serialization |
| `src/core/baseCodeDetailView.ts` | Stack-based navigation with breadcrumbs, 3 levels |
| `src/core/detailListRenderer.ts` | Replace flat list with codebook tree (delegates to codebookTreeRenderer) |
| `src/core/detailCodeRenderer.ts` | Add hierarchy section (parent, children, breadcrumbs), count "X diretos · Y com filhos" |
| `src/core/detailMarkerRenderer.ts` | Separate click=drill-down from ↗=reveal |
| `src/core/baseCodeExplorerView.ts` | Hierarchical tree rendering in explorer |
| `src/core/unifiedDetailView.ts` | Update getDisplayText for breadcrumb |
| `styles.css` | Hierarchy indent, drag-drop feedback, merge mode highlight, virtual scroll container |

---

## Chunk 1: Data Model + Registry Hierarchy Methods

### Task 1: Add hierarchy fields to CodeDefinition

**Files:**
- Modify: `src/core/types.ts:66-74`

- [ ] **Step 1: Write failing type test**

Create test file:

```typescript
// tests/core/codeDefinitionRegistry.hierarchy.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { CodeDefinition } from '../../src/core/types';

let registry: CodeDefinitionRegistry;

beforeEach(() => {
  registry = new CodeDefinitionRegistry();
});

describe('hierarchy fields', () => {
  it('new code has no parentId by default', () => {
    const def = registry.create('Root');
    expect(def.parentId).toBeUndefined();
  });

  it('new code has empty childrenOrder by default', () => {
    const def = registry.create('Root');
    expect(def.childrenOrder).toEqual([]);
  });

  it('new code has no mergedFrom by default', () => {
    const def = registry.create('Root');
    expect(def.mergedFrom).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: FAIL — `childrenOrder` is undefined instead of `[]`

- [ ] **Step 3: Add hierarchy fields to CodeDefinition**

In `src/core/types.ts`, update CodeDefinition:

```typescript
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
}
```

`childrenOrder` is **required** (always `[]` for new/leaf codes). This is the correct design:
- `create()` and `fromJSON()` always initialize it — the field is never actually undefined at runtime
- Avoids defensive `?? []` scattered across ~10 call sites
- Consistent with other structural fields (`paletteIndex`, `createdAt`, `updatedAt`)

- [ ] **Step 4: Update registry.create() to initialize childrenOrder**

In `src/core/codeDefinitionRegistry.ts`, update the `create` method to include `childrenOrder: []` in the new `def` object.

- [ ] **Step 5: Fix the 4 places that construct CodeDefinition literals**

Run: `npx tsc --noEmit 2>&1 | head -20`

The only files that construct `CodeDefinition` objects directly:

1. `src/core/codeDefinitionRegistry.ts:64` — `create()`: add `childrenOrder: []` (done in Step 4)
2. `src/core/codeDefinitionRegistry.ts:181` — `fromJSON`: add after `def.id = id`:
   ```typescript
   if (!def.childrenOrder) def.childrenOrder = [];
   ```
3. `src/core/codeDefinitionRegistry.ts:205` — `importDefinition`: update spread:
   ```typescript
   this.definitions.set(def.id, { ...def, childrenOrder: def.childrenOrder ?? [] });
   ```
4. `tests/core/codeDefinitionRegistry.test.ts:262,277` — two `importDefinition` test fixtures: add `childrenOrder: []` to both objects

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite to check nothing broke**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
~/.claude/scripts/commit.sh "feat: adiciona campos de hierarquia (parentId, childrenOrder, mergedFrom) ao CodeDefinition"
```

### Task 2: Registry hierarchy query methods

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Modify: `tests/core/codeDefinitionRegistry.hierarchy.test.ts`

- [ ] **Step 1: Write failing tests for hierarchy queries**

Add to `tests/core/codeDefinitionRegistry.hierarchy.test.ts`:

```typescript
describe('getRootCodes', () => {
  it('returns codes without parentId', () => {
    registry.create('Root1');
    registry.create('Root2');
    const roots = registry.getRootCodes();
    expect(roots.map(d => d.name).sort()).toEqual(['Root1', 'Root2']);
  });

  it('excludes codes with parentId', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(child.id, parent.id);
    const roots = registry.getRootCodes();
    expect(roots.map(d => d.name)).toEqual(['Parent']);
  });
});

describe('getChildren', () => {
  it('returns direct children in childrenOrder', () => {
    const parent = registry.create('Parent');
    const c1 = registry.create('Child1');
    const c2 = registry.create('Child2');
    registry.setParent(c1.id, parent.id);
    registry.setParent(c2.id, parent.id);
    const children = registry.getChildren(parent.id);
    expect(children.map(d => d.name)).toEqual(['Child1', 'Child2']);
  });

  it('returns empty array for leaf code', () => {
    const leaf = registry.create('Leaf');
    expect(registry.getChildren(leaf.id)).toEqual([]);
  });
});

describe('getAncestors', () => {
  it('returns ancestors bottom-up', () => {
    const grandpa = registry.create('Grandpa');
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(parent.id, grandpa.id);
    registry.setParent(child.id, parent.id);
    const ancestors = registry.getAncestors(child.id);
    expect(ancestors.map(d => d.name)).toEqual(['Parent', 'Grandpa']);
  });

  it('returns empty array for root code', () => {
    const root = registry.create('Root');
    expect(registry.getAncestors(root.id)).toEqual([]);
  });
});

describe('getDescendants', () => {
  it('returns all descendants depth-first', () => {
    const root = registry.create('Root');
    const a = registry.create('A');
    const b = registry.create('B');
    const a1 = registry.create('A1');
    registry.setParent(a.id, root.id);
    registry.setParent(b.id, root.id);
    registry.setParent(a1.id, a.id);
    const desc = registry.getDescendants(root.id);
    expect(desc.map(d => d.name)).toEqual(['A', 'A1', 'B']);
  });
});

describe('getDepth', () => {
  it('returns 0 for root', () => {
    const root = registry.create('Root');
    expect(registry.getDepth(root.id)).toBe(0);
  });

  it('returns correct depth for nested code', () => {
    const root = registry.create('Root');
    const child = registry.create('Child');
    const grandchild = registry.create('Grandchild');
    registry.setParent(child.id, root.id);
    registry.setParent(grandchild.id, child.id);
    expect(registry.getDepth(grandchild.id)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: FAIL — methods don't exist

- [ ] **Step 3: Implement hierarchy query methods**

In `src/core/codeDefinitionRegistry.ts`, add after the CRUD section:

```typescript
// --- Hierarchy queries ---

getRootCodes(): CodeDefinition[] {
  return this.getAll().filter(d => !d.parentId);
}

getChildren(parentId: string): CodeDefinition[] {
  const parent = this.definitions.get(parentId);
  if (!parent) return [];
  return parent.childrenOrder
    .map(id => this.definitions.get(id))
    .filter((d): d is CodeDefinition => d !== undefined);
}

getAncestors(id: string): CodeDefinition[] {
  const ancestors: CodeDefinition[] = [];
  let current = this.definitions.get(id);
  while (current?.parentId) {
    const parent = this.definitions.get(current.parentId);
    if (!parent) break;
    ancestors.push(parent);
    current = parent;
  }
  return ancestors;
}

getDescendants(id: string): CodeDefinition[] {
  const result: CodeDefinition[] = [];
  const visit = (parentId: string) => {
    for (const child of this.getChildren(parentId)) {
      result.push(child);
      visit(child.id);
    }
  };
  visit(id);
  return result;
}

getDepth(id: string): number {
  return this.getAncestors(id).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: adiciona metodos de consulta hierarquica ao registry (getRootCodes, getChildren, getAncestors, getDescendants, getDepth)"
```

### Task 3: setParent with cycle detection

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Modify: `tests/core/codeDefinitionRegistry.hierarchy.test.ts`

- [ ] **Step 1: Write failing tests for setParent**

Add to test file:

```typescript
describe('setParent', () => {
  it('sets parentId and updates childrenOrder', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    const result = registry.setParent(child.id, parent.id);
    expect(result).toBe(true);
    expect(registry.getById(child.id)!.parentId).toBe(parent.id);
    expect(registry.getById(parent.id)!.childrenOrder).toContain(child.id);
  });

  it('removes from old parent childrenOrder when reparenting', () => {
    const oldParent = registry.create('OldParent');
    const newParent = registry.create('NewParent');
    const child = registry.create('Child');
    registry.setParent(child.id, oldParent.id);
    registry.setParent(child.id, newParent.id);
    expect(registry.getById(oldParent.id)!.childrenOrder).not.toContain(child.id);
    expect(registry.getById(newParent.id)!.childrenOrder).toContain(child.id);
  });

  it('promotes to root when parentId is undefined', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(child.id, parent.id);
    registry.setParent(child.id, undefined);
    expect(registry.getById(child.id)!.parentId).toBeUndefined();
    expect(registry.getById(parent.id)!.childrenOrder).not.toContain(child.id);
  });

  it('rejects self-parenting', () => {
    const code = registry.create('Self');
    const result = registry.setParent(code.id, code.id);
    expect(result).toBe(false);
    expect(registry.getById(code.id)!.parentId).toBeUndefined();
  });

  it('rejects cycle: parent cannot become child of its descendant', () => {
    const grandpa = registry.create('Grandpa');
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(parent.id, grandpa.id);
    registry.setParent(child.id, parent.id);
    // Try to make grandpa a child of child → cycle!
    const result = registry.setParent(grandpa.id, child.id);
    expect(result).toBe(false);
    expect(registry.getById(grandpa.id)!.parentId).toBeUndefined();
  });

  it('rejects if target parent does not exist', () => {
    const code = registry.create('Code');
    const result = registry.setParent(code.id, 'nonexistent');
    expect(result).toBe(false);
  });

  it('fires onMutate on successful setParent', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    const fn = vi.fn();
    registry.addOnMutate(fn);
    registry.setParent(child.id, parent.id);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not fire onMutate on rejected setParent', () => {
    const code = registry.create('Self');
    const fn = vi.fn();
    registry.addOnMutate(fn);
    registry.setParent(code.id, code.id);
    expect(fn).not.toHaveBeenCalled();
  });

  it('preserves childrenOrder when adding multiple children', () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: FAIL — `setParent` doesn't exist

- [ ] **Step 3: Implement setParent**

In `src/core/codeDefinitionRegistry.ts`:

```typescript
/**
 * Set or change the parent of a code. Returns false if the operation
 * would create a cycle, target doesn't exist, or is self-parenting.
 * Pass undefined to promote to root.
 */
setParent(id: string, parentId: string | undefined): boolean {
  const def = this.definitions.get(id);
  if (!def) return false;

  if (parentId !== undefined) {
    // Reject self-parenting
    if (parentId === id) return false;
    // Reject if parent doesn't exist
    if (!this.definitions.has(parentId)) return false;
    // Reject cycles: walk up from parentId, if we reach id → cycle
    let cursor = parentId;
    while (cursor) {
      if (cursor === id) return false;
      const p = this.definitions.get(cursor);
      cursor = p?.parentId ?? '';
      if (!cursor) break;
    }
  }

  // Remove from old parent's childrenOrder
  if (def.parentId) {
    const oldParent = this.definitions.get(def.parentId);
    if (oldParent) {
      oldParent.childrenOrder = oldParent.childrenOrder.filter(cid => cid !== id);
    }
  }

  // Set new parent
  def.parentId = parentId;
  def.updatedAt = Date.now();

  // Add to new parent's childrenOrder
  if (parentId) {
    const newParent = this.definitions.get(parentId)!;
    if (!newParent.childrenOrder.includes(id)) {
      newParent.childrenOrder.push(id);
    }
    newParent.updatedAt = Date.now();
  }

  for (const fn of this.onMutateListeners) fn();
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: implementa setParent com deteccao de ciclo no registry"
```

### Task 4: Update delete() for hierarchy — children become root

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts:104-112`
- Modify: `tests/core/codeDefinitionRegistry.hierarchy.test.ts`

- [ ] **Step 1: Write failing tests for delete with hierarchy**

Add to test file:

```typescript
describe('delete with hierarchy', () => {
  it('children become root when parent is deleted', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(child.id, parent.id);
    registry.delete(parent.id);
    expect(registry.getById(child.id)!.parentId).toBeUndefined();
    expect(registry.getRootCodes().map(d => d.name)).toContain('Child');
  });

  it('removes from own parent childrenOrder when deleted', () => {
    const grandpa = registry.create('Grandpa');
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(parent.id, grandpa.id);
    registry.setParent(child.id, parent.id);
    registry.delete(parent.id);
    expect(registry.getById(grandpa.id)!.childrenOrder).not.toContain(parent.id);
    // Child should be root now, not reparented to grandpa
    expect(registry.getById(child.id)!.parentId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: FAIL — children still have deleted parent's id

- [ ] **Step 3: Update delete() to handle hierarchy**

In `src/core/codeDefinitionRegistry.ts`, update `delete`:

```typescript
delete(id: string): boolean {
  const def = this.definitions.get(id);
  if (!def) return false;

  // Promote children to root
  for (const childId of def.childrenOrder) {
    const child = this.definitions.get(childId);
    if (child) {
      child.parentId = undefined;
    }
  }

  // Remove from own parent's childrenOrder
  if (def.parentId) {
    const parent = this.definitions.get(def.parentId);
    if (parent) {
      parent.childrenOrder = parent.childrenOrder.filter(cid => cid !== id);
    }
  }

  this.nameIndex.delete(def.name);
  this.definitions.delete(id);
  for (const fn of this.onMutateListeners) fn();
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: ALL PASS (existing delete tests should still pass)

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: delete de codigo-pai promove filhos a root"
```

### Task 5: Serialization round-trip with hierarchy

**Files:**
- Modify: `tests/core/codeDefinitionRegistry.hierarchy.test.ts`

- [ ] **Step 1: Write failing test for serialization**

Add to test file:

```typescript
describe('hierarchy serialization', () => {
  it('round-trips parentId and childrenOrder', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(child.id, parent.id);
    const json = registry.toJSON();
    const restored = CodeDefinitionRegistry.fromJSON(json);
    expect(restored.getById(child.id)!.parentId).toBe(parent.id);
    expect(restored.getById(parent.id)!.childrenOrder).toEqual([child.id]);
    expect(restored.getChildren(parent.id).map(d => d.name)).toEqual(['Child']);
  });

  it('round-trips mergedFrom', () => {
    const code = registry.create('Merged');
    // Manually set mergedFrom (merge logic will do this later)
    code.mergedFrom = ['old-id-1', 'old-id-2'];
    const json = registry.toJSON();
    const restored = CodeDefinitionRegistry.fromJSON(json);
    expect(restored.getById(code.id)!.mergedFrom).toEqual(['old-id-1', 'old-id-2']);
  });

  it('fromJSON handles legacy data without childrenOrder', () => {
    const json = {
      definitions: {
        'id1': { id: 'id1', name: 'Legacy', color: '#000', paletteIndex: 0, createdAt: 0, updatedAt: 0 }
      },
      nextPaletteIndex: 1,
    };
    const restored = CodeDefinitionRegistry.fromJSON(json);
    expect(restored.getById('id1')!.childrenOrder).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: PASS (serialization should already work since fields are on the object)

If `fromJSON` doesn't initialize `childrenOrder`, fix it (already done in Task 1 Step 5).

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "test: verifica round-trip de hierarquia na serializacao do registry"
```

### Task 6: Registry create() with parentId parameter

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts:58-78`
- Modify: `tests/core/codeDefinitionRegistry.hierarchy.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('create with parentId', () => {
  it('creates child code with parentId set', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child', undefined, undefined, parent.id);
    expect(child.parentId).toBe(parent.id);
    expect(registry.getById(parent.id)!.childrenOrder).toContain(child.id);
  });

  it('ignores invalid parentId silently', () => {
    const code = registry.create('Orphan', undefined, undefined, 'nonexistent');
    expect(code.parentId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: FAIL — `create` doesn't accept parentId

- [ ] **Step 3: Update create() signature**

In `src/core/codeDefinitionRegistry.ts`, update `create`:

```typescript
create(name: string, color?: string, description?: string, parentId?: string): CodeDefinition {
  const existing = this.getByName(name);
  if (existing) return existing;

  const assignedColor = color || this.consumeNextPaletteColor();
  const def: CodeDefinition = {
    id: this.generateId(),
    name,
    color: assignedColor,
    description: description || undefined,
    paletteIndex: color ? -1 : this.nextPaletteIndex - 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    childrenOrder: [],
  };

  // Set parent if valid
  if (parentId && this.definitions.has(parentId)) {
    def.parentId = parentId;
  }

  this.definitions.set(def.id, def);
  this.nameIndex.set(def.name, def.id);

  // Add to parent's childrenOrder
  if (def.parentId) {
    const parent = this.definitions.get(def.parentId)!;
    parent.childrenOrder.push(def.id);
  }

  for (const fn of this.onMutateListeners) fn();
  return def;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/core/codeDefinitionRegistry.hierarchy.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: registry.create() aceita parentId opcional para criar codigos filhos"
```

---

## Chunk 2: Hierarchy Tree Helpers

### Task 7: Tree building and flattening helpers

**Files:**
- Create: `src/core/hierarchyHelpers.ts`
- Create: `tests/core/hierarchyHelpers.test.ts`

These are **pure functions** — no Obsidian API, no DOM. They take a registry and return data structures.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/hierarchyHelpers.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import {
  buildFlatTree,
  getAggregateCount,
  getDirectCount,
  getCountBreakdown,
  type FlatTreeNode,
} from '../../src/core/hierarchyHelpers';
import type { BaseMarker, CodeApplication } from '../../src/core/types';

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
  return {
    markerType: 'markdown', id, fileId: 'test.md',
    codes, createdAt: 0, updatedAt: 0,
  };
}

let registry: CodeDefinitionRegistry;

beforeEach(() => {
  registry = new CodeDefinitionRegistry();
});

describe('buildFlatTree', () => {
  it('returns flat list for codes without hierarchy', () => {
    registry.create('A');
    registry.create('B');
    const expanded = new Set<string>();
    const tree = buildFlatTree(registry, expanded);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.depth).toBe(0);
    expect(tree[1]!.depth).toBe(0);
  });

  it('shows children only when parent is expanded', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(child.id, parent.id);

    // Collapsed: only parent visible
    const collapsed = buildFlatTree(registry, new Set());
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.def.name).toBe('Parent');

    // Expanded: parent + child visible
    const expanded = buildFlatTree(registry, new Set([parent.id]));
    expect(expanded).toHaveLength(2);
    expect(expanded[0]!.def.name).toBe('Parent');
    expect(expanded[1]!.def.name).toBe('Child');
    expect(expanded[1]!.depth).toBe(1);
  });

  it('respects childrenOrder', () => {
    const parent = registry.create('Parent');
    const c1 = registry.create('C1');
    const c2 = registry.create('C2');
    const c3 = registry.create('C3');
    registry.setParent(c1.id, parent.id);
    registry.setParent(c2.id, parent.id);
    registry.setParent(c3.id, parent.id);
    const tree = buildFlatTree(registry, new Set([parent.id]));
    expect(tree.map(n => n.def.name)).toEqual(['Parent', 'C1', 'C2', 'C3']);
  });

  it('handles deep nesting', () => {
    const root = registry.create('L0');
    const l1 = registry.create('L1');
    const l2 = registry.create('L2');
    const l3 = registry.create('L3');
    registry.setParent(l1.id, root.id);
    registry.setParent(l2.id, l1.id);
    registry.setParent(l3.id, l2.id);
    const allExpanded = new Set([root.id, l1.id, l2.id]);
    const tree = buildFlatTree(registry, allExpanded);
    expect(tree.map(n => n.depth)).toEqual([0, 1, 2, 3]);
  });

  it('hasChildren is true only for codes with children', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(child.id, parent.id);
    const tree = buildFlatTree(registry, new Set([parent.id]));
    expect(tree[0]!.hasChildren).toBe(true);
    expect(tree[1]!.hasChildren).toBe(false);
  });

  it('filters by search query across hierarchy', () => {
    const parent = registry.create('Emotions');
    const child = registry.create('Joy');
    registry.setParent(child.id, parent.id);
    // Search "Joy" should show Joy + its parent path
    const tree = buildFlatTree(registry, new Set(), 'joy');
    expect(tree.some(n => n.def.name === 'Joy')).toBe(true);
    expect(tree.some(n => n.def.name === 'Emotions')).toBe(true);
  });
});

describe('count helpers', () => {
  it('getDirectCount counts only direct markers', () => {
    const parent = registry.create('Parent');
    const child = registry.create('Child');
    registry.setParent(child.id, parent.id);
    const markers = [
      makeMarker('m1', [{ codeId: parent.id }]),
      makeMarker('m2', [{ codeId: child.id }]),
      makeMarker('m3', [{ codeId: child.id }]),
    ];
    expect(getDirectCount(parent.id, markers)).toBe(1);
    expect(getDirectCount(child.id, markers)).toBe(2);
  });

  it('getAggregateCount includes descendant markers', () => {
    const root = registry.create('Root');
    const child = registry.create('Child');
    registry.setParent(child.id, root.id);
    const markers = [
      makeMarker('m1', [{ codeId: root.id }]),
      makeMarker('m2', [{ codeId: child.id }]),
    ];
    expect(getAggregateCount(root.id, registry, markers)).toBe(2);
  });

  it('getCountBreakdown returns direct and withChildren', () => {
    const root = registry.create('Root');
    const child = registry.create('Child');
    registry.setParent(child.id, root.id);
    const markers = [
      makeMarker('m1', [{ codeId: root.id }]),
      makeMarker('m2', [{ codeId: child.id }]),
      makeMarker('m3', [{ codeId: child.id }]),
    ];
    const breakdown = getCountBreakdown(root.id, registry, markers);
    expect(breakdown.direct).toBe(1);
    expect(breakdown.withChildren).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/core/hierarchyHelpers.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement hierarchyHelpers**

```typescript
// src/core/hierarchyHelpers.ts
import type { CodeDefinition, BaseMarker } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

export interface FlatTreeNode {
  def: CodeDefinition;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

/**
 * Build a flat list of tree nodes respecting hierarchy, expand state, and optional search.
 * Root codes sorted alphabetically. Children follow childrenOrder.
 */
export function buildFlatTree(
  registry: CodeDefinitionRegistry,
  expanded: Set<string>,
  searchQuery?: string,
): FlatTreeNode[] {
  const q = searchQuery?.toLowerCase().trim();

  // If searching, find matching codes and include their ancestor paths
  let visibleIds: Set<string> | null = null;
  if (q) {
    visibleIds = new Set<string>();
    for (const def of registry.getAll()) {
      if (def.name.toLowerCase().includes(q)) {
        visibleIds.add(def.id);
        // Include all ancestors so the path is visible
        for (const ancestor of registry.getAncestors(def.id)) {
          visibleIds.add(ancestor.id);
        }
      }
    }
  }

  const result: FlatTreeNode[] = [];
  const roots = registry.getRootCodes();

  const visit = (codes: CodeDefinition[], depth: number) => {
    for (const def of codes) {
      if (visibleIds && !visibleIds.has(def.id)) continue;

      const children = registry.getChildren(def.id);
      const hasChildren = children.length > 0;
      const isExpanded = expanded.has(def.id) || (!!q && hasChildren);

      result.push({ def, depth, hasChildren, isExpanded });

      if (isExpanded && hasChildren) {
        visit(children, depth + 1);
      }
    }
  };

  visit(roots, 0);
  return result;
}

/**
 * Count markers directly assigned to a code (not descendants).
 */
export function getDirectCount(codeId: string, markers: BaseMarker[]): number {
  let count = 0;
  for (const marker of markers) {
    for (const ca of marker.codes) {
      if (ca.codeId === codeId) { count++; break; }
    }
  }
  return count;
}

/**
 * Count markers assigned to a code OR any of its descendants.
 */
export function getAggregateCount(
  codeId: string,
  registry: CodeDefinitionRegistry,
  markers: BaseMarker[],
): number {
  const ids = new Set<string>([codeId]);
  for (const desc of registry.getDescendants(codeId)) {
    ids.add(desc.id);
  }
  let count = 0;
  for (const marker of markers) {
    for (const ca of marker.codes) {
      if (ids.has(ca.codeId)) { count++; break; }
    }
  }
  return count;
}

/**
 * Returns { direct, withChildren } count breakdown for a code.
 */
export function getCountBreakdown(
  codeId: string,
  registry: CodeDefinitionRegistry,
  markers: BaseMarker[],
): { direct: number; withChildren: number } {
  return {
    direct: getDirectCount(codeId, markers),
    withChildren: getAggregateCount(codeId, registry, markers),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/core/hierarchyHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: helpers puros de hierarquia (buildFlatTree, counts direto/agregado)"
```

### Task 8: Precomputed count index for performance

**Files:**
- Modify: `src/core/hierarchyHelpers.ts`
- Modify: `tests/core/hierarchyHelpers.test.ts`

For trees with thousands of codes, calling `getAggregateCount` per node is O(n*m). Build a precomputed index instead.

- [ ] **Step 1: Write failing test**

Add to test file:

```typescript
import { buildCountIndex, type CountIndex } from '../../src/core/hierarchyHelpers';

describe('buildCountIndex', () => {
  it('computes direct and aggregate counts for all codes at once', () => {
    const root = registry.create('Root');
    const a = registry.create('A');
    const b = registry.create('B');
    const a1 = registry.create('A1');
    registry.setParent(a.id, root.id);
    registry.setParent(b.id, root.id);
    registry.setParent(a1.id, a.id);
    const markers = [
      makeMarker('m1', [{ codeId: root.id }]),
      makeMarker('m2', [{ codeId: a.id }]),
      makeMarker('m3', [{ codeId: a1.id }]),
      makeMarker('m4', [{ codeId: b.id }]),
      makeMarker('m5', [{ codeId: b.id }]),
    ];
    const index = buildCountIndex(registry, markers);
    // Root: 1 direct, 5 aggregate (1 + 1(A) + 1(A1) + 2(B))
    expect(index.get(root.id)!.direct).toBe(1);
    expect(index.get(root.id)!.aggregate).toBe(5);
    // A: 1 direct, 2 aggregate (1 + 1(A1))
    expect(index.get(a.id)!.direct).toBe(1);
    expect(index.get(a.id)!.aggregate).toBe(2);
    // A1: 1 direct, 1 aggregate (leaf)
    expect(index.get(a1.id)!.direct).toBe(1);
    expect(index.get(a1.id)!.aggregate).toBe(1);
    // B: 2 direct, 2 aggregate (leaf)
    expect(index.get(b.id)!.direct).toBe(2);
    expect(index.get(b.id)!.aggregate).toBe(2);
  });

  it('returns 0/0 for codes with no markers', () => {
    const code = registry.create('Empty');
    const index = buildCountIndex(registry, []);
    expect(index.get(code.id)!.direct).toBe(0);
    expect(index.get(code.id)!.aggregate).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/hierarchyHelpers.test.ts`
Expected: FAIL — `buildCountIndex` doesn't exist

- [ ] **Step 3: Implement buildCountIndex**

Add to `src/core/hierarchyHelpers.ts`:

```typescript
export interface CountEntry {
  direct: number;
  aggregate: number;
}

export type CountIndex = Map<string, CountEntry>;

/**
 * Precompute direct + aggregate counts for every code.
 * O(markers * codes_per_marker + definitions) — single pass.
 */
export function buildCountIndex(
  registry: CodeDefinitionRegistry,
  markers: BaseMarker[],
): CountIndex {
  const index: CountIndex = new Map();

  // Initialize all codes with 0/0
  for (const def of registry.getAll()) {
    index.set(def.id, { direct: 0, aggregate: 0 });
  }

  // Count direct assignments (each marker counts at most once per code)
  for (const marker of markers) {
    const seen = new Set<string>();
    for (const ca of marker.codes) {
      if (seen.has(ca.codeId)) continue;
      seen.add(ca.codeId);
      const entry = index.get(ca.codeId);
      if (entry) entry.direct++;
    }
  }

  // Bottom-up aggregation: for each code, aggregate = direct + sum(children.aggregate)
  // Process leaves first (codes with no children), then their parents, etc.
  // Use post-order DFS from roots.
  const aggregate = (id: string): number => {
    const entry = index.get(id);
    if (!entry) return 0;
    let total = entry.direct;
    const def = registry.getById(id);
    if (def) {
      for (const childId of def.childrenOrder) {
        total += aggregate(childId);
      }
    }
    entry.aggregate = total;
    return total;
  };

  for (const root of registry.getRootCodes()) {
    aggregate(root.id);
  }

  return index;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/core/hierarchyHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: buildCountIndex pre-computa contagens diretas e agregadas para toda a arvore"
```

---

## Chunk 3: Codebook Panel Level 1 — Hierarchical Tree

> **Skill note:** Before implementing CSS in this chunk, consult `obsidian-design` skill for Obsidian CSS variable reference, class naming, and anti-patterns.

### Task 9: Codebook tree renderer — core structure

**Files:**
- Create: `src/core/codebookTreeRenderer.ts`
- Create: `tests/core/codebookTreeRenderer.test.ts`

This renderer builds the Level 1 view: hierarchical tree with virtual scrolling.

- [ ] **Step 1: Write failing test for tree renderer data contract**

```typescript
// tests/core/codebookTreeRenderer.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildFlatTree, buildCountIndex } from '../../src/core/hierarchyHelpers';

let registry: CodeDefinitionRegistry;

beforeEach(() => {
  registry = new CodeDefinitionRegistry();
});

describe('codebookTreeRenderer data', () => {
  it('buildFlatTree produces correct nodes for virtual scroll', () => {
    const root = registry.create('Emotions');
    const joy = registry.create('Joy');
    const anger = registry.create('Anger');
    registry.setParent(joy.id, root.id);
    registry.setParent(anger.id, root.id);

    // Collapsed: only root
    const collapsed = buildFlatTree(registry, new Set());
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.hasChildren).toBe(true);

    // Expanded: root + 2 children
    const expanded = buildFlatTree(registry, new Set([root.id]));
    expect(expanded).toHaveLength(3);
    expect(expanded[1]!.depth).toBe(1);
    expect(expanded[2]!.depth).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test -- tests/core/codebookTreeRenderer.test.ts`
Expected: PASS (uses already-implemented helpers)

- [ ] **Step 3: Implement codebookTreeRenderer**

```typescript
// src/core/codebookTreeRenderer.ts
/**
 * Codebook Tree Renderer — Level 1 of the Codebook Panel.
 *
 * Renders a hierarchical tree of codes with:
 * - Virtual scrolling (only renders visible rows)
 * - Indent per depth level
 * - Collapse/expand chevrons
 * - Color swatch
 * - Count badge (aggregate when collapsed, direct when expanded)
 * - Tooltip with full breakdown
 *
 * Pure rendering function: receives container + data, produces DOM.
 */

import { setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { BaseMarker, SidebarModelInterface } from './types';
import { buildFlatTree, buildCountIndex, type FlatTreeNode, type CountIndex } from './hierarchyHelpers';

const ROW_HEIGHT = 30;     // px — fixed height for virtual scroll
const BUFFER_ROWS = 10;    // extra rows rendered above/below viewport
const INDENT_PX = 18;      // px per depth level

export interface CodebookTreeCallbacks {
  onCodeClick(codeId: string): void;
  onCodeRightClick(codeId: string, event: MouseEvent): void;
  onSearchChange(query: string): void;
}

export interface CodebookTreeState {
  expanded: Set<string>;
  searchQuery: string;
  dragMode: 'reorganize' | 'merge';
}

/**
 * Render the virtual-scrolled tree into the given container.
 * Returns a cleanup function and an API to update state without full re-render.
 */
export function renderCodebookTree(
  container: HTMLElement,
  model: SidebarModelInterface,
  state: CodebookTreeState,
  callbacks: CodebookTreeCallbacks,
): { cleanup: () => void; refresh: () => void } {
  container.empty();

  const markers = model.getAllMarkers();
  const countIndex = buildCountIndex(model.registry, markers);
  const flatNodes = buildFlatTree(model.registry, state.expanded, state.searchQuery || undefined);

  if (flatNodes.length === 0) {
    container.createEl('p', { text: 'No codes yet.', cls: 'codemarker-detail-empty' });
    return { cleanup: () => {}, refresh: () => {} };
  }

  // Virtual scroll container
  const scrollContainer = container.createDiv({ cls: 'codebook-tree-scroll' });
  const totalHeight = flatNodes.length * ROW_HEIGHT;
  const spacer = scrollContainer.createDiv({ cls: 'codebook-tree-spacer' });
  spacer.style.height = `${totalHeight}px`;
  spacer.style.position = 'relative';

  const viewport = scrollContainer.createDiv({ cls: 'codebook-tree-viewport' });
  viewport.style.position = 'absolute';
  viewport.style.left = '0';
  viewport.style.right = '0';

  let currentStartIdx = -1;
  let currentEndIdx = -1;

  const renderVisibleRows = () => {
    const scrollTop = scrollContainer.scrollTop;
    const viewportHeight = scrollContainer.clientHeight;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const endIdx = Math.min(flatNodes.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

    if (startIdx === currentStartIdx && endIdx === currentEndIdx) return;
    currentStartIdx = startIdx;
    currentEndIdx = endIdx;

    viewport.empty();
    viewport.style.top = `${startIdx * ROW_HEIGHT}px`;

    for (let i = startIdx; i < endIdx; i++) {
      const node = flatNodes[i]!;
      renderTreeRow(viewport, node, countIndex, state, callbacks);
    }
  };

  renderVisibleRows();

  const onScroll = () => requestAnimationFrame(renderVisibleRows);
  scrollContainer.addEventListener('scroll', onScroll, { passive: true });

  const cleanup = () => {
    scrollContainer.removeEventListener('scroll', onScroll);
  };

  // refresh = full rebuild (call when expand/collapse/data changes)
  const refresh = () => {
    renderCodebookTree(container, model, state, callbacks);
  };

  return { cleanup, refresh };
}

function renderTreeRow(
  parent: HTMLElement,
  node: FlatTreeNode,
  countIndex: CountIndex,
  state: CodebookTreeState,
  callbacks: CodebookTreeCallbacks,
) {
  const row = parent.createDiv({ cls: 'codebook-tree-row' });
  row.style.height = `${ROW_HEIGHT}px`;
  row.style.paddingLeft = `${node.depth * INDENT_PX + 4}px`;
  row.dataset.codeId = node.def.id;

  // Collapse/expand chevron
  if (node.hasChildren) {
    const chevron = row.createSpan({ cls: 'codebook-tree-chevron' });
    setIcon(chevron, 'right-triangle');
    if (node.isExpanded) chevron.addClass('is-expanded');
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.expanded.has(node.def.id)) {
        state.expanded.delete(node.def.id);
      } else {
        state.expanded.add(node.def.id);
      }
      // Trigger refresh from parent
      callbacks.onSearchChange(state.searchQuery); // re-render
    });
  } else {
    // Spacer for alignment
    row.createSpan({ cls: 'codebook-tree-chevron-spacer' });
  }

  // Color swatch
  const swatch = row.createSpan({ cls: 'codebook-tree-swatch' });
  swatch.style.backgroundColor = node.def.color;

  // Name
  row.createSpan({ cls: 'codebook-tree-name', text: node.def.name });

  // Count badge
  const counts = countIndex.get(node.def.id);
  if (counts) {
    const displayCount = node.isExpanded ? counts.direct : counts.aggregate;
    const badge = row.createSpan({ cls: 'codebook-tree-count', text: String(displayCount) });

    // Tooltip with breakdown
    if (counts.direct !== counts.aggregate) {
      badge.title = `${counts.direct} diretos · ${counts.aggregate - counts.direct} em subcodigos · ${counts.aggregate} total`;
    }
  }

  // Click → drill-down to code page (Level 2)
  row.addEventListener('click', () => callbacks.onCodeClick(node.def.id));

  // Right-click → context menu
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    callbacks.onCodeRightClick(node.def.id, e);
  });
}
```

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "feat: codebookTreeRenderer com virtual scrolling e hierarquia"
```

### Task 10: Wire codebook tree into detailListRenderer

**Files:**
- Modify: `src/core/detailListRenderer.ts`
- Modify: `src/core/baseCodeDetailView.ts`

The Level 1 of the Codebook Panel replaces the current flat "All Codes" list. The `detailListRenderer` delegates to `codebookTreeRenderer` for the tree.

- [ ] **Step 1: Update detailListRenderer to use hierarchical tree**

Replace `renderListContent` to use `renderCodebookTree` instead of the flat list:

```typescript
// In detailListRenderer.ts — update imports and add:
import { renderCodebookTree, type CodebookTreeState, type CodebookTreeCallbacks } from './codebookTreeRenderer';

// Update ListRendererCallbacks to include hierarchy actions:
export interface ListRendererCallbacks {
  onCodeClick(codeId: string): void;  // Changed: now receives codeId, not codeName
  onCodeRightClick(codeId: string, event: MouseEvent): void;
  onSearchChange(query: string): void;
}
```

Update `renderListContent` to call `renderCodebookTree` with the hierarchical data. The tree state (expanded set, dragMode) lives in `baseCodeDetailView` and is passed through.

- [ ] **Step 2: Update baseCodeDetailView to manage tree state**

In `src/core/baseCodeDetailView.ts`, add state fields:

```typescript
// Add to class fields:
private treeExpanded = new Set<string>();
private treeDragMode: 'reorganize' | 'merge' = 'reorganize';
```

Update `listCallbacks()` to pass `codeId` instead of `codeName`:
```typescript
onCodeClick: (codeId: string) => {
  this.searchQuery = '';
  this.showCodeDetail(codeId);
},
```

- [ ] **Step 3: Refactor navigation from codeName to codeId**

The stack navigation currently uses `codeName`. For hierarchy support, it must use `codeId` internally (names can change via rename). This is a cross-cutting refactor — here are ALL call sites:

**In `src/core/baseCodeDetailView.ts`:**
- Line 24: `protected codeName: string | null` → `protected codeId: string | null`
- Line 40-46: `boundRenameHandler` — remove entirely (rename no longer affects navigation since we use id)
- Line 80,88: remove `qualia:code-renamed` listener registration
- Line 97-102: `showList()` — change `this.codeName = null` → `this.codeId = null`
- Line 105-110: `showCodeDetail(codeName)` → `showCodeDetail(codeId: string)`, set `this.codeId = codeId`
- Line 113-118: `setContext(markerId, codeName)` → `setContext(markerId, codeId)`, set `this.codeId = codeId`
- Line 120-123: `getDisplayText()` — resolve `this.codeId` → `registry.getById(this.codeId)?.name ?? 'Code Detail'`
- Line 128-140: `refreshCurrentMode()` — use `this.codeId` instead of `this.codeName`
- Line 157-159: `listCallbacks.onCodeClick` — already receives codeId (updated in Step 2)
- Line 182,207: pass `this.codeId` to renderers

**In `src/core/detailCodeRenderer.ts`:**
- Line 28-33: `renderCodeDetail(container, codeName, model, ...)` → `renderCodeDetail(container, codeId, model, ...)`
- Line 36: `model.registry.getByName(codeName)` → `model.registry.getById(codeId)`
- All internal `codeName` references → resolve name from def for display
- Line 141: `renderDeleteCodeButton` — use codeId for delete, resolve name for display
- Line 261: `model.deleteCode(codeName)` → `model.deleteCode(codeId)`

**In `src/core/detailMarkerRenderer.ts`:**
- Line 28: `renderMarkerDetail(container, markerId, codeName, ...)` → `renderMarkerDetail(container, markerId, codeId, ...)`
- Resolve name from registry for display

**In `src/core/unifiedDetailView.ts`:**
- Update `getDisplayText()` to use codeId-based lookup

**In `src/main.ts`:**
- Lines 129-131, 136-139: `revealCodeDetailPanel(markerId, codeName)` and `revealCodeDetailForCode(codeName)` — update to accept codeId
- Lines 147-181: update the reveal helper methods

**In cross-engine event listeners** (`codemarker:label-click`, `codemarker:code-click`):
- These currently pass `codeName`. Update to pass `codeId` instead, or resolve name→id at the event boundary.

**Test files to update:**
- `tests/core/baseCodeDetailView.test.ts` (if exists) — update fixture calls
- Any test that calls `showCodeDetail` or `setContext` with codeName

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: ALL PASS (may need test updates for changed callbacks)

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: Codebook Panel Level 1 usa arvore hierarquica com virtual scrolling"
```

### Task 11: Codebook tree CSS

**Files:**
- Modify: `styles.css`

> **Before implementing:** Invoke `obsidian-design` skill for CSS variable reference and class naming conventions.

- [ ] **Step 1: Add CSS for codebook tree**

```css
/* ── Codebook Tree (virtual scroll) ───────────────────── */

.codebook-tree-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.codebook-tree-spacer {
  width: 100%;
}

.codebook-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 8px;
  cursor: pointer;
  border-radius: var(--radius-s);
}

.codebook-tree-row:hover {
  background-color: var(--background-modifier-hover);
}

.codebook-tree-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-faint);
  transition: transform 0.15s ease;
}

.codebook-tree-chevron.is-expanded {
  transform: rotate(90deg);
}

.codebook-tree-chevron-spacer {
  width: 16px;
  flex-shrink: 0;
}

.codebook-tree-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.codebook-tree-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-ui-small);
}

.codebook-tree-count {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  flex-shrink: 0;
}
```

- [ ] **Step 2: Commit**

```bash
~/.claude/scripts/commit.sh "style: CSS para arvore hierarquica do Codebook com virtual scroll"
```

### Task 12: Toolbar — drag mode toggle + New Code / New Folder buttons

**Files:**
- Modify: `src/core/detailListRenderer.ts` (or new section in codebookTreeRenderer)
- Modify: `styles.css`

- [ ] **Step 1: Add toggle and buttons to Level 1 toolbar**

In the `renderListShell` function, add below the search input:

```typescript
// Drag mode toggle: [Reorganize | Merge]
const toggleWrap = container.createDiv({ cls: 'codebook-toolbar-toggle' });
const reorgBtn = toggleWrap.createEl('button', { text: 'Reorganize', cls: 'codebook-toggle-btn is-active' });
const mergeBtn = toggleWrap.createEl('button', { text: 'Merge', cls: 'codebook-toggle-btn' });

// Shared function — also called by drag-drop auto-disable after merge
const setDragMode = (mode: 'reorganize' | 'merge') => {
  state.dragMode = mode;
  reorgBtn.toggleClass('is-active', mode === 'reorganize');
  mergeBtn.toggleClass('is-active', mode === 'merge');
};

reorgBtn.addEventListener('click', () => setDragMode('reorganize'));
mergeBtn.addEventListener('click', () => setDragMode('merge'));

// Expose setDragMode for drag-drop callbacks to use

// Action buttons
const actionsWrap = container.createDiv({ cls: 'codebook-toolbar-actions' });
const newCodeBtn = actionsWrap.createEl('button', { text: 'New Code', cls: 'codebook-action-btn' });
setIcon(newCodeBtn.createSpan(), 'plus');
// New Folder button deferred to Phase B
```

- [ ] **Step 2: Add CSS for toggle and buttons**

```css
.codebook-toolbar-toggle {
  display: flex;
  gap: 2px;
  padding: 4px 8px;
}

.codebook-toggle-btn {
  font-size: var(--font-ui-smaller);
  padding: 2px 8px;
  border-radius: var(--radius-s);
  background: transparent;
  border: 1px solid var(--background-modifier-border);
  cursor: pointer;
  color: var(--text-muted);
}

.codebook-toggle-btn.is-active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}
```

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "feat: toolbar do Codebook com toggle reorganizar/merge e botao New Code"
```

---

## Chunk 4: Codebook Panel Levels 2 & 3 — Hierarchy-Aware Detail

### Task 13: Level 2 (Code page) — hierarchy section + breadcrumbs

**Files:**
- Modify: `src/core/detailCodeRenderer.ts`
- Modify: `src/core/baseCodeDetailView.ts`

- [ ] **Step 1: Add breadcrumb rendering**

In `detailCodeRenderer.ts`, update `renderBackButton` to show hierarchy-aware breadcrumb:

```typescript
// Replace simple back button with breadcrumb:
function renderBreadcrumb(
  container: HTMLElement,
  codeId: string,
  registry: CodeDefinitionRegistry,
  callbacks: CodeRendererCallbacks,
) {
  const nav = container.createDiv({ cls: 'codebook-breadcrumb' });

  // Always: ← Codebook
  const rootLink = nav.createSpan({ cls: 'codebook-breadcrumb-item is-clickable' });
  const rootIcon = rootLink.createSpan();
  setIcon(rootIcon, 'arrow-left');
  rootLink.createSpan({ text: 'Codebook' });
  rootLink.addEventListener('click', () => callbacks.showList());

  // Parent chain
  const def = registry.getById(codeId);
  if (def?.parentId) {
    const ancestors = registry.getAncestors(codeId);
    // Show immediate parent only (avoid long chains)
    const parent = ancestors[0];
    if (parent) {
      nav.createSpan({ text: ' › ', cls: 'codebook-breadcrumb-sep' });
      const parentLink = nav.createSpan({ cls: 'codebook-breadcrumb-item is-clickable', text: parent.name });
      parentLink.addEventListener('click', () => callbacks.showCodeDetail(parent.id));
    }
  }
}
```

- [ ] **Step 2: Add hierarchy section (parent + children)**

In `renderCodeDetail`, after the description section, add:

```typescript
// Hierarchy section (codeId passed from navigation, resolve def by id)
const def = registry.getById(codeId);
if (def) {
  const hierSection = container.createDiv({ cls: 'codemarker-detail-section' });
  hierSection.createEl('h6', { text: 'Hierarchy' });

  // Parent
  if (def.parentId) {
    const parentDef = registry.getById(def.parentId);
    if (parentDef) {
      const parentRow = hierSection.createDiv({ cls: 'codebook-hier-row' });
      parentRow.createSpan({ text: 'Parent: ', cls: 'codebook-hier-label' });
      const parentLink = parentRow.createSpan({ text: parentDef.name, cls: 'codebook-hier-link is-clickable' });
      parentLink.addEventListener('click', () => callbacks.showCodeDetail(parentDef.id));
    }
  }

  // Children
  const children = registry.getChildren(def.id);
  if (children.length > 0) {
    const childrenWrap = hierSection.createDiv({ cls: 'codebook-hier-children' });
    childrenWrap.createSpan({ text: 'Children: ', cls: 'codebook-hier-label' });
    for (const child of children) {
      const chip = childrenWrap.createSpan({ cls: 'codemarker-detail-chip is-clickable' });
      const dot = chip.createSpan({ cls: 'codemarker-detail-chip-dot' });
      dot.style.backgroundColor = child.color;
      chip.createSpan({ text: child.name });
      chip.addEventListener('click', () => callbacks.showCodeDetail(child.id));
    }
  }
}
```

- [ ] **Step 3: Update segment counts to show hierarchy breakdown**

In the segments section header, replace flat count with:

```typescript
const breakdown = getCountBreakdown(def.id, model.registry, model.getAllMarkers());
const countText = breakdown.direct === breakdown.withChildren
  ? `Segments (${breakdown.direct})`
  : `Segments (${breakdown.direct} diretos · ${breakdown.withChildren} com filhos)`;
segSection.createEl('h6', { text: countText });
```

Import `getCountBreakdown` from `hierarchyHelpers`.

- [ ] **Step 4: Add audit trail section**

After delete button, add:

```typescript
if (def.mergedFrom && def.mergedFrom.length > 0) {
  const auditSection = container.createDiv({ cls: 'codemarker-detail-section' });
  auditSection.createEl('h6', { text: 'Audit' });
  auditSection.createEl('p', {
    text: `Merged from ${def.mergedFrom.length} code(s)`,
    cls: 'codemarker-detail-audit-text',
  });
}

const dateStr = new Date(def.createdAt).toLocaleDateString();
const auditDate = container.createDiv({ cls: 'codemarker-detail-audit-date' });
auditDate.textContent = `Created: ${dateStr}`;
```

- [ ] **Step 5: Run tests + fix any broken assertions**

Run: `npm run test`
Expected: ALL PASS (or fix test assertions for updated rendering)

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: Level 2 do Codebook Panel — breadcrumbs, hierarquia, contagem direta/agregada"
```

### Task 14: Level 3 (Segment page) — separate click vs reveal

**Files:**
- Modify: `src/core/detailMarkerRenderer.ts`
- Modify: `src/core/detailCodeRenderer.ts`

The spec requires separating two actions on segments:
- **Click on segment** (in Level 2 list) = drill-down to Level 3 (segment page)
- **↗ icon** = reveal in document (navigate to file)

Currently, click does BOTH (navigate + setContext). We split them.

- [ ] **Step 1: Update segment items in Level 2 (detailCodeRenderer.ts)**

In `renderCodeDetail`, update the segment `<li>` click handlers:

```typescript
// Click item → drill-down to segment detail (Level 3) ONLY
li.addEventListener('click', () => {
  callbacks.setContext(marker.id, codeId);
});

// ↗ icon → reveal in document ONLY
navIcon.addEventListener('click', (e) => {
  e.stopPropagation();
  callbacks.navigateToMarker(marker);
});
```

Remove the `autoRevealOnSegmentClick` conditional from the click handler. The ↗ icon is the explicit reveal action.

- [ ] **Step 2: Update Level 3 (detailMarkerRenderer.ts) — add prominent reveal link**

In `renderMarkerDetail`, ensure the file reference + reveal link is prominent:

```typescript
// File reference with reveal action
const metaRow = container.createDiv({ cls: 'codemarker-detail-seg-meta' });
const fileSpan = metaRow.createSpan({ cls: 'codemarker-detail-marker-file', text: callbacks.shortenPath(marker.fileId) });
metaRow.createSpan({ text: ' · ' });
const revealLink = metaRow.createSpan({ cls: 'codemarker-detail-reveal-link is-clickable' });
const revealIcon = revealLink.createSpan();
setIcon(revealIcon, 'external-link');
revealLink.createSpan({ text: 'Reveal' });
revealLink.addEventListener('click', () => callbacks.navigateToMarker(marker));
```

- [ ] **Step 3: Update CodeRendererCallbacks — remove autoRevealOnSegmentClick**

Since the reveal is now explicit via ↗, remove `autoRevealOnSegmentClick` from all these files:
- `src/core/detailCodeRenderer.ts:19` — remove from `CodeRendererCallbacks` interface
- `src/core/detailCodeRenderer.ts:125` — remove conditional `if (callbacks.autoRevealOnSegmentClick)` from click handler
- `src/core/detailCodeRenderer.ts:186` — remove from `renderSegmentsByFile` click handler
- `src/core/baseCodeDetailView.ts:189` — remove from callbacks object passed to `renderCodeDetail`
- `src/core/baseCodeDetailView.ts:27-29` — remove the `autoRevealOnSegmentClick` getter
- `src/core/types.ts:124` — keep the setting in `CodeMarkerSettings` (it may be used by Explorer or popover), but remove references from Detail view
- `src/core/settingTab.ts` — grep for `autoRevealOnSegmentClick` toggle; if it only affects the Detail View, remove the setting UI. If it also affects Explorer click behavior, keep it.

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: ALL PASS (or fix assertions for removed autoReveal)

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: separa click=drill-down de ↗=reveal nos segmentos do Codebook Panel"
```

---

## Chunk 5: Context Menu + Drag-Drop

### Task 15: Context menu on right-click

**Files:**
- Create: `src/core/codebookContextMenu.ts`

- [ ] **Step 1: Write the context menu builder**

```typescript
// src/core/codebookContextMenu.ts
/**
 * Context menu for codes in the Codebook tree (Level 1).
 * Uses Obsidian's native Menu API.
 */

import { Menu, setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { SidebarModelInterface } from './types';

export interface ContextMenuCallbacks {
  showCodeDetail(codeId: string): void;
  openMergeModal(codeId: string): void;
  promptRename(codeId: string): void;
  promptAddChild(parentId: string): void;
  promptMoveTo(codeId: string): void;
  promptDelete(codeId: string): void;
  promptColor(codeId: string): void;
  promptDescription(codeId: string): void;
  setParent(codeId: string, parentId: string | undefined): void;
}

export function showCodeContextMenu(
  event: MouseEvent,
  codeId: string,
  registry: CodeDefinitionRegistry,
  callbacks: ContextMenuCallbacks,
): void {
  const def = registry.getById(codeId);
  if (!def) return;

  const menu = new Menu();

  menu.addItem((item) =>
    item.setTitle('Rename').setIcon('pencil')
      .onClick(() => callbacks.promptRename(codeId))
  );

  menu.addItem((item) =>
    item.setTitle('Add child code').setIcon('plus')
      .onClick(() => callbacks.promptAddChild(codeId))
  );

  menu.addSeparator();

  // Move hierarchy actions
  menu.addItem((item) =>
    item.setTitle('Move to...').setIcon('folder-input')
      .onClick(() => callbacks.promptMoveTo(codeId))
  );

  if (def.parentId) {
    menu.addItem((item) =>
      item.setTitle('Promote to top-level').setIcon('arrow-up-to-line')
        .onClick(() => callbacks.setParent(codeId, undefined))
    );
  }

  menu.addSeparator();

  menu.addItem((item) =>
    item.setTitle('Merge with...').setIcon('merge')
      .onClick(() => callbacks.openMergeModal(codeId))
  );

  menu.addSeparator();

  menu.addItem((item) =>
    item.setTitle('Change color').setIcon('palette')
      .onClick(() => callbacks.promptColor(codeId))
  );

  menu.addItem((item) =>
    item.setTitle('Edit description').setIcon('file-text')
      .onClick(() => callbacks.promptDescription(codeId))
  );

  menu.addSeparator();

  menu.addItem((item) =>
    item.setTitle('Delete').setIcon('trash-2')
      .setSection('danger')
      .onClick(() => callbacks.promptDelete(codeId))
  );

  menu.showAtMouseEvent(event);
}
```

- [ ] **Step 2: Wire context menu into codebookTreeRenderer**

In the `onCodeRightClick` callback (already wired in Task 9), call `showCodeContextMenu`.

- [ ] **Step 3: Implement callback stubs in baseCodeDetailView**

Wire the context menu callbacks. `promptRename` opens an input. `promptAddChild` creates a new code with parentId. `promptDelete` shows confirmation. `promptColor` opens native color picker.

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "feat: context menu no Codebook Panel (rename, add child, promote, merge, color, delete)"
```

### Task 16: Drag-drop — reorganize mode (reparent)

**Files:**
- Create: `src/core/codebookDragDrop.ts`
- Modify: `src/core/codebookTreeRenderer.ts`
- Modify: `styles.css`

- [ ] **Step 1: Implement drag-drop manager**

```typescript
// src/core/codebookDragDrop.ts
/**
 * Drag-drop for the Codebook tree.
 * Two modes:
 * - Reorganize (default): drop on code = make child, drop on root zone = promote
 * - Merge: drop on code = open merge modal
 */

import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

export interface DragDropCallbacks {
  onReparent(codeId: string, newParentId: string | undefined): void;
  onMergeDrop(sourceId: string, targetId: string): void;
  /** Called to switch back to reorganize mode (e.g. after merge). Updates both state and UI. */
  setDragMode(mode: 'reorganize' | 'merge'): void;
  refresh(): void;
}

export function setupDragDrop(
  container: HTMLElement,
  registry: CodeDefinitionRegistry,
  getMode: () => 'reorganize' | 'merge',
  callbacks: DragDropCallbacks,
): () => void {
  let draggedId: string | null = null;

  const onDragStart = (e: DragEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-code-id]');
    if (!row) return;
    draggedId = row.dataset.codeId!;
    e.dataTransfer!.effectAllowed = 'move';
    row.addClass('is-dragging');
  };

  const onDragOver = (e: DragEvent) => {
    if (!draggedId) return;
    e.preventDefault();
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-code-id]');
    if (!row || row.dataset.codeId === draggedId) return;

    // Clear previous drop targets
    container.querySelectorAll('.is-drop-target, .is-merge-target').forEach(el => {
      el.removeClass('is-drop-target');
      el.removeClass('is-merge-target');
    });

    const mode = getMode();
    row.addClass(mode === 'merge' ? 'is-merge-target' : 'is-drop-target');
  };

  const onDrop = (e: DragEvent) => {
    if (!draggedId) return;
    e.preventDefault();
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-code-id]');
    const targetId = row?.dataset.codeId;

    // Clear visual states
    container.querySelectorAll('.is-dragging, .is-drop-target, .is-merge-target').forEach(el => {
      el.removeClass('is-dragging');
      el.removeClass('is-drop-target');
      el.removeClass('is-merge-target');
    });

    if (!targetId || targetId === draggedId) {
      draggedId = null;
      return;
    }

    const mode = getMode();
    if (mode === 'reorganize') {
      // Check: can't reparent to own descendant
      const descendants = registry.getDescendants(draggedId);
      if (descendants.some(d => d.id === targetId)) {
        draggedId = null;
        return;
      }
      callbacks.onReparent(draggedId, targetId);
    } else {
      callbacks.onMergeDrop(draggedId, targetId);
      // Auto-disable merge mode after operation (spec requirement)
      callbacks.setDragMode('reorganize');
    }

    draggedId = null;
    callbacks.refresh();
  };

  const onDragEnd = () => {
    draggedId = null;
    container.querySelectorAll('.is-dragging, .is-drop-target, .is-merge-target').forEach(el => {
      el.removeClass('is-dragging');
      el.removeClass('is-drop-target');
      el.removeClass('is-merge-target');
    });
  };

  container.addEventListener('dragstart', onDragStart);
  container.addEventListener('dragover', onDragOver);
  container.addEventListener('drop', onDrop);
  container.addEventListener('dragend', onDragEnd);

  return () => {
    container.removeEventListener('dragstart', onDragStart);
    container.removeEventListener('dragover', onDragOver);
    container.removeEventListener('drop', onDrop);
    container.removeEventListener('dragend', onDragEnd);
  };
}
```

- [ ] **Step 2: Make tree rows draggable**

In `codebookTreeRenderer.ts`, add `draggable="true"` to each row:

```typescript
row.setAttribute('draggable', 'true');
```

- [ ] **Step 3: Add drag-drop CSS**

```css
.codebook-tree-row.is-dragging {
  opacity: 0.5;
}

.codebook-tree-row.is-drop-target {
  border-bottom: 2px solid var(--interactive-accent);
  background: var(--background-modifier-hover);
}

.codebook-tree-row.is-merge-target {
  background: var(--background-modifier-error-hover, rgba(var(--color-red-rgb), 0.15));
  outline: 2px solid var(--text-error);
  outline-offset: -2px;
  border-radius: var(--radius-s);
}
```

- [ ] **Step 4: Wire drag-drop into codebook tree lifecycle**

In the Codebook Panel, setup drag-drop when rendering Level 1. Clean up on re-render or close.

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: drag-drop no Codebook Panel — reorganizar (reparentar) e merge mode"
```

---

## Chunk 6: Merge Modal + Merge Logic

### Task 17: Merge logic in registry

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Create: `tests/core/mergeModal.test.ts`

- [ ] **Step 1: Write failing tests for merge**

```typescript
// tests/core/mergeModal.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { BaseMarker, CodeApplication } from '../../src/core/types';
import { executeMerge } from '../../src/core/mergeModal';

let registry: CodeDefinitionRegistry;

beforeEach(() => {
  registry = new CodeDefinitionRegistry();
});

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
  return {
    markerType: 'markdown', id, fileId: 'test.md',
    codes, createdAt: 0, updatedAt: 0,
  };
}

describe('executeMerge', () => {
  it('reassigns markers from source codes to destination', () => {
    const dest = registry.create('Destination');
    const src1 = registry.create('Source1');
    const src2 = registry.create('Source2');
    const markers: BaseMarker[] = [
      makeMarker('m1', [{ codeId: src1.id }]),
      makeMarker('m2', [{ codeId: src2.id }]),
      makeMarker('m3', [{ codeId: dest.id }]),
    ];

    const result = executeMerge({
      destinationId: dest.id,
      sourceIds: [src1.id, src2.id],
      registry,
      markers,
    });

    // All markers now reference destination
    expect(result.updatedMarkers[0]!.codes[0]!.codeId).toBe(dest.id);
    expect(result.updatedMarkers[1]!.codes[0]!.codeId).toBe(dest.id);
    // Destination marker unchanged
    expect(result.updatedMarkers[2]!.codes[0]!.codeId).toBe(dest.id);
    // Total affected
    expect(result.affectedCount).toBe(2);
  });

  it('avoids duplicate codeId on same marker', () => {
    const dest = registry.create('Dest');
    const src = registry.create('Src');
    // Marker has both source and dest
    const markers: BaseMarker[] = [
      makeMarker('m1', [{ codeId: dest.id }, { codeId: src.id }]),
    ];

    const result = executeMerge({
      destinationId: dest.id,
      sourceIds: [src.id],
      registry,
      markers,
    });

    // Should have dest only once, src removed
    expect(result.updatedMarkers[0]!.codes).toHaveLength(1);
    expect(result.updatedMarkers[0]!.codes[0]!.codeId).toBe(dest.id);
  });

  it('records mergedFrom on destination', () => {
    const dest = registry.create('Dest');
    const src = registry.create('Src');

    executeMerge({
      destinationId: dest.id,
      sourceIds: [src.id],
      registry,
      markers: [],
    });

    expect(registry.getById(dest.id)!.mergedFrom).toContain(src.id);
  });

  it('deletes source codes from registry', () => {
    const dest = registry.create('Dest');
    const src = registry.create('Src');

    executeMerge({
      destinationId: dest.id,
      sourceIds: [src.id],
      registry,
      markers: [],
    });

    expect(registry.getById(src.id)).toBeUndefined();
  });

  it('reparents children of source codes to destination', () => {
    const dest = registry.create('Dest');
    const src = registry.create('Src');
    const child = registry.create('Child');
    registry.setParent(child.id, src.id);

    executeMerge({
      destinationId: dest.id,
      sourceIds: [src.id],
      registry,
      markers: [],
    });

    expect(registry.getById(child.id)!.parentId).toBe(dest.id);
    expect(registry.getChildren(dest.id).map(d => d.name)).toContain('Child');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/core/mergeModal.test.ts`
Expected: FAIL — `executeMerge` doesn't exist

- [ ] **Step 3: Implement executeMerge**

```typescript
// In src/core/mergeModal.ts (merge logic section)
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { BaseMarker } from './types';
import { hasCode, removeCodeApplication, addCodeApplication } from './codeApplicationHelpers';

export interface MergeParams {
  destinationId: string;
  sourceIds: string[];
  registry: CodeDefinitionRegistry;
  markers: BaseMarker[];
  /** Optional: new name for destination. */
  destinationName?: string;
  /** Optional: new parentId for destination. */
  destinationParentId?: string;
}

export interface MergeResult {
  updatedMarkers: BaseMarker[];
  affectedCount: number;
}

/**
 * Execute a merge: reassign all markers from source codes to destination,
 * reparent children, record mergedFrom, delete source codes.
 *
 * Returns updated markers (caller must persist) and affected count.
 */
export function executeMerge(params: MergeParams): MergeResult {
  const { destinationId, sourceIds, registry, markers, destinationName, destinationParentId } = params;

  const sourceIdSet = new Set(sourceIds);
  let affectedCount = 0;

  // 1. Reassign markers
  for (const marker of markers) {
    let touched = false;
    for (const srcId of sourceIds) {
      if (hasCode(marker.codes, srcId)) {
        marker.codes = removeCodeApplication(marker.codes, srcId);
        if (!hasCode(marker.codes, destinationId)) {
          marker.codes = addCodeApplication(marker.codes, destinationId);
        }
        touched = true;
      }
    }
    if (touched) affectedCount++;
  }

  // 2. Reparent children of source codes to destination
  for (const srcId of sourceIds) {
    const srcDef = registry.getById(srcId);
    if (srcDef) {
      for (const childId of [...srcDef.childrenOrder]) {
        registry.setParent(childId, destinationId);
      }
    }
  }

  // 3. Record mergedFrom
  const destDef = registry.getById(destinationId);
  if (destDef) {
    if (!destDef.mergedFrom) destDef.mergedFrom = [];
    destDef.mergedFrom.push(...sourceIds);
    destDef.updatedAt = Date.now();
  }

  // 4. Optionally update destination name/parent
  if (destinationName) {
    registry.update(destinationId, { name: destinationName });
  }
  if (destinationParentId !== undefined) {
    registry.setParent(destinationId, destinationParentId || undefined);
  }

  // 5. Delete source codes
  for (const srcId of sourceIds) {
    registry.delete(srcId);
  }

  return { updatedMarkers: markers, affectedCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/core/mergeModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: executeMerge — reassigna markers, reparenta filhos, registra mergedFrom"
```

### Task 18: Merge modal UI

**Files:**
- Modify: `src/core/mergeModal.ts` (add Modal class)

- [ ] **Step 1: Implement MergeModal**

```typescript
// Add to src/core/mergeModal.ts

import { Modal, App, SearchComponent, setIcon } from 'obsidian';

export interface MergeModalOptions {
  app: App;
  registry: CodeDefinitionRegistry;
  /** The code being merged (drag source or context menu source). */
  initialSourceId: string;
  /** Callback when user confirms merge. */
  onConfirm(destinationId: string, sourceIds: string[], destinationName: string, parentId: string | undefined): void;
}

export class MergeModal extends Modal {
  private registry: CodeDefinitionRegistry;
  private sourceIds: Set<string>;      // codes that will be absorbed
  private destinationId: string;        // code that survives
  private destinationName: string;
  private destinationParentId: string | undefined;
  private onConfirmCallback: MergeModalOptions['onConfirm'];
  private allMarkers: BaseMarker[];

  constructor(options: MergeModalOptions, allMarkers: BaseMarker[]) {
    super(options.app);
    this.registry = options.registry;
    // initialSourceId = the code user right-clicked or dropped onto = DESTINATION (survives)
    this.destinationId = options.initialSourceId;
    this.sourceIds = new Set();          // user adds sources via search
    this.destinationName = this.registry.getById(options.initialSourceId)?.name ?? '';
    this.destinationParentId = this.registry.getById(options.initialSourceId)?.parentId;
    this.onConfirmCallback = options.onConfirm;
    this.allMarkers = allMarkers;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('codebook-merge-modal');

    // Title
    contentEl.createEl('h3', { text: `Merge codes` });

    // Search to add more sources
    const searchSection = contentEl.createDiv({ cls: 'codebook-merge-search' });
    searchSection.createEl('label', { text: 'Add codes to merge:' });
    // Use SearchComponent for fuzzy search
    const searchWrap = searchSection.createDiv();
    new SearchComponent(searchWrap)
      .setPlaceholder('Search codes...')
      .onChange((value) => this.filterCodes(value));

    // Search results dropdown (populated by filterCodes)
    this.searchResultsEl = contentEl.createDiv({ cls: 'codebook-merge-search-results' });

    // Source list (chips — codes that will be absorbed)
    this.sourceListEl = contentEl.createDiv({ cls: 'codebook-merge-source-list' });
    this.renderSourceList();

    // Destination config
    const destSection = contentEl.createDiv({ cls: 'codebook-merge-dest' });
    destSection.createEl('label', { text: 'Destination:' });

    // Name input
    const nameInput = destSection.createEl('input', {
      cls: 'codebook-merge-name-input',
      attr: { type: 'text', value: this.destinationName },
    });
    nameInput.addEventListener('input', () => {
      this.destinationName = nameInput.value;
    });

    // Parent selector (dropdown or "Top-level" radio)
    // ... simplified: just a "Top-level" checkbox for now
    const parentWrap = destSection.createDiv();
    const topLevelCb = parentWrap.createEl('input', { attr: { type: 'checkbox' } });
    parentWrap.createSpan({ text: ' Top-level' });
    topLevelCb.addEventListener('change', () => {
      this.destinationParentId = topLevelCb.checked ? undefined : this.registry.getById(this.destinationId)?.parentId;
    });

    // Impact preview
    this.impactEl = contentEl.createDiv({ cls: 'codebook-merge-impact' });
    this.updateImpact();

    // Actions
    const actions = contentEl.createDiv({ cls: 'codebook-merge-actions' });
    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
    const mergeBtn = actions.createEl('button', { text: 'Merge', cls: 'mod-warning' });
    mergeBtn.addEventListener('click', () => {
      if (this.sourceIds.size === 0) return; // nothing to merge
      this.onConfirmCallback(
        this.destinationId,
        [...this.sourceIds],
        this.destinationName,
        this.destinationParentId,
      );
      this.close();
    });
  }

  private sourceListEl!: HTMLElement;
  private impactEl!: HTMLElement;

  private renderSourceList() {
    this.sourceListEl.empty();
    for (const srcId of this.sourceIds) {
      const def = this.registry.getById(srcId);
      if (!def) continue;
      const chip = this.sourceListEl.createDiv({ cls: 'codebook-merge-chip' });
      const swatch = chip.createSpan({ cls: 'codebook-tree-swatch' });
      swatch.style.backgroundColor = def.color;
      chip.createSpan({ text: def.name });

      // Count
      const count = this.allMarkers.filter(m =>
        m.codes.some(c => c.codeId === srcId)
      ).length;
      chip.createSpan({ text: ` (${count})`, cls: 'codebook-merge-chip-count' });

      // Remove button (user can remove any added source)
      if (this.sourceIds.size > 0) {
        const removeBtn = chip.createSpan({ cls: 'codebook-merge-chip-remove' });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', () => {
          this.sourceIds.delete(srcId);
          this.renderSourceList();
          this.updateImpact();
        });
      }
    }
  }

  private updateImpact() {
    const totalAffected = this.allMarkers.filter(m =>
      m.codes.some(c => this.sourceIds.has(c.codeId))
    ).length;
    this.impactEl.textContent = `${totalAffected} segments will be reassigned.`;
  }

  private searchResultsEl!: HTMLElement;

  private filterCodes(query: string) {
    this.searchResultsEl.empty();
    if (!query.trim()) return;

    const q = query.toLowerCase();
    const excluded = new Set([this.destinationId, ...this.sourceIds]);
    const matches = this.registry.getAll()
      .filter(d => !excluded.has(d.id) && d.name.toLowerCase().includes(q))
      .slice(0, 10); // max 10 suggestions

    for (const def of matches) {
      const item = this.searchResultsEl.createDiv({ cls: 'codebook-merge-search-item' });
      const swatch = item.createSpan({ cls: 'codebook-tree-swatch' });
      swatch.style.backgroundColor = def.color;
      item.createSpan({ text: def.name });

      const count = this.allMarkers.filter(m =>
        m.codes.some(c => c.codeId === def.id)
      ).length;
      item.createSpan({ text: ` (${count})`, cls: 'codebook-merge-chip-count' });

      item.addEventListener('click', () => {
        this.sourceIds.add(def.id);
        this.renderSourceList();
        this.updateImpact();
        this.searchResultsEl.empty();
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Wire merge modal into context menu and drag-drop**

In context menu's `openMergeModal` callback:
```typescript
openMergeModal: (codeId) => {
  new MergeModal({
    app: this.app,
    registry: this.model.registry,
    initialSourceId: codeId,
    onConfirm: (destId, srcIds, name, parentId) => {
      executeMerge({
        destinationId: destId,
        sourceIds: srcIds,
        registry: this.model.registry,
        markers: this.model.getAllMarkers(),
        destinationName: name,
        destinationParentId: parentId,
      });
      this.model.saveMarkers();
    },
  }, this.model.getAllMarkers()).open();
},
```

In drag-drop `onMergeDrop`:
```typescript
onMergeDrop: (sourceId, targetId) => {
  // Open merge modal with source pre-selected, destination = target
  new MergeModal({ ... }).open();
  // After merge, auto-disable merge mode
  state.dragMode = 'reorganize';
},
```

- [ ] **Step 3: Add merge modal CSS**

```css
.codebook-merge-modal {
  min-width: 400px;
}

.codebook-merge-source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.codebook-merge-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--radius-s);
  background: var(--background-secondary);
  font-size: var(--font-ui-small);
}

.codebook-merge-chip-count {
  color: var(--text-muted);
}

.codebook-merge-chip-remove {
  cursor: pointer;
  color: var(--text-muted);
}

.codebook-merge-chip-remove:hover {
  color: var(--text-error);
}

.codebook-merge-name-input {
  width: 100%;
  margin: 4px 0;
}

.codebook-merge-impact {
  margin: 12px 0;
  font-size: var(--font-ui-small);
  color: var(--text-muted);
}

.codebook-merge-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.codebook-merge-search-results {
  max-height: 200px;
  overflow-y: auto;
}

.codebook-merge-search-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: var(--radius-s);
}

.codebook-merge-search-item:hover {
  background: var(--background-modifier-hover);
}
```

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "feat: MergeModal com busca fuzzy, preview de impacto e execucao de merge"
```

---

## Chunk 7: Explorer Hierarchy + Stress Tests + Final Cleanup

### Task 19: Update Explorer view with hierarchy

**Files:**
- Modify: `src/core/baseCodeExplorerView.ts`

The Explorer view (separate from Codebook Panel) also shows hierarchical codes.

- [ ] **Step 1: Update buildCodeIndex to respect hierarchy**

The current `buildCodeIndex` builds a flat `Map<codeName, Map<fileId, markers[]>>`. Update to group by hierarchy:

```typescript
private buildCodeIndex(): Map<string, Map<string, BaseMarker[]>> {
  const index = new Map<string, Map<string, BaseMarker[]>>();

  // Use hierarchical order instead of flat alphabetical
  const addCodeToIndex = (def: CodeDefinition) => {
    index.set(def.name, new Map());
    // Recurse into children
    for (const child of this.model.registry.getChildren(def.id)) {
      addCodeToIndex(child);
    }
  };

  for (const root of this.model.registry.getRootCodes()) {
    addCodeToIndex(root);
  }

  // Populate markers (same as before)
  for (const fileId of this.model.getAllFileIds()) {
    const markers = this.model.getMarkersForFile(fileId);
    for (const marker of markers) {
      for (const ca of marker.codes) {
        const codeName = this.model.registry.getById(ca.codeId)?.name ?? ca.codeId;
        if (!index.has(codeName)) index.set(codeName, new Map());
        const fileMap = index.get(codeName)!;
        if (!fileMap.has(fileId)) fileMap.set(fileId, []);
        fileMap.get(fileId)!.push(marker);
      }
    }
  }

  return index;
}
```

- [ ] **Step 2: Update renderTree to show hierarchy indent**

In the tree rendering loop, add visual indent based on `registry.getDepth(def.id)`:

```typescript
const depth = this.model.registry.getDepth(def.id);
codeSelf.style.paddingLeft = `${depth * 18 + 4}px`;
```

- [ ] **Step 3: Update count display**

When collapsed, show aggregate count. When expanded, show direct count. Use `buildCountIndex`.

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: Explorer view renderiza hierarquia com indent e contagem agregada"
```

### Task 20: Stress tests for hierarchy rendering

**Files:**
- Create: `tests/core/hierarchyStress.test.ts`

- [ ] **Step 1: Write stress tests**

```typescript
// tests/core/hierarchyStress.test.ts
import { describe, it, expect } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildFlatTree, buildCountIndex } from '../../src/core/hierarchyHelpers';
import type { BaseMarker, CodeApplication } from '../../src/core/types';

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
  return {
    markerType: 'markdown', id, fileId: `file-${id}.md`,
    codes, createdAt: 0, updatedAt: 0,
  };
}

function bench(label: string, fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('hierarchy stress tests', () => {
  it('buildFlatTree with 5000 flat codes < 100ms', () => {
    const registry = new CodeDefinitionRegistry();
    for (let i = 0; i < 5000; i++) {
      registry.create(`Code${i}`);
    }
    const ms = bench('flatTree-5000', () => {
      buildFlatTree(registry, new Set());
    });
    console.log(`buildFlatTree(5000 flat): ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(100);
  });

  it('buildFlatTree with 5000 codes in hierarchy (200 roots × 25 children) < 100ms', () => {
    const registry = new CodeDefinitionRegistry();
    const roots: string[] = [];
    for (let i = 0; i < 200; i++) {
      const root = registry.create(`Root${i}`);
      roots.push(root.id);
      for (let j = 0; j < 25; j++) {
        const child = registry.create(`R${i}C${j}`);
        registry.setParent(child.id, root.id);
      }
    }
    // All roots expanded
    const expanded = new Set(roots);
    const ms = bench('flatTree-5000-hier', () => {
      buildFlatTree(registry, expanded);
    });
    console.log(`buildFlatTree(5000 hierarchical, all expanded): ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(100);
  });

  it('buildCountIndex with 5000 codes and 10000 markers < 200ms', () => {
    const registry = new CodeDefinitionRegistry();
    const codes: string[] = [];
    for (let i = 0; i < 200; i++) {
      const root = registry.create(`Root${i}`);
      codes.push(root.id);
      for (let j = 0; j < 24; j++) {
        const child = registry.create(`R${i}C${j}`);
        registry.setParent(child.id, root.id);
        codes.push(child.id);
      }
    }

    const markers: BaseMarker[] = [];
    for (let i = 0; i < 10000; i++) {
      const numCodes = 1 + Math.floor(Math.random() * 3);
      const markerCodes: CodeApplication[] = [];
      for (let j = 0; j < numCodes; j++) {
        markerCodes.push({ codeId: codes[Math.floor(Math.random() * codes.length)]! });
      }
      markers.push(makeMarker(`m${i}`, markerCodes));
    }

    const ms = bench('countIndex-5000x10000', () => {
      buildCountIndex(registry, markers);
    });
    console.log(`buildCountIndex(5000 codes, 10000 markers): ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(200);
  });

  it('deep hierarchy (100 levels) does not stack overflow', () => {
    const registry = new CodeDefinitionRegistry();
    let parentId: string | undefined;
    for (let i = 0; i < 100; i++) {
      const code = registry.create(`Level${i}`);
      if (parentId) registry.setParent(code.id, parentId);
      parentId = code.id;
    }

    expect(registry.getDepth(parentId!)).toBe(99);
    expect(registry.getAncestors(parentId!)).toHaveLength(99);
    expect(registry.getDescendants(registry.getRootCodes()[0]!.id)).toHaveLength(99);

    // buildFlatTree should handle deep hierarchy
    const allExpanded = new Set(registry.getAll().map(d => d.id));
    const tree = buildFlatTree(registry, allExpanded);
    expect(tree).toHaveLength(100);
    expect(tree[99]!.depth).toBe(99);
  });

  it('setParent cycle detection with 1000 nodes < 10ms', () => {
    const registry = new CodeDefinitionRegistry();
    const ids: string[] = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(registry.create(`Code${i}`).id);
    }
    // Build chain: 0 → 1 → 2 → ... → 999
    for (let i = 1; i < 1000; i++) {
      registry.setParent(ids[i]!, ids[i - 1]!);
    }

    // Try to create cycle: set 0 as child of 999
    const ms = bench('cycle-detect-1000', () => {
      const result = registry.setParent(ids[0]!, ids[999]!);
      expect(result).toBe(false); // cycle detected
    });
    console.log(`Cycle detection (1000-node chain): ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(10);
  });

  it('search filter with 5000 codes < 50ms', () => {
    const registry = new CodeDefinitionRegistry();
    for (let i = 0; i < 200; i++) {
      const root = registry.create(`Category${i}`);
      for (let j = 0; j < 25; j++) {
        const child = registry.create(`Cat${i}_Theme${j}`);
        registry.setParent(child.id, root.id);
      }
    }

    const ms = bench('search-5000', () => {
      buildFlatTree(registry, new Set(), 'Theme1');
    });
    console.log(`Search filter(5000 codes, query='Theme1'): ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run stress tests**

Run: `npm run test -- tests/core/hierarchyStress.test.ts`
Expected: ALL PASS within thresholds

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "test: stress tests de hierarquia — 5000 codigos, arvore profunda, deteccao de ciclo"
```

### Task 21: Update CLAUDE.md conventions + final cleanup

**Files:**
- Modify: `CLAUDE.md`
- Modify: `src/core/types.ts` (verify)

- [ ] **Step 1: Update CLAUDE.md with hierarchy conventions**

Add to the "Nomes padronizados" section:

```markdown
- `parentId` — referencia ao CodeDefinition pai (nunca `parent`)
- `childrenOrder` — array ordenado de ids filhos (nunca `children`)
- `mergedFrom` — ids dos codigos fundidos neste (audit trail)
- `setParent(id, parentId)` — metodo de reparentar com deteccao de ciclo
- `executeMerge()` — funcao de merge em `mergeModal.ts` (reassigna markers, reparenta filhos, deleta sources)
- Hierarchy helpers puros em `hierarchyHelpers.ts`: `buildFlatTree`, `buildCountIndex`, `getDirectCount`, `getAggregateCount`
```

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: 0 tsc errors, esbuild success

- [ ] **Step 3: Full test suite**

Run: `npm run test`
Expected: ALL tests PASS

- [ ] **Step 4: Copy build to demo vault**

Run: `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

- [ ] **Step 5: Manual smoke test**

1. Open demo vault in Obsidian
2. Create codes: "Emotions" (root), "Joy" (child of Emotions), "Anger" (child of Emotions)
3. Verify: Codebook Panel shows tree with indent + chevrons
4. Verify: Collapse Emotions → count shows aggregate
5. Verify: Expand Emotions → count shows direct per code
6. Verify: Right-click → context menu appears with all actions
7. Verify: Drag "Joy" onto another root code → reparents
8. Verify: Click "Merge with..." → modal opens with impact preview
9. Verify: Execute merge → markers reassigned, source code deleted
10. Verify: Click segment in Level 2 → drill-down to Level 3 (no file jump)
11. Verify: Click ↗ → reveals in document
12. Verify: Search "Joy" → shows Joy + parent path
13. Verify: Delete "Emotions" → "Joy" and "Anger" become root

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "chore: verificacao final Fase A — build limpo, testes passando, hierarquia funcional"
```
