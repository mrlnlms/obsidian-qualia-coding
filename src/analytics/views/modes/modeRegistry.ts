
import type { AnalyticsViewContext, ViewMode } from "../analyticsViewContext";
import type { FilterConfig } from "../../data/dataTypes";

// ─── Mode imports ───
import { renderDashboard } from "./dashboardMode";
import { renderFrequencyChart, renderSortSection, renderGroupSection, exportFrequencyCSV } from "./frequencyMode";
import { renderCooccurrenceMatrix, renderDisplaySection, renderCooccSortSection, exportCooccurrenceCSV } from "./cooccurrenceMode";
import { renderNetworkGraph, renderGraphOptionsSection, exportGraphCSV } from "./graphMode";
import { renderDocCodeMatrix, renderMatrixSortSection, exportDocMatrixCSV } from "./docMatrixMode";
import { renderEvolutionChart, renderEvolutionFileSection, exportEvolutionCSV } from "./evolutionMode";
import { renderTextRetrieval } from "./textRetrievalMode";
import { renderWordCloud, renderWordCloudOptionsSection, exportWordCloudCSV } from "./wordCloudMode";
import { renderACMBiplot, renderACMOptionsSection, exportACMCSV } from "./acmMode";
import { renderMDSMap, renderMDSOptionsSection, exportMDSCSV } from "./mdsMode";
import { renderTemporalChart, exportTemporalCSV } from "./temporalMode";
import { renderTextStats, exportTextStatsCSV } from "./textStatsMode";
import { renderDendrogramView, renderDendrogramOptionsSection, exportDendrogramCSV } from "./dendrogramMode";
import { renderLagSequential, renderLagOptionsSection, exportLagCSV } from "./lagSequentialMode";
import { renderPolarCoordinates, renderPolarOptionsSection, exportPolarCSV } from "./polarMode";
import { renderChiSquareView, renderChiSquareOptionsSection, exportChiSquareCSV } from "./chiSquareMode";
import { renderDecisionTreeView, renderDecisionTreeOptionsSection, exportDecisionTreeCSV } from "./decisionTreeMode";
import { renderSourceComparison, renderSourceComparisonOptionsSection, exportSourceComparisonCSV } from "./sourceComparisonMode";
import { renderOverlapMatrix, exportOverlapCSV } from "./overlapMode";
import { renderRelationsNetwork, renderRelationsNetworkOptions, exportRelationsNetworkCSV } from "./relationsNetworkMode";
import { renderCodeMetadataView, renderCodeMetadataOptionsSection, exportCodeMetadataCSV } from "./codeMetadataMode";
import { renderMemoView, renderMemoViewOptions } from "./memoView/memoViewMode";

export type ModeEntry = {
  label: string;
  render: (ctx: AnalyticsViewContext, filters: FilterConfig) => void;
  renderOptions?: (ctx: AnalyticsViewContext) => void;
  exportCSV?: (ctx: AnalyticsViewContext, date: string) => void;
  canExport?: boolean; // false = no PNG/Board export; default true
};

export const MODE_REGISTRY: Record<ViewMode, ModeEntry> = {
  "dashboard": {
    label: "Dashboard",
    render: renderDashboard,
    canExport: false,
  },
  "frequency": {
    label: "Frequency Bars",
    render: renderFrequencyChart,
    renderOptions: (ctx) => { renderSortSection(ctx); renderGroupSection(ctx); },
    exportCSV: exportFrequencyCSV,
  },
  "cooccurrence": {
    label: "Co-occurrence Matrix",
    render: renderCooccurrenceMatrix,
    renderOptions: (ctx) => { renderDisplaySection(ctx); renderCooccSortSection(ctx); },
    exportCSV: exportCooccurrenceCSV,
  },
  "graph": {
    label: "Network Graph",
    render: renderNetworkGraph,
    renderOptions: renderGraphOptionsSection,
    exportCSV: exportGraphCSV,
  },
  "doc-matrix": {
    label: "Document-Code Matrix",
    render: renderDocCodeMatrix,
    renderOptions: renderMatrixSortSection,
    exportCSV: exportDocMatrixCSV,
  },
  "evolution": {
    label: "Code Evolution",
    render: renderEvolutionChart,
    renderOptions: renderEvolutionFileSection,
    exportCSV: exportEvolutionCSV,
  },
  "text-retrieval": {
    label: "Text Retrieval",
    render: renderTextRetrieval,
    canExport: false,
  },
  "word-cloud": {
    label: "Word Cloud",
    render: renderWordCloud,
    renderOptions: renderWordCloudOptionsSection,
    exportCSV: exportWordCloudCSV,
  },
  "acm": {
    label: "MCA Biplot",
    render: renderACMBiplot,
    renderOptions: renderACMOptionsSection,
    exportCSV: exportACMCSV,
  },
  "mds": {
    label: "MDS Map",
    render: renderMDSMap,
    renderOptions: renderMDSOptionsSection,
    exportCSV: exportMDSCSV,
  },
  "temporal": {
    label: "Temporal Analysis",
    render: renderTemporalChart,
    exportCSV: exportTemporalCSV,
  },
  "text-stats": {
    label: "Text Statistics",
    render: renderTextStats,
    exportCSV: exportTextStatsCSV,
  },
  "dendrogram": {
    label: "Dendrogram",
    render: renderDendrogramView,
    renderOptions: renderDendrogramOptionsSection,
    exportCSV: exportDendrogramCSV,
  },
  "lag-sequential": {
    label: "Lag Sequential",
    render: renderLagSequential,
    renderOptions: renderLagOptionsSection,
    exportCSV: exportLagCSV,
  },
  "polar-coords": {
    label: "Polar Coordinates",
    render: renderPolarCoordinates,
    renderOptions: renderPolarOptionsSection,
    exportCSV: exportPolarCSV,
  },
  "chi-square": {
    label: "Chi-Square Tests",
    render: renderChiSquareView,
    renderOptions: renderChiSquareOptionsSection,
    exportCSV: exportChiSquareCSV,
  },
  "decision-tree": {
    label: "Decision Tree",
    render: renderDecisionTreeView,
    renderOptions: renderDecisionTreeOptionsSection,
    exportCSV: exportDecisionTreeCSV,
  },
  "source-comparison": {
    label: "Source Comparison",
    render: renderSourceComparison,
    renderOptions: renderSourceComparisonOptionsSection,
    exportCSV: exportSourceComparisonCSV,
  },
  "code-overlap": {
    label: "Code Overlap",
    render: renderOverlapMatrix,
    renderOptions: (ctx) => { renderDisplaySection(ctx); renderCooccSortSection(ctx); },
    exportCSV: exportOverlapCSV,
  },
  "relations-network": {
    label: "Relations Network",
    render: renderRelationsNetwork,
    renderOptions: renderRelationsNetworkOptions,
    exportCSV: exportRelationsNetworkCSV,
  },
  "code-metadata": {
    label: "Code × Metadata",
    render: renderCodeMetadataView,
    renderOptions: renderCodeMetadataOptionsSection,
    exportCSV: exportCodeMetadataCSV,
  },
  "memo-view": {
    label: "Memo View",
    render: renderMemoView,
    renderOptions: renderMemoViewOptions,
    canExport: false, // exports vêm em chunks 8 e 9
  },
};
