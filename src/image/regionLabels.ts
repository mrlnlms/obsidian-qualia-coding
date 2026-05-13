/**
 * RegionLabels — renders code name labels on top of region shapes.
 *
 * Each region gets a small FabricText showing its code names (comma-separated).
 * Labels are non-interactive and follow the region's position.
 */

import { FabricText, FabricObject, Canvas } from "fabric";
import type { RegionManager } from "./canvas/regionManager";
import type { ImageCodingModel } from "./imageCodingModel";
import { getCodeIds } from "../core/codeApplicationHelpers";

/** Check if a Fabric object is a Qualia label (non-interactive text overlay). */
export function isQualiaLabel(obj: FabricObject): boolean {
  return '_qlabel' in obj;
}

export class RegionLabels {
  private canvas: Canvas;
  private model: ImageCodingModel;
  private regionManager: RegionManager;
  private labels: Map<string, FabricText> = new Map(); // markerId → label
  private refreshAllRafId: number | null = null;

  constructor(canvas: Canvas, model: ImageCodingModel, regionManager: RegionManager) {
    this.canvas = canvas;
    this.model = model;
    this.regionManager = regionManager;
  }

  /** Update or create label for a marker */
  updateLabel(markerId: string): void {
    const marker = this.model.findMarkerById(markerId);
    const shape = this.regionManager.getShapeForMarker(markerId);
    if (!marker || !shape) {
      this.removeLabel(markerId);
      return;
    }

    if (marker.codes.length === 0) {
      this.removeLabel(markerId);
      return;
    }

    const text = marker.codes.map(c => this.model.registry.getById(c.codeId)?.name ?? c.codeId).join(", ");
    // Mirror regionManager.getStyleForMarker:
    //  1) per-marker override wins over per-code blending,
    //  2) otherwise blend only over codes currently visible in this file,
    //  3) fallback mid gray works on both themes (Fabric can't consume CSS vars).
    let color: string | null | undefined = marker.colorOverride;
    if (!color) {
      const visibleIds = getCodeIds(marker.codes).filter(
        codeId => this.model.registry.isCodeVisibleInFile(codeId, marker.fileId),
      );
      color = this.model.registry.getColorForCodeIds(visibleIds);
    }
    const finalColor = color || "#888";

    let label = this.labels.get(markerId);
    if (label) {
      label.set({ text, fill: finalColor });
    } else {
      label = new FabricText(text, {
        fontSize: 12,
        fill: finalColor,
        fontWeight: "bold",
        fontFamily: "sans-serif",
        backgroundColor: "rgba(255,255,255,0.85)",
        padding: 3,
        selectable: false,
        evented: false,
      });
      (label as any)._qlabel = true;
      this.canvas.add(label);
      this.labels.set(markerId, label);
    }

    // Position label at top-left of shape
    this.positionLabel(label, shape);
    this.canvas.requestRenderAll();
  }

  /**
   * Reposition all labels (e.g. after shape move).
   * Coalesced via rAF: many calls in a single pan/zoom tick collapse to one paint.
   */
  refreshAll(): void {
    if (this.refreshAllRafId !== null) return;
    this.refreshAllRafId = requestAnimationFrame(() => {
      this.refreshAllRafId = null;
      for (const [markerId, label] of this.labels) {
        const shape = this.regionManager.getShapeForMarker(markerId);
        if (!shape) {
          this.removeLabel(markerId);
          continue;
        }
        this.positionLabel(label, shape);
      }
      this.canvas.requestRenderAll();
    });
  }

  /** Update a specific label after shape was moved/resized */
  refreshForMarker(markerId: string): void {
    const label = this.labels.get(markerId);
    const shape = this.regionManager.getShapeForMarker(markerId);
    if (label && shape) {
      this.positionLabel(label, shape);
      this.canvas.requestRenderAll();
    }
  }

  removeLabel(markerId: string): void {
    const label = this.labels.get(markerId);
    if (label) {
      this.canvas.remove(label);
      this.labels.delete(markerId);
    }
  }

  /** Rebuild all labels from model state */
  rebuildAll(fileId: string): void {
    this.clearAll();
    const markers = this.model.getMarkersForFile(fileId);
    for (const marker of markers) {
      if (marker.codes.length > 0) {
        this.updateLabel(marker.id);
      }
    }
  }

  clearAll(): void {
    for (const label of this.labels.values()) {
      this.canvas.remove(label);
    }
    this.labels.clear();
  }

  private positionLabel(label: FabricText, shape: FabricObject): void {
    const bound = shape.getBoundingRect();
    const vt = this.canvas.viewportTransform;
    // Convert screen-space bounding rect back to canvas coords
    const left = (bound.left - vt[4]) / vt[0];
    const top = (bound.top - vt[5]) / vt[3];
    label.set({ left, top: top - 18 });
  }

  /** Show or hide the label for a marker (used by visibility toggle). */
  setLabelVisible(markerId: string, visible: boolean): void {
    const label = this.labels.get(markerId);
    if (label) {
      label.set({ visible });
    }
  }

  destroy(): void {
    if (this.refreshAllRafId !== null) {
      cancelAnimationFrame(this.refreshAllRafId);
      this.refreshAllRafId = null;
    }
    this.clearAll();
  }
}
