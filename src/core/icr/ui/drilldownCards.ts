/**
 * P2 — Drill-down cards: o que cada coder leu na mesma região.
 *
 * Quando uma região está selecionada (`currentSelection.kind === 'region'`),
 * renderiza 1 card por coder em `region.coderIds`. Footer com 4 ações:
 * Adotar X / Adotar X (substituir originais) / Manter divergência / Split em código novo.
 * Memo de reconciliação soft-required acima das ações.
 *
 * Sem região selecionada: mostra picker de regiões contestadas (≥2 coders distintos
 * marcando bounds próximos no escopo).
 *
 * Slice E3a Fase 1 cobre markdown (cluster por overlap line/ch) + csvRow (agrupado
 * por sourceRowId+column). Outros engines não aparecem no picker.
 *
 * Derivação de regiões e categorização por status ficam em regionDerivation.ts (E3b).
 */

import type { App } from 'obsidian';
import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CoderId } from '../coderTypes';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { IcrMarkerOps } from '../markerOps';
import type { AuditEntry, ReconciliationDecision } from '../../types';
import { executeReconciliationDecision, openReconciliation } from '../reconciliation';
import { SplitNewCodeModal } from './splitNewCodeModal';
import {
	collectContestedRegions,
	describeSelectionFilter,
	divergenceTagLabel,
	filterRegionsBySelection,
	findLatestActiveDecision,
	findLatestActiveOpenedEntry,
	formatBoundsLabel,
	regionKey,
	sameBounds,
	type ContestedRegion,
	type MarkerRef,
} from './regionDerivation';

export interface DrilldownCardsDeps {
	coderRegistry: CoderRegistry;
	codeRegistry: CodeDefinitionRegistry;
	engineModels: EngineModelsForExtraction;
	markerOps: IcrMarkerOps;
	auditLog: AuditEntry[];
	persistAuditLog: (log: AuditEntry[]) => void;
	app?: App;
}

export interface DrilldownCardsCallbacks {
	onSetSelection: (sel: CurrentSelection) => void;
	/** Disparado após decisão de reconciliação aplicada. Caller faz UM update consolidado
	 *  pra evitar 2 renders async concorrentes (renderOverview é async — concorrência
	 *  causou duplicação de matriz em smoke 2026-05-10). */
	onAfterReconciliation: (partial: Partial<CompareCodersViewState>) => void;
}

export function renderDrilldownCards(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: DrilldownCardsDeps,
	cbs: DrilldownCardsCallbacks,
): void {
	container.empty();
	container.createDiv({
		cls: 'qc-cc-perspective-question',
		text: '#3 o que cada um leu? · #4 por que diferimos?',
	});

	const allRegions = collectContestedRegions(state, deps.engineModels);
	const resolvedSet = computeResolvedRegionSet(allRegions, deps.auditLog);
	const inDiscussionSet = computeInDiscussionRegionSet(allRegions, deps.auditLog);

	const sel = state.currentSelection;
	if (sel.kind !== 'region') {
		const filtered = filterRegionsBySelection(allRegions, sel);
		renderRegionPicker(container, filtered, allRegions.length, sel, resolvedSet, inDiscussionSet, deps.auditLog, deps.coderRegistry, deps.codeRegistry, cbs);
		return;
	}

	const matched = allRegions.find(r =>
		r.fileId === sel.value.fileId
		&& r.engine === sel.value.engine
		&& sameBounds(r.bounds, sel.value.bounds),
	);
	const activeRegion: ContestedRegion = matched ?? {
		fileId: sel.value.fileId,
		engine: sel.value.engine,
		bounds: sel.value.bounds,
		coderIds: sel.value.coderIds,
		displayLabel: formatBoundsLabel(sel.value.bounds),
		markerRefs: [],
		divergenceKind: 'existence',
	};
	renderRegionView(container, activeRegion, deps, cbs);
}

function computeResolvedRegionSet(regions: ContestedRegion[], log: AuditEntry[]): Set<string> {
	const resolved = new Set<string>();
	for (const region of regions) {
		if (findLatestActiveDecision(region, log)) resolved.add(regionKey(region));
	}
	return resolved;
}

function computeInDiscussionRegionSet(regions: ContestedRegion[], log: AuditEntry[]): Set<string> {
	const inDiscussion = new Set<string>();
	for (const region of regions) {
		// Em discussão = tem opened ativo MAS não tem decisão ativa (a decisão supera o opened).
		if (findLatestActiveDecision(region, log)) continue;
		if (findLatestActiveOpenedEntry(region, log)) inDiscussion.add(regionKey(region));
	}
	return inDiscussion;
}

// ─── Region picker (sem região ativa) ──────────────────────────

function renderRegionPicker(
	container: HTMLElement,
	regions: ContestedRegion[],
	totalCount: number,
	selection: CurrentSelection,
	resolvedSet: Set<string>,
	inDiscussionSet: Set<string>,
	auditLog: AuditEntry[],
	coderRegistry: CoderRegistry,
	codeRegistry: CodeDefinitionRegistry,
	cbs: DrilldownCardsCallbacks,
): void {
	const filterLabel = describeSelectionFilter(selection, coderRegistry, codeRegistry);
	if (filterLabel) {
		const banner = container.createDiv({ cls: 'qc-cc-region-filter-banner' });
		banner.createSpan({ text: `filtrado pela seleção da overview: ${filterLabel} · ` });
		const clear = banner.createSpan({ cls: 'qc-cc-region-filter-clear', text: 'limpar' });
		clear.onclick = () => cbs.onSetSelection({ kind: 'none' });
	}

	if (regions.length === 0) {
		container.createDiv({
			cls: 'qc-cc-drilldown-empty',
			text: filterLabel
				? `Nenhuma região contestada bate com a seleção (${totalCount} total no escopo, 0 após filter).`
				: 'Nenhuma região contestada no escopo (E3a Fase 1: markdown + csv-row). Pelo menos 2 coders devem ter marker em bounds próximos.',
		});
		return;
	}
	// Ordem: aberto (code > boundary > existence) → em discussão → resolvido.
	const order: Record<ContestedRegion['divergenceKind'], number> = { code: 0, boundary: 1, existence: 2 };
	const sorted = regions.slice().sort((a, b) => {
		const aResolved = resolvedSet.has(regionKey(a)) ? 2 : inDiscussionSet.has(regionKey(a)) ? 1 : 0;
		const bResolved = resolvedSet.has(regionKey(b)) ? 2 : inDiscussionSet.has(regionKey(b)) ? 1 : 0;
		if (aResolved !== bResolved) return aResolved - bResolved;
		return order[a.divergenceKind] - order[b.divergenceKind];
	});

	const resolvedCount = sorted.filter(r => resolvedSet.has(regionKey(r))).length;
	const inDiscussionCount = sorted.filter(r => inDiscussionSet.has(regionKey(r))).length;
	const list = container.createDiv({ cls: 'qc-cc-region-picker' });
	const parts = [`Regiões contestadas (${regions.length})`];
	if (inDiscussionCount > 0) parts.push(`${inDiscussionCount} em discussão`);
	if (resolvedCount > 0) parts.push(`${resolvedCount} resolvida${resolvedCount === 1 ? '' : 's'}`);
	list.createEl('h4', { text: parts.join(' · ') });
	for (const region of sorted) {
		const isResolved = resolvedSet.has(regionKey(region));
		const isInDiscussion = !isResolved && inDiscussionSet.has(regionKey(region));
		const stateCls = isResolved ? ' is-resolved' : isInDiscussion ? ' is-in-discussion' : '';
		const item = list.createDiv({
			cls: `qc-cc-region-item qc-cc-divergence-${region.divergenceKind}${stateCls}`,
		});
		const header = item.createDiv({ cls: 'qc-cc-region-header' });
		header.createSpan({ cls: 'qc-cc-region-file', text: region.fileId });
		header.createSpan({ cls: 'qc-cc-region-engine', text: region.engine });
		header.createSpan({ cls: 'qc-cc-region-bounds', text: region.displayLabel });
		if (isResolved) {
			const tag = header.createSpan({ cls: 'qc-cc-divergence-tag is-resolved' });
			tag.textContent = '✓ resolvida';
		} else if (isInDiscussion) {
			const tag = header.createSpan({ cls: 'qc-cc-divergence-tag is-in-discussion' });
			tag.textContent = '💬 em discussão';
		} else {
			const tag = header.createSpan({ cls: `qc-cc-divergence-tag is-${region.divergenceKind}` });
			tag.textContent = divergenceTagLabel(region.divergenceKind);
		}
		const meta = item.createDiv({ cls: 'qc-cc-region-meta' });
		const coderNames = region.coderIds.join(', ');
		meta.createSpan({ text: `${region.coderIds.length} coders: ${coderNames}` });
		if (isResolved) {
			const latest = findLatestActiveDecision(region, auditLog);
			if (latest && latest.type === 'reconciliation_decided') {
				const kind = latest.decision.kind === 'adopt' ? 'adopt'
					: latest.decision.kind === 'split' ? 'split'
					: latest.decision.kind === 'accept-divergence' ? 'manter divergência'
					: 'rejeitada';
				const summary = item.createDiv({ cls: 'qc-cc-region-resolved-summary' });
				summary.createSpan({ text: `decisão: ${kind}` });
			}
		}
		item.onclick = () => cbs.onSetSelection({
			kind: 'region',
			value: { fileId: region.fileId, engine: region.engine, bounds: region.bounds, coderIds: region.coderIds },
		});
	}
}

// ─── Region view (cards + memo + ações) ────────────────────────

function renderRegionView(
	container: HTMLElement,
	region: ContestedRegion,
	deps: DrilldownCardsDeps,
	cbs: DrilldownCardsCallbacks,
): void {
	const header = container.createDiv({ cls: 'qc-cc-region-active' });
	header.createDiv({ cls: 'qc-cc-region-active-file', text: region.fileId });
	header.createDiv({
		cls: 'qc-cc-region-active-meta',
		text: `${region.engine} · ${region.displayLabel} · ${region.coderIds.length} coders`,
	});
	const backBtn = header.createEl('button', { cls: 'qc-cc-region-back', text: '← voltar pra lista' });
	backBtn.onclick = () => cbs.onSetSelection({ kind: 'none' });

	const cardsHolder = container.createDiv({ cls: 'qc-cc-cards-grid' });
	const markersByCoder = new Map<CoderId, MarkerRef[]>();
	for (const m of region.markerRefs) {
		const list = markersByCoder.get(m.codedBy) ?? [];
		list.push(m);
		markersByCoder.set(m.codedBy, list);
	}

	const candidateCodeIds = new Set<string>();
	for (const m of region.markerRefs) for (const c of m.codes) candidateCodeIds.add(c.codeId);

	for (const coderId of region.coderIds) {
		renderCoderCard(cardsHolder, coderId, markersByCoder.get(coderId) ?? [], deps);
	}

	const memoHolder = container.createDiv({ cls: 'qc-cc-reconciliation-memo' });
	memoHolder.createEl('label', { text: 'Memo de reconciliação (soft-required)' });
	const memoInput = memoHolder.createEl('textarea', { cls: 'qc-cc-memo-input' });
	memoInput.placeholder = 'Por que essa decisão? (memo vazio dificulta reabrir depois)';
	memoInput.rows = 3;

	const actionsHolder = container.createDiv({ cls: 'qc-cc-actions' });
	renderAdoptAction(actionsHolder, region, candidateCodeIds, deps, () => memoInput.value, cbs);
	renderAcceptDivergenceAction(actionsHolder, region, deps, () => memoInput.value, cbs);
	renderSplitAction(actionsHolder, region, deps, () => memoInput.value, cbs);
	renderMarkForReviewAction(actionsHolder, region, candidateCodeIds, deps, cbs);
}

function renderMarkForReviewAction(
	parent: HTMLElement,
	region: ContestedRegion,
	candidates: Set<string>,
	deps: DrilldownCardsDeps,
	cbs: DrilldownCardsCallbacks,
): void {
	const wrap = parent.createDiv({ cls: 'qc-cc-action-row qc-cc-action-mark-review' });
	const btn = wrap.createEl('button', { cls: 'qc-cc-action-btn', text: 'Marcar pra revisão' });
	btn.title = 'Registra a região como "em discussão" no audit sem decidir. Aparece na coluna correspondente do P3 workflow.';
	btn.onclick = () => {
		openReconciliation({
			region: { fileId: region.fileId, engine: region.engine, bounds: region.bounds },
			coderIds: region.coderIds,
			candidateCodeIds: Array.from(candidates),
			log: deps.auditLog,
		});
		deps.persistAuditLog(deps.auditLog);
		cbs.onAfterReconciliation({ currentSelection: { kind: 'none' } });
	};
}

function renderCoderCard(
	parent: HTMLElement,
	coderId: CoderId,
	markers: MarkerRef[],
	deps: DrilldownCardsDeps,
): void {
	const card = parent.createDiv({ cls: 'qc-cc-card' });
	const coder = deps.coderRegistry.getById(coderId);
	const head = card.createDiv({ cls: 'qc-cc-card-head' });
	head.createSpan({ cls: 'qc-cc-card-name', text: coder?.name ?? coderId });
	head.createSpan({ cls: `qc-cc-card-kind qc-cc-kind-${coder?.type ?? 'human'}`, text: coder?.type ?? '?' });

	const body = card.createDiv({ cls: 'qc-cc-card-body' });
	if (markers.length === 0) {
		body.createSpan({ cls: 'qc-cc-card-empty', text: '∅ não codificou' });
		return;
	}
	const codeIds = new Set<string>();
	for (const m of markers) for (const c of m.codes) codeIds.add(c.codeId);
	if (codeIds.size === 0) {
		body.createSpan({ cls: 'qc-cc-card-empty', text: '(marker sem codes)' });
		return;
	}
	for (const cid of codeIds) {
		const def = deps.codeRegistry.getById(cid);
		const chip = body.createSpan({ cls: 'qc-cc-card-code-chip', text: def?.name ?? cid });
		if (def?.color) chip.style.backgroundColor = def.color;
	}
}

// ─── Ações ──────────────────────────────────────────────────────

function renderAdoptAction(
	parent: HTMLElement,
	region: ContestedRegion,
	candidates: Set<string>,
	deps: DrilldownCardsDeps,
	getMemo: () => string,
	cbs: DrilldownCardsCallbacks,
): void {
	const wrap = parent.createDiv({ cls: 'qc-cc-action-row qc-cc-action-adopt' });
	const select = wrap.createEl('select', { cls: 'qc-cc-action-select' });
	if (candidates.size === 0) {
		const opt = select.createEl('option', { text: '(nenhum code candidato — markers vazios)' });
		opt.value = '';
		select.disabled = true;
	} else {
		for (const cid of candidates) {
			const def = deps.codeRegistry.getById(cid);
			const opt = select.createEl('option', { text: def?.name ?? cid });
			opt.value = cid;
		}
	}
	const overwriteLabel = wrap.createEl('label', { cls: 'qc-cc-action-overwrite' });
	const overwriteCheck = overwriteLabel.createEl('input', { type: 'checkbox' });
	overwriteLabel.appendChild(document.createTextNode(' substituir originais'));
	const btn = wrap.createEl('button', { cls: 'qc-cc-action-btn', text: 'Adotar' });
	btn.onclick = () => {
		const codeId = select.value;
		if (!codeId) return;
		const overwrite = overwriteCheck.checked;
		if (overwrite) {
			if (!confirm('Markers originais serão modificados. Reverter restaura via audit. Continuar?')) return;
		}
		const decision: ReconciliationDecision = {
			kind: 'adopt',
			codeId,
			mode: overwrite ? 'overwrite-originals' : 'consensus-marker',
		};
		runDecision(region, decision, getMemo(), deps, cbs);
	};
}

function renderAcceptDivergenceAction(
	parent: HTMLElement,
	region: ContestedRegion,
	deps: DrilldownCardsDeps,
	getMemo: () => string,
	cbs: DrilldownCardsCallbacks,
): void {
	const wrap = parent.createDiv({ cls: 'qc-cc-action-row qc-cc-action-accept' });
	const btn = wrap.createEl('button', { cls: 'qc-cc-action-btn', text: 'Manter divergência' });
	btn.onclick = () => {
		runDecision(region, { kind: 'accept-divergence' }, getMemo(), deps, cbs);
	};
}

function renderSplitAction(
	parent: HTMLElement,
	region: ContestedRegion,
	deps: DrilldownCardsDeps,
	getMemo: () => string,
	cbs: DrilldownCardsCallbacks,
): void {
	const wrap = parent.createDiv({ cls: 'qc-cc-action-row qc-cc-action-split' });
	const btn = wrap.createEl('button', { cls: 'qc-cc-action-btn', text: 'Split em código novo' });
	btn.onclick = () => {
		if (!deps.app) return;
		new SplitNewCodeModal(deps.app, deps.codeRegistry, ({ name, color }) => {
			const def = deps.codeRegistry.create(name, color);
			const decision: ReconciliationDecision = {
				kind: 'adopt',
				codeId: def.id,
				mode: 'consensus-marker',
			};
			runDecision(region, decision, getMemo(), deps, cbs);
		}).open();
	};
}

function runDecision(
	region: ContestedRegion,
	decision: ReconciliationDecision,
	memo: string,
	deps: DrilldownCardsDeps,
	cbs: DrilldownCardsCallbacks,
): void {
	const result = executeReconciliationDecision({
		region: { fileId: region.fileId, engine: region.engine, bounds: region.bounds },
		coderIds: region.coderIds,
		decision,
		memoOfReconciliation: memo,
		anchorCodeId: pickAnchorCode(decision),
		registry: deps.codeRegistry,
		coderRegistry: deps.coderRegistry,
		log: deps.auditLog,
		markerOps: deps.markerOps,
	});
	if (!result.ok) {
		alert(`Reconciliação falhou: ${result.reason ?? 'unknown'}`);
		return;
	}
	deps.persistAuditLog(deps.auditLog);
	cbs.onAfterReconciliation({ currentSelection: { kind: 'none' } });
}

function pickAnchorCode(decision: ReconciliationDecision): string | undefined {
	if (decision.kind === 'adopt') return decision.codeId;
	if (decision.kind === 'split') return decision.newCodeId;
	return undefined;
}

export const __test__ = {
	computeResolvedRegionSet,
};
