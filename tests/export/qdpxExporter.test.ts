import { describe, it, expect } from 'vitest';
import { ensureGuid, isValidUuid, buildCodingXml, buildNoteXml, buildNoteRefXml, buildTextSourceXml, buildAudioSourceXml, buildVideoSourceXml, buildImageSourceXml, buildPdfSourceXml, buildProjectXml, createQdpxZip } from '../../src/export/qdpxExporter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { unzipSync, strFromU8 } from 'fflate';
import type { CodeApplication } from '../../src/core/types';
import type { MediaMarker } from '../../src/media/mediaTypes';
import type { ImageMarker } from '../../src/image/imageCodingTypes';
import type { PdfMarker, PdfShapeMarker } from '../../src/pdf/pdfCodingTypes';

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

describe('buildAudioSourceXml', () => {
  it('builds AudioSource with AudioSelection, begin/end in ms', () => {
    const markers: MediaMarker[] = [{
      id: 'am-1', fileId: 'audio/interview.m4a',
      from: 16.176, to: 45.358,
      codes: [{ codeId: 'code-1' }],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildAudioSourceXml('audio/interview.m4a', markers, guidMap, notes);
    expect(xml).toContain('<AudioSource');
    expect(xml).toContain('name="interview.m4a"');
    expect(xml).toContain('<AudioSelection');
    expect(xml).toContain('begin="16176"');
    expect(xml).toContain('end="45358"');
  });
});

describe('buildVideoSourceXml', () => {
  it('builds VideoSource with VideoSelection, begin/end in ms', () => {
    const markers: MediaMarker[] = [{
      id: 'vm-1', fileId: 'video/session.mp4',
      from: 1.5, to: 3.7,
      codes: [{ codeId: 'code-2' }],
      memo: 'Note here',
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildVideoSourceXml('video/session.mp4', markers, guidMap, notes);
    expect(xml).toContain('<VideoSource');
    expect(xml).toContain('begin="1500"');
    expect(xml).toContain('end="3700"');
    expect(xml).toContain('<NoteRef');
    expect(notes.length).toBe(1);
  });
});

describe('buildImageSourceXml', () => {
  it('builds PictureSource with PictureSelection in pixels', () => {
    const markers: ImageMarker[] = [{
      id: 'im-1', fileId: 'images/photo.jpg',
      shape: 'rect',
      coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
      codes: [{ codeId: 'code-1' }],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildImageSourceXml('images/photo.jpg', markers, 1000, 1000, guidMap, notes);
    expect(xml).toContain('<PictureSource');
    expect(xml).toContain('<PictureSelection');
    expect(xml).toContain('firstX="100"');
    expect(xml).toContain('firstY="200"');
    expect(xml).toContain('secondX="600"');
    expect(xml).toContain('secondY="500"');
  });

  it('skips markers with empty polygon', () => {
    const markers: ImageMarker[] = [{
      id: 'im-empty', fileId: 'img.png',
      shape: 'polygon',
      coords: { type: 'polygon', points: [] },
      codes: [{ codeId: 'code-1' }],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildImageSourceXml('img.png', markers, 100, 100, guidMap, notes);
    expect(xml).not.toContain('PictureSelection');
  });
});

describe('buildPdfSourceXml', () => {
  it('builds PDFSource with Representation and PlainTextSelection for text markers', () => {
    const textMarkers: PdfMarker[] = [{
      id: 'pm-1', fileId: 'docs/paper.pdf', page: 0,
      text: 'selected text',
      contextBefore: '', contextAfter: '', occurrenceIndex: 0,
      codes: [{ codeId: 'code-1' }],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const textOffsets = new Map<string, { start: number; end: number }>();
    textOffsets.set('pm-1', { start: 42, end: 98 });
    const xml = buildPdfSourceXml('docs/paper.pdf', textMarkers, [], null, textOffsets, guidMap, notes);
    expect(xml).toContain('<PDFSource');
    expect(xml).toContain('<Representation');
    expect(xml).toContain('plainTextPath=');
    expect(xml).toContain('<PlainTextSelection');
    expect(xml).toContain('startPosition="42"');
    expect(xml).toContain('endPosition="98"');
  });

  it('builds PDFSelection for shape markers with page heights', () => {
    const shapes: PdfShapeMarker[] = [{
      id: 'ps-1', fileId: 'docs/paper.pdf', page: 0,
      shape: 'rect',
      coords: { type: 'rect', x: 10, y: 20, w: 30, h: 40 },
      codes: [{ codeId: 'code-1' }],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const pageHeights: Record<number, { width: number; height: number }> = {
      0: { width: 612, height: 792 },
    };
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildPdfSourceXml('docs/paper.pdf', [], shapes, pageHeights, new Map(), guidMap, notes);
    expect(xml).toContain('<PDFSelection');
    expect(xml).toContain('page="0"');
    expect(xml).toContain('firstX="61.2"');
  });

  it('skips shape markers when page dimensions unavailable', () => {
    const shapes: PdfShapeMarker[] = [{
      id: 'ps-2', fileId: 'docs/paper.pdf', page: 5,
      shape: 'rect', coords: { type: 'rect', x: 10, y: 20, w: 30, h: 40 },
      codes: [{ codeId: 'code-1' }],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildPdfSourceXml('docs/paper.pdf', [], shapes, null, new Map(), guidMap, notes);
    expect(xml).toBe('');
  });
});

describe('buildProjectXml', () => {
  it('assembles Project XML with codebook, sources, and notes', () => {
    const registry = new CodeDefinitionRegistry();
    registry.create('Theme A', '#ff0000');
    const sourcesXml = '<TextSource guid="s1" name="test.md" plainTextPath="relative://test.txt"/>';
    const notesXml = '<Note guid="n1" name="Memo" creationDateTime="2026-01-01T00:00:00.000Z">\n<PlainTextContent>test</PlainTextContent>\n</Note>';
    const xml = buildProjectXml(registry, sourcesXml, notesXml, '', '', 'My Vault', '1.0.0');
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?>/);
    expect(xml).toContain('xmlns="urn:QDA-XML:project:1.0"');
    expect(xml).toContain('name="My Vault"');
    expect(xml).toContain('origin="Qualia Coding 1.0.0"');
    expect(xml).toContain('<CodeBook>');
    expect(xml).toContain('<Sources>');
    expect(xml).toContain('<Notes>');
  });

  it('omits Notes section when no notes', () => {
    const registry = new CodeDefinitionRegistry();
    const xml = buildProjectXml(registry, '', '', '', '', 'Vault', '1.0.0');
    expect(xml).not.toContain('<Notes>');
  });
});

describe('createQdpxZip', () => {
  it('creates ZIP with project.qde', () => {
    const projectXml = '<?xml version="1.0"?><Project/>';
    const zip = createQdpxZip(projectXml, new Map());
    const unzipped = unzipSync(zip);
    expect(unzipped['project.qde']).toBeDefined();
    expect(strFromU8(unzipped['project.qde'])).toBe(projectXml);
  });

  it('includes source files when provided', () => {
    const projectXml = '<Project/>';
    const sources = new Map<string, Uint8Array>();
    sources.set('sources/abc.txt', new TextEncoder().encode('hello'));
    const zip = createQdpxZip(projectXml, sources);
    const unzipped = unzipSync(zip);
    expect(unzipped['sources/abc.txt']).toBeDefined();
    expect(strFromU8(unzipped['sources/abc.txt'])).toBe('hello');
  });
});

describe('full export assembly', () => {
  it('creates valid QDPX ZIP with all engines', () => {
    const registry = new CodeDefinitionRegistry();
    const code1 = registry.create('Theme A', '#ff0000', 'A theme');
    const code2 = registry.create('Theme B', '#00ff00');

    const guidMap = new Map<string, string>();
    const notes: string[] = [];

    // Markdown
    const mdMarkers = [{
      id: 'md-1', fileId: 'test.md',
      range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
      codes: [{ codeId: code1.id }],
      memo: 'A note',
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const mdXml = buildTextSourceXml('test.md', mdMarkers as any, 'hello world', guidMap, notes);

    // Audio
    const audioMarkers: MediaMarker[] = [{
      id: 'au-1', fileId: 'audio.m4a',
      from: 1.5, to: 3.0,
      codes: [{ codeId: code2.id }],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const audioXml = buildAudioSourceXml('audio.m4a', audioMarkers, guidMap, notes);

    const sourcesXml = [mdXml, audioXml].filter(Boolean).join('\n');
    const notesXml = notes.join('\n');
    const projectXml = buildProjectXml(registry, sourcesXml, notesXml, '', '', 'Test Vault', '1.0.0');

    // Verify XML structure
    expect(projectXml).toContain('xmlns="urn:QDA-XML:project:1.0"');
    expect(projectXml).toContain('<CodeBook>');
    expect(projectXml).toContain('name="Theme A"');
    expect(projectXml).toContain('<Description>A theme</Description>');
    expect(projectXml).toContain('<Sources>');
    expect(projectXml).toContain('<TextSource');
    expect(projectXml).toContain('<AudioSource');
    expect(projectXml).toContain('<Notes>');
    expect(projectXml).toContain('<PlainTextContent>A note</PlainTextContent>');

    // Verify ZIP
    const zip = createQdpxZip(projectXml, new Map());
    const unzipped = unzipSync(zip);
    const content = strFromU8(unzipped['project.qde']);
    expect(content).toContain('<Project');
    expect(content).toContain('<AudioSource');
  });
});
