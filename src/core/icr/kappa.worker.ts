/**
 * Kappa Worker — compute pesado dos 5 coeficientes ICR fora da main thread.
 *
 * Recebe `{ id, inputs, pairs? }` via postMessage e devolve `{ id, result }`.
 *
 * IMPORTANTE: este arquivo é bundleado standalone pelo esbuild (plugin
 * `kappa-worker-inline`) e injetado como string em main.js. Ele NÃO pode
 * importar nada que dependa do runtime Obsidian (vault, app, etc) — só
 * tipos + os coeficientes puros.
 */

import { cohenKappa } from './coefficients/cohenKappa';
import { cohenKappaCategorical } from './coefficients/cohenKappaCategorical';
import { fleissKappa } from './coefficients/fleissKappa';
import { fleissKappaCategorical } from './coefficients/fleissKappaCategorical';
import { krippendorffAlphaNominal } from './coefficients/krippendorffAlpha';
import { krippendorffAlphaCategoricalNominal } from './coefficients/krippendorffAlphaCategorical';
import { alphaBinary } from './coefficients/alphaBinary';
import { cuAlpha } from './coefficients/cuAlpha';
import type { KappaInput } from './kappaInput';
import type { CategoricalKappaInput } from './categoricalKappaInput';
import type { CoderId } from './coderTypes';
import type { EngineId } from './reporter';

// Re-implementa shape sem importar reporter.ts (que tem caches e listeners).
// As 4 funções abaixo (isCategorical, computeAll, aggregateReports, reportKappa
// + filterKappaInputToPair) são copiadas LITERALMENTE de reporter.ts.
// Mantenedor: se mudar a lógica em reporter.ts, propagar aqui também.
// Validação cruzada: a chamada via worker e a chamada síncrona main-thread
// devem retornar resultados idênticos pra mesma entrada.

interface EngineKappaInput {
	engine: EngineId;
	kappaInput: KappaInput | CategoricalKappaInput;
}

interface CoefficientReport {
	cohenKappa: Record<string, number>;
	fleissKappa: number;
	alphaNominal: number;
	alphaBinary: number;
	cuAlpha: number;
}

interface KappaReport {
	byEngine: Partial<Record<EngineId, CoefficientReport>>;
	aggregate: CoefficientReport;
	weights: Partial<Record<EngineId, number>>;
	aggregateWarnings: string[];
}

interface PairwiseReport {
	pair: [CoderId, CoderId];
	report: KappaReport;
}

const TEXT_LIKE: EngineId[] = ['markdown', 'pdf', 'csvSegment'];
const TEMPORAL: EngineId[] = ['audio', 'video'];
const CATEGORICAL: EngineId[] = ['csvRow'];
const SPATIAL: EngineId[] = ['pdfShape', 'image'];

function isCategorical(input: KappaInput | CategoricalKappaInput): input is CategoricalKappaInput {
	return 'units' in input;
}

function computeAll(input: KappaInput | CategoricalKappaInput): CoefficientReport {
	if (isCategorical(input)) {
		const cohenK: Record<string, number> = {};
		for (let i = 0; i < input.coders.length; i++) {
			for (let j = i + 1; j < input.coders.length; j++) {
				cohenK[`${input.coders[i]}|${input.coders[j]}`] = cohenKappaCategorical(input, input.coders[i]!, input.coders[j]!);
			}
		}
		return {
			cohenKappa: cohenK,
			fleissKappa: fleissKappaCategorical(input),
			alphaNominal: krippendorffAlphaCategoricalNominal(input),
			alphaBinary: 1,
			cuAlpha: 1,
		};
	}
	const cohenK: Record<string, number> = {};
	for (let i = 0; i < input.coders.length; i++) {
		for (let j = i + 1; j < input.coders.length; j++) {
			cohenK[`${input.coders[i]}|${input.coders[j]}`] = cohenKappa(input, input.coders[i]!, input.coders[j]!);
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
	const allCohenKeys = new Set<string>();
	for (const e of engines) for (const k of Object.keys(byEngine[e]!.cohenKappa)) allCohenKeys.add(k);
	const cohenAgg: Record<string, number> = {};
	for (const key of allCohenKeys) {
		let sum = 0;
		let used = 0;
		for (const e of engines) {
			const v = byEngine[e]!.cohenKappa[key];
			const w = weights[e] ?? 0;
			if (v !== undefined) { sum += v * w; used += w; }
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

function reportKappaCore(inputs: EngineKappaInput[]): KappaReport {
	const byEngine: Partial<Record<EngineId, CoefficientReport>> = {};
	const weights: Partial<Record<EngineId, number>> = {};
	for (const { engine, kappaInput } of inputs) {
		byEngine[engine] = computeAll(kappaInput);
		weights[engine] = isCategorical(kappaInput) ? kappaInput.units.length : kappaInput.markers.length;
	}
	const aggregate = aggregateReports(byEngine, weights);
	const aggregateWarnings: string[] = [];
	const present = Object.keys(byEngine) as EngineId[];
	const families = new Set<string>();
	for (const e of present) {
		if (TEXT_LIKE.includes(e)) families.add('chars');
		if (TEMPORAL.includes(e)) families.add('seconds');
		if (CATEGORICAL.includes(e)) families.add('categorical');
		if (SPATIAL.includes(e)) families.add('spatial-bbox');
	}
	if (families.size > 1) {
		aggregateWarnings.push('Aggregate combines engines with incomparable units (chars vs seconds vs categorical vs spatial-bbox) — use per-engine values for analytical comparison');
	}
	return { byEngine, aggregate, weights, aggregateWarnings };
}

function filterKappaInputToPair(
	input: KappaInput | CategoricalKappaInput,
	pair: [CoderId, CoderId],
): KappaInput | CategoricalKappaInput {
	const [a, b] = pair;
	if (isCategorical(input)) {
		return { units: input.units.filter((u: { coderId: CoderId }) => u.coderId === a || u.coderId === b), coders: [a, b] };
	}
	return {
		markers: input.markers.filter((m: { coderId: CoderId }) => m.coderId === a || m.coderId === b),
		sources: input.sources,
		coders: [a, b],
	};
}

function reportPairwiseCore(
	inputs: EngineKappaInput[],
	pairs: [CoderId, CoderId][],
): PairwiseReport[] {
	return pairs.map(pair => {
		const filtered: EngineKappaInput[] = inputs.map(input => ({
			engine: input.engine,
			kappaInput: filterKappaInputToPair(input.kappaInput, pair),
		}));
		return { pair, report: reportKappaCore(filtered) };
	});
}

// ─── Message protocol ──────────────────────────────────────

type Request =
	| { id: number; op: 'reportKappa'; inputs: EngineKappaInput[] }
	| { id: number; op: 'reportPairwise'; inputs: EngineKappaInput[]; pairs: [CoderId, CoderId][] };

type Response =
	| { id: number; ok: true; op: 'reportKappa'; result: KappaReport }
	| { id: number; ok: true; op: 'reportPairwise'; result: PairwiseReport[] }
	| { id: number; ok: false; error: string };

// `self` é WorkerGlobalScope quando rodando como worker.
const ctx = self as unknown as Worker;

ctx.addEventListener('message', (ev: MessageEvent<Request>) => {
	const req = ev.data;
	try {
		if (req.op === 'reportKappa') {
			const result = reportKappaCore(req.inputs);
			const resp: Response = { id: req.id, ok: true, op: 'reportKappa', result };
			ctx.postMessage(resp);
		} else if (req.op === 'reportPairwise') {
			const result = reportPairwiseCore(req.inputs, req.pairs);
			const resp: Response = { id: req.id, ok: true, op: 'reportPairwise', result };
			ctx.postMessage(resp);
		}
	} catch (e) {
		const err = e instanceof Error ? e.message : String(e);
		const resp: Response = { id: req.id, ok: false, error: err };
		ctx.postMessage(resp);
	}
});

export {};
