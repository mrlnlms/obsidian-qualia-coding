# Source Files — Checklist de Processamento

Todos os arquivos `.ts` dos 7 plugins originais. Marcar conforme forem lidos/portados.

**Última atualização: 2026-02-28**

## obsidian-codemarker-v2 (Markdown) — 23 arquivos

### CM6
- [x] `src/cm6/markerStateField.ts` → `markdown/cm6/markerStateField.ts`
- [x] `src/cm6/markerViewPlugin.ts` → `markdown/cm6/markerViewPlugin.ts`
- [x] `src/cm6/selectionMenuField.ts` → `markdown/cm6/selectionMenuField.ts`
- [x] `src/cm6/hoverMenuExtension.ts` → `markdown/cm6/hoverMenuExtension.ts`
- [x] `src/cm6/marginPanelExtension.ts` → `markdown/cm6/marginPanelExtension.ts`
- [x] `src/cm6/utils/markerPositionUtils.ts` → `markdown/cm6/utils/markerPositionUtils.ts`
- [x] `src/cm6/utils/viewLookupUtils.ts` → `markdown/cm6/utils/viewLookupUtils.ts`

### Menu
- [x] `src/menu/cm6NativeTooltipMenu.ts` → `markdown/menu/cm6NativeTooltipMenu.ts` (Approach C, ATIVO)
- [x] `src/menu/cm6TooltipMenu.ts` — Approach B (NÃO MODIFICAR, não portado intencionalmente)
- [x] `src/menu/obsidianMenu.ts` — Approach A (NÃO MODIFICAR, não portado intencionalmente)
- [x] `src/menu/menuController.ts` → `markdown/menu/menuController.ts`
- [x] `src/menu/menuActions.ts` → `markdown/menu/menuActions.ts`
- [x] `src/menu/menuTypes.ts` → `markdown/menu/menuTypes.ts`
- [x] `src/menu/codeFormModal.ts` → `core/codeFormModal.ts` (canônico)

### Models
- [x] `src/models/codeMarkerModel.ts` → `markdown/models/codeMarkerModel.ts`
- [x] `src/models/codeDefinitionRegistry.ts` → `core/codeDefinitionRegistry.ts` (canônico)
- [x] `src/models/sharedRegistry.ts` — MORREU (substituído por DataManager)
- [x] `src/models/settings.ts` → `markdown/models/settings.ts`

### Views
- [x] `src/views/codeDetailView.ts` → `markdown/views/codeDetailView.ts` (extends BaseCodeDetailView)
- [x] `src/views/codeExplorerView.ts` → `markdown/views/codeExplorerView.ts` (extends BaseCodeExplorerView)
- [ ] `src/views/unifiedCodeDetailView.ts` — adiado para Camada 8 (CSV integration)
- [x] `src/views/settingsTab.ts` → `core/settingTab.ts`

### Entry
- [x] `src/main.ts` → `main.ts` + `markdown/index.ts`

**Status: 22/23 portados. Falta unifiedCodeDetailView (CSV dep).**

---

## obsidian-codemarker-pdf — 19 arquivos

### Coding
- [x] `src/coding/pdfCodingModel.ts` → `pdf/pdfCodingModel.ts`
- [x] `src/coding/pdfCodingTypes.ts` → `pdf/pdfCodingTypes.ts`
- [x] `src/coding/sharedRegistry.ts` — MORREU

### PDF Rendering
- [x] `src/pdf/highlightRenderer.ts` → `pdf/highlightRenderer.ts`
- [x] `src/pdf/highlightGeometry.ts` → `pdf/highlightGeometry.ts`
- [x] `src/pdf/selectionCapture.ts` → `pdf/selectionCapture.ts`
- [x] `src/pdf/marginPanelRenderer.ts` → `pdf/marginPanelRenderer.ts`
- [x] `src/pdf/drawLayer.ts` → `pdf/drawLayer.ts`
- [x] `src/pdf/drawInteraction.ts` → `pdf/drawInteraction.ts`
- [x] `src/pdf/drawToolbar.ts` → `pdf/drawToolbar.ts`
- [x] `src/pdf/dragHandles.ts` → `pdf/dragHandles.ts`
- [x] `src/pdf/pageObserver.ts` → `pdf/pageObserver.ts`
- [x] `src/pdf/pdfViewerAccess.ts` → `pdf/pdfViewerAccess.ts`

### Menu
- [x] `src/menu/pdfCodingMenu.ts` → `pdf/pdfCodingMenu.ts` (refatorado — usa core/baseCodingMenu)
- [x] `src/menu/codeFormModal.ts` — usa `core/codeFormModal.ts`

### Views
- [x] `src/views/pdfCodeDetailView.ts` → `pdf/views/pdfCodeDetailView.ts` (extends BaseCodeDetailView + PdfSidebarAdapter)
- [x] `src/views/pdfCodeExplorerView.ts` → `pdf/views/pdfCodeExplorerView.ts` (extends BaseCodeExplorerView + PdfSidebarAdapter)

### Other
- [x] `src/pdfTypings.d.ts` → `pdf/pdfTypings.d.ts`
- [x] `src/main.ts` → `pdf/index.ts`

**Status: 19/19 portados. PDF engine completo.**

---

## obsidian-codemarker-csv — 35 arquivos

### CM6 (cópias do v2 — MORREM no merge)
- [x] `src/cm6/markerStateField.ts` — cópia v2, MORREU (usa markdown/cm6/)
- [x] `src/cm6/markerViewPlugin.ts` — cópia v2, MORREU
- [x] `src/cm6/selectionMenuField.ts` — cópia v2, MORREU
- [x] `src/cm6/hoverMenuExtension.ts` — cópia v2, MORREU
- [x] `src/cm6/marginPanelExtension.ts` — cópia v2, MORREU
- [x] `src/cm6/handleWidget.ts` — DEAD CODE, MORREU
- [x] `src/cm6/utils/markerPositionUtils.ts` — cópia v2, MORREU
- [x] `src/cm6/utils/viewLookupUtils.ts` — 92 LOC (CANÔNICO, D23) → já em `markdown/cm6/utils/`

### Menu (cópias do v2 — MORREM)
- [x] `src/menu/cm6NativeTooltipMenu.ts` — cópia v2, MORREU
- [x] `src/menu/cm6TooltipMenu.ts` — cópia v2, MORREU
- [x] `src/menu/obsidianMenu.ts` — cópia v2, MORREU
- [x] `src/menu/menuController.ts` — cópia v2, MORREU
- [x] `src/menu/menuActions.ts` — cópia v2, MORREU
- [x] `src/menu/menuTypes.ts` — cópia v2, MORREU
- [x] `src/menu/codeFormModal.ts` — cópia v2, MORREU (usa core/)

### Models (cópias do v2 — MORREM)
- [x] `src/models/codeMarkerModel.ts` — cópia v2, MORREU
- [x] `src/models/codeDefinitionRegistry.ts` — cópia v2, MORREU
- [x] `src/models/sharedRegistry.ts` — cópia v2, MORREU
- [x] `src/models/settings.ts` — cópia v2, MORREU

### Views (cópias do v2 — MORREM)
- [x] `src/views/codeDetailView.ts` — cópia v2, MORREU
- [x] `src/views/codeExplorerView.ts` — cópia v2, MORREU
- [x] `src/views/unifiedCodeDetailView.ts` — cópia v2, MORREU
- [x] `src/views/codemarkerSettingsTab.ts` — cópia v2, MORREU

### CSV-Specific (MANTÉM — a portar na Camada 8)
- [ ] `src/coding/codingModel.ts` — 386 LOC (RowMarker + SegmentMarker)
- [ ] `src/coding/codingTypes.ts`
- [ ] `src/coding/codingMenu.ts` — 481 LOC (tag button + batch)
- [ ] `src/coding/codeFormModal.ts`
- [ ] `src/coding/sharedRegistry.ts` — MORRE
- [ ] `src/coding/settings.ts`
- [ ] `src/csvCodingView.ts` — FileView + AG Grid
- [ ] `src/grid/codingCellRenderer.ts`
- [ ] `src/views/csvCodeDetailView.ts` — 294 LOC
- [ ] `src/views/csvCodeExplorerView.ts` — 253 LOC
- [ ] `src/views/settingsTab.ts`
- [ ] `src/main.ts`

**Status: 24/35 processados (cópias mortas). 11 CSV-specific aguardam Camada 8.**

---

## obsidian-codemarker-image — 17 arquivos

### Canvas
- [ ] `src/canvas/fabricCanvas.ts` — Fabric.js setup, fit-to-container
- [ ] `src/canvas/regionDrawing.ts` — state machine: select/rect/ellipse/freeform

### Coding
- [ ] `src/coding/imageCodingModel.ts` — 204 LOC
- [ ] `src/coding/imageCodingTypes.ts` — NormalizedRect, NormalizedPolygon
- [ ] `src/coding/regionManager.ts` — bridge FabricObject ↔ markerId
- [x] `src/coding/codeDefinitionRegistry.ts` — cópia, MORREU
- [x] `src/coding/sharedRegistry.ts` — MORREU

### Controls + Toolbar
- [ ] `src/controls/zoomPanControls.ts`
- [ ] `src/toolbar/toolbar.ts`

### Highlight + Labels
- [ ] `src/highlight/regionHighlight.ts` — glow effect
- [ ] `src/labels/regionLabels.ts` — FabricText no canvas

### Menu
- [ ] `src/menu/codingMenu.ts` — 183 LOC (class-based, outlier)

### Views
- [ ] `src/views/imageCodeDetailView.ts` — 294 LOC
- [ ] `src/views/imageCodeExplorerView.ts` — 243 LOC
- [ ] `src/views/imageSettingTab.ts`

### Other
- [ ] `src/imageView.ts` — orchestrator principal
- [ ] `src/main.ts`

**Status: 2/17 processados (cópias mortas). 15 aguardam Camada 9.**

---

## obsidian-codemarker-audio — 13 arquivos

### Audio
- [ ] `src/audio/waveformRenderer.ts` — WaveSurfer lifecycle
- [ ] `src/audio/regionRenderer.ts` — regions, vertical lanes, minimap markers

### Coding
- [ ] `src/coding/audioCodingModel.ts` — 288 LOC
- [ ] `src/coding/audioCodingTypes.ts`
- [x] `src/coding/codeDefinitionRegistry.ts` — cópia, MORREU
- [x] `src/coding/sharedRegistry.ts` — MORREU

### Menu
- [ ] `src/menu/audioCodingMenu.ts` — 285 LOC
- [ ] `src/menu/audioCodeFormModal.ts`

### Views
- [ ] `src/views/audioCodeDetailView.ts` — 369 LOC
- [ ] `src/views/audioCodeExplorerView.ts` — 312 LOC
- [ ] `src/views/audioSettingTab.ts`

### Other
- [ ] `src/utils/formatTime.ts`
- [ ] `src/main.ts`

**Status: 2/13 processados (cópias mortas). 11 aguardam Camada 9.**

---

## obsidian-codemarker-video — 13 arquivos

### Video
- [ ] `src/video/waveformRenderer.ts` — WaveSurfer com media: HTMLMediaElement
- [ ] `src/video/regionRenderer.ts` — fork do Audio

### Coding
- [ ] `src/coding/videoCodingModel.ts` — 288 LOC (fork Audio)
- [ ] `src/coding/videoCodingTypes.ts`
- [x] `src/coding/codeDefinitionRegistry.ts` — cópia, MORREU
- [x] `src/coding/sharedRegistry.ts` — MORREU

### Menu
- [ ] `src/menu/videoCodingMenu.ts` — 285 LOC (fork Audio)
- [ ] `src/menu/videoCodeFormModal.ts`

### Views
- [ ] `src/views/videoCodeDetailView.ts` — 369 LOC (fork Audio)
- [ ] `src/views/videoCodeExplorerView.ts` — 312 LOC (fork Audio)
- [ ] `src/views/videoSettingTab.ts`

### Other
- [ ] `src/utils/formatTime.ts` — duplicado do Audio
- [ ] `src/main.ts`

**Status: 2/13 processados (cópias mortas). 11 aguardam Camada 9.**

---

## obsidian-codemarker-analytics — 21 arquivos

### Data
- [ ] `src/data/dataReader.ts` — REESCREVER (lê DataManager no merge)
- [ ] `src/data/dataConsolidator.ts`
- [ ] `src/data/dataTypes.ts`
- [ ] `src/data/statsEngine.ts`
- [ ] `src/data/clusterEngine.ts`
- [ ] `src/data/decisionTreeEngine.ts`
- [ ] `src/data/mcaEngine.ts`
- [ ] `src/data/mdsEngine.ts`
- [ ] `src/data/textExtractor.ts`
- [ ] `src/data/wordFrequency.ts`

### Board
- [ ] `src/board/boardCanvas.ts`
- [ ] `src/board/boardNodes.ts`
- [ ] `src/board/boardArrows.ts`
- [ ] `src/board/boardDrawing.ts`
- [ ] `src/board/boardToolbar.ts`
- [ ] `src/board/boardData.ts`
- [ ] `src/board/boardClusters.ts`

### Views
- [ ] `src/views/analyticsView.ts` — 19 ViewModes (~5,700 LOC)
- [ ] `src/views/boardView.ts`

### Other
- [ ] `src/typings.d.ts`
- [ ] `src/main.ts`

**Status: 0/21 portados. Aguardam Camada 10.**

---

## Resumo

| Plugin | Arquivos | Portados | Mortos | Pendentes |
|--------|----------|----------|--------|-----------|
| v2 (Markdown) | 23 | 20 | 2 (approaches B/A) | 1 (unifiedDetailView) |
| PDF | 19 | 18 | 1 (sharedRegistry) | 0 |
| CSV | 35 | 0 | 24 (cópias v2) | 11 |
| Image | 17 | 0 | 2 (registry + shared) | 15 |
| Audio | 13 | 0 | 2 (registry + shared) | 11 |
| Video | 13 | 0 | 2 (registry + shared) | 11 |
| Analytics | 21 | 0 | 0 | 21 |
| **Total** | **141** | **38** | **33** | **70** |
