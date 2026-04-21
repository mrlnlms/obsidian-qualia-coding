# Qualia Coding — Architecture & Design Decisions

> Este documento registra as decisões arquiteturais do projeto, o raciocínio por trás delas, e os padrões de design que guiam o desenvolvimento. É a referência de "por quê", não de "como" (para isso, ver `CLAUDE.md`).

---

## 1. Visão do Produto

O Qualia Coding é uma plataforma de **Análise Qualitativa de Dados (QDA)** construída como plugin do Obsidian. A premissa central:

> **Anotar dados qualitativos em 6 formatos diferentes com um sistema de códigos unificado, depois analisar padrões cross-format com 19+ visualizações analíticas e um Research Board.**

### Princípios de design

1. **Notes stay 100% clean** — Arquivos do vault nunca são modificados. Todas as anotações vivem em `data.json`. CM6 decorations cuidam da visualização. O vault é um vault de notas, não um banco de dados.
2. **Global workspace as state zero** — O usuário codifica primeiro, organiza em projetos depois. Análogo à filosofia Obsidian: "loose notes first, folders later".
3. **One code system, many formats** — Um único `CodeDefinitionRegistry` compartilhado entre todos os 7 engines. Markers referenciam códigos por ID estável (`codeId`), não por nome — rename é atômico no registry sem propagação.
4. **Non-invasive file intercept** — Cada engine intercepta seu formato sem conflitar com handlers nativos do Obsidian ou outros plugins.

---

## 2. Arquitetura dos 7 Engines

### Por que 7 engines separados?

Cada formato de dado tem necessidades fundamentalmente diferentes de renderização, interação e coordenadas:

| Engine | Renderização | Coordenadas | Lib externa |
|--------|-------------|-------------|-------------|
| **Markdown** | CM6 Decorations | line/ch (texto) | — (CM6 nativo) |
| **PDF** | DOM overlays + SVG | page + CSS % (bottom-left → top-left) | PDF.js (via Obsidian) |
| **CSV** | AG Grid cells | row/column + char offsets | AG Grid + PapaParse |
| **Image** | Fabric.js canvas | normalized 0-1 (resolution-independent) | Fabric.js 6.9 |
| **Audio** | WaveSurfer waveform | seconds (float) | WaveSurfer.js 7 |
| **Video** | WaveSurfer + `<video>` | seconds (float) | WaveSurfer.js 7 |
| **Analytics** | Chart.js + Fabric.js | N/A (read-only) | Chart.js + Fabric.js |

Cada um tem um `CodingModel` próprio mas **todos** implementam a interface `SidebarModelInterface`, permitindo uma sidebar unificada.

### File Intercept Strategy

| Engine | Método | Por quê |
|--------|--------|---------|
| Markdown | `registerEditorExtension()` | Integração direta com CM6 — é o editor nativo |
| CSV | `registerExtensions(['csv'])` | Obsidian não tem handler nativo pra CSV |
| PDF, Image, Audio, Video | `active-leaf-change` listener | Non-invasive — não conflita com handlers nativos |

**Regra**: NUNCA usar `registerExtensions` para áudio/vídeo — conflita com o player nativo do Obsidian e causa falha no carregamento do plugin.

---

## 3. Decisões Arquiteturais Fundamentais

### 3.1 Handles via Overlay (não Decoration.widget)

**Problema**: `Decoration.widget()` insere elementos inline no texto, causando reflow de word-wrap em linhas longas.

**Decisão**: Handles renderizados em um overlay div no `scrollDOM`, posicionados com `coordsAtPos` + `requestMeasure`.

**Trade-off**: Listeners de eventos precisam ser separados (overlay não recebe eventos do `contentDOM`). Mais complexidade, mas zero impacto visual.

### 3.2 Margin Bars (estilo MAXQDA)

**Problema**: Como mostrar N códigos em um mesmo trecho? "Cor é 1 dimensão, códigos são N dimensões. Não existe forma perfeita de mostrar N informações categóricas no mesmo pixel."

**Decisão**: Margin panel com barras verticais por código — padrão de toda ferramenta QDA profissional (ATLAS.ti, NVivo, MAXQDA, Dedoose).

**Análise comparativa**:
- **ATLAS.ti** — margin bars coloridas por código, tooltip no hover
- **NVivo** — "coding stripes" no gutter, múltiplas colunas
- **MAXQDA** — barras verticais com labels, draggable para resize
- **Dedoose** — chips de cor ao lado do texto
- **Taguette** — só cor de fundo, sem gutter

### 3.3 Sidebar em vez de Modal para Code Explorer

**Análise**:
- **Modal**: ~100-150 LOC, mais simples. Limita: sem drag-and-drop, sem hierarquia visual, sem inline edit.
- **Sidebar (ItemView)**: ~200-300 LOC. Suporta: hierarquia de códigos, drag-and-drop reorder, merge, export, statistics, toggle de visibilidade. Escala para todas as features futuras.

**Decisão**: Sidebar é o investimento certo a longo prazo. Quick Switcher (`Cmd+Shift+C`) complementa para acesso rápido.

### Feature Comparison: Sidebar vs Modal vs Quick Switcher

| Feature | Sidebar | Modal | Quick Switcher |
|---------|---------|-------|----------------|
| Drag-and-drop reorder | ✅ | ❌ | ❌ |
| Code hierarchy visual | ✅ | ❌ | ❌ |
| Inline rename | ✅ | ❌ | ❌ |
| Merge codes (drag onto) | ✅ | ❌ | ❌ |
| Export from UI | ✅ | ❌ | ❌ |
| Statistics inline | ✅ | ❌ | ❌ |
| Filter/toggle visibility | ✅ | ✅ | ❌ |

### 3.4 JSON em vez de SQLite

**Problema**: Persistência de dados — JSON vs SQLite.

**Decisão**: JSON + índices in-memory.

**Razões**:
- SQLite quebra no Obsidian mobile
- Complica distribuição via community plugins
- JSON é suficiente para o volume de dados de QDA (centenas/milhares de markers, não milhões)
- Caminho de migração mantido aberto se escala justificar

### 3.5 Data Model Unificado

**Design central**:
```
QualiaData {
  registry    → CodeDefinition[] (compartilhado)
  general     → GeneralSettings (showMagnitudeInPopover, showRelationsInPopover, …)
  markdown    → markers, settings
  pdf         → markers, shapes
  csv         → segmentMarkers, rowMarkers
  image       → markers, settings
  audio       → files[{path, markers}], settings
  video       → files[{path, markers}], settings
}
```

**DataManager** é o único ponto de acesso:
- `section(engine)` lê, `setSection(engine, data)` grava
- Debounce de 500ms no save para evitar thrashing
- Merge automático de defaults no load (campos novos não quebram dados existentes)
- Migrações de 3 formatos legacy do registry

### 3.6 Three Menu Approaches (A/B/C)

**História**:
1. **Approach A (Obsidian Menu)** — `Menu` nativo do Obsidian. Funciona bem, mas CM6 perde a seleção visual quando foco vai pro menu.
2. **Approach B (CM6 HTML Tooltip)** — Tooltip do CM6 com HTML puro. Resolve a perda de seleção, mas styling é manual.
3. **Approach C (CM6 + Obsidian Components)** — **ATIVO**. Tooltip do CM6 com `TextComponent`/`ToggleComponent` nativos. Lê CSS vars do Obsidian, aplica como inline styles.

**O "dark mode breakthrough"**: CSS variables do Obsidian não cascatam para dentro de tooltips CM6 (DOM apartado). Solução: `getComputedStyle(document.body)` lê os valores resolvidos, copia como inline styles + custom properties no container do tooltip.

**Regra**: NUNCA modificar Approach A (`obsidianMenu.ts`) ou Approach B (`cm6TooltipMenu.ts`). São fallbacks preservados.

### 3.7 Coordenadas PDF: Bottom-Left → CSS Top-Left

**Problema**: PDF usa origem bottom-left, CSS usa top-left.

**Solução**: `placeRectInPage()` espelha eixo Y via `viewBox[3] - rect[y] + viewBox[1]`, normaliza para `[left, top, right, bottom]`, expressa como CSS percentages.

**Dual-path highlight**: (a) chars-level via `item.chars` (customização do PDF.js no Obsidian) para bounding preciso; (b) DOM Range fallback via `getBoundingClientRect()`. Garante funcionamento mesmo se a customização do PDF.js mudar.

### 3.8 Coordenadas Image: Normalized 0-1

**Decisão**: Todas as coordenadas de regiões são normalizadas relativas às dimensões naturais da imagem (0-1). Markers são resolution-independent — renderizam corretamente em qualquer zoom ou tamanho de canvas.

- Ellipses armazenadas como bounding-box rect coords com `shape: 'ellipse'` — denormalizadas para rx/ry no render.
- Polígonos: Fabric.js armazena pontos relativos à origem da shape. Precisa usar `calcTransformMatrix()` para obter coordenadas absolutas antes de normalizar.

### 3.9 Audio/Video: Temporal Markers com Vertical Lanes

**Coordenadas**: `from/to` em seconds (float).

**Overlapping**: Algoritmo greedy de lane assignment — ordena por start time depois duração descendente, atribui primeira lane onde `laneEnd <= marker.from`. CSS `top` e `height` como percentages.

**Minimap**: Overlay divs com posicionamento percentual. Largura mínima de 0.3% para segments muito curtos.

**Video vs Audio**: Video tem `<video>` element acima do waveform. WaveSurfer usa o elemento de vídeo como `media` source. `videoFit: 'contain' | 'cover'` controla letterbox vs crop.

---

## 4. Padrões Cross-Engine

### 4.1 Unified Sidebar

**UnifiedModelAdapter** merge N engines em 1 `SidebarModelInterface`:
- Delega writes para o engine owner via type detection
- Type guards via `markerType` discriminante: `isPdfMarker()`, `isImageMarker()`, `isCsvMarker()`, `isAudioMarker()`, `isVideoMarker()`
- Um único `UnifiedCodeExplorerView` + `UnifiedCodeDetailView` para todos os formatos
- **Cache com dirty flag**: `getAllMarkers()`, `getMarkersForFile()`, `getMarkerById()`, `getAllFileIds()` retornam dados cacheados. Dirty flag global invalidado no wrapper do `onChange`. Indices `Map<fileId>` e `Map<id>` construidos em `rebuild()` — `getMarkersForFile` e `getMarkerById` são O(1)
- **Views com rAF debounce**: Explorer e Detail usam `scheduleRefresh` com `requestAnimationFrame` para coalescer mudanças rápidas em 1 rebuild DOM

### 4.2 Phantom Marker Prevention

**Problema**: Se o menu de codificação cria um marker ao abrir e o usuário cancela, sobra um marker vazio ("fantasma").

**Solução**: Dois métodos separados:
- `findExistingMarker()` — read-only, para hover/display
- `findOrCreateMarker()` — cria sob demanda, só quando o primeiro código é toggled ON

### 4.3 Bidirectional Hover

Todos os engines implementam hover bidirecional:
- View hover → `model.setHoverState(markerId, codeName)` → sidebar highlights
- Sidebar hover → `model.setHoverState(markerId, codeName)` → view highlights

**No markdown**: `setHoverEffect` compartilhado entre `markerViewPlugin` e `marginPanelExtension`. Payload inclui `hoveredIds?: string[]` para multi-marker hover. `isInPartialOverlap` flag previne dispatches redundantes em zonas de overlap.

### 4.4 CSS Namespace Isolation

| Engine | Prefixo |
|--------|---------|
| Markdown | `codemarker-` |
| PDF | `codemarker-pdf-` |
| CSV | `csv-` / `codemarker-csv-` |
| Image | `codemarker-image-` |
| Audio | `codemarker-audio-` |
| Video | `codemarker-video-` |
| Analytics | `codemarker-analytics-` |

Zero colisões confirmadas entre engines.

### 4.5 Theme Color Injection

Elementos renderizados fora do DOM do Obsidian (CM6 tooltips, WaveSurfer, Fabric.js) não herdam CSS variables.

**Solução**: `applyThemeColors()` lê `getComputedStyle(document.body)`, copia como inline styles. Listener no evento `css-change` para live theme switching.

### 4.6 Navigation Events

| Evento | Payload | Ação |
|--------|---------|------|
| `qualia-pdf:navigate` | — | **Não implementado** — PDF abre via `#page=N`, sem scroll a marker específico |
| `qualia-image:navigate` | `{file, markerId}` | Pan to region + flash glow |
| `qualia-csv:navigate` | `{file, row, column}` | `ensureIndexVisible` + `flashCells` |
| `qualia-audio:navigate` / `qualia-video:navigate` | `{file, seekTo}` | Seek waveform (sem play automático) |
| `qualia:clear-all` | (none) | Board/Image/Analytics views clear live state |

### 4.7 openCodingPopover()

Menu de codificação unificado via `CodingPopoverAdapter` interface. O popover opera com **nomes** (UI layer), e cada adapter resolve name→id na borda:
- `getActiveCodes(): string[]` — retorna nomes (resolve `codeId` → name via registry)
- `addCode(codeName: string): void` — resolve name → id via `registry.getByName()`, passa id ao model
- `removeCode(codeName: string): void` — mesmo pattern de resolução
- `getMemo(): string` / `setMemo(value: string): void`
- `getMagnitudeForCode?(codeId: string): string | undefined`
- `setMagnitudeForCode?(codeId: string, value: string | undefined): void`
- `getRelationsForCode?(codeId: string): CodeRelation[]`
- `setRelationsForCode?(codeId: string, relations: CodeRelation[]): void`
- `save(): void` / `onRefresh(): void`
- `onNavClick?(codeName: string, isActive: boolean): void`

Seções colapsáveis: Memo (sempre), Magnitude (toggle `showMagnitudeInPopover`), Relations (toggle `showRelationsInPopover`). Toggles escondem do popover mas a feature continua acessível no Detail View e Marker Detail.

CSV tem batch mode especial para codificar múltiplas linhas visíveis de uma vez.

---

## 5. Shared Infrastructure

### 5.1 CodeDefinitionRegistry

Instância única compartilhada entre todos os 7 engines:
- 12 cores auto-palette (alta contrast, safe em light/dark)
- Palette categórica (não gradiente) — cada cor é visualmente distinta
- Markers referenciam códigos por **ID estável** (`codes: CodeApplication[]` onde `CodeApplication = { codeId: string; magnitude?: string }`). Rename é atômico no registry — sem propagação para markers
- Helpers centralizados em `codeApplicationHelpers.ts`: `hasCode`, `getCodeIds`, `addCodeApplication`, `removeCodeApplication`
- Popover adapters resolvem name→id na borda UI (usuário digita nome, adapter resolve para `codeId` via registry)
- Auto-persistence via `onMutate` callback — qualquer mutação (add, rename, delete, recolor) dispara save automaticamente

**Hierarquia (Phase A):**
- `parentId?`, `childrenOrder: string[]`, `mergedFrom?: string[]` no CodeDefinition
- Metodos: `setParent` (com deteccao de ciclo), `getRootCodes`, `getChildren`, `getAncestors`, `getDescendants`, `getDepth`
- `rootOrder: string[]` controla ordem de exibicao dos codigos root
- `executeMerge()` em `mergeModal.ts`: reassigna markers, reparenta filhos, registra audit trail

**Pastas virtuais (Phase B):**
- `folder?: string` no CodeDefinition (ID da pasta)
- `FolderDefinition { id, name, createdAt }` armazenado no registry
- CRUD: `createFolder`, `renameFolder`, `deleteFolder`, `setCodeFolder`, `getCodesInFolder`, `getAllFolders`
- Pastas NAO afetam hierarquia, analytics, ou queries — sao puramente organizacionais
- Serializacao: `folders: Record<string, FolderDefinition>` no JSON

**Codebook Panel (UI):**
- `hierarchyHelpers.ts`: `buildFlatTree` (virtual scroll com FlatCodeNode | FlatFolderNode), `buildCountIndex` (contagem direta + agregada)
- `codebookTreeRenderer.ts`: virtual scrolling, folder rows (icone) vs code rows (chevron + swatch)
- `codebookDragDrop.ts`: reparent, merge, move-to-folder
- `codebookContextMenu.ts`: Rename, Add child, Move to folder, Merge, Delete (codigos) + Rename, Delete (pastas)
- `mergeModal.ts`: FuzzySuggestModal com preview de impacto e destino configuravel

### 5.2 DataManager

- Cache in-memory + save debounced (500ms)
- Section-based: `dataManager.section('markdown')`, `setSection('csv', data)`
- Merge automático de defaults no load
- `flushPendingSave()` no `onunload()` — garante persistência

**Adicionalmente no markdown**: Model-level debounce de 2s via `markDirtyForSave()` (separado do DataManager). `flushPendingSave()` no unload do model.

### 5.3 Engine Registration Pattern

Cada engine exporta `registerXxxEngine()` que retorna `EngineRegistration<Model>`:
```typescript
type EngineCleanup = () => void | Promise<void>;

interface EngineRegistration<M> {
  cleanup: EngineCleanup;
  model: M;
}
```

`main.ts` (~180 LOC) é o único ponto que conhece todos os engines. Responsabilidades:
- Bootstrap: DataManager, CodeDefinitionRegistry, auto-persist via onMutate
- Registro dos 7 engines (cada um retorna cleanup + model)
- Montagem do UnifiedModelAdapter com adapters de todos os engines
- Cross-engine navigation (label-click, code-click → sidebar detail)
- Sidebar view registration (Code Explorer, Code Detail)
- Cleanup reverso no onunload

Não deve implementar lógica de engine — apenas coordenar. O acoplamento é intencional — um plugin com 7 engines precisa de exatamente 1 ponto que conhece todos. Reavaliar se ultrapassar ~250 LOC.

### 5.4 dataConsolidator + ConsolidationCache — consolidação com cache incremental

`analytics/data/dataConsolidator.ts` expõe 6 funções puras por engine (`consolidateMarkdown`, `consolidateCsv`, etc.) + `consolidateCodes` + `consolidate()` como composição. Cada função retorna `EngineSlice { markers, hasData }`. É o único lugar que conhece todos os formatos — isso é feature (consistência cross-engine), não fragilidade.

`analytics/data/consolidationCache.ts` (`ConsolidationCache`) envolve o consolidator com cache por engine. Dirty flags por engine (`Set<EngineType>`) + `registryDirty` como dimensão separada. Quando um engine muda, só ele é reprocessado — os demais mantêm cache. Wiring no `main.ts` via `invalidateEngine()` nos `onChange` dos models e `invalidateRegistry()` no `addOnMutate` do registry.

### 5.5 analyticsView — state management sem framework

`analyticsView.ts` (~340 LOC) gerencia ~22 campos de estado organizados por concern. Cada mode module recebe o ctx via interface tipada (`AnalyticsViewContext`), sem acessar o view direto. A statefulness é custo inerente de UI sem framework. Se o state crescer além de ~25 campos, agrupar em sub-objetos por concern (ex: `wordCloudState: { lang, minLength, maxWords }`).

### 5.7 Relations Network (Fase E)

`relationsNetworkMode.ts` — visualização de rede baseada em relações explícitas (não co-ocorrência). Usa `relationsEngine.ts` para extrair arestas de `CodeDefinition.relations` e `CodeApplication.relations`.

- **Níveis**: toggle "Code-level | Code + Segments" via `ctx.relationsLevel`
- **Arestas**: sólida (code-level), tracejada (segment-level), dash-dot (merged quando mesma aresta nos dois níveis)
- **Espessura**: `Math.min(1 + weight, 8)` — weight = contagem de markers distintos
- **Direção**: arrowheads para relações direcionais
- **Hover tooltip**: hit-testing point-to-segment no canvas (threshold 6px)
- **Dados**: lê markers raw via `readAllData(ctx.plugin.dataManager)` — não usa consolidated data (relações vivem em `CodeApplication`, não em `ConsolidatedData`)
- **CSV export**: source, target, label, directed, level, weight

### 5.8 Shared Files

```
src/
  core/
    baseSidebarAdapter.ts    — base class for all sidebar adapters (listener wrapping, hover state, deleteCode, updateMarkerFields)
    markerResolvers.ts       — shared marker lookup/resolution utilities across engines
  media/
    mediaCodingModel.ts      — shared CodingModel for audio/video engines
    mediaSidebarAdapter.ts   — shared sidebar adapter for audio/video engines
    mediaCodingMenu.ts       — shared coding menu for audio/video engines
  analytics/board/
    boardTypes.ts            — TypeScript types for Research Board nodes, arrows, connections
    fabricExtensions.d.ts    — Fabric.js type extensions for custom node properties
  obsidian-internals.d.ts    — type declarations for undocumented Obsidian internals
```

### 5.9 REFI-QDA Export/Import

Módulo `src/export/` implementa export nos formatos QDC (codebook) e QDPX (projeto completo) do padrão REFI-QDA v1.5. Módulo `src/import/` implementa o caminho inverso.

**Export — Arquitetura em camadas**:

1. `xmlBuilder.ts` — primitivas XML (escaping, atributos, elementos). Zero dependência de DOM
2. `coordConverters.ts` — conversão de coordenadas por engine:
   - Markdown: `lineChToOffset()` (CM6 line:ch → Unicode codepoint offset)
   - PDF shapes: `pdfShapeToRect()` (normalized 0-1 → PDF points, bottom-left origin, ellipse/polygon via bounding box)
   - Image: `imageToPixels()` (normalized 0-1 → pixel bounding box)
   - Media: `mediaToMs()` (seconds float → milliseconds integer)
3. `qdcExporter.ts` — codebook XML. `buildCodebookXml(registry, namespace?)` gera hierarquia por nesting recursivo via `getChildren()`. Namespace opcional para embedding em `<Project>` (herda do pai)
4. `qdpxExporter.ts` — projeto completo. Source builders por engine (`buildTextSourceXml`, `buildPdfSourceXml`, `buildImageSourceXml`, `buildAudioSourceXml`, `buildVideoSourceXml`). Cada builder gera `<Source>` + `<Selection>` + `<Coding>` + `<NoteRef>`. `exportProject()` orquestra tudo + ZIP via fflate
5. `exportModal.ts` — UI pre-export (formato, toggle sources, disclaimer CSV)
6. `exportCommands.ts` — 2 commands na palette + botão no analytics + factory `openExportModal()`

**Padrões chave**:
- **GUID correlation**: Cada source builder armazena `guidMap.set('source:' + filePath, srcGuid)`. O helper `addSourceFile()` lê esse GUID para garantir que o path `internal://` no XML e o entry no ZIP coincidam
- **Memos como Notes**: Marker com `memo` gera `<Note>` + `<NoteRef>` no `<Selection>`. GUID do note: `note_{selectionGuid}`
- **Relations como Links**: `buildLinksXml()` converte `CodeDefinition.relations` e `CodeApplication.relations` em `<Link>` com `direction` (Associative/OneWay)
- **Warnings**: `ExportResult.warnings[]` acumula problemas (source missing, PDF offsets approximate, image dimensions unreadable). Modal exibe via Notice

**Import** (`src/import/`) — Arquitetura em camadas:

- **xmlParser.ts**: Helpers DOMParser — `parseXml`, `getChildElements`, `getAttr`, `getNumAttr`, `getTextContent`, `getAllElements`
- **coordConverters.ts**: Conversão inversa — `offsetToLineCh` (codepoint→CM6 line:ch com surrogate pairs), `pdfRectToNormalized` (PDF points bottom-left→0-1), `pixelsToNormalized`, `msToSeconds`
- **qdcImporter.ts**: `parseCodebook` (recursivo com hierarquia + NoteRef→description), `applyCodebook` (merge/separate + guidMap QDPX→Qualia)
- **qdpxImporter.ts**: `parseSources` (5 tipos), `parseNotes` (com detecção `[Magnitude: X]`), `parseLinks`, `previewQdpx`, `importQdpx` (ZIP→vault: extrai sources, cria markers por engine, batch de text markers com offset→lineCh, memos standalone como .md, `applyLinks` code-level + marker-level)
- **importModal.ts**: File picker, preview com contagem, dropdown conflitos, toggle sources, flows QDC e QDPX separados
- **importCommands.ts**: `import-qdpx`, `import-qdc` na palette + botão analytics
- **Magnitude round-trip**: Export codifica `CodeApplication.magnitude` como Note `[Magnitude: X]` via `buildCodingXml(codes, guidMap, createdAt, notes)`. Import detecta prefixo e reconstrói magnitude no `CodeApplication`

---

## 6. Case Variables

Sistema de propriedades tipadas por arquivo (mixed-methods: cruzar códigos × metadata demográfica). Funciona para todos os 7 formatos — md, pdf, image, audio, video.

### Abstração central — CaseVariablesRegistry

`src/core/caseVariables/caseVariablesRegistry.ts` — instância única criada no `main.ts`, inicializada/descarregada via `this.cleanups`. API async de leitura/escrita por `fileId`. Emite `addOnMutate` callbacks em toda mutação; o `main.ts` usa esse hook para invalidar o `consolidationCache` global.

### Storage 3-caminhos

| Formato | Source of truth | Mirror em data.json |
|---------|----------------|---------------------|
| **Markdown** | Frontmatter (`fileManager.processFrontMatter`) | Sim — sincronizado por `metadataCache.on('changed')` |
| **Binários** (PDF, Image, Audio, Video) | `data.json.caseVariables.values[fileId]` | É o primário (não há frontmatter possível) |

**Sync reativo (Markdown)**: `metadataCache.on('changed')` dispara após qualquer escrita em frontmatter. O registry escuta esse evento e atualiza o mirror em memória. Quando a escrita foi feita pelo próprio plugin, `writingInProgress: Set<fileId>` impede a re-notificação (reentrancy guard — detalhe em `TECHNICAL-PATTERNS.md §15`).

### Type resolution (cascata)

1. `metadataTypeManager` do Obsidian (API interna via `obsidianInternalsApi.ts`) — resolve tipos de propriedades definidos pelo usuário no Obsidian
2. Mapa próprio do plugin (`data.json.caseVariables.types`)
3. `'text'` como fallback

`inferPropertyType.ts` infere tipo via regex (number / date / datetime / checkbox / text) para valores sem tipo declarado.

### UI layers

| Camada | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| **PropertiesEditor** | `propertiesEditor.ts` | Componente DOM base: render de rows, inline edit, add row, confirm remove |
| **PropertiesPopover** | `propertiesPopover.ts` | Wrapper popover injetado via `view.addAction` em todo FileView |
| **CaseVariablesView** | `caseVariablesView.ts` | ItemView (painel lateral) — registrado com `CASE_VARIABLES_VIEW_TYPE` + comando `open-case-variables-panel` |

### Integração com o resto do sistema

- **Lifecycle de arquivos**: `registerFileRename` + `vault.on('delete')` propagam rename/delete para o registry. Botão de ação injetado em todo FileView via `active-leaf-change` listener no `main.ts`.
- **Analytics filter**: `caseVariableFilter` em `FilterConfig` — aplicado no nível da `AnalyticsView` antes de qualquer mode module. Não toca nos 6 stats engines.
- **Cache invalidation**: `caseVariablesRegistry.addOnMutate(() => consolidationCache.invalidateAll())` — mudança em qualquer variável invalida o cache analítico global.
- **QDPX export/import**: `src/export/caseVariablesXml.ts` gera `<Variable>` dentro de cada `<Source>` + seção `<Cases>` com `<SourceRef>`. Round-trip preserva tipos (number permanece number, boolean permanece boolean).

### Schema

`QualiaData` ganhou campo `caseVariables: CaseVariablesSection` (`{ values: Record<fileId, Record<string, VariableValue>>; types: Record<string, PropertyType> }`). Default `{values:{}, types:{}}` em `createDefaultData()` e `clearAllSections()`.

### Arquivos

```
src/core/caseVariables/
  caseVariablesTypes.ts      — PropertyType, VariableValue, CaseVariablesSection, OBSIDIAN_RESERVED
  obsidianInternalsApi.ts    — encapsula metadataTypeManager do Obsidian (API interna)
  caseVariablesRegistry.ts   — classe central (CRUD, initialize/unload, sync, events)
  typeIcons.ts               — mapping PropertyType → Lucide icon
  inferPropertyType.ts       — regex-based type inference (number/date/datetime/checkbox/text)
  propertiesEditor.ts        — componente DOM (render + inline edit + add row + confirm remove)
  propertiesPopover.ts       — wrapper popover via view.addAction
  caseVariablesView.ts       — painel lateral (ItemView)
  caseVariablesViewTypes.ts  — constante CASE_VARIABLES_VIEW_TYPE
src/export/
  caseVariablesXml.ts        — QDPX helpers (renderVariableXml, variableTypeToQdpx, renderVariablesForFile, renderCasesXml)
```

---

## 7. Research Board

Canvas Fabric.js para síntese de findings:

### 6 tipos de nó
1. **Sticky notes** — cor selecionável, texto livre
2. **Chart snapshots** — captura de qualquer visualização analítica
3. **Text excerpts** — trechos de qualquer marker
4. **Code cards** — estatísticas de um código (frequência, co-ocorrência)
5. **KPI cards** — métricas customizadas
6. **Cluster frames** — agrupamentos visuais (Group com Rect+Textbox, sendToBack)

### Conexões
- Arrows como Line + Triangle **separados** (NÃO Group) — linkados por boardId
- Connections bidirecionais entre nós

### Phases

1. **Phase 1 — Canvas fundation**: Fabric.js canvas, pan/zoom, grid snap, serialization to `board.json`.
2. **Phase 2 — Sticky notes**: Color picker, inline text editing (double-click to edit via `IText`), resize handles.
3. **Phase 3 — Data-linked nodes**: Excerpt nodes from markers, Code cards with live stats, KPI cards with custom formulas.
4. **Phase 4 — Connections**: Arrow drawing between nodes (Line + Triangle, NOT Group), connection persistence by `boardId`.
5. **Phase 5 — Chart snapshots**: Capture any analytics visualization as PNG `dataUrl`, embed in canvas.
6. **Phase 6 — Cluster frames**: Group semantics via `Rect` + `Textbox` (sendToBack), grid layout 2 columns, drag children in/out.

### File Architecture

```
src/analytics/board/
  boardCanvas.ts        — Fabric.js canvas lifecycle, pan/zoom, grid snap
  boardNodes.ts         — Node factory: createSticky, createExcerpt, createCodeCard, etc.
  boardNodeHelpers.ts   — Shared node helpers (cardBg, textbox, badges, theme)
  boardArrows.ts        — Arrow creation (Line + Triangle), connection tracking by boardId
  boardToolbar.ts       — Toolbar UI: add node buttons, zoom controls, export
  boardData.ts          — Serialization/deserialization of board state
  boardDrawing.ts       — Freehand drawing mode
  boardClusters.ts      — Code card clustering by co-occurrence
  boardTypes.ts         — Discriminated union types for board nodes
  fabricExtensions.d.ts — Ambient types for Fabric.js custom properties
src/analytics/views/
  boardView.ts          — ItemView lifecycle, canvas events, drag & drop
  boardPersistence.ts   — board.json read/write/clear via DataAdapter
  boardContextMenu.ts   — Right-click context menu for board nodes
```

### Per-Node-Type Details

| Node Type | Key Behavior |
|-----------|-------------|
| **Sticky** | Inline editing via double-click (`IText`), color selecionável (8 preset colors), resize handles |
| **Snapshot** | PNG `dataUrl` embedded, captured from any analytics chart, read-only display |
| **Excerpt** | Source badge (file + line range), code chips with swatches, text content truncated with ellipsis |
| **Code Card** | Code swatch + frequency count + source badges (which files), click navigates to Code Detail |
| **KPI Card** | Big numeric value + label + accent color bar, custom formula or auto-computed |
| **Cluster Frame** | Grid layout 2 columns, `Rect` + `Textbox` Group with `sendToBack`, children draggable in/out |

### Persistência
- `board.json` — arquivo separado do `data.json`
- Path migrado de formato legacy (Decisão D19 do merge)

---

## 8. Performance Considerations

### Thresholds documentados
- **500+ markers/arquivo** → considerar interval tree em vez de linear scan no `getMarkersInRange()`
- **1000+ decorations/viewport** → degradação de scroll no CM6
- **Sidebar refresh** → debounce 300ms+ para evitar re-render a cada keystroke
- **PDF 50+ páginas** → lazy rendering via `textlayerrendered` event por página

### Bundle size
- Output: `main.js` (~2.17 MB bundled)
- Lazy imports pontuais: `svd-js`, `Chart.js` (via `await import()` sob demanda)

### 3.10 Lazy Loading / Code Splitting — Decisão definitiva de NÃO fazer

**Contexto**: A Camada 12 do merge plan propunha multi-build esbuild para reduzir o bundle (~2.17 MB → ~210 KB + engines sob demanda). Esse assunto foi levantado e revisitado múltiplas vezes durante o desenvolvimento. A pesquisa abaixo encerra a discussão.

#### O que impede: Limitação da plataforma Obsidian (não do plugin)

**1. A community store só distribui 3 arquivos**

Quando um usuário instala um plugin pela store, Obsidian baixa **exatamente**: `main.js`, `manifest.json`, `styles.css`. Nenhum outro arquivo é baixado. Não existe mecanismo para distribuir chunks adicionais (`.js`, `.zip`, assets). Já houve [feature request no forum](https://forum.obsidian.md/t/support-for-assets-in-plugins/25837) para suporte a assets — nunca implementado.

**2. Obsidian carrega plugins via `eval()`, não via module system**

Plugins são carregados via `eval()` do JavaScript — não por `<script>` tags, não por `import()`, não por `require()`. Consequências:
- `__dirname` retorna o path do app Electron (`.asar`), **não** o diretório do plugin
- Não existe cadeia de resolução de módulos para arquivos adicionais
- `require('./chunk.js')` procuraria no lugar errado

Fonte: [How to debug Obsidian plugins](https://mnaoumov.wordpress.com/2022/05/10/how-to-debug-obsidian-plugins/)

**3. esbuild `splitting: true` exige ESM — Obsidian exige CJS**

Da documentação oficial do esbuild:
> "Code splitting currently only works with the `esm` output format."

O [issue #1341](https://github.com/evanw/esbuild/issues/1341) pedindo suporte a CJS splitting foi fechado sem perspectiva de implementação. Obsidian plugins **precisam** de `format: "cjs"` porque o loader via `eval()` espera CommonJS. Incompatibilidade fundamental.

**4. `require()` manual não resolve distribuição**

Em teoria, `require()` funciona no Electron desktop para carregar `.js` do disco. Mas:
- `__dirname` aponta pro lugar errado (precisa hackear path via `app.vault.adapter.getBasePath()`)
- **A store não distribui os chunks** — o usuário nunca receberia os arquivos
- No mobile, `require()` para arquivos arbitrários é **bloqueado**

**5. `import()` dinâmico funciona... para URLs externas**

`await import('https://cdn.jsdelivr.net/npm/...')` funciona no Electron. Mas requer internet, carrega de CDN (não local), e não passaria na review da community store (dependência de rede para funcionalidade core).

Fonte: [Using third party libraries by dynamic imports (forum)](https://forum.obsidian.md/t/using-third-party-libraries-by-dynamic-imports/66203)

#### O que outros plugins grandes fazem

Todos os plugins relevantes shippam **um único `main.js` monolítico**:

| Plugin | main.js | Code splitting? |
|--------|---------|-----------------|
| **Excalidraw** | **8.2 MB** | Não |
| **Dataview** | **2.4 MB** | Não |
| **Qualia Coding** | **2.1 MB** | Não |
| **Kanban** | ~1 MB | Não |

Quando um usuário pediu ao autor do Excalidraw para dividir o bundle de 8.2 MB ([issue #2349](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/2349)), a resposta foi:

> **"You need to raise this with the Obsidian devs. I can't do anything about this."**

O issue foi fechado. O autor do Excalidraw — um dos devs mais experientes do ecossistema — confirmou que é limitação da plataforma, não do plugin.

#### O que fazemos em vez disso

- `minify: true` em produção (já ativo)
- `treeShaking: true` (já ativo)
- `await import()` pontual para `svd-js` e `Chart.js` (lazy load de libs pesadas sem refatorar o build)
- Aceitar que 2.1 MB é normal (Excalidraw é 4× maior)

#### Conclusão

Code splitting em plugins Obsidian é uma **limitação da plataforma**: distribuição (3 arquivos), loader (`eval()`), formato (CJS obrigatório), e mobile (sem `require()`). Todo plugin grande do ecossistema aceita o bundle monolítico. Não é otimização prematura — é impossibilidade técnica para plugins distribuídos pela community store.

Reavaliável apenas se Obsidian mudar seu sistema de carregamento de plugins para suportar ESM ou distribuição de múltiplos arquivos.

### Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **data.json migration** | Data loss if schema changes without migration path | Always provide migration functions; never drop fields; merge defaults on load |
| **UX with 20+ codes ("color soup")** | Visual clutter makes highlights unreadable | Toggle code visibility in sidebar; opacity blending for overlapping decorations |
| **Empty Code Explorer (onboarding)** | New users see empty sidebar, unclear next step | Placeholder message with "Create your first code" CTA + sample workflow |
| **Plugin conflicts (Highlighter, Comments, PDF++)** | CSS collisions, event interception, DOM mutation | Strict CSS namespacing (`codemarker-` prefix); feature detection over version checks; no monkey-patching |
| **Mobile sidebar behavior** | Sidebar collapses differently on mobile Obsidian | Desktop-only target (v1.5.0+); mobile support deferred |
| **vault.adapter vs loadData concurrency** | `loadData()` só no bootstrap, depois tudo em memória. Sync externo (Dropbox, iCloud, Git) pode sobrescrever `data.json` em runtime → lost update (não só stale read). Limitação da plataforma: toda a API `loadData/saveData` do Obsidian funciona assim. | Single DataManager instance; debounced saves; `flushPendingSave()` on unload. **Não reconcilia mudanças externas em runtime.** Reavaliável com `vault.on('raw')` se necessário. |
| **Leaf view DOM without framework** | Verbose imperative UI code; hard to maintain | Base classes (`BaseCodeExplorerView`, `BaseCodeDetailView`) with abstract methods; eventual extraction to shared components |
| **Analytics concentration** (Codex) | 62 arquivos, ~11.800 LOC — maior fatia do sistema, ponto provável de regressão e lentidão | Split em 19 mode modules (feito); monitorar crescimento; lazy imports para Chart.js/svd-js |
| **data.json com vaults grandes** (Codex) | Persistência monolítica pode virar gargalo com centenas de markers densos | JSON suficiente para volume QDA típico; caminho de migração mantido aberto (§3.4) |
| **Registry rename collision** (Codex) | ~~`update()` sem guard~~ | **FEITO** — guard rejeita rename se nome existe (+4 testes) |
| **Clear All Markers lifecycle** (Codex) | ~~Board, Image, Analytics, models em memória não limpavam~~ | **FEITO** — evento `qualia:clear-all` + `clearAll()` nos models + `clearBoard()` |
| **FileInterceptor destrói multi-pane** (Codex) | `leaf.detach()` + singleton leaf por engine — quebra workflow nativo | Bug de UX. Ref: mirror-notes viewId pattern. |
| **CI coverage** (Codex) | ~~thresholds não eram gate real~~ | **FEITO** — `vitest run --coverage` no CI, thresholds 30/25/30/30 |
| **View readiness** (Codex) | Race conditions em Board e Image por falta de contrato de readiness | **FEITO** — Two-phase: polling descobre a view (max 500ms), `waitUntilReady()` promise garante que canvas/dados estão prontos. Error paths resolvem via `try/finally` (Board) e `catch` (Image). Load race em Image prevenido por generation counter. |

---

## 9. Compatibility

### PDF.js versions
- Obsidian v1.7.7: `OldTextLayerBuilder` com `textDivs`/`textContentItems`
- Obsidian v1.8.0+: `TextLayerBuilder` com `.textLayer` nested
- `getTextLayerInfo()` usa **feature detection** (não version check)

### PDF++ compatibility
- CSS prefixado `codemarker-` (nunca `pdf-plus-`)
- Highlight layer separada
- Sem monkey-patching de internals do PDF.js
- Sem interceptação de eventos conflitante

### Obsidian API
- Target: v1.5.0+ (desktop only)
- `(item as any).dom` para acessar DOM de componentes nativos — hack que pode quebrar

---

## 10. Visual Approach Analysis

Como representar N códigos no mesmo trecho de texto? Quatro opções foram avaliadas:

### Option A — Cor por Código (N decorations)

Cada código aplica sua própria `Decoration.mark` com cor de background. Quando N códigos se sobrepõem, N decorações empilham com opacity blending.

**Pros**: Intuitivo (cor = código), padrão em QDA tools, visual rico.
**Cons**: "Color soup" com >5 códigos sobrepostos; cores misturadas perdem identidade; daltônicos impactados.

### Option B — Barras na Margem / Gutter

Barras verticais coloridas na margem esquerda (estilo MAXQDA/NVivo). Cada código ocupa uma coluna.

**Pros**: Escala para N códigos sem poluir o texto; hierarquia visual clara; labels possíveis.
**Cons**: Ocupa espaço horizontal; complexidade de layout (collision avoidance, dynamic columns); requer panel extension separada.

### Option C — Indicadores Inline Mínimos

Pequenos chips/dots inline no início ou fim do trecho codificado.

**Pros**: Mínimo footprint visual; não altera leitura do texto.
**Cons**: Difícil localizar visualmente; não mostra extensão do trecho; sem affordance para interação.

### Option D — Hover Tooltip

Nenhuma decoração visível permanente. Hover sobre texto revela tooltip com códigos atribuídos.

**Pros**: Zero poluição visual; pragmático como ponto de partida; implementação simples (~100 LOC).
**Cons**: Sem indicação visual de que texto está codificado; depende de hover (sem mobile); descobrabilidade zero.

### Combinatorial Analysis

| Combination | Visual Clarity | Scalability (20+ codes) | Implementation Cost | Mobile-Friendly |
|-------------|---------------|------------------------|--------------------|-----------------|
| A alone | ★★★★ | ★★ | Medium | ✅ |
| B alone | ★★★★★ | ★★★★★ | High | ✅ |
| A + B | ★★★★★ | ★★★★ | High | ✅ |
| A + D | ★★★★ | ★★★ | Medium | ❌ |
| B + D | ★★★★★ | ★★★★★ | High | ❌ |
| D alone | ★★ | ★★★★★ | Low | ❌ |

**Decisão**: **D alone is the most pragmatic starting point.** Minimal implementation cost, allows iterating on the interaction model before committing to visual decoration complexity. A + B is the long-term target (implemented as margin bars + per-code decorations with opacity blending).

---

## 11. Projects + Workspace Data Model

### TypeScript Interfaces

```typescript
interface Workspace {
  activeProject: string | null;  // null = global
  codes: CodeDefinition[];
  segments: Segment[];
  projects: QDAProject[];
  settings: { /* per-workspace settings */ };
}

interface Code extends CodeDefinition {
  scope: 'global' | string;     // global or projectId
  parentId?: string;
  memo?: string;
  weight?: number;
}

interface Segment {
  id: string;
  fileId: string;
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  codeIds: string[];
  memo?: string;
  weight?: number;
  created: number;
}

interface QDAProject {
  name: string;
  created: string;
  documents: string[];
  codebook: { codes: Code[]; codeGroups: CodeGroup[] };
  segments: Segment[];
  memos: Memo[];
  documentVariables: { fileId: string; variables: Record<string, any> }[];
  savedQueries: SavedQuery[];
}
```

### File Structure

```
.obsidian/plugins/qualia-coding/
  data.json          — global workspace (codes, segments, per-engine sections)
  board.json         — Research Board canvas state
  projects/
    <projectId>/
      project.json   — QDAProject metadata + codebook + segments
      board.json     — per-project Research Board (optional)
```

### Inheritance Model — Codes Shared by ID

- **Global codes** live in `data.json` under `registry.definitions`. Markers reference them by **stable ID** (`codes: CodeApplication[]` onde `CodeApplication = { codeId: string; magnitude?: string; relations?: Array<{ label: string; target: string; directed: boolean }> }`).
- **Why IDs:** Renomear um código é operação atômica no registry — sem necessidade de propagar para markers. Eliminamos `renameCode()` de todos os models e adapters. Nomes são resolvidos via `registry.getById(codeId)` apenas para display.
- **Helpers centralizados** em `codeApplicationHelpers.ts`: `hasCode(codes, codeId)`, `getCodeIds(codes)`, `addCodeApplication(codes, codeId)`, `removeCodeApplication(codes, codeId)`.
- **Delete cascades:** `deleteCode(codeId)` removes the code from all markers and deletes the definition. Markers left with no codes are also removed.
- **Legacy migration:** `loadMarkers()` no markdown converte `string[]` → `CodeApplication[]` automaticamente. `extractCodes()` no analytics aceita ambos os formatos.

---

## 12. Leaf View Layout

### Wireframe — Unified Analysis Workspace

```
┌─────────────────────────────────────────────────────┐
│ [Project: Global ▼]                                  │
├──────────┬──────────────────────────┬───────────────┤
│ Codebook │  Segments  Matrix  Docs  │               │
│ ├ Emotion│  ┌─────────────────────┐ │               │
│ │ ├ Joy  │  │ Selected segments   │ │               │
│ │ ├ Sad  │  │ with context...     │ │               │
│ │ └ Fear │  └─────────────────────┘ │               │
│ ├ Action │                          │               │
│ └ Theme  │                          │               │
├──────────┴──────────────────────────┴───────────────┤
│ Memo: [current code memo]  │ Props  │ Quick Stats   │
└─────────────────────────────────────────────────────┘
```

### Layout Zones

1. **Top bar** — Project selector dropdown. Switches `activeProject` in workspace. "Global" = all data.
2. **Left panel (Codebook)** — Hierarchical tree of codes. Drag-and-drop reorder. Right-click context menu for rename/merge/delete. Corresponds to `UnifiedCodeExplorerView`.
3. **Center panel (Tabs)** — Tab switcher between Segments (text retrieval), Matrix (co-occurrence), Docs (document list with variables). Each tab is a sub-view within the leaf.
4. **Bottom bar** — Contextual: shows memo editor for selected code, property inspector for selected segment, and quick statistics (frequency, density).

### Implementation Notes

- Built as an `ItemView` registered via `registerView()`.
- DOM constructed imperatively (no framework) — follows pattern from `BaseCodeExplorerView` / `BaseCodeDetailView`.
- Tab switching uses `display: none` toggling (not destroy/recreate) to preserve scroll state.
- Project dropdown triggers full refresh of codebook tree and segment list.

---

## 13. Cross-Engine Consolidation Results

### LOC Savings

| Metric | Before (6 plugins) | After (unified) | Reduction |
|--------|-------------------|-----------------|-----------|
| Total LOC | ~10,487 | ~4,170 | **~60%** |

### Per-Component Breakdown

| Component | Before (instances × engines) | After | Savings |
|-----------|------------------------------|-------|---------|
| CodeDefinitionRegistry | 6 copies (1 per engine) | 1 (`core/codeDefinitionRegistry.ts`) | 5 removed |
| CodeFormModal | 5 copies | 1 (`core/codeFormModal.ts`) | 4 removed |
| SharedRegistry bridge | 6 adapter files | 0 (direct import) | 6 removed |
| Context menus | 5 duplicated menus | 1 (`core/codingPopover.ts`) | 4 removed |
| Sidebar views | 12 files (Explorer + Detail × 6) | 2 (`unifiedExplorerView.ts` + `unifiedDetailView.ts`) | 10 removed |
| Settings tab | 7 separate tabs | 1 (`core/settingTab.ts`) | 6 removed |

### Coding Model Lifecycle — Method Comparison (15 methods × 6 engines)

| Method | MD | PDF | CSV | Image | Audio | Video |
|--------|-----|-----|-----|-------|-------|-------|
| `getMarkers()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `addCode()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `removeCode()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `removeMarker()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `getMemo()` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `setMemo()` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `deleteCode(codeId)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `save()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `getActiveCodes()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `setHoverState()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `navigateToMarker()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `getMarkerLabel()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `findExistingMarker()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `findOrCreateMarker()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `getMarkersForFile()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Base Class Abstract Methods

**`BaseCodeExplorerView`** (4 abstract methods):
1. `getTreeItems(): TreeItem[]` — Return hierarchical code → file → segment tree
2. `onCodeClick(code: CodeDefinition): void` — Handle code selection (open detail view)
3. `onSegmentClick(segment: BaseMarker): void` — Handle segment navigation
4. `getContextMenuItems(node: TreeNode): MenuItem[]` — Return context menu entries for tree node

**`BaseCodeDetailView`** (4 abstract methods):
1. `renderSegmentPreview(marker: BaseMarker): HTMLElement` — Engine-specific segment preview
2. `getNavigationAction(marker: BaseMarker): () => void` — Return navigation callback
3. `getMarkerLabel(marker: BaseMarker): string` — Human-readable marker description
4. `getSortedMarkers(codeId: string): BaseMarker[]` — Return markers sorted by engine-specific ordering

**`BaseSidebarAdapter`** — shared base class for all sidebar adapters (PDF, CSV, image, audio, video). Handles listener wrapping, hover state, `deleteCode()`, and `updateMarkerFields()` (with `notifyAfterFieldUpdate()` hook). PDF overrides both for dual text/shape handling. CSV overrides the notification hook for `notifyAndSave()`. Markdown implements `SidebarModelInterface` directly on its model.

### Bugs Found During Consolidation

| # | Bug | Severity | Engine | Status |
|---|-----|----------|--------|--------|
| 1 | Duplicate tab registration on file re-open — `registerView` called multiple times | High | All | Fixed (deduplicate in `main.ts`) |
| 2 | Stale hover state after code rename — `hoveredCodeName` referenced old name | Medium | Markdown | Fixed (clear hover on rename) |
| 3 | Phantom markers in CSV segment editor — `addMarkerDirect()` not cleaned on cell close | High | CSV | Fixed (cleanup in `onCellEditorClose`) |
| 4 | Missing `updatedAt` field in audio/video markers — analytics time-series broken | Medium | Audio/Video | Fixed (added `updatedAt` to `MediaMarker`) |
| 5 | Race condition in sidebar refresh — `notify()` triggered before `save()` completed | Low | All | Fixed (await save before notify) |

---

## 14. Avaliação Externa (Codex, 2026-03-19)

> Análise independente feita pelo Codex sobre o estado do projeto.

### Visão geral

O projeto é um plugin de análise qualitativa para Obsidian com **escopo incomum para um plugin desktop**: 6 engines de anotação por formato, sidebar unificada e uma camada forte de analytics. A arquitetura central está bem pensada: o bootstrap em `src/main.ts` é simples, registra engines independentes e conecta tudo por um registro compartilhado (`CodeDefinitionRegistry`) e um adaptador unificado (`UnifiedModelAdapter`). A persistência via `DataManager` é direta e previsível, o que reduz complexidade operacional.

Em termos de porte, a base já é relevante: 163 arquivos TypeScript em `src/`, com maior concentração em analytics (62 arquivos, ~11.800 linhas). O bundle compilado `main.js` está em torno de 2.1 MB.

### Pontos fortes identificados

1. **Modelo unificado como melhor decisão**: `CodeDefinitionRegistry` centraliza identidade e cor dos códigos, e `UnifiedModelAdapter` consolida operações sem forçar um engine "saber demais" sobre o outro — boa base para evoluir sem reescrever.
2. **Maturidade de engenharia acima da média para plugin Obsidian**: testes unitários (Vitest), testes E2E/visuais (wdio), suíte completa passando (39 suites, 1269+ testes). Documentação de produto, arquitetura e roadmap consistente com o código — reduz risco de conhecimento tácito.

### Riscos e gargalos

1. **Concentração de complexidade em analytics** — maior fatia do sistema, ponto mais provável de regressão, lentidão e dificuldade de manutenção.
2. **Bundle monolítico** — qualquer crescimento futuro em gráficos, board ou mídia impacta tempo de carga e depuração. (Mitigação documentada na §3.10: limitação da plataforma Obsidian, não do plugin.)
3. **Persistência única em `data.json`** — simples e bom para velocidade de desenvolvimento, mas pode virar gargalo com vaults grandes, histórico denso de marcações ou analytics pesadas. Não é erro agora; é limite arquitetural previsível. (Mitigação documentada na §3.4: JSON suficiente para volume QDA, caminho de migração mantido aberto.)

### Achados novos da segunda análise (com docs)

Na segunda passagem, lendo ARCHITECTURE.md e BACKLOG.md antes de analisar código, o Codex encontrou 4 itens não mapeados:

1. **Bug: rename collision no registry** — `update()` em `codeDefinitionRegistry.ts:80` renomeia sem verificar se o nome destino já existe. Resultado: duas definitions com mesmo nome, `nameIndex` inconsistente, códigos fantasma. **Confirmado no código — sem teste cobrindo.**
2. **Gap: Clear All Markers não limpa Board** — `clearAllSections()` zera `data.json` mas `board.json` persiste. Snapshots e code cards ficam apontando para dados inexistentes. Modal promete wipe global mas não entrega.
3. **Trade-off questionável: fileInterceptor `leaf.detach()`** — destrói a leaf quando arquivo já está aberto em outra view do target type. Impede workflow multi-pane (comparar mesmo artefato em painéis lado a lado).
4. **CI abaixo da narrativa** — `npm test` não roda coverage (thresholds são decorativos), CI e2e executa só smoke spec.

Também observou que a sidebar está **superdocumentada para capacidade não materializada** — drag-and-drop reorder, merge, export, hierarquia ainda não existem no código, embora a decisão de sidebar esteja justificada como investimento futuro.

### ~~Oportunidade identificada: incremental refresh/cache por engine~~ — FEITO (2026-03-20)

Implementado em duas camadas:
1. **`ConsolidationCache`** (`analytics/data/consolidationCache.ts`) — cache por engine no pipeline analytics. Dirty flags por engine (`Set<EngineType>`) + `registryDirty`. Só reprocessa engines sujos. Cache hit: ~0.002ms.
2. **`UnifiedModelAdapter` cache** (`core/unifiedModelAdapter.ts`) — dirty flag global + indices `Map<fileId>` e `Map<id>` nas sidebar views. `getMarkersForFile` de O(n×m) para O(1). Views Explorer/Detail com debounce `requestAnimationFrame`.

O gargalo remanescente é CSV/Parquet em memória (`rowDataCache`), que continua lido inteiro. Atacar se aparecer como problema real em vaults pesados.

### Achados da terceira análise — lifecycle assíncrono (2026-03-19)

Na terceira passagem, o Codex focou em **transições entre views vivas e comandos globais**:

1. **Board addToBoard race** — `waitForBoardView()` considerava view pronta ao encontrar instanceof, mas `canvasState` ainda era null durante `onOpen()`. **Fix: `waitUntilReady()` promise.**
2. **Clear All não sincronizava AnalyticsView** — view mostrava dados apagados até reopen. **Fix: escuta `qualia:clear-all`.**
3. **Image navigation timeout 200ms** — falha silenciosa em máquinas lentas. **Fix: `waitUntilReady()` promise substitui setTimeout.**
4. **migrateFilePath não migrava fileStates** — zoom/pan perdido em Image, zoom/lastPosition perdido em Media. **Fix: migra `settings.fileStates` no rename.**
5. **Color picker cancel suspende refresh** — `resumeRefresh()` só no `change` event. **Fix: listener em `blur` como fallback.**
6. **Lixo estrutural** — buckets vazios em Markdown, file containers vazios em Media. **Fix: cleanup no `removeMarker()`.**

**Diagnóstico do Codex**: "A arquitetura está sólida em repouso; o que vaza são transições." Recomendou transformar lifecycle em infraestrutura compartilhada: view ready promise, evento global de invalidation, cleanup de containers vazios.

**Padrões adotados**: `qualia:clear-all` event (3 views escutam) e `waitUntilReady()` promise (Board + Image). Ambos reutilizáveis para futuras views/operações.

### Leitura final do Codex (consolidada após 3 rodadas)

> O projeto está em um estágio sólido, com arquitetura coerente, boa separação entre núcleo e engines, e disciplina de testes real. O core (registry, adapters, DataManager, models) está acima da média para plugins Obsidian. Os pontos frágeis são fluxos imperativos de lifecycle: comandos globais vs views abertas, readiness assíncrona, rename com state auxiliar, e listeners em caminhos alternativos (cancel, blur, close). Após 3 rodadas e 20 fixes, a superfície de bugs convergiu significativamente.

---

## 15. Codebook Evolution (Phases A-E)

O CodeDefinition evoluiu de um registro flat para suportar hierarquia, pastas virtuais, magnitude e relações. Todas as fases foram implementadas sem breaking changes — campos opcionais com defaults seguros.

### 14.1 Hierarquia (Phase A)

**Campos**: `parentId?: string`, `childrenOrder: string[]`, `mergedFrom?: string[]`
**Registry**: `rootOrder: string[]` controla ordem visual dos root codes

Métodos de consulta: `getRootCodes()`, `getChildren()`, `getAncestors()`, `getDescendants()`, `getDepth()`.
Mutação: `setParent(id, parentId, insertBefore?)` com detecção de ciclo.
Delete de pai: filhos promovidos a root.

**Codebook Panel** (evolução do Detail View):
- Navegação stack-based (3 níveis: Codebook → Código → Segmento)
- `codebookTreeRenderer.ts` — virtual scrolling (ROW_HEIGHT=30px, BUFFER_ROWS=10)
- `codebookDragDrop.ts` — drag-drop estilo file explorer (zonas top/middle/bottom por row)
- `codebookContextMenu.ts` — Menu API (Rename, Add child, Move to, Promote, Merge, Color, Delete)
- `mergeModal.ts` — `executeMerge()` (reassigna markers, reparenta filhos, registra `mergedFrom`, deleta sources) + `MergeModal` UI

**Navegação**: refatorada de `codeName` para `codeId` em todo o detail view. Events (`codemarker:label-click`, `codemarker:code-click`) resolvem name→id na borda (`main.ts`).

**Contagem**: colapsado = agregado, expandido = direto. `buildCountIndex()` pré-computa via post-order DFS.

### 14.2 Pastas Virtuais (Phase B)

**Campo**: `folder?: string` no CodeDefinition. `folders: Record<string, FolderDefinition>` no registry.
Containers organizacionais sem significado analítico. Ícone de pasta vs chevron de hierarquia.

### 14.3 Magnitude (Phase D)

**Config**: `magnitude?: { type: 'nominal' | 'ordinal' | 'continuous'; values: string[] }` no CodeDefinition.
**Valor**: `magnitude?: string` no CodeApplication.
Picker fechado — valores declarados são os únicos permitidos. Toggle nas settings controla visibilidade no popover.

### 14.4 Relações (Phase E)

Dois níveis:
- **Código-level**: `CodeDefinition.relations: RelationDefinition[]` — declaração teórica
- **Segmento-level**: `CodeApplication.relations: CodeRelation[]` — interpretação ancorada no dado

Shape: `{ label: string; target: string; directed: boolean }`. Label livre com autocomplete via `<datalist>`.

Funções puras: `relationHelpers.ts` (`collectAllLabels`, `buildRelationEdges`).
Analytics: `relationsEngine.ts` → `relationsNetworkMode.ts` (Network View com nós = códigos, arestas = relações).

### 14.5 REFI-QDA Export/Import

**Export**: `qdcExporter.ts` (codebook XML) + `qdpxExporter.ts` (projeto completo: codes + sources + segments + memos + links + magnitude como Notes).
**Import**: `qdcImporter.ts` (codebook com hierarquia + NoteRef→description) + `qdpxImporter.ts` (5 source types, segments, memos standalone, magnitude, relations via Links).
**Helpers**: `xmlBuilder.ts` (XML generation), `coordConverters.ts` export (lineChToOffset, pdfShapeToRect, imageToPixels, mediaToMs), `xmlParser.ts` + `coordConverters.ts` import (offsetToLineCh, pdfRectToNormalized, pixelsToNormalized, msToSeconds).
**UI**: `exportModal.ts` (pre-export config), `importModal.ts` (conflict resolution).

---

## Fontes

Este documento consolida decisões de:
- `docs/markdown/ARCHITECTURE.md` — estudo arquitetural original (9 partes)
- `docs/CROSS-ENGINE.md` — análise comparativa cross-engine
- `memory/engine-plugins.md` — detalhes por engine
- `memory/image-engine-briefing.md` — briefing de porting do Image
- `memory/board-roadmap.md` — Research Board roadmap + Fabric.js lessons
- Análise comparativa de ferramentas QDA (ATLAS.ti, NVivo, MAXQDA, Dedoose, Taguette)
