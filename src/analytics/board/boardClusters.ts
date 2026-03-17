
import type { ConsolidatedData } from "../data/dataTypes";
import { calculateCooccurrence } from "../data/statsEngine";
import { buildDendrogram, cutDendrogram } from "../data/clusterEngine";

export interface ClusterGroup {
  id: number;
  codeNames: string[];
  color: string; // averaged color for the frame
}

export interface ClusterResult {
  clusters: ClusterGroup[];
}

/**
 * Cluster code cards on the board by co-occurrence.
 * @param codeNames - code names present on the board
 * @param codeColors - corresponding hex colors
 * @param data - consolidated analytics data
 * @param cutRatio - fraction of max dendrogram distance to cut at (0-1, default 0.5)
 */
export function clusterCodeCards(
  codeNames: string[],
  codeColors: string[],
  data: ConsolidatedData,
  cutRatio = 0.5,
): ClusterResult {
  if (codeNames.length < 2) {
    return { clusters: [{ id: 0, codeNames: [...codeNames], color: codeColors[0] ?? "#888" }] };
  }

  // Calculate co-occurrence for just the codes on the board
  const allSources = Object.entries(data.sources)
    .filter(([, active]) => active)
    .flatMap(([key]) => key === "csv" ? ["csv-segment", "csv-row"] as const : [key as import("../data/dataTypes").SourceType]);

  const cooc = calculateCooccurrence(data, {
    sources: allSources,
    codes: [],
    excludeCodes: [],
    minFrequency: 0,
  });

  // Build index mapping: board codes -> cooc matrix indices
  const coocIndex = new Map<string, number>();
  for (let i = 0; i < cooc.codes.length; i++) {
    coocIndex.set(cooc.codes[i]!, i);
  }

  // Build Jaccard distance matrix for the board codes
  const n = codeNames.length;
  const distMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        row.push(0);
      } else {
        const ci = coocIndex.get(codeNames[i]!);
        const cj = coocIndex.get(codeNames[j]!);
        if (ci !== undefined && cj !== undefined) {
          const freqI = cooc.matrix[ci]![ci]!;
          const freqJ = cooc.matrix[cj]![cj]!;
          const coij = cooc.matrix[ci]![cj]!;
          const union = freqI + freqJ - coij;
          row.push(union > 0 ? 1 - coij / union : 1);
        } else {
          row.push(1); // max distance if code not in cooc data
        }
      }
    }
    distMatrix.push(row);
  }

  // Build dendrogram and cut
  const root = buildDendrogram(distMatrix, codeNames, codeColors);
  if (!root) {
    return { clusters: [{ id: 0, codeNames: [...codeNames], color: codeColors[0] ?? "#888" }] };
  }

  const maxDist = root.distance || 1;
  const cutDistance = maxDist * cutRatio;
  const assignments = cutDendrogram(root, cutDistance);

  // Group by cluster ID
  const groups = new Map<number, { names: string[]; colors: string[] }>();
  for (let i = 0; i < n; i++) {
    const cid = assignments[i]!;
    let g = groups.get(cid);
    if (!g) { g = { names: [], colors: [] }; groups.set(cid!, g); }
    g.names.push(codeNames[i]!);
    g.colors.push(codeColors[i]!);
  }

  const clusters: ClusterGroup[] = [];
  let idx = 0;
  for (const [, g] of groups) {
    clusters.push({
      id: idx++,
      codeNames: g.names,
      color: averageColor(g.colors),
    });
  }

  return { clusters };
}

/** Average hex colors to get a blend for the cluster frame */
function averageColor(hexColors: string[]): string {
  if (hexColors.length === 0) return "rgba(128,128,128,0.12)";
  let r = 0, g = 0, b = 0;
  for (const hex of hexColors) {
    const c = parseHex(hex);
    r += c.r; g += c.g; b += c.b;
  }
  const n = hexColors.length;
  r = Math.round(r / n);
  g = Math.round(g / n);
  b = Math.round(b / n);
  return `rgba(${r},${g},${b},0.12)`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}
