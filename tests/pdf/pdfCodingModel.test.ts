import { describe, it, expect, vi } from 'vitest';
import { PdfCodingModel } from '../../src/pdf/pdfCodingModel';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';
import type { PdfMarkerGeometry } from '../../src/pdf/pdfMarkerResize';

function makePdfModel(): PdfCodingModel {
  const dm = {
    section: vi.fn().mockReturnValue({}),
    setSection: vi.fn(),
  } as any;
  const registry = {
    getAll: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    getByName: vi.fn(),
  } as any;
  return new PdfCodingModel({ dataManager: dm, getActiveCoderId: () => "human:default" } as any, registry);
}

describe('PdfCodingModel listeners', () => {
  it('does not call duplicate onChange listener twice', () => {
    const model = makePdfModel();
    const fn = vi.fn();
    model.onChange(fn);
    model.onChange(fn);
    model.notify();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('offChange removes listener', () => {
    const model = makePdfModel();
    const fn = vi.fn();
    model.onChange(fn);
    model.offChange(fn);
    model.notify();
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not call duplicate onHoverChange listener twice', () => {
    const model = makePdfModel();
    const fn = vi.fn();
    model.onHoverChange(fn);
    model.onHoverChange(fn);
    model.setHoverState('id1', 'code1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('offHoverChange removes listener', () => {
    const model = makePdfModel();
    const fn = vi.fn();
    model.onHoverChange(fn);
    model.offHoverChange(fn);
    model.setHoverState('id1', 'code1');
    expect(fn).not.toHaveBeenCalled();
  });
});

function makeGeometryModel(editable = true): {
  model: PdfCodingModel;
  marker: PdfMarker;
  setSection: ReturnType<typeof vi.fn>;
} {
  const setSection = vi.fn();
  const dm = {
    section: vi.fn().mockReturnValue({ settings: {} }),
    setSection,
  } as any;
  const registry = {
    getAll: vi.fn().mockReturnValue([]),
  } as any;
  const plugin = {
    dataManager: dm,
    getActiveCoderId: () => 'human:default',
    canEditMarker: vi.fn().mockReturnValue(editable),
  } as any;
  const model = new PdfCodingModel(plugin, registry);
  const marker: PdfMarker = {
    markerType: 'pdf',
    id: 'marker-1',
    fileId: 'document.pdf',
    page: 1,
    beginIndex: 0,
    beginOffset: 0,
    endIndex: 0,
    endOffset: 5,
    text: 'alpha',
    codes: [],
    codedBy: 'human:default',
    createdAt: 1,
    updatedAt: 1,
  };
  model.insertMarkerRaw(marker);
  setSection.mockClear();
  return { model, marker, setSection };
}

const multipageGeometry: PdfMarkerGeometry = {
  page: 1,
  beginIndex: 0,
  beginOffset: 2,
  endIndex: 0,
  endOffset: 10,
  text: 'pha beta\fmiddle',
  segments: [
    { page: 1, beginIndex: 0, beginOffset: 2, endIndex: 0, endOffset: 10, text: 'pha beta' },
    { page: 2, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 6, text: 'middle' },
  ],
};

describe('PdfCodingModel logical marker geometry', () => {
  it('previews and restores geometry without saving, notifying, or changing updatedAt', () => {
    const { model, marker, setSection } = makeGeometryModel();
    const listener = vi.fn();
    model.onChange(listener);

    expect(model.previewMarkerGeometry(marker.id, multipageGeometry)).toBe(true);
    expect(model.findMarkerById(marker.id)).toMatchObject(multipageGeometry);
    expect(marker.updatedAt).toBe(1);
    expect(setSection).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();

    const scalar: PdfMarkerGeometry = {
      page: 2,
      beginIndex: 0,
      beginOffset: 0,
      endIndex: 0,
      endOffset: 6,
      text: 'middle',
    };
    expect(model.restoreMarkerGeometry(marker.id, scalar)).toBe(true);
    expect(marker).toMatchObject(scalar);
    expect(marker.segments).toBeUndefined();
    expect(marker.updatedAt).toBe(1);
    expect(setSection).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('commits geometry with exactly one save and notification', () => {
    const { model, marker, setSection } = makeGeometryModel();
    const listener = vi.fn();
    model.onChange(listener);
    vi.spyOn(Date, 'now').mockReturnValue(42);

    expect(model.commitMarkerGeometry(marker.id, multipageGeometry)).toBe(true);
    expect(marker).toMatchObject(multipageGeometry);
    expect(marker.updatedAt).toBe(42);
    expect(setSection).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects previews and commits for non-editable markers but allows safe restore', () => {
    const { model, marker, setSection } = makeGeometryModel(false);
    const original = { ...marker };

    expect(model.previewMarkerGeometry(marker.id, multipageGeometry)).toBe(false);
    expect(model.commitMarkerGeometry(marker.id, multipageGeometry)).toBe(false);
    expect(marker).toEqual(original);
    expect(model.canResizeMarker(marker)).toBe(false);

    expect(model.restoreMarkerGeometry(marker.id, multipageGeometry)).toBe(true);
    expect(marker).toMatchObject(multipageGeometry);
    expect(setSection).not.toHaveBeenCalled();
  });

  it('allows an editable multipage marker to expose the normal resize interaction', () => {
    const { model, marker } = makeGeometryModel();
    model.restoreMarkerGeometry(marker.id, multipageGeometry);
    expect(model.canResizeMarker(marker)).toBe(true);
  });
});
