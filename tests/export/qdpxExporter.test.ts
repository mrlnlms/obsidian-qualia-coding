import { describe, it, expect } from 'vitest';
import { ensureGuid, isValidUuid, buildCodingXml, buildNoteXml, buildNoteRefXml, buildTextSourceXml } from '../../src/export/qdpxExporter';
import type { CodeApplication } from '../../src/core/types';

describe('isValidUuid', () => {
  it('accepts valid UUID v4', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
  it('rejects non-UUID strings', () => {
    expect(isValidUuid('abc123')).toBe(false);
    expect(isValidUuid('')).toBe(false);
  });
});

describe('ensureGuid', () => {
  it('returns original id if valid UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const map = new Map<string, string>();
    expect(ensureGuid(uuid, map)).toBe(uuid);
  });
  it('generates and caches UUID for non-UUID ids', () => {
    const map = new Map<string, string>();
    const g1 = ensureGuid('custom-id', map);
    expect(isValidUuid(g1)).toBe(true);
    expect(ensureGuid('custom-id', map)).toBe(g1);
  });
  it('generates different GUIDs for different ids', () => {
    const map = new Map<string, string>();
    expect(ensureGuid('a', map)).not.toBe(ensureGuid('b', map));
  });
});

describe('buildCodingXml', () => {
  it('generates Coding + CodeRef for each code', () => {
    const codes: CodeApplication[] = [
      { codeId: '550e8400-e29b-41d4-a716-446655440000' },
      { codeId: '550e8400-e29b-41d4-a716-446655440001' },
    ];
    const guidMap = new Map<string, string>();
    const xml = buildCodingXml(codes, guidMap);
    expect(xml).toContain('targetGUID="550e8400-e29b-41d4-a716-446655440000"');
    expect(xml).toContain('targetGUID="550e8400-e29b-41d4-a716-446655440001"');
    expect((xml.match(/<Coding /g) || []).length).toBe(2);
  });
});

describe('buildNoteXml', () => {
  it('generates Note element with PlainTextContent', () => {
    const xml = buildNoteXml('note-guid', 'My Memo', 'This is memo text');
    expect(xml).toContain('guid="note-guid"');
    expect(xml).toContain('name="My Memo"');
    expect(xml).toContain('<PlainTextContent>This is memo text</PlainTextContent>');
  });
  it('escapes special characters in memo text', () => {
    const xml = buildNoteXml('g', 'name', 'text with <special> & "chars"');
    expect(xml).toContain('text with &lt;special&gt; &amp; &quot;chars&quot;');
  });
});

describe('buildNoteRefXml', () => {
  it('generates NoteRef element', () => {
    expect(buildNoteRefXml('note-123')).toBe('<NoteRef targetGUID="note-123"/>');
  });
});

describe('buildTextSourceXml', () => {
  it('builds TextSource with PlainTextSelection for markdown markers', () => {
    const markers = [{
      id: 'marker-1', fileId: 'notes/interview.md',
      range: { from: { line: 2, ch: 0 }, to: { line: 2, ch: 10 } },
      codes: [{ codeId: 'code-1' }],
      memo: 'Interesting',
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const fileContent = 'line 0\nline 1\nline 2 has content here\nline 3';
    const guidMap = new Map<string, string>();
    const notes: string[] = [];

    const xml = buildTextSourceXml('notes/interview.md', markers as any, fileContent, guidMap, notes);
    expect(xml).toContain('<TextSource');
    expect(xml).toContain('name="interview.md"');
    expect(xml).toContain('<PlainTextSelection');
    expect(xml).toContain('startPosition="14"');
    expect(xml).toContain('endPosition="24"');
    expect(xml).toContain('<NoteRef');
    expect(notes.length).toBe(1);
  });

  it('skips markers with no codes', () => {
    const markers = [{
      id: 'marker-no-codes', fileId: 'test.md',
      range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
      codes: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildTextSourceXml('test.md', markers as any, 'hello world', guidMap, notes);
    expect(xml).not.toContain('PlainTextSelection');
  });
});
