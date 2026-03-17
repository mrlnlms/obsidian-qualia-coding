
import type { ConsolidatedData, FilterConfig, UnifiedMarker } from "./dataTypes";

export function applyFilters(data: ConsolidatedData, filters: FilterConfig): UnifiedMarker[] {
  return data.markers.filter((m) => {
    if (!filters.sources.includes(m.source)) return false;
    if (filters.codes.length > 0 && !m.codes.some((c) => filters.codes.includes(c))) return false;
    if (filters.excludeCodes.length > 0 && m.codes.every((c) => filters.excludeCodes.includes(c))) return false;
    return true;
  });
}
