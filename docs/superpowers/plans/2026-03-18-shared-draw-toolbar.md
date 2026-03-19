# Shared Draw Toolbar — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar a logica de toolbar de drawing entre Image e PDF usando o catalogo `DRAW_TOOL_BUTTONS` que ja existe em `shapeTypes.ts`, eliminando duplicacao e garantindo consistencia de UX.

**Architecture:** Criar `createDrawToolbar()` em `src/core/drawToolbarFactory.ts` que recebe o catalogo de botoes + callbacks e renderiza a toolbar. Image e PDF chamam a factory com suas configuracoes especificas. Image adiciona zoom buttons e freeform mode extra. PDF injeta dentro do `.pdf-toolbar`.

**Tech Stack:** TypeScript, Obsidian setIcon/setTooltip

---

## Contexto

`src/core/shapeTypes.ts` ja define:
- `DrawMode = 'select' | 'rect' | 'ellipse' | 'polygon'`
- `DrawToolButtonSpec = { mode, icon, tooltip, shortcut }`
- `DRAW_TOOL_BUTTONS` — catalogo com 4 shapes

Mas ninguem usa esse catalogo:
- `src/image/toolbar/imageToolbar.ts` (180 LOC) — hardcoda seus proprios botoes
- `src/pdf/drawToolbar.ts` (107 LOC) — hardcoda seus proprios botoes

## Arquivos

| Arquivo | Acao | LOC estimado |
|---|---|---|
| `src/core/drawToolbarFactory.ts` | Criar | ~80 |
| `src/core/shapeTypes.ts` | Modificar — adicionar 'freeform' ao catalogo | ~5 linhas |
| `src/image/toolbar/imageToolbar.ts` | Modificar (180 → ~100) — usar factory + adicionar zoom | 100 |
| `src/pdf/drawToolbar.ts` | Modificar (107 → ~50) — usar factory | 50 |

**Nao muda**: drawInteraction.ts, regionDrawing.ts, fabricCanvas.ts, index.ts (ambos engines)

---

## Chunk 1: Factory + shapeTypes update

### Task 1: Atualizar shapeTypes.ts com freeform

**Files:**
- Modify: `src/core/shapeTypes.ts`

Image tem `freeform` mode que PDF nao tem. Adicionar ao catalogo como opcional:

- [ ] **Step 1: Adicionar freeform ao DrawMode e catalogo**

Em `src/core/shapeTypes.ts`:

Mudar:
```typescript
export type DrawMode = 'select' | 'rect' | 'ellipse' | 'polygon';
```
Para:
```typescript
export type DrawMode = 'select' | 'rect' | 'ellipse' | 'polygon' | 'freeform';
```

Adicionar ao `DRAW_TOOL_BUTTONS`:
```typescript
export const DRAW_TOOL_BUTTONS: DrawToolButtonSpec[] = [
	{ mode: 'select', icon: 'mouse-pointer', tooltip: 'Select', shortcut: 'V' },
	{ mode: 'rect', icon: 'square', tooltip: 'Rectangle', shortcut: 'R' },
	{ mode: 'ellipse', icon: 'circle', tooltip: 'Ellipse', shortcut: 'E' },
	{ mode: 'polygon', icon: 'pentagon', tooltip: 'Polygon', shortcut: 'P' },
	{ mode: 'freeform', icon: 'pencil', tooltip: 'Freeform', shortcut: 'F' },
];
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/shapeTypes.ts
~/.claude/scripts/commit.sh "feat: adiciona freeform ao DrawMode e DRAW_TOOL_BUTTONS"
```

### Task 2: Criar drawToolbarFactory.ts

**Files:**
- Create: `src/core/drawToolbarFactory.ts`

- [ ] **Step 1: Criar a factory**

```typescript
// src/core/drawToolbarFactory.ts

import { setIcon, setTooltip } from 'obsidian';
import type { DrawMode, DrawToolButtonSpec } from './shapeTypes';

export interface DrawToolbarConfig {
  /** Which modes to include (filters DRAW_TOOL_BUTTONS) */
  modes: DrawMode[];
  /** CSS class for the container */
  containerClass: string;
  /** Called when user selects a mode */
  onModeChange: (mode: DrawMode) => void;
  /** Called when user clicks delete */
  onDelete?: () => void;
  /** Whether to add keyboard shortcut listeners */
  enableKeyboard?: boolean;
  /** Parent element to scope keyboard events (default: window) */
  keyboardScope?: HTMLElement;
}

export interface DrawToolbarHandle {
  /** The toolbar container element */
  el: HTMLElement;
  /** Update which button is active */
  setActiveMode(mode: DrawMode): void;
  /** Remove toolbar and cleanup listeners */
  destroy(): void;
}

/**
 * Create a draw toolbar from the shared button catalog.
 * Used by both Image and PDF engines for consistent UX.
 */
export function createDrawToolbar(
  parent: HTMLElement,
  buttons: DrawToolButtonSpec[],
  config: DrawToolbarConfig,
): DrawToolbarHandle {
  const el = document.createElement('div');
  el.className = config.containerClass;

  const btnEls = new Map<DrawMode, HTMLElement>();

  // Mode buttons
  for (const spec of buttons) {
    if (!config.modes.includes(spec.mode)) continue;

    const btn = document.createElement('div');
    btn.className = 'clickable-icon';
    setIcon(btn, spec.icon);
    setTooltip(btn, `${spec.tooltip} (${spec.shortcut})`);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      config.onModeChange(spec.mode);
      setActiveMode(spec.mode);
    });

    el.appendChild(btn);
    btnEls.set(spec.mode, btn);
  }

  // Delete button
  if (config.onDelete) {
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'clickable-icon';
    setIcon(deleteBtn, 'trash-2');
    setTooltip(deleteBtn, 'Delete selected (Del)');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      config.onDelete!();
    });
    el.appendChild(deleteBtn);
  }

  parent.appendChild(el);

  // Active state
  function setActiveMode(mode: DrawMode): void {
    for (const [m, btn] of btnEls) {
      btn.classList.toggle('is-active', m === mode);
    }
  }

  // Set initial active
  setActiveMode('select');

  // Keyboard shortcuts
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  if (config.enableKeyboard !== false) {
    const shortcutMap = new Map<string, DrawMode>();
    for (const spec of buttons) {
      if (config.modes.includes(spec.mode)) {
        shortcutMap.set(spec.shortcut.toLowerCase(), spec.mode);
      }
    }

    keyHandler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mode = shortcutMap.get(e.key.toLowerCase());
      if (mode) {
        config.onModeChange(mode);
        setActiveMode(mode);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        config.onDelete?.();
      }
    };

    const scope = config.keyboardScope ?? window;
    (scope as any).addEventListener('keydown', keyHandler);
  }

  return {
    el,
    setActiveMode,
    destroy() {
      if (keyHandler) {
        const scope = config.keyboardScope ?? window;
        (scope as any).removeEventListener('keydown', keyHandler);
      }
      el.remove();
    },
  };
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/drawToolbarFactory.ts
~/.claude/scripts/commit.sh "feat: cria drawToolbarFactory — toolbar compartilhada entre PDF e Image"
```

---

## Chunk 2: Migrar toolbars

### Task 3: Migrar PDF drawToolbar.ts

**Files:**
- Modify: `src/pdf/drawToolbar.ts` (107 → ~50 LOC)

- [ ] **Step 1: Reescrever usando factory**

```typescript
// src/pdf/drawToolbar.ts

import type { DrawInteraction } from './drawInteraction';
import { DRAW_TOOL_BUTTONS } from '../core/shapeTypes';
import { createDrawToolbar, type DrawToolbarHandle } from '../core/drawToolbarFactory';

export class DrawToolbar {
  private interaction: DrawInteraction;
  private handle: DrawToolbarHandle | null = null;

  constructor(interaction: DrawInteraction) {
    this.interaction = interaction;
  }

  mount(pdfContainerEl: HTMLElement): void {
    const toolbar = pdfContainerEl.querySelector('.pdf-toolbar') as HTMLElement
      ?? pdfContainerEl.querySelector('[class*="toolbar"]') as HTMLElement;
    if (!toolbar) return;

    // PDF uses: select, rect, ellipse, polygon (no freeform)
    this.handle = createDrawToolbar(toolbar, DRAW_TOOL_BUTTONS, {
      modes: ['select', 'rect', 'ellipse', 'polygon'],
      containerClass: 'codemarker-pdf-draw-toolbar',
      onModeChange: (mode) => this.interaction.setMode(mode),
      onDelete: () => this.interaction.deleteSelectedShape(),
      enableKeyboard: false, // PDF has its own keyboard handling
    });
  }

  unmount(): void {
    this.handle?.destroy();
    this.handle = null;
  }

  updateActiveState(): void {
    this.handle?.setActiveMode(this.interaction.getMode());
  }
}
```

- [ ] **Step 2: Build + test**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pdf/drawToolbar.ts
~/.claude/scripts/commit.sh "refactor: PDF drawToolbar usa factory compartilhada (107 → ~50 LOC)"
```

### Task 4: Migrar Image imageToolbar.ts

**Files:**
- Modify: `src/image/toolbar/imageToolbar.ts` (180 → ~100 LOC)

Image e mais complexa — tem zoom buttons e freeform mode que o PDF nao tem. A factory cuida dos mode buttons, o resto fica especifico.

- [ ] **Step 1: Reescrever usando factory + zoom custom**

```typescript
// src/image/toolbar/imageToolbar.ts

import { setIcon } from "obsidian";
import { FabricCanvasState, fitToContainer, zoomBy } from "../canvas/fabricCanvas";
import { DRAW_TOOL_BUTTONS, type DrawMode } from "../../core/shapeTypes";
import { createDrawToolbar, type DrawToolbarHandle } from "../../core/drawToolbarFactory";

export type ToolMode = DrawMode;

export interface ToolbarState {
  el: HTMLElement;
  activeMode: ToolMode;
  onModeChange: ((mode: ToolMode) => void) | null;
  destroy(): void;
}

export interface ToolbarCallbacks {
  onDelete?: () => void;
  onViewChanged?: () => void;
}

export function createToolbar(
  parent: HTMLElement,
  fabricState: FabricCanvasState,
  callbacks: ToolbarCallbacks = {}
): ToolbarState {
  const el = parent.createDiv({ cls: "codemarker-image-toolbar" });

  const toolbarState: ToolbarState = {
    el,
    activeMode: "select",
    onModeChange: null,
    destroy() { el.remove(); },
  };

  // Mode buttons via shared factory (select, rect, ellipse, freeform — no polygon for image)
  const drawHandle = createDrawToolbar(el, DRAW_TOOL_BUTTONS, {
    modes: ['select', 'rect', 'ellipse', 'freeform'],
    containerClass: 'codemarker-toolbar-group',
    onModeChange: (mode) => {
      toolbarState.activeMode = mode;
      toolbarState.onModeChange?.(mode);
    },
    onDelete: () => {
      if (callbacks.onDelete) {
        callbacks.onDelete();
      } else {
        const active = fabricState.canvas.getActiveObjects();
        if (active.length > 0) {
          active.forEach((obj) => fabricState.canvas.remove(obj));
          fabricState.canvas.discardActiveObject();
          fabricState.canvas.requestRenderAll();
        }
      }
    },
    enableKeyboard: false, // We handle keyboard below (includes zoom shortcuts)
  });

  // Separator
  el.createDiv({ cls: "codemarker-toolbar-separator" });

  // Zoom buttons (image-specific)
  const zoomGroup = el.createDiv({ cls: "codemarker-toolbar-group" });

  const zoomInBtn = zoomGroup.createDiv({
    cls: "codemarker-toolbar-btn",
    attr: { "aria-label": "Zoom in", title: "Zoom in (+)" },
  });
  setIcon(zoomInBtn, "zoom-in");
  zoomInBtn.addEventListener("click", () => zoomBy(fabricState, 1.25));

  const zoomOutBtn = zoomGroup.createDiv({
    cls: "codemarker-toolbar-btn",
    attr: { "aria-label": "Zoom out", title: "Zoom out (-)" },
  });
  setIcon(zoomOutBtn, "zoom-out");
  zoomOutBtn.addEventListener("click", () => zoomBy(fabricState, 0.8));

  const fitBtn = zoomGroup.createDiv({
    cls: "codemarker-toolbar-btn",
    attr: { "aria-label": "Fit to view", title: "Fit to view (0)" },
  });
  setIcon(fitBtn, "maximize");
  fitBtn.addEventListener("click", () => { fitToContainer(fabricState); callbacks.onViewChanged?.(); });

  // Keyboard shortcuts (mode + zoom)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    // Mode shortcuts from catalog
    for (const spec of DRAW_TOOL_BUTTONS) {
      if (e.key.toLowerCase() === spec.shortcut.toLowerCase() && ['select', 'rect', 'ellipse', 'freeform'].includes(spec.mode)) {
        toolbarState.activeMode = spec.mode;
        toolbarState.onModeChange?.(spec.mode);
        drawHandle.setActiveMode(spec.mode);
        return;
      }
    }

    switch (e.key) {
      case "Delete":
      case "Backspace":
        callbacks.onDelete ? callbacks.onDelete() : drawHandle.el.querySelector('.clickable-icon:last-child')?.dispatchEvent(new Event('click'));
        break;
      case "=":
      case "+":
        zoomBy(fabricState, 1.25); callbacks.onViewChanged?.(); break;
      case "-":
        zoomBy(fabricState, 0.8); callbacks.onViewChanged?.(); break;
      case "0":
        fitToContainer(fabricState); callbacks.onViewChanged?.(); break;
    }
  };

  window.addEventListener("keydown", onKeyDown);

  const origDestroy = toolbarState.destroy;
  toolbarState.destroy = () => {
    window.removeEventListener("keydown", onKeyDown);
    drawHandle.destroy();
    origDestroy();
  };

  return toolbarState;
}
```

- [ ] **Step 2: Build + test**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 3: Testar manualmente no Obsidian**

Abrir uma imagem e um PDF. Verificar que:
- Image: select, rect, ellipse, freeform, delete, zoom funcionam
- PDF: select, rect, ellipse, polygon, delete funcionam
- Shortcuts (V, R, E, F/P, Del, +, -, 0) funcionam

- [ ] **Step 4: Commit**

```bash
git add src/image/toolbar/imageToolbar.ts
~/.claude/scripts/commit.sh "refactor: Image toolbar usa factory compartilhada (180 → ~100 LOC)"
```

---

## Chunk 3: Validacao + docs

### Task 5: Rodar e2e + atualizar docs

- [ ] **Step 1: Rodar e2e**

Run: `npm run test:e2e -- --spec test/e2e/specs/image-view.e2e.ts --spec test/e2e/specs/pdf-view.e2e.ts`
Expected: PASS

- [ ] **Step 2: Atualizar CLAUDE.md**

Na secao core/:
```
    drawToolbarFactory.ts    — factory compartilhada de toolbar (PDF + Image)
```

- [ ] **Step 3: Atualizar BACKLOG.md**

Marcar "Shape Catalog compartilhado PDF+Image" como FEITO (parcial — toolbar unificada, renderers ainda especificos).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/BACKLOG.md
~/.claude/scripts/commit.sh "docs: toolbar compartilhada PDF+Image via factory"
```

---

## Verificacao final

- `npm run build` — zero erros
- `npm run test` — 1269 testes passam
- `npm run test:e2e` — image-view e pdf-view passam
- PDF: 107 → ~50 LOC (-57 LOC)
- Image: 180 → ~100 LOC (-80 LOC)
- Factory: +80 LOC nova
- **Net: ~57 LOC eliminadas + consistencia de UX**
- Ambas toolbars usam o mesmo catalogo `DRAW_TOOL_BUTTONS`
- Adicionar nova shape = 1 entry no catalogo, ambos engines ganham automaticamente
