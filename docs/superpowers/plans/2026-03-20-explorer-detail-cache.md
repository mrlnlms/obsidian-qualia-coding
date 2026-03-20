# Explorer/Detail Cache Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dirty-flag cache + fileId/id indices to UnifiedModelAdapter and rAF debounce to Explorer/Detail views, eliminating redundant recomputation and DOM rebuilds.

**Architecture:** Global dirty flag in the adapter invalidates on any engine model change. Lazy `rebuild()` constructs `cachedMarkers`, `cachedFileIndex` (Map by fileId), and `cachedIdIndex` (Map by id). Views use `requestAnimationFrame` to coalesce rapid changes into a single DOM rebuild.

**Tech Stack:** TypeScript, Vitest + jsdom

**Spec:** `docs/superpowers/specs/2026-03-20-explorer-detail-cache-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/core/unifiedModelAdapter.ts` | Add dirty flag, cached arrays, fileId/id indices, wrapped onChange/offChange |
| Modify | `src/core/baseCodeExplorerView.ts:30-32,56-70` | Unified rAF debounce via `scheduleRefresh`, cancel on close |
| Modify | `src/core/baseCodeDetailView.ts:31-33,68-81` | Same rAF debounce pattern |
| Modify | `tests/core/unifiedModelAdapter.test.ts` | Add ~13 cache tests to existing file |

---

## Chunk 1: Adapter cache + tests

### Task 1: Add cache + indices to UnifiedModelAdapter

**Files:**
- Modify: `src/core/unifiedModelAdapter.ts`
- Modify: `tests/core/unifiedModelAdapter.test.ts`

- [ ] **Step 1: Write cache tests**

Add a new `describe('cache')` block at the end of `tests/core/unifiedModelAdapter.test.ts`. The mock model needs to support triggering change listeners, so we need a richer mock:

```typescript
// Add at end of file:

// ── Cache ─────────────────────────────────────────────────────

function createMockModelWithListeners(markers: BaseMarker[]): SidebarModelInterface & { triggerChange(): void } {
	const listeners = new Set<() => void>();
	return {
		registry: new CodeDefinitionRegistry(),
		getAllMarkers: () => markers,
		getMarkerById: (id: string) => markers.find(m => m.id === id) ?? null,
		getAllFileIds: () => [...new Set(markers.map(m => m.fileId))],
		getMarkersForFile: (fid: string) => markers.filter(m => m.fileId === fid),
		saveMarkers: vi.fn(),
		updateMarkerFields: vi.fn(),
		updateDecorations: vi.fn(),
		removeMarker: vi.fn(() => true),
		deleteCode: vi.fn(),
		setHoverState: vi.fn(),
		getHoverMarkerId: () => null,
		getHoverMarkerIds: () => [],
		onChange: (fn: () => void) => { listeners.add(fn); },
		offChange: (fn: () => void) => { listeners.delete(fn); },
		onHoverChange: vi.fn(),
		offHoverChange: vi.fn(),
		triggerChange() { for (const fn of listeners) fn(); },
	};
}

describe('cache', () => {
	it('getAllMarkers returns correct data on first call', () => {
		const m1 = [makeMarker('a', 'f1')];
		const model = createMockModelWithListeners(m1);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		// Register a listener to activate the wrapped onChange
		adapter.onChange(() => {});
		expect(adapter.getAllMarkers()).toEqual(m1);
	});

	it('second call without change returns same array reference', () => {
		const model = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		const first = adapter.getAllMarkers();
		const second = adapter.getAllMarkers();
		expect(second).toBe(first);
	});

	it('after model change, getAllMarkers returns new array', () => {
		const model = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		const first = adapter.getAllMarkers();
		model.triggerChange();
		const second = adapter.getAllMarkers();
		expect(second).not.toBe(first);
		expect(second).toEqual(first); // same content
	});

	it('getMarkersForFile returns correct markers', () => {
		const markers = [makeMarker('a', 'f1'), makeMarker('b', 'f2'), makeMarker('c', 'f1')];
		const model = createMockModelWithListeners(markers);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		expect(adapter.getMarkersForFile('f1')).toEqual([markers[0], markers[2]]);
	});

	it('getMarkersForFile uses cache (same reference without change)', () => {
		const model = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		const first = adapter.getMarkersForFile('f1');
		const second = adapter.getMarkersForFile('f1');
		expect(second).toBe(first);
	});

	it('getAllFileIds returns deduped list from index', () => {
		const markers = [makeMarker('a', 'f1'), makeMarker('b', 'f2'), makeMarker('c', 'f1')];
		const model = createMockModelWithListeners(markers);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		const ids = adapter.getAllFileIds();
		expect(ids.sort()).toEqual(['f1', 'f2']);
	});

	it('multiple changes before query result in 1 rebuild', () => {
		const model = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		const spy = vi.spyOn(model, 'getAllMarkers');
		adapter.onChange(() => {});
		// Prime cache
		adapter.getAllMarkers();
		spy.mockClear();
		// 3 changes, then 1 query
		model.triggerChange();
		model.triggerChange();
		model.triggerChange();
		adapter.getAllMarkers();
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('change in 1 engine invalidates everything (global dirty)', () => {
		const model1 = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const model2 = createMockModelWithListeners([makeMarker('b', 'f2')]);
		const adapter = new UnifiedModelAdapter(registry, [model1, model2]);
		adapter.onChange(() => {});
		const first = adapter.getAllMarkers();
		model1.triggerChange();
		const second = adapter.getAllMarkers();
		expect(second).not.toBe(first);
	});

	it('getMarkersForFile for unknown fileId returns empty array', () => {
		const model = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		expect(adapter.getMarkersForFile('nonexistent')).toEqual([]);
	});

	it('cache works with 0 markers', () => {
		const model = createMockModelWithListeners([]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		expect(adapter.getAllMarkers()).toEqual([]);
		expect(adapter.getAllFileIds()).toEqual([]);
	});

	it('getMarkerById returns marker via index', () => {
		const m = makeMarker('x', 'f1');
		const model = createMockModelWithListeners([m]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		expect(adapter.getMarkerById('x')).toBe(m);
	});

	it('getMarkerById returns null for unknown id', () => {
		const model = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		adapter.onChange(() => {});
		expect(adapter.getMarkerById('nonexistent')).toBeNull();
	});

	it('offChange removes listener correctly (wrapper identity preserved)', () => {
		const model = createMockModelWithListeners([makeMarker('a', 'f1')]);
		const adapter = new UnifiedModelAdapter(registry, [model]);
		const callback = vi.fn();
		adapter.onChange(callback);
		// Prime cache
		adapter.getAllMarkers();
		// Remove listener
		adapter.offChange(callback);
		// Trigger change — callback should NOT fire
		model.triggerChange();
		expect(callback).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/unifiedModelAdapter.test.ts`
Expected: FAIL — cache behavior not implemented yet (e.g., reference equality fails, `offChange` wrapper identity fails)

- [ ] **Step 3: Implement cache in `UnifiedModelAdapter`**

Replace the contents of `src/core/unifiedModelAdapter.ts` with the cached version. Key changes:

1. Add private fields:
```typescript
private dirty = true;
private cachedMarkers: BaseMarker[] = [];
private cachedFileIndex = new Map<string, BaseMarker[]>();
private cachedIdIndex = new Map<string, BaseMarker>();
private wrappedListeners = new Map<() => void, () => void>();
```

2. Add `rebuild()`:
```typescript
private rebuild(): void {
    this.cachedMarkers = this.models.flatMap(m => m.getAllMarkers());
    this.cachedFileIndex = new Map();
    this.cachedIdIndex = new Map();
    for (const marker of this.cachedMarkers) {
        const list = this.cachedFileIndex.get(marker.fileId);
        if (list) list.push(marker);
        else this.cachedFileIndex.set(marker.fileId, [marker]);
        this.cachedIdIndex.set(marker.id, marker);
    }
    this.dirty = false;
}
```

3. Replace `getAllMarkers()`:
```typescript
getAllMarkers(): BaseMarker[] {
    if (this.dirty) this.rebuild();
    return this.cachedMarkers;
}
```

4. Replace `getMarkerById()`:
```typescript
getMarkerById(id: string): BaseMarker | null {
    if (this.dirty) this.rebuild();
    return this.cachedIdIndex.get(id) ?? null;
}
```

5. Replace `getAllFileIds()`:
```typescript
getAllFileIds(): string[] {
    if (this.dirty) this.rebuild();
    return Array.from(this.cachedFileIndex.keys());
}
```

6. Replace `getMarkersForFile()`:
```typescript
getMarkersForFile(fileId: string): BaseMarker[] {
    if (this.dirty) this.rebuild();
    return this.cachedFileIndex.get(fileId) ?? [];
}
```

7. Replace `onChange()` and `offChange()`:
```typescript
onChange(fn: () => void): void {
    const wrapped = () => {
        this.dirty = true;
        fn();
    };
    this.wrappedListeners.set(fn, wrapped);
    for (const m of this.models) m.onChange(wrapped);
}

offChange(fn: () => void): void {
    const wrapped = this.wrappedListeners.get(fn);
    if (!wrapped) return;
    this.wrappedListeners.delete(fn);
    for (const m of this.models) m.offChange(wrapped);
}
```

**IMPORTANT:** Methods that do writes (`updateMarkerFields`, `removeMarker`, `renameCode`, `deleteCode`) and use `getMarkerById` internally — these currently iterate models directly. They should continue to do so (calling the sub-model's own `getMarkerById`, not the cached one) because they need to find which model owns the marker. However, `setHoverState` at line 92 calls `m.getMarkerById()` on sub-models, which is correct — it needs to find the owning model. No changes needed for write methods.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/unifiedModelAdapter.test.ts`
Expected: all PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: cache com dirty flag e indices fileId/id no UnifiedModelAdapter"
```

---

## Chunk 2: View debounce

### Task 2: Add rAF debounce to Explorer and Detail views

**Files:**
- Modify: `src/core/baseCodeExplorerView.ts:29-32,56-70`
- Modify: `src/core/baseCodeDetailView.ts:31-33,68-81`

- [ ] **Step 1: Refactor `BaseCodeExplorerView` to use `scheduleRefresh`**

In `src/core/baseCodeExplorerView.ts`:

Replace lines 29-32:
```typescript
private boundRenderTree = () => this.renderTree();
private boundApplyHover = () => this.applyHoverToItems();
private boundRegistryRefresh = () => this.renderTree();
```
With:
```typescript
private rafId: number | null = null;
private scheduleRefresh = () => {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.renderTree();
    });
};
private boundApplyHover = () => this.applyHoverToItems();
```

In `onOpen()` (line 56-63), replace:
```typescript
this.model.onChange(this.boundRenderTree);
```
With:
```typescript
this.model.onChange(this.scheduleRefresh);
```

Replace:
```typescript
document.addEventListener('qualia:registry-changed', this.boundRegistryRefresh);
```
With:
```typescript
document.addEventListener('qualia:registry-changed', this.scheduleRefresh);
```

In `onClose()` (line 65-70), replace:
```typescript
this.model.offChange(this.boundRenderTree);
```
With:
```typescript
this.model.offChange(this.scheduleRefresh);
if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
```

Replace:
```typescript
document.removeEventListener('qualia:registry-changed', this.boundRegistryRefresh);
```
With:
```typescript
document.removeEventListener('qualia:registry-changed', this.scheduleRefresh);
```

- [ ] **Step 2: Refactor `BaseCodeDetailView` to use `scheduleRefresh`**

In `src/core/baseCodeDetailView.ts`:

Replace lines 31-33:
```typescript
private boundRefresh = () => this.refreshCurrentMode();
private boundApplyHover = () => this.applyHoverToItems();
private boundRegistryRefresh = () => this.refreshCurrentMode();
```
With:
```typescript
private rafId: number | null = null;
private scheduleRefresh = () => {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.refreshCurrentMode();
    });
};
private boundApplyHover = () => this.applyHoverToItems();
```

In `onOpen()` (line 68-75), replace:
```typescript
this.model.onChange(this.boundRefresh);
```
With:
```typescript
this.model.onChange(this.scheduleRefresh);
```

Replace:
```typescript
document.addEventListener('qualia:registry-changed', this.boundRegistryRefresh);
```
With:
```typescript
document.addEventListener('qualia:registry-changed', this.scheduleRefresh);
```

In `onClose()` (line 77-81), replace:
```typescript
this.model.offChange(this.boundRefresh);
```
With:
```typescript
this.model.offChange(this.scheduleRefresh);
if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
```

Replace:
```typescript
document.removeEventListener('qualia:registry-changed', this.boundRegistryRefresh);
```
With:
```typescript
document.removeEventListener('qualia:registry-changed', this.scheduleRefresh);
```

Also update the `suspendRefresh`/`resumeRefresh` lambdas in `doRenderCodeDetail()` (line 179-180) and `doRenderMarkerDetail()` (line 202-203). Replace all 4 occurrences:

```typescript
// Before:
suspendRefresh: () => this.model.offChange(this.boundRefresh),
resumeRefresh: () => this.model.onChange(this.boundRefresh),

// After:
suspendRefresh: () => this.model.offChange(this.scheduleRefresh),
resumeRefresh: () => this.model.onChange(this.scheduleRefresh),
```

**CRITICAL:** Without this, `offChange` will try to remove `boundRefresh` which was never registered — the color picker will trigger cascading refreshes during drag.

- [ ] **Step 3: Update existing onChange/offChange tests**

In `tests/core/unifiedModelAdapter.test.ts`, the existing `onChange / offChange` describe block (around lines 167-187) asserts `toHaveBeenCalledWith(fn)`. After the change, sub-models receive a `wrapped` function, not `fn`. Update these tests to assert `toHaveBeenCalledTimes(1)` instead of checking the exact function reference.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: debounce rAF nas views Explorer e Detail (scheduleRefresh)"
```

---

## Chunk 3: Final verification

### Task 3: Build + demo vault + backlog cleanup

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success

- [ ] **Step 3: Copy artifacts to demo vault**

Run: `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

- [ ] **Step 4: Update BACKLOG.md — remove the item we just implemented**

In `docs/BACKLOG.md`, remove the "Explorer/Detail view cache por engine" subsection that was added in the previous feature (it's now implemented, not a backlog item).

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "chore: rebuild demo vault com Explorer/Detail cache e atualiza backlog"
```
