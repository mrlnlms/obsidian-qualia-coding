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
npm run build    # tsc -noEmit && esbuild production (minified)
npm run dev      # esbuild watch mode (hot reload com hot-reload plugin)
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
  npm run test:e2e                                          # roda todos os 18 specs
  npm run test:e2e -- --spec test/e2e/specs/smoke.e2e.ts   # spec especifico
  npm run test:visual:update                                # regenera baselines
  ```

### Test Vault & Baselines
- Test vault: `test/e2e/vaults/visual/` com fixtures (md, csv, pdf, png, mp3, mp4)
- Baselines: `test/screenshots/baseline/` (commitados — referencia visual)
- `test/screenshots/actual/` e `test/screenshots/diff/` sao gitignored (artefatos de run)
- Resolution-dependent — mesma maquina pra baseline e comparacao
- CI roda so smoke test (Linux rendering difere de macOS)

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

A aba de settings tem duas secoes:

- **General** — `showMagnitudeInPopover`, `showRelationsInPopover`
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
| Nota/anotação do marker | `memo` | `note` |
| Método de remoção de marker | `removeMarker()` | `deleteMarker()` |
| Cor custom do marker | `colorOverride` | — (presente em todos os tipos de marker) |
| Magnitude config | `magnitude` (on CodeDefinition) | — |
| Magnitude value | `magnitude` (on CodeApplication) | — |
| Relations | `relations` (on both CodeDefinition and CodeApplication) | — |

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

## Fontes

Este documento consolidou conteúdo de (arquivos originais já arquivados):
- `docs/markdown/DEVELOPMENT.md` — jornada de dev original + debugging
- `memory/porting-playbook.md` — checklist de 11 pontos
- `memory/visual-testing.md` — setup e workflow de testing
- `docs/markdown/COMPONENTS.md` — referência de componentes Obsidian
- `memory/obsidian-plugins.md` — aprendizados de AG Grid, CM6, esbuild
