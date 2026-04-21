import { describe, it, expect } from 'vitest';
import { variableTypeToQdpx, renderVariableXml } from '../../src/export/caseVariablesXml';

describe('variableTypeToQdpx', () => {
  it('maps plugin types to QDPX typeOfVariable', () => {
    expect(variableTypeToQdpx('text')).toBe('Text');
    expect(variableTypeToQdpx('number')).toBe('Float');
    expect(variableTypeToQdpx('checkbox')).toBe('Boolean');
    expect(variableTypeToQdpx('date')).toBe('Date');
    expect(variableTypeToQdpx('datetime')).toBe('DateTime');
    expect(variableTypeToQdpx('multitext')).toBe('Text');
  });
});

describe('renderVariableXml', () => {
  it('renders <Variable> element with typeOfVariable and value', () => {
    const xml = renderVariableXml('idade', 30, 'number');
    expect(xml).toContain('<Variable name="idade" typeOfVariable="Float">');
    expect(xml).toContain('<VariableValue>30</VariableValue>');
    expect(xml).toContain('</Variable>');
  });

  it('escapes XML special chars in string values', () => {
    const xml = renderVariableXml('note', 'a & b < c', 'text');
    expect(xml).toContain('a &amp; b &lt; c');
  });

  it('renders multitext as multiple VariableValue elements', () => {
    const xml = renderVariableXml('tags', ['a', 'b'], 'multitext');
    const matches = xml.match(/<VariableValue>/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('returns empty element for null value', () => {
    const xml = renderVariableXml('optional', null, 'text');
    expect(xml).toContain('<Variable');
    expect(xml).not.toContain('<VariableValue>');
  });
});
