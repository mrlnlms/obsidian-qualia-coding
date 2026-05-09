import { describe, it, expect } from 'vitest';
import {
	extractMarkdownRange,
	extractPdfRange,
	extractCsvSegmentRange,
} from '../../../src/core/icr/textRange';
import type { Marker } from '../../../src/markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../src/pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../src/csv/csvCodingTypes';

const baseMd = (overrides: Partial<Marker> = {}): Marker => ({
	markerType: 'markdown',
	id: 'm1',
	fileId: 'f1.md',
	range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
	color: '#fff',
	codes: [],
	createdAt: 0,
	updatedAt: 0,
	...overrides,
});

describe('extractMarkdownRange', () => {
	it('converts line/ch to absolute char offset using source text', () => {
		const src = 'linha 1\nlinha 2\nlinha 3';
		const m = baseMd({ range: { from: { line: 1, ch: 0 }, to: { line: 1, ch: 5 } } });
		const r = extractMarkdownRange(m, src);
		expect(r.fileId).toBe('f1.md');
		expect(r.locator).toBe('');
		expect(r.from).toBe(8); // 'linha 1\n' = 8 chars
		expect(r.to).toBe(13);   // 8 + 5
	});

	it('handles line 0 (no leading newline)', () => {
		const src = 'linha 1\nlinha 2';
		const m = baseMd({ range: { from: { line: 0, ch: 2 }, to: { line: 0, ch: 7 } } });
		const r = extractMarkdownRange(m, src);
		expect(r.from).toBe(2);
		expect(r.to).toBe(7);
	});

	it('handles range spanning multiple lines', () => {
		const src = 'linha 1\nlinha 2\nlinha 3';
		const m = baseMd({ range: { from: { line: 0, ch: 3 }, to: { line: 2, ch: 4 } } });
		const r = extractMarkdownRange(m, src);
		expect(r.from).toBe(3);
		expect(r.to).toBe(16 + 4); // 'linha 1\nlinha 2\n' = 16 chars + 4
	});
});

describe('extractPdfRange', () => {
	it('uses page:N as locator + beginIndex/endIndex as from/to', () => {
		const m: PdfMarker = {
			markerType: 'pdf',
			id: 'm1',
			fileId: 'f1.pdf',
			page: 3,
			beginIndex: 10,
			beginOffset: 0,
			endIndex: 25,
			endOffset: 0,
			text: '...',
			codes: [],
			createdAt: 0,
			updatedAt: 0,
		};
		const r = extractPdfRange(m);
		expect(r.fileId).toBe('f1.pdf');
		expect(r.locator).toBe('page:3');
		expect(r.from).toBe(10);
		expect(r.to).toBe(25);
	});
});

describe('extractCsvSegmentRange', () => {
	it('uses row:R|col:C as locator + from/to from cell offsets', () => {
		const m: SegmentMarker = {
			markerType: 'csv',
			id: 'm1',
			fileId: 'f1.csv',
			sourceRowId: 5,
			column: 'response',
			from: 12,
			to: 20,
			codes: [],
			createdAt: 0,
			updatedAt: 0,
		};
		const r = extractCsvSegmentRange(m);
		expect(r.fileId).toBe('f1.csv');
		expect(r.locator).toBe('row:5|col:response');
		expect(r.from).toBe(12);
		expect(r.to).toBe(20);
	});
});
