# Multi-Pane State Isolation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `leaf.detach()` blocker and isolate all per-view global state so multiple panes of the same engine type work independently.

**Architecture:** PDF gets `PdfViewState` via `WeakMap<HTMLElement, PdfViewState>`. Image keyboard listeners are scoped to `contentEl` (no state struct needed — existing `destroy()` handles cleanup). Hover in all models gets aligned with markdown's `hoveredIds` pattern. The interceptor gate is removed last.

**Tech Stack:** TypeScript strict, Vitest + jsdom, Obsidian API

**Spec:** `docs/superpowers/specs/2026-03-20-multi-pane-state-isolation-design.md`

---

## Chunk 1: PDF State Isolation

### Task 1: Create PdfViewState struct

**Files:**
- Create: `src/pdf/pdfViewState.ts`
- Test: `tests/pdf/pdfViewState.test.ts`

- [ ] **Step 1: Write failing tests for PdfViewState**

```typescript
// tests/pdf/pdfViewState.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPdfViewState, destroyPdfViewState } from '../../src/pdf/pdfViewState';

describe('PdfViewState', () => {
  const el = document.createElement('div');

  afterEach(() => destroyPdfViewState(el));

  it('creates state on first access', () => {
    const state = getPdfViewState(el);
    expect(state.hoverOpenTimer).toBeNull();
    expect(state.hoverCloseTimer).toBeNull();
    expect(state.currentHoverMarkerId).toBeNull();
    expect(state.shapeHoverTimer).toBeNull();
    expect(state.currentHoverShapeId).toBeNull();
    expect(state.containerEl).toBe(el);
  });

  it('returns same state on subsequent access', () => {
    const a = getPdfViewState(el);
    const b = getPdfViewState(el);
    expect(a).toBe(b);
  });

  it('different elements get different states', () => {
    const el2 = document.createElement('div');
    const a = getPdfViewState(el);
    const b = getPdfViewState(el2);
    expect(a).not.toBe(b);
    destroyPdfViewState(el2);
  });

  it('destroy clears timers and prevents callbacks', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const state = getPdfViewState(el);
    state.hoverOpenTimer = setTimeout(callback, 100);
    state.hoverCloseTimer = setTimeout(callback, 100);
    state.shapeHoverTimer = setTimeout(callback, 100);
    destroyPdfViewState(el);
    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();
    // After destroy, new access creates fresh state
    const fresh = getPdfViewState(el);
    expect(fresh.hoverOpenTimer).toBeNull();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/pdf/pdfViewState.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PdfViewState**

```typescript
// src/pdf/pdfViewState.ts
export interface PdfViewState {
  hoverOpenTimer: ReturnType<typeof setTimeout> | null;
  hoverCloseTimer: ReturnType<typeof setTimeout> | null;
  currentHoverMarkerId: string | null;
  shapeHoverTimer: ReturnType<typeof setTimeout> | null;
  currentHoverShapeId: string | null;
  containerEl: HTMLElement;
}

const pdfStates = new WeakMap<HTMLElement, PdfViewState>();

export function getPdfViewState(containerEl: HTMLElement): PdfViewState {
  let state = pdfStates.get(containerEl);
  if (!state) {
    state = {
      hoverOpenTimer: null,
      hoverCloseTimer: null,
      currentHoverMarkerId: null,
      shapeHoverTimer: null,
      currentHoverShapeId: null,
      containerEl,
    };
    pdfStates.set(containerEl, state);
  }
  return state;
}

export function destroyPdfViewState(containerEl: HTMLElement): void {
  const state = pdfStates.get(containerEl);
  if (!state) return;
  if (state.hoverOpenTimer) clearTimeout(state.hoverOpenTimer);
  if (state.hoverCloseTimer) clearTimeout(state.hoverCloseTimer);
  if (state.shapeHoverTimer) clearTimeout(state.shapeHoverTimer);
  pdfStates.delete(containerEl);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/pdf/pdfViewState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pdf/pdfViewState.ts tests/pdf/pdfViewState.test.ts
~/.claude/scripts/commit.sh "feat: cria PdfViewState com WeakMap per-view (M1)"
```

---

### Task 2: Migrate highlightRenderer.ts to PdfViewState

**Files:**
- Modify: `src/pdf/highlightRenderer.ts` (lines 105-128 globals, lines 298-304 + 346-352 popover queries)
- Modify: `src/pdf/pageObserver.ts` (lines 166-170 — pass state to renderHighlightsForPage)

- [ ] **Step 1: Write failing test for state-parameterized hover helpers**

```typescript
// tests/pdf/pdfViewState.test.ts — ADD to existing file
import {
  cancelHoverPopover,
  startHoverCloseTimer,
  cancelHoverCloseTimer,
} from '../../src/pdf/highlightRenderer';

describe('highlightRenderer hover helpers with PdfViewState', () => {
  const el = document.createElement('div');
  let state: PdfViewState;

  beforeEach(() => {
    state = getPdfViewState(el);
  });

  afterEach(() => destroyPdfViewState(el));

  it('cancelHoverPopover clears hoverOpenTimer from state', () => {
    state.hoverOpenTimer = setTimeout(() => {}, 9999);
    cancelHoverPopover(state);
    expect(state.hoverOpenTimer).toBeNull();
  });

  it('startHoverCloseTimer sets and fires close timer', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    startHoverCloseTimer(state, close);
    expect(state.hoverCloseTimer).not.toBeNull();
    vi.advanceTimersByTime(400);
    expect(close).toHaveBeenCalled();
    expect(state.currentHoverMarkerId).toBeNull();
    vi.useRealTimers();
  });

  it('cancelHoverCloseTimer clears hoverCloseTimer', () => {
    state.hoverCloseTimer = setTimeout(() => {}, 9999);
    cancelHoverCloseTimer(state);
    expect(state.hoverCloseTimer).toBeNull();
  });
});

describe('scoped popover query isolation', () => {
  it('containerEl.querySelector finds only its own popover', () => {
    const pane1 = document.createElement('div');
    const pane2 = document.createElement('div');
    const pop1 = document.createElement('div');
    pop1.classList.add('codemarker-popover');
    pop1.textContent = 'pane1';
    pane1.appendChild(pop1);
    const pop2 = document.createElement('div');
    pop2.classList.add('codemarker-popover');
    pop2.textContent = 'pane2';
    pane2.appendChild(pop2);

    const found1 = pane1.querySelector('.codemarker-popover');
    const found2 = pane2.querySelector('.codemarker-popover');
    expect(found1?.textContent).toBe('pane1');
    expect(found2?.textContent).toBe('pane2');
    expect(found1).not.toBe(found2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/pdf/pdfViewState.test.ts`
Expected: FAIL — functions don't accept state param

- [ ] **Step 3: Modify highlightRenderer.ts**

Changes:
1. **Remove** the 3 module-level `let` globals (lines 106-108)
2. **Change** `cancelHoverPopover()` → `cancelHoverPopover(state: PdfViewState)`
3. **Change** `startHoverCloseTimer(closePopover)` → `startHoverCloseTimer(state: PdfViewState, closePopover: () => void)`
4. **Change** `cancelHoverCloseTimer()` → `cancelHoverCloseTimer(state: PdfViewState)`
5. **Change** `renderHighlightsForPage(pageView, markers, registry, callbacks)` → add `state: PdfViewState` as 5th param
6. Inside `attachLayerHoverTracking` (the hover logic at ~line 217+): replace all `currentHoverMarkerId` references with `state.currentHoverMarkerId`, `hoverOpenTimer` with `state.hoverOpenTimer`
7. **Replace** `document.querySelector('.codemarker-popover')` (2 occurrences at lines 299, 347) with `state.containerEl.querySelector('.codemarker-popover')`

Import at top of file:
```typescript
import type { PdfViewState } from './pdfViewState';
```

Updated function signatures:
```typescript
export function cancelHoverPopover(state: PdfViewState): void {
  if (state.hoverOpenTimer) { clearTimeout(state.hoverOpenTimer); state.hoverOpenTimer = null; }
}

export function startHoverCloseTimer(state: PdfViewState, closePopover: () => void): void {
  if (state.hoverCloseTimer) clearTimeout(state.hoverCloseTimer);
  state.hoverCloseTimer = setTimeout(() => {
    closePopover();
    state.currentHoverMarkerId = null;
    state.hoverCloseTimer = null;
  }, HOVER_CLOSE_DELAY);
}

export function cancelHoverCloseTimer(state: PdfViewState): void {
  if (state.hoverCloseTimer) { clearTimeout(state.hoverCloseTimer); state.hoverCloseTimer = null; }
}
```

In `renderHighlightsForPage`, add param and pass `state` through to the internal `attachLayerHoverTracking` call. All references to the old globals inside the hover tracking closure change to `state.xxx`.

- [ ] **Step 4: Update pageObserver.ts to pass PdfViewState**

In `PdfPageObserver` class:
1. Add `private state: PdfViewState` field
2. Constructor receives `state: PdfViewState` and stores it
3. In `renderPage()` line 166: pass `this.state` as 5th arg to `renderHighlightsForPage(pageView, markers, registry, highlightCallbacks, this.state)`

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/pdf/pdfViewState.test.ts`
Expected: PASS

Run: `npm run test` (full suite to catch regressions)
Expected: All 1548+ tests pass

- [ ] **Step 6: Commit**

```bash
git add src/pdf/highlightRenderer.ts src/pdf/pageObserver.ts tests/pdf/pdfViewState.test.ts
~/.claude/scripts/commit.sh "refactor: highlightRenderer usa PdfViewState em vez de globals (M1)"
```

---

### Task 3: Migrate drawLayer.ts to PdfViewState

**Files:**
- Modify: `src/pdf/drawLayer.ts` (lines 24-26 globals, line 105 popover query)
- Modify: `src/pdf/pageObserver.ts` (line 201 — pass state to renderDrawLayerForPage)

- [ ] **Step 1: Write failing test**

```typescript
// tests/pdf/pdfViewState.test.ts — ADD
describe('drawLayer shape hover with PdfViewState', () => {
  it('different containers get independent shape hover state', () => {
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    const s1 = getPdfViewState(el1);
    const s2 = getPdfViewState(el2);
    s1.currentHoverShapeId = 'shape-A';
    expect(s2.currentHoverShapeId).toBeNull();
    destroyPdfViewState(el1);
    destroyPdfViewState(el2);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (struct already supports this)

Run: `npm run test -- tests/pdf/pdfViewState.test.ts`
Expected: PASS

- [ ] **Step 3: Modify drawLayer.ts**

Changes:
1. **Remove** the 2 module-level `let` globals (lines 25-26)
2. **Change** `renderDrawLayerForPage(pageView, shapes, registry, callbacks)` → add `state: PdfViewState` as 5th param
3. Inside mouseenter/mouseleave closures: replace `shapeHoverTimer` → `state.shapeHoverTimer`, `currentHoverShapeId` → `state.currentHoverShapeId`
4. Pass `state` to imported helpers: `cancelHoverCloseTimer(state)`, `cancelHoverPopover(state)`, `startHoverCloseTimer(state, () => {...})`
5. **Replace** `document.querySelector('.codemarker-popover')` (line 105) with `state.containerEl.querySelector('.codemarker-popover')`

Import at top:
```typescript
import type { PdfViewState } from './pdfViewState';
```

Updated signature:
```typescript
export function renderDrawLayerForPage(
  pageView: PDFPageView,
  shapes: PdfShapeMarker[],
  registry: CodeDefinitionRegistry,
  callbacks: DrawLayerCallbacks,
  state: PdfViewState,
): void {
```

- [ ] **Step 4: Update pageObserver.ts call site**

Line 201: `renderDrawLayerForPage(pageView, shapes, this.model.registry, drawCallbacks, this.state);`

- [ ] **Step 5: Run full tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/pdf/drawLayer.ts src/pdf/pageObserver.ts
~/.claude/scripts/commit.sh "refactor: drawLayer usa PdfViewState em vez de globals (M1)"
```

---

### Task 4: Wire PdfViewState in pdf/index.ts

**Files:**
- Modify: `src/pdf/index.ts` (create state when instrumenting viewer, destroy on cleanup)
- Modify: `src/pdf/pageObserver.ts` (constructor param)

- [ ] **Step 1: Modify pdf/index.ts**

Add import:
```typescript
import { getPdfViewState, destroyPdfViewState } from './pdfViewState';
```

Where `PdfPageObserver` is created (inside the instrumentation function), pass state:
```typescript
const pdfState = getPdfViewState(child.containerEl);
const observer = new PdfPageObserver(child, model, observerCallbacks, pdfState);
```

In the cleanup function (where `observer.stop()` is called), add:
```typescript
destroyPdfViewState(child.containerEl);
```

- [ ] **Step 2: Update PdfPageObserver constructor**

In `src/pdf/pageObserver.ts`, the constructor currently takes `(child, model, callbacks)`. Add `state: PdfViewState` as 4th param:
```typescript
constructor(
  child: PDFViewerChild,
  model: PdfCodingModel,
  callbacks: PageObserverCallbacks,
  private state: PdfViewState,
) {
```

Remove the separate field declaration since `private` in constructor handles it.

- [ ] **Step 3: Run full tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/pdf/index.ts src/pdf/pageObserver.ts
~/.claude/scripts/commit.sh "feat: wire PdfViewState no lifecycle do PDF engine (M1)"
```

---

## Chunk 2: Image Keyboard Scoping

### Task 5: Scope imageToolbar.ts keyboard to contentEl

**Files:**
- Modify: `src/image/imageToolbar.ts` (line 128 — window → parent)

The `imageToolbar.ts` already has its own `destroy()` that removes the listener. No separate state struct needed — `createToolbar` receives `parent` (which is `contentEl` from the view) and the existing destroy handles cleanup.

- [ ] **Step 1: Modify imageToolbar.ts — scope keyboard to parent**

Line 128 — change:
```typescript
// OLD:
window.addEventListener("keydown", onKeyDown);
```
to:
```typescript
// NEW:
parent.addEventListener("keydown", onKeyDown);
```

Line 132 — change:
```typescript
// OLD:
window.removeEventListener("keydown", onKeyDown);
```
to:
```typescript
// NEW:
parent.removeEventListener("keydown", onKeyDown);
```

Note: `parent` is the `contentEl` passed to `createToolbar()`. It is the view's content container — the right scope for keyboard events.

- [ ] **Step 2: Run full tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/image/imageToolbar.ts
~/.claude/scripts/commit.sh "refactor: toolbar keyboard scoped ao contentEl (M1/I4)"
```

---

### Task 6: Scope zoomPanControls.ts keydown/keyup to contentEl

**Files:**
- Modify: `src/image/canvas/zoomPanControls.ts` (lines 16, 97-98, 106-107)

**Critical:** `setupZoomPanControls` currently receives `FabricCanvasState` which has `container` (the canvas div — a **child** of `contentEl`). Keydown events fire on the focused element (`contentEl`), not on children. If we listen on `container`, Space+drag breaks silently.

Solution: Add `keyboardEl: HTMLElement` param to `setupZoomPanControls`. The caller (imageView) passes `contentEl`. Both toolbar and zoomPan listen on the same focused element.

- [ ] **Step 1: Update function signature**

```typescript
// OLD:
export function setupZoomPanControls(state: FabricCanvasState, callbacks?: ZoomPanCallbacks): ZoomPanCleanup {
// NEW:
export function setupZoomPanControls(state: FabricCanvasState, callbacks?: ZoomPanCallbacks, keyboardEl?: HTMLElement): ZoomPanCleanup {
  const kbEl = keyboardEl ?? container; // backward-compatible fallback
```

- [ ] **Step 2: Use kbEl for keydown/keyup**

Lines 97-98:
```typescript
// OLD:
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
// NEW:
kbEl.addEventListener("keydown", onKeyDown);
kbEl.addEventListener("keyup", onKeyUp);
```

Cleanup (lines 106-107):
```typescript
// OLD:
window.removeEventListener("keydown", onKeyDown);
window.removeEventListener("keyup", onKeyUp);
// NEW:
kbEl.removeEventListener("keydown", onKeyDown);
kbEl.removeEventListener("keyup", onKeyUp);
```

Mouse move/up stay on `window` — they need to capture drag outside container.

- [ ] **Step 3: Update call site in imageView.ts**

Where `setupZoomPanControls` is called (line ~179):
```typescript
// OLD:
this.zoomPanCleanup = setupZoomPanControls(this.fabricState, { onViewChanged: saveView });
// NEW:
this.zoomPanCleanup = setupZoomPanControls(this.fabricState, { onViewChanged: saveView }, contentEl);
```

- [ ] **Step 4: Run full tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/image/canvas/zoomPanControls.ts src/image/views/imageView.ts
~/.claude/scripts/commit.sh "refactor: zoomPanControls keydown/keyup scoped ao contentEl (M1/I4)"
```

---

### Task 7: Wire focus management in ImageCodingView

**Files:**
- Modify: `src/image/views/imageView.ts`

- [ ] **Step 1: Add tabIndex to contentEl**

In `loadImage()` method, before toolbar/zoomPan setup, add:
```typescript
contentEl.tabIndex = -1; // Focusable via JS, not Tab order
```

This ensures `contentEl` can receive keyboard events for both toolbar and zoomPan.

- [ ] **Step 2: Add focus on activation**

In the view's constructor or `onload`, register workspace event to focus when this pane becomes active:
```typescript
this.registerEvent(
  this.app.workspace.on('active-leaf-change', (leaf) => {
    if (leaf === this.leaf) {
      this.contentEl.focus();
    }
  })
);
```

- [ ] **Step 3: Run full tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/image/views/imageView.ts
~/.claude/scripts/commit.sh "feat: focus management no ImageCodingView para keyboard scoped (M1)"
```

---

## Chunk 3: Sidebar Hover + Interceptor Gate

### Task 8: Add hoveredMarkerIds to remaining models

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts` (lines 28, 74-81)
- Modify: `src/image/imageCodingModel.ts` (lines 17, 165-172)
- Modify: `src/csv/csvCodingModel.ts` (lines 15, 57-64)
- Modify: `src/media/mediaCodingModel.ts` (lines 28, 86-93)
- Modify: `src/core/baseSidebarAdapter.ts` (lines 76-87)
- Modify: `src/core/baseSidebarAdapter.ts` `AdapterModel` interface (add `getHoverMarkerIds`)
- Modify: `tests/core/baseSidebarAdapter.test.ts`
- Modify: `tests/engine-models/pdfCodingModel.test.ts`
- Modify: `tests/engine-models/imageCodingModel.test.ts`
- Modify: `tests/engine-models/csvCodingModel.test.ts`
- Modify: `tests/media/mediaCodingModel.test.ts`

- [ ] **Step 1: Write failing tests for models**

Add to each model test file a test like:
```typescript
it('setHoverState with hoveredIds stores array', () => {
  model.setHoverState('m1', 'code-a', ['m1', 'm2']);
  expect(model.getHoverMarkerIds()).toEqual(['m1', 'm2']);
});

it('setHoverState without hoveredIds defaults to [markerId]', () => {
  model.setHoverState('m1', 'code-a');
  expect(model.getHoverMarkerIds()).toEqual(['m1']);
});

it('setHoverState(null) clears hoveredIds', () => {
  model.setHoverState('m1', 'code-a');
  model.setHoverState(null, null);
  expect(model.getHoverMarkerIds()).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/engine-models/ tests/media/mediaCodingModel.test.ts`
Expected: FAIL — `getHoverMarkerIds` not a function (on PDF, Image, CSV, Media models)

- [ ] **Step 3: Implement in each model**

Pattern (same for all 4 models — PDF example):

In `pdfCodingModel.ts`, add field:
```typescript
private _hoveredMarkerIds: string[] = [];
```

Update `setHoverState`:
```typescript
setHoverState(markerId: string | null, codeName: string | null, hoveredIds?: string[]): void {
  const newIds = hoveredIds ?? (markerId ? [markerId] : []);
  if (this.hoverMarkerId === markerId && this.hoverCodeName === codeName
    && this._hoveredMarkerIds.length === newIds.length) return;
  this.hoverMarkerId = markerId;
  this.hoverCodeName = codeName;
  this._hoveredMarkerIds = newIds;
  for (const fn of this.hoverListeners) fn(markerId, codeName);
}
```

Add method:
```typescript
getHoverMarkerIds(): string[] { return this._hoveredMarkerIds; }
```

Repeat for `imageCodingModel.ts`, `csvCodingModel.ts`, `mediaCodingModel.ts` (adapting field names to each model's convention).

- [ ] **Step 4: Update AdapterModel interface and BaseSidebarAdapter**

In `baseSidebarAdapter.ts`, add to `AdapterModel` interface:
```typescript
getHoverMarkerIds?(): string[];
```

Update `getHoverMarkerIds()` in `BaseSidebarAdapter`:
```typescript
getHoverMarkerIds(): string[] {
  if (this.model.getHoverMarkerIds) return this.model.getHoverMarkerIds();
  const id = this.model.getHoverMarkerId();
  return id ? [id] : [];
}
```

- [ ] **Step 5: Update baseSidebarAdapter test**

In `tests/core/baseSidebarAdapter.test.ts`, update mock to include `getHoverMarkerIds`:
```typescript
getHoverMarkerIds: vi.fn(() => []),
```

Add test:
```typescript
it('getHoverMarkerIds delegates to model when available', () => {
  (model.getHoverMarkerIds as any).mockReturnValue(['m1', 'm2']);
  expect(adapter.getHoverMarkerIds()).toEqual(['m1', 'm2']);
});
```

- [ ] **Step 6: Run full tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/pdf/pdfCodingModel.ts src/image/imageCodingModel.ts src/csv/csvCodingModel.ts src/media/mediaCodingModel.ts src/core/baseSidebarAdapter.ts tests/
~/.claude/scripts/commit.sh "feat: hoveredMarkerIds em todos os models, alinhado com markdown (M1/M2)"
```

---

### Task 9: Remove leaf.detach() from fileInterceptor

**Files:**
- Modify: `src/core/fileInterceptor.ts` (remove lines 109-119)
- Modify: `tests/core/fileInterceptor.test.ts`

- [ ] **Step 1: Write test that duplicate files are NOT blocked**

```typescript
// tests/core/fileInterceptor.test.ts — ADD
describe('setupFileInterceptor (no detach)', () => {
  it('matchesInterceptRule does not check for existing leaves', () => {
    // The pure helper only checks extension + guard + viewType
    // There is no "already open" check — that logic was removed
    const rule: FileInterceptRule = {
      extensions: new Set(['pdf']),
      targetViewType: 'pdf-coding',
    };
    expect(matchesInterceptRule(rule, 'markdown', 'pdf')).toBe(true);
    // Same file, different view → still matches (no detach block)
    expect(matchesInterceptRule(rule, 'markdown', 'pdf')).toBe(true);
  });
});
```

- [ ] **Step 2: Remove the detach block from fileInterceptor.ts**

Remove lines 109-119 (the `existingLeaves` check + `leaf.detach()` + `setActiveLeaf`):

```typescript
// REMOVE this entire block:
// Check if file is already open in another leaf of the target type
const existingLeaves = plugin.app.workspace.getLeavesOfType(rule.targetViewType);
const existingLeaf = existingLeaves.find(l => {
  const state = l.view.getState?.();
  const viewFile = state?.file ?? (l.view instanceof FileView ? l.view.file?.path : undefined);
  return viewFile === filePath;
});
if (existingLeaf) {
  leaf.detach();
  plugin.app.workspace.setActiveLeaf(existingLeaf);
  return;
}
```

The `leaf.setViewState()` call below it stays — it handles view type interception (opening .pdf in PdfView).

- [ ] **Step 3: Run full tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/core/fileInterceptor.ts tests/core/fileInterceptor.test.ts
~/.claude/scripts/commit.sh "feat: remove leaf.detach() — multi-pane habilitado (M1)"
```

---

### Task 10: Update backlog and run final validation

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Clean build, no TypeScript errors

- [ ] **Step 3: Update BACKLOG.md**

Mark resolved items:
- M1 → FEITO
- M2 → FEITO
- M3 → FEITO
- P2 → FEITO
- P3 → FEITO
- I4 → FEITO

Update section 3 header to note the solution:
```markdown
## 3. ~~Multi-pane / state isolation~~ — FEITO (2026-03-20)
```

- [ ] **Step 4: Commit**

```bash
git add docs/BACKLOG.md
~/.claude/scripts/commit.sh "docs: marca M1-M3, P2, P3, I4 como feitos no backlog"
```
