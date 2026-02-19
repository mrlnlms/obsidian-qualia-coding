import type {
  SourceType,
  UnifiedMarker,
  UnifiedCode,
  ConsolidatedData,
} from "./dataTypes";

export function consolidate(
  markdownData: any | null,
  csvData: any | null,
  imageData: any | null
): ConsolidatedData {
  const markers: UnifiedMarker[] = [];
  const codeMap = new Map<string, { color: string; description?: string; sources: Set<SourceType> }>();

  // ── Markdown ──
  const hasMd = markdownData?.markers != null;
  if (hasMd) {
    const mdMarkers = markdownData.markers as Record<string, any[]>;
    for (const [fileId, fileMarkers] of Object.entries(mdMarkers)) {
      if (!Array.isArray(fileMarkers)) continue;
      for (const m of fileMarkers) {
        const codes = extractCodes(m.codes);
        if (codes.length === 0) continue;
        const meta: any = {};
        if (m.range?.from?.line != null) meta.fromLine = m.range.from.line;
        if (m.range?.to?.line != null) meta.toLine = m.range.to.line;
        markers.push({
          id: m.id ?? "",
          source: "markdown",
          file: m.fileId ?? fileId,
          codes,
          ...(meta.fromLine != null ? { meta } : {}),
        });
      }
    }
    // Code definitions
    if (markdownData.codeDefinitions) {
      for (const def of Object.values(markdownData.codeDefinitions) as any[]) {
        mergeDef(codeMap, def.name, def.color, def.description, "markdown");
      }
    }
  }

  // ── CSV ──
  const hasCsv = csvData?.segmentMarkers != null || csvData?.rowMarkers != null;
  if (hasCsv) {
    // Segment markers
    if (Array.isArray(csvData.segmentMarkers)) {
      for (const m of csvData.segmentMarkers) {
        const codes = extractCodes(m.codes);
        if (codes.length === 0) continue;
        markers.push({
          id: m.id ?? "",
          source: "csv-segment",
          file: m.file ?? "",
          codes,
          meta: { row: m.row, column: m.column, fromLine: m.row, toLine: m.row },
        });
      }
    }
    // Row markers
    if (Array.isArray(csvData.rowMarkers)) {
      for (const m of csvData.rowMarkers) {
        const codes = extractCodes(m.codes);
        if (codes.length === 0) continue;
        markers.push({
          id: m.id ?? "",
          source: "csv-row",
          file: m.file ?? "",
          codes,
          meta: { row: m.row, column: m.column, fromLine: m.row, toLine: m.row },
        });
      }
    }
    // Registry
    const csvDefs = csvData.registry?.definitions;
    if (csvDefs) {
      for (const def of Object.values(csvDefs) as any[]) {
        mergeDef(codeMap, def.name, def.color, def.description, "csv-segment");
      }
    }
  }

  // ── Image ──
  const hasImg = Array.isArray(imageData?.markers);
  if (hasImg) {
    for (const m of imageData.markers) {
      const codes = extractCodes(m.codes);
      if (codes.length === 0) continue;
      const imgMeta: any = { regionType: m.shape };
      if (m.coords?.y != null) {
        imgMeta.fromLine = m.coords.y;
        imgMeta.toLine = m.coords.y + (m.coords.height ?? 0);
      }
      markers.push({
        id: m.id ?? "",
        source: "image",
        file: m.file ?? "",
        codes,
        meta: imgMeta,
      });
    }
    const imgDefs = imageData.registry?.definitions;
    if (imgDefs) {
      for (const def of Object.values(imgDefs) as any[]) {
        mergeDef(codeMap, def.name, def.color, def.description, "image");
      }
    }
  }

  // Also discover codes that appear in markers but not in definitions
  for (const m of markers) {
    for (const code of m.codes) {
      if (!codeMap.has(code)) {
        codeMap.set(code, { color: "#6200EE", sources: new Set([m.source]) });
      } else {
        codeMap.get(code)!.sources.add(m.source);
      }
    }
  }

  const codes: UnifiedCode[] = [];
  for (const [name, info] of codeMap) {
    codes.push({
      name,
      color: info.color,
      description: info.description,
      sources: Array.from(info.sources),
    });
  }
  codes.sort((a, b) => a.name.localeCompare(b.name));

  return {
    markers,
    codes,
    sources: {
      markdown: hasMd,
      csv: hasCsv,
      image: hasImg,
    },
    lastUpdated: Date.now(),
  };
}

function extractCodes(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    // Could be string[] or {name: string}[]
    return raw.map((c) => (typeof c === "string" ? c : c?.name ?? "")).filter(Boolean);
  }
  return [];
}

function mergeDef(
  map: Map<string, { color: string; description?: string; sources: Set<SourceType> }>,
  name: string,
  color: string,
  description: string | undefined,
  source: SourceType
): void {
  if (!name) return;
  const existing = map.get(name);
  if (existing) {
    existing.sources.add(source);
  } else {
    map.set(name, {
      color: color ?? "#6200EE",
      description,
      sources: new Set([source]),
    });
  }
}
