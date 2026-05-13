/**
 * Krippendorff α categorical — N coders sobre unit-level decisions (CSV row × column).
 *
 * Mesmo padrão de cálculo do krippendorffAlpha.ts (per-char), mas a unit é
 * `(fileId, sourceRowId, column)` em vez de char position. Cada coder dá UM set de codes
 * por unit; sets podem ter |S| > 1 (multi-label).
 *
 * α = 1 − (Do / De), com δ pluggable.
 *
 * Edge cases:
 * - Empty input → 1
 * - De == 0 → 1 if Do==0 else 0
 *
 * δ default = distanceNominal (preserva comportamento histórico — reduz multi-label a
 * first-code alfabético antes de comparar; singletons batem clássico).
 */

import type { CategoricalKappaInput } from '../categoricalKappaInput';
import { makeCategoricalUnitKey } from '../categoricalKappaInput';
import type { DistanceFunction } from '../distances';
import { distanceNominal } from '../distances';
import type { KrippendorffAlphaOptions } from './krippendorffAlpha';

const EMPTY_KEY = '__none__';
const SET_SEP = ' ';

function canonKey(s: ReadonlySet<string>): string {
	if (s.size === 0) return EMPTY_KEY;
	return [...s].sort().join(SET_SEP);
}

export function krippendorffAlphaCategoricalNominal(
	input: CategoricalKappaInput,
	options: KrippendorffAlphaOptions = {},
): number {
	const δ: DistanceFunction = options.distance ?? distanceNominal;

	// Group entries by unit key → coder → set of codeIds
	const unitMap = new Map<string, Map<string, ReadonlySet<string>>>();
	for (const u of input.units) {
		const key = makeCategoricalUnitKey(u.fileId, u.sourceRowId, u.column);
		let coderMap = unitMap.get(key);
		if (!coderMap) {
			coderMap = new Map();
			unitMap.set(key, coderMap);
		}
		coderMap.set(u.coderId, new Set(u.codeIds));
	}

	if (unitMap.size === 0) return 1;

	// Pra cada unit, list de sets (1 por coder; ausentes = empty)
	const units: Array<Array<ReadonlySet<string>>> = [];
	for (const coderMap of unitMap.values()) {
		const unitRatings: Array<ReadonlySet<string>> = [];
		for (const coder of input.coders) {
			unitRatings.push(coderMap.get(coder) ?? new Set<string>());
		}
		units.push(unitRatings);
	}

	// Marginais globais + representante por chave
	const marginal = new Map<string, number>();
	const keyToSet = new Map<string, ReadonlySet<string>>();

	// Do
	let Do = 0;
	for (const unitRatings of units) {
		const n = unitRatings.length;
		if (n < 2) continue;
		for (let i = 0; i < n; i++) {
			const set_i = unitRatings[i]!;
			const k_i = canonKey(set_i);
			if (!keyToSet.has(k_i)) keyToSet.set(k_i, set_i);
			marginal.set(k_i, (marginal.get(k_i) ?? 0) + 1);
			for (let j = 0; j < n; j++) {
				if (i === j) continue;
				const d = δ(set_i, unitRatings[j]!);
				Do += (d * d) / (n - 1);
			}
		}
	}

	if (marginal.size === 0) return 1;

	let N = 0;
	for (const v of marginal.values()) N += v;
	if (N < 2) return 1;

	// De
	let De = 0;
	const keys = [...marginal.keys()];
	for (let i = 0; i < keys.length; i++) {
		for (let j = 0; j < keys.length; j++) {
			if (i === j) continue;
			const k1 = keys[i]!;
			const k2 = keys[j]!;
			const n1 = marginal.get(k1)!;
			const n2 = marginal.get(k2)!;
			const d = δ(keyToSet.get(k1)!, keyToSet.get(k2)!);
			De += (n1 * n2 * d * d) / (N - 1);
		}
	}

	if (De === 0) return Do === 0 ? 1 : 0;
	return 1 - Do / De;
}
