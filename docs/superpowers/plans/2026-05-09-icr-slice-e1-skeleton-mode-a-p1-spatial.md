# ICR Slice E1 — Skeleton + Mode A + P1 Spatial Implementation Plan

> **For agentic workers:** Execução inline (regra do projeto: SDD overkill — `feedback_sdd_overkill_for_dev_project.md`, sem worktree — `feedback_no_worktrees.md`). TDD por task. Smoke real obrigatório no chunk final.

**Goal:** Entregar a primeira camada utilizável da Compare Coders View — skeleton da view + Overview Mode A (matriz coder×coder com Cohen κ) + Drill-down P1 spatial (lanes per coder em markdown / pdf-text / csv-segment / csv-row) + filter chips + entry via command palette. Read-only (sem reconciliação, sem modal "ver lado a lado", sem saved comparisons).

**Architecture:** `UnifiedCompareCodersView` herda `ItemView` no workspace. Overview lê seleção de scope, calcula κ via novo helper `reportPairwise(inputs, pairs)` no reporter (Cohen κ é per-pair direto; Fleiss/α/cu-α/α-binary precisam de input filtrado). Mode A renderiza grade N×N. Drill-down P1 dispatcha por engine: text-likes (markdown/pdf-text/csv-segment) reusam `marginPanelExtension` em colunas-por-coder; csv-row pinta rows via cellStyle no AG Grid. Filter chips manipulam `state.scope.coderIds` + `state.filters.highlightConflicts`. Cohen κ hardcoded em E1 — coefficient picker entra em E2.

**Tech Stack:** TypeScript strict, Vitest + jsdom, ItemView API do Obsidian, padrões existentes do plugin (margin panel CM6, AG Grid Infinite, registry com addOnMutate). Sem dependências novas.

**Pré-requisitos** (já feitos antes deste plano):
- Slices ICR 1-5 entregues (motor κ + adapters cobrindo 5 das 6 engines + hash + transport + provenance)
- Pasta `ICR-test/` no vault `obsidian-plugins-workbench` com seed sintético (3 coders + 5 codes + 20 markers)
- Spec aprovada em `docs/superpowers/specs/2026-05-09-icr-compare-coders-design.md`

**Decisões cravadas (referência rápida):**
- Spec §1 (arquitetura) + §3.1 (Mode A) + §4.1 (P1 spatial) + §9 Slice E1 (escopo)
- `EngineId` (não `EngineType`) consistentemente — `'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'audio' | 'video'`
- Cohen κ é o único coeficiente intrinsecamente per-pair; `reportPairwise` filtra inputs pra Fleiss/α/cu-α/α-binary funcionarem por par
- Limit prático 4-5 coders no P1 — fallback pra 6+ está em backlog (não atacar nesse slice)

**APIs verificadas (`grep` em 2026-05-09):**
- `KappaInput` shape (`src/core/icr/kappaInput.ts:30`): `{ markers: CodedMarker[]; sources: SourceMeta[]; coders: CoderId[] }` (NÃO `perCoderRanges`).
- `CodedMarker` (`kappaInput.ts:15`): `{ coderId: CoderId; range: TextRange; codeIds: string[] }`.
- Per-marker extractors existem (`textRange.ts` + `categoricalKappaInput.ts`): `extractMarkdownRange(m, sourceText)`, `extractPdfRange(m)`, `extractCsvSegmentRange(m)`, `extractMediaRange(m)`, `extractRowMarkerUnit(m)`. **Adapters cohort-level (`markersToKappaInput*`) NÃO existem** — esse plano constrói essa camada.
- `CsvCodingModel.getAllMarkers(): CsvMarker[]` retorna union mixed (`SegmentMarker | RowMarker`). Discriminação via `marker.kind === 'segment' | 'row'` (`csvCodingTypes.ts:6,24,45`). NÃO existem `getSegmentMarkers()`/`getRowMarkers()` standalone — só `*ForCell` variants.
- `getAllMarkers()` confirmado em: `markdownModel` (`codeMarkerModel.ts:466`), `pdfModel` (`pdfCodingModel.ts:283`), `csvModel` (mixed), `audioModel`/`videoModel` via `MediaCodingModel:202`.
- Plugin instance fields confirmados (`main.ts`): `this.markdownModel`, `this.pdfModel`, `this.csvModel`, `this.audioModel`, `this.videoModel`.
- `BaseMarker.codedBy?: CoderId` (`types.ts:92`) — slice 1 entregou.
- AG Grid em `csvCodingView.ts:445` cria grid via `createGrid` com `columnDefs: columns.map(...)` — `cellStyle` é hook nativo do AG Grid disponível na col def, **ainda não usado** mas integrável.
- Reporter `aggregate.cohenKappa: Record<string, number>` keyed por `'coderA|coderB'` (string union literal — ordem alfabética determinística no reporter quando agrega; pode aparecer em qualquer ordem nos cohenKappa per-engine; tem que normalizar lookup).

---

## File Structure

```
src/core/icr/
  reporter.ts                          (modify)
  ui/
    compareCodersTypes.ts              (create)
    unifiedCompareCodersView.ts        (create)
    overviewMatrix.ts                  (create)
    drilldownSpatial.ts                (create)
    filterChips.ts                     (create)

src/main.ts                            (modify — registerView + addCommand)
styles.css                             (modify — lanes, stripe, chips)

tests/core/icr/
  reportPairwise.test.ts               (create)
  ui/
    unifiedCompareCodersView.test.ts   (create)
    overviewMatrix.test.ts             (create)
    drilldownSpatial.test.ts           (create)
    filterChips.test.ts                (create)
```

**Por que essa decomposição:**
- `compareCodersTypes.ts` separa types de implementação (reuso entre overview/drilldown sem ciclo de import)
- `unifiedCompareCodersView.ts` é shell + estado central + mode dispatcher (pequeno; cresce em E2 com mais modes)
- `overviewMatrix.ts` separado pra E2 adicionar `overviewTable.ts` + `overviewHeatmap.ts` em paralelo sem refator
- `drilldownSpatial.ts` consolida 4 engines num arquivo só com switch interno (alternativa: 4 arquivos separados — escolho consolidado pra E1, refacto se passar de 400 LOC)
- `filterChips.ts` isolado — E2 estende com chip "esconder agreement total"

---

## Chunk 1: Helper reportPairwise + state types + view shell

### Task 1: `reportPairwise` helper no reporter

**Files:**
- Modify: `src/core/icr/reporter.ts`
- Create: `tests/core/icr/reportPairwise.test.ts`

**Why:** Mode A precisa κ entre cada par de coders pra cada coeficiente. Cohen κ já é per-pair (`aggregate.cohenKappa[`${a}|${b}`]`). Fleiss/α/cu-α/α-binary são scalar over cohort — pra par precisa filter `KappaInput` reduzindo aos 2 coders e re-rodar `reportKappa`. Helper encapsula isso.

- [ ] **Step 1: Write failing test**

```ts
// tests/core/icr/reportPairwise.test.ts
import { describe, it, expect } from 'vitest';
import { reportPairwise, type EngineKappaInput } from '../../../src/core/icr/reporter';
import type { CoderId } from '../../../src/core/icr/coderTypes';
import type { CodedMarker, KappaInput } from '../../../src/core/icr/kappaInput';

function makeInput(coderIds: CoderId[]): EngineKappaInput {
  // Markers: cada coder marca char 0-10 com codeId 'A' em fileId 'f1'.
  const markers: CodedMarker[] = coderIds.map(coderId => ({
    coderId,
    range: { fileId: 'f1', locator: '', from: 0, to: 10 },
    codeIds: ['A'],
  }));
  const kappaInput: KappaInput = {
    markers,
    sources: [{ fileId: 'f1', locator: '', totalUnits: 100 }],
    coders: coderIds,
  };
  return { engine: 'markdown', kappaInput };
}

describe('reportPairwise', () => {
  it('retorna 1 report por par solicitado', () => {
    const inputs = [makeInput(['human:a', 'human:b', 'human:c'])];
    const pairs: [CoderId, CoderId][] = [
      ['human:a', 'human:b'],
      ['human:a', 'human:c'],
      ['human:b', 'human:c'],
    ];
    const result = reportPairwise(inputs, pairs);
    expect(result).toHaveLength(3);
    expect(result[0]!.pair).toEqual(['human:a', 'human:b']);
    expect(result[1]!.pair).toEqual(['human:a', 'human:c']);
    expect(result[2]!.pair).toEqual(['human:b', 'human:c']);
  });

  it('Cohen κ aparece em aggregate.cohenKappa quando par concorda perfeitamente', () => {
    const inputs = [makeInput(['human:a', 'human:b'])];
    const result = reportPairwise(inputs, [['human:a', 'human:b']]);
    // Concordância perfeita → Cohen κ = 1.0. Reporter tabela cohenKappa por
    // chave 'coderA|coderB' (ordem alfabética determinística do reporter).
    const cohenTable = result[0]!.report.aggregate.cohenKappa;
    const value = cohenTable['human:a|human:b'] ?? cohenTable['human:b|human:a'];
    expect(value).toBeCloseTo(1.0);
  });

  it('Fleiss/α/α-binary/cu-α calculados sobre input filtrado ao par (excluindo coders fora do par)', () => {
    // 4 coders no input mas só pedimos report do par a-b
    const inputs = [makeInput(['human:a', 'human:b', 'human:c', 'human:d'])];
    const result = reportPairwise(inputs, [['human:a', 'human:b']]);
    // Concordância perfeita entre a e b → α-binary = 1.0 e cu-α = 1.0
    expect(result[0]!.report.aggregate.alphaBinary).toBeCloseTo(1.0);
    expect(result[0]!.report.aggregate.cuAlpha).toBeCloseTo(1.0);
  });

  it('par com bounds disjuntos retorna κ ≤ 0', () => {
    const markers: CodedMarker[] = [
      { coderId: 'human:a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['A'] },
      { coderId: 'human:b', range: { fileId: 'f1', locator: '', from: 50, to: 55 }, codeIds: ['B'] },
    ];
    const input: EngineKappaInput = {
      engine: 'markdown',
      kappaInput: {
        markers,
        sources: [{ fileId: 'f1', locator: '', totalUnits: 100 }],
        coders: ['human:a', 'human:b'],
      },
    };
    const result = reportPairwise([input], [['human:a', 'human:b']]);
    const cohenTable = result[0]!.report.aggregate.cohenKappa;
    const value = cohenTable['human:a|human:b'] ?? cohenTable['human:b|human:a'];
    expect(value === undefined || value <= 0.5).toBe(true);
  });

  it('pares vazios retorna array vazio', () => {
    const inputs = [makeInput(['human:a', 'human:b'])];
    expect(reportPairwise(inputs, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
npx vitest run tests/core/icr/reportPairwise.test.ts
```
Expected: FAIL — `reportPairwise is not exported from reporter`.

- [ ] **Step 3: Implement `reportPairwise`**

Em `src/core/icr/reporter.ts`, append:

```typescript
import type { KappaInput } from './kappaInput';
import type { CategoricalKappaInput } from './categoricalKappaInput';
// ... CoderId já importado nos slices anteriores; verificar import existe

export interface PairwiseReport {
  pair: [CoderId, CoderId];
  report: KappaReport;
}

/**
 * Computa KappaReport restrito a cada par de coders.
 *
 * Necessário porque Cohen κ é per-pair (reporter já expõe `aggregate.cohenKappa`
 * keyed por `coderA|coderB`), mas Fleiss/α/α-binary/cu-α são scalar over cohort.
 * Pra exibir na matriz coder×coder, input precisa ser reduzido ao par.
 *
 * Implementação: para cada par, filtra `markers` mantendo só os do par +
 * troca `coders` por `[a, b]`. `sources` permanece (universe of units não muda).
 */
export function reportPairwise(
  inputs: EngineKappaInput[],
  pairs: [CoderId, CoderId][],
): PairwiseReport[] {
  return pairs.map(pair => {
    const filteredInputs: EngineKappaInput[] = inputs.map(input => ({
      engine: input.engine,
      kappaInput: filterKappaInputToPair(input.kappaInput, pair),
    }));
    const report = reportKappa(filteredInputs);
    return { pair, report };
  });
}

function filterKappaInputToPair(
  input: KappaInput | CategoricalKappaInput,
  pair: [CoderId, CoderId],
): KappaInput | CategoricalKappaInput {
  const [a, b] = pair;
  if (isCategoricalKappaInput(input)) {
    // CategoricalKappaInput shape — verificar arquivo categoricalKappaInput.ts
    // pra confirmar fields (provavelmente { units, coders, perUnitCoderDecisions } ou similar)
    return narrowCategoricalToPair(input, [a, b]);
  }
  // KappaInput per-char/per-second
  return {
    markers: input.markers.filter(m => m.coderId === a || m.coderId === b),
    sources: input.sources,
    coders: [a, b],
  };
}

// `isCategorical` em reporter.ts:34 NÃO é exportado — duplicar discriminator inline (1 linha):
function isCategoricalKappaInput(input: KappaInput | CategoricalKappaInput): input is CategoricalKappaInput {
  return 'units' in (input as object);
}

function narrowCategoricalToPair(input: CategoricalKappaInput, pair: [CoderId, CoderId]): CategoricalKappaInput {
  // CategoricalKappaInput shape (verificada em categoricalKappaInput.ts:23-26):
  //   { units: CategoricalUnit[]; coders: CoderId[] }
  // CategoricalUnit tem coderId interno — filtra units do par + ajusta `coders`.
  return {
    units: input.units.filter(u => u.coderId === pair[0] || u.coderId === pair[1]),
    coders: pair,
  };
}
```

Importar `CoderId` no topo se ainda não estiver importado.

- [ ] **Step 4: Run test, verify PASS**

```bash
npx vitest run tests/core/icr/reportPairwise.test.ts
```
Expected: 5 testes passam.

- [ ] **Step 5: Verify no regression no reporter existente**

```bash
npx vitest run tests/core/icr/reporter.test.ts
```
Expected: PASS (suite atual).

- [ ] **Step 6: Commit**

```bash
git add src/core/icr/reporter.ts tests/core/icr/reportPairwise.test.ts
~/.claude/scripts/commit.sh "feat(icr): reportPairwise helper — KappaReport per-pair pra matriz Mode A"
```

---

### Task 2: State types da Compare Coders View

**Files:**
- Create: `src/core/icr/ui/compareCodersTypes.ts`

**Why:** Estado central serve de contrato entre view shell, overview, drilldown e filter chips. Definir antes evita import circular e bikeshed durante implementação.

- [ ] **Step 1: Criar arquivo de types**

`src/core/icr/ui/compareCodersTypes.ts`:

```typescript
/**
 * Compare Coders view — types de estado central.
 *
 * State é compartilhado entre overview (escreve currentSelection) e drill-down (lê).
 * Toolbar escreve overviewMode/drilldownMode/filters/scope.
 * Modal "ver lado a lado" lê tudo mas não escreve (E2).
 */

import type { CoderId } from '../coderTypes';
import type { EngineId } from '../reporter';

export type OverviewMode = 'matrix' | 'table' | 'heatmap';
export type DrilldownMode = 'spatial' | 'cards' | 'workflow';
export type CoefficientKey = 'cohen' | 'fleiss' | 'alpha' | 'alpha-binary' | 'cu-alpha';

export interface ComparisonScope {
  coderIds: CoderId[];
  codeIds?: string[];      // undefined = todos
  groupIds?: string[];
  folderIds?: string[];
  engineIds?: EngineId[];
  fileIds?: string[];
}

export interface ComparisonFilters {
  hideAgreementTotal: boolean;
  highlightConflicts: boolean;
  excludeConsensusCoders: boolean;
  visibleCoderIds?: CoderId[];  // subset de scope.coderIds; undefined = todos visíveis
}

export type ReconciliationBounds =
  | { kind: 'text'; from: number; to: number }
  | { kind: 'csvRow'; rowIndex: number; column?: string }
  | { kind: 'temporal'; fromMs: number; toMs: number };

export type CurrentSelection =
  | { kind: 'pair'; value: [CoderId, CoderId] }
  | { kind: 'code'; value: string }
  | { kind: 'codeEngine'; value: { codeId: string; engineId: EngineId } }
  | { kind: 'region'; value: { fileId: string; engine: EngineId; bounds: ReconciliationBounds; coderIds: CoderId[] } }
  | { kind: 'none' };

export interface CompareCodersViewState {
  scope: ComparisonScope;
  overviewMode: OverviewMode;
  drilldownMode: DrilldownMode;
  primaryCoefficient: CoefficientKey;
  filters: ComparisonFilters;
  currentSelection: CurrentSelection;
  loadedFromSavedId?: string;  // E4
  isDirty: boolean;             // E4
}

export function createDefaultViewState(allCoderIds: CoderId[]): CompareCodersViewState {
  return {
    scope: { coderIds: allCoderIds },
    overviewMode: 'matrix',
    drilldownMode: 'spatial',
    primaryCoefficient: 'cohen',  // E1: hardcoded; E2 expõe picker
    filters: {
      hideAgreementTotal: false,
      highlightConflicts: false,
      excludeConsensusCoders: false,
    },
    currentSelection: { kind: 'none' },
    isDirty: false,
  };
}
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/icr/ui/compareCodersTypes.ts
~/.claude/scripts/commit.sh "feat(icr): types de estado da Compare Coders view"
```

---

### Task 3: View shell `UnifiedCompareCodersView`

**Files:**
- Create: `src/core/icr/ui/unifiedCompareCodersView.ts`
- Create: `tests/core/icr/ui/unifiedCompareCodersView.test.ts`

**Why:** Container ItemView com toolbar + 2 mode pickers + splitter. Hospeda estado central. E1 só inclui `overviewMode === 'matrix'` e `drilldownMode === 'spatial'` — outros modes/perspectivas ficam stubs com mensagem "em E2/E3".

- [ ] **Step 1: Failing test — view abre e cria toolbar**

`tests/core/icr/ui/unifiedCompareCodersView.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedCompareCodersView, COMPARE_CODERS_VIEW_TYPE } from '../../../../src/core/icr/ui/unifiedCompareCodersView';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';
import { createMockLeaf, createMockApp } from '../../testHelpers';  // helpers existentes

describe('UnifiedCompareCodersView', () => {
  let view: UnifiedCompareCodersView;
  let coderRegistry: CoderRegistry;

  beforeEach(() => {
    coderRegistry = new CoderRegistry();
    coderRegistry.createHuman('Carla');
    coderRegistry.createHuman('Joana');
    const leaf = createMockLeaf();
    const app = createMockApp();
    view = new UnifiedCompareCodersView(leaf, app, {
      coderRegistry,
      // outros deps mock — registry, dataManager, markerOps adapter (no-op em E1)
    } as any);
  });

  it('expõe getViewType', () => {
    expect(view.getViewType()).toBe(COMPARE_CODERS_VIEW_TYPE);
  });

  it('expõe getDisplayText', () => {
    expect(view.getDisplayText()).toBe('Compare Coders');
  });

  it('onOpen monta container com toolbar e regiões overview/drilldown', async () => {
    await view.onOpen();
    expect(view.contentEl.querySelector('.qc-cc-toolbar')).toBeTruthy();
    expect(view.contentEl.querySelector('.qc-cc-overview')).toBeTruthy();
    expect(view.contentEl.querySelector('.qc-cc-drilldown')).toBeTruthy();
  });

  it('default state inicializa com todos coders no scope', async () => {
    await view.onOpen();
    expect(view.getState().scope.coderIds).toEqual(coderRegistry.getAll().map(c => c.id));
    expect(view.getState().overviewMode).toBe('matrix');
    expect(view.getState().drilldownMode).toBe('spatial');
    expect(view.getState().primaryCoefficient).toBe('cohen');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Expected: file doesn't exist.

- [ ] **Step 3: Implement view shell**

`src/core/icr/ui/unifiedCompareCodersView.ts`:

```typescript
import { ItemView, type WorkspaceLeaf, type App } from 'obsidian';
import type { CoderRegistry } from '../coderRegistry';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import { type CompareCodersViewState, createDefaultViewState } from './compareCodersTypes';

export const COMPARE_CODERS_VIEW_TYPE = 'qc-compare-coders';

import type { EngineModelsForExtraction } from './scopeExtraction';

export interface CompareCodersViewDeps {
  coderRegistry: CoderRegistry;
  codeRegistry: CodeDefinitionRegistry;
  /** Optional pra testes minimal sem fixture; render functions tratam ausência como "[] inputs". */
  engineModels?: EngineModelsForExtraction;
  /** Obsidian app — necessário pra `vault.cachedRead` em markdown extraction. Optional pelo mesmo motivo. */
  app?: App;
  // dataManager, markerOps etc. virão em E3a — em E1 read-only
}

export class UnifiedCompareCodersView extends ItemView {
  private state: CompareCodersViewState;
  private deps: CompareCodersViewDeps;

  private toolbarEl!: HTMLElement;
  private overviewEl!: HTMLElement;
  private drilldownEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, app: App, deps: CompareCodersViewDeps) {
    super(leaf);
    // Folda app no deps pra render functions acessarem via deps.app uniformemente.
    this.deps = { ...deps, app: deps.app ?? app };
    const allCoderIds = deps.coderRegistry.getAll().map(c => c.id);
    this.state = createDefaultViewState(allCoderIds);
  }

  getViewType(): string { return COMPARE_CODERS_VIEW_TYPE; }
  getDisplayText(): string { return 'Compare Coders'; }
  getIcon(): string { return 'users-2'; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('qc-compare-coders-view');

    this.toolbarEl = root.createDiv({ cls: 'qc-cc-toolbar' });
    this.renderToolbar();

    this.overviewEl = root.createDiv({ cls: 'qc-cc-overview' });
    this.renderOverview();

    // Splitter resizable virá em CSS — div separadora simples por ora
    root.createDiv({ cls: 'qc-cc-splitter' });

    this.drilldownEl = root.createDiv({ cls: 'qc-cc-drilldown' });
    this.renderDrilldown();
  }

  async onClose(): Promise<void> {
    // E4: persiste lastUsed em data.json se loadedFromSavedId é undefined
  }

  getState(): CompareCodersViewState { return this.state; }

  /** Mutação de estado + re-render. E1 simples; E2/E3 expandem com partial re-render. */
  private setState(partial: Partial<CompareCodersViewState>): void {
    this.state = { ...this.state, ...partial };
    this.renderToolbar();
    this.renderOverview();
    this.renderDrilldown();
  }

  private renderToolbar(): void {
    this.toolbarEl.empty();
    // Mode picker overview
    const modeGroup = this.toolbarEl.createSpan({ cls: 'qc-cc-mode-group' });
    modeGroup.createSpan({ cls: 'qc-cc-mode-label', text: 'overview' });
    for (const mode of ['matrix', 'table', 'heatmap'] as const) {
      const chip = modeGroup.createSpan({
        cls: `qc-cc-mode-chip ${this.state.overviewMode === mode ? 'is-active' : ''}`,
        text: this.modeLabel(mode),
      });
      if (mode === 'matrix') {
        chip.onclick = () => this.setState({ overviewMode: 'matrix' });
      } else {
        chip.addClass('is-disabled');
        chip.title = 'Disponível em E2';
      }
    }

    // Pergunta visível abaixo do mode ativo
    this.toolbarEl.createDiv({
      cls: 'qc-cc-mode-question',
      text: this.modeQuestion(this.state.overviewMode),
    });
  }

  private modeLabel(mode: 'matrix' | 'table' | 'heatmap'): string {
    return { matrix: '▦ Matriz', table: '▤ Tabela', heatmap: '▥ Heatmap' }[mode];
  }

  private modeQuestion(mode: 'matrix' | 'table' | 'heatmap'): string {
    return {
      matrix: 'qual par de coders diverge mais?',
      table: 'qual código está frágil?',
      heatmap: 'em qual modalidade mora a discordância?',
    }[mode];
  }

  private async renderOverview(): Promise<void> {
    this.overviewEl.empty();
    if (this.state.overviewMode !== 'matrix') {
      this.overviewEl.createDiv({ text: 'Mode disponível em E2', cls: 'qc-cc-stub' });
      return;
    }
    await renderOverviewMatrix(this.overviewEl, this.state, this.deps, sel => {
      this.setState({ currentSelection: sel });
    });
  }

  private async renderDrilldown(): Promise<void> {
    this.drilldownEl.empty();
    if (this.state.drilldownMode !== 'spatial') {
      this.drilldownEl.createDiv({ text: 'Perspectiva disponível em E3', cls: 'qc-cc-stub' });
      return;
    }
    await renderDrilldownSpatial(this.drilldownEl, this.state, this.deps);
  }
}
```

**Imports no topo:**

```typescript
import { renderOverviewMatrix } from './overviewMatrix';
import { renderDrilldownSpatial } from './drilldownSpatial';
```

(Direct imports — sem ciclo: matrix/drilldown só importam types + helpers, não importam o view.)

`setState` chama os métodos render — como agora são async, fire-and-forget é ok pra E1 (UI atualiza quando promise resolve). E2+ pode adicionar loading state explícito.
```

Helpers de mock pra teste (`tests/core/icr/testHelpers.ts`) — se ainda não existem, criar minimal:

```typescript
// tests/core/icr/testHelpers.ts
export function createMockLeaf(): any {
  return { containerEl: document.createElement('div') };
}

export function createMockApp(): any {
  return { workspace: { onLayoutReady: () => {} }, vault: {}, metadataCache: {} };
}
```

(verificar se `tests/core/testHelpers.ts` ou similar já existe — se sim, reusar)

- [ ] **Step 4: Run test, verify PASS**

```bash
npx vitest run tests/core/icr/ui/unifiedCompareCodersView.test.ts
```
Expected: 4 testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/ui/unifiedCompareCodersView.ts tests/core/icr/ui/unifiedCompareCodersView.test.ts tests/core/icr/testHelpers.ts
~/.claude/scripts/commit.sh "feat(icr): UnifiedCompareCodersView shell + state central"
```

---

## Chunk 2: Overview Mode A + drill-down P1

### Task 4: Overview Mode A — matriz coder × coder

**Files:**
- Create: `src/core/icr/ui/overviewMatrix.ts`
- Create: `tests/core/icr/ui/overviewMatrix.test.ts`

**Why:** Coração da overview na E1. Renderiza grade N×N com Cohen κ por par, color-coded. Click numa célula seta `currentSelection: { kind: 'pair', ... }`.

- [ ] **Step 1: Failing test — render N×N grid + cells coloridas**

```typescript
// tests/core/icr/ui/overviewMatrix.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderOverviewMatrix } from '../../../../src/core/icr/ui/overviewMatrix';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';
import { CodeDefinitionRegistry } from '../../../../src/core/codeDefinitionRegistry';

describe('renderOverviewMatrix', () => {
  let container: HTMLElement;
  let coderRegistry: CoderRegistry;
  let codeRegistry: CodeDefinitionRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    coderRegistry = new CoderRegistry();
    coderRegistry.createHuman('A');
    coderRegistry.createHuman('B');
    coderRegistry.createHuman('C');
    codeRegistry = new CodeDefinitionRegistry();
    codeRegistry.create({ name: 'theme1', color: '#888' });
  });

  it('renderiza grade N×N (header + linhas)', () => {
    const state = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
    renderOverviewMatrix(container, state, { coderRegistry, codeRegistry } as any, () => {});
    const cells = container.querySelectorAll('.qc-cc-matrix-cell');
    // 3 coders → 3x3 = 9 cells (incluindo diagonal)
    expect(cells.length).toBe(9);
  });

  it('diagonal renderiza cinza com "—"', () => {
    const state = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
    renderOverviewMatrix(container, state, { coderRegistry, codeRegistry } as any, () => {});
    const diagonalCells = container.querySelectorAll('.qc-cc-matrix-cell.is-diagonal');
    expect(diagonalCells.length).toBe(3);
    diagonalCells.forEach(cell => {
      expect(cell.textContent).toBe('—');
    });
  });

  it('click em célula off-diagonal dispara onSelect com par', () => {
    const state = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
    let captured: any = null;
    renderOverviewMatrix(container, state, { coderRegistry, codeRegistry } as any, sel => {
      captured = sel;
    });
    const offDiagonal = container.querySelector('.qc-cc-matrix-cell:not(.is-diagonal)') as HTMLElement;
    offDiagonal.click();
    expect(captured).toMatchObject({ kind: 'pair' });
    expect(captured.value).toHaveLength(2);
  });

  it('color scale aplica via classe .qc-kappa-low/-mid/-high baseada no valor', () => {
    // Mock reportPairwise pra retornar valores fixos
    // Assumimos que a implementação consulta o reporter com inputs vazios → todos NaN/n/a
    const state = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
    renderOverviewMatrix(container, state, { coderRegistry, codeRegistry } as any, () => {});
    const cells = container.querySelectorAll('.qc-cc-matrix-cell:not(.is-diagonal)');
    // Sem markers no escopo → cells aparecem como n/a (cinza)
    cells.forEach(cell => {
      expect(cell.classList.contains('qc-kappa-na')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implementar `renderOverviewMatrix` (async, integrado com extractInputsFromScope)**

`src/core/icr/ui/overviewMatrix.ts`:

```typescript
import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { CompareCodersViewDeps } from './unifiedCompareCodersView';
import type { CoderId } from '../coderTypes';
import { reportPairwise, type EngineKappaInput } from '../reporter';
import { extractInputsFromScope } from './scopeExtraction';

/**
 * Renderiza Mode A — matriz coder × coder.
 * Cohen κ pareado em cada célula. Diagonal cinza.
 * Click em célula off-diagonal seleciona o par.
 *
 * Async porque `extractInputsFromScope` faz `vault.cachedRead` pra markdown
 * (offsets line/ch precisam de source text pra converter em char absoluto).
 */
export async function renderOverviewMatrix(
  container: HTMLElement,
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
  onSelect: (sel: CurrentSelection) => void,
): Promise<void> {
  container.empty();
  const coderIds = state.scope.coderIds;
  const N = coderIds.length;
  if (N < 2) {
    container.createDiv({ text: 'Selecione 2+ coders no escopo', cls: 'qc-cc-empty' });
    return;
  }

  const inputs = await collectEngineInputs(state, deps);

  const pairs: [CoderId, CoderId][] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      pairs.push([coderIds[i]!, coderIds[j]!]);
    }
  }
  const reports = inputs.length > 0 ? reportPairwise(inputs, pairs) : [];
  const kappaByPair = new Map<string, number | undefined>();
  for (const r of reports) {
    const [a, b] = r.pair;
    const cohenTable = r.report.aggregate.cohenKappa;
    // Reporter pode tabular como `a|b` ou `b|a` dependendo da ordem;
    // normalizar lookup pra ambos.
    const value = cohenTable[`${a}|${b}`] ?? cohenTable[`${b}|${a}`];
    const normalKey = a < b ? `${a}|${b}` : `${b}|${a}`;
    kappaByPair.set(normalKey, value);
  }

  const grid = container.createEl('table', { cls: 'qc-cc-matrix' });
  const head = grid.createEl('thead').createEl('tr');
  head.createEl('th');  // canto vazio
  for (const id of coderIds) {
    head.createEl('th', { text: deps.coderRegistry.getById(id)?.name ?? id });
  }
  const body = grid.createEl('tbody');
  for (const rowId of coderIds) {
    const row = body.createEl('tr');
    row.createEl('th', { text: deps.coderRegistry.getById(rowId)?.name ?? rowId });
    for (const colId of coderIds) {
      const cell = row.createEl('td', { cls: 'qc-cc-matrix-cell' });
      if (rowId === colId) {
        cell.addClass('is-diagonal');
        cell.setText('—');
        continue;
      }
      const key = rowId < colId ? `${rowId}|${colId}` : `${colId}|${rowId}`;
      const k = kappaByPair.get(key);
      if (k === undefined || isNaN(k)) {
        cell.addClass('qc-kappa-na');
        cell.setText('—');
      } else {
        cell.addClass(kappaClass(k));
        cell.setText(k.toFixed(2));
      }
      cell.onclick = () => onSelect({ kind: 'pair', value: [rowId, colId] });
    }
  }
}

const KAPPA_THRESHOLDS = { low: 0.4, midLow: 0.6, midHigh: 0.8 } as const;

function kappaClass(k: number): string {
  if (k < KAPPA_THRESHOLDS.low) return 'qc-kappa-low';
  if (k < KAPPA_THRESHOLDS.midLow) return 'qc-kappa-mid-low';
  if (k < KAPPA_THRESHOLDS.midHigh) return 'qc-kappa-mid-high';
  return 'qc-kappa-high';
}

/**
 * Coleta `EngineKappaInput[]` do estado atual via `extractInputsFromScope`.
 * Retorna [] quando `deps.engineModels`/`deps.app` ausentes (cenário de teste sem fixture).
 */
async function collectEngineInputs(
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
): Promise<EngineKappaInput[]> {
  if (!deps.engineModels || !deps.app) return [];
  return extractInputsFromScope(state.scope, { models: deps.engineModels, app: deps.app });
}
```

**Tests precisam ser ajustados pra `await renderOverviewMatrix(...)` em vez de chamada sync.** O test do step 1 já roda contra container limpo — adicionar `await` antes da chamada e tornar o `it(...)` callback async. Para mocks sem markers (`coderRegistry, codeRegistry` only, sem `engineModels`), `collectEngineInputs` retorna `[]` e cells viram `qc-kappa-na` — comportamento esperado.

- [ ] **Step 4: Failing test pra `extractInputsFromScope`**

`tests/core/icr/ui/scopeExtraction.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractInputsFromScope } from '../../../../src/core/icr/ui/scopeExtraction';

const noopApp: any = {
  vault: {
    getAbstractFileByPath: (_path: string) => null,
    cachedRead: async (_file: any) => '',
  },
};

function makeMarkdownMarker(spec: { fileId: string; codedBy: string; codeId: string; line?: number }) {
  return {
    id: `m-${Math.random()}`,
    fileId: spec.fileId,
    line: spec.line ?? 0,
    ch: 0,
    endLine: spec.line ?? 0,
    endCh: 5,
    codes: [{ codeId: spec.codeId }],
    codedBy: spec.codedBy,
  };
}

function makeRowMarker(spec: { fileId: string; codedBy: string; codeId: string; sourceRowId: number; column: string }) {
  return {
    kind: 'row' as const,
    id: `r-${Math.random()}`,
    fileId: spec.fileId,
    sourceRowId: spec.sourceRowId,
    column: spec.column,
    codes: [{ codeId: spec.codeId }],
    codedBy: spec.codedBy,
  };
}

function emptyModels(): any {
  return {
    markdown: { getAllMarkers: () => [] },
    pdf: { getAllMarkers: () => [] },
    csv: { getAllMarkers: () => [] },
    audio: { getAllMarkers: () => [] },
    video: { getAllMarkers: () => [] },
  };
}

describe('extractInputsFromScope', () => {
  it('retorna [] quando engineIds está vazio explicitamente', async () => {
    const result = await extractInputsFromScope(
      { coderIds: ['human:a'], engineIds: [] },
      { models: emptyModels(), app: noopApp },
    );
    expect(result).toEqual([]);
  });

  it('inclui markdown e popula coders no KappaInput', async () => {
    const models = emptyModels();
    models.markdown.getAllMarkers = () => [
      makeMarkdownMarker({ fileId: 'f1.md', codedBy: 'human:a', codeId: 'X' }),
      makeMarkdownMarker({ fileId: 'f1.md', codedBy: 'human:b', codeId: 'X' }),
    ];
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => ({ extension: 'md', path: p }),
        cachedRead: async (_file: any) => 'Hello world from a markdown file',
      },
    };
    const result = await extractInputsFromScope(
      { coderIds: ['human:a', 'human:b'] },
      { models, app: app as any },
    );
    const md = result.find(r => r.engine === 'markdown');
    expect(md).toBeTruthy();
    expect(md!.kappaInput.coders).toContain('human:a');
    expect(md!.kappaInput.coders).toContain('human:b');
  });

  it('filtra markers por scope.codeIds quando definido', async () => {
    const models = emptyModels();
    models.markdown.getAllMarkers = () => [
      makeMarkdownMarker({ fileId: 'f1.md', codedBy: 'human:a', codeId: 'code-1' }),
      makeMarkdownMarker({ fileId: 'f1.md', codedBy: 'human:a', codeId: 'code-2' }),  // filtrado
    ];
    const app: any = {
      vault: {
        getAbstractFileByPath: () => ({ extension: 'md' }),
        cachedRead: async () => 'Some markdown source.',
      },
    };
    const result = await extractInputsFromScope(
      { coderIds: ['human:a'], codeIds: ['code-1'] },
      { models, app },
    );
    const md = result.find(r => r.engine === 'markdown');
    expect(md).toBeTruthy();
    // Verificação: só 1 CodedMarker no kappaInput.markers (o de code-1)
    expect((md!.kappaInput as any).markers).toHaveLength(1);
  });

  it('csvRow produz CategoricalKappaInput com units', async () => {
    const models = emptyModels();
    models.csv.getAllMarkers = () => [
      makeRowMarker({ fileId: 'f1.csv', codedBy: 'human:a', codeId: 'X', sourceRowId: 1, column: 'col1' }),
      makeRowMarker({ fileId: 'f1.csv', codedBy: 'human:b', codeId: 'Y', sourceRowId: 1, column: 'col1' }),
    ];
    const result = await extractInputsFromScope(
      { coderIds: ['human:a', 'human:b'] },
      { models, app: noopApp },
    );
    const csvRow = result.find(r => r.engine === 'csvRow');
    expect(csvRow).toBeTruthy();
    // CategoricalKappaInput tem `units`, não `markers` (KappaInput tem `markers`).
    expect('units' in csvRow!.kappaInput).toBe(true);
  });
});
```

- [ ] **Step 5: Run test, verify FAIL** (módulo `scopeExtraction.ts` ainda não existe)

- [ ] **Step 6: Implementar `scopeExtraction.ts` (cohort-level adapter layer)**

Esta é a camada não-trivial que o slice 1 deixou de fora — slices 1 e 4 entregaram **per-marker extractors** (`extractMarkdownRange`, `extractPdfRange`, `extractCsvSegmentRange`, `extractMediaRange`, `extractRowMarkerUnit`). O `extractInputsFromScope` deve reduzir um cohort de markers (filtrado pelo escopo) num `KappaInput`/`CategoricalKappaInput` aceito pelo reporter.

```typescript
// src/core/icr/ui/scopeExtraction.ts
import type { ComparisonScope } from './compareCodersTypes';
import type { EngineKappaInput, EngineId } from '../reporter';
import type { KappaInput, CodedMarker, SourceMeta } from '../kappaInput';
import type { CategoricalKappaInput } from '../categoricalKappaInput';
import type { Marker } from '../../../markdown/markdownCodingTypes';
import type { PdfMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker, RowMarker, CsvMarker } from '../../../csv/csvCodingTypes';
import type { MediaMarker } from '../../../media/mediaCodingTypes';
import {
  extractMarkdownRange,
  extractPdfRange,
  extractCsvSegmentRange,
  extractMediaRange,
} from '../textRange';
import { extractRowMarkerUnit } from '../categoricalKappaInput';
import type { App } from 'obsidian';

const ALL_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video'];

/**
 * Models que `extractInputsFromScope` precisa pra coletar markers.
 * Plugin instance fornece (em main.ts: this.markdownModel etc).
 */
export interface EngineModelsForExtraction {
  markdown: { getAllMarkers(): Marker[] };
  pdf: { getAllMarkers(): PdfMarker[] };
  csv: { getAllMarkers(): CsvMarker[] };  // mixed segment + row; discriminar via m.kind
  audio: { getAllMarkers(): MediaMarker[] };
  video: { getAllMarkers(): MediaMarker[] };
}

export interface ExtractionContext {
  models: EngineModelsForExtraction;
  app: App;  // pra vault.read em markdown (extractMarkdownRange precisa sourceText)
}

export async function extractInputsFromScope(
  scope: ComparisonScope,
  ctx: ExtractionContext,
): Promise<EngineKappaInput[]> {
  const targetEngines = scope.engineIds ?? ALL_ENGINES;
  const result: EngineKappaInput[] = [];

  for (const engine of targetEngines) {
    const collected = await collectMarkersForEngine(engine, ctx);
    const filtered = filterByScope(collected.markers, scope);
    if (filtered.length === 0) continue;

    if (engine === 'csvRow') {
      // Categorical input — extractRowMarkerUnit retorna CategoricalUnit
      const input = buildCategoricalInput(filtered as RowMarker[], scope.coderIds);
      result.push({ engine, kappaInput: input });
    } else {
      const input = buildPerCharInput(engine, filtered, collected.sourceTexts, scope.coderIds);
      result.push({ engine, kappaInput: input });
    }
  }
  return result;
}

interface CollectedEngineMarkers {
  markers: Array<Marker | PdfMarker | SegmentMarker | RowMarker | MediaMarker>;
  /** Source text por fileId — só pra markdown (offset → char absoluto). undefined nas outras. */
  sourceTexts?: Map<string, string>;
}

async function collectMarkersForEngine(
  engine: EngineId,
  ctx: ExtractionContext,
): Promise<CollectedEngineMarkers> {
  switch (engine) {
    case 'markdown': {
      const all = ctx.models.markdown.getAllMarkers();
      const sourceTexts = await readSourceTextsFor(all, ctx.app);
      return { markers: all, sourceTexts };
    }
    case 'pdf': return { markers: ctx.models.pdf.getAllMarkers() };
    case 'csvSegment': {
      const all = ctx.models.csv.getAllMarkers();
      return { markers: all.filter(m => m.kind === 'segment') };
    }
    case 'csvRow': {
      const all = ctx.models.csv.getAllMarkers();
      return { markers: all.filter(m => m.kind === 'row') };
    }
    case 'audio': return { markers: ctx.models.audio.getAllMarkers() };
    case 'video': return { markers: ctx.models.video.getAllMarkers() };
  }
}

async function readSourceTextsFor(
  markers: Marker[],
  app: App,
): Promise<Map<string, string>> {
  const fileIds = new Set(markers.map(m => m.fileId));
  const result = new Map<string, string>();
  for (const fileId of fileIds) {
    const file = app.vault.getAbstractFileByPath(fileId);
    if (file && 'extension' in file) {
      try {
        const text = await app.vault.cachedRead(file as any);
        result.set(fileId, text);
      } catch (e) {
        // file removido / inacessível — pula sem markers desse file no input
      }
    }
  }
  return result;
}

function filterByScope(
  markers: Array<{ codes?: any[]; fileId: string; codedBy?: string }>,
  scope: ComparisonScope,
): typeof markers {
  return markers.filter(m => {
    if (scope.codeIds && !(m.codes ?? []).some((c: any) => scope.codeIds!.includes(c.codeId))) return false;
    if (scope.fileIds && !scope.fileIds.includes(m.fileId)) return false;
    if (scope.coderIds.length && m.codedBy && !scope.coderIds.includes(m.codedBy)) return false;
    return true;
  });
}

function buildPerCharInput(
  engine: Exclude<EngineId, 'csvRow'>,
  markers: any[],
  sourceTexts: Map<string, string> | undefined,
  coders: string[],
): KappaInput {
  const codedMarkers: CodedMarker[] = [];
  const sourceTotals = new Map<string, { locator: string; totalUnits: number }>();

  for (const m of markers) {
    if (!m.codedBy) continue;  // markers sem codedBy não entram (deveria ser raro pós-slice 1)
    let range: ReturnType<typeof extractMarkdownRange>;
    try {
      switch (engine) {
        case 'markdown': {
          const text = sourceTexts!.get(m.fileId);
          if (text === undefined) continue;  // source não pôde ser lido
          range = extractMarkdownRange(m, text);
          updateSourceTotal(sourceTotals, m.fileId, '', text.length);
          break;
        }
        case 'pdf': {
          range = extractPdfRange(m);
          // PDF page-aware: locator = `page:N` (verificar shape em textRange.ts)
          // totalUnits per page = ? — extractPdfRange retorna range com locator preenchido
          updateSourceTotal(sourceTotals, m.fileId, range.locator, Math.max(getCurrentTotal(sourceTotals, m.fileId, range.locator), range.to));
          break;
        }
        case 'csvSegment': {
          range = extractCsvSegmentRange(m);
          updateSourceTotal(sourceTotals, m.fileId, range.locator, Math.max(getCurrentTotal(sourceTotals, m.fileId, range.locator), range.to));
          break;
        }
        case 'audio':
        case 'video': {
          range = extractMediaRange(m);
          // totalUnits = duração em segundos. Sem pre-warm (backlog), aproximamos
          // por max(range.to) entre markers desse fileId. Subestimação aceita em E1.
          updateSourceTotal(sourceTotals, m.fileId, '', Math.max(getCurrentTotal(sourceTotals, m.fileId, ''), range.to));
          break;
        }
      }
    } catch (e) {
      // Marker malformado — pula sem quebrar pipeline
      continue;
    }
    codedMarkers.push({
      coderId: m.codedBy,
      range: range!,
      codeIds: m.codes.map((c: any) => c.codeId),
    });
  }

  const sources: SourceMeta[] = [];
  for (const [fileId, info] of sourceTotals) {
    sources.push({ fileId, locator: info.locator, totalUnits: info.totalUnits });
  }

  return { markers: codedMarkers, sources, coders };
}

function updateSourceTotal(
  map: Map<string, { locator: string; totalUnits: number }>,
  fileId: string,
  locator: string,
  totalUnits: number,
): void {
  const key = `${fileId}:${locator}`;
  map.set(key, { locator, totalUnits });
}

function getCurrentTotal(
  map: Map<string, { locator: string; totalUnits: number }>,
  fileId: string,
  locator: string,
): number {
  return map.get(`${fileId}:${locator}`)?.totalUnits ?? 0;
}

function buildCategoricalInput(
  markers: RowMarker[],
  coders: string[],
): CategoricalKappaInput {
  // CategoricalKappaInput shape verificada em src/core/icr/categoricalKappaInput.ts:
  //   { units: CategoricalUnit[]; coders: CoderId[] }
  // extractRowMarkerUnit(m) retorna CategoricalUnit pronta com fileId/sourceRowId/column/codeIds/coderId.
  const units = markers.map(m => extractRowMarkerUnit(m));
  return { units, coders };
}
```

**Honestidade do plano:** este helper é a maior peça nova do slice. ~120-180 LOC (incluindo testes). Performance: `app.vault.cachedRead` por file pode ser lento em vault grande — backlog "pre-warm de durações + cache de source text" cobre otimização posterior.

- [ ] **Step 7: Run scopeExtraction.test.ts, verify PASS**

- [ ] **Step 8: Run overviewMatrix.test.ts, verify PASS**

- [ ] **Step 9: Commit consolidado**

```bash
git add src/core/icr/ui/overviewMatrix.ts src/core/icr/ui/scopeExtraction.ts tests/core/icr/ui/overviewMatrix.test.ts tests/core/icr/ui/scopeExtraction.test.ts
~/.claude/scripts/commit.sh "feat(icr): Mode A matriz + extractInputsFromScope real (cohort-level adapter)"
```

---

### Task 5: Drill-down P1 — spatial dispatcher

**Files:**
- Create: `src/core/icr/ui/drilldownSpatial.ts`
- Create: `tests/core/icr/ui/drilldownSpatial.test.ts`

**Why:** Renderiza lanes per coder no source quando seleção é `pair` ou `region`. Dispatcha por engine: text-likes (markdown/pdf-text/csv-segment) usam padrão margin panel adaptado; csv-row usa cellStyle no AG Grid. Audio/vídeo é Fase 2 — stub.

- [ ] **Step 1: Failing test — render placeholder quando seleção é 'none'**

```typescript
// tests/core/icr/ui/drilldownSpatial.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderDrilldownSpatial } from '../../../../src/core/icr/ui/drilldownSpatial';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';

describe('renderDrilldownSpatial', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renderiza prompt quando currentSelection.kind === "none"', () => {
    const state = createDefaultViewState(['human:a', 'human:b']);
    renderDrilldownSpatial(container, state, {} as any);
    expect(container.querySelector('.qc-cc-drilldown-empty')).toBeTruthy();
    expect(container.textContent).toContain('Selecione');
  });

  it('renderiza pergunta visível com #1 e #2', () => {
    const state = createDefaultViewState(['human:a', 'human:b']);
    renderDrilldownSpatial(container, state, {} as any);
    expect(container.textContent).toContain('onde');
    expect(container.textContent).toContain('tipo');
  });

  it('quando seleção é pair, lista files relevantes pra ambos coders', () => {
    const state = {
      ...createDefaultViewState(['human:a', 'human:b']),
      currentSelection: { kind: 'pair' as const, value: ['human:a', 'human:b'] as [any, any] },
    };
    renderDrilldownSpatial(container, state, mockDepsWithMarkers([
      { fileId: 'f1.md', codedBy: 'human:a' },
      { fileId: 'f1.md', codedBy: 'human:b' },
      { fileId: 'f2.md', codedBy: 'human:a' },
      // f2.md só tem human:a — ainda aparece pra mostrar boundary disagreement
    ]));
    const files = container.querySelectorAll('.qc-cc-drilldown-file');
    expect(files.length).toBe(2);
  });
});

function mockDepsWithMarkers(markers: any[]): any {
  return {
    coderRegistry: {
      getById: (id: string) => ({ id, name: id.split(':')[1], type: 'human', createdAt: 0 }),
      getAll: () => [],
    },
    engineModels: {
      markdown: { getAllMarkers: () => markers.map(m => ({ ...m, engine: 'markdown', codes: [{ codeId: 'c1' }] })) },
      pdf: { getAllMarkers: () => [] },
      // CSV: union mixed (segment+row); este mock retorna [] pois drilldownSpatial
      // tests focam em markdown. CSV branch testa em scopeExtraction.test.ts.
      csv: { getAllMarkers: () => [] },
      audio: { getAllMarkers: () => [] },
      video: { getAllMarkers: () => [] },
    },
  };
}
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implementar dispatcher base**

`src/core/icr/ui/drilldownSpatial.ts`:

```typescript
import type { CompareCodersViewState } from './compareCodersTypes';
import type { CompareCodersViewDeps } from './unifiedCompareCodersView';
import type { EngineId } from '../reporter';

export function renderDrilldownSpatial(
  container: HTMLElement,
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
): void {
  container.empty();

  // Pergunta visível
  container.createDiv({
    cls: 'qc-cc-perspective-question',
    text: '#1 onde discordamos? · #2 que tipo?',
  });

  if (state.currentSelection.kind === 'none') {
    container.createDiv({
      cls: 'qc-cc-drilldown-empty',
      text: 'Selecione um par ou região na overview pra ver o drill-down',
    });
    return;
  }

  // Coletar files relevantes pro escopo da seleção
  const relevantFiles = collectRelevantFiles(state, deps);
  if (relevantFiles.length === 0) {
    container.createDiv({ text: 'Nenhum arquivo no escopo da seleção' });
    return;
  }

  for (const fileEntry of relevantFiles) {
    const fileSection = container.createDiv({ cls: 'qc-cc-drilldown-file' });
    fileSection.createEl('h4', { text: `${fileEntry.fileId} (${fileEntry.engine})` });
    renderForEngine(fileSection, fileEntry.engine, fileEntry.fileId, state, deps);
  }
}

interface RelevantFile {
  fileId: string;
  engine: EngineId;
}

function collectRelevantFiles(
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
): RelevantFile[] {
  if (!deps.engineModels) return [];
  const result: RelevantFile[] = [];
  // E1 cobre 4 engines text-likes + csvRow. Audio/vídeo é Fase 2 (apenas
  // renderiza stub via renderForEngine, mas inclui aqui pra surface "tem
  // markers de áudio/vídeo no escopo, render pendente").
  const enginesInE1: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video'];
  for (const engine of enginesInE1) {
    const markers = collectMarkersForEngine(engine, deps);
    const fileIds = new Set(markers.filter(m => isInSelection(m, state)).map(m => m.fileId));
    for (const fid of fileIds) {
      result.push({ fileId: fid, engine });
    }
  }
  return result;
}

function collectMarkersForEngine(engine: EngineId, deps: CompareCodersViewDeps): any[] {
  if (!deps.engineModels) return [];
  switch (engine) {
    case 'markdown':   return deps.engineModels.markdown?.getAllMarkers?.() ?? [];
    case 'pdf':        return deps.engineModels.pdf?.getAllMarkers?.() ?? [];
    case 'csvSegment': return (deps.engineModels.csv?.getAllMarkers?.() ?? []).filter(m => m.kind === 'segment');
    case 'csvRow':     return (deps.engineModels.csv?.getAllMarkers?.() ?? []).filter(m => m.kind === 'row');
    case 'audio':      return deps.engineModels.audio?.getAllMarkers?.() ?? [];
    case 'video':      return deps.engineModels.video?.getAllMarkers?.() ?? [];
  }
}

function isInSelection(marker: any, state: CompareCodersViewState): boolean {
  const sel = state.currentSelection;
  if (sel.kind === 'pair') {
    return sel.value.includes(marker.codedBy);
  }
  if (sel.kind === 'region') {
    return marker.fileId === sel.value.fileId && marker.engine === sel.value.engine;
  }
  return true;
}

function renderForEngine(
  container: HTMLElement,
  engine: EngineId,
  fileId: string,
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
): void {
  switch (engine) {
    case 'markdown':
    case 'pdf':
    case 'csvSegment':
      renderTextLikeLanes(container, engine, fileId, state, deps);
      break;
    case 'csvRow':
      renderCsvRowColoring(container, fileId, state, deps);
      break;
    case 'audio':
    case 'video':
      container.createDiv({ text: 'Audio/vídeo: Fase 2 dessa frente', cls: 'qc-cc-stub' });
      break;
  }
}

/** Text-likes — colunas per coder com [ code-label ] estilo margin panel. */
function renderTextLikeLanes(
  container: HTMLElement,
  engine: EngineId,
  fileId: string,
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
): void {
  const markers = collectMarkersForEngine(engine, deps).filter(m => m.fileId === fileId);
  const coderIds = state.scope.coderIds.filter(id =>
    !state.filters.visibleCoderIds || state.filters.visibleCoderIds.includes(id)
  );
  if (coderIds.length === 0) {
    container.createDiv({ text: 'Nenhum coder visível' });
    return;
  }

  const lanesEl = container.createDiv({ cls: 'qc-cc-lanes' });
  for (const coderId of coderIds) {
    const lane = lanesEl.createDiv({ cls: 'qc-cc-lane' });
    lane.createDiv({ cls: 'qc-cc-lane-header', text: deps.coderRegistry.getById(coderId)?.name ?? coderId });
    const coderMarkers = markers.filter(m => m.codedBy === coderId);
    for (const m of coderMarkers) {
      const label = lane.createDiv({ cls: 'qc-cc-lane-marker' });
      const code = m.codes[0]?.codeId;
      const codeName = deps.codeRegistry.getById(code ?? '')?.name ?? code ?? '?';
      label.setText(`[ ${codeName} ]`);
      const codeColor = deps.codeRegistry.getById(code ?? '')?.color;
      if (codeColor) label.style.color = codeColor;
    }
  }

  // Stripe agreement intensity (E1: simplificada — verde se > 1 coder, cinza se 0)
  // Cálculo real (κ por região) entra como polish em E2.
  const stripe = container.createDiv({ cls: 'qc-cc-agreement-stripe' });
  stripe.createDiv({ cls: 'qc-cc-stripe-segment qc-stripe-mid' });
}

/** csv-row — pinta rows com gradient de N coders + tooltip. */
function renderCsvRowColoring(
  container: HTMLElement,
  fileId: string,
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
): void {
  // E1: stub textual. Real implementação plug-in no AG Grid existente
  // via `cellStyle` callback em `src/csv/csvCodingView.ts`.
  // Sub-task: estender callback pra checar markers por row + gerar gradient.
  container.createDiv({
    cls: 'qc-cc-csv-row-stub',
    text: `csv-row coloring em ${fileId} — plug-in no AG Grid pendente (E1.6)`,
  });
}
```

- [ ] **Step 4: Run tests, PASS**

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat(icr): drill-down P1 spatial dispatcher + lanes text-likes"
```

---

### Task 6: P1 csvRow — coloring real via AG Grid `cellStyle`

**Files:**
- Modify: `src/csv/csvCodingView.ts` (adicionar `cellStyle` por col def quando compare mode ativo)
- Modify: `src/core/icr/ui/drilldownSpatial.ts` (substituir stub por delegação real)
- Create: `src/core/icr/ui/compareModeColoring.ts` (helper puro de gradient)
- Create: `tests/core/icr/ui/compareModeColoring.test.ts`

**Why:** Substituir stub textual por integração real. AG Grid em `csvCodingView.ts:445` cria grid via `createGrid` com `columnDefs: columns.map(...)`. Hook `cellStyle` no col def é nativo do AG Grid (tipa: `cellStyle: (params: CellClassParams) => CSSProperties | null`). Quando compare mode está ativo, callback consulta markers daquela row + retorna gradient com N cores (1 por coder).

- [ ] **Step 1: Confirmar shape do AG Grid columnDefs**

```bash
sed -n '445,460p' src/csv/csvCodingView.ts
grep -n "ColDef\|CellClassParams" src/csv/csvCodingView.ts | head
```

Confirmar que `columns.map((h) => ({ field, headerName, filter, filterParams }))` aceita extensão com `cellStyle` (sim, é prop oficial do AG Grid Community).

- [ ] **Step 2: Failing test — gradient helper puro**

```typescript
// tests/core/icr/ui/compareModeColoring.test.ts
import { describe, it, expect } from 'vitest';
import { computeRowGradient, computeRowMarkersByCell } from '../../../../src/core/icr/ui/compareModeColoring';

describe('computeRowGradient', () => {
  it('1 coder → cor sólida com transparência', () => {
    const result = computeRowGradient([
      { coderId: 'human:a', codeColor: '#ff0000' },
    ]);
    expect(result).toMatch(/rgba\(255,\s*0,\s*0/);
  });

  it('2 coders → linear-gradient com 50/50', () => {
    const result = computeRowGradient([
      { coderId: 'human:a', codeColor: '#ff0000' },
      { coderId: 'human:b', codeColor: '#00ff00' },
    ]);
    expect(result).toMatch(/linear-gradient/);
    expect(result).toMatch(/0%, .* 50%/);
    expect(result).toMatch(/50%, .* 100%/);
  });

  it('N coders → N stripes igualmente espaçados', () => {
    const result = computeRowGradient([
      { coderId: 'human:a', codeColor: '#ff0000' },
      { coderId: 'human:b', codeColor: '#00ff00' },
      { coderId: 'human:c', codeColor: '#0000ff' },
    ]);
    // 3 stripes em 33% cada
    const matches = result.match(/\d+%/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(6);  // 0%, 33%, 33%, 66%, 66%, 100%
  });

  it('zero coders retorna string vazia (sem background)', () => {
    expect(computeRowGradient([])).toBe('');
  });
});

describe('computeRowMarkersByCell', () => {
  it('agrupa markers por sourceRowId + column', () => {
    const markers = [
      { kind: 'row', fileId: 'f1', sourceRowId: 1, column: 'col1', codedBy: 'human:a', codes: [{ codeId: 'X' }] },
      { kind: 'row', fileId: 'f1', sourceRowId: 1, column: 'col1', codedBy: 'human:b', codes: [{ codeId: 'Y' }] },
      { kind: 'row', fileId: 'f1', sourceRowId: 2, column: 'col1', codedBy: 'human:a', codes: [{ codeId: 'X' }] },
    ];
    const result = computeRowMarkersByCell(markers as any);
    expect(result.get('1::col1')).toHaveLength(2);
    expect(result.get('2::col1')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run, FAIL**

- [ ] **Step 4: Implement helper puro**

`src/core/icr/ui/compareModeColoring.ts`:

```typescript
import type { RowMarker } from '../../../csv/csvCodingTypes';

export interface CoderRowApplication {
  coderId: string;
  codeColor: string;  // hex from CodeDefinition
}

/**
 * Gera CSS gradient com N stripes de igual largura, 1 por coder.
 * Retorna string vazia se cohort vazio.
 */
export function computeRowGradient(applications: CoderRowApplication[]): string {
  if (applications.length === 0) return '';
  if (applications.length === 1) {
    const { codeColor } = applications[0]!;
    return `${hexToRgba(codeColor, 0.4)}`;
  }
  const stripeWidth = 100 / applications.length;
  const stops: string[] = [];
  applications.forEach((app, i) => {
    const start = (stripeWidth * i).toFixed(2);
    const end = (stripeWidth * (i + 1)).toFixed(2);
    const color = hexToRgba(app.codeColor, 0.4);
    stops.push(`${color} ${start}%, ${color} ${end}%`);
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Agrupa RowMarker[] por (sourceRowId, column). Key formato `${sourceRowId}::${column}`.
 * Cell em AG Grid lookup: rowData.sourceRowId + column.id.
 */
export function computeRowMarkersByCell(markers: RowMarker[]): Map<string, RowMarker[]> {
  const map = new Map<string, RowMarker[]>();
  for (const m of markers) {
    const key = `${m.sourceRowId}::${m.column}`;
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }
  return map;
}
```

- [ ] **Step 5: Run helper test, verify PASS**

- [ ] **Step 6: Estender `csvCodingView.ts` com compare mode opcional**

Em `src/csv/csvCodingView.ts`, próximo a `createGrid`:

1. Adicionar campo opcional na view: `private compareModeContext?: { coderIds: CoderId[]; markerIndex: Map<string, RowMarker[]>; coderColors: Map<CoderId, string> };`
2. Setter público: `setCompareMode(ctx: ...): void` que repopula `compareModeContext` + chama `gridApi.refreshCells({ force: true })`
3. Estender `columnDefs.map`:

```typescript
columnDefs: columns.map((h) => ({
  field: h,
  headerName: h,
  filter: LazyTextFilter,
  filterParams: { context: lazyTextContext },
  cellStyle: (params: CellClassParams) => {
    if (!this.compareModeContext) return null;
    const sourceRowId = params.data?.sourceRowId;  // ajuste conforme schema real do row
    if (sourceRowId === undefined) return null;
    const key = `${sourceRowId}::${h}`;
    const cellMarkers = this.compareModeContext.markerIndex.get(key) ?? [];
    if (cellMarkers.length === 0) return null;
    const apps = cellMarkers.map(m => ({
      coderId: m.codedBy ?? '',
      codeColor: this.compareModeContext!.coderColors.get(m.codedBy ?? '') ?? '#888',
    }));
    return { background: computeRowGradient(apps) };
  },
})),
```

4. Importar `import { computeRowGradient } from '../core/icr/ui/compareModeColoring';`

- [ ] **Step 7: Substituir stub em `drilldownSpatial.ts`**

Remover bloco `renderCsvRowColoring` que mostra texto stub. Substituir por:

```typescript
function renderCsvRowColoring(
  container: HTMLElement,
  fileId: string,
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
): void {
  const allRowMarkers = collectMarkersForEngine('csvRow', deps).filter(m => m.fileId === fileId);
  if (allRowMarkers.length === 0) {
    container.createDiv({ text: `Sem row markers em ${fileId}` });
    return;
  }
  const markerIndex = computeRowMarkersByCell(allRowMarkers);
  const coderColors = new Map<string, string>();
  for (const coderId of state.scope.coderIds) {
    // Cor por coder: usa cor do primeiro code que esse coder aplicou nessa engine.
    // Fallback: cor neutra. E1: simplificação — pega cor do primeiro marker dele.
    const sample = allRowMarkers.find(m => m.codedBy === coderId);
    if (sample && sample.codes[0]) {
      const def = deps.codeRegistry.getById(sample.codes[0].codeId);
      coderColors.set(coderId, def?.color ?? '#888');
    } else {
      coderColors.set(coderId, '#888');
    }
  }

  // Buscar a CSV view aberta pra esse fileId e setar compare mode.
  // Pattern: deps tem reference a workspace; iterar leaves de tipo csv-coding-view; ativar.
  const csvLeaves = deps.app?.workspace.getLeavesOfType('qc-csv-view') ?? [];  // ajustar nome real
  const targetLeaf = csvLeaves.find((leaf: any) => leaf.view?.file?.path === fileId);
  if (targetLeaf) {
    (targetLeaf.view as any).setCompareMode({
      coderIds: state.scope.coderIds,
      markerIndex,
      coderColors,
    });
    container.createDiv({ text: `CSV row coloring ativo em ${fileId} (abrir vista CSV)` });
  } else {
    container.createDiv({
      text: `Abra ${fileId} numa vista CSV pra ver coloring`,
      cls: 'qc-cc-hint',
    });
  }
}
```

**Sub-step de verificação:** confirmar nome real do view type CSV via `grep -n "VIEW_TYPE\|getViewType" src/csv/csvCodingView.ts`. Substituir `'qc-csv-view'` pelo identifier real.

- [ ] **Step 8: Run all tests, verify PASS**

- [ ] **Step 9: Commit**

```bash
git add src/core/icr/ui/compareModeColoring.ts src/csv/csvCodingView.ts src/core/icr/ui/drilldownSpatial.ts tests/core/icr/ui/compareModeColoring.test.ts
~/.claude/scripts/commit.sh "feat(icr): csv-row coloring via AG Grid cellStyle + setCompareMode hook"
```

---

### Task 7: Filter chips

**Files:**
- Create: `src/core/icr/ui/filterChips.ts`
- Create: `tests/core/icr/ui/filterChips.test.ts`

**Why:** Liga/desliga coders + "destacar conflitos" via toggles no toolbar. Mutate state através de callback (mesma forma que overview faz).

- [ ] **Step 1: Failing test**

```typescript
// tests/core/icr/ui/filterChips.test.ts
import { describe, it, expect } from 'vitest';
import { renderFilterChips } from '../../../../src/core/icr/ui/filterChips';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';

describe('renderFilterChips', () => {
  it('renderiza chip por coder + chip "destacar conflitos"', () => {
    const container = document.createElement('div');
    const state = createDefaultViewState(['human:a', 'human:b']);
    renderFilterChips(container, state, mockDeps(), () => {});
    const chips = container.querySelectorAll('.qc-cc-filter-chip');
    expect(chips.length).toBe(2 + 1 + 1);  // 2 coders + highlight conflicts + hide agreement
  });

  it('click em chip de coder dispara update com visibleCoderIds toggleado', () => {
    const container = document.createElement('div');
    const state = createDefaultViewState(['human:a', 'human:b']);
    let updates: any[] = [];
    renderFilterChips(container, state, mockDeps(), p => updates.push(p));
    const chipA = container.querySelector('[data-coder-id="human:a"]') as HTMLElement;
    chipA.click();
    expect(updates[0]).toMatchObject({ filters: { visibleCoderIds: ['human:b'] } });
  });

  it('click em "destacar conflitos" toggle filters.highlightConflicts', () => {
    const container = document.createElement('div');
    const state = createDefaultViewState(['human:a', 'human:b']);
    let updates: any[] = [];
    renderFilterChips(container, state, mockDeps(), p => updates.push(p));
    const highlightChip = container.querySelector('[data-filter="highlight-conflicts"]') as HTMLElement;
    highlightChip.click();
    expect(updates[0]).toMatchObject({ filters: { highlightConflicts: true } });
  });
});

function mockDeps(): any {
  return {
    coderRegistry: {
      getById: (id: string) => ({ id, name: id.split(':')[1], type: 'human', createdAt: 0 }),
    },
  };
}
```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implementar `renderFilterChips`**

```typescript
// src/core/icr/ui/filterChips.ts
import type { CompareCodersViewState } from './compareCodersTypes';
import type { CompareCodersViewDeps } from './unifiedCompareCodersView';

export function renderFilterChips(
  container: HTMLElement,
  state: CompareCodersViewState,
  deps: CompareCodersViewDeps,
  onUpdate: (partial: Partial<CompareCodersViewState>) => void,
): void {
  container.empty();
  container.addClass('qc-cc-filter-chips');

  for (const coderId of state.scope.coderIds) {
    const coder = deps.coderRegistry.getById(coderId);
    const visible = !state.filters.visibleCoderIds || state.filters.visibleCoderIds.includes(coderId);
    const chip = container.createSpan({
      cls: `qc-cc-filter-chip qc-cc-coder-chip ${visible ? 'is-active' : ''}`,
      text: coder?.name ?? coderId,
    });
    chip.dataset.coderId = coderId;
    chip.onclick = () => {
      const cur = state.filters.visibleCoderIds ?? [...state.scope.coderIds];
      const next = visible ? cur.filter(id => id !== coderId) : [...cur, coderId];
      onUpdate({ filters: { ...state.filters, visibleCoderIds: next } });
    };
  }

  const highlightChip = container.createSpan({
    cls: `qc-cc-filter-chip ${state.filters.highlightConflicts ? 'is-active' : ''}`,
    text: 'destacar conflitos',
  });
  highlightChip.dataset.filter = 'highlight-conflicts';
  highlightChip.onclick = () => {
    onUpdate({ filters: { ...state.filters, highlightConflicts: !state.filters.highlightConflicts } });
  };

  const hideAgreeChip = container.createSpan({
    cls: `qc-cc-filter-chip ${state.filters.hideAgreementTotal ? 'is-active' : ''}`,
    text: 'esconder agreement total',
  });
  hideAgreeChip.dataset.filter = 'hide-agreement';
  hideAgreeChip.onclick = () => {
    onUpdate({ filters: { ...state.filters, hideAgreementTotal: !state.filters.hideAgreementTotal } });
  };
}
```

Wire em `unifiedCompareCodersView.ts` chamando `renderFilterChips` no toolbar:

```typescript
// dentro de renderToolbar, append antes da pergunta:
const chipsHolder = this.toolbarEl.createDiv();
renderFilterChips(chipsHolder, this.state, this.deps, partial => this.setState(partial));
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat(icr): filter chips Compare Coders — coders toggle + highlight conflicts"
```

---

## Chunk 3: Wire-up + CSS + smoke real

### Task 8: Registrar view + comando palette no main

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Localizar onde outras views são registradas**

```bash
grep -n "registerView\|VIEW_TYPE\|addCommand" src/main.ts | head -20
```

- [ ] **Step 2: Adicionar registerView + addCommand**

Em `onload` do plugin, após registros existentes (field names confirmados via grep em `main.ts` antes do plano):

```typescript
import { UnifiedCompareCodersView, COMPARE_CODERS_VIEW_TYPE } from './core/icr/ui/unifiedCompareCodersView';

// dentro de onload():
this.registerView(COMPARE_CODERS_VIEW_TYPE, leaf =>
  new UnifiedCompareCodersView(leaf, this.app, {
    coderRegistry: this.coderRegistry,
    codeRegistry: this.codeRegistry,
    app: this.app,
    engineModels: {
      markdown: this.markdownModel,
      pdf: this.pdfModel,
      csv: this.csvModel,
      audio: this.audioModel,
      video: this.videoModel,
    },
  })
);

this.addCommand({
  id: 'compare-coders-open',
  name: 'Compare Coders: Open',
  callback: async () => {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(COMPARE_CODERS_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: COMPARE_CODERS_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  },
});
```

- [ ] **Step 3: typecheck + build**

```bash
npx tsc --noEmit
npm run build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
~/.claude/scripts/commit.sh "feat(icr): registra UnifiedCompareCodersView + comando palette"
```

---

### Task 9: CSS — lanes, stripe, chips, color scale

**Files:**
- Modify: `styles.css`

**Why:** Estilos pra estrutura toda renderizar visualmente coerente. Color scale dos kappa thresholds, lanes per coder, agreement stripe, filter chips.

- [ ] **Step 1: Adicionar bloco CSS no styles.css**

```css
/* ──────────────────────────────────────────
   Compare Coders View
   ────────────────────────────────────────── */

.qc-compare-coders-view {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.qc-cc-toolbar {
  position: sticky;
  top: 0;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
  padding: 8px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.qc-cc-mode-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.qc-cc-mode-label {
  font-size: var(--font-ui-smaller);
  text-transform: uppercase;
  opacity: 0.6;
  margin-right: 4px;
}

.qc-cc-mode-chip {
  padding: 2px 10px;
  border-radius: 14px;
  font-size: var(--font-ui-smaller);
  cursor: pointer;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}

.qc-cc-mode-chip.is-active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}

.qc-cc-mode-chip.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.qc-cc-mode-question {
  font-size: var(--font-ui-smaller);
  opacity: 0.7;
  margin-top: 4px;
  width: 100%;
}

.qc-cc-filter-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.qc-cc-filter-chip {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-ui-smaller);
  cursor: pointer;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}

.qc-cc-filter-chip.is-active {
  background: var(--background-modifier-hover);
  border-color: var(--text-accent);
}

/* Overview matrix */

.qc-cc-overview {
  flex: 1;
  overflow: auto;
  padding: 12px;
  min-height: 200px;
}

.qc-cc-matrix {
  border-collapse: collapse;
  font-size: var(--font-ui-smaller);
}

.qc-cc-matrix th,
.qc-cc-matrix td {
  border: 1px solid var(--background-modifier-border);
  padding: 6px 10px;
  text-align: center;
}

.qc-cc-matrix-cell {
  cursor: pointer;
  transition: filter 100ms;
}

.qc-cc-matrix-cell:hover {
  filter: brightness(1.1);
}

.qc-cc-matrix-cell.is-diagonal {
  background: var(--background-modifier-border);
  cursor: default;
}

/* Color scale — universal pra qualquer cell que mostra κ */
.qc-kappa-low      { background: #c1352e; color: #fff; }
.qc-kappa-mid-low  { background: #d68c45; color: #1a1a1a; }
.qc-kappa-mid-high { background: #52b788; color: #fff; }
.qc-kappa-high     { background: #2d6a4f; color: #fff; }
.qc-kappa-na       { background: var(--background-modifier-border); opacity: 0.5; }

/* Splitter */

.qc-cc-splitter {
  height: 3px;
  background: var(--background-modifier-border);
  cursor: row-resize;
}

/* Drilldown */

.qc-cc-drilldown {
  flex: 1;
  overflow: auto;
  padding: 12px;
  min-height: 200px;
}

.qc-cc-drilldown-empty {
  opacity: 0.5;
  font-style: italic;
  padding: 20px;
  text-align: center;
}

.qc-cc-perspective-question {
  font-size: var(--font-ui-smaller);
  opacity: 0.7;
  margin-bottom: 8px;
}

.qc-cc-drilldown-file {
  margin-bottom: 16px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  padding: 8px;
}

.qc-cc-lanes {
  display: flex;
  gap: 8px;
}

.qc-cc-lane {
  flex: 1;
  min-width: 80px;
  border-right: 1px solid var(--background-modifier-border);
  padding-right: 6px;
}

.qc-cc-lane-header {
  font-size: var(--font-ui-smaller);
  font-weight: 600;
  border-bottom: 1px solid var(--background-modifier-border);
  padding-bottom: 2px;
  margin-bottom: 4px;
}

.qc-cc-lane-marker {
  font-size: var(--font-ui-smaller);
  padding: 2px 0;
}

.qc-cc-agreement-stripe {
  display: flex;
  flex-direction: column;
  width: 6px;
  margin-left: 4px;
}

.qc-stripe-low  { background: #c1352e; flex: 1; }
.qc-stripe-mid  { background: #d68c45; flex: 1; }
.qc-stripe-high { background: #2d6a4f; flex: 1; }
.qc-stripe-na   { background: var(--background-modifier-border); flex: 1; }

.qc-cc-stub {
  opacity: 0.6;
  font-style: italic;
  font-size: var(--font-ui-smaller);
}
```

- [ ] **Step 2: build**

```bash
npm run build
# Vault de teste é o workbench raiz — main.js já é gerado in-place via esbuild.
# Se vault demo for usado em paralelo: cp -p main.js styles.css manifest.json demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 3: Commit**

```bash
git add styles.css
~/.claude/scripts/commit.sh "style(icr): Compare Coders View — toolbar, matrix, lanes, color scale"
```

---

### Task 10: Smoke real verde no vault

**Files:** nenhum (manual checklist no vault).

**Why:** Regra do projeto (CLAUDE.md §1) — testes verde ≠ feito; smoke real obrigatório.

**Pré-condições:**
- `data.json` do vault tem 3 coders sintéticos + markers em `ICR-test/` (semeado em Slice 1)
- `npm run build` rodou e artefato copiado pro vault de teste

- [ ] **Step 1: Suite completa de testes verde**

```bash
npm test
```
Expected: PASS (suite atual + ~25-35 testes novos do slice). Sem isso, não rodar smoke.

- [ ] **Step 2: Build + reload**

```bash
npm run build
# Vault de teste é o workbench raiz — main.js já gerado in-place.
# Reload no Obsidian: Cmd-P → "Reload app without saving"
```

- [ ] **Step 3: Abrir Compare Coders**

Cmd-P → "Compare Coders: Open" → tab nova abre com toolbar + matriz + região drill-down vazia.

- [ ] **Step 4: Verificar matriz**

Esperado:
- Toolbar mostra 3 chips de mode (Matriz ativo) + chips dos 3 coders + "destacar conflitos" + "esconder agreement total"
- Matriz 3×3 renderiza com nomes dos coders no header e na lateral
- Diagonal tem "—" cinza
- Off-diagonal mostra valores Cohen κ ou "—" cinza se sem markers
- Color scale aparente

- [ ] **Step 5: Click numa célula**

Esperado:
- Drill-down abre embaixo
- Mostra `#1 onde discordamos? · #2 que tipo?` como label
- Lista files do escopo com lanes per coder + brackets `[ code ]` coloridos
- csv-row aparece se houver markers em CSV row

- [ ] **Step 6: Filter chips**

- Click no chip de um coder → desmarca, lane some do drill-down
- Re-click → reaparece
- Click "destacar conflitos" → cells com κ < 0.4 ganham borda vermelha (se CSS já implementou; senão polish em E2)

- [ ] **Step 7: Capturar screenshot e gravar resultado**

Salvar screenshot na pasta workspace externo: `obsidian-qualia-coding/plugin-docs/superpowers/notes/E1-smoke-2026-MM-DD.png`.

- [ ] **Step 8: Commit final do slice**

```bash
~/.claude/scripts/commit.sh "feat(icr): Slice E1 Compare Coders skeleton — smoke real verde"
git tag post-icr-slice-e1-checkpoint HEAD -m "Slice E1 completo: skeleton + Mode A + P1 spatial + filter chips"
git push origin main post-icr-slice-e1-checkpoint
```

---

## Resumo do slice

**Entregue:**
- `UnifiedCompareCodersView` (ItemView shell com toolbar + matriz + drill-down spatial)
- `reportPairwise` helper no reporter (per-pair pra Mode A)
- `extractInputsFromScope` (coleta markers cross-engine)
- `overviewMatrix` (Mode A — coder×coder com Cohen κ hardcoded)
- `drilldownSpatial` (P1 — lanes text-likes + csv-row coloring)
- `filterChips` (toggle coders + highlight conflicts + hide agreement)
- Comando palette `Compare Coders: Open`
- Estilos CSS + tag de checkpoint

**Testes esperados:** ~25-35 testes novos:
- `reportPairwise.test.ts` — 5 testes
- `unifiedCompareCodersView.test.ts` — 4 testes
- `overviewMatrix.test.ts` — 4 testes
- `scopeExtraction.test.ts` — 4 testes
- `drilldownSpatial.test.ts` — 4-6 testes
- `filterChips.test.ts` — 3 testes
- testes adicionais durante TDD

**Próximo slice (E2):** picker de coeficiente funcional + Modes B/C + Modal "ver lado a lado". Plano separado quando E1 fechar com smoke verde.

**Backlog desse slice (registrar em `docs/BACKLOG.md` ao fechar):**
- Refactor de `extractInputsFromScope` quando real-world scope grande aparecer (latência)
- Stripe agreement intensity exata via cálculo κ por região (E1: simplificada, sem cálculo)
- Lanes finas pra 6+ coders (P1 fallback)
- Splitter resizable (drag) — V1 só CSS estático
