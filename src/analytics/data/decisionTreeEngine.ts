
/**
 * CHAID-style Decision Tree Engine.
 * Builds a classification tree using chi-square splitting on a binarized
 * Document-Code Matrix: one code is the outcome (dependent), all others
 * are predictors.
 */

import type { ConsolidatedData, FilterConfig, UnifiedMarker } from "./dataTypes";

// ── Types ──

export interface DecisionTreeNode {
  /** Unique node id */
  id: number;
  /** Total markers reaching this node */
  n: number;
  /** Markers where outcome = 1 (present) */
  nPositive: number;
  /** Markers where outcome = 0 (absent) */
  nNegative: number;
  /** Predicted class: the majority class */
  prediction: 0 | 1;
  /** Accuracy at this node = max(nPositive, nNegative) / n */
  accuracy: number;
  /** Number of correctly classified */
  correct: number;
  /** Number of errors */
  errors: number;
  /** Marker IDs at this node (leaf nodes only) */
  markerIds: string[];
  /** Split info (null for leaf nodes) */
  split: {
    predictor: string;
    predictorColor: string;
    chiSquare: number;
    pValue: number;
  } | null;
  /** Children: index 0 = predictor absent, index 1 = predictor present */
  children: DecisionTreeNode[];
  /** Depth in tree */
  depth: number;
}

export interface DecisionTreeResult {
  outcomeCode: string;
  outcomeColor: string;
  root: DecisionTreeNode;
  /** Overall accuracy */
  accuracy: number;
  /** A priori rate: max(P(outcome=1), P(outcome=0)) */
  aPriori: number;
  /** Klecka's tau: (accuracy - aPriori) / (1 - aPriori) */
  tau: number;
  /** Total markers used */
  totalMarkers: number;
  /** All predictor codes used */
  predictors: string[];
  /** Leaf nodes with errors (for error analysis / text retrieval) */
  errorLeaves: Array<{
    nodeId: number;
    path: string;
    markerIds: string[];
    errors: number;
  }>;
}

// ── Chi-square helpers (reused from statsEngine pattern) ──

function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1 + sign * y);
}

function chiSquareSurvival(x: number, df: number): number {
  if (df <= 0 || x <= 0) return 1;
  const z = (Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normalCDF(z);
}

// ── Core algorithm ──

function applyFilters(data: ConsolidatedData, filters: FilterConfig): UnifiedMarker[] {
  return data.markers.filter((m) => {
    if (!filters.sources.includes(m.source)) return false;
    if (filters.codes.length > 0 && !m.codes.some((c) => filters.codes.includes(c))) return false;
    if (filters.excludeCodes.length > 0 && m.codes.every((c) => filters.excludeCodes.includes(c))) return false;
    return true;
  });
}

interface MarkerRow {
  id: string;
  outcome: 0 | 1;
  predictors: Map<string, 0 | 1>;
}

let nextNodeId = 0;

/**
 * Find the best chi-square split among available predictors.
 * Returns null if no significant split is found.
 */
function findBestSplit(
  rows: MarkerRow[],
  availablePredictors: string[],
  bonferroniK: number,
): { predictor: string; chiSquare: number; pValue: number } | null {
  const n = rows.length;
  if (n === 0) return null;

  let bestPredictor = "";
  let bestChi = 0;
  let bestP = 1;

  for (const pred of availablePredictors) {
    // 2×2 contingency table: [pred=0, pred=1] × [outcome=0, outcome=1]
    let a = 0, b = 0, c = 0, d = 0; // a=pred0&out0, b=pred0&out1, c=pred1&out0, d=pred1&out1
    for (const row of rows) {
      const pv = row.predictors.get(pred) ?? 0;
      if (pv === 0 && row.outcome === 0) a++;
      else if (pv === 0 && row.outcome === 1) b++;
      else if (pv === 1 && row.outcome === 0) c++;
      else d++;
    }

    // Need at least 1 in each column for a meaningful split
    if ((a + b) === 0 || (c + d) === 0) continue;

    // Chi-square for 2×2 table
    const rowSums = [a + b, c + d];
    const colSums = [a + c, b + d];
    const cells = [[a, b], [c, d]];
    let chi = 0;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const exp = (rowSums[i]! * colSums[j]!) / n;
        if (exp > 0) chi += ((cells[i]![j]! - exp) ** 2) / exp;
      }
    }

    // Bonferroni-adjusted p-value
    const rawP = chiSquareSurvival(chi, 1);
    const adjP = Math.min(rawP * bonferroniK, 1);

    if (adjP < bestP) {
      bestP = adjP;
      bestChi = chi;
      bestPredictor = pred;
    }
  }

  if (bestP >= 0.05 || !bestPredictor) return null;
  return { predictor: bestPredictor, chiSquare: Math.round(bestChi * 1000) / 1000, pValue: Math.round(bestP * 10000) / 10000 };
}

/**
 * Recursively build the tree.
 */
function buildNode(
  rows: MarkerRow[],
  availablePredictors: string[],
  codeColors: Map<string, string>,
  depth: number,
  maxDepth: number,
  minNodeSize: number,
  path: string,
  errorLeaves: DecisionTreeResult["errorLeaves"],
): DecisionTreeNode {
  const id = nextNodeId++;
  const n = rows.length;
  const nPositive = rows.filter((r) => r.outcome === 1).length;
  const nNegative = n - nPositive;
  const prediction: 0 | 1 = nPositive >= nNegative ? 1 : 0;
  const correct = prediction === 1 ? nPositive : nNegative;
  const errors = n - correct;
  const accuracy = n > 0 ? Math.round((correct / n) * 1000) / 1000 : 0;

  const makeLeaf = (): DecisionTreeNode => {
    const markerIds = rows.map((r) => r.id);
    if (errors > 0) {
      const errorIds = rows.filter((r) => r.outcome !== prediction).map((r) => r.id);
      errorLeaves.push({ nodeId: id, path, markerIds: errorIds, errors });
    }
    return { id, n, nPositive, nNegative, prediction, accuracy, correct, errors, markerIds, split: null, children: [], depth };
  };

  // Stop conditions
  if (depth >= maxDepth) return makeLeaf();
  if (n < minNodeSize * 2) return makeLeaf();
  if (nPositive === 0 || nNegative === 0) return makeLeaf(); // pure node
  if (availablePredictors.length === 0) return makeLeaf();

  const split = findBestSplit(rows, availablePredictors, availablePredictors.length);
  if (!split) return makeLeaf();

  // Split rows
  const rowsAbsent = rows.filter((r) => (r.predictors.get(split.predictor) ?? 0) === 0);
  const rowsPresent = rows.filter((r) => (r.predictors.get(split.predictor) ?? 0) === 1);

  // Don't split if either child is too small
  if (rowsAbsent.length < minNodeSize || rowsPresent.length < minNodeSize) return makeLeaf();

  const remainingPredictors = availablePredictors.filter((p) => p !== split.predictor);

  const leftChild = buildNode(
    rowsAbsent, remainingPredictors, codeColors, depth + 1, maxDepth, minNodeSize,
    `${path} → ${split.predictor}=0`, errorLeaves,
  );
  const rightChild = buildNode(
    rowsPresent, remainingPredictors, codeColors, depth + 1, maxDepth, minNodeSize,
    `${path} → ${split.predictor}=1`, errorLeaves,
  );

  return {
    id, n, nPositive, nNegative, prediction, accuracy, correct, errors,
    markerIds: [],
    split: { ...split, predictorColor: codeColors.get(split.predictor) ?? "#6200EE" },
    children: [leftChild, rightChild],
    depth,
  };
}

/**
 * Build a CHAID-style decision tree.
 *
 * @param data - Consolidated analytics data
 * @param filters - Active filter config
 * @param outcomeCode - The code to predict (dependent variable)
 * @param maxDepth - Maximum tree depth (default 4)
 * @param minNodeSize - Minimum markers per leaf (default 5)
 */
export function buildDecisionTree(
  data: ConsolidatedData,
  filters: FilterConfig,
  outcomeCode: string,
  maxDepth = 4,
  minNodeSize = 5,
): DecisionTreeResult {
  nextNodeId = 0;

  const markers = applyFilters(data, filters);
  const codeColors = new Map(data.codes.map((c) => [c.name, c.color]));

  // Collect valid predictor codes (exclude outcome, respect filters)
  const codeFreq = new Map<string, number>();
  for (const m of markers) {
    for (const code of m.codes) {
      if (code === outcomeCode) continue;
      if (filters.excludeCodes.includes(code)) continue;
      if (filters.codes.length > 0 && !filters.codes.includes(code)) continue;
      codeFreq.set(code, (codeFreq.get(code) ?? 0) + 1);
    }
  }

  const predictors: string[] = [];
  for (const [code, count] of codeFreq) {
    if (count >= filters.minFrequency) predictors.push(code);
  }
  predictors.sort();

  // Build binarized rows: each marker → outcome (0/1) + predictor values (0/1)
  const rows: MarkerRow[] = markers.map((m) => ({
    id: m.id,
    outcome: m.codes.includes(outcomeCode) ? 1 as const : 0 as const,
    predictors: new Map(predictors.map((p) => [p, m.codes.includes(p) ? 1 as const : 0 as const])),
  }));

  const totalMarkers = rows.length;
  const nPositive = rows.filter((r) => r.outcome === 1).length;
  const aPriori = totalMarkers > 0 ? Math.round((Math.max(nPositive, totalMarkers - nPositive) / totalMarkers) * 1000) / 1000 : 0;

  const errorLeaves: DecisionTreeResult["errorLeaves"] = [];
  const root = buildNode(rows, predictors, codeColors, 0, maxDepth, minNodeSize, "Root", errorLeaves);

  // Calculate overall accuracy from leaf nodes
  let totalCorrect = 0;
  let totalN = 0;
  function sumLeaves(node: DecisionTreeNode): void {
    if (node.children.length === 0) {
      totalCorrect += node.correct;
      totalN += node.n;
    } else {
      for (const child of node.children) sumLeaves(child);
    }
  }
  sumLeaves(root);

  const accuracy = totalN > 0 ? Math.round((totalCorrect / totalN) * 1000) / 1000 : 0;
  const tau = aPriori < 1 ? Math.round(((accuracy - aPriori) / (1 - aPriori)) * 1000) / 1000 : 0;

  return {
    outcomeCode,
    outcomeColor: codeColors.get(outcomeCode) ?? "#6200EE",
    root,
    accuracy,
    aPriori,
    tau,
    totalMarkers,
    predictors,
    errorLeaves,
  };
}
