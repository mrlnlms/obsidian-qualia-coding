# APPROACH 2: Merge por Camada Cross-Engine

## Status Geral (atualizado 2026-02-28)

| Camada | Descrição | Status |
|--------|-----------|--------|
| 1 | Scaffold | **CONCLUÍDA** |
| 2 | Core | **CONCLUÍDA** |
| 3 | Markers — Markdown + PDF | **CONCLUÍDA** |
| 4 | Menu Unificado | **CONCLUÍDA** |
| 5 | Handles + Hover | **CONCLUÍDA** |
| 6 | Margin Panel | **CONCLUÍDA** |
| 7 | Side Panel | **CONCLUÍDA** |
| 8 | CSV | Não iniciada |
| 9 | Image + Audio + Video | Não iniciada |
| 10 | Analytics + Lazy Loading | Não iniciada |

**Engines ativos:** Markdown + PDF (funcionais, testados)
**Próximo passo:** Camada 8 (CSV)

### Notas sobre o porting:
- **baseCodingMenu.ts** (D30): criado na Camada 2 (antecipado do plano original que previa Phase 4.6). PDF já refatorado para importar funções do core.
- **PDF views**: extends BaseCodeDetailView/BaseCodeExplorerView via PdfSidebarAdapter (adapta PdfCodingModel → SidebarModelInterface).
- **View type IDs** (D20): PDF renomeado de `codemarker-pdf-*` → `qualia-pdf-*`. Markdown já usa `qualia-markdown-*`.
- **Arquivos novos não previstos no plano original**: `pdf/views/pdfSidebarAdapter.ts`, `markdown/cm6/hoverBridge.ts`, `core/codeBrowserModal.ts`.

---

## Filosofia

O MERGE-PLAN.md porta **por engine** (markdown todo → PDF todo → CSV todo → ...). Este plano porta **por camada de interação**, cruzando engines: markers de markdown+PDF juntos, depois menu unificado, depois margin panel, depois views. O compartilhamento é nativo desde o início — `core/` nasce na camada 2 e cada componente é escrito uma vez com visão cross-engine. Phase 4 do MERGE-PLAN (abstrações) simplesmente não precisa existir.

### Diferença fundamental

| Aspecto | MERGE-PLAN (por engine) | APPROACH 2 (por camada) |
|---------|------------------------|------------------------|
| `core/` | Extraído na Phase 4 (depois de tudo funcionar) | Criado na camada 2 (desde o início) |
| `baseCodingMenu` | Cada engine tem seu `menu/` local, unifica na Phase 4.6 | Menu unificado na camada 4, engines importam |
| `baseDetailView` | Cada engine tem `views/` local, base class na Phase 4 | Base classes na camada 7, engines estendem desde o início |
| Markers | Cada engine porta seu model isolado | Markdown + PDF portam juntos, tipos compartilhados |
| **Quando o compartilhamento acontece** | **No final (Phase 4, nice-to-have)** | **Desde o início (built-in)** |

### Workflow

- **Vault:** novo vault limpo
- **Processo:** usuário copia pastas de plugins, Claude edita/limpa
- **Estrutura:** híbrida — `core/` centralizado + engines autocontidos com views/models que estendem base

---

## Decisões Herdadas do MERGE-PLAN

Todas as decisões D1–D30 do MERGE-PLAN são válidas, com ajustes de timing:

| # | Decisão | Ajuste no APPROACH 2 |
|---|---------|---------------------|
| D1 | Juntar primeiro, abstrair depois | **Invertido parcialmente**: `core/` nasce na camada 2, abstrações são nativas. Mas engines individuais (Image, Audio, Video) ainda são "copiar → limpar" |
| D2 | Ordem engines: PDF → CSV → Image → Audio → Video → Analytics | **Reinterpretado**: PDF entra junto com markdown na camada 3. CSV na camada 8. Image+Audio+Video na camada 9. Analytics na camada 10 |
| D3 | CSV importa CM6 de `src/markdown/cm6/` | Sem mudança — CM6 extensions são refinadas nas camadas 3-6 antes do CSV chegar |
| D4 | Types na Phase 1, persistência novo formato desde início | `core/types.ts` nasce na camada 2 |
| D5 | dataReader reescrito | Analytics chega na camada 10, tudo já no formato DataManager |
| D6 | Lazy loading: factory + `await import()` | Camada 10 |
| D7 | Shared registry morto, codebook no data.json | Camada 2 (core) |
| D8 | Sem rollback | Sem mudança |
| D9 | Settings namespace por engine | Sem mudança |
| D10 | Smoke test manual por engine | **Por camada** — cada camada tem checklist |
| D11 | DataManager centralizado | Camada 2 |
| D12 | Multi-build esbuild | Camada 10 |
| D13 | `registerXxxEngine()` retorna `EngineCleanup` | Sem mudança |
| D14 | `createDefaultData()` factory | Camada 2 |
| D15 | CSS concatenação sem rename | Camada 1 (scaffold) |
| D16 | Só markdown registra `registerEditorExtension()` | Camada 3 |
| D17 | main.ts simples → refatora pra DataManager | Camada 1 → camada 2 |
| D18 | esbuild external lista explícita | Sem mudança |
| D19 | board.json path atualizado | Camada 10 (Analytics) |
| D20 | View type ID rename | Conforme cada engine é portado |
| D21 | Registry migration 3 formatos legacy | Camada 2 (DataManager.load()) |
| D22 | `codeDescriptions` legacy stripped | Camada 2 |
| D23 | `viewLookupUtils.ts` versão CSV é canônica | Camada 3 (markdown) — já usa versão completa com standalone registry |
| D24 | Command dedup v2/CSV | Camada 8 (CSV) |
| D25 | CSS concat order: v2 > PDF > CSV > Image > Audio > Video > Analytics | Camada 1 |
| D26 | tsconfig.json unificado baseado no v2 | Camada 1 |
| D27 | Settings tab: cada engine registra a sua | Conforme cada engine é portado |
| D28 | CSV dedup estendido | Camada 8 |
| D29 | Naming convention: `detailView.ts`, `explorerView.ts`, `codingModel.ts` | Nativo desde o início |
| D30 | Menu: funções compartilhadas em `baseCodingMenu.ts` | Camada 4 |

---

## Estrutura Final

```
.obsidian/plugins/qualia-coding/
  manifest.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  styles.css                    # concatenado (D25): v2 > PDF > CSV > Image > Audio > Video > Analytics
  main.js                      # build output
  engines/                     # lazy-loaded bundles (camada 10)
    csv.js
    image.js
    audio.js
    video.js
    analytics.js
  src/
    main.ts                    # ~15 LOC: DataManager + register engines
    core/
      types.ts                 # QualiaData, CodeDefinition, EngineCleanup, createDefaultData()
      dataManager.ts           # estado in-memory + save debounced 500ms (D11)
      codeDefinitionRegistry.ts  # canônico (D29) — 6 cópias morrem
      codeFormModal.ts         # canônico — 5 cópias morrem
      baseCodingMenu.ts        # 7 funções compartilhadas (D30)
      baseDetailView.ts        # 80% shared (3 modos: lista, code-focused, marker-focused)
      baseExplorerView.ts      # 89% shared (tree 3 níveis: Code → File → Segment)
    markdown/
      index.ts                 # registerMarkdownEngine() → EngineCleanup
      models/
        codingModel.ts         # CodeMarkerModel (547 LOC), line/ch markers
      cm6/
        markerStateField.ts    # StateField: decorações, syncDecorationsToModel, snap-back sync
        markerViewPlugin.ts    # ViewPlugin: handle overlay SVG, drag-resize, hover detection
        selectionMenuField.ts  # tooltip de seleção + preview
        hoverMenuExtension.ts  # hover delay 350ms, menu close timer 200ms
        marginPanelExtension.ts  # barras MAXQDA-style, labels, hover bidirecional
        utils/
          markerPositionUtils.ts
          viewLookupUtils.ts   # versão CSV canônica (D23) com standalone registry
      menu/
        cm6NativeTooltipMenu.ts  # Approach C — CM6 tooltip + componentes Obsidian
        menuController.ts
        menuActions.ts
        menuTypes.ts
      views/
        detailView.ts          # extends baseDetailView
        explorerView.ts        # extends baseExplorerView
        settingTab.ts
    pdf/
      index.ts                 # registerPdfEngine() → EngineCleanup
      models/
        codingModel.ts         # PdfMarker + PdfShapeMarker
      rendering/
        highlightRenderer.ts   # PDF coords → CSS %
        selectionCapture.ts    # mouseup → index/offset coords
        drawLayer.ts           # SVG overlay por página (z-index 4, viewBox 0-100)
        drawInteraction.ts     # Rect/Ellipse drag-to-draw, Polygon click-to-place
        drawToolbar.ts
      marginPanel.ts           # "page push" overlay
      menu/
        pdfCodingMenu.ts       # popover — usa baseCodingMenu funções
      views/
        detailView.ts          # extends baseDetailView
        explorerView.ts        # extends baseExplorerView
    csv/
      index.ts                 # registerCsvEngine() — NÃO registra CM6 extensions (D16)
      models/
        codingModel.ts         # RowMarker + SegmentMarker, rowDataCache
      grid/                    # AG Grid configuração, cell renderers
      segmentEditor.ts         # EditorView CM6 standalone, importa de markdown/cm6/
      menu/
        codingMenu.ts          # tag button popover — usa baseCodingMenu
      views/
        csvView.ts             # FileView + registerExtensions(["csv"]) + AG Grid
        detailView.ts          # extends baseDetailView
        explorerView.ts        # extends baseExplorerView
    image/
      index.ts                 # registerImageEngine()
      models/
        codingModel.ts         # ImageMarker (normalized coords 0-1)
      canvas/
        fabricCanvas.ts        # Fabric.js 6.9.1 lifecycle
        regionDrawing.ts       # draw rect/ellipse/polygon
        regionHighlight.ts     # glow on hover
        regionLabels.ts        # code names on shapes
      menu/
        codingMenu.ts          # usa baseCodingMenu
      views/
        detailView.ts
        explorerView.ts
        settingTab.ts          # autoOpenImages toggle
    audio/
      index.ts                 # registerAudioEngine()
      models/
        codingModel.ts         # AudioMarker (from/to seconds + codes + memo)
      audio/
        waveformRenderer.ts    # WaveSurfer v7 lifecycle
        regionRenderer.ts      # colored regions, vertical lanes, minimap markers
      menu/
        codingMenu.ts
      views/
        detailView.ts          # com memo editável
        explorerView.ts
        settingTab.ts
    video/
      index.ts                 # registerVideoEngine() — fork do Audio, 4 diferenças
      models/
        codingModel.ts         # VideoMarker
      video/
        waveformRenderer.ts    # WaveSurfer media: HTMLMediaElement
        regionRenderer.ts
      menu/
        codingMenu.ts
      views/
        detailView.ts
        explorerView.ts
        settingTab.ts          # + videoFit setting
    analytics/
      index.ts                 # registerAnalyticsEngine()
      data/
        dataReader.ts          # REESCRITO: lê DataManager in-memory (D5)
        dataConsolidator.ts
        statsEngine.ts
        clusterEngine.ts
        decisionTreeEngine.ts
        mcaEngine.ts
        mdsEngine.ts
        textExtractor.ts
      views/
        analyticsView.ts      # 19 ViewModes
      board/                   # Research Board: 6 node types, Fabric.js
```

---

## Camada 1: Scaffold

**Objetivo:** plugin `qualia-coding` compila e carrega no Obsidian. Zero funcionalidade.

### Passos

1. Criar `.obsidian/plugins/qualia-coding/`
2. `manifest.json` — id: `qualia-coding`, name: `Qualia Coding`
3. `package.json` — todas as deps (engines futuros já inclusos):
   - `ag-grid-community ^33`, `papaparse ^5.4.1`, `fabric ^6.9.1`, `wavesurfer.js ^7`, `chart.js ^4.4`, `chartjs-adapter-date-fns ^3`, `chartjs-chart-wordcloud ^4.4.5`, `date-fns ^4.1`, `svd-js ^1.1.1`
   - devDeps: `obsidian latest`, `typescript ^5`, `esbuild ^0.19`, `@types/node ^20`, `@types/papaparse ^5.3.14`
4. `tsconfig.json` unificado (D26): baseUrl `"."`, strict, `skipLibCheck: true`, `lib: ["DOM", "ES5", "ES6", "ES7", "ESNext"]`
5. `esbuild.config.mjs`: entryPoint `src/main.ts`, external `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`
6. `styles.css` concatenado (D25): v2 > PDF > CSV > Image > Audio > Video > Analytics, dedup blocos idênticos
7. `src/main.ts` shell:
   ```typescript
   import { Plugin } from "obsidian";
   export default class QualiaCodingPlugin extends Plugin {
     async onload() {
       console.log("Qualia Coding loaded");
     }
   }
   ```
8. `npm install && npm run build`
9. Ativar no Obsidian — plugin aparece, console mostra log

### Done

- [x] Build pipeline funciona (`tsc -noEmit` + `npm run build`)
- [x] Plugin carrega sem crash
- [x] `styles.css` concatenado (~101KB após dedup)

---

## Camada 2: Core

**Objetivo:** infraestrutura compartilhada que todos os engines usarão. DataManager centralizado, registry canônico, types, modals, base classes.

### Passos

1. **`src/core/types.ts`** — interfaces compartilhadas:
   - `CodeDefinition` (name, color, description, paletteIndex, createdAt, updatedAt)
   - `EngineCleanup = () => void | Promise<void>`
   - `QualiaData` com seções tipadas: registry, markdown, csv, image, pdf, audio, video
   - `createDefaultData()` factory (D14)

2. **`src/core/dataManager.ts`** — estado in-memory centralizado (D11):
   - `load()`: `plugin.loadData()` + shallow merge com defaults + migration (D21, D22)
   - `section<K>(key: K)` / `setSection<K>(key: K, value)` — engines NUNCA chamam `loadData()`/`saveData()` direto
   - `markDirty()` → debounce 500ms → `flush()`
   - `migrateRegistries()` (D21): normaliza 3 formatos legacy → `QualiaData.registry` único
   - Strip `codeDescriptions` legacy (D22)

3. **`src/core/codeDefinitionRegistry.ts`** — cópia canônica do v2 (188 LOC). As 5 outras cópias morrem.

4. **`src/core/codeFormModal.ts`** — cópia canônica do v2 (82 LOC). Modal com color picker + description. As 4 outras morrem.

5. **`src/core/baseCodingMenu.ts`** — 7 funções compartilhadas (D30):
   ```typescript
   export function createPopover(anchor, app): HTMLElement    // PDF, CSV, Audio, Video, Image usam
   export function renderCodeInput(container, onSubmit): void // todos
   export function renderToggleList(container, codes, activeNames, onToggle): void // todos
   export function createActionItem(container, label, onClick): HTMLElement
   export function createSeparator(container): void
   export function applyThemeColors(el): void
   export function positionAndClamp(popover, pos): void
   ```
   Markdown **não usa** `createPopover` (CM6 tooltip lifecycle próprio). Image usa parcialmente (class-based).

6. **`src/core/baseDetailView.ts`** — classe abstrata, 80% do código shared:
   - 3 modos: lista (`showList`), code-focused (`showCodeDetail`), marker-focused (`setContext`)
   - Botão "← All Codes"
   - Métodos abstratos por engine: `formatMarkerLabel()`, `generatePreview()`, `navigateToMarker()`, `renderCustomSection()`

7. **`src/core/baseExplorerView.ts`** — classe abstrata, 89% shared:
   - Tree 3 níveis: Code → File → Segment
   - Toolbar: All, Files, Refresh
   - `codeNodes` + `fileNodes` collapse independente
   - Métodos abstratos: `formatSegmentLabel()`, `navigateToSegment()`, `buildCodeIndex()`

8. **Refatorar `main.ts`** para DataManager + EngineCleanup:
   ```typescript
   import { Plugin } from "obsidian";
   import { DataManager } from "./core/dataManager";
   import type { EngineCleanup } from "./core/types";

   export default class QualiaCodingPlugin extends Plugin {
     dataManager!: DataManager;
     private cleanups: EngineCleanup[] = [];

     async onload() {
       this.dataManager = new DataManager(this);
       await this.dataManager.load();
       // Engines registrados nas próximas camadas
     }

     async onunload() {
       for (let i = this.cleanups.length - 1; i >= 0; i--) {
         await this.cleanups[i]();
       }
       await this.dataManager.flush();
     }
   }
   ```

### Done ✅ (Camada 2 concluída)

- [x] `src/core/` com 9 arquivos: types, dataManager, registry, codeFormModal, baseCodingMenu, baseCodeDetailView, baseCodeExplorerView, settingTab, codeBrowserModal
- [x] DataManager carrega/salva corretamente
- [x] Build sem erro
- [x] Base classes compilam e são usadas pelos engines Markdown + PDF
- [x] `baseCodingMenu.ts` — 7 funções exportadas, PDF já usa

---

## Camada 3: Markers — Markdown + PDF

**Objetivo:** dois engines com markers funcionando. Highlights visíveis no editor markdown (decorations CM6) e no PDF (CSS %). Nenhum menu, nenhum hover, nenhum panel — só markers visíveis.

### Markdown — Model + Decorações

Portar de `obsidian-codemarker-v2`:

1. `src/markdown/models/codingModel.ts` — CodeMarkerModel (547 LOC):
   - `Marker` com `id`, `file`, `range: { line, ch }` (start/end), `codes[]`, `createdAt`, `updatedAt`
   - Load/save via `plugin.dataManager.section("markdown")` / `setSection("markdown", ...)`
   - `syncDecorationsToModel()` para snap-back fix
   - `markDirtyForSave()` debounced 2s → DataManager

2. `src/markdown/cm6/markerStateField.ts` (289 LOC):
   - StateField com decorações
   - `syncDecorationsToModel()` — itera `decorations.between()`, agrupa por marker ID, atualiza model
   - Selection preview
   - `setHoverEffect` **ignorado** no state field (hover vive nos ViewPlugins)

3. `src/markdown/cm6/utils/markerPositionUtils.ts` (132 LOC) — `cm6OffsetToPos()`, `posToOffset()` com clamp multi-byte

4. `src/markdown/cm6/utils/viewLookupUtils.ts` — versão CSV canônica (92 LOC, D23) com standalone editor registry

5. `src/markdown/index.ts`:
   ```typescript
   export function registerMarkdownEngine(plugin: QualiaCodingPlugin): EngineCleanup {
     const registry = plugin.dataManager.section("registry");
     const model = new CodeMarkerModel(plugin);

     plugin.registerEditorExtension([
       createMarkerStateField(model),    // highlights no texto
     ]);

     return () => { /* cleanup */ };
   }
   ```

### PDF — Model + Highlights

Portar de `obsidian-codemarker-pdf`:

1. `src/pdf/models/codingModel.ts` — PdfCodingModel:
   - `PdfMarker`: page, beginIndex, beginOffset, endIndex, endOffset, codes[]
   - `PdfShapeMarker`: page, shapeType (rect/ellipse/polygon), normalizedCoords, codes[]
   - Load/save via `plugin.dataManager.section("pdf")` / `setSection("pdf", ...)`

2. `src/pdf/rendering/highlightRenderer.ts` — PDF coords → CSS % via `placeRectInPage()`

3. `src/pdf/rendering/selectionCapture.ts` — mouseup → index/offset coords

4. `src/pdf/index.ts`:
   ```typescript
   export function registerPdfEngine(plugin: QualiaCodingPlugin): EngineCleanup {
     const model = new PdfCodingModel(plugin);
     // active-leaf-change → inject highlights into PDF view
     return () => { /* cleanup observers */ };
   }
   ```

5. Atualizar `main.ts`:
   ```typescript
   this.cleanups.push(registerMarkdownEngine(this));
   this.cleanups.push(registerPdfEngine(this));
   ```

### Smoke Test

- [x] Abrir markdown → highlights coloridos visíveis (sem interação)
- [x] Abrir PDF → highlights em texto selecionado previamente
- [x] Reload → markers persistem em ambos engines
- [x] Build sem erro com 2 engines

### Done ✅ (Camada 3 concluída)

- Markdown: highlights visíveis, model load/save funcional
- PDF: highlights visíveis, model load/save funcional
- Ambos usam `core/codeDefinitionRegistry` e `core/types`
- Ambos usam DataManager (seções separadas: `"markdown"`, `"pdf"`)

---

## Camada 4: Menu Unificado

**Objetivo:** selecionar texto em markdown OU PDF → menu abre → criar/toggle códigos. `baseCodingMenu.ts` já existe no core (camada 2). Agora conectar aos engines.

### Markdown — Selection Menu (CM6 tooltip)

Portar de v2:

1. `src/markdown/cm6/selectionMenuField.ts` (151 LOC) — `showCodingMenuEffect`, tooltip StateField
2. `src/markdown/menu/cm6NativeTooltipMenu.ts` (250 LOC) — Approach C: tooltip CM6 + componentes nativos Obsidian
3. `src/markdown/menu/menuController.ts` (74 LOC)
4. `src/markdown/menu/menuActions.ts` (98 LOC)
5. `src/markdown/menu/menuTypes.ts` (20 LOC)

Menu markdown usa `renderCodeInput()`, `renderToggleList()`, `positionAndClamp()` do `baseCodingMenu`. **Não usa** `createPopover()` — CM6 tooltip lifecycle próprio.

Registrar `selectionMenuField` no `registerEditorExtension`:
```typescript
plugin.registerEditorExtension([
  createMarkerStateField(model),
  createSelectionMenuField(model),   // ← NOVO
]);
```

### PDF — Popover Menu

Portar de `obsidian-codemarker-pdf`:

1. `src/pdf/menu/pdfCodingMenu.ts` — refatorar para usar `baseCodingMenu`:
   - `createPopover()` do core
   - `renderCodeInput()`, `renderToggleList()` do core
   - Engine-specific: posicionamento relativo ao PDF container

### Smoke Test

- [x] Selecionar texto em markdown → tooltip → toggle código → marker criado
- [x] Selecionar texto em PDF → popover → toggle código → marker criado
- [x] Criar novo código via input → CodeFormModal abre → código salvo no registry
- [x] Ambos menus usam mesmas funções de `baseCodingMenu`

### Done ✅ (Camada 4 concluída)

- Menu funcional em markdown (CM6 tooltip) e PDF (popover)
- `baseCodingMenu.ts` provê funções compartilhadas (createPopover, renderCodeInput, renderToggleList, createActionItem, createSeparator, applyThemeColors, positionAndClamp)
- `pdfCodingMenu.ts` refatorado — importa do core, ~60% menos código
- `codeFormModal.ts` canônico usado por ambos

---

## Camada 5: Handles + Hover

**Objetivo:** hover sobre marker → informação visual + interação. Handles SVG de resize (markdown). Drag handles (PDF shapes). Hover bidirecional começa.

### Markdown — Hover + Handle Overlay

Portar de v2:

1. `src/markdown/cm6/markerViewPlugin.ts` (599 LOC):
   - ViewPlugin: handle overlay no `scrollDOM`, SVGs via `coordsAtPos + requestMeasure`
   - `eventHandlers`: mousemove (hover via `closest('.codemarker-highlight')`), mouseup, mouseleave
   - Debounce 30ms para null momentâneo entre sub-spans CM6
   - Hover detection DOM-based (respeita word-wrap)
   - `SELECTION_EVENT` dispatch no mouseup

2. `src/markdown/cm6/hoverMenuExtension.ts` (313 LOC):
   - ViewPlugin: hover delay 350ms, menu close timer 200ms
   - Guards: selection ativa, tooltip existente, drag em andamento
   - `onTooltipMouseEnter/Leave` custom events

Registrar no `registerEditorExtension`:
```typescript
plugin.registerEditorExtension([
  createMarkerStateField(model),
  createMarkerViewPlugin(model),       // ← NOVO: handles + hover + drag
  createSelectionMenuField(model),
  createHoverMenuExtension(model),     // ← NOVO: hover delay + menu lifecycle
]);
```

### PDF — Draw Layer + Shape Interaction

Portar de `obsidian-codemarker-pdf`:

1. `src/pdf/rendering/drawLayer.ts` — SVG overlay por página (z-index 4, viewBox 0-100)
2. `src/pdf/rendering/drawInteraction.ts` — Rect/Ellipse drag-to-draw, Polygon click-to-place
3. `src/pdf/rendering/drawToolbar.ts` — toolbar no PDF viewer

### Hover Bidirecional (parcial)

- Markdown: texto hover → `setHoverEffect` → handles SVG aparecem
- PDF: highlight hover → visual feedback
- Bidirecional completo (com margin panel) vem na camada 6

### Smoke Test

- [x] Markdown: hover sobre marker → 350ms → tooltip menu → toggle codes
- [x] Markdown: handles SVG nos extremos → drag → marker resize → posição persiste
- [x] Markdown: hover entre sub-spans → debounce 30ms mantém hover estável
- [x] PDF: draw toolbar → draw rect/ellipse/polygon → shape aparece
- [x] PDF: hover sobre shape → visual feedback

### Done ✅ (Camada 5 concluída)

- Markdown: hover completo + handles SVG + drag-resize
- PDF: draw layer + shape interaction + toolbar

---

## Camada 6: Margin Panel

**Objetivo:** barras coloridas na margem (MAXQDA-style) em markdown e PDF. Hover bidirecional completo (panel ↔ texto). Este é o componente mais complexo.

### Markdown — CM6 Margin Panel

Portar de v2:

`src/markdown/cm6/marginPanelExtension.ts` (667 LOC):
- `renderBrackets()`: coleta markers, `assignColumns()`, `resolveLabels()`, mede texto, computa largura
- `assignColumns()`: sort por span (maior → mais à direita), aloca coluna livre
- `resolveLabels()`: labels no centro da barra, collision avoidance com peso
- `renderBar()` / `renderLabel()` / `renderDot()` / `renderTick()`: DOM rendering
- `detectElementType()`: classifica bar/label/dot/tick para hover
- `applyHoverClasses()`: toggle `.codemarker-margin-hovered` sem re-render
- Hover bidirecional completo:
  ```
  Texto hover → setHoverEffect → margin panel applyHoverClasses() → labels underline
  Panel hover → setHoverEffect → markerViewPlugin update() → handles SVG aparecem
  ```
- ResizeObserver no `contentDOM`, MutationObserver com self-suppression 50ms
- RLL dynamic labels: `effectivePanelWidth = panelWidth + extraSpace`
- Line numbers (gutters): `gutterEl.style.marginLeft` quando presentes

Registrar (extensão final do markdown):
```typescript
plugin.registerEditorExtension([
  createMarkerStateField(model),
  createMarkerViewPlugin(model),
  createSelectionMenuField(model),
  createHoverMenuExtension(model),
  createMarginPanelExtension(model),   // ← NOVO
]);
```

### PDF — "Page Push" Margin Panel

Portar de `obsidian-codemarker-pdf`:

`src/pdf/marginPanel.ts`:
- Overlay externo fora do scroll container
- `scrollContainer.style.marginLeft = total`, overlay `left = offsetLeft - total`
- Barras + labels alinhados com highlights por página
- Hover bidirecional: panel hover → highlight glow no PDF

### Refinamentos (janela ideal)

Este é o **melhor momento** para refinamentos da margin panel porque:
1. Componente está isolado
2. Sem dependência de outros engines
3. Qualquer melhoria cascateia para CSV segment editor na camada 8

| Oportunidade | Status atual | Benefício |
|-------------|-------------|-----------|
| Posicionamento com inline title/properties/callouts | Parcial (MutationObserver + heurísticas) | Consolidar lógica de offset |
| Setting left/right | Não implementado | Opção para lado da margin |
| Visual customization | Básico | Espessura barra, estilo ticks, opacidade |
| Label truncation edge cases | Fix `-4px` aplicado | Verificar após porting |

### Smoke Test

- [x] Markdown: barras coloridas na margem, alinhadas com highlights
- [x] Markdown: hover na barra → handles SVG no texto (bidirecional)
- [x] Markdown: hover no texto → label sublinha na margin (bidirecional)
- [x] Markdown: RLL toggle → painel reposiciona
- [x] Markdown: line numbers toggle → margem ajusta
- [x] PDF: margin panel "page push" com barras por página
- [x] PDF: hover bidirecional panel ↔ highlights
- [x] Resize janela → ambos recalculam

### Done ✅ (Camada 6 concluída)

- Markdown: margin panel MAXQDA-style completo com hover bidirecional
- PDF: margin panel overlay "page push" completo
- Foundation visual de ambos engines completa

---

## Camada 7: Side Panel

**Objetivo:** sidebar com detail view (3 modos) e explorer tree (3 níveis). Integrado markdown+PDF. Navegação cross-file.

### Base Classes (já existem no core desde camada 2)

- `baseDetailView.ts` — 3 modos (lista, code-focused, marker-focused)
- `baseExplorerView.ts` — tree 3 níveis (Code → File → Segment)

### Markdown — Views Concretas

1. `src/markdown/views/detailView.ts` — extends `baseDetailView`:
   - `formatMarkerLabel()`: "lines 5-12"
   - `generatePreview()`: text snippet
   - `navigateToMarker()`: CM6 `scrollIntoView` + `dispatch`
   - `renderCustomSection()`: noop (sem seções custom)

2. `src/markdown/views/explorerView.ts` — extends `baseExplorerView`:
   - `formatSegmentLabel()`: "File.md: lines 5-12"
   - `navigateToSegment()`: abrir arquivo + scroll to marker

3. `src/markdown/views/settingTab.ts` (95 LOC)

Registrar:
```typescript
plugin.registerView("qualia-markdown-detail", (leaf) =>
  new MarkdownDetailView(leaf, plugin, model));
plugin.registerView("qualia-markdown-explorer", (leaf) =>
  new MarkdownExplorerView(leaf, plugin, model));
plugin.addSettingTab(new MarkdownSettingTab(plugin.app, plugin));
```

### PDF — Views Concretas

1. `src/pdf/views/detailView.ts` — extends `baseDetailView`:
   - `formatMarkerLabel()`: "Page 3, index 5-12" / "Shape: Rect on page 3"
   - `generatePreview()`: coords description
   - `navigateToMarker()`: scroll to page + highlight flash
   - `renderCustomSection()`: shape description para PdfShapeMarker

2. `src/pdf/views/explorerView.ts` — extends `baseExplorerView`:
   - Inclui markers de texto E shapes na árvore

Registrar:
```typescript
plugin.registerView("qualia-pdf-detail", (leaf) =>
  new PdfDetailView(leaf, plugin, model));
plugin.registerView("qualia-pdf-explorer", (leaf) =>
  new PdfExplorerView(leaf, plugin, model));
```

### Comandos + Context Menus + Ribbon (Markdown)

Completar o `registerMarkdownEngine()`:
```typescript
// Commands
plugin.addCommand({ id: 'create-code-marker', ... });
plugin.addCommand({ id: 'open-coding-menu', ... });
plugin.addCommand({ id: 'open-code-explorer', ... });
plugin.addCommand({ id: 'reset-code-markers', ... });

// Context menus
plugin.registerEvent(app.workspace.on('editor-menu', ...));
plugin.registerEvent(app.workspace.on('file-menu', ...));

// Ribbon
plugin.addRibbonIcon('tag', 'Code Selection', ...);
```

### Click Integration

- Margin panel label click → `revealCodeDetailPanel(markerId, codeName)` → detail view abre em modo marker-focused
- Explorer segment click → navega ao marker (CM6 scroll / PDF page jump)
- **NÃO chamar `revealLeaf` em updates automáticos** — causa focus steal + render loop (padrão documentado)

### Smoke Test

- [x] Explorer tree: 3 níveis, expand/collapse, click → navega (markdown e PDF)
- [x] Detail view: lista → code-focused → marker-focused → "← All Codes"
- [x] Click label na margin → detail view abre no modo marker-focused
- [x] Cross-file listing: detail mostra markers de markdown E PDF para mesmo código
- [x] Settings tab funciona
- [x] Commands funcionam (cmd palette)
- [x] Context menus: editor-menu, file-menu

### Done ✅ (Camada 7 concluída)

- Markdown engine 100% funcional (paridade com v2)
- PDF engine 100% funcional (paridade com plugin PDF)
- PDF views estendem base classes via PdfSidebarAdapter (pdfCodeDetailView ~60 LOC, pdfCodeExplorerView ~55 LOC)
- View type IDs: `qualia-markdown-detail`, `qualia-markdown-explorer`, `qualia-pdf-detail`, `qualia-pdf-explorer`
- Ambos integrados: explorer mostra markers de ambos, detail navega cross-engine
- `main.ts` ~15 LOC

---

## Camada 8: CSV

**Objetivo:** AG Grid + segment editor herda tudo que foi refinado nas camadas 3-6 (CM6 extensions, menu, margin panel).

### Portar de `obsidian-codemarker-csv`

1. `src/csv/models/codingModel.ts` — RowMarker + SegmentMarker, rowDataCache
2. `src/csv/views/csvView.ts` — FileView + `registerExtensions(["csv"])` + AG Grid
3. `src/csv/grid/` — AG Grid configuração, cell renderers, editors
4. `src/csv/segmentEditor.ts` — EditorView CM6 standalone:
   ```typescript
   // Importa de markdown/cm6/ — NÃO duplica extensions
   import { createMarkerStateField, createMarkerViewPlugin, createSelectionMenuField,
            createHoverMenuExtension, createMarginPanelExtension } from "../markdown/cm6";
   ```
5. `src/csv/menu/codingMenu.ts` — tag button popover (usa `baseCodingMenu`)
6. `src/csv/views/detailView.ts` — extends `baseDetailView`
7. `src/csv/views/explorerView.ts` — extends `baseExplorerView`

### Atenção

- **NÃO registrar CM6 extensions globalmente** (D16) — markdown engine já registrou. CSV só cria `EditorView` standalone para segment editing com extensions no constructor
- **Virtual fileIds**: `csv:${file}:${row}:${column}` — nunca colide com paths reais
- **Dedup (D24, D28)**: deletar 4 comandos duplicados, `editor-menu` handler cópia, `file-menu` handler cópia, ribbon `'tag'` cópia, `CodeMarkerSettingTab` cópia. CSV mantém apenas seus 4 comandos próprios + ribbon `'tags'`
- **`.ag-cell` wrapper chain**: `.ag-cell` → `.ag-cell-wrapper` → `.ag-cell-value` todos `width: 100%`

### Registrar

```typescript
export function registerCsvEngine(plugin: QualiaCodingPlugin): EngineCleanup {
  plugin.registerExtensions(["csv"], "qualia-csv-view");
  plugin.registerView("qualia-csv-view", (leaf) => new CsvView(leaf, plugin));
  plugin.registerView("qualia-csv-detail", (leaf) => new CsvCodeDetailView(leaf, plugin));
  plugin.registerView("qualia-csv-explorer", (leaf) => new CsvCodeExplorerView(leaf, plugin));
  return () => { /* detach leaves */ };
}
```

### Smoke Test

- [x] Abrir CSV → AG Grid renderiza
- [x] Tag button → CodePickerModal → assign código
- [x] Segment editor: CM6 decorations + handles + hover + margin panel (herdado)
- [x] Row marker → header tag → todas rows
- [x] Sidebar: detail + explorer funcionam
- [x] Navigate: sidebar → `gridApi.ensureIndexVisible()` + `flashCells()`
- [x] Save → reload → markers persistem

### Done

- CSV engine funcional com segment editor herdando CM6 refinado
- Zero duplicação de CM6 extensions

---

## Camada 9: Image + Audio + Video

**Objetivo:** 3 engines media portados. Todos usam `baseCodingMenu`, `baseDetailView`, `baseExplorerView` do core.

### Image (Fabric.js 6.9.1, ~2,840 LOC)

Portar de `obsidian-codemarker-image`:

1. `src/image/models/codingModel.ts` — ImageMarker (normalized coords 0-1, shapes: Rect/Ellipse/Polygon)
2. `src/image/canvas/` — `fabricCanvas.ts`, `regionDrawing.ts`, `regionHighlight.ts`, `regionLabels.ts`
3. `src/image/menu/codingMenu.ts` — refatorar para usar `baseCodingMenu` (parcial — class-based, switch para ToggleComponent)
4. `src/image/views/` — `detailView.ts` (extends base), `explorerView.ts` (extends base), `settingTab.ts`
5. Auto-open via `active-leaf-change` (NÃO `registerExtensions` — conflita com Obsidian built-in)

**Fabric.js 6.9.1** (unificado com Analytics, era 6.6.1 no Image). Testar compat.

### Audio (WaveSurfer.js v7, ~2,650 LOC)

Portar de `obsidian-codemarker-audio`:

1. `src/audio/models/codingModel.ts` — AudioMarker (from/to seconds + codes + memo)
2. `src/audio/audio/waveformRenderer.ts` — WaveSurfer lifecycle, Timeline/Minimap plugins
3. `src/audio/audio/regionRenderer.ts` — colored regions, vertical lanes (`applyLanes()`), minimap markers
4. `src/audio/menu/codingMenu.ts` — usa `baseCodingMenu`
5. `src/audio/views/` — `detailView.ts` (com memo editável), `explorerView.ts`, `settingTab.ts`
6. File intercept: `active-leaf-change` para mp3/wav/ogg/flac/m4a

**WaveSurfer shadow DOM**: Timeline/Minimap precisam de container externo explícito. ResizeObserver debounced 100ms.

### Video (fork do Audio, ~2,680 LOC)

Portar de `obsidian-codemarker-video` — 4 diferenças do Audio:
1. `<video>` container acima do waveform
2. WaveSurfer `media: HTMLMediaElement`
3. Extensions: mp4, webm, ogv
4. Setting `videoFit: "contain" | "cover"`

### Smoke Test

- [x] Image: abrir imagem → draw rect → assign code → labels no canvas → sidebar
- [x] Audio: abrir audio → waveform → criar region → assign code → minimap → sidebar
- [x] Video: abrir video → player + waveform → region coding → sidebar
- [x] Todos: save → reload → markers persistem
- [x] Todos: sidebar detail + explorer funcionam (extends base)
- [x] Todos: hover highlight funcional

### Done

- Image, Audio, Video engines funcionais
- Todos estendem base classes do core
- Fabric.js 6.9.1 unificado (Image + Analytics)

---

## Camada 10: Analytics + Lazy Loading + Cleanup

**Objetivo:** Analytics portado, bundles lazy-loaded, plugins antigos deletados.

### Analytics (Chart.js + Fabric + SVD, ~11,147 LOC)

Portar de `obsidian-codemarker-analytics`:

1. **Reescrever `dataReader.ts`** (D5):
   ```typescript
   // ANTES: lê 7 arquivos via vault.adapter.read()
   const mdData = JSON.parse(await vault.adapter.read('.obsidian/plugins/obsidian-codemarker-v2/data.json'));

   // DEPOIS: acessa in-memory via DataManager
   const data = plugin.dataManager.getAll();
   // Zero I/O, zero parsing — tudo já está em memória
   ```
   Interface de saída `ConsolidatedData` / `UnifiedMarker[]` NÃO muda.

2. `src/analytics/data/` — dataConsolidator, statsEngine, clusterEngine, decisionTreeEngine, mcaEngine, mdsEngine, textExtractor
3. `src/analytics/views/analyticsView.ts` — 19 ViewModes
4. `src/analytics/board/` — Research Board (6 node types, Fabric.js)
5. **board.json path** (D19): atualizar para `.obsidian/plugins/qualia-coding/board.json`

### Lazy Loading — Multi-build esbuild (D12)

```
main.js              (~210KB) — core + markdown + PDF (eager)
engines/csv.js       (~2.0MB) — AG Grid + PapaParse
engines/image.js     (~466KB) — Fabric.js
engines/audio.js     (~216KB) — WaveSurfer
engines/video.js     (~216KB) — WaveSurfer
engines/analytics.js (~1.4MB) — Chart.js + Fabric + SVD
```

**Shell view pattern** — registra view sync no `onload()`, carrega pesado via `require()` no `onOpen()`:
```typescript
class CsvViewShell extends ItemView {
  async onOpen() {
    const { CsvView } = require("./engines/csv.js");
    this.inner = new CsvView(this.containerEl, this.plugin);
  }
}
```

**Target:** initial load <200KB (core + markdown + PDF + shells).

### Otimização opcional

Fabric.js aparece em Image + Analytics — pode virar `engines/fabric.js` compartilhado. WaveSurfer em Audio + Video — aceitar ~216KB duplicação ou compartilhar.

### Cleanup

1. Verificar que `qualia-coding` funciona 100% standalone
2. Desabilitar os 7 plugins antigos
3. Testar tudo com plugins antigos desabilitados
4. Deletar diretórios antigos:
   - `.obsidian/plugins/obsidian-codemarker-v2/`
   - `.obsidian/plugins/obsidian-codemarker-csv/`
   - `.obsidian/plugins/obsidian-codemarker-pdf/`
   - `.obsidian/plugins/obsidian-codemarker-image/`
   - `.obsidian/plugins/obsidian-codemarker-audio/`
   - `.obsidian/plugins/obsidian-codemarker-video/`
   - `.obsidian/plugins/obsidian-codemarker-analytics/`
5. Deletar `.obsidian/codemarker-shared/registry.json` (D7)

### Smoke Test Final

- [x] Analytics: 19 view modes renderizam com dados de todos os engines
- [x] Board: add chart snapshot, drag code card, save board.json
- [x] Initial load <200KB
- [x] CSV/Image/Audio/Video/Analytics carregam lazy no primeiro uso
- [x] Todos os 7 engines funcionais após lazy loading
- [x] Plugins antigos deletados, zero resíduo

### Done

- Plugin `qualia-coding` 100% funcional
- Bundle otimizado com lazy loading
- Zero duplicação de código
- Zero plugins antigos

---

## View Type IDs — Referência (D20)

| Engine | ID Antigo | ID Novo |
|--------|----------|---------|
| Markdown detail | `codemarker-detail` | `qualia-markdown-detail` |
| Markdown explorer | `codemarker-explorer` | `qualia-markdown-explorer` |
| CSV view | `codemarker-csv` | `qualia-csv-view` |
| CSV detail | `codemarker-detail` (conflito!) | `qualia-csv-detail` |
| CSV explorer | `codemarker-csv-explorer` | `qualia-csv-explorer` |
| PDF detail | `codemarker-pdf-detail` | `qualia-pdf-detail` |
| PDF explorer | `codemarker-pdf-explorer` | `qualia-pdf-explorer` |
| Image view | `image-coding-view` | `qualia-image-view` |
| Image detail | `codemarker-image-detail` | `qualia-image-detail` |
| Image explorer | `codemarker-image-explorer` | `qualia-image-explorer` |
| Audio view | `codemarker-audio-view` | `qualia-audio-view` |
| Audio detail | `codemarker-audio-detail` | `qualia-audio-detail` |
| Audio explorer | `codemarker-audio-explorer` | `qualia-audio-explorer` |
| Video view | `codemarker-video-view` | `qualia-video-view` |
| Video detail | `codemarker-video-detail` | `qualia-video-detail` |
| Video explorer | `codemarker-video-explorer` | `qualia-video-explorer` |
| Analytics | `codemarker-analytics` | `qualia-analytics` |
| Board | `codemarker-board` | `qualia-board` |

## Custom Events — Referência

| Evento Antigo | Evento Novo |
|--------------|-------------|
| `codemarker-csv:navigate` | `qualia-csv:navigate` |
| `codemarker-csv:model-changed` | `qualia-csv:model-changed` |
| `codemarker-image:navigate` | `qualia-image:navigate` |
| `codemarker-audio:seek` | `qualia-audio:seek` |
| `codemarker-video:seek` | `qualia-video:seek` |
| `codemarker-tooltip-mouseenter` | `qualia-tooltip-mouseenter` |
| `codemarker-tooltip-mouseleave` | `qualia-tooltip-mouseleave` |

---

## Código Compartilhado — Análise

| Componente | LOC total (6+ engines) | % Shared | Savings com base classes |
|-----------|----------------------|----------|------------------------|
| Detail views (3 modos) | 1,880 | 80% | ~1,165 LOC |
| Explorer views (tree) | 1,399 | 89% | ~994 LOC |
| CodeDefinitionRegistry | 780 (6×130) | 100% | 650 LOC |
| CodeFormModal | 410 (5×82) | 100% | 328 LOC |
| Coding menus | 1,974 (6 menus) | ~70% | ~1,382 LOC |
| SharedRegistry | 402 (6×67) | 100% | 402 LOC (eliminado) |
| **Total** | **~6,845** | | **~4,921 LOC eliminados** |

### O que cada engine implementa (engine-specific)

| Engine | Detail view | Explorer | Menu | Especificidades |
|--------|------------|----------|------|-----------------|
| Markdown | `formatMarkerLabel()`: "lines 5-12" | `navigateToSegment()`: CM6 scroll | CM6 tooltip lifecycle | StateField, ViewPlugins, margin panel CM6 |
| PDF | `formatMarkerLabel()`: "Page 3" | `navigateToSegment()`: page jump | `createPopover()` | SVG draw layer, "page push" panel |
| CSV | `formatMarkerLabel()`: "Row 5, Col B" | `navigateToSegment()`: `ensureIndexVisible` | tag button popover | AG Grid, segment editor CM6 |
| Image | `formatMarkerLabel()`: "Shape on image" | `navigateToSegment()`: `highlightRegion` | class-based popover | Fabric.js canvas |
| Audio | `formatMarkerLabel()`: "0:05 – 0:12" | `navigateToSegment()`: seek + play | `createPopover()` | WaveSurfer, regions, minimap |
| Video | = Audio | = Audio | = Audio | + `<video>` element |
| Analytics | read-only (sem markers) | N/A | N/A | 19 ViewModes, Board |

---

## Resumo — MERGE-PLAN vs APPROACH 2

| Aspecto | MERGE-PLAN | APPROACH 2 |
|---------|-----------|------------|
| Fases | 6 (Phase 0-5) | 10 camadas |
| Ordem de trabalho | Por engine sequencial | Por camada de interação cross-engine |
| `core/` | Phase 4 (nice-to-have) | Camada 2 (fundação) |
| Base classes | Phase 4.2-4.3 | Camada 2 (usadas desde camada 7) |
| Menu unificado | Phase 4.6 | Camada 4 (antes de CSV, Image, Audio, Video) |
| PDF chega | Phase 2.1 (completo de uma vez) | Camadas 3-7 (incrementalmente, junto com markdown) |
| CSV chega | Phase 2.2 (completo de uma vez) | Camada 8 (herda tudo refinado) |
| Duplicação temporária | Alta (cada engine tem cópias até Phase 4) | Baixa (core desde o início) |
| Risco | Copiar tudo → "refinar depois" (Phase 4 pode não acontecer) | Mais upfront design, mas compartilhamento é inevitável |
| LOC eliminados | ~4,921 (se Phase 4 for feita) | ~4,921 (garantido — é a estrutura) |
