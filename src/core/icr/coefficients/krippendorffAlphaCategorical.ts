/**
 * Krippendorff α nominal — N coders sobre unit-level decisions (cod row).
 *
 * α = 1 − (Do / De). Coincidence matrix sobre unit-level ratings.
 * Robust to missing data (coders que não marcaram uma unit).
 */

import type { CategoricalKappaInput } from '../categoricalKappaInput';
import { makeCategoricalUnitKey } from '../categoricalKappaInput';

const NONE = '__none__';

export function krippendorffAlphaCategoricalNominal(input: CategoricalKappaInput): number {
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

	// Build units: each unit → coder → category (NONE pra ausentes)
	const units: Array<Map<string, string>> = [];
	for (const coderMap of unitMap.values()) {
		const unit = new Map<string, string>();
		for (const coder of input.coders) {
			unit.set(coder, coderMap.get(coder) ?? NONE);
		}
		units.push(unit);
	}

	// Coincidence matrix
	const coincidence = new Map<string, Map<string, number>>();
	for (const unit of units) {
		const ratings = Array.from(unit.values());
		const n = ratings.length;
		if (n < 2) continue;

		const catCounts = new Map<string, number>();
		for (const r of ratings) catCounts.set(r, (catCounts.get(r) ?? 0) + 1);

		for (const [c1, n1] of catCounts) {
			let row = coincidence.get(c1);
			if (!row) { row = new Map(); coincidence.set(c1, row); }
			for (const [c2, n2] of catCounts) {
				const contrib = c1 === c2 ? (n1 * (n1 - 1)) / (n - 1) : (n1 * n2) / (n - 1);
				row.set(c2, (row.get(c2) ?? 0) + contrib);
			}
		}
	}

	if (coincidence.size === 0) return 1;

	// Marginais
	const nc = new Map<string, number>();
	for (const [c1, row] of coincidence) {
		let sum = 0;
		for (const v of row.values()) sum += v;
		nc.set(c1, sum);
	}
	let n = 0;
	for (const v of nc.values()) n += v;

	if (n === 0) return 1;

	// Do
	let Do = 0;
	for (const [c1, row] of coincidence) {
		for (const [c2, v] of row) {
			if (c1 !== c2) Do += v;
		}
	}

	// De
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
