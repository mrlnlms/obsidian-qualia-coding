import type {
	SavedComparison,
	ComparisonsSection,
	ComparisonScope,
	ComparisonFilters,
	SavedComparisonView,
} from './ui/compareCodersTypes';

let _idCounter = 0;
function makeComparisonId(): string {
	return `sc_cmp_${Date.now().toString(36)}_${(_idCounter++).toString(36)}`;
}

/**
 * Registry de Saved Comparisons (Slice E4). Segue o mesmo pattern de `SmartCodeRegistry` /
 * `CodeDefinitionRegistry`: state interno mutado in-place, listeners via `addOnMutate`,
 * persistência via `toJSON()` + `fromJSON()`.
 *
 * Saved comparisons são preferência de UX, não decisão analítica — sem audit listener
 * (spec §7 — "saved comparisons são preferência de UX, não decisão analítica").
 *
 * O store interno (`section`) é o mesmo objeto persistido em `data.comparisons` — mutado
 * in-place. Listeners recebem o id mudado (ou `'__bulk__'` em operações em massa).
 */
export class ComparisonRegistry {
	private mutateListeners = new Set<(changedId: string) => void>();

	constructor(private section: ComparisonsSection) {}

	static fromJSON(section: ComparisonsSection | undefined): ComparisonRegistry {
		return new ComparisonRegistry(section ?? { definitions: {}, order: [] });
	}

	toJSON(): ComparisonsSection {
		return this.section;
	}

	addOnMutate(fn: (changedId: string) => void): () => void {
		this.mutateListeners.add(fn);
		return () => { this.mutateListeners.delete(fn); };
	}

	private emitMutate(changedId: string): void {
		for (const fn of this.mutateListeners) fn(changedId);
	}

	// ─── Reads ────────────────────────────────────────────────

	getById(id: string): SavedComparison | undefined {
		return this.section.definitions[id];
	}

	getAll(): SavedComparison[] {
		return this.section.order
			.map(id => this.section.definitions[id])
			.filter((c): c is SavedComparison => c !== undefined);
	}

	getDefinitionsRef(): Record<string, SavedComparison> {
		return this.section.definitions;
	}

	// ─── Writes ───────────────────────────────────────────────

	create(args: {
		name: string;
		scope: ComparisonScope;
		view: SavedComparisonView;
		filters: ComparisonFilters;
	}): SavedComparison {
		const id = makeComparisonId();
		const now = Date.now();
		const cmp: SavedComparison = {
			id,
			name: args.name,
			scope: cloneScope(args.scope),
			view: { ...args.view },
			filters: cloneFilters(args.filters),
			createdAt: now,
			updatedAt: now,
		};
		this.section.definitions[id] = cmp;
		this.section.order.push(id);
		this.emitMutate(id);
		return cmp;
	}

	rename(id: string, newName: string): boolean {
		const cmp = this.section.definitions[id];
		if (!cmp) return false;
		cmp.name = newName;
		cmp.updatedAt = Date.now();
		this.emitMutate(id);
		return true;
	}

	update(id: string, patch: {
		scope?: ComparisonScope;
		view?: SavedComparisonView;
		filters?: ComparisonFilters;
		name?: string;
	}): SavedComparison | undefined {
		const cmp = this.section.definitions[id];
		if (!cmp) return undefined;
		if (patch.name !== undefined) cmp.name = patch.name;
		if (patch.scope !== undefined) cmp.scope = cloneScope(patch.scope);
		if (patch.view !== undefined) cmp.view = { ...patch.view };
		if (patch.filters !== undefined) cmp.filters = cloneFilters(patch.filters);
		cmp.updatedAt = Date.now();
		this.emitMutate(id);
		return cmp;
	}

	delete(id: string): boolean {
		if (!this.section.definitions[id]) return false;
		delete this.section.definitions[id];
		this.section.order = this.section.order.filter(x => x !== id);
		this.emitMutate(id);
		return true;
	}

	duplicate(id: string): SavedComparison | undefined {
		const src = this.section.definitions[id];
		if (!src) return undefined;
		return this.create({
			name: `${src.name} (copy)`,
			scope: src.scope,
			view: src.view,
			filters: src.filters,
		});
	}
}

// ─── Helpers de clone (defensivos pra mutate in-place não vazar pro caller) ────────

function cloneScope(scope: ComparisonScope): ComparisonScope {
	return {
		coderIds: [...scope.coderIds],
		codeIds: scope.codeIds ? [...scope.codeIds] : undefined,
		groupIds: scope.groupIds ? [...scope.groupIds] : undefined,
		folderIds: scope.folderIds ? [...scope.folderIds] : undefined,
		engineIds: scope.engineIds ? [...scope.engineIds] : undefined,
		fileIds: scope.fileIds ? [...scope.fileIds] : undefined,
	};
}

function cloneFilters(filters: ComparisonFilters): ComparisonFilters {
	return {
		...filters,
		visibleCoderIds: filters.visibleCoderIds ? [...filters.visibleCoderIds] : undefined,
		visibleEngineIds: filters.visibleEngineIds ? [...filters.visibleEngineIds] : undefined,
	};
}
