/**
 * Smoke C1 — F5-multilabel sob δ_nominal vs δ_jaccard vs δ_MASI.
 *
 * Reproduz cenário canônico do seed `scripts/seed-smoke-icr.mjs` (file F5-multilabel.md)
 * em-memória pra validar diretamente que o motor κ retorna valores diferentes pra cada δ
 * — checkpoint matemático antes da UI em C3.
 *
 * Cenário:
 *   linha 0 ([0,41)): default={A,B}, carla={A,B}, joana={A,B}      → identical multi-label
 *   linha 2 ([2,38)): default={A,B}, carla={A,B,C}, joana={A,B}    → subset multi-label
 *   linha 4 ([4,40)): default={A,B}, carla={A,C}, joana={A,D}      → lateral overlap multi-label
 *   linha 6 ([6,40)): default={A,B}, joana={C,D}                   → disjoint multi-label (carla ausente)
 *   linha 8 ([8,37)): default={A}, carla={A}, joana={A}            → single-label puro (controle)
 *
 * Esperado:
 *   α_nominal: pra todos pares multi-label, redução first-code colapsa em 'A' → agreement falso
 *   α_jaccard: separa subset/lateral → α < α_nominal
 *   α_MASI:    valor distinto de α_jaccard (sensibilidade diferente subset vs lateral)
 */

import { describe, it, expect } from 'vitest';
import { krippendorffAlphaNominal } from '../../../src/core/icr/coefficients/krippendorffAlpha';
import { distanceJaccard, distanceMASI } from '../../../src/core/icr/distances';
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
		// Linha 8 — single-label puro (controle)
		{ coderId: 'human:default', range: range(8, 37), codeIds: ['c_temaA'] },
		{ coderId: 'human:carla',   range: range(8, 37), codeIds: ['c_temaA'] },
		{ coderId: 'human:joana',   range: range(8, 37), codeIds: ['c_temaA'] },
	],
	sources: [{ fileId: FILE, locator: '', totalUnits: 50 }],
	coders: ['human:default', 'human:carla', 'human:joana'],
};

describe('Smoke C1 — F5-multilabel cenário canônico', () => {
	it('α_jaccard < α_nominal (motor distingue subset/lateral)', () => {
		const α_nominal = krippendorffAlphaNominal(inputF5);
		const α_jaccard = krippendorffAlphaNominal(inputF5, { distance: distanceJaccard });
		expect(α_jaccard).toBeLessThan(α_nominal);
	});

	it('α_MASI difere de α_jaccard em magnitude (sensibilidade subset vs lateral)', () => {
		const α_jaccard = krippendorffAlphaNominal(inputF5, { distance: distanceJaccard });
		const α_masi = krippendorffAlphaNominal(inputF5, { distance: distanceMASI });
		expect(α_masi).not.toBeCloseTo(α_jaccard, 3);
	});

	it('imprime valores numéricos (registro de evidência do checkpoint)', () => {
		const α_nominal = krippendorffAlphaNominal(inputF5);
		const α_jaccard = krippendorffAlphaNominal(inputF5, { distance: distanceJaccard });
		const α_masi = krippendorffAlphaNominal(inputF5, { distance: distanceMASI });
		// Loga pra evidência empírica — checkpoint manual do plan §C1.10
		// eslint-disable-next-line no-console
		console.log(`F5 α_nominal=${α_nominal.toFixed(4)} α_jaccard=${α_jaccard.toFixed(4)} α_MASI=${α_masi.toFixed(4)}`);
		// Sanity bounds (não cravar valor exato — varia com fórmula)
		expect(α_nominal).toBeGreaterThanOrEqual(-1);
		expect(α_nominal).toBeLessThanOrEqual(1);
		expect(α_jaccard).toBeGreaterThanOrEqual(-1);
		expect(α_jaccard).toBeLessThanOrEqual(1);
		expect(α_masi).toBeGreaterThanOrEqual(-1);
		expect(α_masi).toBeLessThanOrEqual(1);
	});
});
