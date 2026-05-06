# Sidebar markerText preview pra arquivos lazy — Design

**Data:** 2026-05-06
**Status:** spec aprovada, aguarda implementation plan
**Owner:** Marlon Lemes

## Contexto

Em modo eager (parquet/CSV pequeno), o `csvCodingModel` mantém `rowDataCache` populated no file-open, e `getMarkerText(marker)` resolve sync lendo `rows[sourceRowId][column]`. Sidebar adapter retorna o texto direto pra `BaseMarker.markerText` — Code Explorer, Code Detail, Evidence list, by-code memo view e Smart Code detail mostram preview do trecho codificado.

Em modo lazy (parquet >50MB ou CSV >100MB, conforme `parquetSizeWarningMB`/`csvSizeWarningMB`), o file fica em OPFS e queries vão pra DuckDB. O `rowDataCache` **nunca é populado** nesse modo. Existem 2 caches sync separados:

1. `markerTextCache: Map<markerId, string>` — preview persistente em memória da sessão. Source of truth pro `getMarkerText` em modo lazy.
2. `getMarkerTextAsync(marker)` — fallback que dispara query DuckDB on-demand, popula o cache e retorna.

`prepopulateMarkerCaches.ts` (Fase 6 Slice A) roda no startup pra popular `markerTextCache` em background, mas **só** pra fileIds em modo lazy cujo OPFS já tem cópia fresca (`isOpfsCached(opfsKey, mtime) === true`). Fileids cujo OPFS está frio são pulados — pra evitar download "surprise" no boot.

**Resultado:** se o user importa um QDPX em vault novo (cenário típico de migração), os parquets correspondentes não estão em OPFS. `prepopulateMarkerCaches` skipou. Sidebar mostra os markers (`Row 5 · comment` placeholder de coordenada após `previewText` fix de 2026-05-06) sem texto, e fica assim até o user abrir manualmente cada parquet — UX zoado.

## Problema

Sidebar (e qualquer view que renderiza `BaseMarker.markerText`) precisa exibir preview do trecho codificado em **arquivos lazy ainda não hidratados** sem mudar o contrato síncrono dos consumers e sem forçar IO no startup.

## Goals

- Coverage do cenário "vault migrado/cold": sidebar/Code Explorer/Code Detail mostram texto dos markers em parquets que o user nunca abriu nessa máquina.
- Auto-coverage de QDPX import no meio da sessão (importer adiciona markers em fileIds novos).
- Trigger só por demanda real (renderização que vai mostrar preview), nunca no boot do plugin.
- Smooth update: placeholder de coordenada → texto inline quando async resolve, sem flicker visível.
- Indicador discreto de progresso (sidebar header ou status bar) durante hidratação ativa.

## Non-goals

- Mudar contrato síncrono do `SidebarModelInterface` (NÃO cascade async em ~12 callsites).
- Pre-popular cache no startup (mantém semantic atual de `prepopulateMarkerCaches`: só popula se OPFS já fresco, nunca download surprise).
- Cobrir markers que apontam pra rows fora do parquet (`sourceRowId` inválido) — esses caem no fallback de coordenada permanentemente; comportamento atual.
- Persistir o cache cross-session em disco (memória da sessão é suficiente; `prepopulateMarkerCaches` repopula no boot quando OPFS fresco).
- UI de retry manual em caso de falha de hidratação (silent log + manter coordenada como placeholder).

## Design overview

Em uma frase: **um orchestrator stateful (`MarkerPreviewHydrator`) é a única autoridade que decide quando/como popular o `markerTextCache` em modo lazy. Sidebar e views consumer chamam `requestHydration(fileId)` na renderização e fazem `subscribe(listener)` pra re-render granular quando o batch termina.**

Decisões consolidadas no brainstorm:

| Decisão | Cravada em |
|---|---|
| Modelo continua sync (sem cascade async em consumers) | mantém comentário existente no `csvSidebarAdapter` |
| Trigger é a renderização do consumer (não o boot do plugin) | substitui pre-populate agressivo |
| Smooth update coordenada → texto, sem skeleton/spinner per-item | placeholder já é informação útil |
| Indicador discreto agregado (`Hidratando previews… 2/5`) | escala melhor pro pior caso (vault de 10+ parquets) |
| Auto re-trigger via lazy detection (cobre import) | sem hook explícito no importer |
| Set hydrated em memória, dispose de provider após popular | sem persistência cross-session, sem leak de runtime |

## Arquitetura

### Novo módulo: `src/csv/markerPreviewHydrator.ts`

Classe `MarkerPreviewHydrator` instanciada uma única vez no `Plugin.onload`, exposta via field e referenciada pelos sidebar adapters / views.

**State interno:**

- `hydrated: Set<fileId>` — fileIds cujo `markerTextCache` foi populado nessa sessão (success ou marcado como skipped).
- `inflight: Map<fileId, Promise<HydrationOutcome>>` — dedup de batches em curso. Próxima `requestHydration(fileId)` enquanto inflight reusa a Promise existente.
- `listeners: Set<HydrationListener>` — observers pra notificação quando batch completa.
- `outcomes: Map<fileId, HydrationOutcome>` — resultado por fileId pra debug/diagnóstico (success, error, skipped).

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
  totalSeen: number;        // fileIds que passaram pelo hydrator (inflight + completed)
  completedCount: number;   // dos seen, quantos finalizaram (qualquer outcome)
}

export type HydrationListener = (outcome: HydrationOutcome) => void;

export class MarkerPreviewHydrator {
  constructor(private plugin: QualiaCodingPlugin, private csvModel: CsvCodingModel);

  /**
   * Idempotente. No-op se fileId já hidratado ou inflight. Retorna a Promise
   * inflight (caller pode aguardar se quiser).
   */
  requestHydration(fileId: string): Promise<HydrationOutcome>;

  /** Re-render trigger pros consumers. Retorna unsubscribe. */
  subscribe(listener: HydrationListener): () => void;

  /** Pro indicador de progresso. */
  getStatus(): HydrationStatus;
  onStatusChange(listener: (status: HydrationStatus) => void): () => void;

  /** Reset opcional pra command "Rebuild marker preview cache". */
  reset(): void;

  /** Cleanup no Plugin.onunload. */
  dispose(): void;
}
```

### Integração nos consumers

**`csvSidebarAdapter.markerToBase(m, model)` (src/csv/views/csvSidebarAdapter.ts):**

Antes de retornar o `BaseMarker`, se `model.getMarkerText(m) === null` E o file está em modo lazy, chama `plugin.markerPreviewHydrator.requestHydration(m.fileId)` (fire-and-forget). Adapter precisa receber referência ao hydrator no constructor (mudança em `BaseSidebarAdapter` e/ou injeção via plugin field).

**Views consumer (`BaseCodeExplorerView`, `BaseCodeDetailView`, `UnifiedCodeExplorerView`, `UnifiedCodeDetailView`, `SmartCodeListModal`, `Memo View`):**

No `onload`/mount: subscribe ao hydrator. Listener invoca re-render granular do item afetado (find list-item por `markerId`/`fileId` e invoca `applyTextUpdate(item, newText)` — substitui só o conteúdo do span de label, não a row inteira).

**Indicador visual:**

Dois caminhos a explorar (decisão fica pro plan):
- (a) Pequeno status indicator no header do Code Explorer / Code Detail (`Hidratando 2/5 arquivos…`), some quando `inflightCount === 0`.
- (b) `setStatusBarItem` do Obsidian pra status global do plugin (visível em qualquer view).

Recomendação: **(a)** — escopo da hidratação é específico das views de marker; não polui status bar global.

### Reuso de código existente

Hydrator NÃO duplica nada. Reusa:

- `plugin.getDuckDB()` — runtime singleton, já cached
- `DuckDBRowProvider.create({ runtime, fileHandle, fileType })` — provider per-file, com lock interno (drain on dispose) implementado em 2026-05-06
- `csvModel.populateMissingMarkerTextsForFile(fileId, provider)` — função batch idempotente que já existe; popula `markerTextCache` direto e retorna `addedCount`
- `csvModel.cacheMarkerText(markerId, text)` — caso queira poke entry específico
- `openOPFSFile(opfsKey)` / `isOpfsCached(opfsKey, mtime)` — helpers OPFS já existentes

## Data flow

Sequência pra um single fileId desde primeiro acesso até preview renderizado:

```
1. user navega pro Code Explorer
2. CodeExplorerView.render() itera markers cross-file
3. pra cada marker: chama csvSidebarAdapter.getMarkerById(id) → markerToBase(m)
4. markerToBase chama model.getMarkerText(m) → null (lazy + cold)
5. markerToBase chama hydrator.requestHydration(m.fileId)
6. hydrator: fileId não tá hydrated/inflight → cria Promise, adiciona em inflight, dispara batch async
7. batch async:
   a. resolve TFile + sizeBytes; verifica que é lazy
   b. se OPFS frio: openOPFSFile(opfsKey) baixa arquivo (pode demorar)
   c. plugin.getDuckDB() retorna runtime cached
   d. DuckDBRowProvider.create({ runtime, fileHandle, fileType }) — provider novo
   e. csvModel.populateMissingMarkerTextsForFile(fileId, provider) → cache populado
   f. provider.dispose() (drena queries via lock implementado em 2026-05-06)
   g. hydrator: hydrated.add(fileId), inflight.delete(fileId)
   h. emit outcome pra listeners
8. (em paralelo) markerToBase retorna BaseMarker com markerText: null
9. consumer renderiza item com label = "Row 5 · comment" (placeholder de coordenada)
10. quando batch completa, listener do consumer dispara re-render do item afetado
11. re-render: model.getMarkerText(m) agora retorna texto cached → label vira "trecho codificado…"
```

Para batches concorrentes (ex: vault com 5 parquets, primeira render do Code Explorer faz `requestHydration` pra todos):

```
1. 5 chamadas requestHydration disparadas em sequência
2. cada uma cria Promise + entry em inflight
3. batches rodam em paralelo (queries DuckDB serializam internamente no worker)
4. cada batch completa independentemente, emit listener
5. consumer re-renderiza 5x (granular: só items dos fileIds completados)
6. status indicator atualiza: 5/5 → 4/5 → … → 0/5 (some)
```

## Error handling

Por fileId, falhas isoladas (uma não bloqueia outras):

| Cenário | Tratamento |
|---|---|
| Arquivo não encontrado no vault | `outcome: { status: 'skipped', reason: 'file missing' }`. Log warn. UI mantém coordenada placeholder. |
| Não é parquet/csv | `skipped: 'not tabular'`. |
| File em modo eager (size < threshold) | `skipped: 'eager mode'`. Eager já popula `rowDataCache`, então `getMarkerText` resolve sync. |
| OPFS quota exceeded ao baixar | `error: 'OPFS quota'`. Log error. UI mantém coordenada. User pode liberar OPFS manualmente. |
| Parquet corrompido (DuckDB throw) | `error: 'parse failed: <msg>'`. Provider dispose. UI mantém coordenada. |
| `getDuckDB` falha (init bug) | `error: 'duckdb init failed'`. Outras hidratações que ainda não rodaram tentariam de novo na próxima. |
| Plugin unload no meio do batch | `dispose()` aguarda inflight com timeout (ex: 5s) ou cancela via AbortController. Provider lock interno cobre o caso de DROP TABLE concorrente. |

`outcomes` mantém último resultado por fileId — pra command "Show hydration log" futuro (opcional, fora deste spec).

## Testing strategy

### Unit tests do `MarkerPreviewHydrator`

- `requestHydration` idempotente: chamar 3x consecutivas pra mesmo fileId resulta em 1 batch.
- Concorrência: dispatch de 2 fileIds diferentes resulta em 2 inflight, 2 outcomes.
- `subscribe`/unsubscribe: listener chamado uma vez per outcome, unsubscribe não recebe mais.
- `getStatus` reflete inflight/total/completed corretamente.
- `reset()` zera state, próxima `requestHydration` re-roda.
- Error path: provider create lança → outcome.status === 'error'; outras chamadas não afetadas.

Mockar via fake `csvModel.populateMissingMarkerTextsForFile` (resolve com `addedCount`) e fake `getDuckDB`/`DuckDBRowProvider.create` (já há mocks em `tests/csv/duckdb/duckdbRowProvider.test.ts`).

### Integration tests do callsite

- `csvSidebarAdapter.markerToBase`: dispatcha `requestHydration` se modo lazy + cache miss; não dispatcha em modo eager nem em cache hit.
- `BaseCodeExplorerView`: subscribe é instalado no onload, removido no onunload.
- Listener re-render: outcome event dispara update do item específico (não da lista inteira).

### Smoke checkpoints (Obsidian real, OBRIGATÓRIO antes de marcar como done)

1. **Cold start (cenário primário):** vault de teste com parquet 297MB que o user nunca abriu. Importar QDPX prévio ou copiar `data.json` com markers nesse fileId. Reload Obsidian. Abrir Code Explorer. Validar:
   - Code Explorer abre instantâneo
   - Indicador "Hidratando 1/1…" aparece no header
   - Markers aparecem com placeholder de coordenada
   - Em < 30s, placeholder vira texto
   - Indicador some
2. **QDPX import no meio da sessão:** com Code Explorer já aberto e nenhum batch pendente, importar QDPX que adiciona markers em parquet ainda não hidratado. Validar:
   - Markers aparecem na árvore com coordenada
   - Indicador "Hidratando 1/1…" sobe automaticamente
   - Texto preenche conforme batch completa
3. **Eager file (smoke negativo):** abrir parquet pequeno (< threshold). Validar que `requestHydration` NÃO dispara batch (`skipped: 'eager mode'` no outcome) — `getMarkerText` resolve sync via `rowDataCache`.
4. **Falha por arquivo corrompido:** simular parquet inválido em data.json (path apontando pra arquivo de texto). Validar que outras hidratações continuam, console mostra warn, coordenada permanece como label.
5. **Cmd+R hot reload no meio do batch:** validar que `dispose()` drena providers ativos sem error log do "Missing DB manager".

## Implementation notes

### Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/csv/markerPreviewHydrator.ts` | Novo módulo (orchestrator + types) |
| `src/main.ts` | Instancia `MarkerPreviewHydrator` no `onload`; expõe via field; dispose no `onunload` |
| `src/csv/views/csvSidebarAdapter.ts` | Recebe ref ao hydrator; chama `requestHydration` em `markerToBase` quando lazy + cache miss |
| `src/core/baseSidebarAdapter.ts` | Possível parâmetro novo no constructor pra propagar hydrator (decisão de plan) |
| `src/core/baseCodeExplorerView.ts` | Subscribe ao hydrator no onload; re-render granular no listener; status indicator no header |
| `src/core/baseCodeDetailView.ts` | Idem |
| `src/core/unifiedExplorerView.ts` | Idem (já estende `baseCodeExplorerView`?) |
| `src/core/unifiedDetailView.ts` | Idem |
| `src/core/smartCodes/smartCodeListModal.ts` | Subscribe (modal mostra markers cross-file) |
| `src/core/smartCodes/detailSmartCodeRenderer.ts` | Idem |
| `tests/csv/markerPreviewHydrator.test.ts` | Novo (unit tests) |

### Compatibilidade com `prepopulateMarkerCaches.ts`

`prepopulateMarkerCaches` continua rodando no `onLayoutReady` com o mesmo critério (só popula se OPFS fresco). Quando ele preenche o `markerTextCache` pra um fileId, nas próximas chamadas de `markerToBase`, `getMarkerText` retorna sync e `requestHydration` NÃO dispara (cache hit). Os dois mecanismos coexistem sem duplicação.

Após o boot do `prepopulateMarkerCaches`, hydrator pode receber notificação dos fileIds populados (adicionar à `hydrated: Set<fileId>` automaticamente) pra evitar re-checagem desnecessária. Detalhe de plan.

### Status indicator placement

Cada view consumer renderiza seu próprio indicator (no header) baseado em `hydrator.getStatus()` + `onStatusChange`. Quando vários consumers estão abertos, todos mostram o mesmo state — fonte única de verdade.

Alternativa rejeitada: status bar global do Obsidian. Motivo: a hidratação é específica de coding qualitativa; status bar é prime real estate que outras features podem querer.

## Migration / Rollout

Mudança aditiva — sem breaking change pro contrato existente. Implementação pode rodar incrementalmente:

1. Slice 1: `MarkerPreviewHydrator` standalone com unit tests.
2. Slice 2: integração no `csvSidebarAdapter`. Smoke: cold start cenário primário.
3. Slice 3: subscribe nos views consumer + status indicator. Smoke: re-render granular + indicator visual.
4. Slice 4: command "Rebuild marker preview cache" (chama `hydrator.reset()`) — opcional, se algum smoke revelar caso edge não-coberto.

Cada slice é commit independente, validado por smoke antes do próximo.

## Decisões fechadas no brainstorm

Pra referência futura — o que NÃO vai ser feito e por quê:

- **Cascade async em `SidebarModelInterface`:** muda contrato em ~12 callsites de UI síncrona (drag-drop, hover, mutations). Comentário no `csvSidebarAdapter` linha 32-34 explicitamente prefere "stay sync without cascading async into core/". Mantida.
- **Pre-popular cache agressivo no startup:** quebra a semântica do `prepopulateMarkerCaches` ("nunca surprise IO"). Vault com 5 parquets = boot de 30s+ com download forçado. Trade não vale.
- **`hasMarkerSync` helper:** soluciona um problema que não existe — adapter já é sync (consulta cache). Helper sem reuso = gambiarra.
- **Skeleton/spinner per-item:** placeholder de coordenada já é informação útil; skeleton em vault grande parece app travado.
- **Detection de mudança em `data.json` via observer permanente:** lazy detection na renderização cobre o mesmo caso sem observer dedicado.
