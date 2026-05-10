import { describe, it, expect } from 'vitest';
import { findOverlappingLocalMarkers } from '../../../../src/core/icr/contributions/overlapHelper';

describe('findOverlappingLocalMarkers (markdown)', () => {
	it('mesmo fileId + ranges sobrepondo (com sourceText) → match', () => {
		const incoming = { id: 'i1', fileId: 'f1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 50 } } } as any;
		const local = [
			{ id: 'l1', fileId: 'f1', range: { from: { line: 0, ch: 30 }, to: { line: 0, ch: 80 } } } as any,
			{ id: 'l2', fileId: 'f1', range: { from: { line: 1, ch: 0 }, to: { line: 1, ch: 20 } } } as any,
		];
		const sourceText = 'a'.repeat(200);
		const result = findOverlappingLocalMarkers('markdown', incoming, local, sourceText);
		expect(result.map(m => m.id)).toContain('l1');
		expect(result.map(m => m.id)).not.toContain('l2');
	});

	it('fileId diferente → sem match', () => {
		const incoming = { id: 'i1', fileId: 'f1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 50 } } } as any;
		const local = [{ id: 'l1', fileId: 'f2', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 50 } } } as any];
		const result = findOverlappingLocalMarkers('markdown', incoming, local, 'a'.repeat(100));
		expect(result.length).toBe(0);
	});

	it('markdown sem sourceText: retorna [] (modo degraded)', () => {
		const incoming = { id: 'i1', fileId: 'f1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 50 } } } as any;
		const local = [{ id: 'l1', fileId: 'f1', range: { from: { line: 0, ch: 30 }, to: { line: 0, ch: 80 } } } as any];
		const result = findOverlappingLocalMarkers('markdown', incoming, local);
		expect(result.length).toBe(0);
	});
});

describe('findOverlappingLocalMarkers (pdf)', () => {
	it('mesmo fileId + mesma page + range overlap → match', () => {
		const incoming = { id: 'i1', fileId: 'f1', beginIndex: 100, endIndex: 200, page: 0, text: 't' } as any;
		const local = [{ id: 'l1', fileId: 'f1', beginIndex: 150, endIndex: 250, page: 0, text: 't' } as any];
		const result = findOverlappingLocalMarkers('pdf', incoming, local);
		expect(result.length).toBe(1);
	});

	it('mesmo fileId mas page diferente → sem match', () => {
		const incoming = { id: 'i1', fileId: 'f1', beginIndex: 100, endIndex: 200, page: 0, text: 't' } as any;
		const local = [{ id: 'l1', fileId: 'f1', beginIndex: 100, endIndex: 200, page: 1, text: 't' } as any];
		const result = findOverlappingLocalMarkers('pdf', incoming, local);
		expect(result.length).toBe(0);
	});
});

describe('findOverlappingLocalMarkers (csvSegment)', () => {
	it('mesmo row+col + char range overlap → match', () => {
		const incoming = { id: 'i1', fileId: 'f1', sourceRowId: 1, column: 'c1', from: 0, to: 50 } as any;
		const local = [
			{ id: 'l1', fileId: 'f1', sourceRowId: 1, column: 'c1', from: 30, to: 80 } as any,
			{ id: 'l2', fileId: 'f1', sourceRowId: 1, column: 'c2', from: 0, to: 50 } as any, // col diferente
		];
		const result = findOverlappingLocalMarkers('csvSegment', incoming, local);
		expect(result.map(m => m.id)).toEqual(['l1']);
	});

	it('row diferente → sem match', () => {
		const incoming = { id: 'i1', fileId: 'f1', sourceRowId: 1, column: 'c1', from: 0, to: 50 } as any;
		const local = [{ id: 'l1', fileId: 'f1', sourceRowId: 2, column: 'c1', from: 0, to: 50 } as any];
		const result = findOverlappingLocalMarkers('csvSegment', incoming, local);
		expect(result.length).toBe(0);
	});
});
