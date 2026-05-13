// Distância nominal clássica entre sets de códigos.
// Equivalente à redução first-code alfabético histórica do motor κ.
// Pra singletons: agreement se único elemento bate; pra multi-label, reduz a first-code alfabético (preserva semântica antiga).

export function distanceNominal(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  if (a.size === 1 && b.size === 1) {
    const [x] = a;
    const [y] = b;
    return x === y ? 0 : 1;
  }
  const reduce = (s: ReadonlySet<string>) => [...s].sort()[0]!;
  return reduce(a) === reduce(b) ? 0 : 1;
}
