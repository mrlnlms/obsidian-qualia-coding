/**
 * RegionHighlight — hover glow effect on regions.
 *
 * When the mouse hovers over a region shape in select mode:
 * - Stroke becomes thicker and brighter
 * - Fill opacity increases
 * - Cursor changes to pointer
 *
 * Also handles programmatic highlight (e.g. from sidebar navigation).
 */

import { FabricObject, Canvas, Shadow } from "fabric";
import type { FabricCanvasState } from "../canvas/fabricCanvas";
import type { RegionManager } from "../coding/regionManager";

const HOVER_SHADOW_COLOR = "rgba(59, 130, 246, 0.6)";
const HOVER_SHADOW_BLUR = 12;

export interface RegionHighlightState {
  /** Programmatically highlight a marker (e.g. from sidebar) */
  highlightMarker(markerId: string): void;
  /** Clear programmatic highlight */
  clearHighlight(): void;
  destroy(): void;
}

export function setupRegionHighlight(
  fabricState: FabricCanvasState,
  regionManager: RegionManager
): RegionHighlightState {
  const { canvas } = fabricState;
  let hoveredShape: FabricObject | null = null;
  let highlightedShape: FabricObject | null = null;

  // Store original values to restore on mouse out
  let origStrokeWidth: number = 0;
  let origShadow: Shadow | string | null = null;

  function applyHoverEffect(shape: FabricObject): void {
    origStrokeWidth = (shape.strokeWidth ?? 2);
    origShadow = shape.shadow;

    shape.set({
      strokeWidth: origStrokeWidth + 2,
      shadow: new Shadow({
        color: HOVER_SHADOW_COLOR,
        blur: HOVER_SHADOW_BLUR,
        offsetX: 0,
        offsetY: 0,
      }),
    });
    canvas.requestRenderAll();
  }

  function removeHoverEffect(shape: FabricObject): void {
    shape.set({
      strokeWidth: origStrokeWidth,
      shadow: origShadow ?? null,
    });
    canvas.requestRenderAll();
  }

  function onMouseOver(opt: any): void {
    const target = opt.target as FabricObject | undefined;
    if (!target) return;
    // Only highlight tracked shapes (regions)
    if (!regionManager.getMarkerIdForShape(target)) return;

    if (hoveredShape && hoveredShape !== target) {
      removeHoverEffect(hoveredShape);
    }
    hoveredShape = target;
    applyHoverEffect(target);
  }

  function onMouseOut(opt: any): void {
    const target = opt.target as FabricObject | undefined;
    if (target && target === hoveredShape) {
      removeHoverEffect(target);
      hoveredShape = null;
    }
  }

  canvas.on("mouse:over", onMouseOver);
  canvas.on("mouse:out", onMouseOut);

  function highlightMarker(markerId: string): void {
    clearHighlight();
    const shape = regionManager.getShapeForMarker(markerId);
    if (!shape) return;
    highlightedShape = shape;
    applyHoverEffect(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
  }

  function clearHighlight(): void {
    if (highlightedShape) {
      removeHoverEffect(highlightedShape);
      highlightedShape = null;
    }
  }

  return {
    highlightMarker,
    clearHighlight,
    destroy() {
      canvas.off("mouse:over", onMouseOver);
      canvas.off("mouse:out", onMouseOut);
      if (hoveredShape) removeHoverEffect(hoveredShape);
      if (highlightedShape) removeHoverEffect(highlightedShape);
    },
  };
}
