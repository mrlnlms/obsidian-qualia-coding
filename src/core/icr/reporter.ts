/**
 * Reporter — calcula coeficientes por engine + agregado por média ponderada.
 *
 * Per engine: 5 coeficientes (Cohen κ pareado entre cada par de coders | Fleiss κ |
 * Krippendorff α nominal | α-binary | cu-α).
 *
 * Aggregate: média ponderada por #markers de cada engine.
 * TODO revisitar com fórmula da literatura quando user trouxer evidência (média ponderada
 * por markers é default razoável mas não única defensável).
 */

import type { KappaInput } from './kappaInput';
import { cohenKappa } from './coefficients/cohenKappa';
import { fleissKappa } from './coefficients/fleissKappa';
import { krippendorffAlphaNominal } from './coefficients/krippendorffAlpha';
import { alphaBinary } from './coefficients/alphaBinary';
import { cuAlpha } from './coefficients/cuAlpha';

export type EngineId = 'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'audio' | 'video';

const TEXT_LIKE_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment'];
const TEMPORAL_ENGINES: EngineId[] = ['audio', 'video'];
const CATEGORICAL_ENGINES: EngineId[] = ['csvRow'];

export interface EngineKappaInput {
	engine: EngineId;
	kappaInput: KappaInput;
}

export interface CoefficientReport {
	cohenKappa: Record<string, number>;  // 'coderA|coderB' → κ
	fleissKappa: number;
	alphaNominal: number;
	alphaBinary: number;
	cuAlpha: number;
}

export interface KappaReport {
	byEngine: Partial<Record<EngineId, CoefficientReport>>;
	aggregate: CoefficientReport;
	weights: Partial<Record<EngineId, number>>;
	/** Warnings sobre o aggregate — emitido quando engines com unidades incomparáveis entram juntos. */
	aggregateWarnings: string[];
}

export function reportKappa(inputs: EngineKappaInput[]): KappaReport {
	const byEngine: Partial<Record<EngineId, CoefficientReport>> = {};
	const weights: Partial<Record<EngineId, number>> = {};
	for (const { engine, kappaInput } of inputs) {
		byEngine[engine] = computeAll(kappaInput);
		weights[engine] = kappaInput.markers.length;
	}
	const aggregate = aggregateReports(byEngine, weights);

	// Aggregate warning quando misturar unidades incomparáveis (chars/segundos/categorical)
	const aggregateWarnings: string[] = [];
	const presentEngines = Object.keys(byEngine) as EngineId[];
	const unitFamilies = new Set<string>();
	for (const e of presentEngines) {
		if (TEXT_LIKE_ENGINES.includes(e)) unitFamilies.add('chars');
		if (TEMPORAL_ENGINES.includes(e)) unitFamilies.add('seconds');
		if (CATEGORICAL_ENGINES.includes(e)) unitFamilies.add('categorical');
	}
	if (unitFamilies.size > 1) {
		aggregateWarnings.push(
			'Aggregate combines engines with incomparable units (chars vs seconds vs categorical) — use per-engine values for analytical comparison',
		);
	}

	return { byEngine, aggregate, weights, aggregateWarnings };
}

function computeAll(input: KappaInput): CoefficientReport {
	const cohenK: Record<string, number> = {};
	for (let i = 0; i < input.coders.length; i++) {
		for (let j = i + 1; j < input.coders.length; j++) {
			const key = `${input.coders[i]}|${input.coders[j]}`;
			cohenK[key] = cohenKappa(input, input.coders[i]!, input.coders[j]!);
		}
	}
	return {
		cohenKappa: cohenK,
		fleissKappa: fleissKappa(input),
		alphaNominal: krippendorffAlphaNominal(input),
		alphaBinary: alphaBinary(input),
		cuAlpha: cuAlpha(input),
	};
}

function aggregateReports(
	byEngine: Partial<Record<EngineId, CoefficientReport>>,
	weights: Partial<Record<EngineId, number>>,
): CoefficientReport {
	const engines = Object.keys(byEngine) as EngineId[];
	let totalWeight = 0;
	for (const e of engines) totalWeight += weights[e] ?? 0;
	if (totalWeight === 0) {
		return { cohenKappa: {}, fleissKappa: 1, alphaNominal: 1, alphaBinary: 1, cuAlpha: 1 };
	}

	// Cohen aggregate por par de coders
	const allCohenKeys = new Set<string>();
	for (const e of engines) {
		for (const k of Object.keys(byEngine[e]!.cohenKappa)) allCohenKeys.add(k);
	}
	const cohenAgg: Record<string, number> = {};
	for (const key of allCohenKeys) {
		let sum = 0;
		let used = 0;
		for (const e of engines) {
			const v = byEngine[e]!.cohenKappa[key];
			const w = weights[e] ?? 0;
			if (v !== undefined) {
				sum += v * w;
				used += w;
			}
		}
		cohenAgg[key] = used > 0 ? sum / used : 0;
	}

	const wavg = (key: 'fleissKappa' | 'alphaNominal' | 'alphaBinary' | 'cuAlpha'): number => {
		let sum = 0;
		for (const e of engines) sum += byEngine[e]![key] * (weights[e] ?? 0);
		return sum / totalWeight;
	};

	return {
		cohenKappa: cohenAgg,
		fleissKappa: wavg('fleissKappa'),
		alphaNominal: wavg('alphaNominal'),
		alphaBinary: wavg('alphaBinary'),
		cuAlpha: wavg('cuAlpha'),
	};
}
