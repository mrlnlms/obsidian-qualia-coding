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

---

## Analise detalhada: Menu pattern (2026-03-07)

### Situacao atual — 3 padroes de entrada coexistentes

| Padrao | Engine | Como funciona |
|--------|--------|---------------|
| **Classe wrapper** | Image | `new CodingMenu()` com lifecycle `open/close/destroy`. View chama `close()` em 4 momentos (seleção muda, limpa, toolbar mode, cleanup). |
| **Funcao direta** | Audio, Video, PDF, CSV | `openXxxCodingPopover(...)` fire-and-forget. Popover se auto-gerencia (outside click, Escape). |
| **CM6 tooltip** | Markdown | `MenuController` despacha `showCodingMenuEffect` → CM6 cria/destroi tooltip via StateField. |

### Camadas internas

- **5 de 7 engines** (PDF, CSV, Image, Audio, Video) ja usam o shared `codingPopover.ts` + `baseCodingMenu.ts`
- **Markdown** reimplementa a mesma UX em `cm6NativeTooltipMenu.ts` (484 linhas) sem usar o shared
- Audio e Video tem menus **identicos** (110 vs 106 linhas, mesma logica)

### Por que a divergencia existe

- **Markdown/CM6**: tooltips devem ser `StateField` + `showTooltip.from()`. Nao pode usar `document.body.appendChild()` sem perder posicionamento automatico e auto-close em mudanca de selecao. Restricao tecnica legitima.
- **Image/classe**: fabric.js tem eventos de canvas (`selection:cleared`, toolbar mode change) que precisam fechar o menu programaticamente de fora. Justificado.
- **Audio+Video/funcao**: `createPopover()` remove o anterior automaticamente. Fire-and-forget funciona. Mas sao **duplicados** — mesma logica, tipos diferentes.
- **PDF+CSV/funcao**: variações legitimadas — cross-page, batch, shapes, grid refresh.

### Duplicacao no markdown (cm6NativeTooltipMenu.ts)

Helpers reimplementados localmente que ja existem em `baseCodingMenu.ts`:
- `createActionItem()` — 22 linhas (identico)
- `createSeparator()` — 5 linhas (identico)
- `applyThemeColors()` — 26 linhas (identico)
- `applyInputTheme()` — 6 linhas (identico)
- `createToggleItem()` — 65 linhas (reimplementa `renderToggleList`)
- `appendBrowseItem()` — 20 linhas (reimplementa `renderBrowseItem`)
- `rebuildSuggestions()` — 60 linhas (mesma logica do `codingPopover.ts`)
- Secao memo — 60 linhas (reimplementa `renderMemoSection`)

Divergencia de CSS: markdown usa `codemarker-tooltip-swatch`, shared usa `codemarker-popover-swatch`.

### Diferencas funcionais que devem ser preservadas

1. CM6 tooltip hosting (posicionamento pelo editor)
2. `setSelectionPreviewEffect` (preview highlight durante menu aberto)
3. `addCodeWithDetailsAction()` (passa description ao criar codigo)
4. `model.getSettings().defaultColor` vs `registry.peekNextPaletteColor()`
5. Hover grace via custom events CM6 vs `hoverGrace` option

### Plano de consolidacao

**Nivel 1 — Markdown importa helpers do baseCodingMenu (~55 linhas)**
- Remove helpers locais duplicados, troca por imports
- Risco: baixo, mecanico

**Nivel 2 — Markdown migra para adapter pattern (~335 linhas)**
- `buildNativeTooltipMenuDOM` monta `CodingPopoverAdapter` e chama `openCodingPopover()` com param `externalContainer`
- Elimina toggle, browse, suggestions, memo locais — tudo vem do shared
- Mantem: adapter setup, glue CM6, diferencas funcionais acima
- cm6NativeTooltipMenu: 484 → ~150 linhas
- codingPopover.ts: +15 linhas (param externalContainer)

**Nivel 3 — Audio + Video unificados (~85 linhas)**
- Cria `media/mediaCodingMenu.ts` com tipo generico
- Elimina `audioCodingMenu.ts` + `videoCodingMenu.ts`

### Impacto estimado

| Cenario | Linhas removidas | Reducao |
|---------|-----------------|---------|
| Nivel 1 | ~55 | 2% |
| Nivel 1 + 3 | ~140 | 6% |
| **Todos (1+2+3)** | **~420** | **17%** |

Ganho principal nao e em linhas — e em **superficie de manutencao**:
- Bug no toggle/memo/browse → corrige em 1 lugar, nao 2
- Nova feature no menu (ex: keyboard nav) → implementa 1x
- Divergencia de CSS entre engines → eliminada
- Novo dev entende 1 fluxo de menu, nao 2

---

## Merge Audio + Video (2026-03-07)

Audio e Video sao engines quase identicos. Alem do menu (ja contado acima), model, types e sidebar adapter sao copias com nomes trocados.

### Diff real (apos normalizar nomes)

| Arquivo | Audio | Video | Diff |
|---------|-------|-------|------|
| CodingModel | 254 | 253 | 2 linhas (comentario + cast) |
| CodingMenu | 110 | 105 | 0 (identicos) |
| CodingTypes | 28 | 24 | Video tem `videoFit`, Audio tem marker inline vs extends MediaMarker |
| index.ts | 122 | 120 | Estrutura identica, muda extensoes/icone/nomes |
| SidebarAdapter | 136 | 143 | ~15 linhas — Video inlina formatTime e filePath |
| View | 387 | 393 | Legitimamente diferentes (wavesurfer vs `<video>`) |

### Plano

- `media/mediaCodingModel.ts` — classe base parametrizada por section name. Audio e Video instanciam com `'audio'`/`'video'`
- `media/mediaCodingMenu.ts` — funcao generica (ja contada no menu nivel 3)
- `media/mediaTypes.ts` — types base, cada engine extends para settings extras (`videoFit`)
- `media/mediaSidebarAdapter.ts` — adapter base, thin wrappers se necessario
- Views e index.ts **mantidos separados** — wavesurfer ≠ `<video>`, extensoes diferentes

### Impacto

| Componente | Atual | Apos merge | Economia |
|------------|-------|------------|----------|
| Model (2x254) | 507 | ~270 | ~237 |
| Types (2x26) | 52 | ~35 | ~17 |
| SidebarAdapter (2x140) | 279 | ~155 | ~124 |
| Menu (ja contado acima) | — | — | — |
| **Subtotal** | | | **~378** |

---

## CSS cleanup (2026-03-07)

Dois namespaces CSS coexistem para os mesmos componentes visuais:
- `codemarker-tooltip-*` — markdown (CM6 tooltip)
- `codemarker-popover-*` — shared (PDF, CSV, Image, Audio, Video)

### Problemas concretos

1. **Swatch duplicado**: `codemarker-tooltip-swatch` (L92) e `codemarker-popover-swatch` (L1559) — mesma bolinha, 2 regras
2. **Container duplicado**: bloco `.codemarker-tooltip-menu` (L1042-1171, ~130 linhas) estiliza o menu markdown; shared usa `.codemarker-popover` com classe `.menu` base
3. **Classes orfas** (nao referenciadas em nenhum .ts): `codemarker-tooltip-input-wrapper`, `codemarker-tooltip-input`, `codemarker-tooltip-toggle`, `codemarker-tooltip-checkbox` (~30 linhas) — restos de iteracoes anteriores

### Impacto

| Item | Linhas |
|------|--------|
| Bloco tooltip-menu duplicado | ~130 |
| Swatch duplicado | ~8 |
| Classes orfas | ~30 |
| **Total** | **~168** |

Se o menu markdown migrar para adapter (nivel 2), tudo unifica em `codemarker-popover` e o bloco tooltip-menu inteiro some. Classes orfas podem ser removidas a qualquer momento sem risco.

---

## Bugs encontrados (2026-03-07)

| # | Severidade | Local | Problema |
|---|-----------|-------|----------|
| 1 | **Critico** | `audioSidebarAdapter.ts:26`, `videoSidebarAdapter.ts:25` | `updatedAt: m.createdAt` — mapeia pro campo errado. Markers audio/video reportam data de update incorreta. |
| 2 | **Alto** | `csvSidebarAdapter.ts:68-74` | `updateMarkerFields` recebe memo/colorOverride mas nao aplica — tipos CSV nao tem esses campos. Edicao silenciosamente ignorada. |
| 3 | **Alto** | `pdf/pdfCodingTypes.ts:20-30` | `PdfShapeMarker` nao tem `colorOverride`. Shapes PDF nao podem ter cor personalizada via sidebar. |

---

## Dead code (2026-03-07)

Arquivos que ninguem importa — substituidos pelas unified views:

| Arquivo | Linhas |
|---------|--------|
| `markdown/views/codeExplorerView.ts` | 73 |
| `markdown/views/codeDetailView.ts` | 80 |
| `pdf/views/pdfCodeExplorerView.ts` | ~70 |
| `pdf/views/pdfCodeDetailView.ts` | ~70 |
| **Total** | **~293** |

---

## Sidebar views — duplicacao explorer/detail (2026-03-07)

`unifiedExplorerView.ts` e `unifiedDetailView.ts` duplicam:
- `getMarkerLabel()` — cadeia identica de if/isPdf/isImage/isCsv/isAudio/isVideo/markdown (~35 linhas x2)
- `navigateToMarker()` — mesma logica de navegacao por engine (~45 linhas x2)
- `shortenPath()` — mesma regex
- Type guards no fundo do arquivo — 5 funcoes identicas x2

**Acao**: extrair para `core/markerResolvers.ts` — elimina **~130 linhas**.

---

## Inconsistencias de tipos (2026-03-07) — RESOLVIDO (2026-03-16)

Todas as inconsistencias foram corrigidas:
- `file` → `fileId` em PDF e CSV
- `note` → `memo` em PDF
- `AudioMarker` agora extends `MediaMarker`
- `CsvMarker` agora tem `memo` e `colorOverride`
- `PdfShapeMarker` agora tem `colorOverride`
- `MediaMarker` agora tem `fileId` e `colorOverride`
- `deleteMarker` → `removeMarker` em Image e CSV

---

## Sidebar adapter duplicacao (2026-03-07) — RESOLVIDO (2026-03-16)

Criado `BaseSidebarAdapter` em `src/core/baseSidebarAdapter.ts`.
Todos os 5 adapters agora herdam da base class (listener wrapping, hover state).
Audio/Video herdam via `MediaSidebarAdapter` intermediario.

---

## Type safety (2026-03-07) — PARCIAL (2026-03-16)

- `@ts-ignore`: 44 → 3 restantes (wavesurfer.js module resolution — nao resolvivel)
- `obsidian-internals.d.ts` criado com ambient types para Editor + workspace events
- `as any`: 220 instancias — nao atacado ainda (maioria em boardNodes.ts/Fabric.js)

---

## Arquivos grandes (2026-03-07)

| Arquivo | Linhas | Problema |
|---------|--------|----------|
| `analytics/views/analyticsView.ts` | 5.907 | 20+ modos de visualizacao num so arquivo |
| `analytics/data/statsEngine.ts` | 949 | 20+ funcoes de calculo misturadas |
| `analytics/board/boardNodes.ts` | 825 | 91 `as any` (Fabric.js) |
| `csv/csvCodingView.ts` | 801 | Grid + parser + editor + markers misturados |
| `markdown/cm6/markerViewPlugin.ts` | 706 | Render + drag + hover + DOM overlay |
| `markdown/cm6/marginPanelExtension.ts` | 674 | Labels + positioning + collapse |

---

## Consolidado geral — todas as frentes

| Frente | Linhas | Status |
|--------|--------|--------|
| Bug fixes (3 bugs) | ~10 de fix | FEITO (2026-03-16) |
| Dead code (4 arquivos) | ~293 eliminadas | FEITO (2026-03-16) |
| Menu consolidation nivel 1 (markdown importa helpers) | ~55 eliminadas | FEITO (2026-03-16) |
| Menu consolidation nivel 3 (audio+video unificado) | ~90 eliminadas | FEITO (2026-03-16) |
| Audio+Video merge (model, types, adapter, menu) | ~370 eliminadas | FEITO (2026-03-16) |
| CSS cleanup (classes orfas) | ~36 eliminadas | FEITO (2026-03-16) |
| Sidebar views (shared helpers — markerResolvers.ts) | ~108 eliminadas | FEITO (2026-03-16) |
| `obsidian-internals.d.ts` | 41 @ts-ignore removidos | FEITO (2026-03-16) |
| Padronizacao campos (note→memo, file→fileId, MediaMarker) | ~10 linhas mudadas | FEITO (2026-03-16) |
| Padronizacao metodos (deleteMarker→removeMarker) | ~7 linhas mudadas | FEITO (2026-03-16) |
| BaseSidebarAdapter (todos os engines) | ~120 eliminadas | FEITO (2026-03-16) |
| Menu consolidation nivel 2 (markdown → shared popover) | ~299 eliminadas | FEITO (2026-03-16) |
| CSS cleanup full (remove namespace tooltip-menu, unifica seletores) | ~77 eliminadas | FEITO (2026-03-16) |
| `as any` cleanup (222 → 16 restantes) | 206 removidos | FEITO (2026-03-16) |
| **Total eliminado** | **~1.280 linhas + 206 as any** | |
| analyticsView.ts split (5.907 linhas) | Reorganiza, nao elimina | Futuro |
| statsEngine.ts split | Reorganiza | Futuro |

Ganho de manutenibilidade alcancado:
- Menu: 1 sistema unificado para TODOS os engines (codingPopover.ts + externalContainer para CM6)
- Audio/Video: corrigir bug em 1 model base, nao 2
- Sidebar: 1 adapter base (BaseSidebarAdapter), listeners unificados
- Types: nomes consistentes (fileId, memo, removeMarker, colorOverride)
- Type guards: 1 lugar (markerResolvers.ts), nao duplicados
- CSS: 1 namespace (codemarker-popover), zero duplicacao
- Type safety: 222 → 16 `as any`, 44 → 3 `@ts-ignore`
- Fabric.js: fabricExtensions.d.ts (Canvas, Rect, etc.) + boardTypes.ts (discriminated union por tipo de no)
- Board: zero erros tsc — discriminated union com type guards para narrowing automatico
- Build: `npm run build` passa com zero erros (tsc + esbuild)

---

## 16 `as any` restantes — analise de eliminabilidade

### DataManager migration code (6 instancias) — `src/core/dataManager.ts`

```
(raw as any)[key] = defaults[key]           // preenche campos faltantes
(raw as any).markdown?.codeDescriptions     // acessa schema legado
(def as any).name / .description            // definitions sem tipo durante migracao
```

**Eliminavel?** SIM, se criar `LegacyQualiaData` interface que descreve o schema antigo. Mas o codigo de migracao e transitorio — quando o plugin sair de dev, pode ser removido inteiramente (nenhum usuario tem dados no formato antigo). **Sugestao: remover o codigo de migracao quando o plugin for publicado.**

### MediaCodingModel generic section key (4 instancias) — `src/media/mediaCodingModel.ts`

```
dm.section(sectionName as any)              // 'audio'|'video' como string, DataManager espera keyof
(section as any).files                      // retorno e union type, files nao existe em todos
```

**Eliminavel?** SIM, com overload no DataManager:
```typescript
section(key: 'audio'): { files: AudioFile[]; settings: AudioSettings };
section(key: 'video'): { files: VideoFile[]; settings: VideoSettings };
```
Ou aceitar o `as any` — e o custo de um model generico parametrizado. **Sugestao: criar overloads no DataManager se for adicionar mais engines.**

### PDF Obsidian internal viewer API (3 instancias) — `src/pdf/index.ts`

```
view.viewer as any                          // acessa PDF.js viewer interno do Obsidian
(leaf.view as any)                          // acessa propriedades de PdfView nao exportadas
```

**Eliminavel?** NAO facilmente. O Obsidian nao exporta tipos do PDF viewer. O `pdfTypings.d.ts` ja cobre parcialmente, mas a API interna muda entre versoes do Obsidian. **Sugestao: manter e documentar como "Obsidian internal API".**

### WaveSurfer event type (1 instancia) — `src/media/waveformRenderer.ts`

```
this.ws?.on(event as any, callback)         // wavesurfer nao tipa eventos como union
```

**Eliminavel?** SIM, com module augmentation para WaveSurfer (similar ao que fizemos com Fabric.js). **Sugestao: fazer quando mexer no waveform renderer.**

### Chart.js wordCloud plugin (1 instancia) — `src/analytics/views/analyticsView.ts`

```
type: "wordCloud" as any                    // chartjs-chart-wordcloud nao registra tipo
```

**Eliminavel?** SIM, com `declare module 'chart.js' { ... }` para registrar o tipo wordCloud. **Sugestao: fazer quando mexer no analytics.**

### viewLookupUtils duck-type (1 instancia) — `src/markdown/cm6/utils/viewLookupUtils.ts`

```
return createStandaloneViewWrapper(standalone) as any
```

**Eliminavel?** SIM, tipando o retorno da funcao wrapper. **Sugestao: fazer quando mexer no viewLookup.**

---

## Erros tsc pre-existentes — RESOLVIDO (2026-03-17)

82 erros Fabric.js eliminados via:
- `fabricExtensions.d.ts` com class declarations completas (Canvas, Rect, etc.)
- `boardTypes.ts` com discriminated union (StickyNode, SnapshotNode, etc.)
- Typed tuple para viewportTransform
- Null checks em geometry access

**Build agora passa com zero erros.**

---

## Pendente (refactor futuro)

| Item | Eliminavel? | Quando |
|------|------------|--------|
| analyticsView.ts split (5.907 linhas) | — | Quando mexer em analytics |
| statsEngine.ts split | — | Quando mexer em analytics |
| 6 `as any` DataManager migration | Sim (remover migration code) | Quando publicar o plugin |
| 4 `as any` MediaCodingModel section | Sim (overloads DataManager) | Quando adicionar engines |
| 3 `as any` PDF viewer | Nao (API interna Obsidian) | Manter |
| 1 `as any` WaveSurfer event | Sim (module augmentation) | Quando mexer em waveform |
| 1 `as any` Chart.js wordCloud | Sim (module augmentation) | Quando mexer em analytics |
| 1 `as any` viewLookupUtils | Sim (tipar retorno) | Quando mexer em viewLookup |
