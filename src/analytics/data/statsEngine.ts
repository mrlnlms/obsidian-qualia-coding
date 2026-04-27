/**
 * Barrel re-export — all stats functions split into domain modules.
 * Consumers import from here without changes.
 */

export { calculateFrequency, calculateDocumentCodeMatrix, calculateSourceComparison } from "./frequency";
export { calculateCooccurrence, calculateOverlap } from "./cooccurrence";
export { calculateEvolution, calculateTemporal } from "./evolution";
export { calculateLagSequential, calculatePolarCoordinates } from "./sequential";
export { calculateChiSquare, chiSquareFromContingency } from "./inferential";
export { calculateTextStats } from "./textAnalysis";
export { calculateCodeMetadata } from "./codeMetadata";
