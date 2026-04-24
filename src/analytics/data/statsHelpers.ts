
import type { ConsolidatedData, FilterConfig, UnifiedMarker } from "./dataTypes";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";

export function applyFilters(
  data: ConsolidatedData,
  filters: FilterConfig,
  registry?: CaseVariablesRegistry,
): UnifiedMarker[] {
  // Pre-compute Set pra lookup O(1) se groupFilter está ativo
  const groupMemberSet = filters.groupFilter
    ? new Set(filters.groupFilter.memberCodeIds)
    : null;

  return data.markers.filter((m) => {
    if (!filters.sources.includes(m.source)) return false;
    if (filters.codes.length > 0 && !m.codes.some((c) => filters.codes.includes(c))) return false;
    if (filters.excludeCodes.length > 0 && m.codes.every((c) => filters.excludeCodes.includes(c))) return false;
    if (filters.caseVariableFilter && registry) {
      const { name, value } = filters.caseVariableFilter;
      const vars = registry.getVariables(m.fileId);
      if (vars[name] !== value) return false;
    }
    if (groupMemberSet && !m.codes.some((c) => groupMemberSet.has(c))) return false;
    return true;
  });
}
