
import { Rect, Textbox, Shadow, type FabricObject, type Group, type Canvas } from "fabric";

// ─── Theme ───

export function isDarkTheme(): boolean {
  return document.body.classList.contains("theme-dark");
}

export function themeColor(dark: string, light: string): string {
  return isDarkTheme() ? dark : light;
}

// ─── Card Background ───

export interface CardBgOptions {
  width: number;
  height: number;
  fill?: string;
  rx?: number;
  ry?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeDashArray?: number[];
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowColor?: string;
}

export function createCardBg(opts: CardBgOptions): Rect {
  return new Rect({
    width: opts.width,
    height: opts.height,
    fill: opts.fill ?? themeColor("#1e1e22", "#ffffff"),
    rx: opts.rx ?? 6,
    ry: opts.ry ?? 6,
    shadow: new Shadow({
      color: opts.shadowColor ?? "rgba(0,0,0,0.15)",
      blur: opts.shadowBlur ?? 6,
      offsetX: opts.shadowOffsetX ?? 1,
      offsetY: opts.shadowOffsetY ?? 2,
    }),
    stroke: opts.stroke ?? themeColor("#444", "#ddd"),
    strokeWidth: opts.strokeWidth ?? 1,
    strokeDashArray: opts.strokeDashArray,
  });
}

// ─── Textbox ───

export interface CardTextOptions {
  text: string;
  width: number;
  left: number;
  top: number;
  fontSize?: number;
  fontWeight?: string;
  fill?: string;
  textAlign?: string;
  editable?: boolean;
}

export function createCardText(opts: CardTextOptions): Textbox {
  return new Textbox(opts.text, {
    width: opts.width,
    fontSize: opts.fontSize ?? 12,
    fontFamily: "sans-serif",
    fontWeight: opts.fontWeight,
    fill: opts.fill ?? themeColor("#ddd", "#333"),
    left: opts.left,
    top: opts.top,
    editable: opts.editable ?? false,
    textAlign: opts.textAlign,
    splitByGrapheme: false,
  });
}

// ─── Source Badges (reusado em codeCard; excerpt usa code chips, nao badges) ───

export const SOURCE_BADGE_LABELS: Record<string, string> = {
  markdown: "MD", "csv-segment": "CSV", "csv-row": "ROW",
  image: "IMG", pdf: "PDF", audio: "AUD", video: "VID",
};

export const SOURCE_BADGE_COLORS: Record<string, string> = {
  markdown: "#42A5F5", "csv-segment": "#66BB6A", "csv-row": "#81C784",
  image: "#FFA726", pdf: "#EF5350", audio: "#AB47BC", video: "#00ACC1",
};

export function createSourceBadges(sources: string[], startX: number, y: number, containerW: number): FabricObject[] {
  const objects: FabricObject[] = [];
  const totalBadgeW = sources.length * 30 + (sources.length - 1) * 4;
  let bx = (containerW - totalBadgeW) / 2;
  if (startX > 0) bx = startX;

  for (const src of sources) {
    const badgeBg = new Rect({
      width: 28, height: 14,
      fill: SOURCE_BADGE_COLORS[src] ?? "#888",
      rx: 3, ry: 3,
      left: bx, top: y,
    });
    objects.push(badgeBg);

    const badgeLabel = new Textbox(SOURCE_BADGE_LABELS[src] ?? src.slice(0, 3).toUpperCase(), {
      width: 28, fontSize: 8,
      fontFamily: "sans-serif", fontWeight: "bold",
      fill: "#fff",
      left: bx, top: y + 1,
      editable: false, textAlign: "center",
    });
    objects.push(badgeLabel);
    bx += 32;
  }
  return objects;
}

// ─── Node property assignment ───

export function assignNodeProps<T extends Record<string, unknown>>(
  group: Group, props: T
): void {
  const obj = group as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(props)) {
    obj[key] = value;
  }
}

// ─── Finalize node (add to canvas + render) ───

export function finalizeNode(canvas: Canvas, group: Group, sendToBack = false): void {
  canvas.add(group);
  if (sendToBack) canvas.sendObjectToBack(group);
  canvas.requestRenderAll();
}
