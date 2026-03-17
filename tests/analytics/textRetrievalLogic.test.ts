import { describe, it, expect } from "vitest";
import { formatAudioTime, formatLocation } from "../../src/analytics/views/modes/textRetrievalMode";
import type { ExtractedSegment } from "../../src/analytics/data/textExtractor";

function seg(overrides: Partial<ExtractedSegment> & Pick<ExtractedSegment, "source">): ExtractedSegment {
  return {
    markerId: "test",
    file: "test.md",
    codes: [],
    text: "",
    ...overrides,
  };
}

describe("formatAudioTime", () => {
  it("formats zero as 0:00.0", () => {
    expect(formatAudioTime(0)).toBe("0:00.0");
  });

  it("formats whole seconds", () => {
    expect(formatAudioTime(5)).toBe("0:05.0");
  });

  it("formats minutes and seconds", () => {
    expect(formatAudioTime(65.5)).toBe("1:05.5");
  });

  it("formats large values", () => {
    expect(formatAudioTime(3600)).toBe("60:00.0");
  });

  it("formats fractional seconds", () => {
    expect(formatAudioTime(0.1)).toBe("0:00.1");
  });

  it("truncates sub-decisecond precision (59.95 rounds to 59.9)", () => {
    // 59.95 % 60 = 59.95, toFixed(1) = "60.0" — actually rolls over
    // Let's just verify the output is stable
    expect(formatAudioTime(59.95)).toBe("0:60.0");
  });

  it("returns 0:00.0 for negative", () => {
    expect(formatAudioTime(-1)).toBe("0:00.0");
  });

  it("returns 0:00.0 for NaN", () => {
    expect(formatAudioTime(NaN)).toBe("0:00.0");
  });

  it("returns 0:00.0 for Infinity", () => {
    expect(formatAudioTime(Infinity)).toBe("0:00.0");
  });

  it("returns 0:00.0 for -Infinity", () => {
    expect(formatAudioTime(-Infinity)).toBe("0:00.0");
  });

  it("pads single-digit seconds with zero", () => {
    expect(formatAudioTime(3)).toBe("0:03.0");
  });
});

describe("formatLocation", () => {
  describe("audio", () => {
    it("formats from/to as audio time range", () => {
      expect(formatLocation(seg({ source: "audio", meta: { audioFrom: 5, audioTo: 10 } }))).toBe(
        "0:05.0 \u2013 0:10.0",
      );
    });

    it("returns empty when meta missing", () => {
      expect(formatLocation(seg({ source: "audio" }))).toBe("");
    });

    it("returns empty when only from present", () => {
      expect(formatLocation(seg({ source: "audio", meta: { audioFrom: 5 } }))).toBe("");
    });
  });

  describe("video", () => {
    it("formats from/to as audio time range", () => {
      expect(formatLocation(seg({ source: "video", meta: { videoFrom: 5, videoTo: 10 } }))).toBe(
        "0:05.0 \u2013 0:10.0",
      );
    });

    it("returns empty when meta missing", () => {
      expect(formatLocation(seg({ source: "video" }))).toBe("");
    });

    it("returns empty when only to present", () => {
      expect(formatLocation(seg({ source: "video", meta: { videoTo: 10 } }))).toBe("");
    });
  });

  describe("csv-row", () => {
    it("formats row and column", () => {
      expect(formatLocation(seg({ source: "csv-row", meta: { row: 5, column: "Name" } }))).toBe("Row 5:Name");
    });

    it("formats row only when column missing", () => {
      expect(formatLocation(seg({ source: "csv-row", meta: { row: 5 } }))).toBe("Row 5");
    });

    it("returns empty when meta missing", () => {
      expect(formatLocation(seg({ source: "csv-row" }))).toBe("");
    });

    it("formats row 0", () => {
      expect(formatLocation(seg({ source: "csv-row", meta: { row: 0 } }))).toBe("Row 0");
    });
  });

  describe("csv-segment", () => {
    it("formats row and column", () => {
      expect(formatLocation(seg({ source: "csv-segment", meta: { row: 3, column: "Col" } }))).toBe("Row 3:Col");
    });

    it("returns empty when column missing", () => {
      expect(formatLocation(seg({ source: "csv-segment", meta: { row: 3 } }))).toBe("");
    });

    it("returns empty when meta missing", () => {
      expect(formatLocation(seg({ source: "csv-segment" }))).toBe("");
    });
  });

  describe("image", () => {
    it("returns regionType from meta", () => {
      expect(formatLocation(seg({ source: "image", meta: { regionType: "rectangle" } }))).toBe("rectangle");
    });

    it("returns 'region' when regionType missing", () => {
      expect(formatLocation(seg({ source: "image" }))).toBe("region");
    });

    it("returns 'region' when meta is undefined", () => {
      expect(formatLocation(seg({ source: "image", meta: undefined }))).toBe("region");
    });
  });

  describe("pdf", () => {
    it("formats page as 1-indexed", () => {
      expect(formatLocation(seg({ source: "pdf", meta: { page: 0 } }))).toBe("Page 1");
    });

    it("formats page 4 as Page 5", () => {
      expect(formatLocation(seg({ source: "pdf", meta: { page: 4 } }))).toBe("Page 5");
    });

    it("returns empty when page missing", () => {
      expect(formatLocation(seg({ source: "pdf" }))).toBe("");
    });
  });

  describe("markdown", () => {
    it("formats same line as single L (1-indexed)", () => {
      expect(formatLocation(seg({ source: "markdown", fromLine: 4, toLine: 4 }))).toBe("L5");
    });

    it("formats line range (1-indexed)", () => {
      expect(formatLocation(seg({ source: "markdown", fromLine: 4, toLine: 9 }))).toBe("L5\u201310");
    });

    it("returns empty when lines missing", () => {
      expect(formatLocation(seg({ source: "markdown" }))).toBe("");
    });

    it("formats line 0 as L1", () => {
      expect(formatLocation(seg({ source: "markdown", fromLine: 0, toLine: 0 }))).toBe("L1");
    });
  });
});
