import type { QualiaData, MarkerRef, EngineType, AnyMarker, SmartCodeDefinition, PredicateNode } from './types';
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

/**
 * Singleton cache pra Smart Codes — indexes pré-computados, invalidação granular.
 *
 * Lifecycle:
 * 1. configure(opts) — DEVE ser chamada antes de rebuildIndexes(). Wires smartCodes + lookups + extracts deps.
 *    Re-chamar sempre que data.registry.smartCodes muda (create/update/delete) pra atualizar dep graph.
 * 2. rebuildIndexes(data) — full rebuild dos indexByCode/indexByFile a partir de markers de todos engines.
 *    Não atualiza smartCodes — só os indexes de markers.
 * 3. Listeners em main.ts chamam invalidateForCode/invalidateForCaseVar/invalidateForMarker quando algo muda.
 * 4. UI subscribe(fn) recebe lista de smart codes alterados (rAF coalesced).
 */
export class SmartCodeCache {
	private matches = new Map<string, MarkerRef[]>();
	private deps = new Map<string, Dependencies>();
	private indexByCode = new Map<string, Set<MarkerRef>>();
	private indexByFile = new Map<string, Set<MarkerRef>>();
	private markerByRef = new Map<MarkerRef, AnyMarker>();
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
		// Reset matches: smart codes podem ter sido added/removed
		this.matches.clear();
		this.dirty = new Set(Object.keys(this.smartCodes));
	}

	rebuildIndexes(data: QualiaData): void {
		this.indexByCode.clear();
		this.indexByFile.clear();
		this.markerByRef.clear();
		const allMarkers = getAllMarkers(data);
		for (const { engine, fileId, markerId, marker } of allMarkers) {
			const ref: MarkerRef = { engine: engine as EngineType, fileId, markerId };
			this.markerByRef.set(ref, marker as AnyMarker);
			let fset = this.indexByFile.get(fileId);
			if (!fset) { fset = new Set(); this.indexByFile.set(fileId, fset); }
			fset.add(ref);
			for (const app of (marker as any).codes ?? []) {
				let cset = this.indexByCode.get(app.codeId);
				if (!cset) { cset = new Set(); this.indexByCode.set(app.codeId, cset); }
				cset.add(ref);
			}
		}
		this.matches.clear();
		this.dirty = new Set(Object.keys(this.smartCodes));
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
			evaluator: evaluate,
		};
		const out: MarkerRef[] = [];
		for (const [ref, marker] of this.markerByRef) {
			if (evaluate(predicate, ref, marker, tempCtx)) out.push(ref);
		}
		return out;
	}

	// ─── Test-only helpers ─────────────────────────────────
	__flushPendingForTest(): void { this.flush(); }
	__getIndexByCodeForTest(): Map<string, Set<MarkerRef>> { return this.indexByCode; }
	__getMarkerByRefForTest(): Map<MarkerRef, AnyMarker> { return this.markerByRef; }
	__getMatchesMapSizeForTest(): number { return this.matches.size; }
	__getDirtySizeForTest(): number { return this.dirty.size; }
	__getMatchesMapHasForTest(id: string): boolean { return this.matches.has(id); }
	__getAllRefsForMatcher(): { ref: MarkerRef; marker: AnyMarker }[] {
		const out: { ref: MarkerRef; marker: AnyMarker }[] = [];
		for (const [ref, marker] of this.markerByRef) out.push({ ref, marker });
		return out;
	}
	__getSmartCodeForMatcher(id: string): SmartCodeDefinition | undefined { return this.smartCodes[id]; }
	__buildEvaluatorContextForMatcher(smartCodeId: string): EvaluatorContext {
		return {
			caseVars: this.caseVars,
			codesInFolder: this.codeStruct.codesInFolder,
			codesInGroup: this.codeStruct.codesInGroup,
			smartCodes: this.smartCodes,
			evaluating: new Set([smartCodeId]),
			evaluator: evaluate,
		};
	}

	private markDirty(smartCodeId: string): void {
		if (!(smartCodeId in this.smartCodes)) return;  // smart code não existe (registry mudou)
		this.dirty.add(smartCodeId);
		this.matches.delete(smartCodeId);
		this.pendingChanged.add(smartCodeId);
		if (!this.rafScheduled) {
			this.rafScheduled = true;
			const schedule = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame : (cb: any) => setTimeout(cb, 0);
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
			evaluator: evaluate,
		};
		const out: MarkerRef[] = [];
		for (const [ref, marker] of this.markerByRef) {
			if (evaluate(sc.predicate, ref, marker, ctx)) out.push(ref);
		}
		this.matches.set(smartCodeId, out);
		this.dirty.delete(smartCodeId);
	}
}
