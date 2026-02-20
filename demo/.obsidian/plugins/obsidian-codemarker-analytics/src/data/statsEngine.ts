import type {
  ConsolidatedData,
  FilterConfig,
  FrequencyResult,
  CooccurrenceResult,
  DocCodeMatrixResult,
  EvolutionResult,
  TemporalResult,
  TextStatsResult,
  LagResult,
  SourceType,
  UnifiedMarker,
} from "./dataTypes";
import type { ExtractedSegment } from "./textExtractor";

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

/**
 * Calculate temporal coding evolution — cumulative count of each code over real time.
 * Only considers markers with `meta.createdAt` timestamps.
 */
export function calculateTemporal(data: ConsolidatedData, filters: FilterConfig): TemporalResult {
  const filtered = applyFilters(data, filters);

  // Collect timestamps per code
  const codeTimestamps = new Map<string, number[]>();
  for (const m of filtered) {
    const ts = m.meta?.createdAt;
    if (ts == null) continue;
    for (const code of m.codes) {
      if (filters.excludeCodes.includes(code)) continue;
      let arr = codeTimestamps.get(code);
      if (!arr) { arr = []; codeTimestamps.set(code, arr); }
      arr.push(ts);
    }
  }

  // Filter by minFrequency
  const qualifiedCodes: string[] = [];
  for (const [code, timestamps] of codeTimestamps) {
    if (timestamps.length >= filters.minFrequency) {
      qualifiedCodes.push(code);
    }
  }
  qualifiedCodes.sort();

  // Build color map
  const codeColorMap = new Map<string, string>();
  for (const c of data.codes) codeColorMap.set(c.name, c.color);

  const codes: string[] = [];
  const colors: string[] = [];
  const series: TemporalResult["series"] = [];

  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const code of qualifiedCodes) {
    const timestamps = codeTimestamps.get(code)!;
    timestamps.sort((a, b) => a - b);

    if (timestamps[0] < globalMin) globalMin = timestamps[0];
    if (timestamps[timestamps.length - 1] > globalMax) globalMax = timestamps[timestamps.length - 1];

    const color = codeColorMap.get(code) ?? "#6200EE";
    codes.push(code);
    colors.push(color);

    // Cumulative points
    const points: Array<{ date: number; count: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      points.push({ date: timestamps[i], count: i + 1 });
    }
    series.push({ code, color, points });
  }

  return {
    codes,
    colors,
    series,
    dateRange: [
      globalMin === Infinity ? 0 : globalMin,
      globalMax === -Infinity ? 0 : globalMax,
    ],
  };
}

// ── Text Statistics ──

const TOKEN_RE = /[\s,.;:!?()[\]{}"'''""…—–\-\/\\|@#$%^&*+=<>~`\d]+/;

export function calculateTextStats(
  segments: ExtractedSegment[],
  codeColors: Map<string, string>,
): TextStatsResult {
  // Group segments by code
  const byCode = new Map<string, ExtractedSegment[]>();
  for (const seg of segments) {
    if (!seg.text || seg.source === "image") continue;
    for (const code of seg.codes) {
      let list = byCode.get(code);
      if (!list) { list = []; byCode.set(code, list); }
      list.push(seg);
    }
  }

  const codes: TextStatsResult["codes"] = [];
  const globalWords: string[] = [];
  const globalUniqueSet = new Set<string>();
  let globalSegCount = 0;
  let globalCharCount = 0;

  for (const [code, segs] of byCode) {
    const allWords: string[] = [];
    const uniqueSet = new Set<string>();
    let totalChars = 0;

    for (const seg of segs) {
      const tokens = seg.text.toLowerCase().split(TOKEN_RE).filter((t) => t.length > 0);
      for (const t of tokens) {
        allWords.push(t);
        uniqueSet.add(t);
        globalWords.push(t);
        globalUniqueSet.add(t);
      }
      totalChars += seg.text.length;
    }

    const segCount = segs.length;
    const totalWords = allWords.length;
    const uniqueWords = uniqueSet.size;

    codes.push({
      code,
      color: codeColors.get(code) ?? "#6200EE",
      segmentCount: segCount,
      totalWords,
      uniqueWords,
      avgWordsPerSegment: segCount > 0 ? Math.round((totalWords / segCount) * 10) / 10 : 0,
      ttr: totalWords > 0 ? Math.round((uniqueWords / totalWords) * 1000) / 1000 : 0,
      avgCharsPerSegment: segCount > 0 ? Math.round(totalChars / segCount) : 0,
    });

    globalSegCount += segCount;
    globalCharCount += totalChars;
  }

  codes.sort((a, b) => b.totalWords - a.totalWords);

  return {
    codes,
    global: {
      totalSegments: globalSegCount,
      totalWords: globalWords.length,
      uniqueWords: globalUniqueSet.size,
      ttr: globalWords.length > 0 ? Math.round((globalUniqueSet.size / globalWords.length) * 1000) / 1000 : 0,
    },
  };
}

// ── Lag Sequential Analysis ──

function getMarkerPosition(m: UnifiedMarker): number {
  if (m.meta?.audioFrom != null) return m.meta.audioFrom;
  if (m.meta?.videoFrom != null) return m.meta.videoFrom;
  if (m.meta?.fromLine != null) return m.meta.fromLine;
  if (m.meta?.row != null) return m.meta.row;
  if (m.meta?.page != null) return m.meta.page;
  return 0;
}

export function calculateLagSequential(
  data: ConsolidatedData,
  filters: FilterConfig,
  lag: number,
): LagResult {
  const markers = applyFilters(data, filters);
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  // Collect valid codes (respect minFrequency)
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

  const n = codes.length;
  const codeIndex = new Map(codes.map((c, i) => [c, i]));
  const transitions: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  // Group markers by file and sort by position
  const byFile = new Map<string, UnifiedMarker[]>();
  for (const m of markers) {
    let list = byFile.get(m.file);
    if (!list) { list = []; byFile.set(m.file, list); }
    list.push(m);
  }

  for (const [, fileMarkers] of byFile) {
    fileMarkers.sort((a, b) => getMarkerPosition(a) - getMarkerPosition(b));

    for (let i = 0; i + lag < fileMarkers.length; i++) {
      const mA = fileMarkers[i];
      const mB = fileMarkers[i + lag];
      for (const cA of mA.codes) {
        const iA = codeIndex.get(cA);
        if (iA == null) continue;
        for (const cB of mB.codes) {
          const iB = codeIndex.get(cB);
          if (iB == null) continue;
          transitions[iA][iB]++;
        }
      }
    }
  }

  // Total transitions
  let totalTransitions = 0;
  const rowSums = new Array(n).fill(0);
  const colSums = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      totalTransitions += transitions[i][j];
      rowSums[i] += transitions[i][j];
      colSums[j] += transitions[i][j];
    }
  }

  // Expected frequencies and z-scores
  const expected: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const zScores: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  if (totalTransitions > 0) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const exp = (rowSums[i] * colSums[j]) / totalTransitions;
        expected[i][j] = Math.round(exp * 100) / 100;

        if (exp > 0) {
          const rowProp = rowSums[i] / totalTransitions;
          const colProp = colSums[j] / totalTransitions;
          const denom = Math.sqrt(exp * (1 - rowProp) * (1 - colProp));
          zScores[i][j] = denom > 0
            ? Math.round(((transitions[i][j] - exp) / denom) * 100) / 100
            : 0;
        }
      }
    }
  }

  return { codes, colors: sortedColors, lag, transitions, expected, zScores, totalTransitions };
}
