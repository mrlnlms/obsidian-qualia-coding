# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Won't-fix mantém razão pra não reabrir.
> Última atualização: 2026-05-05.

---

## 🟢 Estado atual

**Nenhum bloqueador aberto.** Smart Codes Tier 3 + Phase 2 (SC1, SC2, SC3) **100% fechado**. Single item legado: §11 E3 (limitação de formato, won't-fix documentado).

### 🔍 Sintomas observados sem repro confiável

Quando aparecer, capturar `data.json` + screenshot + steps na hora — diagnóstico fica trivial com forensic data. Sem nenhum sintoma aberto no momento.

Áreas com polish opcional foram migradas pro `ROADMAP.md`:
- Relations Network (hover-focus ✅, filtro N+ ✅, edge bundling condicional)
- Multi-tab spreadsheet export
- Code × Metadata ✅
- Pastas nested ✅
- Margin Panel customization (bloqueado por plugin externo)

---

## 🟡 Smart Codes Tier 3 — Phase 2 (não bloqueante)

Smart Codes Tier 3 fechou em 2026-05-04 (branch `feat/smart-codes`, 19 commits, 175 testes novos, mergida em `main`). Funcionalidade core — criar/editar/deletar/visualizar/contar/export/import — está **100% acessível via command palette** (`Smart Codes: Open hub` + `Smart Codes: New`) e usa modal próprio. Round-trip QDPX e CSV tabular funcionam. Stress passou em <1s pra 10k markers + 100 smart codes.

**Spec autoritativa:** `plugin-docs/archive/claude_sources/specs/20260504-smart-codes-design.md` (workspace externo)
**Plan original:** `plugin-docs/archive/claude_sources/plans/20260504-smart-codes.md` (5 chunks, workspace externo)
**Tags de rollback:** `pre-smart-codes-baseline` (82cb949) ↔ `post-smart-codes-checkpoint` (4022808)

### ~~SC1 — Integração em Analytics modes~~ ✅ FEITO (2026-05-05)

Helper `getSmartCodeViews` em `smartCodeAnalytics.ts` resolve refs em UnifiedMarkers
aplicando filters globais. Cada engine augmenta seu result type com SC entries:
frequency (isSmart flag, drag/board desabilitado), cooccurrence (intersect Sets),
evolution+temporal (herda meta), codeMetadata (matriz extends), lagSequential+polar
(SC vira código aumentado em transitions), memoView (sections SC prepended em byCode).
Filter UI: chips ⚡ no topo da codes section, integrados ao enabledCodes/excludeCodes.
AnalyticsPluginAPI ganhou smartCodeRegistry + smartCodeCache.

Commit: `210b7a1`.

### ~~SC2 — Sidebar adapters por engine mostrando smart codes que matcham no file~~ ✅ FEITO (2026-05-05)

Plan original referia "6 sidebar adapters concretos pra modificar" — premissa errada:
esses arquivos são MarkerInterface model adapters, não rendering. UI cross-engine fica
em UnifiedCodeExplorerView (única view shared). Adicionado grupo "⚡ Smart Codes" como
top-level no tree do Code Explorer com estrutura SC → file → matches. Click em match
navega cross-engine via `this.navigateToMarker`. Subscribe a cache + registry.addOnMutate
+ refreshFromMarkers (workaround SC3). Search filter aplica a SC names também.
Bonus fix: search no Code Detail (list mode) também filtra SCs (paridade).

Commits: `158d65b` (SC2), `b7a21f2` (search fix).

### ~~SC3 — Emit granular MarkerMutation pra invalidação cirúrgica~~ ✅ FEITO (2026-05-05)

Cache invalidation cirúrgica em add/remove/update marker — SCs cujo predicate
não depende dos codeIds afetados ficam intactos (matches cached). Vault com
100 SCs e 1 marker editado: só os SCs dependentes recomputam.

**Implementação:** `MarkerMutationEvent` type + canal `onMarkerMutation` paralelo a
`onChange` em todos 5 engine models (markdown/pdf/image/csv/media). Cada mutation
site (addCode, removeCode, removeMarker, updateMarker, updateMarkerFields,
createShape, deleteShape, addCodeToShape, removeCodeFromShape, addCodeToManyRows,
removeCodeFromManyRows, removeAllRowMarkersFromMany, migrateFilePath, undo)
emite com codeIds afetados. Cache `applyMarkerMutation(event)` atualiza
markerByRef incremental + invalida só SCs dependentes via dependencyExtractor.

**Cleanups associados:**
- Removido `indexByCode`/`indexByFile` (dead code — só rebuildIndexes preenchia,
  compute itera markerByRef direto). 50 LOC eliminados.
- Cascade fix: invalidateForCode/CaseVar/Folder/Group agora usam `invalidate()`
  (recursa via smartCode leaf) em vez de `markDirty()` (que não cascateava).
- Removido eye icon hide/show das SC rows (Code Detail + Hub modal) — UX
  redundante com filter chip do Analytics; SC não tem visibility per-doc.
- Clear All Markers agora limpa SC definitions também (SCs órfãos sem regulars
  pra referenciar ficam quebrados).
- getMarkerByRef fallback via composite key — caller que guardou ref antes de
  REMOVE+ADD (rename, undo) ainda resolve o marker atual.
- SC entries no Frequency mode ganham drag + Add to Board (decisão original
  de gap deliberado revisada).

**Smoke test cross-engine:** 14 fases validadas em vault real (markdown + PDF +
image + CSV row/segment + audio + video). Granular invalidation confirmada via
subscribe console capture: tema-A → ['SC_A', 'SC_combo'] (juntos, não separados),
tema-C → silêncio (nada loga).

Commits: `f8e786c` (base) → `82c3cd8` (cascade) → `0c47529` (CSV bulk + rename)
→ `df9ecaa` (PDF undo + clearAll race + identity fallback) → `c035327`
(showList instanceof) → `b4a84bc` (SC drag/board) → `bfa6164` (filter B)
→ `638ae6e` (Memo View total fix) → `958de30` (eye removed) → `6386cee`
(clear all SCs).

### ~~SC4 — Code Explorer integration~~ ✅ FEITO (2026-05-05)

`smartCodesSection` foi wirado no Code Detail (modo "All Codes") em vez do Code Explorer.
Click numa SC abre detail INLINE no sidebar (Phase 2). Modal hub via Cmd+P continua
como atalho. Visual consistente com code detail (`codemarker-detail-*` classes,
back button compartilhado). Auto-refresh via `cache.subscribe` + `registry.addOnMutate`
+ `model.onChange` (workaround SC3). Convert to note pra SC memo também landed.

Commits: `dc951b0` → `e7b6620` (10 commits da sessão de Smart Codes Phase 2).

---

## 🪶 Polish curto (UX/qualidade de vida)

Items pequenos (<2h cada) sem guarda-chuva próprio. Quando atacar, vira commit direto.

### Layout shift no filter de virtual cols (lazy mode)

**Sintoma:** quando user aplica filter (cod-frow/cod-seg/comment) num parquet lazy, durante a janela entre `onFilterChanged` (cache purge) e a resposta do `getRows` (DuckDB query), AG Grid renderiza placeholder rows pelo viewport. Visualmente: as rows que estavam visíveis somem, viewport mostra ~10-20 placeholder rows com cells vazios, e quando DuckDB responde, encolhe pra apenas as rows que matcham. User descreveu como "todas as linhas reaparecem e depois encolhem".

**Mitigações já aplicadas (2026-05-07, parciais):**
- `defaultColDef.filterParams.debounceMs: 250` em lazy createGrid → coalesce keystrokes (1 refresh por pausa, não 1 por char)
- CSS class `csv-coding-filtering` toggled pelo `csvCodingView.refreshLazyFilter` (sync início + RAF-deferred remove no finally) → `.ag-row-loading` + `.ag-stub-cell` viram `visibility: hidden` durante a janela
- `getRows` short-page detection: `rows.length < requestedCount` → `lastRow = startRow + rows.length` (definitivo, independente de `filteredCount` async settle) → AG Grid não fica esperando lastRow desconhecido

**O que ainda falha:** entre purge e DuckDB respond (~50-150ms), viewport mostra blank space (placeholders escondidos via CSS, mas o espaço vazio segue lá). Sintoma cosmético — não bug funcional. User confirmou: "ta funcionando, tem só esse comportamento estranho".

**Caminhos pra investigar (em ordem de plausibilidade):**

1. **Loading overlay scoped:** `gridApi.showLoadingOverlay()` no início do refreshLazyFilter (sync) + `hideOverlay()` no finally (RAF-deferred). Cobre o viewport inteiro com mensagem clara "Filtering…" em vez de blank. Trade: overlay flash em filter rápido (<100ms) pode ser pior que blank. Mitigation: throttle — só mostra overlay se async passar de threshold (ex: setTimeout 100ms; se completar antes, cancela).

2. **Pre-compute filteredCount sync:** quando filter é puramente virtual (sem real cols), o count é exatamente `SELECT COUNT(DISTINCT source_row) FROM qualia_markers_<id> WHERE ...`. Em vault típico (markers small), isso é sub-ms. Pode ser awaitado SYNC antes de retornar do `refreshLazyFilter` (bloquear o caller até filteredCount conhecido). Mas o caller é AG Grid event handler, awaitar pode quebrar o flow.

3. **Setar rowCount sync via API:** AG Grid v33 tem `gridApi.setRowCount(N, false)`. Se chamar com 0 antes de DuckDB responder, AG Grid não renderizaria placeholders. Mas isso flicka entre 0 → real count.

4. **Custom loadingCellRenderer:** colDef pode definir `loadingCellRenderer: () => null`. Cell-level. Pode esconder mais granularmente.

**Caminho mais provável de funcionar:** combinação de (1) com threshold + (3) opcional. Spec curta antes de implementar.

**Não-blocker.** Funcionalidade tá certa, é só polish visual. User explicitamente disse pra resolver depois.

### ~~Export Parquet enriquecido — pipeline pra parquets muito grandes~~ ✅ FEITO (2026-05-07)

Multi-file fallback automático implementado: single-file (UX padrão) → catch OOM via regex → multi-file dataset (`<base>.qualia-enriched/part-NNN.parquet`). Decisão dinâmica em runtime, máquina-agnóstico — sem hardcode de teto por classe de hardware. Validado em stress test em parquet de 2.376M rows × 21 cols, ranging de 50k a 200k markers.

**Hardware da validação:**
- MacBook Pro M1, 8 GB RAM, SSD 256 GB (~20 GB livre)
- macOS 25.4.0
- DuckDB-Wasm bundle do plugin: wasm32, **sem pthread support** (single-threaded). Cap endereçável do worker: 4 GB (~3.1 GiB úteis após overhead).

**Stress test final (2026-05-07):**

Gerador: `scripts/seed-stress-export.mjs` — 6 cenários sintéticos via patch direto no `data.json` (mocka markers + codes synth, sem passar pelo UI). Target: `safe-mode-test/Distribution_history_MERGED_*.parquet` (2.376M rows × 21 cols, 297 MB).

| Cenário | Markers | Codes | Comments | VCols | Single-file | Fallback multi-file |
|---|---|---|---|---|---|---|
| C1 baseline | 100k | 50 | 0.86 MB | 9 | ✅ ~22s, 303.6 MB | n/a |
| C2 long-comments | 100k | 20 | 16.77 MB | 9 | ✅ 16.3s, 308.7 MB | n/a |
| C3 many-codes | 50k (3-5 codes) | 500 | 0 | 15 | ✅ 17.2s, 303.2 MB | n/a |
| **between-1** | **150k** | **53.57 MB** | **12** | ✅ **21.3s, 322.7 MB** | n/a |
| **between-2** | **175k** | **134.56 MB** | **15** | ❌ OOM | ✅ **42.3s, 350.6 MB (5 parts)** |
| C4 pathological | 200k | 228.71 MB | 15 | ❌ OOM | ✅ 42.0s, 383.3 MB (5 parts) |

**Teto empírico na M1 8GB:** entre 150k markers + 54 MB comments + 12 vcols (passa single-file) e 175k markers + 135 MB comments + 15 vcols (estoura). Não-isolado (3 fatores subiram juntos), mas o teto prático fica claro. **Em máquinas com mais RAM/cap maior, o teto do single-file será mais alto** — não medido. O fallback automático cobre o limite seja qual for.

**Achados:**
- Single-file: tempo ~16-22 s nos cenários que passam, dominado por I/O do scan + write do source 297 MB. Snappy comprime bem; vcols vazias colapsam pra ~zero.
- Multi-file fallback: ~42 s consistentes, independente do tamanho (5 chunks de 500k source rows × COPY individual). Inclui o tempo da tentativa de single-file que estourou.
- OOM signature: `Out of Memory: Allocation failure` do allocator WASM dentro do `BufferedFileWriter::OpenFile` durante COPY do output parquet. Captura via regex `/Out of Memory|Allocation failure|memory access out of bounds/i` em `isOOMError()`.
- Hidratação inicial do plugin com data.json grande (320 MB no C4): **~30 s** ao montar Code Explorer. Tópico separado — ver item "Code Explorer build latency em vault com muitos markers" abaixo.

**Mitigações aplicadas no caminho single-file:**
- CTE per virtual col + LEFT JOIN single-pass (vs correlated subquery por row)
- `SET preserve_insertion_order=false` (pipeline COPY sem buffer ordenado)
- `COMPRESSION SNAPPY` (vs ZSTD: -10% compression, muito menos memória durante write)
- `ROW_GROUP_SIZE 50000` (vs default 122880)
- `SELECT p.* EXCLUDE (__source_row)` evita leakage da coluna interna do DuckDBRowProvider

(`SET threads=N` não aplica — bundle do plugin é compiled sem pthread.)

**Caminho multi-file (`exportParquetEnrichedMultiFile`):**

- `MULTI_FILE_CHUNK_SIZE = 500_000` source rows. 5 chunks num parquet de 2.4M rows.
- Cada chunk: WHERE `source_row BETWEEN ...` injetado em CADA CTE (reduz GROUP BY scan da markers table pra 1/N) + WHERE no SELECT externo.
- Cada part: COPY → virtual fs → `copyFileToBuffer` → `writeBinary` no vault como `<base>.qualia-enriched/part-NNN.parquet` → `dropFile` imediato (libera worker antes do próximo chunk).
- Worker peak ~1.5 GB stable durante todo o export (vs ~3.5-4.7 GB do single-file que estoura).
- Output: pasta no vault. Leitor externo usa glob: `read_parquet('dir/*.parquet')` (DuckDB) ou `pd.read_parquet('dir/')` (pandas/polars). Padrão "parquet dataset" da indústria.

**Histórico de tentativas (arquivado):**

Antes de chegar no design final, foi implementado e descartado **chunked export single-file via concat** (commit revertido nesta sessão antes do design definitivo). 5 chunks gerados OK, mas o `COPY (SELECT * FROM read_parquet([part0..part4])) TO final` estourou OOM no concat — fragmentação progressiva do allocator WASM (dlmalloc não compacta heap linear). Substituído por multi-file sem concat porque concat tinha risco residual probabilístico mesmo com chunks menores ou binary-fold.

**Localização do código:**

- `src/csv/exportParquetEnriched.ts:8-19` — `isOOMError()` helper (regex match)
- `src/csv/exportParquetEnriched.ts:62-130` — `buildEnrichedSelect()` com parâmetro `range?: SourceRowRange` opcional (usado só pelo multi-file)
- `src/csv/exportParquetEnriched.ts:140-260` — `exportParquetEnriched()` single-file path (inalterado)
- `src/csv/exportParquetEnriched.ts:262-380` — `exportParquetEnrichedMultiFile()` novo
- `src/csv/exportParquetEnriched.ts:382-450` — `exportParquetEnrichedFromActiveView()` wrapper try-fallback
- `tests/csv/exportParquetEnriched.test.ts` — 5 testes pra `isOOMError`
- `scripts/seed-stress-export.mjs` — 6 cenários (`baseline`, `long-comments`, `many-codes`, `between-1`, `between-2`, `pathological`)

### ~~Code Explorer build latency em vault com muitos markers~~ ✅ FEITO (2026-05-08)

**Sintoma observado (2026-05-07, MacBook Pro M1 8 GB):** com `data.json` de 320 MB (200k markers + 200 codes + 228 MB comments synth do cenário pathological do stress test de export enriched):
- Vault load do Obsidian + plugin `onload` + `JSON.parse` do data.json = **rápido, sem latência perceptível**.
- Disparar comando `Code Explorer: open` via command palette → **~30 s** pra UI estabilizar (lista hierárquica + labels populados).
- Profile DevTools (2026-05-08) total 48 s, distribuição: Scripting 3.3 s + Rendering 3.4 s + Painting 0.2 s + System 1.1 s + **Idle 40.1 s** (main thread esperando worker DuckDB).

**Diagnóstico (com profile via DevTools Performance):**

Cadeia identificada em `BaseCodeExplorerView.buildCodeIndex` linha 215:

```
buildCodeIndex()
  → markerPreviewHydrator.requestHydration(fileId)  [background promise]
    → runLazyBatch() → populateMissingMarkerTextsForFile()
      ↓ chunkSize=1000, 200k markers = 200 chunks
      for cada chunk: await provider.batchGetMarkerText(refs)
        ↓ markers em 5 colunas × 200 chunks = ~1000 queries DuckDB-Wasm sequenciais
        await trackedQuery(...) — postMessage round-trip ~30-40 ms cada
        TOTAL: ~25-35 s
```

**Bottom-Up top ofensores (Self Time):**

| % | Activity | Análise |
|---|---|---|
| 33.1% (2.4 s) | **Recalculate Style** | rebuild repetido do DOM do Code Explorer (Nx por file hidratado), inline styles (`style.height`, `style.paddingLeft`) cascateando reflow |
| 8.1% (588 ms) | Hit Test | scroll/mouse resolution durante rebuilds |
| 4.7% (339 ms) | `populateMissingMarkerTextsForFile` self time | overhead do main thread orquestrando os 200 awaits |
| 4.5% (328 ms) | CPP GC | pressão de GC alta durante o ciclo de allocations |
| 1.6% (119 ms) | `getAllMarkers` | spread de 200k arrays em cada `getMarkersForFile` |
| 1.2% (85 ms) | `buildCodeIndex` self | **NÃO é o vilão** |

Frames de **3-9 segundos sem paint** (frame view) — UI percebida como travada. Causa: microtask queue saturada pelo loop de awaits sequenciais ocupa o event loop sem janela pra paint cycle.

**Agravante secundário:** quando cada file termina hidratação, `scheduleNotify` dispara `model.onChange` → `Code Explorer.scheduleRefresh` → **rebuild completo** do `renderTree` (200 codes × 200 virtual lists × DOM destruir+recriar). Isso explica os 2.4 s de Recalculate Style multiplicados pelo número de files no vault.

**Mitigações aplicadas:**

| # | Estratégia | Impacto medido | Status |
|---|---|---|---|
| **A** | Yield UI entre chunks no hydrator (`await new Promise(r => setTimeout(r, 0))` antes de cada chunk no `populateMissingMarkerTextsForFile`) | UI percepção: ganho marginal (interação já funcionava antes). Custo: ~800ms adicional. Mantido como defensiva | ✅ FEITO 2026-05-08 (commit 611a99b) |
| **B** | `chunkSize=1000` → `chunkSize=10_000` (10× menos round-trips) + paralelizar queries por column dentro de `batchGetMarkerText` via `Promise.all` | **~30s → ~13s (2.3× mais rápido)** no pathological 200k markers × 5 cols, M1 8GB | ✅ FEITO 2026-05-08 (commit c3e6a10) |
| **E** | `style.height/paddingLeft` inline → classes + CSS vars (`.qc-explorer-code-self`, `.qc-explorer-list`, `.qc-vlist-row`) | Reduz cost individual do Recalculate Style | ✅ FEITO 2026-05-08 (commit f7f98d0) |

**Estado pós A+B+E:** ~13s no pathological 200k markers. UX aceitável pra cenário sintético extremo. Vault de user real precisaria ser pelo menos desse tamanho pra reclamar — sem repro real ainda. **Considerado fechado** — sem C/D pendentes (rejeitadas explicitamente: rebuild parcial conflita com "estado sempre fresh" e lazy-by-viewport reverte simplificações arquiteturais já tomadas).

**Localização do código:**
- `src/csv/markerPreviewHydrator.ts:144-192` — `runLazyBatch` + invocação do `populateMissingMarkerTextsForFile`
- `src/csv/csvCodingModel.ts:643-675` — `populateMissingMarkerTextsForFile` (loop de chunks com await sequencial)
- `src/csv/duckdb/duckdbRowProvider.ts:145-179` — `batchGetMarkerText` (1 query por column do batch)
- `src/core/baseCodeExplorerView.ts:215` — dispatch do `requestHydration` per-file no `buildCodeIndex`
- `src/core/baseCodeExplorerView.ts:328-450` — `renderTree` (rebuild full do DOM no `scheduleRefresh`)

### ~~Spec rev1 da feature tabular-virtual-cols~~ ✅ ARQUIVADA (2026-05-07)

Decisão: arquivar como histórico em vez de atualizar pra rev1. Spec moved pra `plugin-docs/archive/claude_sources/specs/20260506-tabular-virtual-cols-design.md` (workspace externo). CHANGELOG entry + commits + ARCHITECTURE.md viram source of truth pra referência arquitetural; spec preservada como snapshot do raciocínio pré-implementação.

### ~~Coding em modo lazy: Sidebar markerText preview~~ ✅ FEITO (2026-05-06)

Resolvido. `MarkerPreviewHydrator` (`src/csv/markerPreviewHydrator.ts`) — orchestrator stateful que popula `markerTextCache` em background quando consumers (Code Explorer, Code Detail, Smart Code list/detail, Memo View by-code) renderizam markers em parquet/CSV lazy não hidratados. Trigger per-file via `requestHydration(fileId)` idempotente (dedup `seen + inflight`). Re-render via `csvModel.notifyListenersOnly()` debounced (RAF). Status indicator `Hidratando previews… X/Y` no toolbar do Code Explorer. Cobertura: cold start de vault migrado (QDPX import), provider reuse com file aberto, single-source-of-truth pra OPFS lazy.

Spec: `docs/superpowers/specs/20260506-sidebar-markertext-preview-lazy-design.md`
Plan: `docs/superpowers/plans/2026-05-06-sidebar-markertext-preview-lazy.md`
Bugs encontrados na execução (todos fixados): inflight bookkeeping (eager path síncrono → orfão), OPFS race com prepopulate (createSyncAccessHandle conflict), virtualList timing (clientHeight=0 limitava mounted ao buffer default).

### ~~Filter de virtual columns (cod-frow / cod-seg / comment) em lazy mode~~ ✅ FEITO (2026-05-07)

Resolvido como parte da feature integrada **Tabular virtual cols — persist + filter + export**. `QualiaMarkersTable` per-file projeta markers em long format DuckDB temp table; `virtualFilterResolver` traduz `filterModel` AG Grid pra `__source_row IN (SELECT source_row FROM qualia_markers_<id> WHERE ...)`; `splitFilterModel` separa real cols de virtual cols antes do `combineClauses` em AND. Pré-resolve nome → code_id JS-side contra registry (mantém registry JS-only — rename/recolor não invalida temp). Sync via `BatchedMutationApplier` rAF-batched no canal `onMarkerMutation` SC3. Schema preparada pra LLM (status, created_by) sem features implementadas. Bonus que veio junto: persistência de visibility (toggle não suma cross-session) + storage layer pra comments (era dead UI) + export "Parquet enriquecido" reusando a mesma temp table. Spec: `docs/superpowers/specs/20260506-tabular-virtual-cols-design.md`.

Commits: `c9df6b5` (spec + spike) → `2e81735` (persist + comment storage) → `1ae883c` (temp table + sync) → `8ca70dc` (filter pipeline) → `33a91f3` (export parquet enriquecido).

### ~~Validação de 2 parquets pesados em paralelo~~ ✅ (2026-05-06, smoke manual)

Smoke validado pelo user: 2 parquets abertos lado a lado, scroll fluido, coding funciona em ambos. Memory/OPFS sem aperto perceptível em uso normal. Não documentamos número exato (não medimos worker memory) — registrar se aparecer regressão futura.

### ~~Pre-compute display_row mapping ao aplicar sort em lazy mode~~ ✅ (já estava ligado em Fase 4a/5)

Spike Premise B (§14.5.2 do design doc) mostrou p99 de 214ms em sorted scroll-to-row de 297MB. Resolvido — `csvCodingView.ts` liga `onSortChanged → refreshLazyDisplayMap` (drop+rebuild com `orderBy + whereClause`), `navigateToRow` consulta `displayRowFor()`, e `refreshLazyFilter` encadeia o rebuild. Verificado 2026-05-04.

### ~~Reveal de marker em parquet lazy não destaca a row~~ ✅ (2026-05-04, Fase 6 Slice A)

Resolvido. `navigateToRow` agora chama `ensureIndexVisible` + `ensureColumnVisible(column)` (faltava o horizontal — flash invisível em parquet largo) + polling 100ms × 50 tentativas em vez de single-shot `modelUpdated` (em v33 algumas transições scroll-settle/row-render não emitem) + RAF defer no flash (cell DOM precisa de paint cycle pós-data) + `flashDuration: 500` explícito (default 0 em alguns minor) + `infiniteInitialRowCount: totalRows` no createGrid (resolve AG Grid error #88 quando reveal chega antes do primeiro getRows).

### ~~Pre-populate cache no startup pra labels antes de file open~~ ✅ (2026-05-04, Fase 6 Slice A)

Resolvido. `src/csv/prepopulateMarkerCaches.ts` roda após `app.workspace.onLayoutReady`. Eager (< threshold): se algum marker tá sem cache, `parseTabularFile` + popular `markerTextCache` (sem reter `rowDataCache` — simétrico com lazy, só excerpts ~60 chars/marker em memória). Lazy (> threshold): só popula se `isOpfsCached(opfsKey, mtime)` true — nunca força download. Boot DuckDB on demand, `populateMissingMarkerTextsForFile`, dispose provider no finally. `setupLazyMode` também trocou `populateMarkerTextCacheForFile` → `populateMissingMarkerTextsForFile` pra virar no-op em re-open quando pre-populate já encheu o cache.

### ~~Label de marker em CSV/parquet mostra coordenada, não conteúdo~~ ✅ (2026-05-04, pre-populate fica pra Fase 6)

`CsvCodingModel.getMarkerLabel` agora prefere `getMarkerText(marker)` truncado a 60 chars, com fallback pra `Row X · Column` quando text não disponível. Em eager via `rowDataCache`, em lazy via `markerTextCache`. **Limitação atual:** ambos populam só on file open — pre-populate no startup ficou registrado acima como follow-up da Fase 6.

### ~~Carla label vazia (whitespace-only cell)~~ ✅ (2026-05-06)

Resolvido. Causa-raiz: 4 callsites usavam `if (text)` truthy-check, deixando string `"   "` (whitespace-only) passar como label visível. Não era papaparse — era o fallback chain. `previewText(s, maxLength)` em `markerResolvers.ts` centraliza a regra (trim + check empty + truncate), aplicado nos 4 branches do `getMarkerLabel` (PDF/CSV/markdown/markdown-via-editor) + no callback `smartCodeAccess.getMarkerLabel` em `main.ts`. Tests cobrindo whitespace-only em CSV/PDF/markdown.

### ~~"Missing DB manager" residual do DuckDB worker em alta concorrência~~ ✅ (2026-05-06)

Resolvido. `DuckDBRowProvider` ganhou lock interno: counter `inflight` incrementado a cada query via `trackedQuery()` privada; `dispose()` aguarda `inflight === 0` antes de DROP TABLE / dropFile. `disposed=true` bloqueia novas queries no momento que dispose começa, mas queries já em flight terminam normalmente. Test cobre o cenário: query pending + dispose concorrente → DROP TABLE só roda depois da query resolver.

### ~~Bundle size pós-DuckDB~~ ✅ (2026-05-04, Fase 6 Slice D)

Resolvido. `main.js` 49MB → 14.2MB (71% redução). esbuild plugin `duckdbWasmGzipPlugin` gzipa o WASM em build-time (32.7MB → 7.6MB com level 9). Runtime decompress lazy via `getWasmBytes()` em `wasmAssets.ts` (cached após primeira boot, custo ~10-30ms one-shot). Destrava Community Plugins.

---

## 🔒 Won't-fix (não reabrir)

Lista canônica de decisões registradas. Cada uma tem razão explícita pra não voltar a virar tarefa.

### §4 C6 — `marginPanelExtension.ts` 548 LOC sem refactor
Layout algorithm já foi extraído em `marginPanelLayout.ts` (puro, testável). O restante do arquivo grande não tem bug associado — refactor seria estética sem ganho de manutenibilidade. Reabrir só se aparecer bug específico.

### §8b CB3 — Search só por nome de código (não busca pasta)
`hierarchyHelpers.buildFlatTree` busca só nomes de códigos. **Decisão correta**: pastas são organizacionais (sem significado analítico, confirmado em CLAUDE.md). Usuário conhece suas pastas e navega direto; quando um código casa, a pasta que o contém já é auto-revelada e expandida. Buscar por nome de pasta resolveria problema inexistente.

### §10b — Magnitude popover sem empty state
Seção de magnitude some inteiramente quando nenhum código aplicado tem magnitude configurada. **Decisão UX intencional** — não exibir mensagem é mais limpo que poluir o popover com placeholder.

### §11 E3 — Markers CSV não exportáveis via REFI-QDA
Limitação do **formato REFI-QDA**, não do plugin: o spec não comporta segmentos de célula tabular. Documentado no disclaimer do modal de export. Workaround pro usuário: usar Tabular CSV zip (#19) que cobre o caso analítico.

### §11 E5 — HEIC / TIFF / HEIF não suportados
Electron não decodifica esses formatos nativamente. **Tentativas rejeitadas:**
- `heic2any`/libheif em runtime — intercept falho + artefatos de decode + memory leak do WASM + 1.3MB de bundle
- Command one-shot de conversão — quebra o fluxo natural "abre e codifica"

**Workaround pro usuário:** converter externamente (Preview do macOS → Export As PNG) antes de trazer pro vault.

**Reabrir se:** aparecer demanda consistente em produção. Avaliar decoder via worker thread separado.

### §15 — Case Variables multi-popover racing
Arquitetura atual só permite um popover por vez (single `activePopoverClose` field). Race condition entre dois popovers simultâneos não é problema porque é arquiteturalmente impossível hoje. Revisar **só se** um dia decidir suportar multi-popover.

### §17 — Memo View virtual scroll
Suspeita inicial: >500 marker memos visíveis trava scroll por peso de DOM. **Morto em 2026-04-27** pelo click-to-edit refactor (commit `18676b4`): cada memo agora é `<p>` simples e só vira `<textarea>` quando clicado. Validação empírica em corpus de 50 codes + 527 markers + ~500 memos: fluido em by-file e by-code com `markerLimit="all"`. Corpus preservado via `scripts/seed-memo-corpus.mjs` se precisar re-medir.

---

## ⚓ Permanente (ineliminável)

| Item | Razão |
|------|-------|
| 6 `as any` (3 PDF internal + 3 deepMerge) | APIs externas sem tipos |
| 3 `@ts-ignore` (wavesurfer) | Module resolution |
| !important 66 instâncias | Maioria AG Grid defensivos |
| Inline styles ~15 estáticos | Migrar quando tocar nos arquivos |
| fflate bundled (~8KB gzip) | Dependência do QDPX export — sem alternativa nativa no Obsidian |

---

## 📚 Registro de débitos resolvidos

Resumo cronológico das dívidas técnicas eliminadas. Detalhes longos foram condensados — git log + commits têm a história completa.

### 2026-04 (sprint de hardening)

- **§14 Analytics engine codeId vs name** (2026-04-21, commits `1422bb7` + `cf09894`) — `extractCodes` retornava codeId mas consumidores indexavam por nome após Phase C. Fix: `UnifiedCode.id` obrigatório, `consolidateCodes` indexa por id, normalização canônica `normalizeCodeApplications` no load de cada model. Workbench vault: 241/241 canônico
- **§11.1 QDPX round-trip integrity** (2026-04-21) — 4 bugs críticos: GUID mismatch Codebook↔CodeRef, frontmatter duplicado, `vault.create` não persistindo, models sem sync pós-import. `qdcExporter.buildCodebookXml` aceita `ensureCodeGuid`, importer usa `vault.adapter.write` direto, `reloadAfterImport()` no plugin sincroniza models
- **§16 Audio/Video scroll persistence** (2026-04-22) — save retornava 0 (WaveSurfer reseta antes do unload) + restore sobrescrito por autoCenter. Fix: mirror `lastKnownScroll` via listener + `setAutoCenter(false)` durante restore
- **§13 ImageView/AudioView/VideoView → FileView** (2026-04-22) — lifecycle limpo via `onLoadFile`/`onUnloadFile`. `registerFileIntercept` mantido (core-native ext rejeitam `registerExtensions`). MediaViewCore.currentFile parallel field eliminado
- **§15 Case Variables edge cases** (2026-04-22) — emoji/unicode (já funcionava, teste empírico add), valor vazio (Notice + reject), hot-reload com popover (`activePopoverClose` no onunload), multi-pane sync via metadataCache
- **§12 Codebook Panel polish K1-K3** (2026-04-22/23) — K1 autoReveal removido (órfão), K2 drag-drop visual completo (ghost + drop indicator flutuante + `is-just-dropped` pulse + `is-drop-rejected` shake), K3 virtual scroll com row recycling (`Map<nodeIndex, HTMLElement>`)
- **§8b CB1-CB4** (2026-04-22) — `ExpandedState { codes; folders }` unificado, threshold 5 pra "Move to folder..." submenu, `core/dialogs.ts` substitui `prompt`/`confirm` nativos
- **§8c E1-E3** (2026-04-22) — drag de nós no Relations Network (`mousedown`/`mouseup` + `redraw()` extraído), `AbstractInputSuggest` substitui `<datalist>`, inline add-row de Relations migrado pra `TextComponent`/`ExtraButtonComponent`
- **§11 PDF round-trip** (2026-04-23/24) — `pdfPlainText.buildPlainText` consolida via pdfjs, `resolveMarkerOffsets` com fallback whitespace-normalize, `loadPdfExportData` extrai dims reais, `ensurePdfJsLoaded` força carga em vault novo, rename `NormalizedShapeCoords` → `PercentShapeCoords`
- **§10 Toggle Media Coding** (2026-04-23) — 4 mídias com `autoOpen`/`showButton` simétricos, `pinnedFileByLeaf` no fileInterceptor pra respeitar swap manual, PDF usa instrument/deinstrument in-place, higiene cosmética (file-menu rename, showButton live, detach actions no onunload)

### 2026-03 (consolidação técnica)

- **§3 Multi-pane / state isolation** (2026-03-20) — PdfViewState (WeakMap per-view), keyboard scoped ao contentEl, hoveredMarkerIds em todos os models. M1/M2/M3 fechados em conjunto
- **§8 Core/Registry R1** (2026-03-20) — `fromJSON` corrigido (def.id = id garante consistência)
- **Incremental refresh/cache por engine** (2026-03-20) — `ConsolidationCache` (analytics dirty flags) + UnifiedModelAdapter cache + debounce rAF via `scheduleRefresh`
- **Board snapshot vs live-linked** (2026-03-20) — "Refresh on open" via `boardReconciler.ts`. Reconcilia cores/nomes/contagens, marca órfãos, remove arrows inválidas
- **§1 PDF lifecycle P1-P9** (2026-03) — timeouts em Map cancelados em stop, hover/popover state per-view, removeMarker chama notify, keyboard handler filtra contenteditable
- **§2 Image engine I1-I5** (2026-03) — origStrokeWidth em WeakMap per-shape, refreshAll após zoom/pan, keyboard scoped ao contentEl, mouseup condition simplificada
- **§4 Markdown CM6 C1-C5** (2026-03) — z-index normalizado (handles 1000, popover 2000), scrollDOM position salvo/restaurado, ch clampado, batch save, isPositionBefore strict
- **§5 CSV V1-V2** (2026-03) — `node.sourceRowIndex` em vez de `node.rowIndex` (estável após sort), `btn.dataset.wrapped` setado na criação e no toggle
- **§6 Analytics A1-A6** (2026-03) — dead code dendrogramMode removido, Chart.js destroy antes de recriar, PapaParse no textExtractor (multiline/quotes/CRLF), skip .parquet em extractBatch, sort por Cramér's V antes de slice
- **§7 Sidebar S1-S6** (2026-03) — navigateToSegment dispara eventos por engine (csv/image/pdf#page/audio/video), decisionTree filtra por markerIds com erro, searchTimeout cancelado no onClose

### Permanência arquitetônica

- **Escala z-index Markdown** (§4 C1): content `auto`, margin panel 1, resize handle 100, drag handles 1000, popover 2000
- **`registerFileIntercept` mandatory** pros 4 engines de mídia: Obsidian rejeita `registerExtensions` em core-native (mp3/mp4/png) com `Error: Attempting to register an existing file extension`

---

## Como usar este arquivo

- **Abrir item novo:** criar entrada acima do registro (won't-fix com razão, ou aberto com severidade + arquivo + problema)
- **Resolver item:** mover pro registro como one-liner com data + raiz
- **Item de polish curto sem guarda-chuva:** adicionar na seção "🪶 Polish curto" deste arquivo. Se passar de "curto" pra "refactor grande" (>4h), abrir plan dedicado
