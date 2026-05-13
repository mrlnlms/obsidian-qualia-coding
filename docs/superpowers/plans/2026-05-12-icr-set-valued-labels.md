# ICR Set-Valued Labels — Implementation Plan

> **Execução inline.** Este projeto usa execução direta em branch (`feedback_sdd_overkill_for_dev_project` no MEMORY.md). Sem subagentes obrigatórios, sem worktree (hot-reload do plugin quebra). Steps usam checkbox (`- [ ]`) pra tracking; quem executar marca conforme avança.

**Goal:** Eliminar a redução first-code alfabético do motor κ; tratar multi-código por marker como conjuntos via distância paramétrica (Jaccard/MASI); paridade NVivo no Cohen κ multi-label; UI de toggle no Compare Coders.

**Architecture:** Família `δ` pluggable (`distances/{nominal,jaccard,masi}.ts`); Krippendorff α + cu-α paramétricos em δ; Cohen κ multi-label via binary-per-label macro (caminho A); Fleiss κ delega pra α em escopos multi-label. UI: chip `Distance` ortogonal ao coefficient picker, sempre presente com estado visual (ativo / cinza); badge de densidade comunica magnitude; SavedComparison persiste escolha.

**Tech Stack:** TypeScript strict, Vitest + jsdom (~3450 tests hoje), Web Worker inline (`kappa.worker.ts`), Obsidian API. Build esbuild via `npm run dev` / `npm run build`. Sem novas deps.

**Branch:** `icr-refactor-c` (criar antes do primeiro commit). Não tagear release até finalizar C3.

**Spec autoritativo:** `docs/superpowers/specs/2026-05-12-icr-set-valued-labels-design.md`
**Methodology user-facing:** `docs/ICR-SET-VALUED-METHODOLOGY.md` (já criada)

**Seed pra smoke real:** `scripts/seed-smoke-icr.mjs` (já estendido com F5-multilabel.md cobrindo 4 casos canônicos).

---

## Chunk C1 — Distâncias + Krippendorff α + cu-α paramétricos

**Goal:** introduzir família δ pluggable e tornar α / cu-α paramétricos sem regredir tests existentes (invariante: `δ_nominal` = comportamento atual; `δ_jaccard` ≡ `δ_nominal` pra singletons).

**Definition of done:**
- 3 módulos novos em `src/core/icr/distances/` com tests
- α pareado + α categorical + cu-α aceitam `distance` em options; default = `δ_nominal`
- Suite atual (~3450 tests) passa sem regressão
- Tests novos cobrem multi-label real com δ_jaccard e δ_MASI
- Smoke real no vault: Compare Coders com α + Jaccard sobre F5 mostra κ diferente de α + nominal

---

### Task C1.0: Setup de branch

**Files:** — (git only)

- [ ] **Step 1: Criar branch** — `git checkout -b icr-refactor-c`
- [ ] **Step 2: Confirmar** — `git status` mostra `On branch icr-refactor-c`, working tree clean (ou com mudanças do seed F5 que ainda não foram commitadas — se houver, commit antes).

---

### Task C1.1: `distances/nominal.ts` (skeleton extraído + tests)

**Files:**
- Create: `src/core/icr/distances/nominal.ts`
- Test: `tests/core/icr/distances/nominal.test.ts`

- [ ] **Step 1: Escrever tests primeiro** (`tests/core/icr/distances/nominal.test.ts`):

```typescript
import { describe, expect, it } from 'vitest';
import { distanceNominal } from '../../../../src/core/icr/distances/nominal';

describe('distanceNominal', () => {
  it('returns 0 for identical singletons', () => {
    expect(distanceNominal(new Set(['a']), new Set(['a']))).toBe(0);
  });
  it('returns 1 for disjoint singletons', () => {
    expect(distanceNominal(new Set(['a']), new Set(['b']))).toBe(1);
  });
  it('returns 0 for empty/empty', () => {
    expect(distanceNominal(new Set(), new Set())).toBe(0);
  });
  it('returns 1 for empty vs non-empty', () => {
    expect(distanceNominal(new Set(), new Set(['a']))).toBe(1);
  });
  it('returns 0 for multi-label sets that share alphabetic-first code', () => {
    // {a,b} vs {a,c} → both reduce to 'a' → agreement
    expect(distanceNominal(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(0);
  });
  it('returns 1 for multi-label sets with disjoint alphabetic-first codes', () => {
    // {a,b} vs {c,d} → 'a' vs 'c' → disagreement
    expect(distanceNominal(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar** — `npm run test -- tests/core/icr/distances/nominal.test.ts`. Esperado: 6 testes falham (módulo não existe).

- [ ] **Step 3: Implementar `src/core/icr/distances/nominal.ts`**:

```typescript
/**
 * Distância nominal clássica entre sets de códigos.
 * Comportamento equivalente à redução first-code alfabético histórica do motor κ.
 * Existe como módulo separado pra clareza em tests single-label que querem
 * referência canônica explícita.
 */
export function distanceNominal(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  if (a.size === 1 && b.size === 1) {
    const [x] = a; const [y] = b;
    return x === y ? 0 : 1;
  }
  // Multi-label: reduz a first-code alfabético (preserva semântica atual do motor)
  const reduce = (s: ReadonlySet<string>) => [...s].sort()[0]!;
  return reduce(a) === reduce(b) ? 0 : 1;
}
```

- [ ] **Step 4: Rodar tests** — `npm run test -- tests/core/icr/distances/nominal.test.ts`. Esperado: 6 testes passam.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): distances/nominal.ts — extração explícita da redução first-code"`

---

### Task C1.2: `distances/jaccard.ts`

**Files:**
- Create: `src/core/icr/distances/jaccard.ts`
- Test: `tests/core/icr/distances/jaccard.test.ts`

- [ ] **Step 1: Tests** (cobrir 4 casos canônicos + invariante singleton + edge cases):

```typescript
import { describe, expect, it } from 'vitest';
import { distanceJaccard } from '../../../../src/core/icr/distances/jaccard';

describe('distanceJaccard', () => {
  it('returns 0 for identical sets', () => {
    expect(distanceJaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(0);
  });
  it('returns 0.333... for subset relation {a,b} vs {a,b,c}', () => {
    const d = distanceJaccard(new Set(['a', 'b']), new Set(['a', 'b', 'c']));
    expect(d).toBeCloseTo(1 / 3, 6);
  });
  it('returns 0.667 for lateral overlap {a,b} vs {a,c}', () => {
    const d = distanceJaccard(new Set(['a', 'b']), new Set(['a', 'c']));
    expect(d).toBeCloseTo(2 / 3, 6);
  });
  it('returns 1 for disjoint sets', () => {
    expect(distanceJaccard(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(1);
  });
  it('returns 0 for identical singletons (invariant w/ nominal)', () => {
    expect(distanceJaccard(new Set(['a']), new Set(['a']))).toBe(0);
  });
  it('returns 1 for disjoint singletons (invariant w/ nominal)', () => {
    expect(distanceJaccard(new Set(['a']), new Set(['b']))).toBe(1);
  });
  it('returns 0 for empty/empty', () => {
    expect(distanceJaccard(new Set(), new Set())).toBe(0);
  });
  it('returns 1 for empty vs non-empty', () => {
    expect(distanceJaccard(new Set(), new Set(['a']))).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar** — falha (módulo não existe).

- [ ] **Step 3: Implementar**:

```typescript
/**
 * Jaccard distance: 1 − |A ∩ B| / |A ∪ B|.
 * Pra singletons (|A|=|B|=1) equivale a δ_nominal — invariante pra tests existentes.
 */
export function distanceJaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return 1 - intersection / union;
}
```

- [ ] **Step 4: Rodar tests** — 8 testes passam.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): distances/jaccard.ts — Jaccard distance pra set-valued"`

---

### Task C1.3: `distances/masi.ts`

**Files:**
- Create: `src/core/icr/distances/masi.ts`
- Test: `tests/core/icr/distances/masi.test.ts`

- [ ] **Step 1: Tests** (4 canônicos + factor M edge cases):

```typescript
import { describe, expect, it } from 'vitest';
import { distanceMASI } from '../../../../src/core/icr/distances/masi';

describe('distanceMASI', () => {
  it('returns 0 for identical sets (M=1)', () => {
    expect(distanceMASI(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(0);
  });
  it('returns 0.555... for subset {a,b} vs {a,b,c} (M=2/3)', () => {
    // d = 1 − (2/3)(2/3) = 1 − 4/9 = 5/9 ≈ 0.555
    const d = distanceMASI(new Set(['a', 'b']), new Set(['a', 'b', 'c']));
    expect(d).toBeCloseTo(5 / 9, 6);
  });
  it('returns 0.889 for lateral overlap {a,b} vs {a,c} (M=1/3)', () => {
    // d = 1 − (1/3)(1/3) = 1 − 1/9 = 8/9 ≈ 0.889
    const d = distanceMASI(new Set(['a', 'b']), new Set(['a', 'c']));
    expect(d).toBeCloseTo(8 / 9, 6);
  });
  it('returns 1 for disjoint (M=0)', () => {
    expect(distanceMASI(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(1);
  });
  it('returns 0 for identical singletons (invariant w/ nominal)', () => {
    expect(distanceMASI(new Set(['a']), new Set(['a']))).toBe(0);
  });
  it('returns 1 for disjoint singletons (invariant w/ nominal)', () => {
    expect(distanceMASI(new Set(['a']), new Set(['b']))).toBe(1);
  });
  it('returns 0 for empty/empty', () => {
    expect(distanceMASI(new Set(), new Set())).toBe(0);
  });
  it('returns 1 for empty vs non-empty', () => {
    expect(distanceMASI(new Set(), new Set(['a']))).toBe(1);
  });
  it('handles subset where smaller set is on right (M=2/3 symmetric)', () => {
    const d = distanceMASI(new Set(['a', 'b', 'c']), new Set(['a', 'b']));
    expect(d).toBeCloseTo(5 / 9, 6);
  });
});
```

- [ ] **Step 2: Rodar** — falha.

- [ ] **Step 3: Implementar** (fórmula direta da paper Passonneau 2006, NÃO NLTK):

```typescript
/**
 * MASI distance (Passonneau 2006): 1 − (|A ∩ B| / |A ∪ B|) × M
 *
 * M = 1 (idêntico), 2/3 (subset), 1/3 (overlap lateral), 0 (disjoint)
 *
 * CUIDADO: NLTK `masi_distance` diverge da paper (issue #294 aberto desde 2012).
 * Esta implementação segue Passonneau (2006) direto.
 */
export function distanceMASI(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  if (intersection === 0) return 1;
  const union = a.size + b.size - intersection;
  let m: number;
  if (a.size === b.size && intersection === a.size) m = 1;            // A == B
  else if (intersection === a.size || intersection === b.size) m = 2 / 3;  // subset
  else m = 1 / 3;                                                       // lateral
  return 1 - (intersection / union) * m;
}
```

- [ ] **Step 4: Rodar tests** — 9 testes passam.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): distances/masi.ts — MASI distance (Passonneau 2006)"`

---

### Task C1.4: Tipo `DistanceFunction` + index

**Files:**
- Create: `src/core/icr/distances/index.ts`

- [ ] **Step 1: Criar index** (tipo compartilhado + re-export):

```typescript
export type DistanceFunction = (a: ReadonlySet<string>, b: ReadonlySet<string>) => number;

export { distanceNominal } from './nominal';
export { distanceJaccard } from './jaccard';
export { distanceMASI } from './masi';

export type DistanceName = 'nominal' | 'jaccard' | 'masi';

/** Resolve nome → função. Útil pra ler config persistido em SavedComparison. */
export function resolveDistance(name: DistanceName): DistanceFunction {
  switch (name) {
    case 'nominal': return distanceNominal;
    case 'jaccard': return distanceJaccard;
    case 'masi': return distanceMASI;
  }
}
```

- [ ] **Step 2: Rodar suite completa** — `npm run test`. Esperado: ~3450 + 23 novos = ~3473 verdes (suite atual + 3 distances).

- [ ] **Step 3: Commit** — `~/.claude/scripts/commit.sh "feat(icr): distances/index.ts — DistanceFunction type + resolveDistance"`

---

### Task C1.5: `krippendorffAlpha.ts` paramétrico em δ

**Files:**
- Modify: `src/core/icr/coefficients/krippendorffAlpha.ts`
- Test: `tests/core/icr/coefficients/krippendorffAlpha.test.ts` (existe — adicionar casos)

- [ ] **Step 1: Ler arquivo atual** — Read `src/core/icr/coefficients/krippendorffAlpha.ts`. Identificar linha 34 (`Array.from(set).sort()[0]`) e a estrutura do loop interno.

- [ ] **Step 2: Tests novos** (adicionar ao test file existente):

```typescript
import { describe, expect, it } from 'vitest';
import { krippendorffAlphaNominal } from '../../../../src/core/icr/coefficients/krippendorffAlpha';
import { distanceJaccard, distanceMASI, distanceNominal } from '../../../../src/core/icr/distances';

describe('krippendorffAlpha — paramétrico em distance', () => {
  // Cenário sintético: 3 units, 2 coders, multi-label
  const inputMultiLabel = {
    units: [
      { unitId: 'u1', coderSets: new Map([['c1', new Set(['a', 'b'])], ['c2', new Set(['a', 'b'])]]) },         // idêntico
      { unitId: 'u2', coderSets: new Map([['c1', new Set(['a', 'b'])], ['c2', new Set(['a', 'b', 'c'])]]) },     // subset
      { unitId: 'u3', coderSets: new Map([['c1', new Set(['a', 'b'])], ['c2', new Set(['a', 'c'])]]) },          // overlap lateral
    ],
    // ... resto da estrutura conforme KappaInput existente
  } as any;  // ajustar shape ao tipo real do projeto

  it('default = δ_nominal (backwards compat)', () => {
    // Sem distance: comportamento idêntico ao histórico
    const α_default = krippendorffAlphaNominal(inputMultiLabel);
    const α_explicit_nominal = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceNominal });
    expect(α_default).toBeCloseTo(α_explicit_nominal, 6);
  });

  it('δ_jaccard distingue subset e overlap lateral de agreement', () => {
    const α = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceJaccard });
    const α_nominal = krippendorffAlphaNominal(inputMultiLabel);
    // Com Jaccard, u2 e u3 contribuem distância parcial (0.333, 0.667).
    // Com nominal, ambos reduzem a 'a' → distância 0 (agreement falso).
    // Esperado: α_jaccard < α_nominal
    expect(α).toBeLessThan(α_nominal);
  });

  it('δ_MASI penaliza overlap lateral mais que Jaccard', () => {
    const α_jaccard = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceJaccard });
    const α_masi = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceMASI });
    // MASI: d(subset)=0.555, d(lateral)=0.889 vs Jaccard: 0.333, 0.667
    // Mais distância → α_masi < α_jaccard
    expect(α_masi).toBeLessThan(α_jaccard);
  });

  it('singletons: jaccard e nominal produzem α idêntico (invariant)', () => {
    const inputSingleLabel = { /* construir com sets size=1 */ } as any;
    const α_nominal = krippendorffAlphaNominal(inputSingleLabel);
    const α_jaccard = krippendorffAlphaNominal(inputSingleLabel, { distance: distanceJaccard });
    expect(α_jaccard).toBeCloseTo(α_nominal, 6);
  });
});
```

> **Nota pra executor:** o shape exato de `KappaInput` precisa ser confirmado lendo `src/core/icr/kappaInput.ts` antes de escrever os tests. Ajustar os mocks acima ao tipo real.

- [ ] **Step 3: Rodar tests novos** — falham (assinatura não aceita options).

- [ ] **Step 4: Implementar refactor**:

a) Adicionar interface de options:

```typescript
import type { DistanceFunction } from '../distances';
import { distanceNominal } from '../distances';

export interface KrippendorffAlphaOptions {
  distance?: DistanceFunction;
}
```

b) Mudar assinatura:

```typescript
export function krippendorffAlphaNominal(
  input: KappaInput,
  options: KrippendorffAlphaOptions = {},
): number {
  const δ = options.distance ?? distanceNominal;
  // ...
}
```

c) Substituir `Array.from(set).sort()[0]` (linha 34) pelo uso de `δ(setA, setB)` direto sobre os sets, mantendo a estrutura do cálculo de D_o e D_e.

d) D_o: pra cada unit, soma de `δ(coder_i_set, coder_j_set)` sobre pares (i,j).

e) D_e: distribuição empírica de sets observados. Pra cada par (A, B) ∈ observed_sets, peso = freq(A) × freq(B) × δ(A, B), dividido por N² total.

> **Atenção §46 TECHNICAL-PATTERNS:** δ é parâmetro de comportamento, não de scope. NÃO entra em `cacheKeyForScope(scope)` (definido em `src/core/icr/ui/scopeExtraction.ts` — retorna string da scope geometry). Entra como **suffix concatenado no UI callsite** (`overviewMatrix.ts` / `overviewHeatmap.ts`) — mesmo padrão já existente do `::bbox`. C1.8 detalha.

- [ ] **Step 5: Rodar suite α** — `npm run test -- tests/core/icr/coefficients/krippendorffAlpha`. Esperado: tests existentes (single-label) passam SEM mudança (invariante default nominal); tests novos passam.

- [ ] **Step 6: Rodar suite completa** — `npm run test`. Esperado: ~3477 verdes (sem regressão).

- [ ] **Step 7: Commit** — `~/.claude/scripts/commit.sh "feat(icr): krippendorffAlpha paramétrico em distance — δ_jaccard/MASI pluggable"`

---

### Task C1.6: `krippendorffAlphaCategorical.ts` paramétrico

**Files:**
- Modify: `src/core/icr/coefficients/krippendorffAlphaCategorical.ts`
- Test: `tests/core/icr/coefficients/krippendorffAlphaCategorical.test.ts`

> **Nome real do símbolo exportado:** `krippendorffAlphaCategoricalNominal` (com suffix `Nominal` — diferente do nome do arquivo). Tests novos importam esse símbolo.

> **Shape de input:** `CategoricalKappaInput` em vez de `KappaInput`. Cada unit tem `codeIds: string[]` (não `coderSets: Map<CoderId, Set<string>>`). Pra cada par de coders, comparar sets convertidos: `new Set(u.codeIds_coder_A)` vs `new Set(u.codeIds_coder_B)`. Estrutura categorical: 1 unit = 1 CSV row; coders são colunas dentro do row.

- [ ] **Step 1: Ler arquivo atual** — identificar linha 22 (`[...u.codeIds].sort()[0]!`) e a estrutura do loop categorical.

- [ ] **Step 2: Tests novos** — espelhar estrutura de C1.5 (`describe('krippendorffAlphaCategoricalNominal — paramétrico em distance', ...)`), mas com cenários categorical (CSV rows). Mesma lógica de assertions: default = nominal, jaccard < nominal pra multi-label, masi < jaccard pra lateral, singletons invariantes.

- [ ] **Step 3: Rodar tests novos** — falham (assinatura não aceita options).

- [ ] **Step 4: Implementar refactor** — adicionar `options: KrippendorffAlphaOptions = {}` na assinatura; resolver `δ = options.distance ?? distanceNominal`; substituir redução `[...u.codeIds].sort()[0]!` por uso de `δ(setA, setB)` no loop interno (mesmo padrão de C1.5 a/b/c/d/e).

- [ ] **Step 5: Rodar suite α categorical** — `npm run test -- tests/core/icr/coefficients/krippendorffAlphaCategorical`. Tests existentes passam, novos passam.

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr): krippendorffAlphaCategoricalNominal paramétrico em distance"`

---

### Task C1.7: `cuAlpha.ts` herda paramétrico

**Files:**
- Modify: `src/core/icr/coefficients/cuAlpha.ts`
- Test: `tests/core/icr/coefficients/cuAlpha.test.ts`

- [ ] **Step 1: Ler arquivo atual** — confirmar que reusa `krippendorffAlphaNominal`.

- [ ] **Step 2: Test novo** — cu-α com δ_jaccard num cenário com boundaries multi-label:

```typescript
it('cu-α propaga distance pra α subjacente', () => {
  const α_jaccard = cuAlpha(input, { distance: distanceJaccard });
  const α_nominal = cuAlpha(input);
  expect(α_jaccard).toBeLessThan(α_nominal);
});
```

- [ ] **Step 3: Rodar test** — falha.

- [ ] **Step 4: Implementar** — adicionar `options: KrippendorffAlphaOptions = {}` na assinatura; encadear pra chamada interna de α.

- [ ] **Step 5: Rodar suite cu-α** — tests passam.

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr): cuAlpha encadeia distance pra α subjacente"`

---

### Task C1.8: Reporter propaga `distance` via suffix de cacheKey

**Files:**
- Modify: `src/core/icr/reporter.ts`
- Modify: `src/core/icr/ui/overviewMatrix.ts` (callsite UI)
- Modify: `src/core/icr/ui/overviewHeatmap.ts` (callsite UI)
- Test: `tests/core/icr/reporter.test.ts` (existe — adicionar caso)

> **Realidade do código (descoberta no review C1):**
> - `reportKappa(inputs: EngineKappaInput[], cacheKey?: string)` — cacheKey é **string parameter**, não objeto.
> - `cacheKeyForScope` vive em `src/core/icr/ui/scopeExtraction.ts`, não em `reporter.ts`.
> - Callsites UI já concatenam suffixes manualmente: `cacheKeyForScope(scope) + (perPairBbox.size > 0 ? '::bbox' : '')`. Mesmo padrão pra `distance`.
>
> **NÃO criar interface `KappaOptions` no reporter** — usar API existente. δ entra como string concatenada no cacheKey + parâmetro adicional em `reportKappa`/`reportPairwise` pra resolver a função internamente.

- [ ] **Step 1: Ler `src/core/icr/reporter.ts` + `src/core/icr/ui/scopeExtraction.ts`** — confirmar assinatura atual de `reportKappa(inputs, cacheKey?)` e onde `cacheKeyForScope(scope)` é chamado.

- [ ] **Step 2: Estender assinatura do reporter** — adicionar parâmetro `distance` opcional:

```typescript
// reporter.ts
import { type DistanceName, resolveDistance } from './distances';

export async function reportKappa(
  inputs: EngineKappaInput[],
  cacheKey?: string,
  distance?: DistanceName,
): Promise<KappaReport> {
  // ... resolver δ = resolveDistance(distance ?? 'nominal')
  // ... passar δ pra chamadas de krippendorffAlphaNominal / cuAlpha / fleissKappa
}

export async function reportPairwise(
  inputs: EngineKappaInput[],
  pairs: CoderPair[],
  cacheKey?: string,
  distance?: DistanceName,
): Promise<PairwiseReport> {
  // ... mesma propagação
}
```

> Atenção: `cacheKey` continua sendo string; quem CHAMA reporter é responsável por já incluir distance no suffix. Reporter usa `cacheKey` direto pra `reportKappaKeyCache.set(...)` sem reprocessar.

- [ ] **Step 3: Atualizar callsites UI pra concatenar `::${distance}` no cacheKey:**

```typescript
// overviewMatrix.ts (e overviewHeatmap.ts — mesmo padrão)
const distance = state.distance ?? 'nominal';  // (state.distance será adicionado em C3.1)
const cacheKey = cacheKeyForScope(scope)
  + (perPairBbox.size > 0 ? '::bbox' : '')
  + `::δ-${distance}`;

const report = await reportKappa(inputs, cacheKey, distance);
```

> Em C1.8 ainda não temos `state.distance` (UI). Por enquanto, hardcode `distance = 'nominal'` nos callsites — preserva comportamento atual. C3.5 vai injetar do state real. Razão de cravar a estrutura agora: garantir que cacheKey já comporta o suffix antes de UI consumir.

- [ ] **Step 4: Propagar `distance` pras chamadas internas de coeficientes no reporter.** Onde reporter chama `krippendorffAlphaNominal(input)`, passar `krippendorffAlphaNominal(input, { distance: resolveDistance(distance ?? 'nominal') })`. Idem cu-α, Fleiss (após C2). Cohen κ (caminho A) NÃO recebe distance (sem efeito).

- [ ] **Step 5: Test novo** — `tests/core/icr/reporter.test.ts`:

```typescript
it('reporter usa distance no compute + cacheKey distingue', async () => {
  const r1 = await reportKappa(inputs, 'scope-key-test::δ-jaccard', 'jaccard');
  const r2 = await reportKappa(inputs, 'scope-key-test::δ-nominal', 'nominal');
  expect(r1.alpha).not.toBe(r2.alpha);  // valores diferentes (multi-label no input)
  // Cache não confunde:
  const r1again = await reportKappa(inputs, 'scope-key-test::δ-jaccard', 'jaccard');
  expect(r1again.alpha).toBe(r1.alpha);  // hit
});
```

- [ ] **Step 6: Rodar tests reporter** — `npm run test -- tests/core/icr/reporter`. Tests existentes passam (default nominal preserva comportamento); test novo passa.

- [ ] **Step 7: Rodar suite completa** — `npm run test`. ~3478 verdes.

- [ ] **Step 8: Commit** — `~/.claude/scripts/commit.sh "feat(icr): reporter propaga distance via suffix de cacheKey (§46 respeitada)"`

---

### Task C1.9: Web Worker + sync fallback propagam `distance`

**Files:**
- Modify: `src/core/icr/kappa.worker.ts`
- Modify: `src/core/icr/kappaWorkerClient.ts`
- Modify: `src/core/icr/kappaSyncFallback.ts`

- [ ] **Step 1: Ler os 3 arquivos** — identificar shape de message passing (worker postMessage / onMessage).

- [ ] **Step 2: Adicionar `distance` ao payload de worker request**:

```typescript
interface KappaWorkerRequest {
  // ... campos existentes
  distance?: DistanceName;
}
```

- [ ] **Step 3: Worker handler** — resolver `distance` via `resolveDistance(distanceName)` e passar pra α/cu-α. `kappaSyncFallback` faz o mesmo.

- [ ] **Step 4: Test** — `tests/core/icr/kappaWorker.test.ts` (se existir) ou criar mini-test que valida que worker request com distance retorna valor diferente.

- [ ] **Step 5: Rodar tests worker** — passam.

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr): kappa worker propaga distance pra coeficientes"`

---

### Task C1.10: Smoke real no vault — checkpoint obrigatório

**Files:** — (manual)

> **Atenção: este step é OBRIGATÓRIO conforme CLAUDE.md §1.** Tests verde ≠ feature funcionando. Tem que abrir o Obsidian e testar antes de fechar o chunk.

- [ ] **Step 1: Build prod** — `npm run build`. Esperado: sem erros TypeScript, `main.js` regenerado.

- [ ] **Step 2: Reseed (Obsidian fechado primeiro)** — `node scripts/seed-smoke-icr.mjs`. Confirma 34 markers (22 single + 12 multi-label em F5).

- [ ] **Step 3: Abrir Obsidian no vault workbench** → Compare Coders → SavedComparison "Smoke ICR — A1-B3".

- [ ] **Step 4: Coefficient = α (Krippendorff α)**. Anotar valor κ exibido na matriz Mode A com δ default (nominal).

- [ ] **Step 5: Console do dev tools — disparar manualmente α com Jaccard:**

```javascript
// No console do Obsidian
const plugin = app.plugins.plugins['qualia-coding'];
const result = await plugin.icrApi.reportKappa(/* scope */, { distance: 'jaccard' });
console.log(result);
```

(Ou seja, ainda não tem UI; é validação de motor. UI vem em C3.)

- [ ] **Step 6: Validar** que valor com δ_jaccard é diferente do default (nominal), na direção esperada (mais baixo — F5 L2/L4 deixam de inflar agreement).

- [ ] **Step 7: Repetir com MASI** — valor < jaccard.

- [ ] **Step 8: Capturar evidência** — print do console ou screenshot da matriz; salvar em `obsidian-qualia-coding/plugin-docs/smoke-evidence/C1-checkpoint.png` (fora do repo).

- [ ] **Step 9: Atualizar CHANGELOG.md** — adicionar entrada:

```markdown
### [Em andamento] — Refactor C set-valued labels — Chunk C1

- feat(icr): família δ pluggable (`distances/{nominal,jaccard,masi}.ts`)
- feat(icr): krippendorff α + α categorical + cu-α paramétricos em distance
- feat(icr): reporter + worker propagam distance em KappaOptions
- Smoke real validado: F5-multilabel mostra κ menor com Jaccard/MASI vs nominal (agreement parcial em subset/lateral, antes inflado)
```

- [ ] **Step 10: Commit** — `~/.claude/scripts/commit.sh "docs(changelog): C1 entrega motor κ paramétrico em distance"`

---

## Chunk C2 — Cohen κ caminho A + Fleiss κ fallback + remoção de `pickFirstCode`

**Goal:** Cohen κ multi-label vira binary-per-label macro-average (paridade NVivo). Fleiss κ delega pra α quando há multi-label. Função `pickFirstCode` e literais `[...sort()[0]]` removidos do pipeline.

**Definition of done:**
- `cohenKappa.ts` retorna `{ value, perCode }` com macro-average
- `cohenKappaCategorical.ts` idem
- `fleissKappa.ts` / `fleissKappaCategorical.ts` delegam pra α quando há multi-label (retornam `number`, não `KappaReport` — divergência registrada com spec)
- `CoefficientReport.cohenKappa` migra de `Record<string, number>` pra `Record<string, CohenKappaReport>` (decisão (a) — propagar perCode pelos consumers)
- `pickFirstCode` removido; 0 ocorrências de `Array.from(set).sort()[0]` ou `[...sort()[0]]` em `src/` e `tests/`
- Smoke: Cohen κ no Compare Coders sobre F5 mostra perCode breakdown via console

---

### Task C2.0: Decisão arquitetural — propagar `CohenKappaReport` pelos consumers

**Files:** — (decisão, não código; consumers serão tocados em C2.1 Step 5)

> **Decisão cravada em 2026-05-12 (sessão de planning):** Cohen κ caminho A vai retornar `{ value, perCode }` (chamada `CohenKappaReport`). O campo `CoefficientReport.cohenKappa` em `reporter.ts:40-46` migra de `Record<string, number>` pra `Record<string, CohenKappaReport>`. Consumers (`coefficientResolver.ts`, `compareCoderCoefficientsModal.ts`, `overviewTable.ts`, `overviewMatrix.ts`, etc.) acessam `.value` pra preencher matriz/heatmap; perCode fica disponível pra UI em C3 (card no drill-down + tooltip da célula).
>
> **Alternativa rejeitada:** retornar só `number` em C2 e adicionar perCode em chunk futuro. Rejeitada porque criaria retrabalho (mexer 2× nos mesmos arquivos) e perCode é parte do valor anunciado da feature (spec §2 + methodology user-facing).

- [ ] **Step 1: Confirmar callsites de `cohenKappa(...)` em src/** — grep:

```bash
grep -rn "cohenKappa(" src/ | grep -v ".test.ts"
```

Esperado (descoberto no review):
- `reporter.ts:161` (pareado)
- `reporter.ts:143` (categorical — `cohenKappaCategorical`)
- `kappa.worker.ts:85` (pareado)
- `kappa.worker.ts:71` (categorical)
- `coefficientResolver.ts:32` (consumer)
- `compareCoderCoefficientsModal.ts:170` (consumer)
- (outros — confirmar com grep real)

- [ ] **Step 2: Atualizar tipo `CoefficientReport`** em `reporter.ts:40-46`:

```typescript
import type { CohenKappaReport } from './coefficients/cohenKappa';

interface CoefficientReport {
  // antes: cohenKappa: Record<string, number>
  cohenKappa: Record<string, CohenKappaReport>;
  // ... outros campos inalterados
}
```

- [ ] **Step 3: Commit (decisão registrada)** — `~/.claude/scripts/commit.sh "refactor(icr): CoefficientReport.cohenKappa passa a aceitar CohenKappaReport (propagação perCode)"`

> **Nota:** este step muda só o tipo, sem implementação. Build provavelmente quebra em vários callsites — esperado. C2.1 Step 5 vai consertar os callsites consumers; C2.1 implementa o retorno novo de `cohenKappa()`. Ordem importa: type-first pra TS errors guiarem a refatoração.

---

### Task C2.1: `cohenKappa.ts` caminho A binary-per-label

**Files:**
- Modify: `src/core/icr/coefficients/cohenKappa.ts`
- Test: `tests/core/icr/coefficients/cohenKappa.test.ts`

- [ ] **Step 1: Ler arquivo atual** — identificar `pickFirstCode` (linha 61) e usos (linhas 30, 31). Identificar onde o cálculo P_o, P_e está hoje.

- [ ] **Step 2: Tests novos** (multi-label real):

```typescript
describe('cohenKappa caminho A — binary-per-label', () => {
  it('retorna macro-average sobre universo de codes', () => {
    // Cenário: 2 coders, 3 markers
    //   m1: A={a,b}, B={a,b}     → agree em a e em b
    //   m2: A={a,b}, B={a,c}     → agree em a, disagree em b e c
    //   m3: A={c},   B={c}       → agree em c
    const input = buildInput([
      { codes: { coderA: ['a', 'b'], coderB: ['a', 'b'] } },
      { codes: { coderA: ['a', 'b'], coderB: ['a', 'c'] } },
      { codes: { coderA: ['c'],      coderB: ['c'] } },
    ]);
    const result = cohenKappa(input, 'coderA', 'coderB');
    // Esperado: perCode tem entries pra a, b, c
    expect(result.perCode).toHaveProperty('a');
    expect(result.perCode).toHaveProperty('b');
    expect(result.perCode).toHaveProperty('c');
    // value é macro-average
    const avg = (result.perCode.a + result.perCode.b + result.perCode.c) / 3;
    expect(result.value).toBeCloseTo(avg, 6);
  });

  it('single-label puro: equivalente ao Cohen κ clássico binário por categoria', () => {
    // todos sets têm tamanho 1; binary-per-label degenera pro clássico
    // Cenário: 3 units, 2 coders, 2 codes (a, b)
    //   u1: A={a}, B={a}     → 'a': n11=1; 'b': n00=1
    //   u2: A={b}, B={a}     → 'a': n01=1, 'b': n10=1
    //   u3: A={b}, B={b}     → 'a': n00=1, 'b': n11=1
    // Pra code 'a': n11=1, n00=2, n01=1, n10=0. P_o(a)=3/3=1, P_e(a)... wait
    // Re-tabular:
    //   Pra code 'a': n11=1 (u1), n00=2 (u2,u3 — ambos sem 'a'? não: u2 tem B='a').
    //   Vamos refazer:
    //     u1: A_has_a=true,  B_has_a=true   → 'a': n11
    //         A_has_b=false, B_has_b=false  → 'b': n00
    //     u2: A_has_a=false, B_has_a=true   → 'a': n01
    //         A_has_b=true,  B_has_b=false  → 'b': n10
    //     u3: A_has_a=false, B_has_a=false  → 'a': n00
    //         A_has_b=true,  B_has_b=true   → 'b': n11
    //   Pra 'a': n11=1, n10=0, n01=1, n00=1. N=3.
    //     P_o(a) = (1+1)/3 = 0.667
    //     marg_A_a = 1/3, marg_B_a = 2/3
    //     P_e(a) = (1/3)(2/3) + (2/3)(1/3) = 2/9 + 2/9 = 4/9 ≈ 0.444
    //     κ(a) = (0.667 - 0.444) / (1 - 0.444) = 0.223/0.556 ≈ 0.400
    //   Pra 'b': n11=1, n10=1, n01=0, n00=1. N=3.
    //     P_o(b) = 2/3, marg_A_b = 2/3, marg_B_b = 1/3
    //     P_e(b) = (2/3)(1/3) + (1/3)(2/3) = 4/9 ≈ 0.444
    //     κ(b) = (0.667 - 0.444) / (1 - 0.444) ≈ 0.400
    //   macro = 0.400
    const input = buildInput([
      { codes: { coderA: ['a'], coderB: ['a'] } },
      { codes: { coderA: ['b'], coderB: ['a'] } },
      { codes: { coderA: ['b'], coderB: ['b'] } },
    ]);
    const result = cohenKappa(input, 'coderA', 'coderB');
    expect(result.perCode.a).toBeCloseTo(0.4, 2);
    expect(result.perCode.b).toBeCloseTo(0.4, 2);
    expect(result.value).toBeCloseTo(0.4, 2);
  });

  it('TypeScript: cohenKappa não aceita options de distance (caminho A no-op)', () => {
    // Sanity check: caminho A não tem assinatura com distance.
    // Compile-time: TS deve rejeitar `cohenKappa(input, A, B, { distance: jaccard })`.
    // Runtime: chamadas idempotentes (mesmas entradas → mesmas saídas).
    const input = buildInput([
      { codes: { coderA: ['a', 'b'], coderB: ['a', 'c'] } },
    ]);
    const r1 = cohenKappa(input, 'coderA', 'coderB');
    const r2 = cohenKappa(input, 'coderA', 'coderB');
    expect(r1.value).toBe(r2.value);
    expect(r1.perCode).toEqual(r2.perCode);
  });
});
```

- [ ] **Step 3: Rodar tests novos** — falham (assinatura retorna `number`, não `{value, perCode}`).

- [ ] **Step 4: Implementar caminho A** (substituir cohenKappa.ts inteiro):

```typescript
import type { KappaInput, CoderId } from '../kappaInput';

export interface CohenKappaReport {
  value: number;
  perCode: Record<string, number>;
}

export function cohenKappa(
  input: KappaInput,
  coderA: CoderId,
  coderB: CoderId,
): CohenKappaReport {
  const codeUniverse = collectAllCodes(input, coderA, coderB);
  if (codeUniverse.size === 0) return { value: 1, perCode: {} };  // empty agreement convention

  const perCode: Record<string, number> = {};
  for (const code of codeUniverse) {
    const matrix = buildPresenceMatrix(input, coderA, coderB, code);
    perCode[code] = computeCohenKappaBinary(matrix);
  }

  const values = Object.values(perCode);
  const macro = values.reduce((s, k) => s + k, 0) / values.length;

  return { value: macro, perCode };
}

function collectAllCodes(input: KappaInput, a: CoderId, b: CoderId): Set<string> {
  const universe = new Set<string>();
  for (const unit of input.units) {
    for (const x of unit.coderSets.get(a) ?? []) universe.add(x);
    for (const x of unit.coderSets.get(b) ?? []) universe.add(x);
  }
  return universe;
}

function buildPresenceMatrix(
  input: KappaInput, a: CoderId, b: CoderId, code: string,
): { n11: number; n10: number; n01: number; n00: number } {
  let n11 = 0, n10 = 0, n01 = 0, n00 = 0;
  for (const unit of input.units) {
    const inA = unit.coderSets.get(a)?.has(code) ?? false;
    const inB = unit.coderSets.get(b)?.has(code) ?? false;
    if (inA && inB) n11++;
    else if (inA && !inB) n10++;
    else if (!inA && inB) n01++;
    else n00++;
  }
  return { n11, n10, n01, n00 };
}

function computeCohenKappaBinary(m: { n11: number; n10: number; n01: number; n00: number }): number {
  const N = m.n11 + m.n10 + m.n01 + m.n00;
  if (N === 0) return 1;
  const Po = (m.n11 + m.n00) / N;
  const marginalA = (m.n11 + m.n10) / N;
  const marginalB = (m.n11 + m.n01) / N;
  const Pe = marginalA * marginalB + (1 - marginalA) * (1 - marginalB);
  if (Pe === 1) return 1;
  return (Po - Pe) / (1 - Pe);
}
```

> **Atenção:** ajustar shape de `KappaInput` ao tipo real do projeto. Pode ser que `unit.coderSets` seja `Map<CoderId, Set<string>>` ou estrutura diferente — confirmar lendo `kappaInput.ts`.

- [ ] **Step 5: Atualizar callsites consumers** — `CoefficientReport.cohenKappa` agora é `Record<string, CohenKappaReport>` (Task C2.0 Step 2 já mudou o tipo, build deve estar quebrado nos sites abaixo). Ajustar:

```
src/core/icr/reporter.ts:161
  antes:  cohenK[pairKey] = cohenKappa(input, pair.a, pair.b);
  depois: cohenK[pairKey] = cohenKappa(input, pair.a, pair.b);  // já retorna CohenKappaReport, sem mudança visual

src/core/icr/kappa.worker.ts:85
  idem — atribui o objeto inteiro pra cohenK[pairKey]

src/core/icr/ui/coefficientResolver.ts:32
  antes:  const value = report.cohenKappa[pairKey];
  depois: const value = report.cohenKappa[pairKey]?.value ?? null;

src/core/icr/ui/compareCoderCoefficientsModal.ts:170
  antes:  acessar .cohenKappa[pairKey] direto pra mostrar número
  depois: acessar .cohenKappa[pairKey]?.value pra número; .perCode disponível pra UI nova (C3)

(grep adicional pode revelar mais — buscar `cohenKappa[` ou `cohenK[`)
```

Onde o caller só queria `value`, navegar `.value`. Onde caller pode usar `perCode` (modal/drilldown), preservar acesso ao objeto inteiro.

> **Atenção:** `coefficientResolver.ts` extrai um valor único por par pra preencher matriz overview. Sempre `.value`. perCode é consumido só pela UI nova em C3.

- [ ] **Step 6: Rodar tests cohenKappa** — passam.

- [ ] **Step 7: Rodar suite completa** — `npm run test`. Esperado: sem regressão (callsites ajustados).

- [ ] **Step 8: Commit** — `~/.claude/scripts/commit.sh "feat(icr): cohenKappa caminho A binary-per-label macro-average + perCode"`

---

### Task C2.2: `cohenKappaCategorical.ts` caminho A

**Files:**
- Modify: `src/core/icr/coefficients/cohenKappaCategorical.ts`
- Test: `tests/core/icr/coefficients/cohenKappaCategorical.test.ts`

> **Shape diferente do pareado!** `CategoricalKappaInput` tem `units: Array<{ codeIds: string[] }>` — não `coderSets: Map<CoderId, Set<string>>`. Cada unit é 1 row CSV; **não há discriminação por coder dentro do unit** (categorical assume row inteiro é a unidade, codes vivem como lista). Pra caminho A categorical, considerar `codeIds` como universo do row + checagem presence/absence é o que faz sentido. **Confirmar shape real lendo `src/core/icr/categoricalKappaInput.ts` antes de codificar.**

- [ ] **Step 1: Ler `categoricalKappaInput.ts`** — confirmar estrutura de `CategoricalKappaInput`. Identificar como pares de coders são representados (campo separado? metadata? lookup externo?).

- [ ] **Step 2: Tests novos** — espelhar estrutura de C2.1 mas com shape categorical:

```typescript
import { cohenKappaCategorical } from '../../../../src/core/icr/coefficients/cohenKappaCategorical';

describe('cohenKappaCategorical caminho A', () => {
  it('retorna CohenKappaReport com perCode breakdown', () => {
    // Construir CategoricalKappaInput conforme shape real
    // Cenário: 3 rows, 2 coders, codes a/b/c distribuídos
    const input = buildCategoricalInput(/* ... shape real ... */);
    const result = cohenKappaCategorical(input, 'coderA', 'coderB');
    expect(result.value).toBeTypeOf('number');
    expect(result.perCode).toBeTypeOf('object');
  });

  it('single-label degenera pro Cohen κ clássico binário por categoria', () => {
    // Mesma estrutura de C2.1 mas em shape categorical
    // Calcular expected value a mão (ver C2.1 Step 2 test #2)
  });
});
```

- [ ] **Step 3: Rodar tests** — falham.

- [ ] **Step 4: Implementar** — caminho A adaptado pra categorical:

```typescript
import type { CategoricalKappaInput, CoderId } from '../categoricalKappaInput';
import type { CohenKappaReport } from './cohenKappa';  // reusa tipo

export function cohenKappaCategorical(
  input: CategoricalKappaInput,
  coderA: CoderId,
  coderB: CoderId,
): CohenKappaReport {
  const codeUniverse = collectAllCodesCategorical(input, coderA, coderB);
  if (codeUniverse.size === 0) return { value: 1, perCode: {} };

  const perCode: Record<string, number> = {};
  for (const code of codeUniverse) {
    const matrix = buildPresenceMatrixCategorical(input, coderA, coderB, code);
    perCode[code] = computeCohenKappaBinary(matrix);
  }

  const values = Object.values(perCode);
  const macro = values.reduce((s, k) => s + k, 0) / values.length;
  return { value: macro, perCode };
}

// helpers `collectAllCodesCategorical` e `buildPresenceMatrixCategorical`:
// adaptar do C2.1 substituindo `unit.coderSets.get(coderId)` pela
// estrutura real do CategoricalKappaInput (descoberta no Step 1).
// `computeCohenKappaBinary` é REUSADO de cohenKappa.ts (importar).
```

> **Refactor sugerido:** mover `computeCohenKappaBinary` pra módulo compartilhado (ex: `src/core/icr/coefficients/_cohenBinary.ts`) ou export named de `cohenKappa.ts`. Ambos os Cohen (pareado + categorical) consumem a mesma fórmula 2×2.

- [ ] **Step 5: Rodar tests cohenKappaCategorical** — passam.

- [ ] **Step 6: Rodar suite completa** — sem regressão.

- [ ] **Step 7: Atualizar callsites consumers** — `reporter.ts:143` + `kappa.worker.ts:71` consumem `cohenKappaCategorical(...)`. Mesma migração de C2.1 Step 5 (objeto inteiro pra storage, `.value` pra UI matriz).

- [ ] **Step 8: Commit** — `~/.claude/scripts/commit.sh "feat(icr): cohenKappaCategorical caminho A binary-per-label + perCode"`

---

### Task C2.3: `fleissKappa.ts` — fallback automático pra α

**Files:**
- Modify: `src/core/icr/coefficients/fleissKappa.ts`
- Test: `tests/core/icr/coefficients/fleissKappa.test.ts`

> **Decisão registrada — divergência spec↔plan:** spec §2 (linha 256) sugere `fleissKappa(...): KappaReport`. **Plan retorna `number`** porque `CoefficientReport.fleissKappa: number` em `reporter.ts:40-46` espera escalar; mudar pra objeto exigiria propagar pelos consumers como Cohen κ (Task C2.0), e Fleiss não tem perCode pra justificar a propagação. **Mantém `number`.** Se algum dia Fleiss ganhar dimensão adicional, revisitar.

- [ ] **Step 1: Ler arquivo atual** — identificar redução linha 32 e a fórmula Fleiss clássica do corpo da função.

- [ ] **Step 2: Tests novos:**

```typescript
import { krippendorffAlphaNominal } from './krippendorffAlpha';
import { distanceJaccard } from '../distances';

describe('fleissKappa fallback', () => {
  it('escopo single-label puro: comportamento Fleiss clássico (sem mudança)', () => {
    // 2 units, 3 coders, codes a/b/c
    //   u1: todos coders = 'a'                  → agreement total em 'a'
    //   u2: 2 coders = 'b', 1 coder = 'c'       → agreement parcial
    // Fleiss clássico: P_o = ∑ P_i / n; P_e = ∑ p_j²
    // Pra 2 units, 3 coders, 3 categorias:
    //   u1: n_a=3, n_b=0, n_c=0 → P_1 = (3² + 0 + 0 - 3) / (3·2) = (9-3)/6 = 1
    //   u2: n_a=0, n_b=2, n_c=1 → P_2 = (0 + 4 + 1 - 3) / 6 = 2/6 ≈ 0.333
    //   P_o = (1 + 0.333) / 2 = 0.667
    //   p_a = (3 + 0) / 6 = 0.5; p_b = (0 + 2)/6 ≈ 0.333; p_c = (0 + 1)/6 ≈ 0.167
    //   P_e = 0.5² + 0.333² + 0.167² = 0.25 + 0.111 + 0.028 = 0.389
    //   κ = (0.667 - 0.389) / (1 - 0.389) = 0.278 / 0.611 ≈ 0.455
    const inputSingle = buildInput([
      { codes: { c1: ['a'], c2: ['a'], c3: ['a'] } },
      { codes: { c1: ['b'], c2: ['b'], c3: ['c'] } },
    ]);
    const result = fleissKappa(inputSingle);
    expect(result).toBeCloseTo(0.455, 2);
  });

  it('escopo com multi-label: delega pra Krippendorff α com δ ativa', () => {
    const inputMulti = buildInput([
      { codes: { c1: ['a', 'b'], c2: ['a', 'b'], c3: ['a', 'b'] } },
      { codes: { c1: ['a', 'b'], c2: ['a', 'c'], c3: ['a', 'b'] } },
    ]);
    const fleissResult = fleissKappa(inputMulti, { distance: distanceJaccard });
    const alphaResult = krippendorffAlphaNominal(inputMulti, { distance: distanceJaccard });
    expect(fleissResult).toBeCloseTo(alphaResult, 6);
  });

  it('detecta multi-label corretamente (qualquer marker com set size > 1)', () => {
    const inputMixed = buildInput([
      { codes: { c1: ['a'], c2: ['a'], c3: ['a'] } },           // single
      { codes: { c1: ['a', 'b'], c2: ['a'], c3: ['a'] } },      // multi em c1
    ]);
    // ainda delega pra α (1 marker multi é suficiente)
    const fleissResult = fleissKappa(inputMixed, { distance: distanceJaccard });
    const alphaResult = krippendorffAlphaNominal(inputMixed, { distance: distanceJaccard });
    expect(fleissResult).toBeCloseTo(alphaResult, 6);
  });
});
```

- [ ] **Step 3: Rodar tests novos** — falham.

- [ ] **Step 4: Implementar fallback:**

```typescript
import { krippendorffAlphaNominal } from './krippendorffAlpha';
import type { KrippendorffAlphaOptions } from './krippendorffAlpha';

export function fleissKappa(
  input: KappaInput,
  options: KrippendorffAlphaOptions = {},
): number {
  if (hasMultiLabelMarkers(input)) {
    return krippendorffAlphaNominal(input, options);
  }
  // Cálculo Fleiss clássico (sem redução first-code — mantém só pra single-label)
  return computeFleissClassic(input);
}

function hasMultiLabelMarkers(input: KappaInput): boolean {
  for (const unit of input.units) {
    for (const set of unit.coderSets.values()) {
      if (set.size > 1) return true;
    }
  }
  return false;
}

function computeFleissClassic(input: KappaInput): number {
  // Fórmula Fleiss κ clássica:
  //   P_o = (1/N) ∑ P_i, onde P_i = (∑ n_ij² − n) / (n · (n−1))
  //   P_e = ∑ p_j²,    onde p_j = (∑ n_ij) / (N · n)
  //   κ = (P_o − P_e) / (1 − P_e)
  // Onde N = units, n = coders por unit, n_ij = coders que aplicaram code j na unit i.
  //
  // Implementação: pegar a implementação atual de fleissKappa.ts (linhas após o
  // `[...sort()[0]]`) e REMOVER a redução. Sets têm size=1 garantido (caller checou
  // via hasMultiLabelMarkers), então `code = [...set][0]` é válido sem sort.
  //
  // Se a implementação atual depende essencialmente de pickFirstCode pra
  // construir matriz n_ij, refatorar pra iterar `set` direto (singleton).
}
```

- [ ] **Step 5: Rodar tests Fleiss** — passam.

- [ ] **Step 6: Rodar suite completa** — sem regressão.

- [ ] **Step 7: Commit** — `~/.claude/scripts/commit.sh "feat(icr): fleissKappa fallback automático pra α em escopo multi-label"`

---

### Task C2.4: `fleissKappaCategorical.ts` fallback

**Files:**
- Modify: `src/core/icr/coefficients/fleissKappaCategorical.ts`
- Test: `tests/core/icr/coefficients/fleissKappaCategorical.test.ts`

> **Shape diferente:** `CategoricalKappaInput` (sem `coderSets: Map`); detalhes confirmados em C2.2 Step 1. **Atualmente NÃO aceita options** (`fleissKappaCategorical(input)` em `kappa.worker.ts:76`). Adicionar `options?: KrippendorffAlphaOptions` quebra a call existente — atualizar callsite em `kappa.worker.ts` no mesmo commit.

- [ ] **Step 1: Ler `fleissKappaCategorical.ts`** — identificar redução linha 26 e fórmula categorical (provavelmente análoga ao pareado mas iterando rows em vez de chars).

- [ ] **Step 2: Tests novos** — espelhar C2.3:

```typescript
describe('fleissKappaCategorical fallback', () => {
  it('escopo single-label puro: Fleiss clássico categorical', () => {
    // CategoricalKappaInput single-label; expected value calculado a mão
  });
  it('escopo com multi-label: delega pra krippendorffAlphaCategoricalNominal com δ', () => {
    const input = buildCategoricalMultiLabelInput();
    const fleissResult = fleissKappaCategorical(input, { distance: distanceJaccard });
    const alphaResult = krippendorffAlphaCategoricalNominal(input, { distance: distanceJaccard });
    expect(fleissResult).toBeCloseTo(alphaResult, 6);
  });
});
```

- [ ] **Step 3: Rodar tests novos** — falham.

- [ ] **Step 4: Implementar fallback:**

```typescript
import { krippendorffAlphaCategoricalNominal } from './krippendorffAlphaCategorical';
import type { KrippendorffAlphaOptions } from './krippendorffAlpha';

export function fleissKappaCategorical(
  input: CategoricalKappaInput,
  options: KrippendorffAlphaOptions = {},
): number {
  if (hasMultiLabelCategorical(input)) {
    return krippendorffAlphaCategoricalNominal(input, options);
  }
  return computeFleissCategoricalClassic(input);
}

function hasMultiLabelCategorical(input: CategoricalKappaInput): boolean {
  // Adaptar predicate ao shape real: iterar units, checar se algum u.codeIds.length > 1
  // (mas atenção — se categorical agrupa codeIds por coder de outra forma, ajustar)
  for (const unit of input.units) {
    if (unit.codeIds.length > 1) return true;
  }
  return false;
}

// computeFleissCategoricalClassic: análogo a computeFleissClassic mas iterando
// over rows + codes do CategoricalKappaInput. Reusar fórmula existente sem a redução.
```

- [ ] **Step 5: Atualizar callsite `kappa.worker.ts:76`** — passar options se aplicável:

```typescript
// antes: fleissKappaCategorical(input)
// depois: fleissKappaCategorical(input, { distance: resolveDistance(distanceName) })
```

- [ ] **Step 6: Rodar tests fleissKappaCategorical** — passam.

- [ ] **Step 7: Rodar suite completa** — sem regressão.

- [ ] **Step 8: Commit** — `~/.claude/scripts/commit.sh "feat(icr): fleissKappaCategorical fallback pra α categorical"`

---

### Task C2.5: Limpar dead code — `pickFirstCode` removido

**Files:**
- Modify: `src/core/icr/coefficients/cohenKappa.ts` (remove função `pickFirstCode`)

- [ ] **Step 1: Grep final ampliado** — `src/` inteiro + `tests/` pra confirmar que nenhum fixture/test referencia a redução:

```bash
grep -rn "pickFirstCode\|\.sort()\[0\]\|\[\.\.\.set\]\.sort\(\)" src/ tests/
```

Esperado: **zero ocorrências** após C2.1-C2.4 (em src/) E zero em tests/ (fixtures não devem depender de comportamento de redução). Se aparecer em tests/, é fixture legacy que precisa ser atualizado — não dado real do refactor.

- [ ] **Step 2: Se sobrar algum** — remover. Se for export pública usada fora, deprecate primeiro (mas com 0 usuários, deletar direto).

- [ ] **Step 3: Rodar typecheck** — `npm run build` ou `tsc --noEmit`. Sem erros.

- [ ] **Step 4: Rodar suite completa** — sem regressão.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "chore(icr): remove pickFirstCode + literais [..sort()[0]] do motor κ"`

---

### Task C2.6: Smoke real no vault — checkpoint obrigatório

- [ ] **Step 1: Build prod** — `npm run build`.
- [ ] **Step 2: Reload Obsidian** (Cmd+R no vault workbench).
- [ ] **Step 3: Compare Coders → α + Jaccard** sobre escopo com F5. Validar via console:

```javascript
// Handle do plugin: confirmar via grep se há `plugin.icrApi` exposto.
// Se NÃO houver handle externo, navegar via:
//   1. Abrir Compare Coders no Obsidian (UI ainda não tem chip; usar SavedComparison)
//   2. Inspect element no value da matriz → console.log direto do PairwiseReport mais recente
// OU expor handle temporário no plugin.onload pra esse smoke (limpar depois).

// Esperado: report.aggregate.cohenKappa[pairKey].perCode contém entries por code
// (refletindo decisão (a) do C2.0 — CohenKappaReport propagado)
```

- [ ] **Step 4: Cohen κ** — chip ainda funciona (caminho A). Console mostra `.cohenKappa[pair].perCode` populado.

- [ ] **Step 5: Fleiss κ** em escopo com F5 — delega pra α automaticamente (valor matcha α com mesma δ).

- [ ] **Step 6: Fleiss κ** em escopo SÓ F1-F4 (single-label puro) — comportamento Fleiss clássico, não delega.

- [ ] **Step 7: Atualizar CHANGELOG.md:**

```markdown
### Refactor C — Chunk C2

- feat(icr): cohenKappa + cohenKappaCategorical caminho A (binary-per-label macro)
- feat(icr): fleissKappa + fleissKappaCategorical fallback automático pra α em multi-label
- chore(icr): pickFirstCode removido + literais [..sort()[0]] eliminados (7 sites zerados)
- Smoke real: Compare Coders perCode breakdown visível via console; Fleiss delega corretamente
```

- [ ] **Step 8: Commit** — `~/.claude/scripts/commit.sh "docs(changelog): C2 entrega Cohen caminho A + Fleiss fallback + clean-up pickFirstCode"`

---

## Chunk C3 — UI (toggle + badge + tooltip) + SavedComparison + docs final

**Goal:** chip `Distance: [Jaccard] [MASI]` ortogonal ao coefficient picker no Compare Coders, com estado visual (ativo/cinza), tooltip educativo. Badge `N/Total markers multi-label (X%)`. SavedComparison persiste escolha. ROADMAP + BACKLOG + CHANGELOG fechados.

**Definition of done:**
- Chip Distance presente no toolbar do Compare Coders
- Estados visuais conforme spec §5.2 (3 condições)
- Badge densidade renderiza acima da matriz
- Tooltips educativos no chip + badge
- SavedComparison.view.distance persistido (default 'jaccard')
- Smoke real: 5 cenários do spec §4.4 todos verdes
- Docs: ROADMAP item C marcado FEITO, BACKLOG atualizado, CHANGELOG completo

---

### Task C3.1: SavedComparison schema adiciona `distance`

**Files:**
- Modify: `src/core/icr/comparisonRegistry.ts` (ou onde SavedComparison vive)
- Modify: type definition

- [ ] **Step 1: Ler `comparisonRegistry.ts`** — entender shape `SavedComparison.view`.

- [ ] **Step 2: Adicionar campo:**

```typescript
interface SavedComparison {
  // ... campos existentes
  view: {
    // ... campos existentes
    distance?: 'nominal' | 'jaccard' | 'masi';
  }
}
```

- [ ] **Step 3: Default na leitura** — quando ler SavedComparison sem `distance`, defaultar pra `'jaccard'` (decisão D1 spec). Nada de migration code — direto na leitura.

- [ ] **Step 4: Test** — SavedComparison nova default `jaccard`; SavedComparison legada (sem campo) também resolve pra `jaccard`.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): SavedComparison.view.distance persistido (default jaccard)"`

---

### Task C3.2: `Distance` chip no toolbar do Compare Coders

**Files:**
- Modify: `src/core/icr/ui/coefficientPicker.ts` (chip render — onde Cohen/Fleiss/α/cu-α/α-binary vivem)
- Modify: `src/core/icr/ui/unifiedCompareCodersView.ts` (orchestrator — callsite de `reportPairwise` linha 473; import linha 19)
- Modify: `src/core/icr/comparisonRegistry.ts` (SavedComparison setters)
- Test: snapshot test do toolbar

> **Paths confirmados via grep no review C3.** NÃO criar `CompareCodersToolbar.ts` novo — chip vive em `coefficientPicker.ts` ao lado dos chips de coeficiente.

- [ ] **Step 1: Ler `coefficientPicker.ts`** — entender padrão visual dos chips existentes (Cohen κ / Fleiss κ / α / α-binary / cu-α) e setter de estado.

- [ ] **Step 2: Adicionar chip `Distance: [Jaccard] [MASI]`** após `cu-α`. Mesmo padrão visual (chip pill com 2 sub-opções selecionáveis). Pode renderizar como mini-group separado por divisor `·`.

- [ ] **Step 3: Setter** — clicar em sub-opção chama setter que persiste em `currentComparison.view.distance` via `comparisonRegistry.updateView(id, { distance: 'jaccard' | 'masi' })`. Reusar padrão existente de setters de `view.overviewMode` / `view.primaryCoefficient`.

- [ ] **Step 4: Test snapshot** — toolbar renderiza chip Distance entre `cu-α` e botões "ver lado a lado" / "exportar".

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr/ui): chip Distance: [Jaccard] [MASI] no coefficientPicker"`

---

### Task C3.3: Estado visual do chip — predicate de cinza

**Files:**
- Modify: mesmo arquivo da Task C3.2

- [ ] **Step 1: Implementar predicate:**

```typescript
function isDistanceChipDisabled(state: CompareCodersState): boolean {
  const coef = state.primaryCoefficient;
  const coefAcceptsDistance = coef === 'alpha' || coef === 'cuAlpha' || coef === 'fleiss';
  if (!coefAcceptsDistance) return true;
  return !hasMultiLabelMarkersInScope(state.scope);
}
```

- [ ] **Step 2: CSS — classe `is-disabled`** com opacity reduzida + cursor not-allowed. Reusar padrão existente do plugin (grep por `is-disabled` em styles.css).

- [ ] **Step 3: Tooltip dinâmico por motivo:**

```typescript
function distanceChipTooltip(state): string {
  if (state.primaryCoefficient === 'cohen' || state.primaryCoefficient === 'alphaBinary') {
    return 'Distance metric não se aplica ao Cohen κ multi-label (caminho binary-per-label). Para α / cu-α / Fleiss.';
  }
  if (!hasMultiLabelMarkersInScope(state.scope)) {
    return 'Todos os markers no escopo são single-label. Jaccard e MASI produzem resultado idêntico ao nominal.';
  }
  return 'Jaccard penaliza overlap parcial proporcional à interseção. MASI adiciona fator de monotonicidade (subset vs lateral).';
}
```

- [ ] **Step 4: Test** — predicate retorna true/false nos 3 casos da spec §5.2.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr/ui): chip Distance ganha estado cinza condicional + tooltip educativo"`

---

### Task C3.4: Badge densidade `N/Total markers multi-label (X%)`

**Files:**
- Modify: mesmo arquivo do Compare Coders UI

- [ ] **Step 1: Computar densidade**:

```typescript
function multiLabelDensity(scope): { multi: number; total: number; pct: number } {
  let multi = 0, total = 0;
  for (const marker of scope.markers) {
    total++;
    if (marker.codes.length > 1) multi++;
  }
  return { multi, total, pct: total > 0 ? (multi / total) * 100 : 0 };
}
```

- [ ] **Step 2: Renderizar badge** acima ou ao lado da matriz Mode A. Texto:

```
12 / 34 markers multi-label no escopo (35%)
```

CSS: badge pequeno inline, mesma família visual dos chips de filtro.

- [ ] **Step 3: Tooltip do badge** explica multi-label (texto da spec §5.6).

- [ ] **Step 4: Visibilidade** — sempre presente; quando `multi=0`, texto vira "0 markers multi-label no escopo" (ainda visível, comunica explicitamente).

- [ ] **Step 5: Test snapshot** — badge renderiza nos cenários (multi>0, multi=0).

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr/ui): badge densidade multi-label acima da matriz Mode A"`

---

### Task C3.5: Propagar chip → reporter (distance flui pro motor)

**Files:**
- Modify: `src/core/icr/ui/overviewMatrix.ts` (callsite `reportKappa` ou `reportPairwise`)
- Modify: `src/core/icr/ui/overviewHeatmap.ts` (idem)
- Modify: `src/core/icr/ui/unifiedCompareCodersView.ts:473` (callsite confirmado no review)

- [ ] **Step 1: Identificar callsites** — grep por `reportKappa\|reportPairwise` em `src/core/icr/ui/`. C1.8 Step 3 já preparou a forma do cacheKey suffix `::δ-${distance}`; aqui injetamos `state.distance` real (não mais hardcoded `'nominal'`).

- [ ] **Step 2: Passar `state.distance ?? 'jaccard'`** no cacheKey suffix e no parâmetro `distance`:

```typescript
const distance = state.distance ?? 'jaccard';  // default da decisão D1 (spec)
const cacheKey = cacheKeyForScope(scope)
  + (perPairBbox.size > 0 ? '::bbox' : '')
  + `::δ-${distance}`;
const report = await reportKappa(inputs, cacheKey, distance);
```

- [ ] **Step 2.5 — validação §46** — confirmar que `distance` NÃO foi adicionado ao objeto `scope` em `cacheKeyForScope(scope)` (analogia direta de §46 onde `visibleCoderIds` NUNCA entra no scope do extract). Grep:

```bash
grep -n "distance" src/core/icr/ui/scopeExtraction.ts
```

Esperado: zero matches. Se aparecer, é violação — refatorar pra deslocar pro suffix.

- [ ] **Step 3: Garantir re-render reativo** — quando user troca chip, matriz/heatmap recomputa. Reusar mecanismo existente (provavelmente `state.subscribe(...)` ou similar).

- [ ] **Step 4: Test** — trocar chip → matriz mostra valor diferente (cobertura via snapshot ou behavior test).

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr/ui): chip Distance dispara recompute do reporter; §46 validada"`

---

### Task C3.5b: perCode rendering — card no drill-down + tooltip da célula

**Files:**
- Modify: drilldown Cards (path concreto a confirmar via grep `drilldown.*[Cc]ards`)
- Modify: `src/core/icr/ui/overviewMatrix.ts` (tooltip da célula)

> **Decisão cravada na sessão de planning (2026-05-12):** `CohenKappaReport.perCode` aparece em **2 lugares**:
> 1. **Card no topo do drill-down Cards** quando coef = Cohen κ — descoberta ativa, lista codes ordenada por κ ascending (codes mais problemáticos no topo)
> 2. **Tooltip da célula da matriz Mode A** ao hover — descoberta passiva, breakdown completo do par
>
> Os dois aparecem juntos (não escolha exclusiva). Alinha com `feedback_expose_first_design_later` — mais alavanca pro user, refinamento UX em refactor de design futuro.

- [ ] **Step 1: Card no drill-down Cards** — quando `state.primaryCoefficient === 'cohen' || === 'cohenCategorical'`, renderizar card no topo do drilldown com título "Decomposição por código (Cohen κ caminho A)" + lista `code: κ` ordenada ascending. Reusar padrão visual existente de cards de regiões.

```typescript
// Pseudo:
if (state.primaryCoefficient === 'cohen' && cohenReport.perCode) {
  const sorted = Object.entries(cohenReport.perCode).sort(([,a], [,b]) => a - b);
  renderPerCodeCard(drilldownContainer, {
    title: 'Decomposição por código (Cohen κ caminho A)',
    entries: sorted,
    tooltip: 'Caminho A: macro-average sobre Cohen κ binário (presença/ausência) por código.',
  });
}
```

- [ ] **Step 2: Tooltip da célula da matriz** — onde a célula da Mode A renderiza valor de Cohen κ pra um par, adicionar tooltip ao hover com breakdown perCode:

```
Decomposição (Cohen κ caminho A):
  Tema A: 0.85
  Tema B: 0.42  ← contribui pra κ médio mais baixo
  Tema C: 0.91
  ...
```

Tooltip só aparece quando `cohenKappa[pair].perCode` existe (não pra α/Fleiss/α-binary).

- [ ] **Step 3: Tests snapshot** — card renderiza pra Cohen, não renderiza pra α; tooltip da célula renderiza perCode quando Cohen ativo.

- [ ] **Step 4: Smoke** — Compare Coders + Cohen κ no F5 + clicar célula par → drilldown Cards mostra perCode card no topo; hover na célula mostra tooltip.

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr/ui): perCode rendering — card no drill-down + tooltip da célula (Cohen κ caminho A)"`

---

### Task C3.6: Smoke real — 5 cenários do spec §4.4

**Files:** — (manual, vault workbench)

- [ ] **Step 1: Build prod + reload Obsidian.**

- [ ] **Step 2: Cenário 1** — Compare Coders α + Jaccard sobre F5. Validar F5 L2/L4 deixam de contar como agreement total (κ cai vs nominal).

- [ ] **Step 3: Cenário 2** — Trocar pra MASI. κ cai ainda mais nos overlap laterais.

- [ ] **Step 4: Cenário 3** — Trocar pra Cohen κ. Chip Distance fica **cinza desabilitado**. Tooltip explica.

- [ ] **Step 5: Cenário 4** — Trocar pra α-binary. Chip Distance continua cinza.

- [ ] **Step 6: Cenário 5** — Filtrar escopo pra incluir só F1-F4 (single-label puro). Chip fica cinza, badge "0 markers multi-label" aparece, número idêntico ao nominal.

- [ ] **Step 7: Capturar evidência** — screenshot de cada cenário em `obsidian-qualia-coding/plugin-docs/smoke-evidence/C3-checkpoint-{1..5}.png`.

- [ ] **Step 8: SavedComparison** — salvar "ICR — Smoke C com Jaccard" via SaveAs. Recarregar Obsidian. Validar que abre com Jaccard ativo (persistência).

- [ ] **Step 9: Commit (sem código novo)** — atualização opcional do README se aplicável.

---

### Task C3.7: Update docs operacionais

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/BACKLOG.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: ROADMAP** — marcar item C como ✅ FEITO 2026-MM-DD (data real do merge):

```markdown
- [x] **C — Set-valued labels no motor κ** ✅ **FEITO 2026-MM-DD** — refactor entregue em 3 chunks (C1 distâncias+α paramétrico, C2 Cohen caminho A + Fleiss fallback, C3 UI). Tag `post-icr-refactor-c-checkpoint`. ...
```

- [ ] **Step 2: BACKLOG** — mover entry de C de "aberto" pra "resolvido recentemente".

- [ ] **Step 3: CHANGELOG + bump de versão** — **bump minor: 0.4.2 → 0.5.0** (decisão cravada no planning). Razão: refactor C é **capability nova** (3 módulos `distances/*` + chip Distance UI + perCode breakdown + methodology doc novo). Pela convenção do CLAUDE.md (`Minor = feature nova`), não é patch. Atualizar 3 arquivos: `manifest.json`, `versions.json`, `package.json`. Adicionar seção `## [0.5.0]` no `CHANGELOG.md` com sumário dos 3 chunks.

- [ ] **Step 4: Commit** — `~/.claude/scripts/commit.sh "chore: bump 0.5.0 — refactor C set-valued labels"`

---

### Task C3.8: Tag de checkpoint + merge pra main

**Files:** — (git only)

- [ ] **Step 1: Confirmar working tree clean** — `git status`.

- [ ] **Step 2: Tag** — `git tag post-icr-refactor-c-checkpoint -m "Refactor C set-valued labels completo"`.

- [ ] **Step 3: Merge pra main** — `git checkout main && git merge --no-ff icr-refactor-c -m "merge: refactor C set-valued labels"`. (Conforme `feedback_auto_post_task_cleanup`: auto-merge pra main, push, delete branch local+remota.)

- [ ] **Step 4: Push** — `git push origin main && git push origin post-icr-refactor-c-checkpoint`.

- [ ] **Step 5: Delete branch local** — `git branch -d icr-refactor-c`.

- [ ] **Step 6: Delete branch remota se push'd** — se a branch foi pushed durante desenvolvimento, limpar:

```bash
git ls-remote --heads origin icr-refactor-c  # confirma se existe remoto
git push origin --delete icr-refactor-c       # só se existir
```

(Alinha com `feedback_auto_post_task_cleanup` — limpeza completa sem perguntar.)

- [ ] **Step 7: Tag de release 0.5.0** — `git tag 0.5.0 -m "Release 0.5.0 — set-valued labels"` + `git push origin 0.5.0`. Workflow `.github/workflows/release.yml` dispara build e cria GitHub Release com `main.js`, `manifest.json`, `styles.css` anexados (ver CLAUDE.md §Release).

---

## Cleanup pós-merge (opcional)

- [ ] Arquivar este plan: mover de `docs/superpowers/plans/` pra `obsidian-qualia-coding/plugin-docs/archive/claude_sources/plans/` com formato `20260512-icr-set-valued-labels.md`.
- [ ] Arquivar spec: idem pra `archive/claude_sources/specs/20260512-icr-set-valued-labels-design.md`.
- [ ] Atualizar MEMORY.md se algum pattern novo emergiu.

---

## Notas finais pro executor

- **A cada chunk, smoke real é OBRIGATÓRIO** (CLAUDE.md §1). Não pular.
- **TECHNICAL-PATTERNS §35-§46 obrigatório** antes de cada Task que toca reporter / cache (CLAUDE.md §8). §46 (visibleCoderIds fora do scope) tem analogia direta: `distance` é parâmetro de comportamento, NÃO entra no scope key — entra no cacheKey separadamente.
- **Tests primeiro, sempre** (TDD). Se um test não falha antes de implementar, está mal escrito.
- **Commits frequentes** — cada Task com 1+ commit. Usar `~/.claude/scripts/commit.sh` (conforme CLAUDE.md global).
- **Se encontrar gap entre spec e código real** — pausar, atualizar a spec antes de seguir. Spec é fonte de verdade do *design*; código é fonte de verdade do *estado*. Quando divergem, doc resolve, code segue.
- **Quando shape de tipos no plan diferir do código** — código real vence. Ajustar testes/implementação ao tipo real do projeto (KappaInput, CoderId, etc.), mas manter a estrutura algorítmica do plan.
