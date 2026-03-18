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
    baseCodingMenu.ts        — helpers compartilhados de menu (createActionItem, applyThemeColors)
    ...                      — DataManager, CodeDefinitionRegistry, settings, types
  markdown/                  — CodeMirror 6 engine para markdown
    cm6/
      markerViewPlugin.ts    — ViewPlugin orquestrador (~326 LOC): hover, selection, lifecycle
      handleOverlayRenderer.ts — SVG drag handles: create, position, render cycle (requestMeasure)
      dragManager.ts         — ciclo de vida do drag: start, move (throttled), end, position update
  pdf/                       — PDF viewer + coding (fabric.js)
  csv/                       — CSV/Parquet engine (ag-grid, papaparse, hyparquet)
    csvCodingView.ts         — FileView orquestrador (~210 LOC): grid setup, lifecycle
    segmentEditor.ts         — CM6 split panel: open/close, marker sync, label alignment
    columnToggleModal.ts     — Modal de settings de colunas + CommentCellEditor + styles
    csvHeaderInjection.ts    — MutationObserver para injetar botoes nos headers AG Grid
  image/                     — Image coding (fabric.js, zoom/pan per-file)
  audio/                     — Audio engine (wavesurfer.js) — extends MediaCodingModel
  video/                     — Video engine — extends MediaCodingModel
  analytics/                 — Charts e word clouds (chart.js)
    data/
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
        *Mode.ts             — 19 mode modules (1 por visualizacao, ~150-400 LOC cada)
  media/
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
- Apos build ou mudanca em manifest/styles, SEMPRE copiar:
  `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`
- O esbuild tem plugin `copyToDemo` que copia `main.js` automaticamente no dev/build.
  `manifest.json` e `styles.css` precisam de copia manual quando alterados.

## Convencoes

- TypeScript strict
- Conventional commits em portugues (feat:, fix:, chore:, docs:)
- Cada engine registra via `register*Engine()` e retorna `EngineRegistration<Model>` com `{ cleanup, model }`
- `npm run test` — 1263 testes em 39 suites (Vitest + jsdom)
- `npm run test:e2e` — 37 testes e2e em 11 specs (wdio + Obsidian real)
- Sidebar adapters herdam de `BaseSidebarAdapter` (core) ou `MediaSidebarAdapter` (audio/video)
- Views compartilhadas: UnifiedCodeExplorerView, UnifiedCodeDetailView
- Type guards compartilhados em `markerResolvers.ts`

### Nomes padronizados (todos os engines)

- `fileId` — identificador do arquivo no marker (nunca `file`)
- `memo` — campo de anotacao no marker (nunca `note`)
- `removeMarker()` — metodo de remocao no model (nunca `deleteMarker`)
- `colorOverride` — cor custom por marker (presente em todos os tipos)

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

- `docs/ARCHITECTURE.md` — arquitetura detalhada
- `docs/TECHNICAL-PATTERNS.md` — padroes recorrentes
- `docs/DEVELOPMENT.md` — guia de desenvolvimento
- `docs/ROADMAP.md` — roadmap do plugin
- `docs/BACKLOG.md` — divida tecnica e oportunidades de refactor
