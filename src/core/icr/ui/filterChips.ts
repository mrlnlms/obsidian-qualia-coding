/**
 * Filter chips no toolbar — toggle coders + highlight conflicts + hide agreement.
 *
 * Mutate state via callback. Caller (view) re-renderiza.
 */

import type { CompareCodersViewState } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';

export interface FilterChipsDeps {
	coderRegistry: CoderRegistry;
}

export function renderFilterChips(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: FilterChipsDeps,
	onUpdate: (partial: Partial<CompareCodersViewState>) => void,
): void {
	container.empty();
	container.addClass('qc-cc-filter-chips');

	for (const coderId of state.scope.coderIds) {
		const coder = deps.coderRegistry.getById(coderId);
		const visible = !state.filters.visibleCoderIds || state.filters.visibleCoderIds.includes(coderId);
		const chip = container.createSpan({
			cls: `qc-cc-filter-chip qc-cc-coder-chip ${visible ? 'is-active' : ''}`,
			text: coder?.name ?? coderId,
		});
		chip.dataset.coderId = coderId;
		chip.onclick = () => {
			const cur = state.filters.visibleCoderIds ?? [...state.scope.coderIds];
			const next = visible ? cur.filter(id => id !== coderId) : [...cur, coderId];
			onUpdate({ filters: { ...state.filters, visibleCoderIds: next } });
		};
	}

	const highlightChip = container.createSpan({
		cls: `qc-cc-filter-chip ${state.filters.highlightConflicts ? 'is-active' : ''}`,
		text: 'destacar conflitos',
	});
	highlightChip.dataset.filter = 'highlight-conflicts';
	highlightChip.onclick = () => {
		onUpdate({ filters: { ...state.filters, highlightConflicts: !state.filters.highlightConflicts } });
	};

	const hideAgreeChip = container.createSpan({
		cls: `qc-cc-filter-chip ${state.filters.hideAgreementTotal ? 'is-active' : ''}`,
		text: 'esconder agreement total',
	});
	hideAgreeChip.dataset.filter = 'hide-agreement';
	hideAgreeChip.onclick = () => {
		onUpdate({ filters: { ...state.filters, hideAgreementTotal: !state.filters.hideAgreementTotal } });
	};
}
