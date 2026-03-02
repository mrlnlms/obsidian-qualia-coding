
import { ItemView, WorkspaceLeaf, Menu, Notice } from "obsidian";
import type { AnalyticsPluginAPI } from "../index";
import { setupBoardCanvas, teardownBoardCanvas, zoomBy, fitContent, type BoardCanvasState } from "../board/boardCanvas";
import { createStickyNote, nextNoteId, isStickyNote, isSnapshotNode, isExcerptNode, isCodeCardNode, isKpiCardNode, isClusterFrame, setStickyColor, enableStickyEditing, createSnapshotNode, nextSnapshotId, createExcerptNode, nextExcerptId, createCodeCardNode, nextCodeCardId, createKpiCardNode, nextKpiCardId, createClusterFrame, nextClusterFrameId, STICKY_COLORS, DEFAULT_STICKY_COLOR, type StickyNoteData, type SnapshotNodeData, type ExcerptNodeData, type CodeCardNodeData, type KpiCardNodeData, type ClusterFrameData } from "../board/boardNodes";
import { createArrow, nextArrowId, updateArrowForNodes, removeArrowById, isArrow, type ArrowData } from "../board/boardArrows";
import { enableDrawingMode, disableDrawingMode, tagNewPaths } from "../board/boardDrawing";
import { createBoardToolbar, type BoardTool } from "../board/boardToolbar";
import { serializeBoard, deserializeBoard, emptyBoardData, type BoardFileData } from "../board/boardData";
import { clusterCodeCards } from "../board/boardClusters";

export const BOARD_VIEW_TYPE = "codemarker-board";
const BOARD_FILE = ".obsidian/plugins/qualia-coding/board.json";

export class BoardView extends ItemView {
  private plugin: AnalyticsPluginAPI;
  private canvasState: BoardCanvasState | null = null;
  private currentTool: BoardTool = "select";
  private arrowSourceObj: any = null; // first node clicked in arrow mode
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toolbarApi: { setActiveTool: (tool: BoardTool) => void } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AnalyticsPluginAPI) {
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

    // Prevent Obsidian from intercepting right-click on canvas
    canvasContainer.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.canvasState = setupBoardCanvas(canvasContainer);
    this.setupCanvasEvents();

    // Drag & drop from Frequency code list
    canvasContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    canvasContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      this.handleDrop(e);
    });

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

    // All tools: keep objects selectable and evented so they're always detectable.
    // Tool behavior is controlled in the mouse:down handler.
    canvas.forEachObject((o) => { o.selectable = true; o.evented = true; });

    if (tool === "select") {
      canvas.selection = true;
      canvas.defaultCursor = "default";
    } else if (tool === "note") {
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";
    } else if (tool === "arrow") {
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";
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
        // If it's an arrow part, remove both line + head
        if (isArrow(obj)) {
          removeArrowById(canvas, (obj as any).boardId);
        } else {
          canvas.remove(obj);
        }
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
    } else if (action === "cluster") {
      this.autoGroupCards();
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

      if (this.currentTool === "note") {
        if (!opt.target) {
          // Create sticky note at click position on empty space
          const pointer = canvas.getScenePoint(e);
          createStickyNote(canvas, {
            id: nextNoteId(),
            x: pointer.x - 90,
            y: pointer.y - 60,
            width: 180,
            height: 120,
            text: "",
            color: DEFAULT_STICKY_COLOR,
          });
          this.scheduleSave();
        }
        // If clicked on existing object, just ignore (don't move it)
        canvas.discardActiveObject();
      } else if (this.currentTool === "arrow") {
        // Prevent object dragging in arrow mode
        canvas.discardActiveObject();

        if (opt.target) {
          const t = opt.target;
          const isNode = isStickyNote(t) || isSnapshotNode(t) || isExcerptNode(t) || isCodeCardNode(t) || isKpiCardNode(t);
          if (isNode) {
            if (!this.arrowSourceObj) {
              // First click — select source
              this.arrowSourceObj = t;
              t.set("opacity", 0.7);
              canvas.requestRenderAll();
            } else if (this.arrowSourceObj !== t) {
              // Second click — create arrow
              this.arrowSourceObj.set("opacity", 1);
              createArrow(canvas, this.arrowSourceObj, t, {
                id: nextArrowId(),
                fromNodeId: (this.arrowSourceObj as any).boardId,
                toNodeId: (t as any).boardId,
                color: "#888",
                label: "",
              });
              this.arrowSourceObj = null;
              canvas.requestRenderAll();
              this.scheduleSave();
            }
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

    // Right-click context menu on nodes
    canvas.on("mouse:down", (opt) => {
      const e = opt.e as MouseEvent;
      if (e.button !== 2) return;
      if (!opt.target) return;
      const isSticky = isStickyNote(opt.target);
      const isSnapshot = isSnapshotNode(opt.target);
      const isExcerpt = isExcerptNode(opt.target);
      const isCodeCard = isCodeCardNode(opt.target);
      const isKpi = isKpiCardNode(opt.target);
      const isCluster = isClusterFrame(opt.target);
      const isArrowObj = isArrow(opt.target);
      if (!isSticky && !isSnapshot && !isExcerpt && !isCodeCard && !isKpi && !isCluster && !isArrowObj) return;

      e.preventDefault();
      e.stopPropagation();
      const target = opt.target;

      const menu = new Menu();
      // Color submenu (sticky notes only)
      if (isSticky) {
        for (const [key, hex] of Object.entries(STICKY_COLORS)) {
          menu.addItem((item) => {
            item.setTitle(key.charAt(0).toUpperCase() + key.slice(1));
            item.onClick(() => {
              setStickyColor(target as any, key);
              this.scheduleSave();
            });
          });
        }
        menu.addSeparator();
      }
      menu.addItem((item) => {
        item.setTitle("Delete");
        item.setIcon("trash-2");
        item.onClick(() => {
          if (isArrowObj) {
            removeArrowById(canvas, (target as any).boardId);
          } else {
            canvas.remove(target);
          }
          canvas.requestRenderAll();
          this.scheduleSave();
        });
      });

      menu.showAtPosition({ x: e.pageX, y: e.pageY });
    });
  }

  /** Public: add a chart snapshot from Analytics view */
  async addSnapshot(title: string, dataUrl: string, viewMode: string): Promise<void> {
    if (!this.canvasState) return;
    const canvas = this.canvasState.canvas;

    // Place new snapshot in a visible area — center of current viewport
    const vt = canvas.viewportTransform!;
    const zoom = canvas.getZoom();
    const cw = this.canvasState.container.clientWidth;
    const ch = this.canvasState.container.clientHeight;
    const x = (-vt[4] + cw / 2 - 140) / zoom;
    const y = (-vt[5] + ch / 2 - 100) / zoom;

    await createSnapshotNode(canvas, {
      id: nextSnapshotId(),
      x,
      y,
      width: 280,
      height: 180,
      title,
      dataUrl,
      viewMode,
      createdAt: Date.now(),
    });

    // Switch to select tool so user can move the new node
    this.setTool("select");
    if (this.toolbarApi) this.toolbarApi.setActiveTool("select");
    this.scheduleSave();
  }

  /** Public: add a KPI card */
  addKpiCard(value: string, label: string, accent: string): void {
    if (!this.canvasState) return;
    const canvas = this.canvasState.canvas;

    const vt = canvas.viewportTransform!;
    const zoom = canvas.getZoom();
    const cw = this.canvasState.container.clientWidth;
    const ch = this.canvasState.container.clientHeight;
    const x = (-vt[4] + cw / 2 - 70) / zoom;
    const y = (-vt[5] + ch / 2 - 36) / zoom;

    createKpiCardNode(canvas, {
      id: nextKpiCardId(),
      x,
      y,
      value,
      label,
      accent,
      createdAt: Date.now(),
    });

    this.setTool("select");
    if (this.toolbarApi) this.toolbarApi.setActiveTool("select");
    this.scheduleSave();
  }

  /** Public: add a code definition card */
  addCodeCard(codeName: string, color: string, description: string, markerCount: number, sources: string[]): void {
    if (!this.canvasState) return;
    const canvas = this.canvasState.canvas;

    const vt = canvas.viewportTransform!;
    const zoom = canvas.getZoom();
    const cw = this.canvasState.container.clientWidth;
    const ch = this.canvasState.container.clientHeight;
    const x = (-vt[4] + cw / 2 - 100) / zoom;
    const y = (-vt[5] + ch / 2 - 60) / zoom;

    createCodeCardNode(canvas, {
      id: nextCodeCardId(),
      x,
      y,
      codeName,
      color,
      description,
      markerCount,
      sources,
      createdAt: Date.now(),
    });

    this.setTool("select");
    if (this.toolbarApi) this.toolbarApi.setActiveTool("select");
    this.scheduleSave();
  }

  /** Public: add a text excerpt from Text Retrieval view */
  addExcerpt(text: string, file: string, source: string, location: string, codes: string[], codeColors: string[]): void {
    if (!this.canvasState) return;
    const canvas = this.canvasState.canvas;

    const vt = canvas.viewportTransform!;
    const zoom = canvas.getZoom();
    const cw = this.canvasState.container.clientWidth;
    const ch = this.canvasState.container.clientHeight;
    const x = (-vt[4] + cw / 2 - 130) / zoom;
    const y = (-vt[5] + ch / 2 - 80) / zoom;

    createExcerptNode(canvas, {
      id: nextExcerptId(),
      x,
      y,
      width: 260,
      text,
      file,
      source,
      location,
      codes,
      codeColors,
      createdAt: Date.now(),
    });

    this.setTool("select");
    if (this.toolbarApi) this.toolbarApi.setActiveTool("select");
    this.scheduleSave();
  }

  private async autoGroupCards(): Promise<void> {
    if (!this.canvasState) return;
    const canvas = this.canvasState.canvas;

    // Collect all code card nodes
    const codeCards = canvas.getObjects().filter(isCodeCardNode);
    if (codeCards.length < 2) {
      new Notice("Need at least 2 code cards on the board to auto-group");
      return;
    }

    // Load data if needed
    let data = this.plugin.data;
    if (!data) {
      data = await this.plugin.loadConsolidatedData();
    }

    const codeNames = codeCards.map((o) => (o as any).boardCodeName as string);
    const codeColors = codeCards.map((o) => (o as any).boardColor as string);

    const result = clusterCodeCards(codeNames, codeColors, data);

    // Remove existing cluster frames
    const oldFrames = canvas.getObjects().filter(isClusterFrame);
    for (const f of oldFrames) {
      canvas.remove(f);
    }

    // Layout: arrange cards in clusters, create frames
    const cardW = 200;
    const cardH = 140;
    const padding = 24;
    const gap = 16;
    const cols = 2;
    const clusterGap = 50;

    let frameX = 50; // starting X position

    for (const cluster of result.clusters) {
      const n = cluster.codeNames.length;
      const rows = Math.ceil(n / cols);
      const actualCols = Math.min(n, cols);
      const frameW = actualCols * (cardW + gap) - gap + padding * 2;
      const frameH = rows * (cardH + gap) - gap + padding * 2 + 24; // 24 for label

      // Create frame
      createClusterFrame(canvas, {
        id: nextClusterFrameId(),
        x: frameX,
        y: 50,
        width: frameW,
        height: frameH,
        label: `Cluster ${cluster.id + 1} (${n} codes)`,
        color: cluster.color,
        codeNames: cluster.codeNames,
      });

      // Move cards into grid inside frame
      let idx = 0;
      for (const codeName of cluster.codeNames) {
        const card = codeCards.find((o) => (o as any).boardCodeName === codeName);
        if (card) {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          card.set({
            left: frameX + padding + col * (cardW + gap),
            top: 50 + padding + 24 + row * (cardH + gap),
          });
          card.setCoords();
          idx++;
        }
      }

      frameX += frameW + clusterGap;
    }

    // Update arrow positions
    updateArrowForNodes(canvas);
    canvas.requestRenderAll();
    this.scheduleSave();
    new Notice(`Grouped into ${result.clusters.length} cluster${result.clusters.length !== 1 ? "s" : ""}`);
  }

  private handleDrop(e: DragEvent): void {
    if (!this.canvasState || !e.dataTransfer) return;
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      if (payload.type !== "codemarker-code-card") return;
      const canvas = this.canvasState.canvas;
      const vt = canvas.viewportTransform!;
      const zoom = canvas.getZoom();
      // Convert DOM coords to canvas coords
      const rect = this.canvasState.container.getBoundingClientRect();
      const x = (e.clientX - rect.left - vt[4]) / zoom;
      const y = (e.clientY - rect.top - vt[5]) / zoom;

      createCodeCardNode(canvas, {
        id: nextCodeCardId(),
        x: x - 100,
        y: y - 60,
        codeName: payload.codeName,
        color: payload.color,
        description: payload.description ?? "",
        markerCount: payload.markerCount ?? 0,
        sources: payload.sources ?? [],
        createdAt: Date.now(),
      });

      this.setTool("select");
      if (this.toolbarApi) this.toolbarApi.setActiveTool("select");
      this.scheduleSave();
      new Notice(`Added "${payload.codeName}" to board`);
    } catch {
      // Not a valid code card drop — ignore
    }
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

      await deserializeBoard(
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
        async (snapData: SnapshotNodeData) => {
          await createSnapshotNode(canvas, snapData);
        },
        (excData: ExcerptNodeData) => {
          createExcerptNode(canvas, excData);
        },
        (ccData: CodeCardNodeData) => {
          createCodeCardNode(canvas, ccData);
        },
        (kpiData: KpiCardNodeData) => {
          createKpiCardNode(canvas, kpiData);
        },
        (cfData: ClusterFrameData) => {
          createClusterFrame(canvas, cfData);
        },
      );
    } catch {
      // No saved board — start fresh
    }
  }
}
