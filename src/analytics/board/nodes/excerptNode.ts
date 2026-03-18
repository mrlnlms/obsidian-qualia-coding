
import { Canvas, Rect, Textbox, Group, Shadow, type FabricObject } from "fabric";
import type { ExcerptNode } from "../boardTypes";
import { themeColor, createCardBg, createCardText, SOURCE_BADGE_COLORS, assignNodeProps, finalizeNode } from "../boardNodeHelpers";

export interface ExcerptNodeData {
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  file: string;
  source: string;
  location: string;
  codes: string[];
  codeColors: string[];
  createdAt: number;
}

let excerptIdCounter = 0;

export function nextExcerptId(): string {
  return `excerpt-${Date.now()}-${excerptIdCounter++}`;
}

const BADGE_LABELS: Record<string, string> = {
  markdown: "MD", "csv-segment": "CSV", "csv-row": "ROW",
  image: "IMG", pdf: "PDF", audio: "AUD", video: "VID",
};

export function createExcerptNode(canvas: Canvas, data: ExcerptNodeData): Group {
  const nodeW = data.width;
  const padding = 8;
  const headerH = 20;
  const chipsH = data.codes.length > 0 ? 22 : 0;

  const displayText = data.text.length > 300 ? data.text.slice(0, 297) + "..." : data.text;
  const charsPerLine = Math.max(1, Math.floor((nodeW - padding * 2) / 7.5));
  const lines = Math.ceil(displayText.length / charsPerLine);
  const textH = Math.max(30, Math.min(lines * 18, 120));
  const totalH = headerH + textH + chipsH + padding * 2 + 4;

  const borderColor = data.codeColors.length > 0 ? data.codeColors[0] : themeColor("#666", "#ccc");

  const bg = createCardBg({
    width: nodeW,
    height: totalH,
    fill: themeColor("#1e1e22", "#fafafa"),
    stroke: borderColor,
    strokeWidth: 2,
  });

  const accentBar = new Rect({
    width: 4,
    height: totalH - 12,
    fill: borderColor,
    rx: 2,
    ry: 2,
    left: 2,
    top: 6,
  });

  const basename = data.file.split("/").pop() ?? data.file;
  const badgeLabel = BADGE_LABELS[data.source] ?? data.source.toUpperCase();
  const headerText = `${badgeLabel}  ${basename}${data.location ? "  " + data.location : ""}`;

  const header = createCardText({
    text: headerText,
    width: nodeW - padding * 2 - 8,
    left: padding + 8,
    top: padding,
    fontSize: 10,
    fontWeight: "bold",
    fill: SOURCE_BADGE_COLORS[data.source] ?? themeColor("#aaa", "#666"),
  });

  const textbox = createCardText({
    text: displayText || "[empty]",
    width: nodeW - padding * 2 - 8,
    left: padding + 8,
    top: headerH + padding,
    fill: themeColor("#ddd", "#333"),
  });

  const objects: FabricObject[] = [bg, accentBar, header, textbox];

  // Code chips row
  if (data.codes.length > 0) {
    let chipX = padding + 8;
    const chipY = headerH + textH + padding + 2;
    for (let i = 0; i < Math.min(data.codes.length, 4); i++) {
      const chipColor = data.codeColors[i] ?? "#6200EE";
      const chipDot = new Rect({
        width: 8, height: 8,
        fill: chipColor,
        rx: 4, ry: 4,
        left: chipX, top: chipY + 4,
      });
      objects.push(chipDot);

      const chipLabel = createCardText({
        text: data.codes[i]!,
        width: 80,
        left: chipX + 11,
        top: chipY + 1,
        fontSize: 9,
        fill: themeColor("#bbb", "#555"),
      });
      objects.push(chipLabel);

      chipX += 11 + Math.min(data.codes[i]!.length * 5.5 + 8, 80);
    }
    if (data.codes.length > 4) {
      const moreLabel = createCardText({
        text: `+${data.codes.length - 4}`,
        width: 30,
        left: chipX,
        top: chipY + 1,
        fontSize: 9,
        fill: themeColor("#888", "#999"),
      });
      objects.push(moreLabel);
    }
  }

  const group = new Group(objects, {
    left: data.x,
    top: data.y,
  });

  assignNodeProps(group, {
    boardType: "excerpt" as const,
    boardId: data.id,
    boardText: data.text,
    boardFile: data.file,
    boardSource: data.source,
    boardLocation: data.location,
    boardCodes: data.codes,
    boardCodeColors: data.codeColors,
    boardCreatedAt: data.createdAt,
    boardWidth: data.width,
  });

  finalizeNode(canvas, group);
  return group;
}

export function getExcerptData(group: Group): ExcerptNodeData | null {
  if (group.boardType !== "excerpt") return null;
  const node = group as unknown as ExcerptNode;
  return {
    id: node.boardId,
    x: group.left ?? 0,
    y: group.top ?? 0,
    width: node.boardWidth ?? 260,
    text: node.boardText ?? "",
    file: node.boardFile ?? "",
    source: node.boardSource ?? "markdown",
    location: node.boardLocation ?? "",
    codes: node.boardCodes ?? [],
    codeColors: node.boardCodeColors ?? [],
    createdAt: node.boardCreatedAt ?? 0,
  };
}
