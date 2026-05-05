
import type {
  ConsolidatedData, FilterConfig, CooccurrenceResult, OverlapResult, SourceType, UnifiedMarker,
} from "./dataTypes";
import { applyFilters } from "./statsHelpers";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";
import type { SmartCodeAccess } from "./frequency";
import { getSmartCodeViews, smartCodePassesCodesFilter } from "./smartCodeAnalytics";

/** Key estável pra UnifiedMarker (source+fileId+id). Usado em Set pra interseções
 *  cross-dimension (SC × regular, SC × SC). */
function markerKey(m: UnifiedMarker): string {
	return `${m.source}:${m.fileId}:${m.id}`;
}

export function calculateCooccurrence(
  data: ConsolidatedData,
  filters: FilterConfig,
  smartCodes?: SmartCodeAccess,
  caseVarsRegistry?: CaseVariablesRegistry,
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

  const codeById = new Map(data.codes.map((c) => [c.id, c]));
  const idsKept: string[] = [];
  for (const [codeId, count] of freq) {
    if (count < filters.minFrequency) continue;
    idsKept.push(codeId);
  }
  idsKept.sort((a, b) => (codeById.get(a)?.name ?? a).localeCompare(codeById.get(b)?.name ?? b));
  const codes: string[] = idsKept.map((id) => codeById.get(id)?.name ?? id);
  const sortedColors: string[] = idsKept.map((id) => codeById.get(id)?.color ?? "#6200EE");
  const isSmart: boolean[] = idsKept.map(() => false);

  const n = idsKept.length;
  const codeIndex = new Map(idsKept.map((id, i) => [id, i]));
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const m of markers) {
    const relevantIds = m.codes.filter((c) => codeIndex.has(c));
    for (const c of relevantIds) {
      const i = codeIndex.get(c)!;
      matrix[i]![i]!++;
    }
    for (let a = 0; a < relevantIds.length; a++) {
      for (let b = a + 1; b < relevantIds.length; b++) {
        const i = codeIndex.get(relevantIds[a]!)!;
        const j = codeIndex.get(relevantIds[b]!)!;
        matrix[i]![j]!++;
        matrix[j]![i]!++;
      }
    }
  }

  // Smart Codes: aumenta matriz com rows/cols pra cada SC visível.
  // SC × regular code = | sc.matches ∩ markers-com-código | (count de markers que são match do SC E têm regular code).
  // SC × SC = | sc1.matches ∩ sc2.matches |.
  // SC diagonal = sc.matches.length (idêntico ao count de SC entry).
  if (smartCodes) {
    const scViews = getSmartCodeViews(data, smartCodes.cache, smartCodes.registry, filters, caseVarsRegistry);
    const eligibleSCs = scViews.filter(sc => smartCodePassesCodesFilter(sc.id, filters) && sc.matches.length >= filters.minFrequency);
    if (eligibleSCs.length > 0) {
      // Pre-compute Sets de match keys por SC pra interseção O(1).
      const scKeys: Set<string>[] = eligibleSCs.map(sc => new Set(sc.matches.map(markerKey)));
      // Expandir matrix dimensões pra cada SC.
      const newSize = n + eligibleSCs.length;
      for (const row of matrix) {
        while (row.length < newSize) row.push(0);
      }
      while (matrix.length < newSize) matrix.push(new Array(newSize).fill(0));

      for (let s = 0; s < eligibleSCs.length; s++) {
        const sc = eligibleSCs[s]!;
        const scIdx = n + s;
        codes.push(sc.name);
        sortedColors.push(sc.color);
        isSmart.push(true);
        // Diagonal — count de matches.
        matrix[scIdx]![scIdx] = sc.matches.length;

        // SC × regular: pra cada match marker, conta quantos códigos regulares idsKept o marker tem.
        for (const m of sc.matches) {
          for (const codeId of m.codes) {
            const ri = codeIndex.get(codeId);
            if (ri == null) continue;  // regular code fora do idsKept (filtered out)
            matrix[scIdx]![ri]!++;
            matrix[ri]![scIdx]!++;
          }
        }

        // SC × SC anteriores: interseção de sets.
        for (let prev = 0; prev < s; prev++) {
          const prevKeys = scKeys[prev]!;
          let inter = 0;
          for (const k of scKeys[s]!) if (prevKeys.has(k)) inter++;
          const prevIdx = n + prev;
          matrix[scIdx]![prevIdx]! = inter;
          matrix[prevIdx]![scIdx]! = inter;
        }
      }
    }
  }

  let maxValue = 0;
  const total = codes.length;
  for (let i = 0; i < total; i++) {
    for (let j = 0; j < total; j++) {
      if (matrix[i]![j]! > maxValue) maxValue = matrix[i]![j]!;
    }
  }

  return { codes, colors: sortedColors, matrix, maxValue, isSmart };
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
  const codeById = new Map(data.codes.map((c) => [c.id, c]));

  const codeFreq = new Map<string, number>();
  for (const m of markers) {
    for (const codeId of m.codes) {
      if (filters.excludeCodes.includes(codeId)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(codeId)) continue;
      codeFreq.set(codeId, (codeFreq.get(codeId) ?? 0) + 1);
    }
  }

  const idsKept: string[] = [];
  for (const [codeId, count] of codeFreq) {
    if (count < filters.minFrequency) continue;
    idsKept.push(codeId);
  }
  idsKept.sort((a, b) => (codeById.get(a)?.name ?? a).localeCompare(codeById.get(b)?.name ?? b));
  const codes: string[] = idsKept.map((id) => codeById.get(id)?.name ?? id);
  const sortedColors: string[] = idsKept.map((id) => codeById.get(id)?.color ?? "#6200EE");

  const n = idsKept.length;
  const codeIndex = new Map(idsKept.map((id, i) => [id, i]));
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  const skippedSet = new Set<SourceType>();
  let totalPairsChecked = 0;

  const byFile = new Map<string, UnifiedMarker[]>();
  for (const m of markers) {
    if (!markerHasPosition(m)) {
      if (m.source === "image") skippedSet.add("image");
      continue;
    }
    let list = byFile.get(m.fileId);
    if (!list) { list = []; byFile.set(m.fileId, list); }
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
