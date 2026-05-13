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

import type { CompareCodersViewState, ComparisonScope, CurrentSelection } from './compareCodersTypes';
import { extractInputsFromScope, type EngineModelsForExtraction } from './scopeExtraction';
import { reportPairwiseAsync, pairKey, type EngineKappaInput } from '../reporter';
import { cacheKeyForScope } from './scopeExtraction';
import type { CoderId } from '../coderTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import type { App } from 'obsidian';
import { getCoefficientValue } from './coefficientResolver';
import { kappaClass } from './overviewSharedRender';
import { computeBboxKappaInputsForPair, computeBboxKappaForPair } from './bboxScopeExtraction';
import { applyCoderInclusion, applyConsensusExclusion, applyVisibleCoderFilter } from './coderInclusion';
import { activeFamilies, renderMultimodalBanner } from './multimodalBanner';
import { renderPerEngineTable, type BboxByPair } from './overviewPerEngineTable';

export interface OverviewMatrixDeps {
	coderRegistry: CoderRegistry;
	codeRegistry: CodeDefinitionRegistry;
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
	// E3b: exclui consensus coders quando excludeConsensusCoders=true (toggle κ pré/pós).
	const inclusionScope = applyConsensusExclusion(
		applyCoderInclusion(
			state.scope,
			deps.engineModels,
			state.filters.includeCodersWithoutMarkers ?? false,
		),
		deps.coderRegistry,
		state.filters.excludeConsensusCoders,
	);
	// visibleCoderIds (chips toolbar) só poda a lista visível — não entra no scope
	// passado ao extractInputsFromScope. Mantém cache key do extract estável entre
	// toggles de chip (extract por coder é o passo caro; pairs/grid filtram depois).
	const coderIds = applyVisibleCoderFilter(inclusionScope, state.filters.visibleCoderIds).coderIds;
	const N = coderIds.length;
	if (N < 2) {
		container.createDiv({ text: 'Selecione 2+ coders com markers no escopo (ou habilite "incluir coders sem markers")', cls: 'qc-cc-empty' });
		return;
	}

	// Filter chips no toolbar podem restringir engines via state.filters.visibleEngineIds.
	// Override scope.engineIds com a interseção quando filtro estiver ativo.
	const effectiveScope = state.filters.visibleEngineIds
		? { ...inclusionScope, engineIds: state.filters.visibleEngineIds }
		: inclusionScope;

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

	// Bbox engines (pdfShape + image) entram só pra Cohen κ — bbox adapter reduz
	// a binary categorical, demais coeficientes não fazem sentido sobre essa redução.
	// Slice E5b-followup: bbox vira EngineKappaInput per-pair injetado em reportPairwise;
	// aggregate.cohenKappa pondera naturalmente por #markers (chars text-like vs eventos
	// bbox). Eliminou o avg 50/50 que ignorava magnitudes muito assimétricas.
	const perPairBbox = new Map<string, EngineKappaInput[]>();
	if (state.primaryCoefficient === 'cohen' && (deps.engineModels.pdf || deps.engineModels.image)) {
		const splitBbox = state.filters.splitBboxEngines ?? false;
		const bboxMode: 'unified' | 'split' = splitBbox ? 'split' : 'unified';
		for (const pair of pairs) {
			const bboxInputs = computeBboxKappaInputsForPair({
				models: { pdf: deps.engineModels.pdf, image: deps.engineModels.image },
				scope: effectiveScope,
				pair,
				mode: bboxMode,
				theta: 0.5,
			});
			if (bboxInputs.length > 0) perPairBbox.set(pairKey(pair), bboxInputs);
		}
	}

	const hasAnyInput = inputs.length > 0 || perPairBbox.size > 0;
	// Suffix bbox + δ no cacheKey: distingue render Cohen-com-bbox de Fleiss/α-sem-bbox, e
	// renders δ_jaccard de δ_MASI/nominal. §46: δ é parâmetro de comportamento, não scope.
	const distance = state.distance ?? 'jaccard';
	const reportCacheKey = cacheKeyForScope(effectiveScope)
		+ (perPairBbox.size > 0 ? '::bbox' : '')
		+ `::δ-${distance}`;
	const reports = hasAnyInput
		? await reportPairwiseAsync(inputs, pairs, reportCacheKey, perPairBbox, distance)
		: [];

	// Camada 1 (B4, 2026-05-13): escopo multimodal → banner discreto + per-engine table
	// como apresentação primária. Matriz cohort-aggregate continua, marcada como descritiva.
	const families = activeFamilies(inputs, perPairBbox.size > 0);
	const isMultimodal = families.size >= 2;
	if (isMultimodal) {
		renderMultimodalBanner(container, families);
		const bboxByPair: BboxByPair | undefined = perPairBbox.size > 0
			? buildBboxByPair(pairs, effectiveScope, deps, state.filters.splitBboxEngines ?? false)
			: undefined;
		renderPerEngineTable(container, reports, bboxByPair);
		const matrixLabel = container.createDiv({
			cls: 'qc-cc-aggregate-label',
			text: 'Matriz coder × coder (descritivo — agrega modalidades, não usar como métrica inferencial)',
		});
		matrixLabel.title = [
			'A matriz abaixo combina markers de modalidades diferentes via média ponderada por #markers.',
			'Cada modalidade tem sua própria δ — o pooled κ não está definido na literatura.',
			'Use a tabela "κ por modalidade" acima como fonte de verdade.',
			'',
			'Detalhe em: obsidian-qualia-coding/Research/ICR Multimodal - Unidades Heterogeneas.md',
		].join('\n');
	}
	const kappaByPair = new Map<string, number | undefined>();
	const cohenPerCodeByPair = new Map<string, Record<string, number>>();
	for (const r of reports) {
		const [a, b] = r.pair;
		const value = getCoefficientValue(r.report, state.primaryCoefficient, [a, b]);
		const normalKey = a < b ? `${a}|${b}` : `${b}|${a}`;
		kappaByPair.set(normalKey, value);
		if (state.primaryCoefficient === 'cohen') {
			const cohen = r.report.aggregate.cohenKappa[`${a}|${b}`] ?? r.report.aggregate.cohenKappa[`${b}|${a}`];
			if (cohen?.perCode && Object.keys(cohen.perCode).length > 0) {
				cohenPerCodeByPair.set(normalKey, cohen.perCode);
			}
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
				// Tooltip perCode breakdown quando Cohen κ ativo (caminho A binary-per-label)
				const perCode = cohenPerCodeByPair.get(key);
				if (perCode) {
					const sorted = Object.entries(perCode).sort(([, a], [, b]) => a - b);
					const lines = sorted.map(([codeId, κ]) => {
						const name = deps.codeRegistry.getById(codeId)?.name ?? codeId;
						return `  ${name}: ${κ.toFixed(2)}`;
					});
					cell.title = `Decomposição Cohen κ (caminho A):\n${lines.join('\n')}`;
				}
			}
			cell.onclick = () => onSelect({ kind: 'pair', value: [rowId, colId] });
		}
	}
}

/** Coleta κ bbox por par pra alimentar a per-engine table (Camada 1, B4).
 *  Reusa `computeBboxKappaForPair` que já tem cache interno via reportKappa. */
function buildBboxByPair(
	pairs: [CoderId, CoderId][],
	scope: ComparisonScope,
	deps: OverviewMatrixDeps,
	splitBbox: boolean,
): BboxByPair {
	const mode: 'unified' | 'split' = splitBbox ? 'split' : 'unified';
	const valuesByPair = new Map<string, { spatialBbox?: number; pdfShape?: number; image?: number }>();
	for (const pair of pairs) {
		const r = computeBboxKappaForPair({
			models: { pdf: deps.engineModels.pdf, image: deps.engineModels.image },
			scope,
			pair,
			mode,
			theta: 0.5,
		});
		valuesByPair.set(pairKey(pair), r);
	}
	return { mode, valuesByPair };
}
