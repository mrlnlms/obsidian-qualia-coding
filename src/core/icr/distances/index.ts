import { distanceJaccard } from './jaccard';
import { distanceMASI } from './masi';
import { distanceNominal } from './nominal';

export type DistanceFunction = (a: ReadonlySet<string>, b: ReadonlySet<string>) => number;

export { distanceNominal } from './nominal';
export { distanceJaccard } from './jaccard';
export { distanceMASI } from './masi';

export type DistanceName = 'nominal' | 'jaccard' | 'masi';

// Resolve nome → função. Útil pra ler config persistido em SavedComparison.
export function resolveDistance(name: DistanceName): DistanceFunction {
  switch (name) {
    case 'nominal': return distanceNominal;
    case 'jaccard': return distanceJaccard;
    case 'masi': return distanceMASI;
  }
}
