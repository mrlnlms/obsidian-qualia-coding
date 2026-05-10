import { describe, it, expect } from 'vitest';
import { rasterize } from '../../../src/core/icr/bboxRaster';

describe('rasterize — rect', () => {
	it('paints exact cell count for a rect aligned to grid', () => {
		const bm = rasterize('rect', { type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 }, 200);
		expect(bm.cellsSet).toBe(10000);
		expect(bm.gridSize).toBe(200);
	});

	it('respects offset', () => {
		const bm = rasterize('rect', { type: 'rect', x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 200);
		expect(bm.cellsSet).toBe(10000);
	});

	it('returns AABB matching coords', () => {
		const bm = rasterize('rect', { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 200);
		expect(bm.aabb.x0).toBeCloseTo(0.1, 10);
		expect(bm.aabb.y0).toBeCloseTo(0.2, 10);
		expect(bm.aabb.x1).toBeCloseTo(0.4, 10);
		expect(bm.aabb.y1).toBeCloseTo(0.6, 10);
	});

	it('handles full-page rect', () => {
		const bm = rasterize('rect', { type: 'rect', x: 0, y: 0, w: 1, h: 1 }, 100);
		expect(bm.cellsSet).toBe(10000);
	});

	it('produces empty bitmap for zero-area rect', () => {
		const bm = rasterize('rect', { type: 'rect', x: 0.5, y: 0.5, w: 0, h: 0 }, 200);
		expect(bm.cellsSet).toBe(0);
	});

	it('clamps coords outside [0,1] (clip-to-viewport)', () => {
		const bm = rasterize('rect', { type: 'rect', x: -0.1, y: -0.1, w: 0.6, h: 0.6 }, 200);
		expect(bm.cellsSet).toBe(10000);
		expect(bm.aabb).toEqual({ x0: 0, y0: 0, x1: 0.5, y1: 0.5 });
	});
});
