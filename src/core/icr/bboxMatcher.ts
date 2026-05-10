/**
 * Hungarian / Munkres assignment problem solver.
 *
 * Input: matriz de custos N×M (linhas = "agentes", cols = "tarefas").
 * Output: lista de pares [agente, tarefa] formando assignment 1:1 ótimo
 * (minimiza soma de custos). Pra retângulos, faz padding ao quadrado com
 * Infinity (linhas/cols extras nunca são escolhidas; pares com Inf descartados).
 *
 * Complexidade O(max(N,M)³).
 */

const BIG = 1e9; // padding pra Munkres em retângulos. Maior que qualquer custo real (∈ [0, 1]).

export function hungarianAssignment(cost: number[][]): Array<[number, number]> {
	const n = cost.length;
	if (n === 0) return [];
	const m = cost[0]!.length;
	if (m === 0) return [];

	const size = Math.max(n, m);
	const c: number[][] = Array(size).fill(0).map((_, i) =>
		Array(size).fill(0).map((_, j) =>
			i < n && j < m ? cost[i]![j]! : BIG,
		),
	);

	const u = new Array(size + 1).fill(0);
	const v = new Array(size + 1).fill(0);
	const p = new Array(size + 1).fill(0);
	const way = new Array(size + 1).fill(0);

	for (let i = 1; i <= size; i++) {
		p[0] = i;
		let j0 = 0;
		const minv = new Array(size + 1).fill(BIG);
		const used = new Array(size + 1).fill(false);
		do {
			used[j0] = true;
			const i0 = p[j0];
			let delta = BIG;
			let j1 = 0;
			for (let j = 1; j <= size; j++) {
				if (used[j]) continue;
				const cur = c[i0 - 1]![j - 1]! - u[i0] - v[j];
				if (cur < minv[j]) {
					minv[j] = cur;
					way[j] = j0;
				}
				if (minv[j] < delta) {
					delta = minv[j];
					j1 = j;
				}
			}
			for (let j = 0; j <= size; j++) {
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

	const result: Array<[number, number]> = [];
	for (let j = 1; j <= size; j++) {
		const i = p[j] - 1;
		if (i < n && j - 1 < m && cost[i]![j - 1]! < BIG) {
			result.push([i, j - 1]);
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
