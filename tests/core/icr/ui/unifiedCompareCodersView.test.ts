import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedCompareCodersView, COMPARE_CODERS_VIEW_TYPE } from '../../../../src/core/icr/ui/unifiedCompareCodersView';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';

function mockLeaf(): any {
	return { containerEl: document.createElement('div'), view: undefined };
}

function mockPlugin(coderRegistry: CoderRegistry): any {
	return {
		coderRegistry,
		sharedRegistry: {} as any,
		comparisonRegistry: { getById: () => undefined } as any,
		dataManager: {
			getDataRef: () => ({ lastCompareCodersUsed: undefined }),
			setSection: () => {},
		} as any,
		app: { vault: {}, workspace: {} },
	};
}

describe('UnifiedCompareCodersView', () => {
	let coderRegistry: CoderRegistry;
	let view: UnifiedCompareCodersView;

	beforeEach(() => {
		coderRegistry = new CoderRegistry();
		coderRegistry.createHuman('A');
		coderRegistry.createHuman('B');
		coderRegistry.createHuman('C');
		const leaf = mockLeaf();
		view = new UnifiedCompareCodersView(leaf, mockPlugin(coderRegistry));
	});

	it('expõe getViewType e display text', () => {
		expect(view.getViewType()).toBe(COMPARE_CODERS_VIEW_TYPE);
		expect(view.getDisplayText()).toBe('Compare Coders');
		expect(view.getIcon()).toBe('users-2');
	});

	it('inicializa state com todos coders do registry no scope', () => {
		const state = view.getCompareState();
		expect(state.scope.coderIds.length).toBe(coderRegistry.getAll().length);
		expect(state.overviewMode).toBe('matrix');
		expect(state.drilldownMode).toBe('spatial');
		expect(state.primaryCoefficient).toBe('cohen');
	});

	it('onOpen monta toolbar + overview + drilldown sections', async () => {
		await view.onOpen();
		expect(view.contentEl.querySelector('.qc-cc-toolbar')).toBeTruthy();
		expect(view.contentEl.querySelector('.qc-cc-overview')).toBeTruthy();
		expect(view.contentEl.querySelector('.qc-cc-drilldown')).toBeTruthy();
		expect(view.contentEl.querySelector('.qc-cc-mode-question')).toBeTruthy();
	});

	it('updateState merge partial e dispara re-render', async () => {
		await view.onOpen();
		const initialMode = view.getCompareState().overviewMode;
		view.updateState({ overviewMode: 'matrix' });  // idempotente
		expect(view.getCompareState().overviewMode).toBe(initialMode);
	});

	it('setSelection atualiza currentSelection no state', async () => {
		await view.onOpen();
		view.setSelection({ kind: 'pair', value: ['human:A', 'human:B'] });
		const sel = view.getCompareState().currentSelection;
		expect(sel.kind).toBe('pair');
	});

	it('toolbar renderiza coefficient picker (5 chips)', async () => {
		await view.onOpen();
		const chips = view.contentEl.querySelectorAll('.qc-cc-coef-chip');
		expect(chips.length).toBe(5);
		const cohenChip = view.contentEl.querySelector('.qc-cc-coef-chip[data-coefficient="cohen"]');
		expect(cohenChip?.classList.contains('is-active')).toBe(true);
	});

	it('click chip Fleiss atualiza state.primaryCoefficient', async () => {
		await view.onOpen();
		const fleissChip = view.contentEl.querySelector('.qc-cc-coef-chip[data-coefficient="fleiss"]') as HTMLElement;
		fleissChip.click();
		expect(view.getCompareState().primaryCoefficient).toBe('fleiss');
	});
});
