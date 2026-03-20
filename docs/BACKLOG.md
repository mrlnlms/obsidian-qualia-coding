# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema. Items resolvidos foram movidos para `HISTORY.md § Consolidacao tecnica`.

---

## 1. PDF lifecycle e state

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| P1 | Media | `pageObserver.ts:68` | setTimeout 100ms nao cancelado em stop(). Callback recria highlights em observer parada |
| P2 | Media | `highlightRenderer.ts:105`, `drawLayer.ts:24` | Hover/popover state global ao modulo. Duas PDF views: hover numa pane cancela popover da outra |
| P3 | Media | `drawLayer.ts:25-26` | shapeHoverTimer/currentHoverShapeId globais. stop() nao limpa. Timer dispara em elementos destruidos |
| P4 | Media | `pdf/index.ts:50,234` | cleanupOrphanedObservers nao limpa childListeners Map. Listeners de mousemove/mouseup vazam |
| P5 | Media | `pdfCodingMenu.ts:75-83,151-155` | setMemo persiste via save() mas nao chama notify(). Sidebar nao atualiza |
| P6 | Media | `pdfCodingModel.ts:385-389` | removeMarker() direto nao persiste nem notifica listeners |
| P7 | Baixa | `highlightGeometry.ts:213-214` | +pageY - pageY e no-op. PDFs com viewBox[1] != 0 (cropadas) ficam com posicao vertical errada |
| P8 | Baixa | `drawInteraction.ts:260-266` | Keyboard handler so filtra INPUT/TEXTAREA, nao contenteditable |

---

## 2. Image engine

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| I1 | Media | `regionHighlight.ts:40-41,59-65` | origStrokeWidth/origShadow compartilhados. Hover concorrente corrompe valores permanentemente |
| I2 | Media | `regionDrawing.ts:307-310` | setMode("select") seta selectable=true em TODOS objetos, incluindo labels |
| I3 | Media | `regionLabels.ts` | Nenhum handler de zoom/pan chama refreshAll(). Labels desalinham das shapes |
| I4 | Media | `imageToolbar.ts:128`, `zoomPanControls.ts:97-98` | window.addEventListener("keydown") global. Duas views: teclas ativam em ambas |
| I5 | Baixa | `zoomPanControls.ts:82-88` | Condicao de pan end simplifica incorretamente. Space+drag para ao soltar mouse |

---

## 3. Multi-pane / state isolation

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| M1 | Alta | `fileInterceptor.ts:117` | leaf.detach() ao abrir arquivo duplicado. Quebra multi-pane nativo |
| M2 | Media | `baseSidebarAdapter.ts:76-78` | setHoverState ignora hoveredIds. Multi-marker hover quebra em todos engines exceto markdown |
| M3 | Media | P2/I4 acima | PDF hover global + Image keyboard global — mesma raiz |

**Solucao unificada**: viewId por pane via WeakMap (pattern mirror-notes). Atacar M1 primeiro, cascata resolve M2/M3.

---

## 4. Markdown CM6

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| C1 | Media | z-index stacking | handles z:10000 vs popover z:9999. Escala proposta no item abaixo |
| C2 | Media | `handleOverlayRenderer.ts:27,38` + `marginPanelExtension.ts:40` | Ambos setam scrollDOM position=relative. destroy() de um quebra o outro |
| C3 | Media | `markerPositionUtils.ts:94-96` | ch sem clamp ao tamanho da linha. Offset sangra pra proxima linha |
| ~~C4~~ | ~~FEITO~~ | `codeMarkerModel.ts` | ~~deleteCode: batch save — mutacao in-place + 1 save no final~~ |
| ~~C5~~ | ~~FEITO~~ | `codeMarkerModel.ts` | ~~isPositionBefore strict < (nao ambiguo pra posicoes iguais)~~ |
| C6 | — | `marginPanelExtension.ts` 548 LOC | Candidato a split (position math, hover, DOM render) |

**Escala z-index proposta (C1):**

| Camada | z-index | Elemento |
|--------|---------|----------|
| Content | auto | .cm-content, .cm-layer |
| Margin panel | 1 | .codemarker-margin-panel |
| Resize handle (futuro) | 100 | Borda direita |
| Drag handles overlay | 1000 | .codemarker-handle-overlay |
| Popover | 2000 | .codemarker-popover |

Atacar C1+C2 junto com Per-Code Decorations (ROADMAP #16) e/ou Resize Handle (#17).

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
| S1 | Media | `textRetrievalMode.ts:360` | navigateToSegment incompleto: CSV/Image/PDF caem em openLinkText generico |
| S2 | Media | `decisionTreeMode.ts:94` | "View in Text Retrieval" nao foca subconjunto — cai no TR geral |
| S3 | Media | `textRetrievalMode.ts:378,382` | Navegacao markdown: getLeaf() nao garante a leaf correta com multiplas tabs |
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
