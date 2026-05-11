/**
 * P3 — Workflow queue: estado do trabalho de reconciliação no escopo.
 *
 * 4 colunas: Abertos / Em discussão / Resolvidos / Divergência aceita.
 *
 * Lógica de cada coluna em regionDerivation.categorizeRegionsByStatus:
 * - open: contestada (κ < 1.0) sem audit relevante OU com decisão revertida
 * - inDiscussion: tem reconciliation_opened sem decisão ativa posterior
 * - resolved: tem reconciliation_decided ativo com kind ∈ {adopt, split}
 * - divergenceAccepted: tem reconciliation_decided ativo com kind === 'accept-divergence'
 *
 * Click em qualquer card → carrega P2 com a região (state.drilldownMode='cards' + selection).
 * Botão Reverter nos cards de Resolvidos/Divergência aceita → chama executeReconciliationRevert
 * e card volta pra Abertos.
 *
 * Botão "Exportar relatório de reconciliação" no header → exportReconciliationReport (chunk 7).
 */

import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { CompareCodersViewState, CurrentSelection, DrilldownMode } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { IcrMarkerOps } from '../markerOps';
import type { AuditEntry } from '../../types';
import { executeReconciliationRevert } from '../reconciliation';
import {
	collectContestedRegions,
	categorizeRegionsByStatus,
	findLatestActiveDecision,
	type ContestedRegion,
	type RegionStatus,
	type RegionsByStatus,
} from './regionDerivation';

export interface DrilldownWorkflowDeps {
	coderRegistry: CoderRegistry;
	codeRegistry: CodeDefinitionRegistry;
	engineModels: EngineModelsForExtraction;
	markerOps: IcrMarkerOps;
	auditLog: AuditEntry[];
	persistAuditLog: (log: AuditEntry[]) => void;
	app?: App;
	/** Trigger export — pluged em chunk 7 (default no-op aqui pra não acoplar). */
	onExportReport?: () => void;
}

export interface DrilldownWorkflowCallbacks {
	onSetSelection: (sel: CurrentSelection) => void;
	/** Caller força transition pra mode 'cards' quando user clica num card do P3,
	 *  pra abrir o cluster correspondente no drill-down P2. */
	onSetDrilldownMode: (mode: DrilldownMode) => void;
	/** Mesmo padrão do P2: caller faz update consolidado pós-revert pra evitar 2 renders async. */
	onAfterReconciliation: (partial: Partial<CompareCodersViewState>) => void;
}

const COLUMNS: { status: RegionStatus; title: string; emoji: string }[] = [
	{ status: 'open', title: 'Abertos', emoji: '🔥' },
	{ status: 'inDiscussion', title: 'Em discussão', emoji: '💬' },
	{ status: 'resolved', title: 'Resolvidos', emoji: '✓' },
	{ status: 'divergenceAccepted', title: 'Divergência aceita', emoji: '◇' },
];

export function renderDrilldownWorkflow(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: DrilldownWorkflowDeps,
	cbs: DrilldownWorkflowCallbacks,
): void {
	container.empty();
	container.createDiv({
		cls: 'qc-cc-perspective-question',
		text: '#5 como reconcilio? · #6 como fica registrado?',
	});

	const regions = collectContestedRegions(state, deps.engineModels);
	const byStatus = categorizeRegionsByStatus(regions, deps.auditLog);

	const header = container.createDiv({ cls: 'qc-cc-workflow-header' });
	const totals = `${byStatus.open.length} abertos · ${byStatus.inDiscussion.length} em discussão · ${byStatus.resolved.length} resolvidos · ${byStatus.divergenceAccepted.length} divergências`;
	header.createSpan({ cls: 'qc-cc-workflow-totals', text: totals });
	const exportBtn = header.createEl('button', { cls: 'qc-cc-workflow-export', text: '↧ Exportar relatório de reconciliação' });
	exportBtn.disabled = !deps.onExportReport;
	exportBtn.onclick = () => {
		if (deps.onExportReport) deps.onExportReport();
	};

	if (regions.length === 0) {
		container.createDiv({
			cls: 'qc-cc-drilldown-empty',
			text: 'Nenhuma região contestada no escopo (E3a Fase 1: markdown + csv-row).',
		});
	}

	const queue = container.createDiv({ cls: 'qc-cc-workflow-queue' });
	for (const col of COLUMNS) {
		renderColumn(queue, col, byStatus, state, deps, cbs);
	}
}

function renderColumn(
	parent: HTMLElement,
	col: { status: RegionStatus; title: string; emoji: string },
	byStatus: RegionsByStatus,
	state: CompareCodersViewState,
	deps: DrilldownWorkflowDeps,
	cbs: DrilldownWorkflowCallbacks,
): void {
	const regions = byStatus[col.status];
	const column = parent.createDiv({ cls: `qc-cc-workflow-column qc-cc-status-${col.status}` });
	const head = column.createDiv({ cls: 'qc-cc-workflow-column-head' });
	head.createSpan({ cls: 'qc-cc-workflow-column-emoji', text: col.emoji });
	head.createSpan({ cls: 'qc-cc-workflow-column-title', text: col.title });
	head.createSpan({ cls: 'qc-cc-workflow-column-count', text: `(${regions.length})` });

	const list = column.createDiv({ cls: 'qc-cc-workflow-cards' });
	if (regions.length === 0) {
		list.createDiv({ cls: 'qc-cc-workflow-empty', text: '—' });
		return;
	}
	for (const region of regions) {
		renderCard(list, region, col.status, state, deps, cbs);
	}
}

function renderCard(
	parent: HTMLElement,
	region: ContestedRegion,
	status: RegionStatus,
	state: CompareCodersViewState,
	deps: DrilldownWorkflowDeps,
	cbs: DrilldownWorkflowCallbacks,
): void {
	const card = parent.createDiv({ cls: 'qc-cc-workflow-card' });
	const header = card.createDiv({ cls: 'qc-cc-workflow-card-header' });
	header.createSpan({ cls: 'qc-cc-workflow-card-file', text: region.fileId });
	header.createSpan({ cls: 'qc-cc-workflow-card-engine', text: region.engine });

	const meta = card.createDiv({ cls: 'qc-cc-workflow-card-meta' });
	meta.createSpan({ cls: 'qc-cc-workflow-card-bounds', text: region.displayLabel });
	meta.createSpan({ cls: 'qc-cc-workflow-card-coders', text: `${region.coderIds.length} coders` });

	const decision = findLatestActiveDecision(region, deps.auditLog);
	if (decision) {
		renderDecisionSummary(card, decision, deps.codeRegistry);
	}

	const actions = card.createDiv({ cls: 'qc-cc-workflow-card-actions' });
	const openBtn = actions.createEl('button', { cls: 'qc-cc-workflow-card-open', text: 'Abrir' });
	openBtn.onclick = () => {
		cbs.onSetDrilldownMode('cards');
		cbs.onSetSelection({
			kind: 'region',
			value: { fileId: region.fileId, engine: region.engine, bounds: region.bounds, coderIds: region.coderIds },
		});
	};

	if (status === 'resolved' || status === 'divergenceAccepted') {
		const revertBtn = actions.createEl('button', { cls: 'qc-cc-workflow-card-revert', text: 'Reverter' });
		revertBtn.onclick = () => {
			if (!decision) return;
			if (!confirm('Reverter desfaz a decisão de reconciliação. Audit trail preserva o histórico. Continuar?')) return;
			const result = executeReconciliationRevert(decision.id, {
				registry: deps.codeRegistry,
				coderRegistry: deps.coderRegistry,
				log: deps.auditLog,
				markerOps: deps.markerOps,
			});
			if (!result.ok) {
				new Notice(`Reverter falhou: ${result.reason ?? 'unknown'}`);
				return;
			}
			deps.persistAuditLog(deps.auditLog);
			cbs.onAfterReconciliation({ currentSelection: { kind: 'none' } });
		};
	}
}

function renderDecisionSummary(
	card: HTMLElement,
	decision: Extract<AuditEntry, { type: 'reconciliation_decided' }>,
	codeRegistry: CodeDefinitionRegistry,
): void {
	const summary = card.createDiv({ cls: 'qc-cc-workflow-card-decision' });
	const d = decision.decision;
	if (d.kind === 'adopt') {
		const code = codeRegistry.getById(d.codeId);
		const modeLabel = d.mode === 'overwrite-originals' ? ' (overwrite)' : '';
		summary.createSpan({ text: `→ adotou ${code?.name ?? d.codeId}${modeLabel}` });
	} else if (d.kind === 'split') {
		const code = codeRegistry.getById(d.newCodeId);
		summary.createSpan({ text: `→ split em ${code?.name ?? d.newCodeId}` });
	} else if (d.kind === 'accept-divergence') {
		summary.createSpan({ text: '◇ divergência aceita' });
	} else if (d.kind === 'reject') {
		summary.createSpan({ text: '✕ decisão rejeitada' });
	}
	if (decision.memoOfReconciliation) {
		const memo = card.createDiv({ cls: 'qc-cc-workflow-card-memo' });
		memo.setText(decision.memoOfReconciliation);
	}
}

export const __test__ = { COLUMNS };
