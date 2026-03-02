import { setIcon } from "obsidian";
import { FabricCanvasState, fitToContainer, zoomBy } from "../canvas/fabricCanvas";

export type ToolMode = "select" | "rect" | "ellipse" | "freeform";

export interface ToolbarState {
  el: HTMLElement;
  activeMode: ToolMode;
  onModeChange: ((mode: ToolMode) => void) | null;
  destroy(): void;
}

interface ToolButton {
  id: string;
  icon: string;
  title: string;
  mode?: ToolMode;
  action?: () => void;
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
    destroy() {
      el.remove();
    },
  };

  // --- Tool mode buttons ---
  const modeButtons: ToolButton[] = [
    { id: "select", icon: "mouse-pointer", title: "Select (V)", mode: "select" },
    { id: "rect", icon: "square", title: "Rectangle (R)", mode: "rect" },
    { id: "ellipse", icon: "circle", title: "Ellipse (E)", mode: "ellipse" },
    { id: "freeform", icon: "pencil", title: "Freeform (F)", mode: "freeform" },
  ];

  const modeGroup = el.createDiv({ cls: "codemarker-toolbar-group" });
  const modeEls = new Map<string, HTMLElement>();

  for (const btn of modeButtons) {
    const btnEl = modeGroup.createDiv({
      cls: "codemarker-toolbar-btn",
      attr: { "aria-label": btn.title, title: btn.title },
    });
    setIcon(btnEl, btn.icon);

    if (btn.mode === toolbarState.activeMode) {
      btnEl.addClass("is-active");
    }

    modeEls.set(btn.id, btnEl);

    btnEl.addEventListener("click", () => {
      if (!btn.mode) return;
      toolbarState.activeMode = btn.mode;
      // Update active state
      modeEls.forEach((el, id) => {
        el.toggleClass("is-active", id === btn.id);
      });
      toolbarState.onModeChange?.(btn.mode);
    });
  }

  // --- Separator ---
  el.createDiv({ cls: "codemarker-toolbar-separator" });

  // --- Action buttons ---
  const actionButtons: ToolButton[] = [
    { id: "delete", icon: "trash-2", title: "Delete selected (Del)", action: () => {
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
    }},
  ];

  const actionGroup = el.createDiv({ cls: "codemarker-toolbar-group" });
  for (const btn of actionButtons) {
    const btnEl = actionGroup.createDiv({
      cls: "codemarker-toolbar-btn",
      attr: { "aria-label": btn.title, title: btn.title },
    });
    setIcon(btnEl, btn.icon);
    btnEl.addEventListener("click", () => btn.action?.());
  }

  // --- Separator ---
  el.createDiv({ cls: "codemarker-toolbar-separator" });

  // --- Zoom buttons ---
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

  // --- Keyboard shortcuts ---
  const onKeyDown = (e: KeyboardEvent) => {
    // Don't capture when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key.toLowerCase()) {
      case "v":
        modeEls.get("select")?.click();
        break;
      case "r":
        modeEls.get("rect")?.click();
        break;
      case "e":
        modeEls.get("ellipse")?.click();
        break;
      case "f":
        modeEls.get("freeform")?.click();
        break;
      case "delete":
      case "backspace":
        actionButtons[0]?.action?.();
        break;
      case "=":
      case "+":
        zoomBy(fabricState, 1.25);
        callbacks.onViewChanged?.();
        break;
      case "-":
        zoomBy(fabricState, 0.8);
        callbacks.onViewChanged?.();
        break;
      case "0":
        fitToContainer(fabricState);
        callbacks.onViewChanged?.();
        break;
    }
  };

  window.addEventListener("keydown", onKeyDown);

  const origDestroy = toolbarState.destroy;
  toolbarState.destroy = () => {
    window.removeEventListener("keydown", onKeyDown);
    origDestroy();
  };

  return toolbarState;
}
