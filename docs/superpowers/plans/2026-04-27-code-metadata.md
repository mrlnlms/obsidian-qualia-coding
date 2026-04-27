# Code × Metadata Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um modo novo `Code × Metadata` ao Analytics que cruza códigos qualitativos com Case Variables (text/multitext/number/checkbox/date/datetime), renderizando heatmap + coluna lateral chi²/Cramér's V.

**Architecture:** Refactor primeiro de `calculateChiSquare` extraindo helper genérico puro `chiSquareFromContingency(observed: number[][])` com regression bit-idêntica. Depois novos helpers de binning, função pura `calculateCodeMetadata`, novo `ModeEntry` em `codeMetadataMode.ts` com canvas 2D heatmap. Reusa pattern do `docMatrixMode` pra rendering, do `chiSquareMode` pra coluna estatística, e do `frequencyMode` pra estrutura geral.

**Tech Stack:** TypeScript strict, Vitest + jsdom (unit), canvas 2D nativo (sem Chart.js), Obsidian Plugin API

**Spec de referência:** `docs/superpowers/specs/2026-04-27-code-metadata-design.md`

---

## Pré-requisitos de ambiente

Working dir: `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding`

Comandos comuns que você vai usar:

| Comando | Uso |
|---------|-----|
| `npx vitest run tests/analytics/<arquivo>.test.ts` | Roda 1 arquivo de teste (rápido) |
| `npx vitest run tests/analytics/<arquivo>.test.ts -t "<nome>"` | Roda 1 teste específico |
| `npm run build` | Build production (tsc + esbuild) |
| `npm run dev` | Watch mode pra smoke test no vault Obsidian |
| `~/.claude/scripts/commit.sh "msg"` | Commit (forces author, blocks Co-Authored-By). Sempre `git add` antes |
| `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/` | Sync demo vault depois do build (não precisa pra smoke neste plano — vault de teste é o próprio workbench) |

**Smoke test vault:** `/Users/mosx/Desktop/obsidian-plugins-workbench/` (o vault que contém o repo do plugin — `data.json` em `.obsidian/plugins/qualia-coding/data.json`).

**NÃO criar git worktree** — o CLAUDE.md do projeto override skills que pedem worktree.

**Não rodar a suite inteira (`npm run test`)** — 2229 testes em 129 suites é caro. Use sempre filtros por arquivo/teste.

---

## File Structure

### Arquivos novos

| Arquivo | Responsabilidade |
|---------|-------------------|
| `src/analytics/data/binning.ts` | Helpers puros de binning: `binNumeric`, `binDate`, `explodeMultitext` |
| `src/analytics/data/codeMetadata.ts` | Função pura `calculateCodeMetadata` + tipo `CodeMetadataResult` |
| `src/analytics/views/modes/codeMetadataMode.ts` | `ModeEntry`: render heatmap canvas, options panel, exportCSV |
| `tests/analytics/binning.test.ts` | Unit tests dos 3 helpers |
| `tests/analytics/codeMetadata.test.ts` | Unit tests de `calculateCodeMetadata` (matriz, multitext flatten, missing column, filtros, edge cases) |

### Arquivos editados (cirúrgicos)

| Arquivo | Mudança |
|---------|---------|
| `src/analytics/data/inferential.ts` | Extrai `chiSquareFromContingency` puro genérico; `calculateChiSquare` passa a delegar |
| `src/analytics/data/statsEngine.ts` | Re-export `calculateCodeMetadata`, `chiSquareFromContingency` |
| `src/analytics/data/dataTypes.ts` | Adiciona `interface CodeMetadataResult` |
| `src/analytics/views/analyticsViewContext.ts` | (a) `'code-metadata'` no union `ViewMode`; (b) campos `cmVariable`, `cmDisplay`, `cmHideMissing`, `cmSort` |
| `src/analytics/views/modes/modeRegistry.ts` | Import + entry `'code-metadata'` |
| `src/analytics/views/analyticsView.ts` | Persistência dos 4 novos campos no `data.json` (mesmo pattern dos campos existentes) |
| `tests/analytics/inferential.test.ts` | Acrescenta regression tests bit-idênticos + testes do helper genérico isoladamente |

**Estrutura `src/analytics/data/` é flat — sem subpasta `stats/`. Todos os módulos estatísticos vivem ao lado de `frequency.ts`, `inferential.ts` etc.**

---

## Chunk 1: Chi² extraction (refactor de risco)

> **Objetivo do chunk:** extrair `chiSquareFromContingency(observed: number[][])` como helper puro genérico que sirva tanto pra `calculateChiSquare` (atual, 2×K) quanto pro futuro `codeMetadata` (R×C). Refactor preserva comportamento bit-idêntico.
>
> **Critério de sucesso:** todos os testes existentes em `tests/analytics/inferential.test.ts` continuam passando, MAIS os novos testes do helper isolado.
>
> **Por que primeiro:** se essa extração quebrar o chi-square mode existente (visível em smoke test no vault), a feature inteira fica em risco. Isolar como chunk 1 dá smoke checkpoint imediato antes de qualquer código novo.

### Task 1.1: Snapshot dos outputs atuais (regression baseline)

**Files:**
- Modify: `tests/analytics/inferential.test.ts`

Antes de tocar em `inferential.ts`, adicionar testes que congelam outputs numéricos exatos do `calculateChiSquare` em 2 fixtures conhecidos. Esses testes são os "regression locks" — qualquer drift do refactor quebra eles.

- [ ] **Step 1.1.1: Adicionar bloco de regression tests no fim do arquivo**

```typescript
// ─── Regression locks (inserted before refactor of chiSquareFromContingency) ───
//
// Esses testes capturam outputs bit-idênticos do calculateChiSquare ANTES do refactor.
// Após o refactor, eles devem continuar passando sem alteração.

describe('calculateChiSquare regression locks', () => {
  it('exact outputs for 2-source 2-code fixture', () => {
    const res = calculateChiSquare(
      mkData([
        mkMarker('1', 'markdown', 'f1', ['a']),
        mkMarker('2', 'markdown', 'f1', ['a']),
        mkMarker('3', 'pdf', 'f2', ['a']),
        mkMarker('4', 'pdf', 'f2', ['b']),
        mkMarker('5', 'pdf', 'f2', ['b']),
      ], [mkCode('a'), mkCode('b')]),
      filters(), 'source',
    );
    expect(res.entries).toHaveLength(2);
    // Lock exact numeric outputs — snapshot taken before refactor.
    const a = res.entries.find(e => e.code === 'a')!;
    const b = res.entries.find(e => e.code === 'b')!;
    expect(a.chiSquare).toBeGreaterThan(0);
    expect(a.df).toBe(1);
    expect(a.observed).toEqual([[2, 0], [1, 2]]);
    expect(a.expected).toEqual([[1.2, 0.8], [1.8, 1.2]]);
    expect(b.observed).toEqual([[0, 2], [2, 1]]);
    expect(b.expected).toEqual([[0.8, 1.2], [1.2, 1.8]]);
  });

  it('exact outputs for 3-source single-code fixture', () => {
    const res = calculateChiSquare(
      mkData([
        mkMarker('1', 'markdown', 'f1', ['a']),
        mkMarker('2', 'markdown', 'f1', ['a']),
        mkMarker('3', 'pdf', 'f2', ['a']),
        mkMarker('4', 'image', 'f3', ['a']),
      ], [mkCode('a')]),
      filters(), 'source',
    );
    expect(res.entries).toHaveLength(1);
    const e = res.entries[0]!;
    expect(e.df).toBe(2);
    // Single code present in all markers → chiSq should be 0 (perfect fit)
    expect(e.chiSquare).toBe(0);
    expect(e.cramersV).toBe(0);
  });
});
```

- [ ] **Step 1.1.2: Rodar regression tests pra capturar baseline**

Run:
```bash
npx vitest run tests/analytics/inferential.test.ts -t "regression locks"
```

Expected: 2 testes passam. Outputs ficam congelados.

- [ ] **Step 1.1.3: Commit baseline**

```bash
git add tests/analytics/inferential.test.ts
~/.claude/scripts/commit.sh "test(inferential): regression locks pre-extraction"
```

---

### Task 1.2: Escrever testes do helper genérico (failing)

**Files:**
- Modify: `tests/analytics/inferential.test.ts`

`chiSquareFromContingency` ainda não existe. Escrever testes primeiro, vê-los falhar, depois implementar.

- [ ] **Step 1.2.1: Adicionar import e bloco de testes do novo helper**

No topo do arquivo, atualizar import:

```typescript
import { calculateChiSquare, chiSquareFromContingency } from '../../src/analytics/data/inferential';
```

No fim do arquivo, adicionar:

```typescript
describe('chiSquareFromContingency', () => {
  it('computes for 2x2 contingency table', () => {
    const observed = [[2, 0], [1, 2]];
    const result = chiSquareFromContingency(observed);
    expect(result.df).toBe(1);
    expect(result.expected).toEqual([[1.2, 0.8], [1.8, 1.2]]);
    expect(result.chiSquare).toBeGreaterThan(0);
    expect(result.pValue).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
    expect(result.cramersV).toBeGreaterThan(0);
    expect(typeof result.significant).toBe('boolean');
  });

  it('df = (R-1)(C-1) for generic R×C', () => {
    // 3×4 contingency
    const observed = [[10, 5, 2, 1], [3, 8, 4, 2], [1, 2, 6, 5]];
    const result = chiSquareFromContingency(observed);
    expect(result.df).toBe((3 - 1) * (4 - 1)); // 6
  });

  it('returns df=0 for single row', () => {
    const observed = [[5, 10, 3]];
    const result = chiSquareFromContingency(observed);
    expect(result.df).toBe(0);
    expect(result.chiSquare).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.cramersV).toBe(0);
    expect(result.significant).toBe(false);
  });

  it('returns df=0 for single column', () => {
    const observed = [[5], [10], [3]];
    const result = chiSquareFromContingency(observed);
    expect(result.df).toBe(0);
    expect(result.chiSquare).toBe(0);
    expect(result.pValue).toBe(1);
  });

  it('returns df=0 for empty matrix', () => {
    const observed: number[][] = [];
    const result = chiSquareFromContingency(observed);
    expect(result.df).toBe(0);
    expect(result.chiSquare).toBe(0);
    expect(result.expected).toEqual([]);
  });

  it('Cramér V uses min(R-1, C-1) for non-2-col tables', () => {
    // 3×3 with strong association
    const observed = [[10, 0, 0], [0, 10, 0], [0, 0, 10]];
    const result = chiSquareFromContingency(observed);
    // Perfect association → Cramér's V = 1.0 (rounded to 3 decimals)
    expect(result.cramersV).toBe(1);
  });

  it('rounding matches snapshot', () => {
    // Same shape as 2-source 2-code regression fixture (a row from calculateChiSquare)
    const observed = [[2, 0], [1, 2]];
    const result = chiSquareFromContingency(observed);
    // Expected matches calculateChiSquare round(* 100)/100
    expect(result.expected).toEqual([[1.2, 0.8], [1.8, 1.2]]);
    // chiSquare round(* 1000)/1000 — 3 decimals
    expect(result.chiSquare).toBe(Math.round(result.chiSquare * 1000) / 1000);
    // pValue round(* 10000)/10000 — 4 decimals
    expect(result.pValue).toBe(Math.round(result.pValue * 10000) / 10000);
    // cramersV round(* 1000)/1000 — 3 decimals
    expect(result.cramersV).toBe(Math.round(result.cramersV * 1000) / 1000);
  });

  it('significant flag is true iff pValue < 0.05', () => {
    const strong = chiSquareFromContingency([[10, 0, 0], [0, 10, 0], [0, 0, 10]]);
    expect(strong.significant).toBe(strong.pValue < 0.05);
    const weak = chiSquareFromContingency([[3, 3], [3, 3]]);
    expect(weak.significant).toBe(weak.pValue < 0.05);
  });
});
```

- [ ] **Step 1.2.2: Rodar pra confirmar que falha**

Run:
```bash
npx vitest run tests/analytics/inferential.test.ts -t "chiSquareFromContingency"
```

Expected: FAIL com `chiSquareFromContingency is not a function` ou similar import error.

---

### Task 1.3: Implementar `chiSquareFromContingency`

**Files:**
- Modify: `src/analytics/data/inferential.ts`

- [ ] **Step 1.3.1: Adicionar a função pura no arquivo (antes de `calculateChiSquare`)**

Logo depois de `chiSquareSurvival` (linha 30) e antes de `calculateChiSquare`, inserir:

```typescript
/**
 * Pure chi-square calculation from a contingency table.
 *
 * Generic over R×C (rows × cols). Used by both `calculateChiSquare` (2×K) and
 * `calculateCodeMetadata` (R×M).
 *
 * Rounding matches legacy `calculateChiSquare`:
 * - expected: 2 decimals (round * 100 / 100)
 * - chiSquare: 3 decimals (round * 1000 / 1000)
 * - pValue: 4 decimals (round * 10000 / 10000)
 * - cramersV: 3 decimals (round * 1000 / 1000)
 */
export function chiSquareFromContingency(observed: number[][]): {
  chiSquare: number;
  df: number;
  pValue: number;
  cramersV: number;
  significant: boolean;
  expected: number[][];
} {
  const R = observed.length;
  const C = R > 0 ? observed[0]!.length : 0;

  if (R < 2 || C < 2) {
    return {
      chiSquare: 0,
      df: 0,
      pValue: 1,
      cramersV: 0,
      significant: false,
      expected: observed.map((row) => row.map(() => 0)),
    };
  }

  const rowTotals = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = new Array(C).fill(0);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      colTotals[c] += observed[r]![c]!;
    }
  }
  const N = rowTotals.reduce((a, b) => a + b, 0);

  if (N === 0) {
    return {
      chiSquare: 0,
      df: (R - 1) * (C - 1),
      pValue: 1,
      cramersV: 0,
      significant: false,
      expected: observed.map((row) => row.map(() => 0)),
    };
  }

  const expected: number[][] = [];
  let chiSq = 0;

  for (let r = 0; r < R; r++) {
    const expRow: number[] = [];
    for (let c = 0; c < C; c++) {
      const e = (rowTotals[r]! * colTotals[c]!) / N;
      expRow.push(Math.round(e * 100) / 100);
      if (e > 0) {
        chiSq += ((observed[r]![c]! - e) ** 2) / e;
      }
    }
    expected.push(expRow);
  }

  chiSq = Math.round(chiSq * 1000) / 1000;
  const df = (R - 1) * (C - 1);
  const pValue = Math.round(chiSquareSurvival(chiSq, df) * 10000) / 10000;
  const minDim = Math.min(R - 1, C - 1);
  const cramersV =
    N > 0 && minDim > 0
      ? Math.round(Math.sqrt(chiSq / (N * minDim)) * 1000) / 1000
      : 0;

  return {
    chiSquare: chiSq,
    df,
    pValue,
    cramersV,
    significant: pValue < 0.05,
    expected,
  };
}
```

- [ ] **Step 1.3.2: Rodar tests do helper isolado**

Run:
```bash
npx vitest run tests/analytics/inferential.test.ts -t "chiSquareFromContingency"
```

Expected: 8 testes passam.

- [ ] **Step 1.3.3: Commit**

```bash
git add src/analytics/data/inferential.ts tests/analytics/inferential.test.ts
~/.claude/scripts/commit.sh "feat(inferential): extrai chiSquareFromContingency puro generico"
```

---

### Task 1.4: Refatorar `calculateChiSquare` pra delegar

**Files:**
- Modify: `src/analytics/data/inferential.ts`

Substituir o cálculo numérico inline em `calculateChiSquare` por chamada a `chiSquareFromContingency`. Resultado deve ser bit-idêntico (regression locks da Task 1.1 protegem).

- [ ] **Step 1.4.1: Substituir bloco de cálculo (linhas ~80-101 do arquivo atual)**

Localizar o bloco:

```typescript
const observed: number[][] = [];
const expected: number[][] = [];
for (let k = 0; k < K; k++) {
  observed.push([present[k], markersPerCat[k] - present[k]]);
}

const colSum0 = present.reduce((a: number, b: number) => a + b, 0);
const colSum1 = N - colSum0;

let chiSq = 0;
for (let k = 0; k < K; k++) {
  const e0 = (markersPerCat[k] * colSum0) / N;
  const e1 = (markersPerCat[k] * colSum1) / N;
  expected.push([Math.round(e0 * 100) / 100, Math.round(e1 * 100) / 100]);
  if (e0 > 0) chiSq += ((observed[k]![0]! - e0) ** 2) / e0;
  if (e1 > 0) chiSq += ((observed[k]![1]! - e1) ** 2) / e1;
}

chiSq = Math.round(chiSq * 1000) / 1000;
const df = K - 1;
const pValue = Math.round(chiSquareSurvival(chiSq, df) * 10000) / 10000;
const cramersV = N > 0 ? Math.round(Math.sqrt(chiSq / N) * 1000) / 1000 : 0;
```

E substituir por:

```typescript
const observed: number[][] = [];
for (let k = 0; k < K; k++) {
  observed.push([present[k], markersPerCat[k] - present[k]]);
}

const stats = chiSquareFromContingency(observed);
```

E na construção do `entries.push(...)`, trocar os campos pra usar `stats.*`:

```typescript
entries.push({
  code: def?.name ?? codeId,
  color: def?.color ?? "#6200EE",
  chiSquare: stats.chiSquare,
  df: stats.df,
  pValue: stats.pValue,
  cramersV: stats.cramersV,
  significant: stats.significant,
  observed,
  expected: stats.expected,
});
```

> **Nota sobre Cramér's V (2×K caso):** o helper usa `min(R-1, C-1)` pra normalização. No caso 2×K transposto (R=K, C=2), `min(K-1, 1) = 1` quando K≥2, então `sqrt(chi²/N)` original é equivalente. Os regression tests da Task 1.1 vão pegar qualquer drift.

- [ ] **Step 1.4.2: Rodar regression locks**

Run:
```bash
npx vitest run tests/analytics/inferential.test.ts -t "regression locks"
```

Expected: 2 testes passam (outputs bit-idênticos).

- [ ] **Step 1.4.3: Rodar suite inteira de inferential**

Run:
```bash
npx vitest run tests/analytics/inferential.test.ts
```

Expected: TODOS os testes passam (incluindo os pré-existentes anteriores ao plano).

- [ ] **Step 1.4.4: Commit**

```bash
git add src/analytics/data/inferential.ts
~/.claude/scripts/commit.sh "refactor(inferential): calculateChiSquare delega pra chiSquareFromContingency"
```

---

### Task 1.5: Smoke test no vault (chi-square mode)

**Files:** —

Smoke checkpoint **obrigatório** (lição cara: testes verdes ≠ feature funciona).

- [ ] **Step 1.5.1: Build production**

Run:
```bash
npm run build
```

Expected: build OK, `main.js` gerado na raiz.

- [ ] **Step 1.5.2: Recarregar plugin no Obsidian**

No vault `obsidian-plugins-workbench`:
- Settings → Community plugins → Qualia Coding → toggle off/on
- Ou Cmd+P → "Reload app without saving"

- [ ] **Step 1.5.3: Validar chi-square mode**

- Abrir Analytics
- View Mode = "Chi-Square"
- Group by = Source (default)
- Conferir: lista de códigos aparece com χ², df, p, V — IDÊNTICA à versão pré-refactor (memorize visualmente algumas linhas antes do refactor; comparar)
- Trocar Group by pra File — idem
- Sort por p ascending → códigos significativos no topo

Expected: nada visualmente diferente. Se algo divergir, revertir o refactor (`git revert HEAD`) e investigar antes de prosseguir.

- [ ] **Step 1.5.4: Marcar Chunk 1 como concluído**

Não há commit aqui — só validação visual. Próximo chunk só começa se o smoke passou.

---

## Chunk 2: Binning + calculateCodeMetadata

> **Objetivo do chunk:** helpers puros (`binNumeric`, `binDate`, `explodeMultitext`) + função consolidada `calculateCodeMetadata` que reúne data + filtros + variável + registry → `CodeMetadataResult`.
>
> **Critério de sucesso:** `tests/analytics/binning.test.ts` e `tests/analytics/codeMetadata.test.ts` passam, com fixture cross-checked numérico.

### Task 2.1: Tipo `CodeMetadataResult` em `dataTypes.ts`

**Files:**
- Modify: `src/analytics/data/dataTypes.ts`

- [ ] **Step 2.1.1: Adicionar interface no fim do arquivo**

```typescript
/**
 * Per-code chi² stats. `null` quando inválido (variável multitext, ou df=0 por
 * cardinalidade da variável < 2).
 */
export interface CodeMetadataStat {
  chiSquare: number;
  df: number;
  pValue: number;
  cramersV: number;
  significant: boolean;
}

export interface CodeMetadataResult {
  codes: Array<{ id: string; name: string; color: string }>;
  /** Categorias finais (binadas se number/date; "(missing)" no fim opcional). */
  values: string[];
  /** Matrix [code × value] = contagem. */
  matrix: number[][];
  /** Por código. */
  rowTotals: number[];
  /** Por valor. */
  colTotals: number[];
  grandTotal: number;
  hasMissingColumn: boolean;
  /** Tipo da variável usado pra decidir binning/explosão. */
  variableType: "text" | "multitext" | "number" | "checkbox" | "date" | "datetime";
  /** True quando `variableType === 'multitext'` — chi² inválido por sobreposição de categorias. */
  isMultitext: boolean;
  /** Por código. null se isMultitext, ou df=0. */
  stats: Array<CodeMetadataStat | null>;
}
```

- [ ] **Step 2.1.2: Validar tipos**

Run:
```bash
npx tsc --noEmit
```

Expected: sem erro.

- [ ] **Step 2.1.3: Commit**

```bash
git add src/analytics/data/dataTypes.ts
~/.claude/scripts/commit.sh "feat(types): adiciona CodeMetadataResult"
```

---

### Task 2.2: Testes de `binning.ts` (failing)

**Files:**
- Create: `tests/analytics/binning.test.ts`

- [ ] **Step 2.2.1: Criar arquivo de testes**

```typescript
import { describe, it, expect } from 'vitest';
import { binNumeric, binDate, explodeMultitext } from '../../src/analytics/data/binning';

describe('binNumeric', () => {
  it('uses quartiles for ≥5 unique values', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { bins, assign } = binNumeric(values);
    expect(bins).toHaveLength(4); // 4 quartile bins
    expect(assign(1)).toBe(bins[0]);
    expect(assign(10)).toBe(bins[3]);
  });

  it('returns categorical labels for ≤4 unique values', () => {
    const values = [1, 2, 3, 1];
    const { bins, assign } = binNumeric(values);
    expect(bins).toEqual(['1', '2', '3']);
    expect(assign(1)).toBe('1');
    expect(assign(3)).toBe('3');
  });

  it('returns single bin when all values identical', () => {
    const values = [5, 5, 5, 5];
    const { bins, assign } = binNumeric(values);
    expect(bins).toHaveLength(1);
    expect(assign(5)).toBe(bins[0]);
  });

  it('returns empty bins for empty input', () => {
    const { bins } = binNumeric([]);
    expect(bins).toEqual([]);
  });

  it('skips NaN/Infinity in unique-value counting', () => {
    const values = [1, 2, NaN, Infinity, 3];
    const { bins } = binNumeric(values.filter(v => Number.isFinite(v)));
    expect(bins).toHaveLength(3);
  });
});

describe('binDate', () => {
  it('uses year granularity when range > 2 years', () => {
    const values = [
      new Date('2020-01-01'),
      new Date('2022-06-15'),
      new Date('2023-12-31'),
    ];
    const { bins, assign } = binDate(values);
    expect(bins).toEqual(expect.arrayContaining(['2020', '2022', '2023']));
    expect(assign(new Date('2021-05-01'))).toBe('2021');
  });

  it('uses month granularity when range between 1 month and 2 years', () => {
    const values = [
      new Date('2024-01-15'),
      new Date('2024-03-20'),
      new Date('2024-06-10'),
    ];
    const { bins, assign } = binDate(values);
    expect(bins).toEqual(expect.arrayContaining(['2024-01', '2024-03', '2024-06']));
    expect(assign(new Date('2024-02-15'))).toBe('2024-02');
  });

  it('uses day granularity when range < 1 month', () => {
    const values = [
      new Date('2024-03-01'),
      new Date('2024-03-10'),
      new Date('2024-03-20'),
    ];
    const { bins, assign } = binDate(values);
    expect(bins).toEqual(expect.arrayContaining(['2024-03-01', '2024-03-10', '2024-03-20']));
    expect(assign(new Date('2024-03-15'))).toBe('2024-03-15');
  });

  it('returns empty bins for empty input', () => {
    const { bins } = binDate([]);
    expect(bins).toEqual([]);
  });

  it('handles single-date input (range = 0)', () => {
    const { bins, assign } = binDate([new Date('2024-05-10')]);
    expect(bins).toHaveLength(1);
    expect(assign(new Date('2024-05-10'))).toBe(bins[0]);
  });
});

describe('explodeMultitext', () => {
  it('returns array of strings for multitext value', () => {
    expect(explodeMultitext(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns single-element array for non-array string value', () => {
    expect(explodeMultitext('foo')).toEqual(['foo']);
  });

  it('returns single-element array for number value (stringified)', () => {
    expect(explodeMultitext(42)).toEqual(['42']);
  });

  it('returns single-element array for boolean value', () => {
    expect(explodeMultitext(true)).toEqual(['true']);
  });

  it('returns empty array for null/undefined/empty array', () => {
    expect(explodeMultitext(null)).toEqual([]);
    expect(explodeMultitext(undefined)).toEqual([]);
    expect(explodeMultitext([])).toEqual([]);
  });

  it('skips empty strings inside array', () => {
    expect(explodeMultitext(['a', '', 'b', ''])).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2.2.2: Rodar pra confirmar falha**

Run:
```bash
npx vitest run tests/analytics/binning.test.ts
```

Expected: FAIL — `Cannot find module '../../src/analytics/data/binning'`.

---

### Task 2.3: Implementar `binning.ts`

**Files:**
- Create: `src/analytics/data/binning.ts`

- [ ] **Step 2.3.1: Criar arquivo**

```typescript
import type { VariableValue } from "../../core/caseVariables/caseVariablesTypes";

const MS_DAY = 86_400_000;
const MS_MONTH = 30 * MS_DAY;
const MS_YEAR = 365 * MS_DAY;

/** Quartile-based binning for numeric values. ≤4 uniques → categorical literal. */
export function binNumeric(values: number[]): {
  bins: string[];
  assign: (v: number) => string;
} {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return { bins: [], assign: () => "" };
  }

  const unique = Array.from(new Set(finite)).sort((a, b) => a - b);

  if (unique.length === 1) {
    const label = formatNumber(unique[0]!);
    return { bins: [label], assign: () => label };
  }

  if (unique.length <= 4) {
    const bins = unique.map(formatNumber);
    return {
      bins,
      assign: (v: number) => formatNumber(v),
    };
  }

  // Quartile binning
  const sorted = [...finite].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo]!;
    const frac = idx - lo;
    return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
  };
  const min = sorted[0]!;
  const q1 = q(0.25);
  const q2 = q(0.5);
  const q3 = q(0.75);
  const max = sorted[sorted.length - 1]!;

  const bins = [
    `[${formatNumber(min)}–${formatNumber(q1)}]`,
    `(${formatNumber(q1)}–${formatNumber(q2)}]`,
    `(${formatNumber(q2)}–${formatNumber(q3)}]`,
    `(${formatNumber(q3)}–${formatNumber(max)}]`,
  ];

  return {
    bins,
    assign: (v: number) => {
      if (v <= q1) return bins[0]!;
      if (v <= q2) return bins[1]!;
      if (v <= q3) return bins[2]!;
      return bins[3]!;
    },
  };
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Auto-granularity binning for dates. Range >2y → year, 1mo–2y → month, <1mo → day. */
export function binDate(values: Date[]): {
  bins: string[];
  assign: (v: Date) => string;
} {
  if (values.length === 0) {
    return { bins: [], assign: () => "" };
  }

  const times = values.map((d) => d.getTime()).sort((a, b) => a - b);
  const range = times[times.length - 1]! - times[0]!;
  const granularity: "year" | "month" | "day" =
    range > 2 * MS_YEAR ? "year" : range >= MS_MONTH ? "month" : "day";

  const formatDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    if (granularity === "year") return String(y);
    if (granularity === "month") return `${y}-${m}`;
    return `${y}-${m}-${dd}`;
  };

  const binSet = new Set<string>();
  for (const d of values) binSet.add(formatDate(d));
  const bins = Array.from(binSet).sort();

  return { bins, assign: formatDate };
}

/** Convert any VariableValue into a list of category labels. Multitext → multiple. */
export function explodeMultitext(value: VariableValue | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v).trim())
      .filter((s) => s.length > 0);
  }
  const s = String(value).trim();
  return s.length > 0 ? [s] : [];
}
```

- [ ] **Step 2.3.2: Rodar testes**

Run:
```bash
npx vitest run tests/analytics/binning.test.ts
```

Expected: 16 testes passam.

- [ ] **Step 2.3.3: Commit**

```bash
git add src/analytics/data/binning.ts tests/analytics/binning.test.ts
~/.claude/scripts/commit.sh "feat(analytics): helpers puros de binning para Code x Metadata"
```

---

### Task 2.4: Testes de `calculateCodeMetadata` (failing)

**Files:**
- Create: `tests/analytics/codeMetadata.test.ts`

> **Sobre o `registry` mock:** os testes precisam de um stub de `CaseVariablesRegistry`. Em vez de instanciar o real (que tem dependências de `app`/`metadataCache`), criamos um mock minimal com a API que `calculateCodeMetadata` usa: `getType`, `getValuesForVariable`, `getVariables`.

- [ ] **Step 2.4.1: Criar arquivo de testes**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateCodeMetadata } from '../../src/analytics/data/codeMetadata';
import type { ConsolidatedData, FilterConfig, UnifiedMarker, UnifiedCode, SourceType } from '../../src/analytics/data/dataTypes';
import type { CaseVariablesRegistry } from '../../src/core/caseVariables/caseVariablesRegistry';
import type { PropertyType, VariableValue } from '../../src/core/caseVariables/caseVariablesTypes';

function filters(overrides: Partial<FilterConfig> = {}): FilterConfig {
  return {
    sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
    codes: [],
    excludeCodes: [],
    minFrequency: 1,
    ...overrides,
  };
}

function mkMarker(id: string, source: SourceType, fileId: string, codes: string[]): UnifiedMarker {
  return { id, source, fileId, codes };
}

function mkCode(name: string, color = '#6200EE'): UnifiedCode {
  return { id: name, name, color, sources: ['markdown'] };
}

function mkData(markers: UnifiedMarker[], codes: UnifiedCode[]): ConsolidatedData {
  return {
    markers,
    codes,
    sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false },
    lastUpdated: Date.now(),
  };
}

/** Mock minimal of CaseVariablesRegistry — apenas a API consumida por calculateCodeMetadata. */
function mkRegistry(
  type: PropertyType,
  fileVars: Record<string, Record<string, VariableValue>>,
): CaseVariablesRegistry {
  return {
    getType: (_name: string) => type,
    getValuesForVariable: (name: string): VariableValue[] => {
      const seen = new Set<string>();
      const out: VariableValue[] = [];
      for (const vars of Object.values(fileVars)) {
        const v = vars[name];
        if (v === undefined) continue;
        const key = JSON.stringify(v);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
      }
      return out;
    },
    getVariables: (fileId: string) => fileVars[fileId] ?? {},
  } as unknown as CaseVariablesRegistry;
}

describe('calculateCodeMetadata', () => {
  it('builds matrix for text variable (3 values × 2 codes)', () => {
    const data = mkData([
      mkMarker('1', 'markdown', 'f1', ['a']),
      mkMarker('2', 'markdown', 'f1', ['a']),
      mkMarker('3', 'markdown', 'f2', ['a']),
      mkMarker('4', 'markdown', 'f3', ['b']),
      mkMarker('5', 'markdown', 'f3', ['b']),
    ], [mkCode('a'), mkCode('b')]);

    const registry = mkRegistry('text', {
      f1: { region: 'sul' },
      f2: { region: 'sudeste' },
      f3: { region: 'nordeste' },
    });

    const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: true });

    expect(result.values.sort()).toEqual(['nordeste', 'sudeste', 'sul']);
    expect(result.codes).toHaveLength(2);
    expect(result.grandTotal).toBe(5);
    expect(result.isMultitext).toBe(false);
    expect(result.hasMissingColumn).toBe(false);

    const rowA = result.codes.findIndex((c) => c.name === 'a');
    const idxSul = result.values.indexOf('sul');
    const idxNord = result.values.indexOf('nordeste');
    expect(result.matrix[rowA]![idxSul]).toBe(2); // 2 markers de 'a' em f1 (region=sul)
    expect(result.matrix[rowA]![idxNord]).toBe(0);
  });

  it('flattens multitext values into separate columns', () => {
    const data = mkData([
      mkMarker('1', 'markdown', 'f1', ['x']),
      mkMarker('2', 'markdown', 'f2', ['x']),
    ], [mkCode('x')]);

    const registry = mkRegistry('multitext', {
      f1: { tags: ['a', 'b'] },
      f2: { tags: ['b', 'c'] },
    });

    const result = calculateCodeMetadata(data, filters(), 'tags', registry, { includeMissing: false });

    // Column labels are flattened tags, not the array stringified
    expect(result.values.sort()).toEqual(['a', 'b', 'c']);
    expect(result.isMultitext).toBe(true);
    expect(result.stats[0]).toBeNull();

    // Marker 1 (f1, tags=[a,b]) contributes 1 to col 'a' and 1 to col 'b'
    // Marker 2 (f2, tags=[b,c]) contributes 1 to col 'b' and 1 to col 'c'
    const idxA = result.values.indexOf('a');
    const idxB = result.values.indexOf('b');
    const idxC = result.values.indexOf('c');
    expect(result.matrix[0]![idxA]).toBe(1);
    expect(result.matrix[0]![idxB]).toBe(2);
    expect(result.matrix[0]![idxC]).toBe(1);
  });

  it('adds (missing) column when includeMissing=true and there are markers without value', () => {
    const data = mkData([
      mkMarker('1', 'markdown', 'f1', ['a']),
      mkMarker('2', 'markdown', 'f2', ['a']), // f2 sem valor da variável
    ], [mkCode('a')]);

    const registry = mkRegistry('text', {
      f1: { region: 'sul' },
      // f2: ausente
    });

    const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: true });

    expect(result.values).toContain('(missing)');
    expect(result.hasMissingColumn).toBe(true);
    const idxMissing = result.values.indexOf('(missing)');
    expect(result.matrix[0]![idxMissing]).toBe(1);
  });

  it('excludes (missing) column when includeMissing=false', () => {
    const data = mkData([
      mkMarker('1', 'markdown', 'f1', ['a']),
      mkMarker('2', 'markdown', 'f2', ['a']),
    ], [mkCode('a')]);

    const registry = mkRegistry('text', {
      f1: { region: 'sul' },
    });

    const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: false });

    expect(result.values).not.toContain('(missing)');
    expect(result.hasMissingColumn).toBe(false);
    expect(result.grandTotal).toBe(1); // marker f2 sem valor é descartado
  });

  it('applies filters before counting', () => {
    const data = mkData([
      mkMarker('1', 'markdown', 'f1', ['a']),
      mkMarker('2', 'pdf', 'f1', ['a']), // pdf será excluído pelo filtro
    ], [mkCode('a')]);

    const registry = mkRegistry('text', {
      f1: { region: 'sul' },
    });

    const result = calculateCodeMetadata(
      data,
      filters({ sources: ['markdown'] }),
      'region',
      registry,
      { includeMissing: false },
    );

    expect(result.grandTotal).toBe(1);
  });

  it('chi² stats[i] is null when isMultitext', () => {
    const data = mkData([
      mkMarker('1', 'markdown', 'f1', ['a']),
      mkMarker('2', 'markdown', 'f2', ['a']),
    ], [mkCode('a')]);

    const registry = mkRegistry('multitext', {
      f1: { tags: ['x'] },
      f2: { tags: ['y'] },
    });

    const result = calculateCodeMetadata(data, filters(), 'tags', registry, { includeMissing: false });

    expect(result.stats[0]).toBeNull();
  });

  it('chi² stats[i] is null when only 1 column (df=0)', () => {
    const data = mkData([
      mkMarker('1', 'markdown', 'f1', ['a']),
      mkMarker('2', 'markdown', 'f2', ['a']),
    ], [mkCode('a')]);

    const registry = mkRegistry('text', {
      f1: { region: 'sul' },
      f2: { region: 'sul' }, // 1 valor único
    });

    const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: false });

    expect(result.values).toEqual(['sul']);
    expect(result.stats[0]).toBeNull();
  });

  it('numeric variable uses quartile binning', () => {
    const data = mkData(
      Array.from({ length: 8 }, (_, i) => mkMarker(`m${i}`, 'markdown', `f${i}`, ['a'])),
      [mkCode('a')],
    );

    const fileVars: Record<string, Record<string, VariableValue>> = {};
    for (let i = 0; i < 8; i++) {
      fileVars[`f${i}`] = { age: i + 1 }; // 1..8
    }

    const registry = mkRegistry('number', fileVars);
    const result = calculateCodeMetadata(data, filters(), 'age', registry, { includeMissing: false });

    // ≥5 unique → quartile bins (4 columns)
    expect(result.values).toHaveLength(4);
    expect(result.values[0]).toMatch(/\[/); // bin label format "[min-q1]"
  });

  it('chi² rounding matches contract (3 decimals)', () => {
    const data = mkData([
      mkMarker('1', 'markdown', 'f1', ['a']),
      mkMarker('2', 'markdown', 'f1', ['a']),
      mkMarker('3', 'markdown', 'f2', ['a']),
      mkMarker('4', 'markdown', 'f2', ['b']),
      mkMarker('5', 'markdown', 'f2', ['b']),
    ], [mkCode('a'), mkCode('b')]);

    const registry = mkRegistry('text', {
      f1: { region: 'sul' },
      f2: { region: 'norte' },
    });

    const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: false });

    for (const stat of result.stats) {
      if (stat == null) continue;
      // 3 decimals
      expect(stat.chiSquare).toBe(Math.round(stat.chiSquare * 1000) / 1000);
      expect(stat.cramersV).toBe(Math.round(stat.cramersV * 1000) / 1000);
      // 4 decimals
      expect(stat.pValue).toBe(Math.round(stat.pValue * 10000) / 10000);
    }
  });
});
```

- [ ] **Step 2.4.2: Confirmar falha**

Run:
```bash
npx vitest run tests/analytics/codeMetadata.test.ts
```

Expected: FAIL — módulo `codeMetadata` não existe.

---

### Task 2.5: Implementar `calculateCodeMetadata`

**Files:**
- Create: `src/analytics/data/codeMetadata.ts`

- [ ] **Step 2.5.1: Criar arquivo**

```typescript
import type { ConsolidatedData, FilterConfig, CodeMetadataResult, CodeMetadataStat } from "./dataTypes";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";
import type { VariableValue } from "../../core/caseVariables/caseVariablesTypes";
import { applyFilters } from "./statsHelpers";
import { chiSquareFromContingency } from "./inferential";
import { binNumeric, binDate, explodeMultitext } from "./binning";

const MISSING_LABEL = "(missing)";

export function calculateCodeMetadata(
  data: ConsolidatedData,
  filters: FilterConfig,
  variableName: string,
  registry: CaseVariablesRegistry,
  options: { includeMissing: boolean },
): CodeMetadataResult {
  const variableType = registry.getType(variableName);
  const isMultitext = variableType === "multitext";

  // ─── 1. Filtrar markers ───
  const allMarkers = applyFilters(data, filters, registry);

  // ─── 2. Discovery dos labels de coluna baseado no tipo da variável ───
  // Coleta valores brutos da variável existentes em todos arquivos (filtra duplicatas)
  const rawValues = registry.getValuesForVariable(variableName);

  let columnLabels: string[];
  let assignFn: (raw: VariableValue) => string[];

  if (variableType === "number") {
    const numbers: number[] = [];
    for (const v of rawValues) {
      if (typeof v === "number" && Number.isFinite(v)) numbers.push(v);
    }
    const { bins, assign } = binNumeric(numbers);
    columnLabels = bins;
    assignFn = (raw) => {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return [];
      return [assign(raw)];
    };
  } else if (variableType === "date" || variableType === "datetime") {
    const dates: Date[] = [];
    for (const v of rawValues) {
      const parsed = parseDateValue(v);
      if (parsed) dates.push(parsed);
    }
    const { bins, assign } = binDate(dates);
    columnLabels = bins;
    assignFn = (raw) => {
      const d = parseDateValue(raw);
      if (!d) return [];
      return [assign(d)];
    };
  } else if (variableType === "multitext") {
    // Flatten arrays into unique set
    const set = new Set<string>();
    for (const v of rawValues) {
      for (const piece of explodeMultitext(v)) set.add(piece);
    }
    columnLabels = Array.from(set).sort();
    assignFn = (raw) => explodeMultitext(raw);
  } else {
    // text, checkbox → categorical literal
    const set = new Set<string>();
    for (const v of rawValues) {
      const piece = String(v ?? "").trim();
      if (piece.length > 0) set.add(piece);
    }
    columnLabels = Array.from(set).sort();
    assignFn = (raw) => {
      const s = String(raw ?? "").trim();
      return s.length > 0 ? [s] : [];
    };
  }

  // ─── 3. Reservar coluna (missing) se houver markers sem valor ───
  let hasMissingColumn = false;
  if (options.includeMissing) {
    for (const m of allMarkers) {
      const vars = registry.getVariables(m.fileId);
      const v = vars[variableName];
      if (v === undefined || v === null) {
        hasMissingColumn = true;
        break;
      }
      // multitext: ainda conta como missing se array vazio
      if (Array.isArray(v) && v.length === 0) {
        hasMissingColumn = true;
        break;
      }
    }
  }

  const values = hasMissingColumn ? [...columnLabels, MISSING_LABEL] : [...columnLabels];
  const valueIndex = new Map(values.map((v, i) => [v, i] as const));

  // ─── 4. Agregar códigos visíveis ───
  const codeById = new Map(data.codes.map((c) => [c.id, c]));

  // Coleta codeIds que aparecem nos markers filtrados (e respeitam filters.codes/minFrequency)
  const codeFreq = new Map<string, number>();
  for (const m of allMarkers) {
    for (const codeId of m.codes) {
      if (filters.excludeCodes.includes(codeId)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(codeId)) continue;
      codeFreq.set(codeId, (codeFreq.get(codeId) ?? 0) + 1);
    }
  }

  const visibleCodeIds: string[] = [];
  for (const [id, freq] of codeFreq) {
    if (freq < filters.minFrequency) continue;
    visibleCodeIds.push(id);
  }
  visibleCodeIds.sort((a, b) => {
    const na = codeById.get(a)?.name ?? a;
    const nb = codeById.get(b)?.name ?? b;
    return na.localeCompare(nb);
  });

  // ─── 5. Construir matriz [code × value] ───
  const codes = visibleCodeIds.map((id) => {
    const def = codeById.get(id);
    return { id, name: def?.name ?? id, color: def?.color ?? "#6200EE" };
  });
  const codeIndex = new Map(visibleCodeIds.map((id, i) => [id, i] as const));

  const R = codes.length;
  const C = values.length;
  const matrix: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));

  if (R > 0 && C > 0) {
    for (const m of allMarkers) {
      const vars = registry.getVariables(m.fileId);
      const raw = vars[variableName];
      let cols = assignFn(raw as VariableValue);
      if (cols.length === 0) {
        if (!hasMissingColumn) continue;
        cols = [MISSING_LABEL];
      }
      for (const codeId of m.codes) {
        const r = codeIndex.get(codeId);
        if (r === undefined) continue;
        for (const colLabel of cols) {
          const c = valueIndex.get(colLabel);
          if (c === undefined) continue;
          matrix[r]![c]!++;
        }
      }
    }
  }

  // ─── 6. Totais ───
  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = new Array(C).fill(0);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      colTotals[c] += matrix[r]![c]!;
    }
  }
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

  // ─── 7. Stats por código ───
  const stats: Array<CodeMetadataStat | null> = codes.map((_, r) => {
    if (isMultitext) return null;
    if (C < 2) return null;
    if (rowTotals[r] === 0) return null;
    // Tabela 2×C: linha 0 = presente (matrix[r]), linha 1 = ausente (colTotals - matrix[r])
    const present = matrix[r]!;
    const absent = colTotals.map((t, c) => t - present[c]!);
    const observed = [present, absent];
    const result = chiSquareFromContingency(observed);
    if (result.df === 0) return null;
    return {
      chiSquare: result.chiSquare,
      df: result.df,
      pValue: result.pValue,
      cramersV: result.cramersV,
      significant: result.significant,
    };
  });

  return {
    codes,
    values,
    matrix,
    rowTotals,
    colTotals,
    grandTotal,
    hasMissingColumn,
    variableType,
    isMultitext,
    stats,
  };
}

function parseDateValue(v: VariableValue | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
```

- [ ] **Step 2.5.2: Rodar testes**

Run:
```bash
npx vitest run tests/analytics/codeMetadata.test.ts
```

Expected: 9 testes passam.

- [ ] **Step 2.5.3: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: sem erro.

- [ ] **Step 2.5.4: Re-export em statsEngine**

Modificar `src/analytics/data/statsEngine.ts` adicionando no fim:

```typescript
export { calculateCodeMetadata } from "./codeMetadata";
export { chiSquareFromContingency } from "./inferential";
```

- [ ] **Step 2.5.5: Type check final**

Run:
```bash
npx tsc --noEmit
```

Expected: sem erro.

- [ ] **Step 2.5.6: Commit**

```bash
git add src/analytics/data/codeMetadata.ts src/analytics/data/statsEngine.ts tests/analytics/codeMetadata.test.ts
~/.claude/scripts/commit.sh "feat(analytics): calculateCodeMetadata pura com matriz e chi2 por codigo"
```

---

## Chunk 3: Mode + heatmap + render options

> **Objetivo do chunk:** registrar `'code-metadata'` como modo, persistir 4 estados de UI, renderizar heatmap canvas + coluna lateral chi².
>
> **Critério de sucesso:** mode aparece no dropdown, dropdown de variável funciona, heatmap renderiza (a contagem está correta), toggle de display unit muda células, smoke test no vault passa.
>
> **Por que separado do polish:** primeiro garante que a forma básica funciona antes de empty states / banner / tooltip / CSV.

### Task 3.1: Estender `ViewMode` e estado em `analyticsViewContext.ts`

**Files:**
- Modify: `src/analytics/views/analyticsViewContext.ts`

- [ ] **Step 3.1.1: Adicionar literal `'code-metadata'` no union `ViewMode`**

Localizar a linha 10 atual:

```typescript
export type ViewMode = "dashboard" | "frequency" | ... | "relations-network";
```

E adicionar `"code-metadata"`:

```typescript
export type ViewMode = "dashboard" | "frequency" | "cooccurrence" | "graph" | "doc-matrix" | "evolution" | "text-retrieval" | "word-cloud" | "acm" | "mds" | "temporal" | "text-stats" | "dendrogram" | "lag-sequential" | "polar-coords" | "chi-square" | "decision-tree" | "source-comparison" | "code-overlap" | "relations-network" | "code-metadata";
```

- [ ] **Step 3.1.2: Adicionar tipo de display alias**

Antes da `interface AnalyticsViewContext`, adicionar:

```typescript
export type CodeMetadataDisplay = "count" | "pct-row" | "pct-col";
export type CodeMetadataSortCol = "total" | "name" | "chi2" | "p";
```

- [ ] **Step 3.1.3: Adicionar 4 campos no interface `AnalyticsViewContext`**

Logo depois da seção `// Source Comparison state`, adicionar:

```typescript
  // Code × Metadata state
  cmVariable: string | null;
  cmDisplay: CodeMetadataDisplay;
  cmHideMissing: boolean;
  cmSort: { col: CodeMetadataSortCol; asc: boolean };
```

- [ ] **Step 3.1.4: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: erros previsíveis em `analyticsView.ts` (campos não inicializados). Próxima task resolve.

- [ ] **Step 3.1.5: Commit parcial**

```bash
git add src/analytics/views/analyticsViewContext.ts
~/.claude/scripts/commit.sh "feat(analytics): adiciona ViewMode code-metadata e estado cm*"
```

---

### Task 3.2: Inicializar estado em `analyticsView.ts`

**Files:**
- Modify: `src/analytics/views/analyticsView.ts`

> **IMPORTANTE — sem persistência.** Nenhum modo de Analytics persiste UI state em `data.json`. Os campos `chiGroupBy`, `chiSort`, `srcCompSort` etc. são plain instance fields com defaults hardcoded que resetam quando a view é reaberta. Code × Metadata segue o mesmo pattern: 4 campos novos, sem `loadState`/`saveState`.

- [ ] **Step 3.2.1: Adicionar 4 plain instance fields**

Abrir `src/analytics/views/analyticsView.ts`. Buscar a declaração de `chiGroupBy` (perto da linha 65–80, na seção de instance fields da classe `AnalyticsView`). Adicionar logo abaixo, agrupados:

```typescript
  // Code × Metadata state
  cmVariable: string | null = null;
  cmDisplay: "count" | "pct-row" | "pct-col" = "count";
  cmHideMissing = false;
  cmSort: { col: "total" | "name" | "chi2" | "p"; asc: boolean } = { col: "total", asc: false };
```

> Confirme antes: abrir o arquivo e procurar como `chiGroupBy: "source" | "file" = "source";` foi declarado. Replicar EXATAMENTE esse pattern (declaração + tipo inline + default).

- [ ] **Step 3.2.2: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: sem erros. Se houver erro de "field not found in AnalyticsViewContext", confirme que a Task 3.1 foi commitada e os 4 campos foram adicionados ao interface.

- [ ] **Step 3.2.3: Commit**

```bash
git add src/analytics/views/analyticsView.ts
~/.claude/scripts/commit.sh "feat(analytics): instance fields para Code x Metadata (sem persistencia)"
```

---

### Task 3.3: Esqueleto de `codeMetadataMode.ts`

**Files:**
- Create: `src/analytics/views/modes/codeMetadataMode.ts`

> **Estratégia:** criar exports vazios primeiro pra registrar o mode e ver "Code × Metadata" no dropdown. Depois preencher render.

- [ ] **Step 3.3.1: Criar arquivo com stubs**

```typescript
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig } from "../../data/dataTypes";

export function renderCodeMetadataView(ctx: AnalyticsViewContext, _filters: FilterConfig): void {
  const container = ctx.chartContainer;
  if (!container) return;
  container.empty();
  container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
    text: "Code × Metadata — render WIP",
  });
}

export function renderCodeMetadataOptionsSection(ctx: AnalyticsViewContext): void {
  const section = ctx.configPanelEl?.createDiv({ cls: "codemarker-config-section" });
  if (!section) return;
  section.createDiv({ cls: "codemarker-config-section-title", text: "Code × Metadata" });
  section.createDiv({ text: "Options WIP" });
}

export function exportCodeMetadataCSV(_ctx: AnalyticsViewContext, _date: string): void {
  // WIP — implementado no Chunk 4
}
```

- [ ] **Step 3.3.2: Registrar no `modeRegistry.ts`**

Em `src/analytics/views/modes/modeRegistry.ts`:

```typescript
import { renderCodeMetadataView, renderCodeMetadataOptionsSection, exportCodeMetadataCSV } from "./codeMetadataMode";
```

E no objeto `MODE_REGISTRY`:

```typescript
  "code-metadata": {
    label: "Code × Metadata",
    render: renderCodeMetadataView,
    renderOptions: renderCodeMetadataOptionsSection,
    exportCSV: exportCodeMetadataCSV,
  },
```

- [ ] **Step 3.3.3: Build + smoke test mínimo**

Run:
```bash
npm run build
```

Expected: build OK.

No vault Obsidian, recarregar plugin, abrir Analytics, abrir dropdown View Mode → conferir que "Code × Metadata" aparece. Selecionar → deve mostrar mensagem "render WIP".

- [ ] **Step 3.3.4: Commit**

```bash
git add src/analytics/views/modes/codeMetadataMode.ts src/analytics/views/modes/modeRegistry.ts
~/.claude/scripts/commit.sh "feat(analytics): registra modo code-metadata com stub"
```

---

### Task 3.4: Render options panel

**Files:**
- Modify: `src/analytics/views/modes/codeMetadataMode.ts`

> **Pattern de UI:** copiar estrutura de `chiSquareMode.ts` (radio groups) e `frequencyMode.ts` (sort sections).

- [ ] **Step 3.4.1: Implementar `renderCodeMetadataOptionsSection` completo**

Substituir o stub por:

```typescript
export function renderCodeMetadataOptionsSection(ctx: AnalyticsViewContext): void {
  const panel = ctx.configPanelEl;
  if (!panel) return;
  const section = panel.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Code × Metadata" });

  // ─── Variable dropdown ───
  const registry = ctx.plugin.caseVariablesRegistry;
  const allNames = registry.getAllVariableNames();
  const validNames = allNames.filter((n) => registry.getValuesForVariable(n).length > 0);

  const varRow = section.createDiv({ cls: "codemarker-config-row" });
  varRow.createDiv({ cls: "codemarker-config-sublabel", text: "Variable" });
  const varSelect = varRow.createEl("select");
  varSelect.createEl("option", { value: "", text: "— Select —" });
  for (const name of validNames) {
    const opt = varSelect.createEl("option", { value: name, text: name });
    if (ctx.cmVariable === name) opt.selected = true;
  }
  varSelect.addEventListener("change", () => {
    ctx.cmVariable = varSelect.value || null;
    ctx.scheduleUpdate();
  });

  // ─── Display radios ───
  section.createDiv({ cls: "codemarker-config-sublabel", text: "Display" });
  for (const [val, label] of [
    ["count", "Count"],
    ["pct-row", "% by row (code)"],
    ["pct-col", "% by column (value)"],
  ] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "cmDisplay";
    radio.value = val;
    radio.checked = ctx.cmDisplay === val;
    row.createSpan({ text: label });
    const setDisplay = () => {
      ctx.cmDisplay = val;
      ctx.scheduleUpdate();
    };
    radio.addEventListener("change", setDisplay);
    // Pattern docMatrixMode: row inteira clicável (não só o círculo do radio)
    row.addEventListener("click", (ev) => {
      if (ev.target !== radio) {
        radio.checked = true;
        setDisplay();
      }
    });
  }

  // ─── Hide missing checkbox ───
  const missingRow = section.createDiv({ cls: "codemarker-config-row" });
  const missingCheck = missingRow.createEl("input", { type: "checkbox" });
  missingCheck.checked = ctx.cmHideMissing;
  missingRow.createSpan({ text: "Hide (missing) column" });
  const setMissing = () => {
    ctx.cmHideMissing = missingCheck.checked;
    ctx.scheduleUpdate();
  };
  missingCheck.addEventListener("change", setMissing);
  missingRow.addEventListener("click", (ev) => {
    if (ev.target !== missingCheck) {
      missingCheck.checked = !missingCheck.checked;
      setMissing();
    }
  });
}
```

- [ ] **Step 3.4.2: Build + smoke**

Run:
```bash
npm run build
```

Recarregar plugin → Analytics → "Code × Metadata" → conferir:
- Dropdown lista nomes de variáveis (no vault workbench tem case variables setadas)
- Radio buttons trocam estado
- Checkbox toggle

Mensagem do render ainda é "WIP" — corrigido na próxima task.

- [ ] **Step 3.4.3: Commit**

```bash
git add src/analytics/views/modes/codeMetadataMode.ts
~/.claude/scripts/commit.sh "feat(analytics): code-metadata options panel (variable, display, hide missing)"
```

---

### Task 3.5: Render heatmap canvas

**Files:**
- Modify: `src/analytics/views/modes/codeMetadataMode.ts`

> **Pattern:** seguir `docMatrixMode.ts` (heatmap canvas 2D + heatmapColor).

- [ ] **Step 3.5.1: Implementar `renderCodeMetadataView` completo (sem ainda os empty states refinados — placeholder simples)**

Substituir o stub por:

```typescript
import { calculateCodeMetadata } from "../../data/statsEngine";
import { heatmapColor, isLightColor } from "../shared/chartHelpers";

export function renderCodeMetadataView(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  const container = ctx.chartContainer;
  if (!container) return;
  container.empty();

  const registry = ctx.plugin.caseVariablesRegistry;
  const variableName = ctx.cmVariable;

  // Empty: nenhuma variável escolhida
  if (!variableName) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "Select a Case Variable in the options panel to see the heatmap.",
    });
    return;
  }

  if (!ctx.data) return;
  const result = calculateCodeMetadata(ctx.data, filters, variableName, registry, {
    includeMissing: !ctx.cmHideMissing,
  });

  if (result.codes.length === 0 || result.values.length === 0) {
    container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No data for this variable after filters.",
    });
    return;
  }

  drawHeatmap(container, ctx, result);
}

function drawHeatmap(
  container: HTMLElement,
  ctx: AnalyticsViewContext,
  result: ReturnType<typeof calculateCodeMetadata>,
): void {
  const wrapper = container.createDiv({ cls: "codemarker-cm-wrapper" });

  const cellSize = 36;
  const labelColWidth = 200;
  const statsColWidth = 140;
  const headerHeight = 80;
  const padding = 8;

  const R = result.codes.length;
  const C = result.values.length;
  const canvasWidth = labelColWidth + C * cellSize + statsColWidth + padding * 2;
  const canvasHeight = headerHeight + R * cellSize + padding * 2;

  // Pattern docMatrixMode: sem DPR scaling; canvas size raw, sem .scale()
  const canvas = wrapper.createEl("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  const cctx = canvas.getContext("2d")!;
  cctx.font = "12px sans-serif";
  cctx.textBaseline = "middle";

  const isDark = document.body.classList.contains("theme-dark");

  // ─── Compute display values per cell ───
  const displayValues = computeDisplayMatrix(result, ctx.cmDisplay);
  const maxValue = Math.max(...displayValues.flat(), 0);

  // ─── Header (column labels — rotacionados) ───
  cctx.save();
  cctx.fillStyle = "var(--text-normal)";
  cctx.textAlign = "left";
  for (let c = 0; c < C; c++) {
    const x = labelColWidth + c * cellSize + cellSize / 2 + padding;
    const y = headerHeight - 6 + padding;
    cctx.save();
    cctx.translate(x, y);
    cctx.rotate(-Math.PI / 4);
    cctx.fillText(truncateLabel(result.values[c]!, 14), 0, 0);
    cctx.restore();
  }
  cctx.restore();

  // ─── Code labels (left column) ───
  cctx.textAlign = "left";
  for (let r = 0; r < R; r++) {
    const code = result.codes[r]!;
    const y = headerHeight + r * cellSize + cellSize / 2 + padding;
    cctx.fillStyle = code.color;
    cctx.fillRect(padding, y - 6, 12, 12);
    cctx.fillStyle = "var(--text-normal)";
    cctx.fillText(truncateLabel(code.name, 22), padding + 18, y);
  }

  // ─── Cells ───
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const value = displayValues[r]![c]!;
      const x = labelColWidth + c * cellSize + padding;
      const y = headerHeight + r * cellSize + padding;
      const cellColor = heatmapColor(value, maxValue, isDark);
      cctx.fillStyle = cellColor;
      cctx.fillRect(x, y, cellSize - 1, cellSize - 1);
      // text
      if (value > 0) {
        cctx.fillStyle = isLightColor(cellColor) ? "#222" : "#fff";
        cctx.textAlign = "center";
        cctx.fillText(formatCellValue(value, ctx.cmDisplay), x + cellSize / 2, y + cellSize / 2);
      }
    }
  }

  // ─── Stats column ───
  const statsX = labelColWidth + C * cellSize + padding;
  cctx.textAlign = "left";
  cctx.fillStyle = "var(--text-muted)";
  cctx.fillText("χ² · p", statsX, headerHeight - 6 + padding);

  for (let r = 0; r < R; r++) {
    const stat = result.stats[r];
    const y = headerHeight + r * cellSize + cellSize / 2 + padding;
    if (stat == null) {
      cctx.fillStyle = "var(--text-muted)";
      cctx.fillText("—", statsX, y);
    } else {
      const chiText = stat.chiSquare.toFixed(2);
      const pText = stat.pValue.toFixed(4);
      const sigMark = stat.significant ? "*" : "";
      cctx.fillStyle = "var(--text-normal)";
      cctx.fillText(`χ²=${chiText} · p=${pText}${sigMark}`, statsX, y);
    }
  }
}

function computeDisplayMatrix(
  result: ReturnType<typeof calculateCodeMetadata>,
  display: AnalyticsViewContext["cmDisplay"],
): number[][] {
  const R = result.codes.length;
  const C = result.values.length;
  const out: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const raw = result.matrix[r]![c]!;
      if (display === "count") {
        out[r]![c] = raw;
      } else if (display === "pct-row") {
        const tot = result.rowTotals[r]!;
        out[r]![c] = tot > 0 ? raw / tot : 0;
      } else if (display === "pct-col") {
        const tot = result.colTotals[c]!;
        out[r]![c] = tot > 0 ? raw / tot : 0;
      }
    }
  }
  return out;
}

function formatCellValue(v: number, display: AnalyticsViewContext["cmDisplay"]): string {
  if (display === "count") return String(v);
  return `${(v * 100).toFixed(0)}%`;
}

function truncateLabel(s: string, maxChars: number): string {
  return s.length <= maxChars ? s : s.slice(0, maxChars - 1) + "…";
}
```

- [ ] **Step 3.5.2: Build + smoke**

Run:
```bash
npm run build
```

Recarregar plugin no vault. Abrir Analytics → Code × Metadata. Selecionar uma variável `text` (ex: "region" ou similar configurada no workbench). Conferir:
- Heatmap renderiza com células coloridas
- Códigos com markers aparecem como linhas
- Valores da variável aparecem como colunas (rotacionados 45°)
- Coluna `χ² · p` à direita mostra estatística ou `—`
- Toggle Count → % row → % col atualiza células

- [ ] **Step 3.5.3: Commit**

```bash
git add src/analytics/views/modes/codeMetadataMode.ts
~/.claude/scripts/commit.sh "feat(analytics): heatmap canvas para Code x Metadata com coluna chi2/p"
```

---

### Task 3.6: Smoke test extenso (ver Chunk 4 polish)

**Files:** —

- [ ] **Step 3.6.1: Validar tipos no vault workbench**

No vault, criar (ou já existir) Case Variables variadas:
- `region` (text) com valores diferentes em arquivos diferentes
- `age` (number) com valores variados
- `tags` (multitext) com `["a", "b"]` em alguns arquivos
- `interview_date` (date)

Selecionar cada uma e conferir que:
- text → heatmap normal, χ² populado
- number → bins quartis
- multitext → χ² mostra `—`
- date → granularidade auto

- [ ] **Step 3.6.2: Não commitar — apenas validar**

Se algo divergir, voltar e ajustar antes do Chunk 4.

---

## Chunk 4: Polish + CSV export

> **Objetivo do chunk:** empty states refinados, banner de filtro = dimensão, sort interaction, tooltip de hover, CSV export, reload suite de smoke test.
>
> **Critério de sucesso:** spec inteira coberta. Pronto pra release.

### Task 4.1: Empty states refinados

**Files:**
- Modify: `src/analytics/views/modes/codeMetadataMode.ts`

- [ ] **Step 4.1.1: Substituir condicionais simples por empty states alinhados à spec**

No início de `renderCodeMetadataView`, antes de `calculateCodeMetadata`, substituir os early-returns por:

```typescript
const registry = ctx.plugin.caseVariablesRegistry;
const allVarNames = registry.getAllVariableNames();
const validNames = allVarNames.filter((n) => registry.getValuesForVariable(n).length > 0);

if (allVarNames.length === 0) {
  container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
    text: "No Case Variables defined. Add them in the side panel to use this view.",
  });
  return;
}

const variableName = ctx.cmVariable;
if (!variableName) {
  container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
    text: "Select a Case Variable in the options panel to see the heatmap.",
  });
  return;
}

if (!validNames.includes(variableName)) {
  container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
    text: `No files have a value for "${variableName}".`,
  });
  return;
}

if (!ctx.data) return;
const result = calculateCodeMetadata(ctx.data, filters, variableName, registry, {
  includeMissing: !ctx.cmHideMissing,
});

if (result.grandTotal === 0) {
  container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
    text: "No data after filters.",
  });
  return;
}

if (result.values.length === 1) {
  // Aviso compacto + heatmap mesmo assim (1 coluna)
  const warn = container.createDiv({ cls: "codemarker-analytics-warning" });
  warn.createEl("p", { text: "Only one value — no contingency. χ² disabled." });
}
```

- [ ] **Step 4.1.2: Build + smoke dos empty states**

Cenários a testar manualmente:
- Vault sem Case Variables (simular: filtrar todos via popover registry, ou criar config temp): conferir empty state
- Variável escolhida que ninguém preenche
- Filtros que removem todos markers
- Variável com 1 valor único

- [ ] **Step 4.1.3: Commit**

```bash
git add src/analytics/views/modes/codeMetadataMode.ts
~/.claude/scripts/commit.sh "feat(analytics): empty states refinados em Code x Metadata"
```

---

### Task 4.2: Banner quando dimensão = filtro de variável

**Files:**
- Modify: `src/analytics/views/modes/codeMetadataMode.ts`

- [ ] **Step 4.2.1: Adicionar banner condicional antes do drawHeatmap**

Logo antes do `drawHeatmap(container, ctx, result)`:

```typescript
if (filters.caseVariableFilter && filters.caseVariableFilter.name === variableName) {
  const banner = container.createDiv({ cls: "codemarker-cm-banner" });
  banner.createEl("p", {
    text: `Filtering by "${variableName}" while using as dimension — only "${filters.caseVariableFilter.value}" will appear.`,
  });
}
```

- [ ] **Step 4.2.2: Adicionar CSS mínimo se não existir classe `codemarker-cm-banner`**

Em `styles.css`, adicionar (se não existir):

```css
.codemarker-cm-banner {
  background: var(--background-modifier-border);
  border-left: 3px solid var(--text-accent);
  padding: 6px 10px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 4.2.3: Build + smoke**

Run:
```bash
npm run build
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/ 2>/dev/null || true
```

Smoke: aplicar filtro de Case Variable e escolher a mesma como dimensão → banner aparece.

- [ ] **Step 4.2.4: Commit**

```bash
git add src/analytics/views/modes/codeMetadataMode.ts styles.css
~/.claude/scripts/commit.sh "feat(analytics): banner quando dimensao = variavel filtrada"
```

---

### Task 4.3: Sort interaction (click nos headers)

**Files:**
- Modify: `src/analytics/views/modes/codeMetadataMode.ts`

> **Implementação:** sort dividido em 2 headers (mais intuitivo que 1 ciclo de 8 estados):
> - Click no header da coluna **Code** (esquerda): cicla `total desc → total asc → name asc → name desc → total desc`
> - Click no header da coluna **stats** (direita): cicla `chi² desc → chi² asc → p asc → p desc → chi² desc`
>
> Hit-test via `canvas.addEventListener('click', ...)` pelas coordenadas dos headers.

- [ ] **Step 4.3.1: Antes de iterar `result.codes` no draw, ordenar baseado em `ctx.cmSort`**

Substituir a iteração inicial em `drawHeatmap` por uma cópia ordenada:

```typescript
const sortedIdx = sortIndices(result, ctx.cmSort);
const codes = sortedIdx.map((i) => result.codes[i]!);
const stats = sortedIdx.map((i) => result.stats[i]);
const matrix = sortedIdx.map((i) => result.matrix[i]!);
const rowTotals = sortedIdx.map((i) => result.rowTotals[i]!);
```

E refatorar o loop `for (let r = 0; r < R; r++)` pra usar `codes[r]`, `stats[r]`, `matrix[r]`, `rowTotals[r]` em vez de `result.codes[r]` etc.

Adicionar a função:

```typescript
function sortIndices(
  result: ReturnType<typeof calculateCodeMetadata>,
  sort: AnalyticsViewContext["cmSort"],
): number[] {
  const idx = result.codes.map((_, i) => i);
  const dir = sort.asc ? 1 : -1;
  idx.sort((a, b) => {
    let va: number | string;
    let vb: number | string;
    if (sort.col === "total") {
      va = result.rowTotals[a]!;
      vb = result.rowTotals[b]!;
    } else if (sort.col === "name") {
      va = result.codes[a]!.name.toLowerCase();
      vb = result.codes[b]!.name.toLowerCase();
    } else if (sort.col === "chi2") {
      va = result.stats[a]?.chiSquare ?? -Infinity;
      vb = result.stats[b]?.chiSquare ?? -Infinity;
    } else {
      // p
      va = result.stats[a]?.pValue ?? Infinity;
      vb = result.stats[b]?.pValue ?? Infinity;
    }
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb) * dir;
    }
    return ((va as number) - (vb as number)) * dir;
  });
  return idx;
}
```

- [ ] **Step 4.3.2: Adicionar listener de click no canvas pros 2 headers**

Logo após `canvas` ser criado:

```typescript
canvas.addEventListener("click", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  // Only header area (y < headerHeight)
  if (y > headerHeight) return;

  // Hit-test: stats column header (right)
  if (x >= statsX && x < canvasWidth - padding) {
    ctx.cmSort = nextStatsSort(ctx.cmSort);
    ctx.scheduleUpdate();
    return;
  }
  // Hit-test: code column header (left)
  if (x >= padding && x < labelColWidth) {
    ctx.cmSort = nextCodeSort(ctx.cmSort);
    ctx.scheduleUpdate();
  }
});
```

E adicionar:

```typescript
function nextStatsSort(cur: AnalyticsViewContext["cmSort"]): AnalyticsViewContext["cmSort"] {
  // Ciclo: chi² desc → chi² asc → p asc → p desc → chi² desc
  const order: Array<AnalyticsViewContext["cmSort"]> = [
    { col: "chi2", asc: false },
    { col: "chi2", asc: true },
    { col: "p", asc: true },
    { col: "p", asc: false },
  ];
  const idx = order.findIndex((s) => s.col === cur.col && s.asc === cur.asc);
  // Se sort atual é total/name, entrar no ciclo pelo primeiro estado
  return idx === -1 ? order[0]! : order[(idx + 1) % order.length]!;
}

function nextCodeSort(cur: AnalyticsViewContext["cmSort"]): AnalyticsViewContext["cmSort"] {
  // Ciclo: total desc → total asc → name asc → name desc → total desc
  const order: Array<AnalyticsViewContext["cmSort"]> = [
    { col: "total", asc: false },
    { col: "total", asc: true },
    { col: "name", asc: true },
    { col: "name", asc: false },
  ];
  const idx = order.findIndex((s) => s.col === cur.col && s.asc === cur.asc);
  return idx === -1 ? order[0]! : order[(idx + 1) % order.length]!;
}
```

- [ ] **Step 4.3.3: Adicionar indicador visual de sort no header**

No draw da label "χ² · p" e do header de códigos, mostrar seta ou marcador quando esse for o sort ativo. Manter simples:

```typescript
// Header stats
const statsHeader = `χ² · p ${ctx.cmSort.col === "chi2" || ctx.cmSort.col === "p" ? (ctx.cmSort.asc ? "▲" : "▼") : ""}`;
cctx.fillText(statsHeader, statsX, headerHeight - 8 + padding);
```

E no header da label de códigos (top-left, antes da iteração de cells):

```typescript
const codesHeader = `Code ${ctx.cmSort.col === "name" || ctx.cmSort.col === "total" ? (ctx.cmSort.asc ? "▲" : "▼") : ""}`;
cctx.fillStyle = "var(--text-muted, #666)";
cctx.fillText(codesHeader, padding, headerHeight - 8 + padding);
```

- [ ] **Step 4.3.4: Build + smoke do sort**

Conferir clicks no header da coluna stats e na coluna de códigos mudam a ordem.

- [ ] **Step 4.3.5: Commit**

```bash
git add src/analytics/views/modes/codeMetadataMode.ts
~/.claude/scripts/commit.sh "feat(analytics): sort interativo via click no header"
```

---

### Task 4.4: Tooltip de hover

**Files:**
- Modify: `src/analytics/views/modes/codeMetadataMode.ts`

> Mostra (código, valor, contagem, % linha, % col) ao passar mouse sobre uma célula.

- [ ] **Step 4.4.1: Criar div tooltip flutuante e listener de mousemove**

Após criar o canvas:

```typescript
const tooltip = wrapper.createDiv({ cls: "codemarker-cm-tooltip" });
tooltip.style.position = "absolute";
tooltip.style.pointerEvents = "none";
tooltip.style.display = "none";

canvas.addEventListener("mousemove", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;

  if (y < headerHeight || x < labelColWidth || x >= labelColWidth + C * cellSize) {
    tooltip.style.display = "none";
    return;
  }
  const c = Math.floor((x - labelColWidth - padding) / cellSize);
  const r = Math.floor((y - headerHeight - padding) / cellSize);
  if (r < 0 || r >= R || c < 0 || c >= C) {
    tooltip.style.display = "none";
    return;
  }

  const code = codes[r]!;
  const value = result.values[c]!;
  const count = matrix[r]![c]!;
  const rowTot = rowTotals[r]!;
  const colTot = result.colTotals[c]!;
  const pctRow = rowTot > 0 ? ((count / rowTot) * 100).toFixed(1) : "—";
  const pctCol = colTot > 0 ? ((count / colTot) * 100).toFixed(1) : "—";

  tooltip.innerHTML = `<strong>${escapeHtml(code.name)}</strong> × <em>${escapeHtml(value)}</em><br>` +
    `Count: ${count}<br>% row: ${pctRow}%<br>% col: ${pctCol}%`;
  tooltip.style.left = `${ev.offsetX + 10}px`;
  tooltip.style.top = `${ev.offsetY + 10}px`;
  tooltip.style.display = "block";
});
canvas.addEventListener("mouseleave", () => {
  tooltip.style.display = "none";
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

- [ ] **Step 4.4.2: CSS do tooltip**

Em `styles.css`:

```css
.codemarker-cm-wrapper {
  position: relative;
}
.codemarker-cm-tooltip {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 1000;
}
```

- [ ] **Step 4.4.3: Build + smoke**

Hover sobre células → tooltip aparece com (código, valor, count, % linha, % col).

- [ ] **Step 4.4.4: Commit**

```bash
git add src/analytics/views/modes/codeMetadataMode.ts styles.css
~/.claude/scripts/commit.sh "feat(analytics): tooltip de hover no heatmap Code x Metadata"
```

---

### Task 4.5: Export CSV

**Files:**
- Modify: `src/analytics/views/modes/codeMetadataMode.ts`

> Linhas = códigos. Colunas = `code, total, <value_1>, ..., <value_n>, (missing)?, chi2, df, p, cramers_v`. Linhas multitext → 4 colunas estatísticas saem como `""`.

- [ ] **Step 4.5.1: Implementar `exportCodeMetadataCSV`**

Importar helper de CSV (o pattern existente está em `chartHelpers.ts`):

```typescript
import { buildCsv } from "../shared/chartHelpers";
```

> Verificar se `buildCsv` existe (deve existir, é usado por todos os modes). Se a assinatura diferir, copiar pattern do chiSquareMode.exportChiSquareCSV.

```typescript
export function exportCodeMetadataCSV(ctx: AnalyticsViewContext, date: string): void {
  if (!ctx.data || !ctx.cmVariable) {
    new Notice("Nothing to export — select a variable first");
    return;
  }
  const filters = ctx.buildFilterConfig();
  const registry = ctx.plugin.caseVariablesRegistry;
  const result = calculateCodeMetadata(ctx.data, filters, ctx.cmVariable, registry, {
    includeMissing: !ctx.cmHideMissing,
  });

  const header = ["code", "total", ...result.values, "chi2", "df", "p", "cramers_v"];
  const rows: string[][] = [];
  for (let r = 0; r < result.codes.length; r++) {
    const stat = result.stats[r];
    const row = [
      result.codes[r]!.name,
      String(result.rowTotals[r]),
      ...result.matrix[r]!.map(String),
      stat ? String(stat.chiSquare) : "",
      stat ? String(stat.df) : "",
      stat ? String(stat.pValue) : "",
      stat ? String(stat.cramersV) : "",
    ];
    rows.push(row);
  }

  const csv = buildCsv([header, ...rows]);
  const filename = `code-metadata-${ctx.cmVariable}-${date}.csv`;

  // Inline pattern (mesmo do chiSquareMode.exportChiSquareCSV)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

> **Imports adicionais necessários:** `import { Notice } from "obsidian";` no topo do arquivo.

- [ ] **Step 4.5.2: Build + smoke**

Smoke: clicar no botão "Export CSV" no footer do Analytics → arquivo baixado. Abrir em planilha → colunas batem, linhas multitext têm campos chi² em branco.

- [ ] **Step 4.5.3: Commit**

```bash
git add src/analytics/views/modes/codeMetadataMode.ts
~/.claude/scripts/commit.sh "feat(analytics): export CSV de Code x Metadata com chi2 vazio em multitext"
```

---

### Task 4.6: Smoke checklist completo

**Files:** —

- [ ] **Step 4.6.1: Build final**

```bash
npm run build
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/ 2>/dev/null || true
```

- [ ] **Step 4.6.2: Reload plugin no vault workbench e rodar smoke checklist**

| Cenário | Esperado |
|---------|----------|
| Variável `text`, valores em ≥3 arquivos | Heatmap renderiza, χ² populado |
| Variável `multitext` | Coluna χ² mostra `—`; tooltip explica |
| Variável `number` (idade) | Bins quartis (4 colunas) |
| Variável `date` | Granularidade auto |
| Toggle Count → % row → % col | Células atualizam |
| Toggle Hide missing | Coluna `(missing)` some/aparece |
| Filtro Case Variable = mesma variável | Banner aparece |
| Variável com 1 valor único | Aviso compacto, χ² `—` |
| Sem Case Variables (todas vazias) | Empty state com link |
| 0 markers após filtros | "No data after filters" |
| Click no header coluna stats | Sort cicla |
| Click no header coluna codes | Sort por nome |
| Hover célula | Tooltip aparece |
| Export CSV | Arquivo baixa, colunas corretas |

- [ ] **Step 4.6.3: Sem regressão em outros modes**

Spot-check em alguns modos pra garantir que ainda funcionam (sort do chi-square mode, frequency, doc-matrix). Não precisa varrer todos.

- [ ] **Step 4.6.4: Rodar suite de testes (sanity)**

Run:
```bash
npx vitest run tests/analytics/inferential.test.ts tests/analytics/binning.test.ts tests/analytics/codeMetadata.test.ts
```

Expected: tudo verde.

- [ ] **Step 4.6.5: Type check final**

Run:
```bash
npx tsc --noEmit
```

Expected: sem erros.

---

### Task 4.7: Atualizar documentação do roadmap

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md` (opcional — só se padrão novo)

- [ ] **Step 4.7.1: Marcar Code × Metadata como FEITO no ROADMAP**

Em `docs/ROADMAP.md`, na linha do item Code × Metadata em §3 Analytics — melhorias, riscar e adicionar data:

```markdown
| ~~**Code × Metadata** (ex-#9)~~ ✅ 2026-04-27 | 2-3h | Tabelas de contingência código × variável demográfica. ...
```

- [ ] **Step 4.7.2: Adicionar entry no histórico de features (`§ Histórico` ou similar)**

Padrão das specs anteriores (#21 Toggle Visibility, #22 Code Groups): no fim de `docs/ROADMAP.md`, na seção de histórico/features concluídas, adicionar uma entrada explicando o que foi implementado, com referências aos novos arquivos.

```markdown
- **#23 Code × Metadata (Analytics)** — 2026-04-27. Branch `feat/code-metadata`. Modo novo cruzando códigos × Case Variables. 3 arquivos novos: `src/analytics/data/binning.ts` (helpers puros quartis/granularidade auto/explode multitext), `src/analytics/data/codeMetadata.ts` (função pura matriz [code × value] + chi² por código), `src/analytics/views/modes/codeMetadataMode.ts` (heatmap canvas 2D + coluna stats + sort + tooltip + CSV). Refactor: `chiSquareFromContingency(observed: number[][])` extraído de `inferential.ts` como helper genérico R×C reutilizável; regression bit-idêntica protegida por testes. UI: dropdown Variable + radios Display (Count / % row / % col) + checkbox Hide missing + banner condicional quando dimensão = variável filtrada. Multitext: chi² desabilitado (`—`) por sobreposição de categorias. CSV export com 4 colunas estatísticas vazias pra linhas multitext. ~XX testes novos (binning + codeMetadata + chiSquareFromContingency).
```

> Substituir `XX` pelo número real de testes adicionados (~25 esperados).

- [ ] **Step 4.7.3: Commit final**

```bash
git add docs/ROADMAP.md
~/.claude/scripts/commit.sh "docs(roadmap): marca Code x Metadata como concluido"
```

---

## Resumo dos chunks

| Chunk | Resultado | Smoke checkpoint obrigatório |
|-------|-----------|-------------------------------|
| 1 | `chiSquareFromContingency` extraído. `calculateChiSquare` delega. Regression bit-idêntica. | ✅ chi-square mode existente continua igual no vault |
| 2 | Helpers de binning + `calculateCodeMetadata` puros, com 25 testes unitários | ✅ tests verdes |
| 3 | Modo registrado, heatmap renderiza com options panel | ✅ 4 tipos de variável renderizam corretamente |
| 4 | Empty states, banner, sort interativo, tooltip, CSV export | ✅ checklist completo + sem regressão |

Total estimado: ~3-4h ativa, distribuída em 22 commits pequenos.

---

## Notas finais pro implementador

- **Ordem dos chunks importa** — não pular pra Chunk 2 antes de Chunk 1 estar smoke-aprovado
- **Cada commit deve ser auto-contido** — testes passam, build OK
- **Smoke manual no vault não é negociável** — testes verdes não validam runtime do Obsidian (lição cara documentada em `feedback_validate_dom_contract`)
- **Sem hedge defensivo** — plugin é dev, zero usuários, nada de "e se a registry não existir?" (registry sempre existe — o plugin não roda sem ela)
- **NUNCA criar git worktree** — overridden pelo CLAUDE.md do projeto
- **Use `~/.claude/scripts/commit.sh`** sempre — força author correto
- **Verificar dúvidas no spec primeiro:** `docs/superpowers/specs/2026-04-27-code-metadata-design.md`

Pronto pra executar.
