/**
 * Compare Coders view — types de estado central.
 *
 * State é compartilhado entre overview (escreve currentSelection) e drill-down (lê).
 * Toolbar escreve overviewMode/drilldownMode/filters/scope.
 * Modal "ver lado a lado" lê tudo mas não escreve (E2).
 */

import type { CoderId } from '../coderTypes';
import type { EngineId } from '../reporter';
import type { DistanceName } from '../distances';
import type { ReconciliationBounds } from '../../types';

export type { ReconciliationBounds };

export type OverviewMode = 'matrix' | 'table' | 'heatmap';
export type DrilldownMode = 'spatial' | 'cards' | 'workflow';
export type CoefficientKey = 'cohen' | 'fleiss' | 'alpha' | 'alpha-binary' | 'cu-alpha';

export interface ComparisonScope {
	coderIds: CoderId[];
	codeIds?: string[];
	groupIds?: string[];
	folderIds?: string[];
	engineIds?: EngineId[];
	fileIds?: string[];
}

export interface ComparisonFilters {
	hideAgreementTotal: boolean;
	highlightConflicts: boolean;
	excludeConsensusCoders: boolean;
	visibleCoderIds?: CoderId[];
	/** Override ad-hoc do scope.engineIds via toggle no toolbar. undefined = usa scope.engineIds (ou default). */
	visibleEngineIds?: EngineId[];
	/** Quando true, heatmap mostra `pdfShape` e `image` em colunas separadas; matriz Mode A
	 *  faz merge text+bbox via avg de pdfShape e image individuais.
	 *  Quando false (default), bbox engines viram coluna virtual única `'spatial-bbox'`. */
	splitBboxEngines?: boolean;
	/** Polish E1: quando false (default), coders com 0 markers no escopo são escondidos
	 *  da matriz/tabela/heatmap. Toggle reincluí (útil pra ver coders ainda não engajados). */
	includeCodersWithoutMarkers?: boolean;
}

export type CurrentSelection =
	| { kind: 'pair'; value: [CoderId, CoderId] }
	| { kind: 'code'; value: string }
	| { kind: 'codeEngine'; value: { codeId: string; engineId: EngineId } }
	| { kind: 'region'; value: { fileId: string; engine: EngineId; bounds: ReconciliationBounds; coderIds: CoderId[] } }
	| { kind: 'none' };

export interface CompareCodersViewState {
	scope: ComparisonScope;
	overviewMode: OverviewMode;
	drilldownMode: DrilldownMode;
	primaryCoefficient: CoefficientKey;
	/** Família δ pluggable usada por α / cu-α / Fleiss em escopo multi-label. Default 'jaccard'
	 *  (decisão D1 spec set-valued-labels). Cohen κ (caminho A) e α-binary ignoram. */
	distance: DistanceName;
	filters: ComparisonFilters;
	currentSelection: CurrentSelection;
	loadedFromSavedId?: string;
	isDirty: boolean;
}

export function createDefaultViewState(allCoderIds: CoderId[]): CompareCodersViewState {
	return {
		scope: { coderIds: allCoderIds },
		overviewMode: 'matrix',
		drilldownMode: 'spatial',
		primaryCoefficient: 'cohen',
		distance: 'jaccard',
		filters: {
			hideAgreementTotal: false,
			highlightConflicts: false,
			excludeConsensusCoders: false,
		},
		currentSelection: { kind: 'none' },
		isDirty: false,
	};
}

// ─── Saved Comparisons (Slice E4) ────────────────────────────

/**
 * Subset persistível de view state — `currentSelection`/`loadedFromSavedId`/`isDirty`
 * são ephemeral e não fazem parte do saved.
 */
export interface SavedComparisonView {
	overviewMode: OverviewMode;
	drilldownMode: DrilldownMode;
	primaryCoefficient: CoefficientKey;
	/** δ pluggable. Quando SavedComparison legada não tem o campo, defaultar 'jaccard' na leitura. */
	distance?: DistanceName;
}

/** Schema do saved comparison persistido em data.json. */
export interface SavedComparison {
	id: string;           // sc_cmp_*
	name: string;
	scope: ComparisonScope;
	view: SavedComparisonView;
	filters: ComparisonFilters;
	createdAt: number;
	updatedAt: number;
}

/** Section em QualiaData — espelha SmartCodesSection (sem palette). */
export interface ComparisonsSection {
	definitions: Record<string, SavedComparison>;
	order: string[];
}

/** Estado ephemeral persistido fora de saved comparisons: última config aberta sem saved. */
export interface LastCompareCodersUsed {
	scope: ComparisonScope;
	view: SavedComparisonView;
	filters: ComparisonFilters;
}
