
import { Canvas, Rect, Textbox, Group, Shadow, FabricImage, type FabricObject } from "fabric";
import type { SnapshotNode } from "../boardTypes";
import { themeColor, createCardBg, createCardText, assignNodeProps, finalizeNode } from "../boardNodeHelpers";

export interface SnapshotNodeData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  dataUrl: string;
  viewMode: string;
  createdAt: number;
}

let snapshotIdCounter = 0;

export function nextSnapshotId(): string {
  return `snap-${Date.now()}-${snapshotIdCounter++}`;
}

export async function createSnapshotNode(canvas: Canvas, data: SnapshotNodeData): Promise<Group> {
  const titleBarH = 24;
  const padding = 4;
  const totalH = data.height + titleBarH + padding * 2;
  const totalW = data.width + padding * 2;

  const bg = createCardBg({
    width: totalW,
    height: totalH,
    fill: themeColor("#2a2a2e", "#ffffff"),
    shadowBlur: 8,
    shadowColor: "rgba(0,0,0,0.2)",
    shadowOffsetX: 2,
    shadowOffsetY: 2,
  });

  const title = createCardText({
    text: data.title,
    width: totalW - 12,
    left: 6,
    top: 4,
    fontSize: 11,
    fontWeight: "bold",
    fill: themeColor("#ccc", "#444"),
  });

  const objects: FabricObject[] = [bg, title];

  try {
    const img = await FabricImage.fromURL(data.dataUrl);
    const scaleX = data.width / (img.width ?? data.width);
    const scaleY = data.height / (img.height ?? data.height);
    img.set({
      left: padding,
      top: titleBarH,
      scaleX,
      scaleY,
      selectable: false,
      evented: false,
    });
    objects.push(img);
  } catch {
    const placeholder = createCardText({
      text: "(chart image)",
      width: data.width,
      left: padding,
      top: titleBarH + data.height / 2 - 8,
      fill: themeColor("#666", "#aaa"),
      textAlign: "center",
    });
    objects.push(placeholder);
  }

  const group = new Group(objects, {
    left: data.x,
    top: data.y,
  });

  assignNodeProps(group, {
    boardType: "snapshot" as const,
    boardId: data.id,
    boardTitle: data.title,
    boardDataUrl: data.dataUrl,
    boardViewMode: data.viewMode,
    boardCreatedAt: data.createdAt,
    boardWidth: data.width,
    boardHeight: data.height,
  });

  finalizeNode(canvas, group);
  return group;
}

export function getSnapshotData(group: Group): SnapshotNodeData | null {
  if (group.boardType !== "snapshot") return null;
  const node = group as unknown as SnapshotNode;
  return {
    id: node.boardId,
    x: group.left ?? 0,
    y: group.top ?? 0,
    width: node.boardWidth ?? 280,
    height: node.boardHeight ?? 180,
    title: node.boardTitle ?? "",
    dataUrl: node.boardDataUrl ?? "",
    viewMode: node.boardViewMode ?? "",
    createdAt: node.boardCreatedAt ?? 0,
  };
}
