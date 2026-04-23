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
- `tests/export/pdfPlainTextBuilder.test.ts` — unit tests puros
- `tests/pdf/pdfMetadataExtractor.test.ts` — unit tests com fixture real
- `tests/fixtures/generate-small-pdf.ts` — script determinístico de geração
- `tests/fixtures/small.pdf` — fixture binária commitada (3 páginas, 2 tamanhos, unicode)

**Modify:**
- `src/pdf/pdfCodingTypes.ts` — adicionar `PdfPageInfo`, `PdfFileMetadata`; estender `PdfCodingData` com `fileMetadata`
- `src/core/types.ts:163` — `createDefaultData().pdf` ganha `fileMetadata: {}`
- `src/pdf/pdfCodingModel.ts` — métodos `getFileMetadata(fileId)`, `setFileMetadata(fileId, meta)`; load/save refletem novo campo
- `src/pdf/pdfTypings.d.ts` — estender `window.pdfjsLib` com `getDocument(data: ArrayBuffer | Uint8Array): { promise: Promise<PDFDocumentProxy> }`
- `src/pdf/index.ts:109` — dentro de `component.then((child) => ...)`, disparar `extractPdfMetadata` em background (fire-and-forget)
- `src/export/qdpxExporter.ts:204` (buildPdfSourceXml) — ganhar novo param `plainText: string`; mover o `Representation` pra incluir conteúdo textual
- `src/export/qdpxExporter.ts:427-452` (bloco PDF do export) — chamar `buildPdfPlainText` + construir `textOffsets` e `pageDims` de dados reais
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

Adicionar ao arquivo de teste existente:

```ts
describe('PdfCodingModel.fileMetadata', () => {
  it('setFileMetadata persists + getFileMetadata returns the same', () => {
    const model = makeModel();  // helper existente no arquivo
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
    const model = makeModel();
    expect(model.getFileMetadata('docs/nope.pdf')).toBeUndefined();
  });

  it('setFileMetadata overwrites existing entry', () => {
    const model = makeModel();
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

No `load()` (após carregar `shapes`):

```ts
this.fileMetadata = section.fileMetadata ?? {};
```

Obs: o `?? {}` é só pra testes que constroem section manualmente. Em runtime normal `createDefaultData` garante o campo. Isso é aceitável como safety net no boundary de I/O (não é hedge defensivo). Se o reviewer discordar, trocar por `section.fileMetadata` direto.

No `save()` (dentro de `setSection('pdf', { ... })`):

```ts
this.dataManager.setSection('pdf', {
  markers: this.markers,
  shapes: this.shapes,
  fileMetadata: this.fileMetadata,
  settings: this.settings,
});
```

Imports no topo do arquivo:

```ts
import type { PdfMarker, PdfShapeMarker, NormalizedShapeCoords, PdfFileMetadata } from './pdfCodingTypes';
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

- [ ] **Step 1: Instalar `pdfkit` como devDep**

Run:
```bash
npm install --save-dev pdfkit @types/pdfkit
```
Expected: installs sem conflito. Commit do `package.json` + `package-lock.json` acontece na task final do chunk.

- [ ] **Step 2: Criar script `tests/fixtures/generate-small-pdf.ts`**

```ts
/**
 * Gera tests/fixtures/small.pdf (determinístico).
 * Execução: `npx tsx tests/fixtures/generate-small-pdf.ts`
 *
 * Layout:
 * - Page 1: A4 retrato (595 x 842 pt) — "Hello" + "World"
 * - Page 2: A4 paisagem (842 x 595 pt) — "Landscape" + "Page"
 * - Page 3: A4 retrato — "Unicode: 🎉"
 */
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';

const outPath = resolve(__dirname, 'small.pdf');
const doc = new PDFDocument({ autoFirstPage: false });
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

Ler `tests/setup.ts`. Adicionar (se ainda não existir):

```ts
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
(globalThis as any).window ??= globalThis;
(globalThis as any).window.pdfjsLib = pdfjsLib;
```

Obs: `pdfjs-dist` provavelmente já é dep transitiva via Obsidian. Se `pdfjs-dist` não estiver no `package.json`, adicionar como devDep:

```bash
npm install --save-dev pdfjs-dist
```

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
  const pdfjsLib = (globalThis as any).window?.pdfjsLib;
  if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
    throw new Error('pdfjsLib não disponível — requer Obsidian ou setup de teste com pdfjs-dist');
  }

  const doc = await pdfjsLib.getDocument(new Uint8Array(buffer)).promise;
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

Obs sobre o throw em linha 5: não é hedge defensivo — é validação de boundary (jsdom sem pdfjs é um bug setup, não um caminho normal). Se o reviewer sinalizar, trocar por assunção e deixar o erro do pdfjs propagar.

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

Ler `src/pdf/index.ts` linhas 100-150 pra entender o shape do child e como `model` é acessível no closure de `instrumentPdfView`. Identificar onde o `component.then((child) => { ... })` está e qual é o acesso ao `PdfCodingModel` (provavelmente via variável de closure no módulo).

- [ ] **Step 2: Adicionar hook**

Dentro do callback de `component.then((child: PDFViewerChild) => { ... })`, logo após as linhas existentes que acessam `child.file`, adicionar:

```ts
// Populate fileMetadata cache — fire-and-forget (background).
const file = child.file;
if (file) {
  const fileId = file.path;
  const cached = model.getFileMetadata(fileId);
  if (!cached || cached.mtime !== file.stat.mtime) {
    import('./pdfMetadataExtractor').then(({ extractPdfMetadata }) => {
      extractPdfMetadata(plugin.app.vault, file).then((meta) => {
        model.setFileMetadata(fileId, meta);
      }).catch((err) => {
        console.warn(`[qualia-coding] PDF metadata extract falhou para ${fileId}:`, err);
      });
    });
  }
}
```

Notas:
- Dynamic `import(...)` evita custo de carga quando o viewer nem é tocado. Se o bundler não suportar ou gerar chunk separado indesejado, trocar por import estático no topo do arquivo — o impacto em bundle é mínimo (~2KB).
- `plugin.app.vault` — ajustar pro nome real da variável. Se a closure já tem `vault` direto, usar `vault`.
- Não há `await` — é intencional. Usuário abre o PDF, extract roda em background.

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

- [ ] **Step 1: Write failing test em `qdpxExporter.test.ts`**

Adicionar ao arquivo existente de teste:

```ts
describe('buildPdfSourceXml — plainText param', () => {
  it('emite <Representation> com plainText incluído no export', () => {
    const textMarkers: PdfMarker[] = [/* 1 marker com codes */];
    const xml = buildPdfSourceXml(
      'docs/foo.pdf',
      textMarkers,
      [],
      null,
      new Map([[textMarkers[0]!.id, { start: 0, end: 5 }]]),
      new Map(),
      [],
      true,
      'Hello\nWorld',  // novo param plainText
    );
    // Representation referencia o plainTextPath como antes
    expect(xml).toContain('<Representation ');
    // O exporter caller é responsável por gravar o .txt; builder só referencia
  });
});
```

Obs: o PlainText consolidado é gravado no zip `sources/<reprGuid>.txt` pelo caller (próxima task). Aqui testamos só a assinatura.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run tests/export/qdpxExporter.test.ts -t "plainText param"
```
Expected: FAIL (assinatura antiga aceita 8 args).

- [ ] **Step 3: Atualizar assinatura de `buildPdfSourceXml`**

Na assinatura (linha 204-213), adicionar param:

```ts
export function buildPdfSourceXml(
  filePath: string,
  textMarkers: PdfMarker[],
  shapeMarkers: PdfShapeMarker[],
  pageDimensions: Record<number, { width: number; height: number }> | null,
  textOffsets: Map<string, { start: number; end: number }>,
  guidMap: Map<string, string>,
  notes: string[],
  includeSources?: boolean,
  plainText?: string,  // novo
): string {
```

Obs: `plainText` fica opcional com `?` só pra não quebrar eventuais callers de teste. **Não é hedge defensivo** — é interface evolution within the same commit. Ao terminar, nenhum caller de produção passa undefined. Se reviewer preferir required, tornar obrigatório e atualizar os 2 callers (prod + test).

Dentro da função, após a linha 220 (onde `reprPath` é construído), adicionar comentário:

```ts
// plainText é o conteúdo textual consolidado do PDF (concatenação via pdfPlainTextBuilder).
// Caller é responsável por gravar o arquivo reprPath no zip com esse conteúdo quando includeSources=true.
```

Por ora, o body do `buildPdfSourceXml` não muda — `plainText` é consumido pelo caller (próxima task). Apenas a assinatura.

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

Em `tests/export/qdpxGuidConsistency.test.ts` (ou arquivo de round-trip novo), adicionar:

```ts
describe('QDPX export — PDF offsets absolutos', () => {
  it('exporta offsets baseados em fileMetadata, não content-item-relative', async () => {
    // Setup: mock DataManager com 1 PDF, fileMetadata populado, 1 marker
    const fileMetadata = {
      'docs/foo.pdf': {
        mtime: 0,
        pages: [
          { width: 612, height: 792, textItems: ['Hello', 'World'] },
        ],
      },
    };
    // marker: page 0, beginIndex=1 (item "World"), beginOffset=0 → absoluto = 6 ("Hello\n" = 6 chars)
    const marker: PdfMarker = {
      id: 'm1',
      fileId: 'docs/foo.pdf',
      page: 0,
      beginIndex: 1,
      beginOffset: 0,
      endIndex: 1,
      endOffset: 5,
      text: 'World',
      codes: [/* 1 code application */],
      createdAt: 0,
      updatedAt: 0,
    };
    // ... (setup do dataManager + chamar buildQdpx)
    const { xml } = await buildQdpxProject(/* ... */);
    // Verifica que startPosition="6" e endPosition="11"
    expect(xml).toMatch(/startPosition="6"/);
    expect(xml).toMatch(/endPosition="11"/);
  });

  it('exporta shape markers com pageDims reais de fileMetadata', async () => {
    // Setup com shape marker em page 0 (A4 retrato 595x842)
    // ... e verifica que firstX/firstY usam 595 e 842
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run tests/export/qdpxGuidConsistency.test.ts -t "absolutos"
```
Expected: FAIL (exporter ainda usa beginOffset como absoluto).

- [ ] **Step 3: Refatorar bloco PDF em `qdpxExporter.ts:427-452`**

Substituir o bloco atual por:

```ts
// --- PDF ---
const pdfData = dataManager.section('pdf');
const pdfByFile = groupByFileId(pdfData.markers, pdfData.shapes);
for (const [fileId, { textMarkers, shapeMarkers }] of pdfByFile) {
  const meta = pdfData.fileMetadata[fileId];
  if (!meta) {
    // Fallback: sem metadata, preserva comportamento degradado antigo.
    // Em produção o hook do viewer popula; se faltou, o usuário nunca abriu o PDF na sessão.
    warnings.push(`PDF ${fileId} sem metadata — offsets podem ficar degradados. Abra o PDF no Obsidian antes de exportar.`);
    continue;
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

  const xml = buildPdfSourceXml(
    fileId,
    textMarkers,
    shapeMarkers,
    pageDims,
    textOffsets,
    guidMap,
    notes,
    options.includeSources,
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
    // Gravar o .txt do Representation com plainText
    const reprGuid = extractReprGuidFromXml(xml);  // helper; ou mover geração de reprGuid pra caller
    if (reprGuid) {
      sourceFiles.set(`sources/${reprGuid}.txt`, strToU8(plainText));
    }
  }
}
```

Import no topo do arquivo:

```ts
import { buildPdfPlainText } from './pdfPlainTextBuilder';
```

Obs: o `extractReprGuidFromXml` é um hack. Alternativa mais limpa: mover a geração de `reprGuid` pra fora de `buildPdfSourceXml` (retornar junto no shape `{ xml, reprGuid }`), ou aceitar `reprGuid` como param. **Fazer essa refatoração nesta task** — não deixar hack no final.

Refactor `buildPdfSourceXml` pra retornar `{ xml, reprGuid }`:

```ts
export function buildPdfSourceXml(
  // ... args
): { xml: string; reprGuid: string | null } {
  // ...
  return { xml: `<PDFSource ...>`, reprGuid };
}
```

E o caller usa `const { xml, reprGuid } = buildPdfSourceXml(...)`.

Tests do qdpxExporter existentes vão quebrar — atualizar todos que destruturam o retorno.

- [ ] **Step 4: Run tests**

Run:
```bash
npx vitest run tests/export/
```
Expected: PASS (todos os tests do export). Se houver teste legado que assume `buildPdfSourceXml` retorna `string`, atualizar.

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

Em `tests/import/qdpxImport.test.ts` (criar se não existir):

```ts
describe('QDPX import — PDF dims reais', () => {
  it('usa pageDims de fileMetadata (não default 612x792)', async () => {
    // Setup: QDPX com 1 PDFSource + 1 PDFSelection (shape) + fixture pdf (A4 retrato 595x842)
    // Import
    // Verifica que o ImageShape resultante tem coords normalizadas baseadas em 595x842, não 612x792
  });
});
```

- [ ] **Step 3: Reordenar pipeline do PDFSource**

Dentro do branch `case 'PDFSource':` (ou equivalente), garantir ordem:

```ts
// 1. Extrair binário do PDF do zip
const pdfBytes = await extractFromZip(source.path);  // existing helper

// 2. Writer no vault
const targetPath = resolveTargetPath(source.name);
await vault.adapter.writeBinary(targetPath, pdfBytes.buffer);

// 3. Obter TFile
let tfile = vault.getAbstractFileByPath(targetPath) as TFile | null;
// Retry curto pra evitar race com o adapter.writeBinary concluído mas cache ainda warmup
if (!tfile) {
  await new Promise(r => setTimeout(r, 50));
  tfile = vault.getAbstractFileByPath(targetPath) as TFile | null;
}
if (!tfile) throw new Error(`TFile não encontrado após writeBinary: ${targetPath}`);

// 4. Extrair metadata (síncrono no pipeline do import)
const meta = await extractPdfMetadata(vault, tfile);
pdfCodingModel.setFileMetadata(targetPath, meta);

// 5. Processar shape markers com dims reais
for (const shape of source.shapes) {
  const dim = meta.pages[shape.page];
  if (!dim) continue;
  const coords = pdfRectToNormalized(shape.firstX, shape.firstY, shape.secondX, shape.secondY, dim.width, dim.height);
  // criar PdfShapeMarker com `coords`
}
```

Obs sobre o retry de 50ms: **não é hedge genérico** — é workaround específico do Obsidian vault.getAbstractFileByPath cache warmup após writeBinary (documentado em §11.1 round-trip). Se o reviewer discordar, testar em runtime real e ajustar (pode ser que `writeBinary` resolva síncrono o suficiente; se sim, remover retry).

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

```ts
describe('QDPX import — PlainTextSelection em PDFSource (I2)', () => {
  it('mapeia offset absoluto pra beginIndex/beginOffset via binary search', async () => {
    // Setup: fileMetadata de fixture small.pdf + QDPX com PlainTextSelection startPosition=6 endPosition=11
    // Import
    // Verifica que o PdfMarker resultante tem page=0, beginIndex=1, beginOffset=0, endIndex=1, endOffset=5
  });
});
```

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

```ts
describe('QDPX round-trip — PDF', () => {
  it('export → import preserva offsets e dims byte-a-byte', async () => {
    // 1. Setup: dataManager com fileMetadata fake + 2 markers texto + 1 shape
    // 2. Export QDPX → blob
    // 3. Import QDPX blob em novo dataManager
    // 4. Assert:
    //    - markers novos têm beginIndex/beginOffset iguais aos originais
    //    - shape novo tem coords normalizadas iguais (within epsilon)
    //    - fileMetadata foi populado no destino
  });
});
```

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
grep -n "are approximate\|skipped (page dimensions\|text offset mapping not yet supported" src/export/ src/import/
```

Remover cada ocorrência. Se algum warning ainda faz sentido (ex: "PDF sem metadata — exportado degradado"), deixar.

- [ ] **Step 2: Atualizar mensagem do `exportModal`**

Ler `src/export/exportModal.ts` e remover/atualizar qualquer texto que diga "PDF offsets aproximados" ou similar (o comportamento melhorou — o texto fica desatualizado).

- [ ] **Step 3: (Opcional) Progress modal no fallback**

Se no export houver PDFs sem `fileMetadata[fileId]`, o exporter hoje só avisa. Ideal seria chamar `extractPdfMetadata` on-demand com progress. **Avaliar se cabe nesta task ou adiar pra polish** — não é bloqueador.

Se for atacar agora: criar Modal simples com `"Preparing N of M PDFs..."`, chamar extract sequencial, atualizar DataManager conforme conclui, depois prosseguir com export.

Se adiar: adicionar TODO no código com referência a esta spec.

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
| Testes | 1960 | ~1985+ (new: pdfPlainTextBuilder 9, pdfMetadataExtractor 5, model 3, round-trip 2, import 2) |
| LOC novas aprox. | — | +~450 (módulos + tests) |
| Commits | — | ~14 |

## Notas finais

- Branch: `feat/qdpx-pdf-integrity`
- Nenhum worktree (CLAUDE.md)
- Todos os commits via `~/.claude/scripts/commit.sh`
- Dependências novas: `pdfkit` (devDep), `@types/pdfkit` (devDep), possivelmente `pdfjs-dist` (devDep pra testes)
- Após merge, considerar sugerir ao usuário arquivar este plan + o spec em `obsidian-qualia-coding/plugin-docs/archive/` (regra do `~/.claude/CLAUDE.md`)
