# Qualia Coding — Design Principles

> For the theoretical foundations and design journey behind these principles, see [DESIGN-STORY.md](DESIGN-STORY.md).

> Reverse-engineered from ~28K LOC across 7 engines. Every principle here is documented because it already EXISTS in the codebase — not aspirational. Evidence traces to specific files and patterns.
>
> **Audiences**: Community plugin review (UX quality), README/marketing (differentiator narrative), methods paper (design grounded in theory), contributors (visual coherence guide).

---

## 1. Design Values

The foundational motivations that precede any code. These answer "why does this tool exist?" and "what kind of tool is it?"

### 1.1 A Personal QDA Tool That Doesn't Exist Yet

No tool combines: (a) qualitative data analysis across 6 formats, (b) living inside a researcher's personal knowledge base, (c) without modifying the researcher's files, (d) with professional-grade visual coding (margin bars, bidirectional hover, cross-format analysis). ATLAS.ti and MAXQDA are standalone databases. Obsidian plugins like Highlighter and Comments are single-format. Qualia Coding fills the gap: **MAXQDA-level coding inside your Obsidian vault**.

The 7-engine architecture isn't over-engineering — it's the minimum viable scope for a tool that can actually replace a standalone QDA application for a solo researcher or small team.

### 1.1b Mixed-Methods Analysis as Architectural Driver

The decision to support 6 coding formats (text, PDF, CSV, image, audio, video) plus cross-format analytics wasn't feature creep — it was driven by **mixed-methods research methodology**. Real qualitative studies involve interview transcripts (markdown), published papers (PDF), survey data (CSV), fieldwork photos (image), interview recordings (audio), observation footage (video). A tool that only codes one format forces the researcher to switch between applications and manually reconcile findings.

The unified `CodeDefinitionRegistry` (one code system across all formats) and the Analytics engine (20 ViewModes + Research Board that consolidate markers from all 6 sources) exist precisely because mixed-methods analysis requires **cross-format pattern discovery**. The co-occurrence matrix, document-code matrix, and source-comparison views are only meaningful when they can see all data simultaneously.

**Code evidence:**
- `ConsolidatedData` / `UnifiedMarker[]` in Analytics — a single data structure that merges markers from all 6 engines (`analytics/index.ts`)
- `UnifiedModelAdapter` merges 6 `SidebarModelInterface` implementations → Code Explorer shows markdown, PDF, image, CSV, audio, and video markers in one tree
- Navigation events (`qualia-csv:navigate`, `qualia-image:navigate`, etc.) allow Analytics to send the researcher to the source data in any format from any visualization

### 1.2 Notes Stay 100% Clean

> "O vault é um vault de notas, não um banco de dados." — ARCHITECTURE.md §1

All annotations live in `data.json`. Markdown files are never modified. CM6 decorations handle visualization; the underlying `.md` content is untouched.

**Code evidence:**
- `codeMarkerModel.ts` stores markers in `Map<fileId, Marker[]>` → serialized to `data.json`, never writes to `.md` files
- All 6 engines persist via `plugin.dataManager.section("engine")` / `setSection("engine", data)` — a single `data.json` file managed by `DataManager`
- CM6 decorations (`Decoration.mark`) render highlights without altering the document text (`markerStateField.ts`)

**Why it matters:** A researcher's vault is their long-term knowledge base. Polluting files with annotation metadata would create lock-in and conflict with other tools. The clean-notes principle ensures Qualia Coding is additive — uninstalling it leaves the vault exactly as it was.

### 1.3 Coding as Thinking

QDA coding is an interpretive act — the researcher is making meaning, not tagging data. The UX should support the flow of interpretation: read → notice → code → reflect → re-code. Every interaction that interrupts this flow (a modal that steals focus, a sidebar that jumps unexpectedly, a menu that requires 3 clicks) is a design failure.

**Code evidence:**
- Two-mode menu: selection mode (new thinking) shows all codes + recent; hover mode (revisiting) shows only inactive suggestions — the menu adapts to the researcher's cognitive state (`codingPopover.ts:186-250`)
- Hover popover opens after 350ms, closes after 200ms grace period — fast enough to not interrupt, slow enough to not flicker (`hoverMenuExtension.ts:9-10`)
- Selection preview maintains visual context when focus moves to the coding menu — the researcher never loses sight of what they selected (`setSelectionPreviewEffect` in `markerStateField.ts`)

### 1.4 Global Workspace First, Projects Later

> "O usuário codifica primeiro, organiza em projetos depois. Análogo à filosofia Obsidian: loose notes first, folders later." — ARCHITECTURE.md §1

The system starts with a single global workspace. All codes and markers exist without requiring project setup. This mirrors Obsidian's own philosophy and reduces onboarding friction — the researcher starts coding immediately, organizes later.

**Code evidence:**
- `CodeDefinitionRegistry` is a single shared instance across all 7 engines — one code system, many formats (`codeDefinitionRegistry.ts`)
- `QualiaData` has a flat `registry` at the top level, with engine-specific sections beneath — codes are global by default (`types.ts`)
- Projects/Workspace data model (ARCHITECTURE.md §10) defines `activeProject: string | null` where `null` = global mode

### 1.5 Data Transformation as Design Principle

The analytics engine was not designed as a dashboard feature — it was informed by mixed analysis theory, specifically the continuum between quantitization (qualitative → quantitative) and qualitization (quantitative → qualitative). Each of the 20 ViewModes operationalizes a specific level of the DIME model (Descriptive, Inferential, Measurement, Exploratory) as defined by Onwuegbuzie (2025), plus a Relations Network view for direct visualization of code relationships.

The guiding insight: qualitative data analysis and quantitative data analysis are not separate activities but movements on a continuous spectrum. Crossover mixed analysis — applying analytical techniques from one tradition to data from another — is what makes the analytics engine more than a chart generator. The co-occurrence matrix quantitizes qualitative codes; the Research Board qualitizes quantitative patterns back into interpretive space.

For the full theoretical context, see [DESIGN-STORY.md §3: Data Transformation as the Heart of Design](DESIGN-STORY.md#3-data-transformation-as-the-heart-of-design).

---

## 2. Core Principles

How the design values translate into concrete interaction and engineering decisions. Each principle has observable evidence in the codebase.

### 2.1 Respect Researcher Focus

**Never steal attention. The researcher decides where to look.**

| Pattern | Evidence | Impact |
|---------|----------|--------|
| Never auto-reveal on updates | `revealLeaf()` only in explicit user actions; CLAUDE.md "regla inviolável" | No focus-stealing during analysis |
| Auto-focus disabled in hover mode | `codingPopover.ts:291-294` — `shouldFocus = options.autoFocus ?? !isHoverMode` | Hovering a marker doesn't grab keyboard |
| Custom events, not forced navigation | `qualia-image:navigate`, `qualia-audio:navigate` etc. — sidebar sends events, engines decide how to respond | Content views control their own scroll/focus |
| Selection preview preserves context | `setSelectionPreviewEffect` creates temporary decoration simulating the selection when focus moves to tooltip | Researcher sees what they selected even after focus shifts |

**Historical lesson:** The "Stacked Label Click Bug" was caused by `revealLeaf()` stealing focus → CM6 removing `cm-focused` → MutationObserver triggering a render loop. The 3-layer fix (self-suppression + hover fallback + remove revealLeaf on existing leaves) established this as an inviolable rule.

### 2.2 Visual Information Density

**See coding density at a glance without scrolling.**

| Pattern | Evidence | Impact |
|---------|----------|--------|
| MAXQDA-style margin bars | `marginPanelExtension.ts` (548 LOC) — column allocation, label collision avoidance | Coding density visible in peripheral vision |
| Column ∝ overlap count | `assignColumns()`: more overlapping markers → more columns → wider panel | Panel width encodes complexity |
| Larger bars → inner columns | Sort by span descending; largest bars closest to text (`marginPanelLayout.ts:51`) | Most important context stays near content |
| Vertical audio lanes | `regionRenderer.ts:178-215` — greedy lane assignment, CSS `top/height` as percentages | Overlapping temporal markers stack visually |
| Minimap markers | Audio/video minimap with positional divs: `left = (from/duration)*100%` (min 0.3%) | Entire file's coding visible at once |
| Per-code opacity blending | N decorations with `opacity/N` — both markdown (`markerStateField.ts`) and PDF (`highlightRenderer.ts:148-182`) | Multiple codes visible without "color soup" |

**Design reference:** ARCHITECTURE.md §3.2 documents the combinatorial analysis of 4 visual approaches (color, bars, chips, tooltip) and their scalability to 20+ codes. The chosen combination (A+B: margin bars + per-code decorations) scored highest on visual clarity × scalability.

### 2.3 Explicit Over Implicit

**If it works, it works because we made it work — not because we got lucky with CSS cascade.**

| Pattern | Evidence | Impact |
|---------|----------|--------|
| `applyThemeColors()` copies CSS vars inline | `baseCodingMenu.ts:340-366` — reads 20+ CSS variables from `document.body` computed style, sets as inline properties | Works in every theme, light and dark |
| WaveSurfer colors read explicitly | `waveformRenderer.ts:207-238` — `readThemeColors()` extracts hex values for non-DOM canvas | Audio waveforms match theme without cascade |
| Feature detection over version checks | `getTextLayerInfo()` for PDF.js text layer compat (`TECHNICAL-PATTERNS.md §7.1`) | Survives Obsidian updates that change PDF.js version |
| Phantom marker prevention | `findExistingMarker()` (read-only) vs `findOrCreateMarker()` (creates on demand) — all 6 engines | No empty markers from cancelled operations |

**Historical lesson:** The "Dark Mode Breakthrough" was discovering that CSS variables don't cascade into CM6 tooltips (isolated DOM). Three approaches failed before `getComputedStyle(document.body)` → inline styles solved it permanently. This lesson generalized into the principle: never rely on cascade for contexts outside the main DOM tree.

### 2.4 Unified but Modular

**One sidebar for 7 engines. Consistent UX. Engine-specific internals.**

| Pattern | Evidence | Impact |
|---------|----------|--------|
| `SidebarModelInterface` (17 methods) | `types.ts:16-48` — every engine implements the same contract | Single sidebar code serves all formats |
| `UnifiedModelAdapter` merges N models | `unifiedModelAdapter.ts:12-127` — delegates writes to owning engine, broadcasts changes | One Explorer + one Detail view for everything |
| Type guards for polymorphism | `isPdfMarker()`, `isImageMarker()`, `isCsvMarker()`, `isAudioMarker()`, `isVideoMarker()` in `markerResolvers.ts` | Engine-specific rendering without `switch` cascades |
| `CodingPopoverAdapter` interface (8 methods) | `codingPopover.ts:39-58` — `registry`, `getActiveCodes()`, `addCode()`, `removeCode()`, `getMemo()`, `setMemo()`, `save()`, `onRefresh()` | One menu implementation for all 5 coding engines |
| Engine registration pattern | Each engine exports `registerXxxEngine() → EngineCleanup`; `main.ts` orchestrates (~85 LOC) | Adding an engine = implementing interfaces, not modifying core |
| `drawToolbarFactory` shared across engines | `drawToolbarFactory.ts:32` — `createDrawToolbar(parent, buttons, config)` serves PDF and Image with identical UX | Adding a drawing tool = one factory change, two engines updated |

**The consolidation proof:** 7 separate plugins (each with their own CodeDefinitionRegistry, CodeFormModal, sidebar views, settings tabs) were merged into 1. Deduplication results: 83% reduction in registry code, 80% in form code, 68% in sidebar code, 100% elimination of SharedRegistry file sync.

### 2.5 Graceful State Management

**No orphaned data from cancelled operations. No stale state after edits.**

| Pattern | Evidence | Impact |
|---------|----------|--------|
| Deferred deletion (`keepIfEmpty`) | `menuActions.ts:78-79` — hover mode preserves empty marker; cleanup on menu close (`selectionMenuField.ts:116-121`) | Toggle last code off + cancel = no phantom marker |
| `cleanupEmptyMarker()` | `codeMarkerModel.ts:216-222` — explicit cleanup method called when tooltip transitions open→null | Predictable lifecycle, no GC-dependent cleanup |
| Re-entrant save guard | `DataManager.flush()` — if save active, sets `dirtyAfterSave` flag, re-flushes after completion (`dataManager.ts`) | No data loss from concurrent saves |
| `flushPendingSave()` on unload | Both DataManager (500ms debounce) and markdown model (2s debounce) flush on plugin unload | No data loss on Obsidian close |
| Undo stack with `suppressUndo` | PDF model has 50-entry undo stack; `suppressUndo` flag prevents recording during programmatic operations (`pdfCodingModel.ts`) | Undo works correctly across all operations |
| Memo textarea pause | `offChange()` on focus, `onChange()` on blur — pauses listeners while typing (`TECHNICAL-PATTERNS.md §4.7`) | No re-render while user types memo |
| Listener deduplication in sidebar | `baseSidebarAdapter.ts:40-70` — `Map<() => void, () => void>` prevents duplicate hover/change listener registrations; re-registration replaces wrapper without leak | No heap leaks from re-registering same listener without cleanup |

### 2.6 Smooth Transitions

**UI feels responsive but not twitchy. Every timing value is deliberate.**

| Timer | Value | Where | Why |
|-------|-------|-------|-----|
| Hover open delay | 350ms | `hoverMenuExtension.ts:9` | Prevents accidental hover menus when moving mouse across highlights |
| Hover close grace | 200ms | `hoverMenuExtension.ts:10` | Prevents flicker when moving mouse between highlight and tooltip |
| Sub-span debounce | 30ms | `markerViewPlugin.ts:599` | CM6 splits highlights at formatting boundaries; bridges null gaps |
| PDF hover open | 400ms | `highlightRenderer.ts:31` | Slightly longer for PDF where hover targets are larger |
| PDF hover grace | 300ms | `highlightRenderer.ts:32` | Longer grace for PDF's more complex layout |
| Menu recreation | 50ms | `selectionMenuField.ts` `onRecreate()` | Allows DOM to settle before re-dispatching effects |
| MutationObserver suppression | 50ms | `marginPanelExtension.ts` | Prevents self-triggered mutations from causing rebuild loops |
| Input focus delay | 50ms | `codingPopover.ts:294` | Allows DOM layout to settle before focusing |
| DataManager save debounce | 500ms | `dataManager.ts:129-133` | Prevents write storms during rapid coding |
| Markdown model save debounce | 2000ms | `codeMarkerModel.ts:272-278` | Second-level debounce for position syncs |
| ResizeObserver zoom debounce | 100ms | WaveSurfer views | Prevents zoom calls on partially-loaded audio |
| Board auto-save | 2000ms | `boardSerializer.ts` | Debounces frequent canvas interactions |
| Opacity transition | 150ms ease | `styles.css:433` (PDF highlights) | Smooth hover feedback |
| Brightness transition | 150ms ease | `styles.css:1287` (margin bars) | Smooth hover glow |
| Drag throttle | 16ms | `dragManager.ts:44` | ~60fps cap during handle drag; full render on end |

**Design insight:** Markdown uses shorter delays (350/200ms) than PDF (400/300ms) because markdown highlights are smaller targets with denser interaction. PDF highlights span larger areas where accidental hovers are more likely.

**Domain-specific timing:** The timing differences between engines are not arbitrary — they encode domain knowledge about interaction scale. Markdown's 200ms grace period reflects small, dense highlights where the mouse crosses boundaries frequently. PDF's 300ms grace reflects larger highlight areas where the user's intent is clearer but mouse travel distance is greater. The drag throttle (16ms ≈ 60fps) applies only during active manipulation, switching to full render when the drag ends. These values were tuned through iterative use, not calculated upfront.

### 2.7 Opinionated Defaults

**Workflow choices belong to the user. Visual design belongs to the developer.**

8 settings exposed in `settingTab.ts:29-121`:

| Setting | Section | Type | What it controls |
|---------|---------|------|------------------|
| Default color | Markdown | Color picker | Default highlight color for new markers |
| Marker opacity | Markdown | Slider (0.1–0.5) | Transparency of text highlights |
| Show handles on hover | Markdown | Toggle | Drag handles visibility |
| Show menu on selection | Menus | Toggle | Auto-show coding menu on text select |
| Show in right-click menu | Menus | Toggle | Context menu integration |
| Show ribbon button | Menus | Toggle | Left ribbon "Code Selection" button |
| Auto-open images | Image | Toggle | Intercept image opens |
| Auto-reveal on segment click | Sidebar | Toggle | Navigate on sidebar click |

**Not exposed (by design):**
- All timing constants (350ms, 200ms, 30ms, 400ms, 300ms, 50ms, 500ms, 2000ms)
- Margin panel column width (10px), label height (16px), min/max label space
- Opacity blending formula (0.35 base, 0.55 hover, 0.35/N per-code)
- Z-index layering choreography
- Hover detection strategy (DOM-based vs elementFromPoint)
- Menu layout (two-mode logic, zone separation, suggestion ordering)
- 12-color auto-palette
- Collision avoidance algorithm parameters

**Philosophy:** The 8 exposed settings control "do you want this behavior?" toggles. The hundreds of hardcoded values control "how should this behavior look and feel?" — these are design decisions, not preferences.

### 2.8 Bidirectional Feedback

**Hover in text → sidebar glows. Hover in sidebar → text glows. Always.**

| Direction | Mechanism | Evidence |
|-----------|-----------|----------|
| Content → Sidebar | `model.setHoverState(markerId, codeName)` from view hover handlers | `hoverBridge.ts:62`, `highlightRenderer.ts` (PDF), `regionHighlight.ts` (Image) |
| Sidebar → Content | `model.setHoverState(markerId, codeName)` from sidebar item mouseenter | `baseCodeDetailView.ts:305`, `baseCodeExplorerView.ts:294` |
| Cross-engine | `UnifiedModelAdapter.setHoverState()` delegates to owning model, clears others | `unifiedModelAdapter.ts:84-94` |
| Markdown specifics | `setHoverEffect` shared between `markerViewPlugin` and `marginPanelExtension`; `hoveredIds[]` for multi-marker hover; `isInPartialOverlap` flag prevents redundant dispatches | `markerStateField.ts`, `markerViewPlugin.ts` |

**Visual feedback per engine:**
- **Markdown**: Highlight opacity increases (0.35→0.55); margin bar brightness(1.15) + scale(1.3) on dot
- **PDF**: Highlight opacity 0.35→0.55 + box-shadow; shape fill-opacity 0.15→0.4
- **Image**: Fabric.js stroke width +2 + Shadow blur 12 (glow effect)
- **Audio/Video**: WaveSurfer region opacity increase (0.55→0.85 on minimap; 0.75 on region)
- **Sidebar**: Background color change on tree item

### 2.9 Semantic Layering

**Z-index encodes meaning, not just stacking order.**

```
PDF Layer Stack:
  Text (native)        z: 2    — base content
  Highlights           z: 3    — coded segments (text-based)
  Draw shapes (SVG)    z: 4    — freeform annotations
  Labels/overlay       z: 5    — margin panel labels

Markdown Layer Stack:
  Content (.cm-content)         — base text
  Decorations                   — inline highlights (via CM6 mark)
  Margin panel         z: 1    — MAXQDA-style bars
  Handle overlay       z: 10000 — drag handles (above everything)
  Popover menu         z: 9999  — coding tooltip

Audio/Video:
  Minimap overlay      z: 10   — overview markers
  Regions                      — WaveSurfer region overlays
```

**Principle:** Lower z-index = more permanent/contextual content. Higher z-index = more interactive/transient elements. Interactive overlays (handles, menus) use extreme values to guarantee they float above any content combination.

### 2.10 Discovery Through UI

**Features are discovered through context menus and toolbars, not memorized from documentation.**

| Discovery Path | Evidence | Impact |
|----------------|----------|--------|
| Context menus per file type | `image/index.ts:48-57` — "Open in Image Coding" only appears for image files | User discovers engine on right-click |
| Smart command availability | `image/index.ts:34-45` — `checkCallback` hides command when no image active | Command palette stays uncluttered |
| Ribbon button (optional) | `settingTab.ts:86-93` — toggle for "Code Selection" button | Discoverable but not forced |
| Two-zone hover menu | Selection mode: "here's what you can code with"; hover mode: "here's what's already coded + what you can add" | Menu teaches the coding model |
| PDF drawing keyboard shortcuts | V (select), R (rect), E (ellipse), P (polygon), Del (delete) — standard drawing tool conventions | Familiar to anyone who's used a drawing tool |
| "Browse all codes..." link in popover | After recent suggestions, a link to the full code list via `FuzzySuggestModal` | Progressive disclosure: recent codes first, full list on demand |

### 2.11 Separation of Concerns by Responsibility

**Rendering and state are separate concerns, even within the same feature.**

| Split | Rendering/Layout | State/Logic |
|-------|-----------------|-------------|
| Drag handles | `handleOverlayRenderer.ts` (287 LOC) — SVG creation, positioning via `requestMeasure`, `coordsAtPos` | `dragManager.ts` (108 LOC) — start/move/end lifecycle, 16ms throttled updates |
| Margin panel | `marginPanelExtension.ts` (548 LOC) — DOM rendering, hover integration, MutationObserver | `marginPanelLayout.ts` (129 LOC) — pure `assignColumns()` + `resolveLabels()`, no DOM dependency |

**Design principle:** Full render when NOT dragging, throttled updates DURING dragging. The layout algorithm (`marginPanelLayout.ts`) is reusable geometry — it could theoretically serve any engine needing label layout. Separating pure computation from DOM rendering makes both testable and composable.

---

## 3. Visual Design System

### 3.1 Color Strategy

**Rule: CSS variables are NEVER relied upon to cascade into isolated contexts. Colors are always explicitly injected.**

Contexts that require explicit injection:
- CM6 tooltips (isolated DOM) → `applyThemeColors()` in `baseCodingMenu.ts:340-366`
- WaveSurfer (shadow DOM) → `readThemeColors()` in `waveformRenderer.ts:207-238`
- Fabric.js (non-DOM canvas) → hardcoded RGBA with per-code overrides from registry
- AG Grid popovers → CSS variable passthrough in theme params (`TECHNICAL-PATTERNS.md §3.5`)

**Palette:** 12-color categorical auto-palette with high distinctiveness (not gradient). Sequential assignment via `consumeNextPaletteColor()`. Each color is chosen for visibility in both light and dark themes.

### 3.2 Opacity Blending

| Context | Base | Hover | Blend Mode | Per-Code Formula |
|---------|------|-------|------------|------------------|
| PDF highlights | 0.35 | 0.55 | `mix-blend-mode: multiply` | `0.35 / codeCount` |
| Markdown highlights | settings.markerOpacity (0.1–0.5) | +0.2 | `mix-blend-mode: multiply` | `opacity / N` |
| PDF shapes (SVG) | fill-opacity: 0.15 | 0.4 | — | stroke-opacity: 0.8→1 |
| Margin bars | 0.8 | 1.0 + brightness(1.15) | — | — |
| Margin labels | 0.9 | — | — | — |
| Audio minimap | 0.55 | 0.85 | — | — |
| Audio regions | region opacity setting | 0.75 (`!important`) | — | — |
| CSV tag chips | bg: 0.18, border: 0.35 | — | — | — |

**Per-code blending rationale:** When one marker has N codes, each code's highlight gets `baseOpacity / N`. This prevents the combined opacity from blowing out while keeping all codes visually distinguishable.

### 3.3 CSS Namespacing

| Engine | Prefix | Origin |
|--------|--------|--------|
| Markdown | `codemarker-` | Original v2 plugin |
| PDF | `codemarker-pdf-` | PDF plugin era |
| CSV | `csv-` | CSV plugin era |
| Image | `codemarker-image-` | Image plugin era |
| Media (shared) | `codemarker-media-` | Post-consolidation |
| Audio | `codemarker-audio-` | Audio plugin era |
| Video | `codemarker-video-` | Video plugin era |
| Analytics | `codemarker-analytics-` | Analytics plugin era |

**Rule (D15 from MERGE-PLAN):** NEVER rename to `qc-*`. Zero collisions confirmed between engines. Rename = high risk (regex across 28K LOC + user custom CSS), zero benefit. Backward compatibility > aesthetic consistency.

**Concat order:** `v2 > PDF > CSV > Image > Audio > Video > Analytics` — v2 wins in specificity conflicts.

### 3.4 Margin Panel Layout

**Column allocation** (`marginPanelLayout.ts:51` — `assignColumns()`):
1. Sort bars by vertical span descending (largest first)
2. Greedy column assignment — first column with no vertical overlap
3. Result: largest bars get lowest column index (closest to text)

**Label collision avoidance** (`marginPanelLayout.ts` — `resolveLabels()`):
1. Ideal position = bar midpoint (vertically centered)
2. Process labels by column order (outermost first)
3. Heavier labels (larger bars) keep ideal position
4. Lighter labels displace **downward only** (never up) in LABEL_HEIGHT (16px) steps

**Dynamic width:**
- `COLUMN_WIDTH = 10px` per bar column
- `MIN_LABEL_SPACE = 80px`, `MAX_LABEL_SPACE = 200px`
- With RLL (Readable Line Length): if `naturalLeft >= neededSpace`, all extra space goes to labels
- Without RLL: pushes content right via `contentDOM.paddingLeft` or `gutterEl.style.marginLeft`

---

## 4. Interaction Patterns

### 4.1 Two-Mode Coding Menu

The same `openCodingPopover()` serves both modes, adapting its layout:

**Selection mode** (new marker):
```
[Search / create input]  ← auto-focused
☐ active codes (toggles)
☐ recent inactive codes
Browse all codes...
─────────────
⊕ Add New Code
```

**Hover mode** (existing marker):
```
[Search / create input]  ← NOT focused
☐ inactive suggestions
Browse all codes...
─────────────
☑ active codes on marker
─────────────
Memo (collapsible)
─────────────
⊕ Add New Code
🗑 Delete Marker
```

**Key differences:**
- Selection mode shows ALL codes (active first, then recent) — the researcher is making a new coding decision
- Hover mode shows only INACTIVE codes as suggestions, with active codes in a separate zone below — the researcher is reviewing/extending an existing decision
- Auto-focus is ON in selection mode, OFF in hover mode
- Delete action only appears in hover mode (can't delete what doesn't exist yet)

### 4.2 Hover Grace Period

```
Mouse enters highlight → 350ms delay → tooltip opens
Mouse leaves highlight → 200ms grace → tooltip closes
Mouse enters tooltip within grace → close cancelled
```

CM6-specific: 30ms debounce on position detection because CM6 splits `Decoration.mark()` into sub-spans at formatting boundaries. Mouse between sub-spans momentarily returns null — debounce bridges the gap.

PDF: Longer delays (400ms open, 300ms grace) because highlight targets are larger and accidental hovers more common.

### 4.3 Batched CM6 Effects

**Rule:** NEVER dispatch effects inside `Tooltip.create()` — it runs during view update, causing recursive updates.

**Pattern:** Batch related effects in a single `dispatch()` call:
```typescript
// menuController.ts:35-49 — single dispatch with 2 effects
editorView.dispatch({
    effects: [
        showCodingMenuEffect.of({ pos, end, snapshot }),
        setSelectionPreviewEffect.of({ from, to })
    ]
});
```

When deferred dispatch is necessary, use `requestAnimationFrame` or `setTimeout(50ms)` — never synchronous dispatch during update cycle.

### 4.4 File Interception Strategy

| Engine | Method | Rationale |
|--------|--------|-----------|
| Markdown | `registerEditorExtension()` | IS the native editor — direct CM6 integration |
| CSV/Parquet | `registerExtensions(['csv', 'parquet'])` | No native handler — safe to register |
| PDF | `active-leaf-change` + view instrumentation | Native handler exists; instrumentation is non-invasive |
| Image | `active-leaf-change` | `registerExtensions` conflicts with native viewer |
| Audio | `active-leaf-change` | `registerExtensions` conflicts with native player |
| Video | `active-leaf-change` | `registerExtensions` conflicts with native player |

Centralized in `fileInterceptor.ts:49-102` — a single `active-leaf-change` listener dispatches to all registered rules. Each rule specifies extensions, target view type, optional source filter, and optional guard function.

---

## 5. Cross-Engine Consistency

### 5.1 SidebarModelInterface Contract

17 members defined in `types.ts:16-48` — every engine implements this interface:

**Data access:** `registry`, `getAllMarkers()`, `getMarkerById()`, `getAllFileIds()`, `getMarkersForFile()`

**Mutations:** `saveMarkers()`, `updateMarkerFields()`, `updateDecorations()`, `removeMarker()`, `deleteCode()`

**Hover coordination:** `setHoverState()`, `getHoverMarkerId()`, `getHoverMarkerIds()`, `onHoverChange()`, `offHoverChange()`

**Change listeners:** `onChange()`, `offChange()`

**Optional:** `getAutoRevealOnSegmentClick?()`

`UnifiedModelAdapter` merges N implementations into 1: delegates reads to first match, broadcasts writes to all, routes hover state to owning model.

### 5.2 Navigation Events

| Event | Payload | Engine Response |
|-------|---------|-----------------|
| `qualia-csv:navigate` | `{ file, row, column }` | `gridApi.ensureIndexVisible()` + `flashCells()` |
| `qualia-image:navigate` | `{ file, markerId }` | Pan to region + flash glow |
| `qualia-audio:navigate` | `{ file, seekTo }` | WaveSurfer seek + play |
| `qualia-video:navigate` | `{ file, seekTo }` | WaveSurfer seek + play |
| Markdown | (no event — direct `openLinkText`) | Opens file at text range |
| PDF | (no event — direct `openFile` with `#page=N`) | Opens file at page |

Events emitted from unified sidebar views (`unifiedExplorerView.ts:75-111`). Engine listeners registered during `registerXxxEngine()`.

### 5.3 Type Guards for Polymorphism

Defined in `markerResolvers.ts:17-33`:

| Guard | Discriminator | Engine |
|-------|--------------|--------|
| `isPdfMarker()` | `marker.markerType === 'pdf'` | PDF |
| `isImageMarker()` | `marker.markerType === 'image'` | Image |
| `isCsvMarker()` | `marker.markerType === 'csv'` | CSV |
| `isAudioMarker()` | `marker.markerType === 'audio'` | Audio |
| `isVideoMarker()` | `marker.markerType === 'video'` | Video |
| (default) | (no markerType / undefined) | Markdown |

Used by `getMarkerLabel()` and `shortenPath()` (also in `markerResolvers.ts`) for engine-specific rendering and navigation in unified views.

### 5.4 Shared Factories

`drawToolbarFactory.ts` provides `createDrawToolbar()` — a shared factory for PDF and Image drawing toolbars. Both engines use identical mode buttons (select, rectangle, ellipse, freeform) with keyboard shortcuts scoped to `config.keyboardScope`. Adding or modifying a drawing tool requires one change in the factory, automatically reflected in both engines.

This pattern emerged from the consolidation: PDF and Image had independently implemented near-identical toolbars. The factory extracts the shared structure (button specs, keyboard binding, active-state toggling) while each engine provides its own `DrawToolbarConfig` with engine-specific callbacks and DOM scope.

---

## 6. Design History

Key design decisions traced to historical moments.

### 6.1 The 3 Menu Approaches (A → B → C)

**Approach A (Obsidian native Menu):** Functional, but CM6 loses selection visual when focus goes to the menu. *Lesson: don't fight the editor's focus model.*

**Approach B (CM6 HTML Tooltip):** Solves the focus problem, but manual styling doesn't inherit Obsidian theme. *Lesson: isolated DOMs need explicit style injection.*

**Approach C (CM6 + Obsidian Components):** Tooltip container from CM6, but content uses native `TextComponent`/`ToggleComponent`. `applyThemeColors()` bridges the style gap. *Lesson: combine the best of both worlds — CM6 for positioning, Obsidian for components.*

Approaches A and B are preserved as fallbacks in the original markdown plugin but were NOT ported to the consolidated plugin. Only Approach C is active.

### 6.2 The "Dark Mode Breakthrough"

Three failed approaches:
1. `color-scheme: inherit` on container → no effect
2. `.theme-dark` / `.theme-light` CSS selectors targeting tooltip → vars not available
3. `!important` on CSS variable references → vars resolve to empty

**Solution:** `getComputedStyle(document.body)` reads resolved values, copies as inline styles + custom properties. This generalized into the `applyThemeColors()` function used by every engine that renders outside the normal DOM.

### 6.3 The Consolidation (7 → 1)

**Problems with 7 plugins:** 7 installations, 6 duplicated registries, 5 duplicated modals, 14 sidebar views, 7 settings tabs, file-sync race conditions in SharedRegistry.

**Decision:** Consolidate into 1 plugin with shared core. 12-layer bottom-up execution. The merge produced 60% LOC reduction while preserving all functionality.

**UX implication:** One sidebar, one settings tab, one code system. The researcher manages one tool, not seven.

### 6.4 Frozen Version (v0-pre-overlay)

Before migrating handles from `Decoration.widget` to overlay divs, a frozen version was tagged at `v0-pre-overlay` (commit `b6bb6cf`). The widget approach worked but caused word-wrap reflow on long lines. The overlay approach adds complexity (separate event listeners for overlay DOM) but achieves zero visual impact on text layout.

*Lesson: preserve working versions before architectural changes. The frozen version validated that the handle concept worked; the overlay migration improved the implementation without re-proving the concept.*

### 6.5 Margin Panel Evolution (7 Commits)

The margin panel went through 7 iterations:
1. Prototype: fixed bars
2. Collision avoidance for labels
3. Dynamic width with RLL adaptation
4. Bidirectional hover sync
5. Label truncation alignment fix
6. Theme awareness via computed styles
7. Multi-marker stacking

Each iteration addressed a real problem discovered in use. The final algorithm (column allocation + weighted collision avoidance + RLL detection) is the result of incremental refinement, not upfront design.

### 6.6 The March 2026 Refactor

A 3-day session (March 16-18, 2026) that transformed the codebase from working software into an armored technical foundation:

| Metric | Before | After |
|--------|--------|-------|
| LOC (src) | 38,067 | 28,884 |
| Largest file | 11,147 LOC | 596 LOC (codeMarkerModel — cohesive) |
| `as any` casts | 222 | 4 |
| tsc errors | 82 | 0 |
| Unit tests | 0 | 1,269 (39 suites) |
| E2E tests | 0 | 65 (18 specs) |

**6 major file splits:** boardNodes (816→13 LOC barrel), csvCodingView (802→209), markerViewPlugin (701→326), marginPanelExtension (672→548), boardView (595→499), baseCodeDetailView (599→204).

**New patterns born from the refactor:**
- `drawToolbarFactory` — shared toolbar factory for PDF + Image (§2.4)
- `baseSidebarAdapter` — listener deduplication via Map wrappers (§2.5)
- `handleOverlayRenderer` + `dragManager` — rendering/state separation (§2.11)
- `marginPanelLayout` — pure algorithm extraction from DOM-coupled extension (§2.11)
- `markerResolvers.ts` — centralized type guards + label resolution (§5.3)

This refactor marked the transition point: zero tech debt, full test coverage, every file under 600 LOC. The e2e test harness was published as a separate open-source package (`obsidian-e2e-visual-test-kit`) during this session.

---

## 7. Anti-Patterns (What We Don't Do)

These are not arbitrary rules — each was established after a specific failure mode was discovered and fixed.

| Anti-Pattern | Why | Consequence if Violated | Source |
|-------------|-----|------------------------|--------|
| Never auto-reveal leaves on updates | Focus steal → MutationObserver → render loop → DOM destruction | Stacked label click bug, infinite rebuild loops | CLAUDE.md "regla inviolável" |
| Never dispatch effects inside `Tooltip.create()` | Runs during view update → recursive update exception | CM6 crashes or inconsistent state | TECHNICAL-PATTERNS.md §1.8 |
| Never call `loadData()`/`saveData()` directly | Bypasses DataManager → stale cache → data loss | Writes overwrite other engines' data | CLAUDE.md "regla inviolável" |
| Never use `registerExtensions` for native types | Conflicts with Obsidian's built-in handlers | Plugin fails to load entirely | TECHNICAL-PATTERNS.md §5.6 |
| Never rename CSS prefixes for consistency | 28K LOC regex risk, user custom CSS breakage | Visual regressions, broken community themes | MERGE-PLAN D15 |
| Never break AudioMarker `{from, to}` contract | Analytics reads `data.json` directly | Time-series analytics produce garbage data | TECHNICAL-PATTERNS.md §8.7 |
| Never create Fabric.js Groups for arrows | Causes rotation/resize artifacts | Arrows detach from nodes visually | TECHNICAL-PATTERNS.md §2.6 |
| Never skip `flushPendingSave()` on unload | Debounced saves may not have fired | Data loss on Obsidian close | TECHNICAL-PATTERNS.md §6.2 |
| Never put `main.ts` logic beyond ~15 LOC | Signals misplaced responsibility | Registration complexity, test difficulty | CLAUDE.md "regla inviolável" |
| Never rely on CSS cascade for isolated contexts | CM6 tooltips, WaveSurfer shadow DOM, Fabric.js canvas don't inherit | Broken theming, invisible elements | TECHNICAL-PATTERNS.md §5.1 |

---

## Cross-Reference

### CLAUDE.md "Reglas Invioláveis" → Principles

| Rule | Maps to Principle |
|------|------------------|
| Engines never call `loadData()`/`saveData()` directly | §2.5 Graceful State Management |
| Only markdown engine calls `registerEditorExtension()` | §4.4 File Interception Strategy |
| NEVER call `revealLeaf` in auto-updates | §2.1 Respect Researcher Focus |
| `main.ts` ≤ ~15 LOC | §2.4 Unified but Modular |
| Read all engines before implementing shared capability | §2.4 Unified but Modular |
| Build must pass before declaring task complete | (engineering discipline, not UX principle) |

### ARCHITECTURE.md Design Principles → Values

| Architecture Principle | Maps to Value |
|----------------------|---------------|
| Notes stay 100% clean | §1.2 Notes Stay 100% Clean |
| Global workspace as state zero | §1.4 Global Workspace First |
| One code system, many formats | §2.4 Unified but Modular |
| Non-invasive file intercept | §4.4 File Interception Strategy |

---

## Key Source Files

| File | Relevance |
|------|-----------|
| `src/core/codingPopover.ts` | Two-mode menu, `CodingPopoverAdapter` interface |
| `src/core/baseCodingMenu.ts` | `applyThemeColors()`, menu primitives |
| `src/core/baseSidebarAdapter.ts` | Listener deduplication, hover/change proxy |
| `src/core/drawToolbarFactory.ts` | Shared drawing toolbar factory (PDF + Image) |
| `src/core/markerResolvers.ts` | Type guards, `getMarkerLabel()`, `shortenPath()` |
| `src/core/types.ts` | `SidebarModelInterface`, `BaseMarker` |
| `src/core/unifiedModelAdapter.ts` | Cross-engine merge, hover delegation |
| `src/core/unifiedExplorerView.ts` | Navigation events, marker labels |
| `src/core/settingTab.ts` | 8 exposed settings (opinionated defaults) |
| `src/core/dataManager.ts` | Debounced save, re-entrant guard, section pattern |
| `src/core/fileInterceptor.ts` | Centralized file interception rules |
| `src/markdown/cm6/marginPanelExtension.ts` | DOM rendering, hover integration, MutationObserver |
| `src/markdown/cm6/marginPanelLayout.ts` | Pure layout algorithm: `assignColumns()`, `resolveLabels()` |
| `src/markdown/cm6/markerViewPlugin.ts` | Hover detection, handle overlay, 30ms debounce |
| `src/markdown/cm6/handleOverlayRenderer.ts` | SVG drag handles: creation, positioning, render cycle |
| `src/markdown/cm6/dragManager.ts` | Drag lifecycle: start, move (16ms throttle), end |
| `src/markdown/cm6/hoverMenuExtension.ts` | 350ms/200ms timing, selection priority |
| `src/markdown/cm6/selectionMenuField.ts` | Batched effects, deferred deletion cleanup |
| `src/markdown/menu/menuController.ts` | Effect batching pattern |
| `src/pdf/highlightRenderer.ts` | Opacity blending, z-index layers, hover timing |
| `src/media/waveformRenderer.ts` | Theme sync, shadow DOM workaround |
| `src/media/regionRenderer.ts` | Vertical lanes algorithm |
| `src/image/canvas/regionDrawing.ts` | Drawing state machine |
| `styles.css` | Namespacing, blend modes, z-index values, opacity system |
| `CLAUDE.md` | Inviolable rules (= principles encoded as constraints) |
| `docs/ARCHITECTURE.md` | Architectural rationale, visual approach analysis |
| `docs/TECHNICAL-PATTERNS.md` | Gotchas (= implicit principles via negative examples) |
