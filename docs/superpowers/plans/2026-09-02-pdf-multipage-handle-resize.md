# PDF Multipage Handle Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing two-handle PDF resize interaction work reliably for both simple and multipage markers, including live highlight/handle/margin feedback and automatic simple↔multipage conversion.

**Architecture:** Represent drag positions as document endpoints ordered by page, index, and offset. A pure geometry builder derives the existing scalar or `segments[]` representation from those endpoints; the model exposes silent preview and single-notify commit APIs; `dragHandles.ts` owns the last-valid drag transaction while `PdfPageObserver` resolves document hits and refreshes only affected visual projections during preview.

**Tech Stack:** TypeScript 5, Vitest 4, jsdom, Obsidian native PDF.js viewer, existing PDF highlight/handle renderer and document-level margin overlay.

**Spec:** `docs/superpowers/specs/2026-09-02-pdf-multipage-handle-resize-design.md`

## Global Constraints

- Preserve the current persisted `PdfMarker`/`PdfMarkerSegment` schema.
- Use exactly two logical handles: start of the first segment and end of the last.
- Both endpoints may cross page boundaries.
- Derive `segments[]` automatically; remove it when both endpoints share one page.
- Use the existing document order rule generalized to `page`, `index`, `offset`.
- Preview must not save, notify, or change `updatedAt`.
- Mouseup must commit the last valid preview exactly once without a second hit-test.
- PDF highlights, active handles, and margin rails must follow valid drag previews.
- Keep the existing ~60 fps mousemove throttle.
- Only markers editable by the active coder receive handles or mutations.
- Keep codes, memo, magnitude, relations, authorship, imported hints, and GUIDs unchanged.
- Do not modify importer, exporter, QDPX round-trip, Atlas integration, Markdown behavior, handle styling, or margin-panel layout policy.

## File Structure

- Create `src/pdf/pdfMarkerResize.ts` — pure document endpoints, geometry derivation, cloning, page sets, and last-valid drag transaction.
- Create `tests/pdf/pdfMarkerResize.test.ts` — pure simple/multipage conversion and transaction contracts.
- Modify `src/pdf/pdfCodingModel.ts` — silent preview, restore, and single-notify geometry commit.
- Modify `tests/pdf/pdfCodingModel.test.ts` — ownership and persistence contracts.
- Modify `src/pdf/dragHandles.ts` — individual logical handles, document hit callback, and last-valid mouseup.
- Create `tests/pdf/dragHandles.test.ts` — DOM event and commit-without-second-hit-test coverage.
- Modify `src/pdf/highlightRenderer.ts` — page-local fast-path update/clear that returns fresh render info.
- Modify `src/pdf/pageObserver.ts` — document hit resolution, affected-page preview coordinator, logical handle roles, and live margin snapshots.
- Modify `tests/pdf/pageObserverMarginPanel.test.ts` — observer preview/lifecycle contracts.
- Modify governing specs only after manual acceptance to record Marco 5 closure.

---

### Task 1: Build pure endpoint geometry and drag transaction

**Files:**
- Create: `src/pdf/pdfMarkerResize.ts`
- Create: `tests/pdf/pdfMarkerResize.test.ts`

**Interfaces:**
- Consumes: `PdfMarker`, `PdfMarkerSegment`, `TextContentItem`, `getPdfMarkerSegments`, `joinPdfMarkerSegmentText`.
- Produces:

```ts
export interface PdfDocumentEndpoint {
  page: number;
  index: number;
  offset: number;
}

export interface PdfResizePageText {
  page: number;
  items: readonly Pick<TextContentItem, 'str' | 'hasEOL'>[];
}

export interface PdfMarkerGeometry {
  page: number;
  beginIndex: number;
  beginOffset: number;
  endIndex: number;
  endOffset: number;
  text: string;
  segments?: PdfMarkerSegment[];
}

export interface PdfMarkerDragTransaction {
  originalGeometry: PdfMarkerGeometry;
  lastValidGeometry: PdfMarkerGeometry | null;
}

export function comparePdfDocumentEndpoints(a: PdfDocumentEndpoint, b: PdfDocumentEndpoint): number;
export function getPdfMarkerEndpoints(marker: PdfMarker): { start: PdfDocumentEndpoint; end: PdfDocumentEndpoint };
export function getPdfMarkerGeometry(marker: PdfMarker): PdfMarkerGeometry;
export function buildPdfMarkerGeometry(marker: PdfMarker, start: PdfDocumentEndpoint, end: PdfDocumentEndpoint, pages: readonly PdfResizePageText[]): PdfMarkerGeometry | null;
export function pdfMarkerGeometryPages(geometry: PdfMarkerGeometry): Set<number>;
export function beginPdfMarkerDrag(marker: PdfMarker): PdfMarkerDragTransaction;
export function acceptPdfMarkerDragGeometry(transaction: PdfMarkerDragTransaction, geometry: PdfMarkerGeometry): void;
export function finishPdfMarkerDrag(transaction: PdfMarkerDragTransaction): PdfMarkerGeometry | null;
```

- [ ] **Step 1: Write failing endpoint and conversion tests**

Create fixtures with three page sources:

```ts
const pages: PdfResizePageText[] = [
  { page: 1, items: [{ str: 'alpha beta', hasEOL: false }] },
  { page: 2, items: [{ str: 'middle page', hasEOL: false }] },
  { page: 3, items: [{ str: 'gamma delta', hasEOL: false }] },
];

it('orders endpoints by page, index, then offset', () => {
  expect(comparePdfDocumentEndpoints(
    { page: 1, index: 9, offset: 9 },
    { page: 2, index: 0, offset: 0 },
  )).toBeLessThan(0);
  expect(comparePdfDocumentEndpoints(
    { page: 2, index: 1, offset: 4 },
    { page: 2, index: 1, offset: 5 },
  )).toBeLessThan(0);
});

it('turns one page into scalar geometry', () => {
  const result = buildPdfMarkerGeometry(marker, {
    page: 1, index: 0, offset: 0,
  }, {
    page: 1, index: 0, offset: 5,
  }, pages);
  expect(result).toMatchObject({
    page: 1, beginIndex: 0, beginOffset: 0,
    endIndex: 0, endOffset: 5, text: 'alpha',
  });
  expect(result?.segments).toBeUndefined();
});

it('builds partial boundaries and complete middle pages', () => {
  const result = buildPdfMarkerGeometry(marker, {
    page: 1, index: 0, offset: 6,
  }, {
    page: 3, index: 0, offset: 5,
  }, pages);
  expect(result?.segments?.map((segment) => [segment.page, segment.text]))
    .toEqual([[1, 'beta'], [2, 'middle page'], [3, 'gamma']]);
  expect(result?.text).toBe('beta\fmiddle page\fgamma');
});

it('rejects equal, inverted, missing-page and invalid item endpoints', () => {
  const same = { page: 1, index: 0, offset: 2 };
  expect(buildPdfMarkerGeometry(marker, same, same, pages)).toBeNull();
  expect(buildPdfMarkerGeometry(marker, { page: 3, index: 0, offset: 1 }, { page: 2, index: 0, offset: 1 }, pages)).toBeNull();
  expect(buildPdfMarkerGeometry(marker, { page: 1, index: 0, offset: 1 }, { page: 4, index: 0, offset: 1 }, pages)).toBeNull();
});
```

Also assert multipage→simple, simple→multipage, prior segment metadata preservation by matching page, input immutability, `pdfMarkerGeometryPages`, and exact first-segment scalar projection.

- [ ] **Step 2: Write failing last-valid transaction tests**

```ts
it('finishes with the last accepted geometry', () => {
  const transaction = beginPdfMarkerDrag(marker);
  const candidate = buildPdfMarkerGeometry(marker, start, movedEnd, pages)!;
  acceptPdfMarkerDragGeometry(transaction, candidate);
  expect(finishPdfMarkerDrag(transaction)).toEqual(candidate);
});

it('returns null when no valid movement occurred', () => {
  expect(finishPdfMarkerDrag(beginPdfMarkerDrag(marker))).toBeNull();
});
```

- [ ] **Step 3: Run the new tests and verify the missing-module failure**

Run: `npx vitest run tests/pdf/pdfMarkerResize.test.ts`

Expected: FAIL because `src/pdf/pdfMarkerResize.ts` does not exist.

- [ ] **Step 4: Implement immutable geometry derivation**

Implement a private text extractor with the same spacing/EOL rules currently duplicated in `selectionCapture.ts` and `dragHandles.ts`. Validate every page from `start.page` through `end.page` exists and every endpoint index/offset is within its item. For each segment, spread only prior optional segment metadata from the same page before overwriting page/range/text:

```ts
const priorByPage = new Map(
  getPdfMarkerSegments(marker).map((segment) => [segment.page, segment]),
);
const segment: PdfMarkerSegment = {
  ...priorByPage.get(page),
  page,
  beginIndex,
  beginOffset,
  endIndex,
  endOffset,
  text,
};
```

For same-page output, omit `segments`. For multipage output, set scalar fields from segment zero and compute `text` with `joinPdfMarkerSegmentText`.

- [ ] **Step 5: Implement transaction helpers without hidden mutation**

`beginPdfMarkerDrag` deep-clones `segments`; `acceptPdfMarkerDragGeometry` deep-clones the candidate; `finishPdfMarkerDrag` returns a clone or `null`. Do not retain mutable marker references.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npx vitest run tests/pdf/pdfMarkerResize.test.ts tests/pdf/pdfMarkerSegments.test.ts
npx tsc --noEmit
```

Expected: all tests and type-check PASS.

```bash
git add src/pdf/pdfMarkerResize.ts tests/pdf/pdfMarkerResize.test.ts
git commit -m "feat(pdf): derive marker geometry from document endpoints"
```

---

### Task 2: Add symmetric preview and commit APIs to the PDF model

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts`
- Modify: `tests/pdf/pdfCodingModel.test.ts`

**Interfaces:**
- Consumes: `PdfMarkerGeometry` from Task 1.
- Produces:

```ts
previewMarkerGeometry(markerId: string, geometry: PdfMarkerGeometry): boolean;
commitMarkerGeometry(markerId: string, geometry: PdfMarkerGeometry): boolean;
restoreMarkerGeometry(markerId: string, geometry: PdfMarkerGeometry): boolean;
```

- Contract: preview and commit require an editable marker; restore may only replace geometry on an existing marker so a permission change cannot strand silent preview state. Preview/restore do not save, notify, emit marker mutations, or change `updatedAt`; commit applies geometry, updates `updatedAt`, and invokes one `notify`.

- [ ] **Step 1: Extend the model fixture so persistence is observable**

Return the `dataManager.setSection` mock with the model, or expose it through a local fixture helper. Add a marker owned by `human:default` using `insertMarkerRaw`, then clear mock history before each assertion.

- [ ] **Step 2: Write failing preview/restore tests**

```ts
it('previews and restores geometry without saving or notifying', () => {
  const listener = vi.fn();
  model.onChange(listener);
  const originalUpdatedAt = marker.updatedAt;
  expect(model.previewMarkerGeometry(marker.id, moved)).toBe(true);
  expect(model.findMarkerById(marker.id)).toMatchObject(moved);
  expect(marker.updatedAt).toBe(originalUpdatedAt);
  expect(setSection).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
  expect(model.restoreMarkerGeometry(marker.id, original)).toBe(true);
  expect(model.findMarkerById(marker.id)).toMatchObject(original);
});
```

Assert explicitly that applying scalar geometry sets `marker.segments` to `undefined`, rather than leaving the prior array attached.

- [ ] **Step 3: Write failing single-commit and ownership tests**

```ts
it('commits geometry with exactly one save and notification', () => {
  const listener = vi.fn();
  model.onChange(listener);
  expect(model.commitMarkerGeometry(marker.id, moved)).toBe(true);
  expect(setSection).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(marker.updatedAt).toBeGreaterThan(originalUpdatedAt);
});
```

Use a plugin fixture whose `canEditMarker` returns false and assert preview/commit return false without mutation. Assert restore can replace only geometry on an existing marker without saving. Update `canResizeMarker` expectations so an editable multipage marker returns true and a foreign marker returns false.

- [ ] **Step 4: Run tests and verify missing methods fail**

Run: `npx vitest run tests/pdf/pdfCodingModel.test.ts`

Expected: FAIL on missing geometry APIs and old multipage resize guard.

- [ ] **Step 5: Implement one private geometry applicator**

```ts
private applyMarkerGeometry(marker: PdfMarker, geometry: PdfMarkerGeometry): void {
  marker.page = geometry.page;
  marker.beginIndex = geometry.beginIndex;
  marker.beginOffset = geometry.beginOffset;
  marker.endIndex = geometry.endIndex;
  marker.endOffset = geometry.endOffset;
  marker.text = geometry.text;
  marker.segments = geometry.segments?.map((segment) => ({ ...segment }));
}
```

Use it from preview, restore, and commit. Change `canResizeMarker` to return `this.isMarkerEditable(marker)`. Keep legacy `updateMarkerRangeSilent` for the unrelated pending-neighbor resolver until its call site is separately migrated; do not broaden that method to multipage.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npx vitest run tests/pdf/pdfCodingModel.test.ts tests/pdf/pdfMarkerResize.test.ts tests/pdf/pdfMarkerSegments.test.ts
npx tsc --noEmit
```

Expected: PASS.

```bash
git add src/pdf/pdfCodingModel.ts tests/pdf/pdfCodingModel.test.ts
git commit -m "feat(pdf): preview and commit logical marker geometry"
```

---

### Task 3: Make dragHandles commit the last valid preview

**Files:**
- Modify: `src/pdf/dragHandles.ts`
- Create: `tests/pdf/dragHandles.test.ts`

**Interfaces:**
- Consumes: Task 1 transaction and geometry types.
- Produces:

```ts
export interface PdfDocumentHit {
  endpoint: PdfDocumentEndpoint;
  pageView: PDFPageView;
}

export interface LogicalHandleOptions {
  start: boolean;
  end: boolean;
}

export interface DragHandleCallbacks {
  resolveHit: (clientX: number, clientY: number) => PdfDocumentHit | null;
  buildGeometry: (markerId: string, type: 'start' | 'end', hit: PdfDocumentHit) => PdfMarkerGeometry | null;
  onGeometryPreview: (markerId: string, geometry: PdfMarkerGeometry, type: 'start' | 'end', handle: HTMLElement) => void;
  onGeometryCommit: (markerId: string, geometry: PdfMarkerGeometry) => void;
  onGeometryRestore: (markerId: string, geometry: PdfMarkerGeometry) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onHandleHover?: (markerId: string | null) => void;
}

export function logicalHandleOptions(projection: PdfMarkerPageProjection): LogicalHandleOptions;
export function attachLogicalDragHandles(info: MarkerRenderInfo, pageView: PDFPageView, options: LogicalHandleOptions, callbacks: DragHandleCallbacks): void;
```

- [ ] **Step 1: Write a DOM test for endpoint-specific handles**

Build a `MarkerRenderInfo` with a layer and assert `{ start: true, end: false }` creates only `.codemarker-pdf-handle-start`, `{ start: false, end: true }` only the end handle, and both true creates exactly two.

Also cover `logicalHandleOptions`: a simple projection gets both roles, the first
multipage projection only start, an intermediate projection neither, and the last
projection only end.

- [ ] **Step 2: Write the mouseup regression test**

Mock `Date.now` so mousemove is accepted. Make `resolveHit` return one valid hit during `mousemove`; make no additional call possible on `mouseup`. Dispatch `mousedown`, `mousemove`, then `mouseup` and assert:

```ts
expect(callbacks.resolveHit).toHaveBeenCalledTimes(1);
expect(callbacks.onGeometryPreview).toHaveBeenCalledOnce();
expect(callbacks.onGeometryCommit).toHaveBeenCalledOnce();
expect(callbacks.onGeometryCommit).toHaveBeenCalledWith('marker-1', candidate);
```

This test must fail against the current code because mouseup repeats `hitTestTextLayer` and uses range-change callbacks.

- [ ] **Step 3: Write invalid-drag restore and cleanup tests**

When `resolveHit` always returns null, assert no commit and one restore of the original geometry. After mouseup, dispatch another mousemove and assert callbacks do not fire. Assert the body dragging class is removed.

- [ ] **Step 4: Refactor handle creation by role**

Extract `attachOneDragHandle(type, ...)`. Add `attachLogicalDragHandles` for the new transaction path and temporarily retain the existing `attachDragHandles` signature for the observer call site migrated in Task 5. Create only roles enabled by `LogicalHandleOptions`; keep the current SVG, positioning, dataset, hover, CSS classes, and cursor unchanged.

- [ ] **Step 5: Replace page-local range mutation with the transaction**

On mousedown call `beginPdfMarkerDrag(marker)`. On each valid throttled move call `resolveHit`, `buildGeometry`, `acceptPdfMarkerDragGeometry`, then `onGeometryPreview`. On mouseup remove listeners first, call `finishPdfMarkerDrag`, and either commit that geometry or restore the original. Do not call `resolveHit` in mouseup.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx vitest run tests/pdf/dragHandles.test.ts tests/pdf/pdfMarkerResize.test.ts
npx tsc --noEmit
```

Expected: PASS. The existing observer still uses the retained `attachDragHandles` API; do not wire document behavior in this commit.

```bash
git add src/pdf/dragHandles.ts tests/pdf/dragHandles.test.ts
git commit -m "fix(pdf): commit the last valid handle preview"
```

---

### Task 4: Add page-local visual fast paths

**Files:**
- Modify: `src/pdf/highlightRenderer.ts`
- Create: `tests/pdf/highlightRenderer.test.ts`

**Interfaces:**
- Consumes: `PdfMarkerPageProjection | null`, existing registry/file/color behavior.
- Produces:

```ts
export function updateHighlightProjectionForMarker(
  pageView: PDFPageView,
  markerId: string,
  projection: PdfMarkerPageProjection | null,
  registry: CodeDefinitionRegistry,
  fileId: string,
  isEditable: boolean,
): MarkerRenderInfo | null;

export function moveHandleToRenderInfo(
  handle: HTMLElement,
  info: MarkerRenderInfo,
  type: 'start' | 'end',
): void;
```

- [ ] **Step 1: Write failing fast-path tests**

Using a mocked text layer and the existing highlight geometry fixture pattern, assert:

- passing a projection replaces only rects for that marker and returns fresh first/last rects;
- passing `null` removes that marker's rects and returns null;
- other marker rects remain untouched;
- editability/color resolution matches full rendering;
- `moveHandleToRenderInfo` reparents the active handle to the fresh layer and positions start against `firstRectEl` or end against `lastRectEl`.

- [ ] **Step 2: Run and verify missing exports**

Run: `npx vitest run tests/pdf/highlightRenderer.test.ts`

Expected: FAIL because the fast-path APIs do not exist.

- [ ] **Step 3: Generalize the existing preview implementation**

Refactor `updateHighlightRectsForMarker` internals into `updateHighlightProjectionForMarker`. Remove old marker rects before the null check. Return `MarkerRenderInfo` after rendering. Preserve tooltips, multi-code opacity, hidden-code handling, ownership color, and other marker DOM.

Keep `updateHighlightRectsForMarker` as a compatibility wrapper for the pending-neighbor call path if still used.

- [ ] **Step 4: Export safe handle movement**

Move the positioning calculation behind `moveHandleToRenderInfo`. Reparent before applying styles. Do not create a new handle or replace its event listeners during an active drag.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx vitest run tests/pdf/highlightRenderer.test.ts tests/pdf/highlightGeometry.test.ts tests/pdf/dragHandles.test.ts
npx tsc --noEmit
```

Expected: PASS.

```bash
git add src/pdf/highlightRenderer.ts tests/pdf/highlightRenderer.test.ts
git commit -m "refactor(pdf): expose marker drag visual fast paths"
```

---

### Task 5: Coordinate document-wide resize in PdfPageObserver

**Files:**
- Modify: `src/pdf/pageObserver.ts`
- Modify: `tests/pdf/pageObserverMarginPanel.test.ts`
- Modify: `src/pdf/pdfViewerAccess.ts`
- Modify: `src/pdf/dragHandles.ts`

**Interfaces:**
- Consumes: Tasks 1–4 APIs and existing margin snapshot/layout functions.
- Produces private observer methods with these exact responsibilities:

```ts
private resolveDocumentHit(clientX: number, clientY: number): PdfDocumentHit | null;
private buildDragGeometry(markerId: string, type: 'start' | 'end', hit: PdfDocumentHit): PdfMarkerGeometry | null;
private previewDragGeometry(markerId: string, geometry: PdfMarkerGeometry, type: 'start' | 'end', handle: HTMLElement): void;
private commitDragGeometry(markerId: string, geometry: PdfMarkerGeometry): void;
private restoreDragGeometry(markerId: string, geometry: PdfMarkerGeometry): void;
private refreshMarginSnapshotForPage(pageNumber: number): void;
```

- [ ] **Step 1: Write failing document hit and geometry tests**

Create two loaded page divs with distinct bounding rectangles and text-layer nodes. Mock `document.caretPositionFromPoint` for a point on page 2. Assert `resolveDocumentHit` returns page 2 even when the dragged handle originated on page 1. Provide page texts 1–3 and assert `buildDragGeometry` uses the untouched opposite endpoint from the canonical marker.

- [ ] **Step 2: Write failing live margin test**

Seed observer snapshots and a simple marker. Record the current line height, invoke the preview coordinator with a longer geometry, and assert without calling model listeners:

```ts
const lineBefore = labelScroller.querySelector('.codemarker-pdf-margin-line') as HTMLElement;
const heightBefore = parseFloat(lineBefore.style.height);
(observer as any).previewDragGeometry('marker-1', longerGeometry, 'end', endHandle);
const lineAfter = labelScroller.querySelector('.codemarker-pdf-margin-line') as HTMLElement;
expect(model.previewMarkerGeometry).toHaveBeenCalledOnce();
expect(parseFloat(lineAfter.style.height)).toBeGreaterThan(heightBefore);
```

Repeat across two pages and after converting back to a single page. Assert stale page snapshots/rects no longer contribute to the rail.

- [ ] **Step 3: Implement document hit resolution**

Find the loaded page whose `div.getBoundingClientRect()` contains the pointer, obtain its `PDFPageView`, and reuse the text-layer-node/index/offset logic currently private to `dragHandles.ts`. Move that logic to a shared exported `hitTestPdfTextLayer(pageView, x, y)` in `pdfViewerAccess.ts` only if required; do not duplicate it.

- [ ] **Step 4: Build geometry from canonical endpoints and loaded page text**

Read the canonical marker from `model.findMarkerById`. Replace only the selected endpoint with the hit. Collect `getTextLayerInfo(pageView).textContentItems` for every page between endpoints and call `buildPdfMarkerGeometry`. Missing page text returns null, preserving the last valid preview.

- [ ] **Step 5: Implement the visual preview coordinator**

Before model preview, record `previousPages = pdfMarkerGeometryPages(getPdfMarkerGeometry(marker))`. Apply `model.previewMarkerGeometry`, compute `nextPages`, then for the union:

1. obtain the current page projection, if any;
2. call `updateHighlightProjectionForMarker` with that projection or null;
3. refresh the entire margin snapshot for that loaded page using current marker projections plus shapes;
4. retain the fresh render info for the dragged endpoint page.

After all snapshots are replaced, call `refreshMarginPanelLayout` once. Move the active handle to the endpoint render info without recreating it. This is the only live margin update; do not call full `renderPage` during mousemove.

- [ ] **Step 6: Implement commit and restore**

Commit calls `model.commitMarkerGeometry` once; its notify drives normal `refreshAll`. Restore calls `model.restoreMarkerGeometry`, then runs the same visual preview refresh once so an invalid/no-op drag leaves no silent geometry or stale rail.

- [ ] **Step 7: Wire logical roles in renderPage**

For each `MarkerRenderInfo`, derive `logicalHandleOptions(info.marker)`. Skip when neither role is present. Pass observer document callbacks into `attachLogicalDragHandles`. Remove the old scalar `onRangePreview`/`onRangeUpdate` callbacks and then remove the retained legacy `attachDragHandles` export after confirming no call sites remain. Keep handle hover behavior unchanged.

- [ ] **Step 8: Run focused integration and commit**

Run:

```bash
npx vitest run tests/pdf/pdfMarkerResize.test.ts tests/pdf/dragHandles.test.ts tests/pdf/highlightRenderer.test.ts tests/pdf/pageObserverMarginPanel.test.ts tests/pdf/marginPanelRenderer.test.ts tests/pdf/pdfMarginPanelLayout.test.ts tests/pdf/pdfCodingModel.test.ts tests/pdf/pdfMarkerSegments.test.ts tests/pdf/pdfViewState.test.ts tests/pdf/highlightGeometry.test.ts
npx tsc --noEmit
npm run build
```

Expected: all tests, type-check, and production build PASS.

```bash
git add src/pdf/pageObserver.ts src/pdf/pdfViewerAccess.ts tests/pdf/pageObserverMarginPanel.test.ts
git commit -m "feat(pdf): resize logical markers across pages"
```

Omit `src/pdf/pdfViewerAccess.ts` from `git add` if unchanged.

---

### Task 6: Validate the interaction in the real viewer

**Files:**
- Modify only after observation: `docs/superpowers/specs/2026-09-02-pdf-multipage-handle-resize-design.md`

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: manual acceptance evidence or a precise in-scope defect list.

- [ ] **Step 1: Validate the existing simple-marker regression first**

On a simple editable PDF marker, drag start and end independently. Confirm the highlight, active handle, and margin rail move before mouseup. Release over text, then release after the pointer briefly passes through a non-text area; the last valid position must persist in both cases. Close/reopen the PDF and confirm geometry.

- [ ] **Step 2: Validate simple→multipage→simple**

Move the end handle from page 1 into page 2. Confirm one logical marker, two handles total, continuous highlight projections, and continuous rail. Move the end back into page 1 and confirm the marker is simple again with both handles on page 1.

- [ ] **Step 3: Validate both directions on existing multipage data**

On an editable multipage marker, move the start forward/backward and the end backward/forward. Reduce a two-page marker to one page. Expand across a third page and confirm the middle page is fully represented.

- [ ] **Step 4: Validate ownership and lifecycle**

Confirm foreign/read-only markers have no handles and cannot mutate. Repeat an owned drag after zoom, scroll, and thumbnail sidebar toggle. Confirm no duplicate handles, stale highlights, stale rails, or body dragging class remains.

- [ ] **Step 5: Confirm non-scope regressions are absent**

Confirm codes, memo, colors and authorship survive resize; shape markers are unchanged; Markdown handle and margin behavior is unchanged. Do not export or open Atlas during this task.

- [ ] **Step 6: Record exact evidence**

Append `## Resultado observado` to the Marco 5 spec listing the PDFs/pages used, simple↔multipage conversions, live margin result, persistence after reopen, ownership result, zoom/sidebar result, and every defect found. Stop and fix in-scope defects before Task 7.

---

### Task 7: Consolidate verification and close Marco 5

**Files:**
- Modify when manual evidence requires coverage: tests from Tasks 1–5.
- Modify: `docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`
- Modify: `docs/superpowers/specs/2026-09-02-pdf-multipage-handle-resize-design.md`

**Interfaces:**
- Consumes: approved manual validation.
- Produces: green focused/full suites, build, clean scope audit, and closure of Marco 5 only.

- [ ] **Step 1: Lock down every manual defect**

For each defect, add the smallest failing assertion to the relevant test, demonstrate failure, implement the minimum in-scope correction, and rerun to pass. If no defect appears, record `Nenhum defeito adicional observado na validação manual` without inventing coverage.

- [ ] **Step 2: Run the complete focused set**

```bash
npx vitest run tests/pdf/pdfMarkerResize.test.ts tests/pdf/dragHandles.test.ts tests/pdf/highlightRenderer.test.ts tests/pdf/pageObserverMarginPanel.test.ts tests/pdf/marginPanelRenderer.test.ts tests/pdf/pdfMarginPanelLayout.test.ts tests/pdf/pdfCodingModel.test.ts tests/pdf/pdfMarkerSegments.test.ts tests/pdf/resolvePendingMultipage.test.ts tests/pdf/pdfViewState.test.ts tests/pdf/highlightGeometry.test.ts tests/pdf/pdfSidebarAdapter.test.ts tests/core/navigateToMarker.test.ts tests/markdown/marginPanelLayout.test.ts
```

Record exact file/test totals.

- [ ] **Step 3: Run full verification**

```bash
npm test
npm run build
git diff --check
```

Record exact totals and build result.

- [ ] **Step 4: Audit forbidden scope**

```bash
git diff --stat 2ca0bfd..HEAD
git diff --name-only 2ca0bfd..HEAD
git diff 2ca0bfd..HEAD -- src/import src/export src/markdown styles.css
rg -n "Atlas|QDPX|filter.*coder|×N" src/pdf/pdfMarkerResize.ts src/pdf/dragHandles.ts src/pdf/highlightRenderer.ts src/pdf/pageObserver.ts src/pdf/pdfCodingModel.ts
```

Expected: no importer/exporter/Markdown/CSS behavior diff and no margin redesign or Atlas integration. Scope comments and existing identifiers are allowed.

- [ ] **Step 5: Mark only Marco 5 complete**

Check the Marco 5 items in the parent spec. Leave Marcos 6 and 7 open. Change the Marco 5 spec state to completed and record manual evidence, focused/full totals, build, ownership, persistence, live margin feedback, simple↔multipage conversion, and the scope audit.

- [ ] **Step 6: Commit closure and stop**

```bash
git add docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md docs/superpowers/specs/2026-09-02-pdf-multipage-handle-resize-design.md
git commit -m "test(pdf): close logical marker resize milestone"
```

Include changed test paths only when Task 7 added regression coverage. Report commit IDs and exact verification totals. Stop before Marco 6 exporter work, Marco 7 Atlas validation, or margin-panel redesign.
