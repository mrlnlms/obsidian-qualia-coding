// Jaccard distance: 1 − |A ∩ B| / |A ∪ B|.
// Pra singletons (|A|=|B|=1) equivale a δ_nominal — invariante pra tests existentes.

export function distanceJaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return 1 - intersection / union;
}
