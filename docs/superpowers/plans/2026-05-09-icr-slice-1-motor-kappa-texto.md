# ICR Slice 1 — Motor κ Texto Implementation Plan

> **For agentic workers:** Execução inline (regra do projeto: SDD overkill, sem worktree). TDD por task. Smoke obrigatório no chunk final.

**Goal:** Entregar motor κ paramétrico cobrindo engines text-likes (markdown + PDF text + CSV cod segment) com 5 coeficientes (Cohen κ pareado, Fleiss κ N-coders, Krippendorff α nominal, α-binary, cu-α) + reporter por engine + agregado, validado com seed sintético sobre arquivos em `ICR-test/`.

**Architecture:** Schema additive — `codedBy?: CoderId` opcional em todos marker types (runtime infere `'human:default'` quando ausente, evita refactor de marker creation existente). Registry `CoderRegistry` com `Coder` (display estável `human:name` ou `llm:model`) + `CoderRun` (audit, schema-only no Slice 1, sem registry separado). Função pura κ paramétrica recebe `TextRange[]` normalizado por adapter por engine — markdown line/ch → char absoluto via source text; PDF page-aware; CSV cell-scoped. 5 coeficientes em arquivos separados (funções puras), reporter agrega per-engine + agregado por média ponderada por #markers.

**Tech Stack:** TypeScript strict, Vitest + jsdom (testes), padrão de classe stateful do `CodeDefinitionRegistry` (addOnMutate + auditListener + toJSON/fromJSON). Persistência via `DataManager` (campo `coders` novo no `QualiaData`).

**Pré-requisitos** (já feitos antes deste plano):
- Vault de teste em `/Users/mosx/Desktop/obsidian-plugins-workbench/ICR-test/` com 2 .md, 2 PDFs, 1 CSV (ver `ICR-test/README.md`)
- `data.json` resetado pra `createDefaultData()` (backup em `obsidian-qualia-coding/data_synthetic_bak/data.json.pre-icr-2026-05-09.bak`)

**Decisões cravadas (referência):**
- `docs/ROADMAP.md §"Infra compartilhada"` — slices, multimodal como destino arquitetural
- `obsidian-qualia-coding/plugin-docs/research/ICR-DESIGN-SKETCH-2026-05-08.md` (atualizado 2026-05-09) — schema híbrido Coder+CoderRun
- `obsidian-qualia-coding/plugin-docs/research/ICR — Cenários cobertos e descobertos.md` (atualizado 2026-05-09) — recorte text-likes

---

## File Structure

```
src/core/icr/
  coderTypes.ts                  — Coder, CoderRun, CoderId types
  coderRegistry.ts               — CoderRegistry class (CodeDefinitionRegistry pattern)
  textRange.ts                   — TextRange + extractTextRange adapters por engine
  overlap.ts                     — computeOverlap pure function
  coefficients/
    cohenKappa.ts                — pareado (2 coders)
    fleissKappa.ts               — N coders
    krippendorffAlpha.ts         — N coders nominal
    alphaBinary.ts               — two-level: existe quotation aqui?
    cuAlpha.ts                   — two-level: qual código no segmento concordado?
  reporter.ts                    — per-engine + agregado (média ponderada)

tests/core/icr/
  coderRegistry.test.ts
  textRange.test.ts
  overlap.test.ts
  coefficients/
    cohenKappa.test.ts
    fleissKappa.test.ts
    krippendorffAlpha.test.ts
    alphaBinary.test.ts
    cuAlpha.test.ts
  reporter.test.ts

scripts/
  seed-icr-corpus.mjs            — popula data.json com 2+ coders + markers sintéticos sobre ICR-test/
```

**Arquivos modificados:**

```
src/core/types.ts                — codedBy?: CoderId em BaseMarker; QualiaData.coders novo
src/markdown/models/codeMarkerModel.ts  — Marker.codedBy?: CoderId
src/csv/csvCodingTypes.ts        — SegmentMarker.codedBy?: CoderId
src/pdf/pdfCodingTypes.ts        — PdfMarker.codedBy?: CoderId
src/core/dataManager.ts          — load/persist coders + seed default 'human:default'
```

**Notação:** marker creation existente NÃO muda — markers ficam sem `codedBy` explícito, motor κ infere `'human:default'` em runtime. Slice futuro de UI de coder switcher mexe em creation paths.

---

## Chunk 1 — Schema + Coder Registry

### Task 1: Coder + CoderRun types

**Files:**
- Create: `src/core/icr/coderTypes.ts`
- Test: `tests/core/icr/coderRegistry.test.ts` (test usa types daqui)

- [ ] **Step 1: Write types**

```typescript
// src/core/icr/coderTypes.ts

/** Display estável: 'human:<name>' | 'llm:<model>'. Compõe id no registry. */
export type CoderId = string;

/** Default coder usado quando marker não tem codedBy explícito. */
export const DEFAULT_CODER_ID: CoderId = 'human:default';

export interface Coder {
  id: CoderId;
  name: string;            // display ('Marlon', 'GPT-4o')
  type: 'human' | 'llm';
  /** LLM-specific (opcional pra humano). */
  model?: string;
  version?: string;
  temperature?: number;
  seed?: number;
  createdAt: number;
}

/** Audit-only no Slice 1: schema definido, sem registry separado, populado quando LLM frente entrar. */
export interface CoderRun {
  id: string;
  coderId: CoderId;
  timestamp: number;
  promptHash?: string;
  config?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write smoke test**

```typescript
// tests/core/icr/coderRegistry.test.ts (apenas smoke por agora — full tests vêm na Task 4)
import { describe, it, expect } from 'vitest';
import { DEFAULT_CODER_ID, type Coder, type CoderRun } from '../../../src/core/icr/coderTypes';

describe('coderTypes', () => {
  it('DEFAULT_CODER_ID is human:default', () => {
    expect(DEFAULT_CODER_ID).toBe('human:default');
  });
  it('Coder type accepts human shape', () => {
    const c: Coder = { id: 'human:carla', name: 'Carla', type: 'human', createdAt: Date.now() };
    expect(c.type).toBe('human');
  });
});
```

- [ ] **Step 3: Run** — `npm run test -- tests/core/icr/coderRegistry.test.ts`. Expected: PASS.

- [ ] **Step 4: Commit** — `~/.claude/scripts/commit.sh "feat(icr): coder + coderRun types"`

---

### Task 2: codedBy em marker types

**Files:**
- Modify: `src/core/types.ts:84-93` (BaseMarker)
- Modify: `src/markdown/models/codeMarkerModel.ts:13-28` (Marker)
- Modify: `src/csv/csvCodingTypes.ts:5-18` (SegmentMarker)
- Modify: `src/pdf/pdfCodingTypes.ts:18-33` (PdfMarker)

- [ ] **Step 1: Add codedBy?: CoderId em BaseMarker**

```typescript
// src/core/types.ts
import type { CoderId } from './icr/coderTypes';

export interface BaseMarker {
  markerType: MarkerType;
  id: string;
  fileId: string;
  codes: CodeApplication[];
  colorOverride?: string;
  memo?: MemoRecord;
  codedBy?: CoderId;          // ← novo, opcional
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add codedBy em Marker (markdown)**

```typescript
// src/markdown/models/codeMarkerModel.ts
import type { CoderId } from '../../core/icr/coderTypes';

export interface Marker {
  // ... campos existentes
  codedBy?: CoderId;          // ← novo
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 3: Idem em SegmentMarker (CSV) + PdfMarker (PDF)**

```typescript
// src/csv/csvCodingTypes.ts
import type { CoderId } from '../core/icr/coderTypes';

export interface SegmentMarker {
  // ... campos existentes
  codedBy?: CoderId;          // ← novo
  createdAt: number;
  updatedAt: number;
}

// src/pdf/pdfCodingTypes.ts
import type { CoderId } from '../core/icr/coderTypes';

export interface PdfMarker {
  // ... campos existentes
  codedBy?: CoderId;          // ← novo
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 4: Run typecheck** — `npm run build` (tsc + esbuild). Expected: build OK, sem erros.

- [ ] **Step 5: Run tests** — `npm run test`. Expected: 2759 testes verde (mesmo de antes; campo opcional não quebra nada).

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr): codedBy?: CoderId em BaseMarker / Marker / SegmentMarker / PdfMarker"`

---

### Task 3: CoderRegistry class

**Files:**
- Create: `src/core/icr/coderRegistry.ts`
- Test: `tests/core/icr/coderRegistry.test.ts`

Padrão: copiar shape de `CodeDefinitionRegistry` (classe stateful, `Map<id, Coder>`, `addOnMutate(fn)`, `toJSON()`/`static fromJSON()`).

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/coderRegistry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CoderRegistry } from '../../../src/core/icr/coderRegistry';
import { DEFAULT_CODER_ID } from '../../../src/core/icr/coderTypes';

let registry: CoderRegistry;
beforeEach(() => { registry = new CoderRegistry(); });

describe('CoderRegistry', () => {
  it('seeds default coder on construct', () => {
    expect(registry.getById(DEFAULT_CODER_ID)).toBeTruthy();
    expect(registry.getById(DEFAULT_CODER_ID)?.name).toBe('Default');
    expect(registry.getById(DEFAULT_CODER_ID)?.type).toBe('human');
  });

  it('createHuman returns coder with human:<id> shape', () => {
    const c = registry.createHuman('Carla');
    expect(c.id).toBe('human:carla');
    expect(c.type).toBe('human');
  });

  it('createLLM accepts model + version + temperature + seed', () => {
    const c = registry.createLLM({ model: 'gpt-4o', version: '2024-08-06', temperature: 0.2, seed: 42 });
    expect(c.id).toBe('llm:gpt-4o');
    expect(c.type).toBe('llm');
    expect(c.temperature).toBe(0.2);
  });

  it('returns existing coder when id collides', () => {
    const c1 = registry.createHuman('Carla');
    const c2 = registry.createHuman('Carla');
    expect(c1.id).toBe(c2.id);
  });

  it('getAll returns array of all coders including default', () => {
    registry.createHuman('Carla');
    registry.createHuman('Joana');
    const all = registry.getAll();
    expect(all.length).toBe(3);
    expect(all.map(c => c.id).sort()).toEqual(['human:carla', 'human:default', 'human:joana']);
  });

  it('toJSON / fromJSON round-trip', () => {
    registry.createHuman('Carla');
    registry.createLLM({ model: 'gpt-4o' });
    const json = registry.toJSON();
    const restored = CoderRegistry.fromJSON(json);
    expect(restored.getAll().length).toBe(3);
  });

  it('addOnMutate fires on create', () => {
    let count = 0;
    registry.addOnMutate(() => count++);
    registry.createHuman('Carla');
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify fail** — `npm run test -- tests/core/icr/coderRegistry.test.ts`. Expected: FAIL (CoderRegistry not defined).

- [ ] **Step 3: Implement CoderRegistry**

```typescript
// src/core/icr/coderRegistry.ts
import type { Coder, CoderId } from './coderTypes';
import { DEFAULT_CODER_ID } from './coderTypes';

export class CoderRegistry {
  private coders: Map<CoderId, Coder> = new Map();
  private onMutateListeners: Set<() => void> = new Set();

  constructor() {
    this.seedDefault();
  }

  private seedDefault(): void {
    if (this.coders.has(DEFAULT_CODER_ID)) return;
    this.coders.set(DEFAULT_CODER_ID, {
      id: DEFAULT_CODER_ID,
      name: 'Default',
      type: 'human',
      createdAt: Date.now(),
    });
  }

  private emitMutate(): void {
    for (const fn of this.onMutateListeners) fn();
  }

  addOnMutate(fn: () => void): void { this.onMutateListeners.add(fn); }
  removeOnMutate(fn: () => void): void { this.onMutateListeners.delete(fn); }

  /** Cria/retorna coder humano. ID estável: 'human:<lowercased-name>'. */
  createHuman(name: string): Coder {
    const id: CoderId = `human:${name.toLowerCase().replace(/\s+/g, '-')}`;
    const existing = this.coders.get(id);
    if (existing) return existing;
    const coder: Coder = { id, name, type: 'human', createdAt: Date.now() };
    this.coders.set(id, coder);
    this.emitMutate();
    return coder;
  }

  /** Cria/retorna coder LLM. ID estável: 'llm:<model>'. */
  createLLM(opts: { model: string; version?: string; temperature?: number; seed?: number }): Coder {
    const id: CoderId = `llm:${opts.model}`;
    const existing = this.coders.get(id);
    if (existing) return existing;
    const coder: Coder = {
      id,
      name: opts.model,
      type: 'llm',
      model: opts.model,
      version: opts.version,
      temperature: opts.temperature,
      seed: opts.seed,
      createdAt: Date.now(),
    };
    this.coders.set(id, coder);
    this.emitMutate();
    return coder;
  }

  getById(id: CoderId): Coder | null { return this.coders.get(id) ?? null; }
  getAll(): Coder[] { return Array.from(this.coders.values()); }
  has(id: CoderId): boolean { return this.coders.has(id); }

  toJSON(): { coders: Coder[] } {
    return { coders: this.getAll() };
  }

  static fromJSON(json: { coders?: Coder[] } | null | undefined): CoderRegistry {
    const r = new CoderRegistry();
    if (!json?.coders) return r;
    for (const c of json.coders) r.coders.set(c.id, c);
    return r;
  }
}
```

- [ ] **Step 4: Run tests** — `npm run test -- tests/core/icr/coderRegistry.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): CoderRegistry com seed default + createHuman/createLLM + toJSON"`

---

### Task 4: QualiaData.coders + DataManager integration

**Files:**
- Modify: `src/core/types.ts:333-376` (createDefaultData adiciona `coders`)
- Modify: `src/core/dataManager.ts` (load/persist coders)

- [ ] **Step 1: Locate DataManager** — `grep -n "class DataManager\|export class DataManager" src/core/dataManager.ts`

- [ ] **Step 2: Add coders field em QualiaData**

```typescript
// src/core/types.ts (search interface QualiaData ou similar — adicionar campo)
import type { Coder } from './icr/coderTypes';

export interface QualiaData {
  // ... campos existentes
  coders?: { coders: Coder[] };       // ← novo, opcional pra load de dados antigos sem o campo
}

// createDefaultData() — adicionar:
export function createDefaultData(): QualiaData {
  return {
    // ... existing fields
    coders: { coders: [/* registry seed runs em construct, JSON vazio é OK */] },
    // visibilityOverrides, auditLog, etc.
  };
}
```

- [ ] **Step 3: Hook DataManager pra construir/persist CoderRegistry**

DataManager pattern existente: deve ter algo tipo `this.codeRegistry = CodeDefinitionRegistry.fromJSON(data.registry)`. Replicar pra coders:

```typescript
// src/core/dataManager.ts (depois de this.codeRegistry = ...)
import { CoderRegistry } from './icr/coderRegistry';

// no construct/load:
this.coderRegistry = CoderRegistry.fromJSON(data.coders ?? null);

// no save/toJSON:
data.coders = this.coderRegistry.toJSON();
```

- [ ] **Step 4: Run typecheck + tests** — `npm run build && npm run test`. Expected: build OK, todos testes verde.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): integra CoderRegistry no DataManager (load/persist em data.json)"`

---

## Chunk 2 — TextRange Adapter + Overlap

### Task 5: TextRange + adapters por engine

**Files:**
- Create: `src/core/icr/textRange.ts`
- Test: `tests/core/icr/textRange.test.ts`

`TextRange` normaliza coordenadas de 3 engines text-likes em espaço linear `(fileId, locator, [from, to))`:
- Markdown: `locator = ''`, `from`/`to` são char absoluto no doc (precisa source text pra converter line/ch)
- PDF text: `locator = 'page:N'`, `from`/`to` são `beginIndex`/`endIndex` (já char-absoluto na página)
- CSV cod segment: `locator = 'row:R|col:C'`, `from`/`to` são offsets DENTRO da cell (já no schema)

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/textRange.test.ts
import { describe, it, expect } from 'vitest';
import { extractMarkdownRange, extractPdfRange, extractCsvSegmentRange, type TextRange } from '../../../src/core/icr/textRange';
import type { Marker } from '../../../src/markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../src/pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../src/csv/csvCodingTypes';

describe('extractMarkdownRange', () => {
  it('converts line/ch to absolute char offset using source text', () => {
    const src = 'linha 1\nlinha 2\nlinha 3';
    const m: Marker = {
      markerType: 'markdown', id: 'm1', fileId: 'f1.md',
      range: { from: { line: 1, ch: 0 }, to: { line: 1, ch: 5 } },
      color: '#fff', codes: [], createdAt: 0, updatedAt: 0,
    };
    const r = extractMarkdownRange(m, src);
    expect(r.fileId).toBe('f1.md');
    expect(r.locator).toBe('');
    expect(r.from).toBe(8);  // 'linha 1\n' = 8 chars
    expect(r.to).toBe(13);   // 8 + 5
  });
});

describe('extractPdfRange', () => {
  it('uses page:N as locator + beginIndex/endIndex as from/to', () => {
    const m: PdfMarker = {
      markerType: 'pdf', id: 'm1', fileId: 'f1.pdf',
      page: 3, beginIndex: 10, beginOffset: 0, endIndex: 25, endOffset: 0,
      text: '...', codes: [], createdAt: 0, updatedAt: 0,
    };
    const r = extractPdfRange(m);
    expect(r.locator).toBe('page:3');
    expect(r.from).toBe(10);
    expect(r.to).toBe(25);
  });
});

describe('extractCsvSegmentRange', () => {
  it('uses row:R|col:C as locator + from/to from cell offsets', () => {
    const m: SegmentMarker = {
      markerType: 'csv', id: 'm1', fileId: 'f1.csv',
      sourceRowId: 5, column: 'response', from: 12, to: 20,
      codes: [], createdAt: 0, updatedAt: 0,
    };
    const r = extractCsvSegmentRange(m);
    expect(r.locator).toBe('row:5|col:response');
    expect(r.from).toBe(12);
    expect(r.to).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/textRange.ts
import type { Marker } from '../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../csv/csvCodingTypes';

/** Espaço linear de coordenadas normalizado por engine.
 *  Comparações κ usam (fileId, locator) como scope; markers em scopes diferentes não comparam. */
export interface TextRange {
  fileId: string;
  locator: string;   // markdown: '' | PDF: 'page:N' | CSV: 'row:R|col:C'
  from: number;      // inclusive
  to: number;        // exclusive
}

/** Markdown precisa de source text pra converter line/ch em char absoluto.
 *  Reason: motor κ é função pura sobre TextRange normalizado;
 *  caller resolve source text via vault.read antes de chamar. */
export function extractMarkdownRange(m: Marker, sourceText: string): TextRange {
  const fromAbs = lineChToAbsolute(sourceText, m.range.from.line, m.range.from.ch);
  const toAbs = lineChToAbsolute(sourceText, m.range.to.line, m.range.to.ch);
  return { fileId: m.fileId, locator: '', from: fromAbs, to: toAbs };
}

export function extractPdfRange(m: PdfMarker): TextRange {
  return { fileId: m.fileId, locator: `page:${m.page}`, from: m.beginIndex, to: m.endIndex };
}

export function extractCsvSegmentRange(m: SegmentMarker): TextRange {
  return { fileId: m.fileId, locator: `row:${m.sourceRowId}|col:${m.column}`, from: m.from, to: m.to };
}

/** Converte (line 0-based, ch 0-based) em char offset absoluto no source. */
function lineChToAbsolute(src: string, line: number, ch: number): number {
  let pos = 0;
  let curLine = 0;
  for (let i = 0; i < src.length; i++) {
    if (curLine === line) return pos + ch;
    if (src[i] === '\n') curLine++;
    pos++;
  }
  return pos + ch;
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): TextRange + extractors por engine (markdown line/ch→abs, PDF page-aware, CSV cell-scoped)"`

---

### Task 6: computeOverlap pure function

**Files:**
- Create: `src/core/icr/overlap.ts`
- Test: `tests/core/icr/overlap.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/overlap.test.ts
import { describe, it, expect } from 'vitest';
import { computeOverlap } from '../../../src/core/icr/overlap';
import type { TextRange } from '../../../src/core/icr/textRange';

describe('computeOverlap', () => {
  const a: TextRange = { fileId: 'f1', locator: '', from: 0, to: 10 };

  it('returns null when fileId differs', () => {
    const b: TextRange = { fileId: 'f2', locator: '', from: 0, to: 10 };
    expect(computeOverlap(a, b)).toBeNull();
  });

  it('returns null when locator differs', () => {
    const b: TextRange = { fileId: 'f1', locator: 'page:2', from: 0, to: 10 };
    expect(computeOverlap(a, b)).toBeNull();
  });

  it('returns null when no overlap', () => {
    const b: TextRange = { fileId: 'f1', locator: '', from: 20, to: 30 };
    expect(computeOverlap(a, b)).toBeNull();
  });

  it('returns intersection when overlap exists', () => {
    const b: TextRange = { fileId: 'f1', locator: '', from: 5, to: 15 };
    expect(computeOverlap(a, b)).toEqual({ from: 5, to: 10 });
  });

  it('returns full range when one contains the other', () => {
    const b: TextRange = { fileId: 'f1', locator: '', from: 2, to: 8 };
    expect(computeOverlap(a, b)).toEqual({ from: 2, to: 8 });
  });

  it('returns identical range for identical inputs', () => {
    expect(computeOverlap(a, a)).toEqual({ from: 0, to: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify fail**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/overlap.ts
import type { TextRange } from './textRange';

export interface CharRange { from: number; to: number; }

/** Pure: intersect 2 TextRanges. Returns null if different scope ou no overlap. */
export function computeOverlap(a: TextRange, b: TextRange): CharRange | null {
  if (a.fileId !== b.fileId || a.locator !== b.locator) return null;
  const from = Math.max(a.from, b.from);
  const to = Math.min(a.to, b.to);
  if (from >= to) return null;
  return { from, to };
}
```

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): computeOverlap pure function (per-char intersection)"`

---

## Chunk 3 — Coeficientes κ

> Padrão pras 5 funções: input shape compartilhado `KappaInput` (definido na Task 7), output `number` (κ ou α), funções puras isoladas. Cada coeficiente vive em arquivo próprio em `src/core/icr/coefficients/`.
>
> **Per-char unit space:** todas operam sobre representação per-char. Universe of units = todos chars de todos sources cobertos por algum coder OU todos chars de todos sources (depende do coeficiente). Caller monta `KappaInput` com markers já normalizados pra TextRange + char-level explosion.

### Task 7: KappaInput shape + per-char explosion helper

**Files:**
- Modify: `src/core/icr/overlap.ts` (adiciona helpers shared) OU criar `src/core/icr/kappaInput.ts`

Decisão: arquivo separado pra não inflar overlap.ts.

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/kappaInput.test.ts
import { describe, it, expect } from 'vitest';
import { explodeMarkersToCharLabels, type CodedMarker } from '../../../src/core/icr/kappaInput';

describe('explodeMarkersToCharLabels', () => {
  it('returns map of char position → coderId → codeId set', () => {
    const markers: CodedMarker[] = [
      { coderId: 'human:a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
      { coderId: 'human:b', range: { fileId: 'f1', locator: '', from: 3, to: 8 }, codeIds: ['c1'] },
    ];
    const map = explodeMarkersToCharLabels(markers);
    // f1:'':3 has both coders with c1
    const key = 'f1::3';
    expect(map.get(key)?.get('human:a')).toEqual(new Set(['c1']));
    expect(map.get(key)?.get('human:b')).toEqual(new Set(['c1']));
  });

  it('includes all chars in marker range (from inclusive, to exclusive)', () => {
    const markers: CodedMarker[] = [
      { coderId: 'human:a', range: { fileId: 'f1', locator: '', from: 0, to: 3 }, codeIds: ['c1'] },
    ];
    const map = explodeMarkersToCharLabels(markers);
    expect(map.has('f1::0')).toBe(true);
    expect(map.has('f1::1')).toBe(true);
    expect(map.has('f1::2')).toBe(true);
    expect(map.has('f1::3')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/kappaInput.ts
import type { CoderId } from './coderTypes';
import type { TextRange } from './textRange';

/** Marker normalizado pra input dos coeficientes. */
export interface CodedMarker {
  coderId: CoderId;
  range: TextRange;
  codeIds: string[];
}

/** Source com tamanho — necessário pra cu-α/α-binary cobrirem chars não codificados. */
export interface SourceMeta {
  fileId: string;
  locator: string;
  totalChars: number;
}

/** Input universal pros coeficientes. */
export interface KappaInput {
  markers: CodedMarker[];
  sources: SourceMeta[];
  coders: CoderId[];
}

/** Char-level explosion: para cada char (fileId, locator, pos), monta map coderId → set codeIds.
 *  Chars sem nenhum coder marcando NÃO entram (sparse map). */
export function explodeMarkersToCharLabels(
  markers: CodedMarker[]
): Map<string, Map<CoderId, Set<string>>> {
  const result = new Map<string, Map<CoderId, Set<string>>>();
  for (const m of markers) {
    for (let pos = m.range.from; pos < m.range.to; pos++) {
      const key = `${m.range.fileId}:${m.range.locator}:${pos}`;
      let coderMap = result.get(key);
      if (!coderMap) { coderMap = new Map(); result.set(key, coderMap); }
      let codeSet = coderMap.get(m.coderId);
      if (!codeSet) { codeSet = new Set(); coderMap.set(m.coderId, codeSet); }
      for (const cid of m.codeIds) codeSet.add(cid);
    }
  }
  return result;
}

/** Char-key compatível com explodeMarkersToCharLabels mas iterando ALL chars (incluindo unmarked). */
export function* iterateAllCharKeys(sources: SourceMeta[]): Generator<string> {
  for (const s of sources) {
    for (let pos = 0; pos < s.totalChars; pos++) {
      yield `${s.fileId}:${s.locator}:${pos}`;
    }
  }
}
```

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): KappaInput + char-level explosion helper"`

---

### Task 8: cohenKappa (2 coders pareados)

**Files:**
- Create: `src/core/icr/coefficients/cohenKappa.ts`
- Test: `tests/core/icr/coefficients/cohenKappa.test.ts`

Cohen κ classic: 2 raters, κ = (Po − Pe) / (1 − Pe). Per-char: cada char é unit, "rating" = primeiro código aplicado por cada coder (ou null/undefined se coder não marcou).

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/coefficients/cohenKappa.test.ts
import { describe, it, expect } from 'vitest';
import { cohenKappa } from '../../../../src/core/icr/coefficients/cohenKappa';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('cohenKappa', () => {
  it('returns 1.0 when both coders perfectly agree', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b'],
    };
    expect(cohenKappa(input, 'a', 'b')).toBeCloseTo(1.0, 3);
  });

  it('returns ≤0 when coders systematically disagree', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 10, to: 20 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b'],
    };
    const k = cohenKappa(input, 'a', 'b');
    expect(k).toBeLessThan(0.5);
  });

  it('throws when coders param has wrong length', () => {
    const input: KappaInput = { markers: [], sources: [], coders: [] };
    expect(() => cohenKappa(input, 'a', 'b')).not.toThrow(); // empty input → handled
  });

  it('partial overlap gives kappa between 0 and 1', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b'],
    };
    const k = cohenKappa(input, 'a', 'b');
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/coefficients/cohenKappa.ts
import type { KappaInput } from '../kappaInput';
import { explodeMarkersToCharLabels, iterateAllCharKeys } from '../kappaInput';
import type { CoderId } from '../coderTypes';

/** Cohen κ pareado per-char. Rating de cada coder = primeiro codeId em ordem (ou '__none__' se não marcou). */
export function cohenKappa(input: KappaInput, coderA: CoderId, coderB: CoderId): number {
  const NONE = '__none__';
  const charMap = explodeMarkersToCharLabels(input.markers);

  // Counts per (ratingA, ratingB)
  const matrix = new Map<string, number>();
  const marginalsA = new Map<string, number>();
  const marginalsB = new Map<string, number>();
  let total = 0;

  for (const key of iterateAllCharKeys(input.sources)) {
    const cm = charMap.get(key);
    const rA = pickFirstCode(cm?.get(coderA)) ?? NONE;
    const rB = pickFirstCode(cm?.get(coderB)) ?? NONE;
    const cellKey = `${rA}|${rB}`;
    matrix.set(cellKey, (matrix.get(cellKey) ?? 0) + 1);
    marginalsA.set(rA, (marginalsA.get(rA) ?? 0) + 1);
    marginalsB.set(rB, (marginalsB.get(rB) ?? 0) + 1);
    total++;
  }

  if (total === 0) return 1; // vacuous agreement

  // Po: observed agreement
  let po = 0;
  for (const rating of new Set([...marginalsA.keys(), ...marginalsB.keys()])) {
    po += matrix.get(`${rating}|${rating}`) ?? 0;
  }
  po /= total;

  // Pe: expected agreement by chance
  let pe = 0;
  for (const rating of new Set([...marginalsA.keys(), ...marginalsB.keys()])) {
    const pA = (marginalsA.get(rating) ?? 0) / total;
    const pB = (marginalsB.get(rating) ?? 0) / total;
    pe += pA * pB;
  }

  if (pe === 1) return 1; // perfect chance agreement → κ undefined; return 1
  return (po - pe) / (1 - pe);
}

function pickFirstCode(set: Set<string> | undefined): string | undefined {
  if (!set || set.size === 0) return undefined;
  return Array.from(set).sort()[0]; // deterministic pick
}
```

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): cohenKappa pareado per-char"`

---

### Task 9: fleissKappa (N coders)

**Files:**
- Create: `src/core/icr/coefficients/fleissKappa.ts`
- Test: `tests/core/icr/coefficients/fleissKappa.test.ts`

Fleiss κ: extensão de Cohen pra N raters. Operates over ratings × categories matrix. Reduz pra Cohen quando N=2 (mas com normalização ligeiramente diferente — não-equivalente exato).

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/coefficients/fleissKappa.test.ts
import { describe, it, expect } from 'vitest';
import { fleissKappa } from '../../../../src/core/icr/coefficients/fleissKappa';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('fleissKappa', () => {
  it('returns ~1.0 when all 3 coders agree', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'c', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b', 'c'],
    };
    expect(fleissKappa(input)).toBeCloseTo(1.0, 3);
  });

  it('returns lower kappa when coders disagree systematically', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1'] },
        { coderId: 'c', range: { fileId: 'f1', locator: '', from: 10, to: 15 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b', 'c'],
    };
    expect(fleissKappa(input)).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/coefficients/fleissKappa.ts
import type { KappaInput } from '../kappaInput';
import { explodeMarkersToCharLabels, iterateAllCharKeys } from '../kappaInput';

/** Fleiss κ — extensão de Cohen pra N raters. Per-char per-category. */
export function fleissKappa(input: KappaInput): number {
  const NONE = '__none__';
  const charMap = explodeMarkersToCharLabels(input.markers);
  const N = input.coders.length;
  if (N < 2) return 1;

  // Pra cada char (unit), conta quantos coders deram cada rating
  // matrix[unit][category] = count
  const allCategories = new Set<string>([NONE]);
  const unitRatings: Array<Map<string, number>> = [];

  for (const key of iterateAllCharKeys(input.sources)) {
    const cm = charMap.get(key);
    const ratingCounts = new Map<string, number>();
    for (const coder of input.coders) {
      const set = cm?.get(coder);
      const r = set && set.size > 0 ? Array.from(set).sort()[0] : NONE;
      ratingCounts.set(r, (ratingCounts.get(r) ?? 0) + 1);
      allCategories.add(r);
    }
    unitRatings.push(ratingCounts);
  }

  const M = unitRatings.length;
  if (M === 0) return 1;

  // Pa: average per-unit agreement
  let pa = 0;
  for (const ratings of unitRatings) {
    let unitAgree = 0;
    for (const count of ratings.values()) {
      unitAgree += count * (count - 1);
    }
    pa += unitAgree / (N * (N - 1));
  }
  pa /= M;

  // Pe: chance agreement
  const pCat = new Map<string, number>();
  for (const ratings of unitRatings) {
    for (const [cat, c] of ratings.entries()) {
      pCat.set(cat, (pCat.get(cat) ?? 0) + c);
    }
  }
  let pe = 0;
  for (const c of pCat.values()) {
    const p = c / (M * N);
    pe += p * p;
  }

  if (pe === 1) return 1;
  return (pa - pe) / (1 - pe);
}
```

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): fleissKappa N-coders per-char"`

---

### Task 10: krippendorffAlpha (nominal)

**Files:**
- Create: `src/core/icr/coefficients/krippendorffAlpha.ts`
- Test: `tests/core/icr/coefficients/krippendorffAlpha.test.ts`

Krippendorff α nominal: similar a Fleiss mas robust to missing data, generalizado pra N coders. Fórmula: α = 1 − (Do / De) onde Do/De são disagreement observed/expected.

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/coefficients/krippendorffAlpha.test.ts
import { describe, it, expect } from 'vitest';
import { krippendorffAlphaNominal } from '../../../../src/core/icr/coefficients/krippendorffAlpha';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('krippendorffAlphaNominal', () => {
  it('returns 1.0 on perfect agreement', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b'],
    };
    expect(krippendorffAlphaNominal(input)).toBeCloseTo(1.0, 3);
  });

  it('returns 0 on chance agreement', () => {
    // 2 coders, 2 categories, evenly distributed → α ≈ 0
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 10 }],
      coders: ['a', 'b'],
    };
    const a = krippendorffAlphaNominal(input);
    expect(Math.abs(a)).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/coefficients/krippendorffAlpha.ts
import type { KappaInput } from '../kappaInput';
import { explodeMarkersToCharLabels, iterateAllCharKeys } from '../kappaInput';

/** Krippendorff α nominal — N coders, robust to missing data.
 *  Per-char unit; rating = primeiro código aplicado pelo coder, '__none__' se não marcou.
 *  Reference: Krippendorff (2004) "Content Analysis", Ch. 11. */
export function krippendorffAlphaNominal(input: KappaInput): number {
  const NONE = '__none__';
  const charMap = explodeMarkersToCharLabels(input.markers);

  // Reliability data: matrix [unit][coder] → category | undefined (missing)
  const units: Array<Map<string, string>> = []; // each unit: coder → category
  for (const key of iterateAllCharKeys(input.sources)) {
    const cm = charMap.get(key);
    const unit = new Map<string, string>();
    for (const coder of input.coders) {
      const set = cm?.get(coder);
      const r = set && set.size > 0 ? Array.from(set).sort()[0] : NONE;
      unit.set(coder, r);
    }
    units.push(unit);
  }

  // Coincidence matrix
  const coincidence = new Map<string, Map<string, number>>();
  const valuesPerUnit: number[] = [];
  for (const unit of units) {
    valuesPerUnit.push(unit.size);
    for (const c1 of unit.values()) {
      for (const c2 of unit.values()) {
        if (c1 === c2 && unit.size === 1) continue; // skip self for n=1
        let row = coincidence.get(c1);
        if (!row) { row = new Map(); coincidence.set(c1, row); }
        row.set(c2, (row.get(c2) ?? 0) + 1 / (unit.size - 1 || 1));
      }
    }
  }

  // n_c (marginals)
  const nc = new Map<string, number>();
  for (const [c1, row] of coincidence) {
    let sum = 0;
    for (const v of row.values()) sum += v;
    nc.set(c1, sum);
  }
  let n = 0;
  for (const v of nc.values()) n += v;

  if (n === 0) return 1;

  // Do: observed disagreement (off-diagonal)
  let Do = 0;
  for (const [c1, row] of coincidence) {
    for (const [c2, v] of row) {
      if (c1 !== c2) Do += v;
    }
  }

  // De: expected disagreement
  let De = 0;
  const cats = Array.from(nc.keys());
  for (let i = 0; i < cats.length; i++) {
    for (let j = 0; j < cats.length; j++) {
      if (i === j) continue;
      const ni = nc.get(cats[i])!;
      const nj = nc.get(cats[j])!;
      De += (ni * nj) / (n - 1 || 1);
    }
  }

  if (De === 0) return Do === 0 ? 1 : 0;
  return 1 - Do / De;
}
```

- [ ] **Step 4: Run tests.** Expected: PASS. **Marcar `// TODO revisitar com fórmula da literatura`** — se output divergir do esperado em casos canônicos, voltar.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): krippendorffAlphaNominal per-char N-coders"`

---

### Task 11: alphaBinary (two-level — boundary detection)

**Files:**
- Create: `src/core/icr/coefficients/alphaBinary.ts`
- Test: `tests/core/icr/coefficients/alphaBinary.test.ts`

α-binary (ATLAS.ti): "existe quotation aqui?" — binary classification per char (1 = algum coder marcou neste char, 0 = não). Mede agreement em **boundary detection** (onde tem coding) sem se importar com qual código.

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/coefficients/alphaBinary.test.ts
import { describe, it, expect } from 'vitest';
import { alphaBinary } from '../../../../src/core/icr/coefficients/alphaBinary';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('alphaBinary', () => {
  it('returns 1.0 when boundaries are identical', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c2'] }, // diff code, same boundary
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b'],
    };
    expect(alphaBinary(input)).toBeCloseTo(1.0, 3);
  });

  it('returns lower when boundaries differ', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 10 }],
      coders: ['a', 'b'],
    };
    const a = alphaBinary(input);
    expect(a).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/coefficients/alphaBinary.ts
import type { KappaInput, CodedMarker } from '../kappaInput';
import { krippendorffAlphaNominal } from './krippendorffAlpha';

/** α-binary: collapse all codes pro mesmo "marker presente" → reusa αNominal sobre {0, 1}. */
export function alphaBinary(input: KappaInput): number {
  // Substitui codeIds por '__present__' uniformly
  const collapsedMarkers: CodedMarker[] = input.markers.map(m => ({
    ...m,
    codeIds: ['__present__'],
  }));
  return krippendorffAlphaNominal({
    ...input,
    markers: collapsedMarkers,
  });
}
```

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): alphaBinary (collapse codes pra two-level boundary detection)"`

---

### Task 12: cuAlpha (two-level — code agreement within agreed boundaries)

**Files:**
- Create: `src/core/icr/coefficients/cuAlpha.ts`
- Test: `tests/core/icr/coefficients/cuAlpha.test.ts`

cu-α: dado que ambos coders marcaram um char, qual a concordância sobre QUAL CÓDIGO? Filtra char universe pra apenas chars com 2+ coders marcando.

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/coefficients/cuAlpha.test.ts
import { describe, it, expect } from 'vitest';
import { cuAlpha } from '../../../../src/core/icr/coefficients/cuAlpha';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('cuAlpha', () => {
  it('returns 1.0 when both coders agree on code within shared boundaries', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b'],
    };
    expect(cuAlpha(input)).toBeCloseTo(1.0, 3);
  });

  it('returns lower when codes differ within shared boundary', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c2'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b'],
    };
    expect(cuAlpha(input)).toBeLessThan(0.5);
  });

  it('ignores chars where only one coder marked (no shared boundary)', () => {
    const input: KappaInput = {
      markers: [
        { coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
        { coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c2'] },
      ],
      sources: [{ fileId: 'f1', locator: '', totalChars: 20 }],
      coders: ['a', 'b'],
    };
    // Sem chars compartilhados → α undefined; convenção: retornar 1 (vacuous)
    expect(cuAlpha(input)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/coefficients/cuAlpha.ts
import type { KappaInput, SourceMeta } from '../kappaInput';
import { explodeMarkersToCharLabels } from '../kappaInput';
import { krippendorffAlphaNominal } from './krippendorffAlpha';

/** cu-α: code agreement only over chars marked by ALL coders (interseção de boundaries).
 *  Filtra source universe pros chars compartilhados; reusa αNominal sobre o subset. */
export function cuAlpha(input: KappaInput): number {
  const charMap = explodeMarkersToCharLabels(input.markers);
  // Identifica chars marked por TODOS os coders
  const sharedChars = new Map<string, Set<string>>(); // sourceKey → set of pos
  for (const [key, coderMap] of charMap) {
    if (coderMap.size === input.coders.length) {
      // all coders present
      const lastColon = key.lastIndexOf(':');
      const sourceKey = key.slice(0, lastColon);
      const pos = key.slice(lastColon + 1);
      let set = sharedChars.get(sourceKey);
      if (!set) { set = new Set(); sharedChars.set(sourceKey, set); }
      set.add(pos);
    }
  }

  if (sharedChars.size === 0) return 1; // vacuous

  // Build subset KappaInput: sources com totalChars = chars compartilhados, markers filtrados
  // Mais simples: criar source sintético per shared range, e markers truncados
  // Pragmatic: criar 1 source totalChars = #shared chars, markers truncados pra esses
  // Implementação simplificada: clonar input mas substituir totalChars por count of shared
  // E truncar markers pra apenas chars compartilhados
  let totalShared = 0;
  for (const set of sharedChars.values()) totalShared += set.size;

  if (totalShared === 0) return 1;

  // Para reusar αNominal direto, criamos fake source que cobre só shared chars
  // Re-mapping: dense indexing 0..totalShared-1
  // Markers ficam só nos shared positions, com seus codes originais
  // Markers que tocam shared positions: filter pra só esses

  // Para simplificar: usa αNominal sobre input ORIGINAL mas com source totalChars = totalShared
  // Reason: nominal opera sobre coincidence matrix, e chars sem coding viram '__none__'.
  // Ao reduzir totalChars pra shared, '__none__' não aparece (todos shared têm 2+ coders).
  // Mas precisamos garantir que iterateAllCharKeys cubra apenas shared.

  // Pragma: truncar source totalChars pra densidade igual a shared count.
  // ATTENTION: isso re-mapeia posições. Mais correto: filtrar markers pra incluir apenas chars compartilhados.

  const filteredMarkers = input.markers.flatMap(m => {
    const sourceKey = `${m.range.fileId}:${m.range.locator}`;
    const sharedSet = sharedChars.get(sourceKey);
    if (!sharedSet) return [];
    // Build new ranges from contiguous shared positions within [from, to)
    const ranges: typeof m[] = [];
    let curFrom: number | null = null;
    for (let pos = m.range.from; pos < m.range.to; pos++) {
      if (sharedSet.has(String(pos))) {
        if (curFrom === null) curFrom = pos;
      } else {
        if (curFrom !== null) {
          ranges.push({ ...m, range: { ...m.range, from: curFrom, to: pos } });
          curFrom = null;
        }
      }
    }
    if (curFrom !== null) {
      ranges.push({ ...m, range: { ...m.range, from: curFrom, to: m.range.to } });
    }
    return ranges;
  });

  // Build sources truncados: each source totalChars = max shared pos + 1
  const newSources: SourceMeta[] = [];
  for (const s of input.sources) {
    const key = `${s.fileId}:${s.locator}`;
    const set = sharedChars.get(key);
    if (!set || set.size === 0) continue;
    const maxPos = Math.max(...Array.from(set).map(Number));
    newSources.push({ ...s, totalChars: maxPos + 1 });
  }

  return krippendorffAlphaNominal({
    markers: filteredMarkers,
    sources: newSources,
    coders: input.coders,
  });
}
```

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): cuAlpha (code agreement within shared boundaries)"`

---

## Chunk 4 — Reporter + Seed + Smoke

### Task 13: reporter (per-engine + agregado)

**Files:**
- Create: `src/core/icr/reporter.ts`
- Test: `tests/core/icr/reporter.test.ts`

Reporter recebe `KappaInput` per-engine (separados) e calcula:
- Per engine: 5 coeficientes (Cohen κ pareado para cada par de coders | Fleiss κ | α nominal | α-binary | cu-α)
- Agregado: média ponderada por #markers de cada engine

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/reporter.test.ts
import { describe, it, expect } from 'vitest';
import { reportKappa } from '../../../src/core/icr/reporter';
import type { EngineKappaInput } from '../../../src/core/icr/reporter';

describe('reportKappa', () => {
  it('returns per-engine + aggregate when multiple engines have data', () => {
    const inputs: EngineKappaInput[] = [
      {
        engine: 'markdown',
        kappaInput: {
          markers: [
            { coderId: 'a', range: { fileId: 'f1.md', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
            { coderId: 'b', range: { fileId: 'f1.md', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
          ],
          sources: [{ fileId: 'f1.md', locator: '', totalChars: 20 }],
          coders: ['a', 'b'],
        },
      },
      {
        engine: 'pdf',
        kappaInput: {
          markers: [
            { coderId: 'a', range: { fileId: 'f1.pdf', locator: 'page:1', from: 0, to: 5 }, codeIds: ['c1'] },
            { coderId: 'b', range: { fileId: 'f1.pdf', locator: 'page:1', from: 5, to: 10 }, codeIds: ['c1'] },
          ],
          sources: [{ fileId: 'f1.pdf', locator: 'page:1', totalChars: 20 }],
          coders: ['a', 'b'],
        },
      },
    ];

    const r = reportKappa(inputs);
    expect(r.byEngine.markdown.cohenKappa['a|b']).toBeCloseTo(1.0, 3);
    expect(r.byEngine.pdf.cohenKappa['a|b']).toBeLessThan(0.5);
    expect(r.aggregate.cohenKappa['a|b']).toBeGreaterThan(0); // weighted average
    expect(r.aggregate.cohenKappa['a|b']).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/reporter.ts
import type { KappaInput } from './kappaInput';
import { cohenKappa } from './coefficients/cohenKappa';
import { fleissKappa } from './coefficients/fleissKappa';
import { krippendorffAlphaNominal } from './coefficients/krippendorffAlpha';
import { alphaBinary } from './coefficients/alphaBinary';
import { cuAlpha } from './coefficients/cuAlpha';

export type EngineId = 'markdown' | 'pdf' | 'csvSegment';

export interface EngineKappaInput {
  engine: EngineId;
  kappaInput: KappaInput;
}

export interface CoefficientReport {
  cohenKappa: Record<string, number>;  // 'coderA|coderB' → κ
  fleissKappa: number;
  alphaNominal: number;
  alphaBinary: number;
  cuAlpha: number;
}

export interface KappaReport {
  byEngine: Partial<Record<EngineId, CoefficientReport>>;
  aggregate: CoefficientReport;
  weights: Partial<Record<EngineId, number>>;  // # markers per engine, base da média ponderada
}

export function reportKappa(inputs: EngineKappaInput[]): KappaReport {
  const byEngine: Partial<Record<EngineId, CoefficientReport>> = {};
  const weights: Partial<Record<EngineId, number>> = {};
  for (const { engine, kappaInput } of inputs) {
    byEngine[engine] = computeAll(kappaInput);
    weights[engine] = kappaInput.markers.length;
  }

  // Aggregate: weighted average por #markers.
  // TODO revisitar com fórmula da literatura quando user trouxer evidência (média ponderada é default razoável).
  const aggregate = aggregateReports(byEngine, weights);

  return { byEngine, aggregate, weights };
}

function computeAll(input: KappaInput): CoefficientReport {
  const cohenK: Record<string, number> = {};
  for (let i = 0; i < input.coders.length; i++) {
    for (let j = i + 1; j < input.coders.length; j++) {
      const key = `${input.coders[i]}|${input.coders[j]}`;
      cohenK[key] = cohenKappa(input, input.coders[i], input.coders[j]);
    }
  }
  return {
    cohenKappa: cohenK,
    fleissKappa: fleissKappa(input),
    alphaNominal: krippendorffAlphaNominal(input),
    alphaBinary: alphaBinary(input),
    cuAlpha: cuAlpha(input),
  };
}

function aggregateReports(
  byEngine: Partial<Record<EngineId, CoefficientReport>>,
  weights: Partial<Record<EngineId, number>>,
): CoefficientReport {
  const engines = Object.keys(byEngine) as EngineId[];
  let totalWeight = 0;
  for (const e of engines) totalWeight += weights[e] ?? 0;
  if (totalWeight === 0) {
    return { cohenKappa: {}, fleissKappa: 1, alphaNominal: 1, alphaBinary: 1, cuAlpha: 1 };
  }

  const allCohenKeys = new Set<string>();
  for (const e of engines) {
    for (const k of Object.keys(byEngine[e]!.cohenKappa)) allCohenKeys.add(k);
  }

  const cohenAgg: Record<string, number> = {};
  for (const key of allCohenKeys) {
    let sum = 0;
    let used = 0;
    for (const e of engines) {
      const v = byEngine[e]!.cohenKappa[key];
      const w = weights[e] ?? 0;
      if (v !== undefined) { sum += v * w; used += w; }
    }
    cohenAgg[key] = used > 0 ? sum / used : 0;
  }

  const wavg = (key: keyof CoefficientReport): number => {
    let sum = 0;
    for (const e of engines) sum += (byEngine[e]![key] as number) * (weights[e] ?? 0);
    return sum / totalWeight;
  };

  return {
    cohenKappa: cohenAgg,
    fleissKappa: wavg('fleissKappa'),
    alphaNominal: wavg('alphaNominal'),
    alphaBinary: wavg('alphaBinary'),
    cuAlpha: wavg('cuAlpha'),
  };
}
```

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): reporter (per-engine + agregado por média ponderada)"`

---

### Task 14: Seed sintético

**Files:**
- Create: `scripts/seed-icr-corpus.mjs`

Script popula `data.json` do vault workbench com:
- 2-3 coders no registry (`human:default` + `human:carla` + `human:joana`)
- ~5 codes definidos (códigos descritivos de pesquisa qualitativa)
- Markers sobre arquivos `ICR-test/`:
  - 6 markers em ICR-entrevista-1.md (2 coders × 3 segments com divergências controladas)
  - 6 markers em ICR-entrevista-2.md (idem)
  - 4 markers em ICR-entrevista-1.pdf (2 coders × 2 segments)
  - 4 markers em ICR-survey.csv (2 coders × 2 cell segments)

Divergências controladas:
- 1 segmento: ambos coders, mesmo code, mesmo boundary (perfect agreement)
- 1 segmento: ambos coders, mesmo code, boundary diff ±5 chars (boundary disagreement)
- 1 segmento: ambos coders, boundary igual, codes diferentes (code disagreement)

- [ ] **Step 1: Implement script**

```javascript
// scripts/seed-icr-corpus.mjs
import fs from 'node:fs';
import path from 'node:path';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const DATA_JSON = path.join(VAULT, '.obsidian/plugins/obsidian-qualia-coding/data.json');

const data = JSON.parse(fs.readFileSync(DATA_JSON, 'utf-8'));

const now = Date.now();
const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 11)}`;

// Coders
data.coders = data.coders ?? { coders: [] };
data.coders.coders = [
  { id: 'human:default', name: 'Default', type: 'human', createdAt: now },
  { id: 'human:carla', name: 'Carla', type: 'human', createdAt: now },
  { id: 'human:joana', name: 'Joana', type: 'human', createdAt: now },
];

// Codes (5 definitions)
const codeIds = {};
const codeNames = ['Frustração', 'Confiança', 'Crítica institucional', 'Estratégia', 'Limitação técnica'];
const palette = ['#6200EE', '#03DAC6', '#CF6679', '#FF9800', '#4CAF50'];
codeNames.forEach((name, i) => {
  const cid = id('c');
  codeIds[name] = cid;
  data.registry.definitions[cid] = {
    id: cid, name, color: palette[i], paletteIndex: i, createdAt: now, updatedAt: now,
    childrenOrder: [],
  };
  data.registry.rootOrder.push(cid);
});
data.registry.nextPaletteIndex = 5;

// Helper to add markdown markers
const mdMarkers = data.markdown.markers;
const addMd = (file, range, codedBy, codeName) => {
  if (!mdMarkers[file]) mdMarkers[file] = [];
  mdMarkers[file].push({
    markerType: 'markdown', id: id('m'), fileId: file,
    range, color: palette[0],
    codes: [{ codeId: codeIds[codeName] }],
    codedBy,
    createdAt: now, updatedAt: now,
  });
};

// Entrevista 1 — 3 segments com divergências controladas
const f1 = 'ICR-test/ICR-entrevista-1.md';
// Segment 1: perfect agreement (same range, same code)
addMd(f1, { from: { line: 6, ch: 0 }, to: { line: 6, ch: 80 } }, 'human:carla', 'Frustração');
addMd(f1, { from: { line: 6, ch: 0 }, to: { line: 6, ch: 80 } }, 'human:joana', 'Frustração');
// Segment 2: boundary disagreement (overlap parcial)
addMd(f1, { from: { line: 10, ch: 0 }, to: { line: 10, ch: 100 } }, 'human:carla', 'Crítica institucional');
addMd(f1, { from: { line: 10, ch: 20 }, to: { line: 10, ch: 90 } }, 'human:joana', 'Crítica institucional');
// Segment 3: code disagreement (mesmo range, codes diferentes)
addMd(f1, { from: { line: 14, ch: 0 }, to: { line: 14, ch: 80 } }, 'human:carla', 'Estratégia');
addMd(f1, { from: { line: 14, ch: 0 }, to: { line: 14, ch: 80 } }, 'human:joana', 'Limitação técnica');

// Entrevista 2 — análogo
const f2 = 'ICR-test/ICR-entrevista-2.md';
addMd(f2, { from: { line: 6, ch: 0 }, to: { line: 6, ch: 60 } }, 'human:carla', 'Confiança');
addMd(f2, { from: { line: 6, ch: 0 }, to: { line: 6, ch: 60 } }, 'human:joana', 'Confiança');
addMd(f2, { from: { line: 10, ch: 0 }, to: { line: 10, ch: 80 } }, 'human:carla', 'Crítica institucional');
addMd(f2, { from: { line: 10, ch: 10 }, to: { line: 10, ch: 70 } }, 'human:joana', 'Crítica institucional');
addMd(f2, { from: { line: 14, ch: 0 }, to: { line: 14, ch: 70 } }, 'human:carla', 'Estratégia');
addMd(f2, { from: { line: 14, ch: 0 }, to: { line: 14, ch: 70 } }, 'human:joana', 'Frustração');

// PDF entrevista-1 — 2 segments
const pdfFile = 'ICR-test/ICR-entrevista-1.pdf';
data.pdf.markers.push(
  { markerType: 'pdf', id: id('m'), fileId: pdfFile, page: 1, beginIndex: 100, beginOffset: 0, endIndex: 200, endOffset: 0, text: '...', codes: [{ codeId: codeIds['Frustração'] }], codedBy: 'human:carla', createdAt: now, updatedAt: now },
  { markerType: 'pdf', id: id('m'), fileId: pdfFile, page: 1, beginIndex: 100, beginOffset: 0, endIndex: 200, endOffset: 0, text: '...', codes: [{ codeId: codeIds['Frustração'] }], codedBy: 'human:joana', createdAt: now, updatedAt: now },
  { markerType: 'pdf', id: id('m'), fileId: pdfFile, page: 1, beginIndex: 300, beginOffset: 0, endIndex: 400, endOffset: 0, text: '...', codes: [{ codeId: codeIds['Estratégia'] }], codedBy: 'human:carla', createdAt: now, updatedAt: now },
  { markerType: 'pdf', id: id('m'), fileId: pdfFile, page: 1, beginIndex: 320, beginOffset: 0, endIndex: 380, endOffset: 0, text: '...', codes: [{ codeId: codeIds['Estratégia'] }], codedBy: 'human:joana', createdAt: now, updatedAt: now },
);

// CSV cod segment — 2 cells codificadas
data.csv.segmentMarkers.push(
  { markerType: 'csv', id: id('m'), fileId: 'ICR-test/ICR-survey.csv', sourceRowId: 0, column: 'response', from: 0, to: 50, codes: [{ codeId: codeIds['Confiança'] }], codedBy: 'human:carla', createdAt: now, updatedAt: now },
  { markerType: 'csv', id: id('m'), fileId: 'ICR-test/ICR-survey.csv', sourceRowId: 0, column: 'response', from: 0, to: 50, codes: [{ codeId: codeIds['Confiança'] }], codedBy: 'human:joana', createdAt: now, updatedAt: now },
  { markerType: 'csv', id: id('m'), fileId: 'ICR-test/ICR-survey.csv', sourceRowId: 1, column: 'response', from: 0, to: 80, codes: [{ codeId: codeIds['Limitação técnica'] }], codedBy: 'human:carla', createdAt: now, updatedAt: now },
  { markerType: 'csv', id: id('m'), fileId: 'ICR-test/ICR-survey.csv', sourceRowId: 1, column: 'response', from: 10, to: 70, codes: [{ codeId: codeIds['Frustração'] }], codedBy: 'human:joana', createdAt: now, updatedAt: now },
);

fs.writeFileSync(DATA_JSON, JSON.stringify(data, null, 2));
console.log('ICR seed corpus populated.');
console.log(`- ${data.coders.coders.length} coders`);
console.log(`- ${Object.keys(data.registry.definitions).length} codes`);
console.log(`- ${Object.values(mdMarkers).flat().length} markdown markers`);
console.log(`- ${data.pdf.markers.length} PDF markers`);
console.log(`- ${data.csv.segmentMarkers.length} CSV segment markers`);
```

- [ ] **Step 2: Run script** — `node scripts/seed-icr-corpus.mjs`. Expected: counts logged.

- [ ] **Step 3: Verify data.json** — `head -50 data.json` — confirma `coders` populated, codes presentes.

- [ ] **Step 4: Commit** — `~/.claude/scripts/commit.sh "feat(icr): seed sintético — 3 coders + 5 codes + markers em ICR-test/ com divergências controladas"`

---

### Task 15: Smoke validation

**Files:** none new

- [ ] **Step 1: Run full test suite** — `npm run test`. Expected: 2759+ testes verde (incluindo os ~30 novos do Slice 1).

- [ ] **Step 2: Build** — `npm run build`. Expected: build OK, sem erros TS.

- [ ] **Step 3: Reload Obsidian + verify data.json carregou** — abrir vault `/Users/mosx/Desktop/obsidian-plugins-workbench/`, recarregar plugin (Settings > Community plugins > toggle off/on), abrir Console (Ctrl+Shift+I) e checar:
  - Sem erros no console
  - Code Explorer mostra os 5 codes seedados (Frustração, Confiança, etc.)
  - Markers visíveis em `ICR-test/ICR-entrevista-1.md` (cores diferentes por code)

- [ ] **Step 4: Manual κ test via console** — abrir DevTools console e rodar:

```js
// No console do Obsidian:
const plugin = app.plugins.plugins['qualia-coding'];
const data = plugin.dataManager.data;

// Build EngineKappaInput pra markdown
const sourceText = await app.vault.adapter.read('ICR-test/ICR-entrevista-1.md');
console.log('Source length:', sourceText.length);

// (Esse step é validação manual de sanity — verificar que markers fazem sentido sobre os arquivos reais)
console.log('MD markers:', data.markdown.markers['ICR-test/ICR-entrevista-1.md']?.length);
console.log('Coders:', data.coders?.coders);
```

- [ ] **Step 5: Document smoke result** — adicionar 1 linha em `CHANGELOG.md` (não criar entrada nova de release; só anotar):

```
- Slice 1 ICR motor κ texto implementado e smoke-testado em vault real (markdown + PDF + CSV cod segment)
```

- [ ] **Step 6: Final commit** — `~/.claude/scripts/commit.sh "test(icr): slice 1 motor κ texto smoke-testado em vault real (3 coders × 5 codes × 16 markers em ICR-test/)"`

---

## Success Criteria

Slice 1 está **done** quando:

1. ✅ Todos coeficientes têm testes unitários verde (Cohen, Fleiss, Krippendorff α, α-binary, cu-α)
2. ✅ Reporter retorna per-engine + agregado funcionando em fixture multi-engine
3. ✅ `npm run test` verde (2759+ testes)
4. ✅ `npm run build` OK
5. ✅ Vault de teste carregou com 3 coders + 5 codes + 16 markers seed
6. ✅ Console DevTools mostra markers + coders absorvidos sem erro
7. ✅ Code Explorer renderiza os 5 codes seedados
8. ✅ Markers visíveis em ICR-test/* (markdown highlights, PDF/CSV via sidebar)

## Não-objetivos (Slice 1)

- View Compare Coders (drill-down NVivo) — **gated em UX brainstorm**
- Reconciliação UI (audit + memos orquestrados) — **gated em UX brainstorm**
- Hash por source — **Slice 2 separado**
- Settings UI pra coder switcher (active coder) — slice futuro
- Adapter cod row, áudio/vídeo, PDF shape, imagem — slices de extensão

## Próximo passo após Slice 1

- Slice 2 (hash por source) — plano próprio
- Brainstorm UX pra View Compare Coders + Reconciliação
- Slices de extensão (cod row, áudio/vídeo, PDF shape, imagem)
