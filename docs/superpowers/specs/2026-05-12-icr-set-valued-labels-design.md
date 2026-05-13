# ICR Set-Valued Labels — refactor C (design)

**Data:** 2026-05-12
**Escopo:** refactor do motor κ pra suportar multi-código por marker nativamente. Elimina a redução first-code alfabético hoje aplicada em 7 sites; introduz famílias `δ_jaccard` e `δ_MASI` como distâncias paramétricas pra Krippendorff α + cu-α; redefine Cohen κ e Fleiss κ multi-label.
**Status:** spec após brainstorm 2026-05-12. Pronto pra writing-plans.
**Companion docs:**
- `docs/ICR-SET-VALUED-METHODOLOGY.md` — user-facing methodology (audiência: pesquisador defendendo método em paper)
- `obsidian-qualia-coding/plugin-docs/research/multi-label-kappa-2026-05-09.md` — repertório bibliográfico (Krippendorff 2018, Passonneau 2006, Rosenberg & Binkowski 2004)
- `obsidian-qualia-coding/plugin-docs/research/Deep Research Report - ICR Qualitative.md` — estado QDA pré-2025, justifica que esta é direção sem precedent direto na área
- `docs/ROADMAP.md > 🧱 ICR — Itens em aberto > C` — item canonical
- `docs/ICR-METHODOLOGY.md` — methodology do bbox adapter (caveat sobre set-valued se referencia a este refactor)

---

## Resumo executivo

O motor κ atual reduz multi-código a **first-code alfabético** em 7 sites no `src/core/icr/coefficients/`. Quando um marker carrega `{cor, raiva}` e outro carrega `{cor, frustração}`, ambos viram `cor` na comparação → κ trata como **agreement total**. Isso é semanticamente errado pra a feature multi-código nativa do plugin (`codes: CodeApplication[]` em todo marker, herdado do schema desde sempre).

Este refactor elimina a redução. Decisões cravadas:

- **D1 — Famílias de distância:** duas distâncias entre sets implementadas, escolha pelo pesquisador via toggle. Default **Jaccard** (ubíquo, defendável em qualquer paper); **MASI** (Passonneau 2006) opt-in pra pesquisador que precisa fineza semântica (subset vs overlap lateral).
- **D2 — Cohen κ multi-label:** caminho A (binary-per-label macro-average). Pra cada code do universo, monta matriz 2×2 (presença/ausência) e calcula Cohen κ binário; macro-average sobre todos os codes. Mesmo padrão usado por NVivo Coding Comparison Query — paridade com expectativa do pesquisador QDA.
- **D3 — Fleiss κ multi-label:** aposenta quando sets têm tamanho > 1. Fleiss κ é caso particular de Krippendorff α com N coders; manter dois nomes pra mesmo conceito confunde o pesquisador. Fallback automático: quando o motor detecta sets multi-label no escopo, Fleiss κ é substituído por Krippendorff α com a δ ativa no toggle.
- **D4 — Krippendorff α + cu-α paramétricos em δ:** assinatura passa a aceitar `distance: DistanceFunction`. Default `δ_nominal` pra retrocompatibilidade com callsites single-label que não precisam mudar. δ_jaccard e δ_MASI são pluggable.
- **D5 — α-binary inalterado:** já é set-collapsed (`__present__` / `__none__`), não usa δ, sem trabalho.
- **D6 — UI:** chip `Distance: [Jaccard] [MASI]` ortogonal ao coefficient picker no Compare Coders. Sempre presente, cinza desabilitado quando irrelevante (coeficiente não usa δ OU escopo sem multi-label). Badge `N / Total markers multi-label (X%)` comunica magnitude perto da matriz. Drill-down reusa padrões visuais existentes (sem UI nova).

**Fora deste refactor:** aggregate cross-engine (item B4, ortogonal — afeta combinação de κ entre engines com unidades heterogêneas, problema diferente).

### Limitação herdada que este refactor RESOLVE

O caveat presente em `docs/ICR-METHODOLOGY.md` ("regiões com `{cor, raiva}` vs `{cor, frustração}` concordam em κ porque ambos reduzem a `cor`") deixa de valer após este refactor. O ICR-METHODOLOGY.md ganha pointer pro novo doc `docs/ICR-SET-VALUED-METHODOLOGY.md` que explica como Jaccard/MASI tratam esse caso.

---

## §1 — Architecture overview

### Posição no projeto

Dois lugares novos em `src/core/icr/`:

```
src/core/icr/
├── distances/                          ← NOVO
│   ├── nominal.ts                      ← extrai comportamento atual encapsulado (clareza)
│   ├── jaccard.ts                      ← NOVO: δ_jaccard(A, B)
│   └── masi.ts                         ← NOVO: δ_MASI(A, B)
├── coefficients/                       ← MODIFICADO (7 sites)
│   ├── alphaBinary.ts                  (inalterado)
│   ├── cohenKappa.ts                   (refator: caminho A binary-per-label)
│   ├── cohenKappaCategorical.ts        (idem)
│   ├── cuAlpha.ts                      (herda paramétrico de α)
│   ├── fleissKappa.ts                  (fallback automático pra α quando multi-label)
│   ├── fleissKappaCategorical.ts       (idem)
│   ├── krippendorffAlpha.ts            (paramétrico em δ)
│   └── krippendorffAlphaCategorical.ts (idem)
├── reporter.ts                         ← MODIFICADO: aceita `distance` no KappaOptions
└── ...
```

### Pipeline modificado de uma análise

Antes (single-label implícito via redução):
```
markers → reduceSetToFirstCode → KappaInput → coeficiente → κ
```

Depois (set-valued nativo):
```
markers → KappaInput (mantém sets) → coeficiente (com δ explícita) → κ
```

A redução `[...sort()[0]]` desaparece. Os adapters (`textRange`, `bboxKappaInput`, `categoricalKappaInput`, etc.) continuam gerando `CodedMarker[]` com `codeIds: string[]` — o set é preservado até o coeficiente decidir como tratá-lo.

### Decisão por coeficiente

| Coeficiente | Tratamento de set | δ paramétrica | Visibilidade do toggle Jaccard/MASI |
|---|---|---|---|
| Cohen κ pareado | Caminho A: binary-per-label macro | **Não** | Chip cinza desabilitado |
| Cohen κ categorical | Idem | **Não** | Idem |
| Fleiss κ pareado | Fallback automático pra α quando há multi-label no escopo | **Sim** (via α) | Ativo quando há multi-label |
| Fleiss κ categorical | Idem | **Sim** (via α) | Idem |
| Krippendorff α pareado | Paramétrico em δ | **Sim** | Ativo quando há multi-label |
| Krippendorff α categorical | Idem | **Sim** | Idem |
| cu-α | Reusa α | **Sim** (via α) | Idem |
| α-binary | Set-collapsed (`__present__`/`__none__`) | **Não** | Chip cinza desabilitado |

Predicate de chip cinza: `coefficient ∈ {cohen, cohenCat, alphaBinary} OR allMarkersAreSingleLabel(scope)`.

---

## §2 — Module contracts

### `src/core/icr/distances/nominal.ts` (NOVO — extração explícita)

```typescript
/**
 * Distância nominal clássica: 0 se sets idênticos OU sob redução first-code idênticos, 1 caso contrário.
 *
 * Comportamento equivalente à redução implícita de hoje.
 * Mantido como módulo separado pra clareza em tests single-label que querem
 * referência canônica explícita.
 */
export function distanceNominal(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  // Single-label fast path
  if (a.size === 1 && b.size === 1) {
    const [x] = a; const [y] = b;
    return x === y ? 0 : 1;
  }
  // Multi-label sob nominal: reduz a first-code alfabético (preserva semântica atual)
  const reduce = (s: ReadonlySet<string>) => [...s].sort()[0]!;
  return reduce(a) === reduce(b) ? 0 : 1;
}
```

### `src/core/icr/distances/jaccard.ts` (NOVO)

```typescript
/**
 * Jaccard distance: 1 − |A ∩ B| / |A ∪ B|.
 * - 0 quando sets idênticos
 * - 1 quando disjoint
 * - Caso parcial: {a,b} vs {a,c} = 1 − 1/3 = 0.667
 *
 * Pra singletons (|A|=|B|=1) é equivalente a δ_nominal — invariante importante
 * pra retrocompatibilidade de tests single-label.
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

### `src/core/icr/distances/masi.ts` (NOVO)

```typescript
/**
 * MASI distance (Passonneau 2006): 1 − (|A ∩ B| / |A ∪ B|) × M
 * Onde M é fator de monotonicidade:
 *   M = 1   se A == B
 *   M = 2/3 se A ⊂ B ou B ⊂ A (uma é subset estrita da outra)
 *   M = 1/3 se A ∩ B ≠ ∅ mas nem A ⊂ B nem B ⊂ A (overlap lateral)
 *   M = 0   se A ∩ B = ∅
 *
 * MASI penaliza overlap lateral mais que Jaccard, e premia subset relation mais que Jaccard.
 *
 * CUIDADO: implementação NLTK (`nltk.metrics.masi_distance`) diverge de Passonneau
 * (issue #294 aberto desde 2012). Esta implementação segue a fórmula direta da paper.
 */
export function distanceMASI(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  if (intersection === 0) return 1;
  const union = a.size + b.size - intersection;
  // Fator M
  let m: number;
  if (a.size === b.size && intersection === a.size) m = 1;       // A == B
  else if (intersection === a.size || intersection === b.size) m = 2 / 3;  // subset estrito
  else m = 1 / 3;                                                 // overlap lateral
  return 1 - (intersection / union) * m;
}
```

**Casos numéricos de invariante** (cobertos em tests):

| Caso | Jaccard | MASI |
|---|---|---|
| `{a,b}` vs `{a,b}` (idênticos) | 0 | 0 |
| `{a,b}` vs `{a,b,c}` (subset) | 0.333 | 0.555 |
| `{a,b}` vs `{a,c}` (overlap lateral) | 0.667 | 0.889 |
| `{a,b}` vs `{c,d}` (disjoint) | 1 | 1 |
| `{a}` vs `{a}` (single-label agree) | 0 | 0 |
| `{a}` vs `{b}` (single-label disagree) | 1 | 1 |

### `src/core/icr/coefficients/krippendorffAlpha.ts` (MODIFICADO — paramétrico)

Assinatura nova:

```typescript
export interface KrippendorffAlphaOptions {
  distance?: DistanceFunction;  // default: distanceNominal
}

export type DistanceFunction = (a: ReadonlySet<string>, b: ReadonlySet<string>) => number;

export function krippendorffAlpha(
  input: KappaInput,
  options: KrippendorffAlphaOptions = {},
): KappaReport {
  const δ = options.distance ?? distanceNominal;
  // ... resto do cálculo usa δ(setA, setB) no lugar da redução first-code
}
```

`D_o` (observed): pra cada unit, soma de `δ(coder_i_set, coder_j_set)` pra todos pares de coders, normalizado por número de pares.

`D_e` (expected): distribuição empírica de sets observados (não enumerar todos sets possíveis — receita standard pra evitar explosão de Pe). Pra cada par de sets observados, peso = produto das frequências marginais, vezes δ entre os sets.

**Performance:** `δ_jaccard` e `δ_MASI` são O(|A| + |B|). Custo dominante continua sendo o loop sobre pares de coders × units. Caches existentes do reporter (`extractInputsFromScope`, `cacheKeyForScope`) seguem aplicáveis sem mudança.

### `src/core/icr/coefficients/krippendorffAlphaCategorical.ts` (MODIFICADO — paramétrico)

Mesma assinatura, mesmo fluxo. Diferença é que units são categóricas (CSV rows) em vez de char-level.

### `src/core/icr/coefficients/cuAlpha.ts` (MODIFICADO — herda)

cu-α (continuous unitization α) reusa Krippendorff α dentro do escopo de boundaries compartilhadas. Recebe `KrippendorffAlphaOptions` e propaga.

### `src/core/icr/coefficients/cohenKappa.ts` (MODIFICADO — caminho A)

Pseudocódigo:

```typescript
export function cohenKappa(input: KappaInput): KappaReport {
  const codeUniverse = collectAllCodes(input);  // union de todos codes vistos
  if (codeUniverse.size === 0) return emptyReport();

  const perCodeKappas: number[] = [];
  for (const code of codeUniverse) {
    // Matriz 2×2 (presença/ausência de `code` em coder A vs coder B) pra cada unit
    const matrix = buildPresenceMatrix(input, code);  // [[a, b], [c, d]]
    const kappa = computeCohenKappa2x2(matrix);       // fórmula clássica
    perCodeKappas.push(kappa);
  }

  // Macro-average
  const avgKappa = perCodeKappas.reduce((s, k) => s + k, 0) / perCodeKappas.length;

  return {
    value: avgKappa,
    perCode: Object.fromEntries(zip(codeUniverse, perCodeKappas)),
    ...
  };
}
```

**Nota:** report agora carrega `perCode: Record<codeId, number>` adicionalmente ao `value`. Pesquisador pode inspecionar quais codes têm baixo agreement. Drill-down Cards/Workflow podem mostrar essa decomposição.

### `src/core/icr/coefficients/cohenKappaCategorical.ts` (MODIFICADO — caminho A)

Idem, pra escopos categóricos (CSV cod rows).

### `src/core/icr/coefficients/fleissKappa.ts` (MODIFICADO — fallback)

Detecção de multi-label no escopo:

```typescript
export function fleissKappa(input: KappaInput, options?: KrippendorffAlphaOptions): KappaReport {
  if (hasMultiLabelMarkers(input)) {
    // Fallback automático pra Krippendorff α com δ ativa
    return krippendorffAlpha(input, options);
  }
  // Cálculo Fleiss κ clássico (single-label)
  // ...
}
```

Reporter expõe ambos no UI mas o `value` interno pra Fleiss vira o de α quando há multi-label. Tooltip no chip cinza explica: "Fleiss κ é caso particular de Krippendorff α — usado quando todos os markers no escopo são single-label."

### `src/core/icr/coefficients/fleissKappaCategorical.ts` (MODIFICADO — fallback)

Idem.

### `src/core/icr/coefficients/alphaBinary.ts` (INALTERADO)

Já set-collapsed. Sem mudança.

---

## §3 — 7 sites a tocar (concretamente)

Lista exhaustiva pra implementação. Cada linha = 1 modificação atômica.

| # | Arquivo:linha (antes) | Ação |
|---|---|---|
| 1 | `cohenKappa.ts:30,31` (uso de `pickFirstCode`) | Remove `pickFirstCode`. Substitui por loop binary-per-label sobre `codeUniverse`. |
| 2 | `cohenKappa.ts:61` (definição de `pickFirstCode`) | Remove função. |
| 3 | `cohenKappaCategorical.ts:30` (`[...sort()[0]]`) | Remove redução. Loop binary-per-label. |
| 4 | `fleissKappa.ts:32` (`[...sort()[0]]`) | Adiciona check `hasMultiLabelMarkers`. Se sim, delega pra `krippendorffAlpha`. Senão, mantém cálculo Fleiss clássico (sem a redução — `[...sort()[0]]` removido). |
| 5 | `fleissKappaCategorical.ts:26` (`[...sort()[0]]`) | Idem #4 (delega pra `krippendorffAlphaCategorical`). |
| 6 | `krippendorffAlpha.ts:34` (`[...sort()[0]]`) | Remove redução. Recebe `distance` em options; usa `δ(setA, setB)` direto sobre os sets. |
| 7 | `krippendorffAlphaCategorical.ts:22` (`[...sort()[0]]`) | Idem #6. |

`cuAlpha.ts` não tem redução própria (reusa α), então não conta como site separado — herda automaticamente o paramétrico.

---

## §4 — Test strategy

### 4.1 Tests single-label existentes (~95% do que existe)

**Permanecem idênticos.** Invariante: δ_jaccard e δ_MASI entre singletons são equivalentes a δ_nominal (`d({a},{a})=0`, `d({a},{b})=1`). Tests que usam `codeIds: ['c1']` continuam passando sem mudança.

Verificação: rodar suite atual após introduzir as δ paramétricas com default `δ_nominal` — todos os 217 tests do motor κ devem passar. Esse é o checkpoint de "refactor não regrediu".

### 4.2 Tests multi-label existentes

Doc da pasta-irmã (`multi-label-kappa-2026-05-09.md` linhas 174-176) registrou que a maioria dos tests multi-label hoje é single-label disfarçado. Único caso conhecido: bbox adapter cenário 3 com `{aaa}` vs `{zzz}` (sets disjoint single-element — segue idêntico em qualquer δ).

**Ação:** triagem rápida (~30 min). Pra cada test que usa `codeIds` com tamanho > 1, decidir:
- Single-label disfarçado (todos sets têm tamanho 1 ou são disjoint single-element) → permanece.
- Multi-label real (subset/overlap lateral existem) → revisar expected value pra δ_jaccard (e δ_MASI separadamente).

### 4.3 Tests novos (cobertura da feature nova)

Cobertura por matriz **distância × coeficiente × caso**:

**Distâncias** (`tests/core/icr/distances/`):
- `jaccard.test.ts` — 6 casos canônicos (idêntico, subset, overlap lateral, disjoint, single-agree, single-disagree).
- `masi.test.ts` — 6 casos canônicos com expected values diferentes nos subset/lateral.
- `nominal.test.ts` — confirma equivalência com comportamento atual.

**Coeficientes paramétricos** (`tests/core/icr/coefficients/`):
- `krippendorffAlpha.test.ts` — pra cada δ (nominal, jaccard, masi), rodar cenário multi-label de 3 coders com sets idêntico/subset/lateral/disjoint. Validar D_o e D_e numericamente.
- `krippendorffAlphaCategorical.test.ts` — idem pra CSV cod row.
- `cuAlpha.test.ts` — validar propagação de δ pra α subjacente.

**Coeficientes redesenhados:**
- `cohenKappa.test.ts` — caminho A binary-per-label. Cenário: 3 codes no universo, 2 coders, mix de single/multi-label. Validar perCode + macro-average.
- `cohenKappaCategorical.test.ts` — idem.
- `fleissKappa.test.ts` — escopo single-label → cálculo Fleiss clássico; escopo multi-label → delegação pra α. Validar ambos paths.
- `fleissKappaCategorical.test.ts` — idem.

**Integration tests** (`tests/core/icr/integration/`):
- `reporter-multilabel.test.ts` — KappaReport produzido pelo `reportKappa(input, {distance: 'masi'})` matcha valores esperados em corpus sintético com 4 markers (1 por caso canônico).
- `reporter-fallback.test.ts` — Fleiss κ aplicado a escopo com 1 marker multi-label devolve resultado de α correspondente.

### 4.4 Smoke real em vault (checkpoint obrigatório)

Após implementação, abrir vault workbench com seed estendido (já existe `scripts/seed-smoke-icr.mjs` com F5-multilabel.md cobrindo 4 casos canônicos × 3 coders):

1. Compare Coders → matriz Mode A com `α` + δ Jaccard. Validar que F5 L2 e L4 deixam de contar como agreement total (κ cai vs. estado atual com first-code).
2. Trocar pra δ MASI. Validar que κ cai ainda mais nos overlap laterais.
3. Trocar pra Cohen κ. Validar que toggle Jaccard/MASI fica cinza (caminho A não usa δ).
4. Trocar pra α-binary. Validar que toggle Jaccard/MASI continua cinza (set-collapsed).
5. Filtrar escopo pra incluir só F1-F4 (single-label puro). Validar que toggle fica cinza, badge "0 markers multi-label" aparece, número idêntico ao estado atual.

Esse smoke é obrigatório por chunk de implementação — Checkpoint do CLAUDE.md §1.

### 4.5 Recalibração contemplada

Esperado: ~10-30 tests existentes revisados (multi-label existente). Tests novos: ~40-60. Total estimado pós-refactor: ~270-300 tests no motor κ (vs ~217 hoje).

---

## §5 — UI changes

### 5.1 Compare Coders toolbar

Layout atual:
```
COEFFICIENT [Cohen κ] [Fleiss κ] [α] [α-binary] [cu-α]    [↗ ver lado a lado] [exportar]
```

Layout novo:
```
COEFFICIENT [Cohen κ] [Fleiss κ] [α] [α-binary] [cu-α]   ·   Distance: [Jaccard] [MASI]    [↗ ver lado a lado] [exportar]
```

Posição do chip Distance: após `cu-α`, antes de "ver lado a lado". Mesma família visual (chip pill com 2 opções selecionáveis).

### 5.2 Visibilidade do chip Distance

Sempre presente. Estado visual reflete relevância:

| Condição | Estado | Tooltip ao hover |
|---|---|---|
| Coefficient ∈ {α, cu-α, Fleiss κ} **E** escopo tem ≥ 1 marker multi-label | **Ativo** (escolha do user pinta lavanda) | "Jaccard penaliza overlap parcial proporcional à interseção. MASI adiciona fator de monotonicidade (subset vs lateral)." |
| Coefficient ∈ {Cohen κ, α-binary} | **Cinza desabilitado** | "Distance metric não se aplica ao Cohen κ multi-label (caminho binary-per-label). Para α / cu-α / Fleiss." |
| Coefficient correto **MAS** escopo todo single-label | **Cinza desabilitado** | "Todos os markers no escopo são single-label. Jaccard e MASI produzem resultado idêntico ao nominal." |

Regra geral cravada: chip sempre presente (consistência espacial). Estado visual comunica relevância. Sem "magic UI" de sumir/aparecer.

### 5.3 Badge de densidade

Acima ou ao lado da matriz de overview:

```
12 / 34 markers multi-label no escopo (35%)
```

Hover: tooltip explica "Markers com 2+ códigos aplicados. Jaccard e MASI tratam essas regiões com distância parcial em vez de redução first-code."

Padrão visual: badge inline pequeno, mesma família visual dos chips de filtro existentes. Sem chip novo no toolbar — fica perto do resultado.

### 5.4 Drill-down (Cards / Workflow / Spatial)

**Cravado:** reusar padrões visuais existentes, sem inventar UI nova.

- **Spatial:** regiões já são pintadas por categoria de agreement (agree / disagree code / disagree existence). Adição: marker multi-label entra na mesma classificação calculada pela δ ativa.
- **Cards/Workflow:** cada card de região já mostra códigos aplicados por coder. Set multi-label renderiza como múltiplos chips (já funciona — vimos no print do popover do F5).
- **Sem UI nova** pra "regiões que mudam de classificação ao trocar δ". Pesquisador troca o toggle e vê as regiões re-classificarem no lugar (afford visual já existente). Implementação fica responsiva ao toggle via reactividade existente.

Se eventualmente surgir necessidade de filtro/destaque explícito, entra como evolução fora deste refactor.

### 5.5 SavedComparison

Schema ganha um campo:

```typescript
interface SavedComparison {
  // ... campos existentes
  view: {
    overviewMode: ...
    drilldownMode: ...
    primaryCoefficient: ...
    distance?: 'nominal' | 'jaccard' | 'masi';   // NOVO
  }
}
```

Default `'jaccard'` (decisão D1). SavedComparisons existentes ganham o campo automaticamente na primeira leitura. Não há migration code: zero usuários, sem backcompat.

### 5.6 Tooltip educativo

Hover no chip ativo `Distance` explica diferença:
> "Jaccard: distância entre sets baseada em interseção/união. Padrão amplamente defendido em literatura.
> MASI: Jaccard com fator de monotonicidade — penaliza overlap lateral mais que subset. Padrão em annotation semântica (Passonneau 2006)."

Hover no badge densidade explica multi-label:
> "Markers com 2+ códigos aplicados pelo mesmo coder. δ ativa decide como medir agreement parcial."

---

## §6 — Migration / backcompat

**Zero usuários.** Não existe migration code inline.

- `SavedComparison.view.distance` default `'jaccard'` na primeira leitura — sem migration script.
- Tests recalibrados como parte do refactor — não risco, é o conteúdo.
- `data.json` do vault workbench (teste real) será reseteado pelo seed (`scripts/seed-smoke-icr.mjs` já contempla F5-multilabel.md).

---

## §7 — Performance

- δ_jaccard e δ_MASI: O(|A| + |B|) — irrisório vs custo dos loops do α.
- α paramétrico: mesmo custo do α atual; troca de `[...sort()[0]]` (O(N log N) por unit) por `δ(setA, setB)` (O(|A|+|B|) — mais barato em sets pequenos).
- Cohen κ caminho A: O(|codeUniverse| × units × coderPairs). Pior caso vs single-label hoje: multiplicado por |codeUniverse|. Pra códigos típicos (10-30 codes no projeto), aceitável. Caches do reporter (`extractInputsFromScope`, `cacheKeyForScope`) seguem aplicáveis.
- Web Worker pattern (`kappa.worker.ts`) cobre todos os coeficientes — refactor não muda esse padrão (TECHNICAL-PATTERNS §45).

**Atenção §46 (TECHNICAL-PATTERNS):** o toggle Jaccard/MASI viaja no `KappaOptions`, **não** no `scope` que vai pra `extractInputsFromScope`. Mesma regra do `visibleCoderIds`. Cache key NÃO inclui distance — input é o mesmo, output difere. Cache hash precisa incluir `distance` separadamente (campo no cacheKey além de scope).

---

## §8 — Estimativa de esforço (com comparáveis)

Consultar `git log --stat` de:
- `2026-05-09 Slice 6 bbox adapter` (commit-to-commit): 6 módulos novos + 49 tests, ~1 sessão concentrada.
- `2026-05-10 Slice E1 Compare Coders skeleton`: 43 tests novos, ~1 sessão.

C tem escopo comparável: 3 módulos novos (`distances/{nominal,jaccard,masi}.ts`) + 7 sites modificados + ~40-60 tests novos + UI (chip + badge) + methodology doc. Estimativa: **comparável a 1 slice grande tipo E1 ou E5b**.

Sem chute de horas. Comparáveis dizem que é 1 slice concentrado.

---

## §9 — Slicing proposto

Sliceable em 3 chunks (cada um termina em commit + smoke real):

**Slice C1 — Distâncias + Krippendorff α + cu-α paramétricos**
- `distances/{nominal,jaccard,masi}.ts` com tests
- `krippendorffAlpha.ts` + `krippendorffAlphaCategorical.ts` + `cuAlpha.ts` paramétricos
- Tests single-label existentes ainda passam (invariante: default `nominal` ≡ comportamento atual)
- Smoke: seed F5, abrir Compare Coders, trocar α + Jaccard, observar κ cair em L2/L4

**Slice C2 — Cohen κ caminho A + Fleiss fallback**
- `cohenKappa.ts` + `cohenKappaCategorical.ts` redesenhados (binary-per-label macro)
- `fleissKappa.ts` + `fleissKappaCategorical.ts` com fallback automático
- Remove `pickFirstCode`
- Tests recalibrados
- Smoke: trocar Cohen κ no Compare Coders, validar perCode breakdown disponível

**Slice C3 — UI (toggle + badge + tooltip) + SavedComparison + methodology doc**
- Chip `Distance: [Jaccard] [MASI]` no toolbar com estados visuais
- Badge de densidade
- Tooltips
- `SavedComparison.view.distance` persistido
- `docs/ICR-SET-VALUED-METHODOLOGY.md` user-facing
- `docs/ICR-METHODOLOGY.md` atualizado (caveat aponta pro novo doc)
- Smoke completo: 5 cenários do §4.4

Cada slice é mergeable independentemente. C1 já entrega valor (α + cu-α set-valued correto) mesmo sem UI ou Cohen redesenhado.

---

## §10 — Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Tests existentes regridem por mudança implícita | Baixa | Invariante Jaccard ≡ nominal pra singletons cobre 95% dos tests. Suite atual roda em CI antes de cada commit. |
| Cohen κ caminho A produz números muito diferentes de today | **Médio** (vai produzir mesmo) | É a feature. Pesquisador deve esperar mudança — UI badge + tooltip explicam. Methodology doc cobre. |
| Performance regride com universo de codes grande | Baixa | Caches do reporter cobrem. Web Worker já existe. Profiling smoke se necessário. |
| Pesquisador confunde "Cohen κ pareado" com "Cohen κ multi-label" (mesmo rótulo no UI) | Baixa | Tooltip + methodology doc explicam que Cohen κ multi-label é caminho A binary-per-label, paridade com NVivo. |
| MASI implementado errado (NLTK divergence) | Baixa | Spec inclui fórmula explícita de Passonneau. Tests cobrem 6 casos canônicos com expected values numéricos. |

---

## Appendix A — Alternativas rejeitadas

### A.1 — Cohen κ multi-label via caminho B (Rosenberg & Binkowski 2004 augmented)

Rejeitado. Caminho B generaliza P_o com set agreement parcial ponderado (similar a MASI/Jaccard) e P_e sobre frequência marginal de sets. Mais teoricamente limpo que A, mas:
- Pesquisador QDA típico não conhece Rosenberg & Binkowski (paper é da computational linguistics, 2004, ACL).
- Caminho A tem paridade direta com NVivo Coding Comparison Query — o que o pesquisador espera ao escolher "Cohen κ".
- Caminho C (weighted set-valued) é matematicamente equivalente a α pareado com mesma δ — manter como "Cohen κ" duplicaria rótulo.

Caminho A vence em **legibilidade e defendabilidade ubíqua**.

### A.2 — Cohen κ via caminho C (weighted set-valued ≡ α pareado)

Rejeitado pelo motivo acima: ≡ α pareado, redundância.

### A.3 — Manter Fleiss κ multi-label via binary-per-label macro

Rejeitado. Fleiss κ é caso particular de Krippendorff α com N coders. Manter "Fleiss κ" como rótulo separado pra mesmo cálculo confunde — pesquisador acha que são métricas diferentes. Fallback automático pra α + chip cinza explicativo é mais honesto.

### A.4 — Toggle Jaccard/MASI como setting global do plugin

Rejeitado. Regra cravada em `MEMORY.md > feedback_no_settings_for_internals`: detalhe técnico NÃO vira setting. Decisão metodológica viaja com SavedComparison (defendabilidade em paper junto com o doc). Setting global esconde a escolha.

### A.5 — Sempre mostrar Jaccard E MASI lado a lado (sem toggle)

Rejeitado. Pesquisa em literatura (Krippendorff 2018, Passonneau 2006, NLP/ML padrão) confirmou: prática é **escolher uma e justificar**. Mostrar duas obriga pesquisador a entender ambas — confunde mais que informa. Custo cognitivo > ganho de auditoria pra perfil-alvo do plugin.

### A.6 — Aggregate cross-engine (item B4) atacado neste refactor

Rejeitado por ortogonalidade. C resolve agregação dentro de um marker (set-valued). B4 resolve agregação entre engines com unidades semanticamente heterogêneas (1 marker pdf-text ≠ 1 bbox ≠ 1 categorical). Problemas diferentes, atacáveis independentemente.

---

## Appendix B — Pointer pra methodology user-facing

Doc: `docs/ICR-SET-VALUED-METHODOLOGY.md`.

Audiência: pesquisador defendendo método em paper, ou avaliando se plugin é defendable pra publicação.

Conteúdo previsto:
- Como funciona em uma página
- Por que duas distâncias (Jaccard e MASI)
- Quando usar Jaccard (default) vs MASI (annotation semântica/pragmática)
- O que muda no número κ quando o corpus tem multi-código
- Referências bibliográficas

Spec autoritativo é este documento. Methodology é leitura curta, sem implementação interna.
