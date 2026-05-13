/**
 * Sync fallback pro Kappa Worker — usado quando `Worker` não existe (jsdom em tests,
 * ambientes restritos). Roda exatamente o mesmo compute que o worker, na main thread.
 *
 * Em produção (Obsidian desktop) o Worker funciona e este arquivo nunca é chamado.
 * Em tests, garante que reportKappaAsync/reportPairwiseAsync ainda retornam Promise
 * com resultado correto sem precisar mockar Worker.
 *
 * Reusa os helpers SÍNCRONOS de reporter.ts (com caches WeakMap/Map ativos).
 */

import { reportKappa, reportPairwise } from './reporter';
import type { EngineKappaInput, KappaReport, PairwiseReport } from './reporter';
import type { CoderId } from './coderTypes';
import type { DistanceName } from './distances';

export function __syncReportKappa(
	inputs: EngineKappaInput[],
	distance?: DistanceName,
): KappaReport {
	return reportKappa(inputs, undefined, distance);
}

export function __syncReportPairwise(
	inputs: EngineKappaInput[],
	pairs: [CoderId, CoderId][],
	perPairInputs?: Map<string, EngineKappaInput[]>,
	distance?: DistanceName,
): PairwiseReport[] {
	return reportPairwise(inputs, pairs, undefined, perPairInputs, distance);
}
