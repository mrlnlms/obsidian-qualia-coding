
import { Canvas, PencilBrush, type FabricObject, Path } from "fabric";
import type { PathNode } from "./boardTypes";

export interface FreePathData {
  id: string;
  path: string;
  color: string;
  width: number;
}

let pathIdCounter = 0;

export function nextPathId(): string {
  return `path-${Date.now()}-${pathIdCounter++}`;
}

export function enableDrawingMode(canvas: Canvas, color: string, width: number): void {
  canvas.isDrawingMode = true;
  const brush = new PencilBrush(canvas);
  brush.color = color;
  brush.width = width;
  canvas.freeDrawingBrush = brush;
}

export function disableDrawingMode(canvas: Canvas): void {
  canvas.isDrawingMode = false;
}

export function tagNewPaths(canvas: Canvas): void {
  for (const obj of canvas.getObjects()) {
    if (obj instanceof Path && !obj.boardType) {
      const node = obj as unknown as PathNode;
      node.boardType = "path";
      node.boardId = nextPathId();
    }
  }
}

export function getPathData(obj: FabricObject): FreePathData | null {
  if (obj.boardType !== "path") return null;
  if (!(obj instanceof Path)) return null;
  const node = obj as unknown as PathNode;
  const pathStr = node.path
    ? JSON.stringify(node.path)
    : "";
  return {
    id: node.boardId,
    path: pathStr,
    color: (obj.stroke as string) ?? "#333",
    width: obj.strokeWidth ?? 2,
  };
}

export function isFreePath(obj: FabricObject): boolean {
  return obj.boardType === "path";
}
