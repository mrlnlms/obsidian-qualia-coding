import { describe, it, expect } from 'vitest';
import {
  isPdfMarker,
  isImageMarker,
  isCsvMarker,
  isAudioMarker,
  isVideoMarker,
  getMarkerLabel,
  shortenPath,
} from '../../src/core/markerResolvers';
import type { BaseMarker } from '../../src/core/types';

function makeBase(extra: Record<string, any> = {}): BaseMarker {
  return {
    id: 'test-1',
    fileId: 'file.md',
    codes: ['code1'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra,
  };
}

// ── Type Guards ──────────────────────────────────────────────

describe('isPdfMarker', () => {
  it('returns true for marker with page and isShape', () => {
    expect(isPdfMarker(makeBase({ page: 1, isShape: false, text: 'hello' }))).toBe(true);
  });

  it('returns false for marker without page', () => {
    expect(isPdfMarker(makeBase({ isShape: false }))).toBe(false);
  });

  it('returns false for empty extra fields', () => {
    expect(isPdfMarker(makeBase())).toBe(false);
  });
});

describe('isImageMarker', () => {
  it('returns true for marker with shape and shapeLabel', () => {
    expect(isImageMarker(makeBase({ shape: 'rect', shapeLabel: 'Region 1' }))).toBe(true);
  });

  it('returns false for marker without shapeLabel', () => {
    expect(isImageMarker(makeBase({ shape: 'rect' }))).toBe(false);
  });

  it('returns false for plain marker', () => {
    expect(isImageMarker(makeBase())).toBe(false);
  });
});

describe('isCsvMarker', () => {
  it('returns true for marker with rowIndex and columnId', () => {
    expect(isCsvMarker(makeBase({ rowIndex: 0, columnId: 'col1' }))).toBe(true);
  });

  it('returns false for marker without columnId', () => {
    expect(isCsvMarker(makeBase({ rowIndex: 0 }))).toBe(false);
  });

  it('returns false for unrelated fields', () => {
    expect(isCsvMarker(makeBase({ page: 1 }))).toBe(false);
  });
});

describe('isAudioMarker', () => {
  it('returns true for marker with mediaType "audio"', () => {
    expect(isAudioMarker(makeBase({ mediaType: 'audio', markerLabel: 'seg' }))).toBe(true);
  });

  it('returns false for marker with mediaType "video"', () => {
    expect(isAudioMarker(makeBase({ mediaType: 'video', markerLabel: 'seg' }))).toBe(false);
  });

  it('returns false for marker without mediaType', () => {
    expect(isAudioMarker(makeBase())).toBe(false);
  });
});

describe('isVideoMarker', () => {
  it('returns true for marker with mediaType "video"', () => {
    expect(isVideoMarker(makeBase({ mediaType: 'video', markerLabel: 'seg' }))).toBe(true);
  });

  it('returns false for marker with mediaType "audio"', () => {
    expect(isVideoMarker(makeBase({ mediaType: 'audio', markerLabel: 'seg' }))).toBe(false);
  });

  it('returns false for plain marker', () => {
    expect(isVideoMarker(makeBase())).toBe(false);
  });
});

// ── shortenPath ──────────────────────────────────────────────

describe('shortenPath', () => {
  it('strips directory and extension from full path', () => {
    expect(shortenPath('folder/subfolder/file.md')).toBe('file');
  });

  it('strips .pdf extension', () => {
    expect(shortenPath('docs/report.pdf')).toBe('report');
  });

  it('strips .csv extension', () => {
    expect(shortenPath('data.csv')).toBe('data');
  });

  it('strips .mp3 extension', () => {
    expect(shortenPath('audio/track.mp3')).toBe('track');
  });

  it('strips .mp4 extension', () => {
    expect(shortenPath('video/clip.mp4')).toBe('clip');
  });

  it('strips .png extension', () => {
    expect(shortenPath('img/photo.png')).toBe('photo');
  });

  it('leaves filename without recognized extension unchanged', () => {
    expect(shortenPath('file')).toBe('file');
  });

  it('leaves unknown extensions unchanged', () => {
    expect(shortenPath('file.xyz')).toBe('file.xyz');
  });

  it('handles just filename with extension', () => {
    expect(shortenPath('file.md')).toBe('file');
  });
});

// ── getMarkerLabel ───────────────────────────────────────────

describe('getMarkerLabel', () => {
  it('returns text for PDF marker with text', () => {
    const marker = makeBase({ page: 1, isShape: false, text: 'highlighted text' });
    expect(getMarkerLabel(marker, null)).toBe('highlighted text');
  });

  it('returns shapeLabel for PDF shape marker', () => {
    const marker = makeBase({ page: 1, isShape: true, shapeLabel: 'Shape A', text: '' });
    expect(getMarkerLabel(marker, null)).toBe('Shape A');
  });

  it('returns "Page N" for PDF marker without text', () => {
    const marker = makeBase({ page: 3, isShape: false, text: '' });
    expect(getMarkerLabel(marker, null)).toBe('Page 3');
  });

  it('returns markerText for CSV marker with markerText', () => {
    const marker = makeBase({ rowIndex: 0, columnId: 'c1', markerText: 'cell content', markerLabel: 'R0:c1', isSegment: true });
    expect(getMarkerLabel(marker, null)).toBe('cell content');
  });

  it('returns markerLabel for CSV marker without markerText', () => {
    const marker = makeBase({ rowIndex: 0, columnId: 'c1', markerText: null, markerLabel: 'R0:c1', isSegment: false });
    expect(getMarkerLabel(marker, null)).toBe('R0:c1');
  });

  it('returns markerLabel for audio marker', () => {
    const marker = makeBase({ mediaType: 'audio', markerLabel: '0:05 - 0:10', startTime: 5, endTime: 10, markerText: null });
    expect(getMarkerLabel(marker, null)).toBe('0:05 - 0:10');
  });

  it('returns markerLabel for video marker', () => {
    const marker = makeBase({ mediaType: 'video', markerLabel: '1:00 - 1:30', startTime: 60, endTime: 90, markerText: null });
    expect(getMarkerLabel(marker, null)).toBe('1:00 - 1:30');
  });

  it('returns text for markdown marker with null mdModel', () => {
    const marker = makeBase({ text: 'markdown text', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 13 } } });
    expect(getMarkerLabel(marker, null)).toBe('markdown text');
  });

  it('truncates text longer than maxLength with "..."', () => {
    const longText = 'a'.repeat(100);
    const marker = makeBase({ page: 1, isShape: false, text: longText });
    const label = getMarkerLabel(marker, null, 20);
    expect(label).toBe('a'.repeat(20) + '...');
  });

  it('uses custom maxLength parameter', () => {
    const text = 'abcdefghij';
    const marker = makeBase({ page: 1, isShape: false, text });
    expect(getMarkerLabel(marker, null, 5)).toBe('abcde...');
  });

  it('does not truncate text equal to maxLength', () => {
    const text = 'a'.repeat(60);
    const marker = makeBase({ page: 1, isShape: false, text });
    expect(getMarkerLabel(marker, null, 60)).toBe(text);
  });
});
