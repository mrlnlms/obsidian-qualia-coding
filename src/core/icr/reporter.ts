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

import type { KappaInput, CodedMarker } from './kappaInput';
import type { CategoricalKappaInput } from './categoricalKappaInput';
import type { CoderId } from './coderTypes';
import { cohenKappa } from './coefficients/cohenKappa';
import { fleissKappa } from './coefficients/fleissKappa';
import { krippendorffAlphaNominal } from './coefficients/krippendorffAlpha';
import { alphaBinary } from './coefficients/alphaBinary';
import { cuAlpha } from './coefficients/cuAlpha';
import { cohenKappaCategorical } from './coefficients/cohenKappaCategorical';
import { fleissKappaCategorical } from './coefficients/fleissKappaCategorical';
import { krippendorffAlphaCategoricalNominal } from './coefficients/krippendorffAlphaCategorical';

export type EngineId = 'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'audio' | 'video' | 'pdfShape' | 'image';

const TEXT_LIKE_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment'];
const TEMPORAL_ENGINES: EngineId[] = ['audio', 'video'];
const CATEGORICAL_ENGINES: EngineId[] = ['csvRow'];
const SPATIAL_ENGINES: EngineId[] = ['pdfShape', 'image'];

export interface EngineKappaInput {
	engine: EngineId;
	kappaInput: KappaInput | CategoricalKappaInput;
}

function isCategorical(input: KappaInput | CategoricalKappaInput): input is CategoricalKappaInput {
	return 'units' in input;
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

// ─── Caches (perf fix 2026-05-11) ──────────────────────────
// reportKappa + reportPairwise são chamados N×M× em renderOverview pra render heatmap/matrix/table.
// Cada call faz 5 coefs com explodeMarkersToCharLabels (per-char positions × per-coder). 1M+ ops.
//
// 2 caches em camadas:
// - WeakMap por identidade do array de inputs (fast path: troca de coefficient mantém ref)
// - Map por (cacheKey + pairs) (slow path: filter chip cria array novo mesmo com conteúdo igual)
// Cache key explícita vem do caller (renderOverview*) — geralmente scope hash + engineIds. Bumpado
// via bumpReportCache quando markers mudam.
const reportKappaCache = new WeakMap<EngineKappaInput[], KappaReport>();
const reportPairwiseCache = new WeakMap<EngineKappaInput[], Map<string, PairwiseReport[]>>();

const reportKappaKeyCache = new Map<string, KappaReport>();
const reportPairwiseKeyCache = new Map<string, PairwiseReport[]>();
const REPORT_CACHE_MAX = 200;
let reportCacheGen = 0;

export function bumpReportCache(): void {
	reportCacheGen++;
	reportKappaKeyCache.clear();
	reportPairwiseKeyCache.clear();
}

function pruneReportCache(map: Map<string, unknown>): void {
	while (map.size > REPORT_CACHE_MAX) {
		const k = map.keys().next().value;
		if (k === undefined) break;
		map.delete(k);
	}
}

function pairsKey(pairs: [CoderId, CoderId][]): string {
	return pairs.map(p => (p[0] < p[1] ? `${p[0]}|${p[1]}` : `${p[1]}|${p[0]}`)).sort().join(';');
}

export function reportKappa(inputs: EngineKappaInput[], cacheKey?: string): KappaReport {
	// Fast path: identidade (mesmo array ref → mesmo report)
	const idHit = reportKappaCache.get(inputs);
	if (idHit) return idHit;
	// Slow path: cache key explícita (arrays diferentes mas conteúdo logicamente igual)
	if (cacheKey) {
		const keyed = reportKappaKeyCache.get(`${cacheKey}::${reportCacheGen}`);
		if (keyed) {
			reportKappaCache.set(inputs, keyed); // popula fast cache pra próximas com mesma ref
			return keyed;
		}
	}

	const byEngine: Partial<Record<EngineId, CoefficientReport>> = {};
	const weights: Partial<Record<EngineId, number>> = {};
	for (const { engine, kappaInput } of inputs) {
		byEngine[engine] = computeAll(kappaInput);
		weights[engine] = isCategorical(kappaInput) ? kappaInput.units.length : kappaInput.markers.length;
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
		if (SPATIAL_ENGINES.includes(e)) unitFamilies.add('spatial-bbox');
	}
	if (unitFamilies.size > 1) {
		aggregateWarnings.push(
			'Aggregate combines engines with incomparable units (chars vs seconds vs categorical vs spatial-bbox) — use per-engine values for analytical comparison',
		);
	}

	const result: KappaReport = { byEngine, aggregate, weights, aggregateWarnings };
	reportKappaCache.set(inputs, result);
	if (cacheKey) {
		reportKappaKeyCache.set(`${cacheKey}::${reportCacheGen}`, result);
		pruneReportCache(reportKappaKeyCache);
	}
	return result;
}

function computeAll(input: KappaInput | CategoricalKappaInput): CoefficientReport {
	if (isCategorical(input)) {
		const cohenK: Record<string, number> = {};
		for (let i = 0; i < input.coders.length; i++) {
			for (let j = i + 1; j < input.coders.length; j++) {
				const key = `${input.coders[i]}|${input.coders[j]}`;
				cohenK[key] = cohenKappaCategorical(input, input.coders[i]!, input.coders[j]!);
			}
		}
		return {
			cohenKappa: cohenK,
			fleissKappa: fleissKappaCategorical(input),
			alphaNominal: krippendorffAlphaCategoricalNominal(input),
			// alphaBinary e cuAlpha não-aplicáveis pra categorical (não tem boundary disagreement).
			// Retorna 1 (vacuous) pra preservar shape do CoefficientReport.
			alphaBinary: 1,
			cuAlpha: 1,
		};
	}

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

// ─── Per-pair helper ─────────────────────────────────────────
//
// Mode A da Compare Coders View precisa κ entre cada par de coders pra cada
// coeficiente. Cohen κ já é per-pair direto (`aggregate.cohenKappa[key]`),
// mas Fleiss/α/α-binary/cu-α são scalar over cohort. Pra obter valor por par
// pra esses, filter `KappaInput` pra incluir só os 2 coders e re-rodar reporter.

export interface PairwiseReport {
	pair: [CoderId, CoderId];
	report: KappaReport;
}

export function reportPairwise(
	inputs: EngineKappaInput[],
	pairs: [CoderId, CoderId][],
	cacheKey?: string,
): PairwiseReport[] {
	const pKey = pairsKey(pairs);
	// Fast path: identidade
	let byPairs = reportPairwiseCache.get(inputs);
	if (byPairs) {
		const hit = byPairs.get(pKey);
		if (hit) return hit;
	}
	// Slow path: cache key explícita
	if (cacheKey) {
		const fullKey = `${cacheKey}::${pKey}::${reportCacheGen}`;
		const keyed = reportPairwiseKeyCache.get(fullKey);
		if (keyed) {
			if (!byPairs) {
				byPairs = new Map();
				reportPairwiseCache.set(inputs, byPairs);
			}
			byPairs.set(pKey, keyed);
			return keyed;
		}
	}
	const result = pairs.map(pair => {
		const filteredInputs: EngineKappaInput[] = inputs.map(input => ({
			engine: input.engine,
			kappaInput: filterKappaInputToPair(input.kappaInput, pair),
		}));
		const report = reportKappa(filteredInputs);
		return { pair, report };
	});
	if (!byPairs) {
		byPairs = new Map();
		reportPairwiseCache.set(inputs, byPairs);
	}
	byPairs.set(pKey, result);
	if (cacheKey) {
		reportPairwiseKeyCache.set(`${cacheKey}::${pKey}::${reportCacheGen}`, result);
		pruneReportCache(reportPairwiseKeyCache);
	}
	return result;
}

function filterKappaInputToPair(
	input: KappaInput | CategoricalKappaInput,
	pair: [CoderId, CoderId],
): KappaInput | CategoricalKappaInput {
	const [a, b] = pair;
	if (isCategorical(input)) {
		return {
			units: input.units.filter(u => u.coderId === a || u.coderId === b),
			coders: [a, b],
		};
	}
	return {
		markers: input.markers.filter((m: CodedMarker) => m.coderId === a || m.coderId === b),
		sources: input.sources,
		coders: [a, b],
	};
}
