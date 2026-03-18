import { describe, it, expect, vi } from "vitest";

// Mock fabric com classes minimas
vi.mock("fabric", () => {
  class FabricObject {
    [key: string]: unknown;
    constructor(opts?: Record<string, unknown>) { Object.assign(this, opts); }
    set(opts: Record<string, unknown>) { Object.assign(this, opts); }
  }
  class MockRect extends FabricObject { }
  class MockTextbox extends FabricObject {
    text: string;
    constructor(text: string, opts?: Record<string, unknown>) {
      super(opts);
      this.text = text;
    }
  }
  class MockGroup extends FabricObject {
    private _objects: FabricObject[];
    left: number;
    top: number;
    scaleX = 1;
    scaleY = 1;
    constructor(objects: FabricObject[], opts?: Record<string, unknown>) {
      super(opts);
      this._objects = objects;
      this.left = (opts?.left as number) ?? 0;
      this.top = (opts?.top as number) ?? 0;
    }
    getObjects() { return this._objects; }
    getBoundingRect() { return { width: 200, height: 150 }; }
  }
  class MockShadow extends FabricObject { }
  class MockFabricImage extends FabricObject {
    static fromURL = vi.fn().mockResolvedValue(new MockFabricImage({ width: 100, height: 100 }));
  }
  class MockCanvas extends FabricObject {
    add = vi.fn();
    requestRenderAll = vi.fn();
    sendObjectToBack = vi.fn();
    setActiveObject = vi.fn();
    on = vi.fn();
    off = vi.fn();
  }
  return {
    Rect: MockRect,
    Textbox: MockTextbox,
    Group: MockGroup,
    Shadow: MockShadow,
    FabricImage: MockFabricImage,
    Canvas: MockCanvas,
    FabricObject: FabricObject,
  };
});

import {
  createStickyNote, getStickyData,
  createSnapshotNode, getSnapshotData,
  createExcerptNode, getExcerptData,
  createCodeCardNode, getCodeCardData,
  createKpiCardNode, getKpiCardData,
  createClusterFrame, getClusterFrameData,
  type StickyNoteData, type SnapshotNodeData,
  type ExcerptNodeData, type CodeCardNodeData,
  type KpiCardNodeData, type ClusterFrameData,
} from "../../src/analytics/board/boardNodes";
import { Canvas, Group } from "fabric";

function makeCanvas() { return new Canvas() as unknown as import("fabric").Canvas; }

describe("boardNodes round-trip", () => {
  describe("sticky", () => {
    const data: StickyNoteData = { id: "s1", x: 10, y: 20, width: 200, height: 150, text: "hello", color: "blue" };

    it("getStickyData returns null for non-sticky", () => {
      const group = new Group([], {}) as unknown as import("fabric").Group;
      expect(getStickyData(group)).toBeNull();
    });

    it("round-trips sticky note data", () => {
      const group = createStickyNote(makeCanvas(), data);
      const result = getStickyData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("s1");
      expect(result!.text).toBe("hello");
      expect(result!.color).toBe("blue");
    });
  });

  describe("snapshot", () => {
    const data: SnapshotNodeData = { id: "sn1", x: 0, y: 0, width: 280, height: 180, title: "Chart", dataUrl: "data:png", viewMode: "frequency", createdAt: 1000 };

    it("getSnapshotData returns null for non-snapshot", () => {
      const group = new Group([], {}) as unknown as import("fabric").Group;
      expect(getSnapshotData(group)).toBeNull();
    });

    it("round-trips snapshot data", async () => {
      const group = await createSnapshotNode(makeCanvas(), data);
      const result = getSnapshotData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("sn1");
      expect(result!.title).toBe("Chart");
      expect(result!.viewMode).toBe("frequency");
      expect(result!.width).toBe(280);
      expect(result!.height).toBe(180);
    });
  });

  describe("excerpt", () => {
    const data: ExcerptNodeData = { id: "e1", x: 0, y: 0, width: 260, text: "some text", file: "path/note.md", source: "markdown", location: "L1-5", codes: ["A"], codeColors: ["#f00"], createdAt: 1000 };

    it("getExcerptData returns null for non-excerpt", () => {
      const group = new Group([], {}) as unknown as import("fabric").Group;
      expect(getExcerptData(group)).toBeNull();
    });

    it("round-trips excerpt data", () => {
      const group = createExcerptNode(makeCanvas(), data);
      const result = getExcerptData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("e1");
      expect(result!.text).toBe("some text");
      expect(result!.file).toBe("path/note.md");
      expect(result!.source).toBe("markdown");
      expect(result!.codes).toEqual(["A"]);
      expect(result!.codeColors).toEqual(["#f00"]);
    });
  });

  describe("codeCard", () => {
    const data: CodeCardNodeData = { id: "cc1", x: 0, y: 0, codeName: "Emotion", color: "#f00", description: "desc", markerCount: 5, sources: ["markdown"], createdAt: 1000 };

    it("getCodeCardData returns null for non-codeCard", () => {
      const group = new Group([], {}) as unknown as import("fabric").Group;
      expect(getCodeCardData(group)).toBeNull();
    });

    it("round-trips codeCard data", () => {
      const group = createCodeCardNode(makeCanvas(), data);
      const result = getCodeCardData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("cc1");
      expect(result!.codeName).toBe("Emotion");
      expect(result!.markerCount).toBe(5);
      expect(result!.sources).toEqual(["markdown"]);
    });
  });

  describe("kpiCard", () => {
    const data: KpiCardNodeData = { id: "k1", x: 0, y: 0, value: "42", label: "Total", accent: "#00f", createdAt: 1000 };

    it("getKpiCardData returns null for non-kpiCard", () => {
      const group = new Group([], {}) as unknown as import("fabric").Group;
      expect(getKpiCardData(group)).toBeNull();
    });

    it("round-trips kpiCard data", () => {
      const group = createKpiCardNode(makeCanvas(), data);
      const result = getKpiCardData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("k1");
      expect(result!.value).toBe("42");
      expect(result!.label).toBe("Total");
      expect(result!.accent).toBe("#00f");
    });
  });

  describe("clusterFrame", () => {
    const data: ClusterFrameData = { id: "cl1", x: 0, y: 0, width: 300, height: 200, label: "Group A", color: "rgba(100,100,255,0.1)", codeNames: ["A", "B"] };

    it("getClusterFrameData returns null for non-cluster", () => {
      const group = new Group([], {}) as unknown as import("fabric").Group;
      expect(getClusterFrameData(group)).toBeNull();
    });

    it("round-trips clusterFrame data", () => {
      const group = createClusterFrame(makeCanvas(), data);
      const result = getClusterFrameData(group as unknown as import("fabric").Group);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("cl1");
      expect(result!.label).toBe("Group A");
      expect(result!.codeNames).toEqual(["A", "B"]);
      expect(result!.color).toBe("rgba(100,100,255,0.1)");
    });
  });
});
