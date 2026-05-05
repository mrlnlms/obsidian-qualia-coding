import type { PredicateNode } from './types';
import { isOpNode } from './types';

/** Serializa predicate em JSON estável (chave order canônica pra diff e CDATA estável). */
export function predicateToJson(node: PredicateNode): string {
	return JSON.stringify(canonicalize(node));
}

export function predicateFromJson(json: string): PredicateNode {
	return JSON.parse(json) as PredicateNode;
}

function canonicalize(node: PredicateNode): unknown {
	if (isOpNode(node)) {
		if (node.op === 'NOT') return { child: canonicalize(node.child), op: 'NOT' };
		return { children: node.children.map(canonicalize), op: node.op };
	}
	// Leaf: copia campos com ordem alfabética pra JSON estável (diff + CDATA reproducível).
	const entries = Object.entries(node as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
	return Object.fromEntries(entries);
}
