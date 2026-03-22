# PDF Selection Preview Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ghost selection preview rects that persist after the PDF coding popover closes via ESC, outside-click, or alt-tab.

**Architecture:** The root cause is a split between two `close()` functions: `createPopover().close()` (removes DOM + listeners) and `codingPopover.close()` (calls `onClose` callback + `rawClose`). ESC, mousedown-outside, and popover replacement use the inner close, bypassing `onClose` — so `onCloseCleanup` (which removes selection preview rects) is never called. Fix by adding an `onClose` callback to `createPopover` so ALL close paths notify the caller. Add defensive cleanup via `visibilitychange` for edge cases.

**Tech Stack:** TypeScript strict, Vitest + jsdom for tests

**Scope:** 3 source files, 1 test file. ~25 LOC changes.

---

## Chunk 1: Fix createPopover + defensive cleanup

### Task 1: Add onClose callback to createPopover

**Files:**
- Modify: `src/core/baseCodingMenu.ts:14-67` (PopoverHandle, createPopover)
- Modify: `src/core/codingPopover.ts:110-132` (openCodingPopover)

- [ ] **Step 1: Update PopoverHandle interface and createPopover signature**

In `src/core/baseCodingMenu.ts`:

```typescript
// Change PopoverHandle to include onClose:
export interface PopoverHandle {
	container: HTMLElement;
	close: () => void;
}

// Add onClose parameter to createPopover:
export function createPopover(className: string, onClose?: () => void): PopoverHandle {
```

Then in the `close()` function inside `createPopover`, call `onClose` before cleanup:

```typescript
const close = () => {
	if (listenTimer) { clearTimeout(listenTimer); listenTimer = null; }
	onClose?.();
	container.remove();
	if (outsideHandler) document.removeEventListener('mousedown', outsideHandler);
	if (escHandler) document.removeEventListener('keydown', escHandler);
	activePopovers.delete(className);
};
```

Note: `onClose?.()` is called BEFORE `container.remove()` so the callback can reference the container if needed.

- [ ] **Step 2: Update codingPopover.ts to pass onClose to createPopover**

In `src/core/codingPopover.ts`, change the standard mode branch:

```typescript
// Before:
const popover = createPopover(options.className ?? 'codemarker-popover');
container = popover.container;
rawClose = popover.close;

const close = () => {
	options.onClose?.();
	rawClose();
};
```

```typescript
// After:
const popover = createPopover(
	options.className ?? 'codemarker-popover',
	() => options.onClose?.(),
);
container = popover.container;
rawClose = popover.close;

// close() wrapper no longer needs to call onClose — createPopover does it
const close = () => {
	rawClose();
};
```

This ensures ALL close paths (ESC, mousedown-outside, hover grace, explicit close, popover replacement via `activePopovers.get(className)?.close()`) call `onClose`.

- [ ] **Step 3: Run tsc to verify no type errors**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: ALL tests pass

- [ ] **Step 5: Commit**

```bash
git add src/core/baseCodingMenu.ts src/core/codingPopover.ts
~/.claude/scripts/commit.sh "fix: createPopover chama onClose em todos os caminhos de close (ESC, click-fora, replace)"
```

### Task 2: Fix highlightRenderer popover.remove() bypass

**Files:**
- Modify: `src/pdf/highlightRenderer.ts:298-305,346-353`

The hover highlight code in `highlightRenderer.ts` finds the popover DOM element directly and calls `popover.remove()`, bypassing both `createPopover.close()` and `codingPopover.close()`. This leaks document listeners AND skips `onClose`.

- [ ] **Step 1: Replace popover.remove() with activePopovers close**

In `src/pdf/highlightRenderer.ts`, import `closeActivePopover` (new helper) or use existing pattern.

Simplest fix: import and use `closeActivePopover` from `baseCodingMenu.ts`.

First, add to `src/core/baseCodingMenu.ts`:

```typescript
/** Close the active popover for a given class name (if any). */
export function closeActivePopover(className: string): void {
	activePopovers.get(className)?.close();
}
```

Then in `src/pdf/highlightRenderer.ts`, replace both occurrences (lines ~301 and ~349):

```typescript
// Before (line 301):
startHoverCloseTimer(state, () => { popover.remove(); });

// After:
startHoverCloseTimer(state, () => { closeActivePopover('codemarker-popover'); });
```

```typescript
// Before (line 349):
startHoverCloseTimer(state, () => { popover.remove(); });

// After:
startHoverCloseTimer(state, () => { closeActivePopover('codemarker-popover'); });
```

This also removes the need to querySelector for the popover DOM element. Replace the full blocks:

```typescript
// Before (lines 298-304):
if (state.currentHoverMarkerId === currentMarkerId) {
	const popover = state.containerEl.querySelector('.codemarker-popover') as HTMLElement | null;
	if (popover) {
		startHoverCloseTimer(state, () => { popover.remove(); });
	} else {
		state.currentHoverMarkerId = null;
	}
}

// After:
if (state.currentHoverMarkerId === currentMarkerId) {
	startHoverCloseTimer(state, () => {
		closeActivePopover('codemarker-popover');
		state.currentHoverMarkerId = null;
	});
}
```

Apply the same change to the second occurrence (lines ~346-352, inside `onMouseLeave`).

- [ ] **Step 2: Add import to highlightRenderer.ts**

```typescript
import { closeActivePopover } from '../core/baseCodingMenu';
```

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/core/baseCodingMenu.ts src/pdf/highlightRenderer.ts
~/.claude/scripts/commit.sh "fix: PDF hover close usa closeActivePopover em vez de popover.remove() direto"
```

### Task 3: Defensive cleanup via visibilitychange

**Files:**
- Modify: `src/pdf/pdfViewState.ts`
- Modify: `src/pdf/index.ts` (where pdfViewState is created)

For edge cases where no close handler fires (alt-tab during a race condition, browser background tab), add a `visibilitychange` listener that cleans up orphaned preview rects.

- [ ] **Step 1: Add cleanup function to PdfViewState**

In `src/pdf/pdfViewState.ts`:

```typescript
export interface PdfViewState {
	hoverOpenTimer: ReturnType<typeof setTimeout> | null;
	hoverCloseTimer: ReturnType<typeof setTimeout> | null;
	currentHoverMarkerId: string | null;
	shapeHoverTimer: ReturnType<typeof setTimeout> | null;
	currentHoverShapeId: string | null;
	containerEl: HTMLElement;
	/** Cleanup function for selection preview rects (set when preview is rendered). */
	selectionPreviewCleanup: (() => void) | null;
}
```

Update `getPdfViewState` to initialize the new field:

```typescript
selectionPreviewCleanup: null,
```

Update `destroyPdfViewState` to call it:

```typescript
if (state.selectionPreviewCleanup) { state.selectionPreviewCleanup(); state.selectionPreviewCleanup = null; }
```

- [ ] **Step 2: Store preview cleanup in pdfViewState when rendering**

In `src/pdf/index.ts`, where `renderSelectionPreview` is called (~lines 229-235, 200-206), store the cleanup in pdfState:

For single-page selection:
```typescript
// After rendering preview:
if (previewCleanup && pdfState) {
	pdfState.selectionPreviewCleanup = previewCleanup;
}
```

For cross-page selection:
```typescript
// After rendering preview on each page:
if (cleanups.length > 0 && pdfState) {
	pdfState.selectionPreviewCleanup = () => cleanups.forEach(fn => fn());
}
```

Update the `onCloseCleanup` passed to `openPdfCodingPopover` to also clear the state:

```typescript
// Single-page:
() => { previewCleanup?.(); if (pdfState) pdfState.selectionPreviewCleanup = null; }

// Cross-page:
() => { cleanups.forEach(fn => fn()); if (pdfState) pdfState.selectionPreviewCleanup = null; }
```

- [ ] **Step 3: Add visibilitychange listener**

In `src/pdf/index.ts`, inside `instrumentPdfView` or at the module level, add a document-level listener (once):

```typescript
// At module level (outside instrumentPdfView):
let visibilityListenerAdded = false;

// Inside registerPdfEngine, after observers setup:
if (!visibilityListenerAdded) {
	visibilityListenerAdded = true;
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) return;
		// Clean up any orphaned preview rects across all PDF containers
		document.querySelectorAll('.codemarker-pdf-selection-preview').forEach(el => el.remove());
	});
}
```

This is a safety net — if the structural fix (Tasks 1-2) works correctly, this listener will find nothing to clean up. But it prevents ghost rects from persisting indefinitely.

- [ ] **Step 4: Run tsc and tests**

Run: `npx tsc --noEmit && npm run test`
Expected: 0 errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/pdf/pdfViewState.ts src/pdf/index.ts
~/.claude/scripts/commit.sh "fix: cleanup defensivo de selection preview via visibilitychange + pdfViewState"
```

### Task 4: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: 0 tsc errors, esbuild success

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: ALL tests pass

- [ ] **Step 3: Copy build to demo vault**

Run: `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

- [ ] **Step 4: Manual smoke test**

1. Open demo vault in Obsidian
2. Open a PDF, select text → popover appears with selection preview
3. Press ESC → **popover AND preview must disappear**
4. Select text again → popover appears
5. Click outside the popover → **both must disappear**
6. Select text → popover appears → alt-tab away → come back → move mouse away from popover → **both must disappear**
7. Select text → popover appears → hover on an existing marker → **preview must disappear** (popover replaced)
8. Verify no orphaned `.codemarker-pdf-selection-preview` elements in DOM (DevTools)

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "chore: verificacao final — PDF selection preview cleanup"
```
