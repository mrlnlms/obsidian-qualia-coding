import { Canvas, FabricImage, Point } from "fabric";

export interface FabricCanvasState {
  canvas: Canvas;
  imageWidth: number;
  imageHeight: number;
  resizeObserver: ResizeObserver;
  container: HTMLElement;
}

/** Fit zoom so image fills container while maintaining aspect ratio */
export function fitToContainer(state: FabricCanvasState): void {
  const { canvas, container, imageWidth, imageHeight } = state;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (cw === 0 || ch === 0) return;

  // Resize canvas element to fill container
  canvas.setDimensions({ width: cw, height: ch });

  const zoom = Math.min(cw / imageWidth, ch / imageHeight);
  canvas.setZoom(zoom);

  // Center image in viewport
  const vpw = cw / zoom;
  const vph = ch / zoom;
  const panX = (vpw - imageWidth) / 2 * zoom;
  const panY = (vph - imageHeight) / 2 * zoom;

  const vt = canvas.viewportTransform!;
  vt[4] = panX;
  vt[5] = panY;

  canvas.requestRenderAll();
}

export function getZoom(state: FabricCanvasState): number {
  return state.canvas.getZoom();
}

export function zoomTo(state: FabricCanvasState, zoom: number): void {
  const { canvas, container } = state;
  const center = new Point(container.clientWidth / 2, container.clientHeight / 2);
  const clamped = Math.max(0.05, Math.min(20, zoom));
  canvas.zoomToPoint(center, clamped);
  canvas.requestRenderAll();
}

export function zoomBy(state: FabricCanvasState, factor: number): void {
  zoomTo(state, getZoom(state) * factor);
}

export async function setupFabricCanvas(
  container: HTMLElement,
  imageUrl: string
): Promise<FabricCanvasState> {
  // Load image to get natural dimensions
  const naturalDims = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageUrl;
    }
  );

  const imageWidth = naturalDims.width;
  const imageHeight = naturalDims.height;

  // Create canvas element — fills container
  const canvasEl = document.createElement("canvas");
  container.appendChild(canvasEl);

  const cw = container.clientWidth;
  const ch = container.clientHeight;

  const canvas = new Canvas(canvasEl, {
    width: cw,
    height: ch,
    selection: false,
  });

  // Load background image at 1:1 (zoom handles scaling)
  const fabricImg = await FabricImage.fromURL(imageUrl);
  fabricImg.scaleX = 1;
  fabricImg.scaleY = 1;
  canvas.backgroundImage = fabricImg;

  const state: FabricCanvasState = {
    canvas,
    imageWidth,
    imageHeight,
    container,
    resizeObserver: null!,
  };

  // Fit + center
  fitToContainer(state);

  // Resize observer — re-fit on container resize
  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.setDimensions({ width: w, height: h });
    canvas.requestRenderAll();
  });
  resizeObserver.observe(container);
  state.resizeObserver = resizeObserver;

  return state;
}

export function teardownFabricCanvas(state: FabricCanvasState | null): void {
  if (!state) return;
  state.resizeObserver.disconnect();
  state.canvas.dispose();
}
