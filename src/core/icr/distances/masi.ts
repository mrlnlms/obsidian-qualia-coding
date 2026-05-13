// MASI distance (Passonneau 2006): 1 − (|A ∩ B| / |A ∪ B|) × M
//
// M = 1 (idêntico), 2/3 (subset), 1/3 (overlap lateral), 0 (disjoint)
//
// CUIDADO: NLTK `masi_distance` diverge da paper (issue #294 aberto desde 2012).
// Esta implementação segue Passonneau (2006) direto.

export function distanceMASI(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  if (intersection === 0) return 1;
  const union = a.size + b.size - intersection;
  let m: number;
  if (a.size === b.size && intersection === a.size) m = 1;
  else if (intersection === a.size || intersection === b.size) m = 2 / 3;
  else m = 1 / 3;
  return 1 - (intersection / union) * m;
}
