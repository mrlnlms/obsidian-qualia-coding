# Qualia Coding — Project History

> Cronologia completa do projeto: da origem como plugin isolado até a consolidação em plataforma unificada. Preserva decisões, jornada de desenvolvimento, e contexto que explica por que o código é como é.
>
> Para a pré-história (2023-2024: do Notion ao primeiro protótipo), ver `PREHISTORY.md`.

---

## Timeline

```
2026-02 early    Plugin "obsidian-codemarker-v2" (markdown) — primeiros highlights CM6
2026-02-16       Hover menu implementado (Approach C)
2026-02-17       CodeDefinition Registry, Margin Panel, Bidirectional Hover
2026-02-18       Code Detail View, Code Explorer
2026-02-19..22   PDF, CSV, Image, Audio, Video como plugins separados
2026-02-23..25   Analytics plugin (17 ViewModes + Research Board)
2026-02-26       Decisão de consolidar tudo em 1 plugin ("Qualia Coding")
2026-02-27       MERGE-PLAN.md + APPROACH2.md
2026-02-28       APPROACH3.md (execução final)
2026-02-28..03-01  Camadas 1-11 do merge executadas
2026-03-01       Plugin consolidado funcional — 7 engines, sidebar unificada
2026-03-02       Documentação unificada (este arquivo)
```

---

## Fase 1: Plugin Markdown Isolado

### Origem: "mqda"

O projeto nasceu como tentativa de criar um plugin QDA para Obsidian, inspirado em ATLAS.ti e MAXQDA. O primeiro nome foi `mqda`, depois renomeado para `obsidian-codemarker-v2`.

### A Jornada dos 3 Menu Approaches

**O problema central**: Como mostrar um menu de codificação quando o usuário seleciona texto no editor CM6?

**Approach A — Obsidian native Menu**
- Implementação: `new Menu()` do Obsidian API
- Problema: CM6 perde a seleção visual quando foco vai para o menu nativo
- Status: Funcional, preservado como fallback (`obsidianMenu.ts`)

**Approach B — CM6 HTML Tooltip**
- Implementação: `Tooltip` do CM6 com HTML manual
- Problema: Styling manual, não herda tema do Obsidian
- Status: Funcional, preservado como fallback (`cm6TooltipMenu.ts`)

**Approach C — CM6 + Obsidian Components** ✅ ATIVO
- Implementação: `Tooltip` do CM6 com `TextComponent`/`ToggleComponent` nativos
- Breakthrough: `getComputedStyle(document.body)` para injetar CSS vars como inline styles

**O "Dark Mode Breakthrough"**: CSS variables do Obsidian não cascatam para tooltips CM6 (DOM separado). A descoberta de ler computed styles e copiar como inline styles desbloqueou toda a UI.

### Frozen Version

Antes da reescrita para overlay handles, foi criada uma versão congelada:
- Commit: `b6bb6cf`, tag: `v0-pre-overlay`
- Plugin: `obsidian-codemarker-v2-frozen`
- Usa `Decoration.widget` para handles (funcional, mas causa word-wrap reflow)
- **Cuidado**: View type constants compartilhados — ativar ambos os plugins causa conflito

### Handle Overlay Decision

**Problema**: `Decoration.widget()` insere elementos inline → causa reflow de word-wrap em linhas longas.

**Solução**: Migrar handles para overlay div no `scrollDOM`, posicionados com `coordsAtPos` + `requestMeasure`.

**Trade-off**: Complexidade de eventos (overlay não recebe eventos do contentDOM), mas zero impacto visual no texto.

### Margin Panel (7 commits para versão final)

Evolução incremental:
1. Protótipo: barras fixas ao lado do texto
2. Collision avoidance: labels não sobrepõem
3. Dinâmica de largura: RLL (Readable Line Length) adaptativa
4. Hover bidirecional: panel ↔ editor sync
5. Label truncation: `-14px` vs `-4px` alignment fix
6. Theme awareness: colors from computed styles
7. Multi-marker stacking: múltiplos códigos por região

### POC: Margin Panel Resize Handle

**Data**: 2026-02-27. Prova de conceito para drag-to-resize no margin panel.

**Descobertas**:
- Handle não pode ser filho do panel — `innerHTML = ''` no `renderBrackets()` destrói
- Precisa viver no `scrollDOM`, com z-index ≥ 10
- `position: absolute; top:0; bottom:0` não cobre scroll height no panel
- UX ficou sutil demais — precisaria de grip dots

**Status**: Stashed no git, não integrado. Alternativas: CSS `resize: horizontal` ou setting numérico.

### Bugs Notáveis e Seus Fixes

**Stacked Label Click Bug**:
- Primeiro click funciona, segundo falha
- Root cause (cascata de 5 passos): `revealLeaf()` → cm-focused removed → MutationObserver after suppression → `renderBrackets()` loop → DOM destroyed each frame
- Fix de 3 camadas: self-suppression + hover fallback + remove revealLeaf on existing

**Hover Underline Race Condition**:
- `applyHoverClasses()` → `setHoverEffect` dispatch → decoration rebuild → DOM change → MutationObserver → `renderBrackets()` → classes lost
- Fix: chamar `applyHoverClasses()` no final de `renderBrackets()`

**Handle Drag + Hover Menu Conflict**:
- Drag no resize handle com hover menu aberto deixa menu visível
- Fix: tratar click no handle como mouse-out

---

## Fase 2: Plugins Separados (7 plugins)

### Ecossistema CodeMarker Suite

A decisão foi criar 7 plugins independentes, cada um com seu package.json e build:

| Plugin | LOC | Lib principal |
|--------|-----|---------------|
| `obsidian-codemarker-v2` | ~4.600 | CM6 (nativo) |
| `obsidian-codemarker-pdf` | ~5.244 | PDF.js (via Obsidian) |
| `obsidian-codemarker-csv` | ~8.201 | AG Grid + PapaParse |
| `obsidian-codemarker-image` | ~2.840 | Fabric.js 6.6 |
| `obsidian-codemarker-audio` | ~250 + shared | WaveSurfer.js 7 |
| `obsidian-codemarker-video` | ~350 + shared | WaveSurfer.js 7 |
| `obsidian-codemarker-analytics` | ~11.147 | Chart.js + Fabric.js |

### Shared Registry (Cross-Plugin)

Comunicação entre plugins independentes via `.obsidian/codemarker-shared/registry.json`:
- Cada plugin lê/escreve para arquivo compartilhado
- Merge por `updatedAt` timestamp
- **Eliminado no merge** — substituído por `CodeDefinitionRegistry` único em memória

### Problemas do Modelo Multi-Plugin

1. **Instalação complexa**: Usuário precisa instalar 7 plugins separados
2. **Duplicação massiva**: `CodeDefinitionRegistry`, `CodeFormModal`, `SharedRegistry`, sidebar views — todos duplicados em cada plugin
3. **Sync frágil**: Registry sync via arquivo funciona mas tem race conditions
4. **Bundle bloat**: Cada plugin bundla Fabric.js/Chart.js/AG Grid separadamente
5. **UX fragmentada**: 7 setting tabs, 14 sidebar views, 7 registrations

Esses problemas motivaram a consolidação.

---

## Fase 3: A Consolidação (APPROACH3)

### Decisão (2026-02-26)

Consolidar 7 plugins em 1 único plugin `qualia-coding`. Motivação:
- Instalação simples (1 plugin)
- Zero duplicação de código
- Registry em memória (sem file sync)
- Sidebar unificada
- Bundle otimizado

### MERGE-PLAN.md: 30 Decisões (D1-D30)

O planejamento gerou 30 decisões documentadas. As mais importantes com justificativas:

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | Monorepo com 1 package.json | Evita abstrações contra código que não compila junto |
| D3 | CSV segment editor acopla markdown | Segment editor é literalmente um editor markdown embutido numa célula |
| D5 | data.json unificado com seções tipadas | 7 arquivos → 1 com seções. Analytics chega por último |
| D6 | Views lazy no registerView | registerView() síncrono no onload(), conteúdo lazy |
| D8 | Tests manuais, não e2e | Se quebrar, conserta o merge |
| D10 | Sem automação de UI | Automação de UI em Obsidian não vale o custo |
| D12 | Multi-build (não code splitting) | `splitting: true` exige ESM (incompatível com Obsidian) |
| D15 | Manter CSS prefixes existentes | Zero colisões confirmadas. Rename para `qc-*` = alto risco, zero benefício |
| D16 | CSV standalone editor dedup | CSV standalone duplicava 5 CM6 extensions do v2. No merge → decorations duplicados |
| D21 | Registry migration (3 formatos) | v2 flat, CSV/Image/PDF nested `registry`, Audio/Video nested `codeDefinitions`. Merge by updatedAt |
| D24 | 4 IDs idênticos v2↔CSV → markdown owns | No merge, markdown engine é o dono |
| D25 | CSS concat com dedup | Divergência em `.codemarker-code-form .cm-form-actions` |
| D27 | Settings tab unificada | 2 tabs "Code Marker" idênticas é confuso |
| D28 | CSV dedup (4 commands, editor-menu, file-menu, ribbon) | Remove duplicatas que agora vivem no core |
| D30 | 7 shared popover functions | `createPopover()`, `renderCodeInput()`, `renderToggleList()`, `createActionItem()`, `createSeparator()`, `applyThemeColors()`, `positionAndClamp()` |

Agrupamento geral:
- D1-D5: Estrutura de diretórios, data model, view types
- D6-D10: Settings, registry, DataManager, sidebar unification
- D11-D15: CSS consolidation, event naming, cleanup patterns
- D16-D20: Analytics integration, board migration, lazy loading
- D21-D25: File intercept, type guards, navigation events
- D26-D30: CSV dedup, AG Grid config, esbuild setup

### Execução: 12 Camadas

**Abordagem**: Bottom-up, camada por camada, smoke test a cada passo.

| Camada | Escopo | Status |
|--------|--------|--------|
| 0 | Scaffold (package.json, tsconfig, esbuild) | ✅ |
| 1 | Core shared (types, DataManager, registry) | ✅ |
| 2 | Markdown model + CM6 extensions | ✅ |
| 3 | Markdown menu (Approach C) | ✅ |
| 4 | Markdown sidebar (Explorer + Detail) | ✅ |
| 5 | Markdown settings + commands | ✅ |
| 6 | PDF engine | ✅ |
| 7 | PDF sidebar + drawing | ✅ |
| 8 | Unified sidebar (UnifiedModelAdapter) | ✅ |
| 9 | CSV engine | ✅ |
| 10 | Image + Audio + Video engines | ✅ |
| 11 | Analytics engine + Research Board | ✅ |
| 12 | ~~Lazy Loading~~ | Descartado (ver ARCHITECTURE.md §3.10) |

### Deduplication Results

| Componente | Antes | Depois | Redução |
|-----------|-------|--------|---------|
| CodeDefinitionRegistry | 6 cópias | 1 | 83% |
| CodeFormModal | 5 cópias | 1 | 80% |
| SharedRegistry | 6 cópias | 0 (eliminado) | 100% |
| Coding menus | 5 implementações | 1 (`codingPopover.ts`) | 56% LOC |
| Sidebar views | 12 views | 2 unified + base classes | 68% LOC |
| Settings tabs | 7 tabs | 1 | 86% |

### View Type IDs (Old → New)

| Engine | Old | New |
|--------|-----|-----|
| Markdown Explorer | `codemarker-code-explorer` | `qualia-code-explorer` |
| Markdown Detail | `codemarker-code-detail` | `qualia-code-detail` |
| PDF Coding | `codemarker-pdf-coding` | `qualia-pdf-coding` |
| PDF Explorer | `codemarker-pdf-explorer` | `qualia-pdf-explorer` |
| PDF Detail | `codemarker-pdf-detail` | `qualia-pdf-detail` |
| CSV Coding | `codemarker-csv-coding` | `qualia-csv-coding` |
| Image Coding | `codemarker-image-coding` | `qualia-image-coding` |
| Audio Coding | `codemarker-audio-coding` | `qualia-audio-coding` |
| Video Coding | `codemarker-video-coding` | `qualia-video-coding` |
| Analytics | `codemarker-analytics` | `qualia-analytics` |

### Custom Events (Rename Audit)

| Old | New |
|-----|-----|
| `codemarker-pdf:navigate` | (kept) |
| `codemarker-image:navigate` | (kept) |
| `codemarker-csv:navigate` | (kept) |
| `codemarker-audio:seek` | (kept) |
| `codemarker-video:seek` | (kept) |

### Lazy Loading Target Sizes (from MERGE-PLAN)

```
main.js              ~210KB  (core + markdown + PDF, eager)
engines/csv.js       ~2.0MB  (AG Grid)
engines/image.js     ~466KB  (Fabric.js)
engines/audio.js     ~216KB  (WaveSurfer)
engines/video.js     ~216KB  (WaveSurfer)
engines/analytics.js ~1.4MB  (Chart.js + Fabric.js)
```

### Approach Comparison Note

APPROACH2 (per-layer, cross-engine) foi escolhida sobre MERGE-PLAN (per-engine) porque: "O compartilhamento é nativo desde o início — core/ nasce na camada 2." Framework mental model: "qualia-coding é um framework de análise qualitativa. Os 7 engines são a prova de que o framework funciona."

### Settings Wiring

| Setting | Runtime Location |
|---------|-----------------|
| defaultColor | codeMarkerModel, cm6NativeTooltipMenu |
| markerOpacity | markerStateField (reactive rebuild) |
| showHandlesOnHover | markerViewPlugin (reactive rebuild) |
| showMenuOnSelection | markerViewPlugin |
| showMenuOnRightClick | index.ts editor-menu handler |
| showRibbonButton | index.ts ribbon callback |
| autoRevealOnSegmentClick | baseCodeDetailView getter |

### Porting Playbook

A experiência de portar cada engine gerou um checklist definitivo de 11 pontos (documentado em `DEVELOPMENT.md`). O Image engine levou 6 iterações — as lições foram destiladas no playbook.

### Bugs Encontrados no Merge

5 bugs descobertos durante análise cross-engine:
1. CSV sidebar duplicates com prefixo `csv:` no fileId
2. AG Grid header button re-injection após DOM rebuild
3. PDF undo stack leak (máximo 50 entries não enforced)
4. Audio minimap não atualizava em delete de marker
5. Analytics `createdAt` missing em markers antigos (fix: fallback `Date.now()`)

---

## Fase 4: Estado Atual (2026-03-02)

### O que está feito
- 7 engines funcionais em plugin único
- Sidebar unificada (Explorer + Detail) para todos os formatos
- 19 ViewModes analíticos + Research Board
- Settings consolidado
- ~29.000 linhas de TypeScript
- Build passando (`npm run build`)

### O que falta
- ~~**Camada 12**: Lazy Loading~~ — descartado (ESM incompatível com Obsidian, 2.17 MB não é problema real). Ver `ARCHITECTURE.md` §3.10.
- **Features novas**: Code Hierarchy, Projects/Workspace, e mais (ver `ROADMAP.md`)
- **Documentation cleanup**: Remover docs antigos do merge após validação

---

## Worklog: Sessões Documentadas

### 2026-02-16 — Hover Menu

- Implementação de Approach C (CM6 + Obsidian Components)
- Dark mode breakthrough via `getComputedStyle`
- Selection preview para manter visual de seleção
- Nav arrows no popover para navegação Code Explorer ↔ Code Detail

**7 Decisões**:
1. Selection preview — `Decoration.mark` simula seleção quando foco vai pra tooltip/modal
2. 400ms open delay — previne hover acidental ao mover mouse
3. Close delay 300ms — evita flicker ao mover mouse entre highlight e tooltip
4. v0 mostra todos os codes (v1 planejado: filtrar para apenas os codes do marker)
5. Deferred deletion planejada para v1 — marker vazio limpo só quando menu fecha
6. Arquivo isolado `hoverMenuExtension.ts` — separação clara do selection menu
7. Git branch `feat/hover-menu`

**Arquivos modificados**: `hoverMenuExtension.ts` (novo), `menuTypes.ts`, `selectionMenuField.ts`, `cm6NativeTooltipMenu.ts`, `main.ts`

**v0 pendências**: filtrar menu para codes do marker, deferred deletion, esconder action buttons irrelevantes, click highlight → sidebar integration, extrair `getMarkerAtPos` para shared util

### 2026-02-17 — Registry + Panel + Sidebar

**Manhã**: CodeDefinition Registry (Fase 1)
- 12-color auto-palette categórica com distinctiveness categórica (não gradient)
- `consumeNextPaletteColor()` — assignment sequencial da paleta
- Persistência via `loadData`/`saveData`
- Registry serializado junto com data.json via `fromJSON()`
- Auto-migration extrai codes de markers existentes
- Integração com tooltip menu (cor + toggle)

**Tarde**: Margin Panel MAXQDA-style

7 commits para a versão final:
```
6643a4f Prototype: margin panel
e0c3648 Refactor margin panel
e942152 MAXQDA-style bars
10e1574 Dynamic label space
f79d808 Align margin panel to content edge
29c9b95 Fix panel overlap when RLL is off
4d58f39 Fix margin panel not updating on inline title toggle
```

- 539 LOC, collision avoidance para labels
- `coordsAtPos` para posicionamento em linhas wrappadas
- Bidirectional hover com `setHoverEffect` compartilhado

4 design decisions:
1. Columns by span — barras maiores ficam na coluna mais à direita (perto do texto)
2. Labels centrados com weighted collision avoidance — barra maior mantém posição
3. RLL detection para margem esquerda natural — `effectivePanelWidth = panelWidth + extraSpace`
4. MutationObserver para inline title toggle — self-suppression com `suppressMutationUntil`

**Noite**: Code Detail + Code Explorer
- Dois modos no mesmo ItemView — evita duplicação de views
- `getAllMarkers()` no model — simples, itera Map interno
- Back button com `setIcon('arrow-left')` — padrão Obsidian
- Command aponta pra `revealCodeExplorer()` que usa `CODE_DETAIL_VIEW_TYPE`
- 3 modos no Detail (list, code-focused, marker-focused)
- 3 níveis no Explorer (Code → File → Segment)
- Footer com total de codes e segments
- Selection Preview commit: `be9d862` — `setSelectionPreviewEffect` before modal, `onDismiss` callback, "Remove Code" + "Remove All Codes" merged into "Remove Codes"
- Stacked label click bug — fix de 3 camadas
- Hover underline race condition — fix no `renderBrackets()`

### 2026-02-19..22 — Engines Especializados

- **PDF**: Coordinate system conversion, margin panel "page push", SVG drawing overlay, text layer version compat
- **CSV**: AG Grid integration, segment editor com CM6, virtual fileId system, batch coding
- **Image**: Fabric.js canvas, normalized coords, 3 shape types, zoom/pan controls
- **Audio**: WaveSurfer lifecycle, vertical lanes, shadow DOM workaround, minimap markers
- **Video**: Fork do audio + `<video>` element, file rename tracking

### 2026-02-23..25 — Analytics

- 17 ViewModes implementados
- 6 computation engines (stats, cluster, MCA, MDS, word frequency, decision tree)
- Research Board com Fabric.js (6 tipos de nó, arrows, clusters)
- Data consolidation across 7 sources

### 2026-02-26..03-01 — The Great Merge

- MERGE-PLAN com 30 decisões
- APPROACH3 com 12 camadas de execução
- Porting de cada engine com playbook de 11 pontos
- Deduplication: ~68% redução em sidebar code, 100% eliminação do SharedRegistry
- 5 bugs encontrados e corrigidos
- Plugin consolidado funcional

### 2026-03-01..02 — Post-Merge Fixes & Enhancements

Items resolvidos após a consolidação:

**v0 Fixes**:
- Markdown: filtrar hover toggles para só códigos do marker atual
- Markdown: fix handle drag + hover menu interaction (`codemarker-dragging` body class)
- Markdown: detail view `changeListener` — `onChange` auto-refresh na base class
- Markdown: color swatches no toggle list (Approach C)
- Markdown: settings tab (8 settings persistidos, reativos)
- Audio/Video: `updatedAt` adicionado ao `MediaMarker`, setado em criação + mutações
- Image: CSS classes custom `codemarker-tree-*` removidas (dead code)
- File interceptor: abas duplicadas — verifica leaf existente antes de criar nova
- Margin panel, hover menu e handles quebravam após rename — 3 extensions CM6 não escutavam `setFileIdEffect`
- PDF: per-code color blending — N layers sobrepostos com `opacity/N`
- Sidebar: flicker no hover dos segments — CSS corrompido com vírgulas órfãs

**Curto prazo concluídos**:
- CSV: suporte Parquet — `hyparquet` + `parseTabularFile()`, `registerExtensions(['csv', 'parquet'])`
- Markdown: search/filter no Code Explorer — `SearchComponent` em `baseCodeExplorerView.ts`
- Sidebar unificada cross-engine — `UnifiedModelAdapter` mergea 6 engines
- Analytics: cross-source comparison view — view `source-comparison`

**Médio prazo concluídos**:
- Markdown: per-code decorations — N decorations sobrepostas com opacity/N
- Analytics: code overlap analysis — `calculateOverlap()` em statsEngine
- Image: per-file state persistence (zoom, pan) — `fileStates` no settings
- Image: memo field nos markers
- Image: file rename tracking — `migrateFilePath()` no ImageCodingModel
- File rename tracking centralizado — `fileInterceptor.ts` com `registerFileRename()`, todos 6 engines

---

## Decisões que NÃO foram tomadas (ainda em aberto)

1. **Flat list + tree no code-focused detail** — manter ambos ou só um?
2. **Interaction design para Code Hierarchy** — como o usuário cria/move códigos na árvore?
3. **Mobile support** — testar sidebar behavior no Obsidian mobile
4. **Plugin conflicts** — testar com Highlighter, Comments, PDF++ simultaneamente
5. **Performance com 500+ markers** — interval tree necessário ou linear scan suficiente?

---

## Source Lineage

Alguns arquivos foram adaptados de projetos open-source:

| Arquivo no qualia-coding | Origem | Licença |
|-------------------------|--------|---------|
| PDF highlight geometry | obsidian-pdf-plus (MIT) | MIT |
| PDF text layer compat | obsidian-pdf-plus (MIT) | MIT |
| PDF viewer instrumentation | obsidian-pdf-plus (MIT) | MIT |

---

## Consolidacao tecnica (2026-03-07 a 2026-03-19)

> Items originalmente no BACKLOG.md, movidos para ca apos resolucao.

### Metricas de evolucao

| Metrica | 7 plugins | Pos-consolidacao | Delta |
|---------|-----------|-----------------|-------|
| **LOC (src/*.ts)** | 38.067 | ~28.700 | **-25%** |
| **CSS** | ~4.500 | 4.010 | **-11%** |
| **Maior arquivo** | 11.147 | ~250 | **-98%** |
| **Testes** | 0 | 1.568 (1503 unit + 65 e2e) | +1.568 |
| **as any** | 222+ | 6 | **-97%** |
| **@ts-ignore** | 44+ | 3 | **-93%** |
| **tsc errors** | 82 | 0 | **-100%** |

### Refactors executados (57 commits, ~1.360 LOC eliminadas)

- Menu consolidation: 3 niveis (helpers → adapter → audio+video merge) — 1 sistema para todos os engines
- Audio/Video merge: 2 models identicos → MediaCodingModel + MediaViewCore (composicao)
- analyticsView split: 5.907 LOC → 798 + 19 mode modules
- statsEngine split: 951 → 6 modulos + barrel
- boardNodes split: 825 → 14 (barrel) + 6 arquivos em nodes/
- csvCodingView split: 801 → 210 (orquestrador puro)
- Dead code: ~293 LOC eliminadas (views substituidas pelas unified)
- CSS: namespace unificado (codemarker-popover), classes orfas removidas
- BaseSidebarAdapter: base class para todos os sidebar adapters
- Type safety: `as any` 222→6, `@ts-ignore` 44→3, 82→0 erros tsc
- Naming: `file`→`fileId`, `note`→`memo`, `deleteMarker`→`removeMarker`, `colorOverride` em todos os tipos
- Registry: auto-persist via onMutate callback
- Engine registration: retorno explicito `{cleanup, model}`
- Fabric.js: `fabricExtensions.d.ts` + `boardTypes.ts` (discriminated union)
- drawToolbarFactory: catalogo compartilhado PDF + Image

### Bugs corrigidos (36 bugs em 10 rodadas de audit + Codex)

- Registry rename collision
- Clear All nao limpava Board/Image/Analytics/models em memoria
- PDF shapes invisiveis em analytics
- Orphan markers `codes:[]` no deleteCode
- PDF memo perdido em nova selecao
- Media memo: notify em vez de save
- Popover listeners vazam no document
- Board autosave recriava board.json apos clear
- Image view race em troca rapida de arquivo
- Board addToBoard race (canvasState null)
- Image navigation timeout (200ms → waitUntilReady promise)
- migrateFilePath nao atualizava fileStates (Image + Media)
- Color picker cancel deixa refresh suspenso
- paletteIndex -1 em cor manual
- Markdown persiste buckets vazios
- Media mantem files[] vazios apos ultimo marker
- PDF hot-reload vaza listeners
- Media css-change listener acumula
- Text Retrieval navegava audio/video com evento errado
- Analytics async render race (troca rapida de mode)
- Frequency mode omitia video
- PDF undo restaura code names renomeados/deletados
- Parquet non-string cells crash
- CSV chip click era no-op
- CSV sidebar adapter nao passava memo/colorOverride
- Rename nao atualizava codeName no detail view
- Registry mutations nao propagavam para sidebar
- Board readyPromise one-shot + cleared nao resetava
- ImageView race close durante await
- dashboardMode thumbnails em branco (silenciado por try/catch)

### Acessibilidade e CSS (audit 2026-03-19)

- 5 hardcoded colors → CSS variables (theme-safe)
- Focus-visible styles em ~30 botoes interativos
- aria-labels em drawToolbar, analytics, detailView
- DT distribution bars: title attributes com % e contagem
- !important: 74 → 66 (6 removidos safe)
- Inline styles: 15 migrados para 3 CSS classes (regionRenderer)

### Suite de testes (0 → 1.568)

- Vitest + jsdom: 1.503 testes em 50 suites (32 modulos de logica pura)
- wdio + Obsidian: 65 testes em 18 specs (6 engines + analytics + sidebar + modais)
- CI: GitHub Actions com unit + coverage gate + e2e smoke via xvfb
- Harness e2e: `obsidian-e2e-visual-test-kit` (repo publico)

### Patterns emergentes

- `qualia:clear-all` event — views limpam state em memoria independentemente
- `qualia:registry-changed` + `qualia:code-renamed` — sidebar views refresham
- `waitUntilReady()` promise — substitui polling em views com setup assincrono

---

## Fontes

Este documento consolida:
- `docs/markdown/WORKLOG.md` — log de sessões
- `docs/markdown/DEVELOPMENT.md` — jornada de dev, 3 approaches, dark mode
- `docs/MERGE-PLAN.md` — 30 decisões, inventário, deduplication
- `docs/APPROACH3.md` — execução do merge em 12 camadas
- `docs/APPROACH2.md` — abordagem alternativa (superseded)
- `docs/SOURCE-FILES.md` — checklist de 141 arquivos portados
- `docs/markdown/BRANCH-SWITCH.md` — instrução de branch switching
- `docs/markdown/POC-RESIZE-HANDLE.md` — POC de resize handle
- `memory/MEMORY.md` (code-maker-v2) — estado do merge e pendências
- `memory/image-engine-briefing.md` — briefing de porting do Image
