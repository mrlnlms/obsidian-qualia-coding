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

describe('rasterize — ellipse', () => {
	it('paints approx π·rx·ry·gridSize² cells (centered)', () => {
		const bm = rasterize('ellipse', { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3 }, 200);
		const expected = Math.PI * 0.3 * 0.3 * 200 * 200;
		expect(bm.cellsSet).toBeGreaterThan(expected * 0.97);
		expect(bm.cellsSet).toBeLessThan(expected * 1.03);
	});

	it('AABB encloses ellipse', () => {
		const bm = rasterize('ellipse', { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.3 }, 200);
		expect(bm.aabb.x0).toBeCloseTo(0.3, 5);
		expect(bm.aabb.x1).toBeCloseTo(0.7, 5);
		expect(bm.aabb.y0).toBeCloseTo(0.2, 5);
		expect(bm.aabb.y1).toBeCloseTo(0.8, 5);
	});

	it('clamps ellipse near-border (center clamp + radii reduce, preserves some area)', () => {
		// cx=0.95 clamped to 0.95 (in-range). rx = min(0.2, 0.95, 0.05) = 0.05 → pequena mas válida.
		const bm = rasterize('ellipse', { type: 'ellipse', cx: 0.95, cy: 0.5, rx: 0.2, ry: 0.2 }, 200);
		expect(bm.aabb.x1).toBeLessThanOrEqual(1);
		expect(bm.aabb.x0).toBeGreaterThanOrEqual(0);
		expect(bm.cellsSet).toBeGreaterThan(0);
	});

	it('degenerates to zero cells when center on viewport boundary (rx truncated to 0)', () => {
		const bm = rasterize('ellipse', { type: 'ellipse', cx: 1.2, cy: 0.5, rx: 0.3, ry: 0.3 }, 200);
		expect(bm.cellsSet).toBe(0);
	});

	it('produces empty bitmap for zero-radius ellipse', () => {
		const bm = rasterize('ellipse', { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0, ry: 0 }, 200);
		expect(bm.cellsSet).toBe(0);
	});
});

describe('rasterize — polygon', () => {
	it('paints triangle area approx half of unit square', () => {
		const bm = rasterize('polygon', {
			type: 'polygon',
			points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
		}, 200);
		const expected = 0.5 * 200 * 200;
		expect(bm.cellsSet).toBeGreaterThan(expected * 0.97);
		expect(bm.cellsSet).toBeLessThan(expected * 1.03);
	});

	it('paints square via 4-point polygon', () => {
		const bm = rasterize('polygon', {
			type: 'polygon',
			points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }],
		}, 200);
		expect(bm.cellsSet).toBeGreaterThan(9800);
		expect(bm.cellsSet).toBeLessThan(10200);
	});

	it('handles concave polygon (L-shape)', () => {
		const bm = rasterize('polygon', {
			type: 'polygon',
			points: [
				{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 },
				{ x: 0.5, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 1 },
			],
		}, 200);
		const expected = 0.75 * 200 * 200;
		expect(bm.cellsSet).toBeGreaterThan(expected * 0.97);
		expect(bm.cellsSet).toBeLessThan(expected * 1.03);
	});

	it('AABB matches min/max points', () => {
		const bm = rasterize('polygon', {
			type: 'polygon',
			points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.25, y: 0.6 }],
		}, 200);
		expect(bm.aabb.x0).toBeCloseTo(0.1, 10);
		expect(bm.aabb.y0).toBeCloseTo(0.2, 10);
		expect(bm.aabb.x1).toBeCloseTo(0.4, 10);
		expect(bm.aabb.y1).toBeCloseTo(0.6, 10);
	});

	it('produces empty bitmap for collinear (zero-area) polygon', () => {
		const bm = rasterize('polygon', {
			type: 'polygon',
			points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }],
		}, 200);
		expect(bm.cellsSet).toBe(0);
	});
});
