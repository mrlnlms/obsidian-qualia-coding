/**
 * IoU (Intersection over Union) entre dois bitmaps rasterizados.
 *
 * Strategy:
 * 1. AABB early-out — se bounding boxes não intersectam, retorna 0 sem tocar bits.
 * 2. AND bit-a-bit das Uint32Arrays + popcount = intersection (cells comuns).
 * 3. union = a.cellsSet + b.cellsSet - intersection.
 * 4. IoU = intersection / union.
 */

import type { Bitmap, AABB } from './bboxRaster';

export function iou(a: Bitmap, b: Bitmap): number {
	if (a.gridSize !== b.gridSize) {
		throw new Error(`iou: gridSize mismatch (${a.gridSize} vs ${b.gridSize})`);
	}
	if (a.cellsSet === 0 || b.cellsSet === 0) return 0;
	if (!aabbOverlap(a.aabb, b.aabb)) return 0;

	const len = Math.min(a.bits.length, b.bits.length);
	let intersection = 0;
	for (let i = 0; i < len; i++) {
		intersection += popcount32(a.bits[i]! & b.bits[i]!);
	}

	const union = a.cellsSet + b.cellsSet - intersection;
	if (union === 0) return 0;
	return intersection / union;
}

function aabbOverlap(a: AABB, b: AABB): boolean {
	return !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
}

/** Hamming weight de um uint32 (Brian Kernighan / SWAR). */
function popcount32(n: number): number {
	n = n - ((n >>> 1) & 0x55555555);
	n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
	n = (n + (n >>> 4)) & 0x0f0f0f0f;
	return (n * 0x01010101) >>> 24;
}
