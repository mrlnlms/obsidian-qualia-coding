import { describe, it, expect } from 'vitest';
import {
	extractMarkdownRange,
	extractPdfRange,
	extractCsvSegmentRange,
	extractMediaRange,
} from '../../../src/core/icr/textRange';
import type { Marker } from '../../../src/markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../src/pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../src/csv/csvCodingTypes';
import type { MediaMarker } from '../../../src/media/mediaTypes';

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

describe('extractMediaRange', () => {
	it('rounds from/to to integer seconds (floor/ceil) — audio', () => {
		const m: MediaMarker = {
			markerType: 'audio', id: 'm1', fileId: 'audio.mp3',
			from: 12.3, to: 18.7,
			codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = extractMediaRange(m);
		expect(r.fileId).toBe('audio.mp3');
		expect(r.locator).toBe('audio');
		expect(r.from).toBe(12);
		expect(r.to).toBe(19);
	});

	it('uses video locator pra video markers', () => {
		const m: MediaMarker = {
			markerType: 'video', id: 'm2', fileId: 'video.mp4',
			from: 5.0, to: 10.0, codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = extractMediaRange(m);
		expect(r.locator).toBe('video');
		expect(r.from).toBe(5);
		expect(r.to).toBe(10);
	});

	it('handles fractional seconds < 1', () => {
		const m: MediaMarker = {
			markerType: 'audio', id: 'm3', fileId: 'a.mp3',
			from: 0.1, to: 0.9, codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = extractMediaRange(m);
		expect(r.from).toBe(0);
		expect(r.to).toBe(1);
	});

	it('aceita resolution = 0.1 (100ms ticks) — units menores que 1s entram no unit space', () => {
		// Marker 12.345s a 18.789s. Com resolution=0.1, unit space é centiseconds (1 tick = 100ms).
		// from = floor(12.345 / 0.1) = floor(123.45) = 123
		// to   = ceil(18.789 / 0.1)  = ceil(187.89)  = 188
		const m: MediaMarker = {
			markerType: 'audio', id: 'm1', fileId: 'a.mp3',
			from: 12.345, to: 18.789, codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = extractMediaRange(m, 0.1);
		expect(r.from).toBe(123);
		expect(r.to).toBe(188);
	});

	it('aceita resolution = 0.01 (10ms ticks) — para micro-events em conversation analysis/prosody', () => {
		const m: MediaMarker = {
			markerType: 'video', id: 'm2', fileId: 'v.mp4',
			from: 0.05, to: 0.07, codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = extractMediaRange(m, 0.01);
		expect(r.from).toBe(5);
		expect(r.to).toBe(7);
	});

	it('sub-second disagreement entre 2 coders aparece em resolution=0.1 (mas não em 1s)', () => {
		// Cenário: coder A marca 0-0.5s, coder B marca 0.6-1.0s. Disagreement de 600ms.
		// Em resolution=1: A vira [0,1) e B vira [0,1) — overlap aparente perfeito.
		// Em resolution=0.1: A vira [0,5) e B vira [6,10) — disagreement visível.
		const a: MediaMarker = {
			markerType: 'audio', id: 'a', fileId: 'f',
			from: 0.0, to: 0.5, codes: [], createdAt: 1, updatedAt: 1,
		};
		const b: MediaMarker = {
			markerType: 'audio', id: 'b', fileId: 'f',
			from: 0.6, to: 1.0, codes: [], createdAt: 1, updatedAt: 1,
		};
		// 1s resolution: ambos cobrem unit [0,1) — falso agreement
		const a_1s = extractMediaRange(a, 1);
		const b_1s = extractMediaRange(b, 1);
		expect(a_1s.from).toBe(0); expect(a_1s.to).toBe(1);
		expect(b_1s.from).toBe(0); expect(b_1s.to).toBe(1);
		// 0.1s resolution: ranges disjuntos
		const a_100ms = extractMediaRange(a, 0.1);
		const b_100ms = extractMediaRange(b, 0.1);
		expect(a_100ms.from).toBe(0); expect(a_100ms.to).toBe(5);
		expect(b_100ms.from).toBe(6); expect(b_100ms.to).toBe(10);
	});

	it('resolution default = 1 (backwards compat com chamadas sem 2o arg)', () => {
		const m: MediaMarker = {
			markerType: 'audio', id: 'm', fileId: 'f',
			from: 3.5, to: 7.5, codes: [], createdAt: 1, updatedAt: 1,
		};
		const rDefault = extractMediaRange(m);
		const rExplicit = extractMediaRange(m, 1);
		expect(rDefault).toEqual(rExplicit);
	});
});
