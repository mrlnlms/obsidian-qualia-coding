/**
 * coefficientResolver — extrai valor + checa aplicabilidade de coeficiente.
 *
 * Centraliza a lógica de "qual número eu mostro nessa cell?" pra todos os
 * 3 modes da overview (matrix, table, heatmap) + Modal "ver lado a lado".
 *
 * Cohen κ é o único intrinsecamente per-pair; demais coeficientes são scalar
 * over cohort (caller já filtra inputs ao par via `reportPairwise` quando
 * precisa κ por par pra Fleiss/α/etc).
 *
 * Aplicabilidade: Fleiss requer 3+ coders; α-binary e cu-α requerem engine
 * com boundary (text-likes, temporal, spatial-bbox) — não aplicáveis se
 * todas engines no escopo são csvRow puro (categórico sem boundary).
 */

import type { CoderId } from '../coderTypes';
import type { CoefficientKey } from './compareCodersTypes';
import type { KappaReport, EngineId } from '../reporter';

export function getCoefficientValue(
	report: KappaReport,
	coefficient: CoefficientKey,
	pair?: [CoderId, CoderId],
): number | undefined {
	if (coefficient === 'cohen') {
		if (!pair) return undefined;
		const [a, b] = pair;
		const table = report.aggregate.cohenKappa;
		const entry = table[`${a}|${b}`] ?? table[`${b}|${a}`];
		return entry?.value;
	}
	switch (coefficient) {
		case 'fleiss':       return report.aggregate.fleissKappa;
		case 'alpha':        return report.aggregate.alphaNominal;
		case 'alpha-binary': return report.aggregate.alphaBinary;
		case 'cu-alpha':     return report.aggregate.cuAlpha;
	}
}

const BOUNDED_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'audio', 'video', 'pdfShape', 'image'];

export function isCoefficientApplicable(
	coefficient: CoefficientKey,
	coderCount: number,
	engines: EngineId[],
): boolean {
	if (coefficient === 'fleiss') return coderCount >= 3;
	if (coefficient === 'alpha-binary' || coefficient === 'cu-alpha') {
		return engines.some(e => BOUNDED_ENGINES.includes(e));
	}
	return true;
}
