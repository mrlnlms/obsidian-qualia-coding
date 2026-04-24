import { describe, it, expect } from 'vitest';
import { ellipseBBox, polygonBBox, lineChToOffset, pdfShapeToRect, imageToPixels, mediaToMs } from '../../src/export/coordConverters';
import type { PercentShapeCoords } from '../../src/core/shapeTypes';

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

describe('lineChToOffset', () => {
  it('converts line:ch to absolute offset in content', () => {
    const content = 'abc\ndef\nghi';
    expect(lineChToOffset(content, 0, 0)).toBe(0);
    expect(lineChToOffset(content, 0, 2)).toBe(2);
    expect(lineChToOffset(content, 1, 0)).toBe(4);
    expect(lineChToOffset(content, 1, 2)).toBe(6);
    expect(lineChToOffset(content, 2, 1)).toBe(9);
  });

  it('handles unicode characters correctly (codepoint-based)', () => {
    const content = 'café\nñ';
    expect(lineChToOffset(content, 0, 4)).toBe(4);
    expect(lineChToOffset(content, 1, 0)).toBe(5);
    expect(lineChToOffset(content, 1, 1)).toBe(6);
  });

  it('handles emoji (surrogate pairs)', () => {
    const content = 'a😀b\nc';
    expect(lineChToOffset(content, 0, 0)).toBe(0);
    expect(lineChToOffset(content, 1, 0)).toBe(4); // a(1cp) + 😀(1cp) + b(1cp) + \n(1cp) = 4 codepoints
  });

  it('returns -1 for out-of-range line', () => {
    expect(lineChToOffset('abc', 5, 0)).toBe(-1);
  });
});

describe('pdfShapeToRect', () => {
  // Plugin coords are in percent (0-100) — matches SVG viewBox "0 0 100 100".
  it('converts rect coords to PDF points (bottom-left origin)', () => {
    const coords: PercentShapeCoords = { type: 'rect', x: 10, y: 20, w: 30, h: 40 };
    const result = pdfShapeToRect(coords, 612, 792);
    expect(result).toEqual({
      firstX: 61.2, firstY: 633.6,
      secondX: 244.8, secondY: 316.8,
    });
  });

  it('converts ellipse via bounding box', () => {
    const coords: PercentShapeCoords = { type: 'ellipse', cx: 50, cy: 50, rx: 10, ry: 20 };
    const result = pdfShapeToRect(coords, 612, 792);
    expect(result!.firstX).toBeCloseTo(0.4 * 612);
    expect(result!.secondX).toBeCloseTo(0.6 * 612);
  });

  it('converts polygon via bounding box', () => {
    const coords: PercentShapeCoords = {
      type: 'polygon',
      points: [{ x: 20, y: 30 }, { x: 80, y: 70 }],
    };
    const result = pdfShapeToRect(coords, 612, 792);
    expect(result!.firstX).toBeCloseTo(0.2 * 612);
    expect(result!.secondX).toBeCloseTo(0.8 * 612);
  });

  it('returns null for empty polygon', () => {
    const coords: PercentShapeCoords = { type: 'polygon', points: [] };
    expect(pdfShapeToRect(coords, 612, 792)).toBeNull();
  });
});

describe('imageToPixels', () => {
  it('converts normalized rect to pixel bounding box', () => {
    const result = imageToPixels(
      { type: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
      1920, 1080,
    );
    expect(result).toEqual({
      firstX: 192, firstY: 216,
      secondX: 1152, secondY: 540,
    });
  });

  it('converts normalized polygon to pixel bounding box', () => {
    const result = imageToPixels(
      { type: 'polygon', points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] },
      1000, 1000,
    );
    expect(result).toEqual({ firstX: 100, firstY: 100, secondX: 900, secondY: 900 });
  });

  it('returns null for empty polygon', () => {
    expect(imageToPixels({ type: 'polygon', points: [] }, 100, 100)).toBeNull();
  });
});

describe('mediaToMs', () => {
  it('converts seconds to milliseconds (rounded integer)', () => {
    expect(mediaToMs(16.176)).toBe(16176);
    expect(mediaToMs(45.3584)).toBe(45358);
    expect(mediaToMs(0)).toBe(0);
  });
});
