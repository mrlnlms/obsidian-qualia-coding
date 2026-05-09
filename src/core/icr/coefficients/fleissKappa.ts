/**
 * Fleiss κ — N raters per-char.
 *
 * Pra cada char (unit), conta quantos coders deram cada rating.
 * Pa = average per-unit agreement = (1/M) * Σ [ (Σ n_ij*(n_ij-1)) / (N*(N-1)) ]
 * Pe = Σ p_j² (chance agreement)
 * κ = (Pa − Pe) / (1 − Pe)
 *
 * Edge cases:
 * - N < 2 → 1 (vacuous, single rater não tem agreement)
 * - M == 0 → 1
 * - Pe == 1 → 1
 */

import type { KappaInput } from '../kappaInput';
import { explodeMarkersToCharLabels, iterateAllUnitKeys } from '../kappaInput';

const NONE = '__none__';

export function fleissKappa(input: KappaInput): number {
	const N = input.coders.length;
	if (N < 2) return 1;

	const charMap = explodeMarkersToCharLabels(input.markers);
	const unitRatings: Array<Map<string, number>> = [];

	for (const key of iterateAllUnitKeys(input.sources)) {
		const cm = charMap.get(key);
		const ratingCounts = new Map<string, number>();
		for (const coder of input.coders) {
			const set = cm?.get(coder);
			const r = (set && set.size > 0 ? Array.from(set).sort()[0] : NONE) ?? NONE;
			ratingCounts.set(r, (ratingCounts.get(r) ?? 0) + 1);
		}
		unitRatings.push(ratingCounts);
	}

	const M = unitRatings.length;
	if (M === 0) return 1;

	// Pa: average per-unit agreement
	let pa = 0;
	for (const ratings of unitRatings) {
		let unitAgree = 0;
		for (const count of ratings.values()) {
			unitAgree += count * (count - 1);
		}
		pa += unitAgree / (N * (N - 1));
	}
	pa /= M;

	// Pe: chance agreement (sum of squared category proportions)
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
