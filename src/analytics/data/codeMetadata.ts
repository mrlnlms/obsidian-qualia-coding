import type { ConsolidatedData, FilterConfig, CodeMetadataResult, CodeMetadataStat } from "./dataTypes";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";
import type { VariableValue } from "../../core/caseVariables/caseVariablesTypes";
import { applyFilters } from "./statsHelpers";
import { chiSquareFromContingency } from "./inferential";
import { binNumeric, binDate, explodeMultitext } from "./binning";

const MISSING_LABEL = "(missing)";

export function calculateCodeMetadata(
  data: ConsolidatedData,
  filters: FilterConfig,
  variableName: string,
  registry: CaseVariablesRegistry,
  options: { includeMissing: boolean },
): CodeMetadataResult {
  const variableType = registry.getType(variableName);
  const isMultitext = variableType === "multitext";

  // ─── 1. Filtrar markers ───
  const allMarkers = applyFilters(data, filters, registry);

  // ─── 2. Discovery dos labels de coluna baseado no tipo da variável ───
  const rawValues = registry.getValuesForVariable(variableName);

  let columnLabels: string[];
  let assignFn: (raw: VariableValue) => string[];

  if (variableType === "number") {
    const numbers: number[] = [];
    for (const v of rawValues) {
      if (typeof v === "number" && Number.isFinite(v)) numbers.push(v);
    }
    const { bins, assign } = binNumeric(numbers);
    columnLabels = bins;
    assignFn = (raw) => {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return [];
      return [assign(raw)];
    };
  } else if (variableType === "date" || variableType === "datetime") {
    const dates: Date[] = [];
    for (const v of rawValues) {
      const parsed = parseDateValue(v);
      if (parsed) dates.push(parsed);
    }
    const { bins, assign } = binDate(dates);
    columnLabels = bins;
    assignFn = (raw) => {
      const d = parseDateValue(raw);
      if (!d) return [];
      return [assign(d)];
    };
  } else if (variableType === "multitext") {
    // Flatten arrays into unique set
    const set = new Set<string>();
    for (const v of rawValues) {
      for (const piece of explodeMultitext(v)) set.add(piece);
    }
    columnLabels = Array.from(set).sort();
    assignFn = (raw) => explodeMultitext(raw);
  } else {
    // text, checkbox → categorical literal
    const set = new Set<string>();
    for (const v of rawValues) {
      const piece = String(v ?? "").trim();
      if (piece.length > 0) set.add(piece);
    }
    columnLabels = Array.from(set).sort();
    assignFn = (raw) => {
      const s = String(raw ?? "").trim();
      return s.length > 0 ? [s] : [];
    };
  }

  // ─── 3. Reservar coluna (missing) se houver markers sem valor ───
  let hasMissingColumn = false;
  if (options.includeMissing) {
    for (const m of allMarkers) {
      const vars = registry.getVariables(m.fileId);
      const v = vars[variableName];
      if (v === undefined || v === null) {
        hasMissingColumn = true;
        break;
      }
      if (Array.isArray(v) && v.length === 0) {
        hasMissingColumn = true;
        break;
      }
    }
  }

  const values = hasMissingColumn ? [...columnLabels, MISSING_LABEL] : [...columnLabels];
  const valueIndex = new Map(values.map((v, i) => [v, i] as const));

  // ─── 4. Agregar códigos visíveis ───
  const codeById = new Map(data.codes.map((c) => [c.id, c]));

  const codeFreq = new Map<string, number>();
  for (const m of allMarkers) {
    for (const codeId of m.codes) {
      if (filters.excludeCodes.includes(codeId)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(codeId)) continue;
      codeFreq.set(codeId, (codeFreq.get(codeId) ?? 0) + 1);
    }
  }

  const visibleCodeIds: string[] = [];
  for (const [id, freq] of codeFreq) {
    if (freq < filters.minFrequency) continue;
    visibleCodeIds.push(id);
  }
  visibleCodeIds.sort((a, b) => {
    const na = codeById.get(a)?.name ?? a;
    const nb = codeById.get(b)?.name ?? b;
    return na.localeCompare(nb);
  });

  // ─── 5. Construir matriz [code × value] ───
  const codes = visibleCodeIds.map((id) => {
    const def = codeById.get(id);
    return { id, name: def?.name ?? id, color: def?.color ?? "#6200EE" };
  });
  const codeIndex = new Map(visibleCodeIds.map((id, i) => [id, i] as const));

  const R = codes.length;
  const C = values.length;
  const matrix: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));

  if (R > 0 && C > 0) {
    for (const m of allMarkers) {
      const vars = registry.getVariables(m.fileId);
      const raw = vars[variableName];
      let cols = assignFn(raw as VariableValue);
      if (cols.length === 0) {
        if (!hasMissingColumn) continue;
        cols = [MISSING_LABEL];
      }
      for (const codeId of m.codes) {
        const r = codeIndex.get(codeId);
        if (r === undefined) continue;
        for (const colLabel of cols) {
          const c = valueIndex.get(colLabel);
          if (c === undefined) continue;
          matrix[r]![c]!++;
        }
      }
    }
  }

  // ─── 6. Totais ───
  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = new Array(C).fill(0);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      colTotals[c] += matrix[r]![c]!;
    }
  }
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

  // ─── 7. Stats por código ───
  const stats: Array<CodeMetadataStat | null> = codes.map((_, r) => {
    if (isMultitext) return null;
    if (C < 2) return null;
    if (rowTotals[r] === 0) return null;
    // Tabela 2×C: linha 0 = presente (matrix[r]), linha 1 = ausente (colTotals - matrix[r])
    const present = matrix[r]!;
    const absent = colTotals.map((t, c) => t - present[c]!);
    const observed = [present, absent];
    const result = chiSquareFromContingency(observed);
    if (result.df === 0) return null;
    return {
      chiSquare: result.chiSquare,
      df: result.df,
      pValue: result.pValue,
      cramersV: result.cramersV,
      significant: result.significant,
    };
  });

  return {
    codes,
    values,
    matrix,
    rowTotals,
    colTotals,
    grandTotal,
    hasMissingColumn,
    variableType,
    isMultitext,
    stats,
  };
}

function parseDateValue(v: VariableValue | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
