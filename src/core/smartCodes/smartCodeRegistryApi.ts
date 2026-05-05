import type { SmartCodeDefinition, PredicateNode, LeafNode, AuditEntry, QualiaData } from '../types';
import { isOpNode, isLeafNode } from './types';
import { DEFAULT_PALETTE } from '../codeDefinitionRegistry';

let _idCounter = 0;
function makeSmartCodeId(): string {
	return `sc_${Date.now().toString(36)}_${(_idCounter++).toString(36)}`;
}

/** Tipo permissivo pra emit — aceita qualquer variant do union AuditEntry sem 'id' obrigatório.
 *  Usar `any` aqui é mais limpo que listar 12+ variants; o caller (appendEntry) já tipa estrito. */
export type SmartCodeAuditEmit = (entry: any) => void;

export interface SmartCodeApiDeps {
	data: QualiaData;
	auditEmit: SmartCodeAuditEmit;
	onMutate?: () => void;
	persist?: () => void;
}

export class SmartCodeApi {
	constructor(private deps: SmartCodeApiDeps) {}

	createSmartCode(args: { name: string; color?: string; predicate: PredicateNode; memo?: string }): SmartCodeDefinition {
		const reg = this.deps.data.registry;
		const id = makeSmartCodeId();
		const paletteIndex = args.color ? -1 : reg.nextSmartCodePaletteIndex;
		const color = args.color ?? DEFAULT_PALETTE[paletteIndex % DEFAULT_PALETTE.length]!;
		if (!args.color) reg.nextSmartCodePaletteIndex++;
		const sc: SmartCodeDefinition = {
			id, name: args.name, color, paletteIndex,
			predicate: args.predicate,
			memo: args.memo,
			createdAt: Date.now(),
		};
		reg.smartCodes[id] = sc;
		reg.smartCodeOrder.push(id);
		this.deps.auditEmit({ codeId: id, at: Date.now(), entity: 'smartCode', type: 'sc_created' });
		this.deps.onMutate?.();
		this.deps.persist?.();
		return sc;
	}

	updateSmartCode(id: string, patch: Partial<Pick<SmartCodeDefinition, 'name' | 'color' | 'predicate' | 'memo' | 'hidden'>>): SmartCodeDefinition | undefined {
		const reg = this.deps.data.registry;
		const sc = reg.smartCodes[id];
		if (!sc) return undefined;
		const oldPredicate = sc.predicate;
		const oldMemo = sc.memo ?? '';
		Object.assign(sc, patch);
		// Audit: predicate change
		if (patch.predicate && patch.predicate !== oldPredicate) {
			const diff = diffPredicateLeaves(oldPredicate, patch.predicate);
			this.deps.auditEmit({ codeId: id, at: Date.now(), entity: 'smartCode', type: 'sc_predicate_edited',
				addedLeafKinds: diff.addedLeafKinds, removedLeafKinds: diff.removedLeafKinds, changedLeafCount: diff.changedLeafCount });
		}
		// Audit: memo change
		if (patch.memo !== undefined && patch.memo !== oldMemo) {
			this.deps.auditEmit({ codeId: id, at: Date.now(), entity: 'smartCode', type: 'sc_memo_edited', from: oldMemo, to: patch.memo });
		}
		this.deps.onMutate?.();
		this.deps.persist?.();
		return sc;
	}

	deleteSmartCode(id: string): boolean {
		const reg = this.deps.data.registry;
		if (!reg.smartCodes[id]) return false;
		delete reg.smartCodes[id];
		reg.smartCodeOrder = reg.smartCodeOrder.filter(x => x !== id);
		this.deps.auditEmit({ codeId: id, at: Date.now(), entity: 'smartCode', type: 'sc_deleted' });
		this.deps.onMutate?.();
		this.deps.persist?.();
		return true;
	}

	setSmartCodeMemo(id: string, memo: string): void {
		this.updateSmartCode(id, { memo });
	}

	setSmartCodeColor(id: string, color: string): void {
		// Color change não auditado (cosmético, conforme spec §13)
		const reg = this.deps.data.registry;
		const sc = reg.smartCodes[id];
		if (!sc) return;
		sc.color = color;
		sc.paletteIndex = -1;
		this.deps.onMutate?.();
		this.deps.persist?.();
	}

	/**
	 * Auto-rewrite predicates de smart codes que referenciam `sourceCodeId`. Usado após executeMerge
	 * pra preservar intenção: smart code "frustração ∩ junior" continua funcionando se "frustração" foi mergeado.
	 * Retorna IDs dos smart codes afetados.
	 */
	autoRewriteOnMerge(sourceCodeId: string, targetCodeId: string): { rewritten: string[] } {
		const reg = this.deps.data.registry;
		const rewritten: string[] = [];
		for (const sc of Object.values(reg.smartCodes)) {
			const newPredicate = rewriteCodeRef(sc.predicate, sourceCodeId, targetCodeId);
			if (newPredicate !== sc.predicate) {
				sc.predicate = newPredicate;
				rewritten.push(sc.id);
				this.deps.auditEmit({ codeId: sc.id, at: Date.now(), entity: 'smartCode', type: 'sc_auto_rewritten_on_merge', sourceCodeId, targetCodeId });
			}
		}
		if (rewritten.length > 0) {
			this.deps.onMutate?.();
			this.deps.persist?.();
		}
		return { rewritten };
	}

	getSmartCode(id: string): SmartCodeDefinition | undefined {
		return this.deps.data.registry.smartCodes[id];
	}

	listSmartCodes(): SmartCodeDefinition[] {
		const reg = this.deps.data.registry;
		return reg.smartCodeOrder.map(id => reg.smartCodes[id]).filter((sc): sc is SmartCodeDefinition => sc !== undefined);
	}
}

// ─── Helpers puros ─────────────────────────────────────────

/** Walks AST e substitui `hasCode/magnitudeGte/Lte/relationExists.codeId == sourceId` por targetId. Returns NEW node se mudou. */
export function rewriteCodeRef(node: PredicateNode, sourceId: string, targetId: string): PredicateNode {
	if (isOpNode(node)) {
		if (node.op === 'NOT') {
			const newChild = rewriteCodeRef(node.child, sourceId, targetId);
			return newChild === node.child ? node : { op: 'NOT', child: newChild };
		}
		let changed = false;
		const newChildren = node.children.map(c => {
			const nc = rewriteCodeRef(c, sourceId, targetId);
			if (nc !== c) changed = true;
			return nc;
		});
		return changed ? { op: node.op, children: newChildren } : node;
	}
	switch (node.kind) {
		case 'hasCode':
		case 'magnitudeGte':
		case 'magnitudeLte': {
			if (node.codeId !== sourceId) return node;
			return { ...node, codeId: targetId };
		}
		case 'relationExists': {
			let next = node;
			if (node.codeId === sourceId) next = { ...next, codeId: targetId };
			if (node.targetCodeId === sourceId) next = { ...next, targetCodeId: targetId };
			return next === node ? node : next;
		}
		default:
			return node;
	}
}

export function diffPredicateLeaves(oldPred: PredicateNode, newPred: PredicateNode): { addedLeafKinds: string[]; removedLeafKinds: string[]; changedLeafCount: number } {
	const oldLeaves = collectLeaves(oldPred);
	const newLeaves = collectLeaves(newPred);
	const oldByKind = countBy(oldLeaves, l => l.kind);
	const newByKind = countBy(newLeaves, l => l.kind);
	const added: string[] = [];
	const removed: string[] = [];
	for (const [kind, count] of newByKind) {
		const oldCount = oldByKind.get(kind) ?? 0;
		if (count > oldCount) added.push(kind);
	}
	for (const [kind, count] of oldByKind) {
		const newCount = newByKind.get(kind) ?? 0;
		if (count > newCount) removed.push(kind);
	}
	let changed = 0;
	const oldByKindSerialized = groupByKindSerialized(oldLeaves);
	const newByKindSerialized = groupByKindSerialized(newLeaves);
	for (const [kind, oldList] of oldByKindSerialized) {
		const newList = newByKindSerialized.get(kind) ?? [];
		const newSet = new Set(newList);
		for (const s of oldList) if (!newSet.has(s)) changed++;
	}
	return { addedLeafKinds: added, removedLeafKinds: removed, changedLeafCount: changed };
}

function collectLeaves(node: PredicateNode): LeafNode[] {
	if (isLeafNode(node)) return [node];
	if (node.op === 'NOT') return collectLeaves(node.child);
	return node.children.flatMap(collectLeaves);
}

function countBy<T>(items: T[], keyFn: (t: T) => string): Map<string, number> {
	const out = new Map<string, number>();
	for (const i of items) {
		const k = keyFn(i);
		out.set(k, (out.get(k) ?? 0) + 1);
	}
	return out;
}

function groupByKindSerialized(leaves: LeafNode[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const l of leaves) {
		const arr = out.get(l.kind) ?? [];
		arr.push(JSON.stringify(l));
		out.set(l.kind, arr);
	}
	return out;
}
