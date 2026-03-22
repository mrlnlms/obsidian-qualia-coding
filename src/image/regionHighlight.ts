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
import type { FabricCanvasState } from "./canvas/fabricCanvas";
import type { RegionManager } from "./canvas/regionManager";
import type { ImageCodingModel } from "./imageCodingModel";

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
  regionManager: RegionManager,
  model: ImageCodingModel,
): RegionHighlightState {
  const { canvas } = fabricState;
  let hoveredShape: FabricObject | null = null;
  let highlightedShape: FabricObject | null = null;
  // Guard to avoid feedback loop: canvas hover → model → canvas
  let suppressModelHover = false;

  // Store original values per shape to avoid corruption on concurrent hover
  const origValues = new WeakMap<FabricObject, { strokeWidth: number; shadow: Shadow | string | null }>();

  function applyHoverEffect(shape: FabricObject): void {
    if (!origValues.has(shape)) {
      origValues.set(shape, {
        strokeWidth: shape.strokeWidth ?? 2,
        shadow: shape.shadow,
      });
    }
    const orig = origValues.get(shape)!;

    shape.set({
      strokeWidth: orig.strokeWidth + 2,
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
    const orig = origValues.get(shape);
    if (!orig) return;
    shape.set({
      strokeWidth: orig.strokeWidth,
      shadow: orig.shadow ?? null,
    });
    origValues.delete(shape);
    canvas.requestRenderAll();
  }

  // ── Canvas hover → model (sidebar sees .is-hovered) ──

  function onMouseOver(opt: any): void {
    const target = opt.target as FabricObject | undefined;
    if (!target) return;
    const markerId = regionManager.getMarkerIdForShape(target);
    if (!markerId) return;

    if (hoveredShape && hoveredShape !== target) {
      removeHoverEffect(hoveredShape);
    }
    hoveredShape = target;
    applyHoverEffect(target);

    // Notify model so sidebar items highlight
    suppressModelHover = true;
    const marker = model.findMarkerById(markerId);
    const firstCodeId = marker?.codes[0]?.codeId;
    const firstCodeName = firstCodeId ? (model.registry.getById(firstCodeId)?.name ?? null) : null;
    model.setHoverState(markerId, firstCodeName);
    suppressModelHover = false;
  }

  function onMouseOut(opt: any): void {
    const target = opt.target as FabricObject | undefined;
    if (target && target === hoveredShape) {
      removeHoverEffect(target);
      hoveredShape = null;

      // Clear model hover
      suppressModelHover = true;
      model.setHoverState(null, null);
      suppressModelHover = false;
    }
  }

  canvas.on("mouse:over", onMouseOver);
  canvas.on("mouse:out", onMouseOut);

  // ── Sidebar hover → canvas glow ──

  function onModelHoverChange(markerId: string | null, _codeName: string | null): void {
    if (suppressModelHover) return;

    // Clear previous highlight from sidebar hover
    if (highlightedShape) {
      removeHoverEffect(highlightedShape);
      highlightedShape = null;
    }

    if (!markerId) return;
    const shape = regionManager.getShapeForMarker(markerId);
    if (!shape || shape === hoveredShape) return;
    highlightedShape = shape;
    applyHoverEffect(shape);
  }

  model.onHoverChange(onModelHoverChange);

  // ── Programmatic highlight (sidebar click → navigate) ──

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
      model.offHoverChange(onModelHoverChange);
      if (hoveredShape) removeHoverEffect(hoveredShape);
      if (highlightedShape) removeHoverEffect(highlightedShape);
    },
  };
}
