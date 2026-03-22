import { describe, it, expect } from 'vitest';
import { ensureGuid, isValidUuid, buildCodingXml, buildNoteXml, buildNoteRefXml, buildTextSourceXml, buildAudioSourceXml, buildVideoSourceXml, buildImageSourceXml, buildPdfSourceXml } from '../../src/export/qdpxExporter';
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
      beginIndex: 0, beginOffset: 42, endIndex: 0, endOffset: 98,
      text: 'selected text',
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
      coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
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
      shape: 'rect', coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      codes: [{ codeId: 'code-1' }],
      createdAt: Date.now(), updatedAt: Date.now(),
    }];
    const guidMap = new Map<string, string>();
    const notes: string[] = [];
    const xml = buildPdfSourceXml('docs/paper.pdf', [], shapes, null, new Map(), guidMap, notes);
    expect(xml).toBe('');
  });
});
