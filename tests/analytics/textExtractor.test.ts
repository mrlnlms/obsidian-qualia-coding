import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextExtractor } from '../../src/analytics/data/textExtractor';
import type { UnifiedMarker, SourceType } from '../../src/analytics/data/dataTypes';

// ── Helpers ──────────────────────────────────────────────────────

function makeMarker(
	id: string,
	source: SourceType,
	fileId: string,
	codes: string[],
	meta?: UnifiedMarker['meta'],
): UnifiedMarker {
	return { id, source, fileId, codes, meta };
}

// ── Mock vault + file contents ───────────────────────────────────

let fileContents: Map<string, string>;

function createMockVault() {
	return {
		adapter: {
			read: vi.fn().mockImplementation(async (path: string) => fileContents.get(path) ?? ''),
		},
	} as any;
}

// ── Tests ────────────────────────────────────────────────────────

describe('TextExtractor', () => {
	let mockVault: ReturnType<typeof createMockVault>;
	let extractor: TextExtractor;

	beforeEach(() => {
		fileContents = new Map();
		mockVault = createMockVault();
		extractor = new TextExtractor(mockVault);
	});

	// ── extractBatch basics ──────────────────────────────────────

	describe('extractBatch basics', () => {
		it('returns empty array for empty markers', async () => {
			const result = await extractor.extractBatch([]);
			expect(result).toEqual([]);
		});

		it('extracts a single markdown marker', async () => {
			fileContents.set('doc.md', 'line zero\nline one\nline two');
			const markers = [makeMarker('m1', 'markdown', 'doc.md', ['A'], { fromLine: 1, toLine: 1 })];
			const result = await extractor.extractBatch(markers);
			expect(result).toHaveLength(1);
			expect(result[0].text).toBe('line one');
			expect(result[0].markerId).toBe('m1');
		});

		it('reads file only once for multiple markers from same file', async () => {
			fileContents.set('doc.md', 'hello\nworld');
			const markers = [
				makeMarker('m1', 'markdown', 'doc.md', ['A'], { fromLine: 0, toLine: 0 }),
				makeMarker('m2', 'markdown', 'doc.md', ['B'], { fromLine: 1, toLine: 1 }),
			];
			await extractor.extractBatch(markers);
			expect(mockVault.adapter.read).toHaveBeenCalledTimes(1);
		});

		it('returns empty text when file read fails', async () => {
			mockVault.adapter.read.mockRejectedValueOnce(new Error('not found'));
			const markers = [makeMarker('m1', 'markdown', 'missing.md', ['A'], { fromLine: 0, toLine: 0 })];
			const result = await extractor.extractBatch(markers);
			expect(result[0].text).toBe('');
		});
	});

	// ── Markdown extraction ──────────────────────────────────────

	describe('markdown extraction', () => {
		it('extracts single full line', async () => {
			fileContents.set('f.md', 'alpha\nbeta\ngamma');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'markdown', 'f.md', ['A'], { fromLine: 1, toLine: 1 }),
			]);
			expect(result[0].text).toBe('beta');
		});

		it('extracts sub-line with fromCh/toCh', async () => {
			fileContents.set('f.md', 'hello world');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'markdown', 'f.md', ['A'], { fromLine: 0, toLine: 0, fromCh: 6, toCh: 11 }),
			]);
			expect(result[0].text).toBe('world');
		});

		it('extracts multi-line range', async () => {
			fileContents.set('f.md', 'line0\nline1\nline2\nline3');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'markdown', 'f.md', ['A'], { fromLine: 1, toLine: 2 }),
			]);
			expect(result[0].text).toBe('line1\nline2');
		});

		it('extracts multi-line with fromCh on first line and toCh on last line', async () => {
			fileContents.set('f.md', 'abcdef\nghijkl\nmnopqr');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'markdown', 'f.md', ['A'], { fromLine: 0, toLine: 2, fromCh: 3, toCh: 3 }),
			]);
			// First line sliced from ch 3 => "def", middle line full => "ghijkl", last line sliced to ch 3 => "mno"
			expect(result[0].text).toBe('def\nghijkl\nmno');
		});

		it('returns empty when fromLine is beyond file length', async () => {
			fileContents.set('f.md', 'only one line');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'markdown', 'f.md', ['A'], { fromLine: 999, toLine: 999 }),
			]);
			expect(result[0].text).toBe('');
		});

		it('defaults to line 0 when meta is missing', async () => {
			fileContents.set('f.md', 'first line\nsecond line');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'markdown', 'f.md', ['A']),
			]);
			expect(result[0].text).toBe('first line');
		});
	});

	// ── CSV segment extraction ───────────────────────────────────

	describe('csv segment extraction', () => {
		it('extracts cell by row and column', async () => {
			fileContents.set('data.csv', 'name,age\nAlice,30\nBob,25');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-segment', 'data.csv', ['A'], { row: 0, column: 'age' }),
			]);
			expect(result[0].text).toBe('30');
		});

		it('extracts sub-cell with fromCh/toCh', async () => {
			fileContents.set('data.csv', 'text\nhello world');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-segment', 'data.csv', ['A'], { row: 0, column: 'text', fromCh: 0, toCh: 5 }),
			]);
			expect(result[0].text).toBe('hello');
		});

		it('returns empty for missing column', async () => {
			fileContents.set('data.csv', 'name,age\nAlice,30');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-segment', 'data.csv', ['A'], { row: 0, column: 'nonexistent' }),
			]);
			expect(result[0].text).toBe('');
		});

		it('returns empty for row out of range', async () => {
			fileContents.set('data.csv', 'name,age\nAlice,30');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-segment', 'data.csv', ['A'], { row: 99, column: 'name' }),
			]);
			expect(result[0].text).toBe('');
		});

		it('handles quoted CSV fields with commas (tests parseCsv indirectly)', async () => {
			fileContents.set('data.csv', 'name,desc\nAlice,"likes cats, dogs"');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-segment', 'data.csv', ['A'], { row: 0, column: 'desc' }),
			]);
			expect(result[0].text).toBe('likes cats, dogs');
		});
	});

	// ── CSV row extraction ───────────────────────────────────────

	describe('csv row extraction', () => {
		it('extracts specific column from row', async () => {
			fileContents.set('data.csv', 'name,age\nAlice,30\nBob,25');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-row', 'data.csv', ['A'], { row: 1, column: 'name' }),
			]);
			expect(result[0].text).toBe('Bob');
		});

		it('joins all cells when no column specified', async () => {
			fileContents.set('data.csv', 'name,age\nAlice,30');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-row', 'data.csv', ['A'], { row: 0 }),
			]);
			expect(result[0].text).toBe('Alice | 30');
		});

		it('returns empty for row out of range', async () => {
			fileContents.set('data.csv', 'name\nAlice');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-row', 'data.csv', ['A'], { row: 99 }),
			]);
			expect(result[0].text).toBe('');
		});
	});

	// ── PDF extraction ───────────────────────────────────────────

	describe('pdf extraction', () => {
		it('returns pdfText from meta when present', async () => {
			const result = await extractor.extractBatch([
				makeMarker('m1', 'pdf', 'doc.pdf', ['A'], { pdfText: 'selected text from PDF' }),
			]);
			expect(result[0].text).toBe('selected text from PDF');
		});

		it('returns fallback when no pdfText', async () => {
			const result = await extractor.extractBatch([
				makeMarker('m1', 'pdf', 'doc.pdf', ['A'], { page: 1 }),
			]);
			expect(result[0].text).toBe('[pdf selection]');
		});
	});

	// ── Image extraction ─────────────────────────────────────────

	describe('image extraction', () => {
		it('always returns "[image region]"', async () => {
			const result = await extractor.extractBatch([
				makeMarker('m1', 'image', 'photo.png', ['A']),
			]);
			expect(result[0].text).toBe('[image region]');
		});
	});

	// ── Audio extraction ─────────────────────────────────────────

	describe('audio extraction', () => {
		it('returns formatted time range', async () => {
			const result = await extractor.extractBatch([
				makeMarker('m1', 'audio', 'clip.mp3', ['A'], { audioFrom: 65.5, audioTo: 130.3 }),
			]);
			// 65.5s = 1:05.5, 130.3s = 2:10.3
			expect(result[0].text).toBe('1:05.5 \u2013 2:10.3');
		});

		it('defaults to 0:00.0 when meta is missing', async () => {
			const result = await extractor.extractBatch([
				makeMarker('m1', 'audio', 'clip.mp3', ['A']),
			]);
			expect(result[0].text).toBe('0:00.0 \u2013 0:00.0');
		});
	});

	// ── Video extraction ─────────────────────────────────────────

	describe('video extraction', () => {
		it('returns formatted time range like audio', async () => {
			const result = await extractor.extractBatch([
				makeMarker('m1', 'video', 'clip.mp4', ['A'], { videoFrom: 0, videoTo: 90.7 }),
			]);
			expect(result[0].text).toBe('0:00.0 \u2013 1:30.7');
		});
	});

	// ── parseCsv (indirect via CSV extraction) ───────────────────

	describe('parseCsv (indirect)', () => {
		it('handles simple comma-separated values', async () => {
			fileContents.set('d.csv', 'a,b,c\n1,2,3');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-row', 'd.csv', ['A'], { row: 0 }),
			]);
			expect(result[0].text).toBe('1 | 2 | 3');
		});

		it('handles quoted fields with commas inside', async () => {
			fileContents.set('d.csv', 'col\n"a,b,c"');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-segment', 'd.csv', ['A'], { row: 0, column: 'col' }),
			]);
			expect(result[0].text).toBe('a,b,c');
		});

		it('handles escaped quotes (double-quote)', async () => {
			fileContents.set('d.csv', 'col\n"she said ""hi"""');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-segment', 'd.csv', ['A'], { row: 0, column: 'col' }),
			]);
			expect(result[0].text).toBe('she said "hi"');
		});

		it('handles CRLF line endings', async () => {
			fileContents.set('d.csv', 'a,b\r\n1,2\r\n3,4');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-row', 'd.csv', ['A'], { row: 1 }),
			]);
			expect(result[0].text).toBe('3 | 4');
		});

		it('handles empty fields', async () => {
			fileContents.set('d.csv', 'a,b,c\n,hello,end');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'csv-row', 'd.csv', ['A'], { row: 0 }),
			]);
			expect(result[0].text).toBe(' | hello | end');
		});
	});

	// ── Segment metadata pass-through ────────────────────────────

	describe('segment metadata pass-through', () => {
		it('preserves fromLine, toLine, fromCh, toCh in result', async () => {
			fileContents.set('f.md', 'hello world');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'markdown', 'f.md', ['A'], { fromLine: 0, toLine: 0, fromCh: 2, toCh: 7 }),
			]);
			expect(result[0].fromLine).toBe(0);
			expect(result[0].toLine).toBe(0);
			expect(result[0].fromCh).toBe(2);
			expect(result[0].toCh).toBe(7);
		});

		it('preserves meta object in result', async () => {
			const meta: UnifiedMarker['meta'] = { fromLine: 1, toLine: 3, page: 5 };
			fileContents.set('f.md', 'a\nb\nc\nd');
			const result = await extractor.extractBatch([
				makeMarker('m1', 'markdown', 'f.md', ['A'], meta),
			]);
			expect(result[0].meta).toBe(meta);
		});

		it('preserves source type in result', async () => {
			const result = await extractor.extractBatch([
				makeMarker('m1', 'image', 'img.png', ['A']),
			]);
			expect(result[0].source).toBe('image');
		});

		it('preserves codes in result', async () => {
			const result = await extractor.extractBatch([
				makeMarker('m1', 'image', 'img.png', ['X', 'Y', 'Z']),
			]);
			expect(result[0].codes).toEqual(['X', 'Y', 'Z']);
		});
	});
});
