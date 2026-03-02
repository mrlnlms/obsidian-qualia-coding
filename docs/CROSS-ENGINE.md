# Cross-Engine Analysis

Análise lado a lado dos 7 plugins. O que é compartilhado, o que diverge, qual versão é canônica.

---

## 1. Coding Menus — CONSOLIDADO ✅

Todos os 5 engines agora usam `core/codingPopover.ts` → `openCodingPopover(adapter, options)`.

### Estado atual

| Engine | Arquivo | LOC | Via |
|--------|---------|-----|-----|
| Markdown | `cm6NativeTooltipMenu.ts` | ~350 | CM6 tooltip builder → `openCodingPopover()` |
| PDF | `pdfCodingMenu.ts` | ~100 | `openPdfCodingPopover()` wrapper |
| CSV | `codingMenu.ts` | ~170 | `openCsvCodingPopover()` + `openBatchCodingPopover()` |
| Image | `codingMenu.ts` | ~100 | `openImageCodingPopover()` wrapper |
| Audio | `audioCodingMenu.ts` | ~100 | `openAudioCodingPopover()` wrapper |
| Video | `videoCodingMenu.ts` | ~100 | `openVideoCodingPopover()` wrapper |

### Interface compartilhada (`core/codingPopover.ts`)

```typescript
interface CodingPopoverAdapter {
  registry: CodeDefinitionRegistry;
  getActiveCodes(): string[];
  addCode(name: string): void;
  removeCode(name: string): void;
  getMemo(): string;
  setMemo(value: string): void;
  save(): void;
  onRefresh?(): void;
  onNavClick?(codeName: string, isActive: boolean): void;
}

interface CodingPopoverOptions {
  pos: { x: number; y: number };
  app: App;
  isHoverMode: boolean;
  className: string;          // sempre 'codemarker-popover'
  onClose(): void;
  onRebuild(): void;
  deleteAction?: { label: string; icon: string; onDelete(): void };
}
```

### Redução de LOC

| Antes | Depois | Savings |
|-------|--------|---------|
| ~2,080 LOC (6 menus independentes) | ~920 LOC (core + 6 wrappers) | ~56% |

---

## 2. Sidebar Views

12 views (6 detail + 6 explorer), ~3,750 LOC total.

### LOC por engine

| Engine | Detail | Explorer |
|--------|--------|---------|
| v2 (Markdown) | 316 | 274 |
| PDF | **397** (mais completo) | 312 |
| CSV | 294 | 253 |
| Image | 294 | 243 |
| Audio | 369 | 312 |
| Video | 369 | 312 |

### Detail View — 3 modos (todos os 6)

| Modo | Método | Trigger |
|------|--------|---------|
| Lista | `showList()` → `renderList()` | Default, back button |
| Code-focused | `showCodeDetail(codeName)` → `renderCodeDetail()` | Click no código |
| Marker-focused | `setContext(markerId, codeName)` → `renderMarkerDetail()` | Click no marker, margin label |

### Detail — O que é idêntico

- Classe `extends ItemView`, `getIcon() = 'tag'`
- `showList()` / `showCodeDetail()` / `setContext()` — estrutura idêntica nos 6
- `renderBackButton()` — DOM verbatim
- `renderList()` — header + loop registry com swatch + name + desc + count
- `countSegmentsPerCode()` — algoritmo idêntico
- Other codes chips — filter + render com `borderColor`/`color`
- CSS classes: `codemarker-detail-*`

### Detail — O que diverge

| Feature | v2 | PDF | CSV | Image | Audio/Video |
|---------|:--:|:---:|:---:|:-----:|:-----------:|
| `changeListener` | **Não** (bug) | Sim | Sim | Sim | Sim |
| `hoverListener` | Não | **Sim** | Não | Não | **Sim** |
| Hover on items | Não | **Sim** | Não | Não | **Sim** |
| Dual marker types | Não | **Sim** (text+shape) | Não | Não | Não |
| Memo section | Não | Não | Não | Não | **Sim** |
| Search filter | Não | Não | Não | Não | **Sim** |
| Time range display | Não | Não | Não | Não | **Sim** |
| "Navigate" button | Não | Não | Não | **Sim** | Não |
| Location label | `Line N` | `Page N` | `Row R, Col C` | Shape type | `formatTime()` |
| Navigation | CM6 scroll | `openFile(#page=N)` | `csv:navigate` event | `image:navigate` event | `openAndSeek()` |
| Group by file | Não | Não | Não | **Sim** | Não |

### Explorer — 3 níveis (todos os 6)

| Nível | Conteúdo |
|-------|----------|
| Code | nome + swatch + count. Collapsible. |
| File | filename + count. Collapsible. |
| Segment | preview/label. Click → navega. |

### Explorer — O que é idêntico

- `CollapsibleNode { treeItem, children, collapsed }` — definido em todos os 6
- `codeNodes[]` / `fileNodes[]` — dois arrays separados
- `toggleNode()`, `expandAll()`/`collapseAll()`, `expandFiles()`/`collapseFiles()`
- `buildCodeIndex()` → `Map<codeName, Map<fileId, Marker[]>>`
- Toolbar: collapse-all + collapse-files + refresh
- Footer: `N codes . M segments`
- DOM: `tree-item` → `tree-item-self` + `tree-item-children`

### Explorer — O que diverge

| Feature | v2 | PDF | CSV | Image | Audio/Video |
|---------|:--:|:---:|:---:|:-----:|:-----------:|
| `changeListener` | **Não** | Sim | Sim | Sim | Sim |
| `hoverListener` | Não | **Sim** | Não | Não | **Sim** |
| Search filter | Não | Não | Não | Não | **Sim** |
| Keyboard nav | Não | Não | Não | Não | **Sim** |
| CSS classes | Obsidian native | Obsidian | Obsidian | **Custom** (outlier) | Obsidian |
| Chevron style | `right-triangle` + `is-collapsed` | idem | idem | **Custom** (`chevron-down/right`) | idem |
| Alphabetical sort | Não | Não | Não | **Sim** | Não |

### Versão mais completa

- **Detail**: PDF (397 LOC) — dual markers, hover, extracted helper
- **Explorer**: Audio/Video (312 LOC) — search, keyboard nav, hover, accessibility

### Para base classes — métodos abstratos

**`BaseCodeDetailView<TMarker>`:**
```
abstract getViewType(): string
abstract getDisplayText(): string
abstract getAllMarkers(): TMarker[]
abstract findMarkerById(id): TMarker | undefined
abstract getMarkerPreview(marker): string
abstract getMarkerFileId(marker): string
abstract getMarkerCodes(marker): string[]
abstract shortenPath(fileId): string
abstract navigateToMarker(marker): void
optional renderMarkerContentSection(container, marker): void   // time range, shape info
optional renderMemoSection(container, marker): void            // audio/video
optional renderSearchInput(container): void                    // audio/video
```

**`BaseCodeExplorerView<TMarker>`:**
```
abstract getViewType(): string
abstract getDisplayText(): string
abstract getIcon(): string
abstract buildCodeIndex(): Map<string, Map<string, TMarker[]>>
abstract getMarkerPreview(marker): string
abstract shortenPath(fileId): string
abstract navigateToMarker(marker): void
optional renderSearchInput(toolbar): void                      // audio/video
```

### Estado atual — CONSOLIDADO ✅

Sidebar unificada: `UnifiedCodeExplorerView` + `UnifiedCodeDetailView` em `core/`.
`UnifiedModelAdapter` merge N `SidebarModelInterface` → 1.
Cada engine expõe `*SidebarAdapter` (PDF, Image, CSV, Audio, Video) — Markdown expõe `CodeMarkerModel` direto.

Type guards por engine usando campos discriminantes:
- `isPdfMarker()`: `'page' in marker && 'isShape' in marker`
- `isImageMarker()`: `'shape' in marker && 'shapeLabel' in marker`
- `isCsvMarker()`: `'rowIndex' in marker && 'columnId' in marker`
- `isAudioMarker()`: `'mediaType' in marker && marker.mediaType === 'audio'`
- `isVideoMarker()`: `'mediaType' in marker && marker.mediaType === 'video'`

| Antes (standalone) | Após merge | Savings |
|-------|--------|---------|
| ~3,750 LOC (12 arquivos) | ~1,200 LOC (2 base + 2 unified + 5 adapters) | ~68% |

---

## 3. Coding Models

6 models, ~2,257 LOC total.

### LOC e storage

| Engine | LOC | Storage | Marker Fields |
|--------|-----|---------|---------------|
| v2 | 547 | `Map<fileId, Marker[]>` | `range: {from: {line,ch}, to: {line,ch}}`, `color` |
| PDF | 544 | `markers[]` + `shapes[]` | `page, beginIndex, beginOffset, endIndex, endOffset` / shape coords |
| CSV | 386 | `segmentMarkers[]` + `rowMarkers[]` | `row, column, from, to` (char offsets) |
| Image | 204 | `markers[]` | `shape, coords` (normalized 0-1) |
| Audio | 288 | `files[].markers[]` (nested) | `from, to` (seconds float), `memo?` |
| Video | 288 | `files[].markers[]` (nested) | `from, to` (seconds float), `memo?` |

### Campos universais (presentes em TODOS os markers)

```typescript
interface BaseMarker {
  id: string;          // Date.now().toString(36) + Math.random()...
  codes: string[];
  createdAt: number;
  updatedAt: number;   // FALTA em Audio e Video — precisa migration
}
```

### Lifecycle — O que é idêntico

| Padrão | v2 | PDF | CSV | Image | Audio | Video |
|--------|:--:|:---:|:---:|:-----:|:-----:|:-----:|
| `onChange(fn)` / `offChange(fn)` | **Não** (CM6 effects) | Array | Array | Array | Set | Set |
| `scheduleSave()` debounce | 2000ms | 500ms | 500ms | 500ms | 500ms | 500ms |
| `notify()` = save + listeners | **Não** | Sim | Sim | Sim | Sim | Sim |
| `notifyChange()` (sem save) | Não | Não | Não | Não | **Sim** | **Sim** |
| `flushPendingSave()` | **Sim** | Não | Não | Não | Não | Não |
| `addCodeToMarker()` | Sim | Sim | Sim | Sim | Sim | Sim |
| `removeCodeFromMarker()` | Sim | Sim | Sim | Sim | Sim | Sim |
| `findMarkerById()` | Sim | Sim | Sim | Sim | Sim | Sim |
| `getAllMarkers()` | Sim | Sim | Sim | Sim | Sim | Sim |
| `getMarkersForFile()` | Sim | Sim | Sim | Sim | Sim | Sim |
| `syncSharedRegistry()` | Variante A | Variante B | Variante B | Variante B | Variante C | Variante C |
| `generateId()` | Idêntico | Idêntico | Idêntico | Idêntico | Idêntico | Idêntico |

### Hover state

| Engine | No model? | Campos |
|--------|:---------:|--------|
| v2 | **Não** (CM6 effects) | — |
| PDF | **Sim** | `hoverMarkerId`, `hoverCodeName`, `HoverListener[]` |
| CSV | **Não** | — |
| Image | **Não** | — |
| Audio | **Sim** | `hoveredMarkerId`, `hoveredCodeName`, `Set<HoverListener>` |
| Video | **Sim** | `hoveredMarkerId`, `hoveredCodeName`, `Set<HoverListener>` |

### File rename

| Engine | Tem? |
|--------|:----:|
| v2 | Externo (vault event) |
| PDF | `migrateFilePath()` |
| CSV | **Não** |
| Image | **Não** |
| Audio | `migrateFilePath()` |
| Video | `migrateFilePath()` |

### Registry sync — 3 variantes

| Variante | Engines | Estratégia |
|----------|---------|-----------|
| A | v2 | `mergeRegistries()` helper em `sharedRegistry.ts` |
| B | PDF, CSV, Image | Loop inline: import missing, update stale (shared wins se `updatedAt` mais recente) |
| C | Audio, Video | Merge bidirecional completo (local wins em empate) |

Variante A é a mais limpa. No merge todas morrem — `BaseCodingModel` faz sync via `DataManager`.

### Engine-specific

| Engine | Features únicas |
|--------|----------------|
| v2 | CM6 effects em vez de listeners. `markDirtyForSave()` separado. `standaloneEditors` support. Migration `code` → `codes`. `color` no marker (legacy). |
| PDF | **Undo stack** (50 entries, 4 tipos). Dual markers (text + shape). `suppressUndo` flag. |
| CSV | Dual markers (segment + row). `rowDataCache`. `deleteSegmentMarkersForCell()`. |
| Image | `updateMarkerCoords()` para moves/resizes. Settings no model. |
| Audio | File-nested storage. `TOLERANCE = 0.01` para float comparison. `getFileForMarker()` reverse lookup. |
| Video | Fork Audio byte-for-byte. |

### Para `BaseCodingModel<M extends BaseMarker>` — ~550 LOC eliminados

Métodos universais que vão pra base:
- `onChange/offChange`, `scheduleSave/flushPendingSave`, `notify/notifyChange`
- `addCodeToMarker/removeCodeFromMarker`
- `syncSharedRegistry`
- `generateId`
- Hover state (opt-in)

Métodos abstratos:
- `findMarkerById(id)`, `getAllMarkers()`, `getMarkersForFile(file)`
- `deserialize(raw)`, `serialize(existing)`
- `deleteMarkerInternal(id)`
- `migrateFilePath(old, new)`

### Migrations necessárias

1. Adicionar `updatedAt` a `AudioMarker` e `VideoMarker`
2. Unificar key do registry no data.json (v2: `codeDefinitions`, PDF/CSV/Image: `registry`, Audio/Video: `codeDefinitions`)
3. Unificar campo de file reference (v2: `fileId`, Audio/Video: parent container, outros: `file`)
4. v2 é o mais difícil de migrar (CM6 effects em vez de listeners, Map storage, 2s debounce)

---

## 4. CodeDefinitionRegistry

6 cópias idênticas (188 LOC cada). **100% duplicado.**

Uma cópia canônica em `core/codeDefinitionRegistry.ts`. As outras 5 morrem.

PDF e CSV inlinam o registry dentro do model file. Audio e Video importam de arquivo separado. v2 tem arquivo separado (canônico).

---

## 5. SharedRegistry

6 cópias idênticas (67 LOC cada). **Morre completamente no merge.** Codebook passa a viver no `QualiaData.registry` via DataManager.

---

## 6. CodeFormModal

5 cópias (v2, PDF, Audio, Video, CSV). ~82 LOC cada.

Obsidian Modal com: nome (TextComponent), cor (color input), descrição (TextComponent). `onSave` callback. `onDismiss` callback.

CSV e Image **não têm** CodeFormModal acessível do menu — não oferecem color picker na criação inline. No merge, todos terão via `core/codeFormModal.ts`.

---

## 7. Bugs encontrados na análise — Status

| # | Engine | Bug | Severidade | Status |
|---|--------|-----|-----------|--------|
| 1 | Video | `VIDEO_EXTS` regex usa extensões de áudio em vez de vídeo | Média | ✅ Corrigido no merge (shortenPath inclui mp4/webm/ogv) |
| 2 | v2 | Detail view não tem `changeListener` | Baixa | ✅ Corrigido — unified views usam onChange |
| 3 | Audio/Video | Menus não chamam `applyThemeColors()` | Baixa | ✅ Resolvido — `openCodingPopover()` lida com theming |
| 4 | Image | Explorer usa CSS classes custom divergentes | Baixa | ✅ Resolvido — unified explorer usa classes Obsidian |
| 5 | Audio/Video | `updatedAt` ausente nos markers | Média | Pendente — AudioMarker/VideoMarker sem updatedAt |

---

## 8. Deduplicação — Resultado Real

| Componente | LOC standalone (7 plugins) | LOC merge (qualia-coding) | Savings |
|-----------|----------|---------------|---------|
| Sidebar views (12 → 2 base + 2 unified + 5 adapters) | 3,750 | ~1,200 | ~68% |
| Coding menus (6 → 1 core + 6 wrappers) | 2,080 | ~920 | ~56% |
| Coding models (6 — cada engine mantém o seu) | 2,257 | ~1,500 | ~33% |
| Registry (6 → 1) | 1,128 | 188 | ~83% |
| SharedRegistry (6 → 0) | 402 | 0 | 100% |
| CodeFormModal (5 → 1) | 410 | 82 | ~80% |
| WaveSurfer renderers (2 → 1 compartilhado em `media/`) | ~460 | ~280 | ~39% |
| **Total** | **~10,487** | **~4,170** | **~60%** |
