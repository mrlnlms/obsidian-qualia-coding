# QDPX Logical Multipage PDF Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import and create cross-page PDF codings as one logical marker per coder with ordered `segments[]`, complete local highlights, and no duplicate analytical units.

**Architecture:** Keep the persisted schema additive: legacy single-page markers remain scalar and are read through a canonical segment helper, while multipage markers persist `segments[]` and expose first-segment scalar fields only as a compatibility projection. Detect Atlas groups before ordinary PDF selection processing, resolve their full range against concatenated PDF.js text, then expose ephemeral page projections to the existing renderers without changing the margin-panel layout.

**Tech Stack:** TypeScript 5, Vitest 4, Obsidian PDF.js integration, jsdom test environment, existing `fflate` QDPX importer.

**Spec:** `docs/superpowers/specs/2026-09-02-qdpx-multipage-marker-design.md`

## Global Constraints

- Do not modify `src/pdf/marginPanelRenderer.ts`.
- Do not modify `src/export/qdpxExporter.ts` or add multipage export behavior.
- Do not implement margin-panel rails, shared lanes, unique labels, redesign, filters, or `×N` compaction.
- Do not open, validate, or adapt behavior in Atlas.
- Do not remove headers, footers, tables, captions, or cross-column content from the PDF text flow.
- Do not use `data.json` or `data.json.back.ultimo+01` as canonical evidence.
- Do not auto-group the twelve historical `marlonnn` markers.
- Do not heuristically migrate old unattributed Atlas fragments.
- Multipage markers do not support resize in this milestone; single-page resize must remain unchanged.
- Every persisted multipage marker belongs to one coder; shared QDPX origin is provenance, never shared mutable state.
- Preserve the 191 non-multipage Atlas selections as the anchoring regression baseline.
- Use focused tests while building the vertical slice, validate manually in the real vault, then consolidate corpus and full-suite coverage.

---

## File Structure

### New files

- `src/pdf/pdfMarkerSegments.ts` — canonical access, validation, text joining, equality, and ephemeral page projection for PDF marker segments.
- `src/import/qdpxMultipage.ts` — pure Atlas group detection and concatenated-text-to-page-segment resolution.
- `src/pdf/resolvePendingMultipage.ts` — conservative viewer-time recovery when import-time page-local text is ambiguous.
- `tests/pdf/pdfMarkerSegments.test.ts` — schema compatibility and page projection tests.
- `tests/import/qdpxMultipage.test.ts` — group detection and boundary projection tests.
- `tests/pdf/resolvePendingMultipage.test.ts` — first/middle/final page fallback tests.

### Existing files with focused changes

- `src/pdf/pdfCodingTypes.ts` — `PdfMarkerSegment`, `PdfMarkerPageProjection`, and additive provenance fields.
- `src/import/qdpxAuthoring.ts` — merge repeated Codings across all representations without losing source GUIDs.
- `src/import/qdpxImporter.ts` — process multipage groups before simple PDF selections, create one marker per coder, and update import audit counts.
- `src/pdf/pdfCodingModel.ts` — logical lookup/creation, page projections, segment resolution, and scalar-resize guard.
- `src/pdf/pageObserver.ts` — resolve and render page projections while keeping the existing margin renderer untouched.
- `src/pdf/highlightRenderer.ts` — per-marker resize eligibility only; no margin-panel behavior.
- `src/pdf/pdfCodingMenu.ts` — one logical popover target for one or many captured page ranges.
- `src/pdf/index.ts` — open a logical marker using all of its segments.
- `src/pdf/views/pdfSidebarAdapter.ts`, `src/core/markerResolvers.ts`, `src/core/navigateToMarker.ts`, `src/analytics/data/dataConsolidator.ts` — one logical listing, label, navigation target, and analytical record.
- `src/pdf/pdfPlainText.ts`, `src/pdf/pdfExportData.ts` — retain per-page PDF.js text items from the existing single extraction pass so imported segments can receive DOM-aligned indices.
- `src/core/icr/textRange.ts`, `src/core/icr/kappaInput.ts`, `src/core/icr/reporter.ts`, `src/core/icr/ui/scopeExtraction.ts`, `src/core/icr/ui/regionDerivation.ts`, `src/core/icr/icrMarkerOpsImpl.ts`, `src/core/icr/contributions/overlapHelper.ts` — segment-aware spatial ranges with unique logical marker counts.
- Existing focused tests under `tests/import/`, `tests/pdf/`, `tests/core/icr/`, and `tests/analytics/`.

---

### Task 1: Add the additive segment contract and canonical helpers

**Files:**
- Modify: `src/pdf/pdfCodingTypes.ts`
- Create: `src/pdf/pdfMarkerSegments.ts`
- Create: `tests/pdf/pdfMarkerSegments.test.ts`

**Interfaces:**
- Consumes: existing `PdfMarker`, `PdfSelectionBBoxHint`, and scalar page/index/offset fields.
- Produces:
  - `PdfMarkerSegment`
  - `PdfMarkerPageProjection`
  - `PdfMarkerRangeChanges`
  - `getPdfMarkerSegments(marker: PdfMarker): readonly PdfMarkerSegment[]`
  - `isMultipagePdfMarker(marker: PdfMarker): boolean`
  - `isPdfMarkerSegmentPending(segment: PdfMarkerSegment): boolean`
  - `joinPdfMarkerSegmentText(segments: readonly PdfMarkerSegment[]): string`
  - `samePdfMarkerSegments(a, b): boolean`
  - `syncPdfMarkerFirstSegmentProjection(marker: PdfMarker): void`
  - `projectPdfMarkerToPage(marker: PdfMarker, page: number): PdfMarkerPageProjection[]`

- [ ] **Step 1: Write failing compatibility and projection tests**

```ts
const legacy = marker({ page: 3, beginIndex: 4, beginOffset: 1, endIndex: 8, endOffset: 2, text: 'legacy' });
expect(getPdfMarkerSegments(legacy)).toEqual([{
  page: 3, beginIndex: 4, beginOffset: 1, endIndex: 8, endOffset: 2,
  text: 'legacy', resolution: 'resolved',
}]);

const logical = marker({
  page: 6, beginIndex: 10, beginOffset: 2, endIndex: 30, endOffset: 4,
  text: 'first\fsecond',
  segments: [segment(6, 10, 2, 30, 4, 'first'), segment(7, 0, 0, 5, 6, 'second')],
});
expect(isMultipagePdfMarker(logical)).toBe(true);
expect(projectPdfMarkerToPage(logical, 7)[0]).toMatchObject({
  id: logical.id, page: 7, beginIndex: 0, endIndex: 5,
  renderSegmentIndex: 1, renderSegmentCount: 2,
});
```

- [ ] **Step 2: Run the focused test and verify the missing API failure**

Run: `npm test -- --run tests/pdf/pdfMarkerSegments.test.ts`

Expected: FAIL because the new types and helpers do not exist.

- [ ] **Step 3: Add the additive types**

```ts
export interface PdfMarkerSegment {
  page: number;
  beginIndex: number;
  beginOffset: number;
  endIndex: number;
  endOffset: number;
  text: string;
  importedSelectionGuid?: string;
  importedPdfSelectionBBox?: PdfSelectionBBoxHint;
  resolution?: 'resolved' | 'pending';
}

export interface PdfMarkerPageProjection extends PdfMarker {
  renderSegmentIndex: number;
  renderSegmentCount: number;
  renderSegmentResolution: 'resolved' | 'pending';
  logicalText: string;
}

export type PdfMarkerRangeChanges = Partial<Pick<
  PdfMarkerSegment,
  'beginIndex' | 'beginOffset' | 'endIndex' | 'endOffset' | 'text'
>>;
```

Add `segments?: PdfMarkerSegment[]` to `PdfMarker` and add
`selectionGuids?: string[]` to `QdpxSelectionProvenance`. Keep every existing
scalar field required for source compatibility.

- [ ] **Step 4: Implement canonical helper invariants**

```ts
export function getPdfMarkerSegments(marker: PdfMarker): readonly PdfMarkerSegment[] {
  if (marker.segments?.length) return marker.segments;
  return [{
    page: marker.page,
    beginIndex: marker.beginIndex,
    beginOffset: marker.beginOffset,
    endIndex: marker.endIndex,
    endOffset: marker.endOffset,
    text: marker.text,
    importedPdfSelectionBBox: marker.importedPdfSelectionBBox,
    resolution: isScalarRangePending(marker) ? 'pending' : 'resolved',
  }];
}

function isScalarRangePending(marker: PdfMarker): boolean {
  return marker.beginIndex === 0
    && marker.beginOffset === 0
    && marker.endIndex === 0
    && marker.endOffset === 0;
}

export function projectPdfMarkerToPage(marker: PdfMarker, page: number): PdfMarkerPageProjection[] {
  return getPdfMarkerSegments(marker).flatMap((segment, index) => segment.page !== page ? [] : [{
    ...marker,
    page: segment.page,
    beginIndex: segment.beginIndex,
    beginOffset: segment.beginOffset,
    endIndex: segment.endIndex,
    endOffset: segment.endOffset,
    text: segment.text,
    importedPdfSelectionBBox: segment.importedPdfSelectionBBox,
    renderSegmentIndex: index,
    renderSegmentCount: getPdfMarkerSegments(marker).length,
    renderSegmentResolution: segment.resolution ?? 'resolved',
    logicalText: marker.text,
  }]);
}
```

`syncPdfMarkerFirstSegmentProjection` must copy the first segment into the scalar
fields. It must never copy scalar fields back into an existing `segments[]`.

- [ ] **Step 5: Run focused tests and type-check the additive contract**

Run: `npm test -- --run tests/pdf/pdfMarkerSegments.test.ts`

Expected: PASS.

Run: `npx tsc -noEmit`

Expected: PASS; no existing caller is forced to understand segments yet.

- [ ] **Step 6: Commit the contract**

```bash
git add src/pdf/pdfCodingTypes.ts src/pdf/pdfMarkerSegments.ts tests/pdf/pdfMarkerSegments.test.ts
git commit -m "feat(pdf): add logical marker segment contract"
```

---

### Task 2: Detect Atlas groups and resolve concatenated text into segments

**Files:**
- Create: `src/import/qdpxMultipage.ts`
- Create: `src/pdf/resolvePendingMultipage.ts`
- Create: `tests/import/qdpxMultipage.test.ts`
- Create: `tests/pdf/resolvePendingMultipage.test.ts`
- Modify: `src/pdf/pdfPlainText.ts`
- Modify: `src/pdf/pdfExportData.ts`
- Modify: `tests/pdf/pdfPlainText.test.ts`
- Modify: `src/import/qdpxImporter.ts` only to re-export or replace the old detector after tests pass

**Interfaces:**
- Consumes: structural `ParsedSelection` values, QDPX Representation text, PDF.js consolidated text, `pageStartOffsets`, and per-page PDF.js text items.
- Produces:
  - `QdpxPdfMultipageGroup`
  - `detectQdpxPdfMultipageGroups(selections: ParsedSelection[]): QdpxPdfMultipageGroup[]`
  - `resolveQdpxMultipageRange(args): QdpxMultipageResolution`
  - `resolvePendingMultipageProjection(pageEl, projection): PdfMarkerRangeChanges | null` from the PDF-specific fallback module
  - `QdpxMultipageResolution` with full logical text, ordered segments, and a deterministic diagnostic strategy.

- [ ] **Step 1: Write failing detector tests**

```ts
expect(detectQdpxPdfMultipageGroups([
  pdf('anchor', 5, 'Quote', '2026-01-01', codings),
  pdf('continuation', 6, 'Quote', '2026-01-01', codings),
  plain('anchor', 100, 500, 'Quote', codings),
])).toMatchObject([{
  groupId: 'anchor',
  anchorGuid: 'anchor',
  selectionGuids: ['anchor', 'continuation'],
}]);

expect(detectQdpxPdfMultipageGroups([
  pdf('a', 5, 'Quote', '2026-01-01', codings),
  pdf('b', 7, 'Quote', '2026-01-01', codings),
  plain('a', 100, 500, 'Quote', codings),
])).toEqual([]);
```

Also prove that a parsed `continued by` link is irrelevant to this function and
that two PDF selections with different `creatingUser + codeGuid` multisets do not
group.

- [ ] **Step 2: Run detector tests and verify failure**

Run: `npm test -- --run tests/import/qdpxMultipage.test.ts`

Expected: FAIL because `detectQdpxPdfMultipageGroups` does not exist.

- [ ] **Step 3: Implement strict group detection**

```ts
function codingSignature(selection: ParsedSelection): string {
  return selection.codings
    .map(c => `${c.creatingUserGuid ?? ''}\u0000${c.codeGuid}`)
    .sort()
    .join('\u0001');
}
```

Group only adjacent unique PDF pages with equal normalized name, selection
timestamp, and semantic coding signature. Require exactly one group GUID to have
a PlainText counterpart. Return fragments sorted by viewer page.

- [ ] **Step 4: Write failing concatenated-range tests**

```ts
const group = multipageGroup([1, 2]);
const pdfText = 'before start of quoteheader continuation and end after';
const starts = [0, pdfText.indexOf('\f') + 1];
const result = resolveQdpxMultipageRange({
  group,
  qdpxPlainText: 'prefix start of quote header continuation and end suffix',
  pdfPlainText: pdfText,
  pdfPageStartOffsets: starts,
  pdfPageTextItems: pageItems({
    1: [{ str: 'before' }, { str: 'start of quote' }],
    2: [{ str: 'header continuation and end' }, { str: 'after' }],
  }),
});

expect(result.strategy).toBe('resolved');
expect(result.segments).toEqual([
  expect.objectContaining({ page: 1, text: 'start of quote', resolution: 'resolved' }),
  expect.objectContaining({ page: 2, text: 'header continuation and end', resolution: 'resolved' }),
]);
expect(result.text).toBe('start of quote\fheader continuation and end');
```

Add cases for whitespace drift, soft hyphen, `\uFFFD`, NFKC ligatures, an
intermediate full page, and ambiguous endpoints returning `strategy: 'pending'`
instead of a truncated range.

- [ ] **Step 5: Implement mapped normalization and endpoint resolution**

```ts
interface NormalizedMappedText {
  text: string;
  rawStart: number[];
  rawEnd: number[];
}

export type QdpxMultipageResolution = {
  strategy: 'resolved' | 'pending';
  text: string;
  segments: PdfMarkerSegment[];
  reason?: 'pdf-unavailable' | 'start-not-found' | 'end-not-found' | 'ambiguous' | 'dom-range-not-found';
};
```

The resolver accepts nullable PDF.js text, offsets, and page text-item arrays. If
headless PDF loading is unavailable, it returns `strategy: 'pending'` with the
same ordered placeholder segments and provenance instead of dropping the group.

Normalize both textual universes with the same rules already proven by
`resolvePendingIndices`: discard soft hyphen and replacement characters, apply
NFKC/lowercase, keep letters and numbers, and normalize Atlas ligature aliases.
Search only within the declared page span. Resolve a unique start prefix and end
suffix in order, map them back to raw PDF offsets, then split at the page offsets.
Endpoint search keys may be capped for uniqueness; the resulting segment end must
always be the actual page boundary or resolved quote end, never key length.

Extend `buildPlainText`/`PdfExportData` to retain the already loaded
`pageTextItems: Array<Array<{ str?: string }>>`; do not perform a second PDF pass.
After splitting the complete range, call
`resolvePendingIndicesInTextContentItems(pageTextItems[viewerPage - 1], localText)`
for each page and persist its returned DOM-aligned coordinates. Tests use a small
`pageItems({ viewerPage: items })` fixture helper to make that conversion explicit.
A fully resolved result has
`resolution: 'resolved'` on every segment. If local content is known but a text
item range is not, retain that local text with zero indices and
`resolution: 'pending'`. If the global endpoints are ambiguous, still create one
ordered placeholder segment per declared fragment, preserve each fragment
GUID/BBox, and leave its local text empty. Neither pending case may fabricate a
shortened quote or fall back to independent markers.

- [ ] **Step 6: Add deterministic viewer-time recovery for unresolved local text**

In `src/pdf/resolvePendingMultipage.ts`, write jsdom tests for
`resolvePendingMultipageProjection(pageEl, projection)` covering
first, intermediate, and final pages. It uses `projection.logicalText` plus
`renderSegmentIndex/renderSegmentCount`: the first page resolves the unique quote
prefix through the final non-empty text-layer node, intermediate pages span all
non-empty nodes, and the final page spans the first non-empty node through the
unique quote suffix. For a two-page quotation, apply the first and final rules to
their respective pages. Return `null` on non-unique endpoints; return coordinates
and the exact extracted local text on success. BBox may narrow candidates but may
not override textual order.

- [ ] **Step 7: Replace the old hint-only detector without changing simple imports**

Keep `buildPdfMultipageFragmentHints` as a compatibility wrapper if existing tests
or diagnostics consume it:

```ts
export function buildPdfMultipageFragmentHints(src: ParsedSource) {
  return hintsFromGroups(detectQdpxPdfMultipageGroups(src.selections));
}
```

- [ ] **Step 8: Run focused import and anchoring tests**

Run: `npm test -- --run tests/import/qdpxMultipage.test.ts tests/import/qdpxImporter.test.ts tests/pdf/resolvePendingMultipage.test.ts tests/pdf/resolvePendingIndices.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the pure detector and resolver**

```bash
git add src/import/qdpxMultipage.ts src/pdf/resolvePendingMultipage.ts src/pdf/pdfPlainText.ts src/pdf/pdfExportData.ts src/import/qdpxImporter.ts tests/import/qdpxMultipage.test.ts tests/pdf/resolvePendingMultipage.test.ts tests/pdf/pdfPlainText.test.ts tests/import/qdpxImporter.test.ts
git commit -m "feat(import): resolve Atlas multipage PDF ranges"
```

---

### Task 3: Import one logical multipage marker per coder

**Files:**
- Modify: `src/import/qdpxAuthoring.ts`
- Modify: `src/import/qdpxImporter.ts`
- Modify: `tests/import/qdpxAuthoring.test.ts`
- Modify: `tests/import/qdpxImporter.test.ts`

**Interfaces:**
- Consumes: `QdpxPdfMultipageGroup`, `QdpxMultipageResolution`, `resolveCoderApplications`, and the coder GUID registry from Marcos 1–2.
- Produces:
  - `mergeQdpxRepresentationCodings(selections: ParsedSelection[]): ParsedQdpxCoding[]`
  - `createPdfMultipageMarkers(...)`
  - resolver mappings from every fragment GUID to every logical coder marker ID.

- [ ] **Step 1: Write failing three-representation Coding merge tests**

```ts
const merged = mergeQdpxRepresentationCodings([
  selection(coding('pdf-anchor-guid', 'user-a', 'code-x')),
  selection(coding('plain-guid', 'user-a', 'code-x')),
  selection(coding('continuation-guid', 'user-a', 'code-x')),
]);

expect(merged).toEqual([expect.objectContaining({
  creatingUserGuid: 'user-a',
  codeGuid: 'code-x',
  sourceCodingGuids: ['pdf-anchor-guid', 'plain-guid', 'continuation-guid'],
})]);
```

Add a second coder with the same code and prove it remains a separate semantic
application.

- [ ] **Step 2: Run authoring tests and verify failure**

Run: `npm test -- --run tests/import/qdpxAuthoring.test.ts`

Expected: FAIL because the representation-level merge function is missing.

- [ ] **Step 3: Implement deterministic Coding merge**

Use `creatingUserGuid + codeGuid` as the semantic key. Union source Coding GUIDs
in representation order, union note GUIDs, retain the first defined Coding GUID,
and choose the earliest valid creation timestamp. Do not deduplicate by `codeGuid`
alone.

- [ ] **Step 4: Write failing logical-marker importer tests**

```ts
const count = createPdfMultipageMarkers({
  group,
  resolution,
  filePath: 'imports/paper.pdf',
  userGuidToCoderId: new Map([['user-a', 'human:a'], ['user-b', 'human:b']]),
  ...dependencies,
});

expect(count).toBe(2);
expect(pdfData.markers).toHaveLength(2);
expect(pdfData.markers[0]).toMatchObject({
  codedBy: 'human:a',
  page: 6,
  importedQdpxSelection: {
    selectionGuid: 'anchor',
    selectionGuids: ['anchor', 'continuation'],
  },
});
expect(pdfData.markers[0].segments).toHaveLength(2);
expect(pdfData.markers[0].codes[0].qdpx.sourceCodingGuids).toHaveLength(3);
```

Prove that geometries of coder siblings are deep-independent and that an unknown
owner produces one read-only unattributed logical marker plus one warning.

- [ ] **Step 5: Process groups before the ordinary PDF loop**

Retain the complete result of `loadPdfExportData` as nullable `pdfJsData`; do not
destructure only `pageDims`. Keep the QDPX PlainText Representation in the
separately named `qdpxRepresentationText` so the two textual universes cannot be
accidentally interchanged. Load PDF.js once for PDF sources that contain PDF
selections. On failure, retain the warning and let the resolver produce a pending
logical group rather than reverting to fragment markers:

```ts
const groups = detectQdpxPdfMultipageGroups(src.selections);
const consumedPdfGuids = new Set(groups.flatMap(group => group.selectionGuids));

for (const group of groups) {
  const resolution = resolveQdpxMultipageRange({
    group,
    qdpxPlainText: qdpxRepresentationText,
    pdfPlainText: pdfJsData?.plainText ?? null,
    pdfPageStartOffsets: pdfJsData?.pageStartOffsets ?? null,
    pdfPageTextItems: pdfJsData?.pageTextItems ?? null,
  });
  count += createPdfMultipageMarkers({ group, resolution, ...dependencies });
}
```

Skip consumed PDF and PlainText selections in the existing paired-selection loop.
All non-consumed PDF selections continue through the Marco 1 path unchanged.

- [ ] **Step 6: Preserve resolver mappings and provenance**

For every created logical marker, call `addResolvedSelection` for every
`selectionGuid` in the group. Use `import_<groupId>_<coder>` as the stable local
ID. Keep `importedQdpxMultipageFragment` readable on legacy data but do not write
it as the canonical representation for new imports.

- [ ] **Step 7: Update the import audit contract**

Replace the `Sem autoria (legado multipágina)` column with ordinary unattributed
statistics. In the six known groups the expected unattributed count is zero.
Include logical-marker and segment totals without treating segments as markers:

```ts
interface QdpxPdfAuditStats {
  markers: number;
  applications: number;
  segments?: number;
}
```

- [ ] **Step 8: Run focused importer tests**

Run: `npm test -- --run tests/import/qdpxAuthoring.test.ts tests/import/qdpxImporter.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit logical import normalization**

```bash
git add src/import/qdpxAuthoring.ts src/import/qdpxImporter.ts tests/import/qdpxAuthoring.test.ts tests/import/qdpxImporter.test.ts
git commit -m "feat(import): create multipage PDF markers per coder"
```

---

### Task 4: Resolve and render ephemeral page projections lazily

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts`
- Modify: `src/pdf/pageObserver.ts`
- Modify: `tests/engine-models/pdfCodingModel.test.ts`
- Modify: `tests/pdf/resolvePendingIndices.test.ts`

**Interfaces:**
- Consumes: `projectPdfMarkerToPage`, `PdfMarkerPageProjection`, and existing per-page renderers.
- Produces:
  - `PdfCodingModel.getMarkerPageProjections(file: string, page: number): PdfMarkerPageProjection[]`
  - `PdfCodingModel.resolveImportedMarkerSegmentRange(markerId: string, segmentIndex: number, changes: PdfMarkerRangeChanges): void`

- [ ] **Step 1: Write failing page-projection model tests**

```ts
dm.section('pdf').markers = [logicalMarkerWithPages(6, 7)];
model.load();

expect(model.getAllMarkers()).toHaveLength(1);
expect(model.getMarkerPageProjections('doc.pdf', 6)).toHaveLength(1);
expect(model.getMarkerPageProjections('doc.pdf', 7)[0]).toMatchObject({
  page: 7,
  renderSegmentIndex: 1,
});
```

Prove that projections are ephemeral: changing a projection object must not alter
the canonical segment until the explicit resolver method is called.

- [ ] **Step 2: Run model tests and verify failure**

Run: `npm test -- --run tests/engine-models/pdfCodingModel.test.ts`

Expected: FAIL because the projection API is missing.

- [ ] **Step 3: Implement page projection and segment resolution**

```ts
getMarkerPageProjections(file: string, page: number): PdfMarkerPageProjection[] {
  return this.markers
    .filter(marker => marker.fileId === file)
    .flatMap(marker => projectPdfMarkerToPage(marker, page));
}

resolveImportedMarkerSegmentRange(markerId: string, segmentIndex: number, changes: PdfMarkerRangeChanges): void {
  const marker = this.findMarkerById(markerId);
  const segment = marker?.segments?.[segmentIndex];
  if (!marker || !segment || !marker.id.startsWith('import_')) return;
  Object.assign(segment, changes, { resolution: 'resolved' as const });
  marker.text = joinPdfMarkerSegmentText(marker.segments);
  syncPdfMarkerFirstSegmentProjection(marker);
  marker.updatedAt = Date.now();
}
```

Keep `resolveImportedMarkerRange` for scalar legacy imports.

- [ ] **Step 4: Route page observation through projections**

Replace only the page marker source in `PdfPageObserver`:

```ts
let markers = this.model.getMarkerPageProjections(filePath, pageNumber);
```

When a projection resolves, call the segment method with
`projection.renderSegmentIndex`. Re-fetch projections before highlights and the
existing margin renderer run so rendering sees the resolved coordinates.

- [ ] **Step 5: Make audit keys segment-safe**

Use `${marker.id}:${marker.renderSegmentIndex}` as the coverage-row key while
retaining `markerId` as the logical ID in the row. Report both unique logical
marker count and audited segment count. Do not write this information into plugin
state.

- [ ] **Step 6: Preserve lazy behavior and simple-marker resolution**

Multipage segment projections must skip neighbor-page reassignment, because their
declared page is authoritative. If a pending projection has non-empty local
`text`, use its BBox hint and the existing text-item resolver. If its local text
is empty because import-time content projection was ambiguous, call
`resolvePendingMultipageProjection` before the ordinary resolver and persist the
returned exact page-local text together with its coordinates. If either path is
still ambiguous, leave that segment pending and emit diagnostics; never borrow a
neighbor page or silently shorten the logical marker. Scalar markers continue
through the current simple resolution and neighbor fallback.

- [ ] **Step 7: Run model and resolver regression tests**

Run: `npm test -- --run tests/engine-models/pdfCodingModel.test.ts tests/pdf/resolvePendingIndices.test.ts tests/import/qdpxImporter.test.ts`

Expected: PASS.

- [ ] **Step 8: Verify the forbidden panel file is untouched**

Run: `git diff --name-only 3efcd9f..HEAD`

Run: `git diff --name-only`

Expected: `src/pdf/marginPanelRenderer.ts` is absent.

- [ ] **Step 9: Commit lazy segment projection**

```bash
git add src/pdf/pdfCodingModel.ts src/pdf/pageObserver.ts tests/engine-models/pdfCodingModel.test.ts tests/pdf/resolvePendingIndices.test.ts
git commit -m "feat(pdf): render logical markers by page segment"
```

---

### Task 5: Create one manual cross-page marker and block multipage resize

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts`
- Modify: `src/pdf/pdfCodingMenu.ts`
- Modify: `src/pdf/index.ts`
- Modify: `src/pdf/highlightRenderer.ts`
- Modify: `tests/engine-models/pdfCodingModel.test.ts`

**Interfaces:**
- Consumes: existing `PdfSelectionResult[]` from `captureCrossPageSelection`.
- Produces:
  - `PdfCodingModel.findExistingMarkerBySegments(file, segments, coderId?): PdfMarker | undefined`
  - `PdfCodingModel.findOrCreateMarkerFromSegments(file, segments): PdfMarker`
  - `selectionResultToSegment(result: PdfSelectionResult): PdfMarkerSegment`
  - `canResizeMarker?: (marker: PdfMarker) => boolean` renderer callback.

- [ ] **Step 1: Write failing logical creation tests**

```ts
const marker = model.findOrCreateMarkerFromSegments('doc.pdf', [
  selectionResult(6, 10, 2, 30, 4, 'first'),
  selectionResult(7, 0, 0, 5, 6, 'second'),
]);

expect(model.getAllMarkers()).toHaveLength(1);
expect(marker.segments).toHaveLength(2);
expect(marker.text).toBe('first\fsecond');
expect(model.findOrCreateMarkerFromSegments('doc.pdf', sameResults)).toBe(marker);
```

Repeat under two active coders and prove identical segments create two logical
markers.

- [ ] **Step 2: Run model tests and verify failure**

Run: `npm test -- --run tests/engine-models/pdfCodingModel.test.ts`

Expected: FAIL because logical segment lookup and creation do not exist.

- [ ] **Step 3: Implement one-marker lookup and creation**

```ts
function selectionResultToSegment(result: PdfSelectionResult): PdfMarkerSegment {
  return {
    page: result.page,
    beginIndex: result.beginIndex,
    beginOffset: result.beginOffset,
    endIndex: result.endIndex,
    endOffset: result.endOffset,
    text: result.text,
    resolution: 'resolved',
  };
}

findOrCreateMarkerFromSegments(file: string, results: PdfSelectionResult[]): PdfMarker {
  if (this.plugin.isCodingReadOnly()) throw new Error('Cannot create PDF marker while coding participation is read-only');
  const segments = results.map(selectionResultToSegment);
  const existing = this.findExistingMarkerBySegments(file, segments);
  if (existing) return existing;
  return this.createLogicalMarker(file, segments, this.plugin.getActiveCoderId());
}
```

Make existing `findOrCreateMarker` delegate to this method with one result, while
preserving scalar-only storage for ordinary one-page markers.

- [ ] **Step 4: Refactor the popover to use one logical target**

Replace `getMarkers(): PdfMarker[]` with `getMarker(): PdfMarker`. In selection
mode it calls `findOrCreateMarkerFromSegments` once. In hover mode it resolves the
canonical marker by `hoverMarkerId`. Add/remove code, memo, magnitude, relations,
and delete each operate on that one ID.

```ts
addCode: name => {
  let def = model.registry.getByName(name);
  if (!def) def = model.registry.create(name);
  model.addCodeToMarker(getMarker().id, def.id);
}
```

- [ ] **Step 5: Open hover popovers with all logical segments**

In `src/pdf/index.ts`, convert `getPdfMarkerSegments(marker)` to the
`PdfSelectionResult[]` passed to `openPdfCodingPopover`. Navigation from a clicked
page projection still targets the same canonical marker ID.

- [ ] **Step 6: Write the failing resize guard test**

```ts
const marker = model.findOrCreateMarkerFromSegments('doc.pdf', crossPageResults);
const before = structuredClone(marker.segments);
model.updateMarkerRange(marker.id, { endOffset: 99 });
expect(marker.segments).toEqual(before);
expect(marker.endOffset).toBe(before[0]!.endOffset);
```

- [ ] **Step 7: Block multipage scalar resize and hide its handles**

Return without mutation from `updateMarkerRange` and
`updateMarkerRangeSilent` when `isMultipagePdfMarker(marker)` is true. Add
`canResizeMarker` to highlight rendering and gate drag-handle creation per marker:

```ts
const canResize = isEditable && (callbacks.canResizeMarker?.(marker) ?? true);
if (canResize) attachDragHandles(...);
```

The page observer supplies `marker => !isMultipagePdfMarker(marker)`. Do not alter
margin-panel event or layout code.

- [ ] **Step 8: Run model, popover-adjacent, and PDF view tests**

Run: `npm test -- --run tests/engine-models/pdfCodingModel.test.ts tests/pdf/pdfViewState.test.ts tests/pdf/highlightGeometry.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit manual logical creation and resize safety**

```bash
git add src/pdf/pdfCodingModel.ts src/pdf/pdfCodingMenu.ts src/pdf/index.ts src/pdf/highlightRenderer.ts tests/engine-models/pdfCodingModel.test.ts
git commit -m "feat(pdf): create one marker for cross-page selections"
```

---

### Task 6: Make sidebar, navigation, search, and analytics logical-marker aware

**Files:**
- Modify: `src/pdf/views/pdfSidebarAdapter.ts`
- Modify: `src/core/markerResolvers.ts`
- Modify: `src/core/navigateToMarker.ts`
- Modify: `src/analytics/data/dataConsolidator.ts`
- Modify: `tests/pdf/pdfSidebarAdapter.test.ts`
- Modify: `tests/core/markerResolvers.test.ts`
- Modify: `tests/analytics/dataConsolidator.test.ts`

**Interfaces:**
- Consumes: `getPdfMarkerSegments` and canonical `marker.text`.
- Produces: one sidebar/analytics record per marker, page-range labels, and first-segment navigation.

- [ ] **Step 1: Write failing sidebar and label tests**

```ts
expect(adapter.getAllMarkers()).toHaveLength(1);
expect(adapter.getAllMarkers()[0]).toMatchObject({ page: 6, endPage: 7 });
expect(getMarkerLabel(multipageBaseMarker, null)).toBe('Pages 6–7');
```

Keep the existing excerpt-first label behavior: `Pages 6–7` is the fallback when
the logical text is empty, not a replacement for a useful quotation preview.

- [ ] **Step 2: Run sidebar and resolver tests and verify failure**

Run: `npm test -- --run tests/pdf/pdfSidebarAdapter.test.ts tests/core/markerResolvers.test.ts`

Expected: FAIL on missing end-page metadata or fallback label.

- [ ] **Step 3: Adapt the sidebar projection once per marker**

```ts
const segments = getPdfMarkerSegments(m);
return {
  ...baseFields,
  page: segments[0]!.page,
  endPage: segments[segments.length - 1]!.page,
  text: m.text,
};
```

Add optional `endPage` to `PdfBaseMarker`. Never flat-map segments in the sidebar
adapter.

- [ ] **Step 4: Navigate through the first canonical segment**

In `navigateToMarker`, derive the target page from
`getPdfMarkerSegments(marker)[0]`. Preserve the current `#page=N` navigation shape.

- [ ] **Step 5: Write failing analytics single-count tests**

```ts
const result = consolidatePdf({ markers: [multipageMarker], shapes: [] });
expect(result.markers).toHaveLength(1);
expect(result.markers[0].meta).toMatchObject({
  page: 6,
  fromLine: 6,
  toLine: 7,
  pdfText: 'first\fsecond',
});
```

- [ ] **Step 6: Store page span without expanding analytical rows**

Use first/last segment pages for `fromLine`/`toLine`. Search continues to consume
`marker.text`, which contains the complete logical content. Do not add segment
rows to consolidated data.

- [ ] **Step 7: Run focused consumer tests**

Run: `npm test -- --run tests/pdf/pdfSidebarAdapter.test.ts tests/core/markerResolvers.test.ts tests/analytics/dataConsolidator.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit logical consumer behavior**

```bash
git add src/pdf/views/pdfSidebarAdapter.ts src/core/markerResolvers.ts src/core/navigateToMarker.ts src/analytics/data/dataConsolidator.ts tests/pdf/pdfSidebarAdapter.test.ts tests/core/markerResolvers.test.ts tests/analytics/dataConsolidator.test.ts
git commit -m "feat(pdf): expose multipage markers as logical units"
```

---

### Task 7: Project multipage geometry into ICR without duplicate weights

**Files:**
- Modify: `src/core/icr/textRange.ts`
- Modify: `src/core/icr/kappaInput.ts`
- Modify: `src/core/icr/reporter.ts`
- Modify: `src/core/icr/ui/scopeExtraction.ts`
- Modify: `src/core/icr/ui/regionDerivation.ts`
- Modify: `src/core/icr/icrMarkerOpsImpl.ts`
- Modify: `src/core/icr/contributions/overlapHelper.ts`
- Modify: `tests/core/icr/textRange.test.ts`
- Modify: `tests/core/icr/ui/scopeExtraction.test.ts`
- Modify: `tests/core/icr/ui/regionDerivation.test.ts`
- Modify: `tests/core/icr/icrMarkerOpsImpl.test.ts`
- Modify: `tests/core/icr/contributions/overlapHelper.test.ts`
- Modify: `tests/core/icr/reporter.test.ts`

**Interfaces:**
- Consumes: `getPdfMarkerSegments`.
- Produces:
  - `extractPdfRanges(m: PdfMarker): TextRange[]`
  - optional `logicalMarkerCount?: number` on `KappaInput`
  - one CodedMarker range per segment, but one aggregate weight per logical marker.

- [ ] **Step 1: Write failing PDF range projection tests**

```ts
expect(extractPdfRanges(multipageMarker)).toEqual([
  { fileId: 'doc.pdf', locator: 'page:6', from: 10, to: 30 },
  { fileId: 'doc.pdf', locator: 'page:7', from: 0, to: 5 },
]);
expect(extractPdfRanges(singlePageMarker)).toHaveLength(1);
```

- [ ] **Step 2: Run text-range tests and verify failure**

Run: `npm test -- --run tests/core/icr/textRange.test.ts`

Expected: FAIL because `extractPdfRanges` does not exist.

- [ ] **Step 3: Add range projection and preserve the scalar helper**

```ts
export function extractPdfRanges(m: PdfMarker): TextRange[] {
  return getPdfMarkerSegments(m).map(segment => ({
    fileId: m.fileId,
    locator: `page:${segment.page}`,
    from: segment.beginIndex,
    to: segment.endIndex,
  }));
}

export function extractPdfRange(m: PdfMarker): TextRange {
  return extractPdfRanges(m)[0]!;
}
```

The singular helper remains only for source compatibility until every caller in
this task is explicitly classified as first-segment-only or multi-range.

- [ ] **Step 4: Write failing scope and reporter weight tests**

```ts
expect(pdfInput.markers).toHaveLength(2); // two spatial ranges
expect(pdfInput.logicalMarkerCount).toBe(1);
expect(reportKappa([{ engine: 'pdf', kappaInput: pdfInput }]).weights.pdf).toBe(1);
```

- [ ] **Step 5: Flat-map PDF ranges while carrying logical count**

In `buildPerCharInput`, increment logical count once for each accepted source
marker, then push one `CodedMarker` for each PDF range. Set
`logicalMarkerCount` on the returned `KappaInput`. Other engines may set the same
field to their accepted marker count for consistency.

In `reporter.ts` use:

```ts
weights[engine] = isCategorical(kappaInput)
  ? kappaInput.units.length
  : kappaInput.logicalMarkerCount ?? kappaInput.markers.length;
```

- [ ] **Step 6: Make contested-region collection segment-aware**

Flat-map every logical PDF marker into page-local collector entries carrying the
same `markerId`, coder, and codes. Keep grouping by `fileId + page`. Deduplicate
`markerRefs` by `markerId` within a region before classifying divergence.

- [ ] **Step 7: Make region operations find logical markers by any segment**

Replace scalar page/range checks in `IcrMarkerOpsImpl` with:

```ts
const matches = getPdfMarkerSegments(marker).some(segment =>
  segment.page === region.bounds.page
  && rangesOverlap1D(segment.beginIndex, segment.endIndex, region.bounds.from, region.bounds.to)
);
```

Code operations still execute once by logical marker ID. Consensus creation from
a page-local reconciliation region remains a single-page marker. Multipage bounds
resize/reconciliation is not introduced.

- [ ] **Step 8: Make contribution overlap return each logical marker once**

For PDF, compare every incoming range against every local range and include a
local marker if any pair overlaps with the same locator. Do not return one result
per overlapping segment.

- [ ] **Step 9: Run focused ICR tests**

Run: `npm test -- --run tests/core/icr/textRange.test.ts tests/core/icr/reporter.test.ts tests/core/icr/ui/scopeExtraction.test.ts tests/core/icr/ui/regionDerivation.test.ts tests/core/icr/icrMarkerOpsImpl.test.ts tests/core/icr/contributions/overlapHelper.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit segment-aware ICR projection**

```bash
git add src/core/icr/textRange.ts src/core/icr/kappaInput.ts src/core/icr/reporter.ts src/core/icr/ui/scopeExtraction.ts src/core/icr/ui/regionDerivation.ts src/core/icr/icrMarkerOpsImpl.ts src/core/icr/contributions/overlapHelper.ts tests/core/icr
git commit -m "feat(icr): compare logical PDF markers across pages"
```

---

### Task 8: Validate the vertical slice manually before corpus consolidation

**Files:**
- Modify after validation: `docs/_research/qdpx-atlas-multipage-diagnostic.md`
- Generated by the importer in the vault, not committed as plugin source: `imports/UnifiedDevOps Selective Coding ITE5 ICA/qdpx-import-audit.md`

**Interfaces:**
- Consumes: the completed vertical slice from Tasks 1–7 and the real QDPX/PDF corpus.
- Produces: human confirmation of geometry and logical behavior, plus durable diagnostic notes independent of `data.json`.

- [ ] **Step 1: Verify the implementation diff is inside the approved boundary**

Run: `git diff --name-only 3efcd9f..HEAD`

Expected: no `src/pdf/marginPanelRenderer.ts`, no `src/export/qdpxExporter.ts`, and no Atlas integration files.

- [ ] **Step 2: Build the plugin for the real vault check**

Run: `npm run build`

Expected: PASS and updated local plugin bundle.

- [ ] **Step 3: Ask the user to perform a clean import in read-only mode**

Use the existing reset/import workflow. Do not read or preserve old `data.json` as
expected output. The import itself must regenerate its audit from the QDPX source.

Expected preview: four participating coders and read-only selected by default.

- [ ] **Step 4: Check all six imported quotations against the image reference**

Verify these page pairs in the viewer:

```text
D1 Figure 2: 6–7
D1 Autonomy: 8–9
D2 infra background: 8–9
D5 Which approach: 2–3
D8 operational responsibilities: 5–6
D8 People downstream: 6–7
```

Expected: every first-page remainder and last-page beginning is highlighted in
full. Headers, footers, and the D2 table remain present when they belong to the
native linear selection flow.

- [ ] **Step 5: Compare geometry with the twelve `marlonnn` references**

Expected: each imported logical marker's two page segments align with the
corresponding manual pair. The historical `marlonnn` records remain independent
and are not rewritten or grouped.

- [ ] **Step 6: Verify logical behavior and ownership**

For one four-coder D1 group:

```text
Read-only: all coder markers visible; no mutation available.
Jessica active: Jessica's code/memo operations work; other owners remain read-only.
Delete Jessica marker: its two highlights disappear together; sibling coder markers remain.
```

Expected: one sidebar/analytics/Compare record per coder marker, not per page
segment.

- [ ] **Step 7: Verify resize and manual creation boundaries**

```text
Imported multipage marker: no resize handles.
Ordinary single-page marker: both resize handles continue working.
New cross-page selection: adding one code creates one sidebar marker with two segments.
Deleting that marker removes both page highlights in one operation.
```

- [ ] **Step 8: Record factual results in the diagnostic**

Append a dated Marco 3 validation section containing observed counts, pass/fail by
case, unexpected behavior, and audit path. Do not copy plugin state or depend on
the backup file.

- [ ] **Step 9: Commit the accepted manual checkpoint**

```bash
git add docs/_research/qdpx-atlas-multipage-diagnostic.md
git commit -m "docs: validate logical multipage PDF markers"
```

Do not continue to Task 9 until the user confirms the real-vault behavior. If a
case fails, fix it in the smallest owning task, repeat its focused tests, and
repeat the affected manual check before recording acceptance.

---

### Task 9: Consolidate corpus coverage and close Marco 3

**Files:**
- Modify: `tests/import/atlasQdpxSimulation.test.ts`
- Modify: `tests/import/qdpxImporter.test.ts`
- Modify: `docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`
- Modify: `docs/superpowers/specs/2026-09-02-qdpx-multipage-marker-design.md`

**Interfaces:**
- Consumes: manually accepted vertical slice and the optional real Atlas fixture path already used by `atlasQdpxSimulation.test.ts`.
- Produces: durable 6/18/36/35 corpus assertions, full regression evidence, and a closed Marco 3 checklist.

- [ ] **Step 1: Add failing corpus-count assertions**

Extend the fixture-backed suite to assert:

```ts
expect(groups).toHaveLength(6);
expect(groups.reduce((n, group) => n + uniqueCoderCount(group), 0)).toBe(18);
expect(groups.reduce((n, group) => n + group.fragments.length * uniqueCoderCount(group), 0)).toBe(36);
expect(groups.reduce((n, group) => n + semanticApplicationCount(group), 0)).toBe(35);
```

For every semantic application, assert three distinct source Coding GUIDs. Assert
the exact per-case distribution `4/11, 4/8, 4/6, 2/4, 2/4, 2/2`.

- [ ] **Step 2: Run the corpus suite and verify the new assertions exercise production APIs**

Run: `npm test -- --run tests/import/atlasQdpxSimulation.test.ts`

Expected before final test wiring: FAIL if the suite still uses its old local
pairing helper instead of `detectQdpxPdfMultipageGroups` and production Coding
merge APIs.

- [ ] **Step 3: Replace test-local grouping with production functions**

Import the detector and authoring merge from production. Keep the existing
`ATLAS_QDPX_FIXTURE_DIR` override and `describe.skip` behavior when the private
fixture is absent. Do not copy the private QDPX or PDFs into the repository.

- [ ] **Step 4: Run the complete focused Marco 3 set**

Run:

```bash
npm test -- --run \
  tests/pdf/pdfMarkerSegments.test.ts \
  tests/pdf/pdfPlainText.test.ts \
  tests/pdf/resolvePendingMultipage.test.ts \
  tests/import/qdpxMultipage.test.ts \
  tests/import/qdpxAuthoring.test.ts \
  tests/import/qdpxImporter.test.ts \
  tests/import/atlasQdpxSimulation.test.ts \
  tests/engine-models/pdfCodingModel.test.ts \
  tests/pdf/pdfViewState.test.ts \
  tests/pdf/highlightGeometry.test.ts \
  tests/pdf/pdfSidebarAdapter.test.ts \
  tests/core/markerResolvers.test.ts \
  tests/analytics/dataConsolidator.test.ts \
  tests/core/icr/textRange.test.ts \
  tests/core/icr/reporter.test.ts \
  tests/core/icr/ui/scopeExtraction.test.ts \
  tests/core/icr/ui/regionDerivation.test.ts \
  tests/core/icr/icrMarkerOpsImpl.test.ts \
  tests/core/icr/contributions/overlapHelper.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full regression suite**

Run: `npm test`

Expected: PASS with no regression in existing PDF, import, authorship, analytics,
or ICR tests.

- [ ] **Step 6: Run production build and whitespace verification**

Run: `npm run build`

Expected: PASS.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 7: Verify forbidden files and user data are untouched**

Run: `git diff --name-only 3efcd9f..HEAD`

Expected: no `src/pdf/marginPanelRenderer.ts`, no
`src/export/qdpxExporter.ts`, no Atlas integration, and no `data.json*` path.

- [ ] **Step 8: Close the Marco 3 documentation checklists**

Mark only Marco 3 items complete in both specs. Record:

```text
- focused test count and files;
- full-suite test count and files;
- build result;
- six-case manual result;
- 18 logical markers, 36 segments, and 35 applications;
- resize multipage intentionally deferred;
- margin panel remains Marco 4;
- exporter remains Marco 6;
- Atlas remains Marco 7.
```

- [ ] **Step 9: Commit corpus coverage and milestone closure**

```bash
git add tests/import/atlasQdpxSimulation.test.ts tests/import/qdpxImporter.test.ts docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md docs/superpowers/specs/2026-09-02-qdpx-multipage-marker-design.md
git commit -m "test(pdf): close logical multipage marker milestone"
```

- [ ] **Step 10: Report the final checkpoint without starting Marco 4**

Report commit IDs, manual evidence, focused and full-suite totals, build status,
and remaining scope. Stop before margin-panel implementation, redesign, exporter,
or Atlas work.
