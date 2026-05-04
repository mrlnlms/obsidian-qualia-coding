/**
 * Pure distance matrix builders. No Obsidian deps — worker-ready.
 *
 * Used by MDS (codes/files), Files Dendrogram, and File Similarity Ranking.
 */

/**
 * Symmetric Jaccard distance matrix from N sets.
 * d(i,j) = 1 - |Si ∩ Sj| / |Si ∪ Sj|; d(i,i) = 0; d(i,j) = 0 when both sets empty.
 */
export function buildJaccardDistanceMatrix(sets: ReadonlyArray<ReadonlySet<string>>): number[][] {
  const n = sets.length;
  const D: number[][] = [];
  for (let i = 0; i < n; i++) D.push(new Array(n).fill(0));

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
 * Pairwise Jaccard distances from a single reference index against all others.
 * Returns dist[j] for each j !== refIdx; dist[refIdx] = 0.
 *
 * Used by File Similarity Ranking — avoids computing the full N×N matrix when
 * only one row is needed (O(N·|codes|) instead of O(N²·|codes|)).
 */
export function jaccardDistancesFromReference(
  sets: ReadonlyArray<ReadonlySet<string>>,
  refIdx: number,
): number[] {
  const n = sets.length;
  const dists = new Array(n).fill(0);
  if (refIdx < 0 || refIdx >= n) return dists;

  const ref = sets[refIdx]!;
  for (let j = 0; j < n; j++) {
    if (j === refIdx) continue;
    const other = sets[j]!;
    let intersection = 0;
    for (const x of ref) {
      if (other.has(x)) intersection++;
    }
    const union = ref.size + other.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;
    dists[j] = 1 - jaccard;
  }
  return dists;
}
