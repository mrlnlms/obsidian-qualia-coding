import { describe, it, expect } from 'vitest';
import {
	heatmapColor,
	isLightColor,
	generateFileColors,
	computeDisplayMatrix,
	divergentColor,
	isDivergentLight,
	SOURCE_COLORS,
} from '../../src/analytics/views/shared/chartHelpers';
import type { CooccurrenceResult } from '../../src/analytics/data/dataTypes';

// ── Fixtures ─────────────────────────────────────────────────

function makeCooccurrence(
	codes: string[],
	matrix: number[][],
	maxValue?: number,
): CooccurrenceResult {
	return {
		codes,
		colors: codes.map(() => '#6200EE'),
		matrix,
		maxValue: maxValue ?? Math.max(...matrix.flat()),
	};
}

// ── heatmapColor ─────────────────────────────────────────────

describe('heatmapColor', () => {
	it('returns dark zero color for value=0', () => {
		expect(heatmapColor(0, 10, true)).toBe('#2a2a2a');
	});

	it('returns light zero color for value=0', () => {
		expect(heatmapColor(0, 10, false)).toBe('#f5f5f5');
	});

	it('returns dark zero color for maxValue=0', () => {
		expect(heatmapColor(5, 0, true)).toBe('#2a2a2a');
	});

	it('returns light zero color for maxValue=0', () => {
		expect(heatmapColor(5, 0, false)).toBe('#f5f5f5');
	});

	it('returns full intensity in dark mode (value=maxValue)', () => {
		// intensity=1: r=229, g=57, b=53
		expect(heatmapColor(10, 10, true)).toBe('rgb(229,57,53)');
	});

	it('returns full intensity in light mode (value=maxValue)', () => {
		// intensity=1: r=229, g=57, b=53
		expect(heatmapColor(10, 10, false)).toBe('rgb(229,57,53)');
	});

	it('returns mid intensity in dark mode', () => {
		// intensity=0.5: r=round(42+0.5*187)=136, g=round(42+0.5*15)=50, b=round(42+0.5*11)=48
		expect(heatmapColor(5, 10, true)).toBe('rgb(136,50,48)');
	});

	it('returns mid intensity in light mode', () => {
		// intensity=0.5: r=round(245+0.5*(-16))=237, g=round(245+0.5*(-188))=151, b=round(245+0.5*(-192))=149
		expect(heatmapColor(5, 10, false)).toBe('rgb(237,151,149)');
	});

	it('handles value > maxValue (intensity > 1)', () => {
		// intensity=2: values go beyond normal range but still computes
		const result = heatmapColor(20, 10, true);
		expect(result).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
	});

	it('handles very small positive value', () => {
		const result = heatmapColor(0.001, 10, true);
		expect(result).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
	});
});

// ── isLightColor ─────────────────────────────────────────────

describe('isLightColor', () => {
	it('returns true for white', () => {
		expect(isLightColor('rgb(255, 255, 255)')).toBe(true);
	});

	it('returns false for black', () => {
		expect(isLightColor('rgb(0, 0, 0)')).toBe(false);
	});

	it('returns true for non-matching string (default)', () => {
		expect(isLightColor('#ffffff')).toBe(true);
	});

	it('returns true for empty string (default)', () => {
		expect(isLightColor('')).toBe(true);
	});

	it('returns true for malformed rgb string', () => {
		expect(isLightColor('rgb(abc,def,ghi)')).toBe(true);
	});

	it('returns false for dark red', () => {
		expect(isLightColor('rgb(100, 0, 0)')).toBe(false);
	});

	it('returns true for light yellow', () => {
		// luminance = (0.299*255 + 0.587*255 + 0.114*0)/255 = 0.886
		expect(isLightColor('rgb(255, 255, 0)')).toBe(true);
	});

	it('handles boundary luminance around 0.5', () => {
		// luminance = (0.299*128 + 0.587*128 + 0.114*128)/255 ≈ 0.502
		expect(isLightColor('rgb(128, 128, 128)')).toBe(true);
		// luminance = (0.299*127 + 0.587*127 + 0.114*127)/255 ≈ 0.498
		expect(isLightColor('rgb(127, 127, 127)')).toBe(false);
	});

	it('handles rgb without spaces', () => {
		expect(isLightColor('rgb(255,255,255)')).toBe(true);
		expect(isLightColor('rgb(0,0,0)')).toBe(false);
	});
});

// ── generateFileColors ───────────────────────────────────────

describe('generateFileColors', () => {
	it('returns empty array for count=0', () => {
		expect(generateFileColors(0)).toEqual([]);
	});

	it('returns 1 color for count=1', () => {
		const colors = generateFileColors(1);
		expect(colors).toHaveLength(1);
	});

	it('returns N colors for count=N', () => {
		const colors = generateFileColors(5);
		expect(colors).toHaveLength(5);
	});

	it('all colors are valid hsl strings', () => {
		const colors = generateFileColors(10);
		for (const c of colors) {
			expect(c).toMatch(/^hsl\(\d+(\.\d+)?, 60%, 55%\)$/);
		}
	});

	it('first color has hue 0', () => {
		const colors = generateFileColors(1);
		expect(colors[0]).toBe('hsl(0, 60%, 55%)');
	});

	it('second color uses golden angle (137.5)', () => {
		const colors = generateFileColors(2);
		expect(colors[1]).toBe('hsl(137.5, 60%, 55%)');
	});

	it('colors wrap around 360 degrees', () => {
		const colors = generateFileColors(3);
		// third: (2 * 137.5) % 360 = 275
		expect(colors[2]).toBe('hsl(275, 60%, 55%)');
	});

	it('all colors are distinct for moderate count', () => {
		const colors = generateFileColors(20);
		const unique = new Set(colors);
		expect(unique.size).toBe(20);
	});
});

// ── computeDisplayMatrix ─────────────────────────────────────

describe('computeDisplayMatrix', () => {
	// 2 codes: A appears in 3 docs, B appears in 2 docs, they co-occur in 1 doc
	const twoCodeResult = makeCooccurrence(
		['A', 'B'],
		[
			[3, 1],
			[1, 2],
		],
		3,
	);

	describe('absolute mode', () => {
		it('returns raw values', () => {
			const m = computeDisplayMatrix(twoCodeResult, 'absolute');
			expect(m).toEqual([
				[3, 1],
				[1, 2],
			]);
		});
	});

	describe('presence mode', () => {
		it('returns 0/1 for each cell', () => {
			const m = computeDisplayMatrix(twoCodeResult, 'presence');
			expect(m).toEqual([
				[1, 1],
				[1, 1],
			]);
		});

		it('returns 0 for zero co-occurrence', () => {
			const result = makeCooccurrence(
				['A', 'B'],
				[
					[3, 0],
					[0, 2],
				],
				3,
			);
			const m = computeDisplayMatrix(result, 'presence');
			expect(m).toEqual([
				[1, 0],
				[0, 1],
			]);
		});
	});

	describe('jaccard mode', () => {
		it('returns 1 on diagonal when code has markers', () => {
			const m = computeDisplayMatrix(twoCodeResult, 'jaccard');
			expect(m[0]![0]).toBe(1);
			expect(m[1]![1]).toBe(1);
		});

		it('computes correct jaccard index off-diagonal', () => {
			// union = A_freq + B_freq - cooccur = 3 + 2 - 1 = 4
			// jaccard = 1/4 = 0.25
			const m = computeDisplayMatrix(twoCodeResult, 'jaccard');
			expect(m[0]![1]).toBe(0.25);
			expect(m[1]![0]).toBe(0.25);
		});

		it('returns 0 when union is 0', () => {
			const result = makeCooccurrence(
				['A', 'B'],
				[
					[0, 0],
					[0, 0],
				],
				0,
			);
			const m = computeDisplayMatrix(result, 'jaccard');
			expect(m[0]![1]).toBe(0);
		});

		it('returns 0 on diagonal when code frequency is 0', () => {
			const result = makeCooccurrence(
				['A', 'B'],
				[
					[0, 0],
					[0, 2],
				],
				2,
			);
			const m = computeDisplayMatrix(result, 'jaccard');
			expect(m[0]![0]).toBe(0);
			expect(m[1]![1]).toBe(1);
		});
	});

	describe('dice mode', () => {
		it('returns 1 on diagonal when code has markers', () => {
			const m = computeDisplayMatrix(twoCodeResult, 'dice');
			expect(m[0]![0]).toBe(1);
			expect(m[1]![1]).toBe(1);
		});

		it('computes correct dice coefficient off-diagonal', () => {
			// sum = A_freq + B_freq = 3 + 2 = 5
			// dice = 2*1/5 = 0.4
			const m = computeDisplayMatrix(twoCodeResult, 'dice');
			expect(m[0]![1]).toBe(0.4);
			expect(m[1]![0]).toBe(0.4);
		});

		it('returns 0 when sum is 0', () => {
			const result = makeCooccurrence(
				['A', 'B'],
				[
					[0, 0],
					[0, 0],
				],
				0,
			);
			const m = computeDisplayMatrix(result, 'dice');
			expect(m[0]![1]).toBe(0);
		});
	});

	describe('percentage mode', () => {
		it('returns raw value on diagonal', () => {
			const m = computeDisplayMatrix(twoCodeResult, 'percentage');
			expect(m[0]![0]).toBe(3);
			expect(m[1]![1]).toBe(2);
		});

		it('computes correct percentage off-diagonal', () => {
			// minFreq = min(3, 2) = 2
			// percentage = round(1/2 * 100) = 50
			const m = computeDisplayMatrix(twoCodeResult, 'percentage');
			expect(m[0]![1]).toBe(50);
			expect(m[1]![0]).toBe(50);
		});

		it('returns 0 when minFreq is 0', () => {
			const result = makeCooccurrence(
				['A', 'B'],
				[
					[0, 0],
					[0, 2],
				],
				2,
			);
			const m = computeDisplayMatrix(result, 'percentage');
			expect(m[0]![1]).toBe(0);
		});
	});

	describe('edge cases', () => {
		it('handles single code', () => {
			const result = makeCooccurrence(['A'], [[5]], 5);
			const m = computeDisplayMatrix(result, 'absolute');
			expect(m).toEqual([[5]]);
		});

		it('handles empty codes', () => {
			const result = makeCooccurrence([], [], 0);
			const m = computeDisplayMatrix(result, 'absolute');
			expect(m).toEqual([]);
		});

		it('handles 3x3 matrix in jaccard mode', () => {
			// A=5, B=3, C=4; A&B=2, A&C=1, B&C=3
			const result = makeCooccurrence(
				['A', 'B', 'C'],
				[
					[5, 2, 1],
					[2, 3, 3],
					[1, 3, 4],
				],
				5,
			);
			const m = computeDisplayMatrix(result, 'jaccard');
			// A&B jaccard: 2 / (5+3-2) = 2/6 ≈ 0.33
			expect(m[0]![1]).toBe(0.33);
			// B&C jaccard: 3 / (3+4-3) = 3/4 = 0.75
			expect(m[1]![2]).toBe(0.75);
		});
	});
});

// ── divergentColor ───────────────────────────────────────────

describe('divergentColor', () => {
	it('returns warm/red tones for positive z in dark mode', () => {
		const color = divergentColor(5, 10, true);
		const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
		expect(match).not.toBeNull();
		const r = Number(match![1]);
		const g = Number(match![2]);
		expect(r).toBeGreaterThan(g); // red dominant
	});

	it('returns warm/red tones for positive z in light mode', () => {
		const color = divergentColor(5, 10, false);
		const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
		expect(match).not.toBeNull();
		const r = Number(match![1]);
		const g = Number(match![2]);
		expect(r).toBeGreaterThan(g);
	});

	it('returns cool/blue tones for negative z in dark mode', () => {
		const color = divergentColor(-5, 10, true);
		const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
		expect(match).not.toBeNull();
		const b = Number(match![3]);
		const r = Number(match![1]);
		expect(b).toBeGreaterThan(r); // blue dominant
	});

	it('returns cool/blue tones for negative z in light mode', () => {
		const color = divergentColor(-5, 10, false);
		const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
		expect(match).not.toBeNull();
		const b = Number(match![3]);
		const r = Number(match![1]);
		expect(b).toBeGreaterThan(r);
	});

	it('returns neutral (low intensity) for z=0 in dark mode', () => {
		// z=0 takes blue branch with intensity=0: rgb(42,42,42)
		expect(divergentColor(0, 10, true)).toBe('rgb(42,42,42)');
	});

	it('returns neutral (low intensity) for z=0 in light mode', () => {
		// z=0 takes blue branch with intensity=0: rgb(255,255,255)
		expect(divergentColor(0, 10, false)).toBe('rgb(255,255,255)');
	});

	it('clamps maxZ to minimum 3', () => {
		// maxZ=1 should behave as maxZ=3, so z=1 gives intensity=1/3
		const a = divergentColor(1, 1, true);
		const b = divergentColor(1, 3, true);
		expect(a).toBe(b);
	});

	it('clamps intensity to 1 for very large z', () => {
		// z=100, maxZ=10 => intensity=min(10,1)=1, same as z=maxZ
		const a = divergentColor(100, 10, true);
		const b = divergentColor(10, 10, true);
		expect(a).toBe(b);
	});

	it('full positive intensity in dark mode', () => {
		// intensity=1: r=229, g=57, b=53
		expect(divergentColor(10, 10, true)).toBe('rgb(229,57,53)');
	});

	it('full negative intensity in dark mode', () => {
		// intensity=1: r=33, g=150, b=243
		expect(divergentColor(-10, 10, true)).toBe('rgb(33,150,243)');
	});
});

// ── isDivergentLight ─────────────────────────────────────────

describe('isDivergentLight', () => {
	it('returns true for low intensity in dark mode', () => {
		// intensity = 1/10 = 0.1 < 0.3
		expect(isDivergentLight(1, 10, true)).toBe(true);
	});

	it('returns false for high intensity in dark mode', () => {
		// intensity = 5/10 = 0.5 > 0.3
		expect(isDivergentLight(5, 10, true)).toBe(false);
	});

	it('threshold at 0.3 for dark mode', () => {
		// intensity = 3/10 = 0.3, not < 0.3
		expect(isDivergentLight(3, 10, true)).toBe(false);
		// intensity = 2.9/10 = 0.29 < 0.3
		expect(isDivergentLight(2.9, 10, true)).toBe(true);
	});

	it('threshold at 0.5 for light mode', () => {
		// intensity = 5/10 = 0.5, not < 0.5
		expect(isDivergentLight(5, 10, false)).toBe(false);
		// intensity = 4.9/10 = 0.49 < 0.5
		expect(isDivergentLight(4.9, 10, false)).toBe(true);
	});

	it('works with negative z (uses abs)', () => {
		// intensity = abs(-1)/10 = 0.1 < 0.3
		expect(isDivergentLight(-1, 10, true)).toBe(true);
		// intensity = abs(-5)/10 = 0.5 > 0.3
		expect(isDivergentLight(-5, 10, true)).toBe(false);
	});

	it('clamps maxZ to minimum 3', () => {
		// maxZ=1 becomes 3, intensity = 1/3 ≈ 0.33 > 0.3
		expect(isDivergentLight(1, 1, true)).toBe(false);
	});

	it('z=0 returns true (intensity=0)', () => {
		expect(isDivergentLight(0, 10, true)).toBe(true);
		expect(isDivergentLight(0, 10, false)).toBe(true);
	});
});

// ── SOURCE_COLORS ────────────────────────────────────────────

describe('SOURCE_COLORS', () => {
	it('contains all 7 source types', () => {
		const keys = Object.keys(SOURCE_COLORS);
		expect(keys).toHaveLength(7);
		expect(keys).toContain('markdown');
		expect(keys).toContain('csv-segment');
		expect(keys).toContain('csv-row');
		expect(keys).toContain('image');
		expect(keys).toContain('pdf');
		expect(keys).toContain('audio');
		expect(keys).toContain('video');
	});

	it('all values are hex color strings', () => {
		for (const color of Object.values(SOURCE_COLORS)) {
			expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
		}
	});
});
