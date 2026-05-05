import type { QualiaData, MarkerRef, EngineType, AnyMarker, SmartCodeDefinition, PredicateNode, MarkerMutationEvent } from './types';
import { extractDependencies, type Dependencies } from './dependencyExtractor';
import { evaluate, type EvaluatorContext } from './evaluator';
import { getAllMarkers } from '../getAllMarkers';

export interface CaseVarsLookup {
	get: (fileId: string, variable: string) => string | number | boolean | undefined;
	allKeys: () => Set<string>;
}

export interface CodeStructureLookup {
	codesInFolder: (folderId: string) => string[];
	codesInGroup: (groupId: string) => string[];
}

export interface CacheConfig {
	smartCodes: Record<string, SmartCodeDefinition>;
	caseVars: CaseVarsLookup;
	codeStruct: CodeStructureLookup;
}

/** Composite key pra refByKey — engine:fileId:markerId. Estável dentro de uma sessão. */
function refKey(engine: EngineType, fileId: string, markerId: string): string {
	return `${engine}:${fileId}:${markerId}`;
}

/**
 * Singleton cache pra Smart Codes — indexes pré-computados, invalidação granular.
 *
 * Lifecycle:
 * 1. configure(opts) — chamada UMA vez no onload. Wires smartCodes ref + lookups + extracts deps iniciais.
 * 2. rebuildIndexes(data) — full rebuild do markerByRef a partir de markers de todos engines.
 *    Chamada em bulk operations (clear all, import QDPX, file delete, settings change).
 * 3. applyMarkerMutation(event) — atualização cirúrgica do markerByRef + invalidação granular
 *    via codeIds afetados. Chamada por cada engine model em add/remove/update marker.
 * 4. onSmartCodeChanged(id) — chamada pela SmartCodeRegistry após cada CRUD. Re-extrai deps
 *    daquele sc, marca dirty + cascateia pra dependentes. Não toca outros sc.
 * 5. invalidateForCode/CaseVar/Folder/Group(id) — chamadas quando entidade externa muda.
 * 6. UI subscribe(fn) recebe lista de smart codes alterados (rAF coalesced).
 *
 * NOTA: indexByCode/indexByFile foram REMOVIDOS em SC3 — eram dead code (compute itera só
 * markerByRef). Otimização futura: usar indexByCode pra narrow eval em predicates como
 * hasCode (skip markers sem o código) — mas por ora compute itera tudo.
 */
export class SmartCodeCache {
	private matches = new Map<string, MarkerRef[]>();
	private deps = new Map<string, Dependencies>();
	private markerByRef = new Map<MarkerRef, AnyMarker>();
	/** Reverse index pra lookup O(1) de ref por composite key (engine:fileId:markerId).
	 *  Usado em applyMarkerMutation pra encontrar entry existente em add/update/remove. */
	private refByKey = new Map<string, MarkerRef>();
	private dirty = new Set<string>();
	private listeners = new Set<(changed: string[]) => void>();
	private pendingChanged = new Set<string>();
	private rafScheduled = false;
	private smartCodes: Record<string, SmartCodeDefinition> = {};
	private caseVars: CaseVarsLookup = { get: () => undefined, allKeys: () => new Set() };
	private codeStruct: CodeStructureLookup = { codesInFolder: () => [], codesInGroup: () => [] };

	configure(opts: CacheConfig): void {
		this.smartCodes = opts.smartCodes;
		this.caseVars = opts.caseVars;
		this.codeStruct = opts.codeStruct;
		this.deps.clear();
		for (const [id, sc] of Object.entries(this.smartCodes)) this.deps.set(id, extractDependencies(sc.predicate));
		this.matches.clear();
		this.dirty = new Set(Object.keys(this.smartCodes));
	}

	/**
	 * Notificação incremental: smart code `id` foi adicionado, atualizado ou removido.
	 * Re-extrai deps (ou dropa, se removido) + marca dirty + cascateia pra dependentes.
	 * Chamada pela SmartCodeRegistry via addOnMutate listener.
	 */
	onSmartCodeChanged(id: string): void {
		const sc = this.smartCodes[id];
		if (!sc) {
			this.deps.delete(id);
			this.matches.delete(id);
			this.dirty.delete(id);
			for (const [otherId, deps] of this.deps) {
				if (deps.smartCodeIds.has(id)) this.markDirty(otherId);
			}
			return;
		}
		this.deps.set(id, extractDependencies(sc.predicate));
		this.markDirty(id);
		for (const [otherId, deps] of this.deps) {
			if (otherId !== id && deps.smartCodeIds.has(id)) this.markDirty(otherId);
		}
	}

	rebuildIndexes(data: QualiaData): void {
		this.markerByRef.clear();
		this.refByKey.clear();
		const allMarkers = getAllMarkers(data);
		for (const { engine, fileId, markerId, marker } of allMarkers) {
			const ref: MarkerRef = { engine: engine as EngineType, fileId, markerId };
			this.markerByRef.set(ref, marker);
			this.refByKey.set(refKey(engine as EngineType, fileId, markerId), ref);
		}
		this.matches.clear();
		this.dirty = new Set(Object.keys(this.smartCodes));
	}

	/**
	 * Atualização cirúrgica do markerByRef + invalidação só dos SCs afetados.
	 *
	 * Modos (derivados do shape do event):
	 * - ADD: prevCodeIds vazio + marker definido → cria nova ref, adiciona em markerByRef.
	 * - REMOVE: marker undefined → encontra ref existente por composite key, remove.
	 * - UPDATE: marker definido + ref existente → mantém o mesmo MarkerRef object (preserva
	 *   identidade — evita invalidar refs em uso por consumers/cache.matches), substitui o
	 *   marker value no Map.
	 *
	 * Invalidação: codeIds (união pré+pós) → invalidateForMarker → marca dirty só os SCs
	 * cujo dependencyExtractor reporta dependência em algum desses códigos.
	 *
	 * NOTA: identidade do MarkerRef object é preservada em UPDATE pra que `cache.matches`
	 * (que armazena MarkerRef[] populado por compute) e callers que guardaram refs continuem
	 * lookup-able via getMarkerByRef.
	 */
	applyMarkerMutation(event: MarkerMutationEvent): void {
		const key = refKey(event.engine, event.fileId, event.markerId);
		const existing = this.refByKey.get(key);

		if (event.marker === undefined) {
			// REMOVE
			if (existing) {
				this.markerByRef.delete(existing);
				this.refByKey.delete(key);
			}
		} else if (existing) {
			// UPDATE — preserva ref identity, troca o marker value.
			this.markerByRef.set(existing, event.marker);
		} else {
			// ADD — nova ref.
			const ref: MarkerRef = { engine: event.engine, fileId: event.fileId, markerId: event.markerId };
			this.markerByRef.set(ref, event.marker);
			this.refByKey.set(key, ref);
		}

		// Invalidação granular — codeIds vazio = no-op (ex: memo edit puro).
		if (event.codeIds.length > 0) {
			this.invalidateForMarker({ engine: event.engine, fileId: event.fileId, codeIds: event.codeIds });
		}
	}

	invalidateForCode(codeId: string): void {
		for (const [scId, deps] of this.deps) {
			if (deps.codeIds.has(codeId)) this.markDirty(scId);
		}
	}

	invalidateForCaseVar(varKey: string): void {
		for (const [scId, deps] of this.deps) {
			if (deps.caseVarKeys.has(varKey)) this.markDirty(scId);
		}
	}

	invalidateForFolder(folderId: string): void {
		for (const [scId, deps] of this.deps) {
			if (deps.folderIds.has(folderId)) this.markDirty(scId);
		}
	}

	invalidateForGroup(groupId: string): void {
		for (const [scId, deps] of this.deps) {
			if (deps.groupIds.has(groupId)) this.markDirty(scId);
		}
	}

	invalidateForMarker(args: { engine: EngineType; fileId: string; codeIds: string[] }): void {
		for (const cId of args.codeIds) this.invalidateForCode(cId);
	}

	invalidate(smartCodeId: string): void {
		this.markDirty(smartCodeId);
		// Cascata: smart codes que referenciam este via smartCode leaf
		for (const [scId, deps] of this.deps) {
			if (scId === smartCodeId) continue;
			if (deps.smartCodeIds.has(smartCodeId) && !this.dirty.has(scId)) this.invalidate(scId);
		}
	}

	invalidateAll(): void {
		for (const id of Object.keys(this.smartCodes)) this.markDirty(id);
	}

	getMatches(smartCodeId: string): MarkerRef[] {
		if (this.dirty.has(smartCodeId) || !this.matches.has(smartCodeId)) {
			this.compute(smartCodeId);
		}
		return this.matches.get(smartCodeId) ?? [];
	}

	getCount(smartCodeId: string): number {
		return this.getMatches(smartCodeId).length;
	}

	/** Lookup do marker original via ref obtido em getMatches. Refs são reusados como keys do Map. */
	getMarkerByRef(ref: MarkerRef): AnyMarker | undefined {
		return this.markerByRef.get(ref);
	}

	isDirty(smartCodeId: string): boolean {
		return this.dirty.has(smartCodeId);
	}

	subscribe(fn: (changedSmartCodeIds: string[]) => void): () => void {
		this.listeners.add(fn);
		return () => { this.listeners.delete(fn); };
	}

	/**
	 * Compute matches pra um predicate temporário (e.g., builder modal preview).
	 * NÃO polui internal Maps — stub key não vaza pra `matches`/`dirty`/`deps`.
	 */
	computePreview(predicate: PredicateNode, stubId = '__preview__'): MarkerRef[] {
		const stubSc: SmartCodeDefinition = {
			id: stubId, name: '__preview__', color: '', paletteIndex: 0, createdAt: 0, predicate,
		};
		const tempCtx: EvaluatorContext = {
			caseVars: this.caseVars,
			codesInFolder: this.codeStruct.codesInFolder,
			codesInGroup: this.codeStruct.codesInGroup,
			smartCodes: { ...this.smartCodes, [stubId]: stubSc },
			evaluating: new Set([stubId]),
		};
		const out: MarkerRef[] = [];
		for (const [ref, marker] of this.markerByRef) {
			if (evaluate(predicate, ref, marker, tempCtx)) out.push(ref);
		}
		return out;
	}

	// ─── Test-only helpers ─────────────────────────────────
	__flushPendingForTest(): void { this.flush(); }
	__getMarkerByRefForTest(): Map<MarkerRef, AnyMarker> { return this.markerByRef; }
	__getRefByKeyForTest(): Map<string, MarkerRef> { return this.refByKey; }
	__getMatchesMapSizeForTest(): number { return this.matches.size; }
	__getDirtySizeForTest(): number { return this.dirty.size; }
	__getMatchesMapHasForTest(id: string): boolean { return this.matches.has(id); }
	__buildEvaluatorContextForTest(smartCodeId: string): EvaluatorContext {
		return {
			caseVars: this.caseVars,
			codesInFolder: this.codeStruct.codesInFolder,
			codesInGroup: this.codeStruct.codesInGroup,
			smartCodes: this.smartCodes,
			evaluating: new Set([smartCodeId]),
		};
	}

	private markDirty(smartCodeId: string): void {
		if (!(smartCodeId in this.smartCodes)) return;  // smart code não existe (registry mudou)
		this.dirty.add(smartCodeId);
		this.matches.delete(smartCodeId);
		this.pendingChanged.add(smartCodeId);
		if (!this.rafScheduled) {
			this.rafScheduled = true;
			// jsdom (testes) não tem requestAnimationFrame — fallback pra setTimeout(0).
			const schedule = (typeof requestAnimationFrame !== 'undefined')
				? requestAnimationFrame
				: (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0);
			schedule(() => this.flush());
		}
	}

	private flush(): void {
		this.rafScheduled = false;
		const ids = [...this.pendingChanged];
		this.pendingChanged.clear();
		if (ids.length === 0) return;
		for (const fn of this.listeners) fn(ids);
	}

	private compute(smartCodeId: string): void {
		const sc = this.smartCodes[smartCodeId];
		if (!sc) { this.matches.set(smartCodeId, []); this.dirty.delete(smartCodeId); return; }
		const ctx: EvaluatorContext = {
			caseVars: this.caseVars,
			codesInFolder: this.codeStruct.codesInFolder,
			codesInGroup: this.codeStruct.codesInGroup,
			smartCodes: this.smartCodes,
			evaluating: new Set([smartCodeId]),
		};
		const out: MarkerRef[] = [];
		for (const [ref, marker] of this.markerByRef) {
			if (evaluate(sc.predicate, ref, marker, ctx)) out.push(ref);
		}
		this.matches.set(smartCodeId, out);
		this.dirty.delete(smartCodeId);
	}
}
