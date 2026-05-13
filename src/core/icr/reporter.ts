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
import { cohenKappa, type CohenKappaReport } from './coefficients/cohenKappa';
import { fleissKappa } from './coefficients/fleissKappa';
import { krippendorffAlphaNominal } from './coefficients/krippendorffAlpha';
import { alphaBinary } from './coefficients/alphaBinary';
import { cuAlpha } from './coefficients/cuAlpha';
import { cohenKappaCategorical } from './coefficients/cohenKappaCategorical';
import { fleissKappaCategorical } from './coefficients/fleissKappaCategorical';
import { krippendorffAlphaCategoricalNominal } from './coefficients/krippendorffAlphaCategorical';
import { resolveDistance, type DistanceFunction, type DistanceName } from './distances';

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
	/** 'coderA|coderB' → {value, perCode}. perCode = breakdown binary-per-label (caminho A). */
	cohenKappa: Record<string, CohenKappaReport>;
	fleissKappa: number;
	alphaNominal: number;
	alphaBinary: number;
	cuAlpha: number;
}

export type { CohenKappaReport } from './coefficients/cohenKappa';

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
// WeakMap identity cache agora chaveado por (inputs, distance) — distance é segunda chave Map
// dentro do WeakMap. Bug 2026-05-13: assumption antiga era que caller passava arrays distintos
// pra distance diferentes; mas scopeExtraction cacheia `inputs` por scope e reusa ref entre
// chamadas com Jaccard/MASI/nominal → cache identity retornava resultado errado da chamada
// anterior. Fix: distance vira segunda chave (sentinel '_' pra distance=undefined).
const reportKappaCache = new WeakMap<EngineKappaInput[], Map<string, KappaReport>>();
const reportPairwiseCache = new WeakMap<EngineKappaInput[], Map<string, Map<string, PairwiseReport[]>>>();

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

export function reportKappa(
	inputs: EngineKappaInput[],
	cacheKey?: string,
	distance?: DistanceName,
): KappaReport {
	// Fast path: identidade (mesmo array ref + mesma distance → mesmo report)
	const distKey = distance ?? '_';
	const byDist = reportKappaCache.get(inputs);
	const idHit = byDist?.get(distKey);
	if (idHit) return idHit;
	// Slow path: cache key explícita (arrays diferentes mas conteúdo logicamente igual)
	if (cacheKey) {
		const keyed = reportKappaKeyCache.get(`${cacheKey}::${reportCacheGen}`);
		if (keyed) {
			// popula fast cache pra próximas com mesma ref + distance
			let m = reportKappaCache.get(inputs);
			if (!m) { m = new Map(); reportKappaCache.set(inputs, m); }
			m.set(distKey, keyed);
			return keyed;
		}
	}

	const δ: DistanceFunction | undefined = distance ? resolveDistance(distance) : undefined;
	const byEngine: Partial<Record<EngineId, CoefficientReport>> = {};
	const weights: Partial<Record<EngineId, number>> = {};
	for (const { engine, kappaInput } of inputs) {
		byEngine[engine] = computeAll(kappaInput, δ);
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
	let m = reportKappaCache.get(inputs);
	if (!m) { m = new Map(); reportKappaCache.set(inputs, m); }
	m.set(distKey, result);
	if (cacheKey) {
		reportKappaKeyCache.set(`${cacheKey}::${reportCacheGen}`, result);
		pruneReportCache(reportKappaKeyCache);
	}
	return result;
}

function computeAll(
	input: KappaInput | CategoricalKappaInput,
	distance?: DistanceFunction,
): CoefficientReport {
	const alphaOptions = distance ? { distance } : undefined;
	if (isCategorical(input)) {
		const cohenK: Record<string, CohenKappaReport> = {};
		for (let i = 0; i < input.coders.length; i++) {
			for (let j = i + 1; j < input.coders.length; j++) {
				const key = `${input.coders[i]}|${input.coders[j]}`;
				cohenK[key] = cohenKappaCategorical(input, input.coders[i]!, input.coders[j]!);
			}
		}
		return {
			cohenKappa: cohenK,
			fleissKappa: fleissKappaCategorical(input, alphaOptions),
			alphaNominal: krippendorffAlphaCategoricalNominal(input, alphaOptions),
			// alphaBinary e cuAlpha não-aplicáveis pra categorical (não tem boundary disagreement).
			// Retorna 1 (vacuous) pra preservar shape do CoefficientReport.
			alphaBinary: 1,
			cuAlpha: 1,
		};
	}

	const cohenK: Record<string, CohenKappaReport> = {};
	for (let i = 0; i < input.coders.length; i++) {
		for (let j = i + 1; j < input.coders.length; j++) {
			const key = `${input.coders[i]}|${input.coders[j]}`;
			cohenK[key] = cohenKappa(input, input.coders[i]!, input.coders[j]!);
		}
	}
	return {
		cohenKappa: cohenK,
		fleissKappa: fleissKappa(input, alphaOptions),
		alphaNominal: krippendorffAlphaNominal(input, alphaOptions),
		alphaBinary: alphaBinary(input),
		cuAlpha: cuAlpha(input, alphaOptions),
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

	// Cohen aggregate por par de coders — agrega value (weighted avg) + perCode (weighted avg per code).
	const allCohenKeys = new Set<string>();
	for (const e of engines) {
		for (const k of Object.keys(byEngine[e]!.cohenKappa)) allCohenKeys.add(k);
	}
	const cohenAgg: Record<string, CohenKappaReport> = {};
	for (const key of allCohenKeys) {
		let sumValue = 0;
		let usedValue = 0;
		const perCodeAccum: Record<string, { sum: number; weight: number }> = {};
		for (const e of engines) {
			const r = byEngine[e]!.cohenKappa[key];
			const w = weights[e] ?? 0;
			if (r !== undefined) {
				sumValue += r.value * w;
				usedValue += w;
				for (const [codeId, kappa] of Object.entries(r.perCode)) {
					if (!perCodeAccum[codeId]) perCodeAccum[codeId] = { sum: 0, weight: 0 };
					perCodeAccum[codeId].sum += kappa * w;
					perCodeAccum[codeId].weight += w;
				}
			}
		}
		const perCode: Record<string, number> = {};
		for (const [codeId, acc] of Object.entries(perCodeAccum)) {
			if (acc.weight > 0) perCode[codeId] = acc.sum / acc.weight;
		}
		cohenAgg[key] = {
			value: usedValue > 0 ? sumValue / usedValue : 0,
			perCode,
		};
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

/** Key normalizada pra par de coders — usado em perPairInputs map. */
export function pairKey(pair: [CoderId, CoderId]): string {
	return pair[0] < pair[1] ? `${pair[0]}|${pair[1]}` : `${pair[1]}|${pair[0]}`;
}

export function reportPairwise(
	inputs: EngineKappaInput[],
	pairs: [CoderId, CoderId][],
	cacheKey?: string,
	/** Inputs extra **já-per-pair** (ex: bbox κ que faz Hungarian per pair).
	 *  Cada entrada do map: chave = `pairKey([a,b])`, valor = EngineKappaInput[] extra.
	 *  Caller responsável por sufixar cacheKey quando perPair muda semanticamente
	 *  (ex: `::bbox-on` quando bbox markers presentes vs `::bbox-off` sem) — WeakMap
	 *  identity cache é skipado porque map ref muda toda render. */
	perPairInputs?: Map<string, EngineKappaInput[]>,
	distance?: DistanceName,
): PairwiseReport[] {
	const hasPerPair = perPairInputs !== undefined && perPairInputs.size > 0;
	const pKey = pairsKey(pairs);
	const distKey = distance ?? '_';
	// WeakMap identity cache só sem perPair (inputs ref não diferencia extras). Distance vira
	// segunda chave Map pra não retornar cache stale entre Jaccard/MASI/nominal.
	if (!hasPerPair) {
		const byDist = reportPairwiseCache.get(inputs);
		const byPairs = byDist?.get(distKey);
		if (byPairs) {
			const hit = byPairs.get(pKey);
			if (hit) return hit;
		}
	}
	// cacheKey-based cache funciona em ambos casos — caller cravou bbox suffix se necessário.
	if (cacheKey) {
		const fullKey = `${cacheKey}::${pKey}::${reportCacheGen}`;
		const keyed = reportPairwiseKeyCache.get(fullKey);
		if (keyed) return keyed;
	}
	const result = pairs.map(pair => {
		const filteredInputs: EngineKappaInput[] = inputs.map(input => ({
			engine: input.engine,
			kappaInput: filterKappaInputToPair(input.kappaInput, pair),
		}));
		const extras = perPairInputs?.get(pairKey(pair)) ?? [];
		const combined = extras.length > 0 ? [...filteredInputs, ...extras] : filteredInputs;
		const report = reportKappa(combined, undefined, distance);
		return { pair, report };
	});
	if (cacheKey) {
		reportPairwiseKeyCache.set(`${cacheKey}::${pKey}::${reportCacheGen}`, result);
		pruneReportCache(reportPairwiseKeyCache);
	}
	// WeakMap identity store só sem perPair.
	if (!hasPerPair) {
		let byDist = reportPairwiseCache.get(inputs);
		if (!byDist) { byDist = new Map(); reportPairwiseCache.set(inputs, byDist); }
		let byPairs = byDist.get(distKey);
		if (!byPairs) {
			byPairs = new Map();
			byDist.set(distKey, byPairs);
		}
		byPairs.set(pKey, result);
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

// ─── Async versions via Web Worker ─────────────────────────
// Off-main-thread compute pros 5 coefs (cohen/fleiss/alpha/alphaBinary/cuAlpha).
// Combos não-cacheadas demoravam 400-1900ms na main thread freezando o frame.
// O worker faz o trabalho em background; main thread fica fluida.
// Caches main-thread continuam relevantes — checados antes do round-trip ao worker.

import { reportKappaAsync as workerReportKappa, reportPairwiseAsync as workerReportPairwise } from './kappaWorkerClient';

export async function reportKappaAsync(
	inputs: EngineKappaInput[],
	cacheKey?: string,
	distance?: DistanceName,
): Promise<KappaReport> {
	const distKey = distance ?? '_';
	const byDist = reportKappaCache.get(inputs);
	const idHit = byDist?.get(distKey);
	if (idHit) return idHit;
	if (cacheKey) {
		const keyed = reportKappaKeyCache.get(`${cacheKey}::${reportCacheGen}`);
		if (keyed) {
			let m = reportKappaCache.get(inputs);
			if (!m) { m = new Map(); reportKappaCache.set(inputs, m); }
			m.set(distKey, keyed);
			return keyed;
		}
	}
	const result = await workerReportKappa(inputs, distance);
	let m = reportKappaCache.get(inputs);
	if (!m) { m = new Map(); reportKappaCache.set(inputs, m); }
	m.set(distKey, result);
	if (cacheKey) {
		reportKappaKeyCache.set(`${cacheKey}::${reportCacheGen}`, result);
		pruneReportCache(reportKappaKeyCache);
	}
	return result;
}

export async function reportPairwiseAsync(
	inputs: EngineKappaInput[],
	pairs: [CoderId, CoderId][],
	cacheKey?: string,
	perPairInputs?: Map<string, EngineKappaInput[]>,
	distance?: DistanceName,
): Promise<PairwiseReport[]> {
	const hasPerPair = perPairInputs !== undefined && perPairInputs.size > 0;
	const pKey = pairsKey(pairs);
	const distKey = distance ?? '_';
	// WeakMap identity cache só sem perPair. Distance vira segunda chave Map (bug 2026-05-13:
	// scopeExtraction reusa `inputs` ref; sem distance no key, cache retornava resultado da
	// chamada anterior com δ diferente).
	if (!hasPerPair) {
		const byDist = reportPairwiseCache.get(inputs);
		const byPairs = byDist?.get(distKey);
		if (byPairs) {
			const hit = byPairs.get(pKey);
			if (hit) return hit;
		}
	}
	// cacheKey-based cache em ambos casos — caller responsável por bbox suffix no key.
	if (cacheKey) {
		const fullKey = `${cacheKey}::${pKey}::${reportCacheGen}`;
		const keyed = reportPairwiseKeyCache.get(fullKey);
		if (keyed) return keyed;
	}
	const result = await workerReportPairwise(inputs, pairs, perPairInputs, distance);
	if (cacheKey) {
		reportPairwiseKeyCache.set(`${cacheKey}::${pKey}::${reportCacheGen}`, result);
		pruneReportCache(reportPairwiseKeyCache);
	}
	if (!hasPerPair) {
		let byDist = reportPairwiseCache.get(inputs);
		if (!byDist) { byDist = new Map(); reportPairwiseCache.set(inputs, byDist); }
		let byPairs = byDist.get(distKey);
		if (!byPairs) {
			byPairs = new Map();
			byDist.set(distKey, byPairs);
		}
		byPairs.set(pKey, result);
	}
	return result;
}
