import { describe, it, expect } from 'vitest';
import { calculateWordFrequencies } from '../../src/analytics/data/wordFrequency';
import type { ExtractedSegment } from '../../src/analytics/data/textExtractor';

function makeSeg(text: string, codes: string[] = ['code1'], source: 'markdown' | 'csv-segment' | 'pdf' | 'audio' | 'video' = 'markdown'): ExtractedSegment {
  return {
    markerId: 'seg-1',
    source,
    file: 'file.md',
    codes,
    text,
  };
}

describe('calculateWordFrequencies', () => {
  it('returns correct frequencies for simple text', () => {
    const segments = [makeSeg('hello world hello')];
    const result = calculateWordFrequencies(segments, { stopWordsLang: 'en', minWordLength: 1, maxWords: 100 });
    const hello = result.find(r => r.word === 'hello');
    const world = result.find(r => r.word === 'world');
    expect(hello?.count).toBe(2);
    expect(world?.count).toBe(1);
  });

  it('filters English stop words', () => {
    const segments = [makeSeg('the quick brown fox')];
    const result = calculateWordFrequencies(segments, { stopWordsLang: 'en', minWordLength: 1, maxWords: 100 });
    expect(result.find(r => r.word === 'the')).toBeUndefined();
    expect(result.find(r => r.word === 'quick')).toBeDefined();
  });

  it('filters Portuguese stop words', () => {
    const segments = [makeSeg('uma analise qualitativa dados')];
    const result = calculateWordFrequencies(segments, { stopWordsLang: 'pt', minWordLength: 1, maxWords: 100 });
    expect(result.find(r => r.word === 'uma')).toBeUndefined();
    expect(result.find(r => r.word === 'analise')).toBeDefined();
  });

  it('applies minimum word length filter', () => {
    const segments = [makeSeg('go run fast quickly')];
    const result = calculateWordFrequencies(segments, { stopWordsLang: 'en', minWordLength: 4, maxWords: 100 });
    // 'go' and 'run' and 'fast' are < 4 or == 4 chars; 'quickly' is 7
    expect(result.find(r => r.word === 'fast')).toBeDefined(); // 4 >= 4
    expect(result.find(r => r.word === 'quickly')).toBeDefined();
    expect(result.find(r => r.word === 'run')).toBeUndefined(); // 3 < 4
  });

  it('limits results to maxWords', () => {
    // Generate many unique words
    const words = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const segments = [makeSeg(words)];
    const result = calculateWordFrequencies(segments, { stopWordsLang: 'en', minWordLength: 1, maxWords: 5 });
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns empty result for empty input', () => {
    const result = calculateWordFrequencies([]);
    expect(result).toEqual([]);
  });

  it('returns empty result for segments with no text', () => {
    const result = calculateWordFrequencies([{ markerId: 's1', source: 'markdown', file: 'f', codes: ['c'], text: '' }]);
    expect(result).toEqual([]);
  });

  it('associates words with their codes', () => {
    const segments = [makeSeg('qualitative analysis', ['themeA', 'themeB'])];
    const result = calculateWordFrequencies(segments, { stopWordsLang: 'en', minWordLength: 1, maxWords: 100 });
    const analysis = result.find(r => r.word === 'analysis');
    expect(analysis?.codes).toContain('themeA');
    expect(analysis?.codes).toContain('themeB');
  });

  it('tracks sources for each word', () => {
    const segments = [
      makeSeg('research methodology', ['c1'], 'markdown'),
      makeSeg('research design', ['c2'], 'pdf'),
    ];
    const result = calculateWordFrequencies(segments, { stopWordsLang: 'en', minWordLength: 1, maxWords: 100 });
    const research = result.find(r => r.word === 'research');
    expect(research?.sources).toContain('markdown');
    expect(research?.sources).toContain('pdf');
  });

  it('skips image source segments', () => {
    const segments: ExtractedSegment[] = [
      { markerId: 's1', source: 'image', file: 'img.png', codes: ['c'], text: 'important text' },
    ];
    const result = calculateWordFrequencies(segments, { stopWordsLang: 'en', minWordLength: 1, maxWords: 100 });
    expect(result).toEqual([]);
  });

  it('uses default options when none provided', () => {
    // Default: stopWordsLang = 'both', minWordLength = 3, maxWords = 100
    const segments = [makeSeg('the uma qualitative')];
    const result = calculateWordFrequencies(segments);
    // 'the' and 'uma' are stop words in both; 'qualitative' passes
    expect(result.find(r => r.word === 'the')).toBeUndefined();
    expect(result.find(r => r.word === 'uma')).toBeUndefined();
    expect(result.find(r => r.word === 'qualitative')).toBeDefined();
  });
});
