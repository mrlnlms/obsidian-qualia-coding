
import type {
  ConsolidatedData, FilterConfig, LagResult, PolarCoordResult, PolarVector, UnifiedMarker,
} from "./dataTypes";
import { applyFilters } from "./statsHelpers";

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
  const transitions: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  const byFile = new Map<string, UnifiedMarker[]>();
  for (const m of markers) {
    let list = byFile.get(m.fileId);
    if (!list) { list = []; byFile.set(m.fileId, list); }
    list.push(m);
  }

  for (const [, fileMarkers] of byFile) {
    fileMarkers.sort((a, b) => getMarkerPosition(a) - getMarkerPosition(b));

    for (let i = 0; i + lag < fileMarkers.length; i++) {
      const mA = fileMarkers[i]!;
      const mB = fileMarkers[i + lag]!;
      for (const cA of mA.codes) {
        const iA = codeIndex.get(cA);
        if (iA == null) continue;
        for (const cB of mB.codes) {
          const iB = codeIndex.get(cB);
          if (iB == null) continue;
          transitions[iA]![iB]!++;
        }
      }
    }
  }

  let totalTransitions = 0;
  const rowSums = new Array(n).fill(0);
  const colSums = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      totalTransitions += transitions[i]![j]!;
      rowSums[i] += transitions[i]![j]!;
      colSums[j] += transitions[i]![j]!;
    }
  }

  const expected: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const zScores: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  if (totalTransitions > 0) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const exp = (rowSums[i] * colSums[j]) / totalTransitions;
        expected[i]![j] = Math.round(exp * 100) / 100;

        if (exp > 0) {
          const rowProp = rowSums[i]! / totalTransitions;
          const colProp = colSums[j]! / totalTransitions;
          const denom = Math.sqrt(exp * (1 - rowProp) * (1 - colProp));
          zScores[i]![j] = denom > 0
            ? Math.round(((transitions[i]![j]! - exp) / denom) * 100) / 100
            : 0;
        }
      }
    }
  }

  return { codes, colors: sortedColors, lag, transitions, expected, zScores, totalTransitions };
}

export function calculatePolarCoordinates(
  data: ConsolidatedData,
  filters: FilterConfig,
  focalCode: string,
  maxLag = 5,
): PolarCoordResult {
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  const lagResults: LagResult[] = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    lagResults.push(calculateLagSequential(data, filters, lag));
  }

  const refResult = lagResults[0];
  if (!refResult || refResult.codes.length === 0) {
    return {
      focalCode,
      focalColor: codeColors.get(focalCode) ?? "#6200EE",
      vectors: [],
      maxLag,
    };
  }

  const focalIdx = refResult.codes.indexOf(focalCode);
  if (focalIdx < 0) {
    return {
      focalCode,
      focalColor: codeColors.get(focalCode) ?? "#6200EE",
      vectors: [],
      maxLag,
    };
  }

  const n = refResult.codes.length;
  const vectors: PolarVector[] = [];

  for (let j = 0; j < n; j++) {
    if (j === focalIdx) continue;

    let sumProspective = 0;
    let sumRetrospective = 0;
    let validLags = 0;

    for (const lr of lagResults) {
      const fi = lr.codes.indexOf(focalCode);
      const ji = lr.codes.indexOf(refResult.codes[j]!);
      if (fi < 0 || ji < 0) continue;
      sumProspective += lr.zScores[fi]![ji]!;
      sumRetrospective += lr.zScores[ji]![fi]!;
      validLags++;
    }

    if (validLags === 0) continue;

    const sqrtValid = Math.sqrt(validLags);
    const zP = Math.round((sumProspective / sqrtValid) * 100) / 100;
    const zR = Math.round((sumRetrospective / sqrtValid) * 100) / 100;
    const radius = Math.round(Math.sqrt(zP * zP + zR * zR) * 100) / 100;
    const angleDeg = Math.round(Math.atan2(zR, zP) * (180 / Math.PI) * 100) / 100;

    let quadrant: 1 | 2 | 3 | 4;
    if (zP >= 0 && zR >= 0) quadrant = 1;
    else if (zP < 0 && zR >= 0) quadrant = 2;
    else if (zP < 0 && zR < 0) quadrant = 3;
    else quadrant = 4;

    vectors.push({
      code: refResult.codes[j]!,
      color: codeColors.get(refResult.codes[j]!) ?? "#6200EE",
      zProspective: zP,
      zRetrospective: zR,
      radius,
      angle: angleDeg,
      quadrant,
      significant: radius > 1.96,
    });
  }

  vectors.sort((a, b) => b.radius - a.radius);

  return {
    focalCode,
    focalColor: codeColors.get(focalCode) ?? "#6200EE",
    vectors,
    maxLag,
  };
}
