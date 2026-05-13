import { describe, it, expect } from 'vitest';
import { krippendorffAlphaNominal } from '../../../../src/core/icr/coefficients/krippendorffAlpha';
import { distanceJaccard, distanceMASI, distanceNominal } from '../../../../src/core/icr/distances';
import type { KappaInput } from '../../../../src/core/icr/kappaInput';

describe('krippendorffAlphaNominal', () => {
	it('returns 1.0 on perfect agreement', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(1.0, 3);
	});

	it('returns near 0 on chance-level agreement (independent distributions)', () => {
		// A marca 0-9 com c1, B marca 5-14 com c1, totalUnits=20.
		// Overlap em 5-9 (concordam c1), 0-4 (A só), 10-14 (B só), 15-19 (ambos __none__).
		// Pa = 0.5, Pe = 0.5 → α ≈ 0 (chance).
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		const alpha = krippendorffAlphaNominal(input);
		expect(Math.abs(alpha)).toBeLessThan(0.2);
	});

	it('returns negative alpha on systematic disagreement', () => {
		// A marca 0-4, B marca 5-9, totalUnits=10. Coders nunca concordam → α < 0.
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 10 }],
			coders: ['a', 'b'],
		};
		const alpha = krippendorffAlphaNominal(input);
		expect(alpha).toBeLessThan(0);
	});

	it('returns positive alpha for partial overlap (asymmetric)', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		const alpha = krippendorffAlphaNominal(input);
		expect(alpha).toBeGreaterThan(0);
		expect(alpha).toBeLessThan(1);
	});

	it('returns 1 for empty input', () => {
		const input: KappaInput = { markers: [], sources: [], coders: [] };
		expect(krippendorffAlphaNominal(input)).toBe(1);
	});

	it('handles 3 coders', () => {
		const input: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'c', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b', 'c'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(1.0, 3);
	});
});

describe('krippendorffAlphaNominal — paramétrico em distance', () => {
	// Cenário multi-label: 3 chars, 2 coders.
	//   char 0: A={a,b}, B={a,b}     → idêntico
	//   char 1: A={a,b}, B={a,b,c}   → subset
	//   char 2: A={a,b}, B={a,c}     → overlap lateral
	const inputMultiLabel: KappaInput = {
		markers: [
			{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
			{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b'] },
			{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 2, to: 3 }, codeIds: ['a', 'b'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b', 'c'] },
			{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 2, to: 3 }, codeIds: ['a', 'c'] },
		],
		sources: [{ fileId: 'f1', locator: '', totalUnits: 3 }],
		coders: ['a', 'b'],
	};

	it('default = δ_nominal (backwards compat)', () => {
		const α_default = krippendorffAlphaNominal(inputMultiLabel);
		const α_explicit_nominal = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceNominal });
		expect(α_default).toBeCloseTo(α_explicit_nominal, 6);
	});

	it('δ_jaccard distingue subset e overlap lateral de agreement', () => {
		// Sob δ_nominal multi-label reduz a first-code 'a' → todos pares concordam → α_nominal = 1.
		// Sob δ_jaccard, char 1 (subset) e char 2 (lateral) contribuem distância parcial → α < 1.
		const α_nominal = krippendorffAlphaNominal(inputMultiLabel);
		const α_jaccard = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceJaccard });
		expect(α_jaccard).toBeLessThan(α_nominal);
	});

	it('δ_MASI produz valor distinto de Jaccard em cenário com subset+lateral', () => {
		// MASI penaliza subset e lateral com fatores diferentes (5/9 vs 8/9) que Jaccard (1/3 vs 2/3).
		// A direção da diferença depende da proporção subset:lateral no cenário.
		// Aqui apenas validamos que valores diferem (não cravamos sinal — depende da mistura).
		const α_jaccard = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceJaccard });
		const α_masi = krippendorffAlphaNominal(inputMultiLabel, { distance: distanceMASI });
		expect(α_masi).not.toBeCloseTo(α_jaccard, 4);
	});

	it('singletons: jaccard e nominal produzem α idêntico (invariant)', () => {
		// Pra |A|=|B|=1, todas as 3 distances reduzem ao caso clássico — α é o mesmo.
		const inputSingleLabel: KappaInput = {
			markers: [
				{ coderId: 'a', range: { fileId: 'f1', locator: '', from: 0, to: 10 }, codeIds: ['c1'] },
				{ coderId: 'b', range: { fileId: 'f1', locator: '', from: 5, to: 15 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f1', locator: '', totalUnits: 20 }],
			coders: ['a', 'b'],
		};
		const α_nominal = krippendorffAlphaNominal(inputSingleLabel);
		const α_jaccard = krippendorffAlphaNominal(inputSingleLabel, { distance: distanceJaccard });
		const α_masi = krippendorffAlphaNominal(inputSingleLabel, { distance: distanceMASI });
		expect(α_jaccard).toBeCloseTo(α_nominal, 6);
		expect(α_masi).toBeCloseTo(α_nominal, 6);
	});
});

/**
 * Bateria de validação contra fórmula canônica Krippendorff.
 *
 * Reference: Krippendorff K. (2011) "Computing Krippendorff's Alpha-Reliability",
 *   Annenberg School for Communication, University of Pennsylvania.
 *   https://repository.upenn.edu/asc_papers/43/
 * Cross-ref: Krippendorff (2018) "Content Analysis: An Introduction to its Methodology"
 *   4th ed., Cap. 11.
 *
 * Fórmula canônica:
 *   α = 1 − Do/De
 *   Do = (1/n) Σ_c Σ_k o_ck δ²_ck
 *   De = (1/(n(n-1))) Σ_c Σ_k n_c n_k δ²_ck
 *
 * Onde:
 *   o_ck = Σ_u (n_uc × n_uk − δ_{ck} × n_uc) / (m_u − 1)  [coincidence matrix]
 *   n_c = Σ_k o_ck = marginal count de c
 *   n = Σ_c n_c = total ratings
 *
 * A impl em krippendorffAlpha.ts difere por uma constante multiplicativa (n) tanto em Do quanto
 * em De — cancela no ratio. Pra δ_nominal, δ = δ² (porque 0² = 0, 1² = 1), então não há
 * diferença canônica vs squared. Equivalência validada algebricamente + numericamente nestes
 * 5 casos.
 */
describe('krippendorffAlphaNominal — validação contra valores canônicos Krippendorff (2018, cap 11)', () => {
	const mkMarker = (coderId: string, pos: number, code: string) => ({
		coderId,
		range: { fileId: 'f', locator: '', from: pos, to: pos + 1 },
		codeIds: [code],
	});

	it('Caso 1: 2 coders binário oposto sistemático (4 units) → α = -0.75', () => {
		// A codifica chars 0,2 com c1; B codifica chars 1,3 com c1.
		// Cada unit: 1 coder rates {c1}, outro rates ∅ → δ=1 ambas direções.
		//
		// Canônica:
		//   n_c1 = 4, n_∅ = 4, n = 8
		//   o_c1∅ = o_∅c1 = 4 (cada unit aporta 1 pair (c1,∅) e 1 (∅,c1))
		//   Do_canon = (4 + 4) / 8 = 1
		//   De_canon = (4×4 + 4×4) / (8×7) = 4/7
		//   α = 1 − 1/(4/7) = -3/4
		const input: KappaInput = {
			markers: [
				{ coderId: 'A', range: { fileId: 'f', locator: '', from: 0, to: 1 }, codeIds: ['c1'] },
				{ coderId: 'A', range: { fileId: 'f', locator: '', from: 2, to: 3 }, codeIds: ['c1'] },
				{ coderId: 'B', range: { fileId: 'f', locator: '', from: 1, to: 2 }, codeIds: ['c1'] },
				{ coderId: 'B', range: { fileId: 'f', locator: '', from: 3, to: 4 }, codeIds: ['c1'] },
			],
			sources: [{ fileId: 'f', locator: '', totalUnits: 4 }],
			coders: ['A', 'B'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(-0.75, 6);
	});

	it('Caso 2: 3 coders, 4 units binárias, agreement mid → α = 7/18 ≈ 0.3889', () => {
		// Unit 0: AAA(a), Unit 1: BBB(b), Unit 2: AA+B(b), Unit 3: B+AA → A=b,B=a,C=b
		//
		// Canônica:
		//   n_a = 3+0+2+1 = 6, n_b = 0+3+1+2 = 6, n = 12
		//   o_aa = 3+0+1+0 = 4, o_bb = 0+3+0+1 = 4, o_ab = o_ba = 0+0+1+1 = 2
		//   Do_canon = (2+2)/12 = 1/3
		//   De_canon = (6×6 + 6×6)/(12×11) = 72/132 = 6/11
		//   α = 1 − (1/3)/(6/11) = 1 − 11/18 = 7/18
		const input: KappaInput = {
			markers: [
				mkMarker('A', 0, 'a'), mkMarker('B', 0, 'a'), mkMarker('C', 0, 'a'),
				mkMarker('A', 1, 'b'), mkMarker('B', 1, 'b'), mkMarker('C', 1, 'b'),
				mkMarker('A', 2, 'a'), mkMarker('B', 2, 'a'), mkMarker('C', 2, 'b'),
				mkMarker('A', 3, 'b'), mkMarker('B', 3, 'a'), mkMarker('C', 3, 'b'),
			],
			sources: [{ fileId: 'f', locator: '', totalUnits: 4 }],
			coders: ['A', 'B', 'C'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(7 / 18, 6);
	});

	it('Caso 3: 4 coders, 4 units, 3 categorias → α = 1 − 45/79 ≈ 0.4304', () => {
		// Unit 0: aaaa, Unit 1: abab, Unit 2: cccc, Unit 3: abca
		//
		// Canônica:
		//   n_a = 4+2+0+2 = 8, n_b = 0+2+0+1 = 3, n_c = 0+0+4+1 = 5, n = 16
		//   off-diag total Σ o_ck (c≠k) = 6 (computed via per-unit coincidence)
		//   Do_canon = 6/16 = 3/8
		//   Σ_{c≠k} n_c n_k = 2×(8×3 + 8×5 + 3×5) = 2×(24+40+15) = 158
		//   De_canon = 158/(16×15) = 79/120
		//   α = 1 − (3/8)/(79/120) = 1 − 45/79
		const input: KappaInput = {
			markers: [
				mkMarker('A', 0, 'a'), mkMarker('B', 0, 'a'), mkMarker('C', 0, 'a'), mkMarker('D', 0, 'a'),
				mkMarker('A', 1, 'a'), mkMarker('B', 1, 'b'), mkMarker('C', 1, 'a'), mkMarker('D', 1, 'b'),
				mkMarker('A', 2, 'c'), mkMarker('B', 2, 'c'), mkMarker('C', 2, 'c'), mkMarker('D', 2, 'c'),
				mkMarker('A', 3, 'a'), mkMarker('B', 3, 'b'), mkMarker('C', 3, 'c'), mkMarker('D', 3, 'a'),
			],
			sources: [{ fileId: 'f', locator: '', totalUnits: 4 }],
			coders: ['A', 'B', 'C', 'D'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(1 - 45 / 79, 6);
	});

	it('Caso 4: 2 coders, 5 cats, permutação cíclica (todos disagree) → α = -1/8', () => {
		// A: [1,2,3,4,5], B: [2,3,4,5,1] — todos pares diferentes, marginais idênticas.
		//
		// Canônica:
		//   n_k = 2 ∀k ∈ {1..5}, n = 10
		//   Cada unit aporta 1 par off-diag em cada direção → Σ off-diag o_ck = 10
		//   Do_canon = 10/10 = 1
		//   Σ_{c≠k} n_c n_k = 5×4×2×2 = 80
		//   De_canon = 80/(10×9) = 8/9
		//   α = 1 − 1/(8/9) = -1/8
		const input: KappaInput = {
			markers: [
				mkMarker('A', 0, '1'), mkMarker('A', 1, '2'), mkMarker('A', 2, '3'), mkMarker('A', 3, '4'), mkMarker('A', 4, '5'),
				mkMarker('B', 0, '2'), mkMarker('B', 1, '3'), mkMarker('B', 2, '4'), mkMarker('B', 3, '5'), mkMarker('B', 4, '1'),
			],
			sources: [{ fileId: 'f', locator: '', totalUnits: 5 }],
			coders: ['A', 'B'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(-0.125, 6);
	});

	it('Caso 5: empty-set ∅ tratado como categoria (unitization-α semântica)', () => {
		// Marca semântica do unitization-α (Krippendorff 2018 cap. 12): chars onde
		// ninguém marca contam como ratings em categoria implícita "__none__". Distinta
		// da Krippendorff strict (cap. 11) que pula missing data.
		//
		// 4 chars: 2 coded por A e B com c1 (agree), 2 sem nenhum coder (agree em ∅).
		// Total agreement esperado → α = 1.
		const input: KappaInput = {
			markers: [
				{ coderId: 'A', range: { fileId: 'f', locator: '', from: 0, to: 1 }, codeIds: ['c1'] },
				{ coderId: 'B', range: { fileId: 'f', locator: '', from: 0, to: 1 }, codeIds: ['c1'] },
				{ coderId: 'A', range: { fileId: 'f', locator: '', from: 1, to: 2 }, codeIds: ['c1'] },
				{ coderId: 'B', range: { fileId: 'f', locator: '', from: 1, to: 2 }, codeIds: ['c1'] },
				// chars 2 e 3: nenhum coder marca → 2 ratings (∅, ∅) por unit
			],
			sources: [{ fileId: 'f', locator: '', totalUnits: 4 }],
			coders: ['A', 'B'],
		};
		expect(krippendorffAlphaNominal(input)).toBeCloseTo(1.0, 6);
	});
});

/**
 * Characterization tests pra δ_jaccard e δ_MASI — registram divergência conhecida vs
 * canônica Krippendorff (2018, cap. 11).
 *
 * Convenção canônica (Krippendorff 2018, cap. 11): pra distance functions custom (não-nominal),
 * α usa δ² em Do e De — preserva propriedade variance-like da fórmula.
 *
 * Convenção da impl atual: usa δ linear em Do e De. Pra δ_nominal (onde δ ∈ {0,1}, δ² = δ),
 * impl é IDÊNTICA à canônica (validado nos 5 casos canônicos acima). Pra δ_jaccard e δ_MASI
 * (valores fracionários em [0,1]), impl ≠ canônica quando marginais não-uniformes.
 *
 * Cálculo paralelo manual (caso assimétrico, 3 chars, 2 coders, marginais {a,b}=2/{a}=3/{a,b,c}=1):
 *
 *   Jaccard δ linear (impl):  α = 1 − (10/3)/(34/15) = -8/17  ≈ -0.4706
 *   Jaccard δ² (canon):       α = 1 − (17/54)/(11/54) = -6/11 ≈ -0.5455
 *   Δ ≈ 0.075 em magnitude
 *
 *   MASI δ linear (impl):     α = 1 − (38/9)/(134/45) = -28/67   ≈ -0.4179
 *   MASI δ² (canon):          α = 1 − (121/243)/(413/1215) = -192/413 ≈ -0.4649
 *   Δ ≈ 0.047
 *
 * Os tests abaixo REGISTRAM os valores impl atuais. Se a decisão metodológica for migrar
 * pra δ² (canônica Krippendorff 2018), estes tests precisam ser RECALIBRADOS junto com a
 * mudança no motor. Bug? Não — é divergência da convenção principal. Há literatura
 * usando δ linear pra distâncias custom (Passonneau 2006 originalmente, várias impls).
 *
 * Decisão pendente: aguarda feedback metodológico do user. Trade-off:
 *   - Manter δ linear: simplicidade, valores publicados em release 0.5.0 ficam estáveis.
 *   - Migrar pra δ²: alinhamento canônico estrito Krippendorff 2018, MAS afeta valores
 *     publicados (precisa release de bugfix + nota metodológica).
 */
describe('krippendorffAlphaNominal — characterization δ_jaccard / δ_MASI (vs canônica δ²)', () => {
	// Caso assimétrico: marginais não-uniformes onde δ vs δ² diverge.
	// char 0: A={a,b}, B={a}
	// char 1: A={a,b}, B={a}
	// char 2: A={a,b,c}, B={a}
	const inputAsymmetric: KappaInput = {
		markers: [
			{ coderId: 'A', range: { fileId: 'f', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
			{ coderId: 'B', range: { fileId: 'f', locator: '', from: 0, to: 1 }, codeIds: ['a'] },
			{ coderId: 'A', range: { fileId: 'f', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b'] },
			{ coderId: 'B', range: { fileId: 'f', locator: '', from: 1, to: 2 }, codeIds: ['a'] },
			{ coderId: 'A', range: { fileId: 'f', locator: '', from: 2, to: 3 }, codeIds: ['a', 'b', 'c'] },
			{ coderId: 'B', range: { fileId: 'f', locator: '', from: 2, to: 3 }, codeIds: ['a'] },
		],
		sources: [{ fileId: 'f', locator: '', totalUnits: 3 }],
		coders: ['A', 'B'],
	};

	it('Jaccard linear: α_impl = -8/17 ≈ -0.4706 (DIVERGE da canônica δ² = -6/11)', () => {
		// Cálculo manual Jaccard δ:
		//   δ_J({a,b},{a}) = 1/2, δ_J({a,b,c},{a}) = 2/3, δ_J({a,b},{a,b,c}) = 1/3
		//   Do_impl = char0(2×0.5) + char1(2×0.5) + char2(2×2/3) = 10/3
		//   marginais: {a,b}=2, {a}=3, {a,b,c}=1, N=6
		//   De_impl pairs sum = 34/3, /(N-1)=5 → 34/15
		//   α = 1 − (10/3)/(34/15) = 1 − 50/34 = -8/17
		const α = krippendorffAlphaNominal(inputAsymmetric, { distance: distanceJaccard });
		expect(α).toBeCloseTo(-8 / 17, 6);
	});

	it('MASI linear: α_impl = -28/67 ≈ -0.4179 (DIVERGE da canônica δ² = -192/413)', () => {
		// Cálculo manual MASI δ (Passonneau 2006):
		//   δ_M({a,b},{a}) = 2/3 [subset: M=2/3, J=1/2]
		//   δ_M({a,b,c},{a}) = 7/9 [subset: M=2/3, J=1/3]
		//   δ_M({a,b},{a,b,c}) = 5/9 [subset: M=2/3, J=2/3]
		//   Do_impl = 4/3 + 4/3 + 14/9 = 38/9
		//   De_impl pairs sum = 134/9, /5 → 134/45
		//   α = 1 − (38/9)/(134/45) = 1 − 1710/1206 = -28/67
		const α = krippendorffAlphaNominal(inputAsymmetric, { distance: distanceMASI });
		expect(α).toBeCloseTo(-28 / 67, 6);
	});

	it('Marginais uniformes: Jaccard linear e Jaccard² coincidem (caso da equivalência)', () => {
		// Quando marginais e estrutura de pares são simétricos, ratio Do/De cancela δ vs δ².
		// Exemplo trivial: 2 chars, 2 coders, ambos com mesma estrutura.
		// char 0: A={a,b}, B={a,c}
		// char 1: A={a,b}, B={a,b}
		const input: KappaInput = {
			markers: [
				{ coderId: 'A', range: { fileId: 'f', locator: '', from: 0, to: 1 }, codeIds: ['a', 'b'] },
				{ coderId: 'B', range: { fileId: 'f', locator: '', from: 0, to: 1 }, codeIds: ['a', 'c'] },
				{ coderId: 'A', range: { fileId: 'f', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b'] },
				{ coderId: 'B', range: { fileId: 'f', locator: '', from: 1, to: 2 }, codeIds: ['a', 'b'] },
			],
			sources: [{ fileId: 'f', locator: '', totalUnits: 2 }],
			coders: ['A', 'B'],
		};
		// Marginais: {a,b}=3, {a,c}=1, N=4
		// δ_J({a,b},{a,c}) = 2/3, δ² = 4/9
		// Impl: Do = 2×2/3 = 4/3, De = 2×(3×1×2/3)/3 = 4/3, α = 0
		// Canon: Do = (1/4)×(2×4/9) = 2/9, De = (1/(4×3))×(2×3×4/9) = 2/9, α = 0
		// AMBOS = 0 (ratio idêntico). Caso EQUIVALENTE pra δ vs δ².
		const α = krippendorffAlphaNominal(input, { distance: distanceJaccard });
		expect(α).toBeCloseTo(0, 6);
	});
});
