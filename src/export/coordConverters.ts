import type { EllipseCoords, NormalizedShapeCoords, PolygonCoords } from '../core/shapeTypes';
import type { NormalizedCoords } from '../image/imageCodingTypes';

/** Axis-aligned bounding box for an ellipse. */
export function ellipseBBox(e: EllipseCoords): { x: number; y: number; w: number; h: number } {
  return { x: e.cx - e.rx, y: e.cy - e.ry, w: e.rx * 2, h: e.ry * 2 };
}

/** Axis-aligned bounding box for a polygon. */
export function polygonBBox(p: PolygonCoords): { x: number; y: number; w: number; h: number } {
  if (p.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of p.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Convert CM6 line:ch (0-based) to Unicode codepoint offset in file content.
 * REFI-QDA startPosition/endPosition count Unicode codepoints (0-based).
 * CM6 ch counts UTF-16 code units within the line.
 * Returns -1 if line is out of range.
 */
export function lineChToOffset(content: string, line: number, ch: number): number {
  const lines = content.split('\n');
  if (line < 0 || line >= lines.length) return -1;

  let cpOffset = 0;
  for (let i = 0; i < line; i++) {
    cpOffset += codepointLength(lines[i]!) + 1; // +1 for \n
  }
  cpOffset += codepointLengthOfCodeUnits(lines[line]!, ch);
  return cpOffset;
}

/** Count Unicode codepoints in a string. */
function codepointLength(s: string): number {
  let count = 0;
  for (const _ of s) count++;
  return count;
}

/** Count Unicode codepoints in the first `codeUnits` UTF-16 code units of `s`. */
function codepointLengthOfCodeUnits(s: string, codeUnits: number): number {
  let cu = 0;
  let cp = 0;
  while (cu < codeUnits && cu < s.length) {
    const code = s.charCodeAt(cu);
    if (code >= 0xD800 && code <= 0xDBFF) {
      cu += 2;
    } else {
      cu += 1;
    }
    cp++;
  }
  return cp;
}

export interface PdfRect {
  firstX: number; firstY: number;
  secondX: number; secondY: number;
}

/**
 * Convert a normalized shape to a REFI-QDA PDF rectangle (bottom-left origin, in points).
 * Returns null for empty polygons.
 */
export function pdfShapeToRect(
  coords: NormalizedShapeCoords, pageWidth: number, pageHeight: number,
): PdfRect | null {
  let x: number, y: number, w: number, h: number;

  switch (coords.type) {
    case 'rect':
      ({ x, y, w, h } = coords);
      break;
    case 'ellipse': {
      const bb = ellipseBBox(coords);
      x = bb.x; y = bb.y; w = bb.w; h = bb.h;
      break;
    }
    case 'polygon': {
      if (coords.points.length === 0) return null;
      const bb = polygonBBox(coords);
      x = bb.x; y = bb.y; w = bb.w; h = bb.h;
      break;
    }
  }

  return {
    firstX: x * pageWidth,
    firstY: (1 - y) * pageHeight,
    secondX: (x + w) * pageWidth,
    secondY: (1 - y - h) * pageHeight,
  };
}

/**
 * Convert normalized image coords to pixel bounding box for REFI-QDA export.
 * Returns null for empty polygons.
 */
export function imageToPixels(
  coords: NormalizedCoords, imgWidth: number, imgHeight: number,
): { firstX: number; firstY: number; secondX: number; secondY: number } | null {
  let x: number, y: number, w: number, h: number;

  if (coords.type === 'rect') {
    ({ x, y, w, h } = coords);
  } else {
    if (coords.points.length === 0) return null;
    const bb = polygonBBox(coords);
    x = bb.x; y = bb.y; w = bb.w; h = bb.h;
  }

  return {
    firstX: Math.round(x * imgWidth),
    firstY: Math.round(y * imgHeight),
    secondX: Math.round((x + w) * imgWidth),
    secondY: Math.round((y + h) * imgHeight),
  };
}

/** Convert media time in seconds to milliseconds (rounded integer) for REFI-QDA export. */
export function mediaToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}
