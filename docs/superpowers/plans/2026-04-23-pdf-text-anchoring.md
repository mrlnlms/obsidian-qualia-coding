# PDF Text Anchoring — plan

**Branch:** `feat/pdf-text-anchoring` (from main, clean)
**Objetivo:** round-trip QDPX de PDF markers funcional por construção, sem caches voláteis.

## Princípio

`marker.text` + `contextBefore` + `contextAfter` + `occurrenceIndex` são source of truth. Indices (beginIndex/endIndex/offsets) deixam de ser persistidos. Render, export e import derivam posição via text-search sempre.

## Schema novo

```ts
interface PdfMarker {
  id: string;
  fileId: string;
  page: number;
  text: string;
  contextBefore: string;   // novo — até 30 chars
  contextAfter: string;    // novo — até 30 chars
  occurrenceIndex: number; // novo — N-ésima ocorrência na página (0-based)
  codes: CodeApplication[];
  memo?: string;
  colorOverride?: string;
  createdAt: number;
  updatedAt: number;
}

interface PdfFileMetadata {
  mtime: number;
  pages: Array<{ width: number; height: number }>;  // só dims — sem textItems
}
```

## Fases (TDD, módulo puro → integração → delete debris)

### F1 — Módulos puros (TDD isolado)

1. `src/pdf/textAnchor.ts` — `findAnchor(pageText, text, contextBefore, contextAfter, occurrenceIndex) → {start, end} | null`
2. `src/pdf/pdfPlainText.ts` — `buildPlainText(pdfDoc) → { plainText, pageStartOffsets }` (usa pdfjs headless)
3. `src/pdf/textAnchorCapture.ts` — `captureAnchorFromDomRange(pageEl, domRange) → {text, contextBefore, contextAfter, occurrenceIndex}`
4. `src/pdf/textAnchorRender.ts` — `mapAnchorToDomRange(pageEl, anchor) → Range | null`

Cada um com test file adjacente. Zero dependência de runtime Obsidian; jsdom só pra #3 e #4.

### F2 — Schema migration + model

5. `PdfMarker`: adiciona `contextBefore/contextAfter/occurrenceIndex`, remove `beginIndex/beginOffset/endIndex/endOffset`.
6. `PdfFileMetadata.pages[].textItems` removido.
7. `pdfCodingModel.save()` inclui `settings` (fix unrelated, vem junto).
8. Atualiza todos os tipos/imports que tocam nos campos removidos — nada de backcompat, `data.json` do workbench é zerado.

### F3 — Render integration

9. Reescreve `highlightRenderer` pra usar `mapAnchorToDomRange` em vez de indices.
10. Reescreve `dragHandles.ts` pra: (a) drag atualiza anchor via `captureAnchorFromDomRange`; (b) `hitTestTextLayer` continua mas serve só pra drag, não pra persistência de indices.
11. `selectionCapture`: quando user seleciona, cria marker via `captureAnchorFromDomRange`.
12. Deleta `captureTextContentItemsFromRuntime` do `pageObserver.ts`.

### F4 — Export/import reescrita

13. `qdpxExporter`: usa `buildPlainText` no momento do export, `findAnchor` pra calcular startPosition/endPosition. Sem clamps, sem cache textItems.
14. `qdpxImporter.createPdfMarker`: extrai text/contexts/occurrenceIndex do PlainText. Sem binary search de items.
15. Dims continuam sendo usados pra shape markers — `extractPdfMetadata` shrink pra só dims.

### F5 — Testes de sistema

16. Reescreve `tests/export/qdpxRoundTrip.pdf.test.ts` — round-trip com anchors.
17. Reescreve `tests/import/qdpxImport.test.ts` assertions.
18. Round-trip manual no workbench (smoke test).

### F6 — Cleanup

19. Deleta branch `feat/qdpx-pdf-integrity`.
20. Atualiza ARCHITECTURE.md, BACKLOG.md.
21. Arquiva este plan.

## Non-goals

- Fallback UI "needs manual re-anchor" (adiar — se findAnchor falhar, warning + skip por enquanto)
- Mudar tipo PDFSelection (shapes) — continua igual, só text markers mudam
- Otimização de busca em PDFs enormes (aceitar O(n) linear, profile depois se virar problema)
