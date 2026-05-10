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
 */

import type { App } from 'obsidian';
import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CoderId } from '../coderTypes';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { IcrMarkerOps } from '../markerOps';
import type { AuditEntry, ReconciliationDecision, ReconciliationBounds } from '../../types';
import type { EngineId } from '../reporter';
import type { Marker as MarkdownMarker } from '../../../markdown/models/codeMarkerModel';
import { executeReconciliationDecision } from '../reconciliation';
import { SplitNewCodeModal } from './splitNewCodeModal';

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
	onAfterReconciliation: () => void;
}

const E3A_ENGINES: EngineId[] = ['markdown', 'csvRow'];

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

	const sel = state.currentSelection;
	if (sel.kind !== 'region') {
		renderRegionPicker(container, state, deps, cbs);
		return;
	}

	renderRegionView(container, state, sel.value, deps, cbs);
}

// ─── Region picker (sem região ativa) ──────────────────────────

function renderRegionPicker(
	container: HTMLElement,
	state: CompareCodersViewState,
	deps: DrilldownCardsDeps,
	cbs: DrilldownCardsCallbacks,
): void {
	const regions = collectContestedRegions(state, deps);
	if (regions.length === 0) {
		container.createDiv({
			cls: 'qc-cc-drilldown-empty',
			text: 'Nenhuma região contestada no escopo (E3a Fase 1: markdown + csv-row). Pelo menos 2 coders devem ter marker em bounds próximos.',
		});
		return;
	}
	const list = container.createDiv({ cls: 'qc-cc-region-picker' });
	list.createEl('h4', { text: `Regiões contestadas (${regions.length})` });
	for (const region of regions) {
		const item = list.createDiv({ cls: 'qc-cc-region-item' });
		const header = item.createDiv({ cls: 'qc-cc-region-header' });
		header.createSpan({ cls: 'qc-cc-region-file', text: region.fileId });
		header.createSpan({ cls: 'qc-cc-region-engine', text: region.engine });
		header.createSpan({ cls: 'qc-cc-region-bounds', text: formatBoundsLabel(region.bounds) });
		const meta = item.createDiv({ cls: 'qc-cc-region-meta' });
		meta.createSpan({ text: `${region.coderIds.length} coders: ${region.coderIds.join(', ')}` });
		item.onclick = () => cbs.onSetSelection({ kind: 'region', value: region });
	}
}

interface ContestedRegion {
	fileId: string;
	engine: EngineId;
	bounds: ReconciliationBounds;
	coderIds: CoderId[];
}

function collectContestedRegions(
	state: CompareCodersViewState,
	deps: DrilldownCardsDeps,
): ContestedRegion[] {
	const out: ContestedRegion[] = [];
	const scopeCoders = new Set(state.scope.coderIds);

	// Markdown: agrupa markers por overlap de range (line/ch → offsets aproximados).
	const mdModel = deps.engineModels.markdown;
	if (mdModel) {
		const allMarkers = collectMarkdownMarkersForScope(mdModel, state, scopeCoders);
		for (const region of clusterMarkdownMarkers(allMarkers)) {
			if (region.coderIds.length >= 2) out.push(region);
		}
	}

	// csv-row: agrupa por (fileId, sourceRowId, column).
	const csvModel = deps.engineModels.csv;
	if (csvModel) {
		const rowMap = new Map<string, { fileId: string; rowIndex: number; column: string; coderIds: Set<CoderId> }>();
		for (const m of csvModel.getAllMarkers()) {
			if (m.markerType !== 'csv') continue;
			const codedBy = (m as { codedBy?: CoderId }).codedBy;
			if (!codedBy || !scopeCoders.has(codedBy)) continue;
			// Apenas RowMarker (csvRow). SegmentMarker (csvSegment) não cobre Fase 1 do E3a.
			if ('from' in m && typeof (m as { from?: number }).from === 'number') continue;
			const rm = m as unknown as { fileId: string; sourceRowId: number; column: string };
			const key = `${rm.fileId}::${rm.sourceRowId}::${rm.column}`;
			let entry = rowMap.get(key);
			if (!entry) {
				entry = { fileId: rm.fileId, rowIndex: rm.sourceRowId, column: rm.column, coderIds: new Set() };
				rowMap.set(key, entry);
			}
			entry.coderIds.add(codedBy);
		}
		for (const r of rowMap.values()) {
			if (r.coderIds.size < 2) continue;
			out.push({
				fileId: r.fileId,
				engine: 'csvRow',
				bounds: { kind: 'csvRow', rowIndex: r.rowIndex, column: r.column },
				coderIds: Array.from(r.coderIds),
			});
		}
	}

	return out;
}

function collectMarkdownMarkersForScope(
	mdModel: NonNullable<EngineModelsForExtraction['markdown']>,
	state: CompareCodersViewState,
	scopeCoders: Set<CoderId>,
): Array<{ fileId: string; bounds: { kind: 'text'; from: number; to: number }; coderId: CoderId; markerId: string }> {
	const out: Array<{ fileId: string; bounds: { kind: 'text'; from: number; to: number }; coderId: CoderId; markerId: string }> = [];
	const allMarkers = mdModel.getAllMarkers ? mdModel.getAllMarkers() : [];
	for (const m of allMarkers) {
		const codedBy = m.codedBy;
		if (!codedBy || !scopeCoders.has(codedBy)) continue;
		const offsets = rangeToOffsetsHeuristic(m);
		if (!offsets) continue;
		out.push({ fileId: m.fileId, bounds: { kind: 'text', from: offsets.from, to: offsets.to }, coderId: codedBy, markerId: m.id });
	}
	return out;
}

/** Heurística simples line/ch → offset assumindo line=0 (markers seedados sintéticos). Pra produção
 *  com files multi-line, usar editor.posToOffset; aqui retornamos null se range parece line>0 sem editor. */
function rangeToOffsetsHeuristic(m: MarkdownMarker): { from: number; to: number } | null {
	if (m.range.from.line === 0 && m.range.to.line === 0) {
		return { from: m.range.from.ch, to: m.range.to.ch };
	}
	// Fallback: usa pos.ch como proxy quando line>0 (overlap clustering ainda funciona dentro do mesmo file por ordering aproximado).
	return { from: m.range.from.line * 1_000_000 + m.range.from.ch, to: m.range.to.line * 1_000_000 + m.range.to.ch };
}

function clusterMarkdownMarkers(
	markers: Array<{ fileId: string; bounds: { kind: 'text'; from: number; to: number }; coderId: CoderId; markerId: string }>,
): ContestedRegion[] {
	// Agrupa por fileId, depois cluster por overlap (any intersection).
	const byFile = new Map<string, typeof markers>();
	for (const m of markers) {
		const list = byFile.get(m.fileId) ?? [];
		list.push(m);
		byFile.set(m.fileId, list);
	}
	const regions: ContestedRegion[] = [];
	for (const [fileId, list] of byFile) {
		const sorted = list.slice().sort((a, b) => a.bounds.from - b.bounds.from);
		let cluster: typeof sorted = [];
		let clusterEnd = -Infinity;
		for (const m of sorted) {
			if (m.bounds.from <= clusterEnd && cluster.length > 0) {
				cluster.push(m);
				clusterEnd = Math.max(clusterEnd, m.bounds.to);
			} else {
				if (cluster.length > 0) regions.push(buildRegionFromCluster(fileId, cluster));
				cluster = [m];
				clusterEnd = m.bounds.to;
			}
		}
		if (cluster.length > 0) regions.push(buildRegionFromCluster(fileId, cluster));
	}
	return regions;
}

function buildRegionFromCluster(
	fileId: string,
	cluster: Array<{ bounds: { kind: 'text'; from: number; to: number }; coderId: CoderId }>,
): ContestedRegion {
	let from = Infinity;
	let to = -Infinity;
	const coderIds = new Set<CoderId>();
	for (const m of cluster) {
		from = Math.min(from, m.bounds.from);
		to = Math.max(to, m.bounds.to);
		coderIds.add(m.coderId);
	}
	return {
		fileId,
		engine: 'markdown',
		bounds: { kind: 'text', from, to },
		coderIds: Array.from(coderIds),
	};
}

// ─── Region view (cards + memo + ações) ────────────────────────

function renderRegionView(
	container: HTMLElement,
	state: CompareCodersViewState,
	region: ContestedRegion,
	deps: DrilldownCardsDeps,
	cbs: DrilldownCardsCallbacks,
): void {
	void state; // reservado pra filters futuros
	// Header
	const header = container.createDiv({ cls: 'qc-cc-region-active' });
	header.createDiv({ cls: 'qc-cc-region-active-file', text: region.fileId });
	header.createDiv({
		cls: 'qc-cc-region-active-meta',
		text: `${region.engine} · ${formatBoundsLabel(region.bounds)} · ${region.coderIds.length} coders`,
	});
	const backBtn = header.createEl('button', { cls: 'qc-cc-region-back', text: '← voltar pra lista' });
	backBtn.onclick = () => cbs.onSetSelection({ kind: 'none' });

	// Cards
	const cardsHolder = container.createDiv({ cls: 'qc-cc-cards-grid' });
	const allMarkers = deps.markerOps.findMarkersInRegion({
		fileId: region.fileId, engine: region.engine, bounds: region.bounds,
	});
	const markersByCoder = new Map<CoderId, typeof allMarkers>();
	for (const m of allMarkers) {
		const list = markersByCoder.get(m.codedBy) ?? [];
		list.push(m);
		markersByCoder.set(m.codedBy, list);
	}

	const candidateCodeIds = new Set<string>();
	for (const m of allMarkers) for (const c of m.codes) candidateCodeIds.add(c.codeId);

	for (const coderId of region.coderIds) {
		renderCoderCard(cardsHolder, coderId, markersByCoder.get(coderId) ?? [], deps);
	}

	// Memo
	const memoHolder = container.createDiv({ cls: 'qc-cc-reconciliation-memo' });
	memoHolder.createEl('label', { text: 'Memo de reconciliação (soft-required)' });
	const memoInput = memoHolder.createEl('textarea', { cls: 'qc-cc-memo-input' });
	memoInput.placeholder = 'Por que essa decisão? (memo vazio dificulta reabrir depois)';
	memoInput.rows = 3;

	// Ações
	const actionsHolder = container.createDiv({ cls: 'qc-cc-actions' });
	renderAdoptAction(actionsHolder, region, candidateCodeIds, deps, () => memoInput.value, cbs);
	renderAcceptDivergenceAction(actionsHolder, region, deps, () => memoInput.value, cbs);
	renderSplitAction(actionsHolder, region, deps, () => memoInput.value, cbs);
}

function renderCoderCard(
	parent: HTMLElement,
	coderId: CoderId,
	markers: { markerId: string; codedBy: CoderId; codes: { codeId: string }[] }[],
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
	for (const cid of candidates) {
		const def = deps.codeRegistry.getById(cid);
		const opt = select.createEl('option', { text: def?.name ?? cid });
		opt.value = cid;
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
			// Cria CodeDefinition primeiro (audit 'created' automático via registry).
			const def = deps.codeRegistry.create(name, color);
			// Reusa decision adopt do code novo (executeReconciliationDecision com kind:'split' criaria
			// outro code; aqui criamos o code primeiro pra ficar com nome controlado pelo user).
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
		anchorCodeId: pickAnchorCode(decision, region),
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
	cbs.onAfterReconciliation();
	cbs.onSetSelection({ kind: 'none' });
}

function pickAnchorCode(decision: ReconciliationDecision, region: ContestedRegion): string | undefined {
	void region;
	if (decision.kind === 'adopt') return decision.codeId;
	if (decision.kind === 'split') return decision.newCodeId;
	return undefined;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatBoundsLabel(bounds: ReconciliationBounds): string {
	switch (bounds.kind) {
		case 'text':
			return `chars ${bounds.from}–${bounds.to}`;
		case 'csvRow':
			return bounds.column ? `row ${bounds.rowIndex} · ${bounds.column}` : `row ${bounds.rowIndex}`;
		case 'temporal':
			return `${bounds.fromMs}ms–${bounds.toMs}ms`;
	}
}

export const __test__ = {
	collectContestedRegions,
	clusterMarkdownMarkers,
	formatBoundsLabel,
	E3A_ENGINES,
};
