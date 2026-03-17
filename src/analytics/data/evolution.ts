
import type { ConsolidatedData, FilterConfig, EvolutionResult, TemporalResult } from "./dataTypes";
import { applyFilters } from "./statsHelpers";

export function calculateEvolution(
  data: ConsolidatedData,
  filters: FilterConfig
): EvolutionResult {
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
  const codeSet = new Set(codes);

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

export function calculateTemporal(data: ConsolidatedData, filters: FilterConfig): TemporalResult {
  const filtered = applyFilters(data, filters);

  const codeTimestamps = new Map<string, number[]>();
  for (const m of filtered) {
    const ts = m.meta?.createdAt;
    if (ts == null) continue;
    for (const code of m.codes) {
      if (filters.excludeCodes.includes(code)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(code)) continue;
      let arr = codeTimestamps.get(code);
      if (!arr) { arr = []; codeTimestamps.set(code, arr); }
      arr.push(ts);
    }
  }

  const qualifiedCodes: string[] = [];
  for (const [code, timestamps] of codeTimestamps) {
    if (timestamps.length >= filters.minFrequency) {
      qualifiedCodes.push(code);
    }
  }
  qualifiedCodes.sort();

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

    if (timestamps[0]! < globalMin) globalMin = timestamps[0]!;
    if (timestamps[timestamps.length - 1]! > globalMax) globalMax = timestamps[timestamps.length - 1]!;

    const color = codeColorMap.get(code) ?? "#6200EE";
    codes.push(code);
    colors.push(color);

    const points: Array<{ date: number; count: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      points.push({ date: timestamps[i]!, count: i + 1 });
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
