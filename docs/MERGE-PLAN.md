# Plano: Merge 7 Plugins → Qualia Coding

> **Nota:** Este é o plano original (MERGE-PLAN). O projeto seguiu o **APPROACH2.md** (merge por camada cross-engine), que reorganiza as fases em 10 camadas. Consultar APPROACH2.md para status atual. Este documento é mantido como referência para decisões (D1-D30), backlogs e smoke tests.

## Contexto

7 plugins CodeMarker, ~38K LOC, código duplicado massivamente. Dados descartáveis, sem users, sem backward compat. Objetivo: 1 plugin funcional chamado **qualia-coding**, 6 morrem.

### Plugins a consolidar

| Plugin | Path | LOC | Deps externas | Arquivos-chave |
|--------|------|-----|---------------|----------------|
| v2 (markdown) | `.obsidian/plugins/obsidian-codemarker-v2/` | 5,305 | nenhuma | `src/main.ts`, `src/models/`, `src/cm6/`, `src/views/` |
| CSV | `.obsidian/plugins/obsidian-codemarker-csv/` | 8,201 | ag-grid-community, papaparse | `src/main.ts`, `src/coding/`, `src/views/` |
| Image | `.obsidian/plugins/obsidian-codemarker-image/` | 2,840 | fabric ^6.6.1 | `src/main.ts`, `src/coding/`, `src/canvas/` |
| PDF | `.obsidian/plugins/obsidian-codemarker-pdf/` | 5,244 | nenhuma (PDF.js nativo) | `src/main.ts`, `src/coding/`, `src/pdf/` |
| Audio | `.obsidian/plugins/obsidian-codemarker-audio/` | 2,650 | wavesurfer.js ^7 | `src/main.ts`, `src/coding/`, `src/audio/` |
| Video | `.obsidian/plugins/obsidian-codemarker-video/` | 2,680 | wavesurfer.js ^7 | `src/main.ts`, `src/coding/`, `src/video/` |
| Analytics | `.obsidian/plugins/obsidian-codemarker-analytics/` | 11,147 | chart.js, fabric ^6.9.1, svd-js, date-fns | `src/main.ts`, `src/data/`, `src/views/`, `src/board/` |

### Código duplicado entre plugins (será eliminado)

| Arquivo | Cópias | Onde está |
|---------|--------|----------|
| `sharedRegistry.ts` | 7 | `src/models/` (v2, CSV) ou `src/coding/` (Image, PDF, Audio, Video) — Analytics não tem |
| `codeDefinitionRegistry.ts` | 6 | mesmos paths acima |
| `codeFormModal.ts` | 5 | v2, CSV, PDF, Audio, Video |
| Detail views (3-mode) | 6 | `codeDetailView.ts`, `csvCodeDetailView.ts`, `imageCodeDetailView.ts`, etc |
| Explorer views (3-level tree) | 6 | `codeExplorerView.ts`, `csvCodeExplorerView.ts`, etc |

### Documentação existente por plugin

| Plugin | Docs encontrados |
|--------|-----------------|
| v2 | README.md, ARCHITECTURE.md (142KB, 9 partes), CLAUDE.md, COMPONENTS.md, DEVELOPMENT.md, WORKLOG.md |
| CSV | TODO.md (Parquet roadmap) |
| PDF | CLAUDE.md |
| Audio | BRIEFING.md, CLAUDE.md |
| Image | nenhum doc dedicado |
| Video | nenhum doc dedicado |
| Analytics | ROADMAP.md |

### Shared registry (será morto)

- Path: `.obsidian/codemarker-shared/registry.json`
- Usado pelas 7 cópias de `sharedRegistry.ts` para sync cross-plugin
- No plugin unificado: codebook vive dentro do `data.json`, shared registry deletado

---

## Decisões Resolvidas

| # | Decisão | Resolução | Justificativa |
|---|---------|-----------|---------------|
| D1 | Abstrair quando | Juntar primeiro, abstrair depois (Phase 4) | Evita escrever abstrações contra código que não compila junto |
| D2 | Ordem engines | PDF → CSV → Image → Audio → Video → Analytics | CSV é killer feature, prioriza valor. PDF primeiro porque é zero deps |
| D3 | CSV ↔ markdown CM6 | Import direto de `src/markdown/cm6/` | Segment editor é literalmente um editor markdown embutido numa célula. Acoplamento intencional |
| D4 | Schema quando | Types na Phase 1, persistência no formato novo desde o início | Cada engine já escreve no formato novo, não porta duas vezes |
| D5 | dataReader | Reescrito (não simplificado) | Interface muda: 7 arquivos → 1 com seções tipadas. Analytics chega por último, tudo já no formato novo |
| D6 | Lazy loading | Factory + `await import()` no onOpen() | registerView() síncrono no onload(), conteúdo lazy |
| D7 | Shared registry | Morto | Codebook no data.json. Sem backward compat |
| D8 | Rollback | Não existe | Se quebrar, conserta o merge |
| D9 | Settings | Namespace por engine | `settings.markdown.*`, `settings.csv.*`, etc |
| D10 | Testes | Smoke test manual por engine (checklist) | Automação de UI em Obsidian não vale o custo |
| D11 | Persistência compartilhada | DataManager centralizado em `src/core/dataManager.ts` | Engines nunca chamam `loadData()`/`saveData()` direto. Estado in-memory único + 1 timer debounced 500ms. Elimina race condition entre engines |
| D12 | Lazy loading CJS | Phase 2: bundle único (~4.5MB). Phase 3: multi-build esbuild → arquivos separados por engine + `require()` on demand | `splitting: true` exige ESM (incompatível com Obsidian). Multi-build com require relativo funciona em Electron |
| D13 | Cleanup engines | `registerXxxEngine()` retorna `EngineCleanup` function | Padrão leve (~10 LOC/engine). main.ts executa cleanups em ordem reversa no `onunload()`. PDF preserva pattern manual de observers/interactions/toolbars |
| D14 | Default data | `createDefaultData()` factory + shallow merge no `DataManager.load()` | `loadData()` retorna null na primeira execução. Factory cria estrutura completa para todos engines |
| D15 | CSS strategy | Concatenação simples, SEM rename | Zero colisões confirmadas. Cada plugin já usa prefixo único. Rename para `qc-*` seria alto risco, zero benefício |
| D16 | CM6 registration ownership | Apenas markdown engine chama `registerEditorExtension()`. CSV e futuros engines usam extensions diretamente no EditorView constructor | CSV standalone duplicava as 5 CM6 extensions do v2. No merge, isso causa decorations/tooltips duplicados |
| D17 | Phase 0 main.ts | Phase 0: main.ts simples sem core/. Phase 1: refatora para DataManager + cleanups | core/ não existe em Phase 0 |
| D18 | esbuild external syntax | Lista explícita por engine, sem glob | esbuild `external` não suporta glob patterns |
| D19 | board.json path | Atualizar para `.obsidian/plugins/qualia-coding/board.json` | Path atual aponta para diretório do plugin antigo |
| D20 | View type ID rename | Rename explícito em cada Phase 2.x. Tabela de IDs antigo→novo no Phase 0 | 21 IDs + 7 events espalhados em ~30 arquivos |
| D21 | Registry migration | `DataManager.load()` normaliza 3 formatos legacy: v2 flat, CSV/Image/PDF nested `registry`, Audio/Video nested `codeDefinitions`. Merge por `updatedAt`. Resultado em `QualiaData.registry` único | 3 formatos diferentes nos data.json atuais |
| D22 | `codeDescriptions` legacy | Stripped em `DataManager.load()`. Valores migrados para `registry.definitions[name].description` se ausentes | v2 salva campo redundante que não está no schema |
| D23 | viewLookupUtils.ts canonical | Versão CSV (92 LOC, com standalone registry) é a canônica. Vai para `src/markdown/cm6/utils/viewLookupUtils.ts`. CSV importa de lá | CSV superset do v2. Standalone registry necessário para segment editors |
| D24 | Command dedup v2/CSV | Markdown engine registra os 4 comandos compartilhados. CSV deleta suas cópias, mantém só os 4 próprios (`open-csv-code-explorer`, etc.) | 4 IDs idênticos entre v2 e CSV. No merge, markdown engine é o dono |
| D25 | CSS concat order | v2 > PDF > CSV > Image > Audio > Video > Analytics. Dedup de blocos idênticos (manter primeira ocorrência = v2) | Uma divergência em `.cm-form-actions` padding — v2 como canonical resolve |
| D26 | tsconfig.json unificado | Baseado no v2 (mais estrito) com ajustes: `baseUrl: "."`, `lib` inclui `ESNext`, `skipLibCheck: true` no json (não no CLI). `outDir` omitido (esbuild controla output). `@types/papaparse` em devDeps | v2 usa `baseUrl: "src"` e é mais estrito; siblings usam `"."` e `skipLibCheck`. Merge precisa compilar todos engines |
| D27 | Settings tab strategy | Phase 2: cada engine registra sua própria tab (Audio, Image, etc). CSV **deleta** sua `CodeMarkerSettingTab` (cópia do v2) — markdown engine é o dono. Phase 4 (opcional): unificar em tab única com seções colapsáveis | CSV duplica a settings tab do v2 com mesmo nome de classe. 4 tabs separadas (md, image, audio, video) é aceitável; 2 tabs "Code Marker" idênticas não é |
| D28 | CSV dedup estendido | Além dos 4 comandos (D24), CSV **deleta**: `editor-menu` handler (cópia verbatim do v2), `file-menu` handler para markdown (cópia verbatim do v2), `addRibbonIcon('tag', 'Code Selection')` (cópia do v2). CSV mantém apenas seu ribbon próprio `('tags', 'CSV Code Explorer')` | CSV standalone copiou toda a UI do v2 para funcionar independente. No merge, markdown engine é dono dessas registrations |
| D29 | Naming convention unificada | Arquivos com mesma role recebem mesmo nome em todos engines: `detailView.ts`, `explorerView.ts`, `codingModel.ts`, `settingTab.ts`, `index.ts`. Diferenciados apenas pela pasta do engine | Previsibilidade: abrir qualquer engine e ver a mesma estrutura |
| D30 | Menu unification strategy | Funções compartilhadas em `src/core/baseCodingMenu.ts` (não classe base). `createPopover()`, `renderCodeInput()`, `renderToggleList()`, `createActionItem()`, `createSeparator()`, `applyThemeColors()`, `positionAndClamp()`. Markdown não usa `createPopover` (CM6 tooltip lifecycle). Image refactored parcialmente (switch para ToggleComponent, mantém class structure) | 6 menus ~1,974 LOC com ~70% idêntico. Funções compõem melhor que classes com o código funcional existente |

---

## Phase -1: Consolidar Documentação

**Objetivo:** todo o conhecimento dos 7 plugins num formato que qualquer Claude Code consiga usar como contexto.

### Fontes a ler

```
# v2
.obsidian/plugins/obsidian-codemarker-v2/README.md
.obsidian/plugins/obsidian-codemarker-v2/ARCHITECTURE.md      # 142KB, 9 partes — FUNDAMENTAL
.obsidian/plugins/obsidian-codemarker-v2/CLAUDE.md
.obsidian/plugins/obsidian-codemarker-v2/COMPONENTS.md
.obsidian/plugins/obsidian-codemarker-v2/DEVELOPMENT.md
.obsidian/plugins/obsidian-codemarker-v2/WORKLOG.md

# CSV
.obsidian/plugins/obsidian-codemarker-csv/TODO.md

# PDF
.obsidian/plugins/obsidian-codemarker-pdf/CLAUDE.md

# Audio
.obsidian/plugins/obsidian-codemarker-audio/BRIEFING.md
.obsidian/plugins/obsidian-codemarker-audio/CLAUDE.md

# Analytics
.obsidian/plugins/obsidian-codemarker-analytics/ROADMAP.md

# Memory
/Users/mosx/.claude/projects/-Users-mosx-Desktop-code-maker-v2/memory/MEMORY.md
/Users/mosx/.claude/projects/-Users-mosx-Desktop-code-maker-v2/memory/board-roadmap.md
```

### Artefatos a produzir

**1. CLAUDE.md** — arquivo no root do plugin qualia-coding. Seções:

- **Core**: regras do user (ex: "NUNCA modificar cm6TooltipMenu.ts"), preferências de workflow, padrões de commit
- **Markdown engine**: CM6 patterns — `markerStateField` (StateField que mantém markers), `markerViewPlugin` (ViewPlugin que renderiza decorations + handles), `selectionMenuField` (tooltip de seleção), `hoverMenuExtension` (tooltip de hover), `marginPanelExtension` (panel MAXQDA-style). Approach C ativo (`cm6NativeTooltipMenu.ts`). MutationObserver self-suppression (50ms). Selection preview. Dark mode hacks. `findSmallestMarkerAtPos()` layering logic
- **CSV engine**: AG Grid v33+, PapaParse. `CodingModel` com `RowMarker` + `SegmentMarker`. Segment editor: cria EditorView CM6 dentro de célula AG Grid, usa todas as 5 CM6 extensions do markdown. Virtual fileId: `csv:${file}:${row}:${column}`. Standalone Editor Registry (`viewLookupUtils.ts`): WeakMap + Map para CM6 editors que não estão no workspace. `.ag-cell` → `.ag-cell-wrapper` → `.ag-cell-value` todos precisam de `width: 100%`
- **Image engine**: Fabric.js 6.9.1 (UNIFICADO, era 6.6.1). Coords normalizadas 0-1. Shapes: Rect, Ellipse, Polygon. `regionDrawing.ts`, `regionHighlight.ts`, `regionLabels.ts`. Auto-open via `active-leaf-change` (NÃO `registerExtensions`)
- **PDF engine**: PDF.js via Obsidian nativo, zero deps. `PdfMarker` (text selection) + `PdfShapeMarker` (drawn shapes). SVG overlay por página (z-index 4, viewBox 0-100). Coords em CSS %. Margin panel overlay "page push" (`scrollContainer.style.marginLeft`). Draw toolbar com Rect/Ellipse/Polygon
- **Audio engine**: WaveSurfer.js v7 com RegionsPlugin, TimelinePlugin, MinimapPlugin. `AudioMarker` (from/to seconds). Vertical lanes: greedy interval sweep em `applyLanes()`. Minimap: overlay com divs posicionadas %. ResizeObserver debounced 100ms. WaveSurfer shadow DOM: Timeline/Minimap precisam container externo. Memo editing: textarea pausa changeListener no focus
- **Video engine**: Fork do Audio. 4 diferenças: `<video>` container acima do waveform, WaveSurfer `media: HTMLMediaElement`, extensions mp4/webm/ogv, setting `videoFit`
- **Analytics engine**: Chart.js lazy-loaded, svd-js lazy. 19 ViewModes. Research Board Fabric.js: 6 node types (sticky, snapshot, excerpt, codeCard, kpiCard, clusterFrame). Fabric.js gotchas: `fireRightClick: true` obrigatório, `subTargetCheck: false` em Groups, `setViewportTransform()` + `setCoords()` após pan/zoom, objects sempre `selectable: true` + `evented: true`
- **Cross-engine patterns**: `active-leaf-change` para file intercept (Audio, Video, Image). `registerExtensions` só CSV. Custom events: `codemarker-csv:navigate`, `codemarker-csv:model-changed`, `codemarker-audio:seek`, `codemarker-video:seek`, `codemarker-image:navigate`

**2. WORKLOG.md** — decisões arquiteturais que impactam o merge:
- Por que Approach C (CM6 native tooltip) e não A ou B
- Por que margin panel é overlay externo no PDF
- Por que standalone editor registry no CSV
- Por que arrows são Line+Triangle separados (não Group) no board
- Por que vertical lanes no Audio/Video
- Fabric.js v6 gotchas (todas listadas acima)

**3. CSS collision scan** — RESULTADO: zero colisões confirmadas entre os 7 plugins.
- Cada plugin usa prefixo único: `codemarker-pdf-*`, `codemarker-audio-*`, `csv-*`, `codemarker-analytics-*`, etc.
- Classes shared (`codemarker-detail-*`, `codemarker-explorer-*`, `codemarker-tooltip-*`) são intencionalmente compartilhadas — mesmo styling para todos engines
- **Ação:** concatenar os 7 `styles.css` com section comments + deduplicar classes shared (manter 1 cópia canônica do v2)
- NÃO renomear para `qc-*` ou outro prefixo
- **Concatenation order (D25):** v2 > PDF > CSV > Image > Audio > Video > Analytics. v2 primeiro = canonical para shared selectors. Após concatenar, deduplicar blocos de regras idênticas (manter primeira ocorrência). Uma divergência conhecida: `.codemarker-code-form .cm-form-actions` — v2 tem `padding-top: 16px` + `margin-top: 8px`, outros têm só `margin-top: 16px`. v2 ganha por ser primeiro. Total concatenado: ~106KB, após dedup: ~101KB

**4. BACKLOG.md** — features planejadas consolidadas:

```markdown
# Qualia Coding — Backlog

## Imediato (v0 fixes)
- [ ] Markdown: filtrar hover toggles para só códigos do marker atual
- [ ] Markdown: fix handle drag + hover menu interaction
- [ ] Markdown: extrair `getMarkerAtPos` para util compartilhado

## Curto prazo
- [ ] CSV: suporte Parquet (hyparquet ~9KB, zero deps, pure JS)
- [ ] Markdown: search/filter no Code Explorer
- [ ] Analytics: cross-source comparison view

## Médio prazo
- [ ] Markdown: per-code decorations (N decorations por marker, opacity blending)
- [ ] CSV: memo + magnitude no extended model
- [ ] Analytics: code overlap analysis
- [ ] Analytics: code groups/hierarchies nas visualizações
- [ ] Analytics: metadata × code crosstabs (CSV demographics)

## Longo prazo (plataforma)
- [ ] Projects + global workspace
- [ ] Code hierarchies (grupos/temas)
- [ ] QDPX export (interop ATLAS.ti, NVivo, MAXQDA)
- [ ] Analytic memos (per-code, per-document)
- [ ] Document variables (metadata per file)
- [ ] Quick switcher (Cmd+Shift+C)
- [ ] Export: CSV, JSON, REFI-QDA, multi-tab spreadsheet
- [ ] Export dashboard como PDF/PNG composito
- [ ] Code visibility toggle (filter highlights per code)
```

---

## Phase 0: Scaffold + Markdown Engine (sub-porting por componente)

**Objetivo:** plugin compila e carrega com o engine markdown portado incrementalmente — cada componente de interação é trazido, testado e refinado individualmente antes de avançar. Isso garante que o foundation CM6 chega limpo para os engines seguintes (especialmente CSV, que reutiliza as 5 extensions).

**Filosofia:** Em vez de copiar o v2 inteiro de uma vez, o markdown engine é construído peça por peça. Cada sub-fase adiciona um componente de interação, compila, e pode ser refinado in-place. O benefício cascateia: CSV segment editor herda tudo que for melhorado aqui.

### Mapa de componentes do markdown engine

```
┌─────────────────────────────────────────────────────────────┐
│ main.ts (~30 LOC)                                           │
│   └─ registerMarkdownEngine(plugin)                         │
│        │                                                    │
│        ├─ [0.1] Scaffold — manifest, package, tsconfig,     │
│        │        esbuild, diretório src/markdown/             │
│        │                                                    │
│        ├─ [0.2] Model + Registry — codeMarkerModel (547L),  │
│        │        codeDefinitionRegistry (188L),               │
│        │        sharedRegistry (67L), settings (23L)         │
│        │                                                    │
│        ├─ [0.3] Decorations + Selection — markerStateField   │
│        │        (289L), selectionMenuField (151L),           │
│        │        cm6NativeTooltipMenu (250L),                 │
│        │        menuController (74L), menuActions (98L),     │
│        │        codeFormModal (82L)                          │
│        │                                                    │
│        ├─ [0.4] Hover + Handles — markerViewPlugin (599L),   │
│        │        hoverMenuExtension (313L),                   │
│        │        markerPositionUtils (132L)                   │
│        │                                                    │
│        ├─ [0.5] Margin Panel — marginPanelExtension (667L)   │
│        │        [componente mais complexo — refinar aqui]    │
│        │                                                    │
│        └─ [0.6] Views — unifiedCodeDetailView (522L),        │
│                 codeExplorerView (274L), settingsTab (95L),  │
│                 viewLookupUtils (38L)                        │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 0.1: Scaffold

**Objetivo:** diretório `qualia-coding` com build pipeline funcional e um `main.ts` shell que carrega no Obsidian (sem funcionalidade ainda).

1. **Criar diretório:** `.obsidian/plugins/qualia-coding/`

2. **manifest.json:**
   ```json
   {
     "id": "qualia-coding",
     "name": "Qualia Coding",
     "description": "Qualitative data analysis for Obsidian"
   }
   ```

3. **package.json unificado** com todas as deps (engines futuros já inclusos):
   ```json
   {
     "dependencies": {
       "ag-grid-community": "^33.0.0",
       "papaparse": "^5.4.1",
       "fabric": "^6.9.1",
       "wavesurfer.js": "^7.0.0",
       "chart.js": "^4.4.0",
       "chartjs-adapter-date-fns": "^3.0.0",
       "chartjs-chart-wordcloud": "^4.4.5",
       "date-fns": "^4.1.0",
       "svd-js": "^1.1.1"
     },
     "devDependencies": {
       "obsidian": "latest",
       "typescript": "^5.0.0",
       "esbuild": "^0.19.0",
       "@types/node": "^20.0.0",
       "@types/papaparse": "^5.3.14"
     }
   }
   ```

4. **esbuild.config.mjs** — copiar do v2 e ajustar:
   - `entryPoints: ["src/main.ts"]`
   - `outfile: "main.js"`
   - `external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins.builtinModules.flatMap(m => [m, "node:" + m])]`
   - `bundle: true`, `format: "cjs"`, `platform: "browser"`

5. **tsconfig.json unificado (D26):**
   ```json
   {
     "compilerOptions": {
       "baseUrl": ".",
       "target": "ES6",
       "module": "ESNext",
       "moduleResolution": "node",
       "lib": ["DOM", "ES5", "ES6", "ES7", "ESNext"],
       "strict": true,
       "noImplicitAny": true,
       "noImplicitThis": true,
       "noImplicitReturns": true,
       "noUncheckedIndexedAccess": true,
       "strictBindCallApply": true,
       "useUnknownInCatchVariables": true,
       "allowSyntheticDefaultImports": true,
       "importHelpers": false,
       "skipLibCheck": true,
       "noEmit": true,
       "isolatedModules": true,
       "esModuleInterop": true,
       "jsx": "react-jsx",
       "jsxImportSource": "obsidian"
     },
     "include": ["src/**/*.ts"],
     "exclude": ["node_modules"]
   }
   ```

6. **Criar estrutura de diretórios:**
   ```
   src/
     main.ts
     markdown/
       index.ts
       cm6/
         utils/
       models/
       views/
       menu/
   ```

7. **main.ts shell (sem funcionalidade):**
   ```typescript
   import { Plugin } from "obsidian";
   import { registerMarkdownEngine } from "./markdown";

   export default class QualiaCodingPlugin extends Plugin {
     async onload() {
       registerMarkdownEngine(this);
     }
   }
   ```

8. **src/markdown/index.ts shell:**
   ```typescript
   import type QualiaCodingPlugin from "../main";

   export function registerMarkdownEngine(plugin: QualiaCodingPlugin): void {
     console.log("Qualia Coding: markdown engine loaded");
     // Sub-fases 0.2–0.6 preenchem este function body
   }
   ```

9. `npm install && npm run build` — compila
10. Ativar no Obsidian — plugin aparece, console mostra log, zero funcionalidade

**Done:** plugin carrega sem crash, build pipeline funciona.

---

### Phase 0.2: Model + Registry

**Objetivo:** dados em memória — CodeMarkerModel carrega/salva markers, CodeDefinitionRegistry gerencia códigos. Plugin lê `data.json` e popula o model, mas nada aparece no editor ainda.

**Portar de v2:**
- `src/models/codeMarkerModel.ts` (547 LOC) → `src/markdown/models/codeMarkerModel.ts`
- `src/models/codeDefinitionRegistry.ts` (188 LOC) → `src/markdown/models/codeDefinitionRegistry.ts`
- `src/models/sharedRegistry.ts` (67 LOC) → `src/markdown/models/sharedRegistry.ts`
- `src/models/settings.ts` (23 LOC) → `src/markdown/models/settings.ts`

**Registrar em `index.ts`:**
```typescript
export function registerMarkdownEngine(plugin: QualiaCodingPlugin): void {
  const registry = new CodeDefinitionRegistry();
  const model = new CodeMarkerModel(plugin, registry);
  // loadData() + migrate + sync registry
  // Neste ponto: model em memória, registry populado, auto-save funcional
  // Nenhuma extension CM6 registrada ainda
}
```

**Smoke test:** plugin carrega → `data.json` lido → `console.log(model.getAllMarkers())` mostra markers existentes → save funciona.

**Done:** model e registry funcionais. Nenhum visual no editor.

---

### Phase 0.3: Decorations + Selection Menu

**Objetivo:** markers aparecem como highlights no editor. Seleção de texto abre o menu de coding (tooltip CM6). Criação de novos markers funciona. Este é o primeiro componente visual.

**Portar de v2:**
- `src/cm6/markerStateField.ts` (289 LOC) → `src/markdown/cm6/markerStateField.ts`
  - StateField com decorações, `syncDecorationsToModel()`, snap-back sync, selection preview
- `src/cm6/selectionMenuField.ts` (151 LOC) → `src/markdown/cm6/selectionMenuField.ts`
  - `showCodingMenuEffect`, tooltip StateField, preview cleanup
- `src/menu/cm6NativeTooltipMenu.ts` (250 LOC) → `src/markdown/menu/cm6NativeTooltipMenu.ts`
  - Approach C (ativo): tooltip CM6 + componentes nativos Obsidian
- `src/menu/menuController.ts` (74 LOC) → `src/markdown/menu/menuController.ts`
- `src/menu/menuActions.ts` (98 LOC) → `src/markdown/menu/menuActions.ts`
- `src/menu/menuTypes.ts` (20 LOC) → `src/markdown/menu/menuTypes.ts`
- `src/menu/codeFormModal.ts` (82 LOC) → `src/markdown/menu/codeFormModal.ts`
- `src/cm6/utils/markerPositionUtils.ts` (132 LOC) → `src/markdown/cm6/utils/markerPositionUtils.ts`

**NÃO portar ainda:**
- `markerViewPlugin.ts` (handles + hover) — Phase 0.4
- `hoverMenuExtension.ts` (hover timing) — Phase 0.4
- `marginPanelExtension.ts` (barras) — Phase 0.5
- Views (detail, explorer) — Phase 0.6
- `cm6TooltipMenu.ts` (Approach B) e `obsidianMenu.ts` (Approach A) — fallbacks estáveis, NÃO modificar, portar como estão

**Registrar em `index.ts`:**
```typescript
export function registerMarkdownEngine(plugin: QualiaCodingPlugin): void {
  const registry = new CodeDefinitionRegistry();
  const model = new CodeMarkerModel(plugin, registry);

  plugin.registerEditorExtension([
    createMarkerStateField(model),        // highlights no texto
    createSelectionMenuField(model),      // tooltip de seleção + preview
  ]);

  // Selection trigger: mouseup → SELECTION_EVENT → menuController
  plugin.registerDomEvent(document, SELECTION_EVENT, (e) => {
    menuController.openMenu(e.detail);
  });

  // Commands: create-code-marker, open-coding-menu
  // Event listeners: editor-menu, file-menu
  // Ribbon: addRibbonIcon('tag', 'Code Selection')
}
```

**Smoke test:** abrir markdown → highlights coloridos visíveis → selecionar texto → tooltip aparece → toggle código → novo marker criado → salvar → reload → marker persiste.

**O que NÃO funciona ainda:** sem handles de resize, sem hover menu sobre markers existentes, sem margin panel, sem sidebar views.

**Done:** highlights visíveis, seleção funciona, markers são criados e persistem.

---

### Phase 0.4: Hover Menu + Handle Overlay

**Objetivo:** hover sobre marker existente abre menu de edição (add/remove codes). Handles SVG aparecem nos extremos do marker para drag-resize. Sistema de hover bidirecional começa a funcionar (texto → panel será ligado na 0.5).

**Portar de v2:**
- `src/cm6/markerViewPlugin.ts` (599 LOC) → `src/markdown/cm6/markerViewPlugin.ts`
  - ViewPlugin: handle overlay no `scrollDOM`, SVGs via `coordsAtPos`, drag-resize
  - `eventHandlers`: mousemove (hover via `closest('.codemarker-highlight')`), mouseup (drag end + selection), mouseleave
  - Debounce 30ms para null momentâneo entre sub-spans
  - `SELECTION_EVENT` dispatch no mouseup
- `src/cm6/hoverMenuExtension.ts` (313 LOC) → `src/markdown/cm6/hoverMenuExtension.ts`
  - ViewPlugin: hover delay 350ms, menu close timer 200ms
  - `onTooltipMouseEnter/Leave` custom events
  - Guards: selection ativa, tooltip existente, drag em andamento

**Atualizar `registerEditorExtension`:**
```typescript
plugin.registerEditorExtension([
  createMarkerStateField(model),
  createMarkerViewPlugin(model),       // ← NOVO: handles + hover + drag
  createSelectionMenuField(model),
  createHoverMenuExtension(model),     // ← NOVO: hover delay + menu lifecycle
]);
```

**Smoke test:**
- Hover sobre marker → 350ms → tooltip menu aparece → toggle codes funciona
- Handles SVG nos extremos → drag para resize → marker redimensiona
- Hover entre sub-spans (boundary formatting) → debounce 30ms mantém hover estável
- Arrastar handle → soltar → `syncDecorationsToModel()` persiste posição nova

**Done:** hover + handles funcionam. Drag-resize funcional. Hover bidirecional parcial (texto → texto apenas; panel vem na 0.5).

---

### Phase 0.5: Margin Panel

**Objetivo:** barras coloridas na margem do editor (estilo MAXQDA) com labels, hover bidirecional completo (panel ↔ texto), e click para navegar. **Este é o componente mais complexo e o que mais precisa de refinamento.**

**Portar de v2:**
- `src/cm6/marginPanelExtension.ts` (667 LOC) → `src/markdown/cm6/marginPanelExtension.ts`
  - ViewPlugin: `renderBrackets()` principal — coleta markers, assign columns, resolve labels, mede texto, computa largura do painel
  - `assignColumns()` — sort por span (maior → mais à direita), aloca coluna livre
  - `resolveLabels()` — labels no centro da barra, collision avoidance com peso (mais pesado mantém posição, mais leve desloca pra baixo)
  - `renderBar()` / `renderLabel()` — DOM rendering
  - `detectElementType()` — classifica bar/label/dot/tick para hover
  - `applyHoverClasses()` — toggle `.codemarker-margin-hovered` sem re-render
  - Hover bidirecional: `panelMoveHandler` → `setHoverEffect` → markerViewPlugin atualiza handles
  - Click handler: label click → `revealCodeDetailPanel(markerId, codeName)`
  - ResizeObserver no `contentDOM`, MutationObserver com self-suppression 50ms
  - RLL (Readable Line Length) dynamic labels: `effectivePanelWidth = panelWidth + extraSpace`
  - Line numbers (gutters): `gutterEl.style.marginLeft` quando gutters presentes

**Hover bidirecional completo nesta fase:**
```
Texto hover → setHoverEffect → margin panel applyHoverClasses() → labels underline
Panel hover → setHoverEffect → markerViewPlugin update() → handles SVG aparecem
```

**Problemas conhecidos a resolver/refinar aqui:**

| Problema | Status no v2 | Oportunidade |
|----------|-------------|-------------|
| Posicionamento com elementos nativos Obsidian (inline title, properties, callouts) | Parcial — MutationObserver + heurísticas | Revisar e consolidar lógica de offset |
| Margin panel como handle de resize | Não implementado | Permitir drag de barra para resize do marker |
| Setting left/right | Não implementado | Opção em settings para escolher lado da margin |
| Espaçamento entre barras sobrepostas | Funcional mas não ótimo | Refinar `assignColumns()` para melhor aproveitamento visual |
| Visual customization | Básico | Espessura da barra, estilo dos ticks, opacidade — settings |
| Label truncation com poucos markers | Fix `-4px` aplicado | Verificar edge cases após porting |
| RLL + janela larga | `effectivePanelWidth` dinâmico | Testar e validar |

> **NOTA:** Refinamentos da margin panel são opcionais nesta sub-fase — o mínimo é portar funcional. Mas esta é a **melhor janela** para refinamentos porque (1) o componente está isolado, (2) ainda não há dependência de outros engines, (3) qualquer melhoria cascateia para o CSV segment editor na Phase 2.2.

**Smoke test:**
- Barras coloridas aparecem na margem → posição alinhada com highlights
- Hover na barra → handles SVG aparecem no texto (bidirecional)
- Hover no texto → label na margin sublinha (bidirecional)
- Click no label → `revealCodeDetailPanel` é chamado (view vem na 0.6)
- RLL toggle → painel reposiciona corretamente
- Line numbers toggle → margem ajusta (`marginLeft` vs `paddingLeft`)
- Resize janela → ResizeObserver recalcula

**Done:** margin panel funcional com hover bidirecional completo. Foundation visual completa do engine markdown.

---

### Phase 0.6: Sidebar Views + Finalização

**Objetivo:** detail view (3 modos), explorer tree (3 níveis), settings tab. Comandos, ribbon, event handlers finais. Engine markdown 100% funcional.

**Portar de v2:**
- `src/views/unifiedCodeDetailView.ts` (522 LOC) → `src/markdown/views/unifiedCodeDetailView.ts`
  - 3 modos: lista (`showList`), code-focused (`showCodeDetail`), marker-focused (`setContext`)
  - Botão "← All Codes" nos modos de detalhe
  - Cross-file marker listing
- `src/views/codeExplorerView.ts` (274 LOC) → `src/markdown/views/codeExplorerView.ts`
  - Tree 3 níveis: Code → File → Segment
  - Toolbar: All, Files, Refresh
  - Click segment → scroll editor to marker
- `src/views/settingsTab.ts` (95 LOC) → `src/markdown/views/settingsTab.ts`
- `src/cm6/utils/viewLookupUtils.ts` (38 LOC) → `src/markdown/cm6/utils/viewLookupUtils.ts`
  - Nesta fase portar a versão v2 (38 LOC). Na Phase 2.2 (CSV), substituir pela versão CSV (92 LOC) com standalone editor registry (D23)

**Registrar em `index.ts` (versão final Phase 0):**
```typescript
export function registerMarkdownEngine(plugin: QualiaCodingPlugin): void {
  const registry = new CodeDefinitionRegistry();
  const model = new CodeMarkerModel(plugin, registry);

  // CM6 Extensions (5 — mesmas que CSV segment editor reutilizará)
  plugin.registerEditorExtension([
    createMarkerStateField(model),
    createMarkerViewPlugin(model),
    createSelectionMenuField(model),
    createHoverMenuExtension(model),
    createMarginPanelExtension(model),
  ]);

  // Views
  plugin.registerView("qualia-markdown-detail", (leaf) =>
    new UnifiedCodeDetailView(leaf, plugin, model));
  plugin.registerView("qualia-markdown-explorer", (leaf) =>
    new CodeExplorerView(leaf, plugin, model));

  // Settings
  plugin.addSettingTab(new CodeMarkerSettingTab(plugin.app, plugin));

  // Selection trigger
  plugin.registerDomEvent(document, SELECTION_EVENT, (e) => {
    menuController.openMenu(e.detail);
  });

  // Context menus
  plugin.registerEvent(app.workspace.on('editor-menu', ...));
  plugin.registerEvent(app.workspace.on('file-menu', ...));

  // Commands
  plugin.addCommand({ id: 'create-code-marker', ... });
  plugin.addCommand({ id: 'open-coding-menu', ... });
  plugin.addCommand({ id: 'open-code-explorer', ... });
  plugin.addCommand({ id: 'reset-code-markers', ... });

  // Ribbon
  plugin.addRibbonIcon('tag', 'Code Selection', ...);
}
```

**Tabela de View Type IDs (D20)** — referência para rename em cada Phase 2.x:

| Engine | Current ID | New ID |
|--------|-----------|--------|
| Markdown detail | `codemarker-detail` | `qualia-markdown-detail` |
| Markdown explorer | `codemarker-explorer` | `qualia-markdown-explorer` |
| CSV view | `codemarker-csv` | `qualia-csv-view` |
| CSV detail | (era unified `codemarker-detail`) | `qualia-csv-detail` |
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
| Analytics view | `codemarker-analytics` | `qualia-analytics` |
| Board view | `codemarker-board` | `qualia-board` |

**Custom events rename:**

| Current Event | New Event |
|--------------|-----------|
| `codemarker-csv:navigate` | `qualia-csv:navigate` |
| `codemarker-csv:model-changed` | `qualia-csv:model-changed` |
| `codemarker-image:navigate` | `qualia-image:navigate` |
| `codemarker-audio:seek` | `qualia-audio:seek` |
| `codemarker-video:seek` | `qualia-video:seek` |
| `codemarker-tooltip-mouseenter` | `qualia-tooltip-mouseenter` |
| `codemarker-tooltip-mouseleave` | `qualia-tooltip-mouseleave` |

**Smoke test completo (checklist markdown) — PASSOU (2026-02-28):**
- [x] Build sem erro (`tsc -noEmit` + `npm run build`)
- [x] Plugin `qualia-coding` carrega no Obsidian
- [x] Abrir markdown → highlights coloridos
- [x] Selecionar texto → tooltip → criar marker → salvar
- [x] Hover sobre marker → 350ms → tooltip menu → toggle codes
- [x] Handles SVG → drag resize → posição persiste
- [x] Margin panel: barras coloridas alinhadas com highlights
- [x] Hover bidirecional: texto ↔ panel
- [x] Click label na margin → detail view abre no modo marker-focused
- [x] Explorer tree: 3 níveis, expand/collapse, click → navega ao marker
- [x] Detail view: lista → code-focused → marker-focused → "← All Codes"
- [x] Settings tab funciona
- [x] RLL toggle → painel reposiciona
- [x] Line numbers toggle → margem ajusta
- [x] Reload Obsidian (Ctrl+R) → markers persistem
- [x] `main.ts` tem ~15 linhas

### Critério de done Phase 0
- Engine markdown 100% funcional (paridade com v2)
- Todos os componentes portados e testados individualmente
- `src/markdown/` organizado por responsabilidade (cm6/, models/, views/, menu/)
- `tsconfig.json` unificado compila sem erro com `tsc -noEmit` (D26)
- Build pipeline pronto para receber engines na Phase 2
- Refinamentos da margin panel (se feitos) documentados em WORKLOG.md

### Estimativa Phase 0

| Sub-fase | Escopo | Estimativa |
|----------|--------|-----------|
| 0.1 Scaffold | Build pipeline, diretórios, shells | 0.5 dia |
| 0.2 Model + Registry | Dados em memória, load/save | 0.5 dia |
| 0.3 Decorations + Selection | Highlights, tooltip, criar markers | 1 dia |
| 0.4 Hover + Handles | Hover menu, SVG handles, drag | 1 dia |
| 0.5 Margin Panel | Barras, labels, hover bidirecional | 1-2 dias (com refinamentos) |
| 0.6 Views + Finalização | Sidebar, settings, commands, smoke test | 1 dia |
| **Total Phase 0** | | **4-6 dias** (era 1 dia no plano original) |

> **Trade-off:** +3-5 dias na Phase 0, mas cada componente chega limpo. O risco do "copiar tudo → refinar depois" é que o "depois" nunca chega. Com sub-porting, a margin panel — componente mais problemático — tem uma janela dedicada de refinamento. E o CSV segment editor (Phase 2.2) herda todas as melhorias de graça.

---

## Phase 1: Core

**Objetivo:** extrair código duplicado para `src/core/`, criar schema de tipos.

### Passos detalhados

1. **`src/core/types.ts`** — interfaces compartilhadas:
   ```typescript
   // Copiar de obsidian-codemarker-v2/src/models/codeDefinitionRegistry.ts
   export interface CodeDefinition {
     name: string;
     color: string;
     description: string;
     paletteIndex: number;
     createdAt: number;
     updatedAt: number;
   }

   export type EngineCleanup = () => void | Promise<void>;

   // Schema do data.json unificado (Phase 2+ implementa read/write)
   export interface QualiaData {
     registry: {
       definitions: Record<string, CodeDefinition>;
       nextPaletteIndex: number;
     };
     markdown: { markers: Record<string, any[]> };
     csv: { segmentMarkers: any[]; rowMarkers: any[] };
     image: { markers: any[]; settings: { autoOpenImages: boolean } };
     pdf: { markers: any[]; shapes: any[] };
     audio: {
       files: any[];
       settings: { defaultZoom: number; regionOpacity: number; showLabelsOnRegions: boolean; fileStates: Record<string, any> };
     };
     video: {
       files: any[];
       settings: { defaultZoom: number; regionOpacity: number; showLabelsOnRegions: boolean; videoFit: string; fileStates: Record<string, any> };
     };
   }

   export function createDefaultData(): QualiaData {
     return {
       registry: { definitions: {}, nextPaletteIndex: 0 },
       markdown: { markers: {} },
       csv: { segmentMarkers: [], rowMarkers: [] },
       image: { markers: [], settings: { autoOpenImages: true } },
       pdf: { markers: [], shapes: [] },
       audio: {
         files: [],
         settings: { defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, fileStates: {} },
       },
       video: {
         files: [],
         settings: { defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, videoFit: "contain", fileStates: {} },
       },
     };
   }
   ```
   Nota: `any[]` será tipado quando cada engine for portado. Por agora, só a estrutura.

2. **`src/core/dataManager.ts`** — estado in-memory centralizado + save debounced:
   ```typescript
   import type { Plugin } from "obsidian";
   import type { QualiaData } from "./types";
   import { createDefaultData } from "./types";

   export class DataManager {
     private data: QualiaData;
     private plugin: Plugin;
     private saveTimer: number | null = null;
     private saving = false;
     private dirtyAfterSave = false;

     constructor(plugin: Plugin) {
       this.plugin = plugin;
       this.data = createDefaultData();
     }

     async load(): Promise<void> {
       const raw = await this.plugin.loadData();
       const defaults = createDefaultData();
       if (raw) {
         for (const key of Object.keys(defaults) as Array<keyof QualiaData>) {
           if (raw[key] === undefined) (raw as any)[key] = defaults[key];
         }
         this.data = raw as QualiaData;

         // D21: Normalize registry from 3 legacy formats
         this.migrateRegistries(raw);
         // D22: Strip legacy codeDescriptions → migrate to registry
         if ((raw as any).markdown?.codeDescriptions) {
           for (const [name, desc] of Object.entries((raw as any).markdown.codeDescriptions as Record<string, string>)) {
             const def = this.data.registry.definitions[name];
             if (def && !def.description) def.description = desc;
           }
           delete (raw as any).markdown.codeDescriptions;
         }
       } else {
         this.data = defaults;
       }
     }

     /**
      * D21: Normalize per-engine registries from 3 legacy formats into unified `registry`.
      * - v2: `data.markdown.codeDefinitions` (flat Record) + `data.markdown.nextPaletteIndex` (number)
      * - CSV/Image/PDF: `data.<engine>.registry` (nested { definitions, nextPaletteIndex })
      * - Audio/Video: `data.<engine>.codeDefinitions` (nested, different key name)
      * Merges by `updatedAt` (newest wins). Writes result to `this.data.registry`.
      * Deletes per-engine copies after migration. One-time normalization.
      */
     private migrateRegistries(raw: any): void {
       // Implementation: iterate per-engine registry locations, merge into this.data.registry
       // by updatedAt, delete per-engine copies. See D21 for details.
     }

     section<K extends keyof QualiaData>(key: K): QualiaData[K] {
       return this.data[key];
     }

     setSection<K extends keyof QualiaData>(key: K, value: QualiaData[K]): void {
       this.data[key] = value;
       this.markDirty();
     }

     markDirty(): void {
       if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
       this.saveTimer = window.setTimeout(() => {
         this.saveTimer = null;
         this.flush();
       }, 500);
     }

     async flush(): Promise<void> {
       if (this.saving) { this.dirtyAfterSave = true; return; }
       this.saving = true;
       try {
         if (this.saveTimer !== null) { window.clearTimeout(this.saveTimer); this.saveTimer = null; }
         await this.plugin.saveData(this.data);
       } finally {
         this.saving = false;
         if (this.dirtyAfterSave) { this.dirtyAfterSave = false; await this.flush(); }
       }
     }

     getAll(): Readonly<QualiaData> { return this.data; }
   }
   ```

3. **`src/core/codeDefinitionRegistry.ts`** — copiar de `obsidian-codemarker-v2/src/models/codeDefinitionRegistry.ts`. Ajustar imports para `./types`. Esta é a cópia canônica — as 5 outras morrem.

4. **`src/core/codeFormModal.ts`** — copiar de `obsidian-codemarker-v2/src/models/codeFormModal.ts` (ou equivalente). Modal com color picker + description input. Parametrizar se houver diferenças entre plugins.

5. **Refatorar `main.ts` para DataManager + EngineCleanup (D17):**

   Phase 0 tinha um main.ts mínimo sem core/. Agora que core/ existe, refatorar:
   ```typescript
   import { Plugin } from "obsidian";
   import { DataManager } from "./core/dataManager";
   import type { EngineCleanup } from "./core/types";
   import { registerMarkdownEngine } from "./markdown";

   export default class QualiaCodingPlugin extends Plugin {
     dataManager!: DataManager;
     private cleanups: EngineCleanup[] = [];

     async onload() {
       this.dataManager = new DataManager(this);
       await this.dataManager.load();

       this.cleanups.push(registerMarkdownEngine(this));
       // Engines adicionados na Phase 2:
       // this.cleanups.push(registerPdfEngine(this));
       // this.cleanups.push(registerCsvEngine(this));
       // etc.
     }

     async onunload() {
       for (let i = this.cleanups.length - 1; i >= 0; i--) {
         await this.cleanups[i]();
       }
       await this.dataManager.flush();
     }
   }
   ```

   Também atualizar `src/markdown/index.ts` para retornar `EngineCleanup`:
   ```typescript
   import type QualiaCodingPlugin from "../main";
   import type { EngineCleanup } from "../core/types";

   export function registerMarkdownEngine(plugin: QualiaCodingPlugin): EngineCleanup {
     // registerView(), addCommand(), registerEditorExtension(), event handlers
     return () => {
       plugin.app.workspace.detachLeavesOfType("qualia-markdown-detail");
       plugin.app.workspace.detachLeavesOfType("qualia-markdown-explorer");
     };
   }
   ```

6. **Atualizar `src/markdown/`** para importar de `src/core/` em vez de ter cópias locais:
   - `import { CodeDefinition } from "../core/types"`
   - `import { CodeDefinitionRegistry } from "../core/codeDefinitionRegistry"`

6. **Persistência:** engines NUNCA chamam `plugin.loadData()`/`plugin.saveData()`. Usam `plugin.dataManager.section("markdown")` para ler e `plugin.dataManager.setSection("markdown", {...})` para escrever. O DataManager mantém estado in-memory e faz flush debounced 500ms. Apenas 1 timer de save global — elimina race condition entre engines.

7. **Build + smoke test markdown** — tudo ainda funciona após mover pra core.

### Critério de done Phase 1
- `src/core/` existe com 4 arquivos (types, dataManager, codeDefinitionRegistry, codeFormModal)
- DataManager carrega/salva corretamente (testar: setSection em 2 engines rápido → ambos persistem)
- `src/markdown/` importa de `core/`, não tem cópias locais de registry/modal
- Build sem erro, markdown coding funciona

---

## Phase 2: Importar Engines

### 2.1 PDF (zero deps, 5,244 LOC)

**Fonte:** `.obsidian/plugins/obsidian-codemarker-pdf/src/`

**Mover para:** `src/pdf/`

**Arquivos do plugin PDF:**
- `src/coding/pdfCodingModel.ts` — PdfMarker, PdfShapeMarker, persistência
- `src/coding/sharedRegistry.ts` — **DELETAR** (usar `core/codeDefinitionRegistry`)
- `src/coding/codeDefinitionRegistry.ts` — **DELETAR** (usar `core/`)
- `src/pdf/highlightRenderer.ts` — renderiza highlights em CSS %
- `src/pdf/selectionCapture.ts` — captura seleção de texto
- `src/pdf/marginPanel.ts` — panel overlay "page push"
- `src/pdf/drawLayer.ts` — SVG overlay para shapes
- `src/pdf/drawInteraction.ts` — drag-to-draw rect/ellipse, click-to-place polygon
- `src/pdf/drawToolbar.ts` — toolbar no PDF viewer
- `src/menu/pdfCodingMenu.ts` — popover para atribuir códigos
- `src/views/pdfCodeDetailView.ts` — sidebar 3 modos
- `src/views/pdfCodeExplorerView.ts` — tree 3 níveis

**Criar:** `src/pdf/index.ts`
```typescript
export function registerPdfEngine(plugin: QualiaCodingPlugin): EngineCleanup {
  // registerView para detail + explorer
  // active-leaf-change interceptor para PDFs
  // addCommand para "Open PDF Code Explorer"
  return () => {
    for (const [, obs] of observers) obs.stop();
    for (const [, int] of drawInteractions) int.stop();
    for (const [, tb] of drawToolbars) tb.unmount();
    observers.clear(); drawInteractions.clear(); drawToolbars.clear();
    plugin.app.workspace.detachLeavesOfType("qualia-pdf-detail");
    plugin.app.workspace.detachLeavesOfType("qualia-pdf-explorer");
  };
}
```

**Ajustar imports:** `sharedRegistry` → `core/codeDefinitionRegistry`, etc.

**Persistência:** `pdfCodingModel` lê via `plugin.dataManager.section("pdf")`, escreve via `plugin.dataManager.setSection("pdf", {...})`. Remove `scheduleSave()` local — DataManager tem o único timer.

**Smoke test:** abrir PDF → highlight texto → assign code → sidebar → save → reload → marker persiste.

### 2.2 CSV (AG Grid + PapaParse, 8,201 LOC)

**Fonte:** `.obsidian/plugins/obsidian-codemarker-csv/src/`

**Mover para:** `src/csv/`

**ATENÇÃO — este é o engine mais complexo:**
- É HÍBRIDO: tem AG Grid para a tabela E usa CM6 para o segment editor
- O segment editor cria um EditorView CM6 dentro de uma célula AG Grid
- Usa TODAS as 5 CM6 extensions de `src/markdown/cm6/`
- Usa `viewLookupUtils.ts` (standalone editor registry) para CM6 editors fora do workspace

**Arquivos do plugin CSV:**
- `src/coding/codingModel.ts` — RowMarker, SegmentMarker, rowDataCache
- `src/coding/sharedRegistry.ts` — **DELETAR**
- `src/coding/codeDefinitionRegistry.ts` — **DELETAR**
- `src/views/csvView.ts` — FileView com AG Grid, registerExtensions(["csv"])
- `src/views/csvCodeDetailView.ts` — sidebar 3 modos
- `src/views/csvCodeExplorerView.ts` — tree 3 níveis
- `src/grid/` — AG Grid configuração, cell renderers, editors
- `src/menu/codingMenu.ts` — tag button popover
- `viewLookupUtils.ts` — **JÁ em `src/markdown/cm6/utils/` (D23)**. CSV importa de lá.
  Segment editor usa `registerStandaloneEditor()`/`unregisterStandaloneEditor()` deste arquivo compartilhado

**Dependência CM6:** o segment editor importa de `src/markdown/cm6/`:
```typescript
// src/csv/segmentEditor.ts
import { markerStateField, markerViewPlugin, selectionMenuField, hoverMenuExtension, marginPanelExtension } from "../markdown/cm6";
// CSV segment editor depends on markdown CM6 engine
```

**Virtual fileIds:** `csv:${file}:${row}:${column}` — nunca colide com paths reais.

**ATENÇÃO — CSV NÃO registra CM6 extensions globalmente (D16):**

O plugin CSV standalone chamava `registerEditorExtension()` com as mesmas 5 CM6 extensions do v2 (markerStateField, markerViewPlugin, selectionMenuField, hoverMenuExtension, marginPanelExtension). No merge, o markdown engine já registra essas extensions globalmente. **Se CSV também registrar, haverá decorations/tooltips/margin panels duplicados em todo editor markdown.**

O CSV engine só cria `EditorView` standalone para segment editing — as extensions são passadas diretamente no constructor do `new EditorView({ extensions: [...] })`, importando de `src/markdown/cm6/`.

**DELETAR do CSV:**
- `UnifiedCodeDetailView` (`unifiedCodeDetailView.ts`) — registrava como `codemarker-detail` (mesmo ID do v2). No merge, cada engine tem seu próprio detail view com ID único (`qualia-csv-detail`)
- `CodeDetailView` (`codeDetailView.ts`) — cópia do v2's detail view, diferente de `csvCodeDetailView.ts`. CSV usa apenas `CsvCodeDetailView` como canônico
- `CodeExplorerView` (`codeExplorerView.ts`) — cópia do v2's `codemarker-explorer`. CSV usa apenas `CsvCodeExplorerView` (`qualia-csv-explorer`)
- `CodeMarkerModel` (`models/codeMarkerModel.ts`) — cópia do v2's model. CSV usa apenas `CodingModel` (`codingModel.ts`) como canônico
- Chamadas a `plugin.registerEditorExtension()` no CSV
- `editor-menu` handler — cópia verbatim do v2 (guarda `MarkdownView` + `showMenuOnRightClick`). Markdown engine é o dono (D28)
- `file-menu` handler para markdown — cópia verbatim do v2 (guarda `TFile` + `showMenuOnRightClick`). Markdown engine é o dono (D28)
- `addRibbonIcon('tag', 'Code Selection')` — cópia do v2's ribbon. CSV mantém apenas `addRibbonIcon('tags', 'CSV Code Explorer')` (D28)
- `CodeMarkerSettingTab` — cópia da settings tab do v2 (mesmo nome de classe). Markdown engine é o dono (D27)

**Criar:** `src/csv/index.ts`
```typescript
export function registerCsvEngine(plugin: QualiaCodingPlugin): EngineCleanup {
  // NÃO chamar plugin.registerEditorExtension() — markdown engine já registrou (D16)
  // CSV só cria EditorView standalone para segment editing (extensions no constructor)

  plugin.registerExtensions(["csv"], "qualia-csv-view");
  plugin.registerView("qualia-csv-view", (leaf) => new CsvView(leaf, plugin));
  plugin.registerView("qualia-csv-detail", (leaf) => new CsvCodeDetailView(leaf, plugin));
  plugin.registerView("qualia-csv-explorer", (leaf) => new CsvCodeExplorerView(leaf, plugin));

  // event handlers para qualia-csv:navigate, qualia-csv:model-changed
  return () => {
    plugin.app.workspace.detachLeavesOfType("qualia-csv-view");
    plugin.app.workspace.detachLeavesOfType("qualia-csv-detail");
    plugin.app.workspace.detachLeavesOfType("qualia-csv-explorer");
  };
}
```

**Command dedup (D24):** CSV standalone registrava 4 comandos idênticos ao v2 (`create-code-marker`, `open-coding-menu`, `open-code-explorer`, `reset-code-markers`). No merge, **deletar essas 4 cópias** — o markdown engine já os registra. CSV mantém apenas seus 4 comandos próprios: `open-csv-code-explorer`, `open-csv-code-list`, `create-new-csv-code`, `reset-csv-markers`.

**Persistência:** `codingModel` lê via `plugin.dataManager.section("csv")`, escreve via `plugin.dataManager.setSection("csv", {...})`. Remove `scheduleSave()` local — DataManager tem o único timer.

**Smoke test:** abrir CSV → AG Grid renderiza → criar segment marker → segment editor com CM6 decorations → row marker → sidebar → save → reload.

### 2.3 Image (Fabric.js ^6.9.1, 2,840 LOC)

**Fonte:** `.obsidian/plugins/obsidian-codemarker-image/src/`

**Mover para:** `src/image/`

**Arquivos:**
- `src/coding/imageCodingModel.ts` — ImageMarker (file + shape + normalizedCoords 0-1)
- `src/canvas/fabricCanvas.ts` — Fabric.js lifecycle
- `src/canvas/regionDrawing.ts` — draw rect/ellipse/polygon
- `src/canvas/regionHighlight.ts` — glow on hover
- `src/canvas/regionLabels.ts` — code names on shapes
- `src/menu/codingMenu.ts` — floating popover
- `src/views/imageCodeDetailView.ts`
- `src/views/imageCodeExplorerView.ts`
- `src/views/imageSettingTab.ts` — settings tab (autoOpenImages toggle)

**Fabric.js:** versão ^6.9.1 (unificada com Analytics). Testar que canvas de imagem funciona com 6.9.1 (era 6.6.1).

**Criar:** `src/image/index.ts`
```typescript
export function registerImageEngine(plugin: QualiaCodingPlugin): EngineCleanup {
  plugin.addSettingTab(new ImageSettingTab(plugin.app, plugin));
  // registerView, active-leaf-change, file-menu "Open in CodeMarker Image"
  return () => {
    plugin.app.workspace.detachLeavesOfType("qualia-image-detail");
    plugin.app.workspace.detachLeavesOfType("qualia-image-explorer");
  };
}
```

**Persistência:** `imageCodingModel` lê via `plugin.dataManager.section("image")`, escreve via `plugin.dataManager.setSection("image", {...})`. Remove `scheduleSave()` local.

**Smoke test:** abrir imagem → draw rect → assign code → labels no canvas → sidebar → save → reload.

### 2.4 Audio (WaveSurfer.js ^7, 2,650 LOC)

**Fonte:** `.obsidian/plugins/obsidian-codemarker-audio/src/`

**Mover para:** `src/audio/`

**Arquivos:**
- `src/coding/audioCodingModel.ts` — AudioMarker (from/to seconds + codes + memo)
- `src/audio/waveformRenderer.ts` — WaveSurfer lifecycle, Timeline/Minimap plugins
- `src/audio/regionRenderer.ts` — colored regions, labels, vertical lanes
- `src/views/audioCodeDetailView.ts` (com memo editável)
- `src/views/audioCodeExplorerView.ts`
- `src/views/audioSettingTab.ts` — settings tab (defaultZoom, regionOpacity, showLabelsOnRegions)

**Criar:** `src/audio/index.ts`
```typescript
export function registerAudioEngine(plugin: QualiaCodingPlugin): EngineCleanup {
  plugin.addSettingTab(new AudioSettingTab(plugin.app, plugin));
  // registerView, active-leaf-change, file-menu, ribbon
  return () => {
    plugin.app.workspace.detachLeavesOfType("qualia-audio-detail");
    plugin.app.workspace.detachLeavesOfType("qualia-audio-explorer");
  };
}
```

**File intercept:** `active-leaf-change` para arquivos mp3/wav/ogg/flac/m4a.

**Persistência:** `audioCodingModel` lê via `plugin.dataManager.section("audio")`, escreve via `plugin.dataManager.setSection("audio", {...})`. Remove `scheduleSave()` local.

**Smoke test:** abrir audio → waveform renderiza → criar region → assign code → minimap → sidebar → save → reload.

### 2.5 Video (WaveSurfer shared, 2,680 LOC)

**Fonte:** `.obsidian/plugins/obsidian-codemarker-video/src/`

**Mover para:** `src/video/`

Fork do Audio. 4 diferenças:
1. `<video>` container acima do waveform
2. WaveSurfer `media: HTMLMediaElement`
3. Extensions: mp4, webm, ogv
4. Setting `videoFit: "contain" | "cover"`

**Criar:** `src/video/index.ts`
```typescript
export function registerVideoEngine(plugin: QualiaCodingPlugin): EngineCleanup {
  plugin.addSettingTab(new VideoSettingTab(plugin.app, plugin));
  // registerView, active-leaf-change, file-menu, ribbon
  return () => {
    plugin.app.workspace.detachLeavesOfType("qualia-video-detail");
    plugin.app.workspace.detachLeavesOfType("qualia-video-explorer");
  };
}
```

**Persistência:** `videoCodingModel` lê via `plugin.dataManager.section("video")`, escreve via `plugin.dataManager.setSection("video", {...})`. Remove `scheduleSave()` local.

**Smoke test:** abrir video → video player + waveform → region coding → sidebar → save → reload.

### 2.6 Analytics (Chart.js + Fabric + SVD, 11,147 LOC)

**Fonte:** `.obsidian/plugins/obsidian-codemarker-analytics/src/`

**Mover para:** `src/analytics/`

**Este é o engine mais pesado mas mais isolado — não depende dos outros engines em runtime.**

**Arquivos principais:**
- `src/data/dataReader.ts` — **REESCREVER**: hoje lê 7 `data.json` com 7 schemas via `vault.adapter.read()`. No plugin unificado, lê 1 `data.json` com seções tipadas (`QualiaData`). Interface de saída (`ConsolidatedData`) não muda
- `src/data/dataConsolidator.ts` — consolida dados → `UnifiedMarker[]`
- `src/data/statsEngine.ts` — cálculos estatísticos
- `src/data/clusterEngine.ts` — hierarchical clustering
- `src/data/decisionTreeEngine.ts` — CHAID
- `src/data/mcaEngine.ts`, `mdsEngine.ts` — lazy SVD
- `src/data/textExtractor.ts` — extração de texto com cache
- `src/views/analyticsView.ts` — 19 ViewModes (~5,700 LOC, arquivo maior do projeto)
- `src/board/` — Research Board (6 node types, Fabric.js)

**Rewrite do dataReader:**
```typescript
// ANTES: lê 7 arquivos via vault.adapter.read()
const mdData = JSON.parse(await vault.adapter.read('.obsidian/plugins/obsidian-codemarker-v2/data.json'));
const csvData = JSON.parse(await vault.adapter.read('.obsidian/plugins/obsidian-codemarker-csv/data.json'));
// ... 5 mais

// DEPOIS: acessa in-memory via DataManager
const data = plugin.dataManager.getAll();
const mdMarkers = data.markdown.markers;
const csvMarkers = data.csv.segmentMarkers;
// Acessa data.image, data.pdf, data.audio, data.video diretamente
// Zero I/O, zero parsing — tudo já está em memória
```

A interface de saída `ConsolidatedData` com `UnifiedMarker[]` NÃO muda — só a fonte dos dados.

**board.json (D19):** atualizar `BOARD_FILE` em `boardView.ts` de `".obsidian/plugins/obsidian-codemarker-analytics/board.json"` para `".obsidian/plugins/qualia-coding/board.json"`. O path atual aponta para o diretório do plugin antigo que será deletado na Phase 5.

**Criar:** `src/analytics/index.ts`
```typescript
export function registerAnalyticsEngine(plugin: QualiaCodingPlugin): EngineCleanup {
  return () => {
    plugin.app.workspace.detachLeavesOfType("qualia-analytics");
  };
}
```

**Persistência:** Analytics só lê dados via `plugin.dataManager.getAll()` (não escreve markers). Board tem persistência própria.

**Smoke test:** abrir Analytics → 19 view modes renderizam → dados de todos os engines aparecem → board funciona → add chart snapshot → drag code card.

---

## Phase 3: Lazy Loading (Multi-build esbuild)

**Objetivo:** bundle <200KB no initial load. Subsistemas pesados carregam sob demanda.

### Problema confirmado

`splitting: true` no esbuild exige `format: "esm"`, incompatível com Obsidian (CJS obrigatório). `await import()` dentro de bundle CJS vira `require()` síncrono — não é lazy de verdade.

### Solução: Multi-build esbuild

Phase 3 usa N invocações do esbuild, produzindo arquivos separados:

```
main.js              (~210KB) — core + markdown + PDF (eager)
engines/csv.js       (~2.0MB) — AG Grid + PapaParse
engines/image.js     (~466KB) — Fabric.js
engines/audio.js     (~216KB) — WaveSurfer
engines/video.js     (~216KB) — WaveSurfer
engines/analytics.js (~1.4MB) — Chart.js + Fabric + SVD
```

### esbuild.config.mjs

```javascript
const sharedConfig = {
  bundle: true, format: "cjs", target: "es2018",
  treeShaking: true, platform: "node",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
};

// Build 1: main (eager) — marca engines pesados como external
await esbuild.build({
  ...sharedConfig,
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  external: [
    ...sharedConfig.external,
    "./engines/csv.js",
    "./engines/image.js",
    "./engines/audio.js",
    "./engines/video.js",
    "./engines/analytics.js",
  ],
});

// Build 2-6: cada engine pesado
for (const { entry, out } of [
  { entry: "src/csv/bundle.ts", out: "engines/csv.js" },
  { entry: "src/image/bundle.ts", out: "engines/image.js" },
  { entry: "src/audio/bundle.ts", out: "engines/audio.js" },
  { entry: "src/video/bundle.ts", out: "engines/video.js" },
  { entry: "src/analytics/bundle.ts", out: "engines/analytics.js" },
]) {
  await esbuild.build({ ...sharedConfig, entryPoints: [entry], outfile: out });
}
```

### Engines e estratégia de loading

| Engine | Tamanho estimado | Estratégia |
|--------|-----------------|------------|
| Markdown | ~80KB (CM6 extensions) | **Eager** — no main.js, sempre carregado |
| PDF | ~130KB (zero deps) | **Eager** — no main.js, leve o suficiente |
| CSV | ~2.0MB (AG Grid) | **Lazy** — `engines/csv.js`, `require()` no `onOpen()` |
| Image | ~466KB (Fabric.js) | **Lazy** — `engines/image.js`, `require()` no `onOpen()` |
| Audio | ~216KB (WaveSurfer) | **Lazy** — `engines/audio.js`, `require()` no `onOpen()` |
| Video | ~216KB (WaveSurfer) | **Lazy** — `engines/video.js`, `require()` no `onOpen()` |
| Analytics | ~1.4MB (Chart.js + Fabric) | **Lazy** — `engines/analytics.js`, `require()` no `onOpen()` |

### Shell view pattern

Registra view sincronamente no `onload()`, carrega código pesado via `require()` no `onOpen()`:

```typescript
// No registerCsvEngine() — síncrono, shell leve
plugin.registerView("qualia-csv-view", (leaf) => new CsvViewShell(leaf, plugin));

// Shell (~20 linhas, nenhuma dep pesada)
class CsvViewShell extends ItemView {
  async onOpen() {
    const { CsvView } = require("./engines/csv.js");
    this.inner = new CsvView(this.containerEl, this.plugin);
  }
}
```

**Nota sobre `require()` relativo:** Electron (Node.js) resolve `require("./engines/csv.js")` relativo ao diretório do plugin. Testar cedo.

### main.ts permanece idêntico

```typescript
// main.ts — NÃO MUDA na Phase 3 (mesma estrutura da Phase 2)
import { Plugin } from "obsidian";
import { DataManager } from "./core/dataManager";
import type { EngineCleanup } from "./core/types";
import { registerMarkdownEngine } from "./markdown";
import { registerPdfEngine } from "./pdf";
import { registerCsvEngine } from "./csv";
import { registerImageEngine } from "./image";
import { registerAudioEngine } from "./audio";
import { registerVideoEngine } from "./video";
import { registerAnalyticsEngine } from "./analytics";

export default class QualiaCodingPlugin extends Plugin {
  dataManager!: DataManager;
  private cleanups: EngineCleanup[] = [];

  async onload() {
    this.dataManager = new DataManager(this);
    await this.dataManager.load();

    this.cleanups.push(registerMarkdownEngine(this));
    this.cleanups.push(registerPdfEngine(this));
    this.cleanups.push(registerCsvEngine(this));
    this.cleanups.push(registerImageEngine(this));
    this.cleanups.push(registerAudioEngine(this));
    this.cleanups.push(registerVideoEngine(this));
    this.cleanups.push(registerAnalyticsEngine(this));
  }

  async onunload() {
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      await this.cleanups[i]();
    }
    await this.dataManager.flush();
  }
}
```

### Otimização compartilhada

Fabric.js aparece em Image + Analytics — pode virar `engines/fabric.js` compartilhado. WaveSurfer em Audio + Video — aceitar ~216KB duplicação ou compartilhar.

**Target:** initial load <200KB (markdown + PDF + core + shells dos outros engines).

---

## Phase 4: Abstrações + Organização Unificada

**NÃO bloqueia.** Plugin funciona 100% sem isso. Mas é onde a codebase deixa de ser "7 plugins colados" e vira um projeto coeso — naming consistente, estrutura previsível, ~5,000 LOC eliminados.

### Contexto: o que é duplicado

Análise dos 6 detail views + 6 explorer views revelou:

| Componente | LOC total (6 engines) | Compartilhado | Engine-específico | Savings |
|-----------|----------------------|---------------|-------------------|---------|
| Detail views (3 modos) | 1,880 | 1,495 (80%) | 385 (20%) | ~1,165 |
| Explorer views (tree 3 níveis) | 1,399 | 1,241 (89%) | 158 (11%) | ~994 |
| CodeDefinitionRegistry | 780 (6×130) | 130 canonical | 0 | 650 |
| **Total** | **4,059** | | | **~2,809** |

O padrão é claro: **80-89% do código é idêntico** entre engines. Cada engine difere apenas em:
- Como formatar o label de um marker (texto, página, timestamp, shape)
- Como gerar o preview (snippet de texto, coordenadas, duração)
- Como navegar até o marker (CM6 scroll, PDF page jump, audio seek, event dispatch)
- Seções custom no modo marker-focused (memo editável no Audio, shape description no Image)

### Decisão de organização: naming convention

**D29: Naming convention unificada por role (não por engine)**

Em vez de cada engine ter nomes completamente diferentes para o mesmo conceito, padronizar:

| Role | Arquivo por engine | Naming pattern |
|------|-------------------|----------------|
| Detail view | `detailView.ts` | `src/<engine>/views/detailView.ts` |
| Explorer view | `explorerView.ts` | `src/<engine>/views/explorerView.ts` |
| Coding model | `codingModel.ts` | `src/<engine>/models/codingModel.ts` |
| Settings tab | `settingTab.ts` | `src/<engine>/views/settingTab.ts` |
| Engine entry | `index.ts` | `src/<engine>/index.ts` |

Exemplos do rename:

| Antes (Phase 2) | Depois (Phase 4) |
|-----------------|------------------|
| `src/markdown/views/unifiedCodeDetailView.ts` | `src/markdown/views/detailView.ts` |
| `src/markdown/views/codeExplorerView.ts` | `src/markdown/views/explorerView.ts` |
| `src/markdown/models/codeMarkerModel.ts` | `src/markdown/models/codingModel.ts` |
| `src/pdf/views/pdfCodeDetailView.ts` | `src/pdf/views/detailView.ts` |
| `src/pdf/views/pdfCodeExplorerView.ts` | `src/pdf/views/explorerView.ts` |
| `src/pdf/models/pdfCodingModel.ts` | `src/pdf/models/codingModel.ts` |
| `src/image/views/imageCodeDetailView.ts` | `src/image/views/detailView.ts` |
| `src/audio/views/audioCodeDetailView.ts` | `src/audio/views/detailView.ts` |
| `src/csv/views/csvCodeDetailView.ts` | `src/csv/views/detailView.ts` |
| `src/csv/views/csvCodeExplorerView.ts` | `src/csv/views/explorerView.ts` |
| `src/analytics/views/analyticsView.ts` | `src/analytics/views/analyticsView.ts` (sem rename — é único) |

**Resultado:** abrir qualquer engine e ver a mesma estrutura previsível:
```
src/<engine>/
  index.ts              # registerXxxEngine()
  models/
    codingModel.ts      # markers, CRUD, persistência
  views/
    detailView.ts       # 3 modos (extends base)
    explorerView.ts     # tree 3 níveis (extends base)
    settingTab.ts       # settings (se houver)
  <engine-specific>/    # cm6/, pdf/, canvas/, audio/, grid/, etc.
```

---

### Phase 4.1: Base interfaces + marker abstraction

**Criar:** `src/core/baseMarker.ts`

```typescript
/** Propriedades comuns a todos os markers de todos os engines */
export interface BaseMarker {
  id: string;
  codes: string[];
  createdAt: number;
  updatedAt?: number;
}

/** Interface que todo CodingModel deve implementar */
export interface CodingModel<T extends BaseMarker> {
  registry: CodeDefinitionRegistry;
  getAllMarkers(): T[];
  findMarkerById(id: string): T | undefined;
  getMarkersForFile?(fileId: string): T[];
  onChange(listener: () => void): void;
  offChange(listener: () => void): void;
}
```

**Markers por engine (todos estendem BaseMarker):**

| Engine | Marker type | Campos específicos |
|--------|-----------|-------------------|
| Markdown | `Marker` | `fileId`, `range: {from: {line, ch}, to: {line, ch}}`, `color` |
| CSV | `CsvMarker` | `file`, `row`, `column`, `from?`, `to?` |
| PDF | `PdfMarker` | `file`, `page`, `beginIndex/Offset`, `endIndex/Offset`, `text`, `note?` |
| PDF | `PdfShapeMarker` | `file`, `page`, `shape`, `coords`, `note?` |
| Image | `ImageMarker` | `file`, `shape`, `coords` (normalized 0-1) |
| Audio | `AudioMarker` | `from`, `to` (seconds), `memo?` |
| Video | `VideoMarker` | `from`, `to` (seconds), `memo?` |

---

### Phase 4.2: Base Detail View

**Criar:** `src/core/baseDetailView.ts` (~420 LOC)

```typescript
export abstract class BaseDetailView<T extends BaseMarker> extends ItemView {
  protected model: CodingModel<T>;
  private mode: 'list' | 'code' | 'marker' = 'list';
  private currentCode?: string;
  private currentMarkerId?: string;

  // ─── Shared (100% idêntico nos 6 engines) ────────────────
  showList(): void { /* renderiza lista de códigos com swatch, desc, contagem */ }
  showCodeDetail(codeName: string): void { /* renderiza markers de um código */ }
  setContext(markerId: string, codeName: string): void { /* renderiza detalhe de 1 marker */ }

  private renderBackButton(container: HTMLElement): void { /* "← All Codes" */ }
  private renderCodeHeader(container: HTMLElement, def: CodeDefinition): void { /* swatch + nome */ }
  private renderOtherCodesChips(container: HTMLElement, marker: T): void { /* chips clicáveis */ }
  private renderOtherMarkersWithCode(container: HTMLElement, code: string, excludeId: string): void { /* lista */ }

  // ─── Abstract (engine-específico — cada engine implementa) ────────

  /** Label curto do marker para listas. Ex: "notes.md", "Page 3", "0:12 – 0:45", "Rect" */
  abstract getMarkerLabel(marker: T): string;

  /** Preview do conteúdo. Ex: snippet de texto, "33.0s", coords. Null se não aplicável */
  abstract getMarkerPreview(marker: T): string | null;

  /** Navega ao marker no editor/viewer. CM6 scroll, PDF page jump, audio seek, etc. */
  abstract navigateToMarker(marker: T): void | Promise<void>;

  /** Conta segmentos por código. Default usa getAllMarkers(), override se lógica diferente */
  countSegmentsPerCode(): Map<string, number> { /* default implementation */ }

  /** Seção custom no modo marker-focused. Override para memo editável (Audio), shape info (Image), etc. */
  renderMarkerSpecificSection?(container: HTMLElement, marker: T): void;

  /** Agrupa markers para o modo code-focused. Default agrupa por file, override se diferente */
  groupMarkersForCodeView?(markers: T[]): Map<string, T[]>;
}
```

**Implementação por engine (~50-100 LOC cada, em vez de ~300-520):**

```typescript
// src/markdown/views/detailView.ts
export class MarkdownDetailView extends BaseDetailView<Marker> {
  getViewType() { return "qualia-markdown-detail"; }
  getDisplayText() { return "Code Detail"; }

  getMarkerLabel(m: Marker): string {
    return shortenPath(m.fileId);  // "notes.md"
  }
  getMarkerPreview(m: Marker): string | null {
    return m.range ? `Line ${m.range.from.line + 1}` : null;
  }
  navigateToMarker(m: Marker): void {
    scrollToMdMarker(this.app, m);
  }
}

// src/audio/views/detailView.ts
export class AudioDetailView extends BaseDetailView<AudioMarker> {
  getViewType() { return "qualia-audio-detail"; }
  getDisplayText() { return "Audio Code Detail"; }

  getMarkerLabel(m: AudioMarker): string {
    return `${formatTime(m.from)} – ${formatTime(m.to)}`;
  }
  getMarkerPreview(m: AudioMarker): string | null {
    return `${(m.to - m.from).toFixed(1)}s`;
  }
  navigateToMarker(m: AudioMarker): void {
    this.plugin.openAudioAndSeek(m.file, m.from);
  }
  // Seção custom: memo editável
  renderMarkerSpecificSection(container: HTMLElement, m: AudioMarker): void {
    const textarea = container.createEl('textarea', { text: m.memo ?? '' });
    textarea.addEventListener('blur', () => { m.memo = textarea.value; this.model.markDirty(); });
  }
}
```

**Comparação LOC antes/depois por engine:**

| Engine | Antes (standalone) | Depois (extends base) | Economia |
|--------|-------------------|----------------------|----------|
| Markdown | 522 | ~100 | 420 |
| CSV | 295 | ~70 | 225 |
| PDF | 398 | ~90 | 308 |
| Image | 294 | ~65 | 229 |
| Audio | 370 | ~105 (com memo) | 265 |
| Video | 370 | ~105 (com memo) | 265 |
| **Total** | **2,249** | **~535** | **~1,712** |

---

### Phase 4.3: Base Explorer View

**Criar:** `src/core/baseExplorerView.ts` (~300 LOC)

```typescript
export abstract class BaseExplorerView<T extends BaseMarker> extends ItemView {
  protected model: CodingModel<T>;
  private codeNodes: CollapsibleNode[] = [];
  private fileNodes: CollapsibleNode[] = [];

  // ─── Shared (100% idêntico nos 6 engines) ────────────────
  refresh(): void { /* rebuild tree */ }
  private renderToolbar(): void { /* All, Files, Refresh buttons */ }
  private renderTree(): void { /* 3-level tree: code → file → segment */ }
  expandAll(): void { /* codeNodes */ }
  collapseAll(): void { /* codeNodes */ }
  expandFiles(): void { /* fileNodes, auto-expand codes if collapsed */ }
  collapseFiles(): void { /* fileNodes */ }
  private renderFooter(): void { /* "X codes · Y segments" */ }

  // ─── Abstract (engine-específico) ────────────────────────

  /** Constrói index: Map<codeName, Map<fileId, markers[]>> */
  abstract buildCodeIndex(): Map<string, Map<string, T[]>>;

  /** Label do marker no nível 3. Ex: "Line 42", "Page 3", "0:12–0:45" */
  abstract getSegmentLabel(marker: T): string;

  /** Preview do conteúdo no nível 3. Ex: snippet de texto, duração */
  abstract getSegmentPreview(marker: T): string;

  /** Navega ao marker. Mesmo que no DetailView */
  abstract navigateToMarker(marker: T): void | Promise<void>;

  /** Encurta path do arquivo para nível 2. Default: basename */
  shortenPath(filePath: string): string { return filePath.split('/').pop() ?? filePath; }

  /** Search filter (opcional). Audio/Video implementam, outros não */
  renderSearchInput?(toolbar: HTMLElement): void;
}
```

**Economia similar: ~994 LOC eliminados.**

---

### Phase 4.4: Consolidar padrões cross-engine

**`active-leaf-change` dispatcher:**
```typescript
// src/core/fileInterceptor.ts (~40 LOC)
const EXTENSION_ROUTES: Record<string, (file: TFile, plugin: QualiaCodingPlugin) => void> = {};

export function registerFileIntercept(
  extensions: string[],
  handler: (file: TFile, plugin: QualiaCodingPlugin) => void
): void {
  for (const ext of extensions) EXTENSION_ROUTES[ext] = handler;
}

// Registrado uma vez no main.ts:
plugin.registerEvent(app.workspace.on('active-leaf-change', (leaf) => {
  const file = leaf?.view instanceof FileView ? leaf.view.file : null;
  if (!file) return;
  const handler = EXTENSION_ROUTES[file.extension];
  if (handler) handler(file, plugin);
}));
```

Cada engine registra no seu `index.ts`:
```typescript
// src/image/index.ts
registerFileIntercept(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'], openImageView);

// src/audio/index.ts
registerFileIntercept(['mp3', 'wav', 'ogg', 'flac', 'm4a'], openAudioView);

// src/video/index.ts
registerFileIntercept(['mp4', 'webm', 'ogv'], openVideoView);
```

**Settings tab unificada (opcional):**
- Tab única com seções colapsáveis por engine
- Ou: manter tabs separadas (funciona bem com 4-5 tabs)

**Commands renomeados:**
- `create-code-marker` → `qualia:create-marker`
- `open-code-explorer` → `qualia:open-explorer`
- etc.

---

### Phase 4.5: Rename de arquivos + cleanup final

Aplicar a naming convention (D29). Resultado — **qualquer engine tem a mesma cara:**

```
src/markdown/                    src/pdf/                        src/audio/
  index.ts                         index.ts                        index.ts
  models/                          models/                         models/
    codingModel.ts                   codingModel.ts                  codingModel.ts
  views/                           views/                          views/
    detailView.ts  ← extends base    detailView.ts  ← extends base   detailView.ts  ← extends base
    explorerView.ts ← extends base   explorerView.ts ← extends base  explorerView.ts ← extends base
    settingTab.ts                                                    settingTab.ts
  cm6/                             pdf/                            audio/
    markerStateField.ts              highlightRenderer.ts            waveformRenderer.ts
    markerViewPlugin.ts              selectionCapture.ts             regionRenderer.ts
    marginPanelExtension.ts          marginPanel.ts
    ...                              drawLayer.ts
                                     drawInteraction.ts
                                     drawToolbar.ts
```

**A "engine-specific" folder é onde mora a diferença real:**
- `markdown/cm6/` — CodeMirror 6 extensions (decorations, overlay, drag)
- `pdf/pdf/` → renomear para `pdf/rendering/` — highlights CSS %, SVG draw, selection capture
- `image/canvas/` — Fabric.js, region drawing/highlight/labels
- `audio/audio/` → renomear para `audio/player/` — WaveSurfer, regions, minimap
- `csv/grid/` — AG Grid, cell renderers, segment editor

---

### Phase 4.6: Base Coding Menu (D30)

**Objetivo:** eliminar ~442 LOC de código idêntico entre os 6 coding menus. Extrair funções compartilhadas — **não** uma classe base (menus existentes são funcionais, não OOP).

**Criar:** `src/core/baseCodingMenu.ts` (~120 LOC)

```typescript
import { TextComponent, ToggleComponent, setIcon } from 'obsidian';

// ── Helpers (atualmente duplicados 5-7x) ───────────────────

export function createActionItem(title: string, iconName: string, onClick: () => void): HTMLElement;
export function createSeparator(): HTMLElement;
export function applyThemeColors(container: HTMLElement): void;
export function applyInputTheme(input: HTMLInputElement): void;
export function positionAndClamp(container: HTMLElement, anchor: {x: number, y: number}, gap?: number): void;

// ── Popover factory (lifecycle: create → add content → mount) ──

export interface PopoverOptions {
  className?: string;                // CSS class. Default: 'codemarker-popover'
  anchor?: { x: number; y: number }; // Posição. Omitir se caller posiciona manualmente
  applyTheme?: boolean;               // Injetar CSS vars. Default: true
  onContainerCreated?: (el: HTMLElement) => void; // Hook para hover-aware listeners (PDF)
}

export interface PopoverHandle {
  container: HTMLElement;
  close: () => void;
  mount: () => void;  // Append to document.body, position, clamp, register close handlers
}

export function createPopover(options: PopoverOptions): PopoverHandle;

// ── Code input section ─────────────────────────────────────

export function renderCodeInput(
  parent: HTMLElement,
  callbacks: { onEnter: (name: string) => void; onEscape: () => void },
  applyTheme?: boolean,
): TextComponent;

// ── Toggle list section ────────────────────────────────────

export interface CodeToggleItem {
  name: string;
  color: string;
  isActive: boolean;
}

export function renderToggleList(
  parent: HTMLElement,
  codes: CodeToggleItem[],
  callbacks: {
    onToggle: (codeName: string, newValue: boolean) => void;
    onNavigate?: (codeName: string) => void;  // Se presente, renderiza arrow (Audio/Video)
  },
): void;
```

**Uso por engine:**

| Engine | `createPopover` | `renderCodeInput` | `renderToggleList` | O que sobra como engine-específico |
|--------|:-:|:-:|:-:|-----------------------------------|
| **Audio** | Sim | Sim | Sim (+onNavigate) | memo textarea, cleanup empty marker on close, regionRenderer refresh |
| **Video** | Sim | Sim | Sim (+onNavigate) | idêntico ao Audio (só class name e model type diferem) |
| **CSV** | Sim | Sim | Sim | batch mode (`openBatchCodingPopover`), gridApi.refreshCells, findOrCreateRowMarker |
| **PDF** | Sim (+onContainerCreated para hover timer) | Sim | Sim | cross-page badge, shape popover, hover-aware close timer |
| **Markdown** | **Não** (CM6 tooltip gerencia lifecycle) | Sim | Sim (+swatch adicionado) | selection preview, CM6 dispatch, approaches A/B/C |
| **Image** | **Não** (class-based, container-relative) | Não | Sim (switch para ToggleComponent) | class lifecycle, Fabric.js callbacks, header com close button |

**Exemplo — Audio antes/depois:**

```typescript
// ANTES (~285 LOC): helpers locais + skeleton + toggle loop + input + close handlers
export function openAudioCodingPopover(...) {
  const container = document.createElement('div'); // 5 LOC skeleton
  // ... 12 LOC close handlers
  // ... 20 LOC TextComponent input
  // ... 25 LOC toggle loop com swatch + ToggleComponent + nav arrow
  // ... 18 LOC createActionItem x3
  // ... 10 LOC position + clamp
  // ... 40 LOC engine-specific (memo, cleanup, refresh)
}

// DEPOIS (~170 LOC): imports + engine-specific
import { createPopover, renderCodeInput, renderToggleList, createActionItem, createSeparator } from '../core/baseCodingMenu';

export function openAudioCodingPopover(...) {
  const { container, close, mount } = createPopover({ className: 'codemarker-audio-popover', anchor: pos });

  renderCodeInput(container, { onEnter: (name) => { ... }, onEscape: close }, false);
  container.appendChild(createSeparator());

  renderToggleList(container, allCodes.map(c => ({ ... })), {
    onToggle: (name, value) => { ... regionRenderer.refreshRegion(...) },
    onNavigate: (name) => { close(); onNavigate(markerId, name); },
  });

  // Engine-specific: memo textarea
  if (existingMarker?.codes.length) { ... }

  container.appendChild(createSeparator());
  container.appendChild(createActionItem('Add New Code', 'plus-circle', () => { ... }));
  container.appendChild(createActionItem('New Code...', 'palette', () => { ... }));
  container.appendChild(createActionItem('Remove All', 'trash', () => { ... }));

  mount();
}
```

**Ordem de refactor:**

1. **Audio + Video** (mais fáceis, quase idênticos) — valida o padrão
2. **CSV** (`openCodingPopover` usa base, `openBatchCodingPopover` usa `renderToggleList` mas mantém lógica batch)
3. **PDF** (ambos popovers, hover timer via `onContainerCreated`)
4. **Markdown** — importa `renderCodeInput` + `renderToggleList` + helpers, **não** usa `createPopover`. Adiciona swatch aos toggles (fix de inconsistência)
5. **Image** — refactor parcial: switch custom checkbox para `ToggleComponent` via `renderToggleList()`, importa `createActionItem()`. Mantém class structure e container-relative positioning

**LOC por engine antes/depois:**

| Engine | Antes | Depois | Economia |
|--------|-------|--------|----------|
| Audio | 285 | ~170 | 115 |
| Video | 285 | ~170 | 115 |
| CSV | 480 | ~350 | 130 |
| PDF | 430 | ~340 | 90 |
| Markdown | 250 | ~180 | 70 |
| Image | 184 | ~160 | 24 |
| baseCodingMenu.ts | 0 | +120 | -120 |
| **Total** | **1,914** | **~1,490** | **~442** |

---

### Estrutura final após Phase 4

```
src/
  main.ts                              # ~30 LOC: imports + register calls
  core/
    types.ts                           # CodeDefinition, QualiaData, EngineCleanup, BaseMarker
    dataManager.ts                     # Estado in-memory + save debounced
    codeDefinitionRegistry.ts          # 1 cópia canônica
    codeFormModal.ts                   # 1 cópia canônica
    baseDetailView.ts                  # Classe abstrata — 3 modos, ~420 LOC
    baseExplorerView.ts                # Classe abstrata — tree 3 níveis, ~300 LOC
    fileInterceptor.ts                 # Dispatcher active-leaf-change, ~40 LOC
  markdown/
    index.ts                           # registerMarkdownEngine()
    models/codingModel.ts              # Marker, CRUD, snap-back sync
    views/detailView.ts                # extends BaseDetailView<Marker> (~100 LOC)
    views/explorerView.ts              # extends BaseExplorerView<Marker> (~80 LOC)
    views/settingTab.ts
    cm6/                               # 5 CM6 extensions
      markerStateField.ts
      markerViewPlugin.ts
      selectionMenuField.ts
      hoverMenuExtension.ts
      marginPanelExtension.ts
      utils/viewLookupUtils.ts         # Standalone editor registry (D23)
      utils/markerPositionUtils.ts
    menu/
      cm6NativeTooltipMenu.ts          # Approach C (ativo)
      cm6TooltipMenu.ts               # Approach B (NÃO modificar)
      obsidianMenu.ts                  # Approach A (NÃO modificar)
      menuController.ts
      menuActions.ts
      menuTypes.ts
      codeFormModal.ts
  pdf/
    index.ts                           # registerPdfEngine()
    models/codingModel.ts              # PdfMarker, PdfShapeMarker
    views/detailView.ts                # extends BaseDetailView<PdfMarker> (~90 LOC)
    views/explorerView.ts              # extends BaseExplorerView<PdfMarker> (~70 LOC)
    rendering/                         # (era pdf/)
      highlightRenderer.ts
      selectionCapture.ts
      marginPanel.ts                   # Overlay "page push" (NÃO compartilha com markdown)
      drawLayer.ts
      drawInteraction.ts
      drawToolbar.ts
    menu/pdfCodingMenu.ts
  csv/
    index.ts                           # registerCsvEngine()
    models/codingModel.ts              # CsvMarker (row + segment)
    views/detailView.ts                # extends BaseDetailView<CsvMarker> (~70 LOC)
    views/explorerView.ts              # extends BaseExplorerView<CsvMarker> (~65 LOC)
    views/csvView.ts                   # FileView + AG Grid
    grid/                              # AG Grid config, renderers, editors
    menu/codingMenu.ts
  image/
    index.ts                           # registerImageEngine()
    models/codingModel.ts              # ImageMarker (shape + normalized coords)
    views/detailView.ts                # extends BaseDetailView<ImageMarker> (~65 LOC)
    views/explorerView.ts              # extends BaseExplorerView<ImageMarker> (~60 LOC)
    views/settingTab.ts
    canvas/                            # Fabric.js
      fabricCanvas.ts
      regionDrawing.ts
      regionHighlight.ts
      regionLabels.ts
    menu/codingMenu.ts
  audio/
    index.ts                           # registerAudioEngine()
    models/codingModel.ts              # AudioMarker (from/to seconds + memo)
    views/detailView.ts                # extends BaseDetailView<AudioMarker> (~105 LOC, com memo)
    views/explorerView.ts              # extends BaseExplorerView<AudioMarker> (~75 LOC, com search)
    views/settingTab.ts
    player/                            # (era audio/)
      waveformRenderer.ts
      regionRenderer.ts
  video/
    index.ts                           # registerVideoEngine()
    models/codingModel.ts              # VideoMarker (from/to seconds + memo)
    views/detailView.ts                # extends BaseDetailView<VideoMarker> (~105 LOC, com memo)
    views/explorerView.ts              # extends BaseExplorerView<VideoMarker> (~75 LOC, com search)
    views/settingTab.ts
    player/                            # (era video/)
      waveformRenderer.ts
      regionRenderer.ts
  analytics/
    index.ts                           # registerAnalyticsEngine()
    data/                              # dataReader (reescrito), consolidator, stats engines
    views/analyticsView.ts             # 19 ViewModes (sem abstração — é único)
    board/                             # Research Board (Fabric.js)
```

### Resumo da economia Phase 4

| O quê | LOC eliminados |
|-------|---------------|
| 6 detail views → extends base | ~1,712 |
| 6 explorer views → extends base | ~994 |
| 6 coding menus → shared functions (D30) | ~442 |
| 5 cópias codeDefinitionRegistry | 650 |
| 4 cópias codeFormModal | ~300 |
| active-leaf-change consolidação | ~60 |
| **Total** | **~4,158** |

### Critério de done Phase 4

> **Nota (2026-02-28):** No APPROACH2.md, estas abstrações foram feitas upfront (core na Camada 2).
> Os itens abaixo marcados como [x] já existem. Os restantes dependem dos engines 8-10.

- [x] `src/core/baseDetailView.ts` e `baseExplorerView.ts` existem — `baseCodeDetailView.ts`, `baseCodeExplorerView.ts`
- [x] `src/core/baseCodingMenu.ts` existe com 7 exports
- [x] Markdown detail view estende base (<120 LOC) ✓
- [x] Markdown explorer view estende base (<90 LOC) ✓
- [x] PDF detail view estende base (~60 LOC) ✓
- [x] PDF explorer view estende base (~55 LOC) ✓
- [ ] CSV detail/explorer views estendem base — aguarda Camada 8
- [ ] Image/Audio/Video detail/explorer views estendem base — aguarda Camada 9
- [x] PDF coding menu importa de `baseCodingMenu.ts` ✓
- [ ] Outros 4 coding menus importam de `baseCodingMenu.ts` — aguarda Camadas 8-9
- [ ] Naming convention (D29) aplicada em todos os engines
- [ ] Subfolders engine-specific renomeadas
- [ ] `fileInterceptor.ts` com dispatcher único para active-leaf-change
- [ ] Build sem erro, todos os smoke tests por engine passam
- [x] Zero duplicação de CodeDefinitionRegistry e CodeFormModal (core/ canônico)

**Estimativa:** 6-8 dias (era 5-7, +1 dia para menu unification). Se travar, pula — plugin funciona 100% sem isso.

---

## Phase 5: Deletar antigos

```bash
rm -rf .obsidian/plugins/obsidian-codemarker-v2/
rm -rf .obsidian/plugins/obsidian-codemarker-csv/
rm -rf .obsidian/plugins/obsidian-codemarker-image/
rm -rf .obsidian/plugins/obsidian-codemarker-pdf/
rm -rf .obsidian/plugins/obsidian-codemarker-audio/
rm -rf .obsidian/plugins/obsidian-codemarker-video/
rm -rf .obsidian/plugins/obsidian-codemarker-analytics/
rm -rf .obsidian/codemarker-shared/
```

---

## Estrutura final

A estrutura abaixo reflete o estado **pós-Phase 4** (com abstrações). Se Phase 4 for pulada, a estrutura é similar mas sem `base*.ts` em `core/` e com nomes de arquivos engine-prefixed (ex: `pdfCodeDetailView.ts` em vez de `detailView.ts`).

```
.obsidian/plugins/qualia-coding/
  CLAUDE.md                          # Conhecimento consolidado
  WORKLOG.md                         # Decisões arquiteturais
  BACKLOG.md                         # Features planejadas
  manifest.json                      # id: qualia-coding
  package.json                       # Todas as deps
  esbuild.config.mjs
  tsconfig.json                      # Unificado, strict + skipLibCheck (D26)
  styles.css                         # Concatenação (collision-scanned)
  main.js                            # Output do build
  data.json                          # Formato QualiaData
  board.json                         # Research Board state
  src/
    main.ts                          # ~30 LOC: imports + register calls
    core/
      types.ts                       # CodeDefinition, QualiaData, EngineCleanup, BaseMarker
      dataManager.ts                 # Estado in-memory + save debounced
      codeDefinitionRegistry.ts      # 1 cópia canônica — CRUD de codes
      codeFormModal.ts               # 1 cópia canônica — color picker + desc
      baseDetailView.ts              # Classe abstrata — 3 modos (~420 LOC)
      baseExplorerView.ts            # Classe abstrata — tree 3 níveis (~300 LOC)
      baseCodingMenu.ts              # Funções compartilhadas — popover, toggles, helpers (~120 LOC)
      fileInterceptor.ts             # Dispatcher active-leaf-change (~40 LOC)
    markdown/
      index.ts                       # registerMarkdownEngine()
      models/codingModel.ts          # Marker, CRUD, snap-back sync
      views/detailView.ts            # extends BaseDetailView<Marker> (~100 LOC)
      views/explorerView.ts          # extends BaseExplorerView<Marker> (~80 LOC)
      views/settingTab.ts
      cm6/                           # 5 CM6 extensions
        markerStateField.ts
        markerViewPlugin.ts
        selectionMenuField.ts
        hoverMenuExtension.ts
        marginPanelExtension.ts
        utils/viewLookupUtils.ts     # Standalone editor registry (D23)
        utils/markerPositionUtils.ts
      menu/
        cm6NativeTooltipMenu.ts      # Approach C (ativo)
        cm6TooltipMenu.ts            # Approach B (NÃO modificar)
        obsidianMenu.ts              # Approach A (NÃO modificar)
        menuController.ts
        menuActions.ts
        menuTypes.ts
        codeFormModal.ts
    pdf/
      index.ts                       # registerPdfEngine()
      models/codingModel.ts          # PdfMarker, PdfShapeMarker
      views/detailView.ts            # extends BaseDetailView<PdfMarker> (~90 LOC)
      views/explorerView.ts          # extends BaseExplorerView<PdfMarker> (~70 LOC)
      rendering/                     # PDF.js rendering
        highlightRenderer.ts
        selectionCapture.ts
        marginPanel.ts               # Overlay "page push"
        drawLayer.ts
        drawInteraction.ts
        drawToolbar.ts
      menu/pdfCodingMenu.ts
    csv/
      index.ts                       # registerCsvEngine()
      models/codingModel.ts          # CsvMarker (row + segment)
      views/detailView.ts            # extends BaseDetailView<CsvMarker> (~70 LOC)
      views/explorerView.ts          # extends BaseExplorerView<CsvMarker> (~65 LOC)
      views/csvView.ts               # FileView + AG Grid
      grid/                          # AG Grid config, renderers, editors
      menu/codingMenu.ts
    image/
      index.ts                       # registerImageEngine()
      models/codingModel.ts          # ImageMarker (shape + normalized coords)
      views/detailView.ts            # extends BaseDetailView<ImageMarker> (~65 LOC)
      views/explorerView.ts          # extends BaseExplorerView<ImageMarker> (~60 LOC)
      views/settingTab.ts
      canvas/                        # Fabric.js
        fabricCanvas.ts
        regionDrawing.ts
        regionHighlight.ts
        regionLabels.ts
      menu/codingMenu.ts
    audio/
      index.ts                       # registerAudioEngine()
      models/codingModel.ts          # AudioMarker (from/to + memo)
      views/detailView.ts            # extends BaseDetailView<AudioMarker> (~105 LOC)
      views/explorerView.ts          # extends BaseExplorerView<AudioMarker> (~75 LOC)
      views/settingTab.ts
      player/                        # WaveSurfer
        waveformRenderer.ts
        regionRenderer.ts
    video/
      index.ts                       # registerVideoEngine()
      models/codingModel.ts          # VideoMarker (from/to + memo)
      views/detailView.ts            # extends BaseDetailView<VideoMarker> (~105 LOC)
      views/explorerView.ts          # extends BaseExplorerView<VideoMarker> (~75 LOC)
      views/settingTab.ts
      player/                        # WaveSurfer + video
        waveformRenderer.ts
        regionRenderer.ts
    analytics/
      index.ts                       # registerAnalyticsEngine()
      data/                          # dataReader (reescrito), consolidator, stats
      views/analyticsView.ts         # 19 ViewModes (sem abstração — é único)
      board/                         # Research Board (Fabric.js)
  engines/                           # Phase 3: bundles separados (lazy)
    csv.js
    image.js
    audio.js
    video.js
    analytics.js
```

---

## Smoke Test por Engine (checklist)

Aplicar após portar cada engine na Phase 2:

- [ ] Build sem erro TypeScript
- [ ] Plugin carrega no Obsidian sem crash
- [ ] Abrir arquivo do tipo (md/csv/img/pdf/audio/video)
- [ ] Criar marker/region/annotation
- [ ] Assign código ao marker
- [ ] Explorer sidebar mostra marker
- [ ] Detail sidebar mostra 3 modos (lista, code-focused, marker-focused)
- [ ] Salvar (auto-save ou ctrl+S)
- [ ] Recarregar Obsidian (ctrl+R)
- [ ] Marker persiste com códigos corretos após reload
- [ ] Navegação sidebar → editor (click leva ao local correto)

---

## Timeline

| Fase | Escopo | Duração estimada |
|------|--------|-----------------|
| Phase -1 | Consolidar documentação | 1 dia |
| **Phase 0.1** | **Scaffold (build pipeline, diretórios)** | **0.5 dia** |
| **Phase 0.2** | **Model + Registry** | **0.5 dia** |
| **Phase 0.3** | **Decorations + Selection menu** | **1 dia** |
| **Phase 0.4** | **Hover + Handles overlay** | **1 dia** |
| **Phase 0.5** | **Margin Panel (+ refinamentos)** | **1-2 dias** |
| **Phase 0.6** | **Views + Finalização markdown** | **1 dia** |
| Phase 1 | Core (DataManager, types, registry canônico) | 2-3 dias |
| Phase 2.1 | PDF engine | 0.5-1 dia |
| Phase 2.2 | CSV engine (herda CM6 refinado da Phase 0) | 1-2 dias |
| Phase 2.3 | Image engine | 0.5-1 dia |
| Phase 2.4 | Audio engine | 0.5-1 dia |
| Phase 2.5 | Video engine | 0.5 dia |
| Phase 2.6 | Analytics engine | 1-2 dias |
| Phase 3 | Lazy loading (multi-build esbuild) | 2-3 dias |
| Phase 4 | Abstrações + organização unificada (~3,700 LOC eliminados) | 5-7 dias |
| Phase 5 | Deletar plugins antigos | 0.5 dia |
| **Total (sem Phase 4)** | | **~15-19 dias** |
| **Total (com Phase 4)** | | **~20-26 dias** |

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Fabric.js 6.6.1 → 6.9.1 | Testar canvas de imagem após upgrade |
| Bundle 4.4MB | Multi-build esbuild Phase 3 — main.js ~210KB, engines lazy via `require()` (D12) |
| CSV hybrid complexo | Port early (2.2), smoke test junto com markdown |
| Abstração errada | Phase 4 é nice-to-have |
| Mudança markdown quebra CSV | Smoke test CSV após qualquer mudança CM6 |
| dataReader rewrite | Interface de saída não muda, só a fonte (agora in-memory via DataManager) |
| Race condition data.json | DataManager centralizado — 1 timer, estado in-memory (D11) |
| ESM incompatível com Obsidian | Multi-build esbuild com `require()` relativo (D12) |
| Engine não limpa recursos | EngineCleanup return function + reverse-order teardown (D13) |
| Primeiro load data.json null | `createDefaultData()` factory + shallow merge (D14) |
| CM6 extensions duplicadas | Apenas markdown engine registra globalmente; CSV usa extensions no EditorView constructor (D16) |
| View type ID collision v2/CSV | IDs únicos `qualia-*` por engine; UnifiedCodeDetailView eliminada (D20) |
| board.json aponta para plugin antigo | Path atualizado em Phase 2.6 (D19) |
| Registry migration perde definitions | `migrateRegistries()` merges por `updatedAt`. Smoke test: criar definitions em 2+ plugins, verificar que todas aparecem após merge (D21) |
| Command ID colisão silenciosa | Cópias do CSV deletadas; markdown engine é dono único dos 4 comandos compartilhados (D24) |
| tsconfig strictness quebra engines portados | `skipLibCheck: true` + fix incremental de warnings. Strictness flags do v2 preservadas mas não bloqueiam build (D26) |
| CSV UI duplicada (menus, ribbon, settings) | 7 items deletados do CSV: editor-menu, file-menu, ribbon, settings tab, 2 views, registerEditorExtension (D28) |
