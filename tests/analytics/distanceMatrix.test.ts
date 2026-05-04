import { describe, it, expect } from "vitest";
import { buildJaccardDistanceMatrix, jaccardDistancesFromReference } from "../../src/analytics/data/distanceMatrix";

describe("buildJaccardDistanceMatrix", () => {
  it("returns empty matrix for empty input", () => {
    expect(buildJaccardDistanceMatrix([])).toEqual([]);
  });

  it("returns [[0]] for single set", () => {
    const D = buildJaccardDistanceMatrix([new Set(["a"])]);
    expect(D).toEqual([[0]]);
  });

  it("disjoint sets have distance 1", () => {
    const D = buildJaccardDistanceMatrix([new Set(["a"]), new Set(["b"])]);
    expect(D[0]![1]).toBe(1);
    expect(D[1]![0]).toBe(1);
    expect(D[0]![0]).toBe(0);
    expect(D[1]![1]).toBe(0);
  });

  it("identical sets have distance 0", () => {
    const D = buildJaccardDistanceMatrix([new Set(["a", "b"]), new Set(["a", "b"])]);
    expect(D[0]![1]).toBe(0);
  });

  it("computes Jaccard correctly for partial overlap", () => {
    // Si = {a,b,c}, Sj = {b,c,d} → ∩ = {b,c} (2), ∪ = {a,b,c,d} (4) → J = 0.5, dist = 0.5
    const D = buildJaccardDistanceMatrix([
      new Set(["a", "b", "c"]),
      new Set(["b", "c", "d"]),
    ]);
    expect(D[0]![1]).toBe(0.5);
    expect(D[1]![0]).toBe(0.5);
  });

  it("documents both-empty pair behavior (dist = 1 by convention)", () => {
    const D = buildJaccardDistanceMatrix([new Set<string>(), new Set<string>()]);
    expect(D[0]![1]).toBe(1);
  });

  it("matrix is symmetric and diagonal is zero", () => {
    const sets = [
      new Set(["a", "b"]),
      new Set(["b", "c"]),
      new Set(["c", "d"]),
      new Set(["a", "d"]),
    ];
    const D = buildJaccardDistanceMatrix(sets);
    for (let i = 0; i < sets.length; i++) {
      expect(D[i]![i]).toBe(0);
      for (let j = 0; j < sets.length; j++) {
        expect(D[i]![j]).toBe(D[j]![i]);
      }
    }
  });
});

describe("jaccardDistancesFromReference", () => {
  it("returns zero-filled array when refIdx is out of bounds", () => {
    const sets = [new Set(["a"]), new Set(["b"])];
    expect(jaccardDistancesFromReference(sets, -1)).toEqual([0, 0]);
    expect(jaccardDistancesFromReference(sets, 5)).toEqual([0, 0]);
  });

  it("ref distance to itself is 0", () => {
    const sets = [new Set(["a"]), new Set(["b"]), new Set(["c"])];
    const dists = jaccardDistancesFromReference(sets, 1);
    expect(dists[1]).toBe(0);
  });

  it("ref vs disjoint others returns 1 for all", () => {
    const sets = [new Set(["a"]), new Set(["b"]), new Set(["c"])];
    const dists = jaccardDistancesFromReference(sets, 0);
    expect(dists[1]).toBe(1);
    expect(dists[2]).toBe(1);
  });

  it("matches full matrix row for the same reference", () => {
    const sets = [
      new Set(["a", "b"]),
      new Set(["b", "c"]),
      new Set(["a", "b", "c"]),
      new Set(["d"]),
    ];
    const D = buildJaccardDistanceMatrix(sets);
    for (let ref = 0; ref < sets.length; ref++) {
      const lazy = jaccardDistancesFromReference(sets, ref);
      for (let j = 0; j < sets.length; j++) {
        expect(lazy[j]).toBeCloseTo(D[ref]![j]!, 10);
      }
    }
  });
});
