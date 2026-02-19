export type SourceType = "markdown" | "csv-segment" | "csv-row" | "image";

export interface UnifiedMarker {
  id: string;
  source: SourceType;
  file: string;
  codes: string[];
  meta?: {
    row?: number;
    column?: string;
    regionType?: string;
  };
}

export interface UnifiedCode {
  name: string;
  color: string;
  description?: string;
  sources: SourceType[];
}

export interface ConsolidatedData {
  markers: UnifiedMarker[];
  codes: UnifiedCode[];
  sources: {
    markdown: boolean;
    csv: boolean;
    image: boolean;
  };
  lastUpdated: number;
}

export interface FilterConfig {
  sources: SourceType[];
  codes: string[];
  excludeCodes: string[];
  minFrequency: number;
}

export interface FrequencyResult {
  code: string;
  color: string;
  total: number;
  bySource: Record<SourceType, number>;
  byFile: Record<string, number>;
}

export interface CooccurrenceResult {
  codes: string[];
  colors: string[];
  matrix: number[][];
  maxValue: number;
}
