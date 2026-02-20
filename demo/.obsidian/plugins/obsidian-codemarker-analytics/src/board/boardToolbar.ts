import { setIcon } from "obsidian";

export type BoardTool = "select" | "note" | "arrow" | "draw";

export interface BoardToolbarCallbacks {
  onToolChange: (tool: BoardTool) => void;
  onAction: (action: "delete" | "zoom-in" | "zoom-out" | "fit" | "save") => void;
}

export function createBoardToolbar(
  container: HTMLElement,
  callbacks: BoardToolbarCallbacks,
): { el: HTMLElement; setActiveTool: (tool: BoardTool) => void } {
  const toolbar = container.createDiv({ cls: "codemarker-board-toolbar" });

  let activeTool: BoardTool = "select";
  const toolBtns: Map<BoardTool, HTMLElement> = new Map();

  // Tool buttons (toggle group)
  const tools: Array<{ tool: BoardTool; icon: string; label: string }> = [
    { tool: "select", icon: "mouse-pointer", label: "Select" },
    { tool: "note", icon: "sticky-note", label: "Add Note" },
    { tool: "arrow", icon: "arrow-right", label: "Arrow" },
    { tool: "draw", icon: "pencil", label: "Draw" },
  ];

  for (const t of tools) {
    const btn = toolbar.createDiv({ cls: "codemarker-board-toolbar-btn" });
    setIcon(btn, t.icon);
    btn.createSpan({ text: t.label });
    btn.setAttribute("aria-label", t.label);
    if (t.tool === activeTool) btn.addClass("is-active");

    btn.addEventListener("click", () => {
      activeTool = t.tool;
      for (const [k, b] of toolBtns) {
        b.toggleClass("is-active", k === activeTool);
      }
      callbacks.onToolChange(activeTool);
    });

    toolBtns.set(t.tool, btn);
  }

  // Separator
  toolbar.createDiv({ cls: "codemarker-board-toolbar-sep" });

  // Action buttons
  const actions: Array<{ action: "delete" | "zoom-in" | "zoom-out" | "fit" | "save"; icon: string; label: string }> = [
    { action: "delete", icon: "trash-2", label: "Delete" },
    { action: "zoom-in", icon: "zoom-in", label: "Zoom In" },
    { action: "zoom-out", icon: "zoom-out", label: "Zoom Out" },
    { action: "fit", icon: "maximize-2", label: "Fit" },
    { action: "save", icon: "save", label: "Save" },
  ];

  for (const a of actions) {
    const btn = toolbar.createDiv({ cls: "codemarker-board-toolbar-btn" });
    setIcon(btn, a.icon);
    btn.createSpan({ text: a.label });
    btn.setAttribute("aria-label", a.label);

    btn.addEventListener("click", () => {
      callbacks.onAction(a.action);
    });
  }

  return {
    el: toolbar,
    setActiveTool(tool: BoardTool) {
      activeTool = tool;
      for (const [k, b] of toolBtns) {
        b.toggleClass("is-active", k === activeTool);
      }
    },
  };
}
