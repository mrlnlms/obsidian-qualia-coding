/**
 * Mode A — matriz coder × coder. Cohen κ pareado em cada célula.
 *
 * Diagonal cinza, off-diagonal pinta com color scale (vermelho < laranja < verde).
 * Click em célula off-diagonal seleciona o par.
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

	const inputs = await extractInputsFromScope(state.scope, {
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
		const cohenTable = r.report.aggregate.cohenKappa;
		// Reporter pode tabular como `a|b` ou `b|a` dependendo da ordem; normaliza.
		const value = cohenTable[`${a}|${b}`] ?? cohenTable[`${b}|${a}`];
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

const KAPPA_THRESHOLDS = { low: 0.4, midLow: 0.6, midHigh: 0.8 } as const;

function kappaClass(k: number): string {
	if (k < KAPPA_THRESHOLDS.low) return 'qc-kappa-low';
	if (k < KAPPA_THRESHOLDS.midLow) return 'qc-kappa-mid-low';
	if (k < KAPPA_THRESHOLDS.midHigh) return 'qc-kappa-mid-high';
	return 'qc-kappa-high';
}
