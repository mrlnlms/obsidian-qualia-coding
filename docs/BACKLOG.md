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

## Sidebar adapter duplicacao (2026-03-07) — RESOLVIDO (2026-03-16, expandido 2026-03-17)

Criado `BaseSidebarAdapter` em `src/core/baseSidebarAdapter.ts`.
Todos os 5 adapters agora herdam da base class (listener wrapping, hover state).
Audio/Video herdam via `MediaSidebarAdapter` intermediario.

Expandido (2026-03-17): `deleteCode()` e `updateMarkerFields()` movidos para BaseSidebarAdapter.
- PDF mantem override para ambos (dual text/shape)
- CSV override `notifyAfterFieldUpdate()` para `notifyAndSave()`
- Image e Media usam implementacao base

---

## Type safety (2026-03-07) — PARCIAL (2026-03-16)

- `@ts-ignore`: 44 → 3 restantes (wavesurfer.js module resolution — nao resolvivel)
- `obsidian-internals.d.ts` criado com ambient types para Editor + workspace events
- `as any`: 220 instancias — nao atacado ainda (maioria em boardNodes.ts/Fabric.js)

---

## Arquivos grandes (2026-03-07)

| Arquivo | Linhas | Problema |
|---------|--------|----------|
| `analytics/views/analyticsView.ts` | ~~5.907~~ 798 | FEITO — split em 19 mode modules + shared helpers (2026-03-17) |
| ~~`analytics/data/statsEngine.ts`~~ | ~~949~~ | FEITO — split em 6 modulos (2026-03-17) |
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
| `as any` cleanup (222 → 6 restantes) | 216 removidos | FEITO (2026-03-17) |
| Board discriminated union (boardTypes.ts) + zero erros tsc | 82 erros eliminados | FEITO (2026-03-17) |
| Migration code legado removido + DataManager overloads | -83 linhas dead code | FEITO (2026-03-17) |
| `as any` final cleanup (222 → 4 restantes) | 218 removidos | FEITO (2026-03-17) |
| Registry auto-persistence (onMutate callback) | Bug de perda de dados corrigido | FEITO (2026-03-17) |
| Tipa fronteira de integracao (main.ts + baseSidebarAdapter) | Zero any na integracao | FEITO (2026-03-17) |
| Suite de testes Vitest (429 testes, 19 suites) | Cobertura core + analytics | FEITO (2026-03-17) |
| Bug fixes: overlap PDF/CSV-row, temporal filters.codes, listener leak | 3 bugs do Codex | FEITO (2026-03-17) |
| clear() dispara onMutate + remove dead code addExistingCodeAction | Borda de persist + dead code | FEITO (2026-03-17) |
| Engine registration retorna {cleanup, model} — zero ! no main.ts | Contrato explicito | FEITO (2026-03-17) |
| Suite de testes expandida (1214 testes, 36 suites) | +statsEngine, dataManager, adapters, CSV/Image models, cluster, MCA, MDS, decisionTree, chartHelpers, viewModes, core, textRetrieval, optionSections, CodeMarkerModel, PdfCodingModel, highlightGeometry, fileInterceptor | FEITO (2026-03-17) |
| Fixa versao obsidian (latest → ^1.12.3) | Previne breaking changes upstream | FEITO (2026-03-17) |
| fileInterceptor cleanup no unload (clearFileInterceptRules) | Previne leak de regras em hot-reload | FEITO (2026-03-17) |
| **Total refactor (2026-03-16/17)** | **~1.360 linhas eliminadas, 222→4 as any, 44→3 @ts-ignore, 82→0 erros tsc, 57 commits** | |
| analyticsView.ts split (5.907 → 798 + 19 modules) | Core + 19 modes + shared | FEITO (2026-03-17) |
| Suite de testes (430 → 1100 testes, 19 → 32 suites) | +chartHelpers, viewModes, core, textRetrieval, optionSections, CodeMarkerModel, PdfCodingModel, highlightGeometry, fileInterceptor | FEITO (2026-03-17) |
| Bug fix: media migrateFilePath nao atualizava marker.fileId | Unico engine com bug — fix + teste explicito | FEITO (2026-03-17) |
| fileInterceptor: extrai helpers puros + 17 testes | resolveLeafFilePath, matchesInterceptRule, dispatchRenameRules | FEITO (2026-03-17) |
| deleteCode + updateMarkerFields → BaseSidebarAdapter | Elimina 3 copias identicas, PDF mantem override | FEITO (2026-03-17) |
| markerType discriminante no BaseMarker | Elimina duck typing fragil nos type guards, usa `marker.markerType === 'X'` | FEITO (2026-03-17) |
| exportCSV tests (8 sync + 4 async) + formatAudioTime + formatLocation | +67 testes para analytics modes | FEITO (2026-03-17) |
| statsEngine.ts split (951 → 6 modulos + barrel) | frequency, cooccurrence, evolution, sequential, inferential, textAnalysis | FEITO (2026-03-17) |
| renderMini* tests (17 funcoes Canvas2D) | +34 testes com mock de getContext("2d") | FEITO (2026-03-17) |
| renderChart tests (5 funcoes Chart.js) | +13 testes com mock de Chart constructor | FEITO (2026-03-17) |

| WaveSurfer Region types (waveformRenderer + regionRenderer) | `any` → `Region` import tipado | FEITO (2026-03-19) |
| Chart.js wordCloud `as any` | Module augmentation via `import type {}` | FEITO (2026-03-19) |
| viewLookupUtils `as any` | Interface `StandaloneEditor` tipada | FEITO (2026-03-19) |
| dashboardMode 13x `(ctx as any).renderMini*` | Imports diretos — **bug fix: thumbnails estavam em branco** | FEITO (2026-03-19) |
| Media save timing redundante (500ms + 500ms DM) | Removido debounce do model, DM 500ms unico | FEITO (2026-03-19) |
| DEVELOPMENT.md Node.js version | "18+" → "20.19+ ou 22.12+" (match package.json) | FEITO (2026-03-19) |
| vitest.config.ts coverage threshold | Nenhum → v8 thresholds (60/50/55/60) | FEITO (2026-03-19) |

Ganho de manutenibilidade alcancado:
- Menu: 1 sistema unificado para TODOS os engines (codingPopover.ts + externalContainer para CM6)
- Audio/Video: corrigir bug em 1 model base, nao 2
- Sidebar: 1 adapter base (BaseSidebarAdapter), listeners unificados
- Dashboard: 12 thumbnails agora renderizam corretamente (eram silenciosamente quebrados)

---

## Evolucao do codebase — metricas historicas (2026-03-17)

### LOC por fase

| Fase | src/*.ts | styles.css | Total | Arquivos | Maior arquivo | Testes |
|------|---------|------------|-------|----------|---------------|--------|
| 7 plugins separados (pre-merge) | 38.067 | ~4.500* | ~42.500 | 7×~15 | 11.147 (analytics) | 0 |
| Merge 7→1 (d7eb286, 2026-03-02) | 29.074 | 4.143 | 33.217 | 106 | 5.907 (analyticsView) | 0 |
| Porting complete v45 (6a0bb35, 2026-03-07) | 29.329 | 4.139 | 33.468 | 106 | 5.907 (analyticsView) | 0 |
| Pos-refactor + split + testes (2026-03-17) | 28.415 | 4.026 | 32.441 | 135 | ~250 (frequency.ts) | 1214 |
| Pos-refactor final + e2e (2026-03-18) | 28.590 | 4.026 | 32.616 | 150 | 672 (marginPanel) | 1290 (1263 unit + 27 e2e) |

*CSS estimado: soma dos 7 styles.css individuais antes da dedup.

### Reducao total

| Metrica | 7 plugins | Agora | Delta |
|---------|-----------|-------|-------|
| **LOC (src/*.ts)** | 38.067 | 28.415 | **-9.652 (-25.4%)** |
| **CSS** | ~4.500 | 4.026 | **-474 (-10.5%)** |
| **Maior arquivo** | 11.147 | ~250 | **-97.8%** |
| **Testes unitarios** | 0 | 1263 | +1263 |
| **Testes e2e** | 0 | 27 | +27 |
| **Total testes** | 0 | 1290 | +1290 |
| **as any** | 222+ | 6 (3 PDF internal + 3 deepMerge) | -97% |
| **@ts-ignore** | 44+ | 3 | -93% |
| **tsc errors** | 82 | 0 | -100% |

### Onde foram as 9.652 linhas?

- **Codigo duplicado entre plugins**: ~8.900 linhas. Cada plugin copiava integralmente: registry, menu system, sidebar views, settings tab, hover bridge, type guards, save/load. Com 7 plugins, havia ~6 copias de cada modulo compartilhado
- **Dead code**: ~293 linhas de views/explorers substituidos pelas unified views
- **CSS duplicado**: ~474 linhas de seletores identicos entre os 7 styles.css
- **Consolidacao audio/video**: ~370 linhas — 2 models identicos viraram 1 (MediaCodingModel)
- **Menu unification**: ~444 linhas — 6 menus com ~70% identico viraram 1 sistema
- **Boilerplate de split** (compensacao): +231 linhas de imports nos novos modulos
- Types: nomes consistentes (fileId, memo, removeMarker, colorOverride)
- Type guards: 1 lugar (markerResolvers.ts), nao duplicados
- CSS: 1 namespace (codemarker-popover), zero duplicacao
- Type safety: 222 → 6 `as any` (3 PDF internal API + 3 deepMerge generics — todos ineliminaveis), 44 → 3 `@ts-ignore`
- Testes: 1214 testes em 36 suites (Vitest + jsdom), cobrindo core, analytics (exportCSV sync+async, renderMini, renderChart, modes, statsEngine), media, engine models, fileInterceptor
- Registry: auto-persist via onMutate callback em create/update/delete/clear
- Engine registration: retorno explicito {cleanup, model} — zero non-null assertions no main.ts
- Fabric.js: fabricExtensions.d.ts (Canvas, Rect, etc.) + boardTypes.ts (discriminated union por tipo de no)
- Board: zero erros tsc — discriminated union com type guards para narrowing automatico
- Build: `npm run build` passa com zero erros (tsc + esbuild)

---

## 6 `as any` restantes — fronteiras com APIs externas

### PDF Obsidian internal viewer API (3 instancias) — `src/pdf/index.ts`

```
view.viewer as any                          // acessa PDF.js viewer interno do Obsidian
(leaf.view as any)                          // acessa propriedades de PdfView nao exportadas
```

**Eliminavel?** NAO. O Obsidian nao exporta tipos do PDF viewer. O `pdfTypings.d.ts` ja cobre parcialmente, mas a API interna muda entre versoes do Obsidian. Manter como "Obsidian internal API".

### dataManager deepMerge (3 instancias) — `src/core/dataManager.ts`

```
const result = { ...defaults } as any;     // generic type manipulation
const val = (persisted as any)[key];       // dynamic key access
const def = (defaults as any)[key];        // dynamic key access
```

**Eliminavel?** NAO de forma pratica. Funcao utilitaria generica que opera com `Partial<T>` e chaves dinamicas. Qualquer alternativa (`unknown` + assertions) seria equivalente.

### Eliminados (2026-03-19)

| Item | Fix aplicado |
|------|-------------|
| ~~WaveSurfer Region types~~ | Import `Region` de `wavesurfer.js/dist/plugins/regions` — `addRegion(): Region`, `getRegionById(): Region`, callback tipado |
| ~~Chart.js wordCloud~~ | `import type {} from "chartjs-chart-wordcloud"` forca module augmentation — `type: "wordCloud"` sem cast |
| ~~viewLookupUtils duck-type~~ | Interface `StandaloneEditor` com `cm`, `posToOffset`, `offsetToPos`, `getRange` |
| ~~regionRenderer Map<string, any>~~ | `Map<string, Region>` + `getRegionForMarker(): Region` |
| ~~dashboardMode 13x `(ctx as any)`~~ | Imports diretos das 12 funcoes `renderMini*` dos mode modules — **thumbnails estavam quebrados (silenciados por try/catch)** |
| ~~tooltipCtx: any~~ | `TooltipItem<'wordCloud'>` |

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
| ~~analyticsView.ts split~~ | ~~—~~ | ~~FEITO (2026-03-17)~~ |
| ~~statsEngine.ts split~~ | ~~—~~ | ~~FEITO (2026-03-17)~~ |
| ~~WaveSurfer `as any`~~ | ~~—~~ | ~~FEITO (2026-03-19)~~ |
| ~~Chart.js wordCloud `as any`~~ | ~~—~~ | ~~FEITO (2026-03-19)~~ |
| ~~viewLookupUtils `as any`~~ | ~~—~~ | ~~FEITO (2026-03-19)~~ |
| ~~dashboardMode 13x `as any`~~ | ~~—~~ | ~~FEITO (2026-03-19) — bug fix, thumbnails estavam em branco~~ |
| ~~Media save timing redundante~~ | ~~—~~ | ~~FEITO (2026-03-19) — removido debounce 500ms, DM cuida~~ |
| 3 `as any` PDF viewer | Nao (API interna Obsidian) | Permanente |
| 3 `as any` dataManager deepMerge | Nao (type gymnastics generica) | Permanente |
| main.ts acoplamento | Monitorar — reavaliar se > ~250 LOC | Intencional (182 LOC hoje) |
| analyticsView.ts state bag | Monitorar — agrupar em sub-objetos se > ~25 campos | OK hoje (~20 campos, 338 LOC) |
| dataConsolidator.ts ponto unico | Manter — by design, protegido por testes | 311 LOC, 6 blocos independentes |
| ~~Reorganizacao naming csv/ + image/~~ | ~~—~~ | ~~FEITO (2026-03-19) — csv prefixado, image aplainado (5 subpastas → flat)~~ |
| ~~markdown/index.ts dedup~~ | ~~—~~ | ~~FEITO (2026-03-19) — `openMenuFromEditorSelection()` elimina 3x duplicacao (275→220 LOC)~~ |
| ~~ARCHITECTURE.md §5.3 drift~~ | ~~—~~ | ~~FEITO (2026-03-19) — EngineCleanup como funcao, main.ts ~180 LOC~~ |

---

## Cobertura de testes (2026-03-18)

### Visao geral

| Camada | Testes | Suites/Specs | O que cobre |
|--------|--------|-------------|-------------|
| Vitest + jsdom | 1.263 | 39 suites | Logica pura: models, engines, helpers, resolvers, registry |
| wdio + Obsidian (e2e) | 65 | 18 specs | UI real: editor, sidebar, analytics, media views, modais, screenshots |
| **Total** | **1.328** | **57** | |

### Evolucao

| Momento | Unit | E2E | Total |
|---------|------|-----|-------|
| 7 plugins separados (pre-merge) | 0 | 0 | 0 |
| Pos-refactor (2026-03-17) | 1.214 | 0 | 1.214 |
| Pos-test coverage expansion (2026-03-18 manha) | 1.263 | 0 | 1.263 |
| Pos-e2e harness + specs (2026-03-18 tarde) | 1.263 | 65 | 1.328 |

### Cobertura unitaria (Vitest + jsdom) — 32 modulos de logica pura

| Modulo | O que testa |
|--------|------------|
| core/dataManager | load, section, setSection, persistence, deep merge |
| core/codeDefinitionRegistry | CRUD, palette, mutation callbacks |
| core/markerResolvers | type guards, getMarkerLabel, shortenPath |
| core/baseSidebarAdapter | deletion, code updates, marker fields |
| core/fileInterceptor | rules, matching, helpers puros |
| markdown/codeMarkerModel | CRUD markers, listeners, hover, migration |
| markdown/markerPositionUtils | offsetToPos, classify nesting vs partial overlap |
| pdf/pdfCodingModel | CRUD, shapes, undo, listeners (Set) |
| pdf/highlightGeometry | rect merging, edge cases |
| image/codingModel | CRUD, deletion, hover, listeners |
| csv/codingModel | segment/row markers, caching |
| media/mediaCodingModel | file CRUD, markers, cleanup |
| media/formatTime | edge cases, formatting |
| media/mediaSidebarAdapter | hover, display, grouping |
| analytics/statsEngine (6 sub-modulos) | frequency, cooccurrence, evolution, sequential, inferential, textAnalysis |
| analytics/statsHelpers | applyFilters direto (multi-codigo, excludeCodes) |
| analytics/textExtractor | segmentation, ranges |
| analytics/wordFrequency | frequency, filtering |
| analytics/dataConsolidator | marker consolidation, filtering |
| analytics/clusterEngine | hierarchical clustering, dendrograms |
| analytics/decisionTreeEngine | tree construction, Gini |
| analytics/mcaEngine | MCA, eigenvalues |
| analytics/mdsEngine | MDS, distance preservation |
| analytics/boardTypes | type guards, node validation |
| analytics/boardNodes | 6 node factories, round-trip |
| analytics/boardClusters | clustering por co-ocorrencia real |
| analytics/chartHelpers | colors, matrix, divergent |
| analytics modes (19) | Parcial — via viewModes, renderChart, renderMini, exportCSV |

### Cobertura e2e (wdio + Obsidian) — 18 specs visuais

| Spec | Testes | Componente | O que valida |
|------|--------|-----------|-------------|
| **Markdown engine** | | | |
| smoke | 3 | Plugin lifecycle | Carrega, abre arquivo, editor visivel |
| margin-panel | 4 | Margin panel CM6 | Bars, CSS classes, screenshot, hover |
| highlights | 4 | CM6 decorations | Highlight spans, nested markers, screenshot |
| handle-overlay | 3 | SVG drag handles | Container, handles no hover, screenshot |
| hover-interaction | 3 | Hover sync | Editor↔margin bar sync, clear on leave |
| **Sidebar + Analytics** | | | |
| code-explorer | 4 | Sidebar tree | View renderiza, tree items, code names, screenshot |
| analytics-frequency | 3 | Chart.js bar chart | View, toolbar, chart screenshot |
| analytics-dashboard | 3 | Dashboard KPIs | KPI cards, marker count, screenshot |
| **Outros engines** | | | |
| csv-grid | 4 | ag-grid | Headers, rows, screenshot |
| board-view | 3 | Fabric.js canvas | Canvas, toolbar, screenshot |
| pdf-view | 3 | PDF pdfjs | Pages, canvas, screenshot |
| image-view | 3 | Image Fabric.js | Canvas, screenshot |
| audio-view | 3 | WaveSurfer | Waveform container, screenshot |
| video-view | 3 | Video player | Player, canvas/video element, screenshot |
| **Settings + Modais** | | | |
| settings-tab | 3 | Plugin settings | Setting items, color picker, toggles |
| code-form-modal | 8 | CodeFormModal | Title, name/color/description inputs, buttons, screenshot |
| code-browser-modal | 5 | CodeBrowserModal | Title, lista de codigos, search, swatches, screenshot |
| column-toggle-modal | 3 | ColumnToggleModal | Abre via gear icon CSV, settings, screenshot |
| **Total** | **65** | **18 specs** | |

### O que NAO esta coberto — e por que nao precisa

**Config sections dos analytics modes (12 funcoes renderOptionsSection)**

Sao os paineis de configuracao no sidebar do Analytics (radio buttons de sort, dropdowns de group, sliders de min frequency). Cada funcao faz exclusivamente: `createDiv` → `createEl("input")` → `addEventListener("change", callback)`. Zero logica de transformacao — sao DOM builders puros. Se um controle renderizar errado, os screenshots do analytics-frequency e analytics-dashboard ja pegam (o config panel esta visivel nos baselines).

**CM6 internals (3 modulos: markerStateField, selectionMenuField, hoverBridge)**

Sao StateFields e ViewPlugins do CodeMirror 6 que gerenciam estado reativo dentro do editor. Nao renderizam nada por si — sao infraestrutura que faz os componentes visuais funcionarem:

- `markerStateField` → mantem as decoracoes (highlights). Se quebrar, `highlights.e2e.ts` falha (highlights somem)
- `selectionMenuField` → mostra o menu quando texto e selecionado. Se quebrar, o popover nao aparece
- `hoverBridge` → sincroniza hover entre editor e margin panel. Se quebrar, `hover-interaction.e2e.ts` falha (hover nao sincroniza)

Testar esses modulos diretamente seria testar o mecanismo de delivery quando ja testamos o resultado final. Os 18 specs e2e existentes cobrem todos os comportamentos que dependem desses internals.

### Stack de testes completo

```
┌─────────────────────────────────────────────────────┐
│  E2E (wdio + Obsidian real)   65 testes, 18 specs  │
│  Abre Obsidian, navega, injeta dados, screenshots   │
│  Cobre: 6 engines + analytics + sidebar + modais    │
├─────────────────────────────────────────────────────┤
│  Unit (Vitest + jsdom)        1263 testes, 39 suites│
│  Roda em memoria, ~6 segundos                        │
│  Cobre: 32 modulos de logica pura                    │
├─────────────────────────────────────────────────────┤
│  Nao coberto (baixissimo risco)                      │
│  12 config sections (DOM builder puro)               │
│  3 CM6 internals (testados indiretamente via e2e)    │
└─────────────────────────────────────────────────────┘
```

Harness e2e: `obsidian-e2e-visual-test-kit` ([GitHub](https://github.com/mrlnlms/obsidian-e2e-visual-test-kit)) — funciona com qualquer plugin Obsidian.

---

## Bugs e gaps encontrados pelo Codex (2026-03-19)

### Bug: Registry rename collision (`codeDefinitionRegistry.ts:80`) — FEITO (2026-03-19)

Guard adicionado no `update()` — retorna `false` se `changes.name` já existe no `nameIndex`. 4 testes adicionados cobrindo: rejeição, consistência do index, não disparo de callbacks.

### Gap: Clear All Markers não limpa Research Board — FEITO (2026-03-19)

`clearBoard(adapter)` adicionado em `boardPersistence.ts` — remove `board.json`. Chamado no callback do Clear All em `markdown/index.ts` junto com `clearAllSections()`. Texto do modal atualizado para incluir "Research Board". 3 testes adicionados.

### Bug de UX: fileInterceptor destrói leaf ao abrir arquivo duplicado (`fileInterceptor.ts:117`)

**Severidade**: Alto (quebra comportamento nativo do Obsidian)

O interceptor faz `leaf.detach()` quando o arquivo já está aberto em outra leaf do target view type. Isso **quebra o workflow nativo** de abrir o mesmo arquivo em painéis lado a lado — comportamento esperado da plataforma que o plugin não deveria impedir.

**Referência**: O plugin mirror-notes resolve isso com o padrão **viewId por pane via WeakMap** (`domInjector.ts:23-36`). Conceito central:
1. Cada pane recebe um `viewId` estável via `WeakMap<HTMLElement, string>` — cleanup automático quando leaf fecha
2. Todo estado (cache, DOM, overrides) é isolado por `viewId + filePath` — múltiplas views do mesmo arquivo não colidem
3. Eventos usam `iterateAllLeaves()` sem deduplicação — processa todas as leaves independentemente
4. Plugin nunca destrói leaves — lifecycle é responsabilidade do Obsidian

**Ação**: Remover o bloco `leaf.detach()` e adaptar os engines para suportar múltiplas views do mesmo arquivo com state isolado por viewId. Exige que cada CodingModel aceite múltiplos listeners (um por view) sem conflito.

### Gap: CI não executa coverage gates — FEITO (2026-03-19)

CI agora roda `npx vitest run --coverage`. Thresholds ajustados para piso real (30/25/30/30) — qualquer regressão quebra o build. E2E mantém só smoke no CI (screenshots diferem entre OS).

### Bugs encontrados na varredura interna (2026-03-19) — TODOS FEITOS

| Bug | Fix |
|-----|-----|
| PDF shapes invisíveis em analytics | `dataConsolidator.ts` agora processa `pdfData.shapes` (+2 testes) |
| Clear All não limpa models em memória (PDF, CSV, Media) | `clearAll()` adicionado em PDF/Media, chamado no callback |
| Orphan markers `codes:[]` no deleteCode | `baseSidebarAdapter.deleteCode()` limpa markers vazios após loop |
| PDF memo perdido em nova seleção | `setMemo` re-query marker via `getMarkers()` em vez de closure stale |
| Media memo: notify em vez de save | `mediaCodingMenu.ts` agora chama `model.save()` |
| Popover listeners vazam no document | `createPopover` usa Map de handles ativos, chama `close()` antes de recriar |

### Bugs encontrados pelo Codex — rodada 3 (2026-03-19) — TODOS FEITOS

| Bug | Fix |
|-----|-----|
| Clear All com Board view aberta — autosave recriava board.json | BoardView escuta `qualia:clear-all`, limpa canvas e cancela timer |
| Clear All com Image view aberta — regiões visíveis após clear | ImageView escuta `qualia:clear-all`, chama cleanup() |
| Clear All não sincroniza AnalyticsView aberta | AnalyticsView escuta `qualia:clear-all`, zera dados e re-renderiza |
| Board addToBoard race — canvasState null durante onOpen | `waitUntilReady()` promise resolve após onOpen completo |
| Image navigation timeout 200ms — falha em máquinas lentas | `waitUntilReady()` promise em ImageView, substitui setTimeout |
| migrateFilePath não atualiza fileStates (Image zoom/pan) | `migrateFilePath()` agora migra `settings.fileStates` |
| migrateFilePath não atualiza fileStates (Media zoom/lastPosition) | `migrateFilePath()` agora migra `settings.fileStates` |
| Color picker cancel deixa refresh suspenso | Listener em `blur` como fallback além de `change` |
| paletteIndex -1 em cor manual | Atribuição explícita: `-1` para manual, `nextPaletteIndex - 1` para auto (+2 testes) |
| Markdown persiste buckets vazios por arquivo | `removeMarker()` deleta entry do Map quando array fica vazio |
| Media mantém files[] vazios após último marker | `removeMarker()` remove file container quando markers fica vazio |

### Padrão emergente: evento `qualia:clear-all` (2026-03-19)

Três views (Board, Image, Analytics) precisavam reagir ao Clear All para limpar state em memória. Em vez de acoplar o comando a cada view, adotamos um custom event `qualia:clear-all` disparado no callback do Clear All. Cada view escuta e faz cleanup independente. Pattern reutilizável para futuras operações globais (ex: import/restore).

### Padrão emergente: `waitUntilReady()` promise (2026-03-19)

BoardView e ImageView agora expõem `waitUntilReady()` que resolve quando o `onOpen`/`loadImage` completa (canvas inicializado, dados carregados). Substitui polling por instanceof e setTimeout fixo. Pattern aplicável a qualquer view que tenha setup assíncrono.

### Bugs encontrados pelo Codex — rodada 4 (2026-03-19) — TODOS FEITOS

| Bug | Fix |
|-----|-----|
| Board onClose salva após clear-all — recria board.json | Flag `cleared` impede save no onClose e scheduleSave |
| waitUntilReady nunca resolve no error path — trava chamadores | BoardView usa try/finally, ImageView resolve no catch |
| Image view race em troca rápida de arquivo | Generation counter (`loadGeneration`) detecta loads stale após await |

### Bugs encontrados pelo Codex — rodada 5 (2026-03-19) — TODOS FEITOS

| Bug | Fix |
|-----|-----|
| PDF hot-reload vaza mousemove/mouseup listeners | `childListeners` Map rastreia listeners por child, cleanup remove todos |
| Media css-change listener acumula a cada troca de arquivo | `offref()` do anterior antes de registrar novo |
| Clear All falha parcial — board.json sobrevive silenciosamente | `clearBoard()` retorna boolean, Notice avisa usuário se falhar |
| Docs: sync mitigation otimista | §7 atualizado: lost update (não só stale read), sem reconciliação em runtime |
| Docs: waitUntilReady drift narrativo | §7 clarifica two-phase (polling + promise) e error paths |

### Observação: singleton leaf por engine (Codex rodada 3)

Helpers manuais (`openImageCodingView`, `openAudioCodingView`, etc.) sempre reutilizam `leaves[0]` mesmo para arquivos diferentes. É outra face do mesmo problema do `leaf.detach()` no fileInterceptor — ambos assumem "uma leaf por engine". Documentado junto no item de multi-pane acima. Fix coordenado quando multi-pane for atacado.

### Observação: sidebar superdocumentada vs capacidade atual

A §3.3 do ARCHITECTURE.md documenta drag-and-drop reorder, merge codes, inline rename, export e hierarquia como justificativa para sidebar. No código atual, o explorer entrega colapso, busca e refresh; o detail entrega cor, descrição e delete. A decisão não está errada (sidebar é o investimento certo para essas features futuras), mas a documentação está à frente da implementação. Manter em mente ao priorizar features.

---

## Feature backlog

### Shape Catalog compartilhado PDF + Image (proposto 2026-03-18)

**Problema:** PDF e Image tem toolbars de drawing independentes com formas hardcoded. Adicionar uma forma nova (ex: estrela) requer mudar ambos os engines separadamente, sem garantia de consistencia visual.

**Proposta:** Catalogo centralizado de shapes + toolbar generica, com renderer especifico por engine.

```
┌─ Shape Catalog (compartilhado) ────────────────────┐
│  ShapeDefinition[]                                  │
│  [rect, circle, star, arrow, freehand, ...]         │
│  Cada shape: type, icon, label, geometry metadata   │
├─────────────────────────────────────────────────────┤
│  Toolbar generica                                   │
│  Renderiza botoes a partir do catalogo              │
│  onSelect(shape) → delega pro engine                │
├─────────────────┬───────────────────────────────────┤
│  PDF renderer   │  Image renderer                   │
│  SVG/DOM overlay│  Fabric.js objects                 │
│  coords % page  │  coords px canvas                 │
└─────────────────┴───────────────────────────────────┘
```

**Ganhos:**
- Consistencia de UX — toolbar identica nos dois engines
- Feature velocity — nova forma = 1 catalog entry + 1 renderer por engine
- Extensibilidade — futuro whiteboard/slides ganha catalogo inteiro
- Testabilidade — catalogo e toolbar sao logica pura, testavel em unit
- Customizacao — base pra "formas favoritas" ou formas custom

**Escopo:**
1. `src/shared/shapeDefinitions.ts` — catalogo + interface ShapeDefinition
2. `src/shared/shapeToolbar.ts` — toolbar generica que renderiza a partir do catalogo
3. `src/pdf/pdfShapeRenderer.ts` — renderer PDF (SVG/DOM) pra cada shape
4. `src/image/canvas/fabricShapeRenderer.ts` — renderer Image (Fabric) pra cada shape
5. Migrar toolbars atuais (drawToolbar.ts, imageToolbar.ts) pro novo sistema

**Dependencias:** Nenhuma. Independente da hierarquia de codigos.

**FEITO (2026-03-18):** Toolbar factory implementada em `src/core/drawToolbarFactory.ts`. PDF (107 → 42 LOC) e Image (180 → 127 LOC) usam a mesma factory com `DRAW_TOOL_BUTTONS` de `shapeTypes.ts`. Adicionar forma nova = 1 entry no catalogo. Renderers especificos de cada engine permanecem separados (Fabric.js vs DOM overlays).

### Unificacao Audio/Video View — avaliar (proposto 2026-03-18)

**Contexto:** `audioView.ts` (387 LOC) e `videoView.ts` (393 LOC) sao ~95% identicos. A base compartilhada ja existe em `media/` (mediaCodingModel, waveformRenderer, regionRenderer, mediaCodingMenu, mediaSidebarAdapter — 987 LOC). A diferenca real entre as views e ~20 LOC:

| Aspecto | Audio | Video |
|---------|-------|-------|
| Media element | Nenhum (WaveSurfer renderiza) | `<video>` element com controls |
| WaveSurfer init | `renderer.create(el, url)` | `renderer.create(el, videoElement)` |
| Settings extras | — | `videoFit: 'contain' \| 'cover'` |
| Icone | `audio-lines` | `video` |

**Opcao A — Manter separado (status quo):**
- Pro: cada view e autocontida, legivel de cima a baixo
- Con: ~350 LOC duplicadas, mudanca num precisa ser replicada no outro

**Opcao B — Unificar em MediaView generica:**
- Pro: elimina ~350 LOC de duplicacao, mudanca aplica nos dois automaticamente
- Con: adiciona complexidade (conditionals `if hasVideo`, generics, ou config object)
- Risco: abstracoes de media player tendem a acumular edge cases (fullscreen, PiP, codec handling)

### CI + E2E reproducibility — status (2026-03-18)

| Item | Status |
|------|--------|
| GitHub Actions unit CI | **FEITO** — `.github/workflows/ci.yml` job `unit-tests` |
| Package reproducibility | **FEITO** — `github:mrlnlms/obsidian-e2e-visual-test-kit` |
| GitHub Actions e2e | **FEITO** — job `e2e-tests` com xvfb + cache Obsidian |

### Incremental refresh/cache por engine (proposto Codex 2026-03-19)

**Problema**: O gargalo futuro mais provável não é `data.json` — é memória e recomputação. CSV/Parquet é lido inteiro em memória (`csvCodingView.ts`), duplicado em `rowDataCache`, e analytics reconsolida tudo via `dataConsolidator.ts` em array unificado a cada refresh. Para vaults médios funciona; para pesquisa pesada (centenas de arquivos codificados, milhares de markers), risco de pressão de heap e latência.

**Proposta**: Cache incremental por engine — cada engine mantém versão consolidada dos seus markers, invalidada por mutation. `dataConsolidator` monta o array final a partir dos caches, sem reconsolidar do zero. Benefício colateral: analytics refresh instantâneo para mutations locais (ex: adicionar 1 código não reprocessa 5000 markers).

**Quando**: Antes de migração de persistência. Este é o próximo passo de arquitetura que dá retorno sem mudar o modelo de dados.

### Board: snapshot vs live-linked (proposto Codex 2026-03-19)

**Problema**: O Research Board captura dados no momento da criação dos nós (snapshot puro). Excerpt nodes, code cards e chart snapshots nunca atualizam se os markers ou códigos mudam depois. Resultado: board pode mostrar dados stale — contagens erradas em code cards, excerpts de markers que foram editados ou deletados, charts desatualizados.

**Opções**:

| Modo | Comportamento | Complexidade |
|------|--------------|-------------|
| **Snapshot (status quo)** | Captura no momento da criação, nunca atualiza | Zero — já funciona |
| **Live-linked** | Nós referenciam markers/códigos por ID, re-renderizam quando dados mudam | Alta — requer subscriptions, invalidation, layout rebuild |
| **Refresh on open** | Snapshot com re-sync quando o board é aberto | Média — reconcilia dados stale no load, sem subscriptions contínuas |

**Recomendação**: "Refresh on open" é o sweet spot — resolve drift sem a complexidade de live subscriptions. Ao abrir o board, reconciliar: remover nós cujo marker/código não existe mais, atualizar contagens de code cards, marcar chart snapshots como "(stale)" se os dados mudaram.

**Dependências**: Nenhuma. Independente de hierarquia e incremental cache.

**Decisao atual:** Manter separado. A duplicacao e barata (~350 LOC) e a clareza compensa.

**FEITO (2026-03-18):** Unificado via composicao. `MediaViewCore` (357 LOC) contem toda a logica compartilhada. `AudioView` (53 LOC) e `VideoView` (54 LOC) sao thin wrappers que herdam direto de `ItemView` e delegam pro core. Heranca intermediaria (`extends MediaView extends ItemView`) nao funciona com Obsidian — composicao resolve.

**Nota:** A consolidacao que vale ja foi feita (MediaCodingModel + 5 modulos compartilhados em media/). O que resta e duplicacao de view/UI, nao de logica.
