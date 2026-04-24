import type { Canvas } from "fabric";

export interface BBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const EXPORT_PADDING = 40;

export function getBoardBoundingBox(canvas: Canvas): BBox | null {
  const objects = canvas.getObjects();
  if (objects.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const br = obj.getBoundingRect();
    if (br.left < minX) minX = br.left;
    if (br.top < minY) minY = br.top;
    if (br.left + br.width > maxX) maxX = br.left + br.width;
    if (br.top + br.height > maxY) maxY = br.top + br.height;
  }

  return {
    left: minX - EXPORT_PADDING,
    top: minY - EXPORT_PADDING,
    width: (maxX - minX) + EXPORT_PADDING * 2,
    height: (maxY - minY) + EXPORT_PADDING * 2,
  };
}

export function buildExportFilename(format: "svg" | "png", now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `qualia-board-${yyyy}-${mm}-${dd}.${format}`;
}
