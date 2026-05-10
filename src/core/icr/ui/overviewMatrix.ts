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
import { computeBboxKappaForPair } from './bboxScopeExtraction';
import { applyCoderInclusion } from './coderInclusion';

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

	// Polish E1: filtra coders sem markers no escopo (default off — toggle reincluí).
	const filteredScope = applyCoderInclusion(
		state.scope,
		deps.engineModels,
		state.filters.includeCodersWithoutMarkers ?? false,
	);
	const coderIds = filteredScope.coderIds;
	const N = coderIds.length;
	if (N < 2) {
		container.createDiv({ text: 'Selecione 2+ coders com markers no escopo (ou habilite "incluir coders sem markers")', cls: 'qc-cc-empty' });
		return;
	}

	// Filter chips no toolbar podem restringir engines via state.filters.visibleEngineIds.
	// Override scope.engineIds com a interseção quando filtro estiver ativo.
	const effectiveScope = state.filters.visibleEngineIds
		? { ...filteredScope, engineIds: state.filters.visibleEngineIds }
		: filteredScope;

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

	// Bbox engines (pdfShape + image) entram só pra Cohen κ — bbox adapter reduz
	// a binary categorical, demais coeficientes não fazem sentido sobre essa redução.
	// Merge: avg 50/50 com text-likes quando ambos existem; standalone quando só bbox.
	// Weighting proper via #events vai pra backlog (não bloqueia UX em E2).
	if (state.primaryCoefficient === 'cohen') {
		const splitBbox = state.filters.splitBboxEngines ?? false;
		const bboxMode: 'unified' | 'split' = splitBbox ? 'split' : 'unified';
		// Restringe bbox aos engines visíveis (toggle filter chips). pdfShape ⊂ visibleEngineIds
		// implícito via `image` chip — chip 'pdf' controla pdf-text; chip 'image' está na mesma
		// família de bbox. E1 não tem chips pra pdfShape/image individual; mode unified default
		// cobre os 2; usuário desliga ambos via chip pdf+image se quiser.
		for (const [a, b] of pairs) {
			const bboxK = computeBboxKappaForPair({
				models: { pdf: deps.engineModels.pdf, image: deps.engineModels.image },
				scope: effectiveScope,
				pair: [a, b],
				mode: bboxMode,
				theta: 0.5,
			});
			const bboxValue = bboxMode === 'unified'
				? bboxK.spatialBbox
				: average([bboxK.pdfShape, bboxK.image].filter((v): v is number => v !== undefined));
			if (bboxValue === undefined) continue;
			const normalKey = a < b ? `${a}|${b}` : `${b}|${a}`;
			const textK = kappaByPair.get(normalKey);
			kappaByPair.set(normalKey, textK === undefined ? bboxValue : (textK + bboxValue) / 2);
		}
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
				if (state.filters.hideAgreementTotal && k > 0.8) cell.addClass('qc-cc-fade');
			}
			cell.onclick = () => onSelect({ kind: 'pair', value: [rowId, colId] });
		}
	}
}

function average(nums: number[]): number | undefined {
	if (nums.length === 0) return undefined;
	return nums.reduce((s, n) => s + n, 0) / nums.length;
}

