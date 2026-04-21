# Qualia Coding

Plugin Obsidian para analise qualitativa de dados (QDA). Codifica texto, PDF, CSV, imagens, audio e video.

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
    codebookContextMenu.ts   — context menu codigos + pastas (Rename, Delete, Move to folder)
    codebookDragDrop.ts      — drag-drop lifecycle: reparent, merge, move to folder
    detailListRenderer.ts    — "All Codes" list mode + toolbar (New Code, New Folder, drag mode toggle)
    detailCodeRenderer.ts    — code-focused detail (name, color, description, hierarchy, markers)
    detailMarkerRenderer.ts  — marker-focused detail (excerpt, codes, memo, color override)
    baseCodeDetailView.ts    — abstract base: 3-level stack navigation (list → code → marker)
    baseCodeExplorerView.ts  — abstract base: Code Explorer tree (Code → File → Segment)
    mergeModal.ts            — MergeModal com busca fuzzy, preview de impacto, executeMerge
    drawToolbarFactory.ts    — factory compartilhada de toolbar drawing (PDF + Image)
    ...                      — DataManager, CodeDefinitionRegistry, settings, types
  markdown/                  — CodeMirror 6 engine para markdown
    cm6/
      markerViewPlugin.ts    — ViewPlugin orquestrador (~326 LOC): hover, selection, lifecycle
      handleOverlayRenderer.ts — SVG drag handles: create, position, render cycle (requestMeasure)
      dragManager.ts         — ciclo de vida do drag: start, move (throttled), end, position update
      marginPanelLayout.ts   — layout algorithm puro: assignColumns, resolveLabels (reutilizavel)
  pdf/                       — PDF viewer + coding (fabric.js)
  csv/                       — CSV/Parquet engine (ag-grid, papaparse, hyparquet)
    csvCodingModel.ts        — model CRUD para markers de segmento e row
    csvCodingTypes.ts        — SegmentMarker, RowMarker, CsvMarker
    csvCodingView.ts         — FileView orquestrador (~210 LOC): grid setup, lifecycle
    csvCodingMenu.ts         — popovers de codificacao (cell + batch)
    csvCodingCellRenderer.ts — cell renderer AG Grid: tag chips + action button
    segmentEditor.ts         — CM6 split panel: open/close, marker sync, label alignment
    columnToggleModal.ts     — Modal de settings de colunas + CommentCellEditor + styles
    csvHeaderInjection.ts    — MutationObserver para injetar botoes nos headers AG Grid
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
  export/                    — REFI-QDA export (QDC codebook + QDPX projeto completo)
    qdcExporter.ts           — gera XML do codebook (hierarquia por nesting)
    qdpxExporter.ts          — orquestra export completo (codigos + sources + segments + memos + links)
    xmlBuilder.ts            — helpers XML (escapeXml, xmlAttr, xmlEl, xmlDeclaration)
    coordConverters.ts       — conversao de coords por engine (PDF, Image, Media)
    exportModal.ts           — modal pre-export (formato, toggle sources, disclaimer CSV)
    exportCommands.ts        — commands na palette + botao no analytics
  import/                    — REFI-QDA import (QDC + QDPX)
    qdcImporter.ts           — parse XML codebook, popular registry
    qdpxImporter.ts          — orquestra import completo (ZIP → vault)
    xmlParser.ts             — helpers parse XML
    importModal.ts           — modal de import (conflitos, opcoes)
    importCommands.ts        — commands na palette
  analytics/                 — Charts e word clouds (chart.js)
    data/
      consolidationCache.ts  — cache incremental por engine (dirty flags + merge parcial)
      dataConsolidator.ts    — 6 funcoes puras por engine + consolidateCodes + consolidate() como composicao
      dataReader.ts          — readAllData(DataManager) → AllEngineData
      relationsEngine.ts     — extractRelationEdges, extractRelationNodes (Network View)
      statsEngine.ts         — barrel re-export (6 modulos: frequency, cooccurrence, evolution, sequential, inferential, textAnalysis)
      statsHelpers.ts        — applyFilters compartilhado
    board/
      boardTypes.ts          — discriminated union: StickyNode, SnapshotNode, ExcerptNode, etc.
      boardNodeHelpers.ts    — factories compartilhadas (cardBg, textbox, badges, theme, assignNodeProps)
      boardNodes.ts          — barrel re-export dos 6 node types
      nodes/                 — 1 arquivo por node type (stickyNode, snapshotNode, excerptNode, etc.)
      fabricExtensions.d.ts  — ambient types para Fabric.js (Canvas, Rect, etc. + FabricObject methods)
    views/
      analyticsView.ts       — classe AnalyticsView (~340 LOC): lifecycle, toolbar, footer
      analyticsViewContext.ts — interface AnalyticsViewContext + type aliases (ViewMode, etc.)
      configSections.ts      — config panel sections compartilhadas (sources, viewMode, codes, minFreq)
      shared/chartHelpers.ts — heatmapColor, computeDisplayMatrix, divergentColor, SOURCE_COLORS
      modes/
        modeRegistry.ts      — Record<ViewMode, ModeEntry> declarativo (render, options, exportCSV, label)
        *Mode.ts             — 20 mode modules incl. relationsNetworkMode (1 por visualizacao, ~150-400 LOC cada)
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
- `npm run test` — 1810 testes em 77 suites (Vitest + jsdom)
- `npm run test:e2e` — 65 testes e2e em 18 specs (wdio + Obsidian real)
- Sidebar adapters herdam de `BaseSidebarAdapter` (core) ou `MediaSidebarAdapter` (audio/video)
- Views compartilhadas: UnifiedCodeExplorerView, UnifiedCodeDetailView
- Type guards compartilhados em `markerResolvers.ts`

### Nomes padronizados (todos os engines)

- `fileId` — identificador do arquivo no marker (nunca `file`)
- `memo` — campo de anotacao no marker (nunca `note`)
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
- `FlatTreeNode = FlatCodeNode | FlatFolderNode` — union discriminada em hierarchyHelpers.ts
- `rootOrder` — array ordenado de IDs root no registry. Controla ordem de exibicao
- `magnitude` — config no CodeDefinition `{ type, values }`, valor no CodeApplication. Picker fechado
- `relations` — array de `{ label, target, directed }` em CodeDefinition (codigo-level) e CodeApplication (segmento-level). Label livre com autocomplete
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
- `docs/ROADMAP.md` — features planejadas por prioridade (com secao "Proximos a atacar" no topo)
- `docs/BACKLOG.md` — divida tecnica e oportunidades de refactor

Docs narrativos/historicos (fora do repo, em `obsidian-qualia-coding/plugin-docs/`):
- `HISTORY.md`, `PREHISTORY.md` — historia e pre-historia
- `DESIGN-PRINCIPLES.md` — principios de design (narrativo, audiencia externa)
- `DESIGN-STORY.md` — fundamentacao teorica do design
- `archive/` — plans arquivados, roadmaps antigos, vision docs
- `superpowers/` — specs e plans gerados por skills
- `pm/`, `research/`, `ORG ANTIGOS/` — material de PM, research, historico

### Atualizacao obrigatoria apos cada feature

Ao concluir implementacao de uma feature ou fase, atualizar docs afetados:
- `ROADMAP.md` (repo) — marcar items feitos, adicionar novos
- `BACKLOG.md` (repo) — nova divida tecnica, remover resolvidos
- `HISTORY.md` (workspace) — registrar conclusao
- `CLAUDE.md` (repo, gitignored) — estrutura de arquivos, convencoes, contagem de testes/suites
- `ARCHITECTURE.md` (repo) — novos modulos e fluxos
- `TECHNICAL-PATTERNS.md` (repo) — padroes novos descobertos
- `DEVELOPMENT.md` (repo) — novos commands, settings, fluxos
