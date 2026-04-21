/**
 * End-to-end round-trip test simulating the corpus-teste-ia scenario:
 * 10 markdown files × 5 case variables (text, number) → export to QDPX XML
 * → re-parse → validate every variable preserved with correct type and value.
 *
 * Operates at XML+ZIP level (no Obsidian app needed). Catches structural bugs
 * in the export/import pipeline that unit tests on individual functions miss.
 */

import { describe, it, expect } from 'vitest';
import { renderVariableXml, renderVariablesForFile, renderCasesXml } from '../../src/export/caseVariablesXml';
import { parseVariableElement, parseCases } from '../../src/import/qdpxImporter';
import { parseXml } from '../../src/import/xmlParser';
import type { PropertyType, VariableValue } from '../../src/core/caseVariables/caseVariablesTypes';

interface FileFixture {
  fileId: string;
  variables: Record<string, VariableValue>;
}

// ── Corpus fixture matching corpus-teste-ia/P01-P10.md ──
const CORPUS: FileFixture[] = [
  { fileId: 'corpus/P01.md', variables: { participante: 'P01', grupo: 'controle',   papel: 'designer',  experiencia: 'junior', idade: 26 } },
  { fileId: 'corpus/P02.md', variables: { participante: 'P02', grupo: 'controle',   papel: 'developer', experiencia: 'senior', idade: 34 } },
  { fileId: 'corpus/P03.md', variables: { participante: 'P03', grupo: 'controle',   papel: 'pm',        experiencia: 'senior', idade: 41 } },
  { fileId: 'corpus/P04.md', variables: { participante: 'P04', grupo: 'controle',   papel: 'designer',  experiencia: 'senior', idade: 38 } },
  { fileId: 'corpus/P05.md', variables: { participante: 'P05', grupo: 'controle',   papel: 'developer', experiencia: 'junior', idade: 27 } },
  { fileId: 'corpus/P06.md', variables: { participante: 'P06', grupo: 'tratamento', papel: 'designer',  experiencia: 'junior', idade: 25 } },
  { fileId: 'corpus/P07.md', variables: { participante: 'P07', grupo: 'tratamento', papel: 'developer', experiencia: 'senior', idade: 36 } },
  { fileId: 'corpus/P08.md', variables: { participante: 'P08', grupo: 'tratamento', papel: 'pm',        experiencia: 'senior', idade: 42 } },
  { fileId: 'corpus/P09.md', variables: { participante: 'P09', grupo: 'tratamento', papel: 'designer',  experiencia: 'senior', idade: 39 } },
  { fileId: 'corpus/P10.md', variables: { participante: 'P10', grupo: 'tratamento', papel: 'developer', experiencia: 'junior', idade: 24 } },
];

const TYPE_MAP: Record<string, PropertyType> = {
  participante: 'text',
  grupo: 'text',
  papel: 'text',
  experiencia: 'text',
  idade: 'number',
};

function buildFixtureRegistry() {
  return {
    getVariables: (fid: string) => {
      const f = CORPUS.find(c => c.fileId === fid);
      return f ? f.variables : {};
    },
    getType: (name: string) => TYPE_MAP[name] ?? 'text',
    getFilesByCase: (caseId: string) => CORPUS.filter(c => c.variables.caseId === caseId).map(c => c.fileId),
  } as any;
}

function exportCorpusToXml(): string {
  // Mimics the structure that qdpxExporter.ts produces, focused on what concerns
  // case variables: per-source <Variable> elements wrapped in a parent Source element.
  const registry = buildFixtureRegistry();
  const sources = CORPUS.map(({ fileId }) => {
    const guid = `guid-${fileId.split('/').pop()!.replace('.md', '')}`;
    const vars = renderVariablesForFile(fileId, registry);
    return `<TextSource guid="${guid}" name="${fileId.split('/').pop()}" plainTextPath="internal://${guid}.txt">${vars}</TextSource>`;
  }).join('\n');

  const guidByFile = new Map(CORPUS.map(c => [c.fileId, `guid-${c.fileId.split('/').pop()!.replace('.md', '')}`]));
  const cases = renderCasesXml(registry, guidByFile);

  return `<?xml version="1.0" encoding="utf-8"?>
<Project name="Test" xmlns="urn:QDA-XML:project:1.0">
  <Sources>${sources}</Sources>
  ${cases ? `<Cases>${cases}</Cases>` : ''}
</Project>`;
}

describe('QDPX round-trip — corpus-teste-ia simulation', () => {
  it('exports and re-imports all 50 variables from 10 files with correct types', () => {
    const xml = exportCorpusToXml();
    const doc = parseXml(xml);

    // Find each TextSource → parse its variables
    const sourceEls = Array.from(doc.querySelectorAll('TextSource'));
    expect(sourceEls).toHaveLength(10);

    for (const srcEl of sourceEls) {
      const guid = srcEl.getAttribute('guid')!;
      const baseName = guid.replace('guid-', '');
      const expectedFile = CORPUS.find(c => c.fileId.endsWith(`${baseName}.md`))!;
      expect(expectedFile, `fixture for ${baseName}`).toBeDefined();

      const varEls = Array.from(srcEl.querySelectorAll('Variable'));
      expect(varEls, `variables for ${baseName}`).toHaveLength(5);

      const parsed = varEls.map(el => parseVariableElement(el));
      for (const [name, expectedValue] of Object.entries(expectedFile.variables)) {
        const found = parsed.find(p => p.name === name);
        expect(found, `${baseName} should have variable "${name}"`).toBeDefined();
        expect(found!.value, `${baseName}.${name} preserves value+type`).toEqual(expectedValue);
      }
    }
  });

  it('preserves number type — "idade" stays a JS number, not a string', () => {
    const xml = exportCorpusToXml();
    const doc = parseXml(xml);

    for (const srcEl of doc.querySelectorAll('TextSource')) {
      const idadeEl = Array.from(srcEl.querySelectorAll('Variable')).find(
        el => el.getAttribute('name') === 'idade',
      );
      expect(idadeEl).toBeDefined();
      const parsed = parseVariableElement(idadeEl!);
      expect(typeof parsed.value).toBe('number');
    }
  });

  it('preserves text variables as strings (not coerced)', () => {
    const xml = exportCorpusToXml();
    const doc = parseXml(xml);

    for (const srcEl of doc.querySelectorAll('TextSource')) {
      const grupoEl = Array.from(srcEl.querySelectorAll('Variable')).find(
        el => el.getAttribute('name') === 'grupo',
      );
      const parsed = parseVariableElement(grupoEl!);
      expect(typeof parsed.value).toBe('string');
      expect(['controle', 'tratamento']).toContain(parsed.value);
    }
  });

  it('survives re-export without value mutation (idempotent)', () => {
    // First round-trip
    const xml1 = exportCorpusToXml();
    const doc1 = parseXml(xml1);
    const firstParse = Array.from(doc1.querySelectorAll('TextSource')).map(srcEl => ({
      guid: srcEl.getAttribute('guid'),
      vars: Array.from(srcEl.querySelectorAll('Variable')).map(parseVariableElement),
    }));

    // Re-render from parsed values (simulating: import→re-export)
    const reExportedEntries = firstParse.map(s => {
      const vars = s.vars.map(v => renderVariableXml(v.name, v.value as VariableValue, TYPE_MAP[v.name] ?? 'text')).join('');
      return `<TextSource guid="${s.guid}">${vars}</TextSource>`;
    });
    const xml2 = `<Project xmlns="urn:QDA-XML:project:1.0"><Sources>${reExportedEntries.join('')}</Sources></Project>`;
    const doc2 = parseXml(xml2);

    const secondParse = Array.from(doc2.querySelectorAll('TextSource')).map(srcEl => ({
      guid: srcEl.getAttribute('guid'),
      vars: Array.from(srcEl.querySelectorAll('Variable')).map(parseVariableElement),
    }));

    expect(secondParse).toEqual(firstParse);
  });

  it('Cases section round-trips when caseId variable is set', () => {
    // Augment fixture with caseId
    const augmented = CORPUS.map((c, i) => ({
      ...c,
      variables: { ...c.variables, caseId: `case-${Math.floor(i / 2) + 1}` },  // pair into 5 cases
    }));
    const registry = {
      getVariables: (fid: string) => augmented.find(c => c.fileId === fid)?.variables ?? {},
      getType: (name: string) => TYPE_MAP[name] ?? 'text',
      getFilesByCase: (caseId: string) => augmented.filter(c => c.variables.caseId === caseId).map(c => c.fileId),
    } as any;

    const guidByFile = new Map(augmented.map(c => [c.fileId, `guid-${c.fileId.split('/').pop()!.replace('.md', '')}`]));
    const casesXml = renderCasesXml(registry, guidByFile);
    expect(casesXml).not.toBe('');

    const doc = parseXml(`<Project xmlns="urn:QDA-XML:project:1.0"><Cases>${casesXml}</Cases></Project>`);
    const parsed = parseCases(doc);

    expect(parsed).toHaveLength(5);
    for (const c of parsed) {
      expect(c.sourceGuids).toHaveLength(2);  // each case has 2 files in fixture
    }
  });

  it('handles special characters in values (XML escape/unescape round-trip)', () => {
    const tricky: VariableValue[] = [
      'a & b',
      '< > "quotes"',
      "apóstrofo's",
      'emoji 🎉 and símbolos €',
      'newline\nin\nvalue',
    ];
    for (const value of tricky) {
      const xml = renderVariableXml('test', value, 'text');
      const doc = parseXml(`<root>${xml}</root>`);
      const el = doc.querySelector('Variable')!;
      const parsed = parseVariableElement(el);
      expect(parsed.value, `tricky value: ${JSON.stringify(value)}`).toBe(value);
    }
  });
});
