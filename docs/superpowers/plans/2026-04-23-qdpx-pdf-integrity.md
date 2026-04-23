# QDPX PDF Integrity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close BACKLOG §11 E1/E2/I1/I2 — cache PDF page metadata (dims + textItems) no `data.json`, populado via pdfjs headless quando PDF abre; export/import QDPX passa a emitir offsets absolutos precisos e shape markers com dimensões reais por página.

**Architecture:** Metadata extraído via pdfjs headless e persistido em `PdfCodingData.fileMetadata[fileId] = { mtime, pages[{width, height, textItems}] }`. Módulo puro `pdfPlainTextBuilder.ts` converte metadata em PlainText consolidado + mapa de offsets por content-item. Export usa lookup direto; import usa binary search sobre array ordenado derivado do mesmo builder. Gatilho principal de populate é `instrumentPdfView` em `src/pdf/index.ts:109`, dentro de `component.then((child) => ...)`.

**Tech Stack:** TypeScript strict, pdfjs (via `window.pdfjsLib` declarado em `src/pdf/pdfTypings.d.ts`), Vitest + jsdom, Obsidian plugin API (`TFile`, `Vault`, `vault.readBinary`, `vault.adapter.writeBinary`), `pdfkit` (devDep) pra gerar fixture determinística.

**Spec de referência:** `docs/superpowers/specs/2026-04-23-qdpx-pdf-integrity-design.md`

**Constraints do projeto:**
- **Nunca** criar git worktree (CLAUDE.md). Trabalhar direto em branch local (`git checkout -b feat/qdpx-pdf-integrity`).
- **Zero migration/backcompat** (feedback_no_defensive_hedging.md). `createDefaultData` ganha `fileMetadata: {}`; dado novo extraído sob demanda.
- Commits via `~/.claude/scripts/commit.sh` (conventional commits em pt-br).

---

## File Structure

**Create:**
- `src/pdf/pdfMetadataExtractor.ts` — `extractPdfMetadata(vault, file)` (pdfjs headless)
- `src/export/pdfPlainTextBuilder.ts` — `buildPdfPlainText(metadata)` + `toSortedOffsets(result)` (pure)
- `src/export/exportProgressModal.ts` — `ExportProgressModal` + `ProgressReporter` interface (pro fallback do export on-demand)
- `tests/export/pdfPlainTextBuilder.test.ts` — unit tests puros
- `tests/pdf/pdfMetadataExtractor.test.ts` — unit tests com fixture real
- `tests/import/qdpxImport.test.ts` — integration tests de PDFSource (I1 + I2)
- `tests/export/qdpxRoundTrip.pdf.test.ts` — round-trip integration test
- `tests/fixtures/generate-small-pdf.ts` — script determinístico de geração
- `tests/fixtures/small.pdf` — fixture binária commitada (3 páginas, 2 tamanhos, unicode)

**Modify:**
- `src/pdf/pdfCodingTypes.ts` — adicionar `PdfPageInfo`, `PdfFileMetadata`; estender `PdfCodingData` com `fileMetadata`
- `src/core/types.ts:163` — `createDefaultData().pdf` ganha `fileMetadata: {}`
- `src/pdf/pdfCodingModel.ts` — métodos `getFileMetadata(fileId)`, `setFileMetadata(fileId, meta)`; load/save refletem novo campo
- `src/pdf/pdfTypings.d.ts` — estender `window.pdfjsLib` com `getDocument(data: ArrayBuffer | Uint8Array): { promise: Promise<PDFDocumentProxy> }`
- `src/pdf/index.ts:109` — dentro de `component.then((child) => ...)`, disparar `extractPdfMetadata` em background (fire-and-forget)
- `src/export/qdpxExporter.ts:204` (buildPdfSourceXml) — assinatura ganha `plainText: string` (required) e retorna `{ xml, reprGuid }`; callers dos 3 tests existentes (linhas 195/217/232) atualizados
- `src/export/qdpxExporter.ts:427-452` (bloco PDF do export) — chamar `buildPdfPlainText` + construir `textOffsets` e `pageDims` de dados reais; fallback extract on-demand via progressReporter
- `src/export/exportCommands.ts` (ou caller equivalente do createQdpxZip) — abrir `ExportProgressModal` antes do export e passar como reporter
- `src/import/qdpxImporter.ts` — branch de `PDFSource`: ordem extract PDF→writeBinary→extractMetadata→markers + processar `PlainTextSelection`
- `tests/export/qdpxGuidConsistency.test.ts` — estender com round-trip de offsets PDF absolutos
- `tests/export/coordConverters.test.ts` — adicionar casos com `pageDims` heterogêneos
- `package.json` — adicionar `pdfkit` em `devDependencies`

---

## Chunk 1: Schema + Model

### Task 1: Estender types com PdfPageInfo e PdfFileMetadata

**Files:**
- Modify: `src/pdf/pdfCodingTypes.ts`
- Modify: `src/core/types.ts:148-174`

- [ ] **Step 1: Criar branch**

```bash
git checkout -b feat/qdpx-pdf-integrity
```

- [ ] **Step 2: Estender `pdfCodingTypes.ts`**

Adicionar ao final do arquivo, antes da linha 39 (closing brace de `PdfCodingData`):

```ts
export interface PdfPageInfo {
  /** Page width in PDF points (pdfjs viewport at scale=1). */
  width: number;
  /** Page height in PDF points. */
  height: number;
  /** Content-items na ordem retornada pelo pdfjs. Cada string é uma TextContentItem.str. */
  textItems: string[];
}

export interface PdfFileMetadata {
  /** Snapshot de TFile.stat.mtime no momento da extração — invalida o cache se mudar. */
  mtime: number;
  pages: PdfPageInfo[];
}
```

E alterar a interface `PdfCodingData`:

```ts
export interface PdfCodingData {
  markers: PdfMarker[];
  shapes: PdfShapeMarker[];
  registry: any;
  /** Cache de metadata por fileId — populado on-view-open via pdfjs headless. */
  fileMetadata: Record<string, PdfFileMetadata>;
}
```

- [ ] **Step 3: Atualizar `createDefaultData` em `src/core/types.ts:163`**

Antes:

```ts
pdf: { markers: [], shapes: [], settings: { autoOpen: false, showButton: true } },
```

Depois:

```ts
pdf: { markers: [], shapes: [], fileMetadata: {}, settings: { autoOpen: false, showButton: true } },
```

Se o tipo `QualiaData.pdf` (que referencia `PdfCodingData`) estiver importado explicitamente em `types.ts`, o compilador já pega o mismatch. Se não, rodar tsc pra confirmar.

- [ ] **Step 4: Verificar tsc**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS (zero errors). Se houver erro em outro arquivo que lê `section('pdf')` e assume shape antigo, corrigir inline nesse mesmo commit (é o mesmo schema change).

- [ ] **Step 5: Commit**

```bash
git add src/pdf/pdfCodingTypes.ts src/core/types.ts
~/.claude/scripts/commit.sh "feat(pdf): adiciona PdfFileMetadata e fileMetadata em PdfCodingData"
```

---

### Task 2: Métodos `get/setFileMetadata` no PdfCodingModel

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts`
- Test: `tests/pdf/pdfCodingModel.test.ts`

- [ ] **Step 1: Ler `pdfCodingModel.ts` load/save atual**

Ler integralmente `src/pdf/pdfCodingModel.ts` pra entender o padrão de `load()` + `save()` + `setSection('pdf', ...)`. O novo campo `fileMetadata` precisa ser (a) lido em `load()`, (b) persistido em `save()`, (c) acessado via métodos públicos.

- [ ] **Step 2: Write failing tests em `tests/pdf/pdfCodingModel.test.ts`**

Adicionar ao arquivo de teste existente (usa helper existente `makePdfModel()` definido no topo do arquivo — linhas 4-15):

```ts
describe('PdfCodingModel.fileMetadata', () => {
  it('setFileMetadata persists + getFileMetadata returns the same', () => {
    const model = makePdfModel();
    const meta = {
      mtime: 1234567890,
      pages: [
        { width: 612, height: 792, textItems: ['Hello', 'World'] },
      ],
    };
    model.setFileMetadata('docs/foo.pdf', meta);
    expect(model.getFileMetadata('docs/foo.pdf')).toEqual(meta);
  });

  it('getFileMetadata returns undefined for unknown fileId', () => {
    const model = makePdfModel();
    expect(model.getFileMetadata('docs/nope.pdf')).toBeUndefined();
  });

  it('setFileMetadata overwrites existing entry', () => {
    const model = makePdfModel();
    model.setFileMetadata('docs/foo.pdf', { mtime: 1, pages: [] });
    model.setFileMetadata('docs/foo.pdf', { mtime: 2, pages: [{ width: 1, height: 1, textItems: [] }] });
    expect(model.getFileMetadata('docs/foo.pdf')?.mtime).toBe(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npx vitest run tests/pdf/pdfCodingModel.test.ts -t "fileMetadata"
```
Expected: FAIL (`setFileMetadata is not a function` ou similar).

- [ ] **Step 4: Implementar no `PdfCodingModel`**

Adicionar após o campo `private shapes` (~linha 25):

```ts
private fileMetadata: Record<string, PdfFileMetadata> = {};
```

No `load()` (após carregar `shapes`, antes do `if (mutated) this.save();`), adicionar:

```ts
this.fileMetadata = section.fileMetadata;
```

Atribuição direta — `createDefaultData` garante o campo. Tests mockando `section` precisam fornecer `fileMetadata: {}` no retorno (helper `makePdfModel` usa `mockReturnValue({})` hoje — atualizar o mock pra incluir o campo).

No `save()` (dentro de `setSection('pdf', { ... })`), adicionar a linha `fileMetadata`:

```ts
save(): void {
  this.dataManager.setSection('pdf', {
    markers: this.markers,
    shapes: this.shapes,
    fileMetadata: this.fileMetadata,
  });
}
```

**NÃO adicionar `settings:`** — o save atual não persiste settings (são lidos via getter `get settings()` em linha 38-40 diretamente do dataManager). Preservar o shape existente.

Imports no topo do arquivo:

```ts
import type { PdfMarker, PdfShapeMarker, NormalizedShapeCoords, PdfFileMetadata } from './pdfCodingTypes';
```

Atualizar o helper `makePdfModel` em `tests/pdf/pdfCodingModel.test.ts` linha 4-15 pra retornar `fileMetadata: {}` no `section` mock:

```ts
function makePdfModel(): PdfCodingModel {
  const dm = {
    section: vi.fn().mockReturnValue({ markers: [], shapes: [], fileMetadata: {} }),
    setSection: vi.fn(),
  } as any;
  // ... resto igual
}
```

Métodos públicos novos (próximos a `updateMarkerRange` pra manter agrupamento):

```ts
getFileMetadata(fileId: string): PdfFileMetadata | undefined {
  return this.fileMetadata[fileId];
}

setFileMetadata(fileId: string, meta: PdfFileMetadata): void {
  this.fileMetadata[fileId] = meta;
  this.save();
}
```

- [ ] **Step 5: Run tests passam**

Run:
```bash
npx vitest run tests/pdf/pdfCodingModel.test.ts
```
Expected: PASS (todos os testes, inclusive os novos).

- [ ] **Step 6: Commit**

```bash
git add src/pdf/pdfCodingModel.ts tests/pdf/pdfCodingModel.test.ts
~/.claude/scripts/commit.sh "feat(pdf): métodos get/setFileMetadata no PdfCodingModel"
```

---

## Chunk 2: pdfPlainTextBuilder (módulo puro)

### Task 3: Write `pdfPlainTextBuilder.ts` com tests TDD

**Files:**
- Create: `src/export/pdfPlainTextBuilder.ts`
- Create: `tests/export/pdfPlainTextBuilder.test.ts`

- [ ] **Step 1: Write failing test — caso básico**

Criar `tests/export/pdfPlainTextBuilder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPdfPlainText, toSortedOffsets } from '../../src/export/pdfPlainTextBuilder';
import type { PdfFileMetadata } from '../../src/pdf/pdfCodingTypes';

const makeMeta = (pages: Array<{ items: string[] }>): PdfFileMetadata => ({
  mtime: 0,
  pages: pages.map(p => ({ width: 100, height: 100, textItems: p.items })),
});

describe('buildPdfPlainText', () => {
  it('concatena items de uma página com \\n', () => {
    const meta = makeMeta([{ items: ['hello', 'world'] }]);
    const result = buildPdfPlainText(meta);
    expect(result.text).toBe('hello\nworld');
  });

  it('separa páginas com \\f (form-feed)', () => {
    const meta = makeMeta([{ items: ['p1'] }, { items: ['p2'] }]);
    const result = buildPdfPlainText(meta);
    expect(result.text).toBe('p1\fp2');
  });

  it('combina items \\n dentro e \\f entre páginas', () => {
    const meta = makeMeta([{ items: ['a', 'b'] }, { items: ['c', 'd'] }]);
    const result = buildPdfPlainText(meta);
    expect(result.text).toBe('a\nb\fc\nd');
  });

  it('itemOffsets mapeia page:index pra start/end em codepoints', () => {
    const meta = makeMeta([{ items: ['abc', 'de'] }]);
    const result = buildPdfPlainText(meta);
    expect(result.itemOffsets.get('0:0')).toEqual({ start: 0, end: 3 });
    expect(result.itemOffsets.get('0:1')).toEqual({ start: 4, end: 6 });  // 3 + 1 (\n) = 4
  });

  it('multi-page: offset da segunda página inclui \\f', () => {
    const meta = makeMeta([{ items: ['abc'] }, { items: ['xy'] }]);
    const result = buildPdfPlainText(meta);
    expect(result.itemOffsets.get('0:0')).toEqual({ start: 0, end: 3 });
    expect(result.itemOffsets.get('1:0')).toEqual({ start: 4, end: 6 });  // 3 + 1 (\f) = 4
  });

  it('página vazia: nenhum item gerado, mas offset avança com \\f', () => {
    const meta = makeMeta([{ items: ['a'] }, { items: [] }, { items: ['b'] }]);
    const result = buildPdfPlainText(meta);
    // page 0: "a" (offset 0-1)
    // page 1: vazia
    // page 2: "b"
    // text = "a" + "\f" + "" + "\f" + "b" = "a\f\fb" (2 form-feeds entre páginas adjacentes)
    expect(result.text).toBe('a\f\fb');
    expect(result.itemOffsets.get('0:0')).toEqual({ start: 0, end: 1 });
    expect(result.itemOffsets.get('2:0')).toEqual({ start: 3, end: 4 });
  });

  it('unicode: conta codepoints, não code units UTF-16', () => {
    // '🎉' é surrogate pair em UTF-16 (2 code units) mas 1 codepoint
    const meta = makeMeta([{ items: ['🎉a', 'b'] }]);
    const result = buildPdfPlainText(meta);
    // item 0: "🎉a" = 2 codepoints (start=0, end=2)
    // item 1: "b" = 1 codepoint (start=3 após \n, end=4)
    expect(result.itemOffsets.get('0:0')).toEqual({ start: 0, end: 2 });
    expect(result.itemOffsets.get('0:1')).toEqual({ start: 3, end: 4 });
  });

  it('vazio: metadata sem páginas', () => {
    const meta = makeMeta([]);
    const result = buildPdfPlainText(meta);
    expect(result.text).toBe('');
    expect(result.itemOffsets.size).toBe(0);
  });
});

describe('toSortedOffsets', () => {
  it('retorna array ordenado por start', () => {
    const meta = makeMeta([{ items: ['a', 'bc'] }, { items: ['d'] }]);
    const result = buildPdfPlainText(meta);
    const sorted = toSortedOffsets(result);
    expect(sorted).toEqual([
      { page: 0, index: 0, start: 0, end: 1 },
      { page: 0, index: 1, start: 2, end: 4 },
      { page: 1, index: 0, start: 5, end: 6 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run tests/export/pdfPlainTextBuilder.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implementar `src/export/pdfPlainTextBuilder.ts`**

```ts
import type { PdfFileMetadata } from '../pdf/pdfCodingTypes';

export interface PdfPlainTextResult {
  text: string;
  /** Key: `${page}:${index}` → offset absoluto em codepoints. Usado no export. */
  itemOffsets: Map<string, { start: number; end: number }>;
}

/** Separador entre content-items dentro de uma página. */
const ITEM_SEP = '\n';
/** Separador entre páginas (form-feed, ASCII 0x0C). Padrão reconhecido por NVivo/ATLAS.ti. */
const PAGE_SEP = '\f';

/**
 * Conta codepoints Unicode em uma string (trata surrogate pairs como 1).
 */
function codepointLength(s: string): number {
  let count = 0;
  for (const _ of s) count++;
  return count;
}

/**
 * Constrói o PlainText consolidado de um PDF + mapa de offsets por content-item.
 * Regras:
 *   - Items dentro da página: separados por ITEM_SEP ('\n')
 *   - Páginas: separadas por PAGE_SEP ('\f')
 *   - Offsets em codepoints Unicode (não UTF-16 code units)
 * Path puro — não depende de Obsidian/pdfjs.
 */
export function buildPdfPlainText(metadata: PdfFileMetadata): PdfPlainTextResult {
  const parts: string[] = [];
  const itemOffsets = new Map<string, { start: number; end: number }>();
  let cursor = 0;  // offset absoluto em codepoints

  for (let p = 0; p < metadata.pages.length; p++) {
    if (p > 0) {
      parts.push(PAGE_SEP);
      cursor += 1;  // '\f' = 1 codepoint
    }
    const page = metadata.pages[p]!;
    for (let i = 0; i < page.textItems.length; i++) {
      if (i > 0) {
        parts.push(ITEM_SEP);
        cursor += 1;
      }
      const item = page.textItems[i]!;
      const len = codepointLength(item);
      itemOffsets.set(`${p}:${i}`, { start: cursor, end: cursor + len });
      parts.push(item);
      cursor += len;
    }
  }

  return { text: parts.join(''), itemOffsets };
}

/**
 * Deriva array ordenado por start pra busca inversa (binary search) no import.
 * Chamar apenas no path de import — export não precisa.
 */
export function toSortedOffsets(
  result: PdfPlainTextResult,
): Array<{ page: number; index: number; start: number; end: number }> {
  const out: Array<{ page: number; index: number; start: number; end: number }> = [];
  for (const [key, { start, end }] of result.itemOffsets) {
    const [pageStr, indexStr] = key.split(':');
    out.push({ page: Number(pageStr), index: Number(indexStr), start, end });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/export/pdfPlainTextBuilder.test.ts
```
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/export/pdfPlainTextBuilder.ts tests/export/pdfPlainTextBuilder.test.ts
~/.claude/scripts/commit.sh "feat(export): pdfPlainTextBuilder — concatenação e offsets absolutos"
```

---

## Chunk 3: Fixture + Extractor

### Task 4: Script e fixture `tests/fixtures/small.pdf`

**Files:**
- Create: `tests/fixtures/generate-small-pdf.ts`
- Create: `tests/fixtures/small.pdf` (binário commitado)
- Modify: `package.json` (devDependency `pdfkit`)

- [ ] **Step 1: Instalar devDeps**

Run:
```bash
npm install --save-dev pdfkit @types/pdfkit pdfjs-dist
```
Expected: installs sem conflito. `pdfjs-dist` é necessário pra rodar pdfjs headless em jsdom (tests/setup.ts vai importar daqui). `pdfkit` gera a fixture. Commit do `package.json` + `package-lock.json` acontece na task final do chunk.

- [ ] **Step 2: Criar script `tests/fixtures/generate-small-pdf.ts`**

Geração determinística requer pinar `CreationDate` e `id` (pdfkit gera ambos randômicos por default):

```ts
/**
 * Gera tests/fixtures/small.pdf (determinístico).
 * Execução: `npx tsx tests/fixtures/generate-small-pdf.ts`
 *
 * Layout:
 * - Page 1: A4 retrato (595 x 842 pt) — "Hello" + "World"
 * - Page 2: A4 paisagem (842 x 595 pt) — "Landscape" + "Page"
 * - Page 3: A4 retrato — "Unicode: 🎉"
 *
 * Determinismo: CreationDate e id são pinados. Regeneração em qualquer
 * máquina/horário produz arquivo bit-idêntico.
 */
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const outPath = resolve(__dirname, 'small.pdf');

const doc = new PDFDocument({
  autoFirstPage: false,
  info: {
    Title: 'qualia-coding test fixture',
    CreationDate: FIXED_DATE,
    ModDate: FIXED_DATE,
  },
});
// Força id fixo pra estabilidade byte-a-byte (pdfkit gera random por default via _root.data.ID)
(doc as any)._id = Buffer.from('qualia-coding-fixture-id-00000001', 'utf-8');

doc.pipe(createWriteStream(outPath));

// Page 1: A4 retrato
doc.addPage({ size: 'A4', margin: 50 });
doc.fontSize(24).text('Hello', 50, 50);
doc.fontSize(18).text('World', 50, 100);

// Page 2: A4 paisagem
doc.addPage({ size: 'A4', layout: 'landscape', margin: 50 });
doc.fontSize(24).text('Landscape', 50, 50);
doc.fontSize(18).text('Page', 50, 100);

// Page 3: A4 retrato + unicode
doc.addPage({ size: 'A4', margin: 50 });
doc.fontSize(20).text('Unicode: 🎉', 50, 50);

doc.end();
console.log(`Generated ${outPath}`);
```

Se `(doc as any)._id` não funcionar na versão do pdfkit instalada (API interna pode variar), aceitar que `.pdf` regenerado tem diff binário entre máquinas — ainda é OK porque os **tests comparam metadata semântico** (dims, textItems), não bytes. Adicionar nota no topo do arquivo explicando que diffs binários são esperados e não devem ser tratados como regressão.

- [ ] **Step 3: Gerar o PDF**

Run:
```bash
npx tsx tests/fixtures/generate-small-pdf.ts
```
Expected: `Generated .../tests/fixtures/small.pdf`. Verificar que o arquivo existe:
```bash
ls -la tests/fixtures/small.pdf
```

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/generate-small-pdf.ts tests/fixtures/small.pdf package.json package-lock.json
~/.claude/scripts/commit.sh "test: fixture small.pdf (3 páginas, 2 tamanhos, unicode) + script gerador"
```

---

### Task 5: Estender ambient type `window.pdfjsLib`

**Files:**
- Modify: `src/pdf/pdfTypings.d.ts:9-25`

- [ ] **Step 1: Adicionar `getDocument` à declaração de `pdfjsLib`**

Em `src/pdf/pdfTypings.d.ts`, substituir o bloco de `pdfjsLib` (linhas 11-17) por:

```ts
pdfjsLib: {
  Util: {
    normalizeRect(rect: number[]): number[];
  };
  setLayerDimensions?(el: HTMLElement, viewport: PageViewport): void;
  /** Carrega documento PDF a partir de binário. */
  getDocument(src: ArrayBuffer | Uint8Array | { data: ArrayBuffer | Uint8Array }): {
    promise: Promise<PDFDocumentProxy>;
  };
  [key: string]: any;
};
```

O `[key: string]: any` permanece — permite acesso a métodos não-tipados.

- [ ] **Step 2: Verificar tsc**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pdf/pdfTypings.d.ts
~/.claude/scripts/commit.sh "chore(pdf): tipagem de window.pdfjsLib.getDocument em pdfTypings.d.ts"
```

---

### Task 6: `pdfMetadataExtractor.ts` com tests reais

**Files:**
- Create: `src/pdf/pdfMetadataExtractor.ts`
- Create: `tests/pdf/pdfMetadataExtractor.test.ts`

- [ ] **Step 1: Write failing test com fixture**

Criar `tests/pdf/pdfMetadataExtractor.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfMetadata } from '../../src/pdf/pdfMetadataExtractor';

// Mock mínimo de TFile + Vault pra chamar extractPdfMetadata.
function mockVaultWithPdf(pdfBytes: Uint8Array) {
  return {
    readBinary: vi.fn().mockResolvedValue(pdfBytes.buffer),
  } as any;
}

function mockFile(path: string, mtime: number) {
  return {
    path,
    stat: { mtime, size: 0, ctime: 0 },
  } as any;
}

// pdfjs node build precisa ser carregado por import dinâmico em window.pdfjsLib.
// setup.ts injeta stub do pdfjs real.
describe('extractPdfMetadata', () => {
  let pdfBytes: Uint8Array;

  beforeAll(() => {
    const fixturePath = resolve(__dirname, '../fixtures/small.pdf');
    pdfBytes = readFileSync(fixturePath);
  });

  it('extrai 3 páginas da fixture', async () => {
    const vault = mockVaultWithPdf(pdfBytes);
    const file = mockFile('small.pdf', 1234567890);
    const meta = await extractPdfMetadata(vault, file);
    expect(meta.pages).toHaveLength(3);
    expect(meta.mtime).toBe(1234567890);
  });

  it('página 1 é retrato (width < height)', async () => {
    const vault = mockVaultWithPdf(pdfBytes);
    const file = mockFile('small.pdf', 0);
    const meta = await extractPdfMetadata(vault, file);
    expect(meta.pages[0]!.width).toBeLessThan(meta.pages[0]!.height);
  });

  it('página 2 é paisagem (width > height)', async () => {
    const vault = mockVaultWithPdf(pdfBytes);
    const file = mockFile('small.pdf', 0);
    const meta = await extractPdfMetadata(vault, file);
    expect(meta.pages[1]!.width).toBeGreaterThan(meta.pages[1]!.height);
  });

  it('página 1 tem textItems com "Hello" e "World"', async () => {
    const vault = mockVaultWithPdf(pdfBytes);
    const file = mockFile('small.pdf', 0);
    const meta = await extractPdfMetadata(vault, file);
    const joined = meta.pages[0]!.textItems.join(' ');
    expect(joined).toContain('Hello');
    expect(joined).toContain('World');
  });

  it('página 3 preserva unicode', async () => {
    const vault = mockVaultWithPdf(pdfBytes);
    const file = mockFile('small.pdf', 0);
    const meta = await extractPdfMetadata(vault, file);
    const joined = meta.pages[2]!.textItems.join(' ');
    expect(joined).toContain('🎉');
  });
});
```

- [ ] **Step 2: Configurar `tests/setup.ts` com pdfjs real pra jsdom**

`pdfjs-dist` já foi instalado na Task 4 Step 1. Adicionar em `tests/setup.ts`:

```ts
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
(globalThis as any).window ??= globalThis;
(globalThis as any).window.pdfjsLib = pdfjsLib;
```

Se `pdfjs-dist/legacy/build/pdf.mjs` não for o path correto pra versão instalada, testar `pdfjs-dist` direto ou `pdfjs-dist/build/pdf.mjs`. Verificar com `ls node_modules/pdfjs-dist/`.

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npx vitest run tests/pdf/pdfMetadataExtractor.test.ts
```
Expected: FAIL (`extractPdfMetadata is not a function`).

- [ ] **Step 4: Implementar `src/pdf/pdfMetadataExtractor.ts`**

```ts
import type { TFile, Vault } from 'obsidian';
import type { PdfFileMetadata, PdfPageInfo } from './pdfCodingTypes';

/**
 * Extrai metadata (dims + textItems por página) de um PDF via pdfjs headless.
 * Usa `window.pdfjsLib` já carregado pelo Obsidian (declarado em pdfTypings.d.ts).
 *
 * Invariante: mtime do resultado é `file.stat.mtime` no momento da extração.
 * Consumidor é responsável por invalidar cache comparando mtime na próxima leitura.
 */
export async function extractPdfMetadata(
  vault: Vault,
  file: TFile,
): Promise<PdfFileMetadata> {
  const buffer = await vault.readBinary(file);
  const doc = await window.pdfjsLib.getDocument(new Uint8Array(buffer)).promise;
  try {
    const pages: PdfPageInfo[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const textItems = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .filter((s: string) => s.length > 0);
      pages.push({
        width: viewport.width,
        height: viewport.height,
        textItems,
      });
    }
    return { mtime: file.stat.mtime, pages };
  } finally {
    await doc.destroy();
  }
}
```

Sem guards em `window.pdfjsLib` — Obsidian runtime garante que existe; jsdom test setup injeta. Se faltar, o erro do pdfjs propaga naturalmente.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/pdf/pdfMetadataExtractor.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/pdf/pdfMetadataExtractor.ts tests/pdf/pdfMetadataExtractor.test.ts tests/setup.ts
~/.claude/scripts/commit.sh "feat(pdf): pdfMetadataExtractor via pdfjs headless"
```

---

## Chunk 4: Viewer hook

### Task 7: Disparar extract em background ao abrir PDF

**Files:**
- Modify: `src/pdf/index.ts:109-130` (função `instrumentPdfView`, dentro de `component.then`)

- [ ] **Step 1: Ler contexto de `instrumentPdfView`**

Ler `src/pdf/index.ts` linhas 100-150 pra confirmar o shape do child e onde `component.then((child) => { ... })` está. A função `instrumentPdfView` vive dentro de `registerPdfEngine(plugin, ...)` — o `plugin: QualiaCodingPlugin` está em closure (verificar linha 18 onde `registerPdfEngine` é declarado) e expõe `plugin.app.vault`. O `PdfCodingModel` também está em closure via `const model = new PdfCodingModel(...)`.

- [ ] **Step 2: Adicionar hook**

Adicionar import estático no topo do arquivo (não dynamic import — esbuild bundler usa format `cjs` com `bundle: true`, dynamic import inline no mesmo bundle e não gera lazy-load real):

```ts
import { extractPdfMetadata } from './pdfMetadataExtractor';
```

Dentro do callback de `component.then((child: PDFViewerChild) => { ... })`, logo após as linhas existentes que acessam `child.file`, adicionar:

```ts
// Populate fileMetadata cache — fire-and-forget (background).
const file = child.file;
if (file) {
  const fileId = file.path;
  const cached = model.getFileMetadata(fileId);
  if (!cached || cached.mtime !== file.stat.mtime) {
    extractPdfMetadata(plugin.app.vault, file).then((meta) => {
      model.setFileMetadata(fileId, meta);
    }).catch((err) => {
      console.warn(`[qualia-coding] PDF metadata extract falhou para ${fileId}:`, err);
    });
  }
}
```

Notas:
- Não há `await` — é intencional. Usuário abre o PDF, extract roda em background.
- `plugin.app.vault` é o acesso correto (confirmado: `plugin: QualiaCodingPlugin` é o parâmetro da `registerPdfEngine`, exposto via closure). Outros call sites no arquivo usam `plugin.app` (ver linhas 50, 146, 157, 190).

- [ ] **Step 3: Manual smoke test no workbench vault**

Run:
```bash
npm run dev &  # watch mode
```
No Obsidian (reload do plugin via Ctrl+R ou reabrir vault), abrir um PDF existente no workbench vault. Abrir DevTools console — não deve haver erro. Verificar via console:

```js
app.plugins.plugins['qualia-coding'].dataManager.section('pdf').fileMetadata
```

Expected: objeto com entry pro PDF aberto, contendo `mtime` e `pages[]`.

- [ ] **Step 4: Commit**

```bash
git add src/pdf/index.ts
~/.claude/scripts/commit.sh "feat(pdf): hook de extract de metadata ao abrir PDF no viewer"
```

---

## Chunk 5: Export refactor (E1 + E2)

### Task 8: Extender `buildPdfSourceXml` com param `plainText`

**Files:**
- Modify: `src/export/qdpxExporter.ts:204-270` (assinatura + uso do Representation)

- [ ] **Step 1: Atualizar 3 call sites existentes + adicionar test novo**

Call sites existentes que precisam ganhar o novo param (confirmados em `tests/export/qdpxExporter.test.ts`):
- Linha 195: `buildPdfSourceXml('docs/paper.pdf', textMarkers, [], null, textOffsets, guidMap, notes)`
- Linha 217: `buildPdfSourceXml('docs/paper.pdf', [], shapes, pageHeights, new Map(), guidMap, notes)`
- Linha 232: `buildPdfSourceXml('docs/paper.pdf', [], shapes, null, new Map(), guidMap, notes)`

Em **cada** um, adicionar como 8º argumento `undefined` (posicional pro `includeSources`) e 9º `''` (plainText vazio nos testes que não exercitam Representation), OU reestruturar se o teste não precisa de plainText real. Alternativa mais limpa: os 3 tests passam `false` (includeSources) + `''` (plainText).

Adicionar test novo também ao final do arquivo:

```ts
describe('buildPdfSourceXml — plainText + return shape', () => {
  it('retorna { xml, reprGuid } e emite <Representation> quando há textMarkers', () => {
    const markerId = 'm1';
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const textMarkers: PdfMarker[] = [{
      id: markerId,
      fileId: 'docs/foo.pdf',
      page: 0,
      beginIndex: 0,
      beginOffset: 0,
      endIndex: 0,
      endOffset: 5,
      text: 'Hello',
      codes: [{ codeId: 'c1' }],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    }];
    // codeId 'c1' precisa estar no guidMap pro buildCodingXml funcionar
    guidMap.set('code:c1', 'code-guid-1');

    const { xml, reprGuid } = buildPdfSourceXml(
      'docs/foo.pdf',
      textMarkers,
      [],
      null,
      new Map([[markerId, { start: 0, end: 5 }]]),
      guidMap,
      notes,
      true,           // includeSources
      'Hello\nWorld', // plainText
    );

    expect(reprGuid).toBeTruthy();
    expect(xml).toContain('<Representation ');
    expect(xml).toContain(`${reprGuid}.txt`);
  });

  it('retorna reprGuid=null quando não há textMarkers', () => {
    const { reprGuid } = buildPdfSourceXml(
      'docs/foo.pdf',
      [],
      [],
      null,
      new Map(),
      new Map(),
      [],
      false,
      '',
    );
    expect(reprGuid).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run tests/export/qdpxExporter.test.ts
```
Expected: FAIL (assinatura antiga + return type string).

- [ ] **Step 3: Atualizar assinatura e retorno de `buildPdfSourceXml`**

Em `src/export/qdpxExporter.ts:204-213`, mudar:

```ts
export function buildPdfSourceXml(
  filePath: string,
  textMarkers: PdfMarker[],
  shapeMarkers: PdfShapeMarker[],
  pageDimensions: Record<number, { width: number; height: number }> | null,
  textOffsets: Map<string, { start: number; end: number }>,
  guidMap: Map<string, string>,
  notes: string[],
  includeSources: boolean,
  plainText: string,
): { xml: string; reprGuid: string | null } {
```

**Param `plainText` é required** (sem `?`). Todos os 4 call sites (3 tests + 1 produção no `qdpxExporter.ts:442`) serão atualizados aqui ou na Task 9.

**Param `includeSources` também vira required** (hoje é opcional com `?`). Os 3 call sites de teste existentes passam `false`; o caller em produção passa `options.includeSources` explicitamente. Menos surface de bug.

Body: na linha onde `representationEl` é construído (~225-227), ajustar pra retornar `null` em `reprGuid` quando não há `textMarkers`:

```ts
const reprGuid = textMarkers.length > 0 ? uuidV4() : null;
const reprPath = reprGuid && includeSources
  ? `internal://${reprGuid}.txt`
  : reprGuid ? `relative://${filePath.replace(/\.pdf$/i, '.txt')}` : '';
const representationEl = reprGuid
  ? `<Representation ${xmlAttr('guid', reprGuid)} ${xmlAttr('plainTextPath', reprPath)}/>`
  : '';
```

No `return` final (linha 269), retornar objeto:

```ts
return {
  xml: `<PDFSource ${xmlAttr('guid', srcGuid)} ${xmlAttr('name', fileName(filePath))} ${pathAttr}>\n${inner}\n</PDFSource>`,
  reprGuid,
};
```

Atualizar os 3 call sites de teste existentes (linhas 195/217/232) pra destructurar: `const { xml } = buildPdfSourceXml(..., false, '');`.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/export/qdpxExporter.test.ts
```
Expected: PASS (tests existentes continuam + novo passa).

- [ ] **Step 5: Commit**

```bash
git add src/export/qdpxExporter.ts tests/export/qdpxExporter.test.ts
~/.claude/scripts/commit.sh "feat(export): buildPdfSourceXml aceita plainText consolidado"
```

---

### Task 9: Refatorar bloco PDF do exporter (E1 + E2)

**Files:**
- Modify: `src/export/qdpxExporter.ts:427-452`

- [ ] **Step 1: Write failing test — offsets absolutos**

Em `tests/export/qdpxExporter.test.ts`, adicionar novo bloco descrevendo comportamento via `buildQdpxProject` (ou a função que orquestra export — ler o arquivo pra identificar o nome real: provavelmente `createQdpxZip` ou equivalente exportado):

```ts
import { createQdpxZip } from '../../src/export/qdpxExporter';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';

describe('QDPX export — PDF offsets absolutos (E1+E2)', () => {
  // Helper pra setup mínimo
  function setupExportScenario(opts: {
    markers: PdfMarker[];
    shapes: any[];
    fileMetadata: Record<string, any>;
  }) {
    const dataManager = {
      section: (key: string) => {
        if (key === 'pdf') return {
          markers: opts.markers,
          shapes: opts.shapes,
          fileMetadata: opts.fileMetadata,
          settings: { autoOpen: false, showButton: true },
        };
        return {};  // outros engines vazios pra este teste
      },
    } as any;
    const registry = { definitions: {}, folders: {}, rootOrder: [], getAll: () => [] } as any;
    const caseVarsRegistry = { getForFile: () => ({}) } as any;
    return { dataManager, registry, caseVarsRegistry };
  }

  it('exporta offsets absolutos baseados em fileMetadata', async () => {
    const marker: PdfMarker = {
      id: 'm1',
      fileId: 'docs/foo.pdf',
      page: 0,
      beginIndex: 1,     // item "World"
      beginOffset: 0,
      endIndex: 1,
      endOffset: 5,
      text: 'World',
      codes: [{ codeId: 'c1' }],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };
    const fileMetadata = {
      'docs/foo.pdf': {
        mtime: 0,
        pages: [
          { width: 612, height: 792, textItems: ['Hello', 'World'] },
        ],
      },
    };
    const { dataManager, registry, caseVarsRegistry } = setupExportScenario({
      markers: [marker], shapes: [], fileMetadata,
    });
    // registry precisa ter codeId 'c1' definido
    registry.getAll = () => [{ id: 'c1', name: 'Test', color: '#ff0000', parentId: null, childrenOrder: [] }];

    const mockApp = { vault: { adapter: { readBinary: async () => new ArrayBuffer(0) } } } as any;
    const result = await createQdpxZip(
      { includeSources: false },
      dataManager,
      registry,
      caseVarsRegistry,
      mockApp,
    );

    // Decodificar XML do project.qde e verificar
    const xmlBytes = result.files.get('project.qde');
    const xml = new TextDecoder().decode(xmlBytes!);
    // "Hello\nWorld" → "World" começa em offset 6 (codepoint: H=0, e=1, l=2, l=3, o=4, \n=5, W=6...)
    expect(xml).toMatch(/startPosition="6"/);
    expect(xml).toMatch(/endPosition="11"/);
  });

  it('exporta shape markers com pageDims reais de fileMetadata', async () => {
    const shape = {
      id: 's1',
      fileId: 'docs/foo.pdf',
      page: 0,
      shape: 'rect',
      coords: { type: 'rect', x: 0, y: 0, w: 1, h: 1 },
      codes: [{ codeId: 'c1' }],
      createdAt: 0,
      updatedAt: 0,
    };
    const fileMetadata = {
      'docs/foo.pdf': {
        mtime: 0,
        pages: [{ width: 595, height: 842, textItems: [] }],  // A4 retrato
      },
    };
    const { dataManager, registry, caseVarsRegistry } = setupExportScenario({
      markers: [], shapes: [shape], fileMetadata,
    });
    registry.getAll = () => [{ id: 'c1', name: 'Test', color: '#ff0000', parentId: null, childrenOrder: [] }];

    const mockApp = { vault: { adapter: {} } } as any;
    const result = await createQdpxZip(
      { includeSources: false },
      dataManager, registry, caseVarsRegistry, mockApp,
    );
    const xml = new TextDecoder().decode(result.files.get('project.qde')!);
    // rect (0,0,1,1) em A4 retrato 595x842 → firstX=0, firstY=842, secondX=595, secondY=0
    expect(xml).toMatch(/firstX="0"/);
    expect(xml).toMatch(/secondX="595"/);
    expect(xml).toMatch(/firstY="842"/);
  });
});
```

Nota: se `createQdpxZip` tem outro nome/assinatura, adaptar — ler o arquivo primeiro. O shape do retorno (`{ files: Map }`) é hipotético; confirmar na implementação. Se a orquestração real devolve `Uint8Array` do zip pronto, usar `fflate.unzipSync(result)` pra extrair `project.qde` antes de decodificar.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run tests/export/qdpxExporter.test.ts -t "absolutos"
```
Expected: FAIL (exporter ainda usa beginOffset como absoluto).

- [ ] **Step 3: Refatorar bloco PDF em `qdpxExporter.ts:427-452`**

Estado final (substituir bloco inteiro):

```ts
// --- PDF ---
const pdfData = dataManager.section('pdf');
const pdfByFile = groupByFileId(pdfData.markers, pdfData.shapes);
for (const [fileId, { textMarkers, shapeMarkers }] of pdfByFile) {
  let meta = pdfData.fileMetadata[fileId];
  if (!meta) {
    // Fallback mandatório per spec §3.3: extrair on-demand com progress modal.
    // Progress reporter é injetado por options.progressReporter (ver Task 13).
    if (options.progressReporter) {
      options.progressReporter.update(`Preparing PDF: ${fileId}`);
    }
    const tfile = app.vault.getAbstractFileByPath(fileId);
    if (!tfile || !('stat' in tfile)) {
      warnings.push(`PDF ${fileId} não encontrado no vault — skip`);
      continue;
    }
    meta = await extractPdfMetadata(app.vault, tfile as TFile);
    pdfData.fileMetadata[fileId] = meta;  // popula cache in-memory (model.save() é responsabilidade externa)
  }

  const { text: plainText, itemOffsets } = buildPdfPlainText(meta);

  const textOffsets = new Map<string, { start: number; end: number }>();
  for (const m of textMarkers) {
    const startItem = itemOffsets.get(`${m.page}:${m.beginIndex}`);
    const endItem = itemOffsets.get(`${m.page}:${m.endIndex}`);
    if (!startItem || !endItem) {
      warnings.push(`PDF marker ${m.id} tem beginIndex/endIndex fora do metadata — skip`);
      continue;
    }
    textOffsets.set(m.id, {
      start: startItem.start + m.beginOffset,
      end: endItem.start + m.endOffset,
    });
  }

  const pageDims: Record<number, { width: number; height: number }> = {};
  for (let i = 0; i < meta.pages.length; i++) {
    pageDims[i] = { width: meta.pages[i]!.width, height: meta.pages[i]!.height };
  }

  const { xml, reprGuid } = buildPdfSourceXml(
    fileId,
    textMarkers,
    shapeMarkers,
    pageDims,
    textOffsets,
    guidMap,
    notes,
    options.includeSources ?? false,
    plainText,
  );
  if (xml) {
    const variablesXml = renderVariablesForFile(fileId, caseVariablesRegistry);
    allSourcesXml.push(injectVariablesIntoSource(xml, variablesXml));
    const srcGuid = guidMap.get(`source:${fileId}`);
    if (srcGuid) sourceGuidByFileId.set(fileId, srcGuid);
  }
  if (options.includeSources) {
    await addSourceFile(app.vault, fileId, sourceFiles, guidMap);
    // reprGuid vem direto do builder — sem hacks de extrair do XML
    if (reprGuid) {
      sourceFiles.set(`sources/${reprGuid}.txt`, strToU8(plainText));
    }
  }
}
```

Imports no topo do arquivo (adicionar):

```ts
import { buildPdfPlainText } from './pdfPlainTextBuilder';
import { extractPdfMetadata } from '../pdf/pdfMetadataExtractor';
import type { TFile } from 'obsidian';
```

- [ ] **Step 4: Run tests**

Run:
```bash
npx vitest run tests/export/
```
Expected: PASS (incluindo os 3 tests existentes atualizados na Task 8 + os 2 novos).

- [ ] **Step 5: Commit**

```bash
git add src/export/qdpxExporter.ts tests/export/
~/.claude/scripts/commit.sh "feat(export): bloco PDF usa fileMetadata pra offsets absolutos e pageDims reais (E1+E2)"
```

---

## Chunk 6: Import refactor (I1 + I2)

### Task 10: Ordem do PDFSource branch + dims reais (I1)

**Files:**
- Modify: `src/import/qdpxImporter.ts` (branch de `PDFSource`)

- [ ] **Step 1: Ler branch atual do `PDFSource` no importer**

Ler `src/import/qdpxImporter.ts` integralmente, focando em: (a) onde o `PDFSource` é processado, (b) onde o PDF binário é extraído do zip, (c) onde os markers são criados. Identificar a ordem atual e o TFile usado.

- [ ] **Step 2: Write failing test — dims reais**

Antes de escrever: ler `src/import/qdpxImporter.ts` integralmente pra identificar (a) a função orquestradora exportada (provavelmente `importQdpxProject` ou similar), (b) o shape do objeto `source` no branch de PDFSource (como `shapes`, `plainTextSelections` são estruturados), (c) helpers existentes (`extractFromZip`, `uuidV4`).

Em `tests/import/qdpxImport.test.ts` (criar se não existir):

```ts
import { describe, it, expect, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
// Ajustar import conforme export real do importer:
import { importQdpxProject } from '../../src/import/qdpxImporter';

describe('QDPX import — PDF dims reais (I1)', () => {
  // Helper: monta um .qdpx mínimo em memória com 1 PDFSource + shape marker
  function buildMinimalQdpx(pdfBytes: Uint8Array): Uint8Array {
    const projectXml = `<?xml version="1.0"?>
<Project xmlns="urn:QDA-XML:project:1.0">
  <CodeBook>
    <Codes>
      <Code guid="code-1" name="TestCode" color="#ff0000"/>
    </Codes>
  </CodeBook>
  <Sources>
    <PDFSource guid="pdf-1" name="small.pdf" path="internal://pdf-1.pdf">
      <PDFSelection guid="sel-1" page="0" firstX="0" firstY="842" secondX="595" secondY="0" creationDateTime="2026-01-01T00:00:00Z">
        <Coding guid="cod-1"><CodeRef targetGUID="code-1"/></Coding>
      </PDFSelection>
    </PDFSource>
  </Sources>
</Project>`;
    return zipSync({
      'project.qde': strToU8(projectXml),
      'sources/pdf-1.pdf': pdfBytes,
    });
  }

  it('usa pageDims de fileMetadata extraído do PDF (não default 612x792)', async () => {
    // Ler fixture small.pdf (page 0 é A4 retrato 595x842)
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const pdfBytes = new Uint8Array(readFileSync(resolve(__dirname, '../fixtures/small.pdf')));

    const qdpxBytes = buildMinimalQdpx(pdfBytes);

    // Mock vault que persiste em memória
    const vaultFiles = new Map<string, Uint8Array>();
    const mockApp = {
      vault: {
        adapter: {
          writeBinary: vi.fn(async (path: string, data: ArrayBuffer) => {
            vaultFiles.set(path, new Uint8Array(data));
          }),
          write: vi.fn(),
          mkdir: vi.fn(),
        },
        getAbstractFileByPath: vi.fn((path: string) => {
          if (!vaultFiles.has(path)) return null;
          return { path, stat: { mtime: 0, size: vaultFiles.get(path)!.length, ctime: 0 } };
        }),
        readBinary: vi.fn(async (file: any) => vaultFiles.get(file.path)!.buffer),
      },
    } as any;

    // Mock models/registry que o importer precisa. Ajustar nomes conforme API real:
    const pdfCodingModel = {
      setFileMetadata: vi.fn(),
      addShapeMarker: vi.fn(),  // ou o método equivalente
    } as any;
    const registry = { /* ... */ } as any;

    const result = await importQdpxProject(qdpxBytes, {
      app: mockApp,
      pdfCodingModel,
      registry,
      // ... outras deps conforme API real
    });

    // Shape marker deve usar 595x842, não 612x792
    // rect (0,842,595,0) em page 595x842 → coords normalizadas x=0, y=0, w=1, h=1
    const calls = pdfCodingModel.addShapeMarker.mock.calls;
    expect(calls).toHaveLength(1);
    const shape = calls[0][0];
    expect(shape.coords.w).toBeCloseTo(1.0, 3);
    expect(shape.coords.h).toBeCloseTo(1.0, 3);

    // Metadata foi populado
    expect(pdfCodingModel.setFileMetadata).toHaveBeenCalled();
    const [metaFileId, meta] = pdfCodingModel.setFileMetadata.mock.calls[0];
    expect(meta.pages[0].width).toBe(595);
    expect(meta.pages[0].height).toBe(842);
  });
});
```

**Se a API real do importer divergir, adaptar:** o importante é (a) QDPX mínimo com shape marker, (b) mock de vault in-memory, (c) asserção que `setFileMetadata` foi chamado ANTES do `addShapeMarker`, (d) coords usam dims reais.

- [ ] **Step 3: Reordenar pipeline do PDFSource**

Dentro do branch de PDFSource no `qdpxImporter.ts`, garantir ordem exata:

```ts
// 1. Extrair binário do PDF do zip (helper existente)
const pdfBytes = extractFromZip(zipEntries, source.path);  // ajustar nome real

// 2. Escrever no vault via adapter (padrão §11.1 round-trip)
const targetPath = resolveTargetPath(source.name);
await app.vault.adapter.writeBinary(targetPath, pdfBytes.buffer);

// 3. Obter TFile (writeBinary é async; após resolver, o cache de vault já tem o arquivo)
const tfile = app.vault.getAbstractFileByPath(targetPath) as TFile | null;
if (!tfile) {
  warnings.push(`TFile não encontrado após writeBinary: ${targetPath} — skip source`);
  continue;
}

// 4. Extrair metadata SÍNCRONO no pipeline (antes de processar markers)
const meta = await extractPdfMetadata(app.vault, tfile);
pdfCodingModel.setFileMetadata(targetPath, meta);

// 5. Processar shape markers com dims reais
for (const shape of source.shapes) {
  const dim = meta.pages[shape.page];
  if (!dim) continue;
  const coords = pdfRectToNormalized(
    shape.firstX, shape.firstY, shape.secondX, shape.secondY,
    dim.width, dim.height,
  );
  pdfCodingModel.addShapeMarker({
    id: uuidV4(),
    fileId: targetPath,
    page: shape.page,
    shape: 'rect',
    coords,
    codes: shape.codes,
    createdAt: shape.creationDateTime ?? Date.now(),
    updatedAt: Date.now(),
  });
}
```

**Sem retry com setTimeout** — se `getAbstractFileByPath` retorna null após `writeBinary` resolver, é bug concreto que precisa investigação, não hedge profilático. §11.1 round-trip já validou que essa sequência funciona.

- [ ] **Step 4: Run tests**

Run:
```bash
npx vitest run tests/import/
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/qdpxImporter.ts tests/import/
~/.claude/scripts/commit.sh "feat(import): PDFSource com metadata extract in-pipeline e dims reais (I1)"
```

---

### Task 11: `PlainTextSelection` dentro de `PDFSource` (I2)

**Files:**
- Modify: `src/import/qdpxImporter.ts` (mesmo branch, adicionar tratamento de PlainTextSelection)

- [ ] **Step 1: Write failing test**

Em `tests/import/qdpxImport.test.ts`, adicionar:

```ts
describe('QDPX import — PlainTextSelection em PDFSource (I2)', () => {
  it('mapeia offset absoluto pra beginIndex/beginOffset via binary search', async () => {
    // Fixture metadata: page 0 com textItems ['Hello', 'World']
    // PlainText consolidado: "Hello\nWorld" (\n entre items)
    // PlainTextSelection startPosition=6 endPosition=11 → corresponde ao item "World"
    // Esperado: marker { page: 0, beginIndex: 1, beginOffset: 0, endIndex: 1, endOffset: 5 }

    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { zipSync, strToU8 } = await import('fflate');

    // Criar um PDF sintético com texto "Hello" na page 0 + "World" como item separado
    // OU usar a fixture small.pdf e calcular startPosition correto em runtime.
    // Abordagem: usar fixture, extrair metadata primeiro pra descobrir offsets reais, construir QDPX.

    const pdfBytes = new Uint8Array(readFileSync(resolve(__dirname, '../fixtures/small.pdf')));

    // Setup vault mock (copiar do test anterior em Step 2 da Task 10)
    const vaultFiles = new Map<string, Uint8Array>();
    const mockApp = {
      vault: {
        adapter: {
          writeBinary: vi.fn(async (path: string, data: ArrayBuffer) => {
            vaultFiles.set(path, new Uint8Array(data));
          }),
          write: vi.fn(),
          mkdir: vi.fn(),
        },
        getAbstractFileByPath: vi.fn((path: string) => {
          if (!vaultFiles.has(path)) return null;
          return { path, stat: { mtime: 0, size: vaultFiles.get(path)!.length, ctime: 0 } };
        }),
        readBinary: vi.fn(async (file: any) => vaultFiles.get(file.path)!.buffer),
      },
    } as any;

    // Pré-computar offset esperado:
    // Extrair metadata da fixture (page 0 tem "Hello" e "World" como items separados)
    // PlainText = "Hello\nWorld\fLandscape\nPage\fUnicode: 🎉"
    // startPosition de "World" = 6, endPosition = 11
    const projectXml = `<?xml version="1.0"?>
<Project xmlns="urn:QDA-XML:project:1.0">
  <CodeBook>
    <Codes><Code guid="code-1" name="Test" color="#f00"/></Codes>
  </CodeBook>
  <Sources>
    <PDFSource guid="pdf-1" name="small.pdf" path="internal://pdf-1.pdf">
      <PlainTextSelection guid="sel-1" startPosition="6" endPosition="11" creationDateTime="2026-01-01T00:00:00Z">
        <Coding guid="cod-1"><CodeRef targetGUID="code-1"/></Coding>
      </PlainTextSelection>
    </PDFSource>
  </Sources>
</Project>`;

    const qdpxBytes = zipSync({
      'project.qde': strToU8(projectXml),
      'sources/pdf-1.pdf': pdfBytes,
    });

    const pdfCodingModel = {
      setFileMetadata: vi.fn(),
      addMarker: vi.fn(),  // ou método equivalente — ajustar pro nome real
      addShapeMarker: vi.fn(),
    } as any;
    const registry = { /* ... */ } as any;

    await importQdpxProject(qdpxBytes, {
      app: mockApp,
      pdfCodingModel,
      registry,
    });

    expect(pdfCodingModel.addMarker).toHaveBeenCalledOnce();
    const marker = pdfCodingModel.addMarker.mock.calls[0][0];
    expect(marker.page).toBe(0);
    expect(marker.beginIndex).toBe(1);   // item "World" é index 1 na page 0
    expect(marker.beginOffset).toBe(0);
    expect(marker.endIndex).toBe(1);
    expect(marker.endOffset).toBe(5);
  });
});
```

**Nota:** este test depende do pdfkit produzir "Hello" e "World" como content-items separados no page 0 da fixture. Se o pdfjs extractor concatenar os dois em 1 item (pode acontecer dependendo do layout), ajustar a fixture pra forçar 2 items (ex: `doc.fontSize(24).text('Hello', 50, 50);` seguido de `doc.moveDown(2);` antes de `.text('World', 50, 150)`).

- [ ] **Step 2: Implementar binary search**

Adicionar helper perto do branch do PDFSource:

```ts
import { buildPdfPlainText, toSortedOffsets } from '../export/pdfPlainTextBuilder';

function findItemAtOffset(
  sorted: ReturnType<typeof toSortedOffsets>,
  offset: number,
): { page: number; index: number; offsetInItem: number } | null {
  // binary search pelo item que contém `offset`
  let lo = 0, hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const item = sorted[mid]!;
    if (offset < item.start) hi = mid - 1;
    else if (offset > item.end) lo = mid + 1;  // strict >: offset==end é válido (fim do item)
    else return { page: item.page, index: item.index, offsetInItem: offset - item.start };
  }
  return null;
}
```

No branch do PDFSource, após extract metadata:

```ts
const plainTextResult = buildPdfPlainText(meta);
const sorted = toSortedOffsets(plainTextResult);

for (const sel of source.plainTextSelections) {
  const startRef = findItemAtOffset(sorted, sel.startPosition);
  const endRef = findItemAtOffset(sorted, sel.endPosition);
  if (!startRef || !endRef) {
    warnings.push(`PlainTextSelection fora do metadata em ${targetPath} (${sel.startPosition}-${sel.endPosition})`);
    continue;
  }
  const marker: PdfMarker = {
    id: uuidV4(),
    fileId: targetPath,
    page: startRef.page,
    beginIndex: startRef.index,
    beginOffset: startRef.offsetInItem,
    endIndex: endRef.index,
    endOffset: endRef.offsetInItem,
    text: plainTextResult.text.slice(sel.startPosition, sel.endPosition),
    codes: sel.codes,
    createdAt: sel.creationDateTime ?? Date.now(),
    updatedAt: Date.now(),
  };
  pdfCodingModel.addMarker(marker);  // ou método equivalente
}
```

Obs: o warning antigo em `qdpxImporter.ts:689` ("text offset mapping not yet supported") deve ser removido nesta mesma task.

- [ ] **Step 3: Run test to verify it passes**

Run:
```bash
npx vitest run tests/import/
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/import/qdpxImporter.ts tests/import/
~/.claude/scripts/commit.sh "feat(import): PlainTextSelection em PDFSource com binary search (I2)"
```

---

## Chunk 7: Round-trip + cleanup

### Task 12: Round-trip integration test

**Files:**
- Modify: `tests/export/qdpxGuidConsistency.test.ts` (ou criar `tests/export/qdpxRoundTrip.pdf.test.ts`)

- [ ] **Step 1: Write round-trip test**

O teste integrado é custoso (precisa stubar App/Vault/models e montar o pipeline completo). Em vez de stubar tudo de novo, reusar os helpers `setupExportScenario` (Task 9) e o mock vault (Task 10). Criar `tests/export/qdpxRoundTrip.pdf.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { createQdpxZip } from '../../src/export/qdpxExporter';
import { importQdpxProject } from '../../src/import/qdpxImporter';
import type { PdfMarker, PdfShapeMarker, PdfFileMetadata } from '../../src/pdf/pdfCodingTypes';

describe('QDPX round-trip — PDF', () => {
  it('export → import preserva offsets e dims', async () => {
    const pdfBytes = new Uint8Array(readFileSync(resolve(__dirname, '../fixtures/small.pdf')));

    // Fileasset metadata coerente com a fixture small.pdf (page 0 = 595x842 A4 retrato)
    const fileMetadata: Record<string, PdfFileMetadata> = {
      'docs/small.pdf': {
        mtime: 0,
        pages: [
          { width: 595, height: 842, textItems: ['Hello', 'World'] },
          { width: 842, height: 595, textItems: ['Landscape', 'Page'] },
          { width: 595, height: 842, textItems: ['Unicode: 🎉'] },
        ],
      },
    };

    const originalMarker: PdfMarker = {
      id: 'm-orig',
      fileId: 'docs/small.pdf',
      page: 0,
      beginIndex: 1,
      beginOffset: 0,
      endIndex: 1,
      endOffset: 5,
      text: 'World',
      codes: [{ codeId: 'c1' }],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };
    const originalShape: PdfShapeMarker = {
      id: 's-orig',
      fileId: 'docs/small.pdf',
      page: 0,
      shape: 'rect',
      coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
      codes: [{ codeId: 'c1' }],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };

    // ---- Export ----
    const srcFiles = new Map<string, Uint8Array>([['docs/small.pdf', pdfBytes]]);
    const exportApp = {
      vault: {
        adapter: {
          readBinary: vi.fn(async (path: string) => srcFiles.get(path)!.buffer),
        },
        readBinary: vi.fn(async (file: any) => srcFiles.get(file.path)!.buffer),
        getAbstractFileByPath: (path: string) => srcFiles.has(path)
          ? { path, stat: { mtime: 0, size: srcFiles.get(path)!.length, ctime: 0 } }
          : null,
      },
    } as any;
    const exportDataManager = {
      section: (key: string) => key === 'pdf'
        ? { markers: [originalMarker], shapes: [originalShape], fileMetadata, settings: {} }
        : {},
    } as any;
    const exportRegistry = {
      getAll: () => [{ id: 'c1', name: 'Test', color: '#f00', parentId: null, childrenOrder: [] }],
    } as any;
    const caseVarsReg = { getForFile: () => ({}) } as any;

    const exportResult = await createQdpxZip(
      { includeSources: true },
      exportDataManager, exportRegistry, caseVarsReg, exportApp,
    );

    // ---- Import ----
    const importVaultFiles = new Map<string, Uint8Array>();
    const importApp = {
      vault: {
        adapter: {
          writeBinary: async (path: string, data: ArrayBuffer) => {
            importVaultFiles.set(path, new Uint8Array(data));
          },
          write: vi.fn(),
          mkdir: vi.fn(),
        },
        getAbstractFileByPath: (path: string) => importVaultFiles.has(path)
          ? { path, stat: { mtime: 0, size: importVaultFiles.get(path)!.length, ctime: 0 } }
          : null,
        readBinary: async (file: any) => importVaultFiles.get(file.path)!.buffer,
      },
    } as any;

    const captured = {
      markers: [] as PdfMarker[],
      shapes: [] as PdfShapeMarker[],
      metadata: {} as Record<string, PdfFileMetadata>,
    };
    const importPdfModel = {
      addMarker: (m: PdfMarker) => captured.markers.push(m),
      addShapeMarker: (s: PdfShapeMarker) => captured.shapes.push(s),
      setFileMetadata: (fileId: string, meta: PdfFileMetadata) => {
        captured.metadata[fileId] = meta;
      },
    } as any;
    const importRegistry = { /* setup mínimo */ } as any;

    // Passar o Uint8Array do zip final — o importer faz unzipSync internamente
    const qdpxBytes = exportResult.bytes;  // assumindo que createQdpxZip retorna { bytes: Uint8Array, ... }
    await importQdpxProject(qdpxBytes, {
      app: importApp,
      pdfCodingModel: importPdfModel,
      registry: importRegistry,
    });

    // ---- Assertions ----
    expect(captured.markers).toHaveLength(1);
    const imported = captured.markers[0]!;
    expect(imported.page).toBe(originalMarker.page);
    expect(imported.beginIndex).toBe(originalMarker.beginIndex);
    expect(imported.beginOffset).toBe(originalMarker.beginOffset);
    expect(imported.endIndex).toBe(originalMarker.endIndex);
    expect(imported.endOffset).toBe(originalMarker.endOffset);

    expect(captured.shapes).toHaveLength(1);
    const importedShape = captured.shapes[0]!;
    expect(importedShape.coords.x).toBeCloseTo(originalShape.coords.x, 2);
    expect(importedShape.coords.y).toBeCloseTo(originalShape.coords.y, 2);
    expect(importedShape.coords.w).toBeCloseTo(originalShape.coords.w, 2);
    expect(importedShape.coords.h).toBeCloseTo(originalShape.coords.h, 2);

    // Metadata foi populado no destino
    expect(captured.metadata['docs/small.pdf']).toBeDefined();
    expect(captured.metadata['docs/small.pdf']!.pages).toHaveLength(3);
  });
});
```

**Se a assinatura real de `createQdpxZip` / `importQdpxProject` divergir, ajustar** — o essencial é: export produz bytes, import consome bytes, asserções verificam preservação.

- [ ] **Step 2: Run test**

Run:
```bash
npx vitest run tests/export/qdpxRoundTrip.pdf.test.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/export/
~/.claude/scripts/commit.sh "test: round-trip QDPX PDF (export → import preserva offsets e dims)"
```

---

### Task 13: Remover warnings antigos + progress modal no fallback

**Files:**
- Modify: `src/export/qdpxExporter.ts` (remover warnings E1/E2 obsoletos)
- Modify: `src/export/exportModal.ts` (mensagem atualizada)
- Modify: `src/import/qdpxImporter.ts` (remover warning I2 obsoleto)
- Opcional: adicionar progress reporter no export pra PDFs sem metadata

- [ ] **Step 1: Audit warnings obsoletos**

Run:
```bash
grep -rn "are approximate\|skipped (page dimensions\|text offset mapping not yet supported" src/export/ src/import/
```

Remover cada ocorrência. Preservar apenas warnings que ainda refletem comportamento real (ex: "PDF not found", "PDF scanned sem text layer").

- [ ] **Step 2: Atualizar mensagem do `exportModal`**

Ler `src/export/exportModal.ts` e remover/atualizar qualquer texto que diga "PDF offsets aproximados" ou similar (o comportamento melhorou — o texto fica desatualizado).

- [ ] **Step 3: Progress modal obrigatório pro fallback de extract on-demand**

Spec §3.3 manda: quando o exporter encontra PDF sem `fileMetadata`, extrai on-demand com progress modal `"Preparing N of M PDFs..."`. Isto é requirement, não polish.

Criar `src/export/exportProgressModal.ts`:

```ts
import { App, Modal } from 'obsidian';

export interface ProgressReporter {
  update(message: string): void;
}

export class ExportProgressModal extends Modal implements ProgressReporter {
  private messageEl: HTMLElement | null = null;
  private total: number;
  private current = 0;

  constructor(app: App, total: number) {
    super(app);
    this.total = total;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Exporting QDPX…' });
    this.messageEl = contentEl.createEl('p', { text: 'Preparing…' });
  }

  update(message: string) {
    this.current += 1;
    if (this.messageEl) {
      this.messageEl.textContent = `${message} (${this.current}/${this.total})`;
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
```

Integração no `exportCommands.ts` (ou onde `createQdpxZip` é chamado pela UI):

```ts
// Antes de chamar createQdpxZip, contar PDFs sem metadata:
const pdfData = plugin.dataManager.section('pdf');
const pdfsNeedingExtract = new Set<string>();
for (const m of pdfData.markers) {
  if (!pdfData.fileMetadata[m.fileId]) pdfsNeedingExtract.add(m.fileId);
}
for (const s of pdfData.shapes) {
  if (!pdfData.fileMetadata[s.fileId]) pdfsNeedingExtract.add(s.fileId);
}

const modal = pdfsNeedingExtract.size > 0
  ? new ExportProgressModal(plugin.app, pdfsNeedingExtract.size)
  : null;
modal?.open();

try {
  const result = await createQdpxZip(
    { includeSources: true, progressReporter: modal ?? undefined },
    plugin.dataManager, plugin.sharedRegistry, plugin.caseVariables, plugin.app,
  );
  // ... usar result
} finally {
  modal?.close();
}
```

E em `createQdpxZip` options type (ajustar a interface existente em `qdpxExporter.ts`):

```ts
export interface QdpxExportOptions {
  includeSources?: boolean;
  progressReporter?: ProgressReporter;  // novo
}
```

O `progressReporter.update(...)` já é chamado no bloco PDF (Task 9 Step 3 tem a chamada no fallback).

- [ ] **Step 4: Run full test suite**

Run:
```bash
npm run test
```
Expected: 1960+ testes passam (contagem sobe com os novos).

- [ ] **Step 5: Build + type check**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: zero erros.

- [ ] **Step 6: Commit**

```bash
git add src/export/ src/import/
~/.claude/scripts/commit.sh "chore(export/import): remover warnings obsoletos de PDF"
```

---

### Task 14: Manual smoke test no workbench vault

**Files:** nenhum — validação manual.

- [ ] **Step 1: Build e reload**

Run:
```bash
npm run build
```

Reload do plugin no Obsidian (workbench vault). Abrir DevTools console.

- [ ] **Step 2: Smoke — abrir PDF triggers extract**

Abrir um PDF codificado no workbench. Aguardar ~1s. Verificar no console:

```js
app.plugins.plugins['qualia-coding'].dataManager.section('pdf').fileMetadata
```

Expected: entry com `mtime` e `pages[]` populados.

- [ ] **Step 3: Smoke — export QDPX**

Rodar comando "Export QDPX project" pelo palette. Abrir o .qdpx resultante (é ZIP) e inspecionar o `project.qde`:
- `PlainTextSelection` entries pros markers PDF devem ter `startPosition`/`endPosition` diferentes dos antigos `beginOffset/endOffset`
- `PDFSelection` entries devem ter `firstX/firstY/secondX/secondY` calculados com dims reais
- `<Representation>` deve referenciar um `.txt` no ZIP — abrir e conferir que é o PlainText consolidado

- [ ] **Step 4: Smoke — import em vault fresco**

Criar vault novo (`/tmp/qualia-smoke/`), ativar plugin, importar o .qdpx gerado no passo 3. Abrir o PDF importado — highlights devem aparecer **nos mesmos trechos** que no vault origem.

- [ ] **Step 5: Documentar resultado**

Se tudo OK, atualizar BACKLOG (marcar §11 E1/E2/I1/I2 como FEITO com data) + atualizar ROADMAP (#2 Import/Export reduz escopo).

Se houver bug, **não merge** — voltar pras tasks relevantes.

- [ ] **Step 6: Commit final + merge**

```bash
git add docs/BACKLOG.md docs/ROADMAP.md
~/.claude/scripts/commit.sh "docs: §11 E1/E2/I1/I2 FEITO + ROADMAP #2 atualizado"
git checkout main
git merge --no-ff feat/qdpx-pdf-integrity
git push origin main
```

---

## Resumo de métricas esperadas

| Métrica | Antes | Depois |
|---|---|---|
| Warnings ativos em `qdpxExporter.ts` | 3 (E1, E2, dims) | 1 (PDF sem metadata, fallback) |
| Warnings ativos em `qdpxImporter.ts` | 2 (PlainText ignorado, dims default) | 0 |
| Testes | 1960 | ~1985+ (new: pdfPlainTextBuilder 9, pdfMetadataExtractor 5, model 3, round-trip 1, import 2, export 2) |
| LOC novas aprox. | — | +~550 (módulos + tests + progress modal) |
| Commits | — | ~14-16 |

## Notas finais

- Branch: `feat/qdpx-pdf-integrity`
- Nenhum worktree (CLAUDE.md)
- Todos os commits via `~/.claude/scripts/commit.sh`
- Dependências novas: `pdfkit` (devDep), `@types/pdfkit` (devDep), possivelmente `pdfjs-dist` (devDep pra testes)
- Após merge, considerar sugerir ao usuário arquivar este plan + o spec em `obsidian-qualia-coding/plugin-docs/archive/` (regra do `~/.claude/CLAUDE.md`)
