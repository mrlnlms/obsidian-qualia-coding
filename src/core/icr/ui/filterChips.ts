/**
 * Filter chips no toolbar — toggle coders + toggle engines + highlight conflicts + hide agreement.
 *
 * Mutate state via callback. Caller (view) re-renderiza.
 */

import type { CompareCodersViewState } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { EngineId } from '../reporter';

export const FILTERABLE_ENGINES: { id: EngineId; label: string }[] = [
	{ id: 'markdown',   label: 'markdown' },
	{ id: 'pdf',        label: 'pdf' },
	{ id: 'csvSegment', label: 'csv-seg' },
	{ id: 'csvRow',     label: 'csv-row' },
	{ id: 'audio',      label: 'audio' },
	{ id: 'video',      label: 'video' },
];

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

	const sep = container.createSpan({ cls: 'qc-cc-filter-sep', text: '·' });
	sep.setAttribute('aria-hidden', 'true');

	for (const { id, label } of FILTERABLE_ENGINES) {
		const visible = !state.filters.visibleEngineIds || state.filters.visibleEngineIds.includes(id);
		const chip = container.createSpan({
			cls: `qc-cc-filter-chip qc-cc-engine-chip ${visible ? 'is-active' : ''}`,
			text: label,
		});
		chip.dataset.engineId = id;
		chip.onclick = () => {
			const cur = state.filters.visibleEngineIds ?? FILTERABLE_ENGINES.map(e => e.id);
			const next = visible ? cur.filter(e => e !== id) : [...cur, id];
			onUpdate({ filters: { ...state.filters, visibleEngineIds: next } });
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
