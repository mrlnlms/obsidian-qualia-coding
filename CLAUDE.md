# Qualia Coding

Plugin Obsidian para analise qualitativa de dados (QDA). Codifica texto, PDF, CSV, imagens, audio e video.

## STATUS: EM DESENVOLVIMENTO — ZERO USUÁRIOS

**Plugin NÃO está publicado. ZERO usuários reais. ZERO produção.** Não existe "vault existente de usuário", "backcompat", "migration path pra data.json salvo", nem "não quebrar quem já usa". Quando eu mudar um default, muda e pronto. Quando renomear um campo, renomeia e pronto. Sem migration code inline, sem fallback defensivo pra data antiga. Se o vault workbench precisa ser atualizado, migração one-shot e deleta o código.

Pensar em backcompat aqui é ruído que enviesa decisão de design. Se eu me pegar perguntando "e os vaults existentes?" — é sinal de que errei. A resposta é sempre: não existem.

**Vault de teste real:** `/Users/mosx/Desktop/obsidian-plugins-workbench/` (o vault que contém este repo). `data.json` em `.obsidian/plugins/obsidian-qualia-coding/data.json` (Obsidian usa o nome da pasta do plugin, que é `obsidian-qualia-coding`, não o `id` do manifest). NÃO usar `demo/` como fonte de verdade — é vault de demonstração com dados sintéticos.

**Raiz do vault vs repo do plugin:**
- Vault (o que o usuário abre no Obsidian): `/Users/mosx/Desktop/obsidian-plugins-workbench/`
- Repo do plugin (subpasta): `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding/`

Arquivos de teste/notas pro usuário ver no Obsidian vão na **raiz do vault**, nunca dentro do repo.

## Workflow: no git worktrees

**Nunca** criar git worktree neste projeto (nem project-local, nem global). Trabalhar sempre direto no working dir atual, em branch normal (`git checkout -b ...`).

Motivo: o plugin é desenvolvido de dentro do vault `obsidian-plugins-workbench`. Worktree project-local duplica o repo dentro de `.obsidian/` (Obsidian indexa e quebra); worktree global quebra o hot-reload que depende do artefato `main.js` ficar em `.obsidian/plugins/qualia-coding/`.

Skills que normalmente exigem worktree (`superpowers:subagent-driven-development`, `superpowers:executing-plans`, `superpowers:brainstorming` Phase 4) ficam overridden por este CLAUDE.md. Quando algum skill pedir worktree, pular o setup e criar branch direto.

## Estrutura

```
src/
  main.ts                    — entry point (QualiaCodingPlugin)
  obsidian-internals.d.ts    — ambient types (Editor.cm, posToOffset, workspace events)
  core/
    baseSidebarAdapter.ts    — base class para TODOS os sidebar adapters (listeners, hover, deleteCode, updateMarkerFields)
    markerResolvers.ts       — type guards (isPdfMarker etc.) + getMarkerLabel + shortenPath
    codeApplicationHelpers.ts — hasCode, getCodeIds, addCodeApplication, removeCodeApplication, getMagnitude, setMagnitude, getRelations, addRelation, removeRelation
    baseCodingMenu.ts        — helpers compartilhados de menu (createActionItem, applyThemeColors, renderMagnitudeSection, renderRelationsSection)
    relationUI.ts            — renderAddRelationRow compartilhado (popover, detail, marker detail)
    relationHelpers.ts       — collectAllLabels, buildRelationEdges (funcoes puras)
    hierarchyHelpers.ts      — buildFlatTree, buildCountIndex, getDirectCount, getAggregateCount
    codebookTreeRenderer.ts  — virtual scrolling tree com hierarquia e pastas
    virtualList.ts           — helper genérico de virtual scroll pra listas planas (rowPool diff). Usado em baseCodeExplorerView (file expansion), detailCodeRenderer (markers list + segments by file), detailRelationRenderer (evidence list)
    codebookContextMenu.ts   — context menu codigos + pastas (Rename, Delete, Move to folder)
    codebookDragDrop.ts      — drag-drop lifecycle: reparent, merge, move to folder
    detailListRenderer.ts    — "All Codes" list mode + toolbar (New Code, New Folder, drag mode toggle)
    detailCodeRenderer.ts    — code-focused detail (name, color, description, hierarchy, markers)
    detailMarkerRenderer.ts  — marker-focused detail (excerpt, codes, memo, color override)
    baseCodeDetailView.ts    — abstract base: 3-level stack navigation (list → code → marker)
    baseCodeExplorerView.ts  — abstract base: Code Explorer tree (Code → File → Segment)
    mergeModal.ts            — MergeModal expandido (4 seções reativas: Name/Color/Description/Memo + preview rico + pre-flight collision check) + executeMerge reordenado (rename pós-delete pra liberar nameIndex)
    mergePolicies.ts         — helpers puros pro merge: resolveName, resolveColor, applyTextPolicy + types NameChoice/ColorChoice/TextPolicy
    dialogs.ts               — PromptModal / ConfirmModal genéricos (substituem prompt/confirm nativos)
    imageDimensions.ts       — getImageDimensions com fallback createImageBitmap → <img> (SVG via MIME map)
    magnitudeRange.ts        — generateContinuousRange puro (decimais inferidos do step, safety cap)
    drawToolbarFactory.ts    — factory compartilhada de toolbar drawing (PDF + Image)
    codeGroupsPanel.ts       — painel "Groups" no topo do codebook (chips + filter contextual)
    codeGroupsAddPicker.ts   — getAddToGroupCandidates puro (popula FuzzySuggestModal)
    mediaViewTypes.ts        — constantes isoladas de view type (sem imports Obsidian, testável em jsdom)
    viewToggleHelpers.ts     — lógica pura: resolveToggleTarget, isMediaViewType
    mediaToggleButton.ts     — injeção do botão `replace-all` no header + performToggleCommand (4 mídias)
    fileInterceptor.ts       — intercept unificado + pinnedFileByLeaf pra respeitar swap manual
    codeVisibility.ts        — helpers puros: isCodeVisibleInFile, shouldStoreOverride, cleanOverridesAfterGlobalChange
    codeVisibilityPopover.ts — popover compartilhado (body render + open floating) pros 6 engines
    visibilityEventBus.ts    — rAF coalescing bus (singleton) pra notificar views em rajadas
    caseVariables/           — Case Variables: propriedades tipadas por arquivo (mixed-methods)
      caseVariablesTypes.ts      — PropertyType, VariableValue, CaseVariablesSection, OBSIDIAN_RESERVED
      obsidianInternalsApi.ts    — encapsula metadataTypeManager do Obsidian (API interna)
      caseVariablesRegistry.ts   — classe central (CRUD, initialize/unload, sync, events)
      typeIcons.ts               — mapping PropertyType → Lucide icon
      inferPropertyType.ts       — regex-based type inference (number/date/datetime/checkbox/text)
      propertiesEditor.ts        — componente DOM (render + inline edit + add row + confirm remove)
      propertiesPopover.ts       — wrapper popover via view.addAction
      caseVariablesView.ts       — painel lateral (ItemView)
      caseVariablesViewTypes.ts  — constante CASE_VARIABLES_VIEW_TYPE
    memoTypes.ts             — MemoRecord, MaterializedRef, EntityRef (5-way union) + serializers
    memoHelpers.ts           — getMemoContent / setMemoContent / hasContent (centraliza accesso ao schema MemoRecord)
    memoNoteFormat.ts        — parse/serialize de memo notes (frontmatter `qualiaMemoOf` + body)
    memoPathResolver.ts      — sanitizeFilename + resolveConflictPath (sufixo `(2)/(3)`)
    memoMigration.ts         — migra `memo: string` legacy → MemoRecord no DataManager.load (idempotente)
    memoMaterializer.ts      — convertMemoToNote / unmaterialize / syncFromFile / refreshMemoNote (Phase 1+2+3 completa: Code, Group, Marker, Relation code-level + app-level)
    memoMaterializerListeners.ts — vault.on(modify/rename/delete) + reverse-lookup Map + self-write Set
    memoMarkerNaming.ts      — buildMarkerFilename híbrido por engine (excerpt / shape / timecode)
    detailRelationRenderer.ts — Relation Detail view (Phase 2 Relation): header com chips clickable + banner contextual code/app + Memo + Evidence list (só code-level) + Delete
    memoBatchMaterializer.ts — Phase 3: collectAllMemoRefs + categorize (4 buckets) + materializeBatch com onProgress + describeRef
    materializeAllMemosModal.ts — Phase 3: modal command palette com 3 estados (form / progress / results)
    ...                      — DataManager, CodeDefinitionRegistry, settings, types
  markdown/                  — CodeMirror 6 engine para markdown
    cm6/
      markerViewPlugin.ts    — ViewPlugin orquestrador (~326 LOC): hover, selection, lifecycle
      handleOverlayRenderer.ts — SVG drag handles: create, position, render cycle (requestMeasure)
      dragManager.ts         — ciclo de vida do drag: start, move (throttled), end, position update
      marginPanelLayout.ts   — layout algorithm puro: assignColumns, resolveLabels (reutilizavel)
  pdf/                       — PDF viewer + coding (fabric.js)
    pdfCodingModel.ts        — model CRUD (indices DOM-alinhados: beginIndex/endIndex/offsets)
    selectionCapture.ts      — captura seleção do viewer → indices via hitTestTextLayer
    highlightRenderer.ts     — pinta rects via textDivs + placeRectInPage (PDF coords)
    dragHandles.ts           — handle drag: hitTestTextLayer → updateMarkerRange
    pageObserver.ts          — lifecycle: textlayerrendered → renderPage (+ resolvePendingIndices hook pra imports)
    pdfPlainText.ts          — buildPlainText(doc) → plainText consolidado + pageStartOffsets (export)
    pdfExportData.ts         — loadPdfExportData: plainText + dims por página em 1 pass (export). ensurePdfJsLoaded força carga de window.pdfjsLib em vault novo abrindo PDF em leaf escondida
    resolveMarkerOffsets.ts  — marker.text → offset absoluto no plainText (export, fallback whitespace-normalize)
    extractAnchorFromPlainText.ts — slice do plainText → {text, page 1-based} (import)
    resolvePendingIndices.ts — text-search no DOM .textLayerNode → indices (import runtime resolve)
  csv/                       — CSV/Parquet engine (ag-grid, papaparse, hyparquet, duckdb-wasm)
    csvCodingModel.ts        — model CRUD para markers de segmento e row + bulk row ops (addCodeToManyRows, removeCodeFromManyRows, removeAllRowMarkersFromMany, getCodeIntersectionForRows) + lazyProviders + markerTextCache (populate chunked + dedup, populateMissing debounced, invalidação granular nos 6 sites de remove). getMarkerLabel prefere getMarkerText truncado (60 chars + …) com fallback pra coordenada Row X · Column. notifyListenersOnly() pra trigger re-render sem persistir
    csvCodingTypes.ts        — SegmentMarker, RowMarker, CsvMarker
    csvCodingView.ts         — FileView orquestrador: eager + lazy paths. loadEagerPath extraído do onLoadFile. Lazy automático acima do threshold (popup Lazy/Eager/Cancel removido em Fase 6 Slice A — placeholder de workspace-restore com botão "Open this file" → setupLazyMode direto). setupLazyMode usa populateMissingMarkerTextsForFile (no-op em re-open com cache quente). createGrid com infiniteInitialRowCount: totalRows. navigateToRow lazy: ensureIndexVisible + ensureColumnVisible + polling 100ms × 50 + RAF defer no flash + flashDuration:500 explícito.
    parseTabular.ts          — parseTabularFile compartilhado (papaparse + hyparquet). Não throw em warning não-fatal; caller gates em headers/rows.length
    prepopulateMarkerCaches.ts — pre-populate de markerTextCache no startup (after onLayoutReady). Eager: parseTabularFile + cellText slice. Lazy: só se isOpfsCached(opfsKey, mtime) — boot DuckDB on demand, dispose provider no finally
    resolveExportTexts.ts    — resolve cellText pra export tabular/QDPX. Cobre 6 cases (eager/lazy × aberto/fechado/pre-populated/OPFS-cached): csvModel.getMarkerText sync first; cache miss → parseTabularFile (suporta parquet); arquivo > threshold → DuckDB batch via OPFS (sem RAM spike). Provider disposed no finally
    lazyProgressFormat.ts    — formatLazyProgress puro: "45% — 134.5 / 297.0 MB · ETA 8s". ETA suprimida nos primeiros 250ms (estimativa ruidosa). formatDuration compacto (<60s = Xs, <10min = "Nm Ms", >=10min = "Nm")
    csvCodingMenu.ts         — popovers de codificacao (cell + batch). openBatchCodingPopover é mode-agnostic, recebe callback async pra coletar sourceRowIds
    csvCodingCellRenderer.ts — cell renderer AG Grid: tag chips + action button
    segmentEditor.ts         — CM6 split panel: open/close, marker sync, label alignment
    columnToggleModal.ts     — Modal de settings de colunas + CommentCellEditor + styles
    csvHeaderInjection.ts    — MutationObserver para injetar botoes nos headers AG Grid. HeaderInjectionContext exige callback getFilteredSourceRowIds (eager: forEachNodeAfterFilterAndSort, lazy: SQL via rowProvider)
    duckdb/                  — Lazy mode infra: DuckDB-Wasm + OPFS + filter SQL
      duckdbBootstrap.ts     — createDuckDBRuntime() factory + 2 shims pro Worker em Electron
      duckdbRowProvider.ts   — DuckDBRowProvider: getRowCount/getRowsByDisplayRange/buildDisplayMap aceitam whereClause; getFilteredSourceRowIds via Arrow vector direct access. read_csv_auto com all_varchar=true + null_padding=true + ignore_errors=true (tolerância a CSVs malformados)
      filterModelToSql.ts    — buildWhereClause(filterModel) → SQL WHERE escapado (text + number + combined AND/OR). Helper puro
      opfs.ts                — copyVaultFileToOPFS streaming chunks 1MB; idempotente via mtime. isOpfsCached(opfsKey, mtime) consultado pelo prepopulate (não força download). removeOPFSFile chamado no csvCodingView.onUnloadFile pra limpar OPFS quando arquivo lazy fecha (com refcount via leaves do mesmo file path) — evita disco crescendo sem usuário perceber
      rowProvider.ts         — interface RowProvider + MockRowProvider (tests)
      wasmAssets.ts          — WASM bytes embedded gzipados via esbuild plugin duckdbWasmGzipPlugin (32.7MB → 7.6MB). getWasmBytes() faz gunzip lazy + cached. clearWasmBytesCache() libera ~34MB no plugin onunload
  image/                     — Image coding (fabric.js, zoom/pan per-file)
    imageCodingModel.ts      — model CRUD para ImageMarkers + persistence
    imageCodingTypes.ts      — ImageMarker, RegionShape, NormalizedCoords
    imageCodingMenu.ts       — lifecycle wrapper do coding popover
    imageToolbar.ts          — toolbar de drawing (usa drawToolbarFactory compartilhada)
    regionHighlight.ts       — hover glow effect nas regioes
    regionLabels.ts          — labels de codigo sobre regioes
    canvas/                  — Fabric.js canvas, drawing, zoom/pan (4 arquivos)
  audio/                     — Audio engine — thin wrapper (~53 LOC) via MediaViewCore
  video/                     — Video engine — thin wrapper (~54 LOC) via MediaViewCore
  export/                    — REFI-QDA export (QDC codebook + QDPX projeto completo) + CSV tabular
    qdcExporter.ts           — gera XML do codebook (hierarquia por nesting)
    qdpxExporter.ts          — orquestra export completo (codigos + sources + segments + memos + links). Inclui CSV/parquet em <Sources> via custom namespace `<qualia:TabularSource>` + `<qualia:CellSelection>` (Decisão 5 do parquet-lazy-design). xmlns:qualia declarado no Project root quando section usa o prefixo. injectVariablesIntoSource regex aceita prefixo de namespace. Round-trip via qdpxImporter.parseSources + createTabularMarker
    xmlBuilder.ts            — helpers XML (escapeXml, xmlAttr, xmlEl, xmlDeclaration)
    coordConverters.ts       — conversao de coords por engine (PDF, Image, Media)
    exportModal.ts           — modal pre-export (formato, toggle sources, disclaimer CSV)
    exportCommands.ts        — commands na palette + botao no analytics
    caseVariablesXml.ts      — QDPX helpers (renderVariableXml, variableTypeToQdpx, renderVariablesForFile, renderCasesXml)
    tabular/                 — CSV zip export pra R/Python/BI (relacional flat, sem REFI-QDA)
      csvWriter.ts           — primitivo CSV (RFC 4180 + UTF-8 BOM)
      readmeBuilder.ts       — gera README.md embutido no zip (schema + snippets R/Python)
      buildSegmentsTable.ts  — consolida 8 sourceTypes (markdown, pdf_text, pdf_shape, image, audio, video, csv_segment, csv_row)
      buildCodeApplicationsTable.ts — 1 linha per (segment, code) de todos engines
      buildCodesTable.ts     — codebook denormalizado (pastas sao visual, nao saem)
      buildCaseVariablesTable.ts — long format (fileId, variable)
      buildRelationsTable.ts — unifica code-level + application-level
      buildGroupsTable.ts    — groups.csv standalone (id, name, color, description)
      tabularExporter.ts     — orchestrator (CSV text resolve via resolveExportTexts + fflate zip realm-safety). Recebe plugin (não app) pra ter acesso ao csvModel + getDuckDB
  import/                    — REFI-QDA import (QDC + QDPX)
    qdcImporter.ts           — parse XML codebook, popular registry
    qdpxImporter.ts          — orquestra import completo (ZIP → vault). parseSources reconhece `qualia:TabularSource` (custom namespace) e cria SegmentMarker/RowMarker via createTabularMarker. Round-trip QDPX preserva sourceRowId/column/from/to dos markers CSV/parquet
    xmlParser.ts             — helpers parse XML
    importModal.ts           — modal de import (conflitos, opcoes)
    importCommands.ts        — commands na palette
  analytics/                 — Charts e word clouds (chart.js)
    data/
      consolidationCache.ts  — cache incremental por engine (dirty flags + merge parcial)
      dataConsolidator.ts    — 6 funcoes puras por engine + consolidateCodes + consolidate() como composicao
      dataReader.ts          — readAllData(DataManager) → AllEngineData
      relationsEngine.ts     — extractRelationEdges, extractRelationNodes (Network View)
      statsEngine.ts         — barrel re-export (frequency, cooccurrence, evolution, sequential, inferential, textAnalysis, codeMetadata)
      statsHelpers.ts        — applyFilters compartilhado
      inferential.ts         — calculateChiSquare + chiSquareFromContingency (helper puro generico R×C reutilizavel)
      binning.ts             — helpers puros: binNumeric (quartis ≥5 uniq, categorico ≤4), binDate (auto ano/mes/dia, UTC), explodeMultitext
      codeMetadata.ts        — calculateCodeMetadata pura: matriz [code × value] cruzando codigos com Case Variables + chi² por codigo
      memoView.ts            — aggregateMemos pura: agrega memos de codes/groups/relations/markers em CodeMemoSection[] ou FileMemoSection[]
      codebookTimelineEngine.ts — Codebook Timeline: helpers puros buildCodeNameLookup (resolve nomes de deletados via renamed.to + absorbed.absorbedNames), buildTimelineEvents, filterEvents, bucketByGranularity (day/week/month, ISO-week year correto), renderTimelineEntryMarkdown
    board/
      boardTypes.ts          — discriminated union: StickyNode, SnapshotNode, ExcerptNode, etc.
      boardNodeHelpers.ts    — factories compartilhadas (cardBg, textbox, badges, theme, assignNodeProps)
      boardNodes.ts          — barrel re-export dos 6 node types
      nodes/                 — 1 arquivo por node type (stickyNode, snapshotNode, excerptNode, etc.)
      boardExport.ts         — export SVG/PNG (bbox scene-coord + viewportTransform reset no PNG pra crop correto com zoom)
      fabricExtensions.d.ts  — ambient types para Fabric.js (Canvas, Rect, etc. + FabricObject methods)
    views/
      analyticsView.ts       — classe AnalyticsView (~340 LOC): lifecycle, toolbar, footer
      analyticsViewContext.ts — interface AnalyticsViewContext + type aliases (ViewMode, etc.)
      configSections.ts      — config panel sections compartilhadas (sources, viewMode, codes, minFreq)
      shared/chartHelpers.ts — heatmapColor, computeDisplayMatrix, divergentColor, SOURCE_COLORS
      modes/
        modeRegistry.ts      — Record<ViewMode, ModeEntry> declarativo (render, options, exportCSV, exportMarkdown, label)
        *Mode.ts             — 23 mode modules incl. relationsNetworkMode + codeMetadataMode + memoView + codebookTimelineMode (1 por visualizacao, ~150-400 LOC cada)
        relationsNetworkHelpers.ts — helpers puros do Relations Network: isEdgeAboveThreshold, computeEdgeOpacity (hover-focus + filtro N+)
        codeMetadataMode.ts  — heatmap canvas 2D codigo × valor de Case Variable + coluna χ²/p + sort interativo + tooltip + CSV export
        codebookTimelineMode.ts — Codebook Timeline: stacked bar chart (day/week/month) + lista descending agrupada por dia + filters (granularity, event types, code search, show hidden) + click navega via revealCodeDetailForCode + export markdown na raiz do vault
        memoView/            — Analytic Memo View: hub editorial unificado de memos
          memoViewMode.ts    — orchestrator (render + branching by/code by/file)
          memoViewOptions.ts — config panel (groupBy radio + showTypes checkboxes + markerLimit dropdown)
          renderCoverageBanner.ts — banner topo (4 stats)
          renderCodeSection.ts    — render CodeMemoSection (header + memos + markers + hollow context pra parents)
          renderFileSection.ts    — render FileMemoSection (toggle by-file)
          renderMarkerCard.ts     — card individual (excerpt + memo editor + source chip)
          renderMemoEditor.ts     — textarea inline com debounced 500ms + suspendRefresh/resumeRefresh
          onSaveHandlers.ts       — onSave por kind (5 kinds: code/group/relation code-level/relation app-level/marker)
          exportMemoCSV.ts        — buildMemoCSV pura + exportMemoCSV (download)
          exportMemoMarkdown.ts   — buildMemoMarkdown pura + exportMemoMarkdown (cria nota em Analytic Memos/)
  media/
    mediaViewCore.ts         — logica compartilhada audio/video via composicao (transport, zoom, regions)
    mediaViewConfig.ts       — interface de configuracao (video element, CSS prefix, popover)
    mediaCodingModel.ts      — base class generica para audio/video models
    mediaCodingMenu.ts       — popover compartilhado audio/video
    mediaSidebarAdapter.ts   — sidebar adapter compartilhado audio/video (extends BaseSidebarAdapter)
    mediaTypes.ts            — MediaMarker, MediaFile, BaseMediaSettings
    regionRenderer.ts        — renderizacao de regioes (wavesurfer)
    waveformRenderer.ts      — wrapper WaveSurfer.js
    formatTime.ts            — helper de formatacao de tempo
```

## Build

- `npm run dev` — watch mode (esbuild)
- `npm run build` — production build (tsc + esbuild)
- Plugin ID: `qualia-coding`
- Desktop only, min Obsidian 1.5.0
- `main.js` no root e gitignored (artefato de build, nao commitado)

## Release

- Workflow automatizado em `.github/workflows/release.yml` — push de tag `X.Y.Z` (sem `v` prefix) dispara build + criação de GitHub Release com `main.js`, `manifest.json`, `styles.css` anexados.
- Bump version em 3 arquivos: `manifest.json`, `versions.json`, `package.json`. Atualizar `CHANGELOG.md`. Commit. Push tag.
- Detalhes completos em `docs/DEVELOPMENT.md` §9.
- BRAT puxa o release latest do repo. Pre-release (alpha/beta) requer `--prerelease` flag pra não virar default.

### Tags pra rollback de fase grande (não-release)

Quando fechar uma fase substancial (Fase 6 do parquet-lazy foi a primeira), criar **par de tags** marcando antes/depois pra facilitar rollback ou comparação. Nome `pre-<fase>-baseline` / `post-<fase>-checkpoint`.

```bash
# Antes de começar a fase: marca o último commit estável
git tag pre-fase6-baseline 4885d3e -m "Estado antes da Fase 6"

# Ao fechar a fase: marca o commit mais recente
git tag post-fase6-checkpoint HEAD -m "Fase 6 completa"

# Push das duas
git push origin pre-fase6-baseline post-fase6-checkpoint

# Se fizer commit adicional na mesma fase depois (docs polish, etc),
# move a tag pra HEAD com -f e re-push com --force:
git tag -f post-fase6-checkpoint HEAD
git push --force origin post-fase6-checkpoint
```

**Comandos de rollback:**
```bash
# Ver como tava antes (sem mexer em main)
git checkout pre-fase6-baseline

# Desfazer fase inteira preservando histórico (NÃO destrutivo)
git revert --no-edit pre-fase6-baseline..post-fase6-checkpoint

# Voltar pro checkpoint depois de explorar baseline
git checkout main
```

**Tags atuais ativas:**
- `pre-fase6-baseline` → `4885d3e` (estado antes do parquet-lazy Slice A)
- `post-fase6-checkpoint` → `aee2e3c` (Fase 6 completa + docs redondo)

**Quando remover:** quando o próximo release tagear (ex: `0.2.0` ou `0.3.0`) cobrir esse intervalo confortavelmente, pode deletar — release tags são o ponto de rollback canônico. Tags de fase são "redes de segurança" temporárias enquanto a fase ainda é recente.

### Conferir estado git ao começar sessão nova

Pra evitar dúvida sobre "tudo foi commit/push?":
```bash
git status                          # working tree clean + "up to date with origin/main"
git log --oneline -5                # últimos 5 commits
git ls-remote --tags origin | grep <fase>  # tags no remote
```

Se o output bater (working clean + branch alinhada com origin), nada está pendente. Working tree dirty ou "ahead by N commits" = falta commit ou push.

### Convenção de versionamento (semver)

- **Patch (X.Y.Z+1)**: bugfix, polish, refinement de feature existente. Ex: 0.1.0 → 0.1.1 (Convert memo to note Phase 1+2).
- **Minor (X.Y+1.0)**: feature nova (capability ou módulo novo). Ex: LLM-assisted coding entraria como minor.
- **Major (X+1.0.0)**: marca "pronto pra produção" ou breaking interface visível pro usuário. Só atacar quando tiver feedback de alpha real.

### Estado atual e próximos releases

- **Latest**: `0.1.1` (pre-release, 2026-04-30) — Convert memo to note Phase 1 + Phase 2 completa (Code, Group, Marker, Relation).
- **Próximo planejado**: `0.1.2` se Phase 3 (Materialize all memos) for a única mudança. Sobe pra `0.2.0` se entrar combinada com feature substancial (LLM coding, etc.) ou com submissão à Community Plugins + onboarding docs (decisão de marketing — pode até virar `1.0.0` se for "lançamento oficial").
- Manter sempre **pre-release flag** até feedback de alpha real chegar.

## Demo vault

- `demo/` — vault de teste com arquivos de cada tipo
- Abrir no Obsidian: vault path = `demo/`
- `demo/.obsidian/plugins/qualia-coding/main.js` e commitado (quem clona precisa)
- Apos build ou mudanca em manifest/styles, copiar manualmente:
  `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`
- NAO existe plugin copyToDemo no esbuild — copia e manual.

## Convencoes

- TypeScript strict
- Conventional commits em portugues (feat:, fix:, chore:, docs:)
- Cada engine registra via `register*Engine()` e retorna `EngineRegistration<Model>` com `{ cleanup, model }`
- `npm run test` — 2584 testes em 152 suites (Vitest + jsdom)
- `bash scripts/smoke-roundtrip.sh` — prepara vault temp em `~/Desktop/temp-roundtrip/` com plugin instalado pra smoke test manual do QDPX round-trip
- `npm run test:e2e` — 66 testes e2e em 19 specs (wdio + Obsidian real)
- Sidebar adapters herdam de `BaseSidebarAdapter` (core) ou `MediaSidebarAdapter` (audio/video)
- Views compartilhadas: UnifiedCodeExplorerView, UnifiedCodeDetailView
- Type guards compartilhados em `markerResolvers.ts`

### Nomes padronizados (todos os engines)

- `fileId` — identificador do arquivo no marker (nunca `file`)
- `memo` — campo de reflexão analítica processual (nunca `note`). Presente em `BaseMarker`, `CodeDefinition`, `GroupDefinition`, `CodeRelation` (#25). Distinto de `description?` (definição operacional, sai no codebook export)
- `removeMarker()` — metodo de remocao no model (nunca `deleteMarker`)
- `colorOverride` — cor custom por marker (presente em todos os tipos)
- `codeId` — referencia estavel ao CodeDefinition.id nos markers (nunca nome direto)
- `codes: CodeApplication[]` — array de `{ codeId, magnitude?, relations? }` em todos os markers (nunca `string[]`)
- Helpers em `codeApplicationHelpers.ts`: `hasCode`, `getCodeIds`, `addCodeApplication`, `removeCodeApplication`, `getMagnitude`, `setMagnitude`, `getRelations`, `addRelation`, `removeRelation`
- Popover adapters resolvem name→id na borda UI; models so recebem codeId
- `parentId` — referencia ao CodeDefinition pai (nunca `parent`)
- `childrenOrder` — array ordenado de ids filhos (nunca `children`)
- `mergedFrom` — ids dos codigos fundidos neste (audit trail)
- `folder` — id da pasta virtual (nunca path). Pastas nao tem significado analitico
- `FolderDefinition` — `{ id, name, createdAt }` no registry. Pastas nao afetam analytics
- `createFolder` / `deleteFolder` / `renameFolder` / `setCodeFolder` — CRUD de pastas no registry
- `groups` — array de groupIds em CodeDefinition (camada flat N:N ortogonal a parentId/folder). Afeta Analytics filter e export
- `GroupDefinition` — `{ id (g_*), name, color, description?, memo?, paletteIndex, parentId? schema-ready, createdAt }` no registry
- `GROUP_PALETTE` — 8 cores pastéis distintas do `DEFAULT_PALETTE`. Auto-assign round-robin com `nextGroupPaletteIndex` (nunca decrementa)
- `createGroup` / `renameGroup` / `deleteGroup` (ripple) / `addCodeToGroup` / `removeCodeFromGroup` / `setGroupColor` / `setGroupDescription` / `setGroupMemo` / `setGroupOrder` — API do registry
- `getCodesInGroup` / `getGroupsForCode` / `getGroupMemberCount` — queries
- Merge preserva **union** dos groups (target + sources, snapshot pré-delete)
- QDPX export: `<Sets>` em `<CodeBook>` com namespace `xmlns:qualia="urn:qualia-coding:extensions:1.0"` pra `qualia:color`
- Tabular CSV: coluna `groups` (`;`-separated names) em `codes.csv` + `groups.csv` standalone
- `FlatTreeNode = FlatCodeNode | FlatFolderNode` — union discriminada em hierarchyHelpers.ts
- `rootOrder` — array ordenado de IDs root no registry. Controla ordem de exibicao
- `magnitude` — config no CodeDefinition `{ type, values }`, valor no CodeApplication. Picker fechado
- `relations` — array de `{ label, target, directed, memo? }` em CodeDefinition (codigo-level) e CodeApplication (segmento-level). Label livre com autocomplete. `memo` editável só no code-level (UI 1.0); app-level é schema-ready (round-trip QDPX/CSV preserva)
- `setRelationMemo(codeId, label, target, memo)` — atualiza memo de relation code-level por tupla (label, target). Se houver duplicatas com mesma tupla, atualiza só primeira (mesmo limite do delete em `baseCodingMenu.ts:585`)
- `setParent(id, parentId)` — metodo de reparentar com deteccao de ciclo
- `executeMerge()` — funcao de merge em `mergeModal.ts` (reassigna markers, reparenta filhos, deleta sources)
- Hierarchy helpers puros em `hierarchyHelpers.ts`: `buildFlatTree`, `buildCountIndex`, `getDirectCount`, `getAggregateCount`

## Skills Obsidian

### Consulta (antes de implementar)

- Antes de mexer em CM6 (StateField, decorations, widgets, DOM do editor) → consultar `obsidian-cm6`
- Antes de mexer em CSS do editor ou layout → consultar `obsidian-design`
- Antes de mexer em events, lifecycle, vault, metadataCache → consultar `obsidian-core`
- Antes de mexer em settings UI → consultar `obsidian-settings`

### Atualizacao (depois de implementar)

- Padrao novo descoberto → adicionar DIRETAMENTE ao skill relevante (cm6, core, settings, design)
- Anti-pattern descoberto → adicionar na secao "Armadilhas Comuns" do skill relevante
- Cada pattern tem UMA casa (o skill mais relevante). Nunca duplicar entre skills

## Docs

Docs operacionais (repo — usados no trabalho diario):
- `docs/ARCHITECTURE.md` — arquitetura detalhada
- `docs/TECHNICAL-PATTERNS.md` — padroes recorrentes
- `docs/DEVELOPMENT.md` — guia de desenvolvimento
- `docs/ROADMAP.md` — features planejadas por prioridade (com secao "⚡ Status atual" no topo — leitura obrigatoria pra proxima sessao)
- `docs/BACKLOG.md` — divida tecnica e oportunidades de refactor

Docs de design/pesquisa (consultar antes de iniciar sessoes em features grandes):
- `docs/parquet-lazy-design.md` — design doc autoritativo Parquet/CSV lazy loading (DuckDB-Wasm + OPFS, 7 fases, 13-15 sessões). Revisado por Codex+Gemini. **Sempre consultar antes de virar spec/plan.**
- `docs/_study/llm-coding/` — pesquisa de mercado profunda (40 ferramentas + 5 patterns, 41 arquivos). Pontos de entrada: `index.md` (TOC), `comparison.md` (sintese cross-tool), `qualia-fit.md` (cruzamento arquitetura Qualia × patterns mercado), `methodology.md`. **Consultar antes de qualquer brainstorm sobre LLM.**

Docs narrativos/historicos (fora do repo, em `obsidian-qualia-coding/plugin-docs/`):
- `HISTORY.md`, `PREHISTORY.md` — historia e pre-historia
- `DESIGN-PRINCIPLES.md` — principios de design (narrativo, audiencia externa)
- `DESIGN-STORY.md` — fundamentacao teorica do design
- `archive/` — plans arquivados, roadmaps antigos, vision docs
- `superpowers/` — specs e plans gerados por skills
- `pm/`, `research/`, `ORG ANTIGOS/` — material de PM, research, historico

### Atualizacao de docs apos feature/fase

**Quando acionar:**
- Apos conclusao de feature, fase de plano, ou refactor significativo
- NAO em commits WIP, experimentos, ou bugfixes triviais

**Escopo:** so docs do repo (`docs/`). Arquivos no workspace externo (`obsidian-qualia-coding/plugin-docs/`) NAO fazem parte desse fluxo — atualizacao de HISTORY, archive, etc. e ad-hoc.

**Ordem sugerida** (do mais obrigatorio ao mais opcional):

1. `ROADMAP.md` — marcar item como FEITO (riscar + anotar data). Se a feature gerou sub-items nao planejados, adicionar como novos items.
2. `ARCHITECTURE.md` — novos modulos, fluxos, decisoes arquiteturais
3. `TECHNICAL-PATTERNS.md` — padroes/gotchas descobertos durante a implementacao
4. `DEVELOPMENT.md` — novos commands, settings, fluxos de teste
5. `BACKLOG.md` — nova divida tecnica surgida, marcar resolvidos
6. `CLAUDE.md` — so se estrutura de arquivos, convencoes ou contagem de testes mudaram. Nao atualizar por mudanca menor.

**Triggers por tipo de mudanca:**
- Feature nova → 1, 2, 4 (+ 3 se descobriu pattern)
- Refactor → 2, 5 (marca resolvido)
- Bug fix significativo → 3 se revelou padrao
- Padrao tecnico novo isolado → 3
- Novo modulo/arquivo → 2, 6
