/**
 * Image coding toolbar.
 * Uses the shared drawToolbarFactory for mode buttons (consistent UX with PDF).
 * Adds image-specific zoom controls.
 */

import { setIcon } from "obsidian";
import { type FabricCanvasState, fitToContainer, zoomBy } from "../canvas/fabricCanvas";
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

  // Keyboard shortcuts (mode + zoom combined)
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
      case "Backspace": {
        const active = fabricState.canvas.getActiveObjects();
        if (active.length > 0) {
          if (callbacks.onDelete) { callbacks.onDelete(); }
          else {
            active.forEach((obj) => fabricState.canvas.remove(obj));
            fabricState.canvas.discardActiveObject();
            fabricState.canvas.requestRenderAll();
          }
        }
        break;
      }
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
