import { describe, it, expect } from 'vitest';
import { consolidate, extractCodes } from '../../src/analytics/data/dataConsolidator';

describe('consolidate', () => {
  // ── Empty / null data ──────────────────────────────────────

  it('returns empty result for all null inputs', () => {
    const result = consolidate(null, null, null, null, null, null);
    expect(result.markers).toEqual([]);
    expect(result.codes).toEqual([]);
    expect(result.sources.markdown).toBe(false);
    expect(result.sources.csv).toBe(false);
    expect(result.sources.image).toBe(false);
    expect(result.sources.pdf).toBe(false);
    expect(result.sources.audio).toBe(false);
    expect(result.sources.video).toBe(false);
  });

  it('returns empty result for empty data objects', () => {
    const result = consolidate({}, {}, {}, {}, {}, {});
    expect(result.markers).toEqual([]);
  });

  // ── Single markers per engine ──────────────────────────────

  it('consolidates a single markdown marker', () => {
    const mdData = {
      markers: {
        'file.md': [
          { id: 'm1', fileId: 'file.md', codes: [{codeId: 'codeA'}], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } } },
        ],
      },
    };
    const result = consolidate(mdData, null, null);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('markdown');
    expect(result.markers[0]!.codes).toEqual(['codeA']);
    expect(result.sources.markdown).toBe(true);
  });

  it('consolidates a single PDF marker with page', () => {
    const pdfData = {
      markers: [
        { id: 'p1', fileId: 'doc.pdf', codes: [{codeId: 'codeB'}], page: 3, text: 'highlighted' },
      ],
    };
    const result = consolidate(null, null, null, pdfData);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('pdf');
    expect(result.markers[0]!.meta?.page).toBe(3);
    expect(result.markers[0]!.meta?.pdfText).toBe('highlighted');
  });

  it('consolidates a single CSV segment marker', () => {
    const csvData = {
      segmentMarkers: [
        { id: 'c1', fileId: 'data.csv', codes: [{codeId: 'codeC'}], row: 5, column: 'col1', from: 0, to: 10 },
      ],
    };
    const result = consolidate(null, csvData, null);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('csv-segment');
    expect(result.markers[0]!.meta?.row).toBe(5);
  });

  it('consolidates a single image marker', () => {
    const imageData = {
      markers: [
        { id: 'i1', fileId: 'photo.png', codes: [{codeId: 'codeD'}], shape: 'rect', coords: { y: 10, height: 50 } },
      ],
    };
    const result = consolidate(null, null, imageData);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('image');
    expect(result.markers[0]!.meta?.regionType).toBe('rect');
  });

  it('consolidates a single audio marker with time range', () => {
    const audioData = {
      files: [
        {
          path: 'audio.mp3',
          markers: [
            { id: 'a1', codes: [{codeId: 'codeE'}], from: 5.0, to: 10.0 },
          ],
        },
      ],
    };
    const result = consolidate(null, null, null, null, audioData);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('audio');
    expect(result.markers[0]!.meta?.audioFrom).toBe(5.0);
    expect(result.markers[0]!.meta?.audioTo).toBe(10.0);
  });

  it('consolidates a single video marker', () => {
    const videoData = {
      files: [
        {
          path: 'video.mp4',
          markers: [
            { id: 'v1', codes: [{codeId: 'codeF'}], from: 60, to: 90 },
          ],
        },
      ],
    };
    const result = consolidate(null, null, null, null, null, videoData);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('video');
    expect(result.markers[0]!.fileId).toBe('video.mp4');
  });

  // ── Code definitions ───────────────────────────────────────

  it('merges code definitions from multiple engines', () => {
    const mdData = {
      markers: { 'f.md': [{ id: 'm1', codes: [{codeId: 'shared'}], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } } }] },
      codeDefinitions: { d1: { id: 'shared', name: 'shared', color: '#F00' } },
    };
    const pdfData = {
      markers: [{ id: 'p1', fileId: 'f.pdf', codes: [{codeId: 'shared'}], page: 1, text: 'x' }],
      registry: { definitions: { d2: { id: 'shared', name: 'shared', color: '#0F0' } } },
    };
    const result = consolidate(mdData, null, null, pdfData);
    // 'shared' appears in both but should be deduplicated in codes
    const sharedCode = result.codes.find(c => c.name === 'shared');
    expect(sharedCode).toBeDefined();
    expect(sharedCode!.sources).toContain('markdown');
    expect(sharedCode!.sources).toContain('pdf');
  });

  it('deduplicates codes appearing from different engines', () => {
    const mdData = {
      markers: { 'f.md': [{ id: 'm1', codes: [{codeId: 'dup'}], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } } }] },
    };
    const csvData = {
      segmentMarkers: [{ id: 'c1', fileId: 'f.csv', codes: [{codeId: 'dup'}], row: 0, column: 'c' }],
    };
    const result = consolidate(mdData, csvData, null);
    const dupCodes = result.codes.filter(c => c.name === 'dup');
    expect(dupCodes.length).toBe(1);
    expect(dupCodes[0]!.sources).toContain('markdown');
    expect(dupCodes[0]!.sources).toContain('csv-segment');
  });

  // ── Skipping markers without codes ─────────────────────────

  it('skips markers with empty codes array', () => {
    const mdData = {
      markers: { 'f.md': [{ id: 'm1', codes: [], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } } }] },
    };
    const result = consolidate(mdData, null, null);
    expect(result.markers.length).toBe(0);
  });

  // ── lastUpdated ────────────────────────────────────────────

  it('includes lastUpdated timestamp', () => {
    const before = Date.now();
    const result = consolidate(null, null, null);
    expect(result.lastUpdated).toBeGreaterThanOrEqual(before);
  });

  // ── CSV row markers ────────────────────────────────────────

  it('consolidates CSV row markers', () => {
    const csvData = {
      rowMarkers: [
        { id: 'r1', fileId: 'data.csv', codes: [{codeId: 'rowCode'}], row: 2, column: 'all' },
      ],
    };
    const result = consolidate(null, csvData, null);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('csv-row');
  });

  // ── PDF with shapes (not just text markers) ──

  it('consolidates PDF shape marker without text', () => {
    const pdfData = {
      markers: [
        { id: 'ps1', fileId: 'doc.pdf', codes: [{codeId: 'shapeCode'}], page: 2, text: null, isShape: true },
      ],
    };
    const result = consolidate(null, null, null, pdfData);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('pdf');
    expect(result.markers[0]!.meta?.page).toBe(2);
    expect(result.markers[0]!.meta?.pdfText).toBe('');
  });

  it('consolidates PDF shapes from pdfData.shapes array', () => {
    const pdfData = {
      markers: [],
      shapes: [
        { id: 'sh1', fileId: 'doc.pdf', page: 3, shape: 'rect', coords: {}, codes: [{codeId: 'shapeA'}], createdAt: 1700000000, updatedAt: 1700000000 },
        { id: 'sh2', fileId: 'doc.pdf', page: 5, shape: 'ellipse', coords: {}, codes: [{codeId: 'shapeB'}], createdAt: 1700000001, updatedAt: 1700000001 },
      ],
    };
    const result = consolidate(null, null, null, pdfData);
    expect(result.markers).toHaveLength(2);
    expect(result.markers[0]!.source).toBe('pdf');
    expect(result.markers[0]!.codes).toEqual(['shapeA']);
    expect(result.markers[0]!.meta?.page).toBe(3);
    expect(result.markers[0]!.meta?.pdfText).toBe('[rect region]');
    expect(result.markers[1]!.meta?.pdfText).toBe('[ellipse region]');
    expect(result.markers[0]!.meta?.createdAt).toBe(1700000000);
  });

  it('skips PDF shapes with empty codes', () => {
    const pdfData = {
      markers: [],
      shapes: [
        { id: 'sh3', fileId: 'doc.pdf', page: 1, shape: 'rect', coords: {}, codes: [] },
      ],
    };
    const result = consolidate(null, null, null, pdfData);
    expect(result.markers).toHaveLength(0);
  });

  it('consolidates PDF marker with createdAt in meta', () => {
    const pdfData = {
      markers: [
        { id: 'ps2', fileId: 'doc.pdf', codes: [{codeId: 'codeX'}], page: 5, text: 'text', createdAt: 1700000000 },
      ],
    };
    const result = consolidate(null, null, null, pdfData);
    expect(result.markers[0]!.meta?.createdAt).toBe(1700000000);
  });

  it('consolidates PDF with registry definitions', () => {
    const pdfData = {
      markers: [
        { id: 'p1', fileId: 'doc.pdf', codes: [{codeId: 'pdfCode'}], page: 1, text: 'x' },
      ],
      registry: { definitions: { d1: { id: 'pdfCode', name: 'pdfCode', color: '#ABC', description: 'PDF specific' } } },
    };
    const result = consolidate(null, null, null, pdfData);
    const code = result.codes.find(c => c.name === 'pdfCode');
    expect(code).toBeDefined();
    expect(code!.color).toBe('#ABC');
    expect(code!.description).toBe('PDF specific');
    expect(code!.sources).toContain('pdf');
  });

  // ── Audio with multiple files ──

  it('consolidates audio markers from multiple files', () => {
    const audioData = {
      files: [
        {
          path: 'track1.mp3',
          markers: [
            { id: 'a1', codes: [{codeId: 'intro'}], from: 0, to: 5 },
            { id: 'a2', codes: [{codeId: 'chorus'}], from: 30, to: 60, createdAt: 1700000000 },
          ],
        },
        {
          path: 'track2.mp3',
          markers: [
            { id: 'a3', codes: [{codeId: 'verse'}], from: 10, to: 25 },
          ],
        },
      ],
    };
    const result = consolidate(null, null, null, null, audioData);
    expect(result.markers.length).toBe(3);
    expect(result.markers.filter(m => m.fileId === 'track1.mp3')).toHaveLength(2);
    expect(result.markers.filter(m => m.fileId === 'track2.mp3')).toHaveLength(1);
    expect(result.sources.audio).toBe(true);
  });

  it('includes createdAt in audio marker meta when present', () => {
    const audioData = {
      files: [
        {
          path: 'audio.mp3',
          markers: [
            { id: 'a1', codes: [{codeId: 'code'}], from: 0, to: 5, createdAt: 1700000000 },
          ],
        },
      ],
    };
    const result = consolidate(null, null, null, null, audioData);
    expect(result.markers[0]!.meta?.createdAt).toBe(1700000000);
  });

  it('consolidates audio with code definitions', () => {
    const audioData = {
      files: [
        { path: 'a.mp3', markers: [{ id: 'a1', codes: [{codeId: 'beat'}], from: 0, to: 1 }] },
      ],
      codeDefinitions: { definitions: { d1: { id: 'beat', name: 'beat', color: '#F0F', description: 'Beat pattern' } } },
    };
    const result = consolidate(null, null, null, null, audioData);
    const code = result.codes.find(c => c.name === 'beat');
    expect(code).toBeDefined();
    expect(code!.sources).toContain('audio');
  });

  // ── Video with multiple files ──

  it('consolidates video markers from multiple files', () => {
    const videoData = {
      files: [
        {
          path: 'clip1.mp4',
          markers: [
            { id: 'v1', codes: [{codeId: 'scene1'}], from: 0, to: 30 },
          ],
        },
        {
          path: 'clip2.mp4',
          markers: [
            { id: 'v2', codes: [{codeId: 'scene2'}], from: 60, to: 120 },
            { id: 'v3', codes: [{codeId: 'scene3'}], from: 120, to: 180, createdAt: 1700000000 },
          ],
        },
      ],
    };
    const result = consolidate(null, null, null, null, null, videoData);
    expect(result.markers.length).toBe(3);
    expect(result.markers.filter(m => m.fileId === 'clip1.mp4')).toHaveLength(1);
    expect(result.markers.filter(m => m.fileId === 'clip2.mp4')).toHaveLength(2);
    expect(result.sources.video).toBe(true);
  });

  it('includes createdAt in video marker meta when present', () => {
    const videoData = {
      files: [
        { path: 'v.mp4', markers: [{ id: 'v1', codes: [{codeId: 'c'}], from: 0, to: 5, createdAt: 9999 }] },
      ],
    };
    const result = consolidate(null, null, null, null, null, videoData);
    expect(result.markers[0]!.meta?.createdAt).toBe(9999);
  });

  it('consolidates video with code definitions', () => {
    const videoData = {
      files: [
        { path: 'v.mp4', markers: [{ id: 'v1', codes: [{codeId: 'action'}], from: 0, to: 10 }] },
      ],
      codeDefinitions: { definitions: { d1: { id: 'action', name: 'action', color: '#F00' } } },
    };
    const result = consolidate(null, null, null, null, null, videoData);
    const code = result.codes.find(c => c.name === 'action');
    expect(code).toBeDefined();
    expect(code!.sources).toContain('video');
  });

  // ── Edge cases ──

  it('skips markers with null codes', () => {
    const pdfData = {
      markers: [
        { id: 'p1', fileId: 'doc.pdf', codes: null, page: 1, text: 'x' },
      ],
    };
    const result = consolidate(null, null, null, pdfData);
    expect(result.markers.length).toBe(0);
  });

  it('handles markdown markers with non-array fileMarkers entry', () => {
    const mdData = {
      markers: {
        'file.md': 'not-an-array',
      },
    };
    const result = consolidate(mdData, null, null);
    expect(result.markers.length).toBe(0);
    expect(result.sources.markdown).toBe(true);
  });

  it('discovers codes from markers not present in definitions', () => {
    const pdfData = {
      markers: [
        { id: 'p1', fileId: 'doc.pdf', codes: [{codeId: 'orphan'}], page: 1, text: 'x' },
      ],
      // No registry definitions for 'orphan'
    };
    const result = consolidate(null, null, null, pdfData);
    const code = result.codes.find(c => c.name === 'orphan');
    expect(code).toBeDefined();
    expect(code!.color).toBe('#6200EE'); // default color
    expect(code!.sources).toContain('pdf');
  });

  it('codes are sorted alphabetically', () => {
    const mdData = {
      markers: {
        'f.md': [
          { id: 'm1', codes: [{codeId: 'zebra'}], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } } },
          { id: 'm2', codes: [{codeId: 'alpha'}], range: { from: { line: 1, ch: 0 }, to: { line: 1, ch: 5 } } },
        ],
      },
    };
    const result = consolidate(mdData, null, null);
    expect(result.codes[0]!.name).toBe('alpha');
    expect(result.codes[1]!.name).toBe('zebra');
  });

  it('consolidates image marker without coords', () => {
    const imageData = {
      markers: [
        { id: 'i1', fileId: 'img.png', codes: [{codeId: 'tag'}], shape: 'ellipse' },
      ],
    };
    const result = consolidate(null, null, imageData);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.meta?.regionType).toBe('ellipse');
  });

  it('handles CSV registry definitions', () => {
    const csvData = {
      segmentMarkers: [
        { id: 'c1', fileId: 'data.csv', codes: [{codeId: 'csvCode'}], row: 0, column: 'c' },
      ],
      registry: { definitions: { d1: { id: 'csvCode', name: 'csvCode', color: '#0F0', description: 'CSV code' } } },
    };
    const result = consolidate(null, csvData, null);
    const code = result.codes.find(c => c.name === 'csvCode');
    expect(code).toBeDefined();
    expect(code!.color).toBe('#0F0');
    expect(code!.sources).toContain('csv-segment');
  });

  it('handles image registry definitions', () => {
    const imageData = {
      markers: [
        { id: 'i1', fileId: 'img.png', codes: [{codeId: 'imgCode'}], shape: 'rect' },
      ],
      registry: { definitions: { d1: { id: 'imgCode', name: 'imgCode', color: '#00F' } } },
    };
    const result = consolidate(null, null, imageData);
    const code = result.codes.find(c => c.name === 'imgCode');
    expect(code).toBeDefined();
    expect(code!.sources).toContain('image');
  });
});

describe('extractCodes', () => {
  it('returns empty for non-array input', () => {
    expect(extractCodes(null)).toEqual([]);
    expect(extractCodes(undefined)).toEqual([]);
    expect(extractCodes('string')).toEqual([]);
    expect(extractCodes(42)).toEqual([]);
    expect(extractCodes({})).toEqual([]);
  });

  it('returns empty for empty array', () => {
    expect(extractCodes([])).toEqual([]);
  });

  it('extracts codeId from a single CodeApplication', () => {
    expect(extractCodes([{ codeId: 'c_1' }])).toEqual(['c_1']);
  });

  it('extracts codeIds from multiple CodeApplications preserving order', () => {
    expect(extractCodes([{ codeId: 'c_1' }, { codeId: 'c_2' }, { codeId: 'c_3' }])).toEqual(['c_1', 'c_2', 'c_3']);
  });

  it('ignores bare string entries (removed legacy branch)', () => {
    expect(extractCodes(['c_1', 'c_2'])).toEqual([]);
  });

  it('ignores {name} entries (removed legacy branch)', () => {
    expect(extractCodes([{ name: 'c_1' }])).toEqual([]);
  });

  it('ignores null, undefined, and non-objects inside the array', () => {
    expect(extractCodes([null, undefined, 42, 'str', { codeId: 'c_1' }])).toEqual(['c_1']);
  });
});
