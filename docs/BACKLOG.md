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
| C4 | Media | `codeMarkerModel.ts:540-563` | deleteCode: N saves/rebuilds em vez de batch |
| C5 | Baixa | `codeMarkerModel.ts:481-491` | isPositionBefore/After: posicoes iguais satisfazem ambos. Markers de largura zero |
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
| V1 | Alta | `csvCodingCellRenderer.ts:14,136`, `csvCodingMenu.ts:106` | node.rowIndex e display index. Apos sort, codigos vao pra linha errada |
| V2 | Baixa | `csvHeaderInjection.ts:69,106` | btn.dataset.wrapped nunca setado. Opacity sempre reseta |

---

## 6. Analytics

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| A1 | Media | `dendrogramMode.ts:42` | "Files" mode dead code. Radio button sem efeito — render sempre usa calculateCooccurrence |
| A2 | Media | Chart.js instances | frequencyMode, wordCloudMode, acmMode, mdsMode, temporalMode — new Chart() sem destroy(). Leak em sessoes longas |
| A3 | Media | `textExtractor.ts:177` | parseCsv() simplificado nao suporta multiline quoted fields. Desloca row em Text Retrieval/Word Cloud/Text Stats |
| A4 | Media | `textExtractor.ts:35,80` | Markers Parquet relidos via vault.read() como texto. Lixo binario no Analytics |
| A5 | Baixa | `chiSquareMode.ts:161` | Mini view: top-5 por p-value, reordena por Cramer's V dentro. Deveria sort-then-slice |
| A6 | Baixa | `baseCodeExplorerView.ts:235-237,314` | Footer: contagem de segmentos nao filtra com search ativa |

**A3+A4 solucao**: Usar PapaParse (ja e dep) no textExtractor e detectar extensao .parquet pra hyparquet.

---

## 7. Sidebar e navegacao

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| S1 | Media | `textRetrievalMode.ts:360` | navigateToSegment incompleto: CSV/Image/PDF caem em openLinkText generico |
| S2 | Media | `decisionTreeMode.ts:94` | "View in Text Retrieval" nao foca subconjunto — cai no TR geral |
| S3 | Media | `textRetrievalMode.ts:378,382` | Navegacao markdown: getLeaf() nao garante a leaf correta com multiplas tabs |
| S4 | Media | `unifiedModelAdapter.ts:75-77` | deleteCode delega pra 6 sub-models, cada um chama saveMarkers(). 6 saves redundantes |
| S5 | Baixa | `baseCodeExplorerView.ts:29`, `detailListRenderer.ts:40-48` | searchTimeout nao cancelado em onClose() |

---

## 8. Core / Registry

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| R1 | Baixa | `codeDefinitionRegistry.ts:170-175` | fromJSON: mismatch key vs def.id torna definicao inacessivel |

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

### Incremental refresh/cache por engine
Cache por engine invalidado por mutation. `dataConsolidator` monta array final dos caches. Retorno sem mudar modelo de dados.

### Board: snapshot vs live-linked
Recomendacao: "Refresh on open" — reconcilia ao abrir (remove orfaos, atualiza contagens, marca stale). Sem live subscriptions.
