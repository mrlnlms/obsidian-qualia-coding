import { Canvas, Point } from "fabric";

export interface BoardCanvasState {
  canvas: Canvas;
  container: HTMLElement;
  resizeObserver: ResizeObserver;
}

export function setupBoardCanvas(container: HTMLElement): BoardCanvasState {
  const canvasEl = document.createElement("canvas");
  container.appendChild(canvasEl);

  const cw = container.clientWidth || 800;
  const ch = container.clientHeight || 600;

  const canvas = new Canvas(canvasEl, {
    width: cw,
    height: ch,
    selection: true,
    backgroundColor: "transparent",
    preserveObjectStacking: true,
  });

  const state: BoardCanvasState = {
    canvas,
    container,
    resizeObserver: null!,
  };

  // ── Pan: middle-click drag OR space+drag ──
  let isPanning = false;
  let lastPanX = 0;
  let lastPanY = 0;
  let spaceHeld = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" && !spaceHeld) {
      spaceHeld = true;
      canvas.defaultCursor = "grab";
      canvas.selection = false;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      spaceHeld = false;
      if (!isPanning) {
        canvas.defaultCursor = "default";
        canvas.selection = true;
      }
    }
  };
  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("keyup", onKeyUp);
  // Make container focusable for keyboard events
  container.tabIndex = 0;

  canvas.on("mouse:down", (opt) => {
    const e = opt.e as MouseEvent;
    if (e.button === 1 || spaceHeld) {
      isPanning = true;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      canvas.defaultCursor = "grabbing";
      canvas.selection = false;
      e.preventDefault();
    }
  });

  canvas.on("mouse:move", (opt) => {
    if (!isPanning) return;
    const e = opt.e as MouseEvent;
    const vt = canvas.viewportTransform!;
    vt[4] += e.clientX - lastPanX;
    vt[5] += e.clientY - lastPanY;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    canvas.requestRenderAll();
  });

  canvas.on("mouse:up", () => {
    if (isPanning) {
      isPanning = false;
      if (!spaceHeld) {
        canvas.defaultCursor = "default";
        canvas.selection = true;
      }
    }
  });

  // ── Zoom: ctrl+scroll ──
  canvas.on("mouse:wheel", (opt) => {
    const e = opt.e as WheelEvent;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    zoom = Math.max(0.1, Math.min(5, zoom));

    const point = new Point(e.offsetX, e.offsetY);
    canvas.zoomToPoint(point, zoom);
    canvas.requestRenderAll();
  });

  // ── Resize observer ──
  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.setDimensions({ width: w, height: h });
    canvas.requestRenderAll();
  });
  resizeObserver.observe(container);
  state.resizeObserver = resizeObserver;

  // Draw grid dots
  drawGridDots(canvas);
  canvas.on("after:render", () => drawGridDots(canvas));

  return state;
}

function drawGridDots(canvas: Canvas): void {
  const ctx = canvas.getContext();
  const vt = canvas.viewportTransform!;
  const zoom = canvas.getZoom();
  const w = canvas.getWidth();
  const h = canvas.getHeight();

  const gridSize = 30;
  const dotRadius = 0.8;

  // Calculate visible area in canvas coords
  const left = -vt[4] / zoom;
  const top = -vt[5] / zoom;
  const right = left + w / zoom;
  const bottom = top + h / zoom;

  const startX = Math.floor(left / gridSize) * gridSize;
  const startY = Math.floor(top / gridSize) * gridSize;

  const isDark = document.body.classList.contains("theme-dark");
  ctx.fillStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  for (let x = startX; x <= right; x += gridSize) {
    for (let y = startY; y <= bottom; y += gridSize) {
      const sx = x * zoom + vt[4];
      const sy = y * zoom + vt[5];
      ctx.beginPath();
      ctx.arc(sx, sy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function getZoom(state: BoardCanvasState): number {
  return state.canvas.getZoom();
}

export function zoomTo(state: BoardCanvasState, zoom: number): void {
  const { canvas, container } = state;
  const center = new Point(container.clientWidth / 2, container.clientHeight / 2);
  const clamped = Math.max(0.1, Math.min(5, zoom));
  canvas.zoomToPoint(center, clamped);
  canvas.requestRenderAll();
}

export function zoomBy(state: BoardCanvasState, factor: number): void {
  zoomTo(state, getZoom(state) * factor);
}

export function fitContent(state: BoardCanvasState): void {
  const { canvas, container } = state;
  const objects = canvas.getObjects();
  if (objects.length === 0) {
    // Reset to center
    const vt = canvas.viewportTransform!;
    vt[4] = 0;
    vt[5] = 0;
    canvas.setZoom(1);
    canvas.requestRenderAll();
    return;
  }

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const br = obj.getBoundingRect();
    if (br.left < minX) minX = br.left;
    if (br.top < minY) minY = br.top;
    if (br.left + br.width > maxX) maxX = br.left + br.width;
    if (br.top + br.height > maxY) maxY = br.top + br.height;
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const pad = 40;

  const zoom = Math.min(
    (cw - pad * 2) / contentW,
    (ch - pad * 2) / contentH,
    2,
  );

  canvas.setZoom(zoom);
  const vt = canvas.viewportTransform!;
  vt[4] = -(minX * zoom) + (cw - contentW * zoom) / 2;
  vt[5] = -(minY * zoom) + (ch - contentH * zoom) / 2;
  canvas.requestRenderAll();
}

export function teardownBoardCanvas(state: BoardCanvasState | null): void {
  if (!state) return;
  state.resizeObserver.disconnect();
  state.canvas.dispose();
}
