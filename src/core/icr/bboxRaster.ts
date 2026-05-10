/**
 * Rasterize shape (rect|ellipse|polygon) em grid normalizado [0,1]² → Uint32Array bitmap.
 * Default gridSize=200 (40k cells, 1250 uint32s). Erro de borda <0.5% por dim.
 */

import type { ShapeType, PercentShapeCoords, RectCoords, EllipseCoords, PolygonCoords } from '../shapeTypes';

export interface AABB {
	x0: number; y0: number; x1: number; y1: number;
}

export interface Bitmap {
	bits: Uint32Array;
	cellsSet: number;
	aabb: AABB;
	gridSize: number;
}

export function rasterize(
	shape: ShapeType,
	coords: PercentShapeCoords,
	gridSize: number = 200,
): Bitmap {
	if (gridSize < 50 || gridSize > 1000) {
		throw new Error(`rasterize: gridSize must be in [50, 1000], got ${gridSize}`);
	}
	const totalCells = gridSize * gridSize;
	const u32Count = Math.ceil(totalCells / 32);
	const bits = new Uint32Array(u32Count);

	if (shape === 'rect') {
		return rasterizeRect(coords as RectCoords, gridSize, bits);
	}
	if (shape === 'ellipse') {
		return rasterizeEllipse(coords as EllipseCoords, gridSize, bits);
	}
	if (shape === 'polygon') {
		return rasterizePolygon(coords as PolygonCoords, gridSize, bits);
	}
	throw new Error(`rasterize: unknown shape '${shape}'`);
}

function rasterizeRect(c: RectCoords, gridSize: number, bits: Uint32Array): Bitmap {
	// Clip-to-viewport: clamp coords pra [0,1]²
	const x0 = Math.max(0, Math.min(1, c.x));
	const y0 = Math.max(0, Math.min(1, c.y));
	const x1 = Math.max(0, Math.min(1, c.x + c.w));
	const y1 = Math.max(0, Math.min(1, c.y + c.h));

	if (x1 <= x0 || y1 <= y0) {
		return { bits, cellsSet: 0, aabb: { x0, y0, x1, y1 }, gridSize };
	}

	const ix0 = Math.floor(x0 * gridSize);
	const iy0 = Math.floor(y0 * gridSize);
	const ix1 = Math.min(gridSize, Math.ceil(x1 * gridSize));
	const iy1 = Math.min(gridSize, Math.ceil(y1 * gridSize));

	let cellsSet = 0;
	for (let y = iy0; y < iy1; y++) {
		for (let x = ix0; x < ix1; x++) {
			const idx = y * gridSize + x;
			bits[idx >>> 5]! |= (1 << (idx & 31));
			cellsSet++;
		}
	}
	return { bits, cellsSet, aabb: { x0, y0, x1, y1 }, gridSize };
}

function rasterizeEllipse(c: EllipseCoords, gridSize: number, bits: Uint32Array): Bitmap {
	// Clamp center to [0,1] e raio às bordas (limita ellipse ao viewport).
	const cx = Math.max(0, Math.min(1, c.cx));
	const cy = Math.max(0, Math.min(1, c.cy));
	const rx = Math.min(c.rx, cx, 1 - cx);
	const ry = Math.min(c.ry, cy, 1 - cy);

	if (rx <= 0 || ry <= 0) {
		return { bits, cellsSet: 0, aabb: { x0: cx, y0: cy, x1: cx, y1: cy }, gridSize };
	}

	const x0 = cx - rx;
	const y0 = cy - ry;
	const x1 = cx + rx;
	const y1 = cy + ry;

	const ix0 = Math.floor(x0 * gridSize);
	const iy0 = Math.floor(y0 * gridSize);
	const ix1 = Math.min(gridSize, Math.ceil(x1 * gridSize));
	const iy1 = Math.min(gridSize, Math.ceil(y1 * gridSize));

	const rxSq = (rx * gridSize) * (rx * gridSize);
	const rySq = (ry * gridSize) * (ry * gridSize);
	const cxGrid = cx * gridSize;
	const cyGrid = cy * gridSize;

	let cellsSet = 0;
	for (let y = iy0; y < iy1; y++) {
		for (let x = ix0; x < ix1; x++) {
			const dx = x + 0.5 - cxGrid;
			const dy = y + 0.5 - cyGrid;
			if ((dx * dx) / rxSq + (dy * dy) / rySq <= 1) {
				const idx = y * gridSize + x;
				bits[idx >>> 5]! |= (1 << (idx & 31));
				cellsSet++;
			}
		}
	}
	return { bits, cellsSet, aabb: { x0, y0, x1, y1 }, gridSize };
}

function rasterizePolygon(c: PolygonCoords, gridSize: number, bits: Uint32Array): Bitmap {
	// Clamp pontos pra [0,1]² (aceita distorção; warning ficaria no caller).
	const points = c.points.map(p => ({
		x: Math.max(0, Math.min(1, p.x)),
		y: Math.max(0, Math.min(1, p.y)),
	}));

	if (points.length < 3) {
		return { bits, cellsSet: 0, aabb: { x0: 0, y0: 0, x1: 0, y1: 0 }, gridSize };
	}

	let xmin = 1, ymin = 1, xmax = 0, ymax = 0;
	for (const p of points) {
		if (p.x < xmin) xmin = p.x;
		if (p.x > xmax) xmax = p.x;
		if (p.y < ymin) ymin = p.y;
		if (p.y > ymax) ymax = p.y;
	}
	const aabb: AABB = { x0: xmin, y0: ymin, x1: xmax, y1: ymax };

	if (xmax - xmin <= 0 || ymax - ymin <= 0) {
		return { bits, cellsSet: 0, aabb, gridSize };
	}

	// Scanline fill: pra cada linha y, encontra cruzamentos com edges, ordena, preenche entre pares.
	const iy0 = Math.floor(ymin * gridSize);
	const iy1 = Math.min(gridSize, Math.ceil(ymax * gridSize));

	let cellsSet = 0;
	for (let y = iy0; y < iy1; y++) {
		const yMid = (y + 0.5) / gridSize;
		const intersections: number[] = [];

		for (let i = 0; i < points.length; i++) {
			const p1 = points[i]!;
			const p2 = points[(i + 1) % points.length]!;
			if ((p1.y <= yMid && p2.y > yMid) || (p2.y <= yMid && p1.y > yMid)) {
				const t = (yMid - p1.y) / (p2.y - p1.y);
				intersections.push(p1.x + t * (p2.x - p1.x));
			}
		}

		intersections.sort((a, b) => a - b);

		for (let i = 0; i < intersections.length; i += 2) {
			const xStart = intersections[i];
			const xEnd = intersections[i + 1];
			if (xStart === undefined || xEnd === undefined) break;
			const ix0 = Math.max(0, Math.floor(xStart * gridSize));
			const ix1 = Math.min(gridSize, Math.ceil(xEnd * gridSize));
			for (let x = ix0; x < ix1; x++) {
				const idx = y * gridSize + x;
				bits[idx >>> 5]! |= (1 << (idx & 31));
				cellsSet++;
			}
		}
	}

	return { bits, cellsSet, aabb, gridSize };
}
