import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type CodeMarkerImagePlugin from "./main";
import {
  FabricCanvasState,
  setupFabricCanvas,
  teardownFabricCanvas,
} from "./canvas/fabricCanvas";
import { RegionDrawingState, setupRegionDrawing } from "./canvas/regionDrawing";
import { setupZoomPanControls, ZoomPanCleanup } from "./controls/zoomPanControls";
import { createToolbar, ToolbarState } from "./toolbar/toolbar";
import { RegionManager } from "./coding/regionManager";

export const IMAGE_CODING_VIEW_TYPE = "image-coding-view";

export class ImageCodingView extends ItemView {
  private plugin: CodeMarkerImagePlugin;
  private fabricState: FabricCanvasState | null = null;
  private zoomPanCleanup: ZoomPanCleanup | null = null;
  private toolbarState: ToolbarState | null = null;
  private drawingState: RegionDrawingState | null = null;
  private regionManager: RegionManager | null = null;
  private currentFile: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CodeMarkerImagePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return IMAGE_CODING_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.currentFile?.basename ?? "CodeMarker Image";
  }

  getIcon(): string {
    return "image";
  }

  async setState(state: unknown, result: any): Promise<void> {
    const s = state as Record<string, unknown>;
    const filePath = s?.file as string | undefined;
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await this.loadImage(file);
      }
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return {
      file: this.currentFile?.path ?? "",
    };
  }

  async loadImage(file: TFile): Promise<void> {
    this.cleanup();
    this.currentFile = file;
    (this.leaf as any).updateHeader?.();

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("codemarker-image-view");

    const container = contentEl.createDiv({
      cls: "codemarker-canvas-container",
    });

    const imageUrl = this.app.vault.getResourcePath(file);

    try {
      this.fabricState = await setupFabricCanvas(container, imageUrl);

      // Region manager — bridge canvas shapes ↔ model
      this.regionManager = new RegionManager(this.fabricState, this.plugin.model);

      // Restore persisted markers
      this.regionManager.restoreMarkers(file.path);

      // Region drawing — pass regionManager so new shapes get registered
      this.drawingState = setupRegionDrawing(this.fabricState, {
        onShapeCreated: (shape) => {
          this.regionManager?.registerShape(shape, file.path);
        },
        onShapeDeleted: (shape) => {
          this.regionManager?.deleteShape(shape);
        },
        onShapeModified: (shape) => {
          this.regionManager?.syncShapeToModel(shape);
        },
      });

      // Toolbar
      this.toolbarState = createToolbar(contentEl, this.fabricState, {
        onDelete: () => {
          const active = this.fabricState?.canvas.getActiveObjects();
          if (active && active.length > 0) {
            active.forEach((obj) => this.regionManager?.deleteShape(obj));
            this.fabricState?.canvas.discardActiveObject();
          }
        },
      });
      contentEl.insertBefore(this.toolbarState.el, container);

      // Wire toolbar mode → drawing state
      this.toolbarState.onModeChange = (mode) => {
        this.drawingState?.setMode(mode);
      };

      // Zoom/pan controls
      this.zoomPanCleanup = setupZoomPanControls(this.fabricState);
    } catch (e) {
      container.createDiv({
        cls: "codemarker-image-error",
        text: "Failed to load image: " + (e as Error).message,
      });
    }
  }

  private cleanup(): void {
    this.drawingState?.destroy();
    this.drawingState = null;
    this.regionManager?.clear();
    this.regionManager = null;
    this.zoomPanCleanup?.destroy();
    this.zoomPanCleanup = null;
    this.toolbarState?.destroy();
    this.toolbarState = null;
    teardownFabricCanvas(this.fabricState);
    this.fabricState = null;
  }

  async onClose(): Promise<void> {
    this.cleanup();
    this.currentFile = null;
  }
}
