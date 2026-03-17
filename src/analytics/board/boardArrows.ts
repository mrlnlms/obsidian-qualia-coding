
import { Canvas, Line, Triangle, type FabricObject } from "fabric";
import { type ArrowLineNode, type ArrowHeadNode, isArrowLineNode, isArrowHeadNode, isBoardNode } from "./boardTypes";

export interface ArrowData {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  color: string;
  label: string;
}

let arrowIdCounter = 0;

export function nextArrowId(): string {
  return `arrow-${Date.now()}-${arrowIdCounter++}`;
}

function getNodeCenter(obj: FabricObject): { x: number; y: number } {
  // Use getCenterPoint() which returns coordinates in canvas space (not viewport)
  const center = obj.getCenterPoint();
  return { x: center.x, y: center.y };
}

/**
 * Find any board node (sticky, snapshot, excerpt, codeCard, kpiCard) by boardId.
 */
function findNodeById(canvas: Canvas, nodeId: string): FabricObject | undefined {
  return canvas.getObjects().find((o) => {
    if (!isBoardNode(o)) return false;
    const t = o.boardType;
    return (
      o.boardId === nodeId &&
      (t === "sticky" || t === "snapshot" || t === "excerpt" || t === "codeCard" || t === "kpiCard")
    );
  });
}

export function createArrow(
  canvas: Canvas,
  fromObj: FabricObject,
  toObj: FabricObject,
  data: ArrowData,
): { line: Line; head: Triangle } {
  const from = getNodeCenter(fromObj);
  const to = getNodeCenter(toObj);
  const color = data.color || "#888";

  const line = new Line([from.x, from.y, to.x, to.y], {
    stroke: color,
    strokeWidth: 2,
    selectable: true,
    evented: true,
    hasBorders: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
  });

  const lineNode = line as unknown as ArrowLineNode;
  lineNode.boardType = "arrow-line";
  lineNode.boardId = data.id;
  lineNode.boardFromId = data.fromNodeId;
  lineNode.boardToId = data.toNodeId;
  lineNode.boardColor = color;
  lineNode.boardLabel = data.label;

  // Arrow head
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
  const head = new Triangle({
    left: to.x,
    top: to.y,
    width: 12,
    height: 12,
    fill: color,
    angle: angle + 90,
    originX: "center",
    originY: "center",
    selectable: false,
    evented: false,
    hasBorders: false,
    hasControls: false,
  });

  const headNode = head as unknown as ArrowHeadNode;
  headNode.boardType = "arrow-head";
  headNode.boardId = data.id;

  canvas.add(line);
  canvas.add(head);
  canvas.sendObjectToBack(head);
  canvas.sendObjectToBack(line);
  canvas.requestRenderAll();
  return { line, head };
}

export function updateArrowForNodes(canvas: Canvas): void {
  const objects = canvas.getObjects();

  // Collect all arrow lines
  const arrowLines: ArrowLineNode[] = [];
  const arrowHeads = new Map<string, FabricObject>(); // id -> head

  for (const obj of objects) {
    if (isArrowLineNode(obj)) arrowLines.push(obj);
    if (isArrowHeadNode(obj)) arrowHeads.set(obj.boardId, obj);
  }

  for (const lineObj of arrowLines) {
    const fromId = lineObj.boardFromId;
    const toId = lineObj.boardToId;
    const fromNode = findNodeById(canvas, fromId);
    const toNode = findNodeById(canvas, toId);
    if (!fromNode || !toNode) continue;

    const from = getNodeCenter(fromNode);
    const to = getNodeCenter(toNode);

    // Update line endpoints
    (lineObj as Line).set({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    lineObj.setCoords();

    // Update head position and angle
    const headObj = arrowHeads.get(lineObj.boardId);
    if (headObj) {
      const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
      headObj.set({ left: to.x, top: to.y, angle: angle + 90 });
      headObj.setCoords();
    }
  }

  canvas.requestRenderAll();
}

export function getArrowData(obj: FabricObject): ArrowData | null {
  if (!isArrowLineNode(obj)) return null;
  return {
    id: obj.boardId,
    fromNodeId: obj.boardFromId,
    toNodeId: obj.boardToId,
    color: obj.boardColor || "#888",
    label: obj.boardLabel || "",
  };
}

export function isArrow(obj: FabricObject): boolean {
  const t = obj.boardType;
  return t === "arrow-line" || t === "arrow-head";
}

export function isArrowLine(obj: FabricObject): boolean {
  return obj.boardType === "arrow-line";
}

/** Remove an arrow (both line and head) by arrow ID */
export function removeArrowById(canvas: Canvas, arrowId: string): void {
  const toRemove = canvas.getObjects().filter((o) => {
    if (!isArrow(o)) return false;
    if (isArrowLineNode(o)) return o.boardId === arrowId;
    if (isArrowHeadNode(o)) return o.boardId === arrowId;
    return false;
  });
  for (const obj of toRemove) {
    canvas.remove(obj);
  }
}
