# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Won't-fix mantém razão pra não reabrir.
> Última atualização: 2026-05-05.

---

## 🟢 Estado atual

**Nenhum bloqueador aberto.** 1 item ativo (SC3 — emit granular, não bloqueante). Single item legado: §11 E3 (limitação de formato, won't-fix documentado).

### 🔍 Sintomas observados sem repro confiável

Coisas que apareceram em smoke test mas não conseguiram ser reproduzidas. Não viram tarefa porque sem repro o debug é especulação. Investigar quando aparecer caso reproduzível.

- **(2026-04-28→04-29) Suspeita de código duplicado no codebook** — investigação completa em `plugin-docs/archive/claude_sources/sessions/20260429-duplicate-code-bug-investigation.md`. Resumo: stress test com 1000 codes + 30 dup pairs deliberados (`scripts/seed-stress-codebook.mjs`) **não reproduziu**. H2 (registry tolera dups) descartada. H1 (virtual scroll) e H3 (race em mutações) sem repro mas não eliminadas. **Quando voltar a aparecer**, capturar `data.json` + screenshot + steps na hora — diagnóstico fica trivial com forensic data.

- **(2026-05-05) Polígono em image marker reposicionado ao fechar/reabrir** — usuário criou polygon no centro de uma imagem; após close+reopen do file, polygon aparece deslocado no canto inferior. Outras shapes (rect/ellipse) parecem manter posição. Suspeita: serialization/deserialization de coords do polygon usa formato inconsistente entre absolute pixels vs normalized 0-1, ou renderer carrega centroid default em vez do salvo. Repro: criar polygon no meio da Screenshot 2026-05-02 at 11.35.26, fechar arquivo, reabrir. **Não relacionado a SC3** — bug pré-existente do image engine. Atacar quando entrar no image polish.

- **(2026-05-05) Cmd+Z não desfaz coding em PDF** — usuário aplicou `tema-A` em 2 trechos de PDF text marker (count subiu 7→8→9), mas Cmd+Z não removeu o último coding. SC count permaneceu em 9 (sem mudança, comportamento esperado se nenhum mutation aconteceu — ou seja, undo não disparou nada). PdfCodingModel tem undo stack + reconcileCodes, mas Cmd+Z keybinding pode não estar wired no PDF view, ou o command não está chegando ao model. Não validamos o fix SC3 do undo path (commit `df9ecaa`) por causa disso — o emit existe e foi unit-testado, mas integração UI quebrada bloqueia smoke. **Atacar:** verificar wiring do undo no PdfCodingView (provavelmente falta keybinding registration ou conflito com Obsidian default Cmd+Z handler).

Áreas com polish opcional foram migradas pro `ROADMAP.md`:
- Relations Network (hover-focus ✅, filtro N+ ✅, edge bundling condicional)
- Multi-tab spreadsheet export
- Code × Metadata ✅
- Pastas nested ✅
- Margin Panel customization (bloqueado por plugin externo)

---

## 🟡 Smart Codes Tier 3 — Phase 2 (não bloqueante)

Smart Codes Tier 3 fechou em 2026-05-04 (branch `feat/smart-codes`, 19 commits, 175 testes novos, mergida em `main`). Funcionalidade core — criar/editar/deletar/visualizar/contar/export/import — está **100% acessível via command palette** (`Smart Codes: Open hub` + `Smart Codes: New`) e usa modal próprio. Round-trip QDPX e CSV tabular funcionam. Stress passou em <1s pra 10k markers + 100 smart codes.

**Spec autoritativa:** `docs/superpowers/specs/2026-05-04-smart-codes-design.md`
**Plan original:** `docs/superpowers/plans/2026-05-04-smart-codes.md` (5 chunks)
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

### SC3 — Emit granular `qualia:markers-changed` em models pra invalidação cirúrgica

**O que tem hoje:** Quando markers mudam (add/remove/edit), cache faz **rebuild full** dos `indexByCode`/`indexByFile`. Pra ≤10k markers leva <500ms (per stress test), mas escala linear com volume.

**O que seria ideal:** emit granular `(engine, fileId, codeIds)` em cada mutation → `cache.invalidateForMarker(args)` invalida só smart codes que dependem dos `codeIds` afetados (via `dependencyExtractor`). Já existe a infra: `cache.invalidateForMarker({engine, fileId, codeIds})` está implementado e testado, só falta os models emitirem.

**Por que ficou pendente:** Task 2.4a do plan auditou que `markdownModel._notifyChange()` já existe mas é genérico (sem args). Padronizar emit nos 6 engines (markdown/pdf/image/csv/audio+video shared) seria refator de event signature. Decisão: aceitar full rebuild até virar gargalo.

**Como atacar:** plan Task 2.4a (linhas 1430-1530) + sites concretos:
- `src/markdown/models/codeMarkerModel.ts:322` — `_notifyChange()` → adicionar emit
- `src/pdf/pdfCodingModel.ts` — saveMarkers
- `src/image/imageCodingModel.ts:240`
- `src/csv/csvCodingModel.ts:80`
- `src/media/mediaCodingModel.ts` (audio + video shared)

Cada um adiciona helper privado `private emitMarkerChange(fileId, codeIds)` chamado nas mutations + listener pattern público `onMarkerChange(fn)`. Wire em `main.ts` (já tem o listener pronto, é só substituir `qualia:markers-changed` global por per-engine subscriptions).

**Estimativa:** 1 sessão. Tem regression risk médio (eventos novos podem romper sequence assumptions em consumers existentes).

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

### Coding em modo lazy: cell coding ✅ FEITO (Fase 4d). Sidebar markerText preview pendente

Coding individual + batch funcionam idêntico ao eager em modo lazy desde Fase 4d (2026-05-04). Sort/filter via SQL operacionais (Fase 5, 2026-05-04).

**Pendente — preview de `markerText` em sidebar** pra arquivos lazy. Sidebar mostra markers existentes mas sem preview do trecho codificado (`markerText: null`). Pra resolver:
1. **Cascade async** em `SidebarModelInterface.getAllMarkers / getMarkerById / getMarkersForFile` → `Promise<...>`. Atinge ~12 sites em `core/` (baseCodeDetailView, detailCodeRenderer, detailRelationRenderer, detailMarkerRenderer, baseCodeExplorerView, codebookTreeRenderer, unifiedModelAdapter). UI síncrona afetada: callbacks de drag-drop, hover events, mutations — exigem `await` ou hasMarkerSync helper.
2. `getMarkerTextAsync` já existe em `CsvCodingModel` — basta o consumer chamar.

Estimativa: 1.5-2 sessões dedicadas. Atacar quando prioridades permitirem (não bloqueia uso).

### Filter de virtual columns (cod-frow / cod-seg / comment) em lazy mode

Hoje desligado: `columnToggleModal.ts:186/200` força `filter: !lazy` nas virtual columns porque elas não estão no DuckDB schema (usuário codifica em data.json). Pra habilitar filter em lazy seria preciso traduzir filterModel dessas colunas pra LEFT JOIN com dados de markers (não trivial). Custo > benefício até feedback de usuário pedir.

### "Missing DB manager" residual do DuckDB worker em alta concorrência

Mitigado em 2026-05-04 (snapshot de `lazyState` no `onUnloadFile`, re-check após cada await em `refreshLazyFilter`/`refreshLazyDisplayMap`). Mas DuckDB-Wasm pode ainda emitir esse erro do worker se uma query estiver em flight no exato instante de `dispose()`. Não é fatal (try/catch around) mas polui o console. Solução completa: serializar `dispose()` com pending queries via lock interno no provider. Não-urgente.

### Validação de 2 parquets pesados em paralelo (não testado)

Cada view tem seu próprio `lazyState`/`displayMap`/`gridApi`. DuckDB runtime é singleton (queries serializam internamente). Memory headroom pode ser apertado se ambos > 500MB. Não testado — registrar caso de teste ad-hoc se aparecer.

### ~~Pre-compute display_row mapping ao aplicar sort em lazy mode~~ ✅ (já estava ligado em Fase 4a/5)

Spike Premise B (§14.5.2 do design doc) mostrou p99 de 214ms em sorted scroll-to-row de 297MB. Resolvido — `csvCodingView.ts` liga `onSortChanged → refreshLazyDisplayMap` (drop+rebuild com `orderBy + whereClause`), `navigateToRow` consulta `displayRowFor()`, e `refreshLazyFilter` encadeia o rebuild. Verificado 2026-05-04.

### ~~Reveal de marker em parquet lazy não destaca a row~~ ✅ (2026-05-04, Fase 6 Slice A)

Resolvido. `navigateToRow` agora chama `ensureIndexVisible` + `ensureColumnVisible(column)` (faltava o horizontal — flash invisível em parquet largo) + polling 100ms × 50 tentativas em vez de single-shot `modelUpdated` (em v33 algumas transições scroll-settle/row-render não emitem) + RAF defer no flash (cell DOM precisa de paint cycle pós-data) + `flashDuration: 500` explícito (default 0 em alguns minor) + `infiniteInitialRowCount: totalRows` no createGrid (resolve AG Grid error #88 quando reveal chega antes do primeiro getRows).

### ~~Pre-populate cache no startup pra labels antes de file open~~ ✅ (2026-05-04, Fase 6 Slice A)

Resolvido. `src/csv/prepopulateMarkerCaches.ts` roda após `app.workspace.onLayoutReady`. Eager (< threshold): se algum marker tá sem cache, `parseTabularFile` + popular `markerTextCache` (sem reter `rowDataCache` — simétrico com lazy, só excerpts ~60 chars/marker em memória). Lazy (> threshold): só popula se `isOpfsCached(opfsKey, mtime)` true — nunca força download. Boot DuckDB on demand, `populateMissingMarkerTextsForFile`, dispose provider no finally. `setupLazyMode` também trocou `populateMarkerTextCacheForFile` → `populateMissingMarkerTextsForFile` pra virar no-op em re-open quando pre-populate já encheu o cache.

### ~~Label de marker em CSV/parquet mostra coordenada, não conteúdo~~ ✅ (2026-05-04, pre-populate fica pra Fase 6)

`CsvCodingModel.getMarkerLabel` agora prefere `getMarkerText(marker)` truncado a 60 chars, com fallback pra `Row X · Column` quando text não disponível. Em eager via `rowDataCache`, em lazy via `markerTextCache`. **Limitação atual:** ambos populam só on file open — pre-populate no startup ficou registrado acima como follow-up da Fase 6.

### Carla label vazia (whitespace-only cell) — minor

Smoke 2026-05-04: row marker em célula `"   "` (whitespace) deveria cair no fallback `Row 3 · comment`, mas no DOM o entry aparece com label visualmente vazio. Lógica em `getMarkerLabel` está correta (`trimmed.length === 0` cai no fallback) — provável causa: papaparse parsing whitespace-only quoted cell como string vazia ou similar. Investigar quando virar bloqueante. Não-urgente.

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
