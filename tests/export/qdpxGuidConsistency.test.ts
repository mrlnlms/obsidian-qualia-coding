/**
 * Regression test for 2026-04-21 round-trip bug.
 *
 * Before the fix, qdcExporter emitted `<Code guid="${code.id}">` while qdpxExporter's
 * `buildCodingXml` minted fresh UUIDs for each `<CodeRef targetGUID>`. The codebook
 * and the selections referenced the same code via different GUIDs, so the importer's
 * `guidMap` — populated from the codebook — failed to resolve any CodeRef. Result:
 * imports produced "codes exist, markers exist, but count = 0 everywhere".
 *
 * The fix routes both sides through the same `ensureGuid(id, guidMap)` so that
 * non-UUID internal ids (`mo9c3wnjh5xck86jmks`) map to a single stable UUID across
 * the whole project.qde.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTextSourceXml,
  buildAudioSourceXml,
  buildImageSourceXml,
  buildProjectXml,
} from '../../src/export/qdpxExporter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { MediaMarker } from '../../src/media/mediaTypes';
import type { ImageMarker } from '../../src/image/imageCodingTypes';

function collectAttrValues(xml: string, pattern: RegExp): Set<string> {
  const out = new Set<string>();
  for (const m of xml.matchAll(pattern)) out.add(m[1]!);
  return out;
}

function codeGuids(xml: string): Set<string> {
  return collectAttrValues(xml, /<Code\s+guid="([^"]+)"/g);
}

function codeRefTargetGuids(xml: string): Set<string> {
  return collectAttrValues(xml, /<CodeRef\s+targetGUID="([^"]+)"/g);
}

describe('QDPX export — GUID consistency between Code and CodeRef', () => {
  it('every CodeRef targetGUID resolves to a Code guid in the codebook (non-UUID ids)', () => {
    const registry = new CodeDefinitionRegistry();
    // registry.create returns ids like "mo9c3wnjh5xck86jmks" — NOT valid UUIDs.
    // This is exactly the shape that triggered the original bug.
    const parent = registry.create('Experiência do Usuário', '#E91E63');
    const child = registry.create('Frustração', '#F44336', undefined, parent.id);
    const standalone = registry.create('Satisfação', '#4CAF50');

    const guidMap = new Map<string, string>();
    const notes: string[] = [];

    const mdXml = buildTextSourceXml(
      'notes/p01.md',
      [{
        id: 'md-1', fileId: 'notes/p01.md',
        range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
        codes: [{ codeId: child.id }, { codeId: standalone.id }],
        createdAt: 1, updatedAt: 1,
      }] as any,
      'hello world\n',
      guidMap,
      notes,
    );

    const audioXml = buildAudioSourceXml(
      'audio/intro.m4a',
      [{
        id: 'au-1', fileId: 'audio/intro.m4a',
        from: 1.5, to: 3.0,
        codes: [{ codeId: parent.id }],
        createdAt: 1, updatedAt: 1,
      }] as MediaMarker[],
      guidMap,
      notes,
    );

    const sourcesXml = [mdXml, audioXml].filter(Boolean).join('\n');
    const projectXml = buildProjectXml(
      registry, sourcesXml, notes.join('\n'), '', '', 'Vault', '1.0.0', guidMap,
    );

    const codeBookGuids = codeGuids(projectXml);
    const refGuids = codeRefTargetGuids(projectXml);

    // Baseline sanity: all three codes exported, both selections wrote CodeRefs.
    expect(codeBookGuids.size).toBe(3);
    expect(refGuids.size).toBe(3);

    // The regression: every CodeRef must find a matching Code in the codebook.
    for (const guid of refGuids) {
      expect(codeBookGuids, `targetGUID=${guid} missing from codebook`).toContain(guid);
    }
  });

  it('still holds for image markers (separate selection path)', () => {
    const registry = new CodeDefinitionRegistry();
    const code = registry.create('Region: product shot', '#2196F3');

    const guidMap = new Map<string, string>();
    const notes: string[] = [];

    const imgXml = buildImageSourceXml(
      'images/shot.png',
      [{
        id: 'img-1', fileId: 'images/shot.png',
        coords: { type: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
        shape: 'rect',
        codes: [{ codeId: code.id }],
        createdAt: 1, updatedAt: 1,
      }] as ImageMarker[],
      1000, 800,
      guidMap,
      notes,
    );

    const projectXml = buildProjectXml(
      registry, imgXml, notes.join('\n'), '', '', 'Vault', '1.0.0', guidMap,
    );

    const refGuids = codeRefTargetGuids(projectXml);
    const codeBookGuidsSet = codeGuids(projectXml);
    expect(refGuids.size).toBe(1);
    for (const guid of refGuids) {
      expect(codeBookGuidsSet).toContain(guid);
    }
  });

  it('reproduces the pre-fix bug when guidMap is NOT passed (legacy call-site)', () => {
    // Documents the bug: buildProjectXml(..., /* no guidMap */) still uses code.id
    // in the codebook, which diverges from fresh UUIDs in CodeRefs. This test
    // guards against anyone "simplifying" the optional-guidMap branch away.
    const registry = new CodeDefinitionRegistry();
    const code = registry.create('Theme', '#ff0000');

    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const mdXml = buildTextSourceXml(
      'p.md',
      [{
        id: 'md-1', fileId: 'p.md',
        range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 3 } },
        codes: [{ codeId: code.id }],
        createdAt: 1, updatedAt: 1,
      }] as any,
      'abc\n',
      guidMap,
      notes,
    );

    // Note: no guidMap passed (legacy 7-arg form).
    const brokenXml = buildProjectXml(registry, mdXml, notes.join('\n'), '', '', 'V', '1.0.0');
    const cbg = codeGuids(brokenXml);
    const rg = codeRefTargetGuids(brokenXml);
    // Exactly the bug shape: codebook guid is the raw code.id, CodeRef is a UUID.
    expect(cbg).toContain(code.id);
    expect(rg).not.toContain(code.id);
    // No overlap between the two sets — the importer's guidMap would resolve nothing.
    for (const g of rg) expect(cbg.has(g)).toBe(false);
  });
});
