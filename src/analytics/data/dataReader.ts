import type { DataManager } from "../../core/dataManager";
import type { CodeDefinition } from "../../core/types";
import type { Marker } from "../../markdown/models/codeMarkerModel";
import type { CodeMarkerSettings } from "../../markdown/models/settings";
import type { SegmentMarker, RowMarker } from "../../csv/csvCodingTypes";
import type { ImageMarker } from "../../image/imageCodingTypes";
import type { PdfMarker, PdfShapeMarker } from "../../pdf/pdfCodingTypes";
import type { AudioFile } from "../../audio/audioCodingTypes";
import type { VideoFile } from "../../video/videoCodingTypes";

export interface AllEngineData {
  markdown: { markers: Record<string, Marker[]>; settings: CodeMarkerSettings; codeDefinitions: Record<string, CodeDefinition> };
  csv: { segmentMarkers: SegmentMarker[]; rowMarkers: RowMarker[]; registry: { definitions: Record<string, CodeDefinition> } };
  image: { markers: ImageMarker[]; settings: { autoOpenImages: boolean; fileStates: Record<string, { zoom: number; panX: number; panY: number }> }; registry: { definitions: Record<string, CodeDefinition> } };
  pdf: { markers: PdfMarker[]; shapes: PdfShapeMarker[]; registry: { definitions: Record<string, CodeDefinition> } };
  audio: { files: AudioFile[]; settings: unknown; codeDefinitions: { definitions: Record<string, CodeDefinition> } };
  video: { files: VideoFile[]; settings: unknown; codeDefinitions: { definitions: Record<string, CodeDefinition> } };
}

/**
 * Reads all engine data from the unified DataManager (in-memory).
 * Injects the shared registry so the consolidator can discover code definitions.
 */
export function readAllData(dm: DataManager): AllEngineData {
  const registry = dm.section("registry");
  const defs = registry.definitions ?? {};

  return {
    markdown: {
      ...dm.section("markdown"),
      codeDefinitions: defs,
    },
    csv: {
      ...dm.section("csv"),
      registry: { definitions: defs },
    },
    image: {
      ...dm.section("image"),
      registry: { definitions: defs },
    },
    pdf: {
      ...dm.section("pdf"),
      registry: { definitions: defs },
    },
    audio: {
      ...dm.section("audio"),
      codeDefinitions: { definitions: defs },
    },
    video: {
      ...dm.section("video"),
      codeDefinitions: { definitions: defs },
    },
  };
}
