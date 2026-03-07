# Backlog — Qualia Coding

## Analise de padroes entre engines (2026-03-07)

### Padroes consistentes

Todos os 7 engines seguem:
- `register*Engine(plugin)` → retorna `EngineCleanup`
- `SidebarModelInterface` via adapter (exceto markdown que implementa direto)
- Shared `CodeDefinitionRegistry` + `DataManager.section()`
- Custom events `qualia-{engine}:navigate`
- Named exports, sem barrel files, camelCase nos arquivos
- Hover bidirecional (sidebar <-> view)
- File rename tracking centralizado

### Divergencias encontradas

| Aspecto | Estado atual |
|---------|-------------|
| **Estrutura de pastas** | Markdown tem `cm6/`, `menu/`, `models/`, `views/` (granular). Image tem `canvas/`, `toolbar/`, `highlight/`, `labels/`, `menu/`, `models/`, `views/`. Audio/Video sao flat (6 arquivos, sem subpastas). Analytics tem `data/`, `views/`, `board/`. |
| **Naming dos arquivos** | CSV usa `codingModel.ts` (sem prefixo). Audio/Video usam `audioCodingModel.ts`. Image usa `models/codingModel.ts`. Inconsistente. |
| **Save strategy** | Markdown: debounce 2s. Audio/Video: debounce 500ms. PDF/Image: imediato. |
| **Data structure** | Markdown: `Map<fileId, Marker[]>`. Audio/Video: `FileContainer[]` (path + markers). PDF/Image/CSV: arrays flat. |
| **Undo** | So PDF tem undo stack (50 max). Nenhum outro engine. |
| **Settings** | Markdown tem settings proprias. Image tem `autoOpenImages`. Audio/Video tem settings similares mas duplicadas. CSV/PDF nao tem. |
| **Menu pattern** | Image: classe wrapper `CodingMenu`. Audio/Video: funcao direta. PDF/CSV: funcao direta. Markdown: CM6 tooltip. |
| **Adapter pattern** | Markdown implementa `SidebarModelInterface` direto no model. Todos os outros usam adapter separado. |

### Oportunidades de padronizacao

1. **Audio e Video sao quase identicos** — `VideoCodingModel` e copia do `AudioCodingModel`. Poderiam compartilhar uma base `MediaCodingModel` em `media/`
2. **Naming inconsistente** — decidir entre `{engine}CodingModel.ts` (na raiz) vs `models/codingModel.ts` (em subpasta)
3. **Save strategy** — 3 timings diferentes sem razao clara; poderia padronizar
4. **Flat vs granular** — Audio/Video sao flat demais, Markdown/Image sao bem organizados

### Detalhes por engine

#### Markdown
- Pasta: `cm6/`, `menu/`, `models/`, `views/`
- Model: `CodeMarkerModel` — `Map<fileId, Marker[]>`
- Save: debounce 2s
- CM6 StateField + ViewPlugin
- Implementa `SidebarModelInterface` direto (sem adapter)
- Settings proprias (opacity, handles, menus)
- Virtual fileIds para segment editors CSV (`csv:file:row:col`)

#### PDF
- Pasta: flat + `views/`
- Model: `PdfCodingModel` — arrays separados (markers + shapes)
- Save: imediato
- Undo stack (50 max)
- Observer pattern em paginas PDF
- DrawInteraction state machine para shapes
- Adapter: `PdfSidebarAdapter`

#### CSV
- Pasta: flat + `views/`
- Model: `CsvCodingModel` — arrays (segmentMarkers + rowMarkers)
- Save: imediato
- ag-grid + split CM6 panel para segmentos
- Parquet support via hyparquet
- Adapter: `CsvSidebarAdapter`
- Naming sem prefixo: `codingModel.ts`, `codingTypes.ts`

#### Image
- Pasta: `canvas/`, `toolbar/`, `highlight/`, `labels/`, `menu/`, `models/`, `views/`
- Model: `ImageCodingModel` — array flat de markers
- Save: imediato via notify
- Fabric.js canvas, coordenadas normalizadas 0-1
- Per-file zoom/pan state
- Adapter: `ImageSidebarAdapter`

#### Audio
- Pasta: flat (6 arquivos) + `views/`
- Model: `AudioCodingModel` — `AudioFile[]` (path + markers)
- Save: debounce 500ms
- WaveSurfer.js + MediaRegionRenderer (shared com Video)
- Adapter: `AudioSidebarAdapter`

#### Video
- Pasta: flat (6 arquivos) + `views/`
- Model: `VideoCodingModel` — quase identico ao Audio
- Save: debounce 500ms
- Reusa WaveformRenderer + MediaRegionRenderer
- Setting extra: `videoFit`
- Adapter: `VideoSidebarAdapter`

#### Analytics
- Pasta: `data/`, `views/`, `board/`
- Sem model dedicado — usa API object
- 19 modos de visualizacao
- Board interativo (fabric.js)
- Engines de analise: stats, cluster, decision tree, MCA, MDS
- Persiste board em `board.json` separado
- Sem sidebar adapter (le dados consolidados de todos os engines)

### Contratos que engines devem seguir

1. Marker model implementa ou wrapa `SidebarModelInterface`
2. Sidebar adapter traduz markers → `BaseMarker`
3. Registry compartilhado (`CodeDefinitionRegistry`)
4. Dados em `QualiaData[engineName]` via DataManager
5. File interception via `registerFileIntercept()`
6. Hover state bidirecional
7. Change notifications para unified views
