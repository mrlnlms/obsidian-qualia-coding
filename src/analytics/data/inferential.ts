
import type {
  ConsolidatedData, FilterConfig, ChiSquareResult, ChiSquareEntry,
} from "./dataTypes";
import { applyFilters } from "./statsHelpers";

/** Standard normal CDF approximation (Abramowitz-Stegun 26.2.17) */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1 + sign * y);
}

/** Chi-square survival function P(X > x) using Wilson-Hilferty approximation */
function chiSquareSurvival(x: number, df: number): number {
  if (df <= 0 || x <= 0) return 1;
  const k = df;
  const z = (Math.pow(x / k, 1 / 3) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return 1 - normalCDF(z);
}

/**
 * Pure chi-square calculation from a contingency table.
 *
 * Generic over R×C (rows × cols). Used by both `calculateChiSquare` (2×K) and
 * `calculateCodeMetadata` (R×M).
 *
 * Rounding matches legacy `calculateChiSquare`:
 * - expected: 2 decimals (round * 100 / 100)
 * - chiSquare: 3 decimals (round * 1000 / 1000)
 * - pValue: 4 decimals (round * 10000 / 10000)
 * - cramersV: 3 decimals (round * 1000 / 1000)
 */
export function chiSquareFromContingency(observed: number[][]): {
  chiSquare: number;
  df: number;
  pValue: number;
  cramersV: number;
  significant: boolean;
  expected: number[][];
} {
  const R = observed.length;
  const C = R > 0 ? observed[0]!.length : 0;

  if (R < 2 || C < 2) {
    return {
      chiSquare: 0,
      df: 0,
      pValue: 1,
      cramersV: 0,
      significant: false,
      expected: observed.map((row) => row.map(() => 0)),
    };
  }

  const rowTotals = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = new Array(C).fill(0);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      colTotals[c] += observed[r]![c]!;
    }
  }
  const N = rowTotals.reduce((a, b) => a + b, 0);

  if (N === 0) {
    return {
      chiSquare: 0,
      df: (R - 1) * (C - 1),
      pValue: 1,
      cramersV: 0,
      significant: false,
      expected: observed.map((row) => row.map(() => 0)),
    };
  }

  const expected: number[][] = [];
  let chiSq = 0;

  for (let r = 0; r < R; r++) {
    const expRow: number[] = [];
    for (let c = 0; c < C; c++) {
      const e = (rowTotals[r]! * colTotals[c]!) / N;
      expRow.push(Math.round(e * 100) / 100);
      if (e > 0) {
        chiSq += ((observed[r]![c]! - e) ** 2) / e;
      }
    }
    expected.push(expRow);
  }

  chiSq = Math.round(chiSq * 1000) / 1000;
  const df = (R - 1) * (C - 1);
  const pValue = Math.round(chiSquareSurvival(chiSq, df) * 10000) / 10000;
  const minDim = Math.min(R - 1, C - 1);
  const cramersV =
    N > 0 && minDim > 0
      ? Math.round(Math.sqrt(chiSq / (N * minDim)) * 1000) / 1000
      : 0;

  return {
    chiSquare: chiSq,
    df,
    pValue,
    cramersV,
    significant: pValue < 0.05,
    expected,
  };
}

export function calculateChiSquare(
  data: ConsolidatedData,
  filters: FilterConfig,
  groupBy: "source" | "file",
): ChiSquareResult {
  const markers = applyFilters(data, filters);
  const codeById = new Map(data.codes.map((c) => [c.id, c]));

  const catSet = new Set<string>();
  for (const m of markers) {
    catSet.add(groupBy === "source" ? m.source : m.fileId);
  }
  const categories = Array.from(catSet).sort();
  const catIndex = new Map(categories.map((c, i) => [c, i]));
  const K = categories.length;

  if (K < 2) {
    return { groupBy, categories, entries: [] };
  }

  const markersPerCat = new Array(K).fill(0);
  for (const m of markers) {
    const ci = catIndex.get(groupBy === "source" ? m.source : m.fileId);
    if (ci != null) markersPerCat[ci]++;
  }

  const codeFreq = new Map<string, number>();
  for (const m of markers) {
    for (const code of m.codes) {
      if (filters.excludeCodes.includes(code)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(code)) continue;
      codeFreq.set(code, (codeFreq.get(code) ?? 0) + 1);
    }
  }

  const entries: ChiSquareEntry[] = [];
  const N = markers.length;

  for (const [codeId, freq] of codeFreq) {
    if (freq < filters.minFrequency) continue;

    const present = new Array(K).fill(0);
    for (const m of markers) {
      if (!m.codes.includes(codeId)) continue;
      const ci = catIndex.get(groupBy === "source" ? m.source : m.fileId);
      if (ci != null) present[ci]++;
    }

    const observed: number[][] = [];
    const expected: number[][] = [];
    for (let k = 0; k < K; k++) {
      observed.push([present[k], markersPerCat[k] - present[k]]);
    }

    const colSum0 = present.reduce((a: number, b: number) => a + b, 0);
    const colSum1 = N - colSum0;

    let chiSq = 0;
    for (let k = 0; k < K; k++) {
      const e0 = (markersPerCat[k] * colSum0) / N;
      const e1 = (markersPerCat[k] * colSum1) / N;
      expected.push([Math.round(e0 * 100) / 100, Math.round(e1 * 100) / 100]);
      if (e0 > 0) chiSq += ((observed[k]![0]! - e0) ** 2) / e0;
      if (e1 > 0) chiSq += ((observed[k]![1]! - e1) ** 2) / e1;
    }

    chiSq = Math.round(chiSq * 1000) / 1000;
    const df = K - 1;
    const pValue = Math.round(chiSquareSurvival(chiSq, df) * 10000) / 10000;
    const cramersV = N > 0 ? Math.round(Math.sqrt(chiSq / N) * 1000) / 1000 : 0;

    const def = codeById.get(codeId);
    entries.push({
      code: def?.name ?? codeId,
      color: def?.color ?? "#6200EE",
      chiSquare: chiSq,
      df,
      pValue,
      cramersV,
      significant: pValue < 0.05,
      observed,
      expected,
    });
  }

  entries.sort((a, b) => a.pValue - b.pValue);

  return { groupBy, categories, entries };
}
