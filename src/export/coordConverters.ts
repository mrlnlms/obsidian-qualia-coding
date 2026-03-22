import type { EllipseCoords, PolygonCoords } from '../core/shapeTypes';

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
    cpOffset += codepointLength(lines[i]) + 1; // +1 for \n
  }
  cpOffset += codepointLengthOfCodeUnits(lines[line], ch);
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
