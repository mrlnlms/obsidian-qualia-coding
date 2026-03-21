# PDF Bugs Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 5 remaining PDF backlog bugs (P1, P4, P7, P8, P9) — timer leaks, listener leaks, geometry no-op, keyboard filter, batch notify.

**Architecture:** Each bug is independent. P8 is the simplest (one-line guard), P7 is a no-op removal, P9 refactors a loop into direct mutation, P1 adds timer tracking to pageObserver, P4 adds listener cleanup to cleanupOrphanedObservers. All bugs have zero test coverage — each task adds tests first (TDD).

**Tech Stack:** TypeScript strict, Vitest + jsdom, Obsidian API

---

## Chunk 1: Quick Fixes (P7, P8, P9)

### Task 1: Remove pageY no-op in highlightGeometry (P7)

**Files:**
- Modify: `src/pdf/highlightGeometry.ts:213-214`
- Create: `tests/pdf/highlightGeometry.test.ts`

- [ ] **Step 1: Write failing test for getMarkerVerticalBounds**

```typescript
// tests/pdf/highlightGeometry.test.ts
import { describe, it, expect } from 'vitest';
import { getMarkerVerticalBounds } from '../../src/pdf/highlightGeometry';

describe('getMarkerVerticalBounds', () => {
  // Standard page: viewBox [0, 0, 612, 792] (US Letter)
  const standardPage = { pdfPage: { view: [0, 0, 612, 792] as [number, number, number, number] } };

  it('returns null for empty rects', () => {
    expect(getMarkerVerticalBounds([], standardPage)).toBeNull();
  });

  it('converts PDF coords to CSS % for standard page', () => {
    // rect = [left, bottom, right, top] in PDF coords (y-up)
    // A rect near the top of the page: bottom=700, top=750
    const rects = [{ rect: [50, 700, 200, 750] as [number, number, number, number] }];
    const result = getMarkerVerticalBounds(rects, standardPage);
    expect(result).not.toBeNull();
    // cssTop = 100 * (792 - 750) / 792 = 100 * 42/792 ≈ 5.30
    expect(result!.topPct).toBeCloseTo(5.30, 1);
    // cssBottom = 100 * (792 - 700) / 792 = 100 * 92/792 ≈ 11.62
    expect(result!.bottomPct).toBeCloseTo(11.62, 1);
  });

  it('handles cropped page with non-zero viewBox[1]', () => {
    // Cropped page: viewBox [0, 100, 612, 792] — top 100 units cropped
    const croppedPage = { pdfPage: { view: [0, 100, 612, 792] as [number, number, number, number] } };
    const rects = [{ rect: [50, 700, 200, 750] as [number, number, number, number] }];
    const result = getMarkerVerticalBounds(rects, croppedPage);
    expect(result).not.toBeNull();
    // pageHeight = 792 - 100 = 692
    // cssTop = 100 * (792 - 750) / 692 = 100 * 42/692 ≈ 6.07
    expect(result!.topPct).toBeCloseTo(6.07, 1);
    // cssBottom = 100 * (792 - 700) / 692 = 100 * 92/692 ≈ 13.29
    expect(result!.bottomPct).toBeCloseTo(13.29, 1);
  });

  it('clamps to 0-100 range', () => {
    // Rect extending beyond page bounds
    const rects = [{ rect: [0, -50, 100, 850] as [number, number, number, number] }];
    const result = getMarkerVerticalBounds(rects, standardPage);
    expect(result).not.toBeNull();
    expect(result!.topPct).toBe(0);
    expect(result!.bottomPct).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/pdf/highlightGeometry.test.ts`
Expected: Tests pass for standard page (no-op doesn't affect it) but cropped page test may reveal the actual behavior.

- [ ] **Step 3: Remove the no-op terms**

```typescript
// src/pdf/highlightGeometry.ts:213-214
// Before:
const cssTop = 100 * (viewBox[3] - maxTop + pageY - pageY) / pageHeight;
const cssBottom = 100 * (viewBox[3] - minBottom + pageY - pageY) / pageHeight;

// After:
const cssTop = 100 * (viewBox[3] - maxTop) / pageHeight;
const cssBottom = 100 * (viewBox[3] - minBottom) / pageHeight;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/pdf/highlightGeometry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pdf/highlightGeometry.ts tests/pdf/highlightGeometry.test.ts
~/.claude/scripts/commit.sh "fix: remove pageY no-op em getMarkerVerticalBounds (P7)"
```

---

### Task 2: Filter contenteditable in keyboard handler (P8)

**Files:**
- Modify: `src/pdf/drawInteraction.ts:234-266`
- Create: `tests/pdf/drawInteraction.test.ts`

- [ ] **Step 1: Write test for keyboard filtering**

```typescript
// tests/pdf/drawInteraction.test.ts
import { describe, it, expect } from 'vitest';

// Test the filtering logic as a pure function
function shouldInterceptKeyboard(target: { tagName: string; contentEditable?: string }): boolean {
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return false;
  if (target.contentEditable === 'true') return false;
  return true;
}

describe('keyboard filter', () => {
  it('blocks INPUT', () => {
    expect(shouldInterceptKeyboard({ tagName: 'INPUT' })).toBe(false);
  });

  it('blocks TEXTAREA', () => {
    expect(shouldInterceptKeyboard({ tagName: 'TEXTAREA' })).toBe(false);
  });

  it('blocks contenteditable', () => {
    expect(shouldInterceptKeyboard({ tagName: 'DIV', contentEditable: 'true' })).toBe(false);
  });

  it('allows regular elements', () => {
    expect(shouldInterceptKeyboard({ tagName: 'DIV' })).toBe(true);
  });

  it('allows contentEditable=false', () => {
    expect(shouldInterceptKeyboard({ tagName: 'DIV', contentEditable: 'false' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test -- tests/pdf/drawInteraction.test.ts`
Expected: PASS (pure function test)

- [ ] **Step 3: Refactor handleKeyDown to use early return with contenteditable check**

In `src/pdf/drawInteraction.ts`, extract the guard to the top of `handleKeyDown` so it covers both the delete handler AND mode shortcuts:

```typescript
private handleKeyDown(e: KeyboardEvent): void {
    // Don't intercept if user is typing in an editable element
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
        || target.contentEditable === 'true') return;

    // Delete key → remove selected shape
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedShapeId && this.mode === 'select') {
        e.preventDefault();
        this.deleteSelectedShape();
        return;
    }

    // Escape → cancel current drawing or deselect
    if (e.key === 'Escape') {
        if (this.drawing) {
            this.drawing = false;
            this.clearPreview();
        } else if (this.mode === 'polygon' && this.polygonPoints.length > 0) {
            this.polygonPoints = [];
            this.clearPreview();
        } else if (this.selectedShapeId) {
            this.selectShape(null);
        } else if (this.mode !== 'select') {
            this.setMode('select');
        }
    }

    // Keyboard shortcuts for modes
    switch (e.key.toLowerCase()) {
        case 'v': this.setMode('select'); break;
        case 'r': this.setMode('rect'); break;
        case 'e': this.setMode('ellipse'); break;
        case 'p': this.setMode('polygon'); break;
    }
}
```

Note: This moves the guard to the top and removes the duplicate guard at line 260. Escape is also now guarded — typing Escape in a contenteditable won't deselect shapes.

- [ ] **Step 4: Run full tests**

Run: `npm run test`
Expected: All 1573+ tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pdf/drawInteraction.ts tests/pdf/drawInteraction.test.ts
~/.claude/scripts/commit.sh "fix: keyboard handler filtra contenteditable (P8)"
```

---

### Task 3: Batch notify in removeAllCodesFromMarker (P9)

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts:186-198`
- Modify: `tests/engine-models/pdfCodingModel.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/engine-models/pdfCodingModel.test.ts

describe('removeAllCodesFromMarker', () => {
  it('removes marker and notifies once', () => {
    const marker = model.addMarker('doc.pdf', 1, 0, 0, 5, 10, 'hello');
    model.addCodeToMarker(marker.id, 'CodeA');
    model.addCodeToMarker(marker.id, 'CodeB');
    model.addCodeToMarker(marker.id, 'CodeC');

    const listener = vi.fn();
    model.onChange(listener);
    listener.mockClear();

    model.removeAllCodesFromMarker(marker.id);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(model.findMarkerById(marker.id)).toBeUndefined();
  });

  it('is undoable as single operation', () => {
    const marker = model.addMarker('doc.pdf', 1, 0, 0, 5, 10, 'hello');
    model.addCodeToMarker(marker.id, 'CodeA');
    model.addCodeToMarker(marker.id, 'CodeB');

    model.removeAllCodesFromMarker(marker.id);
    expect(model.findMarkerById(marker.id)).toBeUndefined();

    model.undo();
    const restored = model.findMarkerById(marker.id);
    expect(restored).toBeDefined();
    expect(restored!.codes).toEqual(['CodeA', 'CodeB']);
  });

  it('no-ops on nonexistent marker', () => {
    const listener = vi.fn();
    model.onChange(listener);
    listener.mockClear();

    model.removeAllCodesFromMarker('nonexistent');
    expect(listener).not.toHaveBeenCalled();
  });

  it('no-ops on marker with no codes', () => {
    const marker = model.addMarker('doc.pdf', 1, 0, 0, 5, 10, 'hello');
    const listener = vi.fn();
    model.onChange(listener);
    listener.mockClear();

    model.removeAllCodesFromMarker(marker.id);
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/engine-models/pdfCodingModel.test.ts`
Expected: FAIL — `listener` called 3 times instead of 1

- [ ] **Step 3: Refactor removeAllCodesFromMarker to use direct mutation**

```typescript
// src/pdf/pdfCodingModel.ts
removeAllCodesFromMarker(markerId: string): void {
    const marker = this.findMarkerById(markerId);
    if (!marker || marker.codes.length === 0) return;

    this.pushUndo({ type: 'removeAllCodes', markerId, data: { ...marker, codes: [...marker.codes] } });

    // Direct removal — single notify instead of N
    this.removeMarker(markerId, true);
    this.notify();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/engine-models/pdfCodingModel.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/pdf/pdfCodingModel.ts tests/engine-models/pdfCodingModel.test.ts
~/.claude/scripts/commit.sh "fix: removeAllCodesFromMarker notifica uma vez em vez de N (P9)"
```

---

## Chunk 2: Lifecycle Fixes (P1, P4)

### Task 4: Cancel pending timeouts in pageObserver.stop() (P1)

**Files:**
- Modify: `src/pdf/pageObserver.ts:72-77,97-119`
- Modify: `tests/pdf/pdfViewState.test.ts` (or create `tests/pdf/pageObserver.test.ts`)

- [ ] **Step 1: Write failing test**

```typescript
// tests/pdf/pageObserver.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('pageObserver timer cleanup', () => {
  it('pending pagerendered timeout does not fire after stop', () => {
    vi.useFakeTimers();
    const renderPage = vi.fn();

    // Simulate the pattern: setTimeout in handler, then stop
    const timeouts = new Map<number, ReturnType<typeof setTimeout>>();

    function onPageRendered(pageNumber: number) {
      // Cancel previous timeout for same page (if any)
      const prev = timeouts.get(pageNumber);
      if (prev) clearTimeout(prev);
      timeouts.set(pageNumber, setTimeout(() => renderPage(pageNumber), 100));
    }

    function stop() {
      for (const id of timeouts.values()) clearTimeout(id);
      timeouts.clear();
    }

    // Queue renders for pages 1 and 2
    onPageRendered(1);
    onPageRendered(2);
    expect(timeouts.size).toBe(2);

    // Stop before timers fire
    stop();
    expect(timeouts.size).toBe(0);

    // Advance past timeout — renderPage should NOT be called
    vi.advanceTimersByTime(200);
    expect(renderPage).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('duplicate page render cancels previous timeout', () => {
    vi.useFakeTimers();
    const renderPage = vi.fn();

    const timeouts = new Map<number, ReturnType<typeof setTimeout>>();

    function onPageRendered(pageNumber: number) {
      const prev = timeouts.get(pageNumber);
      if (prev) clearTimeout(prev);
      timeouts.set(pageNumber, setTimeout(() => {
        timeouts.delete(pageNumber);
        renderPage(pageNumber);
      }, 100));
    }

    // Render page 1, then render page 1 again before timeout
    onPageRendered(1);
    vi.advanceTimersByTime(50);
    onPageRendered(1);
    vi.advanceTimersByTime(100);

    // Should only render once (second timer won)
    expect(renderPage).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test -- tests/pdf/pageObserver.test.ts`
Expected: PASS (pure pattern test)

- [ ] **Step 3: Add timer tracking to PdfPageObserver**

In `src/pdf/pageObserver.ts`:

1. Add property:
```typescript
private pageRenderTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
```

2. Modify the `pageRenderedHandler` in `start()`:
```typescript
this.pageRenderedHandler = (data: any) => {
    const pageNumber: number = data.pageNumber;
    // Cancel previous timeout for same page (zoom may fire multiple times)
    const prev = this.pageRenderTimeouts.get(pageNumber);
    if (prev) clearTimeout(prev);
    const id = setTimeout(() => {
        this.pageRenderTimeouts.delete(pageNumber);
        this.renderPage(pageNumber);
    }, 100);
    this.pageRenderTimeouts.set(pageNumber, id);
};
```

3. Add cleanup to `stop()`, after the `pageRenderedHandler` block:
```typescript
// Cancel all pending page render timeouts
for (const id of this.pageRenderTimeouts.values()) {
    clearTimeout(id);
}
this.pageRenderTimeouts.clear();
```

- [ ] **Step 4: Run full tests**

Run: `npm run test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pdf/pageObserver.ts tests/pdf/pageObserver.test.ts
~/.claude/scripts/commit.sh "fix: cancela timeouts pendentes em pageObserver.stop() (P1)"
```

---

### Task 5: Clean childListeners in cleanupOrphanedObservers (P4)

**Files:**
- Modify: `src/pdf/index.ts:51-69`

- [ ] **Step 1: Add listener cleanup to cleanupOrphanedObservers**

In `src/pdf/index.ts`, add the childListeners cleanup block inside the `if (child.unloaded)` branch, after the toolbar cleanup:

```typescript
function cleanupOrphanedObservers() {
    for (const [child, observer] of observers) {
        if (child.unloaded) {
            observer.stop();
            observers.delete(child);

            const interaction = drawInteractions.get(child);
            if (interaction) {
                interaction.stop();
                drawInteractions.delete(child);
            }

            const toolbar = drawToolbars.get(child);
            if (toolbar) {
                toolbar.unmount();
                drawToolbars.delete(child);
            }

            // Clean up DOM event listeners to prevent leaks
            const entries = childListeners.get(child);
            if (entries) {
                for (const { el, type, fn } of entries) {
                    el.removeEventListener(type, fn);
                }
                childListeners.delete(child);
            }
        }
    }
}
```

- [ ] **Step 2: Run full tests**

Run: `npm run test`
Expected: All tests PASS

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pdf/index.ts
~/.claude/scripts/commit.sh "fix: cleanupOrphanedObservers limpa childListeners Map (P4)"
```

---

### Task 6: Update backlog + build + demo

- [ ] **Step 1: Mark P1, P4, P7, P8, P9 as done in BACKLOG.md**

- [ ] **Step 2: Run final validation**

```bash
npx tsc --noEmit
npm run test
npm run build
```

- [ ] **Step 3: Copy to demo vault**

```bash
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 4: Commit**

```bash
git add docs/BACKLOG.md demo/.obsidian/plugins/qualia-coding/
~/.claude/scripts/commit.sh "chore: marca P1-P9 feitos no backlog, atualiza demo vault"
```
