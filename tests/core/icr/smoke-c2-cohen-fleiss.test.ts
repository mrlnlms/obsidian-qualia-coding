/**
 * Smoke C2 — Cohen κ caminho A perCode + Fleiss κ fallback automático.
 *
 * Cenário F5-multilabel do seed `scripts/seed-smoke-icr.mjs`:
 *   - linha 0: identical multi-label
 *   - linha 2: subset
 *   - linha 4: lateral overlap
 *   - linha 6: disjoint
 *   - linha 8: single-label puro
 *
 * Validações:
 *   - Cohen κ retorna {value, perCode} com 1 entry por code do universo
 *   - perCode breakdown captura sinal fino: codes onde coders concordam (Tema A) vs divergem (Tema D/E)
 *   - Fleiss κ em escopo multi-label delega pra α (matcha α com mesma δ)
 *   - Fleiss κ em escopo single-label puro mantém Fleiss clássico
 */

import { describe, it, expect } from 'vitest';
import { cohenKappa } from '../../../src/core/icr/coefficients/cohenKappa';
import { fleissKappa } from '../../../src/core/icr/coefficients/fleissKappa';
import { krippendorffAlphaNominal } from '../../../src/core/icr/coefficients/krippendorffAlpha';
import { distanceJaccard } from '../../../src/core/icr/distances';
import type { KappaInput } from '../../../src/core/icr/kappaInput';

const FILE = 'smoke-icr-fixes/F5-multilabel.md';

function range(from: number, to: number) {
	return { fileId: FILE, locator: '', from, to };
}

const inputF5: KappaInput = {
	markers: [
		// Linha 0 — identical
		{ coderId: 'human:default', range: range(0, 41), codeIds: ['c_temaA', 'c_temaB'] },
		{ coderId: 'human:carla',   range: range(0, 41), codeIds: ['c_temaA', 'c_temaB'] },
		{ coderId: 'human:joana',   range: range(0, 41), codeIds: ['c_temaA', 'c_temaB'] },
		// Linha 2 — subset
		{ coderId: 'human:default', range: range(2, 38), codeIds: ['c_temaA', 'c_temaB'] },
		{ coderId: 'human:carla',   range: range(2, 38), codeIds: ['c_temaA', 'c_temaB', 'c_temaC'] },
		{ coderId: 'human:joana',   range: range(2, 38), codeIds: ['c_temaA', 'c_temaB'] },
		// Linha 4 — lateral
		{ coderId: 'human:default', range: range(4, 40), codeIds: ['c_temaA', 'c_temaB'] },
		{ coderId: 'human:carla',   range: range(4, 40), codeIds: ['c_temaA', 'c_temaC'] },
		{ coderId: 'human:joana',   range: range(4, 40), codeIds: ['c_temaA', 'c_temaD'] },
		// Linha 6 — disjoint (carla ausente)
		{ coderId: 'human:default', range: range(6, 40), codeIds: ['c_temaA', 'c_temaB'] },
		{ coderId: 'human:joana',   range: range(6, 40), codeIds: ['c_temaC', 'c_temaD'] },
		// Linha 8 — single-label puro
		{ coderId: 'human:default', range: range(8, 37), codeIds: ['c_temaA'] },
		{ coderId: 'human:carla',   range: range(8, 37), codeIds: ['c_temaA'] },
		{ coderId: 'human:joana',   range: range(8, 37), codeIds: ['c_temaA'] },
	],
	sources: [{ fileId: FILE, locator: '', totalUnits: 50 }],
	coders: ['human:default', 'human:carla', 'human:joana'],
};

describe('Smoke C2 — Cohen κ caminho A perCode', () => {
	it('cohenKappa(default, carla) retorna {value, perCode} com entry por code', () => {
		const r = cohenKappa(inputF5, 'human:default', 'human:carla');
		expect(r).toHaveProperty('value');
		expect(r).toHaveProperty('perCode');
		// Universe de F5: Tema A, B, C, D
		expect(r.perCode).toHaveProperty('c_temaA');
		expect(r.perCode).toHaveProperty('c_temaB');
		expect(r.perCode).toHaveProperty('c_temaC');
		// Tema A: ambos coders marcam sempre → κ = 1
		expect(r.perCode.c_temaA).toBeCloseTo(1.0, 2);
	});

	it('perCode breakdown captura sinal fino (codes divergentes têm κ menor)', () => {
		const r = cohenKappa(inputF5, 'human:default', 'human:joana');
		// Tema A: ambos sempre marcam → κ = 1
		expect(r.perCode.c_temaA).toBeCloseTo(1.0, 2);
		// Tema D: só joana marca em 1 linha (lateral) → presence assimétrica → κ baixo/negativo
		expect(r.perCode.c_temaD).toBeLessThanOrEqual(0.1);
	});

	it('imprime valores de evidência do checkpoint', () => {
		const r = cohenKappa(inputF5, 'human:default', 'human:carla');
		// eslint-disable-next-line no-console
		console.log(`F5 Cohen κ(default,carla) value=${r.value.toFixed(4)} perCode=${JSON.stringify(
			Object.fromEntries(Object.entries(r.perCode).map(([k, v]) => [k, v.toFixed(3)]))
		)}`);
		expect(r.value).toBeGreaterThanOrEqual(-1);
		expect(r.value).toBeLessThanOrEqual(1);
	});
});

describe('Smoke C2 — Fleiss κ fallback automático', () => {
	it('escopo F5 (multi-label) delega Fleiss pra α com mesma δ', () => {
		const fleissJaccard = fleissKappa(inputF5, { distance: distanceJaccard });
		const alphaJaccard = krippendorffAlphaNominal(inputF5, { distance: distanceJaccard });
		expect(fleissJaccard).toBeCloseTo(alphaJaccard, 6);
	});

	it('escopo single-label puro mantém Fleiss clássico (não delega)', () => {
		// Reusa só linha 8 do F5 (single-label puro)
		const inputSingleLabel: KappaInput = {
			markers: inputF5.markers.filter(m => m.range.from === 8 && m.range.to === 37),
			sources: inputF5.sources,
			coders: inputF5.coders,
		};
		const fleiss = fleissKappa(inputSingleLabel);
		// Não delega: comportamento Fleiss clássico (3 coders concordando em 'c_temaA' → κ=1)
		expect(fleiss).toBeCloseTo(1.0, 2);
	});
});
