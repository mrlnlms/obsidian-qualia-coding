# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema. Items resolvidos foram movidos para `HISTORY.md § Consolidacao tecnica`.

---

## 1. PDF lifecycle e state

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~P1~~ | ~~FEITO~~ | `pageObserver.ts` | ~~Timeouts rastreados em Map e cancelados em stop()~~ |
| ~~P2~~ | ~~FEITO~~ | `highlightRenderer.ts:105`, `drawLayer.ts:24` | ~~Hover/popover state global ao modulo. Duas PDF views: hover numa pane cancela popover da outra~~ |
| ~~P3~~ | ~~FEITO~~ | `drawLayer.ts:25-26` | ~~shapeHoverTimer/currentHoverShapeId globais. stop() nao limpa. Timer dispara em elementos destruidos~~ |
| ~~P4~~ | ~~FEITO~~ | `pdf/index.ts` | ~~cleanupOrphanedObservers agora remove listeners e limpa childListeners Map~~ |
| ~~P5~~ | ~~FEITO~~ | `pdfCodingMenu.ts` | ~~setMemo agora chama notify() em vez de save() direto~~ |
| ~~P6~~ | ~~FEITO~~ | `pdfCodingModel.ts` | ~~removeMarker() agora chama notify() (com silent flag pra chamadas internas)~~ |
| ~~P7~~ | ~~FEITO~~ | `highlightGeometry.ts` | ~~Removido pageY no-op~~ |
| ~~P8~~ | ~~FEITO~~ | `drawInteraction.ts` | ~~Keyboard handler filtra contenteditable + guard unificado no topo~~ |
| ~~P9~~ | ~~FEITO~~ | `pdfCodingModel.ts` | ~~removeAllCodesFromMarker usa removeMarker direto — 1 notify~~ |

---

## 2. Image engine

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~I1~~ | ~~FEITO~~ | `regionHighlight.ts` | ~~origStrokeWidth/origShadow agora em WeakMap per-shape~~ |
| ~~I2~~ | ~~FEITO~~ | `regionDrawing.ts` | ~~setMode skip labels via _qlabel tag~~ |
| ~~I3~~ | ~~FEITO~~ | `imageView.ts` | ~~refreshAll() chamado via onViewChanged apos zoom/pan~~ |
| ~~I4~~ | ~~FEITO~~ | `imageToolbar.ts:128`, `zoomPanControls.ts:97-98` | ~~window.addEventListener("keydown") global. Duas views: teclas ativam em ambas~~ |
| ~~I5~~ | ~~FEITO~~ | `zoomPanControls.ts` | ~~mouseup condition simplificada — e.button === 0 || e.button === 1~~ |

---

## ~~3. Multi-pane / state isolation~~ — FEITO (2026-03-20)

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~M1~~ | ~~FEITO~~ | `fileInterceptor.ts:117` | ~~leaf.detach() ao abrir arquivo duplicado. Quebra multi-pane nativo~~ |
| ~~M2~~ | ~~FEITO~~ | `baseSidebarAdapter.ts:76-78` | ~~setHoverState ignora hoveredIds. Multi-marker hover quebra em todos engines exceto markdown~~ |
| ~~M3~~ | ~~FEITO~~ | P2/I4 acima | ~~PDF hover global + Image keyboard global — mesma raiz~~ |

Implementado via PdfViewState (WeakMap per-view), keyboard scoped ao contentEl, hoveredMarkerIds em todos os models.

---

## 4. Markdown CM6

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~C1~~ | ~~FEITO~~ | `handleOverlayRenderer.ts`, `styles.css` | ~~z-index normalizado: handles 1000, popover 2000~~ |
| ~~C2~~ | ~~FEITO~~ | `marginPanelExtension.ts` | ~~scrollDOM position salvo/restaurado em constructor/destroy~~ |
| ~~C3~~ | ~~FEITO~~ | `markerPositionUtils.ts` | ~~ch clampado ao tamanho da linha via Math.min~~ |
| ~~C4~~ | ~~FEITO~~ | `codeMarkerModel.ts` | ~~deleteCode: batch save — mutacao in-place + 1 save no final~~ |
| ~~C5~~ | ~~FEITO~~ | `codeMarkerModel.ts` | ~~isPositionBefore strict < (nao ambiguo pra posicoes iguais)~~ |
| C6 | Won't-fix | `marginPanelExtension.ts` 548 LOC | Layout algorithm ja extraido em marginPanelLayout.ts. Refactoring restante sem bug associado |

**Escala z-index implementada (C1):**

| Camada | z-index | Elemento |
|--------|---------|----------|
| Content | auto | .cm-content, .cm-layer |
| Margin panel | 1 | .codemarker-margin-panel |
| Resize handle (futuro) | 100 | Borda direita |
| Drag handles overlay | 1000 | .codemarker-handle-overlay |
| Popover | 2000 | .codemarker-popover |

---

## 5. CSV engine

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~V1~~ | ~~FEITO~~ | `csvCodingCellRenderer.ts`, `csvCodingMenu.ts` | ~~node.sourceRowIndex em vez de node.rowIndex — estavel apos sort~~ |
| ~~V2~~ | ~~FEITO~~ | `csvHeaderInjection.ts` | ~~btn.dataset.wrapped setado na criacao e no toggle~~ |

---

## 6. Analytics

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~A1~~ | ~~FEITO~~ | `dendrogramMode.ts` | ~~dead code Files mode removido + dendrogramMode removido do context~~ |
| ~~A2~~ | ~~FEITO~~ | Chart.js instances | ~~ctx.activeChartInstance destroy antes de recriar + onClose cleanup~~ |
| ~~A3~~ | ~~FEITO~~ | `textExtractor.ts` | ~~parseCsv substituido por PapaParse (multiline, quotes, CRLF)~~ |
| ~~A4~~ | ~~FEITO~~ | `textExtractor.ts` | ~~skip .parquet em extractBatch — sem leitura binaria~~ |
| ~~A5~~ | ~~FEITO~~ | `chiSquareMode.ts` | ~~sort por Cramers V antes de slice~~ |
| ~~A6~~ | ~~FEITO~~ | `baseCodeExplorerView.ts` | ~~footer conta segmentos do codeIndex filtrado~~ |

**A3+A4 solucao**: Usar PapaParse (ja e dep) no textExtractor e detectar extensao .parquet pra hyparquet.

---

## 7. Sidebar e navegacao

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~S1~~ | ~~FEITO~~ | `textRetrievalMode.ts` | ~~navigateToSegment agora dispara eventos por engine: csv, image, pdf (#page), audio, video~~ |
| ~~S2~~ | ~~FEITO~~ | `decisionTreeMode.ts` | ~~"View in TR" agora filtra por markerIds do no com erro via trMarkerFilter~~ |
| ~~S3~~ | ~~FEITO~~ | `textRetrievalMode.ts` | ~~Navegacao markdown: getLeavesOfType + find por file path~~ |
| ~~S6~~ | ~~FEITO~~ | `textRetrievalMode.ts` | ~~getActiveViewOfType(MarkdownView) + file path guard em vez de find~~ |
| ~~S4~~ | ~~N/A~~ | `unifiedModelAdapter.ts` | ~~Nao e bug: DataManager.markDirty() debounce 500ms colapsa 6 saves em 1 escrita. Documentado~~ |
| ~~S5~~ | ~~FEITO~~ | `baseCodeExplorerView.ts`, `detailListRenderer.ts` | ~~searchTimeout cancelado no onClose + cleanup retornado por renderListShell~~ |

---

## 8. ~~Core / Registry~~ — FEITO (2026-03-20)

| # | Status | Problema |
|---|--------|----------|
| ~~R1~~ | FEITO | fromJSON: corrigido — `def.id = id` garante consistencia entre key JSON e campo interno |

---

## 9. Permanente (ineliminavel)

| Item | Razao |
|------|-------|
| 6 `as any` (3 PDF internal + 3 deepMerge) | APIs externas sem tipos |
| 3 `@ts-ignore` (wavesurfer) | Module resolution |
| !important 66 instancias | Maioria AG Grid defensivos |
| Inline styles ~15 estaticos | Migrar quando tocar nos arquivos |

---

## 10. Propostas tecnicas

### ~~Incremental refresh/cache por engine~~ — FEITO (2026-03-20)
Implementado em duas camadas: `ConsolidationCache` (analytics pipeline, dirty flags por engine + registry) e cache com indices no `UnifiedModelAdapter` (sidebar views, dirty flag global + Map por fileId/id). Views Explorer/Detail com debounce rAF via `scheduleRefresh`.

### ~~Board: snapshot vs live-linked~~ — FEITO (2026-03-20)
Implementado como "Refresh on open" via `boardReconciler.ts`. Reconcilia ao abrir: atualiza cores/nomes/contagens, marca orfaos, remove arrows invalidas. Notice informativo.

---

## 10b. Magnitude / Relations

| Item | Severidade | Detalhe |
|------|-----------|---------|
| CSS chip styles duplicados | Baixa | Chips de magnitude e relações têm class names distintos no popover vs. no detail view — CSS consolidado mas dois seletores separados ainda existem |
| Magnitude popover sem empty state | Won't-fix | Seção de magnitude some inteiramente quando nenhum código aplicado tem magnitude configurada — decisão UX intencional, não exibe mensagem |
| Continuous type — step decimal | Baixa | Range generator do tipo continuous não refina exibição de step decimal (ex: 0.5 exibido como "0.5" sem arredondamento configurável) |
| Relations Network — sem edge bundling | Baixa | Modo grafo básico: sem edge bundling, sem detecção de comunidades, sem layout por cluster — expansão futura quando a base de usuários justificar |
