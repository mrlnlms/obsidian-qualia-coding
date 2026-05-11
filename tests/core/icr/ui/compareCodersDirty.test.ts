import { describe, it, expect } from 'vitest';
import {
	computeDirty,
	snapshotSavable,
	snapshotLastUsed,
	equalSavable,
} from '../../../../src/core/icr/ui/compareCodersDirty';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
import type {
	SavedComparison,
	CompareCodersViewState,
} from '../../../../src/core/icr/ui/compareCodersTypes';

function makeSaved(overrides: Partial<SavedComparison> = {}): SavedComparison {
	return {
		id: 'sc_cmp_test',
		name: 'X',
		scope: { coderIds: ['a', 'b'] },
		view: { overviewMode: 'matrix', drilldownMode: 'spatial', primaryCoefficient: 'cohen' },
		filters: { hideAgreementTotal: false, highlightConflicts: false, excludeConsensusCoders: false },
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	};
}

function withState(overrides: Partial<CompareCodersViewState> = {}): CompareCodersViewState {
	return { ...createDefaultViewState(['a', 'b']), ...overrides };
}

describe('computeDirty', () => {
	it('false quando state == saved', () => {
		const saved = makeSaved();
		const state = withState();
		expect(computeDirty(state, saved)).toBe(false);
	});

	it('true quando overviewMode diverge', () => {
		const saved = makeSaved();
		const state = withState({ overviewMode: 'table' });
		expect(computeDirty(state, saved)).toBe(true);
	});

	it('true quando primaryCoefficient diverge', () => {
		const saved = makeSaved();
		const state = withState({ primaryCoefficient: 'alpha' });
		expect(computeDirty(state, saved)).toBe(true);
	});

	it('true quando filter boolean diverge', () => {
		const saved = makeSaved();
		const state = withState({
			filters: { hideAgreementTotal: true, highlightConflicts: false, excludeConsensusCoders: false },
		});
		expect(computeDirty(state, saved)).toBe(true);
	});

	it('false quando coderIds reordenados (set semantics)', () => {
		const saved = makeSaved({ scope: { coderIds: ['a', 'b'] } });
		const state = withState({ scope: { coderIds: ['b', 'a'] } });
		expect(computeDirty(state, saved)).toBe(false);
	});

	it('true quando scope.codeIds adicionado', () => {
		const saved = makeSaved();
		const state = withState({ scope: { coderIds: ['a', 'b'], codeIds: ['c_x'] } });
		expect(computeDirty(state, saved)).toBe(true);
	});

	it('undefined ≠ [] em scope.codeIds', () => {
		const saved = makeSaved();
		const state = withState({ scope: { coderIds: ['a', 'b'], codeIds: [] } });
		expect(computeDirty(state, saved)).toBe(true);
	});

	it('filter splitBboxEngines undefined === false', () => {
		const saved = makeSaved({
			filters: {
				hideAgreementTotal: false, highlightConflicts: false, excludeConsensusCoders: false,
				splitBboxEngines: false,
			},
		});
		const state = withState({
			filters: { hideAgreementTotal: false, highlightConflicts: false, excludeConsensusCoders: false },
		});
		expect(computeDirty(state, saved)).toBe(false);
	});

	it('ignora currentSelection / loadedFromSavedId / isDirty', () => {
		const saved = makeSaved();
		const state = withState({
			currentSelection: { kind: 'pair', value: ['a', 'b'] },
			loadedFromSavedId: 'sc_cmp_test',
			isDirty: true,
		});
		expect(computeDirty(state, saved)).toBe(false);
	});
});

describe('snapshotSavable / snapshotLastUsed', () => {
	it('snapshotSavable extrai scope/view/filters', () => {
		const state = withState({ overviewMode: 'heatmap', primaryCoefficient: 'alpha' });
		const s = snapshotSavable(state);
		expect(s.view.overviewMode).toBe('heatmap');
		expect(s.view.primaryCoefficient).toBe('alpha');
		expect(s.scope.coderIds).toEqual(['a', 'b']);
	});

	it('snapshotLastUsed retorna mesma forma do snapshotSavable', () => {
		const state = withState({ drilldownMode: 'cards' });
		const last = snapshotLastUsed(state);
		const sav = snapshotSavable(state);
		expect(last).toEqual(sav);
	});
});

describe('equalSavable', () => {
	it('compatível com computeDirty', () => {
		const a = snapshotSavable(withState({ overviewMode: 'matrix' }));
		const b = snapshotSavable(withState({ overviewMode: 'table' }));
		expect(equalSavable(a, a)).toBe(true);
		expect(equalSavable(a, b)).toBe(false);
	});
});
