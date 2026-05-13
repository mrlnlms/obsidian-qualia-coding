/**
 * Cohen κ pareado per-char — caminho A (binary-per-label macro-average).
 *
 * Pra cada code do universo (união de codes marcados por A ou B em qualquer unit),
 * computa Cohen κ binário (presença/ausência por unit) e tira média simples.
 * Multi-label é tratado nativamente: cada code é seu eixo binário independente.
 *
 * Reference: NVivo "multi-coder coding comparison" — multi-label coding comparado
 * via per-label agreement; tarefas similares em NLP (multi-label classification metrics).
 *
 * Equivalência single-label: pra |set|=1 por marker, cada code aparece em exatamente
 * 1 categoria por unit; macro-average degenera no Cohen κ multi-categorical clássico.
 *
 * Edge cases:
 * - Empty input → vacuous κ = 1, perCode = {}
 * - Pe == 1 numa categoria binária → κ = 1 if Po==1 else 0 (degeneração)
 *
 * Spec: docs/superpowers/specs/2026-05-12-icr-set-valued-labels-design.md §3
 */

import type { KappaInput } from '../kappaInput';
import { explodeMarkersToCharLabels, iterateAllUnitKeys } from '../kappaInput';
import type { CoderId } from '../coderTypes';

export interface CohenKappaReport {
	value: number;
	perCode: Record<string, number>;
}

interface BinaryCounts {
	n11: number;
	n10: number;
	n01: number;
	n00: number;
}

export function cohenKappa(
	input: KappaInput,
	coderA: CoderId,
	coderB: CoderId,
): CohenKappaReport {
	const charMap = explodeMarkersToCharLabels(input.markers);

	// Coleta universe of codes (union sobre todos coders/units; pareados aqui são A e B
	// mas other coders só geram trabalho extra — code aparece no perCode se algum coder o usou).
	const codeUniverse = new Set<string>();
	for (const cm of charMap.values()) {
		for (const coder of [coderA, coderB]) {
			const set = cm.get(coder);
			if (set) for (const c of set) codeUniverse.add(c);
		}
	}

	if (codeUniverse.size === 0) return { value: 1, perCode: {} };

	const counts = new Map<string, BinaryCounts>();
	for (const code of codeUniverse) counts.set(code, { n11: 0, n10: 0, n01: 0, n00: 0 });

	for (const key of iterateAllUnitKeys(input.sources)) {
		const cm = charMap.get(key);
		const setA = cm?.get(coderA);
		const setB = cm?.get(coderB);
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

export function cohenKappaBinary(m: BinaryCounts): number {
	const N = m.n11 + m.n10 + m.n01 + m.n00;
	if (N === 0) return 1;
	const po = (m.n11 + m.n00) / N;
	const margA = (m.n11 + m.n10) / N;
	const margB = (m.n11 + m.n01) / N;
	const pe = margA * margB + (1 - margA) * (1 - margB);
	if (pe === 1) return po === 1 ? 1 : 0;
	return (po - pe) / (1 - pe);
}
