/**
 * Cohen κ pareado per-char.
 *
 * Each char (fileId, locator, pos) é unit. Rating per coder = primeiro código aplicado
 * (ordem alfabética determinística) ou '__none__' se coder não marcou neste char.
 *
 * κ = (Po − Pe) / (1 − Pe)
 *
 * Edge cases:
 * - Empty input → vacuous κ = 1
 * - Pe == 1 (chance perfeita) → κ undefined; retorna 1 por convenção
 */

import type { KappaInput } from '../kappaInput';
import { explodeMarkersToCharLabels, iterateAllCharKeys } from '../kappaInput';
import type { CoderId } from '../coderTypes';

const NONE = '__none__';

export function cohenKappa(input: KappaInput, coderA: CoderId, coderB: CoderId): number {
	const charMap = explodeMarkersToCharLabels(input.markers);

	const matrix = new Map<string, number>();
	const marginalsA = new Map<string, number>();
	const marginalsB = new Map<string, number>();
	let total = 0;

	for (const key of iterateAllCharKeys(input.sources)) {
		const cm = charMap.get(key);
		const rA = pickFirstCode(cm?.get(coderA)) ?? NONE;
		const rB = pickFirstCode(cm?.get(coderB)) ?? NONE;
		const cellKey = `${rA}|${rB}`;
		matrix.set(cellKey, (matrix.get(cellKey) ?? 0) + 1);
		marginalsA.set(rA, (marginalsA.get(rA) ?? 0) + 1);
		marginalsB.set(rB, (marginalsB.get(rB) ?? 0) + 1);
		total++;
	}

	if (total === 0) return 1;

	// Po: observed agreement (diagonal)
	let po = 0;
	const allCats = new Set([...marginalsA.keys(), ...marginalsB.keys()]);
	for (const rating of allCats) {
		po += matrix.get(`${rating}|${rating}`) ?? 0;
	}
	po /= total;

	// Pe: expected agreement by chance
	let pe = 0;
	for (const rating of allCats) {
		const pA = (marginalsA.get(rating) ?? 0) / total;
		const pB = (marginalsB.get(rating) ?? 0) / total;
		pe += pA * pB;
	}

	if (pe === 1) return 1;
	return (po - pe) / (1 - pe);
}

function pickFirstCode(set: Set<string> | undefined): string | undefined {
	if (!set || set.size === 0) return undefined;
	return Array.from(set).sort()[0];
}
