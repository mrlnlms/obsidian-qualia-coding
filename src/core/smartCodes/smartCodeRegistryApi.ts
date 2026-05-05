import type { SmartCodeDefinition, PredicateNode, LeafNode, SmartCodesSection } from '../types';
import type { MemoRecord } from '../memoTypes';
import { isOpNode, isLeafNode } from './types';
import { DEFAULT_PALETTE } from '../codeDefinitionRegistry';

let _idCounter = 0;
function makeSmartCodeId(): string {
	return `sc_${Date.now().toString(36)}_${(_idCounter++).toString(36)}`;
}

/**
 * Domain event emitido pela SmartCodeRegistry. Mesmo shape de `BaseAuditEntry` (entity + codeId)
 * pra spread direto em `appendEntry(log, { ...event, at })` no main.ts — segue o pattern do
 * `CodeDefinitionRegistry.AuditMutationEvent`. Caller mints AuditEntry final com `at`/`id`.
 */
export type SmartCodeAuditEvent =
	| { entity: 'smartCode'; type: 'sc_created'; codeId: string }
	| { entity: 'smartCode'; type: 'sc_predicate_edited'; codeId: string; addedLeafKinds: string[]; removedLeafKinds: string[]; changedLeafCount: number }
	| { entity: 'smartCode'; type: 'sc_memo_edited'; codeId: string; from: string; to: string }
	| { entity: 'smartCode'; type: 'sc_auto_rewritten_on_merge'; codeId: string; sourceCodeId: string; targetCodeId: string }
	| { entity: 'smartCode'; type: 'sc_deleted'; codeId: string };

/**
 * Registry de Smart Codes (Tier 3). Segue o mesmo pattern de `CodeDefinitionRegistry`:
 * state interno, listeners via `addOnMutate` (multi) e `setAuditListener` (single),
 * persistência via `toJSON()` + `fromJSON()`.
 *
 * O store interno (`section`) é o mesmo objeto persistido em `data.smartCodes` — mutado
 * in-place. Cache holda referência a `section.definitions` pra leituras O(1) sem cópia,
 * e é notificado granularmente via `addOnMutate` com o id mudado.
 */
export class SmartCodeRegistry {
	private mutateListeners = new Set<(changedId: string) => void>();
	private auditListener: ((event: SmartCodeAuditEvent) => void) | null = null;

	constructor(private section: SmartCodesSection) {}

	static fromJSON(section: SmartCodesSection | undefined): SmartCodeRegistry {
		return new SmartCodeRegistry(section ?? { definitions: {}, order: [], nextPaletteIndex: 0 });
	}

	toJSON(): SmartCodesSection {
		return this.section;
	}

	addOnMutate(fn: (changedId: string) => void): () => void {
		this.mutateListeners.add(fn);
		return () => { this.mutateListeners.delete(fn); };
	}

	setAuditListener(fn: ((event: SmartCodeAuditEvent) => void) | null): void {
		this.auditListener = fn;
	}

	private emitMutate(changedId: string): void {
		for (const fn of this.mutateListeners) fn(changedId);
	}

	private emitAudit(event: SmartCodeAuditEvent): void {
		this.auditListener?.(event);
	}

	// ─── Reads ────────────────────────────────────────────────

	getById(id: string): SmartCodeDefinition | undefined {
		return this.section.definitions[id];
	}

	getAll(): SmartCodeDefinition[] {
		return this.section.order
			.map(id => this.section.definitions[id])
			.filter((sc): sc is SmartCodeDefinition => sc !== undefined);
	}

	/** Reference para o store de definitions. Usado pelo cache pra leituras O(1) sem cópia. */
	getDefinitionsRef(): Record<string, SmartCodeDefinition> {
		return this.section.definitions;
	}

	// ─── Writes ───────────────────────────────────────────────

	create(args: { name: string; color?: string; predicate: PredicateNode; memo?: string | MemoRecord }): SmartCodeDefinition {
		const id = makeSmartCodeId();
		const paletteIndex = args.color ? -1 : this.section.nextPaletteIndex;
		const color = args.color ?? DEFAULT_PALETTE[paletteIndex % DEFAULT_PALETTE.length]!;
		if (!args.color) this.section.nextPaletteIndex++;
		const sc: SmartCodeDefinition = {
			id, name: args.name, color, paletteIndex,
			predicate: args.predicate,
			memo: normalizeMemo(args.memo),
			createdAt: Date.now(),
		};
		this.section.definitions[id] = sc;
		this.section.order.push(id);
		this.emitAudit({ entity: 'smartCode', type: 'sc_created', codeId: id });
		this.emitMutate(id);
		return sc;
	}

	update(id: string, patch: Partial<Pick<SmartCodeDefinition, 'name' | 'color' | 'predicate' | 'hidden'>> & { memo?: string | MemoRecord }): SmartCodeDefinition | undefined {
		const sc = this.section.definitions[id];
		if (!sc) return undefined;
		const oldPredicate = sc.predicate;
		const oldMemoContent = sc.memo?.content ?? '';
		const { memo: memoPatch, ...rest } = patch;
		Object.assign(sc, rest);
		if (memoPatch !== undefined) {
			sc.memo = normalizeMemo(memoPatch);
		}
		if (patch.predicate && patch.predicate !== oldPredicate) {
			const diff = diffPredicateLeaves(oldPredicate, patch.predicate);
			this.emitAudit({ entity: 'smartCode', type: 'sc_predicate_edited', codeId: id, ...diff });
		}
		const newMemoContent = sc.memo?.content ?? '';
		if (memoPatch !== undefined && newMemoContent !== oldMemoContent) {
			this.emitAudit({ entity: 'smartCode', type: 'sc_memo_edited', codeId: id, from: oldMemoContent, to: newMemoContent });
		}
		this.emitMutate(id);
		return sc;
	}

	delete(id: string): boolean {
		if (!this.section.definitions[id]) return false;
		delete this.section.definitions[id];
		this.section.order = this.section.order.filter(x => x !== id);
		this.emitAudit({ entity: 'smartCode', type: 'sc_deleted', codeId: id });
		this.emitMutate(id);
		return true;
	}

	/** Setter de conveniência pra updates simples só do conteúdo (preserva materialized se houver). */
	setMemo(id: string, content: string): void {
		const sc = this.section.definitions[id];
		if (!sc) return;
		const next: MemoRecord = sc.memo?.materialized
			? { content, materialized: sc.memo.materialized }
			: { content };
		this.update(id, { memo: next });
	}

	setColor(id: string, color: string): void {
		const sc = this.section.definitions[id];
		if (!sc) return;
		sc.color = color;
		sc.paletteIndex = -1;
		this.emitMutate(id);
	}

	/**
	 * Após executeMerge: re-escreve predicates que referenciam `sourceCodeId` → `targetCodeId`.
	 * Preserva intenção: smart code "frustração ∩ junior" continua funcionando se "frustração" foi mergeado.
	 */
	autoRewriteOnMerge(sourceCodeId: string, targetCodeId: string): { rewritten: string[] } {
		const rewritten: string[] = [];
		for (const sc of Object.values(this.section.definitions)) {
			const newPredicate = rewriteCodeRef(sc.predicate, sourceCodeId, targetCodeId);
			if (newPredicate !== sc.predicate) {
				sc.predicate = newPredicate;
				rewritten.push(sc.id);
				this.emitAudit({ entity: 'smartCode', type: 'sc_auto_rewritten_on_merge', codeId: sc.id, sourceCodeId, targetCodeId });
			}
		}
		for (const id of rewritten) this.emitMutate(id);
		return { rewritten };
	}
}

/** Aceita string (content) ou MemoRecord completo (com materialized). Vazio → undefined. */
function normalizeMemo(memo: string | MemoRecord | undefined): MemoRecord | undefined {
	if (memo === undefined) return undefined;
	if (typeof memo === 'string') return memo.length > 0 ? { content: memo } : undefined;
	return memo;
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
