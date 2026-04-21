import { describe, it, expect } from 'vitest';
import { variableTypeToQdpx, renderVariableXml, renderVariablesForFile, renderCasesXml } from '../../src/export/caseVariablesXml';

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

describe('renderVariablesForFile', () => {
  it('renders all variables for a fileId', () => {
    const registry = {
      getVariables: (fid: string) => fid === 'a.jpg' ? { idade: 30, grupo: 'c' } : {},
      getType: (name: string) => name === 'idade' ? 'number' : 'text',
    } as any;

    const xml = renderVariablesForFile('a.jpg', registry);
    expect(xml).toContain('<Variable name="idade" typeOfVariable="Float">');
    expect(xml).toContain('<Variable name="grupo" typeOfVariable="Text">');
  });

  it('returns empty string when no variables', () => {
    const registry = { getVariables: () => ({}) } as any;
    expect(renderVariablesForFile('empty.jpg', registry)).toBe('');
  });
});

describe('renderCasesXml', () => {
  it('groups files by caseId', () => {
    const registry = {
      getVariables: (fid: string) => {
        if (fid === 'a.md') return { caseId: 'jane' };
        if (fid === 'b.jpg') return { caseId: 'jane' };
        if (fid === 'c.pdf') return { caseId: 'john' };
        return {};
      },
      getFilesByCase: (caseId: string) => {
        if (caseId === 'jane') return ['a.md', 'b.jpg'];
        if (caseId === 'john') return ['c.pdf'];
        return [];
      },
    } as any;

    const guidMap = new Map([
      ['a.md', 'guid-a'],
      ['b.jpg', 'guid-b'],
      ['c.pdf', 'guid-c'],
    ]);

    const xml = renderCasesXml(registry, guidMap);
    expect(xml).toContain('<Case name="jane">');
    expect(xml).toContain('<SourceRef targetGUID="guid-a"/>');
    expect(xml).toContain('<SourceRef targetGUID="guid-b"/>');
    expect(xml).toContain('<Case name="john">');
    expect(xml).toContain('<SourceRef targetGUID="guid-c"/>');
  });

  it('returns empty string when no caseId values', () => {
    const registry = {
      getVariables: () => ({ idade: 30 }),
      getFilesByCase: () => [],
    } as any;
    expect(renderCasesXml(registry, new Map([['a.jpg', 'guid']]))).toBe('');
  });
});
