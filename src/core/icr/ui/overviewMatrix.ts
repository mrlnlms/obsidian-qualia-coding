/**
 * Mode A — matriz coder × coder. Coeficiente lido de `state.primaryCoefficient`.
 *
 * Diagonal cinza, off-diagonal pinta com color scale (vermelho < laranja < verde).
 * Click em célula off-diagonal seleciona o par.
 *
 * Cohen κ é per-pair direto; demais coeficientes (Fleiss/α/α-binary/cu-α) são
 * scalar over cohort — `reportPairwise` filtra inputs ao par e re-roda reporter
 * pra obter valor por par. Resolver via `getCoefficientValue(report, coef, pair)`.
 *
 * Async porque `extractInputsFromScope` faz `vault.cachedRead` pra markdown
 * (offsets line/ch precisam de source text pra converter em char absoluto).
 */

import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import { extractInputsFromScope, type EngineModelsForExtraction } from './scopeExtraction';
import { reportPairwise } from '../reporter';
import type { CoderId } from '../coderTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { App } from 'obsidian';
import { getCoefficientValue } from './coefficientResolver';
import { kappaClass } from './overviewSharedRender';

export interface OverviewMatrixDeps {
	coderRegistry: CoderRegistry;
	engineModels: EngineModelsForExtraction;
	app: App;
}

export async function renderOverviewMatrix(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: OverviewMatrixDeps,
	onSelect: (sel: CurrentSelection) => void,
): Promise<void> {
	container.empty();
	const coderIds = state.scope.coderIds;
	const N = coderIds.length;
	if (N < 2) {
		container.createDiv({ text: 'Selecione 2+ coders no escopo', cls: 'qc-cc-empty' });
		return;
	}

	// Filter chips no toolbar podem restringir engines via state.filters.visibleEngineIds.
	// Override scope.engineIds com a interseção quando filtro estiver ativo.
	const effectiveScope = state.filters.visibleEngineIds
		? { ...state.scope, engineIds: state.filters.visibleEngineIds }
		: state.scope;

	const inputs = await extractInputsFromScope(effectiveScope, {
		models: deps.engineModels,
		app: deps.app,
	});

	const pairs: [CoderId, CoderId][] = [];
	for (let i = 0; i < N; i++) {
		for (let j = i + 1; j < N; j++) {
			pairs.push([coderIds[i]!, coderIds[j]!]);
		}
	}

	const reports = inputs.length > 0 ? reportPairwise(inputs, pairs) : [];
	const kappaByPair = new Map<string, number | undefined>();
	for (const r of reports) {
		const [a, b] = r.pair;
		const value = getCoefficientValue(r.report, state.primaryCoefficient, [a, b]);
		const normalKey = a < b ? `${a}|${b}` : `${b}|${a}`;
		kappaByPair.set(normalKey, value);
	}

	const grid = container.createEl('table', { cls: 'qc-cc-matrix' });
	const head = grid.createEl('thead').createEl('tr');
	head.createEl('th');
	for (const id of coderIds) {
		head.createEl('th', { text: deps.coderRegistry.getById(id)?.name ?? id });
	}
	const body = grid.createEl('tbody');
	for (const rowId of coderIds) {
		const row = body.createEl('tr');
		row.createEl('th', { text: deps.coderRegistry.getById(rowId)?.name ?? rowId });
		for (const colId of coderIds) {
			const cell = row.createEl('td', { cls: 'qc-cc-matrix-cell' });
			if (rowId === colId) {
				cell.addClass('is-diagonal');
				cell.textContent = '—';
				continue;
			}
			const key = rowId < colId ? `${rowId}|${colId}` : `${colId}|${rowId}`;
			const k = kappaByPair.get(key);
			if (k === undefined || isNaN(k)) {
				cell.addClass('qc-kappa-na');
				cell.textContent = '—';
			} else {
				cell.addClass(kappaClass(k));
				cell.textContent = k.toFixed(2);
			}
			cell.onclick = () => onSelect({ kind: 'pair', value: [rowId, colId] });
		}
	}
}

