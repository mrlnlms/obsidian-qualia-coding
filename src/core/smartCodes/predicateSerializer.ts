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
	const sortedKeys = Object.keys(node).sort();
	const obj: Record<string, unknown> = {};
	for (const k of sortedKeys) obj[k] = (node as any)[k];
	return obj;
}
