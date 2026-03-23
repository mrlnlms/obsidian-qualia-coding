import { describe, it, expect } from 'vitest';
import { parseXml, getChildElements, getAttr, getTextContent, getAllElements } from '../../src/import/xmlParser';

describe('parseXml', () => {
  it('parses valid XML string into Document', () => {
    const doc = parseXml('<Root><Child name="a"/></Root>');
    expect(doc.documentElement.tagName).toBe('Root');
  });

  it('throws on invalid XML', () => {
    expect(() => parseXml('<Root><Unclosed>')).toThrow();
  });
});

describe('getChildElements', () => {
  it('returns direct child elements by tag name', () => {
    const doc = parseXml('<Root><Code name="A"/><Code name="B"/><Other/></Root>');
    const codes = getChildElements(doc.documentElement, 'Code');
    expect(codes).toHaveLength(2);
    expect(codes[0]!.getAttribute('name')).toBe('A');
  });

  it('does not return grandchildren', () => {
    const doc = parseXml('<Root><Parent><Code name="nested"/></Parent></Root>');
    const codes = getChildElements(doc.documentElement, 'Code');
    expect(codes).toHaveLength(0);
  });

  it('returns all direct children when no tag specified', () => {
    const doc = parseXml('<Root><A/><B/><C/></Root>');
    const all = getChildElements(doc.documentElement);
    expect(all).toHaveLength(3);
  });
});

describe('getAttr', () => {
  it('returns attribute value', () => {
    const doc = parseXml('<Code name="Theme" color="#ff0000"/>');
    expect(getAttr(doc.documentElement, 'name')).toBe('Theme');
    expect(getAttr(doc.documentElement, 'color')).toBe('#ff0000');
  });

  it('returns undefined for missing attribute', () => {
    const doc = parseXml('<Code name="Theme"/>');
    expect(getAttr(doc.documentElement, 'missing')).toBeUndefined();
  });
});

describe('getTextContent', () => {
  it('returns text content of first matching child element', () => {
    const doc = parseXml('<Code><Description>Hello world</Description></Code>');
    expect(getTextContent(doc.documentElement, 'Description')).toBe('Hello world');
  });

  it('returns undefined if child not found', () => {
    const doc = parseXml('<Code name="A"/>');
    expect(getTextContent(doc.documentElement, 'Description')).toBeUndefined();
  });
});

describe('getAllElements', () => {
  it('returns all elements with given tag name at any depth', () => {
    const doc = parseXml('<Root><A><B/></A><B/></Root>');
    const bs = getAllElements(doc.documentElement, 'B');
    expect(bs).toHaveLength(2);
  });
});
