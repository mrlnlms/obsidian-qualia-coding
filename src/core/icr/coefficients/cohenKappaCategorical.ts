/**
 * Cohen κ pareado sobre unit-level decisions (cod row).
 *
 * Universe = todas units distintas onde ALGUM coder marcou. Coders que não marcaram
 * uma unit têm rating '__none__'. Matriz de confusão, Po, Pe, κ standard.
 *
 * Diferente de cohenKappa.ts (texto-likes): não usa char explosion. Opera sobre
 * unit-level decisions direto.
 */

import type { CategoricalKappaInput } from '../categoricalKappaInput';
import { makeCategoricalUnitKey } from '../categoricalKappaInput';
import type { CoderId } from '../coderTypes';

const NONE = '__none__';

export function cohenKappaCategorical(
	input: CategoricalKappaInput,
	coderA: CoderId,
	coderB: CoderId,
): number {
	const unitMap = new Map<string, Map<CoderId, string>>();
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

	const matrix = new Map<string, number>();
	const marginalsA = new Map<string, number>();
	const marginalsB = new Map<string, number>();
	let total = 0;

	for (const coderMap of unitMap.values()) {
		const rA = coderMap.get(coderA) ?? NONE;
		const rB = coderMap.get(coderB) ?? NONE;
		matrix.set(`${rA}|${rB}`, (matrix.get(`${rA}|${rB}`) ?? 0) + 1);
		marginalsA.set(rA, (marginalsA.get(rA) ?? 0) + 1);
		marginalsB.set(rB, (marginalsB.get(rB) ?? 0) + 1);
		total++;
	}

	let po = 0;
	const allCats = new Set([...marginalsA.keys(), ...marginalsB.keys()]);
	for (const r of allCats) po += matrix.get(`${r}|${r}`) ?? 0;
	po /= total;

	let pe = 0;
	for (const r of allCats) {
		const pA = (marginalsA.get(r) ?? 0) / total;
		const pB = (marginalsB.get(r) ?? 0) / total;
		pe += pA * pB;
	}

	if (pe === 1) return 1;
	return (po - pe) / (1 - pe);
}
