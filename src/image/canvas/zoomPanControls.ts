import { Point } from "fabric";
import { FabricCanvasState, fitToContainer, getZoom } from "../canvas/fabricCanvas";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const ZOOM_FACTOR = 1.08;

export interface ZoomPanCleanup {
  destroy(): void;
}

export interface ZoomPanCallbacks {
  onViewChanged?: () => void;
}

export function setupZoomPanControls(state: FabricCanvasState, callbacks?: ZoomPanCallbacks): ZoomPanCleanup {
  const { canvas, container } = state;
  let isPanning = false;
  let lastPanX = 0;
  let lastPanY = 0;
  let spaceDown = false;

  // --- Wheel zoom (centered on cursor) ---
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY;
    const factor = delta < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    let newZoom = getZoom(state) * factor;
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

    const rect = container.getBoundingClientRect();
    const point = new Point(e.clientX - rect.left, e.clientY - rect.top);
    canvas.zoomToPoint(point, newZoom);
    canvas.requestRenderAll();
    callbacks?.onViewChanged?.();
  };

  // --- Space+drag / middle-mouse pan ---
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" && !e.repeat) {
      spaceDown = true;
      container.style.cursor = "grab";
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      spaceDown = false;
      if (!isPanning) {
        container.style.cursor = "";
      }
    }
  };

  const onMouseDown = (e: MouseEvent) => {
    // Space+left-click or middle-mouse
    if ((spaceDown && e.button === 0) || e.button === 1) {
      isPanning = true;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      container.style.cursor = "grabbing";
      e.preventDefault();
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isPanning) return;

    const dx = e.clientX - lastPanX;
    const dy = e.clientY - lastPanY;
    lastPanX = e.clientX;
    lastPanY = e.clientY;

    const vt = canvas.viewportTransform;
    vt[4] += dx;
    vt[5] += dy;
    canvas.requestRenderAll();
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!isPanning) return;
    if ((e.button === 0 && !spaceDown) || e.button === 1 || e.button === 0) {
      isPanning = false;
      container.style.cursor = spaceDown ? "grab" : "";
      callbacks?.onViewChanged?.();
    }
  };

  // Attach to container's upper canvas (Fabric renders to it)
  const upperCanvas = canvas.upperCanvasEl;
  upperCanvas.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    destroy() {
      upperCanvas.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
