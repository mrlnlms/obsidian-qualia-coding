
import type {
  ConsolidatedData, FilterConfig, FrequencyResult,
  DocCodeMatrixResult, SourceType, SourceComparisonResult, SourceComparisonEntry,
} from "./dataTypes";
import { applyFilters } from "./statsHelpers";

export function calculateFrequency(
  data: ConsolidatedData,
  filters: FilterConfig
): FrequencyResult[] {
  const markers = applyFilters(data, filters);

  const map = new Map<
    string,
    { total: number; bySource: Record<SourceType, number>; byFile: Record<string, number> }
  >();

  for (const m of markers) {
    for (const code of m.codes) {
      if (filters.excludeCodes.includes(code)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(code)) continue;

      let entry = map.get(code);
      if (!entry) {
        entry = {
          total: 0,
          bySource: { markdown: 0, "csv-segment": 0, "csv-row": 0, image: 0, pdf: 0, audio: 0, video: 0 },
          byFile: {},
        };
        map.set(code, entry);
      }
      entry.total++;
      entry.bySource[m.source]++;
      entry.byFile[m.file] = (entry.byFile[m.file] ?? 0) + 1;
    }
  }

  const results: FrequencyResult[] = [];
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  for (const [code, entry] of map) {
    if (entry.total < filters.minFrequency) continue;
    results.push({
      code,
      color: codeColors.get(code) ?? "#6200EE",
      total: entry.total,
      bySource: entry.bySource,
      byFile: entry.byFile,
    });
  }

  return results;
}

export function calculateDocumentCodeMatrix(
  data: ConsolidatedData,
  filters: FilterConfig
): DocCodeMatrixResult {
  const markers = applyFilters(data, filters);
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  const codeFreq = new Map<string, number>();
  for (const m of markers) {
    for (const code of m.codes) {
      if (filters.excludeCodes.includes(code)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(code)) continue;
      codeFreq.set(code, (codeFreq.get(code) ?? 0) + 1);
    }
  }

  const codes: string[] = [];
  const colors: string[] = [];
  for (const [code, count] of codeFreq) {
    if (count < filters.minFrequency) continue;
    codes.push(code);
    colors.push(codeColors.get(code) ?? "#6200EE");
  }
  codes.sort((a, b) => a.localeCompare(b));
  const sortedColors = codes.map((c) => codeColors.get(c) ?? "#6200EE");

  const fileSet = new Set<string>();
  for (const m of markers) {
    if (m.codes.some((c) => codes.includes(c))) {
      fileSet.add(m.file);
    }
  }
  const files = Array.from(fileSet).sort();

  const codeIndex = new Map(codes.map((c, i) => [c, i]));
  const fileIndex = new Map(files.map((f, i) => [f, i]));
  const matrix: number[][] = Array.from({ length: files.length }, () => new Array(codes.length).fill(0));

  for (const m of markers) {
    const fi = fileIndex.get(m.file);
    if (fi == null) continue;
    for (const code of m.codes) {
      const ci = codeIndex.get(code);
      if (ci != null) matrix[fi]![ci]!++;
    }
  }

  let maxValue = 0;
  for (const row of matrix) {
    for (const v of row) {
      if (v > maxValue) maxValue = v;
    }
  }

  return { files, codes, colors: sortedColors, matrix, maxValue };
}

export function calculateSourceComparison(
  data: ConsolidatedData,
  filters: FilterConfig,
): SourceComparisonResult {
  const markers = applyFilters(data, filters);
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  const allSources: SourceType[] = ["markdown", "csv-segment", "csv-row", "image", "pdf", "audio", "video"];
  const emptyBySource = (): Record<SourceType, number> =>
    ({ markdown: 0, "csv-segment": 0, "csv-row": 0, image: 0, pdf: 0, audio: 0, video: 0 });

  const map = new Map<string, { total: number; bySource: Record<SourceType, number> }>();
  const sourceTotals = emptyBySource();

  for (const m of markers) {
    sourceTotals[m.source]++;
    for (const code of m.codes) {
      if (filters.excludeCodes.includes(code)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(code)) continue;
      let entry = map.get(code);
      if (!entry) {
        entry = { total: 0, bySource: emptyBySource() };
        map.set(code, entry);
      }
      entry.total++;
      entry.bySource[m.source]++;
    }
  }

  const activeSources = allSources.filter((s) => sourceTotals[s] > 0);
  const entries: SourceComparisonEntry[] = [];
  const codes: string[] = [];
  const colors: string[] = [];

  for (const [code, entry] of map) {
    if (entry.total < filters.minFrequency) continue;
    const pctOfCode = emptyBySource();
    const pctOfSrc = emptyBySource();
    for (const s of allSources) {
      pctOfCode[s] = entry.total > 0 ? Math.round((entry.bySource[s] / entry.total) * 1000) / 10 : 0;
      pctOfSrc[s] = sourceTotals[s] > 0 ? Math.round((entry.bySource[s] / sourceTotals[s]) * 1000) / 10 : 0;
    }
    codes.push(code);
    colors.push(codeColors.get(code) ?? "#6200EE");
    entries.push({
      code,
      color: codeColors.get(code) ?? "#6200EE",
      total: entry.total,
      bySource: entry.bySource,
      bySourcePctOfCode: pctOfCode,
      bySourcePctOfSrc: pctOfSrc,
    });
  }

  entries.sort((a, b) => b.total - a.total);

  return { codes, colors, activeSources, sourceTotals, entries };
}
