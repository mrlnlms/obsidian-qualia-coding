// tests/import/qdpxRoundTrip.test.ts
import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { parseXml } from '../../src/import/xmlParser';
import { parseSources, parseNotes, parseLinks, applyLinks, type ParsedLink } from '../../src/import/qdpxImporter';
import { parseCodebook, applyCodebook } from '../../src/import/qdcImporter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

const PROJECT_XML = `<?xml version="1.0" encoding="utf-8"?>
<Project name="Test Project" origin="Test Suite" creationDateTime="2026-01-01T00:00:00Z" xmlns="urn:QDA-XML:project:1.0">
<CodeBook>
<Codes>
  <Code guid="c-emotions" name="Emotions" color="#FF0000" isCodable="true">
    <Description>Parent code for emotions</Description>
    <Code guid="c-joy" name="Joy" color="#00FF00" isCodable="true"/>
    <Code guid="c-frustration" name="Frustration" color="#0000FF" isCodable="true"/>
  </Code>
  <Code guid="c-cost" name="Cost" color="#FF9800" isCodable="true">
    <NoteRef targetGUID="note-cost-memo"/>
  </Code>
</Codes>
</CodeBook>
<Sources>
  <TextSource guid="src-interview" name="interview.txt" plainTextPath="internal://src-interview.txt">
    <PlainTextSelection guid="sel-1" startPosition="0" endPosition="15" creationDateTime="2026-01-01T00:00:00Z">
      <Coding guid="coding-1" creationDateTime="2026-01-01T00:00:00Z">
        <CodeRef targetGUID="c-joy"/>
        <NoteRef targetGUID="note-mag"/>
      </Coding>
      <NoteRef targetGUID="note-memo-1"/>
    </PlainTextSelection>
    <PlainTextSelection guid="sel-2" startPosition="20" endPosition="35" creationDateTime="2026-01-02T00:00:00Z">
      <Coding guid="coding-2" creationDateTime="2026-01-02T00:00:00Z">
        <CodeRef targetGUID="c-frustration"/>
      </Coding>
      <Coding guid="coding-3" creationDateTime="2026-01-02T00:00:00Z">
        <CodeRef targetGUID="c-cost"/>
      </Coding>
    </PlainTextSelection>
  </TextSource>
  <AudioSource guid="src-audio" name="audio.m4a" path="internal://src-audio.m4a">
    <AudioSelection guid="sel-audio-1" begin="1500" end="3700" creationDateTime="2026-01-03T00:00:00Z">
      <Coding guid="coding-4" creationDateTime="2026-01-03T00:00:00Z">
        <CodeRef targetGUID="c-emotions"/>
      </Coding>
    </AudioSelection>
  </AudioSource>
</Sources>
<Notes>
  <Note guid="note-memo-1" name="Memo: Interview" creationDateTime="2026-01-01T00:00:00Z">
    <PlainTextContent>Participant shows strong positive affect here</PlainTextContent>
  </Note>
  <Note guid="note-mag" name="Magnitude" creationDateTime="2026-01-01T00:00:00Z">
    <PlainTextContent>[Magnitude: High]</PlainTextContent>
  </Note>
  <Note guid="note-cost-memo" name="Code memo: Cost" creationDateTime="2026-01-01T00:00:00Z">
    <PlainTextContent>Financial burden reported by participants</PlainTextContent>
  </Note>
</Notes>
<Links>
  <Link guid="link-1" name="causes" direction="OneWay" originGUID="c-joy" targetGUID="c-frustration"/>
  <Link guid="link-2" name="relates_to" direction="Associative" originGUID="c-cost" targetGUID="c-emotions"/>
</Links>
</Project>`;

function toU8(str: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(str));
}

function buildTestQdpx(): Uint8Array {
  const sourceText = 'This is the joy segment of the interview text here and frustration follows';
  const files: Record<string, Uint8Array> = {
    'project.qde': toU8(PROJECT_XML),
    'sources/src-interview.txt': toU8(sourceText),
  };
  return zipSync(files);
}

describe('QDPX round-trip integration', () => {
  const doc = parseXml(PROJECT_XML);

  describe('parseCodebook', () => {
    it('extracts hierarchy: 3 codes under Emotions + 1 flat', () => {
      const cb = parseCodebook(doc);
      expect(cb.codes).toHaveLength(4);

      const emotions = cb.codes.find(c => c.guid === 'c-emotions')!;
      expect(emotions.name).toBe('Emotions');
      expect(emotions.childrenGuids).toEqual(['c-joy', 'c-frustration']);
      expect(emotions.parentGuid).toBeUndefined();
      expect(emotions.description).toBe('Parent code for emotions');

      const joy = cb.codes.find(c => c.guid === 'c-joy')!;
      expect(joy.parentGuid).toBe('c-emotions');

      const cost = cb.codes.find(c => c.guid === 'c-cost')!;
      expect(cost.noteGuids).toContain('note-cost-memo');
    });
  });

  describe('applyCodebook with hierarchy + notes', () => {
    it('creates codes with parent→child wiring and NoteRef description', () => {
      const cb = parseCodebook(doc);
      const notes = parseNotes(doc);
      const registry = new CodeDefinitionRegistry();
      const result = applyCodebook(cb, registry, 'merge', notes);

      expect(result.created).toBe(4);
      expect(result.merged).toBe(0);

      // Hierarchy
      const emotions = registry.getByName('Emotions')!;
      const children = registry.getChildren(emotions.id);
      expect(children).toHaveLength(2);
      expect(children.map(c => c.name)).toContain('Joy');
      expect(children.map(c => c.name)).toContain('Frustration');

      // NoteRef on Cost code → description from note
      const cost = registry.getByName('Cost')!;
      expect(cost.description).toBe('Financial burden reported by participants');
    });
  });

  describe('parseSources', () => {
    it('finds 1 TextSource + 1 AudioSource', () => {
      const sources = parseSources(doc);
      expect(sources).toHaveLength(2);
      expect(sources.map(s => s.type)).toContain('text');
      expect(sources.map(s => s.type)).toContain('audio');
    });

    it('TextSource has 2 selections with correct codes', () => {
      const sources = parseSources(doc);
      const text = sources.find(s => s.type === 'text')!;
      expect(text.selections).toHaveLength(2);

      const sel1 = text.selections[0]!;
      expect(sel1.startPosition).toBe(0);
      expect(sel1.endPosition).toBe(15);
      expect(sel1.codeGuids).toEqual(['c-joy']);
      expect(sel1.noteGuids).toContain('note-mag');
      expect(sel1.noteGuids).toContain('note-memo-1');

      const sel2 = text.selections[1]!;
      expect(sel2.codeGuids).toEqual(['c-frustration', 'c-cost']);
    });

    it('AudioSource has 1 selection with begin/end in ms', () => {
      const sources = parseSources(doc);
      const audio = sources.find(s => s.type === 'audio')!;
      expect(audio.selections).toHaveLength(1);
      expect(audio.selections[0]!.begin).toBe(1500);
      expect(audio.selections[0]!.end).toBe(3700);
    });
  });

  describe('parseNotes', () => {
    it('finds 3 notes, one with magnitude', () => {
      const notes = parseNotes(doc);
      expect(notes.size).toBe(3);

      const memo = notes.get('note-memo-1')!;
      expect(memo.text).toBe('Participant shows strong positive affect here');
      expect(memo.magnitude).toBeUndefined();

      const mag = notes.get('note-mag')!;
      expect(mag.magnitude).toBe('High');
      expect(mag.text).toBe('[Magnitude: High]');
    });
  });

  describe('parseLinks', () => {
    it('finds 2 links: 1 directed + 1 associative', () => {
      const links = parseLinks(doc);
      expect(links).toHaveLength(2);

      const causes = links.find(l => l.label === 'causes')!;
      expect(causes.directed).toBe(true);
      expect(causes.originGuid).toBe('c-joy');
      expect(causes.targetGuid).toBe('c-frustration');

      const relates = links.find(l => l.label === 'relates_to')!;
      expect(relates.directed).toBe(false);
    });
  });

  describe('applyLinks on registry', () => {
    it('creates code-level relations from Links', () => {
      const cb = parseCodebook(doc);
      const notes = parseNotes(doc);
      const links = parseLinks(doc);
      const registry = new CodeDefinitionRegistry();
      const cbResult = applyCodebook(cb, registry, 'merge', notes);
      const guidMap = cbResult.guidMap;

      const mockDm = {
        section: () => ({ markers: {}, shapes: [], files: [] }),
        setSection: () => {},
      } as any;

      const count = applyLinks(links, guidMap, registry, mockDm);
      expect(count).toBe(2);

      const joyId = guidMap.get('c-joy')!;
      const joy = registry.getById(joyId)!;
      expect(joy.relations).toHaveLength(1);
      expect(joy.relations![0]!.label).toBe('causes');
      expect(joy.relations![0]!.directed).toBe(true);

      const costId = guidMap.get('c-cost')!;
      const cost = registry.getById(costId)!;
      expect(cost.relations).toHaveLength(1);
      expect(cost.relations![0]!.label).toBe('relates_to');
      expect(cost.relations![0]!.directed).toBe(false);
    });
  });

  describe('ZIP round-trip', () => {
    it('buildTestQdpx creates valid ZIP with project.qde', () => {
      const zipData = buildTestQdpx();
      const files = unzipSync(zipData);
      expect(files['project.qde']).toBeDefined();
      expect(files['sources/src-interview.txt']).toBeDefined();

      const xml = strFromU8(files['project.qde']);
      const parsedDoc = parseXml(xml);
      expect(parsedDoc.documentElement.getAttribute('name')).toBe('Test Project');
    });
  });
});
