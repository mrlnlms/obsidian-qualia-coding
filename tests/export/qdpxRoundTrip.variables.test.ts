import { describe, it, expect } from 'vitest';
import { renderVariableXml, renderCasesXml, renderVariablesForFile } from '../../src/export/caseVariablesXml';
import { parseVariableElement, parseCases } from '../../src/import/qdpxImporter';
import type { PropertyType, VariableValue } from '../../src/core/caseVariables/caseVariablesTypes';

function parseVarXml(xml: string): Element {
  return new DOMParser().parseFromString(xml, 'application/xml').querySelector('Variable')!;
}

describe('QDPX round-trip — single variable', () => {
  function roundTrip(name: string, value: VariableValue, type: PropertyType) {
    const xml = renderVariableXml(name, value, type);
    return parseVariableElement(parseVarXml(xml));
  }

  it('preserves text value', () => {
    expect(roundTrip('grupo', 'controle', 'text')).toEqual({ name: 'grupo', value: 'controle' });
  });

  it('preserves number value (int)', () => {
    expect(roundTrip('idade', 30, 'number')).toEqual({ name: 'idade', value: 30 });
  });

  it('preserves number value (float)', () => {
    expect(roundTrip('score', 3.14, 'number')).toEqual({ name: 'score', value: 3.14 });
  });

  it('preserves boolean true', () => {
    expect(roundTrip('ativo', true, 'checkbox')).toEqual({ name: 'ativo', value: true });
  });

  it('preserves boolean false', () => {
    expect(roundTrip('ativo', false, 'checkbox')).toEqual({ name: 'ativo', value: false });
  });

  it('preserves date string (date type treated as text in round-trip)', () => {
    // QDPX Date type maps back as string (no Date object coercion on parse).
    expect(roundTrip('nascimento', '2024-03-15', 'date')).toEqual({ name: 'nascimento', value: '2024-03-15' });
  });

  it('preserves datetime string', () => {
    expect(roundTrip('criadoEm', '2024-03-15T14:30:00', 'datetime')).toEqual({ name: 'criadoEm', value: '2024-03-15T14:30:00' });
  });

  it('preserves multitext array', () => {
    expect(roundTrip('tags', ['a', 'b', 'c'], 'multitext')).toEqual({ name: 'tags', value: ['a', 'b', 'c'] });
  });

  it('escapes/unescapes special chars', () => {
    const result = roundTrip('note', 'a & b < c > d "e"', 'text');
    expect(result).toEqual({ name: 'note', value: 'a & b < c > d "e"' });
  });
});

describe('QDPX round-trip — multiple variables per file', () => {
  it('preserves multiple variables via renderVariablesForFile', () => {
    const registry = {
      getVariables: (fid: string) => fid === 'jane.md' ? { idade: 30, grupo: 'controle', ativo: true } : {},
      getType: (name: string) => {
        if (name === 'idade') return 'number';
        if (name === 'ativo') return 'checkbox';
        return 'text';
      },
    } as any;

    const xml = renderVariablesForFile('jane.md', registry);
    // Wrap in a root element so DOM parsing works
    const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, 'application/xml');
    const varEls = [...doc.querySelectorAll('Variable')];
    expect(varEls).toHaveLength(3);

    const parsed = varEls.map(el => parseVariableElement(el));
    expect(parsed).toContainEqual({ name: 'idade', value: 30 });
    expect(parsed).toContainEqual({ name: 'grupo', value: 'controle' });
    expect(parsed).toContainEqual({ name: 'ativo', value: true });
  });
});

describe('QDPX round-trip — Cases grouping', () => {
  it('round-trips Case with multiple SourceRefs', () => {
    const registry = {
      getVariables: (fid: string) => {
        if (fid === 'a.md') return { caseId: 'jane-001' };
        if (fid === 'b.jpg') return { caseId: 'jane-001' };
        if (fid === 'c.pdf') return { caseId: 'john-002' };
        return {};
      },
      getFilesByCase: (caseId: string) => {
        if (caseId === 'jane-001') return ['a.md', 'b.jpg'];
        if (caseId === 'john-002') return ['c.pdf'];
        return [];
      },
    } as any;

    const guidByFile = new Map([
      ['a.md', 'guid-a'],
      ['b.jpg', 'guid-b'],
      ['c.pdf', 'guid-c'],
    ]);

    const casesXml = renderCasesXml(registry, guidByFile);

    // Wrap in <Cases> since renderCasesXml emits <Case> bodies without a wrapping tag
    const doc = new DOMParser().parseFromString(`<Project><Cases>${casesXml}</Cases></Project>`, 'application/xml');
    const parsed = parseCases(doc);

    expect(parsed).toHaveLength(2);

    const jane = parsed.find(c => c.name === 'jane-001')!;
    expect(jane.sourceGuids.sort()).toEqual(['guid-a', 'guid-b']);

    const john = parsed.find(c => c.name === 'john-002')!;
    expect(john.sourceGuids).toEqual(['guid-c']);
  });

  it('returns empty when no cases', () => {
    const registry = {
      getVariables: () => ({ idade: 30 }),
      getFilesByCase: () => [],
    } as any;

    const xml = renderCasesXml(registry, new Map([['a.jpg', 'guid-a']]));
    expect(xml).toBe('');

    // parseCases on a doc with no <Cases> element should return []
    const doc = new DOMParser().parseFromString(`<Project></Project>`, 'application/xml');
    expect(parseCases(doc)).toEqual([]);
  });
});
