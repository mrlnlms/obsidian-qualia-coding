import { describe, it, expect } from 'vitest';
import { ellipseBBox, polygonBBox } from '../../src/export/coordConverters';

describe('ellipseBBox', () => {
  it('computes bounding box from center + radii', () => {
    const bb = ellipseBBox({ type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.1 });
    expect(bb).toEqual({ x: 0.3, y: 0.4, w: 0.4, h: 0.2 });
  });
});

describe('polygonBBox', () => {
  it('computes bounding box from polygon points', () => {
    const bb = polygonBBox({
      type: 'polygon',
      points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.1 }, { x: 0.3, y: 0.8 }],
    });
    expect(bb.x).toBeCloseTo(0.1);
    expect(bb.y).toBeCloseTo(0.1);
    expect(bb.w).toBeCloseTo(0.4);
    expect(bb.h).toBeCloseTo(0.7);
  });

  it('handles single point (degenerate polygon)', () => {
    const bb = polygonBBox({ type: 'polygon', points: [{ x: 0.5, y: 0.5 }] });
    expect(bb).toEqual({ x: 0.5, y: 0.5, w: 0, h: 0 });
  });
});
