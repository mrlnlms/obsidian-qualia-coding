/**
 * Shared Q-mode data builders. Used by Files Dendrogram (S1), File Similarity
 * Ranking (S2), and cluster drill-down (S3).
 *
 * Pure functions, no Obsidian deps.
 */

import type { UnifiedMarker, SourceType } from "./dataTypes";

export interface FileQModeData {
  /** Stable file identifiers (fileId / vault path). */
  fileIds: string[];
  /** Per-file: set of codeIds present at least once in any marker on that file. */
  fileSets: Set<string>[];
  /** Display label per file (basename without extension). */
  fileNames: string[];
  /** Deterministic HSL color per file index. */
  fileColors: string[];
  /** Marker count per file (size hint for charts; not deduplicated by code). */
  markerCounts: number[];
}

/**
 * Build per-file code sets from already-filtered markers.
 * Caller is responsible for upstream filtering (sources, codes, etc.).
 *
 * Files with zero codes after filtering are dropped — they cannot participate
 * in similarity computation.
 */
export function buildFileQModeData(markers: UnifiedMarker[]): FileQModeData {
  const fileSets = new Map<string, Set<string>>();
  const markerCount = new Map<string, number>();
  for (const m of markers) {
    let s = fileSets.get(m.fileId);
    if (!s) { s = new Set(); fileSets.set(m.fileId, s); }
    for (const c of m.codes) s.add(c);
    markerCount.set(m.fileId, (markerCount.get(m.fileId) ?? 0) + 1);
  }

  // Drop files with zero codes
  const fileIds: string[] = [];
  const sets: Set<string>[] = [];
  const counts: number[] = [];
  for (const [fid, set] of fileSets) {
    if (set.size === 0) continue;
    fileIds.push(fid);
    sets.push(set);
    counts.push(markerCount.get(fid) ?? 0);
  }

  const names = fileIds.map((f) => {
    const parts = f.split("/");
    const name = parts[parts.length - 1] ?? f;
    return name.replace(/\.[^.]+$/, "");
  });

  const colors = fileIds.map((_, i) => {
    const hue = (i * 137.5) % 360;
    return `hsl(${hue}, 60%, 55%)`;
  });

  return {
    fileIds,
    fileSets: sets,
    fileNames: names,
    fileColors: colors,
    markerCounts: counts,
  };
}

/**
 * Standard pre-filter for Q-mode views. Mirrors mdsMode.ts inline filter so
 * Files Dendrogram and MDS Files agree on input. Respects enabledSources +
 * enabledCodes; ignores excludeCodes/caseVariableFilter (parity with MDS Files
 * — those will be wired in S3 via applyFilters integration).
 */
export function preFilterMarkersForQMode(
  markers: UnifiedMarker[],
  enabledSources: ReadonlySet<SourceType>,
  enabledCodes: ReadonlySet<string>,
): UnifiedMarker[] {
  return markers
    .filter((m) => enabledSources.has(m.source))
    .map((m) => ({ ...m, codes: m.codes.filter((c) => enabledCodes.has(c)) }))
    .filter((m) => m.codes.length > 0);
}
