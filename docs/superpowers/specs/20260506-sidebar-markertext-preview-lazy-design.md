# Sidebar markerText preview pra arquivos lazy — Design

**Data:** 2026-05-06 (rev. 2 pós-review)
**Status:** spec aprovada, aguarda implementation plan
**Owner:** Marlon Lemes

## Contexto

Em modo eager (parquet/CSV pequeno), o `csvCodingModel` mantém `rowDataCache` populated no file-open, e `getMarkerText(marker)` resolve sync lendo `rows[sourceRowId][column]`. Sidebar adapter retorna o texto direto pra `BaseMarker.markerText` — Code Explorer, Code Detail, Evidence list, by-code memo view e Smart Code detail mostram preview do trecho codificado.

Em modo lazy (parquet >50MB ou CSV >100MB, conforme `parquetSizeWarningMB`/`csvSizeWarningMB`), o file fica em OPFS e queries vão pra DuckDB. O `rowDataCache` **nunca é populado** nesse modo. Existem 2 caches sync separados:

1. `markerTextCache: Map<markerId, string>` — preview persistente em memória da sessão. Source of truth pro `getMarkerText` em modo lazy.
2. `getMarkerTextAsync(marker)` — fallback que dispara query DuckDB on-demand, popula o cache e retorna.

`prepopulateMarkerCaches.ts` (Fase 6 Slice A) roda no startup pra popular `markerTextCache` em background, mas **só** pra fileIds em modo lazy cujo OPFS já tem cópia fresca (`isOpfsCached(opfsKey, mtime) === true`). Fileids cujo OPFS está frio são pulados — pra evitar download "surprise" no boot.

`csvCodingView` registra um `RowProvider` ativo em `csvCodingModel.lazyProviders: Map<fileId, RowProvider>` quando o file é aberto pelo user, removendo no unload. `getMarkerTextAsync` usa esse provider pra resolver text on-demand.

**Resultado:** se o user importa um QDPX em vault novo (cenário típico de migração), os parquets correspondentes não estão em OPFS e o user ainda não abriu nenhum deles. `prepopulateMarkerCaches` skipou. Sidebar mostra os markers (`Row 5 · comment` placeholder de coordenada após `previewText` fix de 2026-05-06) sem texto, e fica assim até o user abrir manualmente cada parquet — UX zoado.

## Problema

Sidebar (e qualquer view que renderiza `BaseMarker.markerText`) precisa exibir preview do trecho codificado em **arquivos lazy ainda não hidratados** sem mudar o contrato síncrono dos consumers e sem forçar IO no startup.

## Goals

- Coverage do cenário "vault migrado/cold": sidebar/Code Explorer/Code Detail mostram texto dos markers em parquets que o user nunca abriu nessa máquina.
- Auto-coverage de QDPX import no meio da sessão (importer chama `csvModel.reload()` via `plugin.reloadAfterImport()`, que dispara `onChange` → re-render dos consumers → hydrator detecta cache miss).
- Trigger só por demanda real (renderização que vai mostrar preview), nunca no boot do plugin.
- Smooth update: placeholder de coordenada → texto inline quando async resolve, sem flicker visível.
- Indicador discreto de progresso (header de Code Explorer/Code Detail) durante hidratação ativa.

## Non-goals

- Mudar contrato síncrono do `SidebarModelInterface` (NÃO cascade async em ~12 callsites).
- Pre-popular cache no startup (mantém semantic atual de `prepopulateMarkerCaches`: só popula se OPFS já fresco, nunca download surprise).
- Cobrir markers que apontam pra rows fora do parquet (`sourceRowId` inválido) com preview rico — esses caem no fallback de coordenada permanentemente. Após 1 tentativa de hidratação que retorna `addedCount === 0`, fileId é marcado `seen` e não retentado.
- Persistir o cache cross-session em disco (memória da sessão é suficiente; `prepopulateMarkerCaches` repopula no boot quando OPFS fresco).
- UI de retry manual em caso de falha de hidratação (silent log + manter coordenada como placeholder; erros NÃO marcam `seen`, próxima oportunidade re-tenta).
- Re-render granular per-item (DOM tracking de `markerId` em virtual list é não-trivial). Hydrator chama `csvModel.notifyListenersOnly()` no fim do batch — pattern existente, consumers re-renderizam coalescidos via RAF.

## Design overview

Em uma frase: **um orchestrator stateful (`MarkerPreviewHydrator`) é a única autoridade que decide quando/como popular o `markerTextCache` em modo lazy. Consumers que renderizam markers cross-file chamam `requestHydration(fileId)` por arquivo (não por marker) e re-renderizam via `model.onChange` quando o batch termina (canal existente).**

Decisões consolidadas no brainstorm:

| Decisão | Justificativa |
|---|---|
| Modelo continua sync (sem cascade async em consumers) | mantém comentário existente no `csvSidebarAdapter` |
| Trigger é a renderização do consumer (não o boot do plugin) | substitui pre-populate agressivo |
| `requestHydration` é chamado **per-file** pelo consumer (não per-marker pelo adapter) | adapter é chamado em loop O(N) por render — vault de 660k markers fritaria |
| Smooth update coordenada → texto, sem skeleton/spinner per-item | placeholder já é informação útil |
| Indicador discreto agregado (`Hidratando previews… 2/5`) | escala melhor pro pior caso (vault de 10+ parquets) |
| Auto re-trigger via lazy detection (cobre import) | `csvModel.reload()` pós-import dispara onChange; consumers re-renderizam; hydrator pega cache miss |
| Provider reuse: hydrator prefere `csvModel.lazyProviders.get(fileId)` | evita download/parse paralelo desnecessário quando file está aberto |
| Re-render via `csvModel.notifyListenersOnly()` (não canal separado) | usa pattern existente; coalescing via RAF do `BaseCodeExplorerView` |
| Status indicator é canal próprio (`onStatusChange`) | UI separada do markerText render |

## Arquitetura

### Novo módulo: `src/csv/markerPreviewHydrator.ts`

Classe `MarkerPreviewHydrator` instanciada uma única vez no `Plugin.onload`, exposta via field e referenciada pelos consumers.

**State interno:**

- `seen: Set<fileId>` — fileIds que terminaram com sucesso OU `addedCount === 0` (parquet sem matches / órfão). NÃO inclui fileIds que falharam por IO/parse — esses ficam fora pra retry na próxima oportunidade.
- `inflight: Map<fileId, Promise<HydrationOutcome>>` — dedup de batches em curso. Próxima `requestHydration(fileId)` enquanto inflight reusa a Promise existente.
- `errors: Map<fileId, string>` — último erro por fileId (debug + decisão de retry). NÃO marca `seen`.
- `statusListeners: Set<(status) => void>` — observers do indicador de progresso (canal separado dos consumers de markerText).
- `notifyScheduled: number | null` — RAF handle pra debounce de `notifyListenersOnly()` quando vários batches completam em janela curta.

**API pública:**

```ts
export interface HydrationOutcome {
  fileId: string;
  status: 'success' | 'error' | 'skipped';
  reason?: string;          // mensagem em error/skipped
  addedCount?: number;      // quantos markerTexts foram adicionados ao cache
}

export interface HydrationStatus {
  inflightCount: number;    // batches em curso
  totalSeen: number;        // seen.size + inflight.size (pra "X/Y" no indicator)
  completedCount: number;   // seen.size (sucessos + addedCount=0)
}

export class MarkerPreviewHydrator {
  constructor(private plugin: QualiaCodingPlugin, private csvModel: CsvCodingModel);

  /**
   * Idempotente. No-op se fileId já em `seen` OU em `inflight` OU eager mode.
   * Retorna a Promise inflight (caller pode aguardar se quiser, mas não precisa).
   */
  requestHydration(fileId: string): Promise<HydrationOutcome>;

  /** Status indicator subscribe. Retorna unsubscribe. */
  onStatusChange(listener: (status: HydrationStatus) => void): () => void;

  getStatus(): HydrationStatus;

  /** Pra command "Rebuild marker preview cache" (Slice 4 opcional). Limpa `seen` + `errors`. */
  reset(): void;

  /** Cleanup no Plugin.onunload. Aguarda inflight com timeout 5s; após, log warn e abandona providers (worker morre com runtime.dispose). */
  dispose(): Promise<void>;
}
```

**Detecção de modo lazy:**

Hydrator usa novo helper `csvModel.isLazyFile(fileId): boolean` (a ser adicionado em `csvCodingModel`):

```ts
// csvCodingModel.ts (extensão)
isLazyFile(fileId: string): boolean {
  const af = this.dm.app.vault.getAbstractFileByPath(fileId);
  if (!(af instanceof TFile)) return false;
  const ext = af.extension;
  if (ext !== 'csv' && ext !== 'parquet') return false;
  const csvSettings = this.dm.section('csv').settings ?? {};
  const thresholdMB = ext === 'parquet'
    ? (csvSettings.parquetSizeWarningMB ?? 50)
    : (csvSettings.csvSizeWarningMB ?? 100);
  return af.stat.size > thresholdMB * 1024 * 1024;
}
```

Hydrator chama `csvModel.isLazyFile(fileId)` no início de `requestHydration`. Eager → outcome `skipped: 'eager mode'`, `seen.add(fileId)` (não retenta).

**Provider reuse:**

```ts
// dentro do batch async do hydrator
const existingProvider = this.csvModel.getLazyProvider(fileId);  // novo getter público
if (existingProvider) {
  // file está aberto pelo user — reusa, NÃO faz dispose ao final (o csvCodingView é dono)
  await this.csvModel.populateMissingMarkerTextsForFile(fileId, existingProvider);
} else {
  // file não aberto — provider próprio, dispose ao final
  const provider = await DuckDBRowProvider.create({ runtime, fileHandle, fileType });
  try {
    await this.csvModel.populateMissingMarkerTextsForFile(fileId, provider);
  } finally {
    await provider.dispose();
  }
}
```

`csvCodingModel` precisa de getter público:
```ts
getLazyProvider(fileId: string): RowProvider | undefined {
  return this.lazyProviders.get(fileId);
}
```

### Integração nos consumers

**Sidebar adapter (`csvSidebarAdapter.markerToBase`) NÃO chama o hydrator.** Adapter é called em loop O(N) — disparar `requestHydration` per-marker é desperdício de Set lookups + complexidade desnecessária. Adapter retorna `markerText: null` (ou texto sync se cache hit) como hoje.

**Consumers que iteram fileIds top-level são os disparadores:**

- `BaseCodeExplorerView`: na renderização da árvore (que agrupa markers por code → file → matches), itera os `fileId` únicos e chama `plugin.markerPreviewHydrator.requestHydration(fileId)` pra cada. Idempotência cobre re-renders.
- `BaseCodeDetailView`: idem na renderização de evidence list (markers de um code, agrupados por file).
- `SmartCodeListModal` / `detailSmartCodeRenderer`: idem nos markers que matcham o smart code.
- `Memo View` (by-code mode): idem nos files de cada code section.

`UnifiedCodeExplorerView` e `UnifiedCodeDetailView` herdam de `BaseCodeExplorerView` / `BaseCodeDetailView` — implementação no base cobre os dois.

**Re-render trigger:**

Quando hydrator completa um batch com `addedCount > 0`, chama `csvModel.notifyListenersOnly()` (debounced via RAF — múltiplos batches concorrentes resolvendo em janela curta = 1 notify único). Isso dispara `model.onChange` que os consumers já subscrevem. Re-render coalescido via mecanismo RAF existente em `BaseCodeExplorerView`. Adapter re-roda `markerToBase`, `getMarkerText` agora resolve sync (cache populated), label vira texto.

**Indicador visual:**

Cada view consumer renderiza seu próprio indicator no header (component pequeno: `Hidratando previews… X/Y`). Subscribe ao `hydrator.onStatusChange`. Some quando `inflightCount === 0`. Status indicator é fonte única de verdade — múltiplas views abertas mostram o mesmo state.

Alternativa rejeitada: status bar global do Obsidian. Motivo: hidratação é específica de coding qualitativa; status bar é prime real estate.

### Reuso de código existente

Hydrator NÃO duplica nada. Reusa:

- `plugin.getDuckDB()` — runtime singleton, já cached
- `csvModel.lazyProviders.get(fileId)` (via `getLazyProvider`) — provider já registrado pelo `csvCodingView` quando file aberto
- `DuckDBRowProvider.create({ runtime, fileHandle, fileType })` — provider per-file, com lock interno (drain on dispose) implementado em 2026-05-06
- `csvModel.populateMissingMarkerTextsForFile(fileId, provider)` — função batch idempotente; popula `markerTextCache` direto e retorna `addedCount`
- `csvModel.notifyListenersOnly()` — pattern existente pra notificar consumers sem persist data.json (já usado em `prepopulateMarkerCaches.ts:110`)
- `openOPFSFile(opfsKey)` / `isOpfsCached(opfsKey, mtime)` — helpers OPFS existentes

## Data flow

Sequência pra single fileId desde primeiro acesso até preview renderizado:

```
1. user navega pro Code Explorer
2. BaseCodeExplorerView.render() agrupa markers por code → file → matches
3. itera fileIds únicos: pra cada, chama plugin.markerPreviewHydrator.requestHydration(fileId) (fire-and-forget)
4. hydrator: per fileId
   a. csvModel.isLazyFile(fileId) === false → outcome skipped, seen.add, return
   b. já em seen ou inflight → return Promise existente
   c. cria nova Promise, registra em inflight, dispara batch async
5. batch async (per fileId):
   a. checa csvModel.getLazyProvider(fileId) — se houver, usa esse (file já aberto pelo user)
   b. caso contrário: openOPFSFile / boot DuckDB / DuckDBRowProvider.create
   c. csvModel.populateMissingMarkerTextsForFile(fileId, provider) → cache populated, addedCount retornado
   d. se hydrator criou o provider: provider.dispose() (drena queries via lock)
   e. se addedCount === 0: outcome skipped, seen.add (parquet sem matches ou órfão)
   f. se addedCount > 0: outcome success, seen.add, schedule notify
   g. se throw: outcome error, errors.set(fileId, msg), NÃO seen.add (retry próxima)
   h. sempre: inflight.delete(fileId), emit status change pros listeners
6. (em paralelo, durante batch) sidebar adapter.markerToBase retorna BaseMarker com markerText: null
7. consumer renderiza item com label "Row 5 · comment" (placeholder)
8. quando batch completa com addedCount > 0:
   - hydrator chama scheduleNotify (RAF debounced)
   - RAF callback chama csvModel.notifyListenersOnly() uma vez (mesmo se 5 batches resolveram juntos)
   - notifyListenersOnly dispara model.onChange
   - consumers re-renderizam coalescidos
   - markerToBase roda de novo, getMarkerText agora retorna text → label vira "trecho codificado…"
```

Para batches concorrentes (vault com 5 parquets, primeiro Code Explorer abrir):

```
1. consumer.render itera 5 fileIds, chama requestHydration pra cada
2. hydrator dispatcha 5 batches em paralelo (cada um cria/reusa provider próprio)
3. queries DuckDB serializam internamente no worker (1 conn singleton)
4. cada batch completa, schedule notify via RAF
5. RAF flush: 1 notifyListenersOnly cobre todos os 5
6. consumers re-renderizam 1x com tudo populado
7. status indicator atualiza a cada batch: 5/5 → 4/5 → … → 0/5 (some)
```

## Error handling

Por fileId, falhas isoladas (uma não bloqueia outras):

| Cenário | Tratamento | Marca seen? |
|---|---|---|
| Eager mode (size < threshold) | `skipped: 'eager mode'` | sim (não retenta) |
| Arquivo não encontrado no vault | `skipped: 'file missing'`. Log warn. | sim |
| Não é parquet/csv | `skipped: 'not tabular'` | sim |
| Parquet sem matches (`addedCount === 0`) | `skipped: 'no rows matched markers'` | sim (órfão / row out-of-range) |
| OPFS quota exceeded ao baixar | `error: 'OPFS quota'`. Log error. | NÃO (próxima tentativa pode passar se user limpar OPFS) |
| Parquet corrompido (DuckDB throw) | `error: 'parse failed: <msg>'`. Provider dispose. | NÃO (retry próxima) |
| `getDuckDB` falha (init bug) | `error: 'duckdb init failed'`. | NÃO |
| Plugin unload no meio do batch | `dispose()` aguarda inflight com timeout 5s. Após, log warn e return. Providers órfãos morrem com `runtime.dispose()` no plugin onunload. | n/a |

`errors: Map<fileId, string>` armazena último erro por fileId. Não exposto via UI por enquanto. `reset()` limpa `seen` + `errors` pra retry total (Slice 4 opcional).

## Testing strategy

### Unit tests (`tests/csv/markerPreviewHydrator.test.ts`)

- `requestHydration` idempotente: 3 chamadas consecutivas pra mesmo fileId resultam em 1 batch (mockando `populateMissingMarkerTextsForFile`).
- Concorrência: dispatch de 2 fileIds diferentes resulta em 2 batches em paralelo.
- Skip eager: `csvModel.isLazyFile` retorna false → outcome `skipped: 'eager mode'`, addedCount undefined, seen.add.
- Skip empty: `populateMissingMarkerTextsForFile` retorna 0 → outcome `skipped: 'no rows matched'`, seen.add.
- Error retry: provider create throw → outcome error, NÃO seen.add. Próxima `requestHydration(fileId)` retenta.
- Provider reuse: `getLazyProvider(fileId)` retorna existing → hydrator NÃO chama `DuckDBRowProvider.create`, NÃO chama `dispose` (mock verifica zero calls).
- `onStatusChange` listener chamado a cada batch start/complete.
- `notifyListenersOnly` é chamado uma vez quando 3 batches completam dentro da mesma RAF window (debounce).
- `reset()` zera state, próxima requestHydration re-roda.

Mocks: `csvModel.populateMissingMarkerTextsForFile`, `csvModel.isLazyFile`, `csvModel.getLazyProvider`, `csvModel.notifyListenersOnly`, `plugin.getDuckDB`, `DuckDBRowProvider.create` (mock provider já existe em `tests/csv/duckdb/`).

### Integration tests

- `BaseCodeExplorerView` render dispatcha `requestHydration` per-fileId (não per-marker). Mockar plugin.markerPreviewHydrator e contar chamadas em vault com 3 fileIds × 100 markers cada → 3 chamadas, não 300.
- `csvModel.onChange` (via notifyListenersOnly) → consumer re-renderiza → adapter.markerToBase retorna texto cached.

### Smoke checkpoints (Obsidian real, OBRIGATÓRIO antes de marcar como done)

1. **Cold start (cenário primário):** vault de teste com parquet 297MB. Pre-condições: limpar `markerTextCache` (reload sem prepopulate cache), OU usar parquet que o user nunca abriu nessa máquina. Importar QDPX prévio se necessário pra gerar markers. Reload Obsidian. Abrir Code Explorer. Validar:
   - Code Explorer abre instantâneo
   - Indicador "Hidratando 1/1…" aparece no header
   - Markers aparecem com placeholder de coordenada
   - Em < 30s, placeholder vira texto
   - Indicador some
2. **QDPX import no meio da sessão:** com Code Explorer aberto e nenhum batch pendente, importar QDPX que adiciona markers em parquet ainda não hidratado. Validar:
   - Plugin chama `reloadAfterImport` → `csvModel.reload()` → `onChange` → re-render
   - Markers aparecem com coordenada
   - Indicador sobe automaticamente
   - Texto preenche conforme batch completa
3. **Provider reuse (file aberto):** abrir parquet lazy via Obsidian (CsvCodingView registra provider). Em paralelo, abrir Code Explorer. Validar:
   - Hydrator usa provider existente (sem segundo download/CREATE TABLE — verificar via console log temporário)
   - Não chama dispose nesse provider
   - Quando user fecha o file, csvCodingView dispose normalmente
4. **Eager file (smoke negativo):** abrir parquet pequeno (< threshold). Validar que `requestHydration` é skipped (`isLazyFile` retorna false), batch não roda, getMarkerText resolve sync via rowDataCache.
5. **Falha por arquivo corrompido:** simular parquet inválido em data.json (path apontando pra arquivo de texto). Validar:
   - Outras hidratações continuam
   - Console mostra warn
   - Coordenada permanece como label
   - `errors` map contém entry pra esse fileId
   - Próxima vez Code Explorer abrir, hydrator re-tenta
6. **Cmd+R hot reload no meio do batch:** validar que `dispose()` drena providers ativos com timeout, sem error log do "Missing DB manager".

## Implementation notes

### Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/csv/markerPreviewHydrator.ts` | Novo módulo (orchestrator + types) |
| `src/csv/csvCodingModel.ts` | Add `isLazyFile(fileId)` + `getLazyProvider(fileId)` getters públicos |
| `src/main.ts` | Instancia `MarkerPreviewHydrator` no `onload`; expõe via field; `await hydrator.dispose()` no `onunload` |
| `src/core/baseCodeExplorerView.ts` | Após agrupar markers por file, itera fileIds únicos e chama `plugin.markerPreviewHydrator.requestHydration(fileId)`. Renderiza header indicator subscribe via `onStatusChange` |
| `src/core/baseCodeDetailView.ts` | Idem (evidence list group by file) |
| `src/core/smartCodes/smartCodeListModal.ts` | Idem |
| `src/core/smartCodes/detailSmartCodeRenderer.ts` | Idem |
| `src/core/memoView.ts` (ou equivalente) | Idem (by-code mode) |
| `tests/csv/markerPreviewHydrator.test.ts` | Novo (unit tests) |

`UnifiedCodeExplorerView` e `UnifiedCodeDetailView` herdam de `Base*` — sem mudança direta. Implementação no base cobre.

### Compatibilidade com `prepopulateMarkerCaches.ts`

`prepopulateMarkerCaches` continua rodando no `onLayoutReady` com mesma semântica (só popula se OPFS fresco). Quando preenche `markerTextCache`, hydrator pode receber notificação dos fileIds populados pra adicionar diretamente em `seen` (skipping the batch). Detalhe pequeno: `prepopulateMarkerCaches` chama `hydrator.markSeen(fileId)` ao final de cada file populado.

Alternativa: hydrator não recebe notificação. `requestHydration` no consumer detecta cache hit via `populateMissingMarkerTextsForFile` retornando `addedCount === 0` → marca seen via fluxo normal. Implementação mais simples, mas dispara batch desnecessário. **Decisão pro plan:** se prepopulate completou, marcar seen direto.

### Status indicator placement (decisão pro plan)

Cada `Base*View` decide o placement no header. Sugestão: `<div class="qualia-hydration-status">` flex-aligned no toolbar do view. Style: subtle (color var(--text-muted), font-size 0.85em, fade-in/out).

Fonte única de verdade: `hydrator.getStatus()` + `onStatusChange`. Múltiplos consumers abertos mostram o mesmo state.

## Migration / Rollout

Mudança aditiva — sem breaking change pro contrato existente. Implementação incremental:

1. **Slice 1**: `MarkerPreviewHydrator` standalone com unit tests + helpers `csvModel.isLazyFile`/`getLazyProvider`. Sem integração ainda.
2. **Slice 2**: integração no `BaseCodeExplorerView` (mais comum). Smoke: cold start cenário primário + provider reuse.
3. **Slice 3**: extensão pra `BaseCodeDetailView`, `SmartCodeListModal`, `detailSmartCodeRenderer`, `Memo View`. Smoke: navegação cross-views durante hidratação.
4. **Slice 4 (opcional)**: command palette `Qualia: Rebuild marker preview cache` chamando `hydrator.reset()`. Feature útil pra debug de issues raros (parquet recém-corrompido foi consertado, user quer retry sem reload). Decidir após smoke se vale.

Cada slice é commit independente, validado por smoke antes do próximo.

## Decisões fechadas no brainstorm + revisão

Pra referência futura — o que NÃO vai ser feito e por quê:

- **Cascade async em `SidebarModelInterface`:** muda contrato em ~12 callsites de UI síncrona. Comentário no `csvSidebarAdapter` linha 32-34 explicitamente prefere "stay sync without cascading async into core/". Mantida.
- **Pre-popular cache agressivo no startup:** quebra a semântica do `prepopulateMarkerCaches` ("nunca surprise IO"). Vault com 5 parquets = boot de 30s+ com download forçado. Trade não vale.
- **`hasMarkerSync` helper:** soluciona um problema que não existe — adapter já é sync (consulta cache). Helper sem reuso = gambiarra.
- **Skeleton/spinner per-item:** placeholder de coordenada já é informação útil; skeleton em vault grande parece app travado.
- **Detection de mudança em `data.json` via observer permanente:** lazy detection na renderização cobre o mesmo caso sem observer dedicado.
- **`requestHydration` per-marker em `markerToBase`:** O(N) por re-render — vault de 660k markers fritaria. Trigger é per-file no consumer.
- **Re-render granular per-item via DOM mutation:** virtual list recicla DOM; tracking de `markerId` no DOM é complexidade desnecessária. `notifyListenersOnly` + RAF coalescing já existe e cobre.
- **Canal `subscribe` paralelo no hydrator pros consumers:** duplica `model.onChange` que todos já subscrevem. `csvModel.notifyListenersOnly()` é o canal único. `onStatusChange` permanece como canal separado pq é UI separada (indicator).
- **`outcomes: Map<fileId, HydrationOutcome>` field público:** dead code se "Show hydration log" é fora do spec. Apenas `errors: Map<fileId, string>` (pra debug interno + decisão de retry).
- **AbortController real no dispose:** complexidade desnecessária. Timeout 5s + log warn + abandona providers órfãos (worker morre com `runtime.dispose()` do plugin onunload).
