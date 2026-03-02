# CodeMarker v2 — Development Journey

## Origin

CodeMarker v2 is a rewrite of the `mqda` plugin (qualitative text coding for Obsidian). The original used Obsidian's legacy editor API with HTML spans. This version was rebuilt from scratch on CodeMirror 6 (CM6) decorations, state fields, and view plugins.

The core engine (markers, highlights, handles, drag-resize, persistence) was implemented successfully. The **floating menu** became the central challenge — and the problem that had blocked progress in the past.

---

## The Menu Problem

The mqda original had a custom floating menu built with Obsidian's native `Menu` class, injecting `TextComponent` and `ToggleComponent` into menu items via `(item as any).dom`. This gave native look-and-feel with theme support.

The challenge in v2: CM6 manages its own selection state. When an Obsidian `Menu` opens, it steals focus from the editor, and CM6 drops the selection highlight. The user can't see what text they're coding.

### Three approaches were tried:

---

### Approach A — Obsidian Native Menu + Selection Preview

**File:** `src/menu/obsidianMenu.ts`

Uses Obsidian's `Menu` API with `TextComponent` and `ToggleComponent` injected into menu items (same pattern as mqda). Before opening, dispatches a `setSelectionPreviewEffect` that creates a `Decoration.mark` mimicking the native selection highlight.

**Result:** Selection stays visible via the decoration workaround. But the menu renders as Obsidian's standard context menu — functional but visually plain. The native components (TextComponent, ToggleComponent) are there, but the menu frame is Obsidian's default.

**Status:** Working. Kept as fallback option.

---

### Approach B — CM6 Tooltip (HTML)

**File:** `src/menu/cm6TooltipMenu.ts`

Builds a menu entirely from HTML elements (`<input>`, SVG icons, `<div>` items) rendered inside a CM6 `Tooltip`. Since the tooltip lives within CM6's DOM tree, the editor never loses focus, so the selection should stay active natively.

**Result:** Clean HTML menu, but selection highlight disappears when the input inside the tooltip receives focus. Also incomplete — was missing 3 of the 4 action buttons. Uses SVG circle icons instead of native toggle switches.

**Status:** Working but incomplete. Kept as-is for potential future use.

---

### Approach C — CM6 Tooltip + Native Obsidian Components (Winner)

**File:** `src/menu/cm6NativeTooltipMenu.ts`

Combines both approaches:
- **CM6 Tooltip** for the container (positioned at selection, inside editor DOM)
- **Obsidian TextComponent & ToggleComponent** for native look-and-feel
- **Selection Preview decoration** (same workaround as Approach A)
- **Theme color injection** — reads computed CSS variables from `document.body` and applies them as inline styles + custom properties on the tooltip container

**Result:** Full mqda design with native components, theme-aware (dark/light), selection stays highlighted, all action buttons present.

**Status:** Active. This is the recommended approach.

---

## The Dark Mode Breakthrough

The critical discovery was that **CSS variables don't cascade into CM6 tooltips**. The tooltip DOM lives inside `.cm-tooltip` which is part of CM6's rendering tree, disconnected from Obsidian's theme variable scope.

**Failed attempts:**
1. `color-scheme: inherit` on the container — no effect
2. `.theme-dark` / `.theme-light` CSS selectors targeting the tooltip — variables still not available
3. `!important` on CSS variable references — variables resolve to empty

**Solution:** Read computed values directly from `document.body` at tooltip creation time:

```typescript
function applyThemeColors(container: HTMLElement) {
    const s = getComputedStyle(document.body);
    // Apply inline styles for the container itself
    container.style.backgroundColor = s.getPropertyValue('--background-secondary').trim();
    // Copy CSS variables onto the container so children (ToggleComponent etc.) find them
    for (const v of vars) {
        container.style.setProperty(v, s.getPropertyValue(v).trim());
    }
}
```

This works because:
- `getComputedStyle(document.body)` always has the resolved theme values
- Setting them as custom properties on the container makes them available to all children
- Obsidian's `ToggleComponent` uses `--toggle-*` variables internally — copying these onto the container makes the toggle render correctly in both themes

---

## Architecture

```
src/
├── main.ts                          # Plugin entry, registers extensions & triggers
├── cm6/
│   ├── markerStateField.ts          # Decorations for markers + selection preview
│   ├── markerViewPlugin.ts          # Handle widgets, drag-resize, selection events
│   ├── selectionMenuField.ts        # Tooltip StateField + preview cleanup listener
│   ├── handleWidget.ts              # SVG handle widget class (ResizeObserver + MutationObserver)
│   ├── hoverMenuExtension.ts        # Hover-over-marker detection + timed menu open/close
│   ├── marginPanelExtension.ts      # MAXQDA-style colored bars in margin (539 LOC)
│   └── utils/
│       ├── viewLookupUtils.ts       # getViewForFile(), findFileIdForEditorView()
│       └── markerPositionUtils.ts   # findSmallestMarkerAtPos() (smart layering)
├── menu/
│   ├── menuController.ts            # Routes to Approach A/B/C based on settings
│   ├── obsidianMenu.ts              # Approach A: Obsidian Menu
│   ├── cm6TooltipMenu.ts            # Approach B: CM6 Tooltip (HTML)
│   ├── cm6NativeTooltipMenu.ts      # Approach C: CM6 Tooltip + Native Components
│   ├── codeFormModal.ts             # Modal for creating new codes (name + color + description)
│   ├── menuActions.ts               # Shared actions (add/remove codes)
│   └── menuTypes.ts                 # Interfaces (SelectionSnapshot, CodeItem, etc.)
├── models/
│   ├── codeMarkerModel.ts           # Data layer: markers, codes, persistence
│   ├── codeDefinitionRegistry.ts    # Per-code identity, color palette, auto-migration
│   └── settings.ts                  # Settings interface & defaults
└── views/
    ├── codeExplorerView.ts         # Code Explorer tree — 3-level collapsible (ItemView)
    ├── codeDetailView.ts           # Code Detail — list/code-detail/marker-detail modes (ItemView)
    └── settingsTab.ts               # Settings UI
```

### Menu Flow (Approach C)

```
1. User selects text → markerViewPlugin dispatches SELECTION_EVENT
2. main.ts listener → menuController.openMenu()
3. menuController dispatches setSelectionPreviewEffect + showCodingMenuEffect (batched)
4. selectionMenuField StateField creates Tooltip → calls buildNativeTooltipMenuDOM()
5. Builder reads theme from document.body, injects CSS vars, creates components
6. On close: clears preview + tooltip effects (batched)
7. On recreate (Enter in input): close → setTimeout → re-dispatch both effects
8. On auto-close (selection empty): previewCleanup listener detects transition → clears preview
```

### Hover Flow

```
1. Mouse enters marker highlight → hoverMenuExtension starts 350ms timer
2. Timer fires → verifies mouse still over same marker → dispatches showCodingMenuEffect
3. Tooltip opens with snapshot containing hoverMarkerId (hover mode)
4. Mouse leaves → 200ms close timer (cancelled if mouse enters tooltip)
5. Custom events (codemarker-tooltip-mouseenter/leave) bridge tooltip ↔ extension
6. Handle click → immediate close (prevents drag conflict)
```

### Settings: `menuMode`

| Value | Approach | Description |
|-------|----------|-------------|
| `obsidian-native` | A | Obsidian Menu + preview decoration |
| `cm6-tooltip` | B | CM6 Tooltip with HTML elements |
| `cm6-native-tooltip` | C | CM6 Tooltip + native Obsidian components |

---

## Key Lessons

1. **CM6 tooltips are isolated from Obsidian's CSS scope.** Don't rely on CSS variable inheritance. Copy computed values explicitly.

2. **Don't dispatch CM6 effects inside `Tooltip.create()`.** The `create()` callback runs during a view update — dispatching there causes recursive updates and breaks the editor. Dispatch before (in the controller) or after (via `requestAnimationFrame`).

3. **Batch related effects in a single `dispatch()`.** Selection preview and tooltip open/close should happen in the same transaction to avoid intermediate states.

4. **Obsidian's `TextComponent` and `ToggleComponent` are just DOM elements.** They can be created inside any container — CM6 tooltip, modal, sidebar, whatever. The `(item as any).dom` pattern from mqda works everywhere.

5. **Selection preview is needed even inside CM6 tooltips** if any child element (like TextComponent's input) receives focus. CM6 drops the visual selection when focus moves to an input, even if it's inside the editor DOM.

6. **MutationObserver for layout shifts.** Some DOM changes (inline title toggle, theme switches) don't trigger CM6's resize/viewport events. `handleWidget.ts` and `marginPanelExtension.ts` use MutationObserver on `.cm-editor` to catch these.

7. **Deferred deletion keeps hover menus coherent.** When toggling all codes off, `keepIfEmpty` flag prevents immediate marker deletion. The menu stays functional. Cleanup happens on close.

---

## Feb 2026 — Hover Menu (v0)

### Problem

No way to view or edit codes on existing markers. Users had to remember what codes were applied.

### Solution

`hoverMenuExtension.ts` — a ViewPlugin that detects mouse hover over marker decorations and opens the same Approach C tooltip menu.

**Key design decisions:**
- Reuse existing menu (not a separate tooltip) — UX consistency
- 350ms open delay (avoid accidental activation), 200ms close delay (avoid flickering)
- `hoverMarkerId` field on `SelectionSnapshot` distinguishes hover mode from selection mode
- Custom events bridge tooltip DOM ↔ extension for mouse tracking
- Selection menu takes priority over hover menu when text is selected

**Known v0 bugs:** Handle drag while hover menu is open leaves menu visible + selection preview lingering.

---

## Feb 2026 — CodeDefinition Registry (Fase 1)

### Problem

Codes were bare strings with no persistent identity. Colors lived on markers, not codes. No way to list all codes, assign consistent colors, or build a Code Explorer.

### Solution

`codeDefinitionRegistry.ts` — a registry that gives each code a persistent identity:
- 12-color auto-palette with categorical distinctiveness
- `create()`, `update()`, `delete()`, `getByName()`, `getAll()`
- Auto-migration: on first load, extracts codes from existing markers into the registry
- `consumeNextPaletteColor()` assigns colors sequentially

**Impact:** Foundation for all downstream features (Code Explorer, Leaf View, per-code decorations).

---

## Feb 2026 — Margin Panel (MAXQDA-style)

### Problem

No visual overview of which codes are applied where. Users had to hover each marker individually.

### Solution

`marginPanelExtension.ts` (539 LOC) — renders colored bars in the left margin, one per code per marker:

**Layout algorithm:**
1. **Column allocation by span:** Larger bars (covering more text) get rightmost columns (closest to text). This prevents wide bars from overlapping narrow ones.
2. **Label positioning:** Labels centered on bars with weighted collision avoidance. Larger bars have higher weight, so they keep their label centered while smaller bars shift.
3. **Dynamic sizing:** Measures actual text width for label space allocation.

**Technical details:**
- Detects natural left margin from RLL (Readable Line Length) plugin
- ResizeObserver for viewport changes + MutationObserver for DOM mutations
- Bidirectional hover via `setHoverEffect` (panel <-> editor text)
- `detectElementType()` differentiates bar/label/dot/tick for underline behavior
- `applyHoverClasses()` at end of `renderBrackets()` to survive DOM rebuilds
- `requestAnimationFrame` for smooth scroll tracking

---

## Feb 2026 — Margin Panel Bidirectional Hover

### Problem

Margin panel labels had no interactive hover feedback. Underline CSS existed but never appeared due to a race condition: `applyHoverClasses()` would add the class, then `setHoverEffect` dispatch would trigger decoration rebuild, MutationObserver would fire, `renderBrackets()` would wipe DOM via `innerHTML = ''`, and hover classes were lost.

### Solution

1. **Race condition fix:** Call `applyHoverClasses()` at the end of `renderBrackets()` so hover state survives DOM rebuilds.

2. **Element type detection:** `detectElementType()` identifies bar/label/dot/tick, enabling differentiated hover:
   - Bar/dot/tick hover → all labels of that marker get underline
   - Label hover → only that specific label gets underline

3. **Bidirectional integration:** Panel dispatches `setHoverEffect` (reuses existing markerStateField effect) for handles to appear/disappear. Text-side hover updates panel classes via same effect in `update()`.

4. **Clean mouse out:** When mouse leaves any element (including to empty panel area), `setHoverEffect(null)` is dispatched — both underlines and handles clear consistently.

**Files changed:** `src/cm6/marginPanelExtension.ts`, `styles.css`

---

## Feb 2026 — Utils Refactoring

Shared utility functions extracted to reduce duplication across 4 files:

- `src/cm6/utils/viewLookupUtils.ts` — `getViewForFile()`, `findFileIdForEditorView()`
- `src/cm6/utils/markerPositionUtils.ts` — `findSmallestMarkerAtPos()` with smart layering rules

---

## Feb 2026 — Selection Preview During Modal + Menu Simplification

### Problem: Modal kills selection preview

When "Add New Code" opens the `CodeFormModal`, the modal steals focus and the selection preview disappears. The user can't see what text they're about to code.

### Solution: Reuse `setSelectionPreviewEffect`

The same decoration mechanism used by the tooltip now also works for the modal:

1. **Before opening modal:** dispatch `setSelectionPreviewEffect.of({ from, to })`
2. **On modal close (save or cancel):** reopen the tooltip menu via `onDismiss` callback

`CodeFormModal` gained an `onDismiss` callback that fires on every close. Callers use it to transition back to the tooltip — the modal becomes a "parenthesis" in the flow.

**Files changed:**
- `src/menu/codeFormModal.ts` — `onDismiss` callback parameter
- `src/main.ts` — command trigger: preview + `menuController.openMenu` on dismiss
- `src/menu/cm6NativeTooltipMenu.ts` — "Add New Code" button: preview + `onRecreate` on dismiss

### Menu action buttons simplified

"Remove Code" and "Remove All Codes" were merged into a single **"Remove Codes"** button (trash icon, `removeAllCodesAction` behavior). They were functionally identical — both removed all codes from the target marker.

Result: 3 action buttons (was 4):
1. Add New Code (`plus-circle`)
2. Add Existing Code (`tag`)
3. Remove Codes (`trash`)

---

## Feb 2026 — Code Detail Side Panel (Fase 2, passo 1)

### Problem

No way to see detailed information about a coded segment. Users had to hover each marker and mentally track which codes were applied. Clicking a margin panel label just showed a `Notice`.

### Solution

`src/views/codeDetailView.ts` — an `ItemView` in the right sidebar that shows:
- **Header:** color swatch + code name
- **Description:** from CodeDefinition (if present)
- **Text Segment:** marker text in a blockquote
- **Other Codes:** clickable chips for other codes on the same marker → updates panel in-place
- **Other Markers:** clickable list of other markers with the same code → updates panel + scrolls editor

**Integration:**
- `main.ts` registers view (`CODE_DETAIL_VIEW_TYPE`) + `revealCodeDetailPanel()` method
- `marginPanelExtension.ts` click handler calls `model.plugin.revealCodeDetailPanel(markerId, codeName)`
- Zero custom events, zero global state — everything flows through `model`

### Bug: Stacked label clicks failing

**Symptom:** When a marker has multiple codes (stacked labels), the first label click works, but clicking other labels of the same marker fails. Clicking a label from a *different* marker resets the issue.

**Root cause:** MutationObserver render loop.
1. First click triggers `revealLeaf()` → focus moves to sidebar → CM6 removes `cm-focused` class from `.cm-editor`
2. MutationObserver detects class change after `suppressMutationUntil` (150ms) expires
3. `renderBrackets()` runs → `innerHTML = ''` → DOM destroyed → MutationObserver fires again → infinite loop (1 rebuild/frame)
4. Same-markerId labels don't trigger hover dispatch (markerId unchanged) → `suppressMutationUntil` never refreshed → loop continues
5. Click fires mid-rebuild → `target.closest('[data-marker-id]')` returns null → click silently fails

**Confirmed via console.log:** `[CM-click] hit: false markerId: undefined codeName: undefined` on failing clicks.

**Fix (3 layers):**
1. `renderBrackets()` — suppress self-triggered mutations: `this.suppressMutationUntil = Date.now() + 50` at start (breaks render loop)
2. `panelClickHandler` — fallback to hover state (`hoveredMarkerId`/`hoveredCodeName`) when `target.closest` returns null
3. `revealCodeDetailPanel` — removed `revealLeaf(existing)` for existing leaves (prevents focus stealing, eliminates trigger)

**Files changed:** `src/main.ts`, `src/cm6/marginPanelExtension.ts`, `src/views/codeDetailView.ts`, `styles.css`

---

## Feb 2026 — Code Explorer (Fase 2, passo 2)

### Problem

No overview of all codes across the vault. Users had to open each file and hover markers to see what codes were applied.

### Solution

`src/views/codeExplorerView.ts` — an `ItemView` rendering a 3-level tree:
- **Level 1 (codeNodes):** Code name + color swatch + total marker count
- **Level 2 (fileNodes):** File name + marker count for that code in that file
- **Level 3:** Text preview of each segment, clickable → scrolls editor to marker position

**Toolbar:** 3 buttons:
1. **All** (`chevrons-down-up` / `chevrons-up-down`) — expand/collapse all code groups (level 1 only)
2. **Files** (`list-chevrons-down-up` / `list-chevrons-up-down`) — expand/collapse file groups (level 2 only, auto-expands codes if collapsed for visibility)
3. **Refresh** (`refresh-cw`) — re-render from model

**Key design: independent collapse levels.**
4 pure methods (`expandAll`, `collapseAll`, `expandFiles`, `collapseFiles`) each operate on one level only. The Files button handler checks `isAllCollapsed()` before acting and expands codes when needed, keeping the UX coherent without coupling the methods.

**Data flow:** `buildCodeIndex()` → `Map<codeName, Map<fileId, Marker[]>>` from model. Navigation via `EditorView.scrollIntoView()` + `setCursor()`.

**Files:** `src/views/codeExplorerView.ts`, `src/main.ts` (registration)

---

## Feb 2026 — Code Detail View: Integrated List + Detail Navigation (Fase 2, passo 3)

### Problem

The `CodeDetailView` only worked in marker-focused mode (reached via margin panel click). There was no "home" showing all codes at a glance, and no way to navigate from a code to all its segments across files.

### Solution

Extended `CodeDetailView` with 3 navigation modes in the same `ItemView`:

1. **List mode** (`showList()` / `renderList()`) — flat list of all codes with color swatch, description snippet, and segment count. Default when opened via "Open Code Explorer" command.
2. **Code-focused detail** (`showCodeDetail(codeName)` / `renderCodeDetail()`) — shows all markers for a code across all files, with file reference and text preview. Reached by clicking a code in the list.
3. **Marker-focused detail** (`setContext(markerId, codeName)` / `render()`) — existing behavior, unchanged. Reached via margin panel label click.

Both detail modes have a **back button** ("← All Codes") that returns to the list.

**Model addition:** `getAllMarkers()` on `CodeMarkerModel` — iterates all files and returns flat array of markers. Used for cross-file segment counting and code-focused detail.

**Navigation flow:**
```
Command → List (all codes) → click code → Code Detail (all segments) → back → List
Margin panel click → Marker Detail (specific marker) → back → List
```

**main.ts changes:**
- `revealCodeExplorer()` opens `CodeDetailView` in list mode (creates or reuses leaf)
- `revealCodeDetailPanel()` unchanged — opens in marker-focused mode

**Files:** `src/views/codeDetailView.ts`, `src/models/codeMarkerModel.ts`, `src/main.ts`, `styles.css`
