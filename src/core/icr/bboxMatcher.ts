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

// match() and AlignmentEvent definidos na próxima task
export type AlignmentEvent =
	| { kind: 'matched'; aIndex: number; bIndex: number; iou: number }
	| { kind: 'unmatched_a'; aIndex: number }
	| { kind: 'unmatched_b'; bIndex: number };

export function match(_iouMatrix: number[][], _theta: number): AlignmentEvent[] {
	throw new Error('match: not yet implemented');
}
