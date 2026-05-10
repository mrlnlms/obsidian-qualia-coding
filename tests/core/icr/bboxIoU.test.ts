import { describe, it, expect } from 'vitest';
import { iou } from '../../../src/core/icr/bboxIoU';
import { rasterize } from '../../../src/core/icr/bboxRaster';

describe('bboxIoU.iou', () => {
	it('returns 1.0 for identical rects', () => {
		const a = rasterize('rect', { type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 200);
		const b = rasterize('rect', { type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 200);
		expect(iou(a, b)).toBeCloseTo(1.0, 5);
	});

	it('returns 0 for disjoint rects (AABB early-out)', () => {
		const a = rasterize('rect', { type: 'rect', x: 0, y: 0, w: 0.3, h: 0.3 }, 200);
		const b = rasterize('rect', { type: 'rect', x: 0.7, y: 0.7, w: 0.3, h: 0.3 }, 200);
		expect(iou(a, b)).toBe(0);
	});

	it('returns 1/3 for two rects 50% overlapping', () => {
		const a = rasterize('rect', { type: 'rect', x: 0, y: 0, w: 0.4, h: 0.4 }, 200);
		const b = rasterize('rect', { type: 'rect', x: 0.2, y: 0, w: 0.4, h: 0.4 }, 200);
		expect(iou(a, b)).toBeCloseTo(1 / 3, 1);
	});

	it('symmetric: iou(a, b) === iou(b, a)', () => {
		const a = rasterize('rect', { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 200);
		const b = rasterize('rect', { type: 'rect', x: 0.2, y: 0.3, w: 0.4, h: 0.3 }, 200);
		expect(iou(a, b)).toBeCloseTo(iou(b, a), 5);
	});

	it('handles empty bitmap (zero-area shape)', () => {
		const a = rasterize('rect', { type: 'rect', x: 0, y: 0, w: 0, h: 0 }, 200);
		const b = rasterize('rect', { type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 200);
		expect(iou(a, b)).toBe(0);
	});

	it('throws when bitmaps have different gridSize', () => {
		const a = rasterize('rect', { type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 }, 200);
		const b = rasterize('rect', { type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 }, 400);
		expect(() => iou(a, b)).toThrow();
	});
});
