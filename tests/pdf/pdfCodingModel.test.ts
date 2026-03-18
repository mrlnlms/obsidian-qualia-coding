import { describe, it, expect, vi } from 'vitest';
import { PdfCodingModel } from '../../src/pdf/pdfCodingModel';

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
  return new PdfCodingModel(dm, registry);
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
