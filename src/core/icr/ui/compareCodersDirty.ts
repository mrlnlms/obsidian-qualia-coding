import type {
	CompareCodersViewState,
	SavedComparison,
	SavedComparisonView,
	ComparisonScope,
	ComparisonFilters,
	LastCompareCodersUsed,
} from './compareCodersTypes';

/**
 * Helpers puros pra dirty detection + snapshot do view state (Slice E4).
 *
 * Dirty = (scope, view fields, filters) divergem do saved. Arrays comparados como conjuntos
 * com ordem estável; undefined/empty array tratados como equivalentes.
 *
 * Selection / loadedFromSavedId / isDirty NÃO entram na comparação (ephemeral).
 */

/** Extrai os 3 campos persistíveis do state pra comparação e snapshot. */
export interface CompareCodersSavable {
	scope: ComparisonScope;
	view: SavedComparisonView;
	filters: ComparisonFilters;
}

export function snapshotSavable(state: CompareCodersViewState): CompareCodersSavable {
	return {
		scope: state.scope,
		view: {
			overviewMode: state.overviewMode,
			drilldownMode: state.drilldownMode,
			primaryCoefficient: state.primaryCoefficient,
		},
		filters: state.filters,
	};
}

/** True se state divergir do saved em scope/view/filters. */
export function computeDirty(state: CompareCodersViewState, saved: SavedComparison): boolean {
	const a = snapshotSavable(state);
	const b: CompareCodersSavable = { scope: saved.scope, view: saved.view, filters: saved.filters };
	return !equalSavable(a, b);
}

export function equalSavable(a: CompareCodersSavable, b: CompareCodersSavable): boolean {
	if (!equalScope(a.scope, b.scope)) return false;
	if (a.view.overviewMode !== b.view.overviewMode) return false;
	if (a.view.drilldownMode !== b.view.drilldownMode) return false;
	if (a.view.primaryCoefficient !== b.view.primaryCoefficient) return false;
	if (!equalFilters(a.filters, b.filters)) return false;
	return true;
}

function equalScope(a: ComparisonScope, b: ComparisonScope): boolean {
	if (!equalStringArr(a.coderIds, b.coderIds)) return false;
	if (!equalOptStringArr(a.codeIds, b.codeIds)) return false;
	if (!equalOptStringArr(a.groupIds, b.groupIds)) return false;
	if (!equalOptStringArr(a.folderIds, b.folderIds)) return false;
	if (!equalOptStringArr(a.engineIds as string[] | undefined, b.engineIds as string[] | undefined)) return false;
	if (!equalOptStringArr(a.fileIds, b.fileIds)) return false;
	return true;
}

function equalFilters(a: ComparisonFilters, b: ComparisonFilters): boolean {
	if (a.hideAgreementTotal !== b.hideAgreementTotal) return false;
	if (a.highlightConflicts !== b.highlightConflicts) return false;
	if (a.excludeConsensusCoders !== b.excludeConsensusCoders) return false;
	if ((a.splitBboxEngines ?? false) !== (b.splitBboxEngines ?? false)) return false;
	if ((a.includeCodersWithoutMarkers ?? false) !== (b.includeCodersWithoutMarkers ?? false)) return false;
	if (!equalOptStringArr(a.visibleCoderIds, b.visibleCoderIds)) return false;
	if (!equalOptStringArr(a.visibleEngineIds as string[] | undefined, b.visibleEngineIds as string[] | undefined)) return false;
	return true;
}

/** Arrays comparados como sets pra absorver reordenação. */
function equalStringArr(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const setA = new Set(a);
	for (const x of b) if (!setA.has(x)) return false;
	return true;
}

/** undefined === undefined; undefined ≠ [] ≠ ['x']. Spec: undefined indica "todos", [] indica "nenhum". */
function equalOptStringArr(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
	if (a === undefined && b === undefined) return true;
	if (a === undefined || b === undefined) return false;
	return equalStringArr(a, b);
}

/** Constroi LastCompareCodersUsed a partir do state. Subset compatível com seed do CreateComparisonModal. */
export function snapshotLastUsed(state: CompareCodersViewState): LastCompareCodersUsed {
	const s = snapshotSavable(state);
	return { scope: s.scope, view: s.view, filters: s.filters };
}
