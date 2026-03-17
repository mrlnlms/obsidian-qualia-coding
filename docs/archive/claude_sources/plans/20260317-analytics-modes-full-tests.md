# Plano: Testes completos para analytics modes (3 frentes)

## Context

Das 56 funcoes exportadas nos 19 mode modules, ~9 estao testadas. Faltam 3 frentes: exportCSV async (4), renderMini* (14), e renderChart (5). Meta: cobrir tudo que e testavel com jsdom.

## Frente 1: exportCSV async (4 funcoes)

Mock de engines async + TextExtractor. Pattern: mock retorna dados controlados, verificar CSV output.

| Funcao | Engine mockado | Mock extra |
|--------|---------------|------------|
| exportTextStatsCSV | calculateTextStats | TextExtractor (vault) |
| exportACMCSV | calculateMCA (async) | nenhum |
| exportMDSCSV | calculateMDS (async) | nenhum |
| exportWordCloudCSV | calculateWordFrequencies | TextExtractor (vault) |

**Arquivo:** `tests/analytics/exportCSV.test.ts` (expandir o existente)

Adicionar mocks para:
- `../../src/analytics/data/mcaEngine` → `{ calculateMCA: vi.fn() }`
- `../../src/analytics/data/mdsEngine` → `{ calculateMDS: vi.fn() }`
- `../../src/analytics/data/textExtractor` → `{ TextExtractor: mockClass }`
- `../../src/analytics/data/wordFrequency` → `{ calculateWordFrequencies: vi.fn() }`

Cada funcao async usa `.then()` — testes precisam `await vi.advanceTimersToNextTimerAsync()` ou `await flushPromises()`.

**~12 testes novos** (3 por funcao: early return, csv correto, download trigger)

## Frente 2: renderMini* (14 funcoes)

Todas sao sync, recebem canvas + dados, chamam Canvas2D API. Pattern identico.

**Arquivo:** `tests/analytics/renderMini.test.ts` (novo)

### Mock de Canvas2D

```typescript
function createMockCanvas(w = 200, h = 120) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = {
        fillRect: vi.fn(), strokeRect: vi.fn(),
        fillText: vi.fn(), measureText: vi.fn(() => ({ width: 30 })),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
        arc: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
        save: vi.fn(), restore: vi.fn(),
        rotate: vi.fn(), translate: vi.fn(),
        setLineDash: vi.fn(), clearRect: vi.fn(),
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        font: '', textAlign: '', textBaseline: '',
    };
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as any);
    return { canvas, ctx };
}
```

### Testes por funcao

Cada renderMini* recebe dados tipados. Testar:
1. Early return com canvas null ou dados vazios
2. Chama getContext("2d")
3. Chama fillRect/fillText com dados corretos (spot check, nao pixel-perfect)

**~28 testes** (2 por funcao)

### Lista completa

| Funcao | Arquivo | Input data type |
|--------|---------|----------------|
| renderMiniFrequency | dashboardMode.ts | FrequencyResult[] |
| renderMiniCooccurrence | dashboardMode.ts | CooccurrenceResult |
| renderMiniNetwork | dashboardMode.ts | CooccurrenceResult |
| renderMiniDocMatrix | dashboardMode.ts | DocCodeMatrixResult |
| renderMiniEvolution | dashboardMode.ts | EvolutionResult |
| renderMiniTemporal | temporalMode.ts | TemporalResult |
| renderMiniLag | lagSequentialMode.ts | LagResult |
| renderMiniPolar | polarMode.ts | PolarCoordResult |
| renderMiniChiSquare | chiSquareMode.ts | ChiSquareResult |
| renderMiniDecisionTree | decisionTreeMode.ts | DecisionTreeResult |
| renderMiniDendrogram | dendrogramMode.ts | DendrogramNode + SilhouetteResult |
| renderMiniACM | acmMode.ts | MCAResult |
| renderMiniMDS | mdsMode.ts | MDSResult |
| renderMiniSourceComparison | sourceComparisonMode.ts | SourceComparisonResult |
| renderMiniWordCloud | wordCloudMode.ts | WordFrequencyResult[] |
| renderMiniTextStats | textStatsMode.ts | TextStatsResult |
| renderMiniMatrix (overlap) | overlapMode.ts | AnalyticsViewContext + codes/colors/matrix |

## Frente 3: renderChart (5 funcoes Chart.js)

Funcoes que usam `await import('chart.js')`. Mock do Chart.js constructor.

**Arquivo:** `tests/analytics/renderChart.test.ts` (novo)

### Mock de Chart.js

```typescript
vi.mock('chart.js', () => {
    const ChartMock = vi.fn();
    ChartMock.register = vi.fn();
    return { Chart: ChartMock, registerables: [] };
});
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('chartjs-chart-wordcloud', () => ({}));
```

### Funcoes a testar

| Funcao | Chart type | Extra mocks |
|--------|-----------|-------------|
| renderTemporalChart | line | chartjs-adapter-date-fns |
| renderFrequencyChart | bar | nenhum |
| renderACMBiplot | scatter | svd-js (via mcaEngine) |
| renderMDSMap | scatter | svd-js (via mdsEngine) |
| renderWordCloud | wordCloud | chartjs-chart-wordcloud, TextExtractor |

Testar:
1. Early return sem dados
2. Chart constructor chamado com tipo correto
3. Container recebe canvas element

**~15 testes** (3 por funcao)

---

## Commits

| # | Commit | Testes novos |
|---|--------|-------------|
| 1 | `test: adiciona testes para exportCSV async (textStats, ACM, MDS, wordCloud)` | ~12 |
| 2 | `test: adiciona testes para renderMini* (14 funcoes Canvas2D)` | ~28 |
| 3 | `test: adiciona testes para renderChart (5 funcoes Chart.js)` | ~15 |

**Total: ~55 testes novos (1157 → ~1212)**

## Verificacao

Apos cada commit:
1. `npm run build`
2. `npm run test` — todos passam
3. `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`
