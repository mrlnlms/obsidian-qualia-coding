# PDF Multipage Margin Panel Implementation Plan

> Status: completed in Marco 4. Checkboxes below preserve the original execution
> recipe and are not the live task tracker; see `docs/ROADMAP.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one continuous, document-level margin rail and one centered label for every PDF `marker × code`, including logical markers that cross page gaps, while preserving current Markdown and single-page PDF behavior.

**Architecture:** Extract a DOM-free rail allocator from the Markdown implementation, then adapt both engines to it. PDF pages publish page-local percentage snapshots; a pure document-layout step combines those snapshots with current page placements into global rails, and the external overlay renders one line per logical rail. `PdfPageObserver` remains the lifecycle owner; persisted markers, import/export, analytics, ICR, and Atlas behavior remain untouched.

**Tech Stack:** TypeScript 5, Vitest 4, jsdom, CodeMirror 6, Obsidian's native PDF.js viewer, existing DOM overlay and CSS.

**Spec:** `docs/superpowers/specs/2026-09-02-pdf-multipage-margin-panel-design.md`

## Global Constraints

- Branch baseline is `f70585f`; approved design commit is `11d5ed8`.
- One rail and one label means one visual entry per logical `markerId + codeId`.
- Do not aggregate markers, coders, or codes, even when bounds are identical.
- A completed multipage rail runs from the first segment's exact top to the last segment's exact bottom, crossing page bodies and gaps as one DOM line.
- Dot and ideal label position are `(rail.top + rail.bottom) / 2`, including when that point falls in a page gap.
- Lane `0` remains closest to document content.
- Keep Markdown and PDF renderers/lifecycles separate; share only pure layout primitives.
- Preserve Markdown appearance and interaction.
- Preserve PDF single-page markers, shapes, ownership colors, hover, label click, and resize behavior.
- Multipage markers remain non-resizable.
- Do not eagerly load PDF pages or text layers.
- Do not change persisted schemas, importer, exporter, sidebar, analytics, ICR, or Atlas integration.
- Do not add lane redesign, coder filters, `×N` compaction, panel customization, or overlap-selection UX.
- Validate the six real multipage cases manually before milestone closure.

## File Structure

- Create `src/core/marginPanelLayout.ts` — engine-neutral rail types and lane allocation.
- Create `tests/core/marginPanelLayout.test.ts` — allocator contracts.
- Modify `src/markdown/cm6/marginPanelLayout.ts` — Markdown compatibility adapter and existing label resolver.
- Modify `src/markdown/cm6/marginPanelExtension.ts` — pass stable code identity.
- Create `tests/markdown/marginPanelLayout.test.ts` — Markdown parity coverage.
- Create `src/pdf/pdfMarginPanelLayout.ts` — snapshots, global projection, partial rails.
- Create `tests/pdf/pdfMarginPanelLayout.test.ts` — document geometry coverage.
- Modify `src/pdf/marginPanelRenderer.ts` — collect snapshots and render one global panel.
- Create `tests/pdf/marginPanelRenderer.test.ts` — DOM and interaction coverage.
- Modify `src/pdf/pageObserver.ts` — snapshot cache and overlay lifecycle.
- Modify `styles.css` — document-level PDF panel positioning.
- Modify both governing specs only after acceptance to record Marco 4 closure.

---

### Task 1: Extract the shared pure rail allocator

**Files:**
- Create: `src/core/marginPanelLayout.ts`
- Create: `tests/core/marginPanelLayout.test.ts`

**Interfaces:**
- Consumes: engine-resolved numeric rail bounds.
- Produces: `MarginRailInput`, `MarginRailLayout`, `layoutMarginRails(inputs: readonly MarginRailInput[]): MarginRailLayout[]`.
- Contract: input is not mutated; output sorts by span descending, top ascending, then input order; lane is zero-based; center is exact midpoint.

- [ ] **Step 1: Write the failing allocator tests**

Create `tests/core/marginPanelLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { layoutMarginRails, type MarginRailInput } from '../../src/core/marginPanelLayout';

function rail(key: string, top: number, bottom: number): MarginRailInput {
  return {
    key, markerId: `m-${key}`, codeId: `c-${key}`, codeName: key,
    color: '#123456', editable: true, top, bottom,
  };
}

describe('layoutMarginRails', () => {
  it('reuses lane zero for disjoint and adjacent rails', () => {
    const result = layoutMarginRails([
      rail('a', 0, 20), rail('b', 20, 40), rail('c', 50, 70),
    ]);
    expect(result.map((item) => [item.key, item.lane])).toEqual([
      ['a', 0], ['b', 0], ['c', 0],
    ]);
  });

  it('puts overlapping rails in distinct lanes and longer rails inside', () => {
    const result = layoutMarginRails([
      rail('short', 10, 20), rail('long', 0, 100), rail('other', 30, 40),
    ]);
    expect(result.map((item) => [item.key, item.lane])).toEqual([
      ['long', 0], ['short', 1], ['other', 1],
    ]);
  });

  it('keeps coincident rails independent', () => {
    expect(layoutMarginRails([
      rail('coder-a', 100, 200), rail('coder-b', 100, 200),
    ]).map((item) => item.lane)).toEqual([0, 1]);
  });

  it('returns exact centers without mutating input', () => {
    const input = [rail('a', 25, 75), rail('b', 100, 120)];
    const before = structuredClone(input);
    expect(layoutMarginRails(input).map((item) => [item.key, item.center]))
      .toEqual([['a', 50], ['b', 110]]);
    expect(input).toEqual(before);
  });

  it('preserves input order when span and top tie', () => {
    expect(layoutMarginRails([
      rail('first', 10, 30), rail('second', 10, 30),
    ]).map((item) => item.key)).toEqual(['first', 'second']);
  });
});
```

- [ ] **Step 2: Run the new test and verify the missing-module failure**

Run: `npx vitest run tests/core/marginPanelLayout.test.ts`

Expected: FAIL because `src/core/marginPanelLayout.ts` does not exist.

- [ ] **Step 3: Implement the immutable allocator**

Create `src/core/marginPanelLayout.ts`:

```ts
export interface MarginRailInput {
  key: string;
  markerId: string;
  codeId: string;
  codeName: string;
  color: string;
  ownerAbbreviation?: string;
  ownerName?: string;
  editable: boolean;
  top: number;
  bottom: number;
}

export interface MarginRailLayout extends MarginRailInput {
  lane: number;
  center: number;
}

export function layoutMarginRails(inputs: readonly MarginRailInput[]): MarginRailLayout[] {
  const rails = inputs.map((input, inputOrder) => ({
    ...input, lane: 0, center: (input.top + input.bottom) / 2, inputOrder,
  }));
  rails.sort((a, b) => {
    const spanDiff = (b.bottom - b.top) - (a.bottom - a.top);
    if (spanDiff !== 0) return spanDiff;
    if (a.top !== b.top) return a.top - b.top;
    return a.inputOrder - b.inputOrder;
  });
  const occupied: Array<Array<{ top: number; bottom: number }>> = [];
  for (const rail of rails) {
    let lane = 0;
    while (occupied[lane]?.some(
      (range) => rail.top < range.bottom && rail.bottom > range.top,
    )) lane++;
    rail.lane = lane;
    (occupied[lane] ??= []).push({ top: rail.top, bottom: rail.bottom });
  }
  return rails.map(({ inputOrder: _inputOrder, ...rail }) => rail);
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run tests/core/marginPanelLayout.test.ts`

Expected: 5 tests PASS.

```bash
git add src/core/marginPanelLayout.ts tests/core/marginPanelLayout.test.ts
git commit -m "refactor(margin): extract shared rail allocator"
```

---

### Task 2: Migrate Markdown through a parity adapter

**Files:**
- Modify: `src/markdown/cm6/marginPanelLayout.ts`
- Modify: `src/markdown/cm6/marginPanelExtension.ts`
- Create: `tests/markdown/marginPanelLayout.test.ts`

**Interfaces:**
- Consumes: `layoutMarginRails` from Task 1.
- Produces: existing `assignColumns` and `resolveLabels` APIs.
- Extends: `ResolvedBracket` with `codeId: string`; leaves DOM, widths, CSS, hover, click, and label collision behavior unchanged.

- [ ] **Step 1: Add failing Markdown parity tests**

Create `tests/markdown/marginPanelLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assignColumns, resolveLabels, type ResolvedBracket } from '../../src/markdown/cm6/marginPanelLayout';

function bracket(id: string, top: number, bottom: number): ResolvedBracket {
  return {
    marker: { id } as ResolvedBracket['marker'], codeId: `code-${id}`,
    codeName: id, color: '#abcdef', top, bottom, column: 0,
  };
}

describe('Markdown margin layout parity', () => {
  it('keeps legacy ordering and columns', () => {
    const items = [bracket('short', 10, 20), bracket('long', 0, 100), bracket('other', 30, 40)];
    assignColumns(items);
    expect(items.map((item) => [item.marker.id, item.column]))
      .toEqual([['long', 0], ['short', 1], ['other', 1]]);
  });

  it('keeps label ideal positions', () => {
    const items = [bracket('a', 0, 40), bracket('b', 80, 120)];
    assignColumns(items);
    expect(resolveLabels(items).map((label) => [label.markerId, label.idealY]))
      .toEqual([['a', 12], ['b', 92]]);
  });

  it('keeps multiple codes as separate brackets', () => {
    const first = bracket('marker', 0, 40);
    first.codeId = 'code-a';
    const items = [first, { ...first, codeId: 'code-b', codeName: 'B' }];
    assignColumns(items);
    expect(items.map((item) => item.column)).toEqual([0, 1]);
    expect(resolveLabels(items)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run and verify the contract failure**

Run: `npx vitest run tests/markdown/marginPanelLayout.test.ts`

Expected: FAIL because `ResolvedBracket` lacks `codeId` and still owns the duplicated allocator.

- [ ] **Step 3: Replace only Markdown lane allocation with an adapter**

Add `codeId` to `ResolvedBracket`. Map brackets to shared inputs using a unique internal key `${index}:${marker.id}:${codeId}`, invoke `layoutMarginRails`, copy `rail.lane` back to `bracket.column`, and reorder `brackets` to the returned layout order. Remove the old allocation loop, but retain every constant, `LabelInfo`, and `resolveLabels` line.

In `marginPanelExtension.ts`, construct each bracket with:

```ts
brackets.push({
  marker,
  codeId: codeApp.codeId,
  codeName,
  color,
  top: topPx + contentTop,
  bottom: bottomPx + contentTop,
  column: 0,
});
```

- [ ] **Step 4: Verify, type-check, and commit**

Run:

```bash
npx vitest run tests/core/marginPanelLayout.test.ts tests/markdown/marginPanelLayout.test.ts tests/markdown/markerPositionUtils.test.ts
npx tsc -noEmit
```

Expected: all tests and type-check PASS.

```bash
git add src/markdown/cm6/marginPanelLayout.ts src/markdown/cm6/marginPanelExtension.ts tests/markdown/marginPanelLayout.test.ts
git commit -m "refactor(markdown): use shared margin rail layout"
```

---

### Task 3: Build pure PDF document-level rail projection

**Files:**
- Create: `src/pdf/pdfMarginPanelLayout.ts`
- Create: `tests/pdf/pdfMarginPanelLayout.test.ts`

**Interfaces:**
- Consumes: page-local percentage snapshots and current page placements.
- Produces: `pdfMarginRailKey`, `PdfMarginVisualSegment`, `PdfMarginPageSnapshot`, `PdfMarginPagePlacement`, `buildPdfMarginRailInputs`, `buildPdfMarginPanelLayout`.
- Partial rule: missing first endpoint uses earliest known page top; missing last endpoint uses latest known page bottom.

- [ ] **Step 1: Write failing global-geometry tests**

Create `tests/pdf/pdfMarginPanelLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildPdfMarginPanelLayout, pdfMarginRailKey,
  type PdfMarginPagePlacement, type PdfMarginPageSnapshot, type PdfMarginVisualSegment,
} from '../../src/pdf/pdfMarginPanelLayout';

function segment(overrides: Partial<PdfMarginVisualSegment> = {}): PdfMarginVisualSegment {
  return {
    key: pdfMarginRailKey('m1', 'c1'), markerId: 'm1', codeId: 'c1',
    codeName: 'Team self-organization', color: '#008866',
    ownerAbbreviation: 'JD', ownerName: 'Jessica Diaz', editable: false,
    pageNumber: 6, segmentIndex: 0, segmentCount: 2,
    topPct: 10, bottomPct: 95, ...overrides,
  };
}

const placements: PdfMarginPagePlacement[] = [
  { pageNumber: 6, topPx: 100, heightPx: 1000 },
  { pageNumber: 7, topPx: 1120, heightPx: 1000 },
];

describe('buildPdfMarginPanelLayout', () => {
  const first = { pageNumber: 6, entries: [segment()] };
  const last = { pageNumber: 7, entries: [segment({ pageNumber: 7, segmentIndex: 1, topPct: 5, bottomPct: 40 })] };

  it('projects one rail across the real page gap', () => {
    expect(buildPdfMarginPanelLayout([first, last], placements)[0])
      .toMatchObject({ top: 200, bottom: 1520, center: 860, lane: 0 });
  });

  it('uses page boundaries for partial rails', () => {
    expect(buildPdfMarginPanelLayout([first], placements)[0])
      .toMatchObject({ top: 200, bottom: 1100, center: 650 });
    expect(buildPdfMarginPanelLayout([last], placements)[0])
      .toMatchObject({ top: 1120, bottom: 1520, center: 1320 });
  });

  it('converges independently of page arrival order', () => {
    expect(buildPdfMarginPanelLayout([first, last], placements))
      .toEqual(buildPdfMarginPanelLayout([last, first], placements));
  });

  it('keeps codes and coders independent', () => {
    const entries = [
      segment(),
      segment({ key: pdfMarginRailKey('m1', 'c2'), codeId: 'c2', codeName: 'Automation' }),
      segment({ key: pdfMarginRailKey('m2', 'c1'), markerId: 'm2', ownerAbbreviation: 'JEPM' }),
    ];
    const result = buildPdfMarginPanelLayout([{ pageNumber: 6, entries }], placements);
    expect(result).toHaveLength(3);
    expect(result.map((rail) => rail.lane)).toEqual([0, 1, 2]);
  });

  it('reprojects percentages after zoom', () => {
    const zoomed = [
      { pageNumber: 6, topPx: 200, heightPx: 2000 },
      { pageNumber: 7, topPx: 2240, heightPx: 2000 },
    ];
    expect(buildPdfMarginPanelLayout([first, last], zoomed)[0])
      .toMatchObject({ top: 400, bottom: 3040, center: 1720 });
  });
});
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `npx vitest run tests/pdf/pdfMarginPanelLayout.test.ts`

Expected: FAIL because `src/pdf/pdfMarginPanelLayout.ts` does not exist.

- [ ] **Step 3: Implement snapshot grouping and global projection**

Define the exported interfaces exactly as used above. `PdfMarginVisualSegment` extends `Omit<MarginRailInput, 'top' | 'bottom'>` with page number, segment index/count, and top/bottom percentages. `buildPdfMarginRailInputs` must:

1. map placements by page;
2. group entries by `key`;
3. ignore entries without a placement;
4. sort groups by key and entries by segment index then page;
5. convert exact endpoints with `pageTop + pageHeight * pct / 100`;
6. substitute page top/bottom only for missing logical endpoints;
7. copy presentation from the first ordered entry;
8. return `MarginRailInput[]`.

Use `JSON.stringify([markerId, codeId])` in `pdfMarginRailKey` to avoid delimiter collisions. `buildPdfMarginPanelLayout` returns `layoutMarginRails(buildPdfMarginRailInputs(...))`.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx vitest run tests/core/marginPanelLayout.test.ts tests/pdf/pdfMarginPanelLayout.test.ts
```

Expected: all tests PASS.

```bash
git add src/pdf/pdfMarginPanelLayout.ts tests/pdf/pdfMarginPanelLayout.test.ts
git commit -m "feat(pdf): project margin rails in document coordinates"
```

---

### Task 4: Split PDF measurement from global overlay rendering

**Files:**
- Modify: `src/pdf/marginPanelRenderer.ts`
- Create: `tests/pdf/marginPanelRenderer.test.ts`

**Interfaces:**
- Consumes: `PDFPageView`, `PdfMarkerPageProjection[]`, shapes, registry, owner/editability callbacks, and `MarginRailLayout[]`.
- Produces: `collectMarginPanelPageSnapshot`, `pdfMarginPanelBarWidth`, `renderPdfMarginPanel`, `clearPdfMarginPanel`, and existing `applyHoverToMarginPanel`.
- Removes after Task 5 integration: page-local `renderMarginPanelForPage` and `clearMarginPanelForPage`.

- [ ] **Step 1: Add failing DOM tests**

Create `tests/pdf/marginPanelRenderer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { MarginRailLayout } from '../../src/core/marginPanelLayout';
import {
  applyHoverToMarginPanel, clearPdfMarginPanel, renderPdfMarginPanel,
} from '../../src/pdf/marginPanelRenderer';

function rail(overrides: Partial<MarginRailLayout> = {}): MarginRailLayout {
  return {
    key: JSON.stringify(['m1', 'c1']), markerId: 'm1', codeId: 'c1',
    codeName: 'Team self-organization', color: '#008866',
    ownerAbbreviation: 'JD', ownerName: 'Jessica Diaz', editable: false,
    top: 100, bottom: 500, center: 300, lane: 0, ...overrides,
  };
}

describe('renderPdfMarginPanel', () => {
  it('renders one line, two ticks, one dot and one label per rail', () => {
    const container = document.createElement('div');
    renderPdfMarginPanel(container, [rail()], { onLabelClick: vi.fn(), onHover: vi.fn() });
    expect(container.querySelectorAll('.codemarker-pdf-margin-line')).toHaveLength(1);
    expect(container.querySelectorAll('.codemarker-pdf-margin-tick')).toHaveLength(2);
    expect(container.querySelectorAll('.codemarker-pdf-margin-dot')).toHaveLength(1);
    expect(container.querySelectorAll('.codemarker-pdf-margin-label')).toHaveLength(1);
    const line = container.querySelector('.codemarker-pdf-margin-line') as HTMLElement;
    expect(line.style.top).toBe('100px');
    expect(line.style.height).toBe('400px');
    expect((container.querySelector('.codemarker-pdf-margin-dot') as HTMLElement).style.top).toBe('300px');
    expect((container.querySelector('.codemarker-pdf-margin-label') as HTMLElement).style.top).toBe('300px');
  });

  it('renders author text and tooltip', () => {
    const container = document.createElement('div');
    renderPdfMarginPanel(container, [rail()], { onLabelClick: vi.fn(), onHover: vi.fn() });
    const label = container.querySelector('.codemarker-pdf-margin-label') as HTMLElement;
    expect(label.textContent).toBe('JD · Team self-organization');
    expect(label.title).toBe('Jessica Diaz · Team self-organization');
  });

  it('delegates click once and applies hover by logical marker ID', () => {
    const container = document.createElement('div');
    const onLabelClick = vi.fn();
    renderPdfMarginPanel(container, [rail()], { onLabelClick, onHover: vi.fn() });
    (container.querySelector('.codemarker-pdf-margin-label') as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onLabelClick).toHaveBeenCalledOnce();
    expect(onLabelClick).toHaveBeenCalledWith('m1', 'Team self-organization');
    applyHoverToMarginPanel(container, 'm1');
    expect(container.querySelectorAll('.codemarker-pdf-margin-hovered')).toHaveLength(5);
  });

  it('replaces stale geometry and clears the global panel', () => {
    const container = document.createElement('div');
    const callbacks = { onLabelClick: vi.fn(), onHover: vi.fn() };
    renderPdfMarginPanel(container, [rail()], callbacks);
    renderPdfMarginPanel(container, [rail({ top: 200, bottom: 800, center: 500 })], callbacks);
    expect(container.querySelectorAll('.codemarker-pdf-margin-panel')).toHaveLength(1);
    expect((container.querySelector('.codemarker-pdf-margin-line') as HTMLElement).style.height).toBe('600px');
    clearPdfMarginPanel(container);
    expect(container.querySelector('.codemarker-pdf-margin-panel')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify missing exports**

Run: `npx vitest run tests/pdf/marginPanelRenderer.test.ts`

Expected: FAIL because the global render/clear functions do not exist.

- [ ] **Step 3: Extract page snapshot collection**

Add this public signature:

```ts
export function collectMarginPanelPageSnapshot(
  pageView: PDFPageView,
  markers: PdfMarkerPageProjection[],
  registry: CodeDefinitionRegistry,
  shapes?: PdfShapeMarker[],
  ownerLabelForMarker?: (marker: PdfMarker | PdfShapeMarker) => MarginPanelOwnerLabel,
  isMarkerEditable?: (marker: PdfMarker | PdfShapeMarker) => boolean,
): PdfMarginPageSnapshot;
```

Reuse `computeMergedHighlightRects`, `getMarkerVerticalBounds`, and `getShapeVerticalBounds`. Emit percentages rather than pixels. Text projections use `renderSegmentIndex` and `renderSegmentCount`; shapes use index `0`, count `1`. For each code application, resolve `codeId`, display name, author, editability, and color once. Keep `NON_EDITABLE_MARKER_COLOR`, `colorOverride`, registry color, and yellow fallback precedence unchanged.

- [ ] **Step 4: Implement one global DOM renderer**

Add:

```ts
export function renderPdfMarginPanel(
  container: HTMLElement,
  rails: readonly MarginRailLayout[],
  callbacks: MarginPanelCallbacks,
): number;

export function pdfMarginPanelBarWidth(rails: readonly MarginRailLayout[]): number;

export function clearPdfMarginPanel(container: HTMLElement): void;
```

Clear/rebuild exactly one `.codemarker-pdf-margin-panel`. `pdfMarginPanelBarWidth` returns `(maxLane + 1) * COLUMN_WIDTH + PANEL_PADDING * 2`, or `0` for no rails. Use pixel `top`/`height`, global start/end ticks, and dot at `rail.center`. Resolve label-center collisions in pixels with the existing down-only rule and `LABEL_HEIGHT = 16`; the dot never moves. Preserve delegated hover/click, include `data-marker-id`, `data-code-id`, and `data-code-name` on every interactive element, and return the helper's bar width.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx vitest run tests/pdf/marginPanelRenderer.test.ts tests/pdf/pdfMarginPanelLayout.test.ts tests/pdf/highlightGeometry.test.ts
```

Expected: all tests PASS.

```bash
git add src/pdf/marginPanelRenderer.ts tests/pdf/marginPanelRenderer.test.ts
git commit -m "refactor(pdf): render margin rails in the global overlay"
```

---

### Task 5: Integrate document layout into PdfPageObserver

**Files:**
- Modify: `src/pdf/pageObserver.ts`
- Modify: `src/pdf/marginPanelRenderer.ts`
- Modify: `styles.css`
- Modify: `tests/pdf/marginPanelRenderer.test.ts`

**Interfaces:**
- Consumes: all Task 3/4 exports.
- Produces: one `Map<number, PdfMarginPageSnapshot>` per observer and `refreshMarginPanelLayout(): void`.
- Removes: page-local margin-panel movement and measurement.

- [ ] **Step 1: Confirm rerender behavior at the pure boundary**

Run:

```bash
npx vitest run tests/pdf/pdfMarginPanelLayout.test.ts tests/pdf/marginPanelRenderer.test.ts
```

Expected: zoom reprojection and stale-DOM replacement tests PASS before lifecycle wiring changes.

- [ ] **Step 2: Add observer snapshot state and page collection**

Add:

```ts
private marginPageSnapshots = new Map<number, PdfMarginPageSnapshot>();
```

At the end of `renderPage`, after highlights and shapes resolve, replace the page-local panel render with:

```ts
this.marginPageSnapshots.set(pageNumber, collectMarginPanelPageSnapshot(
  pageView,
  renderMarkers,
  this.model.registry,
  shapes,
  (marker) => this.ownerLabelForMarker(marker),
  (marker) => this.model.isMarkerEditable(marker),
));
this.refreshMarginPanelLayout();
```

Do not alter pending-range resolution, highlight rendering, coverage audit, draw layer, or drag handles.

- [ ] **Step 3: Implement the global refresh lifecycle**

Implement `private refreshMarginPanelLayout(): void` with this exact sequence:

1. enumerate `pdfViewer._pages` whose `div.dataset.loaded` is truthy;
2. prune snapshots for pages no longer loaded;
3. build placements from `pageView.id`, `div.offsetTop`, and `div.offsetHeight`;
4. sort snapshots and placements by page number;
5. call `buildPdfMarginPanelLayout`;
6. derive bar width from the largest lane and `PANEL_PADDING`/`COLUMN_WIDTH` through an exported `pdfMarginPanelBarWidth` helper;
7. set total reserved width to `barWidth + 130` when rails exist, otherwise zero;
8. apply viewer margin before `ensureLabelOverlay(total)` so `offsetLeft` is current;
9. render into `labelScroller` with the existing callbacks;
10. dispatch `window.resize` only when reserved width changes.

When rails are empty, clear the global panel, destroy the overlay, restore viewer margin, and set `lastPaddingTotal = 0`.

- [ ] **Step 4: Remove page-panel movement and complete cleanup**

Delete the old search for `.codemarker-pdf-margin-panel` inside page divs and the loop moving them into `labelScroller`. Remove `renderMarginPanelForPage` and `clearMarginPanelForPage` exports after all call sites are gone.

In `clearAll` and `stop` add:

```ts
this.marginPageSnapshots.clear();
if (this.labelScroller) clearPdfMarginPanel(this.labelScroller);
```

Route margin hover only to `labelOverlay`; margin elements no longer exist in page divs. `refreshVisibility` continues rerendering affected pages, which replace their snapshots and refresh the document layout.

- [ ] **Step 5: Update global-panel CSS**

Preserve fonts, colors, ellipsis, transitions, and pointer behavior. Replace only the root positioning:

```css
.codemarker-pdf-margin-panel {
  position: absolute;
  top: 0;
  right: 0;
  min-height: 100%;
  pointer-events: auto;
  overflow: visible;
  z-index: 3;
}
```

Keep Markdown selectors unchanged.

- [ ] **Step 6: Run focused regression and build**

Run:

```bash
npx vitest run tests/core/marginPanelLayout.test.ts tests/markdown/marginPanelLayout.test.ts tests/pdf/pdfMarginPanelLayout.test.ts tests/pdf/marginPanelRenderer.test.ts tests/pdf/pdfMarkerSegments.test.ts tests/pdf/pdfViewState.test.ts tests/pdf/highlightGeometry.test.ts
npm run build
```

Expected: all tests, TypeScript, and production bundle PASS.

- [ ] **Step 7: Commit observer integration**

```bash
git add src/pdf/pageObserver.ts src/pdf/marginPanelRenderer.ts styles.css tests/pdf/marginPanelRenderer.test.ts
git commit -m "feat(pdf): coordinate margin rails across pages"
```

---

### Task 6: Validate approved behavior in the real vault

**Files:**
- Modify only after observation: `docs/superpowers/specs/2026-09-02-pdf-multipage-margin-panel-design.md`

**Interfaces:**
- Consumes: Tasks 1–5 and the six-case corpus from Marco 3.
- Produces: human acceptance evidence or concrete defects; it does not authorize exporter or Atlas work.

- [ ] **Step 1: Start from a clean functional import**

Use the established reset/import workflow for `UnifiedDevOps Selective Coding ITE5 ICA` and select **Somente leitura**. Do not open or edit the project in Atlas.

- [ ] **Step 2: Validate all six groups**

Inspect D1 Figure 2 (6–7), D1 Autonomy (8–9), D2 infra background (8–9), D5 Which approach (2–3), D8 operational responsibilities (5–6), and D8 People downstream (6–7). For every visible `marker × code`, confirm one continuous rail through the real gap, only global endpoint ticks, one dot, one label at full-rail center, and no segment-local duplicate label. A center in the gap must remain in the gap.

- [ ] **Step 3: Validate multicoder identity and interaction**

Confirm coincident coder markers remain separate rails/labels. Switch profiles and verify active colors, neutral non-owner colors, and read-only mutation protection. Hover above/below the page boundary and on the label; all loaded highlight segments for that marker must react. Click the label and confirm the correct logical marker opens once.

- [ ] **Step 4: Validate lifecycle and non-regression**

At multiple zoom levels, with thumbnail sidebar open/closed, and after scrolling away/back, confirm alignment, stable convergence, centered labels, and no stale panels. Confirm a simple PDF text marker retains its rail, label, hover, click, and two handles; a shape retains its rail; a new cross-page selection creates one non-resizable rail and deletes once; a Markdown note with disjoint, overlapping, adjacent, and multi-code markers is unchanged.

- [ ] **Step 5: Record observed evidence and gate continuation**

Append `## Resultado observado` to the Marco 4 spec with the six-case result, zoom/sidebar result, simple/shape/Markdown result, and every defect found. Stop and fix an in-scope defect before Task 7. Do not expand fixes into redesign, exporter, or Atlas work.

---

### Task 7: Consolidate verification and close Marco 4

**Files:**
- Modify when manual evidence requires coverage: the four new test files from Tasks 1–4.
- Modify: `docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`
- Modify: `docs/superpowers/specs/2026-09-02-pdf-multipage-margin-panel-design.md`

**Interfaces:**
- Consumes: approved manual validation.
- Produces: green focused/full suites, build, clean diff, and closure of Marco 4 only.

- [ ] **Step 1: Lock down manual defects**

For every Task 6 defect, add the smallest failing assertion to the relevant new test, run that file to demonstrate failure, apply the minimum in-scope correction, and rerun to pass. If no defect appeared, record `Nenhum defeito adicional observado na validação manual` and do not invent coverage.

- [ ] **Step 2: Run the complete focused set**

```bash
npx vitest run tests/core/marginPanelLayout.test.ts tests/markdown/marginPanelLayout.test.ts tests/markdown/markerPositionUtils.test.ts tests/pdf/pdfMarginPanelLayout.test.ts tests/pdf/marginPanelRenderer.test.ts tests/pdf/pdfMarkerSegments.test.ts tests/pdf/resolvePendingMultipage.test.ts tests/pdf/pdfCodingModel.test.ts tests/pdf/pdfViewState.test.ts tests/pdf/highlightGeometry.test.ts tests/pdf/pdfSidebarAdapter.test.ts tests/core/navigateToMarker.test.ts
```

Expected: all tests PASS. Record exact test/file totals.

- [ ] **Step 3: Run full verification**

```bash
npm test
npm run build
git diff --check
```

Expected: full suite, production build, and whitespace validation PASS. Record exact totals.

- [ ] **Step 4: Audit forbidden scope**

```bash
git diff --stat 11d5ed8..HEAD
git diff --name-only 11d5ed8..HEAD
git diff 11d5ed8..HEAD -- src/export src/import
rg -n "×N|filter.*coder|resize.*multipage|Atlas" src/core/marginPanelLayout.ts src/pdf/pdfMarginPanelLayout.ts src/pdf/marginPanelRenderer.ts src/pdf/pageObserver.ts src/markdown/cm6/marginPanelLayout.ts
```

Expected: no importer/exporter diff and no compaction, coder filter, cross-page resize, or Atlas behavior. Scope comments are allowed.

- [ ] **Step 5: Mark only Marco 4 complete**

Check the Marco 4 items in the parent multicoder spec. Leave Marcos 5, 6, and 7 unchecked. In the Marco 4 spec, change state to completed and record exact automated totals, six-case manual result, Markdown/simple/shape/zoom/sidebar outcomes, deferred multipage resize, and confirmation that redesign/exporter/Atlas stayed outside the diff.

- [ ] **Step 6: Commit closure and stop**

```bash
git add tests/core/marginPanelLayout.test.ts tests/markdown/marginPanelLayout.test.ts tests/pdf/pdfMarginPanelLayout.test.ts tests/pdf/marginPanelRenderer.test.ts docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md docs/superpowers/specs/2026-09-02-pdf-multipage-margin-panel-design.md
git commit -m "test(pdf): close multipage margin panel milestone"
```

Omit unchanged test paths from `git add`. Report commit IDs, manual evidence, focused/full totals, and build status. Stop before Marco 5 redesign, Marco 6 exporter, or Marco 7 Atlas integration.
