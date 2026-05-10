import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { rasterize } from '../../../src/core/icr/bboxRaster';
import { iou } from '../../../src/core/icr/bboxIoU';
import type { ShapeType, PercentShapeCoords } from '../../../src/core/shapeTypes';

interface FixtureCase {
	name: string;
	shapeA: { shape: ShapeType; coords: PercentShapeCoords };
	shapeB: { shape: ShapeType; coords: PercentShapeCoords };
	expectedIoU: number;
	epsilon: number;
}

const fixtures: FixtureCase[] = JSON.parse(
	fs.readFileSync(path.join(__dirname, 'fixtures/bbox-iou-cases.json'), 'utf-8'),
);

function needsAdaptive(shape: { shape: ShapeType; coords: PercentShapeCoords }): boolean {
	const c = shape.coords;
	if (c.type === 'rect') {
		const area = c.w * c.h;
		return area < 0.0001 || Math.min(c.w, c.h) < 2 / 200;
	}
	return false;
}

describe('bboxIoU — fixture regression', () => {
	for (const f of fixtures) {
		it(f.name, () => {
			const gridSize = needsAdaptive(f.shapeA) || needsAdaptive(f.shapeB) ? 400 : 200;
			const a = rasterize(f.shapeA.shape, f.shapeA.coords, gridSize);
			const b = rasterize(f.shapeB.shape, f.shapeB.coords, gridSize);
			const result = iou(a, b);
			expect(Math.abs(result - f.expectedIoU)).toBeLessThanOrEqual(f.epsilon);
		});
	}
});
