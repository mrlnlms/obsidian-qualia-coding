# Plano: Split analyticsView.ts (5.907 → ~600 core + 19 modules)

## Context

`analyticsView.ts` é o maior arquivo do projeto — 5.907 linhas, 88 métodos, 19 view modes, 62 variáveis de estado. Tudo numa classe. Dificulta manutenção, testes e evolução de features. O split organiza por responsabilidade sem mudar comportamento.

## Estratégia

Extrair cada view mode como módulo independente que recebe o `AnalyticsView` (ou um contexto mínimo) e renderiza. O core fica com lifecycle, dispatcher, toolbar e filter config.

### Padrão por mode module

```typescript
// src/analytics/views/modes/frequencyMode.ts
import type { AnalyticsViewContext } from '../analyticsViewContext';

export function renderFrequencyConfig(ctx: AnalyticsViewContext, container: HTMLElement): void { ... }
export function renderFrequencyChart(ctx: AnalyticsViewContext, container: HTMLElement): void { ... }
export function renderMiniFrequency(ctx: AnalyticsViewContext, container: HTMLElement): void { ... }
export function exportFrequencyCSV(ctx: AnalyticsViewContext): void { ... }
```

### Contexto compartilhado

```typescript
// src/analytics/views/analyticsViewContext.ts
export interface AnalyticsViewContext {
  plugin: AnalyticsPluginAPI;
  data: ConsolidatedData;
  chartContainer: HTMLElement;
  configPanelEl: HTMLElement;
  footerEl: HTMLElement;
  state: AnalyticsViewState;  // todos os 62 state vars
  buildFilterConfig(): FilterConfig;
  scheduleUpdate(): void;
  setViewMode(mode: ViewMode): void;
}
```

## Steps

### Step 1: Criar tipos e contexto

- `src/analytics/views/analyticsViewContext.ts` — interface AnalyticsViewContext + AnalyticsViewState
- Mover state vars da classe para um objeto `state` tipado

### Step 2: Extrair shared helpers

- `src/analytics/views/shared/chartHelpers.ts` — heatmapColor, isLightColor, computeDisplayMatrix, generateFileColors, divergentColor
- `src/analytics/views/shared/exportUtils.ts` — exportPNG, generic CSV export helpers
- `src/analytics/views/shared/miniCharts.ts` — renderMiniMatrix (reusável por cooccurrence, overlap, lag)

### Step 3: Extrair config panels

- `src/analytics/views/shared/filterPanel.ts` — renderSourcesSection, renderCodesSection, renderCodesList, renderMinFreqSection
- `src/analytics/views/shared/viewModePanel.ts` — renderViewModeSection

### Step 4: Extrair modes (19 módulos)

Cada mode vira um arquivo em `src/analytics/views/modes/`:

| Arquivo | Métodos extraídos | ~Linhas |
|---------|-------------------|---------|
| `dashboardMode.ts` | renderDashboard + 5 renderMini* | ~200 |
| `frequencyMode.ts` | renderFrequencyChart, renderBarChart, renderFrequencyCodeList, config | ~250 |
| `cooccurrenceMode.ts` | renderCooccurrenceMatrix, reorderCooccurrence, config | ~220 |
| `graphMode.ts` | renderNetworkGraph, config | ~290 |
| `docMatrixMode.ts` | renderDocCodeMatrix, config | ~170 |
| `evolutionMode.ts` | renderEvolutionChart, config | ~170 |
| `textRetrievalMode.ts` | render*, loadAndRender*, renderSegmentCard, navigate, format* | ~400 |
| `wordCloudMode.ts` | render*, loadAndRender*, export, config | ~230 |
| `acmMode.ts` | render*, loadAndRender*, export, config | ~300 |
| `mdsMode.ts` | render*, loadAndRender*, export, config | ~260 |
| `temporalMode.ts` | render*, export | ~160 |
| `textStatsMode.ts` | render*, loadAndRender*, export | ~170 |
| `dendrogramMode.ts` | render*, renderCanvas, config, export | ~380 |
| `lagSequentialMode.ts` | render*, divergentColor*, config, export | ~270 |
| `polarMode.ts` | render*, config, export | ~250 |
| `chiSquareMode.ts` | render*, config, export | ~180 |
| `decisionTreeMode.ts` | render*, renderTreeNode, config, export | ~280 |
| `sourceComparisonMode.ts` | render*, config, export | ~320 |
| `overlapMode.ts` | render*, export | ~210 |

### Step 5: Reescrever core analyticsView.ts

O core mantém:
- Classe `AnalyticsView extends ItemView`
- State management (criar/destruir AnalyticsViewContext)
- Lifecycle: onOpen, onClose, onDataRefreshed
- Dispatcher: renderConfigPanel e updateChart delegam aos módulos
- Toolbar (renderToolbar)
- Footer (updateFooter)

~600 linhas.

### Step 6: Atualizar imports no boardView.ts e index.ts

Verificar se outros arquivos importam de analyticsView.ts e atualizar.

## Ordem de execução

```
Step 1 (context) → build
Step 2 (helpers) → build
Step 3 (panels) → build
Step 4 (modes, em batches de 4-5) → build entre batches
Step 5 (rewrite core) → build
Step 6 (imports) → build final
```

## Commits

1. `refactor: cria analyticsViewContext.ts e shared helpers`
2. `refactor: extrai filter/viewMode panels`
3. `refactor: extrai modes batch 1 (dashboard, frequency, cooccurrence, graph, docMatrix)`
4. `refactor: extrai modes batch 2 (evolution, textRetrieval, wordCloud, acm, mds)`
5. `refactor: extrai modes batch 3 (temporal, textStats, dendrogram, lagSequential, polar)`
6. `refactor: extrai modes batch 4 (chiSquare, decisionTree, sourceComparison, overlap)`
7. `refactor: reescreve analyticsView.ts core (~600 linhas)`

## Verificação

1. `npm run build` após cada commit
2. `npm run test` — testes existentes continuam passando
3. Testar no demo vault: todos os 19 view modes renderizam corretamente
4. Verificar que dashboard mini charts funcionam
5. Export CSV/PNG funciona em cada mode

## Risco

Médio-alto. Toca 5.907 linhas de código funcional. Cada mode precisa receber o contexto correto e ter acesso a todo o state compartilhado. O principal risco é quebrar referências a `this.xxx` que viram `ctx.xxx`.

Mitigação: build entre cada batch, testes automatizados cobrem statsEngine e data layer.
