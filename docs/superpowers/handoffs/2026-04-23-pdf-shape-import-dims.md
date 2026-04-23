# Handoff — BACKLOG §11 I1: PDF shape import com dims reais

**Escopo:** ~30min. Trabalho isolado, não interage com outras features.

## Contexto

Dos 4 items pendentes do QDPX PDF round-trip (§11 E1/E2/I1/I2 no BACKLOG), três foram fechados na branch `feat/pdf-text-anchoring` em 2026-04-23:

- ~~E1 text offsets~~ ✓
- ~~E2 shape dims no export~~ ✓
- ~~I2 PlainTextSelection no import~~ ✓
- **I1 — shape dims no import** ← este handoff

## Bug

Quando o importer processa `<PDFSelection firstX="X" firstY="Y" secondX="..." secondY="..." page="N">`, converte as coords (PDF points) pra `NormalizedShapeCoords` (0-1) via `pdfRectToNormalized(firstX, firstY, secondX, secondY, pageWidth, pageHeight)`.

Código atual em `src/import/qdpxImporter.ts:createPdfMarker` (branch PDFSelection):

```ts
if (sel.type === 'PDFSelection') {
  // ...
  // We don't know page dimensions at import time. Store as approximate.
  // For now, use default PDF page size 612x792 (US Letter).
  const coords = pdfRectToNormalized(sel.firstX, sel.firstY, sel.secondX, sel.secondY, 612, 792);
  // ...
}
```

**Problema:** se o PDF real é A4 (595x842), paisagem, ou qualquer dimensão ≠ 612x792, o shape fica deslocado (~3-10%). Não inutiliza, mas fica impreciso.

## Fix proposto

Extrair dims reais do PDF via `loadPdfExportData` (mesmo módulo que o exporter usa, já testado). Passar `pdfDims` pro `createPdfMarker` assim como já passamos `pdfPlainText` + `pdfPageStartOffsets`.

### Passos

1. **`createMarkersForSource` em `qdpxImporter.ts`** (já carrega `pdfPlainText` pra text markers). Adicionar: se a source é PDF E tem shapes, também carregar dims.

   ```ts
   let pdfDims: Record<number, { width: number; height: number }> | null = null;
   if (src.type === 'pdf') {
     // plainText loading (já existe)...
     const hasShapes = src.selections.some(s => s.type === 'PDFSelection');
     if (hasShapes) {
       try {
         const data = await loadPdfExportData(app.vault, filePath);
         pdfDims = data.pageDims;
       } catch (err) {
         result.warnings.push(`PDF ${filePath}: failed to load dims for shape markers, using defaults (${(err as Error).message})`);
       }
     }
   }
   ```

2. **`createPdfMarker`** ganha param `pdfDims: Record<number, { width; height }> | null`.

3. **Branch PDFSelection** usa dims reais quando disponível:

   ```ts
   const pageDim = pdfDims?.[sel.page];
   const width = pageDim?.width ?? 612;
   const height = pageDim?.height ?? 792;
   const coords = pdfRectToNormalized(sel.firstX, sel.firstY, sel.secondX, sel.secondY, width, height);
   ```

4. **Imports**: `loadPdfExportData` de `../pdf/pdfExportData`.

### Timing

`loadPdfExportData` lê `vault.adapter.readBinary(filePath)`. O PDF precisa já estar escrito no vault quando chamamos. No fluxo do importer:

```
for (const src of sources) {
  filePath = await extractSource(src, files, app.vault, importDir, ...);  // escreve PDF
  if (filePath) {
    // aqui o PDF já está no vault; createMarkersForSource pode ler
    await createMarkersForSource(src, filePath, ...);
  }
}
```

`extractSource` já escreve binário via `writeBinary` antes de retornar. Então chamar `loadPdfExportData(filePath)` depois disso funciona.

## Testes

1. **Unit**: mock `loadPdfExportData` pra retornar dims A4, passar shape com coords conhecidos, verificar `pdfRectToNormalized` chamado com dims corretas. Tipo:

   ```ts
   // tests/import/qdpxImport.shape-dims.test.ts
   it('usa dims reais do PDF carregado (não 612x792) quando disponível', async () => {
     // mock vault + loadPdfExportData
     // import QDPX com <PDFSelection page=0 firstX=100 firstY=200 ...>
     // PDF é A4 (595x842)
     // verificar que marker.coords.x ≈ 100/595 (não 100/612)
   });
   ```

2. **Fallback**: se `loadPdfExportData` falha (PDF não no vault), warning emitido, coords usam 612x792. Shape marker ainda é criado (não skip).

3. **Round-trip**: export shape com dims A4, import no vault limpo, shape aparece posicionado corretamente. E2E idealmente.

## Pontos pra tirar dúvida comigo

- **Se `loadPdfExportData` for chamado 2x** (uma pra text markers ver plainText, outra pra shape markers ver dims), tem custo duplicado. Vale refatorar pra 1 call só que retorna tudo? A função já retorna `{plainText, pageStartOffsets, pageDims}` — só precisa ser invocada uma única vez no começo do source loop e reutilizada.

- **Páginas do QDPX são 0-based ou 1-based?** A especificação REFI-QDA diz 0-based pros attrs `page` em `<PDFSelection>`. `pageDims` no `loadPdfExportData` é 0-based (retornei `pageDims[i-1]` pro page 1-based do pdfjs, ver `src/pdf/pdfExportData.ts:31`). Então `pdfDims[sel.page]` funciona direto se `sel.page` é 0-based. Confirmar que o XML parser mantém 0-based.

- **Edge case**: PDF não está no vault destino (user importou QDPX mas não tem o PDF). O QDPX tem o PDF como `internal://{guid}.pdf` — extraído pra `imports/{projectName}/(filename).pdf`. Então o PDF DEVE estar no vault depois de `extractSource`. Se `loadPdfExportData` falha mesmo assim, é signal de corrupção do zip — warning + fallback é ok.

- **I/O cost**: carregar PDF no import é O(pages) em tempo. Pra PDFs enormes (500+ páginas) pode ser perceptível. Mitigação: carregar dims **só** se a source tem `<PDFSelection>` shapes (é o que o passo 1 faz).

## Não misturar

- **Não tocar** em render/capture/drag. Funcionam 100% depois da restauração feita em 2026-04-23. Ver `memory/feedback_dont_refactor_working_code.md`.
- **Não mexer** em `resolvePendingIndices` nem no fluxo text marker. Esse handoff é sobre shape markers apenas.

## Validação final

- `npm run test` — 1987 passam atualmente; após fix, 1988+ (novo test de shape dims).
- `npm run build` — tsc limpo.
- Smoke manual: vault `temp/` com QDPX importado, PDF aberto, shape rectangle aparece posicionado corretamente sobre região demarcada.
