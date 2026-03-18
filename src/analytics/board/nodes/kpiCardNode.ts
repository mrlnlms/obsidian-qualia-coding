
import { Canvas, Rect, Textbox, Group } from "fabric";
import type { KpiCardNode } from "../boardTypes";
import { themeColor, createCardBg, createCardText, assignNodeProps, finalizeNode } from "../boardNodeHelpers";

export interface KpiCardNodeData {
  id: string;
  x: number;
  y: number;
  value: string;
  label: string;
  accent: string;
  createdAt: number;
}

let kpiCardIdCounter = 0;

export function nextKpiCardId(): string {
  return `kpi-${Date.now()}-${kpiCardIdCounter++}`;
}

export function createKpiCardNode(canvas: Canvas, data: KpiCardNodeData): Group {
  const nodeW = 140;
  const nodeH = 72;

  const bg = createCardBg({
    width: nodeW,
    height: nodeH,
    rx: 8,
    ry: 8,
    stroke: data.accent,
    strokeWidth: 2,
  });

  const accentBar = new Rect({
    width: nodeW - 16,
    height: 3,
    fill: data.accent,
    rx: 1.5,
    ry: 1.5,
    left: 8,
    top: 6,
  });

  const valueText = createCardText({
    text: data.value,
    width: nodeW - 16,
    left: 8,
    top: 14,
    fontSize: 22,
    fontWeight: "bold",
    fill: themeColor("#eee", "#222"),
    textAlign: "center",
  });

  const labelText = createCardText({
    text: data.label,
    width: nodeW - 16,
    left: 8,
    top: 46,
    fontSize: 10,
    fill: themeColor("#999", "#777"),
    textAlign: "center",
  });

  const group = new Group([bg, accentBar, valueText, labelText], {
    left: data.x,
    top: data.y,
  });

  assignNodeProps(group, {
    boardType: "kpiCard" as const,
    boardId: data.id,
    boardValue: data.value,
    boardLabel: data.label,
    boardAccent: data.accent,
    boardCreatedAt: data.createdAt,
  });

  finalizeNode(canvas, group);
  return group;
}

export function getKpiCardData(group: Group): KpiCardNodeData | null {
  if (group.boardType !== "kpiCard") return null;
  const node = group as unknown as KpiCardNode;
  return {
    id: node.boardId,
    x: group.left ?? 0,
    y: group.top ?? 0,
    value: node.boardValue ?? "",
    label: node.boardLabel ?? "",
    accent: node.boardAccent ?? "#6200EE",
    createdAt: node.boardCreatedAt ?? 0,
  };
}
