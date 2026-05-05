
import type { ConsolidatedData, FilterConfig, EvolutionResult, TemporalResult } from "./dataTypes";
import { applyFilters } from "./statsHelpers";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";
import type { SmartCodeAccess } from "./frequency";
import { getSmartCodeViews, smartCodePassesCodesFilter } from "./smartCodeAnalytics";

export function calculateEvolution(
  data: ConsolidatedData,
  filters: FilterConfig,
  smartCodes?: SmartCodeAccess,
  caseVarsRegistry?: CaseVariablesRegistry,
): EvolutionResult {
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
  const idSet = new Set(idsKept);

  const maxLineByFile = new Map<string, number>();
  for (const m of markers) {
    if (m.meta?.fromLine == null) continue;
    const cur = maxLineByFile.get(m.fileId) ?? 0;
    const toLine = m.meta.toLine ?? m.meta.fromLine;
    if (toLine > cur) maxLineByFile.set(m.fileId, toLine);
    if (m.meta.fromLine > cur) maxLineByFile.set(m.fileId, Math.max(m.meta.fromLine, toLine));
  }

  const points: EvolutionResult["points"] = [];
  const fileSet = new Set<string>();

  for (const m of markers) {
    if (m.meta?.fromLine == null) continue;
    const maxLine = maxLineByFile.get(m.fileId) ?? 1;
    const position = maxLine > 0 ? m.meta.fromLine / maxLine : 0;

    for (const codeId of m.codes) {
      if (!idSet.has(codeId)) continue;
      fileSet.add(m.fileId);
      const def = codeById.get(codeId);
      points.push({
        code: def?.name ?? codeId,
        color: def?.color ?? "#6200EE",
        fileId: m.fileId,
        position: Math.min(1, Math.max(0, position)),
        fromLine: m.meta.fromLine,
        toLine: m.meta.toLine ?? m.meta.fromLine,
        markerId: m.id,
      });
    }
  }

  // Smart Codes pass — cada match com fromLine vira ponto na timeline. SC herda position do
  // marker original (não tem timestamp/posição própria, é query).
  if (smartCodes) {
    const scViews = getSmartCodeViews(data, smartCodes.cache, smartCodes.registry, filters, caseVarsRegistry);
    for (const sc of scViews) {
      if (!smartCodePassesCodesFilter(sc.id, filters)) continue;
      // minFrequency aplica ao SC: precisa pelo menos N matches com fromLine pra entrar.
      const matchesWithLine = sc.matches.filter(m => m.meta?.fromLine != null);
      if (matchesWithLine.length < filters.minFrequency) continue;

      // maxLine aplica também aos SC matches (mesmo cálculo do regular path acima).
      for (const m of matchesWithLine) {
        const cur = maxLineByFile.get(m.fileId) ?? 0;
        const toLine = m.meta!.toLine ?? m.meta!.fromLine!;
        if (toLine > cur) maxLineByFile.set(m.fileId, toLine);
        if (m.meta!.fromLine! > cur) maxLineByFile.set(m.fileId, Math.max(m.meta!.fromLine!, toLine));
      }

      codes.push(sc.name);
      sortedColors.push(sc.color);
      for (const m of matchesWithLine) {
        const maxLine = maxLineByFile.get(m.fileId) ?? 1;
        const position = maxLine > 0 ? m.meta!.fromLine! / maxLine : 0;
        fileSet.add(m.fileId);
        points.push({
          code: sc.name,
          color: sc.color,
          fileId: m.fileId,
          position: Math.min(1, Math.max(0, position)),
          fromLine: m.meta!.fromLine!,
          toLine: m.meta!.toLine ?? m.meta!.fromLine!,
          markerId: m.id,
        });
      }
    }
  }

  points.sort((a, b) => a.position - b.position);

  return { codes, colors: sortedColors, points, files: Array.from(fileSet).sort() };
}

export function calculateTemporal(
  data: ConsolidatedData,
  filters: FilterConfig,
  smartCodes?: SmartCodeAccess,
  caseVarsRegistry?: CaseVariablesRegistry,
): TemporalResult {
  const filtered = applyFilters(data, filters);

  const codeTimestamps = new Map<string, number[]>();
  for (const m of filtered) {
    const ts = m.meta?.createdAt;
    if (ts == null) continue;
    for (const codeId of m.codes) {
      if (filters.excludeCodes.includes(codeId)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(codeId)) continue;
      let arr = codeTimestamps.get(codeId);
      if (!arr) { arr = []; codeTimestamps.set(codeId, arr); }
      arr.push(ts);
    }
  }

  const codeById = new Map(data.codes.map((c) => [c.id, c]));
  const qualifiedIds: string[] = [];
  for (const [codeId, timestamps] of codeTimestamps) {
    if (timestamps.length >= filters.minFrequency) {
      qualifiedIds.push(codeId);
    }
  }
  qualifiedIds.sort((a, b) => (codeById.get(a)?.name ?? a).localeCompare(codeById.get(b)?.name ?? b));

  const codes: string[] = [];
  const colors: string[] = [];
  const series: TemporalResult["series"] = [];

  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const codeId of qualifiedIds) {
    const timestamps = codeTimestamps.get(codeId)!;
    timestamps.sort((a, b) => a - b);

    if (timestamps[0]! < globalMin) globalMin = timestamps[0]!;
    if (timestamps[timestamps.length - 1]! > globalMax) globalMax = timestamps[timestamps.length - 1]!;

    const def = codeById.get(codeId);
    const displayName = def?.name ?? codeId;
    const color = def?.color ?? "#6200EE";
    codes.push(displayName);
    colors.push(color);

    const points: Array<{ date: number; count: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      points.push({ date: timestamps[i]!, count: i + 1 });
    }
    series.push({ code: displayName, color, points });
  }

  // Smart Codes pass — herda createdAt dos matches. Cada match contribui um timestamp.
  if (smartCodes) {
    const scViews = getSmartCodeViews(data, smartCodes.cache, smartCodes.registry, filters, caseVarsRegistry);
    for (const sc of scViews) {
      if (!smartCodePassesCodesFilter(sc.id, filters)) continue;
      const timestamps = sc.matches
        .map(m => m.meta?.createdAt)
        .filter((t): t is number => t != null)
        .sort((a, b) => a - b);
      if (timestamps.length < filters.minFrequency) continue;

      if (timestamps[0]! < globalMin) globalMin = timestamps[0]!;
      if (timestamps[timestamps.length - 1]! > globalMax) globalMax = timestamps[timestamps.length - 1]!;

      codes.push(sc.name);
      colors.push(sc.color);
      const points: Array<{ date: number; count: number }> = [];
      for (let i = 0; i < timestamps.length; i++) {
        points.push({ date: timestamps[i]!, count: i + 1 });
      }
      series.push({ code: sc.name, color: sc.color, points });
    }
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
