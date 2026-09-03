# QDPX PDF Export Round-trip Implementation Plan

> Status: completed on 2026-09-03 for the critical Qualia round-trip scope. Manual Atlas checkpoint intentionally deferred until an Atlas account and installation are available.
>
> Design source: `docs/superpowers/specs/2026-09-02-qdpx-pdf-export-roundtrip-design.md`.

## Goal

Export the current Qualia project as platform-neutral QDPX while preserving the logical PDF quotations, authorship, code applications, text ranges, multipage topology, memos, and relations needed for the package to reopen equivalently in Qualia and, at the final external checkpoint, Atlas.ti.

The concrete acceptance corpus is `UnifiedDevOps Selective Coding ITE5 ICA.qdpx`: Atlas → Qualia → QDPX → Qualia must be semantically lossless, and the same Qualia-produced package must subsequently reopen in Atlas like the source Atlas project. This is a semantic comparison, not a byte-for-byte archive comparison.

## Non-goals

- Redesigning the margin panel.
- Integrating Atlas into Qualia or automating Atlas.
- Recovering sources deleted from the current Qualia corpus.
- Resolving pending PDF markers whose anchors were never materialized by opening the source.
- Introducing a persistent shared-quotation domain entity.
- Expanding the acceptance matrix beyond the real two-page multipage cases in the reference corpus.
- Depending on the original `.qdpx`, imported Atlas bounding boxes, or the original source location at export time.

## Delivery sequence

1. Implement Tasks 1–5 inline, with narrow tests added alongside each pure boundary.
2. Ask one fresh subagent to review the complete diff once all five tasks form a coherent path.
3. Correct substantiated findings.
4. Stop for the user's manual Qualia checkpoint with a separately exported test PDF/project.
5. Only after that checkpoint, consolidate the regression suite and documentation, run full validation, and prepare the Atlas checkpoint package.

Do not optimize tests around visual details before the manual checkpoint. Tests written during Tasks 1–5 protect the data contract, grouping, projection, serialization, and atomic failure behavior.

## Task 1 — Preserve selection-level provenance on import

**Files**

- Modify `src/pdf/pdfCodingTypes.ts`.
- Modify `src/import/qdpxImporter.ts`.
- Modify `tests/import/qdpxImporter.test.ts`.
- Modify `tests/import/atlasQdpxSimulation.test.ts`.

### 1.1 Extend the stored provenance type

Add optional fields to `QdpxSelectionProvenance`:

```ts
export interface QdpxSelectionProvenance {
  source: 'qdpx';
  selectionGuid: string;
  selectionGuids?: string[];
  creatingUserGuid?: string;
  name?: string;
  creationDateTime?: string;
  unattributedOwner?: boolean;
}
```

These fields describe the imported Selection, not its Coding nodes. Existing `CodeApplication.qdpx` provenance remains the authority for coder, Coding GUID, timestamp, and note references.

### 1.2 Parse selection authorship without changing import behavior

Extend the internal `ParsedSelection` shape and `parseSelection()` so every PlainTextSelection and PDFSelection can carry:

- `creatingUserGuid` from the Selection's `creatingUser` attribute;
- the original `name` attribute;
- `creationDateTime` from the Selection.

Copy the fields into `importedQdpxSelection` in both the simple PDF marker path and `createPdfMultipageMarkers()`. The existing participating-user filter remains unchanged: Atlas.ti and Marlon must still be excluded because they own no Coding nodes.

### 1.3 Lock the provenance contract with focused tests

First add failing assertions that:

- a single-page imported marker stores the Selection creator, name, and timestamp;
- every coder-owned marker produced from one shared Selection stores the same selection-level provenance;
- all segments of a multipage marker retain the ordered imported fragment GUIDs while the logical marker retains the anchor's metadata;
- zero-Coding users remain absent from the imported coder registry.

Run:

```bash
npx vitest run tests/import/qdpxImporter.test.ts tests/import/atlasQdpxSimulation.test.ts
```

Checkpoint: provenance is available for identity reuse but no UI, marker count, or ownership behavior has changed.

## Task 2 — Build one canonical PDF text/geometry map and project markers into it

**Files**

- Modify `src/pdf/pdfPlainText.ts`.
- Modify `src/pdf/pdfExportData.ts`.
- Add `src/export/qdpxPdfProjection.ts`.
- Add `tests/export/qdpxPdfProjection.test.ts`.
- Modify `tests/export/qdpxProjectAuthorship.test.ts` mocks as required by the richer PDF items.

### 2.1 Retain the PDF.js data required for headless geometry

Replace the current `{ str?: string }` export-only item with a shared duck type that retains supported PDF.js fields:

```ts
export interface PdfExportTextItem {
  str?: string;
  dir?: string;
  width?: number;
  height?: number;
  transform?: number[];
  chars?: Array<{ c: string; u: string; r: [number, number, number, number] }>;
}
```

`buildPlainText()` must keep these fields while preserving its existing canonical representation exactly: trimmed non-empty items joined by one space; pages joined by `\f`. `PdfExportData.pageTextItems` uses this type.

### 2.2 Define the pure projection boundary

Create `qdpxPdfProjection.ts` with exported types and functions:

```ts
export interface PdfCanonicalItem {
  sourceIndex: number;
  text: string;
  globalStart: number;
  globalEnd: number;
  width?: number;
  height?: number;
  transform?: number[];
  chars?: PdfExportTextItem['chars'];
}

export interface PdfCanonicalPage {
  page: number; // one-based viewer page
  globalStart: number;
  globalEnd: number;
  width: number;
  height: number;
  items: PdfCanonicalItem[];
}

export interface PdfExportMap {
  plainText: string;
  pages: PdfCanonicalPage[];
}

export interface ProjectedPdfFragment {
  page: number;
  startPosition: number;
  endPosition: number;
  text: string;
  bbox: {
    firstX: number;
    firstY: number;
    secondX: number;
    secondY: number;
  };
}

export interface ProjectedPdfMarker {
  marker: PdfMarker;
  startPosition: number;
  endPosition: number;
  text: string;
  fragments: ProjectedPdfFragment[];
}

export class QdpxPdfProjectionError extends Error {
  markerId: string;
  fileId: string;
  reason: string;
}

export function buildPdfExportMap(data: PdfExportData): PdfExportMap;
export function projectPdfMarker(marker: PdfMarker, map: PdfExportMap): ProjectedPdfMarker;
```

### 2.3 Map endpoints directly, without text search

For every marker endpoint:

1. Resolve the one-based marker page to the canonical page.
2. Resolve `itemIndex` to the original PDF.js item, including empty/trimmed source items.
3. Translate `itemOffset` through that item's trimmed prefix into the canonical item's global range.
4. Preserve half-open ranges `[startPosition, endPosition)`.
5. Enforce `startPosition < endPosition` and monotonic ordered segments.
6. Read the exported selection text from `plainText.slice(startPosition, endPosition)`.
7. Compare normalized projected text with the marker/segment text only as a validation check; never search the representation to relocate it.

This direct mapping is the fix for the old omitted-offset cases such as D1 33/113.

### 2.4 Derive current bounding boxes from current endpoints

For a partial text item, prefer character rectangles when `chars` are present. Otherwise interpolate the horizontal interval proportionally from the item's `transform`, `width`, and string offsets. Union all covered item rectangles on each page and serialize the page-space bounds expected by REFI-QDA.

Imported `importedPdfSelectionBBox` values may be emitted in diagnostics for comparison, but must never be an input to exported geometry.

Reject projection with a typed error when an active marker has an invalid page/item/offset, reversed range, empty result, or unavailable geometry. Do not silently skip it.

### 2.5 Test the projection independently of XML

Add failing-first table tests for:

- leading/trailing whitespace inside source items;
- spaces inserted between canonical items;
- a partial first or last item;
- a one-page marker;
- a two-page marker with `\f` between pages;
- character-rectangle and proportional bbox paths;
- offsets that begin/end at item boundaries;
- invalid page, item, offset, empty, and reversed ranges;
- proof that repeated marker text elsewhere in the document does not affect projection.

Run:

```bash
npx vitest run tests/export/qdpxPdfProjection.test.ts tests/pdf/pdfPlainText.test.ts tests/export/qdpxProjectAuthorship.test.ts
```

Checkpoint: every active resolved PDF marker either has a deterministic representation range plus per-page geometry or produces an explicit export error.

## Task 3 — Regroup imported coder-owned markers into semantic selection units

**Files**

- Add `src/export/qdpxStableGuid.ts`.
- Add `src/export/qdpxPdfGrouping.ts`.
- Add `tests/export/qdpxPdfGrouping.test.ts`.
- Modify `src/export/qdpxExporter.ts` only enough to consume the new unit builder.

### 3.1 Add browser-safe deterministic identifiers

Implement:

```ts
export async function deterministicQdpxGuid(key: string): Promise<string>;
```

Use `TextEncoder` plus `crypto.subtle.digest('SHA-256', ...)`, take 16 bytes, set the RFC variant and UUID version-8/custom bits, then render the existing uppercase GUID form. The key includes project identity, source identity, logical range, fragment role, and semantic Coding identity as appropriate. Never use Node-only crypto.

Reuse a valid imported GUID only when its semantic object remains intact. Otherwise generate a deterministic new GUID. Each physical `<Coding>` node receives a unique GUID even when it represents the same semantic coder/code pair on both PDF and PlainText representations.

### 3.2 Define semantic export units

Create these public contracts:

```ts
export interface QdpxPdfCodingUnit {
  application: CodeApplication;
  semanticKey: string;
  pdfCodingGuids: string[];
  plainTextCodingGuid: string;
}

export interface QdpxPdfSelectionUnit {
  key: string;
  selectionGuid: string;
  markerIds: string[];
  sourceId: string;
  name: string;
  creationDateTime: string;
  creatingUserGuid?: string;
  startPosition: number;
  endPosition: number;
  text: string;
  fragments: Array<ProjectedPdfFragment & { selectionGuid: string }>;
  codings: QdpxPdfCodingUnit[];
  memo?: string;
}

export interface QdpxPdfGroupingResult {
  units: QdpxPdfSelectionUnit[];
  selectionGuidByMarkerId: Map<string, string>;
}

export async function buildQdpxPdfSelectionUnits(
  sourceId: string,
  projectedMarkers: ProjectedPdfMarker[],
  context: QdpxGroupingContext,
): Promise<QdpxPdfGroupingResult>;
```

### 3.3 Apply the strict regrouping rules

Only consider markers siblings when they carry the same imported `selectionGuid`. Regroup those candidates only if all of the following are compatible:

- source;
- projected logical start/end and selected text;
- segment count, page sequence, segment ranges, and current geometry;
- selection name, creation timestamp, and creator provenance;
- marker memo;
- application-level relation signature.

Coder, code assignment, Coding timestamp, magnitude, Coding note, and Coding GUID may differ because they are semantic Coding properties, not quotation identity.

Never merge native markers merely because their geometry or text coincides.

When an imported shared group splits into incompatible partitions, retire the old Selection GUID for every partition and assign deterministic fresh IDs. Do not let one partition keep the old shared identity arbitrarily.

### 3.4 Preserve physical Coding GUIDs only by role

Map ordered imported `sourceCodingGuids` to the known import order:

- single-page: PDF representation, then PlainText representation;
- two-page: anchor PDF, PlainText, continuation PDF.

Reuse them only when the original selection group, coder, code, and representation role remain intact. Generate deterministic physical GUIDs for new/changed applications or split groups. Magnitude stays attached through the existing Coding `NoteRef`; marker memo belongs to the Selection unit.

### 3.5 Test identity and regrouping decisions

Cover:

- two coder-owned imported markers becoming one shared Selection with the union of semantic Codings;
- native coincident markers staying separate;
- changed range, memo, relation, or selection metadata splitting the group;
- all split partitions receiving new deterministic Selection GUIDs;
- code/coder differences not forcing a split;
- stable GUID output across two identical builds;
- unique physical Coding GUIDs across PDF and PlainText nodes;
- correct reuse of intact single- and two-page imported GUIDs.

Run:

```bash
npx vitest run tests/export/qdpxPdfGrouping.test.ts tests/export/qdpxGuidConsistency.test.ts
```

Checkpoint: 615 coder-owned markers from the reference corpus can become 201 logical selection units without inventing a persistent shared marker model.

## Task 4 — Serialize paired text/visual selections and multipage continuation topology

**Files**

- Add `src/export/qdpxPdfSerializer.ts`.
- Add `tests/export/qdpxPdfSerializer.test.ts`.
- Modify `src/export/qdpxExporter.ts`.
- Modify `tests/export/qdpxProjectAuthorship.test.ts`.
- Modify `tests/export/qdpxLinks.test.ts`.

### 4.1 Serialize one logical unit into both representations

Expose:

```ts
export interface SerializedQdpxPdfSelections {
  xml: string;
}

export function serializeQdpxPdfSelectionUnit(
  unit: QdpxPdfSelectionUnit,
  context: QdpxPdfSerializationContext,
): SerializedQdpxPdfSelections;
```

For a one-page unit emit:

- one `<PDFSelection>` with current bbox and the logical Selection GUID;
- one `<PlainTextSelection>` spanning the complete logical representation range and sharing that same Selection GUID;
- the complete semantic Coding set under both representations, with distinct physical Coding GUIDs.

For a multipage unit emit:

- one `<PDFSelection>` per page fragment;
- the anchor PDFSelection and PlainTextSelection sharing the logical Selection GUID;
- continuation PDFSelection GUIDs for remaining fragments;
- the complete semantic Coding set on every physical representation;
- a assinatura estrutural Atlas (nome, data, Codings e páginas consecutivas), sem
  sintetizar Links.

### 4.2 Preserve the existing QDPX authoring contract

Resolve Selection `creatingUser` from preserved provenance when valid; otherwise use the existing deterministic fallback authoring context. Preserve original Selection name and timestamp when intact. New native selections use the existing marker-derived name/time rules.

Keep the user registry lazy: only users referenced by exported Coding/Selection structures are emitted. The zero-Coding Atlas.ti and Marlon accounts must not reappear.

### 4.3 Make application links grouping-aware

Change `buildLinksXml()` to accept `selectionGuidByMarkerId`. Resolve relation origins and targets through the grouped logical Selection IDs and deduplicate identical links produced by coder-owned siblings. Preserve `continued by` only when it is an application relation already present; the 14 examples in the Atlas corpus are same-page analytical relations, not multipage topology.

If memo or application relations differ, Task 3 must already have split the units; the serializer must not spread one marker's metadata across other coders.

### 4.4 Replace the text-only PDF marker path

In `exportProject()`:

1. Load each active PDF once.
2. Build its canonical export map once.
3. Project all resolved markers belonging to that source.
4. Build semantic selection units.
5. Serialize units into that source's `<PlainTextContent>` and `<PDFSelection>` children.
6. Accumulate grouped marker mapping for project-level Link serialization.

Shape selections retain their existing behavior. Removed sources are absent because export enumerates the current registry/corpus. Pending markers are not resolved by this work.

### 4.5 Test exact XML semantics

Assert parsed XML, not incidental string formatting:

- shared GUID between anchor PDFSelection and PlainTextSelection;
- distinct continuation GUIDs;
- structural fragment ordering without synthesized Links;
- correct representation start/end offsets;
- current bbox values;
- repeated semantic Coding sets with unique physical GUIDs;
- correct Selection creator/name/time;
- deduplicated application Links after grouping;
- no inactive zero-Coding users.

Run:

```bash
npx vitest run tests/export/qdpxPdfSerializer.test.ts tests/export/qdpxProjectAuthorship.test.ts tests/export/qdpxLinks.test.ts tests/export/qdpxExporter.test.ts
```

Checkpoint: the exporter produces the same logical quotation topology that the importer already knows how to reconstruct.

## Task 5 — Make export atomic and add semantic round-trip verification

**Files**

- Add `src/export/qdpxExportAudit.ts`.
- Add `tests/export/qdpxExportAudit.test.ts`.
- Modify `src/export/qdpxExporter.ts`.
- Modify `src/export/exportModal.ts`.
- Add `scripts/compare_qdpx_semantics.py`.
- Add `tests/export/qdpxPdfRoundTrip.test.ts`.

### 5.1 Add a structured coverage audit

Define:

```ts
export interface QdpxExportIssue {
  sourceId?: string;
  markerId?: string;
  kind: 'source-load' | 'projection' | 'geometry' | 'identity' | 'serialization';
  message: string;
}

export interface QdpxExportAudit {
  activePdfSources: number;
  resolvedPdfMarkers: number;
  exportedLogicalSelections: number;
  exportedPdfFragments: number;
  omittedOrphanMarkers: number;
  issues: QdpxExportIssue[];
}

export class QdpxExportValidationError extends Error {
  audit: QdpxExportAudit;
}
```

Build and validate the complete project XML/archive in memory before returning `ExportResult`. If an active PDF source fails to load or any resolved active marker cannot be projected, grouped, assigned valid unique GUIDs, or serialized, throw `QdpxExportValidationError`; the modal must not create a vault file.

Markers for a source no longer in the current corpus count as audited orphan omissions and do not restore the source. Pending markers remain outside this export path rather than being guessed or converted.

Add the successful audit to `ExportResult` and show a concise failure summary in `exportModal.ts`, with full structured details logged for diagnosis.

### 5.2 Add a platform-neutral semantic comparator

Implement `scripts/compare_qdpx_semantics.py` using only Python's standard library. It accepts:

```text
python3 scripts/compare_qdpx_semantics.py ORIGINAL.qdpx CANDIDATE.qdpx [--output REPORT.json]
```

It must unzip each package, find the `.qde`, and canonicalize semantics independently of archive order and GUID spelling. Compare:

- current sources by name and available binary hash;
- code hierarchy/name/color;
- only users referenced by Coding nodes;
- logical selection count and selected normalized text;
- PDF fragment count, page order, and continuation topology;
- semantic `(source, logical selection, coder, code, magnitude/note)` applications;
- per-page bbox as a diagnostic section, not as imported source material;
- missing and extra semantic objects.

Exit `0` for semantic equality, `1` for a valid comparison with differences, and `2` for invalid input/package structure. The JSON report contains counts plus explicit missing/extra/mismatch arrays.

For the Atlas source package, the expected semantic baseline after inactive-user normalization is:

- 10 coded PDF sources;
- 201 logical quotations/PlainTextSelections;
- 207 PDFSelection fragments;
- 1,189 semantic Coding instances in the text representation;
- 4 participating researchers;
- 6 two-page logical quotations, represented by 18 coder-owned Qualia markers and 36 stored segments after import.

### 5.3 Add an automated Qualia round-trip fixture

Build a focused in-memory fixture containing:

- one shared single-page quotation with two coders;
- one shared two-page quotation with multiple codes/coders;
- memo, magnitude, Coding note, and a relation;
- one native coincident marker that must remain independent;
- one removed-source orphan that must not restore a Source.

Export QDPX1, import it into fresh registries, export QDPX2, and compare canonical semantics. Assert stable logical identities, no Coding loss, correct multipage segments, and no unexpected users/sources.

Run:

```bash
npx vitest run tests/export/qdpxExportAudit.test.ts tests/export/qdpxPdfRoundTrip.test.ts
```

Checkpoint: a successful return means the archive is complete for the current corpus; an incomplete active export cannot masquerade as success.

## Fresh diff review

After Tasks 1–5 and their focused tests are green, ask one fresh subagent to review the complete uncommitted diff against:

- `docs/superpowers/specs/2026-09-02-qdpx-pdf-export-roundtrip-design.md`;
- this plan;
- the reference counts and regrouping rules;
- atomic failure behavior;
- browser/Obsidian compatibility;
- accidental margin-panel, Atlas-integration, pending-marker, or deleted-source scope creep.

The reviewer reports findings only. Evaluate each finding against code/tests, fix accepted findings inline, and rerun the affected focused tests plus:

```bash
npm run build
git diff --check
```

## Manual Qualia checkpoint

Stop before broad test/documentation consolidation and give the user one exact manual scenario using a PDF/project separate from the imported Atlas corpus:

1. Create one single-page marker and one marker spanning two pages.
2. Add multiple coders/codes, a magnitude, memo, and relation.
3. Move handles so one marker grows across a page boundary and shrinks back to one page.
4. Confirm highlights, rail, handles, and margin-panel state still follow the marker after mouse-up.
5. Export QDPX.
6. Import that QDPX into a fresh Qualia project.
7. Confirm the same logical markers, text, coders, codes, memo, magnitude, relation, and multipage topology.

If this checkpoint exposes a behavior error, correct source first and then update the narrow regression test that captures the confirmed contract.

### Resultado — 2026-09-03

O checkpoint `Qualia → QDPX → Qualia` foi aprovado no vault limpo
`QDPX Tests`. O pacote de teste reabriu com:

- sete markers lógicos no estado final do projeto;
- dois markers multipágina, cada um recomposto como um marker com dois segmentos;
- autoria por coder preservada;
- relação entre aplicações preservada;
- configuração nominal das escalas preservada;
- valores de magnitude `Tipo 1` e `Tipo 2` preservados nas aplicações;
- highlights e margin panel visualmente aprovados.

O teste também identificou que a configuração da escala pertence ao codebook,
enquanto o valor selecionado pertence à aplicação do código no marker. Para
preservar os dois níveis, valores aplicados continuam como Notes do Coding e a
configuração Qualia da escala é serializada em uma Note padrão
`[Qualia Magnitude Definition: {...}]`, ligada ao `<Code>` por `<NoteRef>`.

A primeira inspeção no vault destino usou `main.js` e `styles.css` antigos. Com os
artefatos sincronizados, o importer recompôs os multipágina e o overlay externo da
margin panel foi posicionado corretamente. Esse episódio não representou perda no
QDPX.

### Validação automatizada final — 2026-09-03

- `npm test`: 279 arquivos e 3.794 testes aprovados;
- `npm run build`: type-check e bundle aprovados;
- `git diff --check`: aprovado;
- comparador semântico do pacote manual: 1 source, 4 códigos, 2 participantes,
  7 selections lógicas, 9 fragments PDF, 8 Codings semânticos e 1 relação, sem
  diferenças internas;
- o `Project.xsd` citado pela pesquisa pertencia a um acervo externo que não foi
  versionado e já não está disponível na máquina. Em 2026-09-03 o schema foi
  recuperado temporariamente da fonte oficial REFI-QDA. A validação do primeiro
  pacote manual revelou bboxes decimais e `qualia:magnitude`; o serializer passou
  a emitir coordenadas inteiras e a definição de magnitude por NoteRef padrão.
  Um XML mínimo gerado pelo exporter com essa NoteRef validou contra o XSD
  oficial; o serializer de PDF cobre o arredondamento em teste dedicado.
  O schema não é copiado ao repositório por possuir termos próprios; a fonte
  oficial permanece registrada na pesquisa.

## Final test and documentation pass

Only after the user approves the manual checkpoint:

1. Consolidate overlapping fixtures/helpers and remove assertions tied only to intermediate implementation structure.
2. Run focused import/export coverage:

```bash
npx vitest run tests/import/qdpxImporter.test.ts tests/import/qdpxMultipage.test.ts tests/import/atlasQdpxSimulation.test.ts tests/export/qdpxPdfProjection.test.ts tests/export/qdpxPdfGrouping.test.ts tests/export/qdpxPdfSerializer.test.ts tests/export/qdpxExportAudit.test.ts tests/export/qdpxPdfRoundTrip.test.ts tests/export/qdpxProjectAuthorship.test.ts tests/export/qdpxLinks.test.ts tests/export/qdpxGuidConsistency.test.ts tests/export/qdpxExporter.test.ts
```

3. Run the complete repository gates:

```bash
npm test
npm run build
git diff --check
```

4. Export the real imported reference project from Qualia and compare it with:

```bash
python3 scripts/compare_qdpx_semantics.py \
  '/Users/mosx/Desktop/obsidian-plugins-workbench/QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx' \
  '/Users/mosx/Desktop/obsidian-plugins-workbench/QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA - Qualia.qdpx' \
  --output '/tmp/qualia-qdpx-semantic-comparison.json'
```

5. Update the design spec to implemented/verified status and record actual counts/results in `docs/_research/qdpx-refi-pdf-export-interoperability.md`. Update the older margin-panel research note only with a link/status correction; do not rewrite its historical investigation as current architecture.

## Final Atlas checkpoint

This external checkpoint does not block closure of the critical Qualia
round-trip scope. It remains a separately tracked follow-up to be executed when
the user has recreated an Atlas account and installed the application.

Use the exact Qualia-produced package that passed the semantic comparator. Open it manually in Atlas.ti and compare it with the Atlas project that produced the original fixture. Success is:

- all 10 coded PDFs present unless deliberately removed in Qualia;
- the 201 logical quotations and 207 visual fragments appear with equivalent selected text and multipage continuity;
- the same four participating researchers own the same code applications;
- codebook, memos, magnitudes, and relations remain semantically equivalent;
- no duplicate quotations created merely because multiple coders coded the same selection;
- no Atlas.ti or Marlon inactive account reintroduced by Qualia;
- no unexpected missing or extra semantic object in the comparator report.

Record Atlas-only presentation differences separately. They block this milestone only if they alter project semantics or make the reconstructed coding unusable.

## Plan self-review

- Every approved design rule maps to an implementation task or explicit non-goal.
- All new source modules, public interfaces, affected call sites, and test files are named.
- Import, projection, grouping, serialization, links, atomicity, round-trip, manual validation, and Atlas validation are covered in dependency order.
- The plan does not require the original QDPX or imported bbox during export.
- The plan exports the current corpus and never resurrects a deleted source.
- No placeholder functions, unspecified “handle later” branches, or platform-specific QDPX dialects are introduced.
- Identifier types remain strings in the existing QDPX uppercase GUID format; offsets remain half-open numbers; viewer pages remain one-based inside marker/projection contracts and are converted only at PDF.js boundaries.
