import { describe, it, expect } from "vitest";
import { buildFileQModeData, buildSimilarityRows, preFilterMarkersForQMode } from "../../src/analytics/data/qModeData";
import type { UnifiedMarker } from "../../src/analytics/data/dataTypes";

function marker(fileId: string, source: UnifiedMarker["source"], codes: string[]): UnifiedMarker {
  return { id: `m_${fileId}_${codes.join(".")}`, source, fileId, codes };
}

describe("buildFileQModeData", () => {
  it("returns empty arrays for empty markers", () => {
    const out = buildFileQModeData([]);
    expect(out.fileIds).toEqual([]);
    expect(out.fileSets).toEqual([]);
    expect(out.fileNames).toEqual([]);
    expect(out.fileColors).toEqual([]);
    expect(out.markerCounts).toEqual([]);
  });

  it("aggregates codes per file across multiple markers", () => {
    const markers = [
      marker("notes/A.md", "markdown", ["c1", "c2"]),
      marker("notes/A.md", "markdown", ["c2", "c3"]),
      marker("notes/B.md", "markdown", ["c1"]),
    ];
    const out = buildFileQModeData(markers);
    expect(out.fileIds.length).toBe(2);
    const aIdx = out.fileIds.indexOf("notes/A.md");
    const bIdx = out.fileIds.indexOf("notes/B.md");
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThanOrEqual(0);
    expect(out.fileSets[aIdx]).toEqual(new Set(["c1", "c2", "c3"]));
    expect(out.fileSets[bIdx]).toEqual(new Set(["c1"]));
  });

  it("counts markers per file (not deduped by code)", () => {
    const markers = [
      marker("A.md", "markdown", ["c1"]),
      marker("A.md", "markdown", ["c2"]),
      marker("A.md", "markdown", ["c1", "c2"]),
    ];
    const out = buildFileQModeData(markers);
    expect(out.markerCounts[0]).toBe(3);
  });

  it("uses basename without extension as display name", () => {
    const markers = [
      marker("notes/sub/foo.md", "markdown", ["c1"]),
      marker("bar.csv", "csv-segment", ["c1"]),
      marker("just-a-file", "markdown", ["c1"]),
    ];
    const out = buildFileQModeData(markers);
    expect(out.fileNames).toEqual(["foo", "bar", "just-a-file"]);
  });

  it("assigns unique-ish HSL colors deterministically by index", () => {
    const markers = Array.from({ length: 5 }, (_, i) =>
      marker(`f${i}.md`, "markdown", ["c1"]),
    );
    const out = buildFileQModeData(markers);
    expect(out.fileColors.length).toBe(5);
    expect(out.fileColors[0]).toBe("hsl(0, 60%, 55%)");
    expect(out.fileColors[1]).toBe("hsl(137.5, 60%, 55%)");
  });
});

describe("buildSimilarityRows", () => {
  function dataFromMarkers(markers: UnifiedMarker[]) {
    return buildFileQModeData(markers);
  }

  it("returns empty array when refIdx is out of bounds", () => {
    const data = dataFromMarkers([
      marker("a.md", "markdown", ["c1"]),
      marker("b.md", "markdown", ["c1"]),
    ]);
    expect(buildSimilarityRows(data, -1)).toEqual([]);
    expect(buildSimilarityRows(data, 99)).toEqual([]);
  });

  it("excludes the reference file from rows", () => {
    const data = dataFromMarkers([
      marker("a.md", "markdown", ["c1", "c2"]),
      marker("b.md", "markdown", ["c1", "c3"]),
      marker("c.md", "markdown", ["c4"]),
    ]);
    const rows = buildSimilarityRows(data, 0);
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.fileName === "a")).toBeUndefined();
  });

  it("sorts by similarity descending", () => {
    // a:{c1,c2,c3} | b:{c1,c2,c3} (identical) | c:{c1} (one in common) | d:{c5} (disjoint)
    const data = dataFromMarkers([
      marker("a.md", "markdown", ["c1", "c2", "c3"]),
      marker("b.md", "markdown", ["c1", "c2", "c3"]),
      marker("c.md", "markdown", ["c1"]),
      marker("d.md", "markdown", ["c5"]),
    ]);
    const rows = buildSimilarityRows(data, 0);
    expect(rows[0]!.fileName).toBe("b"); // similarity 1
    expect(rows[1]!.fileName).toBe("c"); // similarity 1/3
    expect(rows[2]!.fileName).toBe("d"); // similarity 0
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.similarity).toBeGreaterThanOrEqual(rows[i]!.similarity);
    }
  });

  it("computes shared/onlyRef/onlyOther counts correctly", () => {
    // ref={c1,c2,c3,c4}, other={c2,c3,c5}
    // shared={c2,c3} (2), onlyRef={c1,c4} (2), onlyOther={c5} (1)
    const data = dataFromMarkers([
      marker("ref.md", "markdown", ["c1", "c2", "c3", "c4"]),
      marker("other.md", "markdown", ["c2", "c3", "c5"]),
    ]);
    const rows = buildSimilarityRows(data, 0);
    expect(rows.length).toBe(1);
    expect(rows[0]!.sharedCount).toBe(2);
    expect(rows[0]!.onlyRefCount).toBe(2);
    expect(rows[0]!.onlyOtherCount).toBe(1);
  });

  it("identical sets give similarity 1", () => {
    const data = dataFromMarkers([
      marker("a.md", "markdown", ["c1", "c2"]),
      marker("b.md", "markdown", ["c1", "c2"]),
    ]);
    const rows = buildSimilarityRows(data, 0);
    expect(rows[0]!.similarity).toBe(1);
  });

  it("disjoint sets give similarity 0", () => {
    const data = dataFromMarkers([
      marker("a.md", "markdown", ["c1"]),
      marker("b.md", "markdown", ["c2"]),
    ]);
    const rows = buildSimilarityRows(data, 0);
    expect(rows[0]!.similarity).toBe(0);
  });
});

describe("preFilterMarkersForQMode", () => {
  it("drops markers from disabled sources", () => {
    const markers = [
      marker("a.md", "markdown", ["c1"]),
      marker("a.csv", "csv-segment", ["c1"]),
    ];
    const out = preFilterMarkersForQMode(markers, new Set(["markdown"]), new Set(["c1"]));
    expect(out.length).toBe(1);
    expect(out[0]!.fileId).toBe("a.md");
  });

  it("strips disabled codes from each marker and drops empty ones", () => {
    const markers = [
      marker("a.md", "markdown", ["c1", "c2", "c3"]),
      marker("b.md", "markdown", ["c2"]),
    ];
    const out = preFilterMarkersForQMode(markers, new Set(["markdown"]), new Set(["c1", "c3"]));
    expect(out.length).toBe(1);
    expect(out[0]!.codes).toEqual(["c1", "c3"]);
  });

  it("does not mutate input markers", () => {
    const m = marker("a.md", "markdown", ["c1", "c2"]);
    const markers = [m];
    preFilterMarkersForQMode(markers, new Set(["markdown"]), new Set(["c1"]));
    expect(m.codes).toEqual(["c1", "c2"]);
  });
});
