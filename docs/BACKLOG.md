# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**. Items resolvidos foram movidos para `HISTORY.md § Consolidacao tecnica`.

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
