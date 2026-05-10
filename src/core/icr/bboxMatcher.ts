/**
 * Hungarian / Munkres assignment problem solver — versão rectangular CP-Algorithms.
 *
 * Input: matriz de custos N×M.
 * Output: lista de pares [linha, coluna] formando assignment 1:1 ótimo (minimiza
 * soma de custos). Quando N ≠ M, retorna `min(N, M)` pares (lado maior tem sobras).
 *
 * Strategy: o algoritmo CP-Algorithms exige `n ≤ m` (linhas ≤ cols). Se n > m,
 * transpõe primeiro, roda, e swap dos índices na saída.
 *
 * Padding ao quadrado com BIG estourava ótimo em casos onde muitas linhas/cols
 * tinham custos iguais — bug observado em smoke real (10×5). Versão nativa não
 * sofre disso.
 *
 * Complexidade O(n²·m).
 */

export function hungarianAssignment(cost: number[][]): Array<[number, number]> {
	const n = cost.length;
	if (n === 0) return [];
	const m = cost[0]!.length;
	if (m === 0) return [];

	if (n > m) {
		// Transpose: rodar com (m, n) onde "rows" = n, "cols" = m no original viram cols/rows respectivamente.
		const transposed: number[][] = Array(m).fill(0).map((_, j) =>
			Array(n).fill(0).map((_, i) => cost[i]![j]!),
		);
		const result = hungarianRectangular(transposed);
		return result.map(([j, i]) => [i, j]);
	}
	return hungarianRectangular(cost);
}

/** CP-Algorithms Munkres pra n ≤ m (rectangular nativo). */
function hungarianRectangular(cost: number[][]): Array<[number, number]> {
	const n = cost.length;
	const m = cost[0]!.length;

	const u = new Array(n + 1).fill(0);
	const v = new Array(m + 1).fill(0);
	const p = new Array(m + 1).fill(0);
	const way = new Array(m + 1).fill(0);
	const INF = Number.POSITIVE_INFINITY;

	for (let i = 1; i <= n; i++) {
		p[0] = i;
		let j0 = 0;
		const minv = new Array(m + 1).fill(INF);
		const used = new Array(m + 1).fill(false);
		do {
			used[j0] = true;
			const i0 = p[j0];
			let delta = INF;
			let j1 = 0;
			for (let j = 1; j <= m; j++) {
				if (used[j]) continue;
				const cur = cost[i0 - 1]![j - 1]! - u[i0] - v[j];
				if (cur < minv[j]) {
					minv[j] = cur;
					way[j] = j0;
				}
				if (minv[j] < delta) {
					delta = minv[j];
					j1 = j;
				}
			}
			for (let j = 0; j <= m; j++) {
				if (used[j]) {
					u[p[j]] += delta;
					v[j] -= delta;
				} else {
					minv[j] -= delta;
				}
			}
			j0 = j1;
		} while (p[j0] !== 0);
		do {
			const j1 = way[j0];
			p[j0] = p[j1];
			j0 = j1;
		} while (j0 !== 0);
	}

	// Extract: p[j] = i means row i is assigned to col j-1. Skip j onde p[j] is 0 (col não atribuída — só possível se m > n).
	const result: Array<[number, number]> = [];
	for (let j = 1; j <= m; j++) {
		if (p[j] !== 0) {
			result.push([p[j] - 1, j - 1]);
		}
	}
	return result;
}

export type AlignmentEvent =
	| { kind: 'matched'; aIndex: number; bIndex: number; iou: number }
	| { kind: 'unmatched_a'; aIndex: number }
	| { kind: 'unmatched_b'; bIndex: number };

/**
 * match — Hungarian assignment + θ post-cutoff.
 *
 * 1. Roda Hungarian sobre matriz de custos `1 - iou` pra obter assignment ótimo.
 * 2. Pares com `iou < θ` são desfeitos: aIndex vira unmatched_a, bIndex vira unmatched_b.
 * 3. Bboxes sem assignment (sobras) viram unmatched do respectivo lado.
 *
 * Output ordenado: todos matched primeiro, depois unmatched_a (em ordem), depois unmatched_b.
 *
 * Caller (bboxAdapter) é responsável por pré-handlar casos 0×N e N×0
 * (porque match() não consegue inferir M quando N=0).
 */
export function match(iouMatrix: number[][], theta: number): AlignmentEvent[] {
	const n = iouMatrix.length;
	const m = n > 0 ? iouMatrix[0]!.length : 0;
	if (n === 0 || m === 0) return [];

	const cost = iouMatrix.map(row => row.map(v => 1 - v));
	const assignments = hungarianAssignment(cost);

	const matchedA = new Set<number>();
	const matchedB = new Set<number>();
	const events: AlignmentEvent[] = [];

	for (const [i, j] of assignments) {
		const v = iouMatrix[i]![j]!;
		if (v >= theta) {
			events.push({ kind: 'matched', aIndex: i, bIndex: j, iou: v });
			matchedA.add(i);
			matchedB.add(j);
		}
	}

	for (let i = 0; i < n; i++) {
		if (!matchedA.has(i)) events.push({ kind: 'unmatched_a', aIndex: i });
	}
	for (let j = 0; j < m; j++) {
		if (!matchedB.has(j)) events.push({ kind: 'unmatched_b', bIndex: j });
	}

	return events;
}
