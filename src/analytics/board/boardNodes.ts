
import { Canvas, Rect, Textbox, Group, Shadow, FabricImage, type FabricObject } from "fabric";
import type { StickyNode, SnapshotNode, ExcerptNode, CodeCardNode, KpiCardNode, ClusterFrameNode } from "./boardTypes";
export { isStickyNode as isStickyNote, isSnapshotNode, isExcerptNode, isCodeCardNode, isKpiCardNode, isClusterFrameNode as isClusterFrame } from "./boardTypes";

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

  // Store metadata
  const node = group as unknown as StickyNode;
  node.boardType = "sticky";
  node.boardId = data.id;
  node.boardColor = data.color;

  canvas.add(group);
  canvas.requestRenderAll();
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

  // Temporarily enable interactive mode for text editing
  group.subTargetCheck = true;
  group.interactive = true;

  canvas.setActiveObject(textbox);
  textbox.enterEditing();
  canvas.requestRenderAll();

  // When editing ends, restore non-interactive mode
  const onDeselect = () => {
    textbox.exitEditing();
    group.subTargetCheck = false;
    group.interactive = false;
    canvas.requestRenderAll();
    canvas.off("selection:cleared", onDeselect);
  };
  canvas.on("selection:cleared", onDeselect);
}

// ── Snapshot Nodes (chart images) ──

export interface SnapshotNodeData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  dataUrl: string; // PNG data URL
  viewMode: string; // which analytics view generated this
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

  const isDark = document.body.classList.contains("theme-dark");

  // Background card
  const bg = new Rect({
    width: totalW,
    height: totalH,
    fill: isDark ? "#2a2a2e" : "#ffffff",
    rx: 6,
    ry: 6,
    shadow: new Shadow({ color: "rgba(0,0,0,0.2)", blur: 8, offsetX: 2, offsetY: 2 }),
    stroke: isDark ? "#444" : "#ddd",
    strokeWidth: 1,
  });

  // Title bar
  const title = new Textbox(data.title, {
    width: totalW - 12,
    fontSize: 11,
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: isDark ? "#ccc" : "#444",
    left: 6,
    top: 4,
    editable: false,
    splitByGrapheme: false,
  });

  // Chart image
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
    // If image fails, show placeholder text
    const placeholder = new Textbox("(chart image)", {
      width: data.width,
      fontSize: 12,
      fill: isDark ? "#666" : "#aaa",
      left: padding,
      top: titleBarH + data.height / 2 - 8,
      editable: false,
      textAlign: "center",
    });
    objects.push(placeholder);
  }

  const group = new Group(objects, {
    left: data.x,
    top: data.y,
  });

  const node = group as unknown as SnapshotNode;
  node.boardType = "snapshot";
  node.boardId = data.id;
  node.boardTitle = data.title;
  node.boardDataUrl = data.dataUrl;
  node.boardViewMode = data.viewMode;
  node.boardCreatedAt = data.createdAt;
  node.boardWidth = data.width;
  node.boardHeight = data.height;

  canvas.add(group);
  canvas.requestRenderAll();
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

// ── Excerpt Nodes (text retrieval excerpts) ──

export interface ExcerptNodeData {
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;           // excerpt content
  file: string;           // source file path
  source: string;         // SourceType
  location: string;       // formatted location string
  codes: string[];        // code names
  codeColors: string[];   // matching colors for codes
  createdAt: number;
}

let excerptIdCounter = 0;

export function nextExcerptId(): string {
  return `excerpt-${Date.now()}-${excerptIdCounter++}`;
}

export function createExcerptNode(canvas: Canvas, data: ExcerptNodeData): Group {
  const isDark = document.body.classList.contains("theme-dark");
  const nodeW = data.width;
  const padding = 8;
  const headerH = 20;
  const chipsH = data.codes.length > 0 ? 22 : 0;

  // Truncate text for display
  const displayText = data.text.length > 300 ? data.text.slice(0, 297) + "..." : data.text;

  // Measure approximate text height (14px font, ~60 chars per line at 240px width)
  const charsPerLine = Math.max(1, Math.floor((nodeW - padding * 2) / 7.5));
  const lines = Math.ceil(displayText.length / charsPerLine);
  const textH = Math.max(30, Math.min(lines * 18, 120));

  const totalH = headerH + textH + chipsH + padding * 2 + 4;

  // Source badge colors
  const sourceColors: Record<string, string> = {
    markdown: "#42A5F5",
    "csv-segment": "#66BB6A",
    "csv-row": "#81C784",
    image: "#FFA726",
    pdf: "#EF5350",
    audio: "#AB47BC",
    video: "#00ACC1",
  };
  const badgeLabels: Record<string, string> = {
    markdown: "MD",
    "csv-segment": "CSV",
    "csv-row": "ROW",
    image: "IMG",
    pdf: "PDF",
    audio: "AUD",
    video: "VID",
  };

  // Background card — left border colored by first code
  const borderColor = data.codeColors.length > 0 ? data.codeColors[0] : (isDark ? "#666" : "#ccc");

  const bg = new Rect({
    width: nodeW,
    height: totalH,
    fill: isDark ? "#1e1e22" : "#fafafa",
    rx: 6,
    ry: 6,
    shadow: new Shadow({ color: "rgba(0,0,0,0.15)", blur: 6, offsetX: 1, offsetY: 2 }),
    stroke: borderColor,
    strokeWidth: 2,
  });

  // Left accent bar
  const accentBar = new Rect({
    width: 4,
    height: totalH - 12,
    fill: borderColor,
    rx: 2,
    ry: 2,
    left: 2,
    top: 6,
  });

  // Header: source badge + file basename + location
  const basename = data.file.split("/").pop() ?? data.file;
  const badgeLabel = badgeLabels[data.source] ?? data.source.toUpperCase();
  const headerText = `${badgeLabel}  ${basename}${data.location ? "  " + data.location : ""}`;

  const header = new Textbox(headerText, {
    width: nodeW - padding * 2 - 8,
    fontSize: 10,
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: sourceColors[data.source] ?? (isDark ? "#aaa" : "#666"),
    left: padding + 8,
    top: padding,
    editable: false,
    splitByGrapheme: false,
  });

  // Text content
  const textbox = new Textbox(displayText || "[empty]", {
    width: nodeW - padding * 2 - 8,
    fontSize: 12,
    fontFamily: "sans-serif",
    fill: isDark ? "#ddd" : "#333",
    left: padding + 8,
    top: headerH + padding,
    editable: false,
    splitByGrapheme: false,
  });

  const objects: FabricObject[] = [bg, accentBar, header, textbox];

  // Code chips row
  if (data.codes.length > 0) {
    let chipX = padding + 8;
    const chipY = headerH + textH + padding + 2;
    for (let i = 0; i < Math.min(data.codes.length, 4); i++) {
      const chipColor = data.codeColors[i] ?? "#6200EE";
      const chipDot = new Rect({
        width: 8,
        height: 8,
        fill: chipColor,
        rx: 4,
        ry: 4,
        left: chipX,
        top: chipY + 4,
      });
      objects.push(chipDot);

      const chipLabel = new Textbox(data.codes[i]!, {
        width: 80,
        fontSize: 9,
        fontFamily: "sans-serif",
        fill: isDark ? "#bbb" : "#555",
        left: chipX + 11,
        top: chipY + 1,
        editable: false,
        splitByGrapheme: false,
      });
      objects.push(chipLabel);

      chipX += 11 + Math.min(data.codes[i]!.length * 5.5 + 8, 80);
    }
    if (data.codes.length > 4) {
      const moreLabel = new Textbox(`+${data.codes.length - 4}`, {
        width: 30,
        fontSize: 9,
        fontFamily: "sans-serif",
        fill: isDark ? "#888" : "#999",
        left: chipX,
        top: chipY + 1,
        editable: false,
      });
      objects.push(moreLabel);
    }
  }

  const group = new Group(objects, {
    left: data.x,
    top: data.y,
  });

  const node = group as unknown as ExcerptNode;
  node.boardType = "excerpt";
  node.boardId = data.id;
  node.boardText = data.text;
  node.boardFile = data.file;
  node.boardSource = data.source;
  node.boardLocation = data.location;
  node.boardCodes = data.codes;
  node.boardCodeColors = data.codeColors;
  node.boardCreatedAt = data.createdAt;
  node.boardWidth = data.width;

  canvas.add(group);
  canvas.requestRenderAll();
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

// ── Code Card Nodes (code definitions) ──

export interface CodeCardNodeData {
  id: string;
  x: number;
  y: number;
  codeName: string;
  color: string;          // hex code color
  description: string;    // code description (may be empty)
  markerCount: number;    // total markers with this code
  sources: string[];      // source types that have this code
  createdAt: number;
}

let codeCardIdCounter = 0;

export function nextCodeCardId(): string {
  return `codeCard-${Date.now()}-${codeCardIdCounter++}`;
}

export function createCodeCardNode(canvas: Canvas, data: CodeCardNodeData): Group {
  const isDark = document.body.classList.contains("theme-dark");
  const nodeW = 200;
  const padding = 10;
  const swatchSize = 24;

  // Source badge labels
  const badgeLabels: Record<string, string> = {
    markdown: "MD", "csv-segment": "CSV", "csv-row": "ROW",
    image: "IMG", pdf: "PDF", audio: "AUD", video: "VID",
  };
  const sourceColors: Record<string, string> = {
    markdown: "#42A5F5", "csv-segment": "#66BB6A", "csv-row": "#81C784",
    image: "#FFA726", pdf: "#EF5350", audio: "#AB47BC", video: "#00ACC1",
  };

  // Measure heights
  const nameH = 20;
  const descH = data.description ? 16 : 0;
  const countH = 16;
  const badgesH = data.sources.length > 0 ? 20 : 0;
  const totalH = padding + swatchSize + 6 + nameH + (descH > 0 ? descH + 2 : 0) + countH + (badgesH > 0 ? badgesH + 4 : 0) + padding;

  // Background card
  const bg = new Rect({
    width: nodeW,
    height: totalH,
    fill: isDark ? "#1e1e22" : "#ffffff",
    rx: 8,
    ry: 8,
    shadow: new Shadow({ color: "rgba(0,0,0,0.18)", blur: 8, offsetX: 1, offsetY: 2 }),
    stroke: data.color,
    strokeWidth: 2,
  });

  // Color swatch (circle)
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

  // Code name
  const nameText = new Textbox(data.codeName, {
    width: nodeW - padding * 2,
    fontSize: 14,
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: isDark ? "#eee" : "#222",
    left: padding,
    top: yPos,
    editable: false,
    textAlign: "center",
    splitByGrapheme: false,
  });
  yPos += nameH;

  const objects: FabricObject[] = [bg, swatch, nameText];

  // Description (if present)
  if (data.description) {
    const descText = new Textbox(data.description, {
      width: nodeW - padding * 2,
      fontSize: 10,
      fontFamily: "sans-serif",
      fill: isDark ? "#999" : "#777",
      left: padding,
      top: yPos + 2,
      editable: false,
      textAlign: "center",
      splitByGrapheme: false,
    });
    objects.push(descText);
    yPos += descH + 2;
  }

  // Marker count
  const countText = new Textbox(`${data.markerCount} marker${data.markerCount !== 1 ? "s" : ""}`, {
    width: nodeW - padding * 2,
    fontSize: 11,
    fontFamily: "sans-serif",
    fill: isDark ? "#aaa" : "#666",
    left: padding,
    top: yPos,
    editable: false,
    textAlign: "center",
    splitByGrapheme: false,
  });
  objects.push(countText);
  yPos += countH;

  // Source badges row
  if (data.sources.length > 0) {
    yPos += 4;
    const totalBadgeW = data.sources.length * 30 + (data.sources.length - 1) * 4;
    let bx = (nodeW - totalBadgeW) / 2;
    for (const src of data.sources) {
      const badgeBg = new Rect({
        width: 28,
        height: 14,
        fill: sourceColors[src] ?? "#888",
        rx: 3,
        ry: 3,
        left: bx,
        top: yPos,
      });
      objects.push(badgeBg);

      const badgeLabel = new Textbox(badgeLabels[src] ?? src.slice(0, 3).toUpperCase(), {
        width: 28,
        fontSize: 8,
        fontFamily: "sans-serif",
        fontWeight: "bold",
        fill: "#fff",
        left: bx,
        top: yPos + 1,
        editable: false,
        textAlign: "center",
      });
      objects.push(badgeLabel);

      bx += 32;
    }
  }

  const group = new Group(objects, {
    left: data.x,
    top: data.y,
  });

  const node = group as unknown as CodeCardNode;
  node.boardType = "codeCard";
  node.boardId = data.id;
  node.boardCodeName = data.codeName;
  node.boardColor = data.color;
  node.boardDescription = data.description;
  node.boardMarkerCount = data.markerCount;
  node.boardSources = data.sources;
  node.boardCreatedAt = data.createdAt;

  canvas.add(group);
  canvas.requestRenderAll();
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

// ── KPI Card Nodes ──

export interface KpiCardNodeData {
  id: string;
  x: number;
  y: number;
  value: string;
  label: string;
  accent: string;   // accent color
  createdAt: number;
}

let kpiCardIdCounter = 0;

export function nextKpiCardId(): string {
  return `kpi-${Date.now()}-${kpiCardIdCounter++}`;
}

export function createKpiCardNode(canvas: Canvas, data: KpiCardNodeData): Group {
  const isDark = document.body.classList.contains("theme-dark");
  const nodeW = 140;
  const nodeH = 72;

  // Background
  const bg = new Rect({
    width: nodeW,
    height: nodeH,
    fill: isDark ? "#1e1e22" : "#ffffff",
    rx: 8,
    ry: 8,
    shadow: new Shadow({ color: "rgba(0,0,0,0.15)", blur: 6, offsetX: 1, offsetY: 2 }),
    stroke: data.accent,
    strokeWidth: 2,
  });

  // Top accent bar
  const accentBar = new Rect({
    width: nodeW - 16,
    height: 3,
    fill: data.accent,
    rx: 1.5,
    ry: 1.5,
    left: 8,
    top: 6,
  });

  // Big value
  const valueText = new Textbox(data.value, {
    width: nodeW - 16,
    fontSize: 22,
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: isDark ? "#eee" : "#222",
    left: 8,
    top: 14,
    editable: false,
    textAlign: "center",
    splitByGrapheme: false,
  });

  // Label
  const labelText = new Textbox(data.label, {
    width: nodeW - 16,
    fontSize: 10,
    fontFamily: "sans-serif",
    fill: isDark ? "#999" : "#777",
    left: 8,
    top: 46,
    editable: false,
    textAlign: "center",
    splitByGrapheme: false,
  });

  const group = new Group([bg, accentBar, valueText, labelText], {
    left: data.x,
    top: data.y,
  });

  const node = group as unknown as KpiCardNode;
  node.boardType = "kpiCard";
  node.boardId = data.id;
  node.boardValue = data.value;
  node.boardLabel = data.label;
  node.boardAccent = data.accent;
  node.boardCreatedAt = data.createdAt;

  canvas.add(group);
  canvas.requestRenderAll();
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

// ── Cluster Frame Nodes (visual grouping) ──

export interface ClusterFrameData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;       // translucent fill color
  codeNames: string[];  // codes contained in this cluster
}

let clusterFrameIdCounter = 0;

export function nextClusterFrameId(): string {
  return `cluster-${Date.now()}-${clusterFrameIdCounter++}`;
}

export function createClusterFrame(canvas: Canvas, data: ClusterFrameData): Group {
  const isDark = document.body.classList.contains("theme-dark");

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

  const label = new Textbox(data.label, {
    width: data.width - 16,
    fontSize: 11,
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: isDark ? "#bbb" : "#555",
    left: 8,
    top: 6,
    editable: false,
    splitByGrapheme: false,
  });

  const group = new Group([bg, label], {
    left: data.x,
    top: data.y,
    subTargetCheck: false,
    interactive: false,
  });

  const node = group as unknown as ClusterFrameNode;
  node.boardType = "cluster-frame";
  node.boardId = data.id;
  node.boardLabel = data.label;
  node.boardColor = data.color;
  node.boardCodeNames = data.codeNames;
  node.boardWidth = data.width;
  node.boardHeight = data.height;

  canvas.add(group);
  canvas.sendObjectToBack(group);
  canvas.requestRenderAll();
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
