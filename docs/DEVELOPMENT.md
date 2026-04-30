# Qualia Coding — Development Guide

> Como desenvolver, testar, e estender o plugin. Onboarding para qualquer desenvolvedor (humano ou AI) que vai trabalhar no projeto.

---

## 1. Setup & Build

### Pré-requisitos
- Node.js 20.19+ ou 22.12+
- npm

### Instalação
```bash
cd .obsidian/plugins/qualia-coding
npm install
```

### Scripts
```bash
npm run build                       # tsc -noEmit && esbuild production (minified)
npm run dev                         # esbuild watch mode (hot reload com hot-reload plugin)
bash scripts/smoke-roundtrip.sh     # prepara vault temp em ~/Desktop/temp-roundtrip/ com plugin instalado
                                    # pra smoke test manual do QDPX round-trip
                                    # SKIP_BUILD=1 pra pular o build
```

### Output
- `main.js` (~2.17 MB bundled) — single file, todos os engines
- `styles.css` — CSS consolidado
- `manifest.json` — metadata do plugin

### esbuild Config
- Externals: `["obsidian", "electron", ...builtinModules]`
- NÃO externalizar libs bundled (AG Grid, Chart.js, Fabric.js, etc.)
- Format: `cjs`, platform: `node`
- PapaParse import: `import * as Papa from "papaparse"` (sem default export)

---

## 2. Estrutura do Projeto

```
src/
├── main.ts                  # Entry point (~200 LOC) — registra engines, sidebar, cross-engine navigation, auto-persist
├── core/                    # Infraestrutura compartilhada
│   ├── types.ts             # BaseMarker, CodeApplication, CodeRelation, CodeDefinition, GeneralSettings
│   ├── dataManager.ts       # Cache in-memory + debounced save
│   ├── codeDefinitionRegistry.ts  # Registry único de códigos
│   ├── codeApplicationHelpers.ts  # Helpers: hasCode, getCodeIds, getMagnitude, getRelations, addRelation, removeRelation
│   ├── relationHelpers.ts        # collectAllLabels, buildRelationEdges (funções puras)
│   ├── relationUI.ts             # renderAddRelationRow compartilhado (datalist autocomplete)
│   ├── codingPopover.ts     # Menu de codificação unificado (memo, magnitude, relations)
│   ├── baseCodingMenu.ts    # Primitivas: renderMemoSection, renderMagnitudeSection, renderRelationsSection
│   ├── codeFormModal.ts     # Modal de criar/editar código
│   ├── codeBrowserModal.ts  # Modal de browse códigos
│   ├── relationHelpers.ts         # collectAllLabels, buildRelationEdges (pure)
│   ├── relationUI.ts              # renderAddRelationRow compartilhado
│   ├── fileInterceptor.ts   # Interceptor de abertura de arquivo
│   ├── unifiedModelAdapter.ts    # Merge N engines → 1 sidebar model
│   ├── unifiedExplorerView.ts    # Code Explorer unificado
│   ├── unifiedDetailView.ts      # Code Detail unificado
│   ├── baseCodeExplorerView.ts   # Base class do explorer
│   ├── baseCodeDetailView.ts     # Base class do detail
│   ├── baseSidebarAdapter.ts     # Base class para sidebar adapters
│   ├── markerResolvers.ts        # Type guards e resolvers centralizados
│   ├── drawToolbarFactory.ts     # Factory compartilhada toolbar drawing (PDF + Image)
│   ├── shapeTypes.ts             # DrawMode, ShapeType, DRAW_TOOL_BUTTONS catalog
│   ├── detailListRenderer.ts     # Renderer modo lista do detail view
│   ├── detailCodeRenderer.ts     # Renderer modo code do detail view (+ relations section)
│   ├── detailMarkerRenderer.ts   # Renderer modo marker do detail view (+ relations per code)
│   ├── settingTab.ts        # Settings (magnitude + relations toggles)
│   ├── hierarchyHelpers.ts        # buildFlatTree, buildCountIndex, getDirectCount, getAggregateCount
│   ├── codebookTreeRenderer.ts    # Codebook tree com hierarquia e pastas
│   ├── codebookContextMenu.ts     # Context menu do codebook
│   ├── codebookDragDrop.ts        # Drag-drop no codebook (reorganize + merge)
│   └── mergeModal.ts              # Modal de merge de codigos
├── markdown/                # Engine markdown (CM6)
├── pdf/                     # Engine PDF (DOM/SVG)
├── csv/                     # Engine CSV (AG Grid)
├── image/                   # Engine Image (Fabric.js)
├── audio/                   # Engine Audio (WaveSurfer)
├── video/                   # Engine Video (WaveSurfer)
├── export/                  # REFI-QDA export (QDC + QDPX com Links para relações)
├── import/                  # REFI-QDA import (QDC + QDPX)
├── obsidian-internals.d.ts   # Type declarations para APIs internas do Obsidian
├── media/                   # Shared audio+video
│   ├── mediaViewCore.ts         # Logica compartilhada via composicao (transport, zoom, regions)
│   ├── mediaViewConfig.ts       # Interface de configuracao (video element, CSS prefix, popover)
│   ├── mediaCodingModel.ts      # Model compartilhado audio+video
│   ├── mediaSidebarAdapter.ts   # Sidebar adapter compartilhado
│   ├── mediaCodingMenu.ts       # Menu de codificação compartilhado
│   ├── waveformRenderer.ts      # Wrapper WaveSurfer.js
│   ├── regionRenderer.ts        # Renderizacao de regioes
│   └── formatTime.ts            # Helper de formatacao de tempo
├── export/                  # REFI-QDA export (QDC + QDPX)
│   ├── xmlBuilder.ts            # XML primitives (escape, element, attr)
│   ├── coordConverters.ts       # Coordinate conversion per engine
│   ├── qdcExporter.ts           # Codebook XML generation
│   ├── qdpxExporter.ts          # Full project export orchestration + ZIP
│   ├── exportModal.ts           # Pre-export modal UI
│   └── exportCommands.ts        # Palette commands + analytics button
├── import/                  # REFI-QDA import (QDC + QDPX)
│   ├── xmlParser.ts             # XML parsing helpers
│   ├── qdcImporter.ts           # Codebook import → registry
│   ├── qdpxImporter.ts          # Full project import orchestration
│   ├── importModal.ts           # Import modal with conflict resolution
│   └── importCommands.ts        # Palette commands
└── analytics/               # Engine Analytics (Chart.js + Fabric.js)
    ├── data/                # 6 computation engines + relationsEngine
    ├── board/               # Research Board
    │   ├── boardTypes.ts        # Tipos do board (discriminated union + type guards)
    │   ├── boardNodeHelpers.ts  # Factories compartilhadas (cardBg, textbox, badges, theme)
    │   ├── boardNodes.ts        # Barrel re-export dos 6 node types
    │   ├── nodes/               # 1 arquivo por node type (sticky, snapshot, excerpt, etc.)
    │   └── fabricExtensions.d.ts # Type declarations Fabric.js
    └── views/               # Analytics views (modular)
        ├── analyticsView.ts         # AnalyticsView class (~340 LOC): lifecycle, toolbar, footer
        ├── analyticsViewContext.ts   # Interface AnalyticsViewContext + type aliases
        ├── configSections.ts        # Config panel sections (sources, viewMode, codes, minFreq)
        ├── boardView.ts             # Research Board view
        ├── shared/
        │   └── chartHelpers.ts      # heatmapColor, computeDisplayMatrix, divergentColor, etc.
        └── modes/                   # 20 mode modules + registry
            ├── modeRegistry.ts      # Record<ViewMode, ModeEntry> — declarative mode dispatch
            ├── dashboardMode.ts     # Dashboard + mini thumbnails
            ├── frequencyMode.ts     # Frequency bars + sort/group options + exportCSV
            ├── cooccurrenceMode.ts  # Co-occurrence matrix + display/sort + exportCSV
            ├── graphMode.ts         # Network graph (force-directed) + exportCSV
            ├── docMatrixMode.ts     # Document-Code matrix + exportCSV
            ├── evolutionMode.ts     # Code evolution (positional) + exportCSV
            ├── textRetrievalMode.ts # Text retrieval + navigation
            ├── wordCloudMode.ts     # Word cloud (chartjs-chart-wordcloud)
            ├── acmMode.ts           # MCA Biplot
            ├── mdsMode.ts           # MDS Map
            ├── temporalMode.ts      # Temporal analysis (time series)
            ├── textStatsMode.ts     # Text statistics (TTR, word counts)
            ├── dendrogramMode.ts    # Dendrogram + silhouette
            ├── lagSequentialMode.ts # Lag sequential analysis
            ├── polarMode.ts         # Polar coordinates
            ├── chiSquareMode.ts     # Chi-square independence tests
            ├── decisionTreeMode.ts  # Decision tree (CHAID)
            ├── sourceComparisonMode.ts # Source comparison
            ├── overlapMode.ts       # Code overlap matrix
            └── relationsNetworkMode.ts  # Relations network (code + segment level)
```

### Regra: `main.ts` é orquestrador leve (~200 LOC)
Nao implementa logica de engine — registra engines, monta sidebar unificada, conecta listeners cross-engine (label-click, code-click, rename propagation) e limpa. Cada engine exporta `registerXxxEngine()` que retorna `EngineRegistration<Model>` com `{ cleanup, model }`. O main.ts destructura o model diretamente — sem non-null assertions. O registry persiste automaticamente via `onMutate` callback.

```typescript
// Padrão de registro de engine
const pdf = registerPdfEngine(this);
this.cleanups.push(pdf.cleanup);
const pdfModel = pdf.model;  // tipado, sem !
```

---

## 3. Como Adicionar um Novo Engine

### Porting Playbook (11 pontos)

Checklist obrigatório para portar/criar qualquer engine novo:

#### 1. Registry — usar `plugin.sharedRegistry`
NÃO criar instância isolada. Usar o registry compartilhado do plugin.

#### 2. DataManager section
Registrar seção no DataManager: `dataManager.section('engine')` / `setSection('engine', data)`.

#### 3. Model implements SidebarModelInterface
```typescript
interface SidebarModelInterface {
  registry: CodeDefinitionRegistry;
  onChange(fn: () => void): void;
  offChange(fn: () => void): void;
  getAllMarkers(): BaseMarker[];
  getMarkerById(id: string): BaseMarker | null;
  getAllFileIds(): string[];
  getMarkersForFile(fileId: string): BaseMarker[];
  saveMarkers(): void;
  updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void;
  updateDecorations?(): void;
  removeMarker(markerId: string): boolean;
  deleteCode(codeId: string): void;
  setHoverState(markerId: string | null, codeName: string | null): void;
  getHoverMarkerId(): string | null;
  getHoverMarkerIds(): string[];
  onHoverChange(fn: () => void): void;
  offHoverChange(fn: () => void): void;
  getAutoRevealOnSegmentClick?(): boolean;
}
```

#### 4. Adapter extends BaseSidebarAdapter
Criar adapter que estende `BaseSidebarAdapter` (em `src/core/baseSidebarAdapter.ts`) e converte markers engine-specific em `BaseMarker` para a sidebar unificada.
```typescript
export class XxxSidebarAdapter extends BaseSidebarAdapter {
  constructor(model: XxxModel) { super(model); }
  // implement abstract methods
}

export interface XxxBaseMarker extends BaseMarker {
  // campos únicos para type guard
  // ex: shape + shapeLabel para Image, page + isShape para PDF
}
```

#### 5. main.ts registration + UnifiedModelAdapter
Em `main.ts`, registrar engine e adicionar adapter ao `UnifiedModelAdapter`.

#### 6. Type guards para unified views
Adicionar discriminator function em `src/core/markerResolvers.ts` (localização central para todos os type guards e resolvers de marker):
```typescript
function isXxxMarker(marker: BaseMarker): marker is XxxBaseMarker {
  return 'campoUnico1' in marker && 'campoUnico2' in marker;
}
// Usar em: getMarkerLabel(), navigateToMarker(), qualquer lógica engine-specific
```

#### 7. Menu usa `openCodingPopover()`
Implementar `CodingPopoverAdapter` interface (definida em `src/core/codingPopover.ts`). NÃO criar menu custom. O popover opera com **nomes** (UI); cada adapter resolve name→id na borda.
```typescript
interface CodingPopoverAdapter {
  registry: CodeDefinitionRegistry;
  getActiveCodes(): string[];       // resolve codeId→name via registry
  addCode(codeName: string): void;  // resolve name→id, passa id ao model
  removeCode(codeName: string): void;
  getMemo(): string;
  setMemo(value: string): void;
  save(): void;
  onRefresh(): void;
  onNavClick?(codeName: string, isActive: boolean): void;
  getMagnitudeForCode?(codeId: string): string | undefined;
  setMagnitudeForCode?(codeId: string, value: string | undefined): void;
  getRelationsForCode?(codeId: string): Array<{ label: string; target: string; directed: boolean }>;
  setRelationsForCode?(codeId: string, relations: Array<{ label: string; target: string; directed: boolean }>): void;
}
```

#### 8. Bidirectional hover
View hover → `model.setHoverState()` → sidebar highlights.
Sidebar hover → `model.setHoverState()` → view highlights.

#### 9. CSS classes reuse
Usar prefixo namespaced (`codemarker-myengine-`). Zero colisões.

#### 10. Events + EngineCleanup pattern
`EngineCleanup` é `() => void` — uma função simples de cleanup.
```typescript
function registerMyEngine(plugin: QualiaPlugin): EngineCleanup {
  // setup...
  return () => { /* cleanup tudo */ };
}
```
Registrar workspace events (`codemarker-myengine:navigate`). Cleanup na função retornada.

#### 11. Settings
Adicionar seção no `settingTab.ts` se necessário. Persistir via DataManager.

### Erros comuns
- Criar instância isolada do registry → códigos não aparecem na sidebar
- Não chamar `setHoverState()` → hover bidirecional quebrado
- Usar class names custom sem CSS rules → elementos invisíveis
- `close()` removendo DOM sem fechar popover → listener leak

### Per-Engine Decision Tables

| Engine | BaseMarker Extension | Type Guard Fields | DataManager Section | Notes |
|--------|---------------------|-------------------|---------------------|-------|
| CSV | row, column, isRowMarker | `'row' in m && 'column' in m` | `csv` | Dual markers (segment + row) |
| Audio | from, to, mediaType:'audio' | `'from' in m && 'mediaType' === 'audio'` | `audio` | Temporal markers |
| Video | from, to, mediaType:'video' | `'from' in m && 'mediaType' === 'video'` | `video` | Shares media/ with Audio |
| Analytics | — | — | — | Read-only, no adapter needed |

---

## 4. Debugging

### Hot Reload
Com o plugin `hot-reload` instalado no vault, `npm run dev` rebuilda e recarrega automaticamente a cada save.

### Console
- `app.plugins.plugins['qualia-coding']` — instância do plugin
- `app.workspace.activeLeaf.view` — view ativa

### Data
- `data.json` — todos os markers e settings (`plugin.loadData()`)
- `board.json` — Research Board data
- `.obsidian/codemarker-shared/registry.json` — registry compartilhado (legacy, migrado para data.json)

### CM6 Debugging
- `view.state.field(markerStateField)` — decorations atuais
- `view.state.field(selectionMenuState)` — estado do menu de seleção
- `console.log` no `markerViewPlugin.update()` — ver transactions e effects

### Common Issues

| Sintoma | Causa provável | Fix |
|---------|---------------|-----|
| Highlights somem ao editar | `syncDecorationsToModel` não rodou | Checar `needsRebuild` flag |
| Menu não abre | Effect dispatched dentro de `Tooltip.create()` | Mover dispatch pra antes ou usar rAF |
| Hover "pisca" | Sub-span boundary no CM6 | Verificar debounce 30ms |
| Sidebar não atualiza | `onChange` listener não registrado | Checar adapter no UnifiedModelAdapter |
| Margin bars desalinhadas | `lineBlockAt` retorna bloco lógico | Usar `coordsAtPos` |
| AG Grid vazio | `ModuleRegistry.registerModules` faltando | Adicionar no entry point |
| WaveSurfer invisível | Container dentro do shadow DOM | Mover container pra fora |
| Clique não funciona pós-zoom (Fabric.js) | `setCoords()` não chamado | Chamar após `setViewportTransform()` |
| Theme não atualiza | CSS vars não cascatam | `applyThemeColors()` + listener `css-change` |

---

## 5. Visual Testing

### Stack
- **wdio-obsidian-service** — abre Obsidian programaticamente
- **@wdio/visual-service** — comparação de screenshots
- **WebdriverIO** — framework de test

### Trap crítico: data.json overwrite
`wdio-obsidian-service` copia `data.json` do plugin root para o test vault, sobrescrevendo dados pré-populados.

**Fix**: Injetar data em runtime:
```typescript
before(async () => {
  await plugin.saveData(testData);
  await model.loadMarkers();
});
```

### CM6 Init Order
A ordem importa:
1. Injetar dados
2. Abrir arquivo
3. `setFileIdEffect` (async via rAF)
4. `buildDecorationsForFile`

Abrir arquivo **antes** de injetar dados = decorations vazias.

### 3 Modos do `/ui-inspect`

1. **Regression guard** — screenshot comparison contra baselines
2. **Diagnostic mode** (6 passos) — identifica trigger pattern de bugs intermitentes
3. **Autonomous fix cycle** (7 passos) — cria test, reproduz bug, fixa, valida com before/after

### Cache compartilhado do Obsidian
`wdio-obsidian-service` baixa uma copia do Obsidian pra rodar testes (~400MB). Por padrao fica em `.obsidian-cache/` relativo ao projeto. Pra evitar duplicatas entre plugins, a env var `OBSIDIAN_CACHE` aponta pra um diretorio compartilhado:
```bash
# .zshrc
export OBSIDIAN_CACHE="$HOME/.cache/obsidian-e2e"
```
Todos os plugins usam a mesma copia. Se precisar resetar: `rm -rf ~/.cache/obsidian-e2e`.

### Config & Commands
- Config: `wdio.conf.mts` (usa `obsidian-e2e-visual-test-kit` de `github:mrlnlms/obsidian-e2e-visual-test-kit`)
- Commands:
  ```bash
  npm run test:e2e                                          # roda todos os 19 specs
  npm run test:e2e -- --spec tests/e2e/specs/smoke.e2e.ts  # spec especifico
  npm run test:visual:update                                # regenera baselines
  ```

### Test Vault & Baselines
- Test vault: `tests/e2e/vaults/visual/` com fixtures (md, csv, pdf, png, mp3, mp4)
- Baselines: `tests/screenshots/baseline/` (commitados — referencia visual)
- `tests/screenshots/actual/` e `tests/screenshots/diff/` sao gitignored (artefatos de run)
- Resolution-dependent — mesma maquina pra baseline e comparacao
- CI roda so smoke test (Linux rendering difere de macOS)

### Helpers

- `tests/e2e/helpers/qualia.ts` — helpers de navegacao/assertion reusados pelos specs
- `tests/e2e/helpers/generate-qdpx.ts` — gera `sample-import.qdpx` no vault de visual tests.
  Executar manualmente quando precisar regenerar o fixture:
  ```bash
  npx tsx tests/e2e/helpers/generate-qdpx.ts
  ```

### Test Catalog

| Tag | Component | Selector |
|-----|-----------|----------|
| editor-markers-margin | Editor + margin bars | `.workspace-leaf.mod-active .cm-editor` |
| code-explorer-tree | Code Explorer expanded | `.codemarker-explorer` |
| editor-hover-state | Editor with hover | `.cm-line` hover |
| code-detail-list | Code Detail list | `.codemarker-detail-panel` |

---

## 5b. Cobertura manual — modulos sem testes unitarios

Modulos abaixo nao tem testes unitarios dedicados porque dependem de APIs reais (CM6 EditorView, Chart.js canvas, DOM interativo). A cobertura e feita por testes e2e e validacao manual. Este checklist serve de roteiro quando mexer nesses modulos.

### markerViewPlugin (CM6 ViewPlugin — 326 LOC)

Coberto indiretamente por: `highlights.e2e.ts`, `hover-interaction.e2e.ts`, `handle-overlay.e2e.ts`

- [ ] Hover em highlight adiciona classe `codemarker-margin-hovered` na margin bar
- [ ] Hover em margin bar adiciona classe no highlight correspondente
- [ ] Selecao de texto abre popover de codificacao
- [ ] Drag handles reposicionam marker (start e end)
- [ ] FileId e identificado corretamente ao abrir arquivo
- [ ] Preview mode nao causa erros (plugin desativa gracefully)

### Analytics modes (15/20 sem teste unitario)

Cobertos indiretamente por: `analytics-dashboard.e2e.ts`, `analytics-frequency.e2e.ts`

- [ ] Trocar de mode via toolbar renderiza o chart correto
- [ ] Filtrar codigos atualiza o chart (nenhum codigo desabilitado aparece)
- [ ] Filtrar sources atualiza o chart
- [ ] Export CSV gera arquivo valido (abrir no Excel/Sheets)
- [ ] Thumbnails no dashboard refletem o mesmo filtro dos charts
- [ ] Trocar de mode rapidamente nao mostra chart stale (renderGeneration guard)

### Menus e popovers (6 modulos — ~600 LOC)

Cobertos indiretamente por: interacao manual no Obsidian

- [ ] Popover de codificacao abre ao selecionar texto (markdown)
- [ ] Popover de codificacao abre ao clicar em celula (CSV)
- [ ] Popover abre ao selecionar regiao (PDF, Image)
- [ ] Popover abre ao selecionar regiao no waveform (Audio, Video)
- [ ] Toggle de codigo no popover adiciona/remove codigo do marker
- [ ] Memo textarea salva ao sair do popover
- [ ] Clicar fora do popover fecha ele
- [ ] Escape fecha o popover

---

## 5c. Export / Import REFI-QDA

### Settings tab

A aba de settings tem as seguintes secoes:

- **General** — `showMagnitudeInPopover`, `showRelationsInPopover`, `openToggleInNewTab`
- **Markdown** — cor padrao, opacity, handles on hover, menus (selection / right-click / ribbon)
- **Media** — 4 pares de toggles (Image / Audio / Video / PDF): `autoOpen` + `showButton` per-media
- **Export** — botoes para exportar QDPX (projeto completo) e QDC (codebook)

### Palette commands

| Command ID | Descricao |
|-----------|-----------|
| `export-qdpx` | Exporta projeto completo (QDPX + ZIP) |
| `export-qdc` | Exporta codebook (QDC) |
| `import-qdpx` | Importa projeto completo (QDPX) |
| `import-qdc` | Importa codebook (QDC) |

Os comandos de export tambem aparecem no botao de analytics (toolbar do AnalyticsView). Os comandos de import abrem `importModal.ts` com resolucao de conflitos.

---

## 5d. Media Opening Toggle

### Settings (seção "Media")

Cada mídia tem 2 toggles. Ambos persistem no namespace do engine (`image.settings`, `audio.settings`, `video.settings`, `pdf.settings`):

| Setting | Default | Efeito |
|---------|---------|--------|
| `autoOpen` | `false` | Se `true`, abre o arquivo na Coding View do plugin (ou, pro PDF, instrumenta o viewer nativo). Se `false`, cai no viewer nativo do Obsidian sem decoração. |
| `showButton` | `true` | Se `true`, adiciona botão `replace-all` no header da view pra alternar entre os dois modos. |

Setting global em `general.settings`:

| Setting | Default | Efeito |
|---------|---------|--------|
| `openToggleInNewTab` | `false` | Se `true`, o botão/command abre a view alternada em nova aba em vez de substituir a atual. Não se aplica ao PDF (toggle sempre in-place). |

### Palette commands

| Command ID | Descrição |
|-----------|-----------|
| `toggle-image-coding` | Alterna entre view nativa e Image Coding View |
| `toggle-audio-coding` | Alterna entre view nativa e Audio Coding View |
| `toggle-video-coding` | Alterna entre view nativa e Video Coding View |
| `toggle-pdf-coding` | Liga/desliga instrumentação de coding no PDF nativo |

Commands seguem a mesma lógica do botão no header — bidirecional, respeitam `openToggleInNewTab`.

### Teste manual

Fluxo mínimo pra validar após mudanças nessa área:

1. Com `data.json` limpo (ou reset manual dos settings): abrir `.png`/`.mp3`/`.mp4`/`.pdf` → todos vão pra viewer nativo com ícone `replace-all` no header.
2. Ligar cada `autoOpen` → reabrir arquivo → abre em Coding View (ou, pro PDF, com instrumentação ativa).
3. Clicar botão no header → troca modo **pra aquele arquivo/leaf**. Mudar aba e voltar → continua no modo escolhido (setting não re-intercepta). Abrir arquivo diferente na mesma leaf → setting volta a agir.
4. Desligar `showButton` de uma mídia com uma view aberta → botão some **imediatamente** do header (sem precisar trocar de aba). Religar → botão reaparece na mesma view. Palette command continua funcionando independente do `showButton`.
5. Ligar `openToggleInNewTab` → botão abre modo alternativo em nova aba, preservando current. PDF ignora esse setting.

### Armadilhas

- **Hot-reload do plugin**: o `pinnedFileByLeaf` (rastreador do override manual) é resetado em `clearFileInterceptRules()`. Se esse clear for removido, overrides antigos sobrevivem e bloqueiam intercepts legítimos. Mesma regra pro `INJECTED_ACTIONS`/`TRACKED_VIEWS` em `mediaToggleButton.ts` — `teardownMediaToggleButtons()` roda no `onunload` pra limpar DOM + reset module state. Sem isso, disable/enable pulava re-injeção do botão.
- **Adicionar setting nova num engine**: precisa adicionar ao `DataManager.load()` deep merge (ex: `raw.pdf.settings = deepMerge(defaults.pdf.settings, raw.pdf.settings)`). Senão vaults com data antigo crasham no boot acessando `.autoOpen` em `undefined`.
- **`MediaCodingModel.settings`**: é getter (`this.dm.section(...).settings`), não cópia. Não voltar a `this.settings = {...}` no construtor — edits do tab não propagam.
- **Qualquer `view.addAction` sobrevive no DOM após disable**: Obsidian não limpa actions do plugin. Se adicionar um novo action, trackear + detach no onunload (ver `TECHNICAL-PATTERNS.md §19.5`).

---

## 5e. Convert memo to note (#33 Code + #34 Group)

### Settings (seção "Memo materialization")

Bloco no Settings tab com 4 paths, um por tipo de entidade. Persiste em `general.memoFolders`:

| Setting | Default | Ativo? |
|---|---|---|
| `Code memo folder` | `Analytic Memos/Codes` | ✅ Phase 1 |
| `Group memo folder` | `Analytic Memos/Groups` | ✅ Phase 2 |
| `Marker memo folder` | `Analytic Memos/Markers` | ❌ (disabled, reservado) |
| `Relation memo folder` | `Analytic Memos/Relations` | ❌ (disabled, reservado) |

Os 4 nascem juntos. Ativar um tipo = trocar o `t.inputEl.disabled = true` por handler `.onChange()` + estender helpers `resolveEntity`/`resolveFolder`/`readMemoRecord`/`writeMemo` em `memoMaterializer.ts` + wirear UI da entidade.

### Fluxo manual de teste

**Pré-requisitos:** vault com pelo menos 1 code que tenha `memo.content` populado (inline). Plugin carregado.

**Code memo (Phase 1):**

1. **Convert básico:** Code Detail de qualquer code com memo → click "Convert to note" no header da seção Memo → arquivo aparece em `Analytic Memos/Codes/<NomeDoCode>.md`, abre em nova aba. Voltar pro Code Detail → seção Memo virou card com path + Open + Unmaterialize.
2. **Conflito de path:** colocar arquivo `.md` qualquer (não-Qualia) em `Analytic Memos/Codes/<NomeDoCode>.md` antes de Convert → Convert cria `<NomeDoCode> (2).md` (sufixo automático).
3. **Edit no `.md` reflete no data.json:** abrir o `.md`, editar body, salvar (Cmd+S implícito) → memoView no Analytics mostra conteúdo novo.
4. **Open button:** card → Open → abre `.md` em nova aba.
5. **Unmaterialize preserva conteúdo:** click Unmaterialize → textarea volta com content, `.md` órfão fica no vault.
6. **Delete `.md` no vault → desmaterializa graciosamente:** apagar arquivo no file explorer → Code Detail volta a textarea com content preservado.
7. **Rename/move `.md` no vault:** rename → `materialized.path` atualiza; move → mesmo (Obsidian dispara `rename` em moves).
8. **Frontmatter quebrado pelo user:** apagar linha `qualiaMemoOf: code:...` no `.md` → no próximo modify, listener detecta ausência e desmaterializa graciosamente (sem erro ruidoso).
9. **Persistência através de reload:** Convert qualquer code → Cmd+P "Reload app without saving" → reabrir Code Detail → card materializado ainda lá (reverse-lookup map reconstruído no `onload`).

**Group memo (Phase 2):** mesmo fluxo, mas via `codeGroupsPanel`. Click chip de um group → quando há memo, ver botão "Convert to note" ao lado do texto. Quando materializado, block do memo vira card compacto. Filename = `<groupName>.md` em `Analytic Memos/Groups/`. Open button reusa leaf existente se arquivo já aberto (smart open — Phase 2). Aplicado a Code também.

### Armadilhas

- **`vault.create` precisa de folder existente:** `convertMemoToNote` chama `vault.createFolder` antes do create se o path não existe. Sem isso, `vault.create` falha em vault novo.
- **`workspace.getLeaf('tab')` exige string literal**, não `true`/`false`. Tipo é `'tab' | 'split' | 'window' | boolean`. Usar `'tab'` pra abrir em nova aba ao lado do Code Detail.
- **Self-write loop:** sempre chamar `plugin.memoSelfWriting.add(path)` antes de `vault.modify/create`, e `queueMicrotask(() => delete)` depois. Sem isso, listener `modify` pega o próprio write e dispara `syncFromFile`. Pattern documentado em `TECHNICAL-PATTERNS.md §29`.
- **`reverse-lookup` precisa rebuild no onload:** `rebuildMemoReverseLookup(this)` no `onload` varre registry e popula `Map<path, EntityRef>`. Sem isso, depois de reload o plugin não sabe quais arquivos são memos materializados.
- **Migração legacy é idempotente:** `migrateLegacyMemos` no `DataManager.load` converte `memo: string` → `{ content }` em todas entidades. Roda toda vez que load — barato (Object.values forEach), e idempotente (se já é MemoRecord, no-op).
- **API genérica via `EntityRef`:** desde Phase 2, `convertMemo(ref)` / `unmaterializeMemo(ref)` aceitam qualquer tipo. Pra adicionar Marker ou Relation, estender helpers `resolveEntity` / `resolveFolder` / `readMemoRecord` / `writeMemo` em `memoMaterializer.ts` (~5 linhas cada, 1 case novo no switch) + wirear UI da entidade. Sem refactor do core necessário.
- **Smart open:** `openMaterializedFile` em `main.ts` procura leaf existente via `iterateAllLeaves` antes de criar nova aba. Pattern reusável pra qualquer "abrir arquivo que pode já estar aberto" (offer to use this pattern em outros lugares se aparecer).

---

## 6. Obsidian Native Components — Quick Reference

### Inputs
| Componente | Uso |
|-----------|-----|
| `TextComponent(container)` | Input de texto simples |
| `TextAreaComponent(container)` | Textarea multi-linha |
| `ToggleComponent(container)` | Switch on/off |
| `SliderComponent(container)` | Range slider |
| `DropdownComponent(container)` | Select dropdown |
| `ColorComponent(container)` | Color picker |
| `SearchComponent(container)` | Input com ícone de busca |

### Layout
| Componente | Uso |
|-----------|-----|
| `Setting(container)` | Row com name + description + controles |
| `ButtonComponent(container)` | Botão com icon/text |
| `ExtraButtonComponent(container)` | Botão minimal (ícone só) |

### Menus & Modals
| Componente | Uso |
|-----------|-----|
| `Menu()` | Context menu nativo |
| `Modal(app)` | Dialog modal |
| `FuzzySuggestModal<T>` | Modal com busca fuzzy |
| `SuggestModal<T>` | Modal com sugestões |
| `PopoverSuggest<T>` | Autocomplete inline |

### Views
| Componente | Uso |
|-----------|-----|
| `ItemView` | View na sidebar/center |
| `FileView` | View para tipos de arquivo |

### Method Reference

**TextComponent**: `setValue()`, `setPlaceholder()`, `onChange()`, `getValue()`
**TextAreaComponent**: same as TextComponent
**ToggleComponent**: `setValue(boolean)`, `onChange()`, `getValue()`
**ButtonComponent**: `setButtonText()`, `setIcon()`, `setCta()`, `setWarning()`, `onClick()`
**SliderComponent**: `setLimits(min, max, step)`, `setValue()`, `onChange()`
**DropdownComponent**: `addOption(value, display)`, `setValue()`, `onChange()`
**ColorComponent**: `setValue()`, `onChange()`
**SearchComponent**: `setValue()`, `onChange()`, `setPlaceholder()`

All inherit from `BaseComponent` (`setDisabled()`) or `ValueComponent<T>` (`getValue()`/`setValue()`).
Constructor pattern: `new XxxComponent(containerEl: HTMLElement)`.

### Setting Fluent API
```typescript
new Setting(containerEl)
  .setName('Opacity')
  .setDesc('Marker background opacity')
  .addSlider(slider => slider
    .setLimits(0, 1, 0.1)
    .setValue(0.3)
    .onChange(v => { /* ... */ }));

// setHeading() — transforms Setting into section header
new Setting(containerEl).setHeading().setName('Markdown Settings');
```

### Menu & MenuItem
```typescript
const menu = new Menu();
menu.addItem(item => item
  .setTitle('Remove Code')
  .setIcon('trash')
  .setChecked(false)
  .onClick(() => removeCode()));
menu.addSeparator();
menu.showAtMouseEvent(evt);
```

### FuzzySuggestModal vs SuggestModal
- `FuzzySuggestModal<T>`: only needs `getItems()` + `getItemText()` — fuzzy search built in
- `SuggestModal<T>`: needs `getSuggestions()` + `renderSuggestion()` + `onChooseSuggestion()` — manual

### Notice
```typescript
new Notice('Operation complete');
new Notice('Permanent message', 0);  // duration=0 = permanent
```

### Tree Items CSS Structure
```html
<div class="search-results-container">
  <div class="tree-item is-collapsed">
    <div class="tree-item-self is-clickable">
      <div class="tree-item-icon collapse-icon">▶</div>
      <div class="tree-item-inner">Code Name</div>
      <div class="tree-item-flair-outer"><span class="tree-item-flair">5</span></div>
    </div>
    <div class="tree-item-children"><!-- nested items --></div>
  </div>
</div>
```

### DOM Helpers
```typescript
createEl('div', { cls: 'my-class', text: 'content', attr: { 'data-id': '123' } })
createDiv({ cls: 'wrapper' })
createSpan({ text: 'label' })
setIcon(el, 'lucide-icon-name')
el.empty()  // clear children
el.addClass('active')
el.removeClass('active')
```

### Fuzzy Search Functions
```typescript
const search = prepareFuzzySearch(query);
const result = search(text);  // returns FuzzyMatch | null
renderMatches(el, text, result.matches);  // highlights matches in DOM
```

### Additional Components
- `ProgressBarComponent(container)` — `setValue(0-100)` progress bar
- `MomentFormatComponent(container)` — date/time format picker with `setDefaultFormat()`, `setSampleEl()`
- `HoverPopover(parent, targetEl, waitTime?)` — native hover popover (alternative to custom tooltip)
- `Notice('msg', duration?)` — toast notification. `duration=0` = permanent

### Additional Views
- `TextFileView` — text editor with auto-save, for custom file formats
- `MarkdownView` — full markdown editor. Don't extend; access via `workspace.getActiveViewOfType(MarkdownView)`
- `MarkdownRenderer.render(app, '**bold**', el, sourcePath, component)` — render markdown string to DOM

### Regras para o Qualia Coding
1. **Preferir componentes nativos** sobre HTML custom
2. **CSS vars não cascatam** para CM6 tooltips, WaveSurfer, Fabric.js — usar `applyThemeColors()`
3. **Namespace CSS**: `codemarker-*` por engine
4. **FuzzySuggestModal** para busca de código (stub "Add Existing Code" pendente)
5. **Nunca `position: fixed`** em plugins — sidebars do Obsidian quebram positioning

---

## 7. Nomes Padronizados de Campos

Convenções de naming aplicadas em todos os engines e interfaces:

| Campo | Correto | Incorreto (legado) |
|-------|---------|---------------------|
| Identificador de arquivo | `fileId` | `file` |
| Reflexão analítica processual | `memo` (em `BaseMarker`, `CodeDefinition`, `GroupDefinition`, `CodeRelation`) | `note` |
| Definição operacional | `description` (em `CodeDefinition`, `GroupDefinition`) | — (distinta de `memo`) |
| Método de remoção de marker | `removeMarker()` | `deleteMarker()` |
| Cor custom do marker | `colorOverride` | — (presente em todos os tipos de marker) |
| Magnitude config | `magnitude` (on CodeDefinition) | — |
| Magnitude value | `magnitude` (on CodeApplication) | — |
| Relations | `relations` (on both CodeDefinition and CodeApplication) | — |

- `parentId` — referencia ao CodeDefinition pai (nunca `parent`)
- `childrenOrder` — array ordenado de ids filhos (nunca `children`)
- `mergedFrom` — ids dos codigos fundidos (audit trail)
- `folder` — id da pasta virtual (nunca path). Pastas nao tem significado analitico
- `rootOrder` — array ordenado de IDs root. Controla ordem de exibicao
- `FolderDefinition` — `{ id, name, createdAt }`. CRUD via registry
- `FlatTreeNode` — `FlatCodeNode | FlatFolderNode` (union discriminada)

---

## 8. Convenções do Projeto

### Código
- TypeScript strict mode
- Sem JSDoc desnecessário — types se auto-documentam
- Nomes descritivos de funções/variáveis
- TODO/FIXME no `docs/ROADMAP.md`, não no código

### Git
- Commit antes de mudanças funcionais (save point)
- Mensagens em inglês, prefixo convencional (`feat:`, `fix:`, `refactor:`, `docs:`)

### CSS
- Prefixo por engine (ver tabela em ARCHITECTURE.md §4.4)
- Obsidian CSS vars para cores (light/dark mode automático)
- `applyThemeColors()` para DOM externo

### Build
- `npm run build` deve passar antes de declarar trabalho feito
- `tsc -noEmit` roda primeiro (type checking)
- Bundles everything into single `main.js`

---

## 9. Release Workflow

### Onde os releases vivem
- **Tag git** = versão (sem prefixo `v`, ex: `0.1.0`)
- **GitHub Release** = container com 3 artifacts: `main.js`, `manifest.json`, `styles.css`
- BRAT puxa esses 3 arquivos da release latest do repo

### Workflow automatizado (`.github/workflows/release.yml`)

Push de qualquer tag no formato `[0-9]+.[0-9]+.[0-9]+*` dispara automaticamente:
1. Checkout + setup Node 20
2. `npm ci --legacy-peer-deps`
3. `npm run build` (tsc + esbuild)
4. `gh release create <tag>` com os 3 artifacts e `--generate-notes`

### Como fazer um novo release

```bash
# 1. Bump version em 3 arquivos (manter alinhados):
#    - manifest.json   → "version"
#    - versions.json   → adicionar nova entrada "X.Y.Z": "<minAppVersion>"
#    - package.json    → "version"

# 2. Atualizar CHANGELOG.md com nova entrada (formato Keep a Changelog)

# 3. (Opcional) Build local pra checar antes de pushar
npm run build

# 4. Commit das mudanças via script
~/.claude/scripts/commit.sh "chore: prep X.Y.Z release"

# 5. Push commit + tag — workflow dispara
git push origin main
git tag X.Y.Z
git push origin X.Y.Z

# 6. Verificar workflow + release
gh run list --workflow=release.yml --limit 1
gh release view X.Y.Z

# 7. (Opcional) Marcar como pre-release se for alpha/beta
gh release edit X.Y.Z --prerelease
```

### Notas

- **Nada de `v` prefix nas tags** — Obsidian community plugin guidelines exigem tag = versão exata.
- **Pre-release flag**: alpha/beta releases devem ter `--prerelease` pra sinalizar instabilidade. Latest release não-pre-release é o que BRAT default puxa; pre-release exige opt-in no BRAT.
- **Submissão à Community Plugins**: PR no [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) — review estrito, semanas. Fazer só depois de feedback de alpha (BRAT users).
- **Workflow precisa de `permissions: contents: write`** — já configurado no `release.yml` pra o `gh release create` funcionar.

### Estado atual

- `0.1.0` (pre-release) shipado em 2026-04-29.
- Release pipeline testada e funcional.

---

## Fontes

Este documento consolidou conteúdo de (arquivos originais já arquivados):
- `docs/markdown/DEVELOPMENT.md` — jornada de dev original + debugging
- `memory/porting-playbook.md` — checklist de 11 pontos
- `memory/visual-testing.md` — setup e workflow de testing
- `docs/markdown/COMPONENTS.md` — referência de componentes Obsidian
- `memory/obsidian-plugins.md` — aprendizados de AG Grid, CM6, esbuild
