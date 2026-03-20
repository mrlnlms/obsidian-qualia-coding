# Consolidation Cache — Design Spec

> Cache incremental por engine para o pipeline de consolidação do analytics. Evita reprocessamento total quando só parte dos dados mudou.

## Contexto

O `consolidate()` (função pura em `dataConsolidator.ts`) transforma raw data de 6 engines em `ConsolidatedData` — array unificado de markers + codes deduplicados. Hoje reprocessa 100% dos markers toda vez que é chamado, mesmo quando nada mudou.

**Consumidores:** AnalyticsView (refresh manual), BoardView (onOpen + drag-drop).

**Benchmark existente** (`PERFORMANCE-BENCHMARK-2026-03-17.md`): cálculos do analytics escalam bem até 5.000 markers. O gargalo futuro é o consolidator rodando antes de cada cálculo sem necessidade.

**Objetivo:** preparação pra escala — eliminar reprocessamento desnecessário para que o número de markers nunca seja uma preocupação.

## Decisões de design

| Decisão | Escolha | Alternativa descartada | Razão |
|---------|---------|----------------------|-------|
| Camada do cache | Analytics (wrapper do consolidator) | DataManager (C) | DataManager é persistence pura; enfiar tipos do analytics lá mistura responsabilidades |
| Granularidade | Por engine (`dirtyEngines: Set<EngineType>`) | Flag único global | Custo baixo (~30 LOC extra), consolidator já processa por engine internamente |
| Registry | Dimensão separada (`registryDirty: boolean`) | Registry = todos dirty | Rename/delete de código é frequente e não afeta markers — reprocessar tudo é desperdício |
| Conexão com models | Cache expõe `invalidateEngine()`, orquestrador conecta | Cache recebe models no construtor | Cache fica puro, sem imports de model types, testável sem mocks |

## Tipos

```typescript
// Novo tipo — distinto de SourceType (que tem 7 membros: csv-segment + csv-row).
// EngineType representa os 6 inputs do consolidator (CSV é um engine só).
type EngineType = "markdown" | "csv" | "image" | "pdf" | "audio" | "video";
```

## Arquitetura

### Nova classe: `ConsolidationCache`

**Arquivo:** `src/analytics/data/consolidationCache.ts` (~80 LOC)

**Estado interno:**

```typescript
cachedData: ConsolidatedData | null     // resultado consolidado completo
dirtyEngines: Set<EngineType>           // quais engines precisam reprocessar
registryDirty: boolean                  // se codes[] precisa rebuild
engineSlices: Map<EngineType, UnifiedMarker[]>  // cache parcial por engine
```

**API pública:**

```typescript
invalidateEngine(engine: EngineType): void  // marca engine como dirty
invalidateRegistry(): void                  // marca codes como dirty
invalidateAll(): void                       // marca tudo (fallback de segurança)
getData(readFn: () => AllEngineData): Promise<ConsolidatedData>  // retorna cached ou recomputa parcialmente
```

> **Nota:** `getData` é async para manter compatibilidade com `loadConsolidatedData(): Promise<ConsolidatedData>` existente na `AnalyticsPluginAPI`. Internamente tudo é síncrono hoje, mas a interface async não custa nada e evita breaking change.

### Fluxo de dados

```
                    invalidateEngine('markdown')
  engine models ─────────────────────────────────→ ConsolidationCache
  (via orquestrador)    invalidateRegistry()            │
                                                        │ getData(readFn)
                                                        ▼
                                              dirty engines? ──no──→ return cached
                                                   │yes
                                                   ▼
                                         reprocess dirty engines only
                                         merge com cache dos limpos
                                         rebuild codes[] se registry dirty
                                                   │
                                                   ▼
                                            return fresh data
```

### Merge parcial (dentro de `getData`)

1. Pra cada engine em `dirtyEngines`: chama a função de consolidação daquele engine, gera `UnifiedMarker[]` fresco, substitui no `engineSlices`
2. Pra engines limpos: usa `engineSlices` existente
3. Concatena todos os slices → `markers[]` final
4. Rebuild `sources` record: pra cada engine, `true` se o slice é não-vazio (ou se raw data existe)
5. Se `registryDirty` OU algum engine dirty: rebuild `codes[]` — varre todos os markers (concatenados) + registry definitions. Necessário porque `codes[]` inclui tanto definitions do registry quanto códigos descobertos em markers sem definition (fallback com cor padrão `#6200EE`). Qualquer mudança em markers ou registry pode afetar este array.
6. Se nada dirty (registry limpo + zero engines dirty): usa `codes[]` cacheado
7. Limpa dirty flags, atualiza `cachedData`, seta `lastUpdated` fresco

## Refactor do consolidator

O `consolidate()` atual é uma função monolítica que processa 6 engines sequencialmente. Precisa ser refatorado em funções puras por engine:

```typescript
// Novas funções extraídas (já existem como blocos internos)
consolidateMarkdown(data: MarkdownData): UnifiedMarker[]
consolidateCsv(data: CsvData): UnifiedMarker[]
consolidateImage(data: ImageData): UnifiedMarker[]
consolidatePdf(data: PdfData): UnifiedMarker[]
consolidateAudio(data: AudioData): UnifiedMarker[]
consolidateVideo(data: VideoData): UnifiedMarker[]

// codes[] depende de DOIS inputs: registry definitions + códigos nos markers.
// Recebe registry direto (shared, já injetado em todos engines por readAllData)
// e todos os markers (concatenados dos slices).
consolidateCodes(allMarkers: UnifiedMarker[], registry: CodeDefinition[]): UnifiedCode[]
```

A função `consolidate()` original continua existindo como composição das 7 funções — backward-compatible, mesma assinatura, mesmo output.

## Integração (wiring)

**Arquivo:** `src/analytics/index.ts` — `registerAnalytics()`

```typescript
const cache = new ConsolidationCache();

// Cada engine model → invalidateEngine
markdownModel.onChange(() => cache.invalidateEngine('markdown'));
csvModel.onChange(() => cache.invalidateEngine('csv'));
imageModel.onChange(() => cache.invalidateEngine('image'));
pdfModel.onChange(() => cache.invalidateEngine('pdf'));
audioModel.onChange(() => cache.invalidateEngine('audio'));
videoModel.onChange(() => cache.invalidateEngine('video'));

// Registry → invalidateRegistry
// NOTA: registry usa single-slot `setOnMutate()`, já ocupado por DataManager (main.ts:55).
// Pré-requisito: refatorar para multi-listener (Set<() => void>) ou
// encadear no callback existente. Detalhe de implementação — resolver no plano.
plugin.registry.onMutate(() => cache.invalidateRegistry());

// loadConsolidatedData() usa cache
api.loadConsolidatedData = () => {
  return cache.getData(() => readAllData(plugin.dataManager));
};
```

**Lifecycle:** cache nasce com analytics, morre com analytics. Zero estado persistido — puro runtime.

**Fallback:** `invalidateAll()` força recompute total = comportamento idêntico ao de hoje.

## O que NÃO muda

- `ConsolidatedData` type (output idêntico)
- Como Analytics modes consomem dados
- Como Board consome dados
- Engine models (nenhuma mudança)
- DataManager (nenhuma mudança)
- Explorer/Detail views (não usam consolidator)

## Testes

**Arquivo:** `tests/analytics/consolidationCache.test.ts` (~15 testes)

### Casos de teste

1. Cache miss inicial — primeira chamada sempre computa tudo
2. Cache hit — segunda chamada sem invalidação retorna mesmo objeto (referência `===`)
3. Invalidação de 1 engine — só aquele engine reprocessa, outros mantêm cache
4. Invalidação de N engines — reprocessa só os dirty
5. Invalidação do registry — `codes[]` recalcula, markers intactos
6. Registry + engine dirty juntos — ambos reprocessam
7. `invalidateAll()` — tudo recomputa
8. Resultado correto — output do cache idêntico ao `consolidate()` full (snapshot comparison)
9. Múltiplas invalidações antes de `getData` — dirty acumula, um só recompute
10. Engine com dados null/vazio — invalidação + getData funciona sem erro
11. `sources` record reflete corretamente quais engines têm dados

### Benchmark comparativo

Adicionar caso no `performanceBenchmark.test.ts` existente: tempo de `consolidate()` full vs `cache.getData()` com 1 engine dirty em escala XL. Valida que o cache poupa trabalho mensurável.

## Item de backlog futuro: Explorer/Detail cache

**Não faz parte desta spec.** Registrar como item separado no BACKLOG.md.

**Problema:** `UnifiedModelAdapter.getAllMarkers()` + `BaseCodeExplorerView.renderTree()` re-renderizam em cascata quando qualquer engine muda. Com milhares de markers, rebuild da tree DOM pode ficar pesado.

**Solução futura:** mesma pattern — cache por engine no `UnifiedModelAdapter`, dirty flag nos listeners, rebuild parcial da tree.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Cache stale (dados desatualizados) | `invalidateAll()` como fallback; testes de snapshot comparison garantem paridade |
| Engine novo adicionado sem invalidação | Checklist no CLAUDE.md: ao adicionar engine, registrar invalidação |
| Performance do merge parcial pior que full recompute | Benchmark comparativo no CI; se merge for mais lento, `invalidateAll()` e cache vira memoização simples |
| `readAllData` lê todos os engines mesmo quando só 1 está dirty | Aceitável — são lookups in-memory no DataManager (O(1)). Se virar gargalo, adicionar read seletivo depois |
| `setOnMutate` do registry é single-slot | Refatorar pra multi-listener como pré-requisito (mudança pequena, ~10 LOC) |
