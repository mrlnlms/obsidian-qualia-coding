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
 */

import type { App } from 'obsidian';
import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { CoderRegistry } from '../coderRegistry';
import type { CoderId } from '../coderTypes';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { IcrMarkerOps } from '../markerOps';
import type { AuditEntry, ReconciliationDecision, ReconciliationBounds, CodeApplication } from '../../types';
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
	/** Disparado após decisão de reconciliação aplicada. Caller faz UM update consolidado
	 *  pra evitar 2 renders async concorrentes (renderOverview é async — concorrência
	 *  causou duplicação de matriz em smoke 2026-05-10). */
	onAfterReconciliation: (partial: Partial<CompareCodersViewState>) => void;
}

interface MarkerRef {
	markerId: string;
	codedBy: CoderId;
	codes: CodeApplication[];
}

interface ContestedRegion {
	fileId: string;
	engine: EngineId;
	bounds: ReconciliationBounds;
	coderIds: CoderId[];
	displayLabel: string;
	markerRefs: MarkerRef[];
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

	const regions = collectContestedRegions(state, deps);

	const sel = state.currentSelection;
	if (sel.kind !== 'region') {
		renderRegionPicker(container, regions, cbs);
		return;
	}

	// Match region atual (por fileId + engine + bounds) com cluster pra recuperar markerRefs.
	const matched = regions.find(r =>
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
	};
	renderRegionView(container, activeRegion, deps, cbs);
}

// ─── Region picker (sem região ativa) ──────────────────────────

function renderRegionPicker(
	container: HTMLElement,
	regions: ContestedRegion[],
	cbs: DrilldownCardsCallbacks,
): void {
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
		header.createSpan({ cls: 'qc-cc-region-bounds', text: region.displayLabel });
		const meta = item.createDiv({ cls: 'qc-cc-region-meta' });
		const coderNames = region.coderIds.join(', ');
		meta.createSpan({ text: `${region.coderIds.length} coders: ${coderNames}` });
		item.onclick = () => cbs.onSetSelection({
			kind: 'region',
			value: { fileId: region.fileId, engine: region.engine, bounds: region.bounds, coderIds: region.coderIds },
		});
	}
}

function collectContestedRegions(
	state: CompareCodersViewState,
	deps: DrilldownCardsDeps,
): ContestedRegion[] {
	const out: ContestedRegion[] = [];
	const scopeCoders = new Set(state.scope.coderIds);

	const mdModel = deps.engineModels.markdown;
	if (mdModel) {
		const allMarkers = collectMarkdownMarkersForScope(mdModel, scopeCoders);
		for (const region of clusterMarkdownMarkers(allMarkers)) {
			if (region.coderIds.length >= 2) out.push(region);
		}
	}

	const csvModel = deps.engineModels.csv;
	if (csvModel) {
		out.push(...collectCsvRowRegions(csvModel, scopeCoders));
	}

	return out;
}

interface MdMarkerInScope {
	fileId: string;
	startLine: number;
	startCh: number;
	endLine: number;
	endCh: number;
	coderId: CoderId;
	markerId: string;
	codes: CodeApplication[];
}

function collectMarkdownMarkersForScope(
	mdModel: NonNullable<EngineModelsForExtraction['markdown']>,
	scopeCoders: Set<CoderId>,
): MdMarkerInScope[] {
	const out: MdMarkerInScope[] = [];
	const allMarkers = mdModel.getAllMarkers ? mdModel.getAllMarkers() : [];
	for (const m of allMarkers) {
		const codedBy = m.codedBy;
		if (!codedBy || !scopeCoders.has(codedBy)) continue;
		out.push({
			fileId: m.fileId,
			startLine: m.range.from.line,
			startCh: m.range.from.ch,
			endLine: m.range.to.line,
			endCh: m.range.to.ch,
			coderId: codedBy,
			markerId: m.id,
			codes: m.codes,
		});
	}
	return out;
}

/** Sort key: line × 1M + ch — line domina overlap detection sem precisar de file content. */
function rangeKey(line: number, ch: number): number {
	return line * 1_000_000 + ch;
}

function clusterMarkdownMarkers(markers: MdMarkerInScope[]): ContestedRegion[] {
	const byFile = new Map<string, MdMarkerInScope[]>();
	for (const m of markers) {
		const list = byFile.get(m.fileId) ?? [];
		list.push(m);
		byFile.set(m.fileId, list);
	}
	const regions: ContestedRegion[] = [];
	for (const [fileId, list] of byFile) {
		const sorted = list.slice().sort((a, b) => rangeKey(a.startLine, a.startCh) - rangeKey(b.startLine, b.startCh));
		let cluster: MdMarkerInScope[] = [];
		let clusterEnd = -Infinity;
		for (const m of sorted) {
			const startK = rangeKey(m.startLine, m.startCh);
			const endK = rangeKey(m.endLine, m.endCh);
			if (startK <= clusterEnd && cluster.length > 0) {
				cluster.push(m);
				clusterEnd = Math.max(clusterEnd, endK);
			} else {
				if (cluster.length > 0) regions.push(buildMarkdownRegionFromCluster(fileId, cluster));
				cluster = [m];
				clusterEnd = endK;
			}
		}
		if (cluster.length > 0) regions.push(buildMarkdownRegionFromCluster(fileId, cluster));
	}
	return regions;
}

function buildMarkdownRegionFromCluster(fileId: string, cluster: MdMarkerInScope[]): ContestedRegion {
	let startLine = Infinity;
	let startCh = Infinity;
	let endLine = -1;
	let endCh = -1;
	const coderIds = new Set<CoderId>();
	const markerRefs: MarkerRef[] = [];
	for (const m of cluster) {
		const sk = rangeKey(m.startLine, m.startCh);
		const ek = rangeKey(m.endLine, m.endCh);
		const curStartK = rangeKey(startLine === Infinity ? 0 : startLine, startCh === Infinity ? 0 : startCh);
		const curEndK = rangeKey(endLine === -1 ? 0 : endLine, endCh === -1 ? 0 : endCh);
		if (startLine === Infinity || sk < curStartK) {
			startLine = m.startLine; startCh = m.startCh;
		}
		if (endLine === -1 || ek > curEndK) {
			endLine = m.endLine; endCh = m.endCh;
		}
		coderIds.add(m.coderId);
		markerRefs.push({ markerId: m.markerId, codedBy: m.coderId, codes: m.codes });
	}
	// Bounds em char offsets é heurístico (line×1M+ch). Pra preservar shape correto pro orquestrador,
	// guardamos line/ch raw no displayLabel e usamos char offsets no bounds só pra ID interno.
	return {
		fileId,
		engine: 'markdown',
		bounds: { kind: 'text', from: rangeKey(startLine, startCh), to: rangeKey(endLine, endCh) },
		coderIds: Array.from(coderIds),
		displayLabel: `linha ${startLine + 1}:${startCh}–${endLine + 1}:${endCh}`,
		markerRefs,
	};
}

function collectCsvRowRegions(
	csvModel: NonNullable<EngineModelsForExtraction['csv']>,
	scopeCoders: Set<CoderId>,
): ContestedRegion[] {
	const rowMap = new Map<string, {
		fileId: string; rowIndex: number; column: string;
		coderIds: Set<CoderId>; markerRefs: MarkerRef[];
	}>();
	for (const m of csvModel.getAllMarkers()) {
		if (m.markerType !== 'csv') continue;
		// Pula segmentMarkers (E3a Fase 1 não cobre csv-segment).
		if ('from' in m && typeof (m as { from?: number }).from === 'number') continue;
		const rm = m as unknown as { fileId: string; sourceRowId: number; column: string; codes: CodeApplication[]; codedBy?: CoderId; id: string };
		if (!rm.codedBy || !scopeCoders.has(rm.codedBy)) continue;
		const key = `${rm.fileId}::${rm.sourceRowId}::${rm.column}`;
		let entry = rowMap.get(key);
		if (!entry) {
			entry = { fileId: rm.fileId, rowIndex: rm.sourceRowId, column: rm.column, coderIds: new Set(), markerRefs: [] };
			rowMap.set(key, entry);
		}
		entry.coderIds.add(rm.codedBy);
		entry.markerRefs.push({ markerId: rm.id, codedBy: rm.codedBy, codes: rm.codes });
	}
	const out: ContestedRegion[] = [];
	for (const r of rowMap.values()) {
		if (r.coderIds.size < 2) continue;
		out.push({
			fileId: r.fileId,
			engine: 'csvRow',
			bounds: { kind: 'csvRow', rowIndex: r.rowIndex, column: r.column },
			coderIds: Array.from(r.coderIds),
			displayLabel: r.column ? `row ${r.rowIndex} · ${r.column}` : `row ${r.rowIndex}`,
			markerRefs: r.markerRefs,
		});
	}
	return out;
}

function sameBounds(a: ReconciliationBounds, b: ReconciliationBounds): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'text' && b.kind === 'text') return a.from === b.from && a.to === b.to;
	if (a.kind === 'csvRow' && b.kind === 'csvRow') return a.rowIndex === b.rowIndex && (a.column ?? '') === (b.column ?? '');
	if (a.kind === 'temporal' && b.kind === 'temporal') return a.fromMs === b.fromMs && a.toMs === b.toMs;
	return false;
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
	// Reset seleção + re-render num único update (evita 2 renders async concorrentes).
	cbs.onAfterReconciliation({ currentSelection: { kind: 'none' } });
}

function pickAnchorCode(decision: ReconciliationDecision): string | undefined {
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
	sameBounds,
};
