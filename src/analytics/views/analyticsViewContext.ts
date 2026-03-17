
import type { AnalyticsPluginAPI } from "../index";
import type { ConsolidatedData, FilterConfig, SourceType } from "../data/dataTypes";
import type { ExtractedSegment } from "../data/textExtractor";
import type { StopWordsLang } from "../data/wordFrequency";
import type { MDSMode } from "../data/mdsEngine";

// ─── Type aliases (moved from analyticsView.ts) ───

export type ViewMode = "dashboard" | "frequency" | "cooccurrence" | "graph" | "doc-matrix" | "evolution" | "text-retrieval" | "word-cloud" | "acm" | "mds" | "temporal" | "text-stats" | "dendrogram" | "lag-sequential" | "polar-coords" | "chi-square" | "decision-tree" | "source-comparison" | "code-overlap";
export type SortMode = "alpha" | "freq-desc" | "freq-asc";
export type MatrixSortMode = "alpha" | "total";
export type GroupMode = "none" | "source" | "file";
export type DisplayMode = "absolute" | "percentage" | "jaccard" | "dice" | "presence";
export type CooccSortMode = "alpha" | "frequency" | "cluster";

// ─── Context interface ───
// Mode modules receive this instead of `this` — keeps them decoupled from the class.

export interface AnalyticsViewContext {
  readonly plugin: AnalyticsPluginAPI;
  data: ConsolidatedData | null;

  // DOM refs
  chartContainer: HTMLElement | null;
  configPanelEl: HTMLElement | null;
  footerEl: HTMLElement | null;

  // Config state
  viewMode: ViewMode;
  sortMode: SortMode;
  groupMode: GroupMode;
  displayMode: DisplayMode;
  showEdgeLabels: boolean;
  minEdgeWeight: number;
  enabledSources: Set<SourceType>;
  enabledCodes: Set<string>;
  minFrequency: number;
  codeSearch: string;
  matrixSortMode: MatrixSortMode;
  cooccSortMode: CooccSortMode;
  evolutionFile: string;

  // Word Cloud state
  wcStopWordsLang: StopWordsLang;
  wcMinWordLength: number;
  wcMaxWords: number;

  // ACM state
  acmShowMarkers: boolean;
  acmShowCodeLabels: boolean;

  // MDS state
  mdsMode: MDSMode;
  mdsShowLabels: boolean;

  // Dendrogram state
  dendrogramMode: "codes" | "files";
  dendrogramCutDistance: number;

  // Lag Sequential state
  lagValue: number;

  // Text Stats state
  tsSort: { col: string; asc: boolean };

  // Polar Coordinates state
  polarFocalCode: string;
  polarMaxLag: number;

  // Chi-Square state
  chiGroupBy: "source" | "file";
  chiSort: { col: string; asc: boolean };

  // Decision Tree state
  dtOutcomeCode: string;
  dtMaxDepth: number;

  // Source Comparison state
  srcCompSubView: "chart" | "table";
  srcCompDisplayMode: "count" | "percent-code" | "percent-source";
  srcCompSort: { col: string; asc: boolean };

  // Text Retrieval state
  trSearch: string;
  trGroupBy: "code" | "file";
  trSegments: ExtractedSegment[];
  trCollapsed: Set<string>;

  // Methods exposed to mode modules
  buildFilterConfig(): FilterConfig;
  scheduleUpdate(): void;
  renderConfigPanel(): void;
}
