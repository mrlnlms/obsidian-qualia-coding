# ICR Slice E2 — Modes B/C + Modal "ver lado a lado" + bbox integration Implementation Plan

> **For agentic workers:** Execução inline (regra do projeto: SDD overkill — `feedback_sdd_overkill_for_dev_project.md`; sem worktree — `feedback_no_worktrees.md`). TDD por task. Smoke real obrigatório no fim de cada chunk de UI.

**Goal:** Completar o overview da Compare Coders View (Mode B tabela por código + Mode C heatmap código×engine), integrar bbox engines (pdfShape + image) na matriz/heatmap via per-pair pathway, ativar coefficient picker funcional + filter "esconder agreement total", entregar Modal "ver lado a lado" com diagnóstico narrativo + export markdown, e fechar polish E1 (coders sem markers).

**Architecture:** Reuso integral da infra do E1 (state central, `extractInputsFromScope` cohort, `reportPairwise`, color scale). Coefficient picker centraliza o coeficiente ativo via `state.primaryCoefficient`; helper puro `getCoefficientValue(report, coefficient, pair?)` extrai o número certo dos `KappaReport` por mode. Bbox segue caminho separado: novo helper `computeBboxKappaForPair(scope, ctx, pair, options)` chama `bboxAdapter.buildKappaInput` per-pair e devolve Cohen κ; UI integra como engine virtual `'spatial-bbox'` (default unified pdfShape+image) ou desempilha em colunas separadas via toggle. Modes B e C seguem o pattern de `overviewMatrix.ts` (render funcional injetando deps). Modal usa pattern de `mergeModal.ts`. Polish E1 vira filter `includeCodersWithoutMarkers` que filtra `scope.coderIds` antes de renderizar.

**Tech Stack:** TypeScript strict, Vitest + jsdom, Modal API do Obsidian, infra existente (sem deps novas).

**Pré-requisitos** (já feitos):
- Slice E1 entregue (commit `dc0311d` 2026-05-10): shell + Mode A + P1 spatial + filter chips + comando palette
- Slices ICR 1-6 entregues: motor κ + 6 das 6 engines cobertas (text-likes + temporal + categorical + bbox)
- Spec aprovada em `docs/superpowers/specs/2026-05-09-icr-compare-coders-design.md` (§3.2, §3.3, §6 cobrem este slice)
- BACKLOG registra polish E1 + bbox em matriz/heatmap como tarefas E2 (`docs/BACKLOG.md` §"ICR — Compare Coders polish")
- Vault `obsidian-plugins-workbench` tem seed `ICR-test/` (markdown + pdf + csv com 3 coders + 5 codes; falta seed bbox real — ver Smoke da Chunk 2)

**Decisões cravadas (referência rápida — §3.2, §3.3, §6 da spec + decisões 2026-05-10):**
- 5 chips lado a lado pra coefficient picker (cohen, fleiss, alpha, alpha-binary, cu-alpha). Chip disabled quando coeficiente não se aplica ao escopo
- Bbox engines unificados como coluna `'spatial-bbox'` por default; toggle filter `splitBboxEngines` no toolbar desempilha em colunas separadas `pdfShape` + `image` no heatmap (e na matriz, quando primaryCoefficient é Cohen)
- Polish E1: filter `includeCodersWithoutMarkers` (default `false`) — coders com 0 markers no escopo são escondidos da matriz/tabela/heatmap. Toggle no toolbar reincluí com cells cinza
- Filter `hideAgreementTotal`: cells/linhas com κ > 0.8 viram cinza fade (não somem — preserva layout). Aplicável nos 3 modes
- Modal: 2 estados toggle no header (`par único` / `todos os pares`); diagnóstico narrativo dismissable com 3 padrões reconhecíveis (spec §6); export markdown via `↧ exportar markdown` no footer
- Diagnóstico narrativo controlado por setting `icr.showNarrativeDiagnosis` (default `true`)
- Migration: zero (zero usuários, regras do projeto cravam)

**APIs verificadas (`grep` em 2026-05-10):**
- `EngineId` em `src/core/icr/reporter.ts:24`: `'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'audio' | 'video' | 'pdfShape' | 'image'`. **Não vamos adicionar `'spatial-bbox'` no EngineId** — esse é label de UI no heatmap, não engine real do reporter
- `reportPairwise` em `reporter.ts:178` retorna `PairwiseReport[]` com `aggregate.cohenKappa[a|b]` ou `[b|a]` (tem que normalizar lookup)
- `bboxAdapter.buildKappaInput` em `src/core/icr/bboxAdapter.ts:43` é per-pair: aceita `{ pdfShapeMarkers, imageMarkers, coders: { a, b }, theta, gridSize? }` → `KappaInput`. Já trata casos vazios/assimétricos
- `computeAll` no reporter (`reporter.ts:84`): pra Cohen κ extrai `cohenKappa[`${a}|${b}`]` keyed por par; alphaBinary/cuAlpha retornam 1 vacuous quando categorical (csvRow)
- Plugin instance fields: `this.markdownModel`, `this.pdfModel` (com `getAllShapeMarkers()` — confirmar), `this.csvModel`, `this.imageModel` (confirmar), `this.audioModel`, `this.videoModel`. Imagem e PDF shape access verificar no Step 1 da Chunk 2
- AG Grid `cellStyle` callback já em uso no E1 (csvCodingView.setCompareMode) — não toca neste slice
- Modal pattern: `class FooModal extends Modal { constructor(app); onOpen() { ... }; onClose() {...} }` — exemplo `mergeModal.ts`
- `app.workspace.openLinkText` ou `vault.create` pra export markdown — pattern já em uso (verificar paths)

**Out of scope (reentra em slices futuros):**
- Reconciliação UI (P2 cards + 4 ações + audit `reconciliation_*`) → Slice E3a
- Drill-down P3 workflow + κ pré/pós + export relatório → Slice E3b
- Saved Comparisons + ribbon + atalho contextual → Slice E4
- Audio/vídeo no drill-down spatial → Fase 2 dessa frente
- bbox no drill-down spatial → Fase 2 (heatmap/matriz no E2 já aborda overview; spatial bbox visualization é outro nível)

---

## File Structure

```
src/core/icr/
  ui/
    coefficientResolver.ts             (create) — getCoefficientValue + isCoefficientApplicable
    coefficientPicker.ts               (create) — renderCoefficientPicker (5 chips)
    bboxScopeExtraction.ts             (create) — computeBboxKappaForPair + helpers
    overviewMatrix.ts                  (modify) — usa primaryCoefficient + integra bbox
    overviewTable.ts                   (create) — Mode B
    overviewHeatmap.ts                 (create) — Mode C
    filterChips.ts                     (modify) — incluir coders sem markers + split bbox
    coderInclusion.ts                  (create) — getCodersWithMarkersInScope + applyCoderInclusion
    compareCoderCoefficientsModal.ts   (create) — Modal ver lado a lado
    narrativeDiagnostic.ts             (create) — analyzeDiagnostic puro
    overviewSharedRender.ts            (create) — kappaClass/coloring helpers extraídos do matrix
    unifiedCompareCodersView.ts        (modify) — plug Modes B/C + picker + modal botão
    compareCodersTypes.ts              (modify) — add splitBboxEngines + includeCodersWithoutMarkers
  scopeExtraction.ts                   (modify) — não toca (bbox path é separado)

src/main.ts                            (modify) — setting opt-out diagnóstico narrativo
src/settings/qualiaSettingsTab.ts      (modify) — toggle setting
styles.css                             (modify) — picker chips, table, heatmap, modal, fade

tests/core/icr/ui/
  coefficientResolver.test.ts          (create)
  bboxScopeExtraction.test.ts          (create)
  overviewMatrix.test.ts               (modify) — testa picker + bbox + filter
  overviewTable.test.ts                (create)
  overviewHeatmap.test.ts              (create)
  coderInclusion.test.ts               (create)
  narrativeDiagnostic.test.ts          (create)
  compareCoderCoefficientsModal.test.ts (create)
  filterChips.test.ts                  (modify) — testa novos chips
```

**Por que essa decomposição:**
- `coefficientResolver.ts` puro — caller único hoje (matrix), mas Modes B/C/Modal vão consumir; isolado pra reuso e teste granular
- `bboxScopeExtraction.ts` separado de `scopeExtraction.ts` porque pathway é per-pair (slice 6) e mistura iria poluir cohort-level; manter ortogonal
- `overviewSharedRender.ts` extrai `kappaClass` + thresholds (hoje em `overviewMatrix.ts:92-99`) pra evitar duplicação nos 3 modes
- `narrativeDiagnostic.ts` puro com inputs `{ cohen, alphaBinary, cuAlpha }` → string[] de mensagens — testável sem DOM
- `coderInclusion.ts` + `bboxScopeExtraction.ts` — mesmo pattern de helpers puros do scopeExtraction (deps `models` injected)

---

## Chunk 1: Coefficient resolver + picker funcional + matrix usa primaryCoefficient

### Task 1: `coefficientResolver.ts` — extrai valor + aplicabilidade

**Files:**
- Create: `src/core/icr/ui/coefficientResolver.ts`
- Create: `tests/core/icr/ui/coefficientResolver.test.ts`

**Why:** Matrix/Tabela/Heatmap todos precisam ler 1 coeficiente do `KappaReport`. Cohen é per-pair (`aggregate.cohenKappa[a|b]`); outros são scalar (`aggregate.fleissKappa` etc). Aplicabilidade depende de N coders + tipo de engines no escopo.

- [ ] **Step 1: Write failing test**

```ts
// tests/core/icr/ui/coefficientResolver.test.ts
import { describe, it, expect } from 'vitest';
import { getCoefficientValue, isCoefficientApplicable } from '../../../../src/core/icr/ui/coefficientResolver';
import type { KappaReport, EngineId } from '../../../../src/core/icr/reporter';

const baseAggregate = {
  cohenKappa: { 'human:a|human:b': 0.5 },
  fleissKappa: 0.6,
  alphaNominal: 0.7,
  alphaBinary: 0.8,
  cuAlpha: 0.9,
};
const report: KappaReport = { byEngine: {}, aggregate: baseAggregate, weights: {}, aggregateWarnings: [] };

describe('getCoefficientValue', () => {
  it('Cohen κ por par (ordem normalizada a|b ou b|a)', () => {
    expect(getCoefficientValue(report, 'cohen', ['human:a', 'human:b'])).toBe(0.5);
    expect(getCoefficientValue(report, 'cohen', ['human:b', 'human:a'])).toBe(0.5);
  });

  it('Cohen sem par retorna undefined', () => {
    expect(getCoefficientValue(report, 'cohen')).toBeUndefined();
  });

  it('coeficientes scalar não usam pair', () => {
    expect(getCoefficientValue(report, 'fleiss')).toBe(0.6);
    expect(getCoefficientValue(report, 'alpha')).toBe(0.7);
    expect(getCoefficientValue(report, 'alpha-binary')).toBe(0.8);
    expect(getCoefficientValue(report, 'cu-alpha')).toBe(0.9);
  });

  it('Cohen pra par sem entry retorna undefined', () => {
    expect(getCoefficientValue(report, 'cohen', ['human:a', 'human:c'])).toBeUndefined();
  });
});

describe('isCoefficientApplicable', () => {
  const textEngines: EngineId[] = ['markdown', 'pdf'];
  const csvRowOnly: EngineId[] = ['csvRow'];

  it('Cohen pareado sempre aplicável', () => {
    expect(isCoefficientApplicable('cohen', 2, textEngines)).toBe(true);
    expect(isCoefficientApplicable('cohen', 5, textEngines)).toBe(true);
  });

  it('Fleiss requer 3+ coders', () => {
    expect(isCoefficientApplicable('fleiss', 2, textEngines)).toBe(false);
    expect(isCoefficientApplicable('fleiss', 3, textEngines)).toBe(true);
  });

  it('alpha-binary e cu-alpha n/a quando todas engines são csvRow', () => {
    expect(isCoefficientApplicable('alpha-binary', 3, csvRowOnly)).toBe(false);
    expect(isCoefficientApplicable('cu-alpha', 3, csvRowOnly)).toBe(false);
  });

  it('alpha-binary e cu-alpha aplicáveis quando há text-likes mesmo com csvRow', () => {
    expect(isCoefficientApplicable('alpha-binary', 3, ['csvRow', 'markdown'])).toBe(true);
  });

  it('alpha (nominal) sempre aplicável', () => {
    expect(isCoefficientApplicable('alpha', 2, csvRowOnly)).toBe(true);
    expect(isCoefficientApplicable('alpha', 5, textEngines)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (fail)** — `npx vitest run tests/core/icr/ui/coefficientResolver.test.ts`. Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// src/core/icr/ui/coefficientResolver.ts
import type { CoderId } from '../coderTypes';
import type { CoefficientKey } from './compareCodersTypes';
import type { KappaReport, EngineId } from '../reporter';

export function getCoefficientValue(
  report: KappaReport,
  coefficient: CoefficientKey,
  pair?: [CoderId, CoderId],
): number | undefined {
  if (coefficient === 'cohen') {
    if (!pair) return undefined;
    const [a, b] = pair;
    const table = report.aggregate.cohenKappa;
    return table[`${a}|${b}`] ?? table[`${b}|${a}`];
  }
  switch (coefficient) {
    case 'fleiss':       return report.aggregate.fleissKappa;
    case 'alpha':        return report.aggregate.alphaNominal;
    case 'alpha-binary': return report.aggregate.alphaBinary;
    case 'cu-alpha':     return report.aggregate.cuAlpha;
  }
}

const TEXT_LIKE: EngineId[] = ['markdown', 'pdf', 'csvSegment'];
const TEMPORAL: EngineId[] = ['audio', 'video'];

export function isCoefficientApplicable(
  coefficient: CoefficientKey,
  coderCount: number,
  engines: EngineId[],
): boolean {
  if (coefficient === 'fleiss') return coderCount >= 3;
  if (coefficient === 'alpha-binary' || coefficient === 'cu-alpha') {
    // Sem boundary: csvRow puro (categórico). Engines com boundary: text-likes + temporal + bbox.
    return engines.some(e => TEXT_LIKE.includes(e) || TEMPORAL.includes(e) || e === 'pdfShape' || e === 'image');
  }
  return true;  // cohen + alpha sempre aplicáveis
}
```

- [ ] **Step 4: Run test (pass)**

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): coefficientResolver — extrai coeficiente do KappaReport + checa aplicabilidade ao escopo"`

### Task 2: `coefficientPicker.ts` — render 5 chips

**Files:**
- Create: `src/core/icr/ui/coefficientPicker.ts`
- Test: cobertura indireta via test do unifiedCompareCodersView (Step 5 da Task 4) — picker é puro DOM, 5 chips com classes; vale o smoke

**Why:** Render isolado do picker pra evitar inflar `unifiedCompareCodersView.ts`. Mesmo pattern de `filterChips.ts`.

- [ ] **Step 1: Implement**

```ts
// src/core/icr/ui/coefficientPicker.ts
import type { CompareCodersViewState, CoefficientKey } from './compareCodersTypes';
import { isCoefficientApplicable } from './coefficientResolver';
import type { EngineId } from '../reporter';

const COEFFICIENTS: { key: CoefficientKey; label: string }[] = [
  { key: 'cohen',        label: 'Cohen κ' },
  { key: 'fleiss',       label: 'Fleiss κ' },
  { key: 'alpha',        label: 'α' },
  { key: 'alpha-binary', label: 'α-binary' },
  { key: 'cu-alpha',     label: 'cu-α' },
];

export interface CoefficientPickerDeps {
  enginesInScope: EngineId[];
}

export function renderCoefficientPicker(
  container: HTMLElement,
  state: CompareCodersViewState,
  deps: CoefficientPickerDeps,
  onSelect: (coefficient: CoefficientKey) => void,
): void {
  container.empty();
  container.addClass('qc-cc-coefficient-picker');
  const coderCount = state.scope.coderIds.length;
  for (const { key, label } of COEFFICIENTS) {
    const applicable = isCoefficientApplicable(key, coderCount, deps.enginesInScope);
    const active = state.primaryCoefficient === key && applicable;
    const chip = container.createSpan({
      cls: `qc-cc-coef-chip ${active ? 'is-active' : ''} ${!applicable ? 'is-disabled' : ''}`,
      text: label,
    });
    chip.dataset.coefficient = key;
    if (!applicable) {
      chip.title = key === 'fleiss'
        ? 'Fleiss κ requer 3+ coders'
        : 'α-binary / cu-α requerem engine com boundary (não aplicável a csvRow puro)';
    } else {
      chip.onclick = () => onSelect(key);
    }
  }
}
```

- [ ] **Step 2: Commit** — `~/.claude/scripts/commit.sh "feat(icr): coefficientPicker — 5 chips no toolbar com disabled state"`

### Task 3: Refactor `overviewMatrix.ts` pra ler `state.primaryCoefficient`

**Files:**
- Modify: `src/core/icr/ui/overviewMatrix.ts`
- Modify: `tests/core/icr/ui/overviewMatrix.test.ts`

**Why:** Hoje matriz é Cohen hardcoded. Trocar pra ler do state via `getCoefficientValue`.

- [ ] **Step 1: Modify test** — adicionar test que muda `primaryCoefficient` e verifica células recalculam

```ts
// tests/core/icr/ui/overviewMatrix.test.ts (adicionar describe)
describe('overviewMatrix · primaryCoefficient', () => {
  it('renderiza Fleiss κ aggregate quando primaryCoefficient = fleiss', async () => {
    const state = makeStateWith3Coders('fleiss');
    const container = document.createElement('div');
    await renderOverviewMatrix(container, state, deps, () => {});
    // Pra 3 coders, todos pares mostram o mesmo valor de Fleiss aggregate restrito ao par
    const cells = container.querySelectorAll('.qc-cc-matrix-cell:not(.is-diagonal)');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach(cell => {
      expect(cell.textContent).toMatch(/^[01]\.\d{2}$/);  // formato 0.XX
    });
  });
});
```

- [ ] **Step 2: Implement** — substituir lookup direto de `cohenKappa` por `getCoefficientValue(report, state.primaryCoefficient, [a,b])`

```ts
// src/core/icr/ui/overviewMatrix.ts (trecho relevante — linha ~50-59)
import { getCoefficientValue } from './coefficientResolver';

// substituir o bloco kappaByPair por:
const kappaByPair = new Map<string, number | undefined>();
for (const r of reports) {
  const [a, b] = r.pair;
  const value = getCoefficientValue(r.report, state.primaryCoefficient, [a, b]);
  const normalKey = a < b ? `${a}|${b}` : `${b}|${a}`;
  kappaByPair.set(normalKey, value);
}
```

- [ ] **Step 3: Run tests (pass)** — `npx vitest run tests/core/icr/ui/overviewMatrix.test.ts`

- [ ] **Step 4: Commit** — `~/.claude/scripts/commit.sh "feat(icr): Mode A matriz lê primaryCoefficient (não mais Cohen hardcoded)"`

### Task 4: Plug picker no `unifiedCompareCodersView.ts`

**Files:**
- Modify: `src/core/icr/ui/unifiedCompareCodersView.ts`
- Modify: `tests/core/icr/ui/unifiedCompareCodersView.test.ts`

- [ ] **Step 1: Add test pra render do picker**

```ts
// adicionar describe('coefficient picker', ...)
it('renderiza 5 chips no toolbar', async () => {
  const view = await openView(plugin);
  const chips = view.contentEl.querySelectorAll('.qc-cc-coef-chip');
  expect(chips.length).toBe(5);
});

it('chip disabled tem is-disabled class quando coeficiente n/a', async () => {
  const view = await openView(pluginWith2Coders);
  const fleissChip = view.contentEl.querySelector('.qc-cc-coef-chip[data-coefficient="fleiss"]');
  expect(fleissChip?.classList.contains('is-disabled')).toBe(true);
});
```

- [ ] **Step 2: Implement** — adicionar chamada `renderCoefficientPicker` no `renderToolbar` e passar enginesInScope (default: todos engines do reporter)

```ts
// src/core/icr/ui/unifiedCompareCodersView.ts — dentro de renderToolbar(), depois do mode picker:
import { renderCoefficientPicker } from './coefficientPicker';

const pickerHolder = this.toolbarEl.createDiv({ cls: 'qc-cc-picker-row' });
const enginesInScope = this.state.scope.engineIds ?? ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video', 'pdfShape', 'image'];
renderCoefficientPicker(pickerHolder, this.state, { enginesInScope }, coefficient => {
  this.updateState({ primaryCoefficient: coefficient });
});
```

- [ ] **Step 3: Style picker chips em styles.css** — reuso visual do `qc-cc-mode-chip` mas com `qc-cc-coef-chip` separado

```css
.qc-cc-picker-row { margin-top: 4px; display: flex; gap: 4px; align-items: center; }
.qc-cc-coef-chip {
  padding: 2px 8px; font-size: 0.85em; border-radius: 12px;
  background: var(--background-secondary); cursor: pointer;
  border: 1px solid var(--background-modifier-border);
}
.qc-cc-coef-chip.is-active { background: var(--interactive-accent); color: var(--text-on-accent); }
.qc-cc-coef-chip.is-disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 4: Run tests** — `npm run test -- tests/core/icr/ui/`

- [ ] **Step 5: Build + smoke real** — checkpoint obrigatório:
  1. `npm run build`
  2. `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/` (se vault demo)
  3. Reload plugin no Obsidian (workbench ou demo)
  4. `Compare Coders: Open` via palette
  5. Vê 5 chips no toolbar entre overview chips e filter chips
  6. Click cada chip ativável → matriz recalcula com novo coeficiente
  7. Confirmar Fleiss disabled com 2 coders / α-binary disabled com csvRow puro
  8. Capture screenshot

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr): coefficient picker funcional no toolbar — Mode A reativo a 5 coeficientes"`

---

## Chunk 2: Bbox per-pair pathway + integração na matriz

### Task 5: Verify pdf shape + image model APIs

**Files:** read-only

- [ ] **Step 1: Grep `getAllShapeMarkers` em `src/pdf/`**:
  ```bash
  grep -n "getAllShapeMarkers\|getAllMarkers\|PdfShapeMarker" src/pdf/*.ts | head -20
  grep -n "getAllMarkers\|ImageMarker" src/image/*.ts | head -20
  ```
- [ ] **Step 2: Confirmar plugin instance fields** em `src/main.ts`:
  ```bash
  grep -n "pdfModel\|imageModel\|pdfShapeModel" src/main.ts
  ```
- [ ] **Step 3: Document findings** — atualizar este plan com paths exatos antes de continuar Task 6 (caso PDF shape e image markers vivam em modelos separados ou misturados)

### Task 6: `bboxScopeExtraction.ts` — coletor + per-pair adapter

**Files:**
- Create: `src/core/icr/ui/bboxScopeExtraction.ts`
- Create: `tests/core/icr/ui/bboxScopeExtraction.test.ts`

**Why:** Bbox é per-pair (slice 6 entregou); cohort `extractInputsFromScope` não cobre. Helper isolado coleta pdfShape + image markers, filtra por scope, e devolve `KappaInput` (ou Cohen κ direto) per-pair. Suporta 2 modos: unified (1 KappaInput com pdfShape ∪ image) e split (1 por engine).

- [ ] **Step 1: Write failing test**

```ts
// tests/core/icr/ui/bboxScopeExtraction.test.ts
import { describe, it, expect } from 'vitest';
import { computeBboxKappaForPair } from '../../../../src/core/icr/ui/bboxScopeExtraction';
import type { PdfShapeMarker } from '../../../../src/pdf/pdfCodingTypes';
import type { ImageMarker } from '../../../../src/image/imageCodingTypes';

function makeShapeMarker(id: string, codedBy: string, codeId: string): PdfShapeMarker {
  return {
    id, fileId: 'p.pdf', page: 1, codedBy, markerType: 'pdf',
    coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    codes: [{ codeId }], color: '#000', createdAt: 0, updatedAt: 0,
  } as unknown as PdfShapeMarker;
}

function makeImageMarker(id: string, codedBy: string, codeId: string): ImageMarker {
  return {
    id, fileId: 'i.png', codedBy, markerType: 'image',
    coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    codes: [{ codeId }], color: '#000', createdAt: 0, updatedAt: 0,
  } as unknown as ImageMarker;
}

describe('computeBboxKappaForPair', () => {
  it('unified: combina pdfShape + image num KappaInput, retorna Cohen κ único', () => {
    const pdf = [makeShapeMarker('s1', 'human:a', 'A'), makeShapeMarker('s2', 'human:b', 'A')];
    const img = [makeImageMarker('i1', 'human:a', 'A'), makeImageMarker('i2', 'human:b', 'A')];
    const r = computeBboxKappaForPair({
      models: { pdf: { getAllShapeMarkers: () => pdf }, image: { getAllMarkers: () => img } },
      scope: { coderIds: ['human:a', 'human:b'] },
      pair: ['human:a', 'human:b'],
      mode: 'unified',
      theta: 0.5,
    });
    expect(r.spatialBbox).toBeDefined();
    expect(typeof r.spatialBbox).toBe('number');
  });

  it('split: pdfShape e image isolados', () => {
    const pdf = [makeShapeMarker('s1', 'human:a', 'A'), makeShapeMarker('s2', 'human:b', 'A')];
    const img = [makeImageMarker('i1', 'human:a', 'A'), makeImageMarker('i2', 'human:b', 'A')];
    const r = computeBboxKappaForPair({
      models: { pdf: { getAllShapeMarkers: () => pdf }, image: { getAllMarkers: () => img } },
      scope: { coderIds: ['human:a', 'human:b'] },
      pair: ['human:a', 'human:b'],
      mode: 'split',
      theta: 0.5,
    });
    expect(r.pdfShape).toBeDefined();
    expect(r.image).toBeDefined();
  });

  it('retorna {} quando não há markers em nenhum lado', () => {
    const r = computeBboxKappaForPair({
      models: { pdf: { getAllShapeMarkers: () => [] }, image: { getAllMarkers: () => [] } },
      scope: { coderIds: ['human:a', 'human:b'] },
      pair: ['human:a', 'human:b'],
      mode: 'unified',
      theta: 0.5,
    });
    expect(r).toEqual({});
  });
});
```

- [ ] **Step 2: Run test (fail)**

- [ ] **Step 3: Implement**

```ts
// src/core/icr/ui/bboxScopeExtraction.ts
import type { PdfShapeMarker } from '../../../pdf/pdfCodingTypes';
import type { ImageMarker } from '../../../image/imageCodingTypes';
import type { CoderId } from '../coderTypes';
import type { ComparisonScope } from './compareCodersTypes';
import { buildKappaInput } from '../bboxAdapter';
import { reportKappa } from '../reporter';

export interface BboxModels {
  pdf?: { getAllShapeMarkers(): PdfShapeMarker[] };
  image?: { getAllMarkers(): ImageMarker[] };
}

export interface BboxKappaParams {
  models: BboxModels;
  scope: ComparisonScope;
  pair: [CoderId, CoderId];
  mode: 'unified' | 'split';
  theta: number;  // default 0.5 caller decide
}

export interface BboxKappaResult {
  spatialBbox?: number;  // mode unified
  pdfShape?: number;     // mode split
  image?: number;        // mode split
}

export function computeBboxKappaForPair(params: BboxKappaParams): BboxKappaResult {
  const { models, scope, pair, mode, theta } = params;
  const pdfAll = models.pdf?.getAllShapeMarkers() ?? [];
  const imgAll = models.image?.getAllMarkers() ?? [];

  const pdfFiltered = filterMarkers(pdfAll, scope, pair);
  const imgFiltered = filterMarkers(imgAll, scope, pair);

  if (pdfFiltered.length === 0 && imgFiltered.length === 0) return {};

  const computePair = (pdf: PdfShapeMarker[], img: ImageMarker[]): number | undefined => {
    if (pdf.length === 0 && img.length === 0) return undefined;
    const input = buildKappaInput({
      pdfShapeMarkers: pdf,
      imageMarkers: img,
      coders: { a: pair[0], b: pair[1] },
      theta,
    });
    if (input.markers.length === 0) return undefined;
    const report = reportKappa([{ engine: 'pdfShape', kappaInput: input }]);
    const k = report.aggregate.cohenKappa[`${pair[0]}|${pair[1]}`] ?? report.aggregate.cohenKappa[`${pair[1]}|${pair[0]}`];
    return k;
  };

  if (mode === 'unified') {
    const k = computePair(pdfFiltered, imgFiltered);
    return k !== undefined ? { spatialBbox: k } : {};
  }

  // split
  const result: BboxKappaResult = {};
  const pdfK = computePair(pdfFiltered, []);
  const imgK = computePair([], imgFiltered);
  if (pdfK !== undefined) result.pdfShape = pdfK;
  if (imgK !== undefined) result.image = imgK;
  return result;
}

type AnyBboxMarker = PdfShapeMarker | ImageMarker;
function filterMarkers<T extends AnyBboxMarker>(markers: T[], scope: ComparisonScope, pair: [CoderId, CoderId]): T[] {
  return markers.filter(m => {
    if (m.codedBy !== pair[0] && m.codedBy !== pair[1]) return false;
    if (scope.codeIds && !m.codes.some(c => scope.codeIds!.includes(c.codeId))) return false;
    if (scope.fileIds && !scope.fileIds.includes(m.fileId)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run test (pass)**

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): bboxScopeExtraction — Cohen κ per-pair pra pdfShape+image (unified/split)"`

### Task 7: Integrar bbox na matriz (Mode A)

**Files:**
- Modify: `src/core/icr/ui/overviewMatrix.ts`
- Modify: `tests/core/icr/ui/overviewMatrix.test.ts`

**Why:** Quando `primaryCoefficient === 'cohen'`, agrega text-likes (já feito pelo cohort) com bbox per-pair via weighted average. Outros coeficientes ignoram bbox (não aplicáveis a binary visual matching com α-binary/cu-α — bbox adapter já reduz a binary unit).

- [ ] **Step 1: Modify test**

```ts
it('Cohen κ inclui bbox quando há pdfShape/image markers no escopo', async () => {
  const state = makeStateWithBbox(['human:a', 'human:b']);
  const deps = makeDepsWithBbox(/* models com pdf shape concorda 100% */);
  const container = document.createElement('div');
  await renderOverviewMatrix(container, state, deps, () => {});
  const cell = container.querySelector('.qc-cc-matrix-cell:not(.is-diagonal)');
  // text-likes vacuous (sem markers) + bbox 1.0 → Cohen aggregate ≈ 1.0
  expect(cell?.textContent).toBe('1.00');
});
```

- [ ] **Step 2: Implement** — adicionar bbox merge

```ts
// overviewMatrix.ts (depois de obter reports do reportPairwise)
import { computeBboxKappaForPair } from './bboxScopeExtraction';

const splitBbox = state.filters.splitBboxEngines ?? false;
const bboxMode: 'unified' | 'split' = splitBbox ? 'split' : 'unified';

for (const [pairIdx, [a, b]] of pairs.entries()) {
  if (state.primaryCoefficient !== 'cohen') continue;
  const bboxK = computeBboxKappaForPair({
    models: { pdf: deps.engineModels.pdf as any, image: deps.engineModels.image as any },
    scope: state.scope,
    pair: [a, b],
    mode: bboxMode,
    theta: 0.5,
  });
  // Merge: weighted avg quando ambos existem; bbox standalone quando text-likes vacuous
  const normalKey = a < b ? `${a}|${b}` : `${b}|${a}`;
  const textK = kappaByPair.get(normalKey);
  const bboxKValue = bboxMode === 'unified' ? bboxK.spatialBbox : average([bboxK.pdfShape, bboxK.image].filter(v => v !== undefined) as number[]);
  if (textK === undefined && bboxKValue !== undefined) {
    kappaByPair.set(normalKey, bboxKValue);
  } else if (textK !== undefined && bboxKValue !== undefined) {
    // weighted 50/50 (bbox events vs char count seria via reporter — simplifica em E2)
    kappaByPair.set(normalKey, (textK + bboxKValue) / 2);
  }
}

function average(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
```

**Decisão registrada:** weighted avg 50/50 entre text-likes e bbox é aproximação E2. Pesos reais (chars vs bbox events) entrariam via `reportKappa` orquestrado, mas requer extender `EngineKappaInput` aceitar bbox. **Backlog:** "bbox weight via #events em vez de 50/50". Consequência aceita pra E2: matriz aproxima quando vault tem text+bbox. UX honesta: tooltip na cell mostra "text+bbox combinados (avg)".

- [ ] **Step 3: Plumbing — `engineModels` em `EngineModelsForExtraction`** precisa receber `image` model. Modify `scopeExtraction.ts` interface:

```ts
// scopeExtraction.ts — adicionar campo image
export interface EngineModelsForExtraction {
  markdown?: { getAllMarkers(): Marker[] };
  pdf?: { getAllMarkers(): PdfMarker[]; getAllShapeMarkers?(): PdfShapeMarker[] };
  csv?: { getAllMarkers(): CsvMarker[] };
  audio?: { getAllMarkers(): MediaMarker[] };
  video?: { getAllMarkers(): MediaMarker[] };
  image?: { getAllMarkers(): ImageMarker[] };
}
```

E em `unifiedCompareCodersView.ts:engineModels()` adicionar:
```ts
image: this.plugin.imageModel,
```

(Verificar `plugin.imageModel` existe — Step 1 da Task 5.)

- [ ] **Step 4: Run tests** — todos os tests da matrix continuam verde + novo bbox test passa

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): bbox engines integrados na matriz Mode A — Cohen κ avg text+bbox"`

### Task 8: Smoke real bbox

- [ ] **Step 1:** Criar massa sintética bbox em `ICR-test/`:
  - 1 PDF com 2 PDF shape markers (1 do human:a, 1 do human:b com IoU ~0.7)
  - 1 PNG com 2 image markers (1 do human:a, 1 do human:b com IoU ~0.4)
  - Pode editar `data.json` direto (regra do projeto)

- [ ] **Step 2:** `npm run build` + reload + `Compare Coders: Open`
- [ ] **Step 3:** Ver Cohen κ na matriz subir/descer quando bbox markers entram
- [ ] **Step 4:** Capturar screenshot

---

## Chunk 3: Mode B (tabela por código)

### Task 9: `overviewSharedRender.ts` — extrai kappaClass

**Files:**
- Create: `src/core/icr/ui/overviewSharedRender.ts`
- Modify: `src/core/icr/ui/overviewMatrix.ts` (importar do shared)

- [ ] **Step 1:** Mover `KAPPA_THRESHOLDS` + `kappaClass` de `overviewMatrix.ts:92-99` pra `overviewSharedRender.ts`. Re-export.

```ts
// src/core/icr/ui/overviewSharedRender.ts
export const KAPPA_THRESHOLDS = { low: 0.4, midLow: 0.6, midHigh: 0.8 } as const;

export function kappaClass(k: number): string {
  if (k < KAPPA_THRESHOLDS.low) return 'qc-kappa-low';
  if (k < KAPPA_THRESHOLDS.midLow) return 'qc-kappa-mid-low';
  if (k < KAPPA_THRESHOLDS.midHigh) return 'qc-kappa-mid-high';
  return 'qc-kappa-high';
}
```

- [ ] **Step 2: Commit** — `~/.claude/scripts/commit.sh "refactor(icr): extrai kappaClass pra overviewSharedRender (reuso entre 3 modes)"`

### Task 10: `overviewTable.ts` — render Mode B

**Files:**
- Create: `src/core/icr/ui/overviewTable.ts`
- Create: `tests/core/icr/ui/overviewTable.test.ts`

**Why:** 1 row por código, 5 colunas de coeficientes. Sort default por Cohen ascendente (pior κ no topo). Click row seleciona code.

- [ ] **Step 1: Write failing test**

```ts
describe('overviewTable', () => {
  it('renderiza 1 linha por código no escopo', async () => {
    const container = document.createElement('div');
    const state = makeStateWith3CodesAndMarkers();
    await renderOverviewTable(container, state, deps, () => {});
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('sort default por Cohen ascendente (pior no topo)', async () => {
    const container = document.createElement('div');
    const state = makeStateWithCodesOfDifferentKappa();
    await renderOverviewTable(container, state, deps, () => {});
    const cohenCells = container.querySelectorAll('tbody tr td.col-cohen');
    const values = [...cohenCells].map(c => parseFloat(c.textContent ?? '1'));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i-1]);
    }
  });

  it('click row chama onSelect com kind:code', async () => {
    const container = document.createElement('div');
    const calls: any[] = [];
    await renderOverviewTable(container, state, deps, sel => calls.push(sel));
    container.querySelector('tbody tr')?.dispatchEvent(new MouseEvent('click'));
    expect(calls[0]).toEqual({ kind: 'code', value: expect.any(String) });
  });

  it('Cohen "—" quando 3+ coders, Fleiss "—" quando 2 coders', async () => {
    // 2 coders → Fleiss "—", Cohen valor
    const containerA = document.createElement('div');
    await renderOverviewTable(containerA, makeStateWith2Coders(), deps, () => {});
    expect(containerA.querySelector('tbody tr td.col-fleiss')?.textContent).toBe('—');

    // 3 coders → Cohen "—" (não há único valor pareado), Fleiss valor
    const containerB = document.createElement('div');
    await renderOverviewTable(containerB, makeStateWith3Coders(), deps, () => {});
    expect(containerB.querySelector('tbody tr td.col-cohen')?.textContent).toBe('—');
  });
});
```

- [ ] **Step 2: Run test (fail)**

- [ ] **Step 3: Implement**

```ts
// src/core/icr/ui/overviewTable.ts
import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import { extractInputsFromScope, type EngineModelsForExtraction } from './scopeExtraction';
import { reportKappa } from '../reporter';
import { kappaClass } from './overviewSharedRender';
import type { App } from 'obsidian';

export interface OverviewTableDeps {
  coderRegistry: CoderRegistry;
  codeRegistry: CodeDefinitionRegistry;
  engineModels: EngineModelsForExtraction;
  app: App;
}

interface CodeRow {
  codeId: string;
  codeName: string;
  markerCount: number;
  cohen?: number;
  fleiss?: number;
  alpha?: number;
  alphaBinary?: number;
  cuAlpha?: number;
}

export async function renderOverviewTable(
  container: HTMLElement,
  state: CompareCodersViewState,
  deps: OverviewTableDeps,
  onSelect: (sel: CurrentSelection) => void,
): Promise<void> {
  container.empty();
  const codeIds = state.scope.codeIds ?? deps.codeRegistry.getAll().map(c => c.id);
  if (codeIds.length === 0) {
    container.createDiv({ text: 'Sem códigos no escopo', cls: 'qc-cc-empty' });
    return;
  }
  const N = state.scope.coderIds.length;

  const rows: CodeRow[] = [];
  for (const codeId of codeIds) {
    const inputs = await extractInputsFromScope(
      { ...state.scope, codeIds: [codeId] },
      { models: deps.engineModels, app: deps.app },
    );
    const totalMarkers = inputs.reduce((s, i) => {
      const k = i.kappaInput as { markers?: unknown[]; units?: unknown[] };
      return s + (k.markers?.length ?? k.units?.length ?? 0);
    }, 0);
    if (totalMarkers === 0) continue;
    const report = reportKappa(inputs);
    const cohenValues = Object.values(report.aggregate.cohenKappa);
    rows.push({
      codeId,
      codeName: deps.codeRegistry.getById(codeId)?.name ?? codeId,
      markerCount: totalMarkers,
      cohen: N === 2 && cohenValues.length > 0 ? cohenValues[0] : undefined,
      fleiss: N >= 3 ? report.aggregate.fleissKappa : undefined,
      alpha: report.aggregate.alphaNominal,
      alphaBinary: report.aggregate.alphaBinary,
      cuAlpha: report.aggregate.cuAlpha,
    });
  }

  // Sort: pior coeficiente primário no topo; n/a no fim
  rows.sort((a, b) => {
    const ka = N === 2 ? a.cohen : a.fleiss;
    const kb = N === 2 ? b.cohen : b.fleiss;
    if (ka === undefined && kb === undefined) return 0;
    if (ka === undefined) return 1;
    if (kb === undefined) return -1;
    return ka - kb;
  });

  const table = container.createEl('table', { cls: 'qc-cc-table' });
  const thead = table.createEl('thead').createEl('tr');
  ['código', '# markers', 'Cohen κ', 'Fleiss κ', 'α', 'α-binary', 'cu-α'].forEach(h => thead.createEl('th', { text: h }));
  const tbody = table.createEl('tbody');
  for (const r of rows) {
    const tr = tbody.createEl('tr');
    tr.createEl('td', { text: r.codeName });
    tr.createEl('td', { text: String(r.markerCount) });
    appendCell(tr, 'col-cohen', r.cohen);
    appendCell(tr, 'col-fleiss', r.fleiss);
    appendCell(tr, 'col-alpha', r.alpha);
    appendCell(tr, 'col-alpha-binary', r.alphaBinary);
    appendCell(tr, 'col-cu-alpha', r.cuAlpha);
    tr.onclick = () => onSelect({ kind: 'code', value: r.codeId });
  }
}

function appendCell(row: HTMLElement, cls: string, value: number | undefined): void {
  const td = row.createEl('td', { cls });
  if (value === undefined || isNaN(value)) {
    td.textContent = '—';
    td.addClass('qc-kappa-na');
  } else {
    td.textContent = value.toFixed(2);
    td.addClass(kappaClass(value));
  }
}
```

- [ ] **Step 4: Run tests (pass)**

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): overviewTable — Mode B tabela por código com 5 coeficientes ordenada"`

### Task 11: Plug Mode B no view + styles

**Files:**
- Modify: `src/core/icr/ui/unifiedCompareCodersView.ts`
- Modify: `styles.css`

- [ ] **Step 1:** No `renderOverview()`, adicionar branch `case 'table'` que chama `renderOverviewTable`. Remover stub correspondente.

- [ ] **Step 2:** Habilitar chip `'table'` no toolbar (remover `is-disabled`).

- [ ] **Step 3:** styles pra `.qc-cc-table` — th sticky, hover row, cells centradas, `qc-kappa-*` colors:

```css
.qc-cc-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
.qc-cc-table th, .qc-cc-table td { padding: 4px 8px; text-align: center; border-bottom: 1px solid var(--background-modifier-border); }
.qc-cc-table th { background: var(--background-secondary); position: sticky; top: 0; }
.qc-cc-table tbody tr { cursor: pointer; }
.qc-cc-table tbody tr:hover { background: var(--background-modifier-hover); }
```

- [ ] **Step 4: Build + smoke real:**
  1. Reload + abre view
  2. Click chip `▤ Tabela`
  3. Vê códigos ordenados (pior κ no topo)
  4. Click row → drilldown filtra pelo code
  5. Capture screenshot

- [ ] **Step 5: Commit** — `~/.claude/scripts/commit.sh "feat(icr): plug Mode B no view + styles tabela"`

---

## Chunk 4: Mode C (heatmap código × engine)

### Task 12: `overviewHeatmap.ts` — render Mode C

**Files:**
- Create: `src/core/icr/ui/overviewHeatmap.ts`
- Create: `tests/core/icr/ui/overviewHeatmap.test.ts`

**Why:** Linhas = códigos; colunas = engines no scope (default unified bbox; split via `state.filters.splitBboxEngines`). Cell = primaryCoefficient pra (code, engine). Cinza translúcido se code não aparece nessa engine.

- [ ] **Step 1: Write failing test**

```ts
describe('overviewHeatmap', () => {
  it('renderiza grid codes × engines', async () => {
    const container = document.createElement('div');
    await renderOverviewHeatmap(container, makeStateWith2Codes2Engines(), deps, () => {});
    const cells = container.querySelectorAll('tbody td');
    expect(cells.length).toBe(2 * 2);
  });

  it('cinza quando código não aparece na engine', async () => {
    const container = document.createElement('div');
    await renderOverviewHeatmap(container, stateWithCodeOnlyInMarkdown, deps, () => {});
    const cellPdfNoCode = container.querySelector('tbody td[data-engine="pdf"]');
    expect(cellPdfNoCode?.classList.contains('qc-kappa-na')).toBe(true);
  });

  it('coluna spatial-bbox aparece quando há bbox markers (mode unified)', async () => {
    const container = document.createElement('div');
    await renderOverviewHeatmap(container, stateWithBbox, deps, () => {});
    expect(container.querySelector('th[data-engine="spatial-bbox"]')).not.toBeNull();
    expect(container.querySelector('th[data-engine="pdfShape"]')).toBeNull();
  });

  it('split: pdfShape e image como colunas separadas', async () => {
    const container = document.createElement('div');
    const state = { ...stateWithBbox, filters: { ...stateWithBbox.filters, splitBboxEngines: true } };
    await renderOverviewHeatmap(container, state, deps, () => {});
    expect(container.querySelector('th[data-engine="pdfShape"]')).not.toBeNull();
    expect(container.querySelector('th[data-engine="image"]')).not.toBeNull();
  });

  it('click cell chama onSelect com kind:codeEngine', async () => {
    const calls: any[] = [];
    const container = document.createElement('div');
    await renderOverviewHeatmap(container, state, deps, sel => calls.push(sel));
    container.querySelector('tbody td:not(.qc-kappa-na)')?.dispatchEvent(new MouseEvent('click'));
    expect(calls[0].kind).toBe('codeEngine');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/icr/ui/overviewHeatmap.ts
import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import { extractInputsFromScope, type EngineModelsForExtraction } from './scopeExtraction';
import { computeBboxKappaForPair, type BboxModels } from './bboxScopeExtraction';
import { reportKappa, type EngineId } from '../reporter';
import { getCoefficientValue } from './coefficientResolver';
import { kappaClass } from './overviewSharedRender';
import type { App } from 'obsidian';

export interface OverviewHeatmapDeps {
  coderRegistry: CoderRegistry;
  codeRegistry: CodeDefinitionRegistry;
  engineModels: EngineModelsForExtraction;
  app: App;
}

const TEXT_LIKE_TEMPORAL_CATEGORICAL: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video'];

export async function renderOverviewHeatmap(
  container: HTMLElement,
  state: CompareCodersViewState,
  deps: OverviewHeatmapDeps,
  onSelect: (sel: CurrentSelection) => void,
): Promise<void> {
  container.empty();
  const codeIds = state.scope.codeIds ?? deps.codeRegistry.getAll().map(c => c.id);
  if (codeIds.length === 0) {
    container.createDiv({ text: 'Sem códigos no escopo', cls: 'qc-cc-empty' });
    return;
  }
  const splitBbox = state.filters.splitBboxEngines ?? false;

  // Detectar engines presentes
  const allEngines = state.scope.engineIds ?? TEXT_LIKE_TEMPORAL_CATEGORICAL;
  const visibleEngines: (EngineId | 'spatial-bbox')[] = allEngines.filter(e => e !== 'pdfShape' && e !== 'image');
  // Detectar bbox markers existentes pra decidir adicionar coluna(s) bbox
  const hasBbox = ((deps.engineModels.pdf as any)?.getAllShapeMarkers?.()?.length ?? 0) > 0
    || ((deps.engineModels.image as any)?.getAllMarkers?.()?.length ?? 0) > 0;
  if (hasBbox) {
    if (splitBbox) {
      visibleEngines.push('pdfShape', 'image');
    } else {
      visibleEngines.push('spatial-bbox');
    }
  }

  const table = container.createEl('table', { cls: 'qc-cc-heatmap' });
  const thead = table.createEl('thead').createEl('tr');
  thead.createEl('th', { text: 'código' });
  for (const e of visibleEngines) {
    const th = thead.createEl('th', { text: e });
    th.dataset.engine = e;
  }

  const tbody = table.createEl('tbody');
  for (const codeId of codeIds) {
    const tr = tbody.createEl('tr');
    tr.createEl('th', { text: deps.codeRegistry.getById(codeId)?.name ?? codeId });
    for (const e of visibleEngines) {
      const td = tr.createEl('td');
      td.dataset.engine = e;
      const k = await computeKappaForCodeEngine(codeId, e, state, deps, splitBbox);
      if (k === undefined || isNaN(k)) {
        td.textContent = '—';
        td.addClass('qc-kappa-na');
      } else {
        td.textContent = k.toFixed(2);
        td.addClass(kappaClass(k));
      }
      td.onclick = () => onSelect({ kind: 'codeEngine', value: { codeId, engineId: (e === 'spatial-bbox' ? 'pdfShape' : e) as EngineId } });
    }
  }
}

async function computeKappaForCodeEngine(
  codeId: string,
  engine: EngineId | 'spatial-bbox',
  state: CompareCodersViewState,
  deps: OverviewHeatmapDeps,
  splitBbox: boolean,
): Promise<number | undefined> {
  if (engine === 'spatial-bbox' || engine === 'pdfShape' || engine === 'image') {
    if (state.scope.coderIds.length !== 2) return undefined;  // bbox per-pair only
    const pair: [string, string] = [state.scope.coderIds[0]!, state.scope.coderIds[1]!];
    const r = computeBboxKappaForPair({
      models: { pdf: deps.engineModels.pdf as any, image: deps.engineModels.image as any },
      scope: { ...state.scope, codeIds: [codeId] },
      pair,
      mode: engine === 'spatial-bbox' ? 'unified' : 'split',
      theta: 0.5,
    });
    if (engine === 'spatial-bbox') return r.spatialBbox;
    return engine === 'pdfShape' ? r.pdfShape : r.image;
  }
  // text-likes / temporal / categorical: extract restrito ao engine
  const inputs = await extractInputsFromScope(
    { ...state.scope, codeIds: [codeId], engineIds: [engine] },
    { models: deps.engineModels, app: deps.app },
  );
  if (inputs.length === 0) return undefined;
  const report = reportKappa(inputs);
  const N = state.scope.coderIds.length;
  const pair: [string, string] | undefined = N === 2 ? [state.scope.coderIds[0]!, state.scope.coderIds[1]!] : undefined;
  return getCoefficientValue(report, state.primaryCoefficient, pair);
}
```

- [ ] **Step 3: Run tests (pass)**

- [ ] **Step 4: Commit** — `~/.claude/scripts/commit.sh "feat(icr): overviewHeatmap — Mode C heatmap código×engine com bbox unified/split"`

### Task 13: Plug Mode C no view + toggle splitBboxEngines

**Files:**
- Modify: `src/core/icr/ui/unifiedCompareCodersView.ts`
- Modify: `src/core/icr/ui/compareCodersTypes.ts` (já vai estender em Chunk 5; coordenar)
- Modify: `src/core/icr/ui/filterChips.ts`
- Modify: `styles.css`

- [ ] **Step 1: Add `splitBboxEngines?: boolean` em `ComparisonFilters`** (compareCodersTypes.ts)

- [ ] **Step 2: Filter chip "split bbox engines"** (visível só quando há bbox markers — verificar via `hasBbox` checked no render)

```ts
// filterChips.ts — adicionar no final
const splitBboxChip = container.createSpan({
  cls: `qc-cc-filter-chip ${state.filters.splitBboxEngines ? 'is-active' : ''}`,
  text: 'split bbox engines',
});
splitBboxChip.dataset.filter = 'split-bbox';
splitBboxChip.onclick = () => {
  onUpdate({ filters: { ...state.filters, splitBboxEngines: !state.filters.splitBboxEngines } });
};
```

- [ ] **Step 3:** No `renderOverview()`, adicionar `case 'heatmap'`. Habilitar chip `'heatmap'` no toolbar.

- [ ] **Step 4:** styles `.qc-cc-heatmap` (similar à table)

- [ ] **Step 5: Build + smoke real:**
  1. Reload + abre view
  2. Click `▥ Heatmap`
  3. Vê heatmap código × engine
  4. Toggle "split bbox engines" → coluna spatial-bbox vira pdfShape | image
  5. Click cell → drilldown filtra
  6. Capture screenshot

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr): plug Mode C heatmap + filter chip split bbox engines"`

---

## Chunk 5: Filter "esconder agreement total" + Polish E1 "incluir coders sem markers"

### Task 14: `coderInclusion.ts` — helper puro

**Files:**
- Create: `src/core/icr/ui/coderInclusion.ts`
- Create: `tests/core/icr/ui/coderInclusion.test.ts`
- Modify: `src/core/icr/ui/compareCodersTypes.ts` (add `includeCodersWithoutMarkers?: boolean` em `ComparisonFilters`)

- [ ] **Step 1: Write failing test**

```ts
describe('getCodersWithMarkersInScope', () => {
  it('retorna só coders com pelo menos 1 marker no escopo', () => {
    const result = getCodersWithMarkersInScope(
      { coderIds: ['human:a', 'human:b', 'human:default'] },
      { markdown: { getAllMarkers: () => [{ codedBy: 'human:a', codes: [{ codeId: 'A' }], fileId: 'f' } as any] }, /* ... */ },
    );
    expect(result).toEqual(['human:a']);
  });
  it('respeita codeIds + fileIds do scope', () => { /* ... */ });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/icr/ui/coderInclusion.ts
import type { ComparisonScope } from './compareCodersTypes';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { BboxModels } from './bboxScopeExtraction';
import type { CoderId } from '../coderTypes';

export function getCodersWithMarkersInScope(
  scope: ComparisonScope,
  models: EngineModelsForExtraction & BboxModels,
): CoderId[] {
  const coderSet = new Set<CoderId>();
  const allMarkers: { codedBy?: string; codes?: { codeId: string }[]; fileId: string }[] = [
    ...(models.markdown?.getAllMarkers() ?? []),
    ...(models.pdf?.getAllMarkers() ?? []),
    ...((models.pdf as any)?.getAllShapeMarkers?.() ?? []),
    ...(models.csv?.getAllMarkers() ?? []),
    ...(models.audio?.getAllMarkers() ?? []),
    ...(models.video?.getAllMarkers() ?? []),
    ...((models.image as any)?.getAllMarkers?.() ?? []),
  ];
  for (const m of allMarkers) {
    if (!m.codedBy) continue;
    if (scope.codeIds && !(m.codes ?? []).some(c => scope.codeIds!.includes(c.codeId))) continue;
    if (scope.fileIds && !scope.fileIds.includes(m.fileId)) continue;
    if (!scope.coderIds.includes(m.codedBy)) continue;
    coderSet.add(m.codedBy);
  }
  return scope.coderIds.filter(id => coderSet.has(id));  // preserva ordem original
}

export function applyCoderInclusion(
  scope: ComparisonScope,
  models: EngineModelsForExtraction & BboxModels,
  includeWithoutMarkers: boolean,
): ComparisonScope {
  if (includeWithoutMarkers) return scope;
  return { ...scope, coderIds: getCodersWithMarkersInScope(scope, models) };
}
```

- [ ] **Step 3: Run tests (pass)**

- [ ] **Step 4: Commit** — `~/.claude/scripts/commit.sh "feat(icr): coderInclusion — filtra coders sem markers do escopo (polish E1)"`

### Task 15: Aplicar coderInclusion + filter "esconder agreement" em todos modes

**Files:**
- Modify: `src/core/icr/ui/overviewMatrix.ts`
- Modify: `src/core/icr/ui/overviewTable.ts`
- Modify: `src/core/icr/ui/overviewHeatmap.ts`
- Modify: `src/core/icr/ui/filterChips.ts` (renomear chip "incluir coders sem markers")

- [ ] **Step 1:** Cada mode aplica `applyCoderInclusion` no `state.scope` antes de renderizar:

```ts
// no início de renderOverviewMatrix/Table/Heatmap
const effectiveScope = applyCoderInclusion(
  state.scope,
  { ...deps.engineModels, ...{ pdf: deps.engineModels.pdf, image: deps.engineModels.image } } as any,
  state.filters.includeCodersWithoutMarkers ?? false,
);
const effectiveState = { ...state, scope: effectiveScope };
```

- [ ] **Step 2:** Cada mode aplica `state.filters.hideAgreementTotal`:
  - Matrix: cell com κ > 0.8 ganha class `qc-cc-fade`
  - Table: row com pior coef > 0.8 ganha class `qc-cc-fade`
  - Heatmap: cell com κ > 0.8 ganha class `qc-cc-fade`

```css
.qc-cc-fade { opacity: 0.25; }
```

- [ ] **Step 3: Add chip "incluir coders sem markers" em filterChips.ts**

```ts
const includeChip = container.createSpan({
  cls: `qc-cc-filter-chip ${state.filters.includeCodersWithoutMarkers ? 'is-active' : ''}`,
  text: 'incluir coders sem markers',
});
includeChip.dataset.filter = 'include-empty-coders';
includeChip.onclick = () => onUpdate({
  filters: { ...state.filters, includeCodersWithoutMarkers: !state.filters.includeCodersWithoutMarkers },
});
```

- [ ] **Step 4: Tests** — adicionar 2 tests em cada `overviewX.test.ts`:
  - Coder sem markers some quando `includeCodersWithoutMarkers === false`
  - Cell > 0.8 tem `qc-cc-fade` quando `hideAgreementTotal === true`

- [ ] **Step 5: Build + smoke real:**
  1. Vault com "Default" coder sem markers
  2. Reload + abre view → "Default" não aparece nem na matriz nem nos chips de filter de coders
  3. Toggle "incluir coders sem markers" → "Default" reaparece com cells cinza
  4. Toggle "esconder agreement total" → cells > 0.8 viram fade
  5. Capture screenshots A/B

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr): polish E1 (coders sem markers escondidos) + filter esconder agreement total funcional"`

---

## Chunk 6: Modal "ver lado a lado"

### Task 16: `narrativeDiagnostic.ts` — analisador puro

**Files:**
- Create: `src/core/icr/ui/narrativeDiagnostic.ts`
- Create: `tests/core/icr/ui/narrativeDiagnostic.test.ts`

**Why:** 3 padrões hardcoded da spec §6 que viram caixa amarela no modal. Puro pra testar sem DOM.

- [ ] **Step 1: Write failing test**

```ts
describe('analyzeDiagnostic', () => {
  it('detecta cohen baixo + alpha-binary alto (boundary OK, código diverge)', () => {
    const msgs = analyzeDiagnostic({ cohen: 0.3, alphaBinary: 0.8, cuAlpha: 0.5 });
    expect(msgs.some(m => m.includes('discordam de qual código'))).toBe(true);
  });
  it('detecta cohen baixo + alpha-binary baixo (boundary disagreement)', () => {
    const msgs = analyzeDiagnostic({ cohen: 0.3, alphaBinary: 0.3, cuAlpha: 0.3 });
    expect(msgs.some(m => m.includes('boundary disagreement'))).toBe(true);
  });
  it('detecta cu-alpha << κ (concordância em boundary mas código diferente)', () => {
    const msgs = analyzeDiagnostic({ cohen: 0.7, alphaBinary: 0.7, cuAlpha: 0.2 });
    expect(msgs.some(m => m.includes('code-within-boundary'))).toBe(true);
  });
  it('limítrofe — cohen=0.5 + binary=0.7 → não dispara (não bate em nenhum padrão)', () => {
    const msgs = analyzeDiagnostic({ cohen: 0.5, alphaBinary: 0.7, cuAlpha: 0.5 });
    expect(msgs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/icr/ui/narrativeDiagnostic.ts
export interface DiagnosticInput {
  cohen?: number;
  alphaBinary?: number;
  cuAlpha?: number;
}

export function analyzeDiagnostic(input: DiagnosticInput): string[] {
  const msgs: string[] = [];
  const { cohen, alphaBinary, cuAlpha } = input;
  if (cohen !== undefined && alphaBinary !== undefined) {
    if (cohen < 0.4 && alphaBinary > 0.7) {
      msgs.push('discordam de qual código aplicar, mas concordam que tem código no trecho. Reconciliação por escolha de código mais útil que ajuste de bounds.');
    } else if (cohen < 0.4 && alphaBinary < 0.4) {
      msgs.push('boundary disagreement substancial — coders divergem em onde marcar. Reconciliação por ajuste de bounds antes de discutir código.');
    }
  }
  if (cohen !== undefined && cuAlpha !== undefined && cuAlpha < cohen - 0.4) {
    msgs.push('cu-α << κ — concordância em boundary mas com código diferente; code-within-boundary é um sub-fenômeno relevante.');
  }
  return msgs;
}
```

- [ ] **Step 3: Run tests (pass)**

- [ ] **Step 4: Commit** — `~/.claude/scripts/commit.sh "feat(icr): narrativeDiagnostic — 3 padrões reconhecíveis pro modal"`

### Task 17: `compareCoderCoefficientsModal.ts` — Modal

**Files:**
- Create: `src/core/icr/ui/compareCoderCoefficientsModal.ts`
- Create: `tests/core/icr/ui/compareCoderCoefficientsModal.test.ts`

**Why:** Pattern espelha `mergeModal.ts`. 2 estados via toggle no header. Render: tabela 5 coeficientes × pares ou per-engine. Footer: export markdown.

- [ ] **Step 1: Write failing test (jsdom)**

```ts
describe('CompareCoderCoefficientsModal', () => {
  it('estado inicial "todos os pares" lista 1 row por par', async () => {
    const m = new CompareCoderCoefficientsModal(app, scope, ctx, { initial: 'all-pairs' });
    await m.onOpen();
    const rows = m.contentEl.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);  // 3 coders → 3 pares
  });

  it('toggle pra "par único" filtra por pair selecionado', async () => {
    const m = new CompareCoderCoefficientsModal(app, scope, ctx, { initial: 'single-pair', pair: ['human:a', 'human:b'] });
    await m.onOpen();
    expect(m.contentEl.textContent).toContain('human:a');
    expect(m.contentEl.textContent).not.toContain('human:c');
  });

  it('export markdown gera string com tabela', async () => {
    const m = new CompareCoderCoefficientsModal(app, scope, ctx, { initial: 'all-pairs' });
    await m.onOpen();
    const md = m.exportMarkdown();
    expect(md).toContain('| par');
    expect(md).toContain('| Cohen κ');
  });

  it('caixa de diagnóstico aparece quando padrão reconhecível', async () => { /* ... */ });
});
```

- [ ] **Step 2: Implement** (esqueleto)

```ts
// src/core/icr/ui/compareCoderCoefficientsModal.ts
import { App, Modal } from 'obsidian';
import type { ComparisonScope, CoefficientKey } from './compareCodersTypes';
import type { CoderId } from '../coderTypes';
import { extractInputsFromScope, type EngineModelsForExtraction } from './scopeExtraction';
import { computeBboxKappaForPair } from './bboxScopeExtraction';
import { reportPairwise, reportKappa, type EngineId } from '../reporter';
import { analyzeDiagnostic } from './narrativeDiagnostic';

export interface ModalCtx {
  models: EngineModelsForExtraction;
  app: App;
  showNarrative: boolean;
}

export type ModalState = 'all-pairs' | 'single-pair';

export interface ModalOptions {
  initial: ModalState;
  pair?: [CoderId, CoderId];
}

interface ModalRow {
  pair: [CoderId, CoderId];
  engine?: EngineId | 'aggregate';
  cohen?: number;
  fleiss?: number;
  alpha?: number;
  alphaBinary?: number;
  cuAlpha?: number;
}

export class CompareCoderCoefficientsModal extends Modal {
  private state: ModalState;
  private rows: ModalRow[] = [];

  constructor(
    app: App,
    private scope: ComparisonScope,
    private ctx: ModalCtx,
    private options: ModalOptions,
  ) {
    super(app);
    this.state = options.initial;
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('qc-cc-modal');
    this.renderHeader();
    await this.computeRows();
    this.renderTable();
    this.renderDiagnostic();
    this.renderFooter();
  }

  private renderHeader(): void {
    const header = this.contentEl.createDiv({ cls: 'qc-cc-modal-header' });
    header.createEl('h3', { text: 'Coeficientes ICR · ver lado a lado' });
    const toggle = header.createDiv({ cls: 'qc-cc-modal-toggle' });
    for (const s of ['single-pair', 'all-pairs'] as ModalState[]) {
      const chip = toggle.createSpan({
        cls: `qc-cc-mode-chip ${this.state === s ? 'is-active' : ''}`,
        text: s === 'single-pair' ? 'par único' : 'todos os pares',
      });
      chip.onclick = async () => {
        this.state = s;
        this.contentEl.empty();
        this.renderHeader();
        await this.computeRows();
        this.renderTable();
        this.renderDiagnostic();
        this.renderFooter();
      };
    }
  }

  private async computeRows(): Promise<void> {
    this.rows = [];
    const pairs = this.state === 'single-pair' && this.options.pair
      ? [this.options.pair]
      : this.allPairs();
    const inputs = await extractInputsFromScope(this.scope, { models: this.ctx.models, app: this.ctx.app });
    const reports = reportPairwise(inputs, pairs);
    for (const r of reports) {
      const cohenKey = `${r.pair[0]}|${r.pair[1]}`;
      const cohenAlt = `${r.pair[1]}|${r.pair[0]}`;
      const cohen = r.report.aggregate.cohenKappa[cohenKey] ?? r.report.aggregate.cohenKappa[cohenAlt];
      this.rows.push({
        pair: r.pair, engine: 'aggregate',
        cohen, fleiss: r.report.aggregate.fleissKappa,
        alpha: r.report.aggregate.alphaNominal,
        alphaBinary: r.report.aggregate.alphaBinary,
        cuAlpha: r.report.aggregate.cuAlpha,
      });
      // Per-engine breakdown só pra single-pair (all-pairs ficaria gigante)
      if (this.state === 'single-pair') {
        for (const [engine, coef] of Object.entries(r.report.byEngine)) {
          const ck = coef!.cohenKappa[cohenKey] ?? coef!.cohenKappa[cohenAlt];
          this.rows.push({
            pair: r.pair, engine: engine as EngineId,
            cohen: ck, fleiss: coef!.fleissKappa,
            alpha: coef!.alphaNominal, alphaBinary: coef!.alphaBinary, cuAlpha: coef!.cuAlpha,
          });
        }
      }
    }
  }

  private allPairs(): [CoderId, CoderId][] {
    const pairs: [CoderId, CoderId][] = [];
    const ids = this.scope.coderIds;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        pairs.push([ids[i]!, ids[j]!]);
    return pairs;
  }

  private renderTable(): void {
    const table = this.contentEl.createEl('table', { cls: 'qc-cc-modal-table' });
    const thead = table.createEl('thead').createEl('tr');
    ['par / engine', 'Cohen κ', 'Fleiss κ', 'α', 'α-binary', 'cu-α'].forEach(h => thead.createEl('th', { text: h }));
    const tbody = table.createEl('tbody');
    for (const r of this.rows) {
      const tr = tbody.createEl('tr');
      const label = r.engine === 'aggregate' ? `${r.pair[0]} ↔ ${r.pair[1]}` : `↳ ${r.engine}`;
      tr.createEl('td', { text: label });
      [r.cohen, r.fleiss, r.alpha, r.alphaBinary, r.cuAlpha].forEach(v => {
        tr.createEl('td', { text: v !== undefined ? v.toFixed(2) : '—' });
      });
    }
  }

  private renderDiagnostic(): void {
    if (!this.ctx.showNarrative) return;
    if (this.state !== 'single-pair') return;
    const aggregate = this.rows.find(r => r.engine === 'aggregate');
    if (!aggregate) return;
    const msgs = analyzeDiagnostic({
      cohen: aggregate.cohen, alphaBinary: aggregate.alphaBinary, cuAlpha: aggregate.cuAlpha,
    });
    if (msgs.length === 0) return;
    const box = this.contentEl.createDiv({ cls: 'qc-cc-modal-diagnostic' });
    msgs.forEach(m => box.createDiv({ text: m }));
  }

  private renderFooter(): void {
    const footer = this.contentEl.createDiv({ cls: 'qc-cc-modal-footer' });
    const exportBtn = footer.createEl('button', { text: '↧ exportar markdown' });
    exportBtn.onclick = () => {
      const md = this.exportMarkdown();
      navigator.clipboard?.writeText(md);
      // TODO: Notice ou modal de "copiado"
    };
    const closeBtn = footer.createEl('button', { text: 'Fechar' });
    closeBtn.onclick = () => this.close();
  }

  exportMarkdown(): string {
    const lines: string[] = [];
    lines.push(`# Coeficientes ICR · escopo ${this.scope.coderIds.join(', ')}`);
    lines.push('');
    lines.push(`**Data:** ${new Date().toISOString()}`);
    lines.push('');
    lines.push('| par / engine | Cohen κ | Fleiss κ | α | α-binary | cu-α |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of this.rows) {
      const label = r.engine === 'aggregate' ? `${r.pair[0]} ↔ ${r.pair[1]}` : `↳ ${r.engine}`;
      const fmt = (v: number | undefined) => v !== undefined ? v.toFixed(2) : '—';
      lines.push(`| ${label} | ${fmt(r.cohen)} | ${fmt(r.fleiss)} | ${fmt(r.alpha)} | ${fmt(r.alphaBinary)} | ${fmt(r.cuAlpha)} |`);
    }
    return lines.join('\n');
  }
}
```

- [ ] **Step 3: Run tests (pass)**

- [ ] **Step 4: Commit** — `~/.claude/scripts/commit.sh "feat(icr): CompareCoderCoefficientsModal — par único / todos pares + export markdown + diagnóstico"`

### Task 18: Botão "ver lado a lado" no toolbar + setting opt-out diagnóstico

**Files:**
- Modify: `src/core/icr/ui/unifiedCompareCodersView.ts`
- Modify: `src/main.ts` (settings init)
- Modify: `src/settings/qualiaSettingsTab.ts`
- Modify: `src/core/types.ts` (settings shape)

- [ ] **Step 1: Add setting** `showNarrativeDiagnosis: boolean` (default `true`) em `QualiaSettings` em `types.ts`

- [ ] **Step 2: Toggle no settings tab**

```ts
// qualiaSettingsTab.ts (adicionar onde se tem settings ICR ou criar grupo)
new Setting(containerEl)
  .setName('ICR · diagnóstico narrativo no modal "ver lado a lado"')
  .setDesc('Exibe caixa amarela com interpretação de padrões (cohen baixo + α-binary alto, etc).')
  .addToggle(t => t
    .setValue(this.plugin.settings.showNarrativeDiagnosis)
    .onChange(async v => { this.plugin.settings.showNarrativeDiagnosis = v; await this.plugin.saveData(this.plugin.settings); })
  );
```

- [ ] **Step 3: Botão `↗ ver lado a lado` no toolbar** — quando `currentSelection.kind === 'pair'` abre modal em `single-pair`; senão `all-pairs`

```ts
// unifiedCompareCodersView.ts — em renderToolbar()
const sideBtn = this.toolbarEl.createEl('button', { text: '↗ ver lado a lado', cls: 'qc-cc-side-btn' });
sideBtn.onclick = () => {
  const sel = this.state.currentSelection;
  const isPair = sel.kind === 'pair';
  new CompareCoderCoefficientsModal(
    this.plugin.app,
    this.state.scope,
    { models: this.engineModels(), app: this.plugin.app, showNarrative: this.plugin.settings.showNarrativeDiagnosis },
    {
      initial: isPair ? 'single-pair' : 'all-pairs',
      pair: isPair ? sel.value : undefined,
    },
  ).open();
};
```

- [ ] **Step 4: Modal styles em styles.css**

```css
.qc-cc-modal { min-width: 600px; max-width: 90vw; }
.qc-cc-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.qc-cc-modal-toggle { display: flex; gap: 4px; }
.qc-cc-modal-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
.qc-cc-modal-table th, .qc-cc-modal-table td { padding: 4px 8px; border-bottom: 1px solid var(--background-modifier-border); }
.qc-cc-modal-diagnostic {
  background: var(--text-warning-bg, rgba(255, 193, 7, 0.15));
  border-left: 3px solid var(--text-warning, #ffc107);
  padding: 8px 12px; margin: 8px 0; font-size: 0.9em;
}
.qc-cc-modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
```

- [ ] **Step 5: Build + smoke real:**
  1. Reload + abre view
  2. Click `↗ ver lado a lado` sem nada selecionado → modal "todos os pares"
  3. Toggle pra "par único" → tabela filtra
  4. Click `↧ exportar markdown` → conteúdo copiado pra clipboard
  5. Settings → toggle off diagnóstico → reabre modal → caixa amarela some
  6. Capture screenshot

- [ ] **Step 6: Commit** — `~/.claude/scripts/commit.sh "feat(icr): botão 'ver lado a lado' no toolbar + setting opt-out diagnóstico narrativo"`

---

## Chunk 7: Smoke real completo + docs

### Task 19: Smoke real fim-a-fim

**Cenário completo:**
1. Vault `obsidian-plugins-workbench` com `ICR-test/` (3 coders + 5 codes em md/pdf/csv) + 2-3 markers bbox sintéticos
2. `npm run build`
3. Reload Obsidian
4. `Compare Coders: Open`
5. Toolbar: 3 chips overview (Matriz/Tabela/Heatmap), 5 chips coeficientes, ~6 filter chips
6. **Mode A (Matriz):** alterna 5 coeficientes, vê valores recalcular; toggle "incluir coders sem markers" → "Default" some/aparece
7. **Mode B (Tabela):** códigos ordenados por pior κ; click row → drill-down filtra
8. **Mode C (Heatmap):** colunas markdown/pdf/csvSegment/csvRow + spatial-bbox unified; toggle "split bbox engines" → vira pdfShape | image
9. Filter "esconder agreement total" → cells > 0.8 fade em todos modes
10. `↗ ver lado a lado` sem selection → modal "todos os pares"
11. Click cell na matriz → modal abre em "par único" com breakdown per-engine + diagnóstico narrativo (se padrão bater)
12. `↧ exportar markdown` → conteúdo na clipboard, paste em nota nova confirma
13. Capture screenshots A/B (E1 vs E2)

- [ ] **Step:** Executar checklist completo. Se algo quebrar, fix antes de avançar pra docs.

### Task 20: Docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md` (estende §19.8 ou cria §19.9)
- Modify: `docs/BACKLOG.md` (move polish E1 + bbox em matriz/heatmap pra HISTORY)
- Modify: `docs/BACKLOG-HISTORY.md`
- Modify: `docs/TECHNICAL-PATTERNS.md` (adicionar pattern se descobrir algo novo)
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (atualizar contagem de testes)

- [ ] **Step 1: ROADMAP** — marcar Slice E2 como FEITO 2026-05-10. Sub-checklist do E2 todo riscado.
- [ ] **Step 2: ARCHITECTURE §19.9** (UI E2) — descreve novos arquivos: coefficientResolver, coefficientPicker, bboxScopeExtraction, overviewTable, overviewHeatmap, narrativeDiagnostic, compareCoderCoefficientsModal, coderInclusion, overviewSharedRender. Decisões cravadas (5 chips, bbox unified default, includeCoders opt-in)
- [ ] **Step 3: BACKLOG** — mover seções "Compare Coders polish" pra HISTORY com data 2026-05-10
- [ ] **Step 4: TECHNICAL-PATTERNS §44** se aplicável: "Mode A/B/C compartilham state central + helpers puros (kappaClass, getCoefficientValue) — render functions independentes evitam coupling"
- [ ] **Step 5: CHANGELOG** entry "0.x.y — ICR Compare Coders Slice E2: Modes B/C + Modal + bbox + polish"
- [ ] **Step 6: CLAUDE.md** — atualizar contagem (3075 → ~3150-3200)

- [ ] **Step 7: Commit** — `~/.claude/scripts/commit.sh "docs: pós-Slice E2 ICR Compare Coders — Modes B/C + Modal + bbox + polish + ~80 testes"`

### Task 21: Pós-task cleanup (regra do projeto)

- [ ] **Step 1:** Auto-merge pra main + push (sem perguntar — `feedback_auto_post_task_cleanup.md`)
- [ ] **Step 2:** Tag `post-icr-slice-e2-checkpoint` (par com `pre-icr-slice-e2-baseline` se criou; senão só checkpoint)
- [ ] **Step 3:** Sugerir arquivo de plan: `obsidian-qualia-coding/plugin-docs/superpowers/plans/archive/20260510-icr-slice-e2.md`

---

## Estimativa de testes

Baseline E1: 43 tests novos. E2 com 9 helpers/views novos + extensão de 4 existentes. Estimativa: **70-90 testes novos** (~3145-3165 total). Em linha com slices anteriores.

## Estimativa de tempo

Baseado em comparáveis no projeto (regra global `feedback_no_time_estimates.md` — usar histórico):
- Slice E1 entregue commits 66a88cc → dc0311d (8 commits, 2026-05-10): ~1 sessão
- Slice E2 escopo similar (3 modes novos vs 1, modal vs 0, picker funcional vs hardcoded, bbox integration vs N/A): ~1.2x do E1 = **1 sessão estendida ou 2 sessões curtas**

Sem inflar — pode terminar em menos se chunks 3+4 (Modes B/C) escalarem rápido a partir do pattern E1.

---

## Decisões assentadas — referência rápida

| # | Decisão | Onde virou regra |
|---|---|---|
| 1 | 5 chips picker lado a lado, disabled state visível | Chunk 1 Task 2 |
| 2 | Bbox: 1 coluna `spatial-bbox` default + toggle split | Chunk 4 Task 12 + Chunk 5 Task 13 |
| 3 | Polish E1: filter `includeCodersWithoutMarkers` default off | Chunk 5 Task 14-15 |
| 4 | Filter "esconder agreement total" = fade (não hide) | Chunk 5 Task 15 |
| 5 | Modal: 2 estados (par único / todos pares) toggle no header | Chunk 6 Task 17 |
| 6 | Diagnóstico narrativo: V1 ativo + setting opt-out | Chunk 6 Task 16 + 18 |
| 7 | Bbox merge na matriz: avg 50/50 com text-likes em E2 (proper weighting → backlog) | Chunk 2 Task 7 |
| 8 | Mode B Cohen "—" pra 3+ coders / Fleiss "—" pra 2 (escolha de coeficiente primário por N) | Chunk 3 Task 10 |
| 9 | Sem migration (zero usuários) | (regra do projeto) |
| 10 | spatial-bbox é label de UI, NÃO EngineId do reporter | Chunk 4 Task 12 |
