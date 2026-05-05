
import type {
  ConsolidatedData, FilterConfig, FrequencyResult,
  DocCodeMatrixResult, SourceType, SourceComparisonResult, SourceComparisonEntry,
} from "./dataTypes";
import { applyFilters } from "./statsHelpers";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";
import type { SmartCodeCache } from "../../core/smartCodes/cache";
import type { SmartCodeRegistry } from "../../core/smartCodes/smartCodeRegistryApi";
import { getSmartCodeViews, smartCodePassesCodesFilter } from "./smartCodeAnalytics";

export interface SmartCodeAccess {
  cache: SmartCodeCache;
  registry: SmartCodeRegistry;
}

const emptyBySource = (): Record<SourceType, number> => ({
  markdown: 0, "csv-segment": 0, "csv-row": 0, image: 0, pdf: 0, audio: 0, video: 0,
});

export function calculateFrequency(
  data: ConsolidatedData,
  filters: FilterConfig,
  smartCodes?: SmartCodeAccess,
  caseVarsRegistry?: CaseVariablesRegistry,
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
        entry = { total: 0, bySource: emptyBySource(), byFile: {} };
        map.set(code, entry);
      }
      entry.total++;
      entry.bySource[m.source]++;
      entry.byFile[m.fileId] = (entry.byFile[m.fileId] ?? 0) + 1;
    }
  }

  const results: FrequencyResult[] = [];
  const codeById = new Map(data.codes.map((c) => [c.id, c]));

  for (const [codeId, entry] of map) {
    if (entry.total < filters.minFrequency) continue;
    const def = codeById.get(codeId);
    results.push({
      code: def?.name ?? codeId,
      color: def?.color ?? "#6200EE",
      total: entry.total,
      bySource: entry.bySource,
      byFile: entry.byFile,
    });
  }

  // Smart Codes pass — augmenta result com SC entries. Cada SC count = matches que
  // passam global filters (sources/caseVar/group). Codes filter dispatchado via
  // smartCodePassesCodesFilter (filtra QUAIS SCs entram, não quais matches).
  if (smartCodes) {
    const scViews = getSmartCodeViews(data, smartCodes.cache, smartCodes.registry, filters, caseVarsRegistry);
    for (const sc of scViews) {
      if (!smartCodePassesCodesFilter(sc.id, filters)) continue;
      if (sc.matches.length < filters.minFrequency) continue;
      const bySource = emptyBySource();
      const byFile: Record<string, number> = {};
      for (const m of sc.matches) {
        bySource[m.source]++;
        byFile[m.fileId] = (byFile[m.fileId] ?? 0) + 1;
      }
      results.push({
        code: sc.name,
        color: sc.color,
        total: sc.matches.length,
        bySource,
        byFile,
        isSmart: true,
      });
    }
  }

  return results;
}

export function calculateDocumentCodeMatrix(
  data: ConsolidatedData,
  filters: FilterConfig
): DocCodeMatrixResult {
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

  // Build (id, name) pairs to sort by display name; output uses display names for backward compat with chart labels.
  const idsKept = [...codeFreq.entries()].filter(([, count]) => count >= filters.minFrequency).map(([id]) => id);
  idsKept.sort((a, b) => (codeById.get(a)?.name ?? a).localeCompare(codeById.get(b)?.name ?? b));
  const codes: string[] = idsKept.map((id) => codeById.get(id)?.name ?? id);
  const colors: string[] = idsKept.map((id) => codeById.get(id)?.color ?? "#6200EE");

  const fileSet = new Set<string>();
  const idsKeptSet = new Set(idsKept);
  for (const m of markers) {
    if (m.codes.some((c) => idsKeptSet.has(c))) {
      fileSet.add(m.fileId);
    }
  }
  const files = Array.from(fileSet).sort();

  const codeIndex = new Map(idsKept.map((id, i) => [id, i]));
  const fileIndex = new Map(files.map((f, i) => [f, i]));
  const matrix: number[][] = Array.from({ length: files.length }, () => new Array(codes.length).fill(0));

  for (const m of markers) {
    const fi = fileIndex.get(m.fileId);
    if (fi == null) continue;
    for (const codeId of m.codes) {
      const ci = codeIndex.get(codeId);
      if (ci != null) matrix[fi]![ci]!++;
    }
  }

  let maxValue = 0;
  for (const row of matrix) {
    for (const v of row) {
      if (v > maxValue) maxValue = v;
    }
  }

  return { files, codes, colors, matrix, maxValue };
}

export function calculateSourceComparison(
  data: ConsolidatedData,
  filters: FilterConfig,
): SourceComparisonResult {
  const markers = applyFilters(data, filters);
  const codeById = new Map(data.codes.map((c) => [c.id, c]));

  const allSources: SourceType[] = ["markdown", "csv-segment", "csv-row", "image", "pdf", "audio", "video"];
  const emptyBySource = (): Record<SourceType, number> =>
    ({ markdown: 0, "csv-segment": 0, "csv-row": 0, image: 0, pdf: 0, audio: 0, video: 0 });

  const map = new Map<string, { total: number; bySource: Record<SourceType, number> }>();
  const sourceTotals = emptyBySource();

  for (const m of markers) {
    sourceTotals[m.source]++;
    for (const codeId of m.codes) {
      if (filters.excludeCodes.includes(codeId)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(codeId)) continue;
      let entry = map.get(codeId);
      if (!entry) {
        entry = { total: 0, bySource: emptyBySource() };
        map.set(codeId, entry);
      }
      entry.total++;
      entry.bySource[m.source]++;
    }
  }

  const activeSources = allSources.filter((s) => sourceTotals[s] > 0);
  const entries: SourceComparisonEntry[] = [];
  const codes: string[] = [];
  const colors: string[] = [];

  for (const [codeId, entry] of map) {
    if (entry.total < filters.minFrequency) continue;
    const def = codeById.get(codeId);
    const displayName = def?.name ?? codeId;
    const color = def?.color ?? "#6200EE";
    const pctOfCode = emptyBySource();
    const pctOfSrc = emptyBySource();
    for (const s of allSources) {
      pctOfCode[s] = entry.total > 0 ? Math.round((entry.bySource[s] / entry.total) * 1000) / 10 : 0;
      pctOfSrc[s] = sourceTotals[s] > 0 ? Math.round((entry.bySource[s] / sourceTotals[s]) * 1000) / 10 : 0;
    }
    codes.push(displayName);
    colors.push(color);
    entries.push({
      code: displayName,
      color,
      total: entry.total,
      bySource: entry.bySource,
      bySourcePctOfCode: pctOfCode,
      bySourcePctOfSrc: pctOfSrc,
    });
  }

  entries.sort((a, b) => b.total - a.total);

  return { codes, colors, activeSources, sourceTotals, entries };
}
