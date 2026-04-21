import { describe, it, expect } from 'vitest';
import { parseVariableElement, parseCases } from '../../src/import/qdpxImporter';
import { parseXml } from '../../src/import/xmlParser';

function varEl(xml: string): Element {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.querySelector('Variable')!;
}

describe('parseVariableElement', () => {
  it('parses text variable', () => {
    const el = varEl('<Variable name="grupo" typeOfVariable="Text"><VariableValue>controle</VariableValue></Variable>');
    expect(parseVariableElement(el)).toEqual({ name: 'grupo', value: 'controle' });
  });

  it('coerces number variable (Float)', () => {
    const el = varEl('<Variable name="idade" typeOfVariable="Float"><VariableValue>30</VariableValue></Variable>');
    expect(parseVariableElement(el)).toEqual({ name: 'idade', value: 30 });
  });

  it('coerces boolean variable', () => {
    const el = varEl('<Variable name="ativo" typeOfVariable="Boolean"><VariableValue>true</VariableValue></Variable>');
    expect(parseVariableElement(el)).toEqual({ name: 'ativo', value: true });
  });

  it('handles multitext with multiple VariableValue children', () => {
    const el = varEl('<Variable name="tags" typeOfVariable="Text"><VariableValue>a</VariableValue><VariableValue>b</VariableValue></Variable>');
    expect(parseVariableElement(el)).toEqual({ name: 'tags', value: ['a', 'b'] });
  });

  it('handles empty Variable (no VariableValue children)', () => {
    const el = varEl('<Variable name="empty" typeOfVariable="Text"></Variable>');
    expect(parseVariableElement(el)).toEqual({ name: 'empty', value: '' });
  });
});

describe('parseCases', () => {
  it('returns empty array when no <Cases> element exists', () => {
    const doc = parseXml('<Project></Project>');
    expect(parseCases(doc)).toEqual([]);
  });

  it('parses case names and sourceGuids', () => {
    const doc = parseXml(`<Project>
      <Cases>
        <Case name="Joao">
          <SourceRef targetGUID="src-1"/>
          <SourceRef targetGUID="src-2"/>
        </Case>
        <Case name="Maria">
          <SourceRef targetGUID="src-3"/>
        </Case>
      </Cases>
    </Project>`);
    const cases = parseCases(doc);
    expect(cases).toHaveLength(2);
    expect(cases[0]).toEqual({ name: 'Joao', sourceGuids: ['src-1', 'src-2'] });
    expect(cases[1]).toEqual({ name: 'Maria', sourceGuids: ['src-3'] });
  });
});
