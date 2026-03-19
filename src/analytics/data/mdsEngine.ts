
/**
 * Classical Multidimensional Scaling (MDS / Torgerson) engine.
 * Projects codes or files into 2D based on Jaccard distance,
 * using eigendecomposition of the double-centered distance matrix via SVD.
 */

import type { UnifiedMarker, UnifiedCode, SourceType } from "./dataTypes";

export type MDSMode = "codes" | "files";

export interface MDSPoint {
  name: string;
  color: string;
  x: number;
  y: number;
  size: number; // frequency / marker count for point scaling
}

export interface MDSResult {
  points: MDSPoint[];
  mode: MDSMode;
  stress: number; // Kruskal stress-1 (0 = perfect, < 0.1 good, < 0.2 acceptable)
  varianceExplained: [number, number]; // % dim 1, % dim 2
}

/**
 * Compute MDS from unified markers.
 * Returns null if insufficient data (< 3 entities).
 */
export async function calculateMDS(
  markers: UnifiedMarker[],
  codes: UnifiedCode[],
  mode: MDSMode,
  enabledSources: SourceType[],
): Promise<MDSResult | null> {
  const srcSet = new Set(enabledSources);
  const filtered = markers.filter((m) => srcSet.has(m.source));

  if (mode === "codes") {
    return computeCodesMDS(filtered, codes);
  } else {
    return computeFilesMDS(filtered, codes);
  }
}

// ── Codes mode ──

async function computeCodesMDS(
  markers: UnifiedMarker[],
  codes: UnifiedCode[],
): Promise<MDSResult | null> {
  // Build code → set of marker IDs
  const codeMarkers = new Map<string, Set<string>>();
  for (const m of markers) {
    for (const c of m.codes) {
      let s = codeMarkers.get(c);
      if (!s) { s = new Set(); codeMarkers.set(c, s); }
      s.add(m.id);
    }
  }

  // Only codes with at least 1 marker
  const activeCodes = codes.filter((c) => (codeMarkers.get(c.name)?.size ?? 0) > 0);
  if (activeCodes.length < 3) return null;

  const n = activeCodes.length;
  const names = activeCodes.map((c) => c.name);
  const colors = activeCodes.map((c) => c.color);
  const sizes = activeCodes.map((c) => codeMarkers.get(c.name)?.size ?? 0);

  // Jaccard distance matrix
  const D = buildJaccardDistanceMatrix(names.map((name) => codeMarkers.get(name)!));

  return runClassicalMDS(D, names, colors, sizes, "codes");
}

// ── Files mode ──

async function computeFilesMDS(
  markers: UnifiedMarker[],
  codes: UnifiedCode[],
): Promise<MDSResult | null> {
  // Build file → set of code names
  const fileCodes = new Map<string, Set<string>>();
  const fileMarkerCount = new Map<string, number>();
  for (const m of markers) {
    let s = fileCodes.get(m.fileId);
    if (!s) { s = new Set(); fileCodes.set(m.fileId, s); }
    for (const c of m.codes) s.add(c);
    fileMarkerCount.set(m.fileId, (fileMarkerCount.get(m.fileId) ?? 0) + 1);
  }

  const files = Array.from(fileCodes.keys());
  if (files.length < 3) return null;

  const n = files.length;
  const colors = files.map((_, i) => {
    const hue = (i * 137.5) % 360;
    return `hsl(${hue}, 60%, 55%)`;
  });
  const sizes = files.map((f) => fileMarkerCount.get(f) ?? 0);

  // Shorten file names for display
  const names = files.map((f) => {
    const parts = f.split("/");
    const name = parts[parts.length - 1];
    return name!.replace(/\.[^.]+$/, "");
  });

  const D = buildJaccardDistanceMatrix(files.map((f) => fileCodes.get(f)!));

  return runClassicalMDS(D, names, colors, sizes, "files");
}

// ── Shared utilities ──

function buildJaccardDistanceMatrix(sets: Set<string>[]): number[][] {
  const n = sets.length;
  const D: number[][] = [];
  for (let i = 0; i < n; i++) {
    D.push(new Array(n).fill(0));
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const si = sets[i]!;
      const sj = sets[j]!;
      let intersection = 0;
      for (const x of si) {
        if (sj.has(x)) intersection++;
      }
      const union = si.size + sj.size - intersection;
      const jaccard = union > 0 ? intersection / union : 0;
      const dist = 1 - jaccard;
      D[i]![j] = dist;
      D[j]![i] = dist;
    }
  }
  return D;
}

/**
 * Classical (Torgerson) MDS via eigendecomposition.
 *
 * 1. Square the distances: D²[i][j]
 * 2. Double centering: B = -0.5 * H * D² * H  where H = I - (1/n)*11'
 * 3. SVD of B → eigenvalues and eigenvectors
 * 4. Coordinates: X[i][k] = sqrt(λk) * v[i][k]
 * 5. Kruskal stress-1 for goodness of fit
 */
async function runClassicalMDS(
  D: number[][],
  names: string[],
  colors: string[],
  sizes: number[],
  mode: MDSMode,
): Promise<MDSResult | null> {
  const n = D.length;
  if (n < 3) return null;

  // 1. D² matrix
  const D2: number[][] = [];
  for (let i = 0; i < n; i++) {
    D2.push(D[i]!.map((d) => d * d));
  }

  // 2. Double centering: B = -0.5 * H * D² * H
  // H = I - (1/n) * 11'
  // B[i][j] = -0.5 * (D²[i][j] - rowMean[i] - colMean[j] + grandMean)
  const rowMeans: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += D2[i]![j]!;
    rowMeans.push(s / n);
  }

  const colMeans: number[] = [];
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += D2[i]![j]!;
    colMeans.push(s / n);
  }

  let grandMean = 0;
  for (let i = 0; i < n; i++) grandMean += rowMeans[i]!;
  grandMean /= n;

  const B: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      row.push(-0.5 * (D2[i]![j]! - rowMeans[i]! - colMeans[j]! + grandMean));
    }
    B.push(row);
  }

  // 3. SVD of B (B is symmetric, so u ≈ v)
  const { SVD } = await import("svd-js");
  const { u, q } = SVD(B);

  // Find first 2 positive eigenvalues (singular values of B = eigenvalues since B is PSD)
  const THRESHOLD = 1e-10;
  const dimIndices: number[] = [];
  for (let k = 0; k < q.length && dimIndices.length < 2; k++) {
    if (q[k]! > THRESHOLD) {
      dimIndices.push(k);
    }
  }
  if (dimIndices.length < 2) return null;

  const d1 = dimIndices[0]!;
  const d2 = dimIndices[1]!;

  // Variance explained
  const totalPositive = q.filter((v: number) => v > THRESHOLD).reduce((a: number, b: number) => a + b, 0);
  const var1 = totalPositive > 0 ? (q[d1]! / totalPositive) * 100 : 0;
  const var2 = totalPositive > 0 ? (q[d2]! / totalPositive) * 100 : 0;

  // 4. Coordinates
  const points: MDSPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = u[i]![d1]! * Math.sqrt(q[d1]!);
    const y = u[i]![d2]! * Math.sqrt(q[d2]!);
    points.push({ name: names[i]!, color: colors[i]!, x, y, size: sizes[i]! });
  }

  // 5. Kruskal stress-1
  const stress = computeStress(D, points);

  return {
    points,
    mode,
    stress: Math.round(stress * 1000) / 1000,
    varianceExplained: [
      Math.round(var1 * 10) / 10,
      Math.round(var2 * 10) / 10,
    ],
  };
}

/**
 * Kruskal stress-1:
 * stress = sqrt( sum((d_ij - δ_ij)²) / sum(d_ij²) )
 * where d_ij = original distance, δ_ij = Euclidean distance in embedding
 */
function computeStress(D: number[][], points: MDSPoint[]): number {
  const n = points.length;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dOrig = D[i]![j]!;
      const dx = points[i]!.x - points[j]!.x;
      const dy = points[i]!.y - points[j]!.y;
      const dEmbed = Math.sqrt(dx * dx + dy * dy);
      const diff = dOrig! - dEmbed;
      numerator += diff * diff;
      denominator += dOrig! * dOrig!;
    }
  }

  return denominator > 0 ? Math.sqrt(numerator / denominator) : 0;
}
