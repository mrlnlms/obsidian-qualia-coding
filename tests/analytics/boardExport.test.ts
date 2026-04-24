import { describe, it, expect, vi } from "vitest";
import { buildExportFilename, getBoardBoundingBox, EXPORT_PADDING, exportBoardSvg, exportBoardPng, triggerDownload } from "../../src/analytics/board/boardExport";

describe("buildExportFilename", () => {
  it("formata data como YYYY-MM-DD para SVG", () => {
    const d = new Date("2026-04-24T15:30:00Z");
    expect(buildExportFilename("svg", d)).toBe("qualia-board-2026-04-24.svg");
  });

  it("formata data como YYYY-MM-DD para PNG", () => {
    const d = new Date("2026-04-24T15:30:00Z");
    expect(buildExportFilename("png", d)).toBe("qualia-board-2026-04-24.png");
  });

  it("pad mês/dia com zero", () => {
    const d = new Date("2026-01-05T00:00:00Z");
    expect(buildExportFilename("svg", d)).toBe("qualia-board-2026-01-05.svg");
  });
});

function makeCanvas(objects: Array<{ left: number; top: number; width: number; height: number }>) {
  return {
    getObjects: () => objects.map(o => ({
      getBoundingRect: () => o,
    })),
  } as unknown as import("fabric").Canvas;
}

describe("getBoardBoundingBox", () => {
  it("retorna null para canvas vazio", () => {
    expect(getBoardBoundingBox(makeCanvas([]))).toBeNull();
  });

  it("retorna bbox com padding para 1 objeto", () => {
    const canvas = makeCanvas([{ left: 100, top: 50, width: 200, height: 80 }]);
    const bb = getBoardBoundingBox(canvas);
    expect(bb).toEqual({
      left: 100 - EXPORT_PADDING,
      top: 50 - EXPORT_PADDING,
      width: 200 + EXPORT_PADDING * 2,
      height: 80 + EXPORT_PADDING * 2,
    });
  });

  it("une bboxes de múltiplos objetos", () => {
    const canvas = makeCanvas([
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 200, top: 150, width: 50, height: 50 },
    ]);
    const bb = getBoardBoundingBox(canvas);
    expect(bb).toEqual({
      left: 0 - EXPORT_PADDING,
      top: 0 - EXPORT_PADDING,
      width: 250 + EXPORT_PADDING * 2,
      height: 200 + EXPORT_PADDING * 2,
    });
  });

  it("aceita coordenadas negativas", () => {
    const canvas = makeCanvas([{ left: -50, top: -30, width: 100, height: 60 }]);
    const bb = getBoardBoundingBox(canvas);
    expect(bb!.left).toBe(-50 - EXPORT_PADDING);
    expect(bb!.top).toBe(-30 - EXPORT_PADDING);
  });
});

describe("exportBoardSvg", () => {
  it("chama canvas.toSVG com viewBox do bbox", () => {
    const toSVG = vi.fn().mockReturnValue("<svg>...</svg>");
    const canvas = { toSVG } as unknown as import("fabric").Canvas;
    const bbox = { left: 10, top: 20, width: 300, height: 200 };

    const result = exportBoardSvg(canvas, bbox);

    expect(toSVG).toHaveBeenCalledWith({
      viewBox: { x: 10, y: 20, width: 300, height: 200 },
      width: 300,
      height: 200,
    });
    expect(result).toBe("<svg>...</svg>");
  });
});

describe("exportBoardPng", () => {
  function makePngCanvas(vt: [number, number, number, number, number, number]) {
    const state = {
      viewportTransform: vt,
      vtAtCapture: null as typeof vt | null,
      toDataURL: vi.fn(),
      setViewportTransform: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    state.toDataURL.mockImplementation(() => {
      state.vtAtCapture = [...state.viewportTransform] as typeof vt;
      return "data:image/png;base64,AAA";
    });
    state.setViewportTransform.mockImplementation((newVt: typeof vt) => {
      state.viewportTransform = newVt;
    });
    return state;
  }

  it("chama canvas.toDataURL com bbox e multiplier default 2", () => {
    const canvas = makePngCanvas([1, 0, 0, 1, 0, 0]);
    const bbox = { left: 10, top: 20, width: 300, height: 200 };

    const result = exportBoardPng(canvas as unknown as import("fabric").Canvas, bbox);

    expect(canvas.toDataURL).toHaveBeenCalledWith({
      format: "png",
      multiplier: 2,
      left: 10,
      top: 20,
      width: 300,
      height: 200,
    });
    expect(result).toBe("data:image/png;base64,AAA");
  });

  it("aceita multiplier custom", () => {
    const canvas = makePngCanvas([1, 0, 0, 1, 0, 0]);
    const bbox = { left: 0, top: 0, width: 100, height: 100 };

    exportBoardPng(canvas as unknown as import("fabric").Canvas, bbox, 3);

    expect(canvas.toDataURL).toHaveBeenCalledWith(expect.objectContaining({ multiplier: 3 }));
  });

  it("reseta viewportTransform para identidade durante toDataURL e restaura depois", () => {
    const originalVt: [number, number, number, number, number, number] = [2, 0, 0, 2, 100, 50];
    const canvas = makePngCanvas(originalVt);
    const bbox = { left: 0, top: 0, width: 100, height: 100 };

    exportBoardPng(canvas as unknown as import("fabric").Canvas, bbox);

    expect(canvas.vtAtCapture).toEqual([1, 0, 0, 1, 0, 0]);
    expect(canvas.viewportTransform).toEqual(originalVt);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it("restaura viewportTransform mesmo se toDataURL lançar", () => {
    const originalVt: [number, number, number, number, number, number] = [1.5, 0, 0, 1.5, 0, 0];
    const canvas = makePngCanvas(originalVt);
    canvas.toDataURL.mockImplementation(() => {
      throw new Error("render failed");
    });

    expect(() =>
      exportBoardPng(canvas as unknown as import("fabric").Canvas, { left: 0, top: 0, width: 10, height: 10 }),
    ).toThrow("render failed");
    expect(canvas.viewportTransform).toEqual(originalVt);
  });
});

describe("triggerDownload", () => {
  it("cria <a> com download e href e clica", () => {
    const click = vi.fn();
    const anchor = { download: "", href: "", click } as unknown as HTMLAnchorElement;
    const spy = vi.spyOn(document, "createElement").mockReturnValue(anchor);

    triggerDownload("foo.svg", "data:...");

    expect(anchor.download).toBe("foo.svg");
    expect(anchor.href).toBe("data:...");
    expect(click).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
