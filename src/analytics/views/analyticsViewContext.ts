
import type { AnalyticsPluginAPI } from "../index";
import type { ConsolidatedData, FilterConfig, SourceType } from "../data/dataTypes";
import type { ExtractedSegment } from "../data/textExtractor";
import type { StopWordsLang } from "../data/wordFrequency";
import type { MDSMode } from "../data/mdsEngine";

// ─── Type aliases (moved from analyticsView.ts) ───

export type ViewMode = "dashboard" | "frequency" | "cooccurrence" | "graph" | "doc-matrix" | "evolution" | "text-retrieval" | "word-cloud" | "acm" | "mds" | "temporal" | "text-stats" | "dendrogram" | "lag-sequential" | "polar-coords" | "chi-square" | "decision-tree" | "source-comparison" | "code-overlap" | "relations-network" | "code-metadata" | "memo-view";
export type SortMode = "alpha" | "freq-desc" | "freq-asc";
export type MatrixSortMode = "alpha" | "total";
export type GroupMode = "none" | "source" | "file";
export type DisplayMode = "absolute" | "percentage" | "jaccard" | "dice" | "presence";
export type CooccSortMode = "alpha" | "frequency" | "cluster";
export type CodeMetadataDisplay = "count" | "pct-row" | "pct-col";
export type CodeMetadataSortCol = "total" | "name" | "chi2" | "p";

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
  disabledCodes: Set<string>;
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
  dendrogramCutDistance: number;

  // Lag Sequential state
  lagValue: number;

  // Text Stats state
  tsSort: { col: string; asc: boolean };

  // Relations Network state
  relationsLevel: 'code' | 'both';
  relationsMinEdgeWeight: number;  // volátil, default 1

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

  // Code × Metadata state
  cmVariable: string | null;
  cmDisplay: CodeMetadataDisplay;
  cmHideMissing: boolean;
  cmSort: { col: CodeMetadataSortCol; asc: boolean };

  // Memo View state
  mvGroupBy: "code" | "file";
  mvShowTypes: { code: boolean; group: boolean; relation: boolean; marker: boolean };
  mvMarkerLimit: 5 | 10 | 25 | "all";
  mvExpanded: Set<string>; // codeIds com markers expandidos além do limit (volátil, por sessão)

  // Refresh suspend (5a)
  suspendRefresh(): void;
  resumeRefresh(): void;

  // Case variable filter state
  caseVariableFilter: { name: string; value: string } | null;

  // Group filter state (Tier 1.5 — single-select)
  groupFilter: string | null;

  // Text Retrieval state
  trSearch: string;
  trGroupBy: "code" | "file";
  trSegments: ExtractedSegment[];
  trCollapsed: Set<string>;
  trMarkerFilter: Set<string> | null;

  // Render generation — async modes check this to detect stale renders
  renderGeneration: number;

  // Active Chart.js instance — modes set this after creating a chart so it can be destroyed before the next render
  activeChartInstance: import("chart.js").Chart | null;

  // Methods exposed to mode modules
  buildFilterConfig(): FilterConfig;
  scheduleUpdate(): void;
  renderConfigPanel(): void;
  isRenderCurrent(generation: number): boolean;
}
