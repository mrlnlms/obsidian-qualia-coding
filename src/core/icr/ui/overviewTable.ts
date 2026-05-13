/**
 * Mode B — tabela 1 row por código × 5 coeficientes (#markers + Cohen + Fleiss + α + α-binary + cu-α).
 *
 * Sort default: pior coeficiente primário ascendente (pior κ no topo). Critério varia por N coders:
 * - 2 coders → sort por Cohen κ (Fleiss "—")
 * - 3+ coders → sort por Fleiss κ (Cohen "—")
 *
 * Click row seleciona o code (state.currentSelection = { kind: 'code' }).
 *
 * Códigos sem markers no escopo NÃO entram (não polui com linhas vazias). Pra ver
 * todos os códigos do registry mesmo sem markers, usuário ajusta scope.codeIds.
 *
 * Async pelo mesmo motivo de overviewMatrix (vault.cachedRead pra markdown).
 */

import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import { extractInputsFromScope, type EngineModelsForExtraction } from './scopeExtraction';
import { reportKappaAsync } from '../reporter';
import { cacheKeyForScope } from './scopeExtraction';
import { kappaClass } from './overviewSharedRender';
import { applyCoderInclusion, applyConsensusExclusion, applyVisibleCoderFilter } from './coderInclusion';
import { filterInputsByCoders } from './scopeExtraction';
import type { App } from 'obsidian';

export interface OverviewTableDeps {
	coderRegistry: CoderRegistry;
	codeRegistry: CodeDefinitionRegistry;
	engineModels: EngineModelsForExtraction;
	app: App;
}

interface CodeRow {
	codeId: string;
	codeName: string;
	markerCount: number;
	cohen?: number;
	fleiss?: number;
	alpha?: number;
	alphaBinary?: number;
	cuAlpha?: number;
}

export async function renderOverviewTable(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: OverviewTableDeps,
	onSelect: (sel: CurrentSelection) => void,
): Promise<void> {
	container.empty();
	const candidateCodeIds = state.scope.codeIds ?? deps.codeRegistry.getAll().map(c => c.id);
	if (candidateCodeIds.length === 0) {
		container.createDiv({ text: 'Sem códigos no escopo', cls: 'qc-cc-empty' });
		return;
	}

	// Polish E1: filtra coders sem markers no escopo (default off)
	// E3b: exclui consensus coders quando excludeConsensusCoders=true (toggle κ pré/pós).
	// ⚠️ Perf: visibleCoderIds NÃO entra no scope do extract (ver regra em scopeExtraction.ts
	// → filterInputsByCoders). inclusionScope é estável entre toggles de chip → cache hit.
	const inclusionScope = applyConsensusExclusion(
		applyCoderInclusion(
			state.scope,
			deps.engineModels,
			state.filters.includeCodersWithoutMarkers ?? false,
		),
		deps.coderRegistry,
		state.filters.excludeConsensusCoders,
	);
	const visibleCoderIds = applyVisibleCoderFilter(inclusionScope, state.filters.visibleCoderIds).coderIds;
	const N = visibleCoderIds.length;
	if (N < 2) {
		container.createDiv({ text: 'Selecione 2+ coders com markers no escopo (ou habilite "incluir coders sem markers")', cls: 'qc-cc-empty' });
		return;
	}

	// Override scope.engineIds quando há filter chip de engine ativo (mesmo pattern do matrix)
	const effectiveScope = state.filters.visibleEngineIds
		? { ...inclusionScope, engineIds: state.filters.visibleEngineIds }
		: inclusionScope;

	const visKey = '::v=' + [...visibleCoderIds].sort().join(',');
	const distance = state.distance ?? 'jaccard';

	// Perf fix 2026-05-11: paraleliza extracts + reportKappa por código (antes era sequential await).
	const rowsRaw = await Promise.all(candidateCodeIds.map(async (codeId) => {
		const inputs = await extractInputsFromScope(
			{ ...effectiveScope, codeIds: [codeId] },
			{ models: deps.engineModels, app: deps.app },
		);
		const filteredInputs = filterInputsByCoders(inputs, visibleCoderIds);
		const totalMarkers = filteredInputs.reduce((s, i) => {
			const k = i.kappaInput as { markers?: unknown[]; units?: unknown[] };
			return s + (k.markers?.length ?? k.units?.length ?? 0);
		}, 0);
		if (totalMarkers === 0) return null;
		const report = await reportKappaAsync(
			filteredInputs,
			cacheKeyForScope({ ...effectiveScope, codeIds: [codeId] }) + visKey + `::δ-${distance}`,
			distance,
		);
		// Cohen κ pra esse code-filtrado. Pós-refactor C (caminho A binary-per-label),
		// value já reflete Cohen κ daquele code (universe interno = {code} no escopo filtrado).
		// N=2: 1 par direto; N≥3: média dos C(N,2) pares (mesmo pattern do heatmap, commit 2b894dd).
		const cohenReports = Object.values(report.aggregate.cohenKappa);
		let cohen: number | undefined;
		if (N >= 2 && cohenReports.length > 0) {
			const valid = cohenReports.map(r => r.value).filter(v => Number.isFinite(v));
			if (valid.length > 0) {
				cohen = valid.reduce((s, v) => s + v, 0) / valid.length;
			}
		}
		const fleiss = N >= 3 ? report.aggregate.fleissKappa : undefined;
		return {
			codeId,
			codeName: deps.codeRegistry.getById(codeId)?.name ?? codeId,
			markerCount: totalMarkers,
			cohen,
			fleiss,
			alpha: report.aggregate.alphaNominal,
			alphaBinary: report.aggregate.alphaBinary,
			cuAlpha: report.aggregate.cuAlpha,
		} as CodeRow;
	}));
	const rows: CodeRow[] = rowsRaw.filter((r): r is CodeRow => r !== null);

	// Sort: pior coeficiente primário (Cohen pra N=2, Fleiss pra N≥3) ascendente; n/a no fim
	rows.sort((a, b) => {
		const ka = N === 2 ? a.cohen : a.fleiss;
		const kb = N === 2 ? b.cohen : b.fleiss;
		if (ka === undefined && kb === undefined) return 0;
		if (ka === undefined) return 1;
		if (kb === undefined) return -1;
		return ka - kb;
	});

	if (rows.length === 0) {
		container.createDiv({ text: 'Nenhum código tem markers no escopo atual', cls: 'qc-cc-empty' });
		return;
	}

	const table = container.createEl('table', { cls: 'qc-cc-table' });
	const thead = table.createEl('thead').createEl('tr');
	['código', '# markers', 'Cohen κ', 'Fleiss κ', 'α', 'α-binary', 'cu-α'].forEach(h => thead.createEl('th', { text: h }));
	const tbody = table.createEl('tbody');
	const hideAgree = state.filters.hideAgreementTotal;
	for (const r of rows) {
		const tr = tbody.createEl('tr');
		// Fade row inteira quando coeficiente primário > 0.8 e filter ativo
		const primary = N === 2 ? r.cohen : r.fleiss;
		if (hideAgree && primary !== undefined && primary > 0.8) tr.addClass('qc-cc-fade');
		tr.createEl('td', { text: r.codeName });
		tr.createEl('td', { text: String(r.markerCount), cls: 'col-count' });
		appendCell(tr, 'col-cohen', r.cohen);
		appendCell(tr, 'col-fleiss', r.fleiss);
		appendCell(tr, 'col-alpha', r.alpha);
		appendCell(tr, 'col-alpha-binary', r.alphaBinary);
		appendCell(tr, 'col-cu-alpha', r.cuAlpha);
		tr.onclick = () => onSelect({ kind: 'code', value: r.codeId });
	}
}

function appendCell(row: HTMLElement, cls: string, value: number | undefined): void {
	const td = row.createEl('td', { cls });
	if (value === undefined || isNaN(value)) {
		td.textContent = '—';
		td.addClass('qc-kappa-na');
	} else {
		td.textContent = value.toFixed(2);
		td.addClass(kappaClass(value));
	}
}
