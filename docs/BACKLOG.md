# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**. Items resolvidos foram movidos para `HISTORY.md § Consolidacao tecnica`.

---

## Decision Tree "View in Text Retrieval" nao foca subconjunto

**Severidade**: Media

`decisionTreeMode.ts:94` — botao "View in Text Retrieval" na error analysis so troca `ctx.viewMode` e mostra Notice. Nao passa `markerIds` nem `trSearch` pra focar os markers misclassified do no. Usuario cai no Text Retrieval geral.

**Acao**: Passar IDs dos markers do errorLeaf via `ctx.trSearch` ou filtro dedicado antes de trocar de modo.

---

## Text Retrieval navigateToSegment incompleto

**Severidade**: Media

`textRetrievalMode.ts:360` — `navigateToSegment()` so usa navegacao especifica pra audio e video. Para CSV (segment/row), Image e PDF, cai em `openLinkText(file, "", "tab")` generico, descartando metadados ja disponiveis no segmento (row, column, markerId, page).

**Resultado**: clique no Text Retrieval abre o arquivo mas nao leva ao alvo — CSV nao vai pra linha, Image nao destaca regiao, PDF nao abre na pagina.

**Acao**: Dispatch de eventos especificos por engine com payload correto:
- CSV: `qualia-csv:navigate` com `{file, row}`
- Image: `qualia-image:navigate` com `{file, markerId}`
- PDF: depende de implementar `qualia-pdf:navigate` (item abaixo)

---

## PDF pageObserver timer leak no teardown

**Severidade**: Media

`pageObserver.ts:68` — handler de `pagerendered` agenda `setTimeout(100)` que `stop()` nao cancela. Se a view fechar logo apos zoom/rerender, o callback executa apos teardown e pode recriar highlights numa observer ja parada.

**Acao**: Guardar timer IDs e cancelar em `stop()`.

---

## PDF childListeners leak em cleanupOrphanedObservers

**Severidade**: Media

`pdf/index.ts:50,234` — `cleanupOrphanedObservers()` remove observer, drawInteraction e toolbar, mas nao limpa entradas de `childListeners`. Listeners de mousemove/mouseup continuam referenciados no Map pra viewers orfaos ate unload completo.

**Acao**: Limpar `childListeners` no cleanup de observers orfaos.

---

## PDF hover/popover state global entre views

**Severidade**: Media

`highlightRenderer.ts:105` e `drawLayer.ts:24` — estado de hover/popover (timers, currentHoverMarkerId, currentHoverShapeId) e global ao modulo. Com duas PDF views abertas, hover numa pane cancela/fecha popover da outra.

**Acao**: Isolar state por observer/view. Relacionado ao bug do fileInterceptor (multi-pane).

---

## PDF navigate nao foca marker especifico

Navegacao de PDF da sidebar abre a pagina via `#page=N` generico, mas descarta o `markerId`. Nao ha scroll nem flash do highlight/shape especifico. O evento `qualia-pdf:navigate` documentado no ARCHITECTURE.md nao existe no codigo.

**Acao**: Implementar `qualia-pdf:navigate` com scroll to page + flash do marker. Requer acesso ao PDF.js viewer interno pra posicionar no marker.

---

## Bug: fileInterceptor destroi leaf ao abrir arquivo duplicado

**Severidade**: Alto (quebra comportamento nativo do Obsidian)

O interceptor faz `leaf.detach()` quando o arquivo ja esta aberto em outra leaf do target view type. Isso quebra o workflow nativo de abrir o mesmo arquivo em paineis lado a lado.

Helpers manuais (`openImageCodingView`, `openAudioCodingView`, etc.) tambem reutilizam `leaves[0]` mesmo para arquivos diferentes — mesma face do problema.

**Referencia**: mirror-notes resolve com **viewId por pane via WeakMap** (`domInjector.ts:23-36`):
1. Cada pane recebe `viewId` estavel via `WeakMap<HTMLElement, string>`
2. Estado isolado por `viewId + filePath`
3. Plugin nunca destroi leaves — lifecycle e responsabilidade do Obsidian

**Acao**: Remover `leaf.detach()` e adaptar engines para multiplas views do mesmo arquivo com state isolado por viewId.

---

## marginPanelExtension.ts — 548 LOC

Layout puro ja extraido em `marginPanelLayout.ts` (129 LOC). Candidatos a split:
- Position math (~50 LOC)
- Hover state (~90 LOC)
- DOM render (~90 LOC)

**Quando**: Sessao conjunta com mirror-notes ou quando tocar no margin panel.

---

## z-index stacking no scrollDOM

5 colisoes de z-index identificadas. A mais importante: `handleOverlayRenderer` usa z:10000+ no scrollDOM, popover usa z:9999 — handles ficam visualmente acima do popover.

**Escala proposta:**

| Camada | z-index | Elemento |
|--------|---------|----------|
| Content | auto | .cm-content, .cm-layer |
| Margin panel | 1 | .codemarker-margin-panel |
| Resize handle (futuro) | 100 | Borda direita do margin panel |
| Drag handles overlay | 1000 | .codemarker-handle-overlay |
| Popover | 2000 | .codemarker-popover |

**Quando**: Atacar junto com Per-Code Decorations (ROADMAP #16) e/ou Resize Handle (ROADMAP #17).

**Pre-requisitos**: Validar `scrollDOM.style.position = 'relative'` com themes diferentes e split panes. Decidir se `destroy()` deve reverter.

---

## CSV rowIndex vs sourceRowIndex — codigos vao pra linha errada apos sort

**Severidade**: Alta

`csvCodingCellRenderer.ts:14,136` e `csvCodingMenu.ts:106` — usam `node.rowIndex` (display index) que muda com sort/filter. Model armazena row como indice original. Apos sort, tag chips aparecem na linha errada e codigos novos sao salvos com row index incorreto.

**Acao**: Usar `node.sourceRowIndex` ou identificador baseado no dado.

---

## Dendrogram "Files" mode dead code

**Severidade**: Media

`dendrogramMode.ts:42` — options panel oferece "Codes"/"Files" radio, mas render/mini/export sempre usam `calculateCooccurrence()` sem checar `ctx.dendrogramMode`. Selecionar "Files" nao tem efeito.

**Acao**: Implementar files mode ou remover radio button.

---

## Chart.js instances leak — nunca destroyed

**Severidade**: Media

`frequencyMode.ts:179`, `wordCloudMode.ts:135`, `acmMode.ts:158`, `mdsMode.ts:136`, `temporalMode.ts:46` — `new Chart()` criado a cada render sem `.destroy()`. `chartContainer.empty()` remove DOM mas Chart.js mantem resize observers e animation frames. Acumula em sessoes longas.

**Acao**: Guardar referencia ao Chart e chamar `.destroy()` antes de recriar.

---

## markerPositionUtils ch sem clamping

**Severidade**: Media

`markerPositionUtils.ts:94-96` — `line.from + ch` sem clamp ao tamanho da linha. Se linha encolheu apos criacao do marker, offset sangra pra proxima linha. `marginPanelExtension.ts:290-295` ja tem clamp — inconsistencia.

**Acao**: Aplicar `Math.min(ch, line.length)` como no marginPanel.

---

## scrollDOM position conflict entre handle overlay e margin panel

**Severidade**: Media

`handleOverlayRenderer.ts:27,38,165` e `marginPanelExtension.ts:40` — ambos setam `scrollDOM.style.position = 'relative'`. So handleOverlay `destroy()` restaura valor original. Se destruir antes do marginPanel, reseta pra '' e quebra panel.

**Acao**: Atacar junto com z-index stacking (item acima).

---

## PDF setMemo nao chama notify — sidebar nao atualiza

**Severidade**: Media

`pdfCodingMenu.ts:75-83` (text) e `:151-155` (shapes) — `setMemo` persiste via `model.save()` mas nao dispara change listeners. Memo atualizado nao aparece na sidebar ate outra operacao.

**Acao**: Chamar `notify()` apos save.

---

## Image keyboard handlers globais — conflito multi-view

**Severidade**: Media

`imageToolbar.ts:128` e `zoomPanControls.ts:97-98` — `window.addEventListener("keydown")` global. Com duas image views em split, teclas ativam em ambas.

**Acao**: Filtrar por view ativa ou usar event delegation no container.

---

## Image region labels desalinham apos zoom/pan

**Severidade**: Media

`regionLabels.ts` — nenhum handler de zoom/pan chama `refreshAll()`. Labels posicionados via `getBoundingRect()` na criacao. Apos zoom/pan, ficam desalinhados das shapes.

**Acao**: Chamar `refreshAll()` no after:render do canvas.

---

## baseSidebarAdapter deleteCode itera array enquanto muta

**Severidade**: Media

`baseSidebarAdapter.ts:128-138` — segundo loop chama `removeMarker()` pra markers vazios enquanto itera `getAllMarkers()`. Se retorna referencia viva, splice pula elementos.

**Acao**: Coletar IDs primeiro, depois remover.

---

## searchTimeout leaks em explorer/detail views

**Severidade**: Baixa

`baseCodeExplorerView.ts:29` e `detailListRenderer.ts:40-48` — timeouts nao cancelados em `onClose()`. Callback dispara em view destruida.

---

## unifiedModelAdapter deleteCode — 6 saves redundantes

**Severidade**: Baixa

`unifiedModelAdapter.ts:75-77` — delega pra 6 sub-models, cada um chama `saveMarkers()`.

---

## PDF highlightGeometry pageY no-op

**Severidade**: Baixa

`highlightGeometry.ts:213-214` — `+pageY - pageY` e no-op. Para PDFs com viewBox[1] != 0 (paginas cropadas), posicao vertical fica errada.

---

## PDF drawInteraction keyboard nao filtra contenteditable

**Severidade**: Baixa

`drawInteraction.ts:260-266` — so filtra INPUT/TEXTAREA, nao contenteditable.

---

## 6 `as any` restantes — fronteiras com APIs externas

| Local | Instancias | Eliminavel? |
|-------|-----------|-------------|
| PDF Obsidian internal viewer API (`pdf/index.ts`) | 3 | Nao — Obsidian nao exporta tipos do PDF viewer |
| dataManager deepMerge (`core/dataManager.ts`) | 3 | Nao — generics com `Partial<T>` e chaves dinamicas |

Permanentes. Monitorar mas nao tentar eliminar.

---

## !important overuse (66 instancias)

Maioria em sizing de handles (linhas 858-917) e cell styling CSV (1262-1298). Muitos defensivos contra AG Grid. Nao urgente — monitorar.

---

## Inline styles estaticos (~15 restantes)

Concentrados em `marginPanelExtension.ts` (~50) e `handleOverlayRenderer.ts` (~20). Muitos sao calculo dinamico de posicao (necessarios). Os ~15 estaticos (fontSize, padding) poderiam migrar para CSS classes.

**Quando**: Ao tocar nesses arquivos.

---

## Test gaps restantes

| Modulo | LOC | Risco | Motivo |
|--------|-----|-------|--------|
| `markerViewPlugin.ts` | 326 | Alto | CM6 ViewPlugin depende de EditorView real — coberto indiretamente via e2e |
| 15/19 analytics modes | ~3500 | Medio | Chart.js mock dificil; 4 modes testados |
| 6 menus/popovers | ~600 | Medio | DOM interativo dificil em jsdom — coberto via e2e |

---

## Feature backlog (propostas tecnicas)

### Incremental refresh/cache por engine

Cache incremental por engine — cada engine mantem versao consolidada dos seus markers, invalidada por mutation. `dataConsolidator` monta array final a partir dos caches sem reconsolidar do zero.

**Quando**: Antes de migracao de persistencia. Retorno sem mudar modelo de dados.

### Board: snapshot vs live-linked

Research Board captura dados como snapshot puro — nunca atualiza se markers/codigos mudam.

**Recomendacao**: "Refresh on open" — reconcilia ao abrir (remove nos orfaos, atualiza contagens, marca charts stale). Sem live subscriptions.

### Unificacao Audio/Video View — avaliada e descartada

**Decisao (2026-03-18)**: Manter separado. Composicao via `MediaViewCore` (357 LOC) ja eliminou duplicacao de logica. `AudioView` (53 LOC) e `VideoView` (54 LOC) sao thin wrappers. Custo de manter: baixo.
