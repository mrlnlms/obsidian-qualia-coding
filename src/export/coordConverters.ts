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
