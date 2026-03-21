# Multi-Pane State Isolation (M1)

> Remover bloqueio de multi-pane (`leaf.detach()`) e isolar state global por view, permitindo abrir o mesmo tipo de conteúdo em múltiplas panes sem conflitos.

## Problema

O `fileInterceptor.ts:110-119` chama `leaf.detach()` quando o mesmo arquivo já está aberto em outra leaf do tipo target. Isso impede multi-pane nativo do Obsidian.

Além disso, 4 módulos usam state global de módulo (timers, IDs, listeners) que conflitaria se duas panes do mesmo tipo coexistissem:

| Arquivo | Estado global | Risco |
|---------|-------------|-------|
| `pdf/highlightRenderer.ts` | `hoverOpenTimer`, `hoverCloseTimer`, `currentHoverMarkerId` | Crítico |
| `pdf/drawLayer.ts` | `shapeHoverTimer`, `currentHoverShapeId` | Crítico |
| `pdf/highlightRenderer.ts:299,347` + `drawLayer.ts:105` | `document.querySelector('.codemarker-popover')` global | Crítico |
| `image/imageToolbar.ts` | `window.addEventListener("keydown")` | Alto |
| `image/canvas/zoomPanControls.ts` | `window.addEventListener("keydown/keyup")` | Médio |
| `core/baseSidebarAdapter.ts` + models (PDF, Image, CSV, Media) | `hoverMarkerId` single-value | Alto |

Audio/video/CSV/markdown já têm state por instância — zero trabalho estrutural.

## Abordagem: State Object por View via WeakMap

Criar um state object por engine (struct flat) que agrupa todo o estado per-view. Armazenado em `WeakMap<HTMLElement, State>` — GC automático quando pane fecha. Sem IDs string, sem registry central.

### Alternativas descartadas

- **viewId string + Map central:** Indireção desnecessária. `WeakMap<HTMLElement, State>` é mais direto e não precisa de cleanup manual.
- **Map por módulo (Mirror Notes literal):** Polui assinaturas com `viewId` em toda função. Maps soltos em vários arquivos.
- **State no próprio View:** Acopla módulos ao FileView do Obsidian. Dificulta testes unitários.

## Design

### 1. PDF State — `src/pdf/pdfViewState.ts`

```typescript
export interface PdfViewState {
  // highlightRenderer globals
  hoverOpenTimer: ReturnType<typeof setTimeout> | null;
  hoverCloseTimer: ReturnType<typeof setTimeout> | null;
  currentHoverMarkerId: string | null;
  // drawLayer globals
  shapeHoverTimer: ReturnType<typeof setTimeout> | null;
  currentHoverShapeId: string | null;
  // scoped container for popover queries
  containerEl: HTMLElement;
}

const pdfStates = new WeakMap<HTMLElement, PdfViewState>();

export function getPdfViewState(containerEl: HTMLElement): PdfViewState {
  let state = pdfStates.get(containerEl);
  if (!state) {
    state = {
      hoverOpenTimer: null,
      hoverCloseTimer: null,
      currentHoverMarkerId: null,
      shapeHoverTimer: null,
      currentHoverShapeId: null,
      containerEl,
    };
    pdfStates.set(containerEl, state);
  }
  return state;
}

export function destroyPdfViewState(containerEl: HTMLElement): void {
  const state = pdfStates.get(containerEl);
  if (!state) return;
  if (state.hoverOpenTimer) clearTimeout(state.hoverOpenTimer);
  if (state.hoverCloseTimer) clearTimeout(state.hoverCloseTimer);
  if (state.shapeHoverTimer) clearTimeout(state.shapeHoverTimer);
  pdfStates.delete(containerEl);
}
```

**WeakMap keyed por `containerEl`** — a pane do Obsidian. GC automático quando pane fecha.

**Impacto nos módulos:**

- `highlightRenderer.ts` — `cancelHoverPopover(state)`, `startHoverCloseTimer(state)`, `cancelHoverCloseTimer(state)`, `attachLayerHoverTracking(..., state)` recebem `PdfViewState` em vez de acessar `let` do módulo. Os 3 `let` globais são removidos.
- `drawLayer.ts` — `renderDrawLayerForPage(..., state)` recebe `PdfViewState`. Os 2 `let` globais são removidos. As chamadas importadas de `highlightRenderer` (`cancelHoverPopover`, `startHoverCloseTimer`, `cancelHoverCloseTimer`) passam o mesmo `state` recebido.
- **Popover queries** — `document.querySelector('.codemarker-popover')` (3 ocorrências) troca para `state.containerEl.querySelector('.codemarker-popover')`. Cada pane só vê seu próprio popover.
- O caller (PDF view/index) faz `getPdfViewState(containerEl)` no mount e `destroyPdfViewState(containerEl)` no close.

### 2. Image State — `src/image/imageViewState.ts`

```typescript
export interface ImageViewState {
  keydownHandler: ((e: KeyboardEvent) => void) | null;
  keyupHandler: ((e: KeyboardEvent) => void) | null;
  containerEl: HTMLElement;
}

const imageStates = new WeakMap<HTMLElement, ImageViewState>();

export function getImageViewState(containerEl: HTMLElement): ImageViewState {
  let state = imageStates.get(containerEl);
  if (!state) {
    state = { keydownHandler: null, keyupHandler: null, containerEl };
    imageStates.set(containerEl, state);
  }
  return state;
}

export function destroyImageViewState(containerEl: HTMLElement): void {
  const state = imageStates.get(containerEl);
  if (!state) return;
  if (state.keydownHandler) {
    state.containerEl.removeEventListener('keydown', state.keydownHandler);
  }
  if (state.keyupHandler) {
    state.containerEl.removeEventListener('keyup', state.keyupHandler);
  }
  imageStates.delete(containerEl);
}
```

**Impacto nos módulos:**

- `imageToolbar.ts` — troca `window.addEventListener("keydown", onKeyDown)` por `containerEl.addEventListener("keydown", onKeyDown)`. Guarda ref no state.
- `zoomPanControls.ts` — apenas keydown/keyup migram para `containerEl`. Mouse move/up continuam em `window` (precisa capturar drag fora do container). O `destroy()` existente do `ZoomPanCleanup` já limpa os mouse listeners — sem mudança nessa parte.

**Focus management (obrigatório):** `containerEl` precisa receber eventos de teclado. Adicionar `containerEl.tabIndex = -1` (focável via JS mas não via Tab) no setup de cada engine. Quando a pane é ativada (`active-leaf-change`), chamar `containerEl.focus()` para garantir que atalhos funcionem na pane correta.

### 3. Sidebar Hover — alinhar com pattern do Markdown

O markdown engine já suporta multi-marker hover:

```typescript
// codeMarkerModel.ts — pattern existente
setHoverState(markerId: string | null, codeName: string | null, hoveredIds?: string[]): void;
getHoverMarkerIds(): string[];
```

Os outros models (PDF, Image, CSV, Media) guardam `hoverMarkerId: string | null` (single). A mudança é alinhar todos ao pattern do markdown:

- Adicionar `_hoveredMarkerIds: string[]` nos 4 models restantes
- `setHoverState(markerId, codeName, hoveredIds?)` → guarda o array (ou `[markerId]` se `hoveredIds` não fornecido)
- `getHoverMarkerIds()` → retorna o array
- `getHoverMarkerId()` → continua retornando o primeiro (backward-compatible)

A interface `CodingModel` em `core/types.ts:55` já aceita `hoveredIds?: string[]`. Os models só não implementam.

`baseSidebarAdapter.getHoverMarkerIds()` hoje faz `id ? [id] : []`. Após a mudança, delegará direto ao model.

### 4. fileInterceptor — remover bloqueio

Remover o bloco linhas 110-119 de `fileInterceptor.ts`:

```typescript
// REMOVER inteiro:
const existingLeaves = plugin.app.workspace.getLeavesOfType(rule.targetViewType);
const existingLeaf = existingLeaves.find(l => { ... });
if (existingLeaf) {
  leaf.detach();
  plugin.app.workspace.setActiveLeaf(existingLeaf);
  return;
}
```

O `leaf.setViewState()` na linha 122 continua — faz a interceptação de tipo (abrir .pdf no PdfView).

## Sequência de Implementação

A ordem garante que state está isolado ANTES de remover o gate:

1. `src/pdf/pdfViewState.ts` — WeakMap + struct + get/destroy
2. `src/pdf/highlightRenderer.ts` — trocar 3 `let` globals → receber `PdfViewState`. Escopar 2× `document.querySelector` → `state.containerEl.querySelector`
3. `src/pdf/drawLayer.ts` — trocar 2 `let` globals → receber `PdfViewState`. Escopar 1× `document.querySelector`. Passar state nas chamadas importadas do `highlightRenderer`
4. PDF view/index — `getPdfViewState(containerEl)` no mount, `destroyPdfViewState(containerEl)` no close
5. `src/image/imageViewState.ts` — WeakMap + struct + get/destroy
6. `src/image/imageToolbar.ts` — `window` → `containerEl` para keydown
7. `src/image/canvas/zoomPanControls.ts` — `window` → `containerEl` para keydown/keyup apenas
8. Image view/index — `getImageViewState(containerEl)` no mount, `destroyImageViewState` no close. `containerEl.tabIndex = -1` + focus no `active-leaf-change`
9. Models (PDF, Image, CSV, Media) — adicionar `_hoveredMarkerIds: string[]`, alinhar `setHoverState`/`getHoverMarkerIds` com pattern markdown
10. `src/core/fileInterceptor.ts` — remover bloco `leaf.detach()` (linhas 110-119)
11. Testes — unit tests para state objects, sidebar hover, e fileInterceptor sem detach

## O que NÃO muda

- Audio/video/CSV/markdown — já têm state por instância
- `registerFileIntercept` / `registerFileRename` — API continua igual
- `zoomPanControls.ts` mouse listeners — já limpos pelo `destroy()` existente
- `regionHighlight.ts` — já safe (closure per-instance, confirmado)

## Performance

- Lookup: `WeakMap.get(containerEl)` por evento — O(1)
- Memória: objetos flat com 5-6 campos, GC automático via WeakMap
- Zero overhead vs estado global atual

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Keyboard silently breaks após mover de `window` → `containerEl` | `tabIndex = -1` + `focus()` no `active-leaf-change`. Testar manualmente com duas panes |
| Popover query pega elemento da pane errada | Escopar ao `containerEl` (3 ocorrências explícitas no spec) |
| Migração parcial expõe bugs | Gate (`leaf.detach()`) só sai no passo 10, após toda isolação |

## Backlog items resolvidos

- **M1** — leaf.detach() removido, multi-pane funciona
- **M2** — sidebar hover multi-marker via array (alinhado com markdown)
- **M3** — P2/I4 resolvidos (mesma raiz)
- **P2** — PDF hover state isolado por view
- **P3** — PDF shape hover timers isolados por view
- **I1** — regionHighlight já é safe (closure per-instance), confirmado
- **I4** — Image keyboard scoped ao containerEl
