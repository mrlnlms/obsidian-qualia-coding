
/**
 * Multiple Correspondence Analysis (MCA) engine.
 * Computes a 2D biplot from the indicator matrix (markers × codes)
 * using SVD via svd-js.
 */

import type { UnifiedMarker, SourceType } from "./dataTypes";

export interface MCACodePoint {
  name: string;
  color: string;
  x: number;
  y: number;
}

export interface MCAMarkerPoint {
  id: string;
  fileId: string;
  source: SourceType;
  codes: string[];
  x: number;
  y: number;
}

export interface MCAResult {
  codePoints: MCACodePoint[];
  markerPoints: MCAMarkerPoint[];
  eigenvalues: number[];
  inertiaExplained: [number, number]; // % axis 1, % axis 2
}

/**
 * Compute MCA from unified markers.
 * Returns null if there's insufficient data (< 2 codes or < 2 markers with codes).
 */
export async function calculateMCA(
  markers: UnifiedMarker[],
  codes: string[],
  colors: string[],
): Promise<MCAResult | null> {
  // Filter markers that have at least one of the target codes
  const codeSet = new Set(codes);
  const validMarkers = markers.filter(m => m.codes.some(c => codeSet.has(c)));

  if (validMarkers.length < 2 || codes.length < 2) return null;

  // 1. Build indicator matrix Z[i][j] = marker i has code j ? 1 : 0
  const nRows = validMarkers.length;
  const nCols = codes.length;
  const Z: number[][] = [];
  for (let i = 0; i < nRows; i++) {
    const row: number[] = [];
    for (let j = 0; j < nCols; j++) {
      row.push(validMarkers[i]!.codes.includes(codes[j]!) ? 1 : 0);
    }
    Z.push(row);
  }

  // Filter out zero columns (codes with no markers in this subset)
  const colSums: number[] = [];
  for (let j = 0; j < nCols; j++) {
    let sum = 0;
    for (let i = 0; i < nRows; i++) sum += Z[i]![j]!;
    colSums.push(sum);
  }
  const activeColIdx = colSums.map((s, i) => ({ s, i })).filter(x => x.s > 0).map(x => x.i);
  if (activeColIdx.length < 2) return null;

  const activeCodes = activeColIdx.map(j => codes[j]);
  const activeColors = activeColIdx.map(j => colors[j]);
  const nActiveCols = activeColIdx.length;

  // Build filtered Z (only active columns)
  const Zf: number[][] = [];
  for (let i = 0; i < nRows; i++) {
    Zf.push(activeColIdx.map(j => Z[i]![j]!));
  }

  // Filter out zero rows
  const rowSums: number[] = [];
  for (let i = 0; i < nRows; i++) {
    let sum = 0;
    for (let j = 0; j < nActiveCols; j++) sum += Zf[i]![j]!;
    rowSums.push(sum);
  }
  const activeRowIdx = rowSums.map((s, i) => ({ s, i })).filter(x => x.s > 0).map(x => x.i);
  if (activeRowIdx.length < 2) return null;

  const nActiveRows = activeRowIdx.length;
  const Za: number[][] = activeRowIdx.map(i => Zf[i]!);

  // 2. Grand total N
  let N = 0;
  for (let i = 0; i < nActiveRows; i++) {
    for (let j = 0; j < nActiveCols; j++) {
      N += Za[i]![j]!;
    }
  }
  if (N === 0) return null;

  // 3. Correspondence matrix P = Z / N
  const P: number[][] = Za.map(row => row.map(v => v / N));

  // 4. Row masses r[i] = sum(P[i,:]) and column masses c[j] = sum(P[:,j])
  const r: number[] = [];
  for (let i = 0; i < nActiveRows; i++) {
    let sum = 0;
    for (let j = 0; j < nActiveCols; j++) sum += P[i]![j]!;
    r.push(sum);
  }

  const c: number[] = [];
  for (let j = 0; j < nActiveCols; j++) {
    let sum = 0;
    for (let i = 0; i < nActiveRows; i++) sum += P[i]![j]!;
    c.push(sum);
  }

  // 5. Standardized residuals S[i][j] = (P[i][j] - r[i]*c[j]) / sqrt(r[i]*c[j])
  const S: number[][] = [];
  for (let i = 0; i < nActiveRows; i++) {
    const row: number[] = [];
    for (let j = 0; j < nActiveCols; j++) {
      const expected = r[i]! * c[j]!;
      if (expected <= 0) {
        row.push(0);
      } else {
        row.push((P[i]![j]! - expected) / Math.sqrt(expected));
      }
    }
    S.push(row);
  }

  // 6. SVD of S
  const { SVD } = await import("svd-js");
  const { u, v, q } = SVD(S);

  // q contains singular values (sorted desc)
  // u[i][k] = left singular vector component
  // v[j][k] = right singular vector component

  // 7. Eigenvalues = q^2
  const eigenvalues = q.map((sv: number) => sv * sv);
  const totalInertia = eigenvalues.reduce((a: number, b: number) => a + b, 0);

  // Find first 2 non-trivial dimensions (eigenvalue > epsilon).
  // In MCA the first SVD dimension can be trivial (eigenvalue ≈ 0).
  const TRIVIAL_THRESHOLD = 1e-10;
  const dimIndices: number[] = [];
  for (let k = 0; k < q.length && dimIndices.length < 2; k++) {
    if (eigenvalues[k]! > TRIVIAL_THRESHOLD) {
      dimIndices.push(k);
    }
  }
  if (dimIndices.length < 2) return null;

  const d1 = dimIndices[0]!;
  const d2 = dimIndices[1]!;

  const inertia1 = totalInertia > 0 ? (eigenvalues[d1]! / totalInertia) * 100 : 0;
  const inertia2 = totalInertia > 0 ? (eigenvalues[d2]! / totalInertia) * 100 : 0;

  // 8. Row coordinates F[i][k] = u[i][k] * q[k] / sqrt(r[i])
  const markerPoints: MCAMarkerPoint[] = [];
  for (let ii = 0; ii < nActiveRows; ii++) {
    const origIdx = activeRowIdx[ii]!;
    const marker = validMarkers[origIdx]!;
    const ri = r[ii]!;
    if (ri <= 0) continue;

    const x = (u[ii]![d1]! * q[d1]!) / Math.sqrt(ri);
    const y = (u[ii]![d2]! * q[d2]!) / Math.sqrt(ri);

    markerPoints.push({
      id: marker.id,
      fileId: marker.fileId,
      source: marker.source,
      codes: marker.codes,
      x,
      y,
    });
  }

  // 9. Column coordinates G[j][k] = v[j][k] * q[k] / sqrt(c[j])
  const codePoints: MCACodePoint[] = [];
  for (let j = 0; j < nActiveCols; j++) {
    const cj = c[j]!;
    if (cj <= 0) continue;

    const x = (v[j]![d1]! * q[d1]!) / Math.sqrt(cj);
    const y = (v[j]![d2]! * q[d2]!) / Math.sqrt(cj);

    codePoints.push({
      name: activeCodes[j]!,
      color: activeColors[j]!,
      x,
      y,
    });
  }

  return {
    codePoints,
    markerPoints,
    eigenvalues: eigenvalues.slice(0, 5), // top 5 for reference
    inertiaExplained: [
      Math.round(inertia1 * 10) / 10,
      Math.round(inertia2 * 10) / 10,
    ],
  };
}
