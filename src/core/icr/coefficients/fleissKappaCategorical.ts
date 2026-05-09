/**
 * Fleiss κ — N coders sobre unit-level decisions (cod row).
 *
 * Cada unit (fileId, sourceRowId, column): conta quantos coders deram cada rating.
 * Pa = average per-unit agreement; Pe = chance agreement (sum of squared category proportions).
 * κ = (Pa − Pe) / (1 − Pe).
 */

import type { CategoricalKappaInput } from '../categoricalKappaInput';
import { makeCategoricalUnitKey } from '../categoricalKappaInput';

const NONE = '__none__';

export function fleissKappaCategorical(input: CategoricalKappaInput): number {
	const N = input.coders.length;
	if (N < 2) return 1;

	const unitMap = new Map<string, Map<string, string>>();
	for (const u of input.units) {
		const key = makeCategoricalUnitKey(u.fileId, u.sourceRowId, u.column);
		let coderMap = unitMap.get(key);
		if (!coderMap) {
			coderMap = new Map();
			unitMap.set(key, coderMap);
		}
		const code = u.codeIds.length > 0 ? [...u.codeIds].sort()[0]! : NONE;
		coderMap.set(u.coderId, code);
	}

	if (unitMap.size === 0) return 1;

	// Pra cada unit: count categories given by each coder (NONE pra coders ausentes)
	const unitRatings: Array<Map<string, number>> = [];
	for (const coderMap of unitMap.values()) {
		const ratingCounts = new Map<string, number>();
		for (const coder of input.coders) {
			const r = coderMap.get(coder) ?? NONE;
			ratingCounts.set(r, (ratingCounts.get(r) ?? 0) + 1);
		}
		unitRatings.push(ratingCounts);
	}

	const M = unitRatings.length;

	// Pa: average per-unit agreement
	let pa = 0;
	for (const ratings of unitRatings) {
		let unitAgree = 0;
		for (const count of ratings.values()) unitAgree += count * (count - 1);
		pa += unitAgree / (N * (N - 1));
	}
	pa /= M;

	// Pe: chance agreement
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
