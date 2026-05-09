/**
 * Krippendorff α nominal — N coders, robust to missing data.
 *
 * Per-char unit space; rating = primeiro código aplicado pelo coder, '__none__' se não marcou.
 *
 * α = 1 − (Do / De)
 *   Do = observed disagreement (off-diagonal coincidence sum)
 *   De = expected disagreement (chance, marginais)
 *
 * Reference: Krippendorff (2004) "Content Analysis", Ch. 11.
 *
 * Edge cases:
 * - Empty input → 1
 * - De == 0 → 1 if Do==0 else 0
 *
 * TODO revisitar com fórmula da literatura quando user trouxer evidência adicional pra casos canônicos.
 */

import type { KappaInput } from '../kappaInput';
import { explodeMarkersToCharLabels, iterateAllUnitKeys } from '../kappaInput';

const NONE = '__none__';

export function krippendorffAlphaNominal(input: KappaInput): number {
	const charMap = explodeMarkersToCharLabels(input.markers);

	// Reliability data: each unit → coder → category
	const units: Array<Map<string, string>> = [];
	for (const key of iterateAllUnitKeys(input.sources)) {
		const cm = charMap.get(key);
		const unit = new Map<string, string>();
		for (const coder of input.coders) {
			const set = cm?.get(coder);
			const r = (set && set.size > 0 ? Array.from(set).sort()[0] : NONE) ?? NONE;
			unit.set(coder, r);
		}
		units.push(unit);
	}

	if (units.length === 0) return 1;

	// Coincidence matrix: c[c1][c2] = sum over units of (n_unit_c1 * n_unit_c2 / (n_unit - 1)) for c1!=c2
	// + (n_unit_c1 * (n_unit_c1 - 1) / (n_unit - 1)) for c1==c2
	const coincidence = new Map<string, Map<string, number>>();
	for (const unit of units) {
		const ratings = Array.from(unit.values());
		const n = ratings.length;
		if (n < 2) continue;

		// Count categories within unit
		const catCounts = new Map<string, number>();
		for (const r of ratings) catCounts.set(r, (catCounts.get(r) ?? 0) + 1);

		for (const [c1, n1] of catCounts) {
			let row = coincidence.get(c1);
			if (!row) { row = new Map(); coincidence.set(c1, row); }
			for (const [c2, n2] of catCounts) {
				let contrib: number;
				if (c1 === c2) {
					contrib = (n1 * (n1 - 1)) / (n - 1);
				} else {
					contrib = (n1 * n2) / (n - 1);
				}
				row.set(c2, (row.get(c2) ?? 0) + contrib);
			}
		}
	}

	if (coincidence.size === 0) return 1;

	// Marginais (n_c)
	const nc = new Map<string, number>();
	for (const [c1, row] of coincidence) {
		let sum = 0;
		for (const v of row.values()) sum += v;
		nc.set(c1, sum);
	}
	let n = 0;
	for (const v of nc.values()) n += v;

	if (n === 0) return 1;

	// Do: observed disagreement (off-diagonal sum)
	let Do = 0;
	for (const [c1, row] of coincidence) {
		for (const [c2, v] of row) {
			if (c1 !== c2) Do += v;
		}
	}

	// De: expected disagreement
	let De = 0;
	const cats = Array.from(nc.keys());
	for (let i = 0; i < cats.length; i++) {
		for (let j = 0; j < cats.length; j++) {
			if (i === j) continue;
			const ni = nc.get(cats[i]!)!;
			const nj = nc.get(cats[j]!)!;
			De += (ni * nj) / (n - 1 || 1);
		}
	}

	if (De === 0) return Do === 0 ? 1 : 0;
	return 1 - Do / De;
}
