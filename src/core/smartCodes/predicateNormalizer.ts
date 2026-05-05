import type { PredicateNode, LeafNode } from './types';
import { isLeafNode } from './types';

const COST_ORDER: Record<LeafNode['kind'], number> = {
	engineType: 1,
	inFolder: 2,
	inGroup: 3,
	hasCode: 4,
	caseVarEquals: 5,
	caseVarRange: 6,
	magnitudeGte: 7,
	magnitudeLte: 7,
	relationExists: 8,
	smartCode: 9,
};

export function leafCost(leaf: LeafNode): number {
	return COST_ORDER[leaf.kind];
}

export function nodeCost(node: PredicateNode): number {
	if (isLeafNode(node)) return leafCost(node);
	if (node.op === 'NOT') return nodeCost(node.child);
	return node.children.reduce((s, c) => s + nodeCost(c), 0);
}

/** Reordena children de AND/OR por custo crescente (cheap-first heuristic). Sem alterar semântica. */
export function normalizeOrder(node: PredicateNode): PredicateNode {
	if (isLeafNode(node)) return node;
	if (node.op === 'NOT') return { op: 'NOT', child: normalizeOrder(node.child) };
	const normalizedChildren = node.children.map(normalizeOrder);
	normalizedChildren.sort((a, b) => nodeCost(a) - nodeCost(b));
	return { op: node.op, children: normalizedChildren };
}
