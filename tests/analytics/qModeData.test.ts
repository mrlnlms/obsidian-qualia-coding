import { describe, it, expect } from "vitest";
import { buildFileQModeData, preFilterMarkersForQMode } from "../../src/analytics/data/qModeData";
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
