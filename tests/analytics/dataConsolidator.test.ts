import { describe, it, expect } from 'vitest';
import { consolidate } from '../../src/analytics/data/dataConsolidator';

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
          { id: 'm1', fileId: 'file.md', codes: ['codeA'], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 } } },
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
        { id: 'p1', fileId: 'doc.pdf', codes: ['codeB'], page: 3, text: 'highlighted' },
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
        { id: 'c1', fileId: 'data.csv', codes: ['codeC'], row: 5, column: 'col1', from: 0, to: 10 },
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
        { id: 'i1', fileId: 'photo.png', codes: ['codeD'], shape: 'rect', coords: { y: 10, height: 50 } },
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
            { id: 'a1', codes: ['codeE'], from: 5.0, to: 10.0 },
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
            { id: 'v1', codes: ['codeF'], from: 60, to: 90 },
          ],
        },
      ],
    };
    const result = consolidate(null, null, null, null, null, videoData);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('video');
    expect(result.markers[0]!.file).toBe('video.mp4');
  });

  // ── Code definitions ───────────────────────────────────────

  it('merges code definitions from multiple engines', () => {
    const mdData = {
      markers: { 'f.md': [{ id: 'm1', codes: ['shared'], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } } }] },
      codeDefinitions: { d1: { name: 'shared', color: '#F00' } },
    };
    const pdfData = {
      markers: [{ id: 'p1', fileId: 'f.pdf', codes: ['shared'], page: 1, text: 'x' }],
      registry: { definitions: { d2: { name: 'shared', color: '#0F0' } } },
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
      markers: { 'f.md': [{ id: 'm1', codes: ['dup'], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } } }] },
    };
    const csvData = {
      segmentMarkers: [{ id: 'c1', fileId: 'f.csv', codes: ['dup'], row: 0, column: 'c' }],
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

  // ── Codes with {name: string} format ───────────────────────

  it('handles codes as objects with name property', () => {
    const mdData = {
      markers: {
        'f.md': [
          { id: 'm1', codes: [{ name: 'objCode' }], range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } } },
        ],
      },
    };
    const result = consolidate(mdData, null, null);
    expect(result.markers[0]!.codes).toEqual(['objCode']);
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
        { id: 'r1', fileId: 'data.csv', codes: ['rowCode'], row: 2, column: 'all' },
      ],
    };
    const result = consolidate(null, csvData, null);
    expect(result.markers.length).toBe(1);
    expect(result.markers[0]!.source).toBe('csv-row');
  });
});
