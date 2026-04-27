import type { MarkerType } from "../../core/types";

export type SourceType = "markdown" | "csv-segment" | "csv-row" | "image" | "pdf" | "audio" | "video";

/** The 6 consolidator inputs. Distinct from SourceType (7 members: csv splits into csv-segment + csv-row). */
export type EngineType = MarkerType;

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
  /** Filter markers to codes that are members of this group. memberCodeIds pre-computed in buildFilterConfig. */
  groupFilter?: { groupId: string; memberCodeIds: string[] };
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

// ─── Memo View ──────────────────────────────────────────────────

export interface MemoViewFilters extends FilterConfig {
  showTypes: { code: boolean; group: boolean; relation: boolean; marker: boolean };
  groupBy: "code" | "file";
  markerLimit: 5 | 10 | 25 | "all"; // aggregate ignora; render usa
}

export interface CoverageStats {
  codesWithMemo: number;
  codesTotal: number;
  groupsWithMemo: number;
  groupsTotal: number;
  relationsWithMemo: number;
  relationsTotal: number;
  markersWithMemo: number;
  markersTotal: number;
}

export type MemoEntry =
  // kind="code" is schema-reserved — current aggregator stores code memos directly on CodeMemoSection.codeMemo,
  // but exporters (CSV/Markdown chunks) may construct kind="code" entries when normalizing all memos to a flat list.
  | {
      kind: "code";
      codeId: string;
      codeName: string;
      color: string;
      memo: string;
      depth: number;
    }
  | {
      kind: "group";
      groupId: string;
      groupName: string;
      color: string;
      memo: string;
    }
  | {
      kind: "relation";
      codeId: string;
      label: string;
      targetId: string;
      targetName: string;
      directed: boolean;
      memo: string;
      level: "code" | "application";
      markerId?: string; // só quando level === "application"
      engineType?: EngineType; // só quando level === "application" — necessário pra onSaveAppRelationMemo encontrar marker
    }
  | {
      kind: "marker";
      markerId: string;
      codeId: string;
      fileId: string;
      sourceType: EngineType;
      excerpt: string;
      memo: string;
      magnitude?: string | number;
    };

export interface CodeMemoSection {
  codeId: string;
  codeName: string;
  color: string;
  depth: number;
  groupIds: string[];
  codeMemo: string | null;
  groupMemos: MemoEntry[]; // kind="group"
  relationMemos: MemoEntry[]; // kind="relation"
  markerMemos: MemoEntry[]; // kind="marker"
  childIds: string[];
  hasAnyMemoInSubtree: boolean;
}

export interface FileMemoSection {
  fileId: string;
  sourceType: EngineType;
  fileName: string;
  markerMemos: MemoEntry[];
  codeIdsUsed: string[];
}

export interface MemoViewResult {
  groupBy: "code" | "file";
  byCode?: CodeMemoSection[];
  byFile?: FileMemoSection[];
  coverage: CoverageStats;
}

/**
 * Per-code chi² stats. `null` quando inválido (variável multitext, ou df=0 por
 * cardinalidade da variável < 2).
 */
export interface CodeMetadataStat {
  chiSquare: number;
  df: number;
  pValue: number;
  cramersV: number;
  significant: boolean;
}

export interface CodeMetadataResult {
  codes: Array<{ id: string; name: string; color: string }>;
  /** Categorias finais (binadas se number/date; "(missing)" no fim opcional). */
  values: string[];
  /** Matrix [code × value] = contagem. */
  matrix: number[][];
  /** Por código. */
  rowTotals: number[];
  /** Por valor. */
  colTotals: number[];
  grandTotal: number;
  hasMissingColumn: boolean;
  /** Tipo da variável usado pra decidir binning/explosão. */
  variableType: "text" | "multitext" | "number" | "checkbox" | "date" | "datetime";
  /** True quando `variableType === 'multitext'` — chi² inválido por sobreposição de categorias. */
  isMultitext: boolean;
  /** Por código. null se isMultitext, ou df=0. */
  stats: Array<CodeMetadataStat | null>;
}
