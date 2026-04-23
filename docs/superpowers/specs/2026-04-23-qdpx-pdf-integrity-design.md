# QDPX PDF Integrity — Design Spec

**Data:** 2026-04-23
**Escopo:** BACKLOG §11 E1, E2, I1, I2 (Grupo A do ROADMAP #2 "Import/Export")
**Out-of-scope nesta sessão:** JSON full export, Multi-tab spreadsheet Analytics, PNG/PDF Dashboard composite (Grupo B — sessão seguinte, ver `memory/project_export_grupo_b_notes.md`)

---

## 1. Problema

Round-trip QDPX de markers PDF é degradado em 4 pontos:

| # | Sintoma | Causa raiz |
|---|---|---|
| E1 | QDPX export emite `beginOffset`/`endOffset` como offset dentro do content-item pdfjs (não codepoint absoluto no PlainText). Warning "approximate" | Texto completo da página nunca foi persistido nem calculado no export |
| E2 | Shape markers PDF são pulados no export com warning "page dimensions not available" | Dimensões da página nunca foram persistidas. Export roda fora do contexto do viewer |
| I1 | Import de shape markers REFI-QDA usa 612x792 (US Letter) como default de dims | Dimensões reais do PDF não disponíveis em tempo de import |
| I2 | Import de `PlainTextSelection` dentro de `PDFSource` é ignorado com warning | Mapping offset absoluto → `beginIndex/beginOffset` não existe |

Todos dependem do mesmo dado faltante: **metadata por página (width, height, textItems) do PDF**.

## 2. Solução em uma linha

Cachear metadata por página no `data.json`, populado oportunisticamente quando o PDF é aberto no viewer (pdfjs headless), invalidado por `stat.mtime`. Reutilizar esses dados em export e import pra calcular offsets absolutos e converter coords de shapes com dims reais.

## 3. Arquitetura

### 3.1 Schema

`src/pdf/pdfCodingTypes.ts` ganha:

```ts
export interface PdfPageInfo {
  width: number;           // pontos PDF (viewport.width @ scale=1)
  height: number;
  textItems: string[];     // cada content-item do pdfjs como string, mesma ordem
}

export interface PdfFileMetadata {
  mtime: number;           // TFile.stat.mtime — invalida cache
  pages: PdfPageInfo[];
}

export interface PdfCodingData {
  markers: PdfMarker[];
  shapes: PdfShapeMarker[];
  registry: any;
  fileMetadata: Record<string, PdfFileMetadata>;   // novo
}
```

**Zero migration** — vault workbench é de dev, CLAUDE.md manda "muda e pronto". `createDefaultData` inicializa `fileMetadata: {}`; extract popula sob demanda.

### 3.2 Módulos novos

#### `src/pdf/pdfMetadataExtractor.ts`

```ts
export async function extractPdfMetadata(
  vault: Vault,
  file: TFile
): Promise<PdfFileMetadata>
```

- Lê binário via `vault.readBinary(file)`
- Usa pdfjs já carregado pelo Obsidian (`window.pdfjsLib`, acessível via ambient type em `obsidian-internals.d.ts`)
- Loop por página: `getViewport({ scale: 1 })` pras dims, `getTextContent()` pros items
- Retorna metadata completo + `await doc.destroy()` pra liberar memória

#### `src/export/pdfPlainTextBuilder.ts`

Função pura compartilhada entre export e import:

```ts
export interface PdfPlainTextResult {
  text: string;
  itemOffsets: Map<string, { start: number; end: number }>;  // key: `${page}:${index}`
  sortedOffsets: Array<{ page: number; index: number; start: number; end: number }>;  // pra binary search no import
}

export function buildPdfPlainText(metadata: PdfFileMetadata): PdfPlainTextResult
```

**Regras de concatenação:**
- Items dentro da página: join com `\n`
- Páginas: separadas por `\f` (form-feed, 0x0C — padrão ASCII de page break, reconhecido por NVivo/ATLAS.ti/MAXQDA)
- Offsets em codepoints Unicode (consistente com `lineChToOffset` existente em `coordConverters.ts`)

### 3.3 Gatilhos de populate

| Contexto | Ação |
|---|---|
| Usuário abre PDF no viewer | Listener dispara `extractPdfMetadata` em background (Promise sem await bloqueante). Resultado vai pra `pdfCodingModel.setFileMetadata(fileId, metadata)`. Check `mtime` antes pra evitar re-extract |
| Usuário clica Export QDPX | Pra cada PDF codificado sem metadata: extract na hora, com progress modal `"Preparing N of M PDFs..."` |
| PDF editado fora do Obsidian (mtime mudou) | Próximo acesso (view-open ou export) detecta mismatch, re-extrai |

Extract é rápido (~ms/página pra dims, ~dezenas de ms/página pro texto). Usuário típico não percebe.

### 3.4 Export refactor

`src/export/qdpxExporter.ts` linhas 427-452 (bloco PDF):

- Substitui lookup de `textOffsets` por chamada ao `buildPdfPlainText(meta)` e soma de `itemOffsets[${page}:${beginIndex}].start + beginOffset`
- `pageDims` vira `{ [pageNum]: { width, height } }` extraído de `meta.pages`
- Se `meta` faltar: chama `extractPdfMetadata` on-demand (com progress) antes de exportar
- Remove warnings E1 e E2; substitui por warning só pra PDFs sem text layer (scanned)

### 3.5 Import refactor

`src/import/qdpxImporter.ts`:

- Ao processar `PDFSource`: tenta obter `fileMetadata[fileId]` (se arquivo já existe no vault e foi aberto) ou chama `extractPdfMetadata` on-demand
- `pdfRectToNormalized` recebe `meta.pages[N].{width,height}` em vez do default 612x792
- `PlainTextSelection` dentro de `PDFSource` passa a ser processado: busca no `sortedOffsets` (binary search) pelo absoluto → `{page, beginIndex, beginOffset, endIndex, endOffset}`; cria `PdfMarker` normal

## 4. Data flow — caso típico

```
Usuário abre file.pdf no Obsidian
  ↓
pdfCodingView.onLoadFile
  ↓
if fileMetadata[fileId]?.mtime === file.stat.mtime → skip
  ↓
extractPdfMetadata(vault, file) em background
  ↓
pdfCodingModel.setFileMetadata(fileId, meta) → persistido em data.json

Usuário codifica trecho no PDF
  ↓
PdfMarker { beginIndex, beginOffset, text, ... } normal — metadata não precisa existir ainda

Usuário clica Export QDPX
  ↓
qdpxExporter coleta PDFs codificados
  ↓
pra cada PDF sem metadata: extractPdfMetadata on-demand (progress modal)
  ↓
buildPdfPlainText(meta) → { text, itemOffsets }
  ↓
pra cada marker: absoluteStart = itemOffsets[page:beginIndex].start + beginOffset
  ↓
shapes: pageDims[page] = meta.pages[page].{width,height}
  ↓
buildPdfSourceXml com text + offsets reais + pageDims reais
```

## 5. Error handling

Cenários considerados realistas (PDFs corrompidos não entram — Obsidian viewer não abre):

| Situação | Comportamento |
|---|---|
| PDF scanned (text layer vazio) | `textItems = []` pra todas as páginas. Shape markers ainda exportam (dims existem). Text markers sem offset preciso — warning no modal com lista de PDFs afetados |
| PDF referenciado por marker mas arquivo removido do vault | Export skipa aquele PDF com warning. Outros PDFs seguem |
| pdfjs throw inesperado | Catch no `extractPdfMetadata`, warning no console, fallback pro comportamento atual (offsets aproximados, shapes sumidos). Export não trava |
| Extract paralelo (múltiplos PDFs abertos rápido) | Cada Promise é independente; `setFileMetadata` atômico. Sem lock |

## 6. Testing

- **Unit**: `pdfPlainTextBuilder.test.ts`
  - Separadores corretos (`\n` entre items, `\f` entre páginas)
  - Offsets em edge cases: página vazia, 1 item por página, unicode surrogate pairs, marker no fim de content-item
  - Round-trip: `text[start..end]` == content esperado
- **Unit**: `coordConverters.test.ts` existente — estender com `pageDims` variado por página (páginas heterogêneas)
- **Integration**: `qdpxGuidConsistency.test.ts` existente — estender com round-trip de offsets absolutos PDF
- **Fixture**: `tests/fixtures/small.pdf` — 3 páginas, 2 tamanhos diferentes (ex: A4 retrato + A4 paisagem), texto com unicode. Gerado uma vez, commitado
- **Manual no vault workbench**: codificar PDF → export QDPX → import de volta → verificar highlights batem byte-a-byte

## 7. Ordem de implementação

1. Schema: `fileMetadata` em `PdfCodingData` + `createDefaultData` + métodos no `PdfCodingModel` (`setFileMetadata`, `getFileMetadata`, invalidation check)
2. `pdfPlainTextBuilder.ts` (puro, sem pdfjs) + testes unitários
3. Fixture `tests/fixtures/small.pdf`
4. `pdfMetadataExtractor.ts` (pdfjs headless) + testes com fixture
5. Hook no PDF viewer `onLoadFile` → extract em background
6. Export refactor (E1 offsets absolutos + E2 shape markers com dims reais)
7. Import refactor (I1 dims reais + I2 PlainTextSelection)
8. Fallback no export: progress modal quando PDF aberto nenhuma vez na sessão
9. Remover warnings antigos do exporter
10. Manual test no workbench (export → import round-trip)

## 8. Riscos e tradeoffs

| Risco | Mitigação |
|---|---|
| `data.json` cresce com `textItems` de PDFs grandes | Aceito — text layer de um PDF típico é da ordem de dezenas de KB. Vault de dev suporta. Se virar issue em produção, avaliar cache externo (arquivo separado) |
| `window.pdfjsLib` é API interna do Obsidian — pode quebrar em update | Ambient type declara; se API mudar, fica isolado no `pdfMetadataExtractor`. Plugin já depende de internals pra PDF viewer de qualquer forma |
| Separador `\f` entre páginas — algum QDA software legado pode não reconhecer | Aceito — `\f` é ASCII padrão e spec REFI-QDA não formaliza separador. NVivo/ATLAS.ti/MAXQDA reconhecem |

## 9. Out-of-scope explícito

- JSON full export, Multi-tab spreadsheet Analytics, PNG/PDF Dashboard composite — Grupo B, sessão seguinte
- Cache de metadata pra PDFs não-codificados — só PDFs com markers justificam o storage
- Otimização de storage (gzip do `textItems`, arquivo separado) — premature em fase de dev
- Re-extract proativo no file-watcher — `mtime` check no próximo acesso é suficiente
