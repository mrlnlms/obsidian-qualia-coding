# Changelog

All notable changes to Qualia Coding will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Sidebar markerText preview pra arquivos lazy** — `MarkerPreviewHydrator` (`src/csv/markerPreviewHydrator.ts`), orchestrator stateful que popula `markerTextCache` em background quando consumers (Code Explorer, Code Detail, Smart Code list/detail, Memo View by-code) renderizam markers em parquet/CSV lazy não hidratados. Trigger per-file via `requestHydration(fileId)` idempotente (dedup `seen + inflight`). Re-render via `csvModel.notifyListenersOnly()` debounced via RAF. Status indicator `Hidratando previews… X/Y` no toolbar do Code Explorer. Cobre cold start de vault migrado (QDPX import). Provider reuse com file aberto (sem download/CREATE TABLE duplicados). Spec: `docs/superpowers/specs/20260506-sidebar-markertext-preview-lazy-design.md`.

### Fixed

- **VirtualList timing** (`virtualList.ts`) — `setItems` chamado síncrono pós-criação retornava `clientHeight=0` (browser ainda não recalculou layout), limitando rows mounted ao buffer default. Fix: `requestAnimationFrame` defer adicional pra renderVisibleRows após paint cycle. Bug latente exposto após `prepopulateMarkerCaches` deixar de ser caminho de re-render (race fix lazy/hydrator).
- **OPFS race prepopulate vs hydrator** — `prepopulateMarkerCaches` lazy path criava `DuckDBRowProvider` paralelo ao hydrator → erro `createSyncAccessHandle` ("Access Handles cannot be created if there is another open Access Handle"). Lazy path removido do prepopulate; hydrator é única autoridade pra OPFS lazy.
- **Hydrator inflight bookkeeping** — wrapper IIFE garante `inflight.set` antes de runBatch + `inflight.delete` no finally do wrapper. Eager path (síncrono, sem await) deletava do inflight antes do set acontecer → fileId ficava órfão (causa do "Hidratando 2/3" travado).


- **Label whitespace-only** (`previewText` helper) — 4 callsites de `getMarkerLabel` (PDF/CSV/markdown/markdown-via-editor) faziam `if (text)` truthy-check, deixando string `"   "` passar como label visível em vez de cair no fallback (`Page N` / `Row X · column` / `Line N`). Idem em `smartCodeAccess.getMarkerLabel` (`main.ts`). Centralizado em `previewText(s, maxLength): string | null` em `markerResolvers.ts` — trim + check empty + truncate. Repro registrado como "Carla label vazia" no `BACKLOG.md`.

- **DuckDBRowProvider drain on dispose** — `dispose()` agora aguarda queries em flight terminarem antes de `DROP TABLE` / `dropFile`. Counter `inflight` incrementado por `trackedQuery()` privada (todas as 9 queries do provider passam por ela); `disposed=true` bloqueia novas via `guard()` no momento que dispose começa. Resolve "Missing DB manager" residual no console quando teardown corria concorrente com query pending.

- **Polígono image reposicionado ao close+reopen** — `RegionManager.shapeToNormalizedCoords` aplicava `calcTransformMatrix()` em `points` sem subtrair `pathOffset`, resultando em coords salvas deslocadas pelo centro do bbox dos pontos. Reload re-criava polygon nas coords erradas → polygon aparecia no canto inferior-direito da imagem. Fórmula correta extraída pra helper puro `polygonPointsToWorld(points, pathOffset, matrix)` em `regionManager.ts`. Tests cobrindo identity / scale / rotation / regression. **Polygons já salvos no `data.json` antes do fix continuam com offset errado até serem editados/movidos** — sem migração (zero usuários).

### Removed

- **PDF undo stack** — feature `Undo last PDF coding action` (Cmd+Z, command `undo-pdf-coding`) removida. Era a única engine com undo (markdown/image/csv/media nunca tiveram), mantinha inconsistência cross-engine e o keybinding nunca foi wired no `PdfCodingView`. Saiu: `PdfCodingModel.undo()`, `pushUndo()`, `reconcileCodes()`, `undoStack`, `suppressUndo` (dead code), interface `UndoEntry`, const `MAX_UNDO`, command `undo-pdf-coding`, 13 testes, seção `TECHNICAL-PATTERNS.md §4.8`.

## [0.3.0] — 2026-05-05 — Pre-alpha

Smart Codes Tier 3: capability nova de "saved queries" sobre o codebook. Schema próprio (PredicateNode AST com 10 leaves + nesting AND/OR/NOT), evaluator puro com short-circuit + cycle detection, cache com invalidação granular, modal hub + builder com preview live, command palette, integração ponta-a-ponta com 6 modes do Analytics, Code Explorer, audit log com entity discriminator, QDPX/CSV round-trip e granular MarkerMutation cross-engine. Stress: 10k markers + 100 smart codes em <1s.

### Added

- **Smart Codes Tier 3 — saved queries (Phase 1)** — predicate AST com 10 leaves (`hasCode`, `caseVarEquals`, `caseVarRange`, `magnitudeGte/Lte`, `inFolder`, `inGroup`, `engineType`, `relationExists`, `smartCode` nesting) combinados via AND/OR/NOT. Evaluator puro em `src/core/smartCodes/evaluator.ts` (short-circuit + cycle detection). Builder modal row-based com preview live <300ms. Smart Code Detail + List hub. Command palette (`Smart Codes: Open hub` + `Smart Codes: New`). Stress validado: 10k markers + 100 SCs em <1s.

- **Smart Codes em Analytics (Phase 2 — SC1)** — frequency / cooccurrence / evolution+temporal / codeMetadata / lagSequential+polar / memoView ganham SC entries via helper `getSmartCodeViews`. Filter UI tem chips ⚡ no topo da codes section, integrados ao `enabledCodes`/`excludeCodes`. SC entries no Frequency mode aceitam drag + Add to Board (paridade com codes regulares).

- **Smart Codes no Code Explorer (Phase 2 — SC2)** — grupo "⚡ Smart Codes" top-level no tree do Code Explorer com estrutura SC → file → matches. Click em match navega cross-engine via `navigateToMarker`. Subscribe a cache + registry mutations. Search filter aplica a SC names também.

- **Granular MarkerMutation event (Phase 2 — SC3)** — canal `onMarkerMutation` paralelo a `onChange` em todos 5 engine models (markdown/pdf/image/csv/media). Cada mutation site (addCode, removeCode, removeMarker, updateMarker, createShape, deleteShape, addCodeToShape, removeCodeFromShape, addCodeToManyRows, removeCodeFromManyRows, removeAllRowMarkersFromMany, migrateFilePath, undo) emite `MarkerMutationEvent` com codeIds afetados. Cache `applyMarkerMutation(event)` atualiza `markerByRef` incremental + invalida só SCs dependentes via `dependencyExtractor`. Dead code removed (`indexByCode`/`indexByFile`, ~50 LOC).

- **Smart Code detail inline na sidebar (Phase 2 — SC4)** — `smartCodesSection` wirado no Code Detail (modo "All Codes") em vez do Code Explorer. Click numa SC abre detail INLINE no sidebar. Modal hub via Cmd+P continua como atalho. Visual consistente com code detail (`codemarker-detail-*` classes, back button compartilhado). Auto-refresh via `cache.subscribe` + `registry.addOnMutate` + `model.onChange`.

- **Convert to note pra SC memo** — `EntityRef` expansão completa cobrindo Smart Code memo materialization (mesmo pattern do Code/Group/Marker/Relation).

- **QDPX export/import** — bloco `<qualia:SmartCodes>` em namespace custom `xmlns:qualia="urn:qualia-coding:extensions:1.0"`. Import 2-pass (alocar IDs → resolver refs incluindo `smartCode` nesting). Round-trip preservado.

- **CSV tabular `smart_codes.csv`** — coluna `predicate_json` no zip do tabular export. README ganhou snippets R/Python pra reconstruir SCs em external analysis.

- **Audit log Smart Codes** — entity discriminator `entity?: 'code' | 'smartCode'` + 5 `sc_*` event types (`sc_created`, `sc_renamed`, `sc_predicate_edited`, `sc_text_edited`, `sc_deleted`). Coalescing 60s pra text edits + Set union pra predicate edits. ⚡ icon na Codebook Timeline pra eventos de Smart Code.

### Changed

- **Clear All Markers limpa SC definitions** — SCs órfãos sem regulars pra referenciar ficam quebrados; limpeza agora é completa.

- **Eye icon hide/show removido das SC rows** (Code Detail + Hub modal) — UX redundante com filter chip do Analytics; SC não tem visibility per-doc.

- **`SmartCodeApi` virou `SmartCodeRegistry` classe** com cache incremental + `addOnMutate(fn)` — mesmo pattern de `CodeDefinitionRegistry`.

- **`autoRewriteOnMerge` + `diffPredicateLeaves`** — predicates apontando pra códigos consolidados após merge são re-escritos automaticamente.

### Fixed

- **PDF undo + clearAll race + ref identity fallback (`df9ecaa`)** — undo no PDF model emite `MarkerMutation`; `getMarkerByRef` ganha fallback via composite key (caller que guardou ref antes de REMOVE+ADD em rename/undo ainda resolve marker atual).

- **CSV bulk + vault rename (`0c47529`)** — bulk row coding (`addCodeToManyRows` etc) e vault rename emitem `MarkerMutation` correto pra invalidação cirúrgica.

- **Cascade invalidation (`82c3cd8`)** — `invalidateForCode/CaseVar/Folder/Group` agora usam `invalidate()` (recursa via smartCode leaf) em vez de `markDirty()` (que não cascateava).

- **SC pass respeita filter (`bfa6164`)** — `codes`/`excludeCodes` filter aplica corretamente em SC views (interpretation B: filter exclui SC se algum code dependente foi excluído).

- **Memo View renderiza SC sections (`638ae6e`)** quando só SC tem memo — sections SC prepended em `byCode`.

- **`instanceof` check (`c035327`)** antes de `showList`/`showCodeDetail`/`setContext` em `leaf.view` — proteção em workspace restore quando view ainda não montou.

- **Search filter no Code Detail (list mode) (`b7a21f2`)** também filtra SCs (paridade com codebook search).

- **Hidratação de data.json antigo (`6df0c77`)** — `registry.smartCodes` / `smartCodeOrder` / `nextSmartCodePaletteIndex` populados em vault que não tem essas keys.

### Technical

- 7 módulos novos em `src/core/smartCodes/`: `index` (entry), `serializer`, `dependencyExtractor`, `normalizer`, `evaluator`, `validator`, `builderTreeOps`. Mais `cache.ts`, `matcher.ts`, `smartCodeRegistry.ts` no nível core.
- `SmartCodeCache` singleton com chunked compute pra cache miss grande (100+ markers por chunk).
- Stress fixture + perf gates em CI (2x headroom, referential identity, granular invalidation).
- 63 commits desde 0.2.0 (Phase 1 branch `feat/smart-codes` + Phase 2 inline em main).
- Tags `pre-smart-codes-baseline` (82cb949) ↔ `post-smart-codes-checkpoint` (4022808) pra rollback granular.
- Tests: 2603 → 2759 verde (+156 cobrindo predicate evaluator + cache + audit + UI helpers + QDPX round-trip).

### Known issues

- **Cmd+Z não desfaz coding em PDF** — keybinding não wired no `PdfCodingView` (bug pré-existente, não regressão SC3). Fix de undo SC3 (`df9ecaa`) está unit-testado mas integração UI bloqueada por isso. Issue documentado no `BACKLOG.md`.

## [0.2.0] — 2026-05-04 — Pre-alpha

Fechamento da Fase 6 do parquet/CSV lazy loading: capability shift de "abre arquivos pequenos" pra "abre parquet de 297MB sem travar". Bundle 49MB → 14.2MB destrava distribuição via Community Plugins. QDPX export+import round-trip pra CSV/parquet via custom namespace (Decisão 5 do design doc).

### Added

- **Open de parquet/CSV grande sem popup (Fase 6 Slice A)** — popup `Lazy / Eager / Cancel` removido; lazy mode automático acima do threshold (50 MB parquet / 100 MB CSV). Placeholder de workspace-restore tem botão único "Open this file" (anti-race com plugin init de 49 MB). Reveal de marker em parquet lazy redondo: `ensureColumnVisible(column)` (faltava — flash invisível em parquet largo) + polling 100 ms × 50 tentativas (em AG Grid v33+ algumas transições de scroll-settle/row-render não emitem `modelUpdated`) + RAF defer no flash + `flashDuration: 500` explícito (default vira 0 em alguns minor) + `infiniteInitialRowCount: totalRows` no createGrid (resolve error #88 quando reveal chega antes do primeiro getRows). Pre-populate de `markerTextCache` no startup (`src/csv/prepopulateMarkerCaches.ts`): eager parses + cellText slice; lazy só popula se OPFS já cacheado (não força download). Novos módulos: `parseTabular.ts` (compartilhado), `prepopulateMarkerCaches.ts`. DuckDB CSV reader tolerante (`all_varchar=true` + `null_padding=true` + `ignore_errors=true`) — sobrevive a CSVs malformados, type inference quebrada, rows com colunas extras.

- **Exports lazy-aware (Fase 6 Slice B)** — tabular CSV export e QDPX agora resolvem cell text de markers em parquet/CSV lazy sem re-parsear o arquivo inteiro em RAM. Novo `src/csv/resolveExportTexts.ts` cobre 6 cases (eager/lazy × aberto/fechado/pre-populated/OPFS-cached): `csvModel.getMarkerText` sync first; cache miss → `parseTabularFile` (suporta parquet via hyparquet); arquivo > threshold → DuckDB batch via OPFS, dispose provider no finally. **Antes do fix:** parquet ia com texto vazio silenciosamente (`Papa.parse` só sabe CSV); arquivo grande estourava RAM 5-18× via `vault.read()` + `Papa.parse()` inteiro. **QDPX `<Sources>` agora inclui CSV/parquet** via custom namespace `<qualia:TabularSource>` + `<qualia:CellSelection>` (Decisão 5 do parquet-lazy-design.md). `xmlns:qualia` declarado no Project root quando section usa o prefixo. ExportModal recebe `plugin` (não só `app`) pra ter `csvModel + getDuckDB`.

- **Progress bar com ETA + UI Manage cache (Fase 6 Slice C)** — banner do OPFS copy mostra `45% — 134.5 / 297.0 MB · ETA 8s` em vez de só percentual + MB. ETA computada da throughput observada (`written / elapsedMs`); suprimida nos primeiros 250 ms (estimativa ruidosa) e em 100% (nada restante). Helpers puros `formatLazyProgress` + `formatDuration` em `src/csv/lazyProgressFormat.ts` (12 test cases). Settings UI nova "Lazy cache (large CSV/parquet)" lista entries OPFS via `listOpfsEntries` (helper novo: itera namespace, lê `meta.json`, soma file size). Cada entry tem botão `Clear` per-entry (`removeOPFSFile`); botão `Clear all` warning chama `clearOPFSCache`.

- **Auto-cleanup OPFS no fechamento de arquivo** — quando user fecha leaf de um arquivo lazy, o OPFS daquele arquivo é wipado automaticamente. Disco fica previsível, sem cache invisível crescendo. Refcount via `workspace.getLeavesOfType` — se outro leaf ainda tem mesmo file, mantém; só wipa quando é a última leaf. `clearWasmBytesCache()` no `plugin.onunload` libera o ~34 MB do gunzip cache que ficava em module scope entre hot-reloads.

- **QDPX import round-trip pra CSV/parquet (Fase 6 Slice E)** — `qdpxImporter.parseSources` reconhece `<qualia:TabularSource>` (custom namespace introduzido no Slice B). `parseSelection` lê `qualia:sourceRowId/column/from/to`. Novo `createTabularMarker` reconstrói `SegmentMarker` (com from/to) ou `RowMarker` (sem) no csvModel. `reloadAfterImport` já chama `csvModel.reload()`. Round-trip QDPX validado em integration test (export → unzip → parseXml → parseSources → asserts).

- **Filter UI server-side em modo lazy (Parquet-lazy Fase 5)** — funnel icon do AG Grid agora aparece nas colunas reais em modo lazy. Filter UI nativo (Contains/Equals/StartsWith/EndsWith/inRange/Blank/etc) emite `filterModel`, traduzido pra SQL `WHERE` no DuckDB. Filter + sort + scroll mantêm display_row mapping coerente (rebuild em cada mudança). Batch coding em lazy (tag button no header) opera nas linhas filtradas via SQL `SELECT __source_row WHERE ...`. Novo módulo:
  - `src/csv/duckdb/filterModelToSql.ts` — `buildWhereClause(filterModel)` traduz AG Grid filter (text + number + combined AND/OR) pra SQL fragment escapado. Helper puro.
  - `DuckDBRowProvider`: extensions em `getRowCount(whereClause?)`, `getRowsByDisplayRange({whereClause})`, `buildDisplayMap(orderBy, whereClause?)`, novo `getFilteredSourceRowIds(whereClause?)`.
  - `LazyState.currentFilter` cacheia `whereClause` + `filteredCount`. `onFilterChanged` faz update SÍNCRONO de `whereClause` (AG Grid re-fetcha imediatamente, sem race) + async `filteredCount` + rebuild `displayMap`.
  - Tests: 19 cases em `tests/csv/duckdb/filterModelToSql.test.ts` (escape de aspas, LIKE meta-chars, ident escape, ranges, combined, multi-coluna).

- **Bulk row marker operations (perf)** — `CsvCodingModel.addCodeToManyRows` / `removeCodeFromManyRows` / `removeAllRowMarkersFromMany`. Single-pass index build (O(M)) + iterate sourceRowIds (O(R)) + ÚNICO `notify()` ao final. Reduz batch coding em 661k rows de minutos pra ~1-3s. `getCodeIntersectionForRows` calcula codes presentes em todas as rows visíveis em O(M+R) com early-exit (substitui o O(K×R×M) anterior; skipped acima de 5000 rows porque a interseção é praticamente sempre vazia em datasets enormes).

- **Deferred load placeholder (UX)** — durante restauração de workspace, arquivos > threshold mostram placeholder inerte "Click to open this file" em vez de auto-disparar o banner Lazy/Eager/Cancel. Heurística: `app.workspace.layoutReady === false` indica restore. Resolve "Obsidian travado eternamente" ao reabrir vault com parquet pesado na leaf.

- **DuckDB-Wasm bootstrap (Parquet-lazy Fase 2)** — runtime DuckDB-Wasm carregando dentro do plugin real (Electron Obsidian Worker). Infraestrutura compartilhada, ainda sem consumer (Fase 4 vai plugar `RowProvider` real). Inclui:
  - `src/csv/duckdb/duckdbBootstrap.ts` — `createDuckDBRuntime()` factory com 2 shims obrigatórios (validados no spike): `process` fake (derrota detecção falsa de Node pelo js-sha256 transitivo) + nuke de `WebAssembly.instantiateStreaming` (força fallback XHR; Worker do Electron não tem `Request`/`fetch`).
  - `src/csv/duckdb/rowProvider.ts` — interface `RowProvider` + `MockRowProvider` in-memory (impl real DuckDB-backed entra na Fase 4).
  - `QualiaCodingPlugin.getDuckDB()` — lazy init no plugin principal; `onunload` chama `dispose()` (worker.terminate + revoga Blob URLs).
  - Comando dev `DuckDB hello query (dev smoke)` — confirma bootstrap rodando no plugin real.
  - esbuild config: `loader: { '.wasm': 'binary' }` + plugin custom inline do worker source.
  - `@duckdb/duckdb-wasm@^1.29.0` adicionada como dependency.

### Changed

- **`onLoadFile` da `CsvCodingView` agora é não-bloqueante** — extraí o eager path em `loadEagerPath(file)`. Quando o banner Lazy/Eager/Cancel aparece, `onLoadFile` retorna IMEDIATAMENTE; os botões disparam o próximo passo via `.then()`. Antes, `await this.confirmLoadLargeFile(...)` prendia o `loadFile` interno do Obsidian — workspace inteiro paralisava (até markdown não abria) até o user clicar em algum botão. Cada callback faz `if (this.file !== file) return` pra desistir se o user trocou de arquivo.

- **CSV schema (Parquet-lazy Fase 0)**: `CsvMarker.row` (índice posicional do papaparse) → `CsvMarker.sourceRowId` (identidade estável). Refactor interno preparando o schema pras Fases 1-6 do parquet/CSV lazy loading e pra LLM coding em tabular (anchoring estável após sort/filter). Em modo eager (atual), `sourceRowId === papaparse row index` — comportamento e UX 100% inalterados. Nomes externos preservados (coluna `row` no CSV de export, `meta.row` do consolidator de analytics, payload do evento `qualia-csv:navigate`) pra evitar ripple effect downstream.

### Migration

- One-shot: `node scripts/migrate-fase-0-source-row-id.mjs` no vault workbench. Backup automático em `data.json.pre-fase-0.bak`. Idempotente. Reverso disponível em `scripts/revert-fase-0-source-row-id.mjs`. Vault workbench migrado em 2026-05-03 (2 segment markers existentes preservados; smoke test com novo marker confirmou persistência no schema novo).

### Fixed

- **Cleanup race entre `onUnloadFile` e queries DuckDB em flight** — `onUnloadFile` agora snapshot do `lazyState` e seta `null` ANTES da teardown async. Concurrent paths (`refreshLazyDisplayMap`, `refreshLazyFilter`, datasource em flight) re-checam após cada await e abortam se `lazyState` virou null. Resolveu o crash "DuckDBRowProvider has been disposed" no `dropDisplayMap` durante teardown.

### Performance

- **Bundle 49 MB → 14.2 MB (-71%) via WASM gzip (Fase 6 Slice D)** — esbuild plugin `duckdbWasmGzipPlugin` gzipa o `duckdb-eh.wasm` em build-time via fflate level 9 (32.7 MB raw → 7.6 MB gz). Runtime: `wasmAssets.ts` ganha `getWasmBytes()` que decomprime lazy + cached via `gunzipSync(fflate)`. Custo one-shot ~10-30 ms na primeira boot do DuckDB. `clearWasmBytesCache()` libera o ~34 MB Uint8Array em onunload pra survivor module scope não segurar memória entre reloads. Destrava distribuição via Community Plugins.

### Technical

- Spike findings (2026-05-03) validaram empiricamente as 3 premissas críticas do design (`ROW_NUMBER()` stability em parquet patológico MERGED de 297MB, sourceRowId latency p95 ≤ 125ms em 2.4M rows, OPFS streaming com heap Δ = 0 MB). 2 shims obrigatórios pro Worker em Electron Obsidian descobertos (process fake + nuke `WebAssembly.instantiateStreaming`) — entram na Fase 2 (DuckDB bootstrap) sem precedente público.
- Spec: `plugin-docs/archive/claude_sources/specs/20260503-parquet-lazy-fase-0-design.md` (workspace externo). Design doc completo em `docs/parquet-lazy-design.md` (versionado a partir desta release como referência arquitetural pra LLM/Whisper futuros).
- 6 commits de Slices da Fase 6 (`5617773` A, `4260591` B, `8017027` B-test, `1aa39fa` C, `9ddb71a` D, `c292700` E) + ajustes finais (`1327d70` clearWasmBytes, `e2fa9e3` auto-cleanup OPFS).
- Tags `pre-fase6-baseline` (4885d3e) / `post-fase6-checkpoint` pra rollback granular se necessário.
- Vitest plugin `stubDuckDBAssets` em `vitest.config.ts` intercepta `.wasm`/`.worker.js` imports — qualquer test que toque transitivamente o stack DuckDB funciona sem mock manual por arquivo.
- Tests: 2490 → 2603 verdes (+113 cobrindo Fase 6 — integration tests do export lazy-aware com fixture parquet real, formatLazyProgress, round-trip QDPX, etc).

## [0.1.2] — 2026-04-30 — Pre-alpha

### Added

- **Materialize all memos batch** (#37) — command palette `Materialize all memos` abre modal pra materializar todos memos do plugin de uma vez. Toggles por kind (5: Code, Group, Marker, Relation code-level, Relation segment-level), `Include empty memos`, `Overwrite existing notes`. Preview live com 4 buckets (a criar / a sobrescrever / já materializadas / vazias puladas). Botão dinâmico ("Materialize N", "Overwrite N", disabled em 0). Progress bar in-modal com status do item atual + counter X/Y. Resultados in-modal com ✓/↻/✗ e details expansíveis pra erros. Erros individuais não param o batch.

### Changed

- `convertMemoToNote(plugin, ref, opts?)` aceita `{ openInTab?: boolean }` (default true; batch passa false pra não abrir N abas).

### Fixed

- Field `selection` em `MaterializeAllMemosModal` colidia com prototype de `Modal`/`Component` do Obsidian — atribuição no constructor era sobrescrita antes do `onOpen` rodar. Renomeado pra `batchOptions`. Gotcha documentado em `TECHNICAL-PATTERNS.md §30`.

### Technical

- 2 arquivos novos em `src/core/`: `memoBatchMaterializer.ts` (`collectAllMemoRefs` + `categorize` 4 buckets + `materializeBatch` com `onProgress`), `materializeAllMemosModal.ts` (modal 3 estados: form / progress / results).
- `refreshMemoNote(plugin, ref)` novo em `memoMaterializer.ts` pra overwrite (vault.modify do .md existente).
- Tests: 2479 verde (mesmo total — sem testes novos pra batch helper, validação manual em vault real).

## [0.1.1] — 2026-04-30 — Pre-alpha

### Added

- **Convert memo to note (Phase 1 + Phase 2 completa)** — todos os 4 tipos de memo do plugin podem agora ser materializados como arquivos `.md` no vault, com sync bidirecional via vault listeners. Destrava ferramental Obsidian (backlinks, graph view, Templater) sobre memos analíticos.
  - **Code memo** (#33): textarea inline na seção Memo do Code Detail vira card `📄 Materialized at <path>` com Open / Unmaterialize. Filename = `<codeName>.md`.
  - **Group memo** (#34): block do memo no Group panel (codebook) ganha botão "Convert to note". Filename = `<groupName>.md`.
  - **Marker (segment) memo** (#35): no Marker focused detail. Filename híbrido por engine — texto: `<file>-<excerpt>`; pdf-shape/image: `<file>-<shape>-<id>`; audio/video: `<file>-<timecode>`.
  - **Relation memo** (#36): nova **Relation Detail view** drill-down. Code-level e app-level com banner contextual. Code-level mostra Evidence list (markers que aplicam). Click no chip do target navega pro code; click no resto da row → Detail. Filename code-level: `<source>-<label>-<target>`; app-level: `<file>-<source>-<label>-<target>-<id>`.
- **Settings**: bloco "Memo materialization" com 4 paths configuráveis (todos ativos).
- **Smart Open** (`openMaterializedFile` em `main.ts`): reusa leaf existente se arquivo já aberto em vez de sempre criar nova aba.

### Changed

- **Schema breaking** — `memo?: string` virou `memo?: MemoRecord = { content, materialized? }` em `CodeDefinition`, `GroupDefinition`, `BaseMarker`, `CodeRelation`. Migração automática `migrateLegacyMemos` no `DataManager.load` (idempotente). Helpers `getMemoContent` / `setMemoContent` centralizam acesso.
- **PromptModal de relation memo aposentado** em favor da Relation Detail view (com Convert/card).
- Botão ✎ inline na row de relation virou **badge** indicando estado do memo (✏ inline / 📄 materializado).
- API `MemoMaterializerAccess` genérica via `EntityRef` (5-way union: code, group, marker, relation-code, relation-app).

### Fixed

- Card materializado de marker não atualizava ao Convert em engines pdf/image/csv/media — `notifyMarkerOwner` chama `notify()` do model dono pra invalidar cache do `UnifiedModelAdapter`.
- Unmaterialize de marker preservava `materialized` indevidamente (regressão de `setMemoContent` que mantinha materialized do estado atual).

### Technical

- `EntityRef` discriminated union 5-way em `memoTypes.ts` — extensível.
- Self-write tracker `Set<path>` + `queueMicrotask` cleanup pra prevenir loop em vault listeners (pattern documentado em `TECHNICAL-PATTERNS.md §29`).
- Reverse-lookup `Map<path, EntityRef>` reconstruído no `onload` varrendo registry + 6 collections de markers + relations (code-level e app-level).
- 9 arquivos novos em `src/core/`: `memoTypes`, `memoHelpers`, `memoNoteFormat`, `memoPathResolver`, `memoMigration`, `memoMaterializer`, `memoMaterializerListeners`, `memoMarkerNaming`, `detailRelationRenderer`.
- Migração do schema afetou ~30 pontos de toque mecânico (read sites via `getMemoContent`, write sites via `setMemoContent`).
- Tests: 2438 → 2479 verde (21 novos: helpers puros + migration + naming).

## [0.1.0] — 2026-04-29 — Pre-alpha

First public release. Pre-alpha — distributed via [BRAT](https://github.com/TfTHacker/obsidian42-brat) for testing with selected researchers. Expect rough edges.

### Coding (multi-modal)

- Text (markdown) coding with margin bars, drag handles, hover popover
- PDF coding (fabric.js viewer) — text segments + shape regions, round-trip via QDPX
- CSV/Parquet coding (ag-grid) — segment markers (cell text spans) + row markers (whole rows)
- Image coding (fabric.js) — shape regions with normalized coords
- Audio coding (WaveSurfer) — time regions
- Video coding (HTML5 video) — time regions

### Codebook

- Hierarchical codes with `parentId` (theme hierarchy à la NVivo / Braun & Clarke)
- Virtual folders (organizational, no analytical impact)
- Code Groups — flat N:N membership orthogonal to hierarchy (Atlas.ti / MAXQDA pattern)
- Magnitude scaling on coding application (nominal / ordinal / continuous)
- Relations between codes — typed labels, directed/undirected, with memos (theory-building)
- Memos as first-class on codes, groups, relations, and markers
- Drag-drop reorganization, multi-select + bulk operations, advanced merging with reactive 4-section preview

### Analytics (20+ modes)

- Frequency, co-occurrence, evolution, sequential, inferential (χ²), text analysis, network
- Code × Metadata (heatmap codes × Case Variables with χ² per code)
- Codebook Timeline (audit log visualization, day/week/month buckets)
- Analytic Memo View (editorial hub aggregating memos from all 4 entities)
- Multi-tab xlsx export
- Tabular CSV zip export (R / Python / BI ready)

### Case Variables (mixed methods)

- Typed properties per file (number, date, datetime, checkbox, text)
- Inline editor in popover and side panel
- Filtering across analytics
- Round-trip in QDPX

### Research Board

- Free-form Excalidraw-style canvas with sticky notes, snapshots, code cards, excerpts, KPI cards, cluster frames
- Drag-drop codes from codebook tree to board
- Live sync with registry (color/name/count)
- SVG/PNG export

### Interoperability

- REFI-QDA round-trip (QDC + QDPX) with Atlas.ti, NVivo, MAXQDA
- Open standard, file-based — vault is your data, zero lock-in

### Audit log

- Central log of codebook decisions (created/renamed/edited/absorbed/merged/deleted)
- 60s coalescing for description/memo edits
- Soft-delete reversible per entry
- Markdown export

### Known limitations (pre-alpha)

- Desktop only (mobile not supported)
- HEIC / TIFF not supported (Electron limitation — convert externally first)
- CSV markers don't export via REFI-QDA (format limitation; use Tabular CSV zip instead)
- Markers can become orphan if source file is significantly mutated externally

### Install (BRAT)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. BRAT settings → Add Beta Plugin → `mrlnlms/obsidian-qualia-coding`
3. Enable Qualia Coding in Community Plugins
