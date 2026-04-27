import type { CodeDefinitionRegistry } from "../../core/codeDefinitionRegistry";
import type { BaseMarker } from "../../core/types";
import type { CodeApplication } from "../../core/types";
import type { AllEngineData } from "./dataReader";
import { buildFlatTree, type ExpandedState } from "../../core/hierarchyHelpers";
import type {
  CodeMemoSection,
  CoverageStats,
  EngineType,
  FileMemoSection,
  MemoEntry,
  MemoViewFilters,
  MemoViewResult,
  SourceType,
} from "./dataTypes";

interface FlatMarker {
  marker: BaseMarker;
  engineType: EngineType;
  source: SourceType;
  fileId: string;
}

/** Flat list of all markers across all engines, with engineType anotado. */
function flattenMarkers(allData: AllEngineData): FlatMarker[] {
  const out: FlatMarker[] = [];
  for (const [fileId, markers] of Object.entries(allData.markdown.markers)) {
    for (const m of markers) out.push({ marker: m as unknown as BaseMarker, engineType: "markdown", source: "markdown", fileId });
  }
  for (const m of allData.pdf.markers) out.push({ marker: m as unknown as BaseMarker, engineType: "pdf", source: "pdf", fileId: (m as any).fileId });
  for (const m of allData.image.markers) out.push({ marker: m as unknown as BaseMarker, engineType: "image", source: "image", fileId: (m as any).fileId });
  for (const m of allData.csv.segmentMarkers) out.push({ marker: m as unknown as BaseMarker, engineType: "csv", source: "csv-segment", fileId: (m as any).fileId });
  for (const m of allData.csv.rowMarkers) out.push({ marker: m as unknown as BaseMarker, engineType: "csv", source: "csv-row", fileId: (m as any).fileId });
  for (const f of allData.audio.files) {
    for (const m of f.markers) out.push({ marker: m as unknown as BaseMarker, engineType: "audio", source: "audio", fileId: m.fileId });
  }
  for (const f of allData.video.files) {
    for (const m of f.markers) out.push({ marker: m as unknown as BaseMarker, engineType: "video", source: "video", fileId: m.fileId });
  }
  return out;
}

/** Local filter helper — paralelo a applyFilters mas opera em FlatMarker (preserva memo + relations completas). */
function applyMemoFilters(
  flat: FlatMarker[],
  filters: MemoViewFilters,
): FlatMarker[] {
  const groupMemberSet = filters.groupFilter ? new Set(filters.groupFilter.memberCodeIds) : null;
  return flat.filter(({ marker, source }) => {
    if (!filters.sources.includes(source)) return false;
    const codeIds = marker.codes.map((c: CodeApplication) => c.codeId);
    if (filters.codes.length > 0 && !codeIds.some((id) => filters.codes.includes(id))) return false;
    if (filters.excludeCodes.length > 0 && codeIds.every((id) => filters.excludeCodes.includes(id))) return false;
    if (groupMemberSet && !codeIds.some((id) => groupMemberSet.has(id))) return false;
    // caseVariableFilter: sem registry aqui, só validar shape (sem registry = sem variable check)
    return true;
  });
}

function nonEmpty(s: string | undefined | null): boolean {
  return !!s && s.trim().length > 0;
}

function computeCoverage(
  allData: AllEngineData,
  registry: CodeDefinitionRegistry,
  filteredFlat: FlatMarker[],
): CoverageStats {
  const allCodes = registry.getAll();
  const allGroups = registry.getAllGroups();

  let relationsTotal = 0;
  let relationsWithMemo = 0;
  for (const c of allCodes) {
    for (const r of c.relations ?? []) {
      relationsTotal++;
      if (nonEmpty(r.memo)) relationsWithMemo++;
    }
  }
  for (const { marker } of filteredFlat) {
    for (const ca of marker.codes ?? []) {
      for (const r of ca.relations ?? []) {
        relationsTotal++;
        if (nonEmpty(r.memo)) relationsWithMemo++;
      }
    }
  }

  return {
    codesTotal: allCodes.length,
    codesWithMemo: allCodes.filter((c) => nonEmpty(c.memo)).length,
    groupsTotal: allGroups.length,
    groupsWithMemo: allGroups.filter((g) => nonEmpty(g.memo)).length,
    relationsTotal,
    relationsWithMemo,
    markersTotal: filteredFlat.length,
    markersWithMemo: filteredFlat.filter(({ marker }) => nonEmpty(marker.memo)).length,
  };
}

function extractExcerpt(marker: BaseMarker, _source: SourceType): string {
  // Por engine: marker tem campos diferentes pra excerpt textual.
  // Generic fallback: tenta `text`, depois `excerpt`, senão "(no excerpt)".
  const m = marker as any;
  return m.text ?? m.excerpt ?? m.commentText ?? "(no excerpt)";
}

function buildByCode(
  registry: CodeDefinitionRegistry,
  filtered: FlatMarker[],
  filters: MemoViewFilters,
): CodeMemoSection[] {
  const allCodes = registry.getAll();
  const allFolderIds = new Set(registry.getAllFolders().map((f) => f.id));
  const expanded: ExpandedState = {
    codes: new Set(allCodes.map((c) => c.id)),
    folders: allFolderIds,
  };
  const flatNodes = buildFlatTree(registry, expanded);

  const acceptCode = (id: string) =>
    filters.codes.length === 0 || filters.codes.includes(id);

  // Primeira passada: monta sections candidatas + mapa childIds da hierarquia.
  const candidates = new Map<string, CodeMemoSection>();
  const childMap = new Map<string, string[]>();

  for (const node of flatNodes) {
    if (node.type !== "code") continue;
    const def = node.def;
    if (def.parentId) {
      const arr = childMap.get(def.parentId) ?? [];
      arr.push(def.id);
      childMap.set(def.parentId, arr);
    }

    const groupsForCode = registry.getGroupsForCode(def.id);
    const groupIds = groupsForCode.map((g) => g.id);
    const codeMemo = nonEmpty(def.memo) ? def.memo!.trim() : null;

    const groupMemos: MemoEntry[] = groupsForCode
      .filter((g) => nonEmpty(g.memo))
      .map((g) => ({ kind: "group" as const, groupId: g.id, groupName: g.name, color: g.color, memo: g.memo!.trim() }));

    const relationMemos: MemoEntry[] = [];
    for (const r of def.relations ?? []) {
      if (nonEmpty(r.memo)) {
        const target = registry.getById(r.target);
        relationMemos.push({
          kind: "relation",
          codeId: def.id,
          label: r.label,
          targetId: r.target,
          targetName: target?.name ?? r.target,
          directed: r.directed ?? true,
          memo: r.memo!.trim(),
          level: "code",
        });
      }
    }

    const markersForThisCode = filtered.filter(({ marker }) => {
      const surviving = marker.codes.find((c: CodeApplication) => acceptCode(c.codeId));
      return surviving?.codeId === def.id;
    });

    for (const fm of markersForThisCode) {
      for (const ca of fm.marker.codes) {
        if (ca.codeId !== def.id) continue;
        for (const r of ca.relations ?? []) {
          if (nonEmpty(r.memo)) {
            const target = registry.getById(r.target);
            relationMemos.push({
              kind: "relation",
              codeId: def.id,
              label: r.label,
              targetId: r.target,
              targetName: target?.name ?? r.target,
              directed: r.directed ?? true,
              memo: r.memo!.trim(),
              level: "application",
              markerId: fm.marker.id,
              engineType: fm.engineType,
            });
          }
        }
      }
    }

    const markerMemos: MemoEntry[] = markersForThisCode
      .filter(({ marker }) => nonEmpty(marker.memo))
      .map(({ marker, source, fileId }) => {
        const ca = marker.codes.find((c: CodeApplication) => c.codeId === def.id)!;
        return {
          kind: "marker" as const,
          markerId: marker.id,
          codeId: def.id,
          fileId,
          sourceType: (source.startsWith("csv") ? "csv" : source) as EngineType,
          excerpt: extractExcerpt(marker, source),
          memo: marker.memo!.trim(),
          magnitude: ca?.magnitude,
        };
      });

    const cm = filters.showTypes.code ? codeMemo : null;
    const gms = filters.showTypes.group ? groupMemos : [];
    const rms = filters.showTypes.relation ? relationMemos : [];
    const mms = filters.showTypes.marker ? markerMemos : [];

    const hasOwnMemo = !!cm || gms.length > 0 || rms.length > 0 || mms.length > 0;

    candidates.set(def.id, {
      codeId: def.id,
      codeName: def.name,
      color: def.color,
      depth: node.depth,
      groupIds,
      codeMemo: cm,
      groupMemos: gms,
      relationMemos: rms,
      markerMemos: mms,
      childIds: [],
      hasAnyMemoInSubtree: hasOwnMemo,
    });
  }

  // Popular childIds
  for (const [parentId, kids] of childMap) {
    if (candidates.has(parentId)) {
      candidates.get(parentId)!.childIds = kids;
    }
  }

  // DFS bottom-up: hasAnyMemoInSubtree propaga via filhos
  const reverseCodeNodes = flatNodes.filter((n) => n.type === "code").reverse();
  for (const node of reverseCodeNodes) {
    if (node.type !== "code") continue;
    const sec = candidates.get(node.def.id)!;
    for (const childId of sec.childIds) {
      const childSec = candidates.get(childId);
      if (childSec?.hasAnyMemoInSubtree) {
        sec.hasAnyMemoInSubtree = true;
      }
    }
  }

  // Filtrar: section incluída se tem memo próprio OU subtree tem memo
  const result: CodeMemoSection[] = [];
  for (const node of flatNodes) {
    if (node.type !== "code") continue;
    const sec = candidates.get(node.def.id)!;
    const hasOwnMemo = !!sec.codeMemo || sec.groupMemos.length > 0 || sec.relationMemos.length > 0 || sec.markerMemos.length > 0;
    if (hasOwnMemo || sec.hasAnyMemoInSubtree) {
      result.push(sec);
    }
  }
  return result;
}

function buildByFile(
  filtered: FlatMarker[],
  filters: MemoViewFilters,
): FileMemoSection[] {
  if (!filters.showTypes.marker) return [];
  const byFile = new Map<string, FlatMarker[]>();
  for (const fm of filtered) {
    const arr = byFile.get(fm.fileId) ?? [];
    arr.push(fm);
    byFile.set(fm.fileId, arr);
  }
  const sections: FileMemoSection[] = [];
  for (const [fileId, fms] of byFile) {
    const withMemo = fms.filter(({ marker }) => nonEmpty(marker.memo));
    if (withMemo.length === 0) continue;
    const codeIdsUsed = Array.from(new Set(fms.flatMap((fm) => fm.marker.codes.map((c: CodeApplication) => c.codeId))));
    sections.push({
      fileId,
      sourceType: fms[0]!.engineType,
      fileName: fileId, // displayName resolution fica pro render
      codeIdsUsed,
      markerMemos: withMemo.map(({ marker, source, fileId: fid }) => {
        const ca = marker.codes[0]!;
        return {
          kind: "marker" as const,
          markerId: marker.id,
          codeId: ca.codeId,
          fileId: fid,
          sourceType: (source.startsWith("csv") ? "csv" : source) as EngineType,
          excerpt: extractExcerpt(marker, source),
          memo: marker.memo!.trim(),
          magnitude: ca.magnitude,
        };
      }),
    });
  }
  sections.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return sections;
}

export function aggregateMemos(
  allData: AllEngineData,
  registry: CodeDefinitionRegistry,
  filters: MemoViewFilters,
): MemoViewResult {
  const flat = flattenMarkers(allData);
  const filtered = applyMemoFilters(flat, filters);
  const coverage = computeCoverage(allData, registry, filtered);

  return {
    groupBy: filters.groupBy,
    coverage,
    byCode: filters.groupBy === "code" ? buildByCode(registry, filtered, filters) : undefined,
    byFile: filters.groupBy === "file" ? buildByFile(filtered, filters) : undefined,
  };
}
