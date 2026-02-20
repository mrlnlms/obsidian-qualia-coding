import { Canvas, Rect, Textbox, Group, Shadow, type FabricObject } from "fabric";

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
    subTargetCheck: true,
    interactive: true,
  });

  // Store metadata
  (group as any).boardType = "sticky";
  (group as any).boardId = data.id;
  (group as any).boardColor = data.color;

  canvas.add(group);
  canvas.requestRenderAll();
  return group;
}

export function getStickyData(group: Group): StickyNoteData | null {
  if ((group as any).boardType !== "sticky") return null;
  const textbox = group.getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
  const br = group.getBoundingRect();
  return {
    id: (group as any).boardId,
    x: group.left ?? 0,
    y: group.top ?? 0,
    width: br.width / (group.scaleX ?? 1),
    height: br.height / (group.scaleY ?? 1),
    text: textbox?.text ?? "",
    color: (group as any).boardColor ?? DEFAULT_STICKY_COLOR,
  };
}

export function setStickyColor(group: Group, colorKey: string): void {
  const bgColor = STICKY_COLORS[colorKey] ?? colorKey;
  const rect = group.getObjects().find((o) => o instanceof Rect) as Rect | undefined;
  if (rect) {
    rect.set("fill", bgColor);
  }
  (group as any).boardColor = colorKey;
  group.canvas?.requestRenderAll();
}

export function isStickyNote(obj: FabricObject): obj is Group {
  return (obj as any).boardType === "sticky";
}

export function enableStickyEditing(canvas: Canvas, group: Group): void {
  const textbox = group.getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
  if (!textbox) return;
  // Enter editing on textbox within group
  canvas.setActiveObject(textbox);
  textbox.enterEditing();
  canvas.requestRenderAll();
}
