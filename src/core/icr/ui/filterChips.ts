/**
 * Filter chips no toolbar — toggle coders + toggle engines + highlight conflicts + hide agreement.
 *
 * Mutate state via callback. Caller (view) re-renderiza.
 */

import type { CompareCodersViewState } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CoderId } from '../coderTypes';
import type { EngineId } from '../reporter';
import { getConsensusCoderIdsInScope } from './coderInclusion';

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
	/** Coders que têm markers no escopo (computed pelo caller). Quando undefined, todos são considerados ativos. */
	codersWithMarkers?: Set<CoderId>;
}

export function renderFilterChips(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: FilterChipsDeps,
	onUpdate: (partial: Partial<CompareCodersViewState>) => void,
): void {
	container.empty();
	container.addClass('qc-cc-filter-chips');

	const includeEmpty = state.filters.includeCodersWithoutMarkers ?? false;
	for (const coderId of state.scope.coderIds) {
		const coder = deps.coderRegistry.getById(coderId);
		const visible = !state.filters.visibleCoderIds || state.filters.visibleCoderIds.includes(coderId);
		const hasMarkers = !deps.codersWithMarkers || deps.codersWithMarkers.has(coderId);
		// Estados separados:
		//   is-no-markers — coder sem markers no escopo (info persistente; italic sempre que aplicável)
		//   is-empty      — coder sem markers + filter polish OFF = bloqueado (italic + opacity + "· 0")
		// Filter ON com coder sem markers: só is-no-markers (italic, clicável, sem "· 0").
		// Caso real: coder human:default criado por seedDefault() em coderRegistry.ts aparece sem markers
		// no escopo do seed; user precisa distinguir do coder ativo mesmo quando o filter ON.
		const isInactive = !hasMarkers && !includeEmpty;
		const cls = `qc-cc-filter-chip qc-cc-coder-chip ${visible && !isInactive ? 'is-active' : ''}${isInactive ? ' is-empty' : ''}${!hasMarkers ? ' is-no-markers' : ''}`;
		const text = (coder?.name ?? coderId) + (isInactive ? ' · 0' : '');
		const chip = container.createSpan({ cls: cls.trim(), text });
		chip.dataset.coderId = coderId;
		if (!hasMarkers) {
			chip.title = isInactive
				? 'Coder sem markers no escopo atual. Habilite o filter "incluir coders sem markers" pra incluir em escopos onde tem contribuição.'
				: 'Coder sem markers no escopo atual (mas incluído pelo filter).';
		}
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

	const splitBboxChip = container.createSpan({
		cls: `qc-cc-filter-chip ${state.filters.splitBboxEngines ? 'is-active' : ''}`,
		text: 'split bbox engines',
	});
	splitBboxChip.dataset.filter = 'split-bbox';
	splitBboxChip.onclick = () => {
		onUpdate({ filters: { ...state.filters, splitBboxEngines: !state.filters.splitBboxEngines } });
	};

	const includeEmptyChip = container.createSpan({
		cls: `qc-cc-filter-chip ${state.filters.includeCodersWithoutMarkers ? 'is-active' : ''}`,
		text: 'incluir coders sem markers',
	});
	includeEmptyChip.dataset.filter = 'include-empty-coders';
	includeEmptyChip.onclick = () => {
		onUpdate({ filters: { ...state.filters, includeCodersWithoutMarkers: !state.filters.includeCodersWithoutMarkers } });
	};

	// E3b: toggle κ pré (sem consensus) vs pós (com consensus) — só aparece quando há consensus
	// coders no escopo COM MARKERS (caso contrário ON/OFF é no-op e poluiria a UI).
	const consensusInScope = getConsensusCoderIdsInScope(state.scope, deps.coderRegistry);
	const consensusWithMarkers = consensusInScope.filter(id => !deps.codersWithMarkers || deps.codersWithMarkers.has(id));
	if (consensusWithMarkers.length > 0) {
		const excludeConsensusChip = container.createSpan({
			cls: `qc-cc-filter-chip ${state.filters.excludeConsensusCoders ? 'is-active' : ''}`,
			text: 'excluir consensus (κ pré)',
		});
		excludeConsensusChip.dataset.filter = 'exclude-consensus';
		excludeConsensusChip.title = state.filters.excludeConsensusCoders
			? 'Consensus excluído do κ — mostrando agreement pré-reconciliação entre coders humanos'
			: 'Consensus incluído no κ — clique pra ver κ pré-reconciliação (sem consensus)';
		excludeConsensusChip.onclick = () => {
			onUpdate({ filters: { ...state.filters, excludeConsensusCoders: !state.filters.excludeConsensusCoders } });
		};
	}
}
