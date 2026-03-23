import { describe, it, expect } from 'vitest';
import { buildCodingXml } from '../../src/export/qdpxExporter';
import type { CodeApplication } from '../../src/core/types';

describe('magnitude export', () => {
  it('encodes magnitude as Note with [Magnitude: X] prefix', () => {
    const codes: CodeApplication[] = [{ codeId: 'c1', magnitude: 'High' }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildCodingXml(codes, guidMap, Date.now(), notes);

    expect(xml).toContain('<NoteRef');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('[Magnitude: High]');
  });

  it('does not create Note when no magnitude', () => {
    const codes: CodeApplication[] = [{ codeId: 'c1' }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildCodingXml(codes, guidMap, Date.now(), notes);

    expect(xml).not.toContain('NoteRef');
    expect(notes).toHaveLength(0);
  });

  it('backward compatible — works without notes param', () => {
    const codes: CodeApplication[] = [{ codeId: 'c1', magnitude: 'High' }];
    const guidMap = new Map<string, string>();
    // No notes param — should not crash
    const xml = buildCodingXml(codes, guidMap, Date.now());
    expect(xml).toContain('<Coding');
    expect(xml).not.toContain('NoteRef');
  });
});
