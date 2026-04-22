
export type SourceType = "markdown" | "csv-segment" | "csv-row" | "image" | "pdf" | "audio" | "video";

/** The 6 consolidator inputs. Distinct from SourceType (7 members: csv splits into csv-segment + csv-row). */
export type EngineType = "markdown" | "csv" | "image" | "pdf" | "audio" | "video";

export interface UnifiedMarker {
  id: string;
  source: SourceType;
  fileId: string;
  codes: string[];
  meta?: {
    row?: number;
    column?: string;
    regionType?: string;
    fromLine?: number;
    toLine?: number;
    fromCh?: number;
    toCh?: number;
    page?: number;
    pdfText?: string;
    audioFrom?: number;
    audioTo?: number;
    videoFrom?: number;
    videoTo?: number;
    createdAt?: number;
  };
}

export interface UnifiedCode {
  /**
   * Stable codeId. Markers reference codes by id (post Phase C migration).
   * Stats engines should index by id; UI displays `name`.
   * Falls back to the orphan id when a marker references a codeId with no matching definition.
   */
  id: string;
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
    pdf: boolean;
    audio: boolean;
    video: boolean;
  };
  lastUpdated: number;
}

export interface FilterConfig {
  sources: SourceType[];
  codes: string[];
  excludeCodes: string[];
  minFrequency: number;
  /** Filter markers to files whose case variable has this value. Requires registry passed to applyFilters. */
  caseVariableFilter?: { name: string; value: string };
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

export interface DocCodeMatrixResult {
  files: string[];
  codes: string[];
  colors: string[];
  matrix: number[][];
  maxValue: number;
}

export interface EvolutionResult {
  codes: string[];
  colors: string[];
  points: Array<{
    code: string;
    color: string;
    fileId: string;
    position: number;
    fromLine: number;
    toLine: number;
    markerId: string;
  }>;
  files: string[];
}

export interface TextStatsCodeEntry {
  code: string;
  color: string;
  segmentCount: number;
  totalWords: number;
  uniqueWords: number;
  avgWordsPerSegment: number;
  ttr: number;
  avgCharsPerSegment: number;
}

export interface TextStatsResult {
  codes: TextStatsCodeEntry[];
  global: {
    totalSegments: number;
    totalWords: number;
    uniqueWords: number;
    ttr: number;
  };
}

export interface LagResult {
  codes: string[];
  colors: string[];
  lag: number;
  transitions: number[][];
  expected: number[][];
  zScores: number[][];
  totalTransitions: number;
}

export interface PolarVector {
  code: string;
  color: string;
  zProspective: number;
  zRetrospective: number;
  radius: number;
  angle: number;
  quadrant: 1 | 2 | 3 | 4;
  significant: boolean;
}

export interface PolarCoordResult {
  focalCode: string;
  focalColor: string;
  vectors: PolarVector[];
  maxLag: number;
}

export interface ChiSquareEntry {
  code: string;
  color: string;
  chiSquare: number;
  df: number;
  pValue: number;
  cramersV: number;
  significant: boolean;
  observed: number[][];
  expected: number[][];
}

export interface ChiSquareResult {
  groupBy: "source" | "file";
  categories: string[];
  entries: ChiSquareEntry[];
}

export interface SourceComparisonEntry {
  code: string;
  color: string;
  total: number;
  bySource: Record<SourceType, number>;
  bySourcePctOfCode: Record<SourceType, number>;
  bySourcePctOfSrc: Record<SourceType, number>;
}

export interface SourceComparisonResult {
  codes: string[];
  colors: string[];
  activeSources: SourceType[];
  sourceTotals: Record<SourceType, number>;
  entries: SourceComparisonEntry[];
}

export interface OverlapResult {
  codes: string[];
  colors: string[];
  matrix: number[][];
  maxValue: number;
  totalPairsChecked: number;
  skippedSources: SourceType[];
}

export interface TemporalResult {
  codes: string[];
  colors: string[];
  series: Array<{
    code: string;
    color: string;
    points: Array<{ date: number; count: number }>;
  }>;
  dateRange: [number, number];
}
