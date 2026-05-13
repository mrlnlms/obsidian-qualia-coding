/**
 * Fleiss κ categorical — N coders sobre unit-level decisions (CSV row × column) com fallback
 * automático pra Krippendorff α categorical em escopo multi-label.
 *
 * Detecção: se algum unit tem `codeIds.length > 1`, delegate pra
 * `krippendorffAlphaCategoricalNominal` que aceita `{ distance }`.
 * Single-label puro: Fleiss clássico sem redução first-code (categoria = canonical set).
 *
 * Spec: docs/superpowers/specs/2026-05-12-icr-set-valued-labels-design.md §4
 */

import type { CategoricalKappaInput } from '../categoricalKappaInput';
import { makeCategoricalUnitKey } from '../categoricalKappaInput';
import { krippendorffAlphaCategoricalNominal } from './krippendorffAlphaCategorical';
import type { KrippendorffAlphaOptions } from './krippendorffAlpha';

const EMPTY_KEY = '__none__';
const SET_SEP = ' ';

function canonKey(s: ReadonlySet<string>): string {
	if (s.size === 0) return EMPTY_KEY;
	return [...s].sort().join(SET_SEP);
}

export function fleissKappaCategorical(
	input: CategoricalKappaInput,
	options: KrippendorffAlphaOptions = {},
): number {
	if (hasMultiLabelUnits(input)) {
		return krippendorffAlphaCategoricalNominal(input, options);
	}
	return computeFleissCategoricalClassic(input);
}

function hasMultiLabelUnits(input: CategoricalKappaInput): boolean {
	for (const u of input.units) {
		if (u.codeIds.length > 1) return true;
	}
	return false;
}

function computeFleissCategoricalClassic(input: CategoricalKappaInput): number {
	const N = input.coders.length;
	if (N < 2) return 1;

	const unitMap = new Map<string, Map<string, Set<string>>>();
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

	const unitRatings: Array<Map<string, number>> = [];
	for (const coderMap of unitMap.values()) {
		const ratingCounts = new Map<string, number>();
		for (const coder of input.coders) {
			const r = canonKey(coderMap.get(coder) ?? new Set());
			ratingCounts.set(r, (ratingCounts.get(r) ?? 0) + 1);
		}
		unitRatings.push(ratingCounts);
	}

	const M = unitRatings.length;
	if (M === 0) return 1;

	let pa = 0;
	for (const ratings of unitRatings) {
		let unitAgree = 0;
		for (const count of ratings.values()) unitAgree += count * (count - 1);
		pa += unitAgree / (N * (N - 1));
	}
	pa /= M;

	const pCat = new Map<string, number>();
	for (const ratings of unitRatings) {
		for (const [cat, c] of ratings.entries()) {
			pCat.set(cat, (pCat.get(cat) ?? 0) + c);
		}
	}
	let pe = 0;
	for (const c of pCat.values()) {
		const p = c / (M * N);
		pe += p * p;
	}

	if (pe === 1) return 1;
	return (pa - pe) / (1 - pe);
}
