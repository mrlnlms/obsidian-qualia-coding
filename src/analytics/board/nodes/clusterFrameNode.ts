
import { Canvas, Rect, Textbox, Group } from "fabric";
import type { ClusterFrameNode } from "../boardTypes";
import { themeColor, createCardText, assignNodeProps, finalizeNode } from "../boardNodeHelpers";

export interface ClusterFrameData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  codeNames: string[];
}

let clusterFrameIdCounter = 0;

export function nextClusterFrameId(): string {
  return `cluster-${Date.now()}-${clusterFrameIdCounter++}`;
}

export function createClusterFrame(canvas: Canvas, data: ClusterFrameData): Group {
  const bg = new Rect({
    width: data.width,
    height: data.height,
    fill: data.color,
    rx: 12,
    ry: 12,
    stroke: data.color.replace(/[\d.]+\)$/, "0.5)"),
    strokeWidth: 2,
    strokeDashArray: [6, 4],
  });

  const label = createCardText({
    text: data.label,
    width: data.width - 16,
    left: 8,
    top: 6,
    fontSize: 11,
    fontWeight: "bold",
    fill: themeColor("#bbb", "#555"),
  });

  const group = new Group([bg, label], {
    left: data.x,
    top: data.y,
    subTargetCheck: false,
    interactive: false,
  });

  assignNodeProps(group, {
    boardType: "cluster-frame" as const,
    boardId: data.id,
    boardLabel: data.label,
    boardColor: data.color,
    boardCodeNames: data.codeNames,
    boardWidth: data.width,
    boardHeight: data.height,
  });

  finalizeNode(canvas, group, true);
  return group;
}

export function getClusterFrameData(group: Group): ClusterFrameData | null {
  if (group.boardType !== "cluster-frame") return null;
  const node = group as unknown as ClusterFrameNode;
  return {
    id: node.boardId,
    x: group.left ?? 0,
    y: group.top ?? 0,
    width: node.boardWidth ?? 200,
    height: node.boardHeight ?? 200,
    label: node.boardLabel ?? "",
    color: node.boardColor ?? "rgba(100,100,100,0.1)",
    codeNames: node.boardCodeNames ?? [],
  };
}
