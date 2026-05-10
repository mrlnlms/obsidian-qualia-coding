/**
 * Compare Coders view — types de estado central.
 *
 * State é compartilhado entre overview (escreve currentSelection) e drill-down (lê).
 * Toolbar escreve overviewMode/drilldownMode/filters/scope.
 * Modal "ver lado a lado" lê tudo mas não escreve (E2).
 */

import type { CoderId } from '../coderTypes';
import type { EngineId } from '../reporter';

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
}

export type ReconciliationBounds =
	| { kind: 'text'; from: number; to: number }
	| { kind: 'csvRow'; rowIndex: number; column?: string }
	| { kind: 'temporal'; fromMs: number; toMs: number };

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
		filters: {
			hideAgreementTotal: false,
			highlightConflicts: false,
			excludeConsensusCoders: false,
		},
		currentSelection: { kind: 'none' },
		isDirty: false,
	};
}
