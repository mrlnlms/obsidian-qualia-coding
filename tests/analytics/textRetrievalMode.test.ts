import { describe, it, expect } from 'vitest';
import { formatAudioTime, formatLocation } from '../../src/analytics/views/modes/textRetrievalMode';
import type { ExtractedSegment } from '../../src/analytics/data/textExtractor';
import type { SourceType } from '../../src/analytics/data/dataTypes';

function makeSeg(source: SourceType, overrides: Partial<ExtractedSegment> = {}): ExtractedSegment {
	return {
		id: 'seg-1',
		fileId: 'test.md',
		source,
		codes: ['A'],
		text: 'sample text',
		...overrides,
	};
}

// ── formatAudioTime ──

describe('formatAudioTime', () => {
	it('formats 0 seconds', () => {
		expect(formatAudioTime(0)).toBe('0:00.0');
	});

	it('formats seconds under a minute', () => {
		expect(formatAudioTime(5.3)).toBe('0:05.3');
	});

	it('formats exactly 60 seconds', () => {
		expect(formatAudioTime(60)).toBe('1:00.0');
	});

	it('formats over a minute', () => {
		expect(formatAudioTime(95.7)).toBe('1:35.7');
	});

	it('pads single-digit seconds', () => {
		expect(formatAudioTime(3.1)).toBe('0:03.1');
	});

	it('handles negative as fallback', () => {
		expect(formatAudioTime(-5)).toBe('0:00.0');
	});

	it('handles Infinity', () => {
		expect(formatAudioTime(Infinity)).toBe('0:00.0');
	});

	it('handles NaN', () => {
		expect(formatAudioTime(NaN)).toBe('0:00.0');
	});
});

// ── formatLocation ──

describe('formatLocation', () => {
	it('returns time range for audio segment', () => {
		const seg = makeSeg('audio', { meta: { audioFrom: 5, audioTo: 10 } });
		const result = formatLocation(seg);
		expect(result).toContain('0:05.0');
		expect(result).toContain('0:10.0');
	});

	it('returns empty for audio without meta', () => {
		expect(formatLocation(makeSeg('audio'))).toBe('');
	});

	it('returns time range for video segment', () => {
		const seg = makeSeg('video', { meta: { videoFrom: 60, videoTo: 90 } });
		const result = formatLocation(seg);
		expect(result).toContain('1:00.0');
		expect(result).toContain('1:30.0');
	});

	it('returns empty for video without meta', () => {
		expect(formatLocation(makeSeg('video'))).toBe('');
	});

	it('returns Row N:col for csv-row', () => {
		const seg = makeSeg('csv-row', { meta: { row: 3, column: 'name' } });
		expect(formatLocation(seg)).toBe('Row 3:name');
	});

	it('returns Row N for csv-row without column', () => {
		const seg = makeSeg('csv-row', { meta: { row: 3 } });
		expect(formatLocation(seg)).toBe('Row 3');
	});

	it('returns Row N:col for csv-segment', () => {
		const seg = makeSeg('csv-segment', { meta: { row: 5, column: 'desc' } });
		expect(formatLocation(seg)).toBe('Row 5:desc');
	});

	it('returns empty for csv-segment without row', () => {
		expect(formatLocation(makeSeg('csv-segment'))).toBe('');
	});

	it('returns region type for image', () => {
		const seg = makeSeg('image', { meta: { regionType: 'ellipse' } });
		expect(formatLocation(seg)).toBe('ellipse');
	});

	it('returns "region" as fallback for image without meta', () => {
		const seg = makeSeg('image', { meta: {} });
		expect(formatLocation(seg)).toBe('region');
	});

	it('returns Page N for pdf (already 1-indexed)', () => {
		const seg = makeSeg('pdf', { meta: { page: 2 } });
		expect(formatLocation(seg)).toBe('Page 2');
	});

	it('returns empty for pdf without page', () => {
		expect(formatLocation(makeSeg('pdf'))).toBe('');
	});

	it('returns single line for markdown (same from/to)', () => {
		const seg = makeSeg('markdown', { fromLine: 4, toLine: 4 });
		expect(formatLocation(seg)).toBe('L5');
	});

	it('returns line range for markdown (different from/to)', () => {
		const seg = makeSeg('markdown', { fromLine: 0, toLine: 3 });
		expect(formatLocation(seg)).toBe('L1\u20134');
	});

	it('returns empty for markdown without line info', () => {
		expect(formatLocation(makeSeg('markdown'))).toBe('');
	});
});
