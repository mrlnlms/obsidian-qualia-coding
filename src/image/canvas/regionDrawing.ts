import { Canvas, Rect, Ellipse, Polygon, Point, FabricObject } from "fabric";
import type { ToolMode } from "../toolbar/imageToolbar";
import type { FabricCanvasState } from "./fabricCanvas";

/** Default visual style for new regions (used before codes are assigned) */
const REGION_FILL = "rgba(59, 130, 246, 0.2)";
const REGION_STROKE = "rgba(59, 130, 246, 0.8)";
const REGION_STROKE_WIDTH = 2;

export interface RegionDrawingCallbacks {
  onShapeCreated?: (shape: FabricObject) => void;
  onShapeDeleted?: (shape: FabricObject) => void;
  onShapeModified?: (shape: FabricObject) => void;
}

export interface RegionDrawingState {
  setMode(mode: ToolMode): void;
  destroy(): void;
}

export function setupRegionDrawing(
  fabricState: FabricCanvasState,
  callbacks: RegionDrawingCallbacks = {}
): RegionDrawingState {
  const { canvas } = fabricState;
  let mode: ToolMode = "select";
  let isDrawing = false;

  // Rect / Ellipse drawing state
  let originX = 0;
  let originY = 0;
  let previewShape: FabricObject | null = null;

  // Freeform (polygon) drawing state
  let polyPoints: Point[] = [];
  let polyLines: FabricObject[] = [];
  let polyDots: FabricObject[] = [];

  function toCanvasCoords(canvas: Canvas, e: MouseEvent): Point {
    const rect = canvas.upperCanvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const vt = canvas.viewportTransform;
    return new Point(
      (x - vt[4]) / vt[0],
      (y - vt[5]) / vt[3]
    );
  }

  function removePreview(): void {
    if (previewShape) {
      canvas.remove(previewShape);
      previewShape = null;
    }
  }

  // ─── Mouse handlers for rect / ellipse ───

  function onMouseDown(opt: any): void {
    if (mode === "select" || mode === "freeform") return;
    if (opt.e?.button !== 0) return;

    const pointer = toCanvasCoords(canvas, opt.e);
    isDrawing = true;
    originX = pointer.x;
    originY = pointer.y;

    // Create a temporary preview shape (non-interactive)
    if (mode === "rect") {
      previewShape = new Rect({
        left: originX,
        top: originY,
        width: 0,
        height: 0,
        fill: REGION_FILL,
        stroke: REGION_STROKE,
        strokeWidth: REGION_STROKE_WIDTH,
        strokeUniform: true,
        selectable: false,
        evented: false,
      });
    } else if (mode === "ellipse") {
      previewShape = new Ellipse({
        left: originX,
        top: originY,
        rx: 0,
        ry: 0,
        fill: REGION_FILL,
        stroke: REGION_STROKE,
        strokeWidth: REGION_STROKE_WIDTH,
        strokeUniform: true,
        selectable: false,
        evented: false,
      });
    }

    if (previewShape) {
      canvas.add(previewShape);
      canvas.requestRenderAll();
    }
  }

  function onMouseMove(opt: any): void {
    if (!isDrawing || !previewShape) return;

    const pointer = toCanvasCoords(canvas, opt.e);

    if (mode === "rect") {
      const left = Math.min(originX, pointer.x);
      const top = Math.min(originY, pointer.y);
      const width = Math.abs(pointer.x - originX);
      const height = Math.abs(pointer.y - originY);
      previewShape.set({ left, top, width, height });
    } else if (mode === "ellipse") {
      const left = Math.min(originX, pointer.x);
      const top = Math.min(originY, pointer.y);
      const rx = Math.abs(pointer.x - originX) / 2;
      const ry = Math.abs(pointer.y - originY) / 2;
      (previewShape as Ellipse).set({ left, top, rx, ry });
    }

    canvas.requestRenderAll();
  }

  function onMouseUp(_opt: any): void {
    if (!isDrawing || !previewShape) return;
    isDrawing = false;

    // Read final geometry from preview
    const left = previewShape.left ?? 0;
    const top = previewShape.top ?? 0;

    let finalShape: FabricObject | null = null;

    if (mode === "rect") {
      const w = (previewShape as Rect).width ?? 0;
      const h = (previewShape as Rect).height ?? 0;
      if (w < 3 && h < 3) { removePreview(); return; }

      finalShape = new Rect({
        left, top, width: w, height: h,
        fill: REGION_FILL,
        stroke: REGION_STROKE,
        strokeWidth: REGION_STROKE_WIDTH,
        strokeUniform: true,
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
      });
    } else if (mode === "ellipse") {
      const rx = (previewShape as Ellipse).rx ?? 0;
      const ry = (previewShape as Ellipse).ry ?? 0;
      if (rx < 2 && ry < 2) { removePreview(); return; }

      finalShape = new Ellipse({
        left, top, rx, ry,
        fill: REGION_FILL,
        stroke: REGION_STROKE,
        strokeWidth: REGION_STROKE_WIDTH,
        strokeUniform: true,
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
      });
    }

    // Remove preview, add final
    removePreview();

    if (finalShape) {
      canvas.add(finalShape);
      canvas.setActiveObject(finalShape);
      canvas.requestRenderAll();
      callbacks.onShapeCreated?.(finalShape);
    }
  }

  // ─── Freeform polygon handlers ───

  function clearPolyPreview(): void {
    polyLines.forEach((l) => canvas.remove(l));
    polyDots.forEach((d) => canvas.remove(d));
    polyLines = [];
    polyDots = [];
  }

  function addPolyDot(pt: Point): void {
    const dot = new Rect({
      left: pt.x - 4,
      top: pt.y - 4,
      width: 8,
      height: 8,
      fill: REGION_STROKE,
      selectable: false,
      evented: false,
    });
    canvas.add(dot);
    polyDots.push(dot);
  }

  function addPolyLine(from: Point, to: Point): void {
    const line = new Polygon([from, to], {
      fill: "transparent",
      stroke: REGION_STROKE,
      strokeWidth: 2,
      strokeUniform: true,
      selectable: false,
      evented: false,
    });
    canvas.add(line);
    polyLines.push(line);
  }

  function finalizePoly(): void {
    if (polyPoints.length < 3) {
      clearPolyPreview();
      polyPoints = [];
      return;
    }

    clearPolyPreview();

    const polygon = new Polygon(
      polyPoints.map((p) => new Point(p.x, p.y)),
      {
        fill: REGION_FILL,
        stroke: REGION_STROKE,
        strokeWidth: REGION_STROKE_WIDTH,
        strokeUniform: true,
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
      }
    );
    canvas.add(polygon);
    canvas.setActiveObject(polygon);
    canvas.requestRenderAll();
    callbacks.onShapeCreated?.(polygon);
    polyPoints = [];
  }

  function onCanvasClick(opt: any): void {
    if (mode !== "freeform") return;
    if (opt.e?.button !== 0) return;

    const pointer = toCanvasCoords(canvas, opt.e);

    // Close polygon: click near first point
    if (polyPoints.length >= 3) {
      const first = polyPoints[0]!;
      const dist = Math.sqrt(
        Math.pow(pointer.x - first.x, 2) + Math.pow(pointer.y - first.y, 2)
      );
      const zoom = canvas.getZoom();
      if (dist < 15 / zoom) {
        finalizePoly();
        return;
      }
    }

    // Add point
    if (polyPoints.length > 0) {
      const prev = polyPoints[polyPoints.length - 1]!;
      addPolyLine(prev, pointer);
    }
    polyPoints.push(new Point(pointer.x, pointer.y));
    addPolyDot(pointer);
    canvas.requestRenderAll();
  }

  function onDblClick(opt: any): void {
    if (mode !== "freeform") return;
    finalizePoly();
  }

  // ─── Wire up Fabric events ───

  // Sync move/resize back to model
  function onObjectModified(opt: any): void {
    const target = opt.target as FabricObject | undefined;
    if (target) callbacks.onShapeModified?.(target);
  }

  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);
  canvas.on("mouse:down", onCanvasClick);
  canvas.on("mouse:dblclick", onDblClick);
  canvas.on("object:modified", onObjectModified);

  function setMode(newMode: ToolMode): void {
    // Cancel any in-progress drawing
    if (isDrawing) {
      isDrawing = false;
      removePreview();
    }
    if (mode === "freeform" && newMode !== "freeform" && polyPoints.length > 0) {
      finalizePoly();
    }

    mode = newMode;

    // In select mode, objects are interactive
    canvas.forEachObject((obj) => {
      obj.selectable = newMode === "select";
      obj.evented = newMode === "select";
    });

    if (newMode === "select") {
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
    } else {
      canvas.defaultCursor = "crosshair";
      canvas.hoverCursor = "crosshair";
    }

    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }

  // Start in select mode
  setMode("select");

  return {
    setMode,
    destroy() {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      canvas.off("mouse:down", onCanvasClick);
      canvas.off("mouse:dblclick", onDblClick);
      canvas.off("object:modified", onObjectModified);
      removePreview();
      clearPolyPreview();
    },
  };
}
