import { describe, it, expect, vi } from 'vitest';
import { Text } from '@codemirror/state';
import {
	cm6OffsetToPos,
	classifyMarkersAtPos,
	findSmallestMarkerAtPos,
	MarkerHitResult,
} from '../../src/markdown/cm6/utils/markerPositionUtils';

// Mock viewLookupUtils — collectMarkersAtPos uses it as fallback
vi.mock('../../src/markdown/cm6/utils/viewLookupUtils', () => ({
	getViewForFile: () => null,
}));

// ── Helpers ──

function makeDoc(lines: string[]): Text {
	return Text.of(lines);
}

function makeMockView(doc: Text) {
	return { state: { doc } } as any;
}

function makeMockModel(markers: Array<{
	id: string;
	range: { from: { line: number; ch: number }; to: { line: number; ch: number } };
}>) {
	return {
		getMarkersForFile: vi.fn().mockReturnValue(markers),
	} as any;
}

const mockApp = {} as any;

// ════════════════════════════════════════════════════════════════════
// 1. cm6OffsetToPos
// ════════════════════════════════════════════════════════════════════

describe('cm6OffsetToPos', () => {
	const doc = makeDoc(['hello world', 'second line', 'third line']);
	// Offsets: "hello world" = 0..10, \n at 11, "second line" = 12..22, \n at 23, "third line" = 24..33

	it('offset 0 → {line:0, ch:0}', () => {
		expect(cm6OffsetToPos(doc, 0)).toEqual({ line: 0, ch: 0 });
	});

	it('middle of first line', () => {
		expect(cm6OffsetToPos(doc, 5)).toEqual({ line: 0, ch: 5 });
	});

	it('end of first line', () => {
		expect(cm6OffsetToPos(doc, 11)).toEqual({ line: 0, ch: 11 });
	});

	it('start of second line', () => {
		// offset 12 is first char of "second line"
		expect(cm6OffsetToPos(doc, 12)).toEqual({ line: 1, ch: 0 });
	});

	it('middle of second line', () => {
		expect(cm6OffsetToPos(doc, 19)).toEqual({ line: 1, ch: 7 });
	});

	it('start of third line', () => {
		expect(cm6OffsetToPos(doc, 24)).toEqual({ line: 2, ch: 0 });
	});

	it('end of document', () => {
		expect(cm6OffsetToPos(doc, doc.length)).toEqual({ line: 2, ch: 10 });
	});

	it('negative offset clamped to 0', () => {
		expect(cm6OffsetToPos(doc, -5)).toEqual({ line: 0, ch: 0 });
	});

	it('offset beyond doc length clamped to end', () => {
		expect(cm6OffsetToPos(doc, 999)).toEqual({ line: 2, ch: 10 });
	});

	it('empty doc — offset 0', () => {
		const emptyDoc = makeDoc(['']);
		expect(cm6OffsetToPos(emptyDoc, 0)).toEqual({ line: 0, ch: 0 });
	});

	it('empty doc — positive offset clamped', () => {
		const emptyDoc = makeDoc(['']);
		expect(cm6OffsetToPos(emptyDoc, 10)).toEqual({ line: 0, ch: 0 });
	});

	it('single-line doc', () => {
		const singleDoc = makeDoc(['abcdef']);
		expect(cm6OffsetToPos(singleDoc, 3)).toEqual({ line: 0, ch: 3 });
	});
});

// ════════════════════════════════════════════════════════════════════
// 2. classifyMarkersAtPos
// ════════════════════════════════════════════════════════════════════

describe('classifyMarkersAtPos', () => {
	// Doc: "hello world" (line 0, 11 chars), "second line" (line 1, 11 chars), "third line" (line 2, 10 chars)
	const doc = makeDoc(['hello world', 'second line', 'third line']);
	const view = makeMockView(doc);
	const fileId = 'test.md';

	it('no markers → empty result', () => {
		const model = makeMockModel([]);
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result).toEqual({ markerId: null, hoveredIds: [], isPartialOverlap: false });
	});

	it('position outside all markers → empty result', () => {
		const model = makeMockModel([
			{ id: 'm1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 3 } } },
		]);
		// offset 3 is the boundary (inclusive), offset 5 is outside
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result).toEqual({ markerId: null, hoveredIds: [], isPartialOverlap: false });
	});

	it('single marker containing pos → returns that marker', () => {
		const model = makeMockModel([
			{ id: 'm1', range: { from: { line: 0, ch: 2 }, to: { line: 0, ch: 8 } } },
		]);
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result).toEqual({ markerId: 'm1', hoveredIds: ['m1'], isPartialOverlap: false });
	});

	it('pos at marker start boundary → included', () => {
		const model = makeMockModel([
			{ id: 'm1', range: { from: { line: 0, ch: 5 }, to: { line: 0, ch: 10 } } },
		]);
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result.markerId).toBe('m1');
	});

	it('pos at marker end boundary → included', () => {
		const model = makeMockModel([
			{ id: 'm1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } } },
		]);
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result.markerId).toBe('m1');
	});

	it('two nested markers → smallest wins', () => {
		const model = makeMockModel([
			{ id: 'outer', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } } },
			{ id: 'inner', range: { from: { line: 0, ch: 3 }, to: { line: 0, ch: 7 } } },
		]);
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result.markerId).toBe('inner');
		expect(result.hoveredIds).toEqual(['inner']);
		expect(result.isPartialOverlap).toBe(false);
	});

	it('three nested markers → smallest wins', () => {
		const model = makeMockModel([
			{ id: 'outer', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } } },
			{ id: 'mid', range: { from: { line: 0, ch: 2 }, to: { line: 0, ch: 8 } } },
			{ id: 'inner', range: { from: { line: 0, ch: 4 }, to: { line: 0, ch: 6 } } },
		]);
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result.markerId).toBe('inner');
		expect(result.isPartialOverlap).toBe(false);
	});

	it('two partially overlapping markers → isPartialOverlap true, markerId null', () => {
		// m1: [0..7], m2: [5..10] — overlap at [5..7], neither contains the other
		const model = makeMockModel([
			{ id: 'm1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 7 } } },
			{ id: 'm2', range: { from: { line: 0, ch: 5 }, to: { line: 0, ch: 10 } } },
		]);
		const result = classifyMarkersAtPos(6, fileId, model, view, mockApp);
		expect(result.markerId).toBeNull();
		expect(result.isPartialOverlap).toBe(true);
		expect(result.hoveredIds).toContain('m1');
		expect(result.hoveredIds).toContain('m2');
	});

	it('partial overlap with three markers → isPartialOverlap true', () => {
		// outer contains both, but m1 and m2 partially overlap each other
		const model = makeMockModel([
			{ id: 'outer', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } } },
			{ id: 'm1', range: { from: { line: 0, ch: 1 }, to: { line: 0, ch: 6 } } },
			{ id: 'm2', range: { from: { line: 0, ch: 4 }, to: { line: 0, ch: 9 } } },
		]);
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result.markerId).toBeNull();
		expect(result.isPartialOverlap).toBe(true);
		expect(result.hoveredIds).toHaveLength(3);
	});

	it('multi-line marker containing pos', () => {
		const model = makeMockModel([
			{ id: 'ml', range: { from: { line: 0, ch: 5 }, to: { line: 1, ch: 6 } } },
		]);
		// pos in middle of second line: offset 12 + 3 = 15
		const result = classifyMarkersAtPos(15, fileId, model, view, mockApp);
		expect(result.markerId).toBe('ml');
	});

	it('marker with invalid line is skipped gracefully', () => {
		const model = makeMockModel([
			{ id: 'bad', range: { from: { line: 99, ch: 0 }, to: { line: 99, ch: 5 } } },
		]);
		// doc.line(100) will throw — collectMarkersAtPos catches and continues
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		expect(result).toEqual({ markerId: null, hoveredIds: [], isPartialOverlap: false });
	});

	it('identical range markers are treated as nested (one contains the other)', () => {
		const model = makeMockModel([
			{ id: 'm1', range: { from: { line: 0, ch: 2 }, to: { line: 0, ch: 8 } } },
			{ id: 'm2', range: { from: { line: 0, ch: 2 }, to: { line: 0, ch: 8 } } },
		]);
		const result = classifyMarkersAtPos(5, fileId, model, view, mockApp);
		// Both have same range so aContainsB and bContainsA are true — no partial overlap
		expect(result.isPartialOverlap).toBe(false);
		expect(result.markerId).not.toBeNull();
	});
});

// ════════════════════════════════════════════════════════════════════
// 3. findSmallestMarkerAtPos
// ════════════════════════════════════════════════════════════════════

describe('findSmallestMarkerAtPos', () => {
	const doc = makeDoc(['hello world', 'second line', 'third line']);
	const view = makeMockView(doc);
	const fileId = 'test.md';

	it('returns null when no markers', () => {
		const model = makeMockModel([]);
		expect(findSmallestMarkerAtPos(5, fileId, model, view, mockApp)).toBeNull();
	});

	it('returns markerId of single marker', () => {
		const model = makeMockModel([
			{ id: 'm1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } } },
		]);
		expect(findSmallestMarkerAtPos(5, fileId, model, view, mockApp)).toBe('m1');
	});

	it('returns smallest nested marker', () => {
		const model = makeMockModel([
			{ id: 'big', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } } },
			{ id: 'small', range: { from: { line: 0, ch: 3 }, to: { line: 0, ch: 7 } } },
		]);
		expect(findSmallestMarkerAtPos(5, fileId, model, view, mockApp)).toBe('small');
	});

	it('returns null on partial overlap', () => {
		const model = makeMockModel([
			{ id: 'm1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 7 } } },
			{ id: 'm2', range: { from: { line: 0, ch: 5 }, to: { line: 0, ch: 10 } } },
		]);
		expect(findSmallestMarkerAtPos(6, fileId, model, view, mockApp)).toBeNull();
	});
});
