# Qualia Coding — Visão do Merge

## O que este projeto É (e o que NÃO é)

Este **não** é um projeto de construir do zero. Os 7 plugins já existem, já funcionam no Obsidian, e os conceitos estão todos validados:

- `obsidian-codemarker-v2` (markdown) ✅
- `obsidian-codemarker-pdf` ✅
- `obsidian-codemarker-csv` ✅
- `obsidian-codemarker-image` ✅
- `obsidian-codemarker-audio` ✅
- `obsidian-codemarker-video` ✅
- `obsidian-codemarker-analytics` ✅

O problema é que ao desenvolver os 7 em paralelo, houve duplicação massiva — menus, views, registry, modais copiados N vezes. Não dá pra publicar assim.

**O objetivo é destilar:** pegar o melhor de cada implementação, eliminar duplicação, produzir um único plugin coeso chamado `qualia-coding`.

---

## O modelo mental correto

O `qualia-coding` é um **framework** de análise qualitativa. Os 7 engines são a prova de que o framework funciona.

```
core/          ← infraestrutura compartilhada, escrita uma vez
  └─ cada engine implementa só o que é específico do seu formato
```

Consequência: adicionar suporte a um novo formato no futuro (epub, por exemplo) seria criar `src/epub/` e implementar só o específico do formato — menu, sidebar e margin panel já funcionariam de graça.

---

## Princípio de execução

**Por capacidade, olhando cross-engine. Não por engine.**

Cada camada de trabalho implementa uma capacidade (marcação, menu, sidebar...) já olhando os 7 plugins lado a lado para pegar a versão mais completa antes de escrever qualquer linha. Quando os engines chegarem, só conectam o que já está pronto.

**A abstração não é especulativa** — você está observando código que já funciona, não adivinhando. Isso muda tudo: o risco de "base class errada" não existe porque os 7 casos concretos já estão na sua frente.

---

## Sequência de trabalho

### Camada 0 — Consolidar documentação

Antes de tocar em código. Todo o conhecimento espalhado pelos 7 plugins (READMEs, ARCHITECTURE.md de 142KB do v2, BRIEFINGs, CLAUDEs, TODOs, ROADMAPs) precisa estar num formato que qualquer sessão de Claude Code consiga usar como contexto sem ler 7 plugins inteiros.

**Fontes a ler:**
- v2: README.md, ARCHITECTURE.md (142KB, 9 partes), CLAUDE.md, COMPONENTS.md, DEVELOPMENT.md, WORKLOG.md
- CSV: TODO.md
- PDF: CLAUDE.md
- Audio: BRIEFING.md, CLAUDE.md
- Analytics: ROADMAP.md
- Memory: MEMORY.md, board-roadmap.md

**Artefatos a produzir:**

1. **CLAUDE.md** — no root do qualia-coding. Uma seção por engine com tudo que importa pra executar: patterns CM6 do markdown (StateField, ViewPlugins, Approach C, MutationObserver self-suppression, `findSmallestMarkerAtPos`), AG Grid gotchas do CSV (wrapper chain `width: 100%`, standalone editor registry, virtual fileIds), Fabric.js gotchas do Image+Analytics (`fireRightClick: true`, `subTargetCheck: false` em Groups, `setCoords()` após pan/zoom), WaveSurfer shadow DOM do Audio/Video (container externo, ResizeObserver debounced), PDF.js nativo (SVG overlay z-index 4, coords CSS %), cross-engine patterns (`active-leaf-change` para intercept, custom events, `registerExtensions` só CSV).

2. **WORKLOG.md** — decisões arquiteturais que impactam o merge: por que Approach C (CM6 native tooltip) e não A ou B, por que margin panel é overlay externo no PDF, por que standalone editor registry no CSV, por que arrows são Line+Triangle no board, por que vertical lanes no Audio/Video.

3. **CSS collision scan** — confirmar zero colisões entre os 7 plugins. Resultado esperado: cada plugin já usa prefixo único (`codemarker-pdf-*`, `codemarker-audio-*`, `csv-*`, etc.). Ação: concatenar os 7 `styles.css` na ordem v2 > PDF > CSV > Image > Audio > Video > Analytics, dedup blocos idênticos. NÃO renomear para `qc-*`.

4. **BACKLOG.md** — features planejadas consolidadas dos 7 plugins. Categorias: imediato (v0 fixes), curto prazo, médio prazo, longo prazo (plataforma).

**Done:** qualquer sessão de Claude Code consegue trabalhar no qualia-coding lendo só CLAUDE.md, sem precisar navegar os 7 plugins antigos.

### Camada 1 — Scaffold
Plugin `qualia-coding` compila e carrega. Build pipeline, `manifest.json`, `package.json` com todas as deps, `tsconfig.json` unificado, `styles.css` concatenado dos 7 plugins.

### Camada 2 — Core (infraestrutura)
Tudo que é compartilhado, escrito uma vez:
- `DataManager` — estado in-memory único, save debounced 500ms. Engines nunca chamam `loadData()`/`saveData()` diretamente.
- `CodeDefinitionRegistry` — cópia canônica. As outras 6 morrem.
- `CodeFormModal` — cópia canônica. As outras 4 morrem.
- `types.ts` — `QualiaData`, `CodeDefinition`, `EngineCleanup`, `createDefaultData()`

### Camada 3 — Marcação de texto (Markdown)
Só highlights visíveis no editor. Sem menu, sem hover, sem sidebar.
- `CodeMarkerModel` — load/save via DataManager
- `markerStateField` — StateField com decorações CM6
- Smoke test: abrir markdown → highlights coloridos → reload → persistem

### Camada 4 — Menu unificado
**Olhar os 7 menus antes de escrever qualquer linha.** Identificar o que é idêntico, o que diverge, qual implementação está mais completa. Escrever uma vez em `core/baseCodingMenu.ts`.
- `createPopover()`, `renderCodeInput()`, `renderToggleList()`, `createActionItem()`, `positionAndClamp()`
- Conectar no Markdown (CM6 tooltip lifecycle — não usa `createPopover`, usa as demais funções)
- Smoke test: selecionar texto → menu abre → toggle código → marker criado

### Camada 5 — Hover + Handles (Markdown)
- `markerViewPlugin` — handles SVG, drag-resize, hover detection
- `hoverMenuExtension` — hover delay 350ms, menu sobre marker existente
- Smoke test: hover → menu → drag handle → resize persiste

### Camada 6 — Margin panel (Markdown)
O componente mais complexo. Tem uma janela dedicada de refinamento aqui porque:
1. Está isolado — sem dependência de outros engines ainda
2. Qualquer melhoria cascateia para CSV segment editor depois

- `marginPanelExtension` — barras MAXQDA-style, labels, hover bidirecional completo
- Smoke test: barras na margem → hover bidirecional texto ↔ panel → RLL toggle

### Camada 7 — Sidebar unificada
**Olhar as 7 implementações antes de escrever qualquer linha.** A sidebar final mostra uma lista única de todos os códigos, e ao clicar num código exibe os trechos de qualquer engine — markdown, CSV, áudio, vídeo — na mesma interface.

```
Code: "Resistência"
  notes.md         → linhas 5-12          [markdown]
  entrevista.csv   → linha 3, col B       [CSV]
  entrevista.mp3   → 0:05 – 0:12         [áudio]
  entrevista.mp4   → 0:05 – 0:12         [vídeo]
```

- `baseDetailView` — 3 modos: lista, code-focused, marker-focused. ~80% shared.
- `baseExplorerView` — tree 3 níveis: Code → File → Segment. ~89% shared.
- Markdown implementa os métodos concretos: `formatMarkerLabel()`, `navigateToMarker()`, etc.
- Smoke test: sidebar abre → lista códigos → click → 3 modos → navega ao marker

Markdown engine completo e fechado aqui. Paridade total com `obsidian-codemarker-v2`.

### Camada 8 — PDF ✅
Similar ao markdown. Aproveita menu, sidebar e margin panel já prontos.
- `PdfCodingModel` — PdfMarker (texto) + PdfShapeMarker (formas desenhadas)
- Highlights CSS %, SVG draw layer, draw toolbar, "page push" margin panel
- `detailView` e `explorerView` estendem as bases da camada 7
- Smoke test: abrir PDF → highlight → draw rect → assign code → sidebar → reload

### Camada 9 — CSV ✅
O engine híbrido: AG Grid para a tabela + CM6 para o segment editor.
- Segment editor importa as 5 CM6 extensions de `src/markdown/cm6/` — **não duplica**
- `registerEditorExtension()` **não** é chamado pelo CSV (markdown já registrou globalmente). Se CSV também registrar, haverá decorations duplicados em todo editor markdown.
- `detailView` e `explorerView` estendem as bases da camada 7
- Menu refatorado: `codingMenu.ts` usa `openCodingPopover()` (de 426 → 170 LOC)
- Fix sidebar: virtual fileIds `csv:*` filtrados em `codeMarkerModel.ts` para não aparecerem como arquivos separados
- Smoke test: abrir CSV → AG Grid → segment editor com decorations → sidebar ✅

### Camada 10 — Image, Audio, Video ✅
Os 3 chegam num framework pronto — menu, sidebar e views já funcionam.
- Cada um implementa só o específico: Fabric.js (image), WaveSurfer (audio/video)
- **Player unificado**: `src/media/` com `waveformRenderer.ts`, `regionRenderer.ts`, `formatTime.ts`, `mediaTypes.ts` — compartilhado entre Audio e Video
- `waveformRenderer.create()` aceita `string | HTMLMediaElement` (audio usa URL, video usa `<video>`)
- `MediaRegionRenderer` genérica via `MediaCodingModelLike` interface
- `mediaType` discriminant (`'audio' | 'video'`) nas sidebar adapters para type guards
- Video: `<video>` element + waveform + transport bar, setting `videoFit: 'contain' | 'cover'`
- Todos os menus (5 engines) usam `openCodingPopover()` compartilhado
- Smoke test: abrir .mp3/.mp4 → waveform → coding → sidebar com type guards ✅

### Camada 11 — Analytics
Já está funcionando e quieto. Mexe pouco.
- Reescrever só `dataReader.ts`: de "lê 7 arquivos via vault.adapter.read()" para "acessa DataManager in-memory". Interface de saída `ConsolidatedData/UnifiedMarker[]` não muda.
- Atualizar `board.json` path para `.obsidian/plugins/qualia-coding/board.json`

### Camada 12 — Lazy loading + Cleanup
- Multi-build esbuild: `main.js` ~210KB (core + markdown + PDF eager), engines pesados carregam via `require()` no `onOpen()`
- Deletar os 7 diretórios antigos e `.obsidian/codemarker-shared/`

---

## Regras invioláveis

**Antes de implementar qualquer capacidade compartilhada:** ler as implementações existentes em todos os plugins que têm aquela capacidade. Só então escrever.

**Engines nunca chamam `loadData()`/`saveData()` diretamente.** Sempre via `plugin.dataManager.section("engine")` e `plugin.dataManager.setSection("engine", data)`.

**Só o markdown engine chama `registerEditorExtension()`.** CSV cria `EditorView` standalone e passa as extensions no constructor — nunca registra globalmente.

**Cada camada tem um smoke test antes de avançar.** Uma camada não está pronta enquanto o smoke test não passa.

**`main.ts` deve ter ~15 LOC.** Se estiver crescendo, algo está no lugar errado.

---

## Estrutura final esperada

```
src/
  main.ts                    # ~85 LOC (register 6 engines + unified sidebar)
  core/
    types.ts
    dataManager.ts
    codeDefinitionRegistry.ts
    codeFormModal.ts
    codingPopover.ts          # openCodingPopover() — usado por todos os 5 engines
    settingTab.ts
    unifiedModelAdapter.ts    # merge 6 SidebarModelInterface → 1
    unifiedExplorerView.ts    # sidebar única, type guards por engine
    unifiedDetailView.ts
    baseCodeExplorerView.ts
    baseCodeDetailView.ts
  media/                     # compartilhado Audio + Video
    waveformRenderer.ts       # WaveSurfer lifecycle (url | HTMLMediaElement)
    regionRenderer.ts         # MediaRegionRenderer genérico
    formatTime.ts
    mediaTypes.ts             # MediaMarker, MediaCodingModelLike
  markdown/
  pdf/
  csv/
  image/
  audio/
  video/
  analytics/
engines/                     # bundles lazy (camada 12)
  csv.js, image.js, audio.js, video.js, analytics.js
```

Adicionar um novo formato no futuro (epub, etc.) = criar `src/epub/` com `codingModel.ts`, `detailView.ts` e `explorerView.ts` implementando os métodos específicos do formato. O resto já funciona.

---

## Referência técnica: MERGE-PLAN.md

Este documento é a visão e sequência de trabalho. O detalhe técnico de execução está em `MERGE-PLAN.md`, que contém:

- **Decisões D1–D30** — resoluções técnicas que se aplicam durante a execução (ex: D16 = só markdown registra `registerEditorExtension`, D25 = ordem de concatenação CSS, D23 = qual `viewLookupUtils.ts` é canônico)
- **Schema do `QualiaData`** — estrutura completa do `data.json` unificado com seções tipadas por engine (Phase 1)
- **`DataManager`** — implementação com `load()`, `section()`, `setSection()`, `markDirty()`, migration de 3 formatos legacy (D21, D22)
- **Tabela de View Type IDs** — 18 IDs antigos → novos (Phase 0.6)
- **Tabela de Custom Events** — 7 eventos renomeados
- **Dedup CSV** — lista exata do que deletar do CSV no merge (D24, D28): 4 comandos, editor-menu handler, file-menu handler, ribbon, settings tab
- **esbuild multi-build** — configuração para lazy loading (Phase 3)
- **CSS scan** — resultado da análise de colisões (zero), ordem de concatenação, divergência conhecida em `.codemarker-code-form .cm-form-actions`

Na execução, este documento diz **o que fazer e em que ordem**. O MERGE-PLAN diz **como fazer cada passo**.
