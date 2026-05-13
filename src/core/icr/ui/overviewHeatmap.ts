/**
 * Mode C — heatmap código × engine. Cell = primaryCoefficient pra (code, engine).
 *
 * Linhas = códigos com pelo menos 1 marker no escopo. Colunas = engines visíveis
 * (default: markdown/pdf/csvSegment/csvRow/audio/video; toggle filter chips reduz).
 *
 * Bbox engines (pdfShape + image):
 * - mode unified (default): coluna virtual `'spatial-bbox'` (pdfShape ∪ image num KappaInput);
 *   só aparece se há bbox markers no vault
 * - mode split (toggle `splitBboxEngines`): pdfShape e image como colunas separadas
 *
 * Bbox usa `computeBboxKappaForPair` (per-pair). Pra N=2 coders, 1 pair direto;
 * pra N>2, média dos C(N,2) pairs Cohen κ.
 *
 * Click cell → currentSelection { kind: 'codeEngine', value: { codeId, engineId } }.
 * Cell vazia (code não tem markers nessa engine) renderiza n/a cinza.
 */

import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import { extractInputsFromScope, filterInputsByCoders, type EngineModelsForExtraction } from './scopeExtraction';
import { computeBboxKappaForPair } from './bboxScopeExtraction';
import { reportKappaAsync, type EngineId } from '../reporter';
import { cacheKeyForScope } from './scopeExtraction';
import { getCoefficientValue } from './coefficientResolver';
import { kappaClass } from './overviewSharedRender';
import { applyCoderInclusion, applyConsensusExclusion, applyVisibleCoderFilter } from './coderInclusion';
import type { App } from 'obsidian';
import type { CoderId } from '../coderTypes';

export interface OverviewHeatmapDeps {
	coderRegistry: CoderRegistry;
	codeRegistry: CodeDefinitionRegistry;
	engineModels: EngineModelsForExtraction;
	app: App;
}

const NON_BBOX_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video'];

type ColumnId = EngineId | 'spatial-bbox';

export async function renderOverviewHeatmap(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: OverviewHeatmapDeps,
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
	// ⚠️ Perf: visibleCoderIds NÃO entra no scope passado pro extract (ver regra em
	// scopeExtraction.ts → filterInputsByCoders). Extract usa inclusionScope (estável,
	// cache hit em toggle); coderIds visíveis filtram inputs antes do reportKappa.
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
	state = { ...state, scope: inclusionScope };

	const splitBbox = state.filters.splitBboxEngines ?? false;
	const visibleEngineIds = state.filters.visibleEngineIds ?? NON_BBOX_ENGINES;
	// Ordem fixa pra estabilidade visual entre re-renders
	const visibleNonBbox: EngineId[] = NON_BBOX_ENGINES.filter(e => visibleEngineIds.includes(e));

	// Detectar presença de bbox markers (não usa visibleEngineIds — bbox é sua própria família)
	const pdfShapesAll = (deps.engineModels.pdf as any)?.getAllShapes?.() ?? [];
	const imageMarkersAll = deps.engineModels.image?.getAllMarkers?.() ?? [];
	const hasPdfShape = pdfShapesAll.length > 0;
	const hasImage = imageMarkersAll.length > 0;
	const bboxColumns: ColumnId[] = [];
	if (splitBbox) {
		if (hasPdfShape) bboxColumns.push('pdfShape');
		if (hasImage) bboxColumns.push('image');
	} else {
		if (hasPdfShape || hasImage) bboxColumns.push('spatial-bbox');
	}
	const visibleColumns: ColumnId[] = [...visibleNonBbox, ...bboxColumns];

	if (visibleColumns.length === 0) {
		container.createDiv({ text: 'Nenhuma engine visível no escopo', cls: 'qc-cc-empty' });
		return;
	}

	// Perf fix 2026-05-11: paraleliza os filtros has-markers + κ computation
	// em vez de await sequencial (75+ awaits em série quando heatmap tem ~15 codes × 5 engines
	// dava ~500ms de delay perceptível mesmo com cache hit per cell).
	const codeChecks = await Promise.all(candidateCodeIds.map(async (codeId) => {
		const inputs = await extractInputsFromScope(
			{ ...state.scope, codeIds: [codeId] },
			{ models: deps.engineModels, app: deps.app },
		);
		const hasText = inputs.some(i => {
			const k = i.kappaInput as { markers?: unknown[]; units?: unknown[] };
			return (k.markers?.length ?? k.units?.length ?? 0) > 0;
		});
		const hasBbox = pdfShapesAll.some((m: any) => m.codes?.some((c: any) => c.codeId === codeId))
			|| imageMarkersAll.some((m: any) => m.codes?.some((c: any) => c.codeId === codeId));
		return { codeId, codeName: deps.codeRegistry.getById(codeId)?.name ?? codeId, hasMarkers: hasText || hasBbox };
	}));
	const codesWithMarkers = codeChecks.filter(c => c.hasMarkers).map(c => ({ codeId: c.codeId, codeName: c.codeName }));

	if (codesWithMarkers.length === 0) {
		container.createDiv({ text: 'Nenhum código tem markers no escopo atual', cls: 'qc-cc-empty' });
		return;
	}

	// Compute κ pra cada (code, engine) cell em paralelo — então preenche DOM síncrono.
	type CellResult = { rowIndex: number; col: ColumnId; k: number | undefined };
	const cellPromises: Promise<CellResult>[] = [];
	for (let rowIndex = 0; rowIndex < codesWithMarkers.length; rowIndex++) {
		const row = codesWithMarkers[rowIndex]!;
		for (const col of visibleColumns) {
			cellPromises.push(
				computeKappaForCell(row.codeId, col, state, visibleCoderIds, deps).then(k => ({ rowIndex, col, k })),
			);
		}
	}
	const cellResults = await Promise.all(cellPromises);
	const cellMap = new Map<string, number | undefined>();
	for (const r of cellResults) cellMap.set(`${r.rowIndex}::${r.col}`, r.k);

	const table = container.createEl('table', { cls: 'qc-cc-heatmap' });
	const thead = table.createEl('thead').createEl('tr');
	thead.createEl('th', { text: 'código' });
	for (const col of visibleColumns) {
		const th = thead.createEl('th', { text: columnLabel(col) });
		th.dataset.engine = col;
	}

	const tbody = table.createEl('tbody');
	for (let rowIndex = 0; rowIndex < codesWithMarkers.length; rowIndex++) {
		const row = codesWithMarkers[rowIndex]!;
		const tr = tbody.createEl('tr');
		tr.createEl('th', { text: row.codeName });
		for (const col of visibleColumns) {
			const td = tr.createEl('td');
			td.dataset.engine = col;
			const k = cellMap.get(`${rowIndex}::${col}`);
			if (k === undefined || isNaN(k)) {
				td.textContent = '—';
				td.addClass('qc-kappa-na');
			} else {
				td.textContent = k.toFixed(2);
				td.addClass(kappaClass(k));
				if (state.filters.hideAgreementTotal && k > 0.8) td.addClass('qc-cc-fade');
				const targetEngine: EngineId = col === 'spatial-bbox' ? 'pdfShape' : col;
				td.onclick = () => onSelect({ kind: 'codeEngine', value: { codeId: row.codeId, engineId: targetEngine } });
			}
		}
	}
}

function columnLabel(col: ColumnId): string {
	switch (col) {
		case 'csvSegment':   return 'csv-seg';
		case 'csvRow':       return 'csv-row';
		case 'spatial-bbox': return 'spatial-bbox';
		case 'pdfShape':     return 'pdfShape';
		default:             return col;
	}
}

async function computeKappaForCell(
	codeId: string,
	col: ColumnId,
	state: CompareCodersViewState,
	visibleCoderIds: readonly CoderId[],
	deps: OverviewHeatmapDeps,
): Promise<number | undefined> {
	if (col === 'spatial-bbox' || col === 'pdfShape' || col === 'image') {
		return computeBboxAvgPairwise(codeId, col, state, visibleCoderIds, deps);
	}
	// text-likes / temporal / categorical
	// cellScope usa state.scope (inclusionScope, sem visibility) → cache do extract estável.
	const cellScope = { ...state.scope, codeIds: [codeId], engineIds: [col] };
	const inputs = await extractInputsFromScope(cellScope, { models: deps.engineModels, app: deps.app });
	if (inputs.length === 0) return undefined;
	// Filtra inputs por coders visíveis ANTES do report; cache key ganha sufixo de visibility
	// pra não colidir com versão "todos coders" em outros call sites.
	const filteredInputs = filterInputsByCoders(inputs, visibleCoderIds);
	const totalMarkers = filteredInputs.reduce((s, i) => {
		const k = i.kappaInput as { markers?: unknown[]; units?: unknown[] };
		return s + (k.markers?.length ?? k.units?.length ?? 0);
	}, 0);
	if (totalMarkers === 0) return undefined;
	const visKey = '::v=' + [...visibleCoderIds].sort().join(',');
	const report = await reportKappaAsync(filteredInputs, cacheKeyForScope(cellScope) + visKey);
	const N = visibleCoderIds.length;
	// Cohen κ é per-par; pra N>2, média dos C(N,2) pares (mesmo pattern do bbox em
	// `computeBboxAvgPairwise`). Outros coefs (Fleiss/α/cu-α/α-binary) são cohort-level.
	if (state.primaryCoefficient === 'cohen' && N > 2) {
		const reports = Object.values(report.aggregate.cohenKappa);
		if (reports.length === 0) return undefined;
		return reports.reduce((s, r) => s + r.value, 0) / reports.length;
	}
	const pair: [CoderId, CoderId] | undefined = N === 2
		? [visibleCoderIds[0]!, visibleCoderIds[1]!]
		: undefined;
	return getCoefficientValue(report, state.primaryCoefficient, pair);
}

function computeBboxAvgPairwise(
	codeId: string,
	col: 'spatial-bbox' | 'pdfShape' | 'image',
	state: CompareCodersViewState,
	visibleCoderIds: readonly CoderId[],
	deps: OverviewHeatmapDeps,
): number | undefined {
	const ids = visibleCoderIds;
	const mode: 'unified' | 'split' = col === 'spatial-bbox' ? 'unified' : 'split';
	const pairs: [CoderId, CoderId][] = [];
	for (let i = 0; i < ids.length; i++)
		for (let j = i + 1; j < ids.length; j++)
			pairs.push([ids[i]!, ids[j]!]);
	if (pairs.length === 0) return undefined;
	const values: number[] = [];
	for (const pair of pairs) {
		const r = computeBboxKappaForPair({
			models: { pdf: deps.engineModels.pdf, image: deps.engineModels.image },
			scope: { ...state.scope, codeIds: [codeId] },
			pair,
			mode,
			theta: 0.5,
		});
		const v = col === 'spatial-bbox' ? r.spatialBbox : (col === 'pdfShape' ? r.pdfShape : r.image);
		if (v !== undefined) values.push(v);
	}
	if (values.length === 0) return undefined;
	return values.reduce((s, n) => s + n, 0) / values.length;
}
