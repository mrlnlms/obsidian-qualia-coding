import { describe, it, expect } from 'vitest';
import { escapeXml, xmlAttr, xmlEl, xmlDeclaration } from '../../src/export/xmlBuilder';

describe('escapeXml', () => {
  it('escapes &, <, >, ", \'', () => {
    expect(escapeXml('a & b < c > d " e \' f'))
      .toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });

  it('returns empty string for empty input', () => {
    expect(escapeXml('')).toBe('');
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });

  it('handles unicode characters', () => {
    expect(escapeXml('café ñ 日本')).toBe('café ñ 日本');
  });
});

describe('xmlAttr', () => {
  it('formats key="escaped-value"', () => {
    expect(xmlAttr('name', 'a & b')).toBe('name="a &amp; b"');
  });

  it('omits attribute when value is undefined', () => {
    expect(xmlAttr('color', undefined)).toBe('');
  });
});

describe('xmlEl', () => {
  it('builds self-closing element with attributes', () => {
    expect(xmlEl('Code', { guid: 'abc', name: 'Test' }))
      .toBe('<Code guid="abc" name="Test"/>');
  });

  it('builds element with nested XML children (isXml=true)', () => {
    expect(xmlEl('Codes', {}, '<Code guid="x" name="Y"/>', true))
      .toBe('<Codes>\n<Code guid="x" name="Y"/>\n</Codes>');
  });

  it('builds element with escaped text content (default)', () => {
    expect(xmlEl('Description', {}, 'Some text & more'))
      .toBe('<Description>Some text &amp; more</Description>');
  });

  it('self-closes when children is empty string', () => {
    expect(xmlEl('Code', { guid: 'x' }, '')).toBe('<Code guid="x"/>');
  });
});

describe('xmlDeclaration', () => {
  it('returns standard XML declaration', () => {
    expect(xmlDeclaration()).toBe('<?xml version="1.0" encoding="utf-8"?>');
  });
});
