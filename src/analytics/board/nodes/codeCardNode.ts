
import { Canvas, Rect, Textbox, Group, type FabricObject } from "fabric";
import type { CodeCardNode } from "../boardTypes";
import { themeColor, createCardBg, createCardText, createSourceBadges, assignNodeProps, finalizeNode } from "../boardNodeHelpers";

export interface CodeCardNodeData {
  id: string;
  x: number;
  y: number;
  codeName: string;
  color: string;
  description: string;
  markerCount: number;
  sources: string[];
  createdAt: number;
}

let codeCardIdCounter = 0;

export function nextCodeCardId(): string {
  return `codeCard-${Date.now()}-${codeCardIdCounter++}`;
}

export function createCodeCardNode(canvas: Canvas, data: CodeCardNodeData): Group {
  const nodeW = 200;
  const padding = 10;
  const swatchSize = 24;

  const nameH = 20;
  const descH = data.description ? 16 : 0;
  const countH = 16;
  const badgesH = data.sources.length > 0 ? 20 : 0;
  const totalH = padding + swatchSize + 6 + nameH + (descH > 0 ? descH + 2 : 0) + countH + (badgesH > 0 ? badgesH + 4 : 0) + padding;

  const bg = createCardBg({
    width: nodeW,
    height: totalH,
    rx: 8,
    ry: 8,
    stroke: data.color,
    strokeWidth: 2,
    shadowColor: "rgba(0,0,0,0.18)",
    shadowBlur: 8,
  });

  const swatch = new Rect({
    width: swatchSize,
    height: swatchSize,
    fill: data.color,
    rx: swatchSize / 2,
    ry: swatchSize / 2,
    left: nodeW / 2 - swatchSize / 2,
    top: padding,
  });

  let yPos = padding + swatchSize + 6;

  const nameText = createCardText({
    text: data.codeName,
    width: nodeW - padding * 2,
    left: padding,
    top: yPos,
    fontSize: 14,
    fontWeight: "bold",
    fill: themeColor("#eee", "#222"),
    textAlign: "center",
  });
  yPos += nameH;

  const objects: FabricObject[] = [bg, swatch, nameText];

  if (data.description) {
    const descText = createCardText({
      text: data.description,
      width: nodeW - padding * 2,
      left: padding,
      top: yPos + 2,
      fontSize: 10,
      fill: themeColor("#999", "#777"),
      textAlign: "center",
    });
    objects.push(descText);
    yPos += descH + 2;
  }

  const countText = createCardText({
    text: `${data.markerCount} marker${data.markerCount !== 1 ? "s" : ""}`,
    width: nodeW - padding * 2,
    left: padding,
    top: yPos,
    fontSize: 11,
    fill: themeColor("#aaa", "#666"),
    textAlign: "center",
  });
  objects.push(countText);
  yPos += countH;

  if (data.sources.length > 0) {
    yPos += 4;
    const badges = createSourceBadges(data.sources, 0, yPos, nodeW);
    objects.push(...badges);
  }

  const group = new Group(objects, {
    left: data.x,
    top: data.y,
  });

  assignNodeProps(group, {
    boardType: "codeCard" as const,
    boardId: data.id,
    boardCodeName: data.codeName,
    boardColor: data.color,
    boardDescription: data.description,
    boardMarkerCount: data.markerCount,
    boardSources: data.sources,
    boardCreatedAt: data.createdAt,
  });

  finalizeNode(canvas, group);
  return group;
}

export function getCodeCardData(group: Group): CodeCardNodeData | null {
  if (group.boardType !== "codeCard") return null;
  const node = group as unknown as CodeCardNode;
  return {
    id: node.boardId,
    x: group.left ?? 0,
    y: group.top ?? 0,
    codeName: node.boardCodeName ?? "",
    color: node.boardColor ?? "#6200EE",
    description: node.boardDescription ?? "",
    markerCount: node.boardMarkerCount ?? 0,
    sources: node.boardSources ?? [],
    createdAt: node.boardCreatedAt ?? 0,
  };
}
