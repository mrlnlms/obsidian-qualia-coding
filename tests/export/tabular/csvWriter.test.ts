// tests/export/tabular/csvWriter.test.ts
import { describe, it, expect } from 'vitest';
import { toCsv } from '../../../src/export/tabular/csvWriter';

describe('csvWriter.toCsv', () => {
  it('joins cells with comma and rows with LF', () => {
    const out = toCsv([['a', 'b'], ['c', 'd']]);
    expect(out).toBe('﻿a,b\nc,d\n');
  });

  it('escapes cells with comma by wrapping in double quotes', () => {
    const out = toCsv([['a,b', 'c']]);
    expect(out).toBe('﻿"a,b",c\n');
  });

  it('escapes cells with double quote by doubling the quote', () => {
    const out = toCsv([['he said "hi"']]);
    expect(out).toBe('﻿"he said ""hi"""\n');
  });

  it('escapes cells with newline by wrapping in double quotes', () => {
    const out = toCsv([['line1\nline2']]);
    expect(out).toBe('﻿"line1\nline2"\n');
  });

  it('emits empty string for null/undefined', () => {
    const out = toCsv([['a', null, undefined, 'b']]);
    expect(out).toBe('﻿a,,,b\n');
  });

  it('coerces numbers to string without quoting', () => {
    const out = toCsv([[1, 2.5, 0]]);
    expect(out).toBe('﻿1,2.5,0\n');
  });

  it('prepends UTF-8 BOM so Excel detects encoding', () => {
    const out = toCsv([['a']]);
    expect(out.charCodeAt(0)).toBe(0xFEFF);
  });

  it('preserves unicode (emoji, accents)', () => {
    const out = toCsv([['café 😀']]);
    expect(out).toBe('﻿café 😀\n');
  });

  it('returns empty string for empty input', () => {
    expect(toCsv([])).toBe('﻿');
  });
});
