
import type {
  ConsolidatedData, FilterConfig, CooccurrenceResult, OverlapResult, SourceType, UnifiedMarker,
} from "./dataTypes";
import { applyFilters } from "./statsHelpers";

export function calculateCooccurrence(
  data: ConsolidatedData,
  filters: FilterConfig
): CooccurrenceResult {
  const markers = applyFilters(data, filters);

  const freq = new Map<string, number>();
  for (const m of markers) {
    for (const code of m.codes) {
      if (filters.excludeCodes.includes(code)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(code)) continue;
      freq.set(code, (freq.get(code) ?? 0) + 1);
    }
  }

  const codes: string[] = [];
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  for (const [code, count] of freq) {
    if (count < filters.minFrequency) continue;
    codes.push(code);
  }
  codes.sort((a, b) => a.localeCompare(b));
  const sortedColors = codes.map((c) => codeColors.get(c) ?? "#6200EE");

  const n = codes.length;
  const codeIndex = new Map(codes.map((c, i) => [c, i]));
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const m of markers) {
    const relevantCodes = m.codes.filter((c) => codeIndex.has(c));
    for (const c of relevantCodes) {
      const i = codeIndex.get(c)!;
      matrix[i]![i]!++;
    }
    for (let a = 0; a < relevantCodes.length; a++) {
      for (let b = a + 1; b < relevantCodes.length; b++) {
        const i = codeIndex.get(relevantCodes[a]!)!;
        const j = codeIndex.get(relevantCodes[b]!)!;
        matrix[i]![j]!++;
        matrix[j]![i]!++;
      }
    }
  }

  let maxValue = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (matrix[i]![j]! > maxValue) maxValue = matrix[i]![j]!;
    }
  }

  return { codes, colors: sortedColors, matrix, maxValue };
}

// ── Overlap helpers ──

function markerHasPosition(m: UnifiedMarker): boolean {
  if (m.source === "image") return false;
  if (m.meta?.fromLine != null) return true;
  if (m.meta?.page != null) return true;
  if (m.meta?.row != null) return true;
  if (m.meta?.audioFrom != null) return true;
  if (m.meta?.videoFrom != null) return true;
  return false;
}

function markerToRange(m: UnifiedMarker): { start: number; end: number } | null {
  if (m.source === "markdown" || m.source === "csv-segment") {
    const fromLine = m.meta?.fromLine;
    const toLine = m.meta?.toLine;
    if (fromLine == null) return null;
    const fromCh = m.meta?.fromCh ?? 0;
    const toCh = m.meta?.toCh ?? 9999;
    return { start: fromLine * 10000 + fromCh, end: (toLine ?? fromLine) * 10000 + toCh };
  }
  if (m.source === "pdf") {
    const page = m.meta?.page;
    if (page == null) return null;
    return { start: page, end: page };
  }
  if (m.source === "csv-row") {
    const row = m.meta?.row;
    if (row == null) return null;
    return { start: row, end: row };
  }
  if (m.source === "audio") {
    const from = m.meta?.audioFrom;
    const to = m.meta?.audioTo;
    if (from == null || to == null) return null;
    return { start: from, end: to };
  }
  if (m.source === "video") {
    const from = m.meta?.videoFrom;
    const to = m.meta?.videoTo;
    if (from == null || to == null) return null;
    return { start: from, end: to };
  }
  return null;
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function calculateOverlap(
  data: ConsolidatedData,
  filters: FilterConfig,
): OverlapResult {
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
  for (const [code, count] of codeFreq) {
    if (count < filters.minFrequency) continue;
    codes.push(code);
  }
  codes.sort((a, b) => a.localeCompare(b));
  const sortedColors = codes.map((c) => codeColors.get(c) ?? "#6200EE");

  const n = codes.length;
  const codeIndex = new Map(codes.map((c, i) => [c, i]));
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  const skippedSet = new Set<SourceType>();
  let totalPairsChecked = 0;

  const byFile = new Map<string, UnifiedMarker[]>();
  for (const m of markers) {
    if (!markerHasPosition(m)) {
      if (m.source === "image") skippedSet.add("image");
      continue;
    }
    let list = byFile.get(m.file);
    if (!list) { list = []; byFile.set(m.file, list); }
    list.push(m);
  }

  for (const [, fileMarkers] of byFile) {
    const ranges: ({ start: number; end: number } | null)[] = fileMarkers.map(markerToRange);

    for (let a = 0; a < fileMarkers.length; a++) {
      const rA = ranges[a];
      if (!rA) continue;
      for (const cA of fileMarkers[a]!.codes) {
        const iA = codeIndex.get(cA);
        if (iA != null) matrix[iA]![iA]!++;
      }

      for (let b = a + 1; b < fileMarkers.length; b++) {
        const rB = ranges[b];
        if (!rB) continue;
        totalPairsChecked++;

        if (rangesOverlap(rA, rB)) {
          const codesA = fileMarkers[a]!.codes.filter((c) => codeIndex.has(c));
          const codesB = fileMarkers[b]!.codes.filter((c) => codeIndex.has(c));
          for (const cA of codesA) {
            for (const cB of codesB) {
              if (cA === cB) continue;
              const iA = codeIndex.get(cA)!;
              const iB = codeIndex.get(cB)!;
              matrix[iA]![iB]!++;
              matrix[iB]![iA]!++;
            }
          }
        }
      }
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const avg = Math.round(matrix[i]![j]! / 2);
      matrix[i]![j] = avg;
      matrix[j]![i] = avg;
    }
  }

  let maxValue = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (matrix[i]![j]! > maxValue) maxValue = matrix[i]![j]!;
    }
  }

  return { codes, colors: sortedColors, matrix, maxValue, totalPairsChecked, skippedSources: Array.from(skippedSet) };
}
