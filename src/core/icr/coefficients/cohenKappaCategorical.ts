/**
 * Cohen κ pareado categorical — caminho A (binary-per-label macro-average).
 *
 * Unit = (fileId, sourceRowId, column). Pra cada unit, A e B aplicam SETS de codes.
 * Pra cada code do universo, computa Cohen κ binário (presença/ausência); macro-average
 * sobre codes. Mesma estratégia do cohenKappa.ts texto-likes — diferença é shape
 * categorical (sem char explosion).
 *
 * Spec: docs/superpowers/specs/2026-05-12-icr-set-valued-labels-design.md §3
 */

import type { CategoricalKappaInput } from '../categoricalKappaInput';
import { makeCategoricalUnitKey } from '../categoricalKappaInput';
import type { CoderId } from '../coderTypes';
import { cohenKappaBinary, type CohenKappaReport } from './cohenKappa';

interface BinaryCounts {
	n11: number;
	n10: number;
	n01: number;
	n00: number;
}

export function cohenKappaCategorical(
	input: CategoricalKappaInput,
	coderA: CoderId,
	coderB: CoderId,
): CohenKappaReport {
	// Group entries by unit key → coder → set de codeIds.
	const unitMap = new Map<string, Map<CoderId, Set<string>>>();
	for (const u of input.units) {
		const key = makeCategoricalUnitKey(u.fileId, u.sourceRowId, u.column);
		let coderMap = unitMap.get(key);
		if (!coderMap) {
			coderMap = new Map();
			unitMap.set(key, coderMap);
		}
		coderMap.set(u.coderId, new Set(u.codeIds));
	}

	if (unitMap.size === 0) return { value: 1, perCode: {} };

	// Universe of codes (union A e B sobre todas units).
	const codeUniverse = new Set<string>();
	for (const coderMap of unitMap.values()) {
		for (const coder of [coderA, coderB]) {
			const set = coderMap.get(coder);
			if (set) for (const c of set) codeUniverse.add(c);
		}
	}

	if (codeUniverse.size === 0) return { value: 1, perCode: {} };

	const counts = new Map<string, BinaryCounts>();
	for (const code of codeUniverse) counts.set(code, { n11: 0, n10: 0, n01: 0, n00: 0 });

	for (const coderMap of unitMap.values()) {
		const setA = coderMap.get(coderA);
		const setB = coderMap.get(coderB);
		for (const code of codeUniverse) {
			const inA = setA?.has(code) ?? false;
			const inB = setB?.has(code) ?? false;
			const c = counts.get(code)!;
			if (inA && inB) c.n11++;
			else if (inA && !inB) c.n10++;
			else if (!inA && inB) c.n01++;
			else c.n00++;
		}
	}

	const perCode: Record<string, number> = {};
	for (const [code, c] of counts) perCode[code] = cohenKappaBinary(c);

	const values = Object.values(perCode);
	const value = values.length > 0 ? values.reduce((s, k) => s + k, 0) / values.length : 1;
	return { value, perCode };
}
