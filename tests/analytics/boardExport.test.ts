import { describe, it, expect } from "vitest";
import { buildExportFilename, getBoardBoundingBox, EXPORT_PADDING } from "../../src/analytics/board/boardExport";

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
