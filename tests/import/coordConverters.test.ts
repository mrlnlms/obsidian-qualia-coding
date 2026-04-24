import { describe, it, expect } from 'vitest';
import { offsetToLineCh, pdfRectToNormalized, pixelsToNormalized, msToSeconds } from '../../src/import/coordConverters';

describe('offsetToLineCh', () => {
  const content = 'line 0\nline 1\nline 2 has content';

  it('converts offset 0 to line 0 ch 0', () => {
    expect(offsetToLineCh(content, 0)).toEqual({ line: 0, ch: 0 });
  });

  it('converts offset at start of line 1', () => {
    // "line 0\n" = 7 codepoints → offset 7 = line 1, ch 0
    expect(offsetToLineCh(content, 7)).toEqual({ line: 1, ch: 0 });
  });

  it('converts offset mid-line', () => {
    // "line 0\nline 1\n" = 14 codepoints → offset 14 = line 2, ch 0
    // offset 19 = line 2, ch 5
    expect(offsetToLineCh(content, 19)).toEqual({ line: 2, ch: 5 });
  });

  it('handles surrogate pairs (emoji)', () => {
    const text = 'a\u{1F600}b\nc'; // "a😀b\nc" — 3 codepoints on line 0
    // offset 0 = a, offset 1 = emoji, offset 2 = b, offset 3 = \n, offset 4 = c
    const result = offsetToLineCh(text, 2);
    // 'b' is at ch 3 in UTF-16 (a=1, emoji=2 code units, b=3)
    expect(result).toEqual({ line: 0, ch: 3 });
  });

  it('returns null for offset past end', () => {
    expect(offsetToLineCh('abc', 10)).toBeNull();
  });
});

describe('pdfRectToNormalized', () => {
  it('converts PDF points (bottom-left origin) to percent coords (0-100)', () => {
    // PDF: firstX=61.2, firstY=633.6, secondX=244.8, secondY=316.8
    // Page: 612 x 792 → expect 10%, 20%, 30%, 40%
    const result = pdfRectToNormalized(61.2, 633.6, 244.8, 316.8, 612, 792);
    expect(result.x).toBeCloseTo(10, 4);
    expect(result.y).toBeCloseTo(20, 4);
    expect(result.w).toBeCloseTo(30, 4);
    expect(result.h).toBeCloseTo(40, 4);
  });
});

describe('pixelsToNormalized', () => {
  it('converts pixel coords to normalized 0-1', () => {
    const result = pixelsToNormalized(100, 200, 600, 500, 1000, 1000);
    expect(result).toEqual({ type: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
  });
});

describe('msToSeconds', () => {
  it('converts milliseconds to seconds', () => {
    expect(msToSeconds(16176)).toBeCloseTo(16.176);
    expect(msToSeconds(0)).toBe(0);
  });
});
