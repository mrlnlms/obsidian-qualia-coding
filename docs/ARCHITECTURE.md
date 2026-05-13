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

| Engine | View base | Método de associação | Por quê |
|--------|-----------|----------------------|---------|
| Markdown | `MarkdownView` (nativo) | `registerEditorExtension()` | Integração direta com CM6 — é o editor nativo |
| CSV | `FileView` custom | `registerExtensions(['csv', 'parquet'])` | Obsidian não tem handler nativo para tabular |
| PDF | (viewer nativo) | Instrumentação via MutationObserver | Reusa o viewer nativo do Obsidian |
| Image, Audio, Video | `FileView` custom | `registerFileIntercept` (active-leaf-change) | Obsidian já trata nativamente png/mp3/mp4; `registerExtensions` joga exceção nessas ext |

**Regra**: NUNCA usar `registerExtensions` para `png/jpg/mp3/mp4/webm/...` — Obsidian já tem handler nativo e joga `Error: Attempting to register an existing file extension`, quebrando o plugin no onload.

**FileView lifecycle:** as 4 views custom (CSV, Image, Audio, Video) estendem `FileView`. Ao `setViewState({type, state: {file}})` — seja por user click, command, interceptor ou restore — Obsidian dispara automaticamente `onLoadFile(file)` / `onUnloadFile(file)`. Views usam `this.file: TFile` padrão (sem campos custom tipo `currentFile`).

### Media Opening Toggle (Image/Audio/Video/PDF)

Cada uma das 4 mídias tem 2 settings simétricas no namespace do engine:

- `autoOpen` (default `false`) — abre em Coding View (ou, pro PDF, instrumenta). Quando `false`, cai no viewer nativo do Obsidian sem decoração do plugin.
- `showButton` (default `true`) — adiciona botão `replace-all` no header via `view.addAction`, que alterna entre os dois modos.

Setting global `general.openToggleInNewTab` (default `false`) controla se o toggle via botão/command substitui a aba atual ou abre em nova. Não se aplica ao PDF (toggle é sempre in-place).

**Assimetria arquitetural escondida do usuário:**
- Image/Audio/Video têm views custom → toggle faz `leaf.setViewState` entre tipo nativo (`image`, `audio`, `video`) e tipo coding (`qualia-image-coding`, `qualia-audio-view`, `qualia-video-view`).
- PDF não tem view custom — sempre o PDF viewer nativo do Obsidian. Toggle liga/desliga instrumentação (observer + decorators + drawing) in-place via `plugin.togglePdfInstrumentation(view)`, exposto por `src/pdf/index.ts`. Scroll e página preservados, sem reload.

**Intercept pin per (leaf, file):** com `autoOpen=true`, o interceptor re-intercepta `active-leaf-change`. Quando o user toggla manualmente, o `markLeafHandled(leaf, filePath)` registra o pin em `pinnedFileByLeaf` — o interceptor respeita aquele par `(leaf, file)` até o user abrir arquivo diferente. Pin é resetado no `clearFileInterceptRules` (onunload) pra não sobreviver hot-reload.

**Commands padronizados:** `toggle-image-coding` / `toggle-audio-coding` / `toggle-video-coding` / `toggle-pdf-coding` — 4 commands bidirecionais, mesma lógica do botão.

**Módulos:**
- `src/core/mediaViewTypes.ts` — constantes isoladas (string-only, sem imports de Obsidian), pra permitir unit tests em jsdom sem arrastar o grafo de views.
- `src/core/viewToggleHelpers.ts` — lógica pura: `resolveToggleTarget(currentViewType, mediaKind)`, `isMediaViewType(viewType)`. 11 unit tests.
- `src/core/mediaToggleButton.ts` — injeção via `active-leaf-change` + `performToggleCommand` (reusado pelos 4 commands).

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

**`parentId` como theme hierarchy (NVivo / Braun & Clarke):**
A hierarquia `parentId` NÃO é só organização estrutural — ela **É** o mecanismo de theme hierarchy do plugin. Um código pai com zero aplicações diretas (ex: `Experiencias` sem segments, só com filhos `resistencia`/`adocao`/`frustacao`) age como theme; o count agregado inclui aplicações dos filhos via `buildCountIndex`. Isso é o padrão exato do NVivo (parent/child com opção "Aggregate") e casa com a metodologia Braun & Clarke (códigos → subtemas → temas → temas abrangentes = hierarquia aninhada). Se surgir demanda por "theme hierarchy", o reflexo correto é **primeiro perguntar por que `parentId` não resolve** antes de propor nova camada. O item ROADMAP #2a ("Code Groups") é coisa DIFERENTE — grouping flat N:N cross-cutting estilo Atlas.ti, ortogonal à hierarquia.

**Pastas virtuais (Phase B + nested):**
- `folder?: string` no CodeDefinition (ID da pasta — folder folha onde o código vive)
- `FolderDefinition { id, name, parentId?, subfolderOrder?, createdAt }` armazenado no registry. `parentId` aponta pra outra folder (ou root se ausente); `subfolderOrder` é a ordem de filhos folder dentro do pai
- Registry mantém `folderOrder` (root) + `subfolderOrder` (per-parent). CRUD: `createFolder(name, parentId?)`, `renameFolder`, `deleteFolder` (cascade — apaga descendants e códigos via `_deleteCodeNoEmit`), `setCodeFolder`, `setFolderParent` (cycle detection walk-up + reuso de `_insertInList`), `getRootFolders`, `getChildFolders`, `getFolderAncestors`, `getFolderDescendants` (cycle protection via Set), `getCodesInFolder`
- Pastas NAO afetam hierarquia, analytics, ou queries — sao puramente organizacionais (mesmo aninhadas)
- `buildFlatTree` recursivo via `visitFolders` (simétrico a `visitCodes`); `FlatFolderNode.depth` dinâmico controla `padding-left` no row. Search auto-expande folder ancestors
- Serializacao: `folders: Record<string, FolderDefinition>` + `folderOrder: string[]` no JSON

**Code Groups (Tier 1.5 — flat N:N, ortogonal a `parentId` e `folder`):**
- `groups?: string[]` no CodeDefinition (array de groupIds — código pode ser membro de N groups)
- `GroupDefinition { id, name, color, description?, memo?, paletteIndex, parentId? schema-ready, createdAt }` armazenado no registry
- `GROUP_PALETTE` (8 cores pastéis) distinto do `DEFAULT_PALETTE` (12 cores) pra evitar confusão visual em chip counters
- CRUD: `createGroup`, `renameGroup`, `deleteGroup` (ripple — remove groupId de todos `code.groups[]`), `setGroupColor`, `setGroupDescription`, `setGroupMemo`, `setGroupOrder`
- Membership: `addCodeToGroup` / `removeCodeFromGroup` (idempotentes — fire único do `onMutate` listener)
- Queries: `getCodesInGroup`, `getGroupsForCode`, `getGroupMemberCount`
- Serialização: `groups`, `groupOrder`, `nextGroupPaletteIndex` em `data.registry`. Tolerante a data.json legado (ausência de campos = inicialização vazia)
- **Distinção operacional:**

  | | Folder | Group |
  |---|---|---|
  | 1 código em N? | 1 só | N ao mesmo tempo |
  | Afeta Analytics? | ❌ | ✅ (filter) |
  | Aparece em export? | ❌ | ✅ (QDPX `<Sets>`, CSV `groups` column + `groups.csv`) |
  | Finalidade | Cosmética | Dimensão analítica |
- UI: painel "Groups" no topo do codebook (chips + filter contextual), chip contador `🏷N` em rows, seção Groups no Code Detail, right-click "Add to group..."
- Analytics: `FilterConfig.groupFilter` com `memberCodeIds` pre-computed em `buildFilterConfig` (evita passar registry em 9 callers de `applyFilters`); UI single-select com fallback dropdown >10 groups
- Export: QDPX `<Set>` dentro de `<CodeBook>` com custom namespace `xmlns:qualia="urn:qualia-coding:extensions:1.0"` (`qualia:color` round-trip próprio); QDPX externo (Atlas.ti/MAXQDA) sem `qualia:color` recebe cor auto-atribuída do `GROUP_PALETTE` em round-robin; `<MemberSource>` ignorado com warning. Tabular CSV: coluna `groups` em `codes.csv` (`;`-separated names) + `groups.csv` standalone
- Merge: target herda **union** dos groups (snapshot pego antes do delete dos sources — preserva audit trail analítico)

**Codebook Panel (UI):**
- `hierarchyHelpers.ts`: `buildFlatTree` (virtual scroll com FlatCodeNode | FlatFolderNode), `buildCountIndex` (contagem direta + agregada)
- `codebookTreeRenderer.ts`: árvore hierárquica via `createVirtualList` helper (pattern unificado com listas planas, ver §17/§34); folder rows (icone) vs code rows (chevron + swatch)
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
- **Hover-focus** (2026-04-27): ao passar cursor em nó, edges não-conectadas escurecem (opacity ÷3) — destaque visual sem reflow. State local `hoveredNodeIdx` na closure de `renderRelationsNetwork`; reset em mousemove sem hit, mouseleave e mousedown (drag start). Cálculo da opacity em `relationsNetworkHelpers.computeEdgeOpacity()` (puro, testável)
- **Filtro "Min weight"** (2026-04-27): slider no painel de config com label dinâmico "N — showing X/Y edges". Volátil por sessão (`ctx.relationsMinEdgeWeight`, default 1). Filtra apenas no `redraw()` — simulação roda com grafo completo (preserva drag-positions). Event `"change"` (release), não `"input"` — evita re-roda da força-direção por pixel arrastado. Clamp defensivo em ambos render paths quando `maxObservedWeight` muda
- **Dados**: lê markers raw via `readAllData(ctx.plugin.dataManager)` — não usa consolidated data (relações vivem em `CodeApplication`, não em `ConsolidatedData`)
- **CSV export**: source, target, label, directed, level, weight

### 5.8 Code × Metadata (mixed-methods)

`codeMetadataMode.ts` — heatmap canvas 2D cruzando códigos qualitativos com Case Variables. Responde "como este código se distribui pelos perfis dos casos?" — pergunta complementar ao `chiSquareMode` (que responde "este código é específico de um tipo de fonte?").

Pipeline de cálculo é uma função pura em `analytics/data/codeMetadata.ts`:

1. `applyFilters(data, filters, registry)` — markers filtrados (incl. caseVariableFilter atual)
2. Discovery dos labels de coluna baseado em `registry.getType(variableName)`:
   - **text/checkbox**: valor literal vira coluna
   - **number**: `binNumeric()` — ≤4 valores únicos → categórico literal; ≥5 → quartis `[min–Q1] (Q1–Q2] (Q2–Q3] (Q3–max]`
   - **date/datetime**: `binDate()` — granularidade auto baseada no range (UTC; >2y → ano, 1mo–2y → mês, <1mo → dia)
   - **multitext**: `explodeMultitext()` flatten arrays — 1 arquivo conta em N colunas, chi² inválido (`stats[i] = null`)
3. Coluna `(missing)` opcional no fim quando há markers em arquivos sem valor preenchido (toggle "Hide missing")
4. Build matrix `[code × value]`; chi² 2×C por código via helper genérico `chiSquareFromContingency` extraído de `inferential.ts`

Helpers puros isolados em `analytics/data/binning.ts` (testáveis sem registry).

**Render** (`codeMetadataMode.ts`): canvas 2D no pattern de `docMatrixMode` (sem DPR scaling). Linhas = códigos, colunas = valores binados, célula colorida via `heatmapColor(value, maxValue, isDark)`. Display tem 3 modos via radio: **Count** (default) / **% by row (code)** / **% by column (value)** — útil pra "como o código X se distribui" vs "do que o perfil Y fala". Coluna lateral fixa exibe `χ²=N · p=N` por código, com asterisco quando `p<0.05` e `—` para multitext.

**Sort interativo** dividido em 2 headers (sem persistência, volátil por sessão):
- Header **Code** (esquerda): cicla `total desc → total asc → name asc → name desc`
- Header **χ² · p** (direita): cicla `χ² desc → χ² asc → p asc → p desc`

**Tooltip** de hover mostra `(código × valor, count, % row, % col)`. **Banner** condicional quando `caseVariableFilter.name === cmVariable` ("Filtering by X while using as dimension"). **CSV export** com colunas `code, total, <values…>, (missing)?, chi2, df, p, cramers_v` — campos chi² vazios para linhas multitext (parse-friendly em R/Python).

State volátil em `AnalyticsView`: `cmVariable`, `cmDisplay`, `cmHideMissing`, `cmSort`. Reset ao reabrir view, mesmo pattern de `chiGroupBy`/`chiSort`.

### 5.9 Shared Files

```
src/
  core/
    baseSidebarAdapter.ts    — base class for all sidebar adapters (listener wrapping, hover state, deleteCode, updateMarkerFields)
    markerResolvers.ts       — shared marker lookup/resolution utilities across engines
    codeVisibility.ts        — pure helpers: isCodeVisibleInFile, shouldStoreOverride, cleanOverridesAfterGlobalChange
    codeVisibilityPopover.ts — shared popover body (renderCodeVisibilityPopoverBody) + floating wrapper (openCodeVisibilityPopover)
    visibilityEventBus.ts    — rAF coalescing bus — coalesces visibility notifications in a single animation frame
  media/
    mediaCodingModel.ts      — shared CodingModel for audio/video engines
    mediaSidebarAdapter.ts   — shared sidebar adapter for audio/video engines
    mediaCodingMenu.ts       — shared coding menu for audio/video engines
  analytics/board/
    boardTypes.ts            — TypeScript types for Research Board nodes, arrows, connections
    fabricExtensions.d.ts    — Fabric.js type extensions for custom node properties
  obsidian-internals.d.ts    — type declarations for undocumented Obsidian internals
```

### 5.8b Code visibility (toggle)

Feature em duas camadas (global + per-doc override) com event bus de notificação:

- **Estado global**: `CodeDefinition.hidden?: boolean` — quando true, código fica oculto por padrão em todos os docs
- **Override per-doc**: `QualiaData.visibilityOverrides[fileId][codeId] = boolean` — inverte a visibilidade para esse fileId específico
- **Composição**: `isCodeVisibleInFile(codeId, fileId)` prioriza override sobre global. Override presente => usa override; ausente => `!globalHidden`
- **Semântica B (self-cleaning)**: overrides só existem enquanto divergem do global. `shouldStoreOverride` (entry-side) + `cleanOverridesAfterGlobalChange` (global-change sweep) garantem JSON enxuto
- **Mutations no registry**: `setGlobalHidden(codeId, hidden)`, `setDocOverride(fileId, codeId, visible)`, `clearDocOverrides(fileId)`. Todas emitem `visibility-changed` event (Set distinto do `onMutate`)
- **Cleanup automático**: `registry.delete(id)` remove overrides órfãos — cobre merge transitivamente (`executeMerge` chama `registry.delete(sourceId)`)
- **Vault sync**: `migrateFilePathForOverrides(oldPath, newPath)` no rename, `clearFilePathForOverrides(fileId)` no delete
- **Event bus (`visibilityEventBus`)**: singleton que coalesce notifications via `requestAnimationFrame` (fallback `queueMicrotask` para jsdom). Cada engine subscreve por VIEW INSTANCE (não por fileId) — multi-pane tem múltiplos subscribers
- **Render filter em 6 engines**: cada engine filtra `marker.codes.filter(app => registry.isCodeVisibleInFile(app.codeId, fileId))`. Se resulta vazio, marker é pulado. CM6 markdown rebuild atômico (decorations); PDF/CSV/Image/Audio/Video refresh pontual (DOM-based, o que é visível muda, o resto não re-renderiza)
- **Escopo**: Analytics e export não afetados — filter só na layer de render. Intencional (design spec)

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
- **Marker memos como Notes**: Marker com `memo` gera `<Note>` + `<NoteRef>` no `<Selection>`. GUID do note: `note_{selectionGuid}`. Caminho exclusivo de marker memo
- **Code/Group/Relation memos como `<MemoText>` direto** (#25, 2026-04-27): `CodeDefinition.memo`, `GroupDefinition.memo`, `CodeRelation.memo` saem como `<MemoText>` child de `<Code>`/`<Set>`/`<Link>` — não passam pela Notes collection. Quando memo presente, elementos antes self-closing viram open/close (element-form switch em `buildCodeElement`/`buildSetElement` + emission de `<Link>` no `qdpxExporter.ts`)
- **Relations como Links**: `buildLinksXml()` converte `CodeDefinition.relations` e `CodeApplication.relations` em `<Link>` com `direction` (Associative/OneWay). `<MemoText>` opcional como child quando relation tem memo
- **Warnings**: `ExportResult.warnings[]` acumula problemas (source missing, PDF offsets approximate, image dimensions unreadable). Modal exibe via Notice

**Import** (`src/import/`) — Arquitetura em camadas:

- **xmlParser.ts**: Helpers DOMParser — `parseXml`, `getChildElements`, `getAttr`, `getNumAttr`, `getTextContent`, `getAllElements`
- **coordConverters.ts**: Conversão inversa — `offsetToLineCh` (codepoint→CM6 line:ch com surrogate pairs), `pdfRectToNormalized` (PDF points bottom-left→0-1), `pixelsToNormalized`, `msToSeconds`
- **qdcImporter.ts**: `parseCodebook` (recursivo com hierarquia + NoteRef→description + `<MemoText>` em `<Code>`), `applyCodebook` (merge/separate + guidMap QDPX→Qualia + `mergeMemos` análoga a `mergeDescriptions` quando entidade pré-existe com memo)
- **qdpxImporter.ts**: `parseSources` (5 tipos), `parseNotes` (com detecção `[Magnitude: X]`), `parseLinks` (com `<MemoText>` opcional), `parseSetsFromXml` (regex-based, parsea `<MemoText>` em `<Set>`), `previewQdpx`, `importQdpx` (ZIP→vault: extrai sources, cria markers por engine, batch de text markers com offset→lineCh, memos standalone como .md, `applyLinks` code-level + marker-level preservando `relation.memo`)
- **importModal.ts**: File picker, preview com contagem, dropdown conflitos, toggle sources, flows QDC e QDPX separados
- **importCommands.ts**: `import-qdpx`, `import-qdc` na palette + botão analytics
- **Magnitude round-trip**: Export codifica `CodeApplication.magnitude` como Note `[Magnitude: X]` via `buildCodingXml(codes, guidMap, createdAt, notes)`. Import detecta prefixo e reconstrói magnitude no `CodeApplication`

**PDF text round-trip** (2026-04-23):

O PDF tem um desafio específico: runtime usa `beginIndex/beginOffset/endIndex/endOffset` alinhados com `.textLayerNode` do viewer (que são DOM-specific), mas QDPX espera `startPosition/endPosition` em codepoints no PlainText consolidado. Solução em 3 módulos novos (export) + 2 (import):

Export pipeline (`loadPdfExportData` → `resolveMarkerOffsets`):
1. `src/pdf/pdfExportData.loadPdfExportData(app, filePath)` — carrega PDF via `window.pdfjsLib` headless, extrai dims por página E roda `buildPlainText`. `ensurePdfJsLoaded` abre um PDF em leaf temporária (com `tabHeader.display='none'` + `containerEl.visibility='hidden'`) quando `window.pdfjsLib` ainda não foi populado (typical em vault novo pré-import)
2. `src/pdf/pdfPlainText.buildPlainText(doc)` — concatena `getTextContent().items.str` com `\f` entre páginas. Strip whitespace leading/trailing de cada item pra evitar double-spaces
3. `src/pdf/resolveMarkerOffsets(plainText, pageStartOffsets, marker)` — tenta `indexOf` exato do `marker.text` na página. Fallback: normaliza whitespace em ambos os lados (`\s+` → ` `) e busca na versão normalizada, mapeando offsets de volta pro plainText original. Sinaliza `ambiguous: true` quando text aparece múltiplas vezes (warning mas exporta primeira ocorrência)

Import pipeline (`extractAnchorFromPlainText` → placeholder + runtime resolve):
1. `src/pdf/extractAnchorFromPlainText(plainText, pageStartOffsets, startPos, endPos)` — retorna `{text, page}` (page 1-based). Chamado de `qdpxImporter.createPdfMarker`
2. Marker criado com `text` preservado + indices placeholder (0,0,0,0)
3. `src/pdf/resolvePendingIndices(pageEl, text)` — invocado por `pageObserver.renderPage` no primeiro render do PDF. Faz text-search no DOM `.textLayerNode`, popula indices, salva silent. Depois render normal pinta highlight

**Convenção de página**: `marker.page` é 1-based (vem de `data-page-number` do viewer). `pageStartOffsets` é 0-based. Export/import convertem nas bordas.

**Convenção de shape coords**: `PercentShapeCoords` (0-100), match do viewBox SVG `0 0 100 100`. `pdfShapeToRect`/`pdfRectToNormalized` dividem/multiplicam por 100 antes de converter pra PDF points — XML sai dentro da spec REFI-QDA. Renomeado de `NormalizedShapeCoords` em 2026-04-24 pra não induzir erro (o nome mentia — a convenção sempre foi 0-100).

**Why:** Caminho runtime (render/capture/drag) permanece index-based e intocado. Anchor em text só vive no lado export/import — permite round-trip robusto sem mudar o schema do marker. Ver `memory/feedback_dont_refactor_working_code.md`.

### 5.10 Tabular export (CSV zip pra análise externa)

Módulos em `src/export/tabular/` (8 arquivos) — complementa QDPX. Exporta dados relacionais flat (CSV + README.md) sem schema REFI-QDA, consumível direto em R/tidyverse ou Python/pandas.

**Primitivos**:

- **`csvWriter.ts`** — função pura `toCsv(rows: CellValue[][]): string`. RFC 4180 (escape comma/quote/newline via double-quotes), UTF-8 BOM prepended (Excel detecta encoding correto), sem dependência de DOM
- **`readmeBuilder.ts`** — gera `README.md` embutido no zip com schema detalhado de cada CSV + snippets R/tidyverse (dplyr joins) e Python (pandas merge) + seção Warnings (condicional: "Orphan codeId" se aplicável)

**Builders por tabela**:

1. **`buildSegmentsTable.ts`** — mais complexo: consolida 6 `MarkerType`s persistidos em 8 `sourceType`s (markdown, pdf_text, pdf_shape, image, audio, video, csv_segment, csv_row). Coluna `engine` (coarse) + `sourceType` (fine). Shape coords em JSON quando toggle on. Media timestamps from/to em milissegundos (ISO 8601 string, zero offset `Z`). Fallback text pra deleted files (arquivo movido/deletado → warning + text='' mas segment sai com outros fields preenchidos)
2. **`buildCodeApplicationsTable.ts`** — 1 linha per (segment, code) de todos engines. Orphan `codeId` → skip + warning (segment mantém outros codes válidos). Colunas: segment_id, code_id, magnitude (ou NULL), relations_json
3. **`buildCodesTable.ts`** — codebook denormalizado 1 linha per code. Pastas (organização visual) não aparecem (sem significado analítico em CSV). Colunas: `id, name, color, parent_id, description, memo, magnitude_config, groups`. `magnitude_config` serializada como JSON, `groups` como `;`-separated names
4. **`buildGroupsTable.ts`** — codebook de groups standalone. Colunas: `id, name, color, description, memo`
5. **`buildCaseVariablesTable.ts`** — long format, 1 linha per (fileId, variable). Lê direto de `dm.section('caseVariables')` (evita dependência em `CaseVariablesRegistry`). Multitext → JSON array. NULL → empty cell (row mantido)
6. **`buildRelationsTable.ts`** — unifica code-level + application-level via coluna `scope` (code|application). Colunas separadas `origin_code_id` / `origin_segment_id` (não composite key — facilita left-join no R). Target sempre `target_code_id` (relations sempre code-to-code). Coluna `memo` no fim — code-level populada quando há memo, application-level vazia até UI lander (schema-ready)

**Orchestrator**:

- **`tabularExporter.ts`** — função `exportTabular(app, dm, registry, opts)`. Resolve textos de CSV da vault (markers CSV de PDF/markdown/image/etc armazenam indices, não text — exportador lê arquivo via `vault.getAbstractFileByPath` + `instanceof TFile` + `vault.read(file)`, tolerando parse errors parciais). Roda 5 builders em série, concatena warnings, gera README, zipa via `fflate.zipSync` com `toU8` wrapper realm-safety (mesmo pattern de `qdpxExporter.ts`)

**Runtime flow**: `ExportModal.doExport` (com `format === 'tabular'`) → `exportTabular(app, dm, registry, opts)` com `opts: { includeRelations?: boolean, includeShapeCoords?: boolean }` → `vault.createBinary(fileName, zip)`. Modal UI: radio `tabular` no `formatSelect` + 2 toggles (default on)

---

### 5.11 Smart Codes (saved queries)

Tier 3 do Coding Management. Smart Code = "código virtual" definido por **predicate** (filtro reutilizável) em vez de application manual marker-a-marker. Pattern equivalente ao "Smart Codes" do Atlas.ti / "Code Sets" parametrizados do MAXQDA.

**Schema (PredicateNode AST)** em `src/core/types.ts`:

```ts
type PredicateNode = OpNode | LeafNode;

interface OpNode {
    op: 'AND' | 'OR' | 'NOT';
    children: PredicateNode[];
}

interface LeafNode {
    leaf: 'hasCode' | 'caseVarEquals' | 'caseVarRange' | 'magnitudeGte'
        | 'magnitudeLte' | 'inFolder' | 'inGroup' | 'engineType'
        | 'relationExists' | 'smartCode';
    // ... params específicos do leaf
}
```

11 leaves cobrem dimensões ortogonais: estrutura (`hasCode`, `inFolder`, `inGroup`), metadata (`caseVarEquals`, `caseVarRange`), magnitude (`magnitudeGte/Lte`), engine (`engineType`), relations (`relationExists`), texto (`textContains` — substring com opt-in `caseSensitive`), e auto-referência (`smartCode` — nesting). Combinados via OpNode (AND/OR/NOT). `textContains` aciona invalidação file-level via `SmartCodeCache.invalidateForFileText` no `vault.on('modify')` (rede de segurança pra mudança de texto que não passe por `MarkerMutationEvent` — edição externa, futuras engines).

**SmartCodeDefinition** no registry:
```ts
{ id: 'sc_*', name, color, predicate: PredicateNode, memo?: MemoRecord, paletteIndex, createdAt }
```

**Pipeline (módulos puros isolados em `src/core/smartCodes/`):**

| Módulo | Responsabilidade |
|---|---|
| `evaluator.ts` | `evaluate(predicate, marker, ctx)` — runtime hot path, short-circuit AND/OR, cycle-safe via `ctx.visiting: Set<scId>` |
| `validator.ts` | `validate(predicate, registry)` — pré-save, detecta cycles + name collision + broken refs + magnitude type mismatch |
| `dependencyExtractor.ts` | Extrai `{codeIds, caseVarKeys, folderIds, groupIds, smartCodeIds, engineTypes}` do predicate (índices reversos pra cache) |
| `serializer.ts` | JSON ↔ AST + normalizer (canoniza ordem de children pra diff estável) |
| `builderTreeOps.ts` | `add/remove/move/changeOp/replaceLeaf` puros do builder UI (modal row-based) |
| `cache.ts` | `SmartCodeCache` singleton — `markerByRef` + invalidação granular + chunked compute (100 markers/chunk pra cache miss grande) |
| `matcher.ts` | `computePreview(predicate, allMarkers)` — preview live <300ms no builder |
| `smartCodeRegistry.ts` | Classe stateful com `addOnMutate(fn)` (mesmo pattern de `CodeDefinitionRegistry`), CRUD + `autoRewriteOnMerge` (re-aponta predicates após code merge) + `diffPredicateLeaves` (audit log) |

**Integração cross-engine via `MarkerMutationEvent`** (canal paralelo a `onChange` — ver `TECHNICAL-PATTERNS.md §37`): cada mutação de marker emite `{engine, fileId, markerId, prevCodeIds, nextCodeIds, codeIds, marker}`. Cache `applyMarkerMutation(event)` atualiza `markerByRef` incremental + invalida só SCs cujo predicate referencia algum codeId em `event.codeIds`. Vault de 10k markers + 100 SCs: edit de 1 marker re-computa 1-3 SCs típico.

**Audit log entity discriminator** (`AuditEntry.entity?: 'code' | 'smartCode'`): 5 event types `sc_*` (`sc_created`, `sc_renamed`, `sc_predicate_edited`, `sc_text_edited`, `sc_deleted`). Coalescing 60s pra text edits + Set union pra predicate edits (múltiplas iterações de builder viram 1 entry). ⚡ icon na Codebook Timeline distingue eventos SC.

**Integração em Analytics** (helper `getSmartCodeViews` em `smartCodeAnalytics.ts`): SC entries aparecem alongside códigos regulares em 6 modes (frequency, cooccurrence, evolution+temporal, codeMetadata, lagSequential+polar, memoView). Filter UI tem chips ⚡ no topo da codes section. SC entries no Frequency mode aceitam drag + Add to Board (paridade com codes).

**Integração no Code Explorer**: grupo "⚡ Smart Codes" top-level no tree com estrutura SC → file → matches. Click em match navega cross-engine via `navigateToMarker`. Subscribe a cache + registry mutations + model.onChange (workaround pra eventos que SC3 não cobre, raros).

**QDPX export/import**: bloco `<qualia:SmartCodes>` em namespace custom `xmlns:qualia="urn:qualia-coding:extensions:1.0"`. Import 2-pass: (1) alocar IDs novos pra todos os SCs, (2) resolver refs (incl. nesting `smartCode` leaves apontando pra outros SCs). Round-trip preservado.

**CSV tabular**: `smart_codes.csv` com coluna `predicate_json`. README do zip ganhou snippets R/Python pra reconstruir SCs em external analysis.

**Comando palette**: `Smart Codes: Open hub` (lista) + `Smart Codes: New` (builder direto). Smart Code Detail wirado inline na sidebar (Code Detail, modo "All Codes" — section ⚡ acima dos códigos regulares, click abre detail no mesmo painel).

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

- **Lifecycle de arquivos**: `registerFileRename` + `vault.on('delete')` propagam rename/delete para o registry. Botão de ação injetado em todo `FileView` via triplo listener em `main.ts`: `active-leaf-change` (user navega entre leaves), `layout-change` (splits e reconfigurações de painéis) e `file-open` (cobre race onde layout-change vê `view.file===null`). Dedupe por `WeakMap<View, listener>`; no early-return o listener armazenado é re-invocado pra refresh de badge (cobre caso same-view-new-file).
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

### 14.2 Pastas Virtuais (Phase B + nested)

**Campo**: `folder?: string` no CodeDefinition (folha). `folders: Record<string, FolderDefinition>` no registry, com `parentId?` + `subfolderOrder?` em cada folder pra suportar aninhamento N-níveis (#23, 2026-04-26). `folderOrder: string[]` mantém ordem das roots.
Containers organizacionais sem significado analítico — mesmo aninhadas. Ícone de pasta vs chevron de hierarquia. `buildFlatTree` recursivo via `visitFolders` produz `FlatFolderNode.depth` dinâmico; drag-drop full (nest/reorder/promote, cycle silent return); delete cascade com ConfirmModal preview (count subfolders + códigos + warning markers órfãos).

### 14.3 Magnitude (Phase D)

**Config**: `magnitude?: { type: 'nominal' | 'ordinal' | 'continuous'; values: string[] }` no CodeDefinition.
**Valor**: `magnitude?: string` no CodeApplication.
Picker fechado — valores declarados são os únicos permitidos. Toggle nas settings controla visibilidade no popover.

### 14.4 Relações (Phase E)

Dois níveis:
- **Código-level**: `CodeDefinition.relations: CodeRelation[]` — declaração teórica
- **Segmento-level**: `CodeApplication.relations: CodeRelation[]` — interpretação ancorada no dado

Shape: `{ label: string; target: string; directed: boolean; memo? }` (mesma interface compartilhada — ver §14.5). Label livre com autocomplete via `<datalist>`.

Funções puras: `relationHelpers.ts` (`collectAllLabels`, `buildRelationEdges`).
Analytics: `relationsEngine.ts` → `relationsNetworkMode.ts` (Network View com nós = códigos, arestas = relações).

### 14.5 Memos por entidade (#25, 2026-04-27)

Schema aditivo `memo?: string` em três entidades, com semântica distinta de `description?`:

| Entidade | description | memo |
|---|---|---|
| `CodeDefinition` | Definição operacional (consensual, sai no codebook) | Reflexão analítica processual (histórico de pensamento) |
| `GroupDefinition` | idem | idem |
| `CodeRelation` | — (não tem) | Reflexão sobre essa relação específica |
| `BaseMarker` | — | Já existia antes — anotação sobre o segmento |

**Identidade de relation pra editar memo**: por **tupla `(label, target)` snapshot**, mesmo pattern do delete em `baseCodingMenu.ts:585`. Setter `setRelationMemo(codeId, label, target, memo)` atualiza primeira match. Limite conhecido (relations duplicadas com mesma tupla → só primeira é atualizada) é o mesmo do delete existente.

**Mutação no registry:**
- Code: estende `update(id, changes)` com `'memo'` no Pick — caminho único de mutação preservado
- Group: `setGroupMemo(id, memo)` dedicado, paralelo a `setGroupDescription`/`setGroupColor`
- Relation: `setRelationMemo(codeId, label, target, memo)` por tupla

`CodeRelation.memo` é compartilhado entre code-level e application-level (mesma interface em `types.ts:27`). UI 1.0 só edita o code-level (✎ button em existing rows do Code Detail); application-level é schema-ready — round-trip QDPX/CSV preserva memo mesmo sem UI escrever.

### 14.6 REFI-QDA Export/Import

**Export**: `qdcExporter.ts` (codebook XML) + `qdpxExporter.ts` (projeto completo: codes + sources + segments + memos + links + magnitude como Notes).
**Import**: `qdcImporter.ts` (codebook com hierarquia + NoteRef→description + parser `<MemoText>` em Code) + `qdpxImporter.ts` (5 source types, segments, memos standalone, magnitude, relations via Links com `<MemoText>` opcional, Sets via `parseSetsFromXml` regex-based).
**Helpers**: `xmlBuilder.ts` (XML generation), `coordConverters.ts` export (lineChToOffset, pdfShapeToRect, imageToPixels, mediaToMs), `xmlParser.ts` + `coordConverters.ts` import (offsetToLineCh, pdfRectToNormalized, pixelsToNormalized, msToSeconds).
**UI**: `exportModal.ts` (pre-export config), `importModal.ts` (conflict resolution).

**Dois caminhos paralelos pra memo no QDPX (não confundir):**
- **Marker memo** (existente, preservado intocado): `BaseMarker.memo` → `<Note>` na collection `<Notes>` + `<NoteRef>` no `<Selection>`. GUID `note_{selectionGuid}`. Pipeline `<NoteRef>` em `qdpxImporter.ts:184+` segue intocado
- **Code/Group/Relation memo** (#25): `<MemoText>` direto como child de `<Code>`/`<Set>`/`<Link>` no codebook XML — não passa pela Notes collection. Element-form switch: quando memo presente, elementos antes self-closing viram open/close (`buildCodeElement`/`buildSetElement` em `qdcExporter.ts`, emission de `<Link>` em `qdpxExporter.ts`)

Conflito de import (entidade já existe + memo importado): `mergeMemos` análoga a `mergeDescriptions` (`existing\n\n--- Imported memo ---\nimported`).

### 14.7 Analytic Memo View (consumer #25, 2026-04-27)

Mode `memo-view` no Analytics que agrega memos das 4 entidades em uma view de leitura analítica unificada com edição inline. Consumer direto da feature #25. Blueprint: `codeMetadataMode` — pattern declarativo de mode + função pura de agregação + módulos render separados.

**Módulos:**
- `analytics/data/memoView.ts` — `aggregateMemos(allData, registry, filters, caseVariablesRegistry?)` pura. Lê `AllEngineData` raw (não consolidado, pra preservar `BaseMarker.memo`). Retorna `MemoViewResult` com `byCode: CodeMemoSection[]` ou `byFile: FileMemoSection[]` + `coverage: CoverageStats`.
- `analytics/views/modes/memoView/` — orchestrator + 8 sub-arquivos (`renderCoverageBanner`, `renderCodeSection`, `renderFileSection`, `renderMarkerCard`, `renderMemoEditor`, `memoViewOptions`, `onSaveHandlers`, `exportMemoCSV`, `exportMemoMarkdown`). Subpasta dedicada porque modes complexos beneficiam de split (vs `dashboardMode.ts` em arquivo único quando small).

**Decisões de design:**
- **Pivô = código (com hierarquia indentada) + toggle by-file** — espelha codebook como narrativa (default). By-file reagrupa por arquivo pra escrever análise por documento.
- **Hollow context** — pais sem memo mas com filhos com memo aparecem como header fade (preserva contexto de hierarquia).
- **Coverage banner** — `X/Y codes · X/Y groups · X/Y relations · X/Y markers` (totais absolutos pré-`showTypes`, markersTotal post outros filtros).
- **Marker em múltiplos códigos** (decisão iv) — aparece UMA vez sob primeira `marker.codes[]` que sobrevive ao `code filter`. Em `byFile`, `codeIdsUsed` reúne TODOS surviving (pra dar visão completa do arquivo).
- **markerLimit** (5/10/25/all) — collapse por código com "Show N more". Threshold decisão pragmática; virtual scroll fica como follow-up (BACKLOG §17) se >500 marker memos virar dor.

**Edição inline (hub editorial):**
- `renderMemoEditor` — textarea inline com debounced save 500ms + `suspendRefresh`/`resumeRefresh` (counter em `AnalyticsView`, `scheduleUpdate` no-op enquanto > 0). Pattern reusable pra qualquer view futura que precise textarea editável dentro do Analytics.
- `onSaveHandlers` — 5 kinds (code, group, relation code-level, relation app-level, marker). Cada um chama API certa do registry/dataManager.
- **Marker persistence: `dataManager.findMarker(engineType, markerId)` → mutação in-place + `markDirty()`**. Adicionado em `core/dataManager.ts`. Formaliza pattern já usado em menus (PDF/image escrevem `marker.memo = value` direto). Ponto único de acesso, agnóstico a leaf aberta.
- **App-level relation memo: `setApplicationRelationMemo(codes, codeId, label, target, memo)` em `codeApplicationHelpers.ts`** — primeira UI a escrever em `CodeApplication.relations[i].memo` (schema-ready desde #25). Mutação in-place + `markDirty`. Memo View vira a primeira surface app-level via ✎ inline.

**Filtros:**
- Reusa todos os filtros padrão do Analytics (sources, codes, code groups, case variables) via `buildFilterConfig`.
- Adiciona 3 controles próprios em `memoViewOptions`: Group by radio, Show types (4 checkboxes), Marker limit dropdown.

**Export:**
- CSV: `buildMemoCSV(result)` puro + wrapper download. Colunas: `entity_type, entity_id, code_id, code_name, file_id, source_type, level, memo`. Group memos dedup quando aparecem em múltiplos códigos.
- Markdown: `buildMemoMarkdown(result, opts)` puro + wrapper que cria nota em `Analytic Memos/YYYY-MM-DD.md` e abre em nova leaf. Hierarquia indentada via H2→H6 (cap em H6 pra depth ≥ 5). Wikilinks pra files. Excerpt em blockquote.
- `ModeEntry.exportMarkdown?` opcional adicionado ao registry — botão "Export Markdown" no toolbar do Analytics aparece SÓ quando mode tem `exportMarkdown` definido (declarativo, sem switch hardcoded).

### 14.8 Convert memo to note — Phase 1 + Phase 2 completa (#33–#36, 2026-04-30)

Schema breaking — `memo?: string` virou `memo?: MemoRecord = { content: string; materialized?: { path, mtime } }` em CodeDefinition + GroupDefinition + BaseMarker + CodeRelation. Materialização de memo como `.md` no vault, com sync bidirecional via vault listeners. **4/4 tipos wirados: Code, Group, Marker, Relation (code-level + app-level).**

**Decisão fundadora:** schema breaking (não aditivo) porque memo é uma coisa só conceitualmente. Aditivo (`memo` + `memoFile?` paralelos) inventaria sincronização desnecessária e fonte de bug. Plugin sem usuários (CLAUDE.md) autoriza breaking; ~30 pontos de toque mecânico via accessors.

**Endereçamento universal — `EntityRef`:**

```ts
type EntityRef =
  | { type: 'code'; id: string }
  | { type: 'group'; id: string }
  | { type: 'marker'; engineType: EngineType; id: string }
  | { type: 'relation-code'; codeId: string; label: string; target: string }
  | { type: 'relation-app'; engineType: EngineType; markerId: string; codeId: string; label: string; target: string };
```

Serializa pra string canônica em frontmatter (`code:abc123`, `marker:pdf:m1`, etc). 5-way union prepara extensão sem refactor de schema.

**Frontmatter do `.md` materializado:**
```yaml
---
qualiaMemoOf: code:c_0001
qualiaCodeName: Wellbeing
---
```
`qualiaMemoOf` é o ponteiro estável (sobrevive rename do .md, do code). `qualiaCodeName` é cosmético — espelho do nome atual pro Properties view do Obsidian; desatualiza quando user renomeia o code (sem efeito funcional).

**Reatividade — 3 vault listeners:**

| Evento | Handler | Comportamento |
|---|---|---|
| `vault.on('modify')` | `onMaterializedFileModified` | Lê `.md`, parse frontmatter, atualiza `entity.memo.content` no data.json. Frontmatter quebrado → desmaterializa graciosamente (volta a inline). Frontmatter aponta pra ref diferente → no-op com console.warn. |
| `vault.on('rename')` | `onMaterializedFileRenamed` | Atualiza `materialized.path` da entidade. Reverse-lookup map também atualiza. |
| `vault.on('delete')` | `onMaterializedFileDeleted` | Remove `materialized` da entidade. **`content` preservado** — entidade volta automático pra inline. |

**Reverse-lookup `Map<path, EntityRef>`** mantido em memória (`plugin.memoReverseLookup`). Reconstruído no `onload` varrendo registry. O(1) lookup em event handler — sem ele, cada vault event seria O(n) sobre todas entidades.

**Self-write tracker `Set<string>`** (`plugin.memoSelfWriting`) — pattern reusável pra prevenir loop em vault listeners. Convert/syncToFile adicionam path antes de `vault.modify/create`, removem em `queueMicrotask`. Listener `modify` ignora paths nesse set. Pattern conhecido (Templater faz parecido). Documentado em `TECHNICAL-PATTERNS.md`.

**Componentes (`src/core/`):**
- `memoTypes.ts` — MemoRecord, EntityRef + serializers
- `memoHelpers.ts` — getMemoContent / setMemoContent / hasContent (centraliza acesso ao schema)
- `memoNoteFormat.ts` — parseMemoNote / serializeMemoNote (frontmatter + body)
- `memoPathResolver.ts` — sanitizeFilename + resolveConflictPath (sufixo `(2)/(3)`)
- `memoMigration.ts` — migra `memo: string` legacy → MemoRecord no DataManager.load (idempotente)
- `memoMaterializer.ts` — convertMemoToNote / unmaterialize / syncFromFile / refreshMemoNote (Phase 3) + helpers genéricos `resolveEntity` / `resolveFolder` / `readMemoRecord` / `writeMemo` (switch por `ref.type`). Phase 1+2 completa: code, group, marker, relation-code, relation-app. `convertMemoToNote(plugin, ref, opts?)` aceita `{ openInTab?: boolean }` (default true; batch passa false pra não abrir N abas).
- `memoBatchMaterializer.ts` (Phase 3) — `collectAllMemoRefs(plugin)` itera registry/markers/relations (espelha `rebuildMemoReverseLookup`) retornando `{ ref, memo }[]`. `categorize(all, options)` separa em 4 buckets: `toCreate`, `toOverwrite`, `alreadyUpToDate`, `emptySkipped`. `materializeBatch(plugin, preview, onProgress?)` itera buckets executando convert/refresh, reporta progresso via callback, captura erros individuais sem abortar batch. `describeRef(plugin, ref)` resolve label legível pra UI.
- `materializeAllMemosModal.ts` (Phase 3) — Modal acessível via command palette `materialize-all-memos`. 3 estados de UI: **form** (toggles por kind + Include empty + Overwrite + preview live com 4 contadores), **progress** (status + barra + counter), **resultados** (✓/↻/✗ com details expansíveis). Field interno chamado `batchOptions` (não `selection` — colide com prototype de Modal/Component, ver TECHNICAL-PATTERNS §32).
- `memoMarkerNaming.ts` (Phase 2 Marker) — `buildMarkerFilename(plugin, ref)` com estratégia híbrida por engine: texto = `<file>-<excerpt-4-palavras>` (threshold ≥3 palavras); pdf-shape/image = `<file>-<shape>-<id-curto>`; audio/video = `<file>-<timecode>`. Funções puras testáveis isoladas.
- `detailRelationRenderer.ts` (Phase 2 Relation) — Relation Detail view (code-level + app-level com banner contextual). Header com chips clicáveis source/target, Direction, Memo (textarea/card), Evidence list (só code-level), Delete. `RelationContext` discriminated union define o kind. Caller (`baseCodeDetailView`) injeta `onSaveMemo(ref, content)` callback pra rotear write pelo registry/dataManager.
- `memoMaterializerListeners.ts` — registerMemoListeners + rebuildMemoReverseLookup

**UI:** render condicional em 4 surfaces:
- **Code Detail** (`detailCodeRenderer.renderCodeMemo`) — quando `memo.materialized` existe, textarea some e vira card `📄 Materialized at <path>` com botões Open / Unmaterialize. Botão "Convert to note" no header da seção quando ainda inline.
- **Group panel** (`codeGroupsPanel.ts`, quando group selected) — block do memo ganha botão "Convert to note" ao lado do texto (`codebook-groups-memo-wrap` flex layout). Quando materializado, block vira card compacto (`codebook-groups-memo-card` variant).
- **Marker focused detail** (`detailMarkerRenderer.renderMemoSection`) — mesmo pattern do Code Detail. Popovers de coding (image/media/pdf/markdown) e Memo View card ficam intocados — Convert é decisão analítica, popover é coding rápido. User materializa via marker detail (1 click do source chip do memoView).
- **Relation Detail** (`detailRelationRenderer.renderRelationMemo`) — view nova drill-down. Acessível via click em row de relation no Code Detail (code-level) ou Marker focused detail (app-level). Banner contextual distingue os 2 kinds. Memo no centro com Convert/card. Evidence list (só code-level) cruza markers que aplicam.

`memoAccess?: MemoMaterializerAccess` é opcional, injetado pelo plugin via `BaseCodeDetailView` constructor + propagado pra `ListRendererCallbacks` → `CodeGroupsPanelCallbacks`. Degrada gracioso quando não injetado.

**API genérica via `EntityRef`:** `MemoMaterializerAccess.convertMemo(ref)` / `unmaterializeMemo(ref)` aceitam qualquer tipo (5-way union); switch interno em `memoMaterializer.ts` resolve. EntityRef cobre `code`, `group`, `marker`, `relation-code`, `relation-app` — todos wirados.

**Quirk de notification — code/group vs marker:** code e group passam por `registry.update` / `setGroupMemo` que disparam `onMutateListeners` → main.ts dispatch `qualia:registry-changed`. Marker muta direto via `dataManager.findMarker` (não passa pelo registry), então `writeMemo`/`syncFromFile` pra marker dispara `dispatchEvent('qualia:registry-changed')` explícito. Sem esse emit, BaseCodeDetailView não refresh e o card materializado não aparece.

**Smart Open:** `openMaterializedFile` reusa leaf existente (`iterateAllLeaves` filtrado por `view.file.path`) antes de criar nova aba. Evita poluir workspace com tabs duplicadas em clicks múltiplos.

**Settings — `memoFolders`:**
```ts
memoFolders: {
  code: 'Analytic Memos/Codes',     // Phase 1 ativo
  group: 'Analytic Memos/Groups',   // reservado
  marker: 'Analytic Memos/Markers', // reservado
  relation: 'Analytic Memos/Relations', // reservado
}
```
Settings tab mostra os 4 inputs (3 disabled). Defaults criam folder hierarchy on demand via `vault.createFolder`.

**Não-objetivos Phase 1:**
- UI pra Group/Marker/Relation (extensão futura mecânica)
- Templater integration
- Materialização batch
- Reconciliação de `qualiaCodeName` quando user renomeia o code (cosmético, fica desatualizado)

---

## 16. Parquet/CSV Lazy Mode (DuckDB-Wasm + OPFS + AG Grid Infinite)

> Design doc autoritativo: `docs/parquet-lazy-design.md`. Esta seção registra apenas as decisões arquiteturais consolidadas após a Fase 5 (2026-05-04).

### Por que existe

Carregar parquet de centenas de MB ou milhões de rows na memória do plugin trava o Obsidian. Premissa do projeto: **mesma UX de coding (filter/sort/code/batch) independente de o arquivo caber na RAM**.

Stack: **DuckDB-Wasm** (engine SQL embedded no plugin) + **OPFS** (Origin Private File System pra storage local com partial-read) + **AG Grid Infinite Row Model** (paginated grid).

### Fluxo

1. Arquivo > threshold (default: parquet 50 MB / csv 100 MB) → banner Lazy/Eager/Cancel.
2. Lazy mode → `copyVaultFileToOPFS` streama o arquivo do vault pra OPFS em chunks de 1 MB (Premise C: heap delta = 0). Idempotente via `mtime`.
3. `DuckDBRowProvider.create` registra o file handle, materializa tabela `qualia_lazy_<id>` com coluna sintética `__source_row` (= papaparse row index, parity com eager).
4. AG Grid Infinite paginates via `getRows(params)` → traduz `params.sortModel` + `params.filterModel` pra SQL → `DuckDBRowProvider.getRowsByDisplayRange` retorna a página.
5. `display_row mapping` (DuckDB temp table) cacheia `__source_row → display_row` sob sort+filter atual pra `navigateToRow` em O(1).

### Filter UI: server-side via SQL WHERE

`defaultColDef.filter: true` habilita o filter UI nativo do AG Grid em colunas reais. Cada `filterChanged`:

1. `gridApi.getFilterModel()` → AG Grid filterModel (text/number/combined).
2. `buildWhereClause(filterModel)` (em `src/csv/duckdb/filterModelToSql.ts`, helper puro com 19 testes) traduz pra SQL `WHERE` escapado.
3. `LazyState.currentFilter = { whereClause, filteredCount }` é atualizado **sincronamente** (AG Grid re-fetcha imediato; sem race) + async `getRowCount(whereClause)` pra `lastRow` correto.
4. `displayMap` é rebuilded com o whereClause (rows filtradas têm display_row reordenado).

Virtual columns (cod-frow/cod-seg/comment) mantêm `filter: !lazy` por-coluna (não estão no DuckDB schema). Filter delas via lazy seria LEFT JOIN com data.json — fora de escopo.

### Batch coding em lazy: bulk SQL + bulk model

Tag button no header de coluna `cod-frow` abre `openBatchCodingPopover`, que é **mode-agnostic**: recebe callback `getFilteredSourceRowIds: () => Promise<number[]>`.

- **Eager**: callback wrapeia `gridApi.forEachNodeAfterFilterAndSort`.
- **Lazy**: callback chama `rowProvider.getFilteredSourceRowIds(whereClause)` — `SELECT __source_row WHERE ...` via DuckDB. Acessa o Arrow vector direto (10× mais rápido que `r.toJSON()`).

Aplicação em massa: `CsvCodingModel.addCodeToManyRows / removeCodeFromManyRows / removeAllRowMarkersFromMany`. Single-pass index build (O(M)) + iterate sourceRowIds (O(R)) + ÚNICO `notify()` ao final. Reduz batch em 661k rows de minutos pra ~1-3s.

`getCodeIntersectionForRows` calcula codes presentes em todas as rows visíveis em O(M+R) com early-exit. Skipped acima de 5000 rows (interseção é praticamente sempre vazia em datasets enormes; recompute é desperdício).

### Cleanup race entre `onUnloadFile` e queries DuckDB em flight

`onUnloadFile` snapshots `lazyState` e seta `null` ANTES de `gridApi.destroy()` ou da teardown async (`dropDisplayMap`, `dispose`). Concurrent paths (`refreshLazyDisplayMap`, `refreshLazyFilter`, datasource em flight) re-checam `this.lazyState` após cada await e abortam silenciosamente se virou null. Sem isso, sessões com filter rápido + troca de arquivo emitem "DuckDBRowProvider has been disposed" no console.

### Deferred load no restore de workspace

Heurística: `app.workspace.layoutReady === false` durante restoration. Arquivos > threshold mostram placeholder inerte "Click to open this file" em vez de auto-disparar o banner. Resolve "Obsidian travado eternamente" ao reabrir vault com parquet pesado na leaf — auto-load competia com plugin parsing (49MB bundle) por thread.

### Non-blocking `onLoadFile`

**Anti-pattern descoberto**: `await this.confirmLoadLargeFile(...)` dentro de `onLoadFile` prende o `loadFile` interno do Obsidian. Workspace inteiro paralisa (até markdown não abre) até o user clicar em algum botão do banner.

Fix: extraído `loadEagerPath(file)`. `onLoadFile` retorna IMEDIATAMENTE após renderizar o banner; botões disparam o próximo passo via `.then()`. Cada callback faz `if (this.file !== file) return` pra desistir se o user trocou de arquivo enquanto o banner estava aberto.

### `markerTextCache` — preview de markers em lazy sem cascade async (2026-05-04)

Lazy mode lê cellText de DuckDB+OPFS. Sidebar (`SidebarModelInterface.getMarkerText`) é sync — não pode `await`. Backlog original sugeria cascade async em `getAllMarkers / getMarkerById / getMarkersForFile` → `Promise<...>` (12+ sites em `core/`). Foi **rejeitado** por contaminar drag-drop, hover e listas que não precisam de markerText.

**Solução adotada:** cache derivado em `CsvCodingModel.markerTextCache: Map<markerId, string>`.
- `populateMarkerTextCacheForFile(fileId, provider)` no lazy `onLoadFile`: chunked (1000 markers/batch) + dedup por `(sourceRowId, column)` via `batchGetMarkerText`. Aplica `from..to` substring em segment markers.
- `populateMissingMarkerTextsForFile(fileId, provider)` invocado via `model.onChange` listener debounced 100ms — top-up após batch coding sem refetch dos já cacheados. Retorna `added` pro caller decidir se chama `notifyListenersOnly`.
- `getMarkerText` (sync) consulta cache → `rowDataCache` (eager) → null. `getMarkerTextAsync` cobre o caminho lazy on-demand e popula cache no hit.
- Invalidação granular nos 6 sites de remove: `removeMarker`, `removeAllMarkersForFile`, `clearAllMarkers`, `deleteSegmentMarkersForCell`, `removeCodeFromManyRows`, `removeAllRowMarkersFromMany`. Cada um faz `markerTextCache.delete(id)` antes de splice/filter.
- Cleanup per-file no `onUnloadFile` (`clearMarkerTextCacheForFile`).

**Trade-off:** ~5MB RAM por file aberto com 10k markers (custo previsível, limpa no unload). +200-500ms no open de file lazy com 10k markers (chunked batch). Todos os outros engines (markdown/pdf/image/audio/video) continuam sync sem qualquer mudança — só CSV precisa do cache porque é o único cuja cellText vem de IO assíncrono.

### `notifyListenersOnly` — re-render sem persistir cache derivado

`CsvCodingModel.notify()` chama `saveMarkers()` antes de disparar listeners. Pra cache populates (rowDataCache eager + markerTextCache lazy), persistir o data.json é desnecessário — o cache é derivado do file no disco. `notifyListenersOnly()` foi adicionado pra triggerar re-render da sidebar sem write.

Usos: `csvCodingView` chama após `rowDataCache.set` no eager path e após `populateMarkerTextCacheForFile` / `populateMissingMarkerTextsForFile` no lazy path. Também: `MarkerPreviewHydrator.scheduleNotify` (debounced via RAF) chama após batch popular `markerTextCache` — re-render dos consumers cobre cross-engine sem duplicar canal.

### `MarkerPreviewHydrator` — populate sob demanda pra arquivos lazy não abertos (2026-05-06)

`prepopulateMarkerCaches.ts` (Fase 6 Slice A) só popula lazy se OPFS já tem cópia fresca — vault migrado (QDPX import) não tem OPFS. Sem hydrator, sidebar mostrava `Row N · column` (coordenada placeholder via `getMarkerLabel`) ad eternum até user abrir manualmente cada parquet.

**Solução:** orchestrator stateful em `src/csv/markerPreviewHydrator.ts` que ataca on-demand quando consumers renderizam:
- State: `seen: Set<fileId>` (sucesso ou skipped permanente), `inflight: Map<fileId, Promise>` (dedup), `errors: Map<fileId, string>` (retry next time).
- API: `requestHydration(fileId)` idempotente. Wrapper IIFE garante `inflight.set` antes do batch (eager path síncrono não pode deletar entry antes do set acontecer — bug 2026-05-06). `onStatusChange(listener)` pro indicator visual. `markSeen(fileId)` chamado por `prepopulateMarkerCaches` no eager path pra evitar revisita. `dispose()` aguarda inflight com timeout 5s + cancela RAF pending.
- Provider reuse: `csvModel.getLazyProvider(fileId)` — se file aberto pelo user, reusa provider; senão cria próprio (`copyVaultFileToOPFS` se OPFS frio + `DuckDBRowProvider.create`) e dispose ao fim. Race com `csvCodingView.onClose` é catch-handled (provider mid-dispose → throw → outcome error → retry next).
- Single source of truth pra OPFS lazy: `prepopulateMarkerCaches` lazy path foi removido (race com hydrator criava `createSyncAccessHandle` conflict).

**Consumers** (todos chamam `requestHydration(fileId)` per-file durante render): `BaseCodeExplorerView.buildCodeIndex`, `detailCodeRenderer` (`Segments by file`), `detailRelationRenderer` (evidence list, dedup local de fileIds), `detailSmartCodeRenderer` (`groupedByFile`), `smartCodeListModal` (via callback do detail), `memoViewMode` (by-code/by-file mode, filtra `kind === 'marker'`).

**Re-render**: ao completar batch com `addedCount > 0`, hydrator chama `csvModel.notifyListenersOnly()` debounced via RAF (coalesce múltiplos batches concorrentes em 1 notify). Consumers re-renderizam coalescidos via mecanismo existente — `markerToBase` retorna texto sync via cache hit.

---

## 17. Virtual scroll de listas planas (`core/virtualList.ts`)

**Helper genérico**: viewport rendering com row pool diff. Itens fora do viewport (+ buffer) NÃO ficam no DOM. Scroll mounta novos, evicta os que saíram.

**Por que existe.** `baseCodeExplorerView`, `detailCodeRenderer` (markers list + segments by file) e `detailRelationRenderer` (evidence list) iteravam todos os markers e criavam 1 `<div>` + listeners por marker. Vault de teste com batch coding em parquet (665k row markers, 661k num único code) travava o UI thread por segundos quando o user expandia a sidebar. `codebookTreeRenderer` já tinha virtual scroll bespoke pra árvore de codes — `virtualList.ts` extraiu a mecânica em 2026-05-04 (4e9a9cd). Em 2026-05-13 (ca68dbf) o renderer da árvore foi migrado pra também consumir o helper, eliminando o pattern duplicado; tree-specific concerns (folders, depth, drag-drop dataset attrs, selected state, group filter) seguem no `renderRow` callback do consumer.

**API:**
```ts
const list = createVirtualList<BaseMarker>({
  container: scrollEl,        // height-constrained via CSS
  rowHeight: 26,
  buffer: 5,                  // rows extras out-of-viewport
  renderRow: (marker, idx) => buildRowEl(marker),
});
list.setItems(markers);       // troca itens (drop pool + recompute spacer)
list.refresh();               // re-render preservando itens (hover state changes etc)
list.cleanup();               // remove scroll listener (idempotente)
```

**Containers**: `max-height: 50-60vh` + `overflow-y: auto` + `position: relative`. Spacer interno reserva altura virtual completa; rows são `position: absolute; top: ${i * rowHeight}px`. Pra files com poucos markers, `naturalHeight = items.length * rowHeight` é menor que `maxByVh`, então container fica em altura natural sem scroll forçado.

**Limitação:** introduz nested scroll dentro do sidebar (preferível à UI travada). Files muito pequenos com altura natural não têm overflow — cosmético.

---

## 18. File-Level Reference (estrutura do `src/`)

Antes vivia no CLAUDE.md, movido pra cá em 2026-05-05 pra reduzir CLAUDE.md inflado.
Listagem por módulo + responsabilidade. Não é exaustiva — arquivos triviais (1-2 funções
auto-explicativas) podem ser omitidos. Pontos de entrada e arquivos com responsabilidade
não-óbvia entram aqui.

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
    codebookTreeRenderer.ts  — árvore hierárquica com pastas; delega virtual scroll pra createVirtualList
    virtualList.ts           — helper genérico de virtual scroll (rowPool diff + RAF fallback); consumed por codebookTreeRenderer, baseCodeExplorerView, detailCodeRenderer, detailRelationRenderer
    codebookContextMenu.ts   — context menu codigos + pastas (Rename, Delete, Move to folder)
    codebookDragDrop.ts      — drag-drop lifecycle: reparent, merge, move to folder
    detailListRenderer.ts    — "All Codes" list mode + toolbar + opcionalmente Smart Codes section integration
    detailCodeRenderer.ts    — code-focused detail (name, color, description, hierarchy, markers)
    detailMarkerRenderer.ts  — marker-focused detail (excerpt, codes, memo, color override)
    detailRelationRenderer.ts — Relation Detail: header com chips + banner code/app + Memo + Evidence + Delete
    baseCodeDetailView.ts    — abstract base: 4-mode navigation (list / code / marker / smartCode) + relation
    baseCodeExplorerView.ts  — abstract base: Code Explorer tree (Code → File → Segment)
    navigateToMarker.ts      — engine-aware navigation helper (md inline, others via workspace events)
    mergeModal.ts            — MergeModal expandido (4 seções reativas + executeMerge reordenado)
    mergePolicies.ts         — helpers puros pro merge: resolveName/resolveColor/applyTextPolicy
    dialogs.ts               — PromptModal / ConfirmModal genéricos (substituem prompt/confirm nativos)
    imageDimensions.ts       — getImageDimensions com fallback createImageBitmap → <img>
    magnitudeRange.ts        — generateContinuousRange puro (decimais inferidos do step, safety cap)
    drawToolbarFactory.ts    — factory compartilhada de toolbar drawing (PDF + Image)
    codeGroupsPanel.ts       — painel "Groups" no topo do codebook (chips + filter contextual)
    codeGroupsAddPicker.ts   — getAddToGroupCandidates puro (popula FuzzySuggestModal)
    mediaViewTypes.ts        — constantes isoladas de view type
    viewToggleHelpers.ts     — lógica pura: resolveToggleTarget, isMediaViewType
    mediaToggleButton.ts     — injeção do botão `replace-all` no header + performToggleCommand
    fileInterceptor.ts       — intercept unificado + pinnedFileByLeaf pra respeitar swap manual
    codeVisibility.ts        — helpers puros: isCodeVisibleInFile, shouldStoreOverride, cleanOverridesAfterGlobalChange
    codeVisibilityPopover.ts — popover compartilhado (body render + open floating)
    visibilityEventBus.ts    — rAF coalescing bus (singleton) pra notificar views em rajadas
    caseVariables/           — Case Variables: propriedades tipadas por arquivo (mixed-methods)
    memoTypes.ts             — MemoRecord, MaterializedRef, EntityRef (6-way union: code/group/marker/relation-code/relation-app/smartCode) + serializers
    memoHelpers.ts           — getMemoContent / setMemoContent / hasContent
    memoNoteFormat.ts        — parse/serialize de memo notes (frontmatter `qualiaMemoOf`)
    memoPathResolver.ts      — sanitizeFilename + resolveConflictPath
    memoMigration.ts         — migra `memo: string` legacy → MemoRecord (idempotente, cobre code/group/marker/relation/smartCode)
    memoMaterializer.ts      — convertMemoToNote / unmaterialize / syncFromFile / refreshMemoNote (cobre 6 entity types)
    memoMaterializerListeners.ts — vault.on(modify/rename/delete) + reverse-lookup Map + self-write Set
    memoMarkerNaming.ts      — buildMarkerFilename híbrido por engine (excerpt / shape / timecode)
    memoBatchMaterializer.ts — collectAllMemoRefs + categorize + materializeBatch com onProgress + describeRef (cobre 6 kinds)
    materializeAllMemosModal.ts — modal command palette com 3 estados (form / progress / results)
    getAllMarkers.ts         — iterador cross-engine pra qualquer derivação que precisa varrer todos markers
    smartCodes/              — Smart Codes (Tier 3): códigos virtuais por predicate (padrão ATLAS.ti)
      types.ts               — re-exports + isOpNode/isLeafNode
      predicateSerializer.ts — predicateToJson canonical key order + predicateFromJson
      dependencyExtractor.ts — extractDependencies pra invalidação granular
      predicateValidator.ts  — validateForSave: empty/cycle/name-collision/broken-ref/magnitude/incomplete-leaf
      evaluator.ts           — evaluate puro com 2 switches, short-circuit, magnitude parse, cycle guard
      cache.ts               — SmartCodeCache: indexes + dirty set + rAF subscribers + onSmartCodeChanged incremental + computePreview
      smartCodeRegistryApi.ts — SmartCodeRegistry classe (Pattern A): state interno + addOnMutate + setAuditListener + toJSON. SmartCodeAuditEvent typed (sem any)
      builderTreeOps.ts      — helpers puros AST: getNodeAt/addChildToGroup/removeNodeAt/moveNode/changeOperator/replaceLeafAt
      builderModal.ts        — Modal Obsidian 3 zonas: name+color+memo, tree row-based linear, preview live debounced 300ms, FuzzySuggest pra code/folder/group/casevar/smartcode pickers, inline errors
      detailSmartCodeRenderer.ts — render Smart Code Detail (header + memo com Convert to note + Materialized card + query + matches engine-rich + history + delete). Visual reusa codemarker-detail-* classes
      smartCodeListModal.ts  — hub modal (Cmd+P): lista + new + click abre detail INLINE no sidebar OR modal detail
      smartCodesSection.ts   — renderSmartCodesSection wirado no Code Detail "All Codes" mode (section colapsável + eye toggle + 3-dot menu + new btn). PromptModal/ConfirmModal (sem window.prompt/confirm)
    icr/                     — ICR (Inter-Coder Reliability): infraestrutura compartilhada de multi-coder. Ver §19 pro mapa completo.
      coderTypes.ts          — Coder, CoderRun, CoderId types + DEFAULT_CODER_ID
      coderRegistry.ts       — CoderRegistry classe (createHuman/createLLM + addOnMutate + toJSON, mesmo padrão de CodeDefinitionRegistry)
      sourceHashTypes.ts     — SourceHashEntry types
      computeSourceHash.ts   — função pura SHA-256 via SubtleCrypto
      sourceHashRegistry.ts  — registry stateful (getOrCompute lazy + recompute + rename/remove + findByHash + addOnMutate events compute/recompute/rename/remove)
      kappaInput.ts          — KappaInput shape (text-likes/temporal) + char-level explosion + iterateAllUnitKeys
      categoricalKappaInput.ts — CategoricalKappaInput shape (cod row, sem geometria) + extractRowMarkerUnit
      textRange.ts           — TextRange + adapters (extractMarkdownRange, extractPdfRange, extractCsvSegmentRange, extractMediaRange)
      overlap.ts             — computeOverlap puro (intersection 1D com scope check fileId+locator)
      bboxNormalize.ts       — bridge PdfShapeMarker.coords ↔ ImageMarker.coords → PercentShapeCoords comum
      bboxRaster.ts          — rasterize(shape, coords, gridSize) → Bitmap (Uint32Array packed) com clip-to-viewport
      bboxIoU.ts             — iou(a, b) com AABB early-out + AND/popcount32 SWAR
      bboxMatcher.ts         — Hungarian/Munkres assignment (O(max(N,M)³)) + match() com θ post-cutoff → AlignmentEvent[]
      bboxKappaInput.ts      — fromEvents: alignment events → CodedMarker[] (matched colide no mesmo i, unmatched ocupam units sequenciais)
      bboxAdapter.ts         — entry point per-pair: scope grouping (PDF page/Image fileId), adaptive resolution 400×400 trigger, pre-handla casos 0×N e N×0
      reporter.ts            — reportKappa: per-engine + aggregate ponderado + aggregateWarnings cross-unit (chars/seconds/categorical/spatial-bbox)
      coefficients/
        cohenKappa.ts        — Cohen κ pareado per-char (Po-Pe normalizado)
        fleissKappa.ts       — Fleiss κ N-coders per-char
        krippendorffAlpha.ts — Krippendorff α nominal per-char (coincidence matrix Do/De)
        alphaBinary.ts       — α-binary (collapse codes pra two-level boundary detection)
        cuAlpha.ts           — cu-α (code agreement within shared boundaries — filter chars + reuse αNominal)
        cohenKappaCategorical.ts — Cohen κ sobre unit-level decisions (cod row)
        fleissKappaCategorical.ts — Fleiss κ categórico
        krippendorffAlphaCategorical.ts — Krippendorff α nominal categórico
      sourceSize/            — providers de tamanho real do source per engine (substitui fallback `max(range.to)` que infla P_o em coding esparso)
        mediaSourceSize.ts   — duration de audio/video via HTMLMediaElement.duration (preload metadata, detached)
        pdfSourceSize.ts     — chars por página via `window.pdfjsLib` (caller fallback se PDF não foi aberto na sessão — não force-loadeamos em background)
        csvSegmentSourceSize.ts — chars da célula: eager (rowDataCache, CSV pequeno) → lazy (RowProvider via DuckDB, CSV/parquet >100MB)
        compositeSourceSize.ts — delega por engine entre providers concretos; primeiro non-null vence
      transport/
        payloadTypes.ts      — PayloadV1, ConflictRecord, ExtractResult, MergeResult
        computeCodebookHash.ts — SHA-256 determinístico do codebook (sort por id, ignora createdAt/updatedAt)
        extractCoderContribution.ts — função pura: filtra markers por coderId + coleta codes/groups/sources/coder + computa codebookVersion
        crossVaultRemap.ts   — função pura: lookup hash no registry local → remapeia fileId; emite source_hash_mismatch / multiple_hash_matches / source_not_found
        mergeCoderContribution.ts — função pura: aplica payload via mutação (codebook divergence + coder reg + remap + code/group merge + marker insertion)
      ui/                      — Compare Coders View (Slice E1, 2026-05-10) — UI ICR primeira camada
        compareCodersTypes.ts  — CompareCodersViewState + CurrentSelection + ComparisonScope + ComparisonFilters + createDefaultViewState
        unifiedCompareCodersView.ts — ItemView shell: toolbar sticky + 2 mode pickers (matrix active, table/heatmap E2) + estado central + delega renders
        overviewMatrix.ts      — Mode A matriz coder×coder: Cohen κ pareado via reportPairwise + color scale fixo (qc-kappa-low/-mid-low/-mid-high/-high) + click→pair selection
        scopeExtraction.ts     — cohort-level adapter: itera 5 engines (md/pdf/csvSegment/csvRow/audio/video) + filter por scope + delega per-marker extractors dos slices 1+4. vault.cachedRead pra source text de markdown. Bbox engines pulados (E2)
        drilldownSpatial.ts    — P1 spatial: lanes per coder com [code-label] colorido (text-likes); csv-row delega pra csvCodingView.setCompareMode (cellStyle real no AG Grid)
        compareModeColoring.ts — helpers puros: computeRowGradient (gradient CSS N stripes por coder) + computeRowMarkersByCell (Map<sourceRowId::column, markers[]>)
        filterChips.ts         — toggle coders + "destacar conflitos" + "esconder agreement total" → mutate state.filters
    ...                      — DataManager, CodeDefinitionRegistry, settings, types
  markdown/                  — CodeMirror 6 engine para markdown
    cm6/
      markerViewPlugin.ts    — ViewPlugin orquestrador
      handleOverlayRenderer.ts — SVG drag handles
      dragManager.ts         — ciclo de vida do drag
      marginPanelLayout.ts   — layout algorithm puro
  pdf/                       — PDF viewer + coding (fabric.js)
    pdfCodingTypes.ts        — PdfMarker, PdfShapeMarker (markerType: 'pdf')
    pdfCodingModel.ts        — model CRUD (indices DOM-alinhados)
    selectionCapture.ts      — captura seleção → indices via hitTestTextLayer
    highlightRenderer.ts     — pinta rects via textDivs
    dragHandles.ts           — handle drag → updateMarkerRange
    pageObserver.ts          — lifecycle: textlayerrendered → renderPage
    pdfPlainText.ts          — buildPlainText (export)
    pdfExportData.ts         — loadPdfExportData (export)
    resolveMarkerOffsets.ts  — marker.text → offset absoluto
    extractAnchorFromPlainText.ts — slice → text/page (import)
    resolvePendingIndices.ts — text-search → indices (import runtime)
  csv/                       — CSV/Parquet engine (ag-grid, papaparse, hyparquet, duckdb-wasm)
    csvCodingTypes.ts        — SegmentMarker, RowMarker, CsvMarker (markerType: 'csv')
    csvCodingModel.ts        — model CRUD + bulk row ops + lazy providers + markerTextCache
    csvCodingView.ts         — FileView orquestrador (eager + lazy paths)
    markerPreviewHydrator.ts — orchestrator stateful pra hidratação on-demand (lazy)
    parseTabular.ts          — parseTabularFile compartilhado (papaparse + hyparquet)
    prepopulateMarkerCaches.ts — pre-populate de markerTextCache no startup
    resolveExportTexts.ts    — resolve cellText pra export (6 cases: eager/lazy × aberto/fechado)
    lazyProgressFormat.ts    — formatLazyProgress puro
    csvCodingMenu.ts         — popovers de codificacao
    csvCodingCellRenderer.ts — cell renderer AG Grid
    segmentEditor.ts         — CM6 split panel
    columnToggleModal.ts     — Modal de settings de colunas + CommentCellEditor
    csvHeaderInjection.ts    — MutationObserver pros headers AG Grid
    duckdb/                  — Lazy mode infra: DuckDB-Wasm + OPFS + filter SQL
      duckdbBootstrap.ts     — createDuckDBRuntime() factory + 2 shims pro Worker em Electron
      duckdbRowProvider.ts   — DuckDBRowProvider pra eager + lazy modes
      filterModelToSql.ts    — buildWhereClause(filterModel) → SQL escapado
      opfs.ts                — copyVaultFileToOPFS streaming + isOpfsCached + removeOPFSFile
      rowProvider.ts         — interface RowProvider + MockRowProvider
      wasmAssets.ts          — WASM bytes embedded gzipados (32.7MB → 7.6MB)
  image/                     — Image coding (fabric.js, zoom/pan per-file)
    imageCodingTypes.ts      — ImageMarker (markerType: 'image'), RegionShape, NormalizedCoords
    imageCodingModel.ts      — model CRUD + persistence
    imageCodingMenu.ts       — lifecycle wrapper
    imageToolbar.ts          — toolbar de drawing
    regionHighlight.ts       — hover glow effect
    regionLabels.ts          — labels de codigo sobre regioes
    canvas/                  — Fabric.js canvas, drawing, zoom/pan
  audio/                     — Audio engine — thin wrapper via MediaViewCore
  video/                     — Video engine — thin wrapper via MediaViewCore
  export/                    — REFI-QDA export (QDC codebook + QDPX) + CSV tabular
    qdcExporter.ts           — gera XML do codebook
    qdpxExporter.ts          — orquestra export completo (incl. <qualia:SmartCodes> namespace)
    xmlBuilder.ts            — helpers XML
    coordConverters.ts       — conversao de coords por engine
    exportModal.ts           — modal pre-export
    exportCommands.ts        — commands na palette
    caseVariablesXml.ts      — QDPX helpers pra cases/variables
    tabular/                 — CSV zip export pra R/Python/BI
      csvWriter.ts           — primitivo CSV (RFC 4180 + UTF-8 BOM)
      readmeBuilder.ts       — gera README.md embutido
      buildSegmentsTable.ts  — consolida 8 sourceTypes
      buildCodeApplicationsTable.ts — 1 linha per (segment, code)
      buildCodesTable.ts     — codebook denormalizado
      buildCaseVariablesTable.ts — long format
      buildRelationsTable.ts — unifica code-level + application-level
      buildGroupsTable.ts    — groups.csv standalone
      buildSmartCodesTable.ts — smart_codes.csv (incluindo memo.content + matches_at_export)
      tabularExporter.ts     — orchestrator (incl. csvModel access pra cell text)
  import/                    — REFI-QDA import (QDC + QDPX)
    qdcImporter.ts           — parse XML codebook
    qdpxImporter.ts          — orquestra import completo (incl. parseSmartCodes 2-pass + remap codeId)
    xmlParser.ts             — helpers parse XML
    importModal.ts           — modal de import
    importCommands.ts        — commands na palette
  analytics/                 — Charts e word clouds (chart.js)
    data/
      consolidationCache.ts  — cache incremental por engine
      dataConsolidator.ts    — 6 funcoes puras por engine + consolidate()
      dataReader.ts          — readAllData(DataManager)
      relationsEngine.ts     — extractRelationEdges/Nodes (Network View)
      statsEngine.ts         — barrel re-export (frequency, cooccurrence, evolution, sequential, inferential, textAnalysis, codeMetadata)
      statsHelpers.ts        — applyFilters compartilhado
      inferential.ts         — calculateChiSquare puro
      binning.ts             — binNumeric/binDate/explodeMultitext puros
      codeMetadata.ts        — calculateCodeMetadata + chi²
      memoView.ts            — aggregateMemos pura
      codebookTimelineEngine.ts — Codebook Timeline helpers
      clusterEngine.ts       — hierarchicalCluster + buildDendrogram + cutDendrogram + calculateSilhouette (puro, sync)
      cluster.worker.ts      — Worker inline pro hierarchicalCluster + computeClusterArtifacts (off-main-thread, evita UI freeze em codebook grande)
      clusterWorkerClient.ts — Promise-based client; `hierarchicalClusterAsync` / `computeClusterArtifactsAsync` consumidos por cooccurrence/overlap/dendrogram (fire-and-forget + isRenderCurrent guard)
      clusterSyncFallback.ts — fallback sync pra jsdom em tests (sem Worker)
    board/                   — Research Board (Fabric.js)
    views/
      analyticsView.ts       — classe AnalyticsView
      analyticsViewContext.ts — interface + type aliases
      configSections.ts      — config panel sections compartilhadas
      shared/chartHelpers.ts — heatmapColor, computeDisplayMatrix, etc
      modes/                 — 23 mode modules (1 por visualizacao)
  media/
    mediaTypes.ts            — MediaMarker (markerType: 'audio' | 'video'), MediaFile, BaseMediaSettings
    mediaViewCore.ts         — logica compartilhada audio/video via composicao
    mediaViewConfig.ts       — interface de configuracao
    mediaCodingModel.ts      — base class generica
    mediaCodingMenu.ts       — popover compartilhado
    mediaSidebarAdapter.ts   — sidebar adapter compartilhado
    regionRenderer.ts        — renderizacao de regioes (wavesurfer)
    waveformRenderer.ts      — wrapper WaveSurfer.js
    formatTime.ts            — helper de formatacao de tempo
```

---

## 19. ICR — Inter-Coder Reliability

**Adicionado 2026-05-09.** Frente entregue em 4 slices: motor κ texto, hash por source, transport multi-coder remoto, adapters cod row + áudio/vídeo. Cobre 5 das 6 engines do plugin (PDF shape + imagem ficam pra slice futuro com brainstorm metodológico — bbox IoU em QDA é terreno aberto).

### 19.1 Visão arquitetural

```
                 ┌─────────────────────────────────┐
                 │  CoderRegistry (Slice 1)        │
                 │  ── seed default + create*      │
                 └────────────┬────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
     ┌──────────────┐ ┌─────────────┐ ┌──────────────────┐
     │  Adapters    │ │  Motor κ    │ │  SourceHash      │
     │  por engine  │→│  paramétric │ │  Registry        │
     │  (Slice 1+4) │ │  (Slice 1)  │ │  (Slice 2)       │
     └──────────────┘ └─────────────┘ └────────┬─────────┘
                              │                 │
                              ▼                 │
                  ┌────────────────────┐        │
                  │  Reporter          │        │
                  │  per-engine + agg  │        │
                  │  (Slice 1+4)       │        │
                  └────────────────────┘        │
                                                ▼
                                      ┌──────────────────┐
                                      │  Transport       │
                                      │  multi-coder     │
                                      │  (Slice 3)       │
                                      │  ── extract      │
                                      │  ── merge + remap│
                                      └──────────────────┘
```

### 19.2 Princípios cravados

1. **`codedBy: CoderId` unificado** — humano e LLM no mesmo eixo de schema (`'human:default'`, `'human:carla'`, `'llm:gpt-4o'`). Função pura κ não distingue tipo de coder. Ver `obsidian-qualia-coding/plugin-docs/research/ICR-DESIGN-SKETCH-2026-05-08.md §3`.

2. **Função pura κ paramétrica por geometria de overlap** — adapter por engine traduz marker pra `TextRange` normalizado (texto-likes + temporal) ou `CategoricalUnit` (cod row, sem geometria). Coeficientes operam sobre representação genérica:
   - **Per-char** (markdown / PDF text / CSV cod segment): char é unit; cu-α / α-binary / Cohen κ / Fleiss κ / Krippendorff α
   - **Per-segundo** (audio / video): segundo é unit; reusa coeficientes texto-likes (espaço de coordenadas troca, álgebra não)
   - **Categorical** (CSV cod row): unit pré-definida (file + row + column); coeficientes próprios sobre unit-level decisions sem char explosion

3. **Hash SHA-256 como primitiva arquitetural transversal** — não é só "validação pra ICR"; serve cache invalidation cirúrgica (markerTextCache), rename detection (`vault.on('rename')`), QDPX import dedup, cross-vault remap (transport multi-coder).

4. **Transport multi-coder via funções puras** — payload JSON v1.0 com `codebookVersion` hash + `coder` full + `sources` com hash + `codes` referenciados + `markers` per engine. `extractCoderContribution` filtra subset por coderId; `mergeCoderContribution` aplica via mutação direta com cross-vault remap embutido. UI ainda não existe (Fase C P1, gated em UX brainstorm).

### 19.3 Coeficientes implementados

5 pra texto-likes/temporal + 3 pra categorical = 8 coeficientes ao todo:

| Coeficiente | Texto-likes / Temporal | Categorical |
|---|:---:|:---:|
| Cohen κ pareado | ✅ | ✅ |
| Fleiss κ N-coders | ✅ | ✅ |
| Krippendorff α nominal | ✅ | ✅ |
| α-binary (boundary) | ✅ | n/a (vacuous=1) |
| cu-α (code-within-boundary) | ✅ | n/a (vacuous=1) |

Reporter retorna `byEngine: Record<EngineId, CoefficientReport>` + `aggregate` (média ponderada por #markers ou #units) + `aggregateWarnings` (string[]) emitido quando engines de unidades incomparáveis (chars vs seconds vs categorical) entram juntos no aggregate.

### 19.4 EngineId enum

```typescript
type EngineId = 'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'audio' | 'video';
```

Cobertura por engine:

| Engine | Geometria | Algoritmo | Slice |
|---|---|---|---|
| markdown | per-char offset linear | per-char | 1 |
| pdf | per-char page-aware (`page:N`) | per-char | 1 |
| csvSegment | per-char dentro de cell range | per-char | 1 |
| csvRow | unit pré-definida | categorical | 4 |
| audio | overlap temporal segundos (Math.floor/ceil) | per-second | 4 |
| video | overlap temporal segundos | per-second | 4 |
| **pdf shape** | bbox IoU (não implementado) | bbox IoU | futuro (brainstorm precede) |
| **image** | bbox IoU (não implementado) | bbox IoU | futuro (brainstorm precede) |

### 19.5 Hash registry (Slice 2)

`SourceHashRegistry` — stateful classe com `Map<fileId, SourceHashEntry>`. Pattern de `CodeDefinitionRegistry` (addOnMutate listeners + toJSON/fromJSON). Eventos: `compute` (primeira vez), `recompute` (mudou), `rename` (path movido), `remove` (deletado). Hooks no plugin onload:

- `vault.on('rename')` → `renameEntry(oldPath, newPath)`
- `vault.on('delete')` → `removeEntry(path)`
- `vault.on('modify')` → se file tracked, `recompute(path)`; se hash mudou, invalida `csvModel.markerTextCache` pra esse fileId

QDPX import dedup: `extractSource()` chama `findByHash(incomingHash)` antes de criar duplicata em `imports/<projectName>/`.

### 19.6 Transport (Slice 3)

`extractCoderContribution(data, coderId, hashRegistry)` filtra markers por `codedBy` + coleta deps (codes/groups/sources/coder) + computa `codebookVersion`. Retorna `{ payload: PayloadV1, warnings: string[] }`.

`mergeCoderContribution(localData, payload, hashRegistry)` aplica payload via mutação:
1. Codebook divergence → emit `codebook_diverged` conflict (warning, não bloqueia)
2. Coder registration se ausente
3. Cross-vault remap: `crossVaultRemap(payload.sources, hashRegistry)` retorna `fileIdRemap` + conflicts (`source_hash_mismatch` / `multiple_hash_matches` / `source_not_found`)
4. Code merge: incoming wins on diff + emit `code_overwritten` conflict
5. Group merge: skip se existe (não-overwrite, conservador)
6. Marker insertion per engine com `fileId` remapped

Plugin expõe `icrTransport.extract(coderId) / merge(payload)` no main, chamável via console DevTools. UI fica em Fase C P1 (gated em UX brainstorm).

### 19.7 Out of scope (registrado em BACKLOG)

- **Adapter PDF shape + imagem (bbox IoU)** — terreno aberto, brainstorm metodológico precede
- **Fase C P1 (UX layer)** — comando export, modal preview, side-by-side compare, cherry-pick, conflict resolution UX, multi-import staging, codebook divergence UX, source divergente alert
- **Smart Code cache hash invalidation** — adiado (predicates atuais não dependem de texto)
- **Backup integrity validation** — adiado (semântica fragmentada, restore raro)
- **Resolução sub-segundo audio/video** — otimização futura
- **Pre-warm de durações de media files** — otimização futura

### 19.8 UI layer (Slice E1, 2026-05-10)

Primeira camada de UI ICR. Cobre overview Mode A + drill-down P1 spatial + filter chips. E2/E3a/E3b/E4 destrava completar a frente (Modes B/C + Modal + Reconciliação P2/P3 + Saved Comparisons).

Arquivos novos em `src/core/icr/ui/`:
- `compareCodersTypes.ts` — types de estado central (`CompareCodersViewState`, `CurrentSelection`, `ComparisonScope`, `ComparisonFilters`)
- `unifiedCompareCodersView.ts` — `ItemView` shell. Constructor `(leaf, plugin)` per project pattern. Toolbar sticky com 2 mode pickers + estado central. Render delega pra módulos
- `overviewMatrix.ts` — Mode A matriz coder×coder. Cohen κ pareado por célula (via `reportPairwise` no reporter). Color scale fixo (vermelho<0.4, laranja<0.6, verde claro<0.8, verde escuro)
- `scopeExtraction.ts` — cohort-level adapter. Itera 5 engines (md/pdf/csvSegment/csvRow/audio/video), filter por scope, chama per-marker extractors dos slices 1+4 (`extractMarkdownRange` etc), produz `EngineKappaInput[]`. `vault.cachedRead` pra source text de markdown. Bbox engines (`pdfShape`, `image`) pulados — per-pair pathway do slice 6 fica pra E2
- `drilldownSpatial.ts` — P1 spatial. Lanes per coder com `[ code-label ]` colorido pra text-likes. csv-row delega pra `csvCodingView.setCompareMode` (cellStyle real no AG Grid)
- `compareModeColoring.ts` — helpers puros `computeRowGradient(applications)` (gradient CSS N stripes por coder) + `computeRowMarkersByCell(markers)` (Map<sourceRowId::column, markers[]>)
- `filterChips.ts` — toggle coders (modifica `filters.visibleCoderIds`) + "destacar conflitos" + "esconder agreement total"

Helper novo no reporter: `reportPairwise(inputs, pairs)` — KappaReport por par. Cohen κ direto de `aggregate.cohenKappa[a|b]`; Fleiss/α/cu-α/α-binary via input filtrado ao par (filter `markers` por `coderId`, troca `coders` por `[a, b]`).

Hook novo em `csvCodingView.ts`: `setCompareMode({ markerIndex, coderColors })` / `clearCompareMode()`. cellStyle callback consulta `compareModeContext` e retorna `{ background: linear-gradient(...) }` quando há row markers no escopo.

Comando palette: `Compare Coders: Open` (view type `qc-compare-coders`).

Testes: 43 novos (3032 → 3075 total), distribuídos em `tests/core/icr/reportPairwise.test.ts` + `tests/core/icr/ui/*.test.ts`.

### 19.9 UI layer Slice E2 (2026-05-10)

Segunda camada da Compare Coders View. Completa overview (Mode B tabela + Mode C heatmap), integra bbox engines via per-pair pathway, ativa coefficient picker funcional + filter "esconder agreement total", entrega Modal "ver lado a lado" + polish E1 (κ=0 vacuous).

Arquivos novos em `src/core/icr/ui/`:
- `coefficientResolver.ts` — `getCoefficientValue(report, coef, pair?)` extrai número do `KappaReport` (Cohen pareado direto; Fleiss/α/α-binary/cu-α scalar) + `isCoefficientApplicable(coef, N, engines)` (Fleiss requer 3+ coders; α-binary/cu-α requerem engine com boundary)
- `coefficientPicker.ts` — render 5 chips no toolbar com disabled state (mesmo pattern dos mode chips)
- `bboxScopeExtraction.ts` — `computeBboxKappaForPair(scope, pair, mode, theta)`. Wrap `bboxAdapter.buildKappaInput` per-pair. Modes `'unified'` (1 KappaInput pdfShape ∪ image → coluna virtual `'spatial-bbox'`) ou `'split'` (2 separados)
- `overviewSharedRender.ts` — `kappaClass(k)` + thresholds extraídos de `overviewMatrix` (reuso entre 3 modes)
- `overviewTable.ts` — Mode B. 1 row por código com markers no escopo × 5 coeficientes. Sort default por pior coeficiente primário (Cohen pra N=2; Fleiss pra N≥3) ascendente. Click row → `currentSelection: { kind: 'code' }`
- `overviewHeatmap.ts` — Mode C. Linhas codes × colunas engines visíveis + spatial-bbox (default unified) ou pdfShape | image (toggle splitBboxEngines). Cell = primaryCoefficient. Cinza n/a quando code não aparece na engine. Bbox: avg de C(N,2) Cohen κ pareados pra N>2
- `coderInclusion.ts` — `getCodersWithMarkersInScope(scope, models)` + `applyCoderInclusion(scope, models, includeWithoutMarkers)`. Polish E1: filtra coders com 0 markers no escopo (default off; toggle reincluí). Considera todos engines incluindo bbox
- `narrativeDiagnostic.ts` — `analyzeDiagnostic({ cohen, alphaBinary, cuAlpha })` puro. 3 padrões hardcoded: cohen baixo + α-binary alto (boundary OK / código diverge) / cohen baixo + α-binary baixo (boundary disagreement) / cu-α << κ gap ≥ 0.4 (code-within-boundary)
- `compareCoderCoefficientsModal.ts` — `extends Modal`. 2 estados toggle no header (single-pair adiciona breakdown per-engine; all-pairs lista C(N,2) aggregates). Diagnóstico narrativo dispara em single-pair quando padrão bate. Export markdown via clipboard com Notice de confirmação. Field renomeado `compareScope` (não `scope`) pra evitar colisão com `Modal.scope` da API Obsidian

Modificações:
- `overviewMatrix.ts` — lê `state.primaryCoefficient` via `getCoefficientValue` (não mais Cohen hardcoded). Bbox entra no `reportPairwise` via param `perPairInputs?: Map<pairKey, EngineKappaInput[]>` (Slice E5b-followup, 2026-05-11) — aggregate weighted por `markers.length` natural, eliminou avg 50/50. Aplica `applyCoderInclusion` + `hideAgreementTotal` fade
- `filterChips.ts` — adiciona 6 engine chips (markdown / pdf / csv-seg / csv-row / audio / video) + toggles "split bbox engines" + "incluir coders sem markers". Coder chip ganha `is-empty` (cinza claro + tooltip) quando coder não tem markers + filter polish off
- `compareCodersTypes.ts` — `ComparisonFilters` ganha `visibleEngineIds?` (override scope.engineIds via toggle), `splitBboxEngines?` (default false), `includeCodersWithoutMarkers?` (default false)
- `scopeExtraction.ts:EngineModelsForExtraction` — adiciona `image?: { getAllMarkers(): ImageMarker[] }` + `pdf.getAllShapes?(): PdfShapeMarker[]`
- `unifiedCompareCodersView.ts` — toolbar ganha picker + botão `↗ ver lado a lado`. `engineModels()` inclui `imageModel`. Plug Modes B/C
- `core/types.ts:GeneralSettings.showNarrativeDiagnosis?` (default true) — opt-out via Settings tab

**Setting nova:** `general.showNarrativeDiagnosis` (default true). Toggle em Settings tab esconde caixa amarela do diagnóstico.

**Bbox em matriz Mode A** usa average 50/50 entre text-likes e bbox quando ambos contribuem pro pair. Weighting proper via #events fica em backlog (não bloqueia E2 — UX honesta com tooltip ainda em backlog também).

**spatial-bbox NÃO é EngineId do reporter** — é label de UI no heatmap. Reporter recebe `engine: 'pdfShape'` mesmo quando bbox unified, porque é só agregação visual.

**Modal Obsidian gotcha:** classe Modal tem propriedade `scope: Scope` própria. Subclasse não pode declarar campo `scope` novo (TS error). Workaround: usar nome diferente (`compareScope`).

Testes: ~75 novos (3075 → 3150 total), em `tests/core/icr/ui/`: coefficientResolver, coefficientPicker, bboxScopeExtraction, overviewTable, overviewHeatmap, coderInclusion, narrativeDiagnostic, compareCoderCoefficientsModal + extensões em overviewMatrix + filterChips.

### 19.10 UI layer Fase C P1 — Import/Export multi-coder (2026-05-10)

**Surface:** ItemView único `qc-icr-import` (full tab via `getLeaf('tab')`, não sidebar). Layout grid 200px (rail) + 1fr (main com toolbar + body re-render). Reusa pattern `qc-cc-mode-chip` do Compare Coders.

**3 chips no body:**
- ▦ **Visão geral** — seções inline expandable (codebook divergence + sources problemáticos + OK) + footer Apply via `divergenceResolver.computeBreakdown`
- ▤ **Lado a lado** — marker-by-marker com nav ←/→ + filter chips (todos/sobrepondo/novos) + filterCodeId opcional. Markers locais sobrepondo via `findOverlappingLocalMarkers` (extract*Range + computeOverlap).
- ▥ **Por código** — agrupa por codeId com counts + batch actions (Accept all / Skip all / Revisar 1-a-1 → muda chip filtrado)

**Motor estendido (P0 prereq):** `mergeCoderContribution(..., options?: { dryRun?, overrides? })`. `dryRun: true` computa MergeResult sem mutar localData (preview pra UX). `overrides: ResolutionOverrides` aplica skip per-source/code/marker + manter local. Precedência §4.2: skipSource ⊃ skipCode ⊃ skipMarker ⊃ pending.

**Bug latente fixado:** motor agora emite `source_not_found` pra fileIds referenciados por markers que escaparam de `payload.sources` (caso real: extract sem hash registry pro PDF). Sem isso, UX mostraria "N ficam fora" sem seção pra explicar.

**Triggers:**
- Import = ribbon `git-pull-request` ("ICR Import") + comando `ICR: Open import`
- Export = botão `↗ exportar contribuição` no toolbar do Compare Coders View + comando `ICR: Export my contribution`. Filter coders por `type === 'human'`. Modal seleção quando >1. Salva em `vault/icr-exports/<slug>-<iso>.json` via `vault.adapter.write`.

**Arquivos novos** em `src/core/icr/contributions/`:
- `contributionViewTypes.ts` — IcrImportViewState, PendingContribution, ResolutionOverrides + helpers (createEmpty, clone)
- `contributionLoader.ts` — parse PayloadV1 com erros estruturados
- `divergenceResolver.ts` — computeBreakdown puro (N_in/N_out)
- `unifiedIcrImportView.ts` — ItemView, drop handler, keyboard nav, applyContribution, recompute previews sequenciais
- `importToolbar.ts` — chips + sub-pergunta + meta header
- `rail.ts` — lista lateral + drop zone (DOM puro testável)
- `overviewChip.ts` — 3 seções inline + footer
- `sideBySideChip.ts` — marker card + filter
- `byCodeChip.ts` — group + batch actions
- `overlapHelper.ts` — predicate per engine via extract*Range + computeOverlap (markdown degraded sem sourceText)
- `exportTrigger.ts` — orquestrador export + CoderPickerModal

**Modificações:** `mergeCoderContribution.ts` (options param), `unifiedCompareCodersView.ts:91` (botão export), `main.ts` (registerView + ribbon + 2 commands + helper `openIcrImportView`), `tests/setup.ts` (setText polyfill).

**Limites conhecidos** (refinements no BACKLOG):
- Markdown overlap retorna [] sem sourceText (degraded mode — PDF + CSV funcionam)
- Por código overlap = aproximação `min(local, incoming)` por codeId (não range overlap exato)
- "Map manual" pra source não implementado (só Skip / Trust local)

Testes: 72 novos (3150 → 3222 total), em `tests/core/icr/contributions/`.

### 19.11 UI layer Slice E3a — Reconciliação P2 (2026-05-11)

Reconciliação multi-coder via drill-down Cards em `UnifiedCompareCodersView`. Pesquisador escolhe região contestada → cards lado a lado mostram codes de cada coder → 4 ações (adopt additive / adopt overwrite / accept-divergence / split em code novo). Decisão fica em audit log reversível.

**Schema audit (extensão em `src/core/types.ts`):**

`BaseAuditEntry.entity?` ganha terceiro discriminator `'reconciliation'`. `BaseAuditEntry.codeId` continua sendo anchor: target code da adopt, newCodeId da split, `candidateCodeIds[0]` da accept-divergence (ou `''` se sem candidatos — entry vai pra queue P3 mas não polui timeline). Soft-delete via `hidden` funciona igual.

3 audit types novos:

```typescript
| { entity: 'reconciliation'; type: 'reconciliation_opened';
    region: { fileId; engine: EngineId; bounds: ReconciliationBounds };
    coderIds: CoderId[]; candidateCodeIds: string[] }
| { entity: 'reconciliation'; type: 'reconciliation_decided';
    region; coderIds; decision: ReconciliationDecision;
    consensusMarkerId?: string; memoOfReconciliation: string }
| { entity: 'reconciliation'; type: 'reconciliation_reverted';
    originalEntryId: string; restoredMarkerIds: string[] }
```

`ReconciliationDecision` union: `adopt{codeId, mode, preStateSnapshot?}` / `split{newCodeId, mode, preStateSnapshot?}` / `accept-divergence` / `reject`. `mode = 'consensus-marker' | 'overwrite-originals'` (overwrite-only no adopt/split). `ReconciliationBounds` discriminado: `text{from,to}` (markdown char offsets) / `csvRow{rowIndex, column?}` / `temporal{fromMs, toMs}` (audio/vídeo Fase 2). `MarkerSnapshot{markerId, engine, fileId, serialized: unknown}` armazena round-trip JSON pra revert.

`getEntriesForCode(log, codeId)` foi estendido pra incluir entries `entity='reconciliation'` cujo anchor codeId bate — Code Stability Timeline existente exibe as decisões de reconciliação naturalmente. `codebookTimelineEngine` mapeia os 3 types pro bucket `'reconciliation'` (cor #e07b3f, distinto de created/edited/etc).

**Coder type `'consensus'` (em `src/core/icr/coderTypes.ts`):**

`CoderKind = 'human' | 'llm' | 'consensus'`. `CoderRegistry.createConsensus(slug, displayName?)` idempotente — `'consensus:default'` default, slugs adicionais permitidos pra waves (`'consensus:wave-1'`, `'consensus:final'`). `getCodableCoders()` retorna filter excluindo consensus (peer ICR feature em backlog: dropdown coder picker em popovers das 5 engines).

**`IcrMarkerOps` façade (em `src/core/icr/markerOps.ts`):**

Interface cross-engine pra orquestrador. Métodos: `createMarker(engine, spec) → {markerId}`, `removeMarker`, `updateMarker(fields: {codes?})`, `serializeMarker → MarkerSnapshot`, `restoreMarker(snapshot)`, `findMarkersInRegion(region) → {markerId, codedBy, codes}[]`.

`IcrMarkerOpsImpl` (em `src/core/icr/icrMarkerOpsImpl.ts`) wrappando `markdownModel` (`Marker.range` line/ch) + `csvModel.rowMarkers`. PDF/csv-segment/audio/video/image/pdfShape lançam `'engine-not-supported-in-slice'` (extensão exige bounds engine-specific — design em BACKLOG). Pra restore: `insertMarkerRaw(marker)` novo em `codeMarkerModel` + `csvCodingModel` re-insere marker já-formado + emite ADD event + salva.

**Função orquestradora (em `src/core/icr/reconciliation.ts`):**

`executeReconciliationDecision(params): ReconciliationResult`. Pipeline:

- accept-divergence / reject: append audit, retorna (audit-only)
- adopt: ensure consensus coder via `coderRegistry.createConsensus` → valida `decision.codeId` em registry → se `mode === 'overwrite-originals'`: `findMarkersInRegion` → snapshot coders ∈ `region.coderIds` que NÃO têm targetCode → `updateMarker` substituindo codes → cria consensus marker via `createMarker` codedBy `'consensus:default'` → append audit
- split: cria `CodeDefinition` via `registry.create(name)` → mesmo branch adopt mas `targetCodeId = newCodeId`

`executeReconciliationRevert(originalEntryId, params)`: branch por `decision.kind + mode`:
- adopt|split / consensus-marker: `removeMarker(consensusMarkerId)`. `restoredMarkerIds = [consensusMarkerId]`
- adopt|split / overwrite-originals: pra cada snapshot, `restoreMarker(snapshot)` + remove consensus marker. Code novo de split **NÃO é deletado** (pode ter sido reusado em outros markers)
- accept-divergence / reject: nada nos markers, só audit

**P2 UI (em `src/core/icr/ui/drilldownCards.ts`):**

`renderDrilldownCards` é mode picker `'cards'` do drill-down. Sem região selecionada renderiza picker de regiões contestadas; com `state.currentSelection.kind === 'region'` renderiza view (cards + memo + 4 ações).

`collectContestedRegions` agrupa markers por overlap:
- **markdown**: `clusterMarkdownMarkers` itera por file, sort por `rangeKey(line, ch) = line × 1_000_000 + ch`, agrupa por intersecção transitiva. Captura `markerRefs[]` no cluster (não depende de editor aberto pra resolver — corrige bug do smoke 2026-05-11 onde findMarkersInRegion retornava [] sem editor)
- **csvRow**: agrupa por `(fileId, sourceRowId, column)`

Cada `ContestedRegion` ganha `divergenceKind`:
- `'code'`: 2+ codes distintos (dropdown vai ter 2+ candidates) — chip vermelho, border-left vermelho
- `'boundary'`: mesmo code, bounds diferentes — chip laranja
- `'existence'`: só 1 coder — chip cinza, opacidade reduzida

Ordenação do picker: unresolved code > boundary > existence > resolved. Resolved é detectado via `findLatestActiveDecision(region, log)` — varre audit por `reconciliation_decided` matching `regionKey(fileId, engine, bounds)` E NÃO matched por `reconciliation_reverted` posterior. Resolvidas ganham chip `✓ RESOLVIDA` + summary `decisão: adopt/split/manter divergência`, opacidade 0.65 (hover restaura 1).

`SplitNewCodeModal` (em `src/core/icr/ui/splitNewCodeModal.ts`): nome obrigatório + cor opcional + Enter submit + detecta nome duplicado (confirm pra reusar code existente).

**Perf — fixes do smoke 2026-05-11:**

`renderOverview` é async (vault.cachedRead per md + reportPairwise full). Clicks rápidos disparavam N renders paralelos competindo pela UI thread. Fixes em camadas:

1. **Serialize via Promise chain** (`renderQueue`): cada render espera o anterior. Token-guard ANTES do trabalho async descarta tokens stale sem pagar custo.
2. **Cache module-level em `extractInputsFromScope`** (em `src/core/icr/ui/scopeExtraction.ts`): scope-hash key normalizada (arrays sorted pra estabilidade) + `cacheGeneration` counter + LRU 50 entries. `bumpInputsCacheGeneration()` exposto pra invalidação manual.
3. **`setSelection` skipa renderToolbar + renderOverview**: descoberta crítica — overview NÃO destaca célula selecionada via state (matriz só usa `onclick`). Selection-only change só precisa re-renderizar drilldown. Reduz latência de click de 50-150ms+ pra <10ms.
4. **Consensus fora do scope default**: construtor usa `coderRegistry.getCodableCoders()`, não `getAll()` — matriz fica 2×2 até user reincluir consensus via filter chip.
5. **Render num scratch fragment** + commit no container só se token ainda é o atual.

`bumpInputsCacheGeneration()` é chamado no construtor da view + no `onAfterReconciliation` (callback do drilldownCards). Test pollution evitada via `beforeEach` global em `tests/setup.ts`.

**Arquivos novos:**

- `src/core/icr/markerOps.ts` — interface IcrMarkerOps
- `src/core/icr/icrMarkerOpsImpl.ts` — impl wrappando markdownModel + csvModel
- `src/core/icr/reconciliation.ts` — executeReconciliationDecision + executeReconciliationRevert
- `src/core/icr/ui/drilldownCards.ts` — P2 picker + region view + ações + classifyDivergence + resolution tracking
- `src/core/icr/ui/splitNewCodeModal.ts` — modal nome + cor

**Modificações:**

- `src/core/types.ts` — 3 audit types + ReconciliationBounds + MarkerSnapshot + ReconciliationDecision + `entity` discriminator
- `src/core/auditLog.ts` — `renderEntryMarkdown` estende com formatBoundsShort; `getEntriesForCode` inclui entity='reconciliation' cujo codeId bate
- `src/core/detailCodeRenderer.ts` + `src/analytics/views/modes/codebookTimelineMode.ts` — switch handlers pra reconciliation_*
- `src/analytics/data/codebookTimelineEngine.ts` — bucket `'reconciliation'` + cor #e07b3f + mapping dos 3 types
- `src/core/icr/coderTypes.ts` — `CoderKind` alias
- `src/core/icr/coderRegistry.ts` — `createConsensus` + `getCodableCoders`
- `src/markdown/models/codeMarkerModel.ts` + `src/csv/csvCodingModel.ts` — `insertMarkerRaw` pra restore
- `src/core/icr/ui/scopeExtraction.ts` — cache module-level + bumpInputsCacheGeneration
- `src/core/icr/ui/unifiedCompareCodersView.ts` — drill-down mode picker + renderDrilldown switch + renderToken + renderQueue + setSelection skip
- `src/main.ts` — `icrMarkerOps?: IcrMarkerOps` field + instanciação após models loaded + smoke runtime hook (`__icrSmoke.executeReconciliationDecision/Revert`)
- `styles.css` — ~300 linhas (qc-cc-region-*, qc-cc-card*, qc-cc-action*, qc-cc-divergence-tag, qc-cc-split-*)
- `tests/setup.ts` — `beforeEach` global pra `bumpInputsCacheGeneration` (evita test pollution)

**Limites conhecidos** (refinements no BACKLOG §ICR Slice E3a):
- IcrMarkerOps cobre só markdown + csvRow (Fase 1 do E3a). Extensão pra pdf-text + csv-segment + audio + video + image + pdfShape exige variants engine-specific em ReconciliationBounds.
- Coder picker em coding ativo não existe (peer ICR feature). Bloqueio em popovers é trivial pq não há UI exposta pra escolher consensus.
- Workflow queue P3 (Slice E3b) entrega revert via UI + κ pré/pós toggle + export relatório markdown.

Testes: +81 (3222 → 3303 total), distribuídos em `tests/core/auditLogReconciliation.test.ts` (16), `tests/core/icr/reconciliation.test.ts` (20), `tests/core/icr/icrMarkerOpsImpl.test.ts` (13), `tests/core/icr/drilldownCards.test.ts` (22), `tests/core/icr/coderRegistry.test.ts` (+10 cases consensus).

### 19.12 UI layer Slice E3b — Workflow queue P3 + κ pré/pós + export markdown (2026-05-12)

Slice E3b fecha o drill-down (P1 espacial + P2 cards + P3 workflow queue) e adiciona o ciclo audit completo: marcar pra revisão · decidir · reverter · exportar.

**Módulos novos:**

- `src/core/icr/ui/regionDerivation.ts` — extração das helpers puras de detecção/categorização que estavam em `drilldownCards.ts`. Inclui:
  - `ContestedRegion`, `DivergenceKind`, `RegionStatus`, `RegionsByStatus`
  - `collectContestedRegions(state, engineModels)` cluster markdown + csvRow
  - `regionKey` / `sameBounds` (chaves estáveis pra match com audit log)
  - `findLatestActiveDecision(region, log)` — última decided sem revert posterior
  - `findLatestActiveOpenedEntry(region, log)` — último opened (pra "Em discussão")
  - `getRegionStatus(region, log)` — decisão → opened → fallback open
  - `categorizeRegionsByStatus(regions, log)` — distribuição nas 4 colunas
- `src/core/icr/ui/drilldownWorkflow.ts` — `renderDrilldownWorkflow` (P3) com header (totals + botão Exportar) + 4 colunas Abertos/Em discussão/Resolvidos/Divergência aceita + cards com action Abrir (vai pra P2) + action Reverter em Resolvidos/Divergência aceita
- `src/core/icr/ui/reconciliationReport.ts` — `generateReconciliationReport` puro (timeline + memos + κ pré/pós + secções por status)
- `openReconciliation` em `src/core/icr/reconciliation.ts` — emite `reconciliation_opened` sem aplicar mudanças

**Reporter — flag `excludeConsensusCoders` via scope filter:**

Reporter continua puro sobre `EngineKappaInput[]`; filtro de coders consensus acontece antes via `applyConsensusExclusion(scope, coderRegistry, exclude)` (novo helper em `coderInclusion.ts`). Wired nos 3 overview modes (matriz/tabela/heatmap) e no modal "ver lado a lado". Chip toolbar "excluir consensus (κ pré)" aparece só quando `getConsensusCoderIdsInScope(scope, coderRegistry).length > 0`.

**Default scope mudou:** view antes inicializava `state.scope.coderIds = getCodableCoders().map(c => c.id)` (excluía consensus). Agora `state.scope.coderIds = getAll().map(c => c.id)` (inclui consensus); `applyCoderInclusion` (default sem markers off) remove consensus quando ele não tem markers. Pós-reconciliação consensus aparece naturalmente; chip "excluir consensus" filtra UI quando user quer ver κ baseline humano-humano.

**Modal pré/pós:** `CompareCoderCoefficientsModal` ganhou estado interno `prePost: 'pre' | 'post'` (default `'post'`). Toggle no header só aparece quando há consensus no scope. Banner indicativo em todas tabelas. Em `single-pair` com par envolvendo consensus E `prePost === 'pre'`, empty state "Par envolve consensus — alterne pra 'pós'". exportMarkdown indica a visão no header.

**Audit-only path:** "Em discussão" (via botão "Marcar pra revisão" no P2) emite `reconciliation_opened` sem tocar markers. Decisão posterior (decided) supera o opened naturalmente via ordenação cronológica em `getRegionStatus`. Revert via UI no card P3 chama `executeReconciliationRevert` existente; card volta pra Abertos (status recomputado live via `categorizeRegionsByStatus`).

**Limitações herdadas (no Slice E3b):**
- IcrMarkerOps continua markdown + csvRow (Fase 1 do E3a). Extensão pendente em backlog.
- Workflow queue não tem virtualização ainda; spec §4.3 deixou nota pra reabrir se ficar lento em vault grande com muitas regiões abertas.

Testes: +62 (3303 → 3365 total), distribuídos em `tests/core/icr/ui/regionDerivation.test.ts` (23), `tests/core/icr/openReconciliation.test.ts` (5), `tests/core/icr/ui/drilldownWorkflow.test.ts` (8), `tests/core/icr/ui/reconciliationReport.test.ts` (9), `tests/core/icr/ui/coderInclusion.test.ts` (+9 cases), `tests/core/icr/ui/compareCoderCoefficientsModal.test.ts` (+6 cases pré/pós), `tests/core/icr/icrMarkerOpsRangeKey.test.ts` (4 regression do bug rangeKey).

**Bug crítico fixado durante smoke 2026-05-11 — rangeKey vazando como char offset:** `regionDerivation.buildMarkdownRegionFromCluster` encoda bounds como `rangeKey = line × 1_000_000 + ch` (chave artificial pra clustering ordinal). Em E3a esse valor era passado direto pra `markerOps.createMarker(engine='markdown', { bounds })` que setava `range: { from: { line: 0, ch: <rangeKey> } }` — `range.ch` virava 10_000_000. Invisible em E3a porque scope default excluía consensus → `extractInputsFromScope` filtrava esses markers fora. E3b mudou scope default pra incluir consensus → `explodeMarkersToCharLabels` iterava 2M chars por marker × 9 consensus markers = main thread travada por 60s+. Fix em `icrMarkerOpsImpl.ts`: `decodeRangeKey()` e `rangesOverlapLineCh()` (linha-comparison via rangeKey). Limpeza one-shot do `data.json` removeu 9 consensus markers corruptos + 17 audit entries órfãs.

### 19.13 UI layer Slice E4 — Saved Comparisons hub + ribbon + atalho contextual (2026-05-11)

**Entrega:** "guardar configurações de view nomeadas + voltar nelas + atalho contextual do codebook".

**Schema** (em `src/core/types.ts` + `src/core/icr/ui/compareCodersTypes.ts`):

```typescript
interface SavedComparison {
  id: string;           // sc_cmp_*
  name: string;
  scope: ComparisonScope;
  view: { overviewMode; drilldownMode; primaryCoefficient };
  filters: ComparisonFilters;
  createdAt: number;
  updatedAt: number;
}

QualiaData {
  comparisons?: { definitions: Record<string, SavedComparison>; order: string[] };
  lastCompareCodersUsed?: { scope; view; filters };   // ephemeral fallback
}
```

`comparisons` espelha `smartCodes` (sem palette — saved não têm cor visível). `lastCompareCodersUsed` é o fallback ephemeral persistido quando view fecha **sem** estar vinculada a saved.

**Registry** (`src/core/icr/comparisonRegistry.ts`): mesmo pattern de `SmartCodeRegistry` — state mutado in-place, `addOnMutate(fn)`, `toJSON/fromJSON`. **Sem audit listener** — saved comparisons são preferência de UX, não decisão analítica. CRUD: `create/rename/update/delete/duplicate`. Clones defensivos em `create/update` evitam mutações externas vazarem (testes verificam).

**Dirty detection** (`src/core/icr/ui/compareCodersDirty.ts` — puro):
- `computeDirty(state, saved)` — `true` quando scope/view/filters divergem
- Arrays comparados como **sets** (reordenação não conta como dirty)
- `undefined` ≠ `[]` em opcionais (`undefined` = "todos", `[]` = "nenhum")
- Booleans optional default `false` (`splitBboxEngines ?? false`)
- Ignora `currentSelection` / `loadedFromSavedId` / `isDirty` (ephemeral)

**View wiring** (`unifiedCompareCodersView.ts`):
- Constructor: carrega `lastCompareCodersUsed` se existe; senão `createDefaultViewState`
- `loadFromSaved(id)` — copia scope/view/filters do saved, setta `loadedFromSavedId`, `isDirty = false`, bump cache
- `loadContextualCode(codeId)` — atalho contextual: scope filtrado + Tabela mode, sem `loadedFromSavedId`
- `updateState` chama `refreshDirtyFlag()` antes do re-render. Se saved sumiu, desvincula automaticamente
- `onClose` persiste `lastCompareCodersUsed` só quando state é ephemeral
- Banner no toolbar quando `loadedFromSavedId` presente: `●` dirty + `Salvar mudanças` (só dirty) / `Salvar como nova` / `✕ desvincular`

**Hub modal** (`compareComparisonsListModal.ts`) — espelha `SmartCodeListModal` simplificado (sem detail interno): cards com nome bold + summary do escopo + timestamp humanizado + kebab `Open/Rename/Duplicate/Delete`. Click card → fecha modal + abre view via `openCompareCodersView(plugin, { loadFromSavedId: id })`.

**Create modal** (`createComparisonModal.ts`) — minimalista: só nome + Create. Defaults via `createDefaultViewState` quando sem `initialState`. Aceita `initialState` opcional usado pelo "Salvar como nova" da view (captura state atual).

**Helper centralizado** (`openCompareCodersView.ts`): aceita `{ loadFromSavedId? | contextualCodeId? }`. Reusa leaf existente (`getLeavesOfType`) ou cria nova; após `setViewState`, chama `loadFromSaved` ou `loadContextualCode` conforme.

**Entry points:**
- Ribbon `users-2` (lucide) — click → `openCompareCodersView(plugin)` (state ephemeral)
- Command palette: `Compare Coders: Open` + `Open hub` + `New comparison`
- Codebook context menu: novo item `Ver κ deste código entre coders` (icon `users-2`) — só aparece quando `ContextMenuCallbacks.openCompareForCode` é injetado (opcional pra não quebrar callers sem ICR). Wired em `BaseCodeDetailView.contextMenuCallbacks()`

Testes: +27 (3365 → 3392 total), distribuídos em `tests/core/icr/comparisonRegistry.test.ts` (15: CRUD + clone defensivo + roundtrip JSON + unsubscribe) e `tests/core/icr/ui/compareCodersDirty.test.ts` (12: equalSavable + set semantics + undefined vs []).

### 19.14 Coder picker (status bar + cross-engine, 2026-05-11)

**Entrega:** todo marker criado via UI carrega `codedBy` populado — fluxo end-to-end ICR não depende mais de seed scripts pra povoar a identidade do coder.

**Schema:** `data.activeCoderId?: CoderId` em `QualiaData`. Optional pra round-trip de data antigo. Fallback gracioso em `plugin.getActiveCoderId()`: undefined → `DEFAULT_CODER_ID`; coder deletado fora → também cai pro default.

**Plugin API** (em `main.ts`):
- `getActiveCoderId(): CoderId` — fallback `DEFAULT_CODER_ID` quando undefined ou id inválido
- `setActiveCoderId(id: CoderId)` — valida via `coderRegistry.has(id)` + emit `activeCoderListeners`
- `onActiveCoderChange(fn)` — retorna unsubscribe

**Status bar UI** (`src/core/icr/activeCoderStatusBar.ts`):
- `mountActiveCoderStatusBar(plugin)` — chamado no `onload`, retorna `{ unmount }` registrado em `cleanups`
- Chip "Coding as: {nome}" com ícone `user` no status bar do Obsidian
- Click → `Menu` com `getCodableCoders()` (exclui consensus) + "+ Novo coder humano" (PromptModal → `createHuman` + `setActiveCoderId`)
- Re-renderiza em `coderRegistry.addOnMutate` (coder novo) + `onActiveCoderChange` (troca selecionada)

**Engine wire** — 4 engine models migrados pra receber `plugin` no constructor (em vez de só `dm`):
- `PdfCodingModel`: `constructor(plugin, registry)` em vez de `(dm, registry)`
- `CsvCodingModel`: idem
- `MediaCodingModel`: idem (AudioCodingModel + VideoCodingModel herdam)
- Markdown já recebia plugin

Cada call site de criação de marker stampa `codedBy: this.plugin.getActiveCoderId()`:
- `codeMarkerModel.ts:97` (findOrCreateMarkerAtSelection) + `:119` (fallback sem editor)
- `pdfCodingModel.ts:177` (findOrCreateMarker text) + `:303` (createShape)
- `csvCodingModel.ts:106` (setCellComment auto-create), `:246` (findOrCreateRowMarker), `:285` (addCodeToManyRows bulk), `:411` (findOrCreateSegmentMarker)
- `mediaCodingModel.ts:174` (findOrCreateMarker — audio + video compartilhado)

**Fix paralelo (Compare Coders contextual):** `loadContextualCode` agora marca `contextualMode = true` na view; `onClose` skipa `lastCompareCodersUsed` persist quando true. Antes: atalho contextual ("Ver κ deste código entre coders") deixava `lastCompareCodersUsed` com scope filtrado em 1 código + Tabela mode; reload sem banner deixava view presa sem maneira óbvia de voltar ao default.

**Tests:** ~+15 test files de engine models tinham `new XCodingModel(dm as any, ...)` — refatorados pra `{ dataManager: dm, getActiveCoderId: () => 'human:default' } as any` shape mínimo de plugin. Total 3392 verde.

**Bug registrado em BACKLOG (não fixado nesta entrega):** CSV row markers são shared cross-coder por cell — `findOrCreateRowMarker(file, rowId, column)` retorna marker existente independente do coder ativo. Quando coder B troca picker e aplica código já aplicado pelo coder A, o no-op é silencioso. Use case "duas pessoas no mesmo PC trocando perfil" não é cenário real do projeto, mas a semântica merece decisão (1 marker per cell+coder vs `codedByList[]`). Pensar conjuntamente com como ICR semântica trata row-level vs segment-level coding.

### 19.15 IcrMarkerOps + reconciliação cross-engine (Slice E5a, 2026-05-11)

**Entrega:** reconciliação P2 Cards funciona em pdf-text, csv-segment, audio, video — antes só markdown + csvRow eram suportados (outras engines davam "engine-not-supported-in-slice" no drill-down).

**Schema** — `ReconciliationBounds` ganhou 2 variants:

```typescript
export type ReconciliationBounds =
  | { kind: 'text'; from: number; to: number }                                                       // markdown
  | { kind: 'csvRow'; rowIndex: number; column?: string }                                            // CSV row marker
  | { kind: 'csvSegment'; rowIndex: number; column: string; from: number; to: number }              // novo E5a
  | { kind: 'pdfText'; page: number; from: number; to: number }                                     // novo E5a
  | { kind: 'temporal'; fromMs: number; toMs: number };                                              // audio + video
```

Bbox spatial (image + pdfShape) fica pro Slice E5b — semantics 2D não trivial (adopt = union ou intersect?).

**Switches sincronizados (todos cobrindo 5 kinds):**
- `formatBoundsLabel` em `regionDerivation.ts` (display) e `formatBoundsShort` em `auditLog.ts` (timeline)
- `isValidBounds` + `unionOfBounds` em `reconciliation.ts` (consensus bounds derivation)
- `sameBounds` em `regionDerivation.ts` e `sameBoundsLocal` em `reconciliationReport.ts`
- `regionKey` (chave de deduplicação cross-region)

**Collectors novos em `regionDerivation.ts`:**

- `collectPdfTextRegions(pdfModel, scopeCoders)`: agrupa markers por `(fileId, page)` → cluster por overlap em `beginIndex/endIndex` → emit `ContestedRegion` se ≥2 coders no cluster.
- `collectCsvSegmentRegions(csvModel, scopeCoders)`: agrupa por `(fileId, rowIndex, column)` → cluster por overlap em `from/to` → emit. Detecta segment via presença de `from` numérico (RowMarker não tem).
- `collectTemporalRegions(mediaModel, scopeCoders, engine: 'audio' | 'video')`: agrupa por `fileId` → cluster por overlap em `fromMs/toMs` → emit com engine recebido como param.
- `formatMs` helper local (`MM:SS` display).

`collectContestedRegions` agora itera 5 engines (antes 2). Wire dos novos collectors verificou `engineModels.{pdf,audio,video}` antes de chamar.

**IcrMarkerOpsImpl refactor** — antes tinha branches per-engine duplicados; agora:
- `getModelForUpdate(engine)` retorna interface mínima `{ findMarker, addCodeToMarker, removeCodeFromMarker }` — extrai pattern compartilhado. Markdown/Csv/Pdf/Audio/Video plugam o mesmo update flow.
- `createMarker`/`removeMarker`/`restoreMarker`/`findMarkersInRegion` ganharam branches pros 4 engines novos. Snapshot/restore via `insertMarkerRaw` em cada model.
- PDF text marker criado via ICR usa `beginIndex/endIndex` = bounds.from/to; `beginOffset/endOffset = 0` e `text = ''` (consensus markers não têm anchor span-relative — collector trabalha em coords range-level).

**Métodos novos nos engine models:**
- `PdfCodingModel.insertMarkerRaw(marker)`: push + notify + emit ADD event
- `MediaCodingModel.insertMarkerRaw(marker)`: `getOrCreateFile` + push + notify + emit
(CsvCodingModel já tinha; markdown idem)

**Provenance audit (`attachSourceHashSnapshot`)** — wire mecânico em todas paths de criação singular:
- `pdfCodingModel.findOrCreateMarker` (text) + `createShape`
- `csvCodingModel.setCellComment` (auto-create row) + `findOrCreateRowMarker` + `findOrCreateSegmentMarker`
- `mediaCodingModel.findOrCreateMarker` (audio + video compartilhado)
- Bulk `addCodeToManyRows` propositalmente fora — N hash requests por batch seria custoso, vale só pra criação singular onde latência humana esconde a I/O.

**Seed (`scripts/seed-icr-corpus.mjs`)** — estendido pra cobrir audio + video. Coders agora aditivos (`ensureCoder(id, name)` em vez de substituir o array) — preserva coders criados via UI fora do seed.

**Testes** — 3392 → 3414 (+22):
- `tests/core/icr/ui/regionDerivation.collectors.test.ts`: 14 cases pros 3 collectors novos (overlap, group boundaries, scope filtering, divergenceKind classification)
- `tests/core/icr/icrMarkerOpsImpl.test.ts`: 8 cases pros 4 engines novos (create + reject bounds + findMarkersInRegion). Tests antigos de "engine-not-supported" reescritos pra cobrir só pdfShape + image (E5b ainda pendente).

**Lentidão observada no smoke (não bloqueante):** registrada no BACKLOG. Hipótese: 3 collectors a mais por chamada de `collectContestedRegions` (sem cache). Pra escala do seed (~30 markers cross-engine) deve ser sub-ms, mas no dev box pareceu perceptível. Verificar se memoização (chave = state.scope hash + generation counter) vale, ou se é perf de hardware.

### 19.16 Performance — caches em camadas + Web Worker (2026-05-11)

**Problema:** Compare Coders View travava main thread 400-1900ms em "primeira passada" de combinação de filter chip (toggle de engines no toolbar) porque 5 coeficientes ICR (cohen/fleiss/alpha/alphaBinary/cuAlpha) rodavam síncronos sobre per-char positions × per-coder. Pra 4 coders × 5 engines = 6 pairs × 25 coef-instances = ~150 ops de `explodeMarkersToCharLabels`, cada uma iterando milhares de char keys.

**Diagnóstico** via instrumentation temporária no `updateState` (mediu toolbar vs overview por gesto): toolbar=1-5ms ✓, overview spike de 400-1900ms confirmou que o gargalo era compute pesado dos coefs, não render DOM.

**Solução em 7 camadas (commits c1e8f8c → bbc6fca):**

1. **`getCodersWithMarkersInScope` cache** (`src/core/icr/ui/coderInclusion.ts`) — itera markers de 7 engines em todo `renderToolbar`; LRU 50 por scope-hash + gen counter, iteração inline sem spread.
2. **`collectContestedRegions` cache** (`src/core/icr/ui/regionDerivation.ts`) — itera 5 engines + clustering em todo drilldown; mesma estratégia LRU 50.
3. **`reportKappa`/`reportPairwise` 2 camadas** (`src/core/icr/reporter.ts`) — fast path WeakMap por identidade do array de inputs (troca de coefficient mantém ref), slow path Map por `cacheKey` explícita (filter chip cria array novo mas mesma chave de scope).
4. **`extractInputsFromScope` cache per-engine** (`src/core/icr/ui/scopeExtraction.ts`) — toggle de chip não invalida outros engines; cada engine só recalcula 1× por scope (ignorando engineIds).
5. **Heatmap + Tabela `Promise.all`** — antes 15 codes × 5 engines = 75 `await` sequenciais; agora todos disparam em paralelo (cache hits resolvem juntos).
6. **`explodeMarkersToCharLabels` memo por identity** (`src/core/icr/kappaInput.ts`) — 5 coefs dentro de cada `computeAll(input)` recebem o mesmo `input.markers`; só a primeira explosão paga o custo, as 4 seguintes são hit.
7. **Web Worker** (`src/core/icr/kappa.worker.ts` + `kappaWorkerClient.ts`) — compute dos 5 coefs roda off-main-thread; UI nunca bloqueia mesmo em combos não-cacheadas.

**Invalidação unificada** — `bumpAllIcrCaches()` em `unifiedCompareCodersView.ts` invoca os 4 bumps (`bumpInputsCacheGeneration`, `bumpCoderInclusionCacheGeneration`, `bumpRegionsCacheGeneration`, `bumpReportCache`) quando markers mudam (mutações de reconciliação, load saved, etc).

**Resultado medido:**
| Gesto | Antes | Depois |
|---|---|---|
| Troca de coefficient (Cohen↔Fleiss) | 1200ms | 1-3ms (cache hit) |
| Toggle de coder | 1200ms | 1-3ms |
| Toggle de chip engine (combo já vista) | 1200ms | 1-3ms |
| Toggle de chip engine (combo nova) | 1200ms (freeze) | UI fluida (Worker em background) |

**Web Worker — detalhes arquiteturais:**

- `src/core/icr/kappa.worker.ts` — código standalone que importa só os 5 coefs puros (`./coefficients/*`) + tipos. Zero deps de runtime Obsidian. Listen `postMessage` com `{ id, op: 'reportKappa' | 'reportPairwise', inputs, pairs? }` → devolve `{ id, ok, result }` ou `{ id, ok: false, error }`. Re-implementa `computeAll` + `aggregateReports` + `filterKappaInputToPair` (cópia literal de reporter.ts) — manutenção: se mudar lógica em reporter.ts, propagar aqui.
- **esbuild plugin `inline-worker`** (`esbuild.config.mjs`) — imports com sufixo `?inline` (ex: `import src from './kappa.worker.ts?inline'`) disparam build standalone do arquivo (`format: 'iife'`, `bundle: true`, `write: false`) e injetam o JS resultante como `export default ${JSON.stringify(source)}`. Pattern espelha o `duckdbWorkerInlinePlugin` que já existia pro DuckDB. Restrição Community Plugins Obsidian: entrega só `main.js + manifest.json + styles.css` — worker tem que viver dentro de main.js.
- `src/core/icr/kappaWorkerClient.ts` — Blob URL + Worker singleton (lazy, criado no primeiro uso), promise-based via `Map<id, {resolve, reject}>`. Auto-reset em `worker.error` (reconnect transparente). `disposeKappaWorker()` no `onunload` do plugin.
- `src/core/icr/kappaSyncFallback.ts` — fallback síncrono quando `Worker === undefined` (jsdom em tests). Reusa `reportKappa`/`reportPairwise` sync de reporter.ts. Detecção via `typeof Worker !== 'undefined'` no client.
- **Async wrappers no reporter** — `reportKappaAsync(inputs, cacheKey?)` e `reportPairwiseAsync(inputs, pairs, cacheKey?)` checam caches main-thread primeiro (WeakMap + Map), deferem ao worker em miss, populam ambos caches no resolve. Callers (Matrix/Tabela/Heatmap) migraram pra essas versões async.

**TypeScript `?inline` support:** `src/inline-worker.d.ts` declara `declare module '*?inline' { const source: string; export default source; }`.

**Lição aprendida:** band-aids empilhados (caches superficiais) mascaram lentidão estrutural mas não resolvem. Quando o problema é compute síncrono pesado bloqueando main thread, **mover pra worker é a única solução real** — não vale empurrar pra backlog. Documentado em `memory/feedback_no_bandaid_avoidance.md`.

### 19.17 IcrMarkerOps bbox + reconciliação spatial (Slice E5b, 2026-05-11)

**Entrega:** reconciliação P2 Cards/Workflow funciona em `pdfShape` + `image` — antes só E5a (markdown/pdf-text/csvRow/csvSegment/audio/video) era suportado. Slice E5 fecha completo com **8/8 engines** do plugin.

**Schema** — `ReconciliationBounds` ganhou variant `bbox`:

```typescript
| { kind: 'bbox'; page?: number; x: number; y: number; w: number; h: number };
```

AABB normalizado 0–1 (mesma origem do motor κ bbox). `page` presente em pdfShape, ausente em image. Sempre representa retângulo axis-aligned mesmo quando shapes originais são ellipse/polygon.

**Decisões de design (D1–D6):**

- **D1 — Consensus shape em 2D = AABB-union rect.** Casa com 1D `unionOfBounds` (min-max). Intersect rejeitado: pode degenerar pra ≈vazio quando IoU=θ. Polygon hull rejeitado: overkill (complica representação, revert, render). Override via `consensusBounds` reservado pra UI custom futura.
- **D2 — Variant `bbox` armazena AABB plano**, não coords completos. Bounds é da REGIÃO contestada, não das shapes originais — originais ficam em `markerRefs[]` apontando pros markers individuais (que preservam tipo rect/ellipse/polygon).
- **D3 — Cluster θ no collector = motor θ (0.5 COCO).** Knob único evita semântica divergente entre matching (κ) e clustering (collector). Setting separado rejeitado: dual-knob confuso.
- **D4 — Algoritmo cluster N coders = union-find no grafo IoU≥θ.** Hungarian é pairing ótimo 1:1 entre 2 coders, não generaliza pra N>2. Aqui queremos componentes conexas — union-find é semanticamente correto + O(α(N)) por edge.
- **D5 — Scope (engine, fileId, page?) separado.** Markers em pages diferentes do mesmo PDF, ou em imagens diferentes, nunca clusterizam. Mesma regra do bboxAdapter (`scopeOf`).
- **D6 — PercentShapeCoords vs NormalizedCoords (inconsistência herdada do image engine não refatorada nesse slice).** Bounds AABB plano funciona pros 2 — convertido pra `PercentShapeCoords{type:'rect'}` (pdfShape) ou `NormalizedRect` (image) no momento do `createMarker`. Idêntica geometria, tipos diferentes.

**Switches sincronizados (todos cobrindo 6 kinds):**

- `isValidBounds` + `unionOfBounds` em `reconciliation.ts` — bbox union une apenas markers da mesma page (heurística defensiva).
- `sameBounds` + `regionKey` + `formatBoundsLabel` em `regionDerivation.ts` — `bb:${page??'_'}:${x},${y},${w},${h}` com 6 casas decimais pra evitar colisão.
- `sameBoundsLocal` em `reconciliationReport.ts`, `formatBoundsShort` em `auditLog.ts`.

**Collector novo (`collectBboxRegions` em `regionDerivation.ts`):**

- Itera `pdfModel.getAllShapes()` + `imageModel.getAllMarkers()` filtrando por scope coders.
- Agrupa por `(engine, fileId, page?)` — markers em scopes diferentes nunca clusterizam.
- Per scope: `aabbOf` lazy → AABB early-out (`aabbOverlaps`) → rasterize 1×/marker → IoU bitmap AND → union-find no grafo IoU≥0.5.
- Adaptive grid size (200/400) inline — bboxes muito pequenas precisam grid maior (mesma heurística do `bboxAdapter.detectAdaptiveGridSize`, replicada por escolha — evitar cross-module export).
- Bounds emitido = AABB-union do cluster. DisplayLabel = `bbox NN%,NN% (NN×NN%)` com page prefix opcional.

**IcrMarkerOpsImpl refactor:**

- 2 ramos novos em cada switch (`createMarker`, `removeMarker`, `findMarkersInRegion`, `restoreMarker`, `findMarkerRaw`, `getModelForUpdate`).
- `getModelForUpdate('pdfShape')` adapta API distinta: PdfCodingModel usa `addCodeToShape`/`removeCodeFromShape`/`findShapeById` (separado de `addCodeToMarker` que é só pra text markers). `getModelForUpdate('image')` usa API standard.
- `findMarkersInRegion(bbox)` usa AABB overlap puro (não IoU). Correto porque bounds é AABB-union do cluster; markers originais — que contribuíram pra union — todos batem por construção. AABB overlap é trivial + rápido.

**Methods adicionados:**

- `PdfCodingModel.insertShapeRaw(shape: PdfShapeMarker)`: push + notify + emit ADD event. Espelha `insertMarkerRaw` pra text markers.
- `ImageCodingModel.insertMarkerRaw(marker: ImageMarker)`: mesma coisa.

**Image engine wiring ao coder picker** (gap pré-existente fechado nesse slice):

ImageCodingModel era a 8ª engine fora do coder picker — `createMarker` não stampava `codedBy`. Smoke E5b revelou: markers criados pela UI ficavam órfãos (`codedBy: undefined`) → collector filtrava todos fora.

- Constructor passou de `(dataManager, registry)` pra `(plugin, registry)` — `dataManager = plugin.dataManager`, plugin armazenado.
- `createMarker` stampa `codedBy: this.plugin.getActiveCoderId()`.
- Caller em `src/image/index.ts:registerImageEngine` atualizado.
- ~3 test instantiations atualizadas pro shape `{ dataManager: dm, getActiveCoderId: () => 'human:default' } as any` (mesmo pattern dos 4 models já wired).

**Tests** — 3414 → 3432 (+18):

- `tests/core/icr/icrMarkerOpsImpl.test.ts`: 2 tests "engine-not-supported" reescritos pra cobrir create/remove/findInRegion/serialize/restore + +11 cases pdfShape + image (incluindo polygon AABB overlap).
- `tests/core/icr/ui/regionDerivation.collectors.test.ts`: +7 cases collectBboxRegions (cluster IoU saudável, IoU<θ não clusteriza, page boundary, scope coder filter, polygon+rect mixing).

**Perf observada:** sub-100ms pra ~20 bboxes em scope típico (sem instrumentação dedicada). Raster cache cross-call deliberadamente NÃO implementado — `regionsCache` per-scope (existente) já cobre o caso comum (toggle de coder/coefficient sem mudança de markers).

**Lição aprendida:** smoke revelou gap de wiring (image coder picker) que era invisível pra typecheck + tests. Reforça a regra "Smoke real obrigatório a CADA chunk de implementação" — mocks não cobrem completude de wiring cross-engine. Documentado em CLAUDE.md §"Furos sistemáticos".

### 19.18 Companion docs

- `obsidian-qualia-coding/plugin-docs/research/ICR-MATERIA-2026-05-08.md` — destilação da frente (atualizada 2026-05-09)
- `obsidian-qualia-coding/plugin-docs/research/ICR-DESIGN-SKETCH-2026-05-08.md` — esboço arquitetural
- `obsidian-qualia-coding/plugin-docs/research/ICR — Cenários cobertos e descobertos.md` — cenários in-plugin vs workaround
- `obsidian-qualia-coding/plugin-docs/research/Deep Research Report - ICR Qualitative.md` — pesquisa GPT 2026-05-09 (ATLAS.ti 25, NVivo 15, gaps multimodais)
- `docs/ROADMAP.md §"Infra compartilhada"` — checklist em slices

---

## Fontes

Este documento consolida decisões de:
- `docs/markdown/ARCHITECTURE.md` — estudo arquitetural original (9 partes)
- `docs/CROSS-ENGINE.md` — análise comparativa cross-engine
- `memory/engine-plugins.md` — detalhes por engine
- `memory/image-engine-briefing.md` — briefing de porting do Image
- `memory/board-roadmap.md` — Research Board roadmap + Fabric.js lessons
- Análise comparativa de ferramentas QDA (ATLAS.ti, NVivo, MAXQDA, Dedoose, Taguette)
