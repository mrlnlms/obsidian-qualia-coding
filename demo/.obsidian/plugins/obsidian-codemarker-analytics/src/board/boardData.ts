import { Canvas, Path } from "fabric";
import type { StickyNoteData } from "./boardNodes";
import type { ArrowData } from "./boardArrows";
import type { FreePathData } from "./boardDrawing";
import { getStickyData, isStickyNote } from "./boardNodes";
import { getArrowData, isArrow } from "./boardArrows";
import { getPathData, isFreePath } from "./boardDrawing";

export interface BoardFileData {
  version: 1;
  nodes: StickyNoteData[];
  arrows: ArrowData[];
  paths: FreePathData[];
  viewport: { zoom: number; panX: number; panY: number };
}

export function emptyBoardData(): BoardFileData {
  return {
    version: 1,
    nodes: [],
    arrows: [],
    paths: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
  };
}

export function serializeBoard(canvas: Canvas): BoardFileData {
  const nodes: StickyNoteData[] = [];
  const arrows: ArrowData[] = [];
  const paths: FreePathData[] = [];

  for (const obj of canvas.getObjects()) {
    if (isStickyNote(obj)) {
      const d = getStickyData(obj);
      if (d) nodes.push(d);
    } else if (isArrow(obj)) {
      const d = getArrowData(obj);
      if (d) arrows.push(d);
    } else if (isFreePath(obj)) {
      const d = getPathData(obj);
      if (d) paths.push(d);
    }
  }

  const vt = canvas.viewportTransform!;
  return {
    version: 1,
    nodes,
    arrows,
    paths,
    viewport: {
      zoom: canvas.getZoom(),
      panX: vt[4],
      panY: vt[5],
    },
  };
}

export function deserializeBoard(
  canvas: Canvas,
  data: BoardFileData,
  createStickyFn: (data: StickyNoteData) => void,
  createArrowFn: (data: ArrowData) => void,
): void {
  // Clear canvas
  canvas.clear();

  // Restore nodes
  for (const node of data.nodes) {
    createStickyFn(node);
  }

  // Restore arrows (need nodes to exist first)
  for (const arrow of data.arrows) {
    createArrowFn(arrow);
  }

  // Restore freeform paths
  for (const pathData of data.paths) {
    try {
      const pathArray = JSON.parse(pathData.path);
      const pathObj = new Path(pathArray, {
        stroke: pathData.color,
        strokeWidth: pathData.width,
        fill: "",
        selectable: true,
      });
      (pathObj as any).boardType = "path";
      (pathObj as any).boardId = pathData.id;
      canvas.add(pathObj);
    } catch {
      // Skip invalid paths
    }
  }

  // Restore viewport
  if (data.viewport) {
    canvas.setZoom(data.viewport.zoom);
    const vt = canvas.viewportTransform!;
    vt[4] = data.viewport.panX;
    vt[5] = data.viewport.panY;
  }

  canvas.requestRenderAll();
}
