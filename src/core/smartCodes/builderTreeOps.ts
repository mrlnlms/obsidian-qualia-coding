import type { PredicateNode, LeafNode } from './types';
import { isLeafNode, isOpNode } from './types';

export type Path = number[];

/** Returns node at given path. `[]` returns root. Returns undefined for invalid path. */
export function getNodeAt(node: PredicateNode, path: Path): PredicateNode | undefined {
	let cur: PredicateNode | undefined = node;
	for (const idx of path) {
		if (!cur || isLeafNode(cur)) return undefined;
		if (cur.op === 'NOT') cur = idx === 0 ? cur.child : undefined;
		else cur = cur.children[idx];
	}
	return cur;
}

/** Adiciona child no fim do group em parentPath. No-op se parentPath aponta pra leaf ou NOT. */
export function addChildToGroup(node: PredicateNode, parentPath: Path, newChild: PredicateNode): PredicateNode {
	return mapAt(node, parentPath, (target) => {
		if (isLeafNode(target) || target.op === 'NOT') return target;
		return { op: target.op, children: [...target.children, newChild] };
	});
}

/** Remove node em path. No-op se path vazio (não pode deletar root). */
export function removeNodeAt(node: PredicateNode, path: Path): PredicateNode {
	if (path.length === 0) return node;
	const parentPath = path.slice(0, -1);
	const idx = path[path.length - 1]!;
	return mapAt(node, parentPath, (target) => {
		if (isLeafNode(target)) return target;
		if (target.op === 'NOT') return target;  // NOT só tem 1 child, removeNodeAt não suportado
		const newChildren = target.children.filter((_, i) => i !== idx);
		return { op: target.op, children: newChildren };
	});
}

/** Move node de fromPath pra toParentPath em toIndex. */
export function moveNode(node: PredicateNode, fromPath: Path, toParentPath: Path, toIndex: number): PredicateNode {
	const moving = getNodeAt(node, fromPath);
	if (!moving) return node;
	let withoutSrc = removeNodeAt(node, fromPath);
	// Se fromPath e toParentPath são ancestor-descendant, removeNodeAt pode ter mudado os indexes.
	// Pra simplicidade, suportamos só moves dentro do mesmo parent ou em paths não-overlapping.
	withoutSrc = mapAt(withoutSrc, toParentPath, (target) => {
		if (isLeafNode(target) || target.op === 'NOT') return target;
		const next = target.children.slice();
		const insertIdx = Math.min(toIndex, next.length);
		next.splice(insertIdx, 0, moving);
		return { op: target.op, children: next };
	});
	return withoutSrc;
}

/** Muda operator de um group node. Mudar AND/OR → NOT pega primeiro child como child do NOT. */
export function changeOperator(node: PredicateNode, path: Path, newOp: 'AND' | 'OR' | 'NOT'): PredicateNode {
	return mapAt(node, path, (target) => {
		if (isLeafNode(target)) return target;
		if (target.op === newOp) return target;
		if (newOp === 'NOT') {
			// Pega primeiro child (descarta resto se for AND/OR com >1)
			if (target.op === 'NOT') return target;
			const firstChild = target.children[0];
			if (!firstChild) return target;  // empty group → no-op
			return { op: 'NOT', child: firstChild };
		}
		// AND ↔ OR ou NOT → AND/OR
		if (target.op === 'NOT') return { op: newOp, children: [target.child] };
		return { op: newOp, children: target.children };
	});
}

/** Substitui leaf no path por outro leaf. No-op se path aponta pra OpNode. */
export function replaceLeafAt(node: PredicateNode, path: Path, newLeaf: LeafNode): PredicateNode {
	return mapAt(node, path, (target) => {
		if (isLeafNode(target)) return newLeaf;
		return target;
	});
}

// ─── Helpers ─────────────────────────────────────────────

function mapAt(node: PredicateNode, path: Path, fn: (n: PredicateNode) => PredicateNode): PredicateNode {
	if (path.length === 0) return fn(node);
	if (isLeafNode(node)) return node;
	if (node.op === 'NOT') {
		if (path[0] !== 0) return node;
		const newChild = mapAt(node.child, path.slice(1), fn);
		return newChild === node.child ? node : { op: 'NOT', child: newChild };
	}
	const idx = path[0]!;
	if (idx < 0 || idx >= node.children.length) return node;
	const oldChild = node.children[idx]!;
	const newChild = mapAt(oldChild, path.slice(1), fn);
	if (newChild === oldChild) return node;
	const newChildren = node.children.slice();
	newChildren[idx] = newChild;
	return { op: node.op, children: newChildren };
}
