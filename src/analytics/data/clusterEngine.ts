
/**
 * Agglomerative Hierarchical Clustering (Average Linkage).
 * Takes a distance matrix and returns an optimal leaf ordering.
 */

export interface ClusterOrder {
  /** Reordered indices — apply to matrix rows/columns */
  indices: number[];
  /** Merge history for optional dendrogram rendering */
  merges: Array<{ a: number; b: number; distance: number }>;
}

/**
 * Perform agglomerative hierarchical clustering with average linkage.
 * Returns leaf ordering that groups similar items together.
 */
export function hierarchicalCluster(distMatrix: number[][]): ClusterOrder {
  const n = distMatrix.length;
  if (n <= 1) return { indices: n === 1 ? [0] : [], merges: [] };
  if (n === 2) return { indices: [0, 1], merges: [{ a: 0, b: 1, distance: distMatrix[0]![1]! }] };

  // Working copy of distances between clusters
  const dist: number[][] = distMatrix.map((row) => [...row]);

  // Each cluster is a list of original indices
  const clusters: number[][] = [];
  for (let i = 0; i < n; i++) clusters.push([i]);

  // Track which clusters are still active
  const active = new Set<number>();
  for (let i = 0; i < n; i++) active.add(i);

  const merges: ClusterOrder["merges"] = [];

  // n-1 merge steps
  for (let step = 0; step < n - 1; step++) {
    // Find closest pair of active clusters
    let bestDist = Infinity;
    let bestI = -1;
    let bestJ = -1;

    const activeArr = Array.from(active);
    for (let ai = 0; ai < activeArr.length; ai++) {
      for (let aj = ai + 1; aj < activeArr.length; aj++) {
        const i = activeArr[ai]!;
        const j = activeArr[aj]!;
        if (dist[i]![j]! < bestDist) {
          bestDist = dist[i]![j]!;
          bestI = i;
          bestJ = j;
        }
      }
    }

    merges.push({ a: bestI, b: bestJ, distance: bestDist });

    // Merge bestJ into bestI (average linkage)
    const sizeI = clusters[bestI]!.length;
    const sizeJ = clusters[bestJ]!.length;
    const totalSize = sizeI + sizeJ;

    for (const k of active) {
      if (k === bestI || k === bestJ) continue;
      // Average linkage: weighted average of distances
      dist[bestI]![k] = (dist[bestI]![k]! * sizeI + dist[bestJ]![k]! * sizeJ) / totalSize;
      dist[k]![bestI] = dist[bestI]![k]!;
    }

    clusters[bestI] = clusters[bestI]!.concat(clusters[bestJ]!);
    active.delete(bestJ);
  }

  // The final cluster contains all indices in merge order
  const remaining = active.values().next().value as number;
  const indices = clusters[remaining]!;

  return { indices, merges };
}

// ── Dendrogram tree ──

export interface DendrogramNode {
  id: number;
  left: DendrogramNode | null;
  right: DendrogramNode | null;
  distance: number;
  leafIndices: number[];
  label?: string;
  color?: string;
}

/**
 * Build a binary tree from hierarchicalCluster merges.
 * Leaf nodes have id = original index; internal nodes have id = n + mergeStep.
 */
export function buildDendrogram(
  distMatrix: number[][],
  names: string[],
  colors: string[],
): DendrogramNode | null {
  const n = distMatrix.length;
  if (n === 0) return null;

  const result = hierarchicalCluster(distMatrix);

  // Create leaf nodes
  const nodes = new Map<number, DendrogramNode>();
  for (let i = 0; i < n; i++) {
    nodes.set(i, {
      id: i,
      left: null,
      right: null,
      distance: 0,
      leafIndices: [i],
      label: names[i],
      color: colors[i],
    });
  }

  // Track which cluster ID maps to which node
  // Initially: cluster i = node i
  // After merge step s: cluster bestI absorbs bestJ
  const clusterNode = new Map<number, DendrogramNode>();
  for (let i = 0; i < n; i++) clusterNode.set(i, nodes.get(i)!);

  for (let s = 0; s < result.merges.length; s++) {
    const merge = result.merges[s]!;
    const leftNode = clusterNode.get(merge.a)!;
    const rightNode = clusterNode.get(merge.b)!;

    const internalNode: DendrogramNode = {
      id: n + s,
      left: leftNode,
      right: rightNode,
      distance: merge.distance,
      leafIndices: [...leftNode.leafIndices, ...rightNode.leafIndices],
    };

    nodes.set(n + s, internalNode);
    clusterNode.set(merge.a, internalNode);
    clusterNode.delete(merge.b);
  }

  // Root is the last remaining node
  const rootId = Array.from(clusterNode.keys())[0]!;
  return clusterNode.get(rootId) ?? null;
}

/**
 * Cut dendrogram at a given distance threshold.
 * Returns cluster assignment for each original index (0-based).
 *
 * Cluster IDs are compact (0..K-1) and assigned in left-first DFS order, so
 * IDs align with the visual top-to-bottom order of leaves in the dendrogram.
 */
export function cutDendrogram(root: DendrogramNode, cutDistance: number): number[] {
  const n = root.leafIndices.length;
  const assignments = new Array(n).fill(0);
  let nextClusterId = 0;

  function visit(node: DendrogramNode): void {
    if (node.left === null || node.distance <= cutDistance) {
      const id = nextClusterId++;
      for (const idx of node.leafIndices) {
        assignments[idx] = id;
      }
      return;
    }
    visit(node.left!);
    visit(node.right!);
  }

  visit(root);
  return assignments;
}

// ── Silhouette ──

export interface SilhouetteScore {
  index: number;
  name: string;
  color: string;
  cluster: number;
  score: number;
}

export interface SilhouetteResult {
  scores: SilhouetteScore[];
  avgScore: number;
}

/**
 * Calculate silhouette scores for each item given a distance matrix and cluster assignments.
 * Si = (bi - ai) / max(ai, bi) where:
 *   ai = avg distance to items in same cluster
 *   bi = avg distance to items in nearest other cluster
 */
export function calculateSilhouette(
  distMatrix: number[][],
  assignments: number[],
  names: string[],
  colors: string[],
): SilhouetteResult {
  const n = distMatrix.length;
  const scores: SilhouetteScore[] = [];

  // Group indices by cluster
  const clusterMembers = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = assignments[i]!;
    let list = clusterMembers.get(c);
    if (!list) { list = []; clusterMembers.set(c, list); }
    list.push(i);
  }

  const clusterIds = Array.from(clusterMembers.keys());

  for (let i = 0; i < n; i++) {
    const myCluster = assignments[i]!;
    const myMembers = clusterMembers.get(myCluster)!;

    // Rousseeuw 1987: singleton clusters have undefined silhouette → score = 0.
    // Without this guard, ai=0 makes the formula collapse to (bi-0)/bi = 1,
    // which falsely suggests a "perfect" cluster.
    if (myMembers.length === 1) {
      scores.push({
        index: i,
        name: names[i] ?? String(i),
        color: colors[i] ?? "#6200EE",
        cluster: myCluster,
        score: 0,
      });
      continue;
    }

    // ai = avg distance to same cluster (excluding self)
    let ai = 0;
    {
      let sum = 0;
      for (const j of myMembers) {
        if (j !== i) sum += distMatrix[i]![j]!;
      }
      ai = sum / (myMembers.length - 1);
    }

    // bi = min avg distance to any other cluster
    let bi = Infinity;
    for (const cid of clusterIds) {
      if (cid === myCluster) continue;
      const members = clusterMembers.get(cid)!;
      if (members.length === 0) continue;
      let sum = 0;
      for (const j of members) sum += distMatrix[i]![j]!;
      const avg = sum / members.length;
      if (avg < bi) bi = avg;
    }

    // If only one cluster, silhouette is 0
    if (bi === Infinity) bi = 0;

    const denom = Math.max(ai, bi);
    const score = denom > 0 ? (bi - ai) / denom : 0;

    scores.push({
      index: i,
      name: names[i] ?? String(i),
      color: colors[i] ?? "#6200EE",
      cluster: myCluster!,
      score: Math.round(score * 1000) / 1000,
    });
  }

  // Sort by cluster, then by score descending
  scores.sort((a, b) => a.cluster - b.cluster || b.score - a.score);

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((s, x) => s + x.score, 0) / scores.length) * 1000) / 1000
    : 0;

  return { scores, avgScore };
}
