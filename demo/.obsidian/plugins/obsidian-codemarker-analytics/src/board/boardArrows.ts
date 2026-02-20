import { Canvas, Line, Triangle, Group, type FabricObject } from "fabric";

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
  const br = obj.getBoundingRect();
  return {
    x: br.left + br.width / 2,
    y: br.top + br.height / 2,
  };
}

export function createArrow(
  canvas: Canvas,
  fromObj: FabricObject,
  toObj: FabricObject,
  data: ArrowData,
): Group {
  const from = getNodeCenter(fromObj);
  const to = getNodeCenter(toObj);

  const { line, head } = buildArrowShapes(from, to, data.color);

  const group = new Group([line, head], {
    selectable: true,
    evented: true,
    hasBorders: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
  });

  (group as any).boardType = "arrow";
  (group as any).boardId = data.id;
  (group as any).boardFromId = data.fromNodeId;
  (group as any).boardToId = data.toNodeId;
  (group as any).boardColor = data.color;
  (group as any).boardLabel = data.label;

  canvas.add(group);
  canvas.sendObjectToBack(group);
  canvas.requestRenderAll();
  return group;
}

function buildArrowShapes(
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
): { line: Line; head: Triangle } {
  const line = new Line([from.x, from.y, to.x, to.y], {
    stroke: color || "#888",
    strokeWidth: 2,
    selectable: false,
    evented: false,
  });

  // Arrow head
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
  const headSize = 10;

  const head = new Triangle({
    left: to.x,
    top: to.y,
    width: headSize,
    height: headSize,
    fill: color || "#888",
    angle: angle + 90,
    originX: "center",
    originY: "center",
    selectable: false,
    evented: false,
  });

  return { line, head };
}

export function updateArrowForNodes(canvas: Canvas): void {
  const objects = canvas.getObjects();
  const nodeMap = new Map<string, FabricObject>();

  for (const obj of objects) {
    const id = (obj as any).boardId;
    if (id && (obj as any).boardType === "sticky") {
      nodeMap.set(id, obj);
    }
  }

  for (const obj of objects) {
    if ((obj as any).boardType !== "arrow") continue;
    const fromId = (obj as any).boardFromId as string;
    const toId = (obj as any).boardToId as string;
    const fromObj = nodeMap.get(fromId);
    const toObj = nodeMap.get(toId);
    if (!fromObj || !toObj) continue;

    const from = getNodeCenter(fromObj);
    const to = getNodeCenter(toObj);
    const color = (obj as any).boardColor || "#888";

    // Remove old arrow, create new
    canvas.remove(obj);
    const { line, head } = buildArrowShapes(from, to, color);

    const newGroup = new Group([line, head], {
      selectable: true,
      evented: true,
      hasBorders: false,
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
    });

    (newGroup as any).boardType = "arrow";
    (newGroup as any).boardId = (obj as any).boardId;
    (newGroup as any).boardFromId = fromId;
    (newGroup as any).boardToId = toId;
    (newGroup as any).boardColor = color;
    (newGroup as any).boardLabel = (obj as any).boardLabel;

    canvas.add(newGroup);
    canvas.sendObjectToBack(newGroup);
  }

  canvas.requestRenderAll();
}

export function getArrowData(group: Group): ArrowData | null {
  if ((group as any).boardType !== "arrow") return null;
  return {
    id: (group as any).boardId,
    fromNodeId: (group as any).boardFromId,
    toNodeId: (group as any).boardToId,
    color: (group as any).boardColor || "#888",
    label: (group as any).boardLabel || "",
  };
}

export function isArrow(obj: FabricObject): obj is Group {
  return (obj as any).boardType === "arrow";
}
