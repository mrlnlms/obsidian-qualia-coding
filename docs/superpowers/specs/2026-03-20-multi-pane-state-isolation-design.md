# Multi-Pane State Isolation (M1)

> Remover bloqueio de multi-pane (`leaf.detach()`) e isolar state global por view, permitindo abrir o mesmo tipo de conteúdo em múltiplas panes sem conflitos.

## Problema

O `fileInterceptor.ts:110-119` chama `leaf.detach()` quando o mesmo arquivo já está aberto em outra leaf do tipo target. Isso impede multi-pane nativo do Obsidian.

Além disso, 4 módulos usam state global de módulo (timers, IDs, listeners) que conflitaria se duas panes do mesmo tipo coexistissem:

| Arquivo | Estado global | Risco |
|---------|-------------|-------|
| `pdf/highlightRenderer.ts` | `hoverOpenTimer`, `hoverCloseTimer`, `currentHoverMarkerId` | Crítico |
| `pdf/drawLayer.ts` | `shapeHoverTimer`, `currentHoverShapeId` | Crítico |
| `image/imageToolbar.ts` | `window.addEventListener("keydown")` | Alto |
| `image/canvas/zoomPanControls.ts` | 4 listeners em `window` | Médio |
| `core/baseSidebarAdapter.ts` + models | `hoverMarkerId` single-value | Alto |

Audio/video/CSV/markdown já têm state por instância — zero trabalho.

## Abordagem: State Object por View

Criar um state object por engine (struct flat) que agrupa todo o estado per-view. Factory cria, destrutor limpa. Lookup via `getViewId(containerEl)` + registry central.

### Alternativas descartadas

- **Map por módulo (Mirror Notes literal):** Polui assinaturas com `viewId` em toda função. Maps soltos em vários arquivos, cleanup manual.
- **State no próprio View:** Acopla módulos ao FileView do Obsidian. Dificulta testes unitários. Views já são grandes.

## Design

### 1. Infraestrutura Core — `src/core/viewId.ts`

```typescript
const viewIds = new WeakMap<HTMLElement, string>();
let counter = 0;

export function getViewId(containerEl: HTMLElement): string {
  let id = viewIds.get(containerEl);
  if (!id) { id = `v${counter++}`; viewIds.set(containerEl, id); }
  return id;
}
```

- WeakMap = GC automático quando pane fecha (containerEl sai do DOM)
- Counter monotônico, nunca reseta (evita colisão)
- Reutilizável por qualquer engine

### 2. PDF State — `src/pdf/pdfViewState.ts`

```typescript
export interface PdfViewState {
  hoverOpenTimer: ReturnType<typeof setTimeout> | null;
  hoverCloseTimer: ReturnType<typeof setTimeout> | null;
  currentHoverMarkerId: string | null;
  shapeHoverTimer: ReturnType<typeof setTimeout> | null;
  currentHoverShapeId: string | null;
}

export function createPdfViewState(): PdfViewState {
  return {
    hoverOpenTimer: null,
    hoverCloseTimer: null,
    currentHoverMarkerId: null,
    shapeHoverTimer: null,
    currentHoverShapeId: null,
  };
}

export function destroyPdfViewState(state: PdfViewState): void {
  if (state.hoverOpenTimer) clearTimeout(state.hoverOpenTimer);
  if (state.hoverCloseTimer) clearTimeout(state.hoverCloseTimer);
  if (state.shapeHoverTimer) clearTimeout(state.shapeHoverTimer);
  state.currentHoverMarkerId = null;
  state.currentHoverShapeId = null;
}
```

**Impacto nos módulos:**
- `highlightRenderer.ts` — `cancelHoverPopover()`, `startHoverCloseTimer()`, `cancelHoverCloseTimer()`, `attachLayerHoverTracking()` recebem `state: PdfViewState` em vez de acessar `let` do módulo
- `drawLayer.ts` — `renderDrawLayerForPage()` recebe `state: PdfViewState`
- O caller (pdf/index.ts ou view) faz `getViewId(containerEl)` → lookup → passa state

### 3. Image State — `src/image/imageViewState.ts`

```typescript
export interface ImageViewState {
  keydownHandler: ((e: KeyboardEvent) => void) | null;
  keyupHandler: ((e: KeyboardEvent) => void) | null;
  containerEl: HTMLElement | null;
}

export function createImageViewState(): ImageViewState {
  return { keydownHandler: null, keyupHandler: null, containerEl: null };
}

export function destroyImageViewState(state: ImageViewState): void {
  if (state.containerEl && state.keydownHandler) {
    state.containerEl.removeEventListener('keydown', state.keydownHandler);
  }
  if (state.containerEl && state.keyupHandler) {
    state.containerEl.removeEventListener('keyup', state.keyupHandler);
  }
  state.keydownHandler = null;
  state.keyupHandler = null;
  state.containerEl = null;
}
```

**Impacto nos módulos:**
- `imageToolbar.ts` — troca `window.addEventListener("keydown", onKeyDown)` por `containerEl.addEventListener("keydown", onKeyDown)`. Guarda refs no state.
- `zoomPanControls.ts` — keydown/keyup → `containerEl`. Mouse move/up ficam em `window` (precisa capturar drag fora do container) mas guardam ref no state pra cleanup.

### 4. Sidebar Hover — `Set<string>` nos models

Cada engine model troca `hoverMarkerId: string | null` por `hoveredMarkerIds: Set<string>`:

- `setHoverState(markerId, codeName)` → adiciona ao Set
- `clearHoverState(markerId)` → remove do Set
- `baseSidebarAdapter.getHoverMarkerIds()` → retorna `[...set]`

Cada pane chama set/clear independente. Sem viewId necessário nesta camada.

### 5. fileInterceptor — remover bloqueio

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

1. `src/core/viewId.ts` — getViewId()
2. `src/pdf/pdfViewState.ts` — struct + create/destroy
3. `src/pdf/highlightRenderer.ts` — trocar 3 lets → receber PdfViewState
4. `src/pdf/drawLayer.ts` — trocar 2 lets → receber PdfViewState
5. `src/image/imageViewState.ts` — struct + create/destroy
6. `src/image/imageToolbar.ts` — window → containerEl para keydown
7. `src/image/canvas/zoomPanControls.ts` — window → containerEl para keydown/keyup
8. `src/core/baseSidebarAdapter.ts` + models — hoverMarkerId → Set
9. `src/core/fileInterceptor.ts` — remover bloco leaf.detach()
10. Testes — unit tests pra viewId, state objects, sidebar hover Set

## O que NÃO muda

- Audio/video/CSV/markdown — já têm state por instância
- `registerFileIntercept` / `registerFileRename` — API continua igual
- Nenhum engine novo, nenhuma abstração além dos 2 state objects

## Performance

- Lookup: `Map.get(viewId)` por evento de hover/keydown — O(1)
- Memória: objetos flat com 3-5 campos, GC quando view fecha
- Zero overhead vs estado global atual

## Backlog items resolvidos

- **M1** — leaf.detach() removido, multi-pane funciona
- **M2** — sidebar hover multi-marker via Set
- **M3** — P2/I4 resolvidos (mesma raiz)
- **P2** — PDF hover state isolado por view
- **P3** — PDF shape hover timers isolados por view
- **I1** — regionHighlight já é safe (closure per-instance), confirmado
- **I4** — Image keyboard scoped ao containerEl
