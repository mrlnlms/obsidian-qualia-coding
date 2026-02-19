import type {
  ConsolidatedData,
  FilterConfig,
  FrequencyResult,
  CooccurrenceResult,
  DocCodeMatrixResult,
  EvolutionResult,
  SourceType,
  UnifiedMarker,
} from "./dataTypes";

function applyFilters(data: ConsolidatedData, filters: FilterConfig): UnifiedMarker[] {
  return data.markers.filter((m) => {
    if (!filters.sources.includes(m.source)) return false;
    if (filters.codes.length > 0 && !m.codes.some((c) => filters.codes.includes(c))) return false;
    if (filters.excludeCodes.length > 0 && m.codes.every((c) => filters.excludeCodes.includes(c))) return false;
    return true;
  });
}

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
          bySource: { markdown: 0, "csv-segment": 0, "csv-row": 0, image: 0 },
          byFile: {},
        };
        map.set(code, entry);
      }
      entry.total++;
      entry.bySource[m.source]++;
      entry.byFile[m.file] = (entry.byFile[m.file] ?? 0) + 1;
    }
  }

  // Build results
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

export function calculateCooccurrence(
  data: ConsolidatedData,
  filters: FilterConfig
): CooccurrenceResult {
  const markers = applyFilters(data, filters);

  // Determine which codes to include (respecting minFrequency)
  const freq = new Map<string, number>();
  for (const m of markers) {
    for (const code of m.codes) {
      if (filters.excludeCodes.includes(code)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(code)) continue;
      freq.set(code, (freq.get(code) ?? 0) + 1);
    }
  }

  const codes: string[] = [];
  const colors: string[] = [];
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  for (const [code, count] of freq) {
    if (count < filters.minFrequency) continue;
    codes.push(code);
    colors.push(codeColors.get(code) ?? "#6200EE");
  }
  codes.sort((a, b) => a.localeCompare(b));
  // Re-sort colors to match
  const sortedColors = codes.map((c) => codeColors.get(c) ?? "#6200EE");

  const n = codes.length;
  const codeIndex = new Map(codes.map((c, i) => [c, i]));
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const m of markers) {
    const relevantCodes = m.codes.filter((c) => codeIndex.has(c));
    // Diagonal: frequency
    for (const c of relevantCodes) {
      const i = codeIndex.get(c)!;
      matrix[i][i]++;
    }
    // Off-diagonal: co-occurrence pairs
    for (let a = 0; a < relevantCodes.length; a++) {
      for (let b = a + 1; b < relevantCodes.length; b++) {
        const i = codeIndex.get(relevantCodes[a])!;
        const j = codeIndex.get(relevantCodes[b])!;
        matrix[i][j]++;
        matrix[j][i]++;
      }
    }
  }

  let maxValue = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (matrix[i][j] > maxValue) maxValue = matrix[i][j];
    }
  }

  return { codes, colors: sortedColors, matrix, maxValue };
}

export function calculateDocumentCodeMatrix(
  data: ConsolidatedData,
  filters: FilterConfig
): DocCodeMatrixResult {
  const markers = applyFilters(data, filters);
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  // Collect codes that pass frequency filter
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

  // Collect all files
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
      if (ci != null) matrix[fi][ci]++;
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

export function calculateEvolution(
  data: ConsolidatedData,
  filters: FilterConfig
): EvolutionResult {
  const markers = applyFilters(data, filters);
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  // Collect valid codes
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
  const codeSet = new Set(codes);

  // Calculate max line per file for normalization
  const maxLineByFile = new Map<string, number>();
  for (const m of markers) {
    if (m.meta?.fromLine == null) continue;
    const cur = maxLineByFile.get(m.file) ?? 0;
    const toLine = m.meta.toLine ?? m.meta.fromLine;
    if (toLine > cur) maxLineByFile.set(m.file, toLine);
    if (m.meta.fromLine > cur) maxLineByFile.set(m.file, Math.max(m.meta.fromLine, toLine));
  }

  const points: EvolutionResult["points"] = [];
  const fileSet = new Set<string>();

  for (const m of markers) {
    if (m.meta?.fromLine == null) continue;
    const maxLine = maxLineByFile.get(m.file) ?? 1;
    const position = maxLine > 0 ? m.meta.fromLine / maxLine : 0;

    for (const code of m.codes) {
      if (!codeSet.has(code)) continue;
      fileSet.add(m.file);
      points.push({
        code,
        color: codeColors.get(code) ?? "#6200EE",
        file: m.file,
        position: Math.min(1, Math.max(0, position)),
        fromLine: m.meta.fromLine,
        toLine: m.meta.toLine ?? m.meta.fromLine,
        markerId: m.id,
      });
    }
  }

  points.sort((a, b) => a.position - b.position);

  return { codes, colors: sortedColors, points, files: Array.from(fileSet).sort() };
}
