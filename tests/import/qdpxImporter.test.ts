import { describe, it, expect } from 'vitest';
import { parseXml } from '../../src/import/xmlParser';
import {
  parseSources,
  parseNotes,
  parseLinks,
  applyLinks,
  resolveInternalPath,
  type ParsedLink,
} from '../../src/import/qdpxImporter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('parseSources', () => {
  it('parses TextSource with PlainTextSelection', () => {
    const xml = `<Project>
      <Sources>
        <TextSource guid="s1" name="interview.txt" plainTextPath="internal://s1.txt">
          <PlainTextSelection guid="sel1" startPosition="10" endPosition="25" creationDateTime="2026-01-01T00:00:00Z">
            <Coding guid="cod1" creationDateTime="2026-01-01T00:00:00Z">
              <CodeRef targetGUID="code-guid-1"/>
            </Coding>
            <NoteRef targetGUID="note1"/>
          </PlainTextSelection>
        </TextSource>
      </Sources>
    </Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources).toHaveLength(1);
    const src = sources[0]!;
    expect(src.type).toBe('text');
    expect(src.guid).toBe('s1');
    expect(src.name).toBe('interview.txt');
    expect(src.selections).toHaveLength(1);
    const sel = src.selections[0]!;
    expect(sel.type).toBe('PlainTextSelection');
    expect(sel.startPosition).toBe(10);
    expect(sel.endPosition).toBe(25);
    expect(sel.codeGuids).toEqual(['code-guid-1']);
    expect(sel.noteGuids).toEqual(['note1']);
  });

  it('parses AudioSource with AudioSelection', () => {
    const xml = `<Project><Sources>
      <AudioSource guid="a1" name="audio.m4a" path="internal://a1.m4a">
        <AudioSelection guid="as1" begin="1500" end="3700">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </AudioSelection>
      </AudioSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.type).toBe('audio');
    expect(sources[0]!.selections[0]!.begin).toBe(1500);
    expect(sources[0]!.selections[0]!.end).toBe(3700);
  });

  it('parses VideoSource with VideoSelection', () => {
    const xml = `<Project><Sources>
      <VideoSource guid="v1" name="video.mp4" path="internal://v1.mp4">
        <VideoSelection guid="vs1" begin="0" end="5000">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </VideoSelection>
      </VideoSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources[0]!.type).toBe('video');
  });

  it('parses PictureSource with PictureSelection', () => {
    const xml = `<Project><Sources>
      <PictureSource guid="p1" name="photo.jpg" path="internal://p1.jpg">
        <PictureSelection guid="ps1" firstX="100" firstY="200" secondX="600" secondY="500">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </PictureSelection>
      </PictureSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources[0]!.type).toBe('picture');
    const sel = sources[0]!.selections[0]!;
    expect(sel.firstX).toBe(100);
    expect(sel.firstY).toBe(200);
    expect(sel.secondX).toBe(600);
    expect(sel.secondY).toBe(500);
  });

  it('parses PDFSource with PDFSelection and PlainTextSelection', () => {
    const xml = `<Project><Sources>
      <PDFSource guid="pdf1" name="paper.pdf" path="internal://pdf1.pdf">
        <Representation guid="repr1" plainTextPath="internal://repr1.txt"/>
        <PlainTextSelection guid="pts1" startPosition="42" endPosition="98">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </PlainTextSelection>
        <PDFSelection guid="pdfs1" page="0" firstX="61.2" firstY="633.6" secondX="244.8" secondY="316.8">
          <Coding guid="c2"><CodeRef targetGUID="cg2"/></Coding>
        </PDFSelection>
      </PDFSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.type).toBe('pdf');
    expect(sources[0]!.selections).toHaveLength(2);
    expect(sources[0]!.selections[0]!.type).toBe('PlainTextSelection');
    expect(sources[0]!.selections[1]!.type).toBe('PDFSelection');
    expect(sources[0]!.selections[1]!.page).toBe(0);
  });

  it('parses multiple codings per selection', () => {
    const xml = `<Project><Sources>
      <TextSource guid="s1" name="t.txt" plainTextPath="internal://s1.txt">
        <PlainTextSelection guid="sel1" startPosition="0" endPosition="5">
          <Coding guid="c1"><CodeRef targetGUID="g1"/></Coding>
          <Coding guid="c2"><CodeRef targetGUID="g2"/></Coding>
        </PlainTextSelection>
      </TextSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources[0]!.selections[0]!.codeGuids).toEqual(['g1', 'g2']);
  });
});

describe('parseNotes', () => {
  it('parses Note elements with PlainTextContent', () => {
    const xml = `<Project><Notes>
      <Note guid="n1" name="Memo 1" creationDateTime="2026-01-01T00:00:00Z">
        <PlainTextContent>This is a memo</PlainTextContent>
      </Note>
    </Notes></Project>`;
    const doc = parseXml(xml);
    const notes = parseNotes(doc);
    expect(notes.size).toBe(1);
    const note = notes.get('n1')!;
    expect(note.name).toBe('Memo 1');
    expect(note.text).toBe('This is a memo');
  });

  it('detects magnitude prefix in note text', () => {
    const xml = `<Project><Notes>
      <Note guid="n1" name="Magnitude" creationDateTime="2026-01-01T00:00:00Z">
        <PlainTextContent>[Magnitude: High]</PlainTextContent>
      </Note>
    </Notes></Project>`;
    const doc = parseXml(xml);
    const notes = parseNotes(doc);
    const note = notes.get('n1')!;
    expect(note.magnitude).toBe('High');
  });
});

describe('parseLinks', () => {
  it('parses Link elements into relations', () => {
    const xml = `<Project><Links>
      <Link guid="l1" name="causes" direction="OneWay" originGUID="c1" targetGUID="c2"/>
      <Link guid="l2" name="relates" direction="Associative" originGUID="c3" targetGUID="c4"/>
    </Links></Project>`;
    const doc = parseXml(xml);
    const links = parseLinks(doc);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      guid: 'l1', label: 'causes', directed: true, originGuid: 'c1', targetGuid: 'c2',
    });
    expect(links[1]).toEqual({
      guid: 'l2', label: 'relates', directed: false, originGuid: 'c3', targetGuid: 'c4',
    });
  });

  it('returns empty array when no Links section', () => {
    const doc = parseXml('<Project></Project>');
    expect(parseLinks(doc)).toEqual([]);
  });

  it('parses MemoText child as memo on Link', () => {
    const xml = `<Project><Links>
      <Link guid="l1" name="causes" direction="OneWay" originGUID="c1" targetGUID="c2"><MemoText>relation memo</MemoText></Link>
    </Links></Project>`;
    const doc = parseXml(xml);
    const links = parseLinks(doc);
    expect(links).toHaveLength(1);
    expect(links[0]!.memo).toBe('relation memo');
  });

  it('memo undefined when Link self-closing', () => {
    const xml = `<Project><Links>
      <Link guid="l1" name="x" direction="OneWay" originGUID="c1" targetGUID="c2"/>
    </Links></Project>`;
    const doc = parseXml(xml);
    const links = parseLinks(doc);
    expect(links[0]!.memo).toBeUndefined();
  });
});

describe('applyLinks', () => {
  it('applies code-level relation from Link', () => {
    const registry = new CodeDefinitionRegistry();
    const c1 = registry.create('A', '#f00');
    const c2 = registry.create('B', '#0f0');
    const resolver = {
      codes: new Map<string, string>([['g1', c1.id], ['g2', c2.id]]),
      sources: new Map<string, string>(),
      selections: new Map<string, string>(),
    };
    const links: ParsedLink[] = [
      { guid: 'l1', label: 'causes', directed: true, originGuid: 'g1', targetGuid: 'g2' },
    ];
    const mockDm = { section: () => ({ markers: {}, shapes: [], files: [] }), setSection: () => {} } as any;
    const count = applyLinks(links, resolver, registry, mockDm);
    expect(count).toBe(1);
    expect(registry.getById(c1.id)!.relations).toHaveLength(1);
    expect(registry.getById(c1.id)!.relations![0]!.label).toBe('causes');
    expect(registry.getById(c1.id)!.relations![0]!.directed).toBe(true);
  });

  it('skips links with unmapped GUIDs', () => {
    const registry = new CodeDefinitionRegistry();
    const resolver = {
      codes: new Map<string, string>(),
      sources: new Map<string, string>(),
      selections: new Map<string, string>(),
    };
    const links: ParsedLink[] = [
      { guid: 'l1', label: 'x', directed: false, originGuid: 'unknown1', targetGuid: 'unknown2' },
    ];
    const mockDm = { section: () => ({ markers: {}, shapes: [], files: [] }), setSection: () => {} } as any;
    const count = applyLinks(links, resolver, registry, mockDm);
    expect(count).toBe(0);
  });

  it('preserves memo when applying code-level relation', () => {
    const registry = new CodeDefinitionRegistry();
    const c1 = registry.create('A', '#f00');
    const c2 = registry.create('B', '#0f0');
    const resolver = {
      codes: new Map<string, string>([['g1', c1.id], ['g2', c2.id]]),
      sources: new Map<string, string>(),
      selections: new Map<string, string>(),
    };
    const links: ParsedLink[] = [
      { guid: 'l1', label: 'causes', directed: true, originGuid: 'g1', targetGuid: 'g2', memo: 'reflexão code-level' },
    ];
    const mockDm = { section: () => ({ markers: {}, shapes: [], files: [] }), setSection: () => {} } as any;
    applyLinks(links, resolver, registry, mockDm);
    expect(registry.getById(c1.id)!.relations![0]!.memo).toBe('reflexão code-level');
  });

  it('preserves memo on application-level relation (markdown marker)', () => {
    const registry = new CodeDefinitionRegistry();
    const c2 = registry.create('B', '#0f0');
    const markerId = 'marker-1';
    const resolver = {
      codes: new Map<string, string>([['g2', c2.id]]),
      sources: new Map<string, string>(),
      selections: new Map<string, string>([['origGuid', markerId]]),
    };

    const mdData = {
      markers: { 'file1.md': [{ id: markerId, codes: [{ codeId: c2.id }] }] },
      settings: {},
    };
    const sections: Record<string, unknown> = { markdown: mdData };
    const mockDm = {
      section: (k: string) => sections[k] ?? { markers: {}, shapes: [], files: [] },
      setSection: (k: string, v: unknown) => { sections[k] = v; },
    } as any;

    const links: ParsedLink[] = [
      { guid: 'l1', label: 'reforça', directed: false, originGuid: 'origGuid', targetGuid: 'g2', memo: 'app-level memo' },
    ];
    applyLinks(links, resolver, registry, mockDm);

    const relations = (mockDm.section('markdown') as any).markers['file1.md'][0].codes[0].relations;
    expect(relations).toHaveLength(1);
    expect(relations[0].memo).toBe('app-level memo');
  });
});

describe('resolveInternalPath', () => {
  it('maps internal:// to sources/ subfolder (our own exports)', () => {
    expect(resolveInternalPath('internal://abc-123.mp3')).toBe('sources/abc-123.mp3');
  });

  it('strips relative:// prefix without adding sources/ (third-party exports)', () => {
    expect(resolveInternalPath('relative://my-audio.mp3')).toBe('my-audio.mp3');
  });

  it('preserves nested paths after the relative:// prefix', () => {
    expect(resolveInternalPath('relative://interviews/batch-2/p07.mp3')).toBe('interviews/batch-2/p07.mp3');
  });

  it('returns undefined for undefined input', () => {
    expect(resolveInternalPath(undefined)).toBeUndefined();
  });

  it('returns undefined for paths without a recognized prefix', () => {
    expect(resolveInternalPath('just-a-filename.pdf')).toBeUndefined();
    expect(resolveInternalPath('https://example.com/file.mp3')).toBeUndefined();
    expect(resolveInternalPath('')).toBeUndefined();
  });
});
