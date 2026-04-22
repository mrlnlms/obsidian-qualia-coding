import { describe, it, expect } from 'vitest';
import { calculateTextStats } from '../../src/analytics/data/textAnalysis';
import type { ExtractedSegment } from '../../src/analytics/data/textExtractor';

function mkSegment(overrides: Partial<ExtractedSegment> & { codes: string[]; text: string }): ExtractedSegment {
	return {
		markerId: 'm1',
		source: 'markdown',
		fileId: 'f1',
		...overrides,
	};
}

describe('calculateTextStats', () => {
	it('returns empty for no segments', () => {
		const res = calculateTextStats([], new Map());
		expect(res.codes).toEqual([]);
		expect(res.global.totalSegments).toBe(0);
		expect(res.global.totalWords).toBe(0);
		expect(res.global.uniqueWords).toBe(0);
		expect(res.global.ttr).toBe(0);
	});

	it('counts words correctly', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['a'], text: 'hello world foo' })],
			new Map([['a', { name: 'a', color: '#F00' }]]),
		);
		expect(res.codes[0].totalWords).toBe(3);
		expect(res.codes[0].uniqueWords).toBe(3);
	});

	it('counts unique words (case insensitive)', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['a'], text: 'Hello hello HELLO world' })],
			new Map(),
		);
		expect(res.codes[0].totalWords).toBe(4);
		expect(res.codes[0].uniqueWords).toBe(2); // hello, world
	});

	it('calculates TTR correctly', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['a'], text: 'the the the cat' })],
			new Map(),
		);
		// 4 total, 2 unique => TTR = 0.5
		expect(res.codes[0].ttr).toBe(0.5);
	});

	it('TTR is 1.0 when all words are unique', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['a'], text: 'apple banana cherry' })],
			new Map(),
		);
		expect(res.codes[0].ttr).toBe(1);
	});

	it('TTR is 0 for empty text (no words)', () => {
		// Segments with empty text are skipped entirely
		const res = calculateTextStats(
			[mkSegment({ codes: ['a'], text: '' })],
			new Map(),
		);
		expect(res.codes).toEqual([]);
	});

	it('counts segments per code', () => {
		const res = calculateTextStats(
			[
				mkSegment({ markerId: 'm1', codes: ['a'], text: 'word one' }),
				mkSegment({ markerId: 'm2', codes: ['a'], text: 'word two' }),
				mkSegment({ markerId: 'm3', codes: ['b'], text: 'other text' }),
			],
			new Map(),
		);
		const codeA = res.codes.find(c => c.code === 'a')!;
		const codeB = res.codes.find(c => c.code === 'b')!;
		expect(codeA.segmentCount).toBe(2);
		expect(codeB.segmentCount).toBe(1);
	});

	it('calculates avgWordsPerSegment', () => {
		const res = calculateTextStats(
			[
				mkSegment({ markerId: 'm1', codes: ['a'], text: 'one two three' }),
				mkSegment({ markerId: 'm2', codes: ['a'], text: 'four' }),
			],
			new Map(),
		);
		// (3 + 1) / 2 = 2.0
		expect(res.codes[0].avgWordsPerSegment).toBe(2);
	});

	it('calculates avgCharsPerSegment', () => {
		const res = calculateTextStats(
			[
				mkSegment({ markerId: 'm1', codes: ['a'], text: 'abc' }),     // 3 chars
				mkSegment({ markerId: 'm2', codes: ['a'], text: 'defghij' }), // 7 chars
			],
			new Map(),
		);
		// (3 + 7) / 2 = 5
		expect(res.codes[0].avgCharsPerSegment).toBe(5);
	});

	it('skips image source segments', () => {
		const res = calculateTextStats(
			[mkSegment({ source: 'image', codes: ['a'], text: 'should be ignored' })],
			new Map(),
		);
		expect(res.codes).toEqual([]);
		expect(res.global.totalWords).toBe(0);
	});

	it('assigns correct color from map', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['joy'], text: 'happy words' })],
			new Map([['joy', { name: 'joy', color: '#FF0' }]]),
		);
		expect(res.codes[0].color).toBe('#FF0');
	});

	it('uses default color when not in map', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['unknown'], text: 'some text' })],
			new Map(),
		);
		expect(res.codes[0].color).toBe('#6200EE');
	});

	it('handles punctuation and numbers as separators', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['a'], text: 'hello, world! foo-bar 42 baz' })],
			new Map(),
		);
		// Tokens split on punctuation/numbers: hello, world, foo, bar, baz
		expect(res.codes[0].totalWords).toBe(5);
	});

	it('computes global stats across multiple codes', () => {
		const res = calculateTextStats(
			[
				mkSegment({ markerId: 'm1', codes: ['a'], text: 'hello world' }),
				mkSegment({ markerId: 'm2', codes: ['b'], text: 'foo bar baz' }),
			],
			new Map(),
		);
		expect(res.global.totalSegments).toBe(2);
		expect(res.global.totalWords).toBe(5);
		expect(res.global.uniqueWords).toBe(5);
		expect(res.global.ttr).toBe(1);
	});

	it('global TTR accounts for shared words across codes', () => {
		const res = calculateTextStats(
			[
				mkSegment({ markerId: 'm1', codes: ['a'], text: 'hello world' }),
				mkSegment({ markerId: 'm2', codes: ['b'], text: 'hello foo' }),
			],
			new Map(),
		);
		// total words = 4, unique = 3 (hello, world, foo) => TTR = 0.75
		expect(res.global.totalWords).toBe(4);
		expect(res.global.uniqueWords).toBe(3);
		expect(res.global.ttr).toBe(0.75);
	});

	it('segment with multiple codes counts for each', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['a', 'b'], text: 'shared text here' })],
			new Map(),
		);
		expect(res.codes).toHaveLength(2);
		const codeA = res.codes.find(c => c.code === 'a')!;
		const codeB = res.codes.find(c => c.code === 'b')!;
		expect(codeA.totalWords).toBe(3);
		expect(codeB.totalWords).toBe(3);
	});

	it('multi-code segment counts once in global stats', () => {
		const res = calculateTextStats(
			[mkSegment({ codes: ['a', 'b'], text: 'shared text here' })],
			new Map(),
		);
		// 1 segment with 2 codes — global should count it once, not twice
		expect(res.global.totalSegments).toBe(1);
		expect(res.global.totalWords).toBe(3);
		// Per-code still counts for each
		expect(res.codes).toHaveLength(2);
	});

	it('codes are sorted by totalWords descending', () => {
		const res = calculateTextStats(
			[
				mkSegment({ markerId: 'm1', codes: ['few'], text: 'one' }),
				mkSegment({ markerId: 'm2', codes: ['many'], text: 'one two three four five' }),
			],
			new Map(),
		);
		expect(res.codes[0].code).toBe('many');
		expect(res.codes[1].code).toBe('few');
	});
});
