# Qualia Coding — Technical Patterns & Lessons Learned

> Padrões técnicos difíceis de redescobrir, gotchas, e lições aprendidas trabalhando com CM6, Fabric.js, AG Grid, WaveSurfer, e Obsidian API. Referência para debugging e para evitar repetir erros.

---

## 1. CodeMirror 6 (CM6)

### 1.1 DOM Topology

```
view.dom                          ← outer container
  └── view.scrollDOM              ← scrollable area (overlay div lives here)
        └── view.contentDOM       ← .cm-content (actual text)
              └── .cm-line        ← one per visual line
                    └── spans     ← Decoration.mark() creates these
```

**Regra crítica**: `eventHandlers` do CM6 vivem **só no contentDOM**. Eventos no overlay (handles, margin panel) nunca chegam lá — precisam de listeners separados.

### 1.2 coordsAtPos vs lineBlockAt vs posAtCoords

| Função | Retorna | Cuidado |
|--------|---------|---------|
| `coordsAtPos(pos)` | Coordenadas visuais exatas da posição | **USE COMO PRIMÁRIO** — respeita word-wrap |
| `lineBlockAt(pos)` | Bloco lógico (parágrafo inteiro) | Retorna a linha lógica, NÃO a visual. Em linhas wrappadas, inclui todas as visual lines |
| `posAtCoords({x, y})` | Posição mais próxima do char | **Snapa para o char mais próximo** — hover triggers em espaço vazio de linhas wrappadas |

**Lesson**: Para posicionamento de highlights e barras, sempre preferir `coordsAtPos`. `lineBlockAt` como fallback para height de bloco.

### Heading CSS Measurements (Obsidian v1.11.7)

| Heading | fontSize | lineHeight | block height |
|---------|----------|------------|-------------|
| H1 | 25.9px | 31.1px | 47px |
| H2 | 23.4px | 28.1px | 44px |
| H3 | 21.1px | 27.4px | 43px |
| H4 | 19.0px | 26.6px | 43px |
| H5 | 17.2px | 25.8px | 42px |
| H6 | 16.0px | 24.0px | 40px |
| Text | 16.0px | 24.0px | 24px/line |

### 1.3 posToOffset — NÃO clampeia

`posToOffset(doc, {line, ch})`: Se `ch > comprimento real da linha`, o offset "sangra" para a próxima linha. Não há clamping automático.

**Fix**: Sempre clampar manualmente:
```typescript
const line = doc.line(lineNumber);
const clampedCh = Math.min(ch, line.length);
```

### 1.4 Hover Detection em Decorated Spans

**Problema**: CM6 quebra `Decoration.mark()` em sub-spans nos boundaries de formatação (headers, lists, bold). Mouse entre sub-spans momentaneamente retorna `null` para `.closest('.codemarker-highlight')`.

**Fix**: Debounce de 30ms no hover. Bridges gaps entre sub-spans.

**Problema 2**: `elementFromPoint()` sempre retorna `.cm-line` div, nunca o highlight span.

**Fix**: Usar `event.target.closest('.codemarker-highlight')` para hover detection em vez de `elementFromPoint`.

### 1.5 Heading CSS padding

Todos os headings H1-H6 têm `padding-top: 16px`. `lineBlockAt` inclui esse padding no height do bloco. Considerar ao posicionar barras do margin panel.

### 1.6 Decoration.widget() e Word-Wrap

`Decoration.widget()` insere elementos inline no texto → causa text reflow → quebra word-wrap em linhas longas.

**Decisão**: Handles renderizados em overlay div no `scrollDOM` em vez de widgets inline.

### 1.7 requestMeasure Deduplication

`requestMeasure` com mesmo `key` deduplica automaticamente. Usar para evitar múltiplas medições no mesmo frame.

### 1.8 Effects dentro de Tooltip.create()

**NUNCA** dispatchar CM6 effects dentro de `Tooltip.create()` — causa updates recursivos. Dispatchar antes (no controller) ou depois (`requestAnimationFrame`).

### 1.9 Batch Related Effects

Selection preview + tooltip open/close DEVEM acontecer na mesma transaction. Dispatchar em calls separadas causa flicker.

### 1.10 Smart Marker Layering

`classifyMarkersAtPos()` retorna:
- **Nested** (marker menor dentro de maior) → menor ganha, menu abre nele
- **Partial overlap** (markers cruzando boundaries) → todos recebem hover, menu suprimido

`setHoverEffect` payload inclui `hoveredIds?: string[]` para multi-marker hover. `isInPartialOverlap` flag previne dispatches redundantes.

### 1.11 syncDecorationsToModel()

Após `decorations.map(tr.changes)` ajustar posições (edição de texto move markers), as posições no model são sincronizadas via `cm6OffsetToPos()`. Previne "snap-back" quando `needsRebuild` reconstrói do model stale.

### 1.12 MutationObserver Self-Suppression

**Pattern**: `suppressMutationUntil = Date.now() + 50`

MutationObserver detecta mudanças DOM que CM6 não reporta (inline title toggle, theme switch). Mas operações internas (rebuild de decorations, hover classes) também disparam mutations.

Self-suppression: após operação interna, seta flag por 50ms. Observer ignora mutations durante esse período.

### 1.13 Selection Preview

CM6 perde a seleção visual quando foco vai para input (mesmo dentro do editor DOM). `setSelectionPreviewEffect` cria uma decoration temporária que simula a seleção.

### 1.14 Menu Recreation

`onRecreate()` batches `showCodingMenuEffect.of(null)` + `setSelectionPreviewEffect.of(null)`, depois re-dispatcha ambos após timeout de 50ms.

### 1.15 Modal ↔ Tooltip Flow

`CodeFormModal.onDismiss` dispara tanto em save quanto em cancel. Callers usam para reabrir o tooltip seamlessly — padrão de "parênteses".

### 1.16 Deferred Deletion

`keepIfEmpty` flag mantém marker vazio durante hover. Sem isso, toggle do último código deleta o marker → hover handler recebe null → instabilidade visual.

### 1.17 Handle Overlay Architecture
```
handleOverlay div on scrollDOM (sibling of contentDOM)
├── SVG handles positioned absolutely via coordsAtPos + requestMeasure
├── mousedown listener → drag initiation + document-level mouseup for drag end
└── mousemove listener → hover maintenance (30ms debounce)
```
`scheduleHandleOverlayRender()` uses `requestMeasure` for safe `coordsAtPos` reads. No `mousedown` in CM6 eventHandlers — drag is overlay-only.

### 1.18 Line Number Gutter Compatibility
`.cm-scroller` uses `display: flex`. With line numbers: panel uses `gutterEl.style.marginLeft` (pushes both gutter and content as flex siblings). Without line numbers: falls back to `contentDOM.paddingLeft`.

### 1.19 RLL Dynamic Labels
When `naturalLeft >= neededSpace`: `effectivePanelWidth = panelWidth + extraSpace` — all extra natural space goes to labels (no cap). Without RLL or narrow windows: `effectivePanelWidth = panelWidth` unchanged.

### 1.20 Dark Mode — Failed Approaches
Three approaches that FAILED before `applyThemeColors()`:
1. `color-scheme: inherit` on container → no effect
2. `.theme-dark` / `.theme-light` CSS selectors targeting tooltip → vars not available
3. `!important` on CSS variable references → vars resolve to empty

### 1.21 applyThemeColors Implementation
```typescript
function applyThemeColors(container: HTMLElement) {
  const s = getComputedStyle(document.body);
  container.style.backgroundColor = s.getPropertyValue('--background-secondary').trim();
  for (const v of vars) {
    container.style.setProperty(v, s.getPropertyValue(v).trim());
  }
}
```
Key insight: Obsidian's `ToggleComponent` uses `--toggle-*` variables internally — copying these onto container makes toggles render correctly in both themes.

---

## 2. Fabric.js 6.x

### 2.1 Constructor Flags (obrigatórios)

```typescript
new Canvas(el, {
  fireRightClick: true,     // sem isso, right-click não dispara events
  fireMiddleClick: true,    // sem isso, middle-click não dispara events
  stopContextMenu: true,    // bloqueia context menu nativo do browser
});
```

### 2.2 Groups — subTargetCheck e interactive

```typescript
const group = new Group([rect, text], {
  subTargetCheck: false,    // sem isso, target detection retorna sub-object em vez do group
  interactive: false,       // sem isso, sub-objects são selecionáveis individualmente
});
```

### 2.3 Hit-test após Pan/Zoom

Após `setViewportTransform()`, OBRIGATÓRIO atualizar coords de todos os objetos:

```typescript
canvas.setViewportTransform(newTransform);
canvas.forEachObject(o => o.setCoords());
```

Sem isso, hit-test usa coordenadas stale → cliques não acertam objetos.

### 2.4 Objetos sempre selectable + evented

```typescript
// CORRETO — controlar comportamento nos handlers
object.selectable = true;
object.evented = true;

// ERRADO — desabilitar causa objetos "mortos" que não recebem eventos
object.selectable = false;  // ❌
```

Tool behavior (select/draw) deve ser controlado nos event handlers, não nas propriedades dos objetos.

### 2.5 getScenePoint para coordenadas corretas

Ao criar objetos via click no canvas, usar `canvas.getScenePoint(event)` para coordenadas corretas considerando zoom/pan.

### 2.6 Arrows como Line + Triangle (não Group)

Arrows no Research Board são Line + Triangle **separados**, linkados por `boardId`. Groups causam problemas com redimensionamento e rotação de arrows.

### 2.7 ClusterFrames como Group(Rect+Textbox) com sendToBack

Cluster frames são Groups que contêm outros nodes. Devem ser `sendToBack()` para não cobrir nodes filhos. NÃO aninhar Groups dentro de Groups.

### 2.8 Polygon — calcTransformMatrix

Fabric.js armazena pontos de polígono relativos à origem da shape. Para obter coordenadas absolutas:

```typescript
const matrix = polygon.calcTransformMatrix();
const absolutePoints = polygon.points.map(p =>
  fabric.util.transformPoint(p, matrix)
);
```

Necessário antes de normalizar coordenadas (0-1).

### 2.9 Region Labels via getBoundingRect

Labels como `FabricText` posicionados usando `getBoundingRect()` → inverse viewport transform para converter screen-space → canvas coords.

### 2.10 Highlight Effect

Hover glow: `strokeWidth += 2`, `shadow = new Shadow({ blur: 12, color: strokeColor })`. Remover ao sair do hover.

### 2.11 Board Node Types
- Sticky: inline editing via double-click, color-selectable
- Snapshot: PNG dataUrl from Analytics chart
- Excerpt: text + source badge + file + location + code chips
- CodeCard: swatch + name + description + marker count + source badges
- KpiCard: big value + label + accent bar
- ClusterFrame: Group(Rect+Textbox), sendToBack, grid 2 columns

### 2.12 Board Persistence
`board.json` in vault, auto-save debounced 2s. Grid dots background.

### 2.13 Board File Architecture
boardCanvas.ts, boardNodes.ts (6 types), boardArrows.ts, boardDrawing.ts (freeform path), boardToolbar.ts, boardData.ts (serialize/deserialize), boardClusters.ts (Jaccard + hierarchical clustering)

---

## 3. AG Grid v33+

### 3.1 Module Registration (obrigatório)

```typescript
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule]);
```

Sem isso, grid renderiza vazio sem erro.

### 3.2 Cell Wrapper Width Chain

AG Grid wrappeia cells em 3 divs:
```
.ag-cell → .ag-cell-wrapper → .ag-cell-value
```

**Todos** precisam de `width: 100%` via CSS (usando `:has()` selector) para que content preencha a célula.

### 3.3 Header Row-Reverse

AG Grid usa `flex-direction: row-reverse` no header. Ordem DOM é inversa da visual.

**CORRETO**: `insertBefore(btn, labelDiv)` para posicionar botões custom
**ERRADO**: `style.order` — não funciona com row-reverse

### 3.4 MutationObserver para Re-injeção

AG Grid reconstrói DOM interno em vários cenários (sort, filter, resize). Custom DOM injetado no header/cells é destruído.

**Fix**: MutationObserver no header container, re-injeta quando filhos mudam.

### 3.5 Theming com CSS Variables do Obsidian

AG Grid v33+ aceita `var()` direto nos theme params. Reage automaticamente a mudanças de theme do Obsidian:

```typescript
themeQuartz.withParams({
  backgroundColor: 'var(--background-primary)',
  headerTextColor: 'var(--text-normal)', // NÃO headerForegroundColor
})
```

### 3.6 CSS-in-JS Auto-injection

AG Grid v33 injeta CSS automaticamente — não precisa de CSS loader no esbuild. Mas pode conflitar com styles manuais se não cuidar namespace.

### 3.7 Full AG Grid Theme Mapping
```typescript
themeQuartz.withParams({
  backgroundColor: 'var(--background-primary)',
  foregroundColor: 'var(--text-normal)',
  headerBackgroundColor: 'var(--background-secondary)',
  headerTextColor: 'var(--text-normal)',
  borderColor: 'var(--background-modifier-border)',
  rowHoverColor: 'var(--background-modifier-hover)',
  selectedRowBackgroundColor: 'var(--background-modifier-active-hover)',
  accentColor: 'var(--interactive-accent)',
  oddRowBackgroundColor: 'var(--background-secondary-alt)',
  fontFamily: 'var(--font-interface)',
  fontSize: 14,
})
```
Note: `headerForegroundColor` does NOT exist — use `headerTextColor`.
CSS overrides via `.ag-theme-quartz { --ag-background-color: ... }` do NOT work — AG Grid v33 injects inline styles with higher specificity.

### 3.8 contentEl Height para Grids Virtualizados

`FileView.contentEl` precisa de height explícita (e.g., `100%`) para que o grid virtualizado do AG Grid funcione. Sem height, o grid colapsa para 0px.

---

## 7. PDF Engine Internals

### 7.1 Margin Panel "Page Push" Architecture
```
containerEl (position: relative)
├── codemarker-pdf-label-overlay (absolute, overflow hidden)
│   └── codemarker-pdf-label-scroller (translateY(-scrollTop))
├── sidebarContainerEl
└── viewerContainerEl (margin-left: total → pages shrink)
```
Panels rendered in page divs then MOVED to overlay. Scroll sync via translateY(-scrollTop). Thumbnail sidebar compat via offsetLeft calculation.

### 7.2 Highlight Geometry Dual Path
Strategy A: chars-level via `item.chars` array (Obsidian PDF.js customization) — `computeHighlightRectForItemFromChars`
Strategy B: DOM Range fallback via `getBoundingClientRect()` → convert back to PDF coords — `computeHighlightRectForItemFromTextLayer`
Same-line merging: `areRectanglesMergeable()` (horizontal adjacency + vertical overlap threshold)

### 7.3 Coordinate Conversion (4 steps)
1. Read `pageView.pdfPage.view` (viewBox: `[x0, y0, x1, y1]`)
2. Mirror Y axis: `viewBox[3] - rect[y] + viewBox[1]`
3. Normalize to `[left, top, right, bottom]`
4. Express as CSS percentages relative to page dimensions

### 7.4 SVG Drawing Overlay
- `viewBox="0 0 100 100"` + coords as CSS percentages → scales with zoom
- Z-index 4 (between highlight layer 3 and annotation layer 5)
- Rect/Ellipse: drag-to-draw; Polygon: click-to-place, double-click to finish
- Keyboard: V (select), R (rect), E (ellipse), P (polygon), Del (delete)
- Data: `PdfShapeMarker` with `NormalizedShapeCoords` (rect/ellipse/polygon union)
- Storage: `shapes[]` array alongside `markers[]`

### 7.5 Highlight Interaction Model
- Hover → native Obsidian tooltip (`setTooltip`) showing code names
- Click → opens Code Detail sidebar
- Double-click → opens coding popover
- Highlight layer `pointer-events: none`, individual rects `pointer-events: auto`

### 7.6 View Instrumentation
- `active-leaf-change` detects PDF views (`getViewType() === 'pdf'`)
- `view.viewer.then(child => ...)` waits for PDFViewerChild
- `Map<PDFViewerChild, PdfPageObserver>` tracks observers
- `cleanupOrphanedObservers()` on `layout-change`

### 7.7 Lazy Page Rendering
- `textlayerrendered` event → render highlights for that page
- `pagerendered` event → re-render after zoom (100ms delay for text layer rebuild)
- `refreshAll()` only iterates pages with `data-loaded` attribute

### 7.8 PDF Undo Stack

O `PdfCodingModel` tem um **undo stack** limitado a 50 entries com 4 tipos de operação:
- `addCode` — código adicionado a marker
- `removeCode` — código removido de marker
- `resizeMarker` — bounds de marker ajustados
- `addShape` / `removeShape` — shape drawing

Flag `suppressUndo` previne registro durante operações programáticas (e.g., redo). Sem saber desse stack, modificar o PDF model pode causar memory leaks (stack unbounded) ou perda de undo.

### 7.9 PDF Page Navigation

```typescript
// Navigate to specific page:
app.workspace.openLinkText('', file.path, false, { eState: { subpath: '#page=3' } });
// or
leaf.openFile(file, { eState: { subpath: '#page=N' } });
```

### 7.10 PDF Data Schema
```typescript
PdfMarker { id, fileId, page, beginIndex, beginOffset, endIndex, endOffset, text, codes[], memo?, createdAt, updatedAt }
PdfShapeMarker { id, fileId, page, shape: 'rect'|'ellipse'|'polygon', coords: NormalizedShapeCoords, codes[], memo?, createdAt, updatedAt }
```

---

## 8. Audio/Video Engine Internals

### 8.1 Vertical Lanes Algorithm
Sort by start time, then duration descending. Greedy lane assignment: first lane where `laneEnd <= marker.from`. CSS `top: (laneIndex / totalLanes * 100)%`, `height: (1/totalLanes * 100)%`.

### 8.2 Audio File Intercept
```typescript
this.registerEvent(
  this.app.workspace.on('active-leaf-change', (leaf) => {
    if (!leaf) return;
    if (leaf.view.getViewType() === AUDIO_VIEW_TYPE) return;
    const file = (leaf.view as any)?.file as TFile | undefined;
    if (!file || !(file instanceof TFile)) return;
    if (!AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return;
    leaf.setViewState({ type: AUDIO_VIEW_TYPE, state: { file: file.path } });
  })
);
```

### 8.3 Region Events
- `region-created` → open coding popover
- `region-update-end` → persist new bounds
- `region-double-clicked` → play segment
- `region-mouseenter/leave` → bidirectional hover

### 8.4 Audio View Layout (top to bottom)
Minimap → Waveform → Timeline ruler → Transport (play/pause, time, spacer, volume, speed [0.5/0.75/1/1.25/1.5/2x], zoom slider)

### 8.5 Zoom/Scroll Persistence
`settings.fileStates[path] = { zoom, lastPosition }`. Save on unload, restore on re-open.

### 8.6 Supported Formats
Audio: `.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`, `.aac`
Video: `.mp4`, `.webm`, `.ogv`

### 8.7 AudioMarker Data Contract
NEVER break `{from, to}` in seconds (float). Analytics reads `data.json` directly.

Marker lookup usa `TOLERANCE = 0.01` para comparação float: `Math.abs(marker.from - from) < 0.01 && Math.abs(marker.to - to) < 0.01`. Sem tolerance, floating point imprecision causa markers "não encontrados" ao reabrir popover.

### 8.8 Audio Settings Slider Ranges

| Setting | Range | Step | Default |
|---------|-------|------|---------|
| Default Zoom | 10-200 px/sec | 5 | 50 |
| Region Opacity | 0-1 | 0.05 | 0.4 (video) / 0.15 (audio) |
| Show Labels | toggle | — | true |

Color alpha dynamic: `regionOpacity` da settings aplicado como canal alpha hex na cor da region.

### 8.9 Analytics Event Bridge
```typescript
// Navigate from Analytics → Audio/Video
workspace.trigger('codemarker-audio:seek', { file: string, seekTo: number });
workspace.trigger('codemarker-video:seek', { file: string, seekTo: number });
```

---

## 9. esbuild & Build

### 9.1 esbuild Config
```javascript
external: ["obsidian", "electron", ...builtinModules]
// Do NOT externalize bundled libs (ag-grid, chart.js, fabric, etc.)
format: "cjs"
platform: "node"
// package.json needs "type": "module" for top-level await in .mjs config
```

### 9.2 PapaParse Import
```typescript
import * as Papa from "papaparse"  // NOT default export
Papa.parse(raw, { header: true, skipEmptyLines: true })
// Returns { data: Record<string, string>[], meta: { fields: string[] }, errors: [] }
```

### 9.3 FileView Pattern
```typescript
// plugin onload:
this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf));
this.registerExtensions(["csv"], VIEW_TYPE);

// view.ts:
class MyView extends FileView {
  async onLoadFile(file: TFile) { /* load content */ }
  async onUnloadFile() { /* cleanup */ }
  getViewType() { return VIEW_TYPE; }
  canAcceptExtension(ext: string) { return ext === 'csv'; }
}
// contentEl needs explicit height: wrapper.style.height = "calc(100% - 40px)"
```

---

## 4. WaveSurfer.js v7

### 4.1 Shadow DOM Constraint

WaveSurfer renderiza dentro de shadow DOM. Timeline e Minimap plugins ficam **invisíveis** se renderizados dentro do shadow DOM.

**Fix**: Prover `container` elements **fora** do shadow DOM para cada plugin.

### 4.2 Destruction antes do Leaf Close

WaveSurfer DEVE ser destroyed antes do leaf fechar. Dangling audio contexts causam memory leaks e podem bloquear reprodução em aberturas subsequentes.

### 4.3 Dark Mode

WaveSurfer não herda CSS variables do Obsidian.

**Fix**: `applyThemeColors()` lê computed styles de `document.body` no init. Listener em `css-change` event para reapliar via `ws.setOptions()`.

### 4.4 ResizeObserver com try-catch

Zoom reflow debounced 100ms, mas áudio pode não estar loaded ainda. try-catch obrigatório no callback do ResizeObserver.

### 4.5 Inicialização

WaveSurfer deve ser inicializado **só depois** que o container DOM está mounted — não no constructor da view.

### 4.6 notify() vs notifyChange()

- `notify()` — schedula save + dispara listeners
- `notifyChange()` — só dispara listeners (para quando save é gerenciado separadamente, e.g., settings tab)

### 4.7 Memo Textarea Pause

Textarea de memo pausa o change listener: `offChange()` no focus, `onChange()` no blur. Previne re-render enquanto usuário digita.

---

## 5. Obsidian API

### 5.1 CSS Variables não Cascatam

CSS vars do Obsidian (`--background-primary`, `--text-normal`, etc.) NÃO cascatam para:
- CM6 tooltips (DOM apartado)
- WaveSurfer (shadow DOM)
- Fabric.js canvas (não é DOM)
- AG Grid popovers

**Fix universal**: `applyThemeColors()` + listener em `css-change`.

### 5.2 revealLeaf — Nunca em Updates Automáticos

`revealLeaf()` rouba foco → CM6 remove `cm-focused` → MutationObserver dispara → render loop → DOM destroyed.

**Regra**: `revealLeaf()` só em ações explícitas do usuário. Para updates automáticos de sidebar, usar `setContext()` direto.

### 5.3 Stacked Label Click Bug (Root Cause)

Cascata de 5 passos:
1. `revealLeaf()` rouba foco do editor
2. CM6 remove class `cm-focused`
3. MutationObserver detecta mudança DOM (após self-suppression expirar)
4. `renderBrackets()` entra em loop — reconstrói DOM a cada frame
5. Labels são destruídos e recriados → click events falham

**Fix de 3 camadas**:
1. Self-suppression (`suppressMutationUntil`)
2. Fallback para hover state no click (defesa contra DOM rebuilds)
3. Remover `revealLeaf()` em leaves já existentes

### 5.4 Native Components como DOM Elements

`TextComponent`, `ToggleComponent`, `ButtonComponent` são simples DOM elements. Podem ser criados dentro de qualquer container (CM6 tooltip, modal, sidebar, AG Grid cell).

```typescript
const toggle = new ToggleComponent(container);
// Para acessar DOM element:
(toggle as any).toggleEl  // ou (item as any).dom
```

**Caveat**: `(item as any).dom` é hack que pode quebrar em updates do Obsidian.

### 5.5 FuzzySuggestModal

Modal com busca fuzzy — ideal para "Add Existing Code":
```typescript
class CodeSuggestModal extends FuzzySuggestModal<CodeDefinition> {
  getItems() { return this.registry.getAllCodes(); }
  getItemText(code: CodeDefinition) { return code.name; }
  onChooseItem(code: CodeDefinition) { /* toggle code */ }
}
```

### 5.6 registerExtensions Conflicts

`registerExtensions(['mp3', 'wav', ...])` conflita com o handler nativo de áudio do Obsidian. Plugin falha ao carregar.

**Fix**: Usar `active-leaf-change` interceptor para substituir a view.

### 5.7 WeakSet para Double-Instrumentation

`WeakSet<PDFViewerChild>` garante que cada PDF viewer é instrumentado só uma vez. `mouseup` listener checa `child.unloaded` e faz self-remove para evitar memory leaks.

### 5.8 PDF DOM Hierarchy

```
containerEl
  ├── contentEl
  │     ├── outlineViewEl
  │     ├── pdfContainerEl
  │     │     └── sidebarContainerEl
  │     │           └── thumbnailViewEl
  │     └── viewerContainerEl
  │           └── viewerEl
  │                 └── .page[data-page-number]
  │                       ├── .canvasWrapper > canvas
  │                       ├── .textLayer > span[role="presentation"]
  │                       └── .annotationLayer
```

Crítico para debugging de renderização PDF.

### 5.9 DOM Helpers
- `createEl(tag, { cls, text, attr })` — create element
- `createDiv({ cls, text })`, `createSpan()`, `createFragment()`
- `setIcon(el, iconName)` — Lucide icon
- `el.empty()` — clear children
- `el.addClass()` / `el.removeClass()`
- `DomElementInfo` interface for type-safe creation

### 5.10 Layout Shifts sem CM6 Events

Inline title toggle e theme switches não disparam CM6 resize/viewport events. MutationObserver é necessário para detectar essas mudanças.

---

## 6. Patterns Gerais

### 6.1 Phantom Marker Prevention

Dois métodos internos em cada engine model (NÃO fazem parte de SidebarModelInterface):
- `findExistingMarker()` — read-only, para hover/display
- `findOrCreateMarker()` — cria sob demanda, só no primeiro code toggle

### 6.2 Debounced Save (3 níveis)

1. **DataManager**: 500ms debounce (todos os engines)
2. **Markdown Model**: 2s debounce adicional via `markDirtyForSave()` (específico do markdown)
3. **MediaCodingModel** (Audio/Video): 500ms debounce via `scheduleSave()` (base genérica compartilhada)

Ambos fazem `flushPendingSave()` no `onunload()`.

### 6.3 Cross-Page Selection (PDF)

Seleções que cruzam páginas no PDF são divididas em múltiplos `PdfSelectionResult` (um por página) e o popover suporta markers cross-page. A implementação anterior bloqueava essas seleções, mas o comportamento atual permite codificação cross-page com split automático.

### 6.4 Synthetic Data em Testes

Valores hardcoded de `ch` em test data podem criar falsos positivos se `ch > comprimento real da linha`. Sempre validar contra o documento real.

### 6.5 Baselines de Visual Testing

Baselines são resolution-dependent. Mudança de vault content, appearance, ou máquina invalida todos os baselines.

### 6.6 CSV Standalone Editor Registry — Lifecycle Completo

O CSV segment editor usa um registry bidirecional para CM6 editors standalone:

```typescript
// Registry
WeakMap<EditorView, fileId>  // editor → virtual file
Map<fileId, EditorView>      // virtual file → editor

// Virtual fileId format (nunca colide com paths reais):
`csv:${filePath}:${row}:${column}`
```

**Lifecycle**:
1. **Open cell**: `registerStandaloneEditor(editorView, virtualFileId)`
2. **Convert**: `SegmentMarker` (row/column/from/to offsets) → `Marker` (line/ch) via `addMarkerDirect()`
3. **Edit**: User edits with full CM6 extensions (highlights, hover, menu)
4. **Close cell**: Sync back: `CodeMarkerModel` decorations → `CsvCodingModel` via `deleteSegmentMarkersForCell()` + re-create from model
5. **Cleanup**: `unregisterStandaloneEditor(editorView)`

Sem entender esse sync bidirecional, editar o CSV engine pode causar perda de dados de markers.

### 6.7 Registry Migration — 3 Formatos Legacy

O `DataManager.migrateRegistries()` suporta 3 formatos de registry antigos:

| Formato | Key path | Engines |
|---------|----------|---------|
| v2 flat | `data.markdown.codeDefinitions` + `data.markdown.nextPaletteIndex` | Markdown |
| Nested `registry` | `data.<engine>.registry.definitions` + `.nextPaletteIndex` | CSV, Image, PDF |
| Nested `codeDefinitions` | `data.<engine>.codeDefinitions` | Audio, Video |

Adicionalmente: campo legacy `codeDescriptions` (D22) é extraído e migrado para `registry.definitions[name].description`.

Merge rule: por `updatedAt` — mais recente ganha. `nextPaletteIndex = max(all sources)`.

### 6.8 `menuMode` Setting

Setting no model que controla qual Menu Approach está ativo:

| Value | Approach | File |
|-------|----------|------|
| `obsidian-native` | A | `obsidianMenu.ts` |
| `cm6-tooltip` | B | `cm6TooltipMenu.ts` |
| `cm6-native-tooltip` | C (default) | `cm6NativeTooltipMenu.ts` |

Remover ou quebrar este setting travaria usuários em um approach só.

### 6.9 DataManager `flush()` — Re-entrant Save

```
flush():
  if saving → dirtyAfterSave = true; return
  saving = true
  await plugin.saveData(cache)
  saving = false
  if dirtyAfterSave → dirtyAfterSave = false; flush()
```

Se `markDirty()` dispara durante um save ativo, defere em vez de dropar. Sem esse pattern, saves concorrentes causam data loss.

### 6.10 File Rename Tracking

Todos os engines agora suportam rename via `fileInterceptor.ts` centralizado + `model.migrateFilePath()`:

| Engine | File rename support | Method |
|--------|-------------------|--------|
| Markdown | ✅ | `model.migrateFilePath()` via fileInterceptor |
| PDF | ✅ | `model.migrateFilePath()` via fileInterceptor |
| Audio | ✅ | `model.migrateFilePath()` via fileInterceptor |
| Video | ✅ | `model.migrateFilePath()` via fileInterceptor |
| CSV | ✅ | `model.migrateFilePath()` via fileInterceptor |
| Image | ✅ | `model.migrateFilePath()` via fileInterceptor |

### 6.11 Timing Inventory (Valores Consolidados)

| Timer | Value | Where |
|-------|-------|-------|
| Hover open delay | 350ms | `hoverMenuExtension.ts` |
| Hover close delay | 200ms | `hoverMenuExtension.ts` |
| Sub-span hover debounce | 30ms | `markerViewPlugin.ts` |
| Menu recreation timeout | 50ms | `onRecreate()` |
| MutationObserver self-suppression | 50ms | `marginPanelExtension.ts` |
| DataManager save debounce | 500ms | `dataManager.ts` |
| MediaCodingModel save debounce | 500ms | `mediaCodingModel.ts` |
| Markdown model save debounce | 2000ms | `codeMarkerModel.ts` |
| ResizeObserver zoom debounce | 100ms | WaveSurfer views |
| Board auto-save debounce | 2000ms | `boardSerializer.ts` |

### 6.12 Image Engine — Gotchas Específicos

- **Keyboard shortcuts no `window`**: Image registra V/R/E/F/Del no `window`, não na view. Pode conflitar com outros plugins ou com shortcuts globais do Obsidian.
- **Sem file rename tracking**: Renomear imagem no vault orphana todos os markers. `CSV` tem o mesmo problema.
- **Sem memo field**: Diferente de Audio/Video, Image markers não têm `memo`.
- **ResizeObserver ≠ fitToContainer**: O observer só redimensiona o canvas, NÃO re-fita a imagem. Fit é manual.

### 6.13 Analytics `TextExtractor`

Analytics tem uma classe `TextExtractor` que:
- Cache de file reads para evitar I/O repetido
- Suporta extração sub-line (`fromCh`/`toCh`) para markdown markers
- Inclui CSV parser próprio (~40 LOC) separado do PapaParse — lê cells de CSV sem AG Grid

### 6.14 CSS Concatenation Order

Ordem de concat no merge (v2 wins em conflitos de especificidade):
```
v2 > PDF > CSV > Image > Audio > Video > Analytics
```

Divergência conhecida: `.codemarker-code-form .cm-form-actions` — v2 usa `padding-top: 16px` + `margin-top: 8px`, outros engines usavam `margin-top: 16px`. v2 como canônico.

### 6.15 Architectural Patterns (Refactor)

Padrões estabelecidos durante o refactor de unificação:

- **BaseSidebarAdapter**: Classe base (`baseSidebarAdapter.ts`) da qual todos os sidebar adapters herdam. Concentra listener wrapping, hover state, `deleteCode()` e `updateMarkerFields()` com hook `notifyAfterFieldUpdate()`. PDF override para dual text/shape. CSV override hook para `notifyAndSave()`. Adapters específicos (PDF, CSV, Image, Media) estendem.
- **MediaCodingModel**: Base genérica (`mediaCodingModel.ts`) compartilhada entre Audio e Video. Gerencia markers, save debounce (500ms via `scheduleSave()`), e change listeners. `AudioCodingModel` e `VideoCodingModel` estendem.
- **Module augmentation**: Typings adicionais via declaration files — `obsidian-internals.d.ts` (workspace events, internal APIs) e `fabricExtensions.d.ts` (propriedades custom em FabricObject para board nodes).

----

## 7. Codebook Evolution Patterns

### 7.1 Collapsible Popover Sections (Memo/Magnitude/Relations)

Pattern for adding a collapsible section to the shared coding popover:

1. Create `renderXxxSection()` in `baseCodingMenu.ts` returning a handle `{ wrapper, separator, updateVisibility(), refresh() }`
2. Section follows memo pattern: chevron header + hidden body, auto-expand if data exists
3. Wire in `codingPopover.ts` after memo section — call `updateVisibility()` and `refresh()` in `onToggle`
4. Add optional adapter methods (`getXxxForCode?`, `setXxxForCode?`) — optional to preserve backward compat
5. Settings toggle controls visibility: `showXxxInPopover` in `GeneralSettings`

**Key gotcha**: `activeCodes` in the popover are code **names**, but adapter methods use **codeIds**. Map via `registry.getByName(name)?.id` when calling magnitude/relations methods.

### 7.2 Type-Specific Config UIs

Magnitude config (Level 2 code detail) renders different editors per type:
- **Nominal**: Unordered chips with "Add category..." input
- **Ordinal**: Numbered chips (1. 2. 3.) with "Add level..." input, order = array index
- **Continuous**: Quick-fill (min/max/step → Generate button) + individual add. Safety cap at 100 values.

Changing type clears existing values (prevents type/value mismatch).

### 7.3 Relations — Dual-Level with Shared UI

Relations exist at two levels:
- **Code-level** (`CodeDefinition.relations`): theoretical declarations
- **Segment-level** (`CodeApplication.relations`): data-anchored interpretations

Both use `{ label: string; target: string; directed: boolean }`. `target` is a codeId. Label is free text with autocomplete from all labels used project-wide (`collectAllLabels()` in `relationHelpers.ts`).

`renderAddRelationRow()` in `relationUI.ts` is shared across popover, code detail, and marker detail to avoid duplication.
- **Discriminated union para board nodes**: `boardTypes.ts` define cada tipo de node (Sticky, Snapshot, Excerpt, CodeCard, KpiCard, ClusterFrame, Arrow) como interface com `boardType` discriminant. Type guards (`isStickyNode()`, `isExcerptNode()`, etc.) para narrowing seguro.
- **CodeDefinitionRegistry auto-persistence**: `onMutate` callback no registry — qualquer mutação (add, remove, update de code definition) dispara save automaticamente via DataManager, sem chamada manual.
- **Shared type guards**: `markerResolvers.ts` exporta type guards (`isPdfMarker()`, `isImageMarker()`, `isCsvMarker()`, `isAudioMarker()`, `isVideoMarker()`) usando discriminante `markerType` em `BaseMarker`. Narrowing seguro sem duck typing.

---

## 8. Hierarchy & Tree Patterns

### 8.1 Cycle Detection in setParent

Walk up from proposed parent — if we reach the code being moved, it's a cycle. O(depth) per call.

```typescript
let cursor = parentId;
while (cursor) {
  if (cursor === id) return false; // cycle!
  cursor = registry.getById(cursor)?.parentId;
}
```

### 8.2 Virtual Scroll for Trees

`codebookTreeRenderer.ts` uses fixed ROW_HEIGHT (30px) + absolute positioning.
- `buildFlatTree()` flattens hierarchy respecting expand state
- Only rows in viewport + BUFFER_ROWS are rendered as DOM nodes
- Scroll listener recalculates visible range via `scrollTop / ROW_HEIGHT`
- Avoids DOM bloat with 1000+ codes

### 8.3 Drag-Drop Zone Detection

Each row has 3 drop zones based on cursor Y position:
- Top 30% → insert as sibling BEFORE (same parent)
- Middle 40% → make child OF target
- Bottom 30% → insert as sibling AFTER

`getDropZone()` converts `(clientY - rect.top) / rect.height` to zone.

### 8.4 rootOrder for Manual Root Ordering

Root codes are ordered by `registry.rootOrder: string[]` (not alphabetically).
`setParent(id, parentId, insertBefore?)` inserts at position via `_insertInList()`.
Children already have manual ordering via `childrenOrder`.

### 8.5 Count Aggregation (buildCountIndex)

Post-order DFS: visit children first, then parent.
`aggregate = direct + sum(children.aggregate)`.
Single pass O(markers + codes). Deduplicates codeIds per marker with `Set`.

---

## Fontes

Este documento consolida:
- `memory/obsidian-plugins.md` — aprendizados de AG Grid, CM6, esbuild, PapaParse
---

## Obsidian View Inheritance — Composition over Inheritance

### Gotcha: ItemView heranca intermediaria nao funciona

**Problema:** Tentar `AudioView extends MediaView extends ItemView` (heranca de 3 niveis) faz com que o Obsidian nao carregue a view corretamente — aparece o player padrao em vez da view customizada. Build e tsc passam, mas no runtime a view nao registra.

**Causa provavel:** O Obsidian espera que views herdem diretamente de `ItemView`. Heranca intermediaria pode confundir o sistema de registro de views ou o esbuild pode otimizar a cadeia de forma inesperada.

**Solucao:** Usar composicao em vez de heranca. A view herda direto de `ItemView` e delega logica compartilhada pra uma classe helper (sem heranca):

```typescript
// ERRADO — nao funciona no Obsidian
class MediaView extends ItemView { /* logica compartilhada */ }
class AudioView extends MediaView { /* config */ }

// CERTO — funciona
class MediaViewCore { /* logica compartilhada, SEM heranca */ }
class AudioView extends ItemView {
  private core = new MediaViewCore(this.app, plugin, model, config);
  // delegates: setState → core.loadMedia(), onClose → core.cleanup()
}
```

**Resultado:** AudioView (387 → 53 LOC), VideoView (393 → 54 LOC), MediaViewCore (357 LOC). ~287 LOC eliminadas.

**Regra:** Em plugins Obsidian, NUNCA usar heranca intermediaria de ItemView/FileView. Usar composicao pra compartilhar logica entre views.

---

## 6. REFI-QDA XML Export

### 6.1 XML Building sem DOM

O módulo `xmlBuilder.ts` constrói XML via concatenação de strings — sem DOMParser, sem DOM. Isso evita dependências de ambiente (jsdom vs browser) e é mais rápido para geração bulk.

Pattern: `xmlEl(tag, attrs, children?, isXml?)` — `isXml=true` para filhos XML (newlines), `false` (default) para texto escapado.

### 6.2 Unicode Codepoint Offsets

REFI-QDA `startPosition`/`endPosition` contam **Unicode codepoints**, não UTF-16 code units. CM6 `ch` é em code units (surrogate pairs contam 2).

`lineChToOffset()` resolve isso iterando codepoints via `for..of` (que itera por codepoint) e contando code units via `charCodeAt` para detectar surrogate pairs.

### 6.3 PDF Coordinate Flip

PDF usa origem bottom-left, REFI-QDA `PDFSelection` também. Conversão de coordenadas normalizadas (top-left, 0-1):
- `firstY = (1 - y) * pageHeight` — topo do rect em coords bottom-left
- `secondY = (1 - y - h) * pageHeight` — base do rect

Ellipses e polígonos são convertidos para bounding box antes da transformação.

### 6.4 fflate Realm Mismatch (jsdom)

Em ambiente jsdom (Vitest), `fflate` instancia `Uint8Array` no realm do Node.js, mas `zipSync` espera o `Uint8Array` do jsdom. Cross-realm `instanceof` falha silenciosamente — fflate trata os dados como diretórios vazios.

Fix: `new Uint8Array(buf)` re-cria no realm correto antes de passar para `zipSync`.

### 6.5 GUID Correlation Pattern

Source builders geram `srcGuid = uuidV4()` e armazenam em `guidMap.set('source:' + filePath, srcGuid)`. O orchestrator usa esse mesmo GUID para nomear o entry no ZIP (`sources/{guid}.{ext}`). Sem isso, XML referencia um GUID e o ZIP contém outro.

---

## 10. Codebook Panel — Hierarchy & Folders

### 10.1 Discriminated Union para FlatTreeNode

`hierarchyHelpers.ts` usa union discriminada `FlatCodeNode | FlatFolderNode` (campo `type: 'code' | 'folder'`). O renderer (`codebookTreeRenderer.ts`) despacha por tipo:

```typescript
if (node.type === 'folder') return renderFolderRow(node, ...);
return renderCodeRow(node, ...);
```

**Gotcha**: FlatCodeNode tem `.def` (CodeDefinition), FlatFolderNode tem `.folderId` + `.name`. Acessar `.def` sem type guard causa erro de tipo.

### 10.2 Folder expanded state com prefixo

`baseCodeDetailView.ts` mantem dois Sets separados: `treeExpanded` (code IDs) e `folderExpanded` (folder IDs). O `getTreeState()` unifica num unico Set com prefixo `folder:` para folders:

```typescript
for (const fId of this.folderExpanded) merged.add(`folder:${fId}`);
```

`buildFlatTree` espera `folder:{id}` no Set `expanded` para expandir pastas.

### 10.3 Contagem hierarquica (buildCountIndex)

`buildCountIndex` usa DFS post-order: cada no agrega counts dos filhos. O resultado `CountIndex = Map<codeId, { direct, aggregate }>` alimenta o badge na tree:
- **Expandido**: mostra `direct` (so deste codigo)
- **Colapsado**: mostra `aggregate` (este + todos os descendentes)
- **Pastas**: mostram `codeCount` (total de codigos na pasta, nao markers)

### 10.4 Drag-to-root limpa folder

Quando um codigo e arrastado pro root (promote to top-level), o callback `onReparent(id, undefined)` tambem chama `setCodeFolder(id, undefined)`. Isso garante que o codigo saia da pasta ao ser promovido.

---

## References

- `memory/visual-testing.md` — CM6 rendering lessons, visual testing traps
- `docs/markdown/DEVELOPMENT.md` — dark mode breakthrough, bug fixes
- `docs/pdf/CLAUDE.md` — PDF coordinate system, DOM hierarchy
- `docs/audio/CLAUDE.md` — WaveSurfer lifecycle, shadow DOM
- `memory/board-roadmap.md` — Fabric.js v6 lessons
- `docs/markdown/CLAUDE.md` — CM6 patterns
- Bugs documentados em `docs/markdown/WORKLOG.md`
