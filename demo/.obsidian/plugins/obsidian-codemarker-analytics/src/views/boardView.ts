import { ItemView, WorkspaceLeaf, Menu, Notice } from "obsidian";
import type CodeMarkerAnalyticsPlugin from "../main";
import { setupBoardCanvas, teardownBoardCanvas, zoomBy, fitContent, type BoardCanvasState } from "../board/boardCanvas";
import { createStickyNote, nextNoteId, isStickyNote, setStickyColor, enableStickyEditing, STICKY_COLORS, DEFAULT_STICKY_COLOR, type StickyNoteData } from "../board/boardNodes";
import { createArrow, nextArrowId, updateArrowForNodes, isArrow, type ArrowData } from "../board/boardArrows";
import { enableDrawingMode, disableDrawingMode, tagNewPaths } from "../board/boardDrawing";
import { createBoardToolbar, type BoardTool } from "../board/boardToolbar";
import { serializeBoard, deserializeBoard, emptyBoardData, type BoardFileData } from "../board/boardData";

export const BOARD_VIEW_TYPE = "codemarker-board";
const BOARD_FILE = ".obsidian/plugins/obsidian-codemarker-analytics/board.json";

export class BoardView extends ItemView {
  private plugin: CodeMarkerAnalyticsPlugin;
  private canvasState: BoardCanvasState | null = null;
  private currentTool: BoardTool = "select";
  private arrowSourceObj: any = null; // first node clicked in arrow mode
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toolbarApi: { setActiveTool: (tool: BoardTool) => void } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CodeMarkerAnalyticsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return BOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Research Board";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("codemarker-board-view");

    // Toolbar
    const toolbarResult = createBoardToolbar(contentEl, {
      onToolChange: (tool) => this.setTool(tool),
      onAction: (action) => this.handleAction(action),
    });
    this.toolbarApi = toolbarResult;

    // Canvas container
    const canvasContainer = contentEl.createDiv({ cls: "codemarker-board-canvas-container" });
    canvasContainer.tabIndex = 0;

    // Small delay to let container get layout dimensions
    await new Promise((r) => setTimeout(r, 50));

    this.canvasState = setupBoardCanvas(canvasContainer);
    this.setupCanvasEvents();

    // Load saved board
    await this.loadBoard();
  }

  async onClose(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    await this.saveBoard();
    teardownBoardCanvas(this.canvasState);
    this.canvasState = null;
    this.contentEl.empty();
  }

  private setTool(tool: BoardTool): void {
    this.currentTool = tool;
    this.arrowSourceObj = null;

    if (!this.canvasState) return;
    const canvas = this.canvasState.canvas;

    // Disable drawing mode if switching away
    if (tool !== "draw") {
      disableDrawingMode(canvas);
    }

    if (tool === "select") {
      canvas.selection = true;
      canvas.defaultCursor = "default";
      canvas.forEachObject((o) => { o.selectable = true; });
    } else if (tool === "note") {
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";
      canvas.forEachObject((o) => { o.selectable = false; });
    } else if (tool === "arrow") {
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";
      canvas.forEachObject((o) => { o.selectable = false; });
    } else if (tool === "draw") {
      canvas.selection = false;
      const isDark = document.body.classList.contains("theme-dark");
      enableDrawingMode(canvas, isDark ? "#cccccc" : "#333333", 2);
    }
  }

  private handleAction(action: string): void {
    if (!this.canvasState) return;
    const canvas = this.canvasState.canvas;

    if (action === "delete") {
      const active = canvas.getActiveObjects();
      for (const obj of active) {
        canvas.remove(obj);
      }
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      this.scheduleSave();
    } else if (action === "zoom-in") {
      zoomBy(this.canvasState, 1.3);
    } else if (action === "zoom-out") {
      zoomBy(this.canvasState, 0.77);
    } else if (action === "fit") {
      fitContent(this.canvasState);
    } else if (action === "save") {
      this.saveBoard();
      new Notice("Board saved");
    }
  }

  private setupCanvasEvents(): void {
    if (!this.canvasState) return;
    const canvas = this.canvasState.canvas;

    // Click on canvas — tool-specific behavior
    canvas.on("mouse:down", (opt) => {
      const e = opt.e as MouseEvent;
      // Ignore middle-click (panning) and right-click
      if (e.button !== 0) return;

      if (this.currentTool === "note" && !opt.target) {
        // Create sticky note at click position
        const pointer = canvas.getViewportPoint(e);
        const vt = canvas.viewportTransform!;
        const zoom = canvas.getZoom();
        const x = (pointer.x - vt[4]) / zoom;
        const y = (pointer.y - vt[5]) / zoom;

        createStickyNote(canvas, {
          id: nextNoteId(),
          x,
          y,
          width: 180,
          height: 120,
          text: "",
          color: DEFAULT_STICKY_COLOR,
        });
        this.scheduleSave();
      } else if (this.currentTool === "arrow" && opt.target) {
        if (isStickyNote(opt.target)) {
          if (!this.arrowSourceObj) {
            // First click — select source
            this.arrowSourceObj = opt.target;
            opt.target.set("opacity", 0.7);
            canvas.requestRenderAll();
          } else if (this.arrowSourceObj !== opt.target) {
            // Second click — create arrow
            this.arrowSourceObj.set("opacity", 1);
            createArrow(canvas, this.arrowSourceObj, opt.target, {
              id: nextArrowId(),
              fromNodeId: (this.arrowSourceObj as any).boardId,
              toNodeId: (opt.target as any).boardId,
              color: "#888",
              label: "",
            });
            this.arrowSourceObj = null;
            canvas.requestRenderAll();
            this.scheduleSave();
          }
        }
      }
    });

    // Double-click to edit sticky note text
    canvas.on("mouse:dblclick", (opt) => {
      if (this.currentTool !== "select") return;
      if (opt.target && isStickyNote(opt.target)) {
        enableStickyEditing(canvas, opt.target);
      }
    });

    // Update arrows when objects move
    canvas.on("object:moving", () => {
      updateArrowForNodes(canvas);
    });

    canvas.on("object:modified", () => {
      this.scheduleSave();
    });

    // Tag new drawing paths
    canvas.on("path:created", () => {
      tagNewPaths(canvas);
      this.scheduleSave();
    });

    // Right-click context menu on sticky notes
    canvas.on("mouse:down", (opt) => {
      const e = opt.e as MouseEvent;
      if (e.button !== 2) return;
      if (!opt.target || !isStickyNote(opt.target)) return;

      e.preventDefault();
      e.stopPropagation();
      const target = opt.target;

      const menu = new Menu();
      // Color submenu
      for (const [key, hex] of Object.entries(STICKY_COLORS)) {
        menu.addItem((item) => {
          item.setTitle(key.charAt(0).toUpperCase() + key.slice(1));
          item.onClick(() => {
            setStickyColor(target, key);
            this.scheduleSave();
          });
        });
      }
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle("Delete");
        item.setIcon("trash-2");
        item.onClick(() => {
          canvas.remove(target);
          canvas.requestRenderAll();
          this.scheduleSave();
        });
      });

      menu.showAtPosition({ x: e.pageX, y: e.pageY });
    });
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveBoard(), 2000);
  }

  private async saveBoard(): Promise<void> {
    if (!this.canvasState) return;
    const data = serializeBoard(this.canvasState.canvas);
    const json = JSON.stringify(data, null, 2);
    try {
      await this.app.vault.adapter.write(BOARD_FILE, json);
    } catch {
      // Directory might not exist yet, try creating
      try {
        await this.app.vault.adapter.write(BOARD_FILE, json);
      } catch {
        console.warn("Failed to save board");
      }
    }
  }

  private async loadBoard(): Promise<void> {
    if (!this.canvasState) return;
    try {
      const raw = await this.app.vault.adapter.read(BOARD_FILE);
      const data: BoardFileData = JSON.parse(raw);
      if (data.version !== 1) return;

      const canvas = this.canvasState.canvas;

      deserializeBoard(
        canvas,
        data,
        (nodeData: StickyNoteData) => {
          createStickyNote(canvas, nodeData);
        },
        (arrowData: ArrowData) => {
          // Find from/to nodes
          const objects = canvas.getObjects();
          const fromObj = objects.find((o) => (o as any).boardId === arrowData.fromNodeId);
          const toObj = objects.find((o) => (o as any).boardId === arrowData.toNodeId);
          if (fromObj && toObj) {
            createArrow(canvas, fromObj, toObj, arrowData);
          }
        },
      );
    } catch {
      // No saved board — start fresh
    }
  }
}
