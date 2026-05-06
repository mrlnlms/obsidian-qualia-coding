import { describe, it, expect } from 'vitest';
import { polygonPointsToWorld } from '../../src/image/canvas/regionManager';

/**
 * Estado pós-creation no Fabric Polygon (validado contra fabric@6.9.1 source):
 *   - this.points = pontos passados ao constructor (world coords originais)
 *   - this.pathOffset = (bbox.cx, bbox.cy) — center do bbox dos points
 *   - this.left/top = ajustados via setPositionByOrigin pra que center do shape
 *     case com center do bbox em world
 *   - calcTransformMatrix(): translate(left + width/2, top + height/2) (sem rotate/scale)
 *
 * Pra recuperar world coords de cada point:
 *   world = applyMatrix(point - pathOffset, matrix)
 *
 * Skipping `- pathOffset` adiciona pathOffset extra no result → coords salvas
 * com offset do bbox center → polygon reaparece deslocado no reload.
 */

describe('polygonPointsToWorld', () => {
	it('recovers original world coords for a centered triangle', () => {
		// Triangle clicked at world (300, 200), (400, 200), (350, 300)
		const points = [
			{ x: 300, y: 200 },
			{ x: 400, y: 200 },
			{ x: 350, y: 300 },
		];
		// Fabric calcula bbox: (300, 200) → (400, 300). pathOffset = bbox center.
		const pathOffset = { x: 350, y: 250 };
		// calcTransformMatrix sem rotate/scale: translate(350, 250)
		// (= bbox center, que é onde Fabric move o object center via setPositionByOrigin)
		const matrix = [1, 0, 0, 1, 350, 250];

		const world = polygonPointsToWorld(points, pathOffset, matrix);
		expect(world).toEqual([
			{ x: 300, y: 200 },
			{ x: 400, y: 200 },
			{ x: 350, y: 300 },
		]);
	});

	it('respects scale in the matrix', () => {
		const points = [
			{ x: 100, y: 100 },
			{ x: 200, y: 100 },
			{ x: 150, y: 200 },
		];
		const pathOffset = { x: 150, y: 150 }; // bbox center
		// scaleX=2, scaleY=2 + translate
		const matrix = [2, 0, 0, 2, 150, 150];

		const world = polygonPointsToWorld(points, pathOffset, matrix);
		// Each local (p - pathOffset) doubles, then translates back to world center
		expect(world[0]).toEqual({ x: 150 + 2 * (100 - 150), y: 150 + 2 * (100 - 150) }); // (50, 50)
		expect(world[1]).toEqual({ x: 150 + 2 * (200 - 150), y: 150 + 2 * (100 - 150) }); // (250, 50)
		expect(world[2]).toEqual({ x: 150 + 2 * (150 - 150), y: 150 + 2 * (200 - 150) }); // (150, 250)
	});

	it('respects rotation in the matrix', () => {
		const points = [
			{ x: 100, y: 0 },
			{ x: -100, y: 0 },
		];
		const pathOffset = { x: 0, y: 0 }; // already centered
		// 90° rotation: matrix = [cos, sin, -sin, cos, tx, ty] = [0, 1, -1, 0, 0, 0]
		const matrix = [0, 1, -1, 0, 0, 0];

		const world = polygonPointsToWorld(points, pathOffset, matrix);
		expect(world[0]).toEqual({ x: 0, y: 100 });
		expect(world[1]).toEqual({ x: 0, y: -100 });
	});

	it('produces output identical to input when matrix is identity and pathOffset is origin', () => {
		// Edge case: brand-new polygon at canvas origin with no transform.
		const points = [
			{ x: 10, y: 10 },
			{ x: 20, y: 10 },
			{ x: 15, y: 20 },
		];
		const pathOffset = { x: 0, y: 0 };
		const matrix = [1, 0, 0, 1, 0, 0];

		expect(polygonPointsToWorld(points, pathOffset, matrix)).toEqual(points);
	});

	it('regression: previous bug — applying matrix without subtracting pathOffset double-offsets', () => {
		// This test documents what NOT to do. Same fixture as the centered triangle.
		const points = [
			{ x: 300, y: 200 },
			{ x: 400, y: 200 },
			{ x: 350, y: 300 },
		];
		const pathOffset = { x: 350, y: 250 };
		const matrix = [1, 0, 0, 1, 350, 250];

		// Buggy version (subtracting pathOffset omitted): each point ends up shifted by pathOffset
		const buggy = points.map((p) => ({
			x: matrix[0]! * p.x + matrix[2]! * p.y + matrix[4]!,
			y: matrix[1]! * p.x + matrix[3]! * p.y + matrix[5]!,
		}));
		expect(buggy[0]).toEqual({ x: 300 + 350, y: 200 + 250 }); // shifted by exactly pathOffset
		expect(buggy[1]).toEqual({ x: 400 + 350, y: 200 + 250 });

		// Fixed version: subtracting pathOffset first cancels the matrix's translation back to origin.
		const fixed = polygonPointsToWorld(points, pathOffset, matrix);
		expect(fixed).toEqual(points);
	});
});
