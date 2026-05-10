/**
 * P1 — Drill-down espacial: lanes per coder no source.
 *
 * Engines text-likes (markdown / pdf-text / csv-segment) renderizam lanes
 * por coder com `[ code-label ]` colorido (mesmo padrão visual do margin
 * panel atual). csv-row delega pra Task 6 (cellStyle no AG Grid existente).
 * Audio/vídeo/bbox NÃO entram em E1 — não aparecem na lista de relevant files
 * (ao invés de stub "Fase 2", omitir é a UX honesta).
 */

import type { App } from 'obsidian';
import type { CompareCodersViewState } from './compareCodersTypes';
import type { EngineId } from '../reporter';
import type { CoderRegistry } from '../coderRegistry';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import type { Marker } from '../../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker, RowMarker, CsvMarker } from '../../../csv/csvCodingTypes';
import type { EngineModelsForExtraction } from './scopeExtraction';
import { computeRowMarkersByCell } from './compareModeColoring';

const E1_DRILLDOWN_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow'];

export interface DrilldownSpatialDeps {
	coderRegistry: CoderRegistry;
	codeRegistry: CodeDefinitionRegistry;
	engineModels: EngineModelsForExtraction;
	/** App pra workspace lookup (csv-row coloring sync com vista CSV aberta). */
	app?: App;
}

export function renderDrilldownSpatial(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: DrilldownSpatialDeps,
): void {
	container.empty();

	container.createDiv({
		cls: 'qc-cc-perspective-question',
		text: '#1 onde discordamos? · #2 que tipo?',
	});

	if (state.currentSelection.kind === 'none') {
		container.createDiv({
			cls: 'qc-cc-drilldown-empty',
			text: 'Selecione um par ou região na overview pra ver o drill-down',
		});
		return;
	}

	const relevantFiles = collectRelevantFiles(state, deps);
	if (relevantFiles.length === 0) {
		container.createDiv({
			cls: 'qc-cc-drilldown-empty',
			text: 'Nenhum arquivo no escopo da seleção (modes drill-down em E1: markdown, pdf-text, csv-segment, csv-row)',
		});
		return;
	}

	for (const fileEntry of relevantFiles) {
		const fileSection = container.createDiv({ cls: 'qc-cc-drilldown-file' });
		fileSection.createEl('h4', { text: `${fileEntry.fileId}  ·  ${fileEntry.engine}` });
		renderForEngine(fileSection, fileEntry.engine, fileEntry.fileId, state, deps);
	}
}

interface RelevantFile {
	fileId: string;
	engine: EngineId;
}

function collectRelevantFiles(
	state: CompareCodersViewState,
	deps: DrilldownSpatialDeps,
): RelevantFile[] {
	const result: RelevantFile[] = [];
	for (const engine of E1_DRILLDOWN_ENGINES) {
		const markers = collectMarkersForEngine(engine, deps);
		const fileIds = new Set(markers.filter(m => isInSelection(m, state)).map(m => m.fileId));
		for (const fid of fileIds) {
			result.push({ fileId: fid, engine });
		}
	}
	return result;
}

type AnyEngineMarker = Marker | PdfMarker | SegmentMarker | RowMarker;

function collectMarkersForEngine(engine: EngineId, deps: DrilldownSpatialDeps): AnyEngineMarker[] {
	const models = deps.engineModels;
	switch (engine) {
		case 'markdown':   return models.markdown?.getAllMarkers() ?? [];
		case 'pdf':        return models.pdf?.getAllMarkers() ?? [];
		case 'csvSegment': return ((models.csv?.getAllMarkers() ?? []) as CsvMarker[]).filter(m => 'from' in m && 'to' in m) as SegmentMarker[];
		case 'csvRow':     return ((models.csv?.getAllMarkers() ?? []) as CsvMarker[]).filter(m => !('from' in m && 'to' in m)) as RowMarker[];
		default: return [];
	}
}

function isInSelection(marker: AnyEngineMarker, state: CompareCodersViewState): boolean {
	const sel = state.currentSelection;
	const codedBy = (marker as { codedBy?: string }).codedBy;
	if (sel.kind === 'pair') {
		return codedBy !== undefined && (sel.value as string[]).includes(codedBy);
	}
	if (sel.kind === 'region') {
		return marker.fileId === sel.value.fileId;
	}
	if (sel.kind === 'code') {
		const codes = (marker as { codes?: { codeId: string }[] }).codes ?? [];
		return codes.some(c => c.codeId === sel.value);
	}
	if (sel.kind === 'codeEngine') {
		const codes = (marker as { codes?: { codeId: string }[] }).codes ?? [];
		return codes.some(c => c.codeId === sel.value.codeId);
	}
	return false;
}

function renderForEngine(
	container: HTMLElement,
	engine: EngineId,
	fileId: string,
	state: CompareCodersViewState,
	deps: DrilldownSpatialDeps,
): void {
	switch (engine) {
		case 'markdown':
		case 'pdf':
		case 'csvSegment':
			renderTextLikeLanes(container, engine, fileId, state, deps);
			break;
		case 'csvRow':
			renderCsvRowHint(container, fileId, state, deps);
			break;
	}
}

/** Text-likes — colunas per coder com [ code-label ] estilo margin panel.
 *  Stripe agreement intensity simplificada (E1): sem cálculo κ por região,
 *  só conta presença de markers por coder. Cálculo per-region fica em E2. */
function renderTextLikeLanes(
	container: HTMLElement,
	engine: EngineId,
	fileId: string,
	state: CompareCodersViewState,
	deps: DrilldownSpatialDeps,
): void {
	const allMarkers = collectMarkersForEngine(engine, deps).filter(m => m.fileId === fileId);
	const coderIds = state.scope.coderIds.filter(id =>
		!state.filters.visibleCoderIds || state.filters.visibleCoderIds.includes(id),
	);
	if (coderIds.length === 0) {
		container.createDiv({ text: 'Nenhum coder visível', cls: 'qc-cc-empty' });
		return;
	}

	const lanesEl = container.createDiv({ cls: 'qc-cc-lanes' });
	for (const coderId of coderIds) {
		const lane = lanesEl.createDiv({ cls: 'qc-cc-lane' });
		const header = lane.createDiv({ cls: 'qc-cc-lane-header' });
		header.textContent = deps.coderRegistry.getById(coderId)?.name ?? coderId;

		const coderMarkers = allMarkers.filter(m => (m as { codedBy?: string }).codedBy === coderId);
		if (coderMarkers.length === 0) {
			lane.createDiv({ cls: 'qc-cc-lane-empty', text: '—' });
			continue;
		}
		for (const m of coderMarkers) {
			const codes = (m as { codes: { codeId: string }[] }).codes;
			const codeId = codes[0]?.codeId;
			const codeDef = codeId ? deps.codeRegistry.getById(codeId) : undefined;
			const codeName = codeDef?.name ?? codeId ?? '?';
			const label = lane.createDiv({ cls: 'qc-cc-lane-marker' });
			label.textContent = `[ ${codeName} ]`;
			if (codeDef?.color) {
				label.style.color = codeDef.color;
			}
		}
	}
}

/** csv-row coloring real: ativa setCompareMode na CsvCodingView aberta pra esse
 *  fileId. Se não tem leaf da vista aberta, mostra hint pro user abrir. */
function renderCsvRowHint(
	container: HTMLElement,
	fileId: string,
	state: CompareCodersViewState,
	deps: DrilldownSpatialDeps,
): void {
	if (!deps.app) {
		container.createDiv({
			cls: 'qc-cc-csv-row-hint',
			text: `Abra ${fileId} numa vista CSV pra ver o coloring por coder na grid`,
		});
		return;
	}

	const allRowMarkers = (collectMarkersForEngine('csvRow', deps) as RowMarker[])
		.filter(m => m.fileId === fileId);
	if (allRowMarkers.length === 0) {
		container.createDiv({ text: `Sem row markers em ${fileId}`, cls: 'qc-cc-empty' });
		return;
	}

	const markerIndex = computeRowMarkersByCell(allRowMarkers);
	const coderColors = new Map<string, string>();
	for (const coderId of state.scope.coderIds) {
		const sample = allRowMarkers.find(m => m.codedBy === coderId);
		const codeId = sample?.codes[0]?.codeId;
		const def = codeId ? deps.codeRegistry.getById(codeId) : undefined;
		coderColors.set(coderId, def?.color ?? '#888888');
	}

	// Procura leaf de CsvCodingView aberto com esse fileId; ativa compare mode.
	const csvLeaves = deps.app.workspace.getLeavesOfType('qualia-csv');
	type CsvLeafView = { file?: { path: string }; setCompareMode?: (ctx: { markerIndex: Map<string, RowMarker[]>; coderColors: Map<string, string> }) => void };
	const targetLeaf = csvLeaves.find(leaf => (leaf.view as unknown as CsvLeafView).file?.path === fileId);
	if (targetLeaf && (targetLeaf.view as unknown as CsvLeafView).setCompareMode) {
		(targetLeaf.view as unknown as CsvLeafView).setCompareMode!({ markerIndex, coderColors });
		container.createDiv({
			cls: 'qc-cc-csv-row-hint is-active',
			text: `CSV row coloring ativo em ${fileId} (vê na vista CSV aberta)`,
		});
	} else {
		container.createDiv({
			cls: 'qc-cc-csv-row-hint',
			text: `Abra ${fileId} numa vista CSV pra ver o coloring por coder na grid`,
		});
	}
}
