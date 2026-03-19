# DESIGN-STORY + DESIGN-PRINCIPLES v2 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create DESIGN-STORY.md (case study narrative) and update DESIGN-PRINCIPLES.md to v2 (post-refactor patches + link to story).

**Architecture:** Two independent documents in `docs/pm/product/`. DESIGN-STORY is written from scratch using curated content from external source materials. DESIGN-PRINCIPLES v2 is surgical edits to the existing v1.

**Spec:** `docs/superpowers/specs/2026-03-19-design-story-and-principles-v2-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Rename | `docs/pm/product/DESIGN-PRINCIPLES.md` → `DESIGN-PRINCIPLES-v1.md` | Archive v1 |
| Create | `docs/pm/product/DESIGN-STORY.md` | Case study narrative (~300-400 lines) |
| Create | `docs/pm/product/DESIGN-PRINCIPLES.md` | v2 = patched copy of v1 |

**Source materials (read-only, external):**
- `/Users/mosx/Desktop/qualia/ecossistema-qualia-historia-e-cases.md` — history, DIME mapping, cases
- `/Users/mosx/Desktop/Mixed methods/Foundations.md` — theoretical references (citations only, don't reproduce)

---

## Task 1: File Housekeeping

**Files:**
- Rename: `docs/pm/product/DESIGN-PRINCIPLES.md` → `docs/pm/product/DESIGN-PRINCIPLES-v1.md`
- Modify: `docs/pm/product/DESIGN-PRINCIPLES-v1.md` (fix broken forward-ref link)

- [ ] **Step 1: Rename v1**

```bash
cd /Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding
git mv docs/pm/product/DESIGN-PRINCIPLES.md docs/pm/product/DESIGN-PRINCIPLES-v1.md
```

- [ ] **Step 2: Fix forward-ref link in v1**

In `docs/pm/product/DESIGN-PRINCIPLES-v1.md`, line 3, change:
```
> **Nota:** Este documento é a v1, reverse-engineered pré-refactor de março 2026. A versão evoluída está em [DESIGN-PRINCIPLES-v2.md](DESIGN-PRINCIPLES-v2.md).
```
To:
```
> **Nota:** Este documento é a v1, reverse-engineered pré-refactor de março 2026. A versão evoluída está em [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md).
```

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "docs: renomeia DESIGN-PRINCIPLES para v1 (preparação para v2)"
```

---

## Task 2: Write DESIGN-STORY.md — Sections 1-2

**Files:**
- Create: `docs/pm/product/DESIGN-STORY.md`

**Source materials to read before writing:**
- Ecossistema doc sections: "A história real" (§0-7), lines 1-51
- Spec sections 1-2

- [ ] **Step 1: Write Section 1 — Opening (1st person)**

The vision statement + gap analysis. ~200-300 words. Content:
- MAXQDA-level coding inside Obsidian, without touching a single note
- Practical experience with MAXQDA (margin panel, segment selection) and Dovetail (popover menu) already in mind
- The gap: professional QDA tools are isolated databases; Obsidian plugins are single-format and dirty markdown

Tone: case study opening, first person, direct.

- [ ] **Step 2: Write Section 2 — Three Converging Trails (mixed 1st/3rd)**

Three subsections, ~400-500 words total:

**2.1 Visual References Trail (1st person):**
- MAXQDA: margin panel with column allocation + label collision avoidance, segment selection
- Dovetail: popover menu with two-mode logic, suggestions, progressive disclosure
- Not research — lived experience as researcher and designer

**2.2 Technical Trail (1st person):**
- HTML spans for marking → limitation (dirties markdown) → pivoted to popover menu
- Discovered CM6 via Cursor → implemented selection + decoration movement
- Gate unlocked: proof that "notes stay clean" was technically feasible
- Professional quality ambition activated

**2.3 Theoretical Trail (3rd person):**
- Action menu raised the question: "which methods use coding as input for deeper analysis?"
- Deep research (~60 sources, multiple AIs as research tools)
- Discovery of Routledge Reviewer's Guide to Mixed Methods Analysis (Onwuegbuzie & Johnson, 2021)
- Consolidation into Foundations.md
- Scope explosion: from text marker → full QDA with analytics engine

- [ ] **Step 3: Verify tone consistency**

Review: sections in 1st person read as narrative/case study; section 2.3 in 3rd person reads as conceptual. No marketing language. Academic citations use (Author, Year) format.

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "docs: DESIGN-STORY.md seções 1-2 (abertura + trilhas convergentes)"
```

---

## Task 3: Write DESIGN-STORY.md — Section 3

**Files:**
- Modify: `docs/pm/product/DESIGN-STORY.md`

**Source materials to read before writing:**
- Ecossistema doc: "O mapeamento: Foundations.md → qualia-coding Analytics" (lines 54-99)
- Ecossistema doc: "Cobertura do modelo DIME" (lines 94-99)
- Foundations.md: Section 3 "O Continuum das Transformações" (lines 475-680, skim for key concepts)
- Foundations.md: Section 1.3.1 "Evolução das Fórmulas" (lines 304-348, for 1+1=1 formula)

- [ ] **Step 1: Write Section 3 — Data Transformation as the Heart of Design (3rd person)**

~500-600 words. The conceptual center of the document. Structure:

**Opening paragraph:** Mixed analysis (not mixed methods) as the framework. Distinction matters: mixed methods = research design; mixed analysis = data transformation techniques. The analytics engine operationalizes mixed analysis.

**Key concepts (2-3 paragraphs):**
- Crossover mixed analysis: applying techniques from one tradition (quantitative) to data from another (qualitative). Cite: Onwuegbuzie & Combs, 2010
- The quantitization ↔ qualitization continuum as spectrum, not binary. Cite: Sandelowski et al., 2009
- Formula 1+1=1 (Onwuegbuzie, 2017): complete integration, not juxtaposition
- Meta-inferences as "cinematic montage" (Denzin & Lincoln, 2000 via Rodrigues, 2007)

**DIME mapping table (curated from ecossistema doc):**

| DIME Level | Representative ViewModes | Concept |
|------------|-------------------------|---------|
| Descriptive | frequency, word-cloud, text-stats | Basic quantitization — counting, frequency, lexical richness |
| Inferential | chi-square, lag-sequential | Independence and sequentiality tests |
| Measurement | MCA, MDS, TTR | Crossover analysis — quantitative techniques on qualitative data |
| Exploratory | dendrogram, decision-tree, polar-coords | Multivariate classification |

Note below table: "This table highlights representative ViewModes. The full mapping of all 19 ViewModes is documented in the ecosystem doc."

**Derived principles (2-3 paragraphs):**
- "Qualia processes — the researcher interprets" (meta-aggregation / non-reinterpretation)
- Text retrieval alongside visualizations = path back to qualitative always present
- Quality metrics visible (stress, inertia, p-value) = methodological transparency
- Research Board as joint display — space for meta-inferences

- [ ] **Step 2: Verify citations**

Check that every (Author, Year) reference matches the Foundations.md bibliography:
- Onwuegbuzie & Combs, 2010 ✓ (Foundations.md line 25)
- Sandelowski et al., 2009 ✓ (Foundations.md line 17)
- Onwuegbuzie, 2017 ✓ (Foundations.md line 328)
- Denzin & Lincoln, 2000 via Rodrigues, 2007 ✓ (Foundations.md line 67-71)

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "docs: DESIGN-STORY.md seção 3 (transformação de dados como coração do design)"
```

---

## Task 4: Write DESIGN-STORY.md — Sections 4-7

**Files:**
- Modify: `docs/pm/product/DESIGN-STORY.md`

**Source materials to read before writing:**
- Ecossistema doc: "A MCA como fio condutor" (lines 251-265)
- Ecossistema doc: "Cases por área" → UX Design case (lines 103-113)
- Ecossistema doc: "O ecossistema completo" (lines 194-249)

- [ ] **Step 1: Write Section 4 — MCA as Common Thread (1st person)**

~300-400 words. The same technique in 5 contexts over years:
1. ESPM thesis — MCA for design personas
2. Sicredi — MCA in R on insights repository → "Territórios de Experiência" ("Experience Territories")
3. DeepVoC — MCA segmentation with 23k NPS feedbacks
4. qualia-coding — MCA implemented from scratch in TypeScript, client-side
5. Foundations.md — theoretical grounding for why MCA is epistemologically legitimate on qualitative data

The complete cycle: quali → quanti → quali again.
From experimental use without grounding → theoretical recognition via Routledge.

- [ ] **Step 2: Write Section 5 — Design Decisions That Carry Epistemology (3rd person)**

~300-400 words. Table + "decisions NOT to make" list. Curated from ecossistema doc UX Design case.

Table:

| Design Decision | Epistemology |
|----------------|--------------|
| Source type filter | Cross-media triangulation as interaction |
| Text retrieval alongside visualizations | Path back to qualitative always present |
| Research Board as free canvas | "The researcher interprets, not the tool" |
| Consistent code colors across all views | Cognitive continuity |
| Obsidian as platform | Analysis within the workflow, local-first |
| Client-side without backend | Product decision: privacy, zero dependencies |
| Quality metrics exposed (stress, inertia, p-value) | Methodological transparency |
| No automated interpretation | Tool amplifies, doesn't replace (Dey, 1993 via Rodrigues, 2007) |

Decisions NOT to make:
- No backend (privacy + simplicity)
- No D3 (bundle size)
- No hidden quality metrics (researcher needs to evaluate)
- No automated coding (interpretive responsibility is human)

- [ ] **Step 3: Write Section 6 — The Ecosystem (3rd person, brief)**

~150-200 words. Three components:
- Qualia Core (Python, REST API) — agnostic transformation engine
- qualia-coding (TypeScript, Obsidian) — researcher's interface
- Foundations.md — theoretical grounding (~60 sources)
- Reference to full ecosystem doc for complete mapping

No diagram — text description suffices.

- [ ] **Step 4: Write Section 7 — References and Influences**

Bullet list:
- Routledge Reviewer's Guide to Mixed Methods Analysis (Onwuegbuzie & Johnson, 2021)
- Dovetail — popover interaction design
- MAXQDA — margin panel, visual coding patterns
- Rodrigues (2007) — methodological bricoleur, Brazilian author
- Sandelowski (2000) — combinations at the technique level
- Dickinson (2021) — Correspondence Analysis as crossover
- Saldaña (2020) — affective coding, Excel as playground

- [ ] **Step 5: Add cross-reference to DESIGN-PRINCIPLES**

At the bottom of DESIGN-STORY.md, add:
```markdown
---
For the detailed code evidence behind these design decisions, see [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md).
```

- [ ] **Step 6: Final review — word count and tone**

Target: ~1800-2400 words (~300-400 lines). Check:
- 1st person in sections 1, 2.1, 2.2, 4
- 3rd person in sections 2.3, 3, 5, 6
- No marketing language
- Citations have (Author, Year) format
- No aspirational content — everything traces to existing code or documented history

- [ ] **Step 7: Commit**

```bash
~/.claude/scripts/commit.sh "docs: DESIGN-STORY.md seções 4-7 (MCA, epistemologia, ecossistema, referências)"
```

---

## Task 5: Create DESIGN-PRINCIPLES.md v2 — Header + New Section

**Files:**
- Create: `docs/pm/product/DESIGN-PRINCIPLES.md` (copy from v1, then patch)

- [ ] **Step 1: Copy v1 as base for v2**

```bash
cp docs/pm/product/DESIGN-PRINCIPLES-v1.md docs/pm/product/DESIGN-PRINCIPLES.md
```

- [ ] **Step 2: Replace header**

Replace lines 1-5 of the new file. Remove "(v1)" label and v1 forward-ref nota. New header:

```markdown
# Qualia Coding — Design Principles

> For the theoretical foundations and design journey behind these principles, see [DESIGN-STORY.md](DESIGN-STORY.md).

> Reverse-engineered from ~28K LOC across 7 engines. Every principle here is documented because it already EXISTS in the codebase — not aspirational. Evidence traces to specific files and patterns.
>
> **Audiences**: Community plugin review (UX quality), README/marketing (differentiator narrative), methods paper (design grounded in theory), contributors (visual coherence guide).
```

- [ ] **Step 3: Add §1.5 "Data Transformation as Design Principle"**

After §1.4 "Global Workspace First, Projects Later" (around line 62), add new section:

```markdown
### 1.5 Data Transformation as Design Principle

The analytics engine was not designed as a dashboard feature — it was informed by mixed analysis theory, specifically the continuum between quantitization (qualitative → quantitative) and qualitization (quantitative → qualitative). Each of the 19 ViewModes operationalizes a specific level of the DIME model (Descriptive, Inferential, Measurement, Exploratory) as defined by Onwuegbuzie (2025).

The guiding insight: qualitative data analysis and quantitative data analysis are not separate activities but movements on a continuous spectrum. Crossover mixed analysis — applying analytical techniques from one tradition to data from another — is what makes the analytics engine more than a chart generator.

For the full theoretical context, see [DESIGN-STORY.md §3: Data Transformation as the Heart of Design](DESIGN-STORY.md#3-data-transformation-as-the-heart-of-design).
```

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "docs: DESIGN-PRINCIPLES v2 — header + §1.5 transformação de dados"
```

---

## Task 6: Patch DESIGN-PRINCIPLES.md v2 — Core Principles Updates

**Files:**
- Modify: `docs/pm/product/DESIGN-PRINCIPLES.md`

**Source files to verify references:**
- `src/core/drawToolbarFactory.ts` — line 32 (`createDrawToolbar`)
- `src/core/baseSidebarAdapter.ts` — line 26 (`BaseSidebarAdapter`), lines 54-70 (listener dedup)
- `src/markdown/cm6/handleOverlayRenderer.ts` — line 33 (z-index 10000)
- `src/markdown/cm6/dragManager.ts` — line 44 (16ms throttle)
- `src/markdown/cm6/marginPanelLayout.ts` — `assignColumns` function

- [ ] **Step 1: Patch §2.4 Unified but Modular — add drawToolbarFactory**

In the table under §2.4, add row:

```markdown
| `drawToolbarFactory` shared across engines | `drawToolbarFactory.ts:32` — `createDrawToolbar(parent, buttons, config)` serves PDF and Image with identical UX | Adding a drawing tool = one factory change, two engines updated |
```

- [ ] **Step 2: Patch §2.5 Graceful State Management — add listener dedup**

In the table under §2.5, add row:

```markdown
| Listener deduplication in sidebar | `baseSidebarAdapter.ts:54-70` — `Map<() => void, () => void>` prevents duplicate hover listener registrations | No heap leaks from re-registering same listener without cleanup |
```

- [ ] **Step 3: Patch §2.6 Smooth Transitions — add domain-specific timing note**

After the existing timer table in §2.6, add paragraph:

```markdown
**Domain-specific timing:** Markdown uses shorter delays (350ms open / 200ms grace) than PDF (400ms open / 300ms grace). This isn't arbitrary — markdown highlights are smaller targets with denser interaction, making accidental hovers less likely. PDF highlights span larger areas where unintentional hovers are more common. The timing values encode domain knowledge about interaction scale.
```

- [ ] **Step 4: Add new §2.11 Separation of Concerns**

After §2.10, add:

```markdown
### 2.11 Separation of Concerns by Responsibility

**Rendering and state are separate concerns, even within the same feature.**

| Split | Rendering/Layout | State/Logic |
|-------|-----------------|-------------|
| Drag handles | `handleOverlayRenderer.ts` (287 LOC) — SVG creation, positioning via `requestMeasure`, `coordsAtPos` | `dragManager.ts` (108 LOC) — start/move/end lifecycle, 16ms throttled updates |
| Margin panel | `marginPanelExtension.ts` (548 LOC) — DOM rendering, hover integration, MutationObserver | `marginPanelLayout.ts` (129 LOC) — pure `assignColumns()` + `resolveLabels()`, no DOM dependency |

**Design principle:** Full render when NOT dragging, throttled updates DURING dragging. The layout algorithm (`marginPanelLayout.ts`) is reusable geometry — it could theoretically serve any engine needing label layout. Separating pure computation from DOM rendering makes both testable and composable.
```

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "docs: DESIGN-PRINCIPLES v2 — patches §2.4, §2.5, §2.6, §2.11"
```

---

## Task 7: Patch DESIGN-PRINCIPLES.md v2 — Cross-Engine + History + Type Guards

**Files:**
- Modify: `docs/pm/product/DESIGN-PRINCIPLES.md`

**Source files to verify:**
- `src/core/markerResolvers.ts` — type guards location (lines 17-33)

- [ ] **Step 1: Patch §5 Cross-Engine Consistency — add drawToolbarFactory**

After the existing content in §5, add subsection or row that mentions:

```markdown
### 5.4 Shared Factories

`drawToolbarFactory.ts` provides `createDrawToolbar()` — a shared factory for PDF and Image drawing toolbars. Both engines use identical mode buttons (select, rectangle, ellipse, freeform) with keyboard shortcuts scoped to `config.keyboardScope`. Adding or modifying a drawing tool requires one change in the factory, automatically reflected in both engines.
```

- [ ] **Step 2: Patch §5.3 Type Guards — update file references**

In §5.3, replace references to `unifiedExplorerView.ts:150-168` and `unifiedDetailView.ts:175-193` with:

```markdown
Defined in `markerResolvers.ts:17-33`:
```

Update the table to match current code:

```markdown
| Guard | Discriminator Fields | Engine |
|-------|---------------------|--------|
| `isPdfMarker()` | `'page' in m && 'isShape' in m` | PDF |
| `isImageMarker()` | `'shape' in m && 'shapeLabel' in m` | Image |
| `isCsvMarker()` | `'rowIndex' in m && 'columnId' in m` | CSV |
| `isAudioMarker()` | `m.mediaType === 'audio'` | Audio |
| `isVideoMarker()` | `m.mediaType === 'video'` | Video |
| (default) | (no discriminator) | Markdown |

Used by `getMarkerLabel()` and `shortenPath()` (also in `markerResolvers.ts`) for engine-specific rendering in unified views.
```

- [ ] **Step 3: Add §6.6 — March 2026 Refactor**

After §6.5 "Margin Panel Evolution", add:

```markdown
### 6.6 The March 2026 Refactor

A 3-day session (March 16-18, 2026) that transformed the codebase:

| Metric | Before | After |
|--------|--------|-------|
| LOC (src) | 38,067 | 28,884 |
| Largest file | 11,147 | 596 (codeMarkerModel — cohesive) |
| `as any` | 222 | 4 |
| tsc errors | 82 | 0 |
| Unit tests | 0 | 1,269 (39 suites) |
| E2E tests | 0 | 65 (18 specs) |

**6 major file splits:** boardNodes (816→13 LOC barrel), csvCodingView (802→209), markerViewPlugin (701→326), marginPanelExtension (672→548), boardView (595→499), baseCodeDetailView (599→204).

**New patterns born:** `drawToolbarFactory` (§2.4), `baseSidebarAdapter` listener deduplication (§2.5), `handleOverlayRenderer` + `dragManager` separation (§2.11), `marginPanelLayout` pure algorithm extraction (§2.11), `markerResolvers.ts` centralized type guards (§5.3).

This refactor marked the transition from "working software" to "blindada (armored) technical foundation" — zero tech debt, full test coverage, every file under 600 LOC.
```

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "docs: DESIGN-PRINCIPLES v2 — patches §5.3, §5.4, §6.6 (type guards, factory, refactor)"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Cross-link smoke test**

```bash
grep -l 'DESIGN-STORY' docs/pm/product/DESIGN-PRINCIPLES.md
grep -l 'DESIGN-PRINCIPLES' docs/pm/product/DESIGN-STORY.md
```

Both commands must return their respective file paths.

- [ ] **Step 2: Verify no broken internal links**

```bash
grep -oP '\[.*?\]\((.*?)\)' docs/pm/product/DESIGN-STORY.md | grep -v http
grep -oP '\[.*?\]\((.*?)\)' docs/pm/product/DESIGN-PRINCIPLES.md | grep -v http
```

Check that every relative link target exists in `docs/pm/product/`.

- [ ] **Step 3: Word count check on DESIGN-STORY**

```bash
wc -w docs/pm/product/DESIGN-STORY.md
```

Target: 1800-2400 words. If significantly over, trim. If under, sections may need expansion.

- [ ] **Step 4: Verify v1 archive is intact**

```bash
wc -l docs/pm/product/DESIGN-PRINCIPLES-v1.md
```

Should be ~564 lines (562 original + 2 from header edit). Confirms v1 was preserved, not overwritten.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
~/.claude/scripts/commit.sh "docs: correções finais DESIGN-STORY + DESIGN-PRINCIPLES v2"
```
