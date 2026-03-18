
import { Canvas, Rect, Textbox, Group, Shadow, type FabricObject } from "fabric";
import type { StickyNode } from "../boardTypes";
import { assignNodeProps, finalizeNode } from "../boardNodeHelpers";

export interface StickyNoteData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

export const STICKY_COLORS: Record<string, string> = {
  yellow: "#FFF9C4",
  blue: "#BBDEFB",
  green: "#C8E6C9",
  pink: "#F8BBD0",
  purple: "#E1BEE7",
  orange: "#FFE0B2",
};

export const DEFAULT_STICKY_COLOR = "yellow";

let noteIdCounter = 0;

export function nextNoteId(): string {
  return `note-${Date.now()}-${noteIdCounter++}`;
}

export function createStickyNote(canvas: Canvas, data: StickyNoteData): Group {
  const bgColor = STICKY_COLORS[data.color] ?? data.color;

  const rect = new Rect({
    width: data.width,
    height: data.height,
    fill: bgColor,
    rx: 6,
    ry: 6,
    shadow: new Shadow({ color: "rgba(0,0,0,0.15)", blur: 6, offsetX: 2, offsetY: 2 }),
    strokeWidth: 0,
  });

  const textbox = new Textbox(data.text || "Note", {
    width: data.width - 16,
    fontSize: 14,
    fontFamily: "sans-serif",
    fill: "#1a1a1a",
    left: 8,
    top: 8,
    editable: true,
    splitByGrapheme: false,
  });

  const group = new Group([rect, textbox], {
    left: data.x,
    top: data.y,
    subTargetCheck: false,
    interactive: false,
  });

  assignNodeProps(group, {
    boardType: "sticky" as const,
    boardId: data.id,
    boardColor: data.color,
  });

  finalizeNode(canvas, group);
  return group;
}

export function getStickyData(group: Group): StickyNoteData | null {
  if (group.boardType !== "sticky") return null;
  const node = group as unknown as StickyNode;
  const textbox = group.getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
  const br = group.getBoundingRect();
  return {
    id: node.boardId,
    x: group.left ?? 0,
    y: group.top ?? 0,
    width: br.width / (group.scaleX ?? 1),
    height: br.height / (group.scaleY ?? 1),
    text: textbox?.text ?? "",
    color: node.boardColor ?? DEFAULT_STICKY_COLOR,
  };
}

export function setStickyColor(group: Group, colorKey: string): void {
  const bgColor = STICKY_COLORS[colorKey] ?? colorKey;
  const rect = group.getObjects().find((o) => o instanceof Rect) as Rect | undefined;
  if (rect) {
    rect.set("fill", bgColor);
  }
  (group as unknown as StickyNode).boardColor = colorKey;
  group.canvas?.requestRenderAll();
}

export function enableStickyEditing(canvas: Canvas, group: Group): void {
  const textbox = group.getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
  if (!textbox) return;

  group.subTargetCheck = true;
  group.interactive = true;

  canvas.setActiveObject(textbox);
  textbox.enterEditing();
  canvas.requestRenderAll();

  const onDeselect = () => {
    textbox.exitEditing();
    group.subTargetCheck = false;
    group.interactive = false;
    canvas.requestRenderAll();
    canvas.off("selection:cleared", onDeselect);
  };
  canvas.on("selection:cleared", onDeselect);
}
