# CM6 Markdown Bugs Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 CM6 bugs (C1 z-index stacking, C2 scrollDOM position race, C3 ch clamp) and mark C6 as won't-fix.

**Architecture:** C2 is a 1-line fix (save/restore scrollDOM position). C3 extracts clamping from marginPanelExtension into markerPositionUtils (shared). C1 normalizes z-index scale across handleOverlayRenderer.ts + styles.css (overlay 1000, individual handles relative, popover 2000). C6 stays as-is — refactoring without bug fix doesn't justify the risk.

**Tech Stack:** TypeScript strict, CodeMirror 6, Vitest + jsdom, Obsidian API

---

## Chunk 1: C2 + C3 (Logic Fixes)

### Task 1: Fix scrollDOM position race condition (C2)

**Problem:** `handleOverlayRenderer.ts` saves/restores `scrollDOM.style.position` in constructor/destroy. `marginPanelExtension.ts` sets it to `relative` but never restores. If handleOverlay is destroyed first, marginPanel loses its positioning context.

**Fix:** Use a ref-counting approach — both extensions need `position: relative`, neither should restore it unless both are gone. Simplest: marginPanelExtension saves and restores its own copy.

**Files:**
- Modify: `src/markdown/cm6/marginPanelExtension.ts:33-41,533-545`

- [ ] **Step 1: Save original position in marginPanelExtension constructor**

In `src/markdown/cm6/marginPanelExtension.ts`, add a field to save the original position and restore in destroy:

```typescript
// Line 33, inside constructor — add before line 40:
// Save before any field declarations that use `this`
```

After line 37 (`this.panel.className = ...`), add:
```typescript
this._origScrollPosition = scroller.style.position;
```

Add the field declaration. In the class body (before or after other fields), add:
```typescript
private _origScrollPosition = '';
```

- [ ] **Step 2: Restore position in destroy()**

In `destroy()` (line 533), after `this.panel.remove()` (line 544), add:
```typescript
this.view.scrollDOM.style.position = this._origScrollPosition;
```

- [ ] **Step 3: Run full tests**

Run: `npm run test && npx tsc --noEmit`
Expected: All PASS, 0 tsc errors

- [ ] **Step 4: Commit**

```bash
git add src/markdown/cm6/marginPanelExtension.ts
~/.claude/scripts/commit.sh "fix: marginPanelExtension salva/restaura scrollDOM position (C2)"
```

---

### Task 2: Add ch clamp to markerPositionUtils (C3)

**Problem:** `markerPositionUtils.ts:95-96` adds `marker.range.from.ch` to line start without checking if ch exceeds line length. The offset bleeds into the next line. `marginPanelExtension.ts:290-295` already has this clamp but only for rendering — hover/drag use the unclamped version.

**Fix:** Add clamping in markerPositionUtils after computing offsets.

**Files:**
- Modify: `src/markdown/cm6/utils/markerPositionUtils.ts:94-96`
- Modify: `tests/markdown/markerPositionUtils.test.ts` (if exists, otherwise create)

- [ ] **Step 1: Check for existing tests**

Run: `ls tests/markdown/markerPositionUtils.test.ts 2>/dev/null || echo "no test"`

- [ ] **Step 2: Add clamp after offset computation**

In `src/markdown/cm6/utils/markerPositionUtils.ts`, replace lines 94-96:

```typescript
// Before:
try {
    startOffset = view.state.doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
    endOffset = view.state.doc.line(marker.range.to.line + 1).from + marker.range.to.ch;
}

// After:
try {
    const fromLine = view.state.doc.line(marker.range.from.line + 1);
    const toLine = view.state.doc.line(marker.range.to.line + 1);
    startOffset = fromLine.from + Math.min(marker.range.from.ch, fromLine.to - fromLine.from);
    endOffset = toLine.from + Math.min(marker.range.to.ch, toLine.to - toLine.from);
}
```

This clamps `ch` to the actual line length, preventing offset bleed into the next line.

- [ ] **Step 3: Run full tests**

Run: `npm run test && npx tsc --noEmit`
Expected: All PASS, 0 tsc errors

- [ ] **Step 4: Commit**

```bash
git add src/markdown/cm6/utils/markerPositionUtils.ts
~/.claude/scripts/commit.sh "fix: clamp ch ao tamanho da linha em markerPositionUtils (C3)"
```

---

## Chunk 2: C1 (Z-Index Scale)

### Task 3: Normalize z-index scale

**Problem:** Handle overlay is at z-index 10000, individual handles at 10000+index. Popover is at 9999. Handles render ON TOP of popover, blocking interaction.

**Proposed scale (from BACKLOG.md):**

| Layer | z-index | Element |
|-------|---------|---------|
| Content | auto | .cm-content, .cm-layer |
| Margin panel | 1 | .codemarker-margin-panel |
| Resize handle (future) | 100 | Right border |
| Drag handles overlay | 1000 | .codemarker-handle-overlay |
| Popover | 2000 | .codemarker-popover |

**Files:**
- Modify: `src/markdown/cm6/handleOverlayRenderer.ts:37,217,228,246`
- Modify: `styles.css:1382,1437`

- [ ] **Step 1: Update overlay z-index in handleOverlayRenderer.ts**

In `src/markdown/cm6/handleOverlayRenderer.ts`:

Line 37 — overlay container:
```typescript
// Before:
this.overlayEl.style.zIndex = '10000';
// After:
this.overlayEl.style.zIndex = '1000';
```

Line 217 — updateHandlePosition:
```typescript
// Before:
svg.style.zIndex = (10000 + h.index).toString();
// After:
svg.style.zIndex = (1000 + h.index).toString();
```

Line 228 — createHandleSVG:
```typescript
// Before:
const zIndex = 10000 + index;
// After:
const zIndex = 1000 + index;
```

Line 246 (the other place zIndex is assigned in createHandleSVG):
```typescript
// Before:
svg.style.zIndex = zIndex.toString();
// After: (already uses the `zIndex` variable from line 228, no change needed)
```

- [ ] **Step 2: Update popover z-index in styles.css**

In `styles.css`:

Line 1382:
```css
/* Before: */
z-index: 9999;
/* After: */
z-index: 2000;
```

Line 1437 (swatch tooltip):
```css
/* Before: */
z-index: 9999;
/* After: */
z-index: 2000;
```

- [ ] **Step 3: Verify margin panel z-index is already correct**

Check: `styles.css:1090` should already be `z-index: 1` — confirmed in investigation.

- [ ] **Step 4: Run full tests**

Run: `npm run test && npx tsc --noEmit`
Expected: All PASS, 0 tsc errors

- [ ] **Step 5: Commit**

```bash
git add src/markdown/cm6/handleOverlayRenderer.ts styles.css
~/.claude/scripts/commit.sh "fix: normaliza z-index scale — handles 1000, popover 2000 (C1)"
```

---

### Task 4: Update backlog + build + demo

- [ ] **Step 1: Mark C1, C2, C3 as done in BACKLOG.md. Mark C6 as won't-fix (refactoring only, layout already extracted)**

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
~/.claude/scripts/commit.sh "chore: marca C1-C3 feitos, C6 wont-fix, atualiza demo vault"
```
