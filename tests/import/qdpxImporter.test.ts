import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseXml } from '../../src/import/xmlParser';
import {
  parseSources,
  parseNotes,
  parseLinks,
  applyLinks,
  collectQdpxPdfContinuedByDiagnostics,
  buildPdfMultipageFragmentHints,
  resolveInternalPath,
  createPdfMarker,
  resolveImportedPdfText,
  type ParsedLink,
  type ParsedSource,
} from '../../src/import/qdpxImporter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { DataManager } from '../../src/core/dataManager';
import type { Plugin } from 'obsidian';
import { isMarkerPending } from '../../src/pdf/resolvePendingIndices';

function createMockPlugin() {
  let stored: any = null;
  return {
    loadData: vi.fn(async () => stored),
    saveData: vi.fn(async (data: any) => { stored = data; }),
  } as unknown as Plugin;
}

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

  it('parses PlainTextSelection nested inside PDF Representation', () => {
    const xml = `<Project><Sources>
      <PDFSource guid="pdf1" name="paper.pdf" path="internal://pdf1.pdf">
        <PDFSelection guid="pdfs1" page="5" firstX="10" firstY="20" secondX="30" secondY="40">
          <Coding guid="c1"><CodeRef targetGUID="cg1"/></Coding>
        </PDFSelection>
        <Representation guid="repr1" plainTextPath="internal://repr1.txt">
          <PlainTextSelection guid="pdfs1" startPosition="42" endPosition="98">
            <Coding guid="c2"><CodeRef targetGUID="cg1"/></Coding>
          </PlainTextSelection>
        </Representation>
      </PDFSource>
    </Sources></Project>`;
    const doc = parseXml(xml);
    const sources = parseSources(doc);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.plainTextPath).toBe('internal://repr1.txt');
    expect(sources[0]!.selections).toHaveLength(2);
    expect(sources[0]!.selections.map(sel => sel.type)).toEqual(['PlainTextSelection', 'PDFSelection']);
    expect(sources[0]!.selections[0]!.guid).toBe('pdfs1');
    expect(sources[0]!.selections[0]!.startPosition).toBe(42);
    expect(sources[0]!.selections[1]!.page).toBe(5);
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

describe('createPdfMarker', () => {
  let dm: DataManager;

  beforeEach(async () => {
    dm = new DataManager(createMockPlugin());
    await dm.load();
  });

  it('prefers visual PDFSelection page when offsets come from Representation without formfeeds', () => {
    const sel = {
      guid: 'pdf-guid-1',
      type: 'PDFSelection',
      codeGuids: [],
      noteGuids: [],
      page: 5,
      startPosition: 10,
      endPosition: 16,
    } as const;
    const result = {
      codesCreated: 0,
      codesMerged: 0,
      sourcesImported: 0,
      segmentsCreated: 0,
      memosImported: 0,
      relationsImported: 0,
      warnings: [] as string[],
    };

    const count = createPdfMarker(
      sel,
      'docs/paper.pdf',
      [{ codeId: 'c1' }],
      undefined,
      0,
      dm,
      result,
      '0123456789abcdef',
      [0],
      null,
    );

    expect(count).toBe(1);
    const markers = dm.section('pdf').markers;
    expect(markers).toHaveLength(1);
    expect(markers[0]!.page).toBe(6);
    expect(markers[0]!.text).toBe('abcdef');
    expect(markers[0]!.codes).toEqual([{ codeId: 'c1' }]);
    expect(isMarkerPending(markers[0] as any)).toBe(true);
  });

  it('uses selection name as anchor when Atlas.ti offsets are drifted', () => {
    const sel = {
      guid: 'pdf-guid-2',
      type: 'PDFSelection',
      name: 'The development tools for the virtual  team were not unified',
      codeGuids: [],
      noteGuids: [],
      page: 5,
      startPosition: 88,
      endPosition: 148,
    } as const;
    const result = {
      codesCreated: 0,
      codesMerged: 0,
      sourcesImported: 0,
      segmentsCreated: 0,
      memosImported: 0,
      relationsImported: 0,
      warnings: [] as string[],
    };
    const plainText = 'prefix text The development tools for the virtual  team were not unified suffix text';

    const count = createPdfMarker(
      sel,
      'docs/paper.pdf',
      [{ codeId: 'c1' }],
      undefined,
      0,
      dm,
      result,
      plainText,
      [0],
      null,
    );

    expect(count).toBe(1);
    const markers = dm.section('pdf').markers;
    expect(markers).toHaveLength(1);
    expect(markers[0]!.text).toBe('The development tools for the virtual  team were not unified');
  });

  it('preserves PDFSelection bbox as a hint on named text markers without creating a shape', () => {
    const sel = {
      guid: 'pdf-guid-bbox',
      type: 'PDFSelection',
      name: 'Atlas text quotation',
      codeGuids: [],
      noteGuids: [],
      page: 5,
      startPosition: 7,
      endPosition: 27,
      firstX: 61.2,
      firstY: 316.8,
      secondX: 244.8,
      secondY: 633.6,
    } as const;
    const result = {
      codesCreated: 0,
      codesMerged: 0,
      sourcesImported: 0,
      segmentsCreated: 0,
      memosImported: 0,
      relationsImported: 0,
      warnings: [] as string[],
    };

    const count = createPdfMarker(
      sel,
      'docs/paper.pdf',
      [{ codeId: 'c1' }],
      undefined,
      0,
      dm,
      result,
      'prefix Atlas text quotation suffix',
      [0],
      { 5: { width: 612, height: 792 } },
    );

    expect(count).toBe(1);
    const pdf = dm.section('pdf');
    expect(pdf.shapes).toHaveLength(0);
    const bbox = pdf.markers[0]!.importedPdfSelectionBBox!;
    expect(bbox).toMatchObject({
      source: 'qdpx-pdf-selection',
      page: 6,
    });
    expect(bbox.x).toBeCloseTo(10);
    expect(bbox.y).toBeCloseTo(40);
    expect(bbox.w).toBeCloseTo(30);
    expect(bbox.h).toBeCloseTo(40);
    expect(pdf.markers[0]!.importedPdfTextContext).toMatchObject({
      source: 'qdpx-plain-text-selection',
      startPosition: 7,
      endPosition: 27,
      exact: 'Atlas text quotation',
      resolutionStrategy: 'offset',
    });
  });

  it('does not fall back to shape for named PDFSelection when text cannot be reconstructed', () => {
    const sel = {
      guid: 'pdf-guid-3',
      type: 'PDFSelection',
      name: 'Atlas text quotation',
      codeGuids: [],
      noteGuids: [],
      page: 5,
      firstX: 10,
      firstY: 20,
      secondX: 30,
      secondY: 40,
    } as const;
    const result = {
      codesCreated: 0,
      codesMerged: 0,
      sourcesImported: 0,
      segmentsCreated: 0,
      memosImported: 0,
      relationsImported: 0,
      warnings: [] as string[],
    };

    const count = createPdfMarker(
      sel,
      'docs/paper.pdf',
      [{ codeId: 'c1' }],
      undefined,
      0,
      dm,
      result,
      'plain text without the quotation',
      [0],
      { 5: { width: 612, height: 792 } },
    );

    expect(count).toBe(0);
    expect(dm.section('pdf').markers).toHaveLength(0);
    expect(dm.section('pdf').shapes).toHaveLength(0);
  });
});

describe('buildPdfMultipageFragmentHints', () => {
  it('reconhece páginas adjacentes com uma única seleção textual âncora', () => {
    const source: ParsedSource = {
      guid: 'source-1',
      name: 'paper.pdf',
      type: 'pdf',
      selections: [
        { guid: 'anchor', type: 'PlainTextSelection', codeGuids: ['code-1'], noteGuids: [] },
        { guid: 'anchor', type: 'PDFSelection', name: 'Long quotation', createdAt: '2026-01-01', page: 4, codeGuids: ['code-1'], noteGuids: [] },
        { guid: 'continuation', type: 'PDFSelection', name: 'Long quotation', createdAt: '2026-01-01', page: 5, codeGuids: ['code-1'], noteGuids: [] },
      ],
      variables: [],
    };

    const hints = buildPdfMultipageFragmentHints(source);

    expect(hints.size).toBe(2);
    expect(hints.get('anchor')).toMatchObject({ groupId: 'anchor', role: 'anchor' });
    expect(hints.get('continuation')).toMatchObject({ groupId: 'anchor', role: 'continuation' });
    expect(hints.get('anchor')!.relatedSelectionGuids).toEqual(['anchor', 'continuation']);
  });

  it('não agrupa seleções semelhantes em páginas não adjacentes', () => {
    const source: ParsedSource = {
      guid: 'source-1',
      name: 'paper.pdf',
      type: 'pdf',
      selections: [
        { guid: 'anchor', type: 'PlainTextSelection', codeGuids: ['code-1'], noteGuids: [] },
        { guid: 'anchor', type: 'PDFSelection', name: 'Long quotation', createdAt: '2026-01-01', page: 4, codeGuids: ['code-1'], noteGuids: [] },
        { guid: 'separate', type: 'PDFSelection', name: 'Long quotation', createdAt: '2026-01-01', page: 6, codeGuids: ['code-1'], noteGuids: [] },
      ],
      variables: [],
    };

    expect(buildPdfMultipageFragmentHints(source).size).toBe(0);
  });
});

describe('resolveImportedPdfText', () => {
  it('reanchors when Atlas.ti offsets drift away from the actual text start', () => {
    const sel = {
      guid: 'atlas-d12',
      type: 'PDFSelection',
      name: 'The development tools for the virtual  team were not unified',
      codeGuids: [],
      noteGuids: [],
      page: 5,
      startPosition: 34364,
      endPosition: 34424,
    } as const;
    const plainText = 'prefix The development tools for the virtual  team were not unified suffix tform was used for  requirement development while design-sha';

    const resolution = resolveImportedPdfText(sel, plainText);
    expect(resolution.strategy).toBe('name+length');
    expect(resolution.text).toBe('The development tools for the virtual  team were not unified');
  });

  it('recovers the D1 multi-column quotation from the selection name instead of the broken offset slice', () => {
    const sel = {
      guid: 'atlas-d1-multicolumn',
      type: 'PDFSelection',
      name: '- Evangelization and mentoring on DevOps practices for pro�moting culture values, such as communicat…',
      codeGuids: [],
      noteGuids: [],
      page: 5,
      startPosition: 35186,
      endPosition: 35330,
    } as const;
    const plainText = [
      'ture (e.g., cloud infrastructure, virtualization or  containerization, etc.) to implement best practices, such  as continuous integration, continuous testing, continuous  delivery and deployment, infrastructure as code, and con�tinuous monitoring.',
      '- Evangelization and mentoring on DevOps practices for pro�moting culture values, such as communication, transparency,  and knowledge sharing.',
      '- Rotary human resources, i.e., horizontal teams may facilitate  and provide product teams with human resources when  these teams lack speciffc skills to undertake and accomplish  their work and implement best practices.',
      ' culture values, such as communication, transparency,  and knowledge sharing.\n- Rotary human resources, i.e., horizontal teams may facilitate  a',
    ].join('\n');

    const resolution = resolveImportedPdfText(sel, plainText);
    expect(resolution.strategy).toBe('name+length');
    expect(resolution.text).toContain('Evangelization and mentoring on DevOps practices');
    expect(resolution.text).toContain('knowledge sharing');
    expect(resolution.text).not.toBe(' culture values, such as communication, transparency,  and knowledge sharing.\n- Rotary human resources, i.e., horizontal teams may facilitate  a');
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

  it('summarizes PDF continued-by links against imported markers', () => {
    const sources = [{
      guid: 'src1',
      name: 'paper.pdf',
      type: 'pdf' as const,
      selections: [
        { guid: 'sel1', type: 'PDFSelection' as const, name: 'first fragment', page: 1, firstX: 10, firstY: 20, secondX: 30, secondY: 40, codeGuids: [], noteGuids: [] },
        { guid: 'sel2', type: 'PDFSelection' as const, name: 'second fragment', page: 1, firstX: 40, firstY: 20, secondX: 80, secondY: 40, codeGuids: [], noteGuids: [] },
        { guid: 'sel1', type: 'PlainTextSelection' as const, startPosition: 0, endPosition: 14, codeGuids: [], noteGuids: [] },
        { guid: 'sel2', type: 'PlainTextSelection' as const, startPosition: 15, endPosition: 30, codeGuids: [], noteGuids: [] },
      ],
      variables: [],
    }];
    const links: ParsedLink[] = [
      { guid: 'link1', label: 'continued by', directed: true, originGuid: 'sel1', targetGuid: 'sel2' },
      { guid: 'link2', label: 'causes', directed: true, originGuid: 'sel1', targetGuid: 'sel2' },
    ];
    const resolver = {
      codes: new Map<string, string>(),
      sources: new Map<string, string>([['src1', 'imports/paper.pdf']]),
      selections: new Map<string, string>([['sel1', 'import_sel1'], ['sel2', 'import_sel2']]),
      smartCodes: new Map<string, string>(),
    };
    const markers = [
      {
        markerType: 'pdf' as const,
        id: 'import_sel1',
        fileId: 'imports/paper.pdf',
        page: 1,
        beginIndex: 0,
        beginOffset: 0,
        endIndex: 0,
        endOffset: 0,
        text: 'first fragment',
        codes: [],
        createdAt: 1,
        updatedAt: 1,
        importedPdfSelectionBBox: { source: 'qdpx-pdf-selection' as const, page: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
      },
      {
        markerType: 'pdf' as const,
        id: 'import_sel2',
        fileId: 'imports/paper.pdf',
        page: 1,
        beginIndex: 5,
        beginOffset: 0,
        endIndex: 5,
        endOffset: 10,
        text: 'second fragment',
        codes: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const diagnostics = collectQdpxPdfContinuedByDiagnostics(sources, links, resolver, markers);

    expect(diagnostics.rows).toHaveLength(1);
    expect(diagnostics.rows[0]).toMatchObject({
      source: 'paper.pdf',
      filePath: 'imports/paper.pdf',
      pdfSelections: 2,
      plainTextSelections: 2,
      pairedSelections: 2,
      continuedByLinks: 1,
      continuedBySelectionEndpoints: 2,
      continuedByMappedMarkers: 2,
      continuedByPendingMarkers: 1,
      continuedByShortTextMarkersLt64: 2,
      continuedByPendingShortTextMarkersLt64: 1,
      continuedByMarkersWithBBox: 1,
      continuedByPendingMarkersWithBBox: 1,
      continuedByUnmappedEndpoints: 0,
    });
    expect(diagnostics.samples).toHaveLength(1);
    expect(diagnostics.samples[0]).toMatchObject({
      linkId: 'link1',
      originMarkerId: 'import_sel1',
      targetMarkerId: 'import_sel2',
      originPending: true,
      targetPending: false,
    });
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
    expect(registry.getById(c1.id)!.relations![0]!.memo?.content).toBe('reflexão code-level');
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
    expect(relations[0].memo?.content).toBe('app-level memo');
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
