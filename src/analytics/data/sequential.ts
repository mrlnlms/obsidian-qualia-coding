
import type {
  ConsolidatedData, FilterConfig, LagResult, PolarCoordResult, PolarVector, UnifiedMarker,
} from "./dataTypes";
import { applyFilters } from "./statsHelpers";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";
import type { SmartCodeAccess } from "./frequency";
import { getSmartCodeViews, smartCodePassesCodesFilter } from "./smartCodeAnalytics";

function getMarkerPosition(m: UnifiedMarker): number {
  if (m.meta?.audioFrom != null) return m.meta.audioFrom;
  if (m.meta?.videoFrom != null) return m.meta.videoFrom;
  if (m.meta?.fromLine != null) return m.meta.fromLine;
  if (m.meta?.row != null) return m.meta.row;
  if (m.meta?.page != null) return m.meta.page;
  return 0;
}

function markerKey(m: UnifiedMarker): string {
  return `${m.source}:${m.fileId}:${m.id}`;
}

export function calculateLagSequential(
  data: ConsolidatedData,
  filters: FilterConfig,
  lag: number,
  smartCodes?: SmartCodeAccess,
  caseVarsRegistry?: CaseVariablesRegistry,
): LagResult {
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
  const isSmart: boolean[] = idsKept.map(() => false);

  // Smart Codes: estende dimensões e cria augmented codes set por marker.
  // Cada marker M ganha {scId} adicional para cada SC que matcha M. Transitions count
  // "marker matching SC X precede marker com code Y" naturalmente.
  const augmentedCodesByMarker = new Map<string, Set<string>>();
  let scIdsKept: string[] = [];
  if (smartCodes) {
    const scViews = getSmartCodeViews(data, smartCodes.cache, smartCodes.registry, filters, caseVarsRegistry);
    for (const sc of scViews) {
      if (!smartCodePassesCodesFilter(sc.id, filters)) continue;
      if (sc.matches.length < filters.minFrequency) continue;
      scIdsKept.push(sc.id);
      idsKept.push(sc.id);
      codes.push(sc.name);
      sortedColors.push(sc.color);
      isSmart.push(true);
      for (const m of sc.matches) {
        const key = markerKey(m);
        let set = augmentedCodesByMarker.get(key);
        if (!set) { set = new Set(m.codes); augmentedCodesByMarker.set(key, set); }
        set.add(sc.id);
      }
    }
  }

  const n = idsKept.length;
  const codeIndex = new Map(idsKept.map((id, i) => [id, i]));
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
      const codesA = augmentedCodesByMarker.get(markerKey(mA)) ?? mA.codes;
      const codesB = augmentedCodesByMarker.get(markerKey(mB)) ?? mB.codes;
      for (const cA of codesA) {
        const iA = codeIndex.get(cA);
        if (iA == null) continue;
        for (const cB of codesB) {
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

  return { codes, colors: sortedColors, lag, transitions, expected, zScores, totalTransitions, isSmart };
}

/**
 * focalCode is a codeId. The result.focalCode in the output is the display name.
 */
export function calculatePolarCoordinates(
  data: ConsolidatedData,
  filters: FilterConfig,
  focalCodeId: string,
  maxLag = 5,
  smartCodes?: SmartCodeAccess,
  caseVarsRegistry?: CaseVariablesRegistry,
): PolarCoordResult {
  const codeById = new Map(data.codes.map((c) => [c.id, c]));
  const focalDef = codeById.get(focalCodeId);
  const focalName = focalDef?.name ?? focalCodeId;
  const focalColor = focalDef?.color ?? "#6200EE";
  // calculateLagSequential returns codes as display names — index by name from here on
  const codeByName = new Map(data.codes.map((c) => [c.name, c]));

  const lagResults: LagResult[] = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    lagResults.push(calculateLagSequential(data, filters, lag, smartCodes, caseVarsRegistry));
  }

  const refResult = lagResults[0];
  if (!refResult || refResult.codes.length === 0) {
    return { focalCode: focalName, focalColor, vectors: [], maxLag };
  }

  const focalIdx = refResult.codes.indexOf(focalName);
  if (focalIdx < 0) {
    return { focalCode: focalName, focalColor, vectors: [], maxLag };
  }

  const n = refResult.codes.length;
  const vectors: PolarVector[] = [];

  for (let j = 0; j < n; j++) {
    if (j === focalIdx) continue;

    let sumProspective = 0;
    let sumRetrospective = 0;
    let validLags = 0;

    for (const lr of lagResults) {
      const fi = lr.codes.indexOf(focalName);
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

    const condName = refResult.codes[j]!;
    vectors.push({
      code: condName,
      color: codeByName.get(condName)?.color ?? "#6200EE",
      zProspective: zP,
      zRetrospective: zR,
      radius,
      angle: angleDeg,
      quadrant,
      significant: radius > 1.96,
    });
  }

  vectors.sort((a, b) => b.radius - a.radius);

  return { focalCode: focalName, focalColor, vectors, maxLag };
}
