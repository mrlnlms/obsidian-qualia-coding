
import type {
  SourceType,
  UnifiedMarker,
  UnifiedCode,
  ConsolidatedData,
  EngineType,
} from "./dataTypes";
import type { Marker } from "../../markdown/models/codeMarkerModel";
import type { SegmentMarker, RowMarker } from "../../csv/csvCodingTypes";
import type { ImageMarker } from "../../image/imageCodingTypes";
import type { PdfMarker, PdfShapeMarker } from "../../pdf/pdfCodingTypes";
import type { AudioFile } from "../../audio/audioCodingTypes";
import type { VideoFile } from "../../video/videoCodingTypes";
import type { CodeDefinition } from "../../core/types";

export interface MarkdownEngineData {
  markers: Record<string, Marker[]>;
  codeDefinitions?: Record<string, CodeDefinition>;
}

export interface CsvEngineData {
  segmentMarkers: SegmentMarker[];
  rowMarkers: RowMarker[];
  registry?: { definitions: Record<string, CodeDefinition> };
}

export interface ImageEngineData {
  markers: ImageMarker[];
  registry?: { definitions: Record<string, CodeDefinition> };
}

export interface PdfEngineData {
  markers: PdfMarker[];
  shapes?: PdfShapeMarker[];
  registry?: { definitions: Record<string, CodeDefinition> };
}

export interface AudioEngineData {
  files: AudioFile[];
  codeDefinitions?: { definitions: Record<string, CodeDefinition> };
}

export interface VideoEngineData {
  files: VideoFile[];
  codeDefinitions?: { definitions: Record<string, CodeDefinition> };
}

export interface EngineSlice {
  markers: UnifiedMarker[];
  hasData: boolean;
}

// ── Per-engine consolidation functions ──

export function consolidateMarkdown(data: MarkdownEngineData | null): EngineSlice {
  const hasData = data?.markers != null;
  const markers: UnifiedMarker[] = [];
  if (hasData) {
    const mdMarkers = data.markers;
    for (const [fileId, fileMarkers] of Object.entries(mdMarkers)) {
      if (!Array.isArray(fileMarkers)) continue;
      for (const m of fileMarkers) {
        const codes = extractCodes(m.codes);
        if (codes.length === 0) continue;
        const meta: NonNullable<UnifiedMarker["meta"]> = {};
        if (m.range?.from?.line != null) meta.fromLine = m.range.from.line;
        if (m.range?.to?.line != null) meta.toLine = m.range.to.line;
        if (m.range?.from?.ch != null) meta.fromCh = m.range.from.ch;
        if (m.range?.to?.ch != null) meta.toCh = m.range.to.ch;
        if (m.createdAt != null) meta.createdAt = m.createdAt;
        markers.push({
          id: m.id ?? "",
          source: "markdown",
          fileId: m.fileId ?? fileId,
          codes,
          ...(Object.keys(meta).length > 0 ? { meta } : {}),
        });
      }
    }
  }
  return { markers, hasData };
}

export function consolidateCsv(data: CsvEngineData | null): EngineSlice {
  const hasData = data?.segmentMarkers != null || data?.rowMarkers != null;
  const markers: UnifiedMarker[] = [];
  if (hasData) {
    // Segment markers
    if (Array.isArray(data.segmentMarkers)) {
      for (const m of data.segmentMarkers) {
        const codes = extractCodes(m.codes);
        if (codes.length === 0) continue;
        markers.push({
          id: m.id ?? "",
          source: "csv-segment",
          fileId: m.fileId ?? "",
          codes,
          // External meta keys (`row`, `fromLine`, `toLine`) preserved per Fase 0 spec §9 decision #2;
          // value source switched to m.sourceRowId to match the renamed marker schema.
          meta: {
            row: m.sourceRowId, column: m.column, fromLine: m.sourceRowId, toLine: m.sourceRowId,
            ...(m.from != null ? { fromCh: m.from } : {}),
            ...(m.to != null ? { toCh: m.to } : {}),
            ...(m.createdAt != null ? { createdAt: m.createdAt } : {}),
          },
        });
      }
    }
    // Row markers
    if (Array.isArray(data.rowMarkers)) {
      for (const m of data.rowMarkers) {
        const codes = extractCodes(m.codes);
        if (codes.length === 0) continue;
        markers.push({
          id: m.id ?? "",
          source: "csv-row",
          fileId: m.fileId ?? "",
          codes,
          meta: { row: m.sourceRowId, column: m.column, fromLine: m.sourceRowId, toLine: m.sourceRowId, ...(m.createdAt != null ? { createdAt: m.createdAt } : {}) },
        });
      }
    }
  }
  return { markers, hasData };
}

export function consolidateImage(data: ImageEngineData | null): EngineSlice {
  const hasData = Array.isArray(data?.markers);
  const markers: UnifiedMarker[] = [];
  if (hasData) {
    for (const m of data!.markers) {
      const codes = extractCodes(m.codes);
      if (codes.length === 0) continue;
      const imgMeta: NonNullable<UnifiedMarker["meta"]> = { regionType: m.shape };
      if (m.coords?.type === 'rect') {
        imgMeta.fromLine = m.coords.y;
        imgMeta.toLine = m.coords.y + (m.coords.h ?? 0);
      }
      if (m.createdAt != null) imgMeta.createdAt = m.createdAt;
      markers.push({
        id: m.id ?? "",
        source: "image",
        fileId: m.fileId ?? "",
        codes,
        meta: imgMeta,
      });
    }
  }
  return { markers, hasData };
}

export function consolidatePdf(data: PdfEngineData | null): EngineSlice {
  const hasData = Array.isArray(data?.markers);
  const markers: UnifiedMarker[] = [];
  if (hasData) {
    for (const m of data!.markers) {
      const codes = extractCodes(m.codes);
      if (codes.length === 0) continue;
      markers.push({
        id: m.id ?? "",
        source: "pdf",
        fileId: m.fileId ?? "",
        codes,
        meta: {
          page: m.page,
          fromLine: m.page,
          toLine: m.page,
          pdfText: m.text ?? "",
          ...(m.createdAt != null ? { createdAt: m.createdAt } : {}),
        },
      });
    }
    // PDF shapes (rectangle, ellipse, polygon region markers)
    if (Array.isArray(data!.shapes)) {
      for (const s of data!.shapes) {
        const codes = extractCodes(s.codes);
        if (codes.length === 0) continue;
        markers.push({
          id: s.id ?? "",
          source: "pdf",
          fileId: s.fileId ?? "",
          codes,
          meta: {
            page: s.page,
            fromLine: s.page,
            toLine: s.page,
            pdfText: `[${s.shape} region]`,
            ...(s.createdAt != null ? { createdAt: s.createdAt } : {}),
          },
        });
      }
    }
  }
  return { markers, hasData };
}

export function consolidateAudio(data: AudioEngineData | null): EngineSlice {
  const hasData = Array.isArray(data?.files);
  const markers: UnifiedMarker[] = [];
  if (hasData) {
    for (const af of data!.files) {
      for (const m of af.markers) {
        const codes = extractCodes(m.codes);
        if (codes.length === 0) continue;
        markers.push({
          id: m.id ?? "",
          source: "audio",
          fileId: af.path ?? "",
          codes,
          meta: {
            audioFrom: m.from,
            audioTo: m.to,
            ...(m.createdAt != null ? { createdAt: m.createdAt } : {}),
          },
        });
      }
    }
  }
  return { markers, hasData };
}

export function consolidateVideo(data: VideoEngineData | null): EngineSlice {
  const hasData = Array.isArray(data?.files);
  const markers: UnifiedMarker[] = [];
  if (hasData) {
    for (const vf of data!.files) {
      for (const m of vf.markers) {
        const codes = extractCodes(m.codes);
        if (codes.length === 0) continue;
        markers.push({
          id: m.id ?? "",
          source: "video",
          fileId: vf.path ?? "",
          codes,
          meta: {
            videoFrom: m.from,
            videoTo: m.to,
            ...(m.createdAt != null ? { createdAt: m.createdAt } : {}),
          },
        });
      }
    }
  }
  return { markers, hasData };
}

// ── Engine → SourceType mapping for definitions ──

const ENGINE_DEF_SOURCE: Record<EngineType, SourceType> = {
  markdown: "markdown",
  csv: "csv-segment",
  image: "image",
  pdf: "pdf",
  audio: "audio",
  video: "video",
};

// ── Code consolidation ──

export function consolidateCodes(
  allMarkers: UnifiedMarker[],
  definitions: Record<string, CodeDefinition>,
  activeEngines: EngineType[],
): UnifiedCode[] {
  // Index by id (post Phase C: markers reference codes by codeId, not name).
  const codeMap = new Map<string, { id: string; name: string; color: string; description?: string; sources: Set<SourceType> }>();

  // Loop 1: registered definitions go in by id.
  if (definitions) {
    for (const engine of activeEngines) {
      const source = ENGINE_DEF_SOURCE[engine];
      for (const def of Object.values(definitions)) {
        const existing = codeMap.get(def.id);
        if (existing) {
          existing.sources.add(source);
        } else {
          codeMap.set(def.id, {
            id: def.id,
            name: def.name,
            color: def.color ?? "#6200EE",
            description: def.description,
            sources: new Set([source]),
          });
        }
      }
    }
  }

  // Loop 2: discover orphan codes — markers referencing an id not in definitions.
  for (const m of allMarkers) {
    for (const codeId of m.codes) {
      const existing = codeMap.get(codeId);
      if (existing) {
        existing.sources.add(m.source);
      } else {
        codeMap.set(codeId, {
          id: codeId,
          name: codeId,  // orphan: no definition, fall back to codeId as display name
          color: "#6200EE",
          sources: new Set([m.source]),
        });
      }
    }
  }

  const codes: UnifiedCode[] = [];
  for (const info of codeMap.values()) {
    codes.push({
      id: info.id,
      name: info.name,
      color: info.color,
      description: info.description,
      sources: Array.from(info.sources),
    });
  }
  codes.sort((a, b) => a.name.localeCompare(b.name));

  return codes;
}

// ── Shared helper: find definitions from AllEngineData ──

/** Extract shared code definitions from any available engine in AllEngineData. */
export function findDefinitions(raw: {
  markdown?: { codeDefinitions?: Record<string, CodeDefinition> } | null;
  csv?: { registry?: { definitions: Record<string, CodeDefinition> } } | null;
  image?: { registry?: { definitions: Record<string, CodeDefinition> } } | null;
  pdf?: { registry?: { definitions: Record<string, CodeDefinition> } } | null;
  audio?: { codeDefinitions?: { definitions: Record<string, CodeDefinition> } } | null;
  video?: { codeDefinitions?: { definitions: Record<string, CodeDefinition> } } | null;
}): Record<string, CodeDefinition> {
  return raw.markdown?.codeDefinitions
    ?? raw.csv?.registry?.definitions
    ?? raw.image?.registry?.definitions
    ?? raw.pdf?.registry?.definitions
    ?? raw.audio?.codeDefinitions?.definitions
    ?? raw.video?.codeDefinitions?.definitions
    ?? {};
}

// ── Main consolidate (thin composition) ──

export function consolidate(
  markdownData: MarkdownEngineData | null,
  csvData: CsvEngineData | null,
  imageData: ImageEngineData | null,
  pdfData: PdfEngineData | null = null,
  audioData: AudioEngineData | null = null,
  videoData: VideoEngineData | null = null,
): ConsolidatedData {
  const md = consolidateMarkdown(markdownData);
  const csv = consolidateCsv(csvData);
  const img = consolidateImage(imageData);
  const pdf = consolidatePdf(pdfData);
  const aud = consolidateAudio(audioData);
  const vid = consolidateVideo(videoData);
  const markers = [...md.markers, ...csv.markers, ...img.markers, ...pdf.markers, ...aud.markers, ...vid.markers];

  const defs = findDefinitions({
    markdown: markdownData,
    csv: csvData,
    image: imageData,
    pdf: pdfData,
    audio: audioData,
    video: videoData,
  });

  const activeEngines: EngineType[] = [];
  if (md.hasData) activeEngines.push('markdown');
  if (csv.hasData) activeEngines.push('csv');
  if (img.hasData) activeEngines.push('image');
  if (pdf.hasData) activeEngines.push('pdf');
  if (aud.hasData) activeEngines.push('audio');
  if (vid.hasData) activeEngines.push('video');

  const codes = consolidateCodes(markers, defs, activeEngines);

  return {
    markers,
    codes,
    sources: {
      markdown: md.hasData,
      csv: csv.hasData,
      image: img.hasData,
      pdf: pdf.hasData,
      audio: aud.hasData,
      video: vid.hasData,
    },
    lastUpdated: Date.now(),
  };
}

export function extractCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is { codeId: string } => c != null && typeof c === "object" && "codeId" in c)
    .map((c) => c.codeId);
}

export function mergeDef(
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
