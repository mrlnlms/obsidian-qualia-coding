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
import { CodingMenu } from "./menu/codingMenu";
import { RegionLabels } from "./labels/regionLabels";
import { RegionHighlightState, setupRegionHighlight } from "./highlight/regionHighlight";

export const IMAGE_CODING_VIEW_TYPE = "image-coding-view";

export class ImageCodingView extends ItemView {
  private plugin: CodeMarkerImagePlugin;
  private fabricState: FabricCanvasState | null = null;
  private zoomPanCleanup: ZoomPanCleanup | null = null;
  private toolbarState: ToolbarState | null = null;
  private drawingState: RegionDrawingState | null = null;
  private regionManager: RegionManager | null = null;
  private codingMenu: CodingMenu | null = null;
  private regionLabels: RegionLabels | null = null;
  private regionHighlight: RegionHighlightState | null = null;
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
      const canvas = this.fabricState.canvas;

      // Region manager
      this.regionManager = new RegionManager(this.fabricState, this.plugin.model);
      this.regionManager.restoreMarkers(file.path);

      // Labels
      this.regionLabels = new RegionLabels(canvas, this.plugin.model, this.regionManager);
      this.regionLabels.rebuildAll(file.path);

      // Hover highlight
      this.regionHighlight = setupRegionHighlight(this.fabricState, this.regionManager);

      // Coding menu
      this.codingMenu = new CodingMenu(container, this.plugin.model, {
        onCodesChanged: (markerId) => {
          this.regionManager?.refreshStyle(markerId);
          this.regionLabels?.updateLabel(markerId);
        },
        onRegionDeleted: (markerId) => {
          const shape = this.regionManager?.getShapeForMarker(markerId);
          if (shape) {
            this.regionLabels?.removeLabel(markerId);
            this.regionManager?.deleteShape(shape);
            canvas.discardActiveObject();
          }
        },
      });

      // Region drawing
      this.drawingState = setupRegionDrawing(this.fabricState, {
        onShapeCreated: (shape) => {
          const marker = this.regionManager?.registerShape(shape, file.path);
          if (marker) {
            // Auto-open coding menu near the shape
            this.openMenuForMarker(marker.id);
          }
        },
        onShapeDeleted: (shape) => {
          const markerId = this.regionManager?.getMarkerIdForShape(shape);
          if (markerId) this.regionLabels?.removeLabel(markerId);
          this.regionManager?.deleteShape(shape);
        },
        onShapeModified: (shape) => {
          this.regionManager?.syncShapeToModel(shape);
          const markerId = this.regionManager?.getMarkerIdForShape(shape);
          if (markerId) this.regionLabels?.refreshForMarker(markerId);
        },
      });

      // Selection → open coding menu
      canvas.on("selection:created", (opt: any) => {
        this.onSelectionChange(opt);
      });
      canvas.on("selection:updated", (opt: any) => {
        this.onSelectionChange(opt);
      });
      canvas.on("selection:cleared", () => {
        this.codingMenu?.close();
      });

      // Toolbar
      this.toolbarState = createToolbar(contentEl, this.fabricState, {
        onDelete: () => {
          const active = canvas.getActiveObjects();
          if (active.length > 0) {
            active.forEach((obj) => {
              const mid = this.regionManager?.getMarkerIdForShape(obj);
              if (mid) this.regionLabels?.removeLabel(mid);
              this.regionManager?.deleteShape(obj);
            });
            canvas.discardActiveObject();
          }
        },
      });
      contentEl.insertBefore(this.toolbarState.el, container);

      this.toolbarState.onModeChange = (mode) => {
        this.codingMenu?.close();
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

  private onSelectionChange(opt: any): void {
    const selected = opt.selected;
    if (!selected || selected.length !== 1) {
      this.codingMenu?.close();
      return;
    }
    const shape = selected[0];
    const markerId = this.regionManager?.getMarkerIdForShape(shape);
    if (markerId) {
      this.openMenuForMarker(markerId);
    }
  }

  private openMenuForMarker(markerId: string): void {
    if (!this.regionManager || !this.fabricState) return;

    const shape = this.regionManager.getShapeForMarker(markerId);
    if (!shape) return;

    // Get shape center in screen coords (relative to container)
    const bound = shape.getBoundingRect();
    const x = bound.left + bound.width / 2;
    const y = bound.top + bound.height + 8;

    this.codingMenu?.open(markerId, x, y);
  }

  private cleanup(): void {
    this.codingMenu?.destroy();
    this.codingMenu = null;
    this.regionHighlight?.destroy();
    this.regionHighlight = null;
    this.regionLabels?.destroy();
    this.regionLabels = null;
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
