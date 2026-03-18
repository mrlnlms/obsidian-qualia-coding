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

Ganho de manutenibilidade alcancado:
- Menu: 1 sistema unificado para TODOS os engines (codingPopover.ts + externalContainer para CM6)
- Audio/Video: corrigir bug em 1 model base, nao 2
- Sidebar: 1 adapter base (BaseSidebarAdapter), listeners unificados

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
| **as any** | 222+ | 4 | -99% |
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
- Type safety: 222 → 4 `as any`, 44 → 3 `@ts-ignore`
- Testes: 1214 testes em 36 suites (Vitest + jsdom), cobrindo core, analytics (exportCSV sync+async, renderMini, renderChart, modes, statsEngine), media, engine models, fileInterceptor
- Registry: auto-persist via onMutate callback em create/update/delete/clear
- Engine registration: retorno explicito {cleanup, model} — zero non-null assertions no main.ts
- Fabric.js: fabricExtensions.d.ts (Canvas, Rect, etc.) + boardTypes.ts (discriminated union por tipo de no)
- Board: zero erros tsc — discriminated union com type guards para narrowing automatico
- Build: `npm run build` passa com zero erros (tsc + esbuild)

---

## 6 `as any` restantes — APIs externas sem tipos

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

### Chart.js wordCloud plugin (1 instancia) — `src/analytics/views/modes/wordCloudMode.ts`

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
| ~~analyticsView.ts split~~ | ~~—~~ | ~~FEITO (2026-03-17)~~ |
| statsEngine.ts split | — | Quando mexer em analytics |
| 3 `as any` PDF viewer | Nao (API interna Obsidian) | Permanente |
| 1 `as any` WaveSurfer event | Sim (module augmentation) | Quando mexer em waveform |
| 1 `as any` Chart.js wordCloud | Sim (module augmentation) | Quando mexer em analytics |
| 1 `as any` viewLookupUtils | Sim (tipar retorno) | Quando mexer em viewLookup |

---

## Cobertura de testes (2026-03-18)

### Visao geral

| Camada | Testes | Suites/Specs | O que cobre |
|--------|--------|-------------|-------------|
| Vitest + jsdom | 1263 | 39 suites | Logica pura: models, engines, helpers, resolvers, registry |
| wdio + Obsidian (e2e) | 27 | 8 specs | UI real: editor, sidebar, analytics, hover, screenshots |
| **Total** | **1290** | **47** | |

### Cobertura unitaria (Vitest) — o que esta coberto

| Modulo | Status | Testes |
|--------|--------|--------|
| core/dataManager | Coberto | load, section, setSection, persistence |
| core/codeDefinitionRegistry | Coberto | CRUD, palette, mutation callbacks |
| core/markerResolvers | Coberto | type guards, getMarkerLabel, shortenPath |
| core/baseSidebarAdapter | Coberto | deletion, code updates, marker fields |
| core/fileInterceptor | Coberto | rules, matching, helpers puros |
| markdown/codeMarkerModel | Coberto | CRUD markers, listeners, hover, migration |
| markdown/markerPositionUtils | Coberto | offsetToPos, classify nesting/overlap |
| pdf/pdfCodingModel | Coberto | CRUD, shapes, undo, listeners (Set) |
| pdf/highlightGeometry | Coberto | rect merging, edge cases |
| image/codingModel | Coberto | CRUD, deletion, hover, listeners |
| csv/codingModel | Coberto | segment/row markers, caching |
| media/mediaCodingModel | Coberto | file CRUD, markers, cleanup |
| media/formatTime | Coberto | edge cases, formatting |
| media/mediaSidebarAdapter | Coberto | hover, display, grouping |
| analytics/statsEngine (6 modulos) | Coberto | frequency, cooccurrence, evolution, sequential, inferential, textAnalysis |
| analytics/statsHelpers | Coberto | applyFilters (direto + via frequency) |
| analytics/textExtractor | Coberto | segmentation, ranges |
| analytics/wordFrequency | Coberto | frequency, filtering |
| analytics/dataConsolidator | Coberto | marker consolidation, filtering |
| analytics/clusterEngine | Coberto | hierarchical clustering, dendrograms |
| analytics/decisionTreeEngine | Coberto | tree construction, Gini |
| analytics/mcaEngine | Coberto | MCA, eigenvalues |
| analytics/mdsEngine | Coberto | MDS, distance preservation |
| analytics/boardTypes | Coberto | type guards, node validation |
| analytics/boardNodes | Coberto | 6 node factories, round-trip |
| analytics/boardClusters | Coberto | clustering por co-ocorrencia |
| analytics/chartHelpers | Coberto | colors, matrix, divergent |
| analytics modes (19) | Parcial | via viewModes, renderChart, renderMini, exportCSV |

### Cobertura e2e (wdio) — componentes UI

| Spec | Testes | Componente | Tipo de validacao |
|------|--------|-----------|-------------------|
| smoke | 3 | Plugin lifecycle | Plugin carrega, arquivo abre, editor visivel |
| margin-panel | 4 | Margin panel CM6 | DOM structure + screenshot + hover |
| highlights | 4 | CM6 decorations | Highlight spans, nested markers, screenshot |
| handle-overlay | 3 | SVG drag handles | Container, handles no hover, screenshot |
| hover-interaction | 3 | Hover sync | Editor↔margin bar sync, clear on leave |
| code-explorer | 4 | Sidebar tree | View renderiza, tree items, code names, screenshot |
| analytics-frequency | 3 | Chart.js bar chart | View, toolbar, chart screenshot |
| analytics-dashboard | 3 | Dashboard KPIs | KPI cards, marker count, screenshot |

### Cobertura e2e completa (atualizada 2026-03-18)

| Spec | Testes | Componente |
|------|--------|-----------|
| smoke | 3 | Plugin lifecycle |
| margin-panel | 4 | Margin panel CM6 |
| highlights | 4 | CM6 decorations |
| handle-overlay | 3 | SVG drag handles |
| hover-interaction | 3 | Hover sync |
| code-explorer | 4 | Sidebar tree |
| analytics-frequency | 3 | Chart.js bar chart |
| analytics-dashboard | 3 | Dashboard KPIs |
| csv-grid | 4 | ag-grid rendering |
| board-view | 3 | Fabric.js canvas |
| settings-tab | 3 | Plugin settings |
| pdf-view | 3 | PDF pages + pdfjs |
| image-view | 3 | Image canvas Fabric.js |
| audio-view | 3 | WaveSurfer waveform |
| video-view | 3 | Video player + timeline |
| **Total** | **49** | **15 specs** |

| code-form-modal | 8 | CodeFormModal (Add Code) |
| code-browser-modal | 5 | CodeBrowserModal (All Codes) |
| column-toggle-modal | 3 | ColumnToggleModal (CSV) |
| **Total** | **65** | **18 specs** |

### O que NAO esta coberto (baixissimo risco)

| Categoria | Modulos | Razao |
|-----------|---------|-------|
| Config sections (12 modes) | renderOptionsSection | DOM puro, sem logica |
| CM6 internals | markerStateField, selectionMenuField, hoverBridge | Reativos, testados indiretamente via e2e |

Todos os engines (markdown, PDF, image, CSV, audio, video), views (analytics, board, explorer, settings) e modais (form, browser, column toggle) tem baseline visual.
