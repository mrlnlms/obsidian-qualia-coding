/**
 * Derivação de regiões contestadas e categorização por status workflow (E3b).
 *
 * Extraído de drilldownCards.ts (E3a) pra ser reusado pelo P3 workflow queue.
 *
 * Status workflow:
 * - open: região contestada (≥2 coders) sem audit relevante OU com decisão revertida e sem opened pendente
 * - inDiscussion: tem reconciliation_opened sem decisão ativa posterior
 * - resolved: tem reconciliation_decided ativo (não-revertido) com kind ∈ {adopt, split}
 * - divergenceAccepted: tem reconciliation_decided ativo com kind === 'accept-divergence'
 */

import type {
	AuditEntry,
	CodeApplication,
	ReconciliationBounds,
} from '../../types';
import type { CoderId } from '../coderTypes';
import type { EngineId } from '../reporter';
import type { CompareCodersViewState, CurrentSelection } from './compareCodersTypes';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { PercentShapeCoords } from '../../shapeTypes';
import type { Bitmap } from '../bboxRaster';
import { rasterize } from '../bboxRaster';
import { iou } from '../bboxIoU';
import { aabbOf, aabbOverlaps } from '../bboxNormalize';

// ─── Tipos ─────────────────────────────────────────────────────

export type DivergenceKind = 'code' | 'boundary' | 'existence';

export type RegionStatus = 'open' | 'inDiscussion' | 'resolved' | 'divergenceAccepted';

export interface MarkerRef {
	markerId: string;
	codedBy: CoderId;
	codes: CodeApplication[];
}

export interface ContestedRegion {
	fileId: string;
	engine: EngineId;
	bounds: ReconciliationBounds;
	coderIds: CoderId[];
	displayLabel: string;
	markerRefs: MarkerRef[];
	divergenceKind: DivergenceKind;
}

export interface RegionsByStatus {
	open: ContestedRegion[];
	inDiscussion: ContestedRegion[];
	resolved: ContestedRegion[];
	divergenceAccepted: ContestedRegion[];
}

// ─── Public API ────────────────────────────────────────────────

// ─── Cache module-level (perf fix 2026-05-11) ──────────────
// `collectContestedRegions` é chamado em renderDrilldown (cards + workflow) e em export.
// 5 collectors itera markers per engine + clustering. Mesmo pattern do scopeExtraction.
// Bumpado via bumpRegionsCacheGeneration quando markers mudam.

const REGIONS_CACHE_MAX = 50;
let regionsGen = 0;
const regionsCache = new Map<string, { gen: number; result: ContestedRegion[] }>();

export function bumpRegionsCacheGeneration(): void {
	regionsGen++;
	regionsCache.clear();
}

function regionsCacheKey(state: CompareCodersViewState): string {
	const norm = (a?: readonly string[]) => a ? [...a].sort().join(',') : '';
	const s = state.scope;
	return `${norm(s.coderIds)}|${norm(s.codeIds)}|${norm(s.fileIds)}|${norm(s.engineIds as string[] | undefined)}`;
}

function pruneRegionsCache(): void {
	while (regionsCache.size > REGIONS_CACHE_MAX) {
		const k = regionsCache.keys().next().value;
		if (k === undefined) break;
		regionsCache.delete(k);
	}
}

export function collectContestedRegions(
	state: CompareCodersViewState,
	engineModels: EngineModelsForExtraction,
): ContestedRegion[] {
	const key = regionsCacheKey(state);
	const hit = regionsCache.get(key);
	if (hit && hit.gen === regionsGen) {
		regionsCache.delete(key);
		regionsCache.set(key, hit);
		return hit.result;
	}

	const out: ContestedRegion[] = [];
	const scopeCoders = new Set(state.scope.coderIds);

	if (engineModels.markdown) {
		const mdMarkers = collectMarkdownMarkersForScope(engineModels.markdown, scopeCoders);
		for (const region of clusterMarkdownMarkers(mdMarkers)) {
			if (region.coderIds.length >= 2) out.push(region);
		}
	}

	if (engineModels.csv) {
		out.push(...collectCsvRowRegions(engineModels.csv, scopeCoders));
		out.push(...collectCsvSegmentRegions(engineModels.csv, scopeCoders));
	}

	if (engineModels.pdf) {
		out.push(...collectPdfTextRegions(engineModels.pdf, scopeCoders));
	}

	if (engineModels.audio) {
		out.push(...collectTemporalRegions(engineModels.audio, scopeCoders, 'audio'));
	}

	if (engineModels.video) {
		out.push(...collectTemporalRegions(engineModels.video, scopeCoders, 'video'));
	}

	out.push(...collectBboxRegions(engineModels.pdf, engineModels.image, scopeCoders));

	regionsCache.set(key, { gen: regionsGen, result: out });
	pruneRegionsCache();
	return out;
}

export function regionKey(
	region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
): string {
	const b = region.bounds;
	const boundsKey =
		b.kind === 'text' ? `t:${b.from}-${b.to}` :
		b.kind === 'csvRow' ? `r:${b.rowIndex}:${b.column ?? ''}` :
		b.kind === 'csvSegment' ? `cs:${b.rowIndex}:${b.column}:${b.from}-${b.to}` :
		b.kind === 'pdfText' ? `pt:${b.page}:${b.from}-${b.to}` :
		b.kind === 'bbox' ? `bb:${b.page ?? '_'}:${b.x.toFixed(6)},${b.y.toFixed(6)},${b.w.toFixed(6)},${b.h.toFixed(6)}` :
		`m:${b.from}-${b.to}`;
	return `${region.fileId}::${region.engine}::${boundsKey}`;
}

export function sameBounds(a: ReconciliationBounds, b: ReconciliationBounds): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'text' && b.kind === 'text') return a.from === b.from && a.to === b.to;
	if (a.kind === 'csvRow' && b.kind === 'csvRow') return a.rowIndex === b.rowIndex && (a.column ?? '') === (b.column ?? '');
	if (a.kind === 'csvSegment' && b.kind === 'csvSegment') return a.rowIndex === b.rowIndex && a.column === b.column && a.from === b.from && a.to === b.to;
	if (a.kind === 'pdfText' && b.kind === 'pdfText') return a.page === b.page && a.from === b.from && a.to === b.to;
	if (a.kind === 'temporal' && b.kind === 'temporal') return a.from === b.from && a.to === b.to;
	if (a.kind === 'bbox' && b.kind === 'bbox') return (a.page ?? -1) === (b.page ?? -1) && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
	return false;
}

function sameRegion(
	a: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
	b: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
): boolean {
	return a.fileId === b.fileId && a.engine === b.engine && sameBounds(a.bounds, b.bounds);
}

/** Última decisão ativa (decided sem revert posterior). null se nunca decidiu OU revertida. */
export function findLatestActiveDecision(
	region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
	log: AuditEntry[],
): Extract<AuditEntry, { type: 'reconciliation_decided' }> | null {
	const decisions: Extract<AuditEntry, { type: 'reconciliation_decided' }>[] = [];
	for (const e of log) {
		if (e.entity !== 'reconciliation') continue;
		if (e.type !== 'reconciliation_decided') continue;
		if (!sameRegion(e.region, region)) continue;
		decisions.push(e);
	}
	for (let i = decisions.length - 1; i >= 0; i--) {
		const decided = decisions[i]!;
		const reverted = log.some(e =>
			e.entity === 'reconciliation'
			&& e.type === 'reconciliation_reverted'
			&& e.originalEntryId === decided.id,
		);
		if (!reverted) return decided;
	}
	return null;
}

/** Latest reconciliation_opened ainda relevante (sem decided ativo posterior na mesma região). */
export function findLatestActiveOpenedEntry(
	region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
	log: AuditEntry[],
): Extract<AuditEntry, { type: 'reconciliation_opened' }> | null {
	let lastOpened: Extract<AuditEntry, { type: 'reconciliation_opened' }> | null = null;
	for (const e of log) {
		if (e.entity !== 'reconciliation') continue;
		if (e.type !== 'reconciliation_opened') continue;
		if (!sameRegion(e.region, region)) continue;
		lastOpened = e;
	}
	return lastOpened;
}

export function getRegionStatus(
	region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
	log: AuditEntry[],
): RegionStatus {
	const latestDecided = findLatestActiveDecision(region, log);
	if (latestDecided) {
		if (latestDecided.decision.kind === 'accept-divergence') return 'divergenceAccepted';
		if (latestDecided.decision.kind === 'adopt' || latestDecided.decision.kind === 'split') return 'resolved';
	}
	if (findLatestActiveOpenedEntry(region, log)) return 'inDiscussion';
	return 'open';
}

export function categorizeRegionsByStatus(
	regions: ContestedRegion[],
	log: AuditEntry[],
): RegionsByStatus {
	const out: RegionsByStatus = { open: [], inDiscussion: [], resolved: [], divergenceAccepted: [] };
	for (const region of regions) {
		const status = getRegionStatus(region, log);
		out[status].push(region);
	}
	return out;
}

/**
 * Filtra regiões pela seleção corrente da overview (matriz/tabela/heatmap).
 * Reduz cognitive load nos drilldowns Cards/Workflow: clicar par/código na overview
 * pré-filtra a lista. Puro — não toca scope/cache do extract (Compare Coders §46).
 *
 * - `none` / `region` → passthrough.
 * - `pair` → regiões cujos 2 coderIds do par estão ambos em `region.coderIds`.
 * - `code` → regiões com pelo menos um markerRef contendo o codeId.
 * - `codeEngine` → mesma regra de `code` + match de engine.
 */
export function filterRegionsBySelection(
	regions: ContestedRegion[],
	selection: CurrentSelection,
): ContestedRegion[] {
	if (selection.kind === 'none' || selection.kind === 'region') return regions;
	if (selection.kind === 'pair') {
		const [a, b] = selection.value;
		return regions.filter(r => r.coderIds.includes(a) && r.coderIds.includes(b));
	}
	if (selection.kind === 'code') {
		const codeId = selection.value;
		return regions.filter(r => r.markerRefs.some(mr => mr.codes.some(c => c.codeId === codeId)));
	}
	if (selection.kind === 'codeEngine') {
		const { codeId, engineId } = selection.value;
		return regions.filter(r => r.engine === engineId && r.markerRefs.some(mr => mr.codes.some(c => c.codeId === codeId)));
	}
	return regions;
}

export function formatBoundsLabel(bounds: ReconciliationBounds): string {
	switch (bounds.kind) {
		case 'text':
			return `chars ${bounds.from}–${bounds.to}`;
		case 'csvRow':
			return bounds.column ? `row ${bounds.rowIndex} · ${bounds.column}` : `row ${bounds.rowIndex}`;
		case 'csvSegment':
			return `row ${bounds.rowIndex} · ${bounds.column} · chars ${bounds.from}–${bounds.to}`;
		case 'pdfText':
			return `page ${bounds.page} · chars ${bounds.from}–${bounds.to}`;
		case 'temporal':
			return `${bounds.from.toFixed(1)}s–${bounds.to.toFixed(1)}s`;
		case 'bbox': {
			const pct = (v: number) => (v * 100).toFixed(1);
			const prefix = bounds.page !== undefined ? `page ${bounds.page} · ` : '';
			return `${prefix}bbox ${pct(bounds.x)}%,${pct(bounds.y)}% (${pct(bounds.w)}×${pct(bounds.h)}%)`;
		}
	}
}

export function divergenceTagLabel(kind: DivergenceKind): string {
	switch (kind) {
		case 'code': return 'codes diferentes';
		case 'boundary': return 'mesma marcação, bounds diferentes';
		case 'existence': return 'só 1 coder marcou';
	}
}

/**
 * Descreve a seleção atual da overview pra UI (banner de filter nos drilldowns).
 * Retorna null quando selection não filtra regiões (`none` / `region`).
 */
export function describeSelectionFilter(
	selection: CurrentSelection,
	coderRegistry: { getById(id: string): { name: string } | null | undefined },
	codeRegistry: { getById(id: string): { name: string } | null | undefined },
): string | null {
	if (selection.kind === 'pair') {
		const [a, b] = selection.value;
		const nameA = coderRegistry.getById(a)?.name ?? a;
		const nameB = coderRegistry.getById(b)?.name ?? b;
		return `par ${nameA} ↔ ${nameB}`;
	}
	if (selection.kind === 'code') {
		const name = codeRegistry.getById(selection.value)?.name ?? selection.value;
		return `código ${name}`;
	}
	if (selection.kind === 'codeEngine') {
		const name = codeRegistry.getById(selection.value.codeId)?.name ?? selection.value.codeId;
		return `código ${name} · engine ${selection.value.engineId}`;
	}
	return null;
}

// ─── Internal: cluster por engine ──────────────────────────────

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
	return {
		fileId,
		engine: 'markdown',
		bounds: { kind: 'text', from: rangeKey(startLine, startCh), to: rangeKey(endLine, endCh) },
		coderIds: Array.from(coderIds),
		displayLabel: `linha ${startLine + 1}:${startCh}–${endLine + 1}:${endCh}`,
		markerRefs,
		divergenceKind: classifyDivergence(markerRefs, Array.from(coderIds)),
	};
}

export function classifyDivergence(markerRefs: MarkerRef[], coderIds: CoderId[]): DivergenceKind {
	const coderCount = coderIds.length;
	const codeSet = new Set<string>();
	for (const m of markerRefs) for (const c of m.codes) codeSet.add(c.codeId);
	if (coderCount < 2) return 'existence';
	if (codeSet.size >= 2) return 'code';
	return 'boundary';
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
			divergenceKind: classifyDivergence(r.markerRefs, Array.from(r.coderIds)),
		});
	}
	return out;
}

// ─── Slice E5a — collectors texto-likes + temporal ────────────

interface PdfTextMarkerInScope {
	fileId: string;
	page: number;
	beginIndex: number;
	endIndex: number;
	coderId: CoderId;
	markerId: string;
	codes: CodeApplication[];
}

function collectPdfTextRegions(
	pdfModel: NonNullable<EngineModelsForExtraction['pdf']>,
	scopeCoders: Set<CoderId>,
): ContestedRegion[] {
	const inScope: PdfTextMarkerInScope[] = [];
	for (const m of pdfModel.getAllMarkers()) {
		if (!m.codedBy || !scopeCoders.has(m.codedBy)) continue;
		inScope.push({
			fileId: m.fileId,
			page: m.page,
			beginIndex: m.beginIndex,
			endIndex: m.endIndex,
			coderId: m.codedBy,
			markerId: m.id,
			codes: m.codes,
		});
	}
	// Agrupa por (fileId, page) — markers de páginas diferentes nunca clusterizam.
	const byKey = new Map<string, PdfTextMarkerInScope[]>();
	for (const m of inScope) {
		const k = `${m.fileId}::${m.page}`;
		const list = byKey.get(k) ?? [];
		list.push(m);
		byKey.set(k, list);
	}
	const out: ContestedRegion[] = [];
	for (const [, list] of byKey) {
		const sorted = list.slice().sort((a, b) => a.beginIndex - b.beginIndex);
		let cluster: PdfTextMarkerInScope[] = [];
		let clusterEnd = -Infinity;
		for (const m of sorted) {
			if (m.beginIndex <= clusterEnd && cluster.length > 0) {
				cluster.push(m);
				clusterEnd = Math.max(clusterEnd, m.endIndex);
			} else {
				if (cluster.length > 0) {
					const region = buildPdfTextRegionFromCluster(cluster);
					if (region.coderIds.length >= 2) out.push(region);
				}
				cluster = [m];
				clusterEnd = m.endIndex;
			}
		}
		if (cluster.length > 0) {
			const region = buildPdfTextRegionFromCluster(cluster);
			if (region.coderIds.length >= 2) out.push(region);
		}
	}
	return out;
}

function buildPdfTextRegionFromCluster(cluster: PdfTextMarkerInScope[]): ContestedRegion {
	const first = cluster[0]!;
	let from = first.beginIndex;
	let to = first.endIndex;
	const coderIds = new Set<CoderId>();
	const markerRefs: MarkerRef[] = [];
	for (const m of cluster) {
		if (m.beginIndex < from) from = m.beginIndex;
		if (m.endIndex > to) to = m.endIndex;
		coderIds.add(m.coderId);
		markerRefs.push({ markerId: m.markerId, codedBy: m.coderId, codes: m.codes });
	}
	return {
		fileId: first.fileId,
		engine: 'pdf',
		bounds: { kind: 'pdfText', page: first.page, from, to },
		coderIds: Array.from(coderIds),
		displayLabel: `page ${first.page} · chars ${from}–${to}`,
		markerRefs,
		divergenceKind: classifyDivergence(markerRefs, Array.from(coderIds)),
	};
}

interface CsvSegmentMarkerInScope {
	fileId: string;
	rowIndex: number;
	column: string;
	from: number;
	to: number;
	coderId: CoderId;
	markerId: string;
	codes: CodeApplication[];
}

function collectCsvSegmentRegions(
	csvModel: NonNullable<EngineModelsForExtraction['csv']>,
	scopeCoders: Set<CoderId>,
): ContestedRegion[] {
	const inScope: CsvSegmentMarkerInScope[] = [];
	for (const m of csvModel.getAllMarkers()) {
		if (m.markerType !== 'csv') continue;
		// SegmentMarker tem from/to (numbers); RowMarker não tem.
		if (!('from' in m) || typeof (m as { from?: unknown }).from !== 'number') continue;
		const sm = m as unknown as { fileId: string; sourceRowId: number; column: string; from: number; to: number; codes: CodeApplication[]; codedBy?: CoderId; id: string };
		if (!sm.codedBy || !scopeCoders.has(sm.codedBy)) continue;
		inScope.push({
			fileId: sm.fileId,
			rowIndex: sm.sourceRowId,
			column: sm.column,
			from: sm.from,
			to: sm.to,
			coderId: sm.codedBy,
			markerId: sm.id,
			codes: sm.codes,
		});
	}
	// Agrupa por (fileId, rowIndex, column) — segments só clusterizam dentro da mesma célula.
	const byKey = new Map<string, CsvSegmentMarkerInScope[]>();
	for (const m of inScope) {
		const k = `${m.fileId}::${m.rowIndex}::${m.column}`;
		const list = byKey.get(k) ?? [];
		list.push(m);
		byKey.set(k, list);
	}
	const out: ContestedRegion[] = [];
	for (const [, list] of byKey) {
		const sorted = list.slice().sort((a, b) => a.from - b.from);
		let cluster: CsvSegmentMarkerInScope[] = [];
		let clusterEnd = -Infinity;
		for (const m of sorted) {
			if (m.from <= clusterEnd && cluster.length > 0) {
				cluster.push(m);
				clusterEnd = Math.max(clusterEnd, m.to);
			} else {
				if (cluster.length > 0) {
					const region = buildCsvSegmentRegionFromCluster(cluster);
					if (region.coderIds.length >= 2) out.push(region);
				}
				cluster = [m];
				clusterEnd = m.to;
			}
		}
		if (cluster.length > 0) {
			const region = buildCsvSegmentRegionFromCluster(cluster);
			if (region.coderIds.length >= 2) out.push(region);
		}
	}
	return out;
}

function buildCsvSegmentRegionFromCluster(cluster: CsvSegmentMarkerInScope[]): ContestedRegion {
	const first = cluster[0]!;
	let from = first.from;
	let to = first.to;
	const coderIds = new Set<CoderId>();
	const markerRefs: MarkerRef[] = [];
	for (const m of cluster) {
		if (m.from < from) from = m.from;
		if (m.to > to) to = m.to;
		coderIds.add(m.coderId);
		markerRefs.push({ markerId: m.markerId, codedBy: m.coderId, codes: m.codes });
	}
	return {
		fileId: first.fileId,
		engine: 'csvSegment',
		bounds: { kind: 'csvSegment', rowIndex: first.rowIndex, column: first.column, from, to },
		coderIds: Array.from(coderIds),
		displayLabel: `row ${first.rowIndex} · ${first.column} · chars ${from}–${to}`,
		markerRefs,
		divergenceKind: classifyDivergence(markerRefs, Array.from(coderIds)),
	};
}

interface TemporalMarkerInScope {
	fileId: string;
	from: number;  // segundos (alinhado com MediaMarker.from)
	to: number;    // segundos
	coderId: CoderId;
	markerId: string;
	codes: CodeApplication[];
}

function collectTemporalRegions(
	mediaModel: NonNullable<EngineModelsForExtraction['audio']>,
	scopeCoders: Set<CoderId>,
	engine: 'audio' | 'video',
): ContestedRegion[] {
	const inScope: TemporalMarkerInScope[] = [];
	for (const m of mediaModel.getAllMarkers()) {
		if (!m.codedBy || !scopeCoders.has(m.codedBy)) continue;
		inScope.push({
			fileId: m.fileId,
			from: m.from,
			to: m.to,
			coderId: m.codedBy,
			markerId: m.id,
			codes: m.codes,
		});
	}
	// Agrupa por fileId — temporal markers de files diferentes nunca clusterizam.
	const byFile = new Map<string, TemporalMarkerInScope[]>();
	for (const m of inScope) {
		const list = byFile.get(m.fileId) ?? [];
		list.push(m);
		byFile.set(m.fileId, list);
	}
	const out: ContestedRegion[] = [];
	for (const [, list] of byFile) {
		const sorted = list.slice().sort((a, b) => a.from - b.from);
		let cluster: TemporalMarkerInScope[] = [];
		let clusterEnd = -Infinity;
		for (const m of sorted) {
			if (m.from <= clusterEnd && cluster.length > 0) {
				cluster.push(m);
				clusterEnd = Math.max(clusterEnd, m.to);
			} else {
				if (cluster.length > 0) {
					const region = buildTemporalRegionFromCluster(cluster, engine);
					if (region.coderIds.length >= 2) out.push(region);
				}
				cluster = [m];
				clusterEnd = m.to;
			}
		}
		if (cluster.length > 0) {
			const region = buildTemporalRegionFromCluster(cluster, engine);
			if (region.coderIds.length >= 2) out.push(region);
		}
	}
	return out;
}

function buildTemporalRegionFromCluster(cluster: TemporalMarkerInScope[], engine: 'audio' | 'video'): ContestedRegion {
	const first = cluster[0]!;
	let from = first.from;
	let to = first.to;
	const coderIds = new Set<CoderId>();
	const markerRefs: MarkerRef[] = [];
	for (const m of cluster) {
		if (m.from < from) from = m.from;
		if (m.to > to) to = m.to;
		coderIds.add(m.coderId);
		markerRefs.push({ markerId: m.markerId, codedBy: m.coderId, codes: m.codes });
	}
	return {
		fileId: first.fileId,
		engine,
		bounds: { kind: 'temporal', from, to },
		coderIds: Array.from(coderIds),
		displayLabel: `${formatTimecode(from)}–${formatTimecode(to)}`,
		markerRefs,
		divergenceKind: classifyDivergence(markerRefs, Array.from(coderIds)),
	};
}

/** Formata segundos float como mm:ss (alinhado com audio/video player UI). */
function formatTimecode(sec: number): string {
	const totalSec = Math.floor(sec);
	const mm = Math.floor(totalSec / 60);
	const ss = totalSec % 60;
	return `${mm}:${ss.toString().padStart(2, '0')}`;
}

// ─── Slice E5b — collector bbox spatial (pdfShape + image) ────

/** θ pra clustering "duas bboxes marcam o mesmo evento". Igual ao default do motor κ
 *  (COCO 0.5) — manter um knob só evita semântica divergente entre matching e cluster. */
const BBOX_CLUSTER_IOU = 0.5;

interface BboxMarkerInScope {
	fileId: string;
	page?: number;
	coords: PercentShapeCoords;
	coderId: CoderId;
	markerId: string;
	codes: CodeApplication[];
	engine: 'pdfShape' | 'image';
}

function collectBboxRegions(
	pdfModel: EngineModelsForExtraction['pdf'],
	imageModel: EngineModelsForExtraction['image'],
	scopeCoders: Set<CoderId>,
): ContestedRegion[] {
	const inScope: BboxMarkerInScope[] = [];
	if (pdfModel?.getAllShapes) {
		for (const s of pdfModel.getAllShapes()) {
			if (!s.codedBy || !scopeCoders.has(s.codedBy)) continue;
			inScope.push({
				fileId: s.fileId,
				page: s.page,
				coords: s.coords,
				coderId: s.codedBy,
				markerId: s.id,
				codes: s.codes,
				engine: 'pdfShape',
			});
		}
	}
	if (imageModel) {
		for (const m of imageModel.getAllMarkers()) {
			if (!m.codedBy || !scopeCoders.has(m.codedBy)) continue;
			inScope.push({
				fileId: m.fileId,
				page: undefined,
				coords: m.coords as PercentShapeCoords,
				coderId: m.codedBy,
				markerId: m.id,
				codes: m.codes,
				engine: 'image',
			});
		}
	}

	// Agrupa por (engine, fileId, page?) — markers em scopes diferentes nunca clusterizam.
	const byScope = new Map<string, BboxMarkerInScope[]>();
	for (const m of inScope) {
		const k = `${m.engine}::${m.fileId}::${m.page ?? '_'}`;
		const list = byScope.get(k) ?? [];
		list.push(m);
		byScope.set(k, list);
	}

	const out: ContestedRegion[] = [];
	for (const list of byScope.values()) {
		out.push(...clusterBboxScope(list));
	}
	return out;
}

/** Cluster markers de um scope (mesmo engine + fileId + page) por componente conexa
 *  no grafo IoU≥θ. NÃO usa Hungarian (Hungarian = pairing ótimo 1:1 entre 2 coders,
 *  não generaliza pra N>2; aqui queremos componentes conexas). Rasterização lazy +
 *  AABB early-out fazem o pior caso O(N²) virar O(N·k) quando bboxes são esparsas. */
function clusterBboxScope(markers: BboxMarkerInScope[]): ContestedRegion[] {
	const n = markers.length;
	if (n < 2) return [];

	const aabbs = markers.map(m => aabbOf(m.coords));
	const gridSize = detectGridSizeForCluster(aabbs);
	const bitmaps: (Bitmap | null)[] = new Array(n).fill(null);
	const getBitmap = (i: number): Bitmap => {
		const cached = bitmaps[i];
		if (cached) return cached;
		const m = markers[i]!;
		const b = rasterize(m.coords.type, m.coords, gridSize);
		bitmaps[i] = b;
		return b;
	};

	// Union-find com path compression (sem rank — N tipicamente <50).
	const parent = new Array(n).fill(0).map((_, i) => i);
	const find = (x: number): number => {
		let r = x;
		while (parent[r] !== r) r = parent[r]!;
		while (parent[x] !== r) { const next = parent[x]!; parent[x] = r; x = next; }
		return r;
	};
	const union = (a: number, b: number): void => {
		const ra = find(a), rb = find(b);
		if (ra !== rb) parent[ra] = rb;
	};

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (find(i) === find(j)) continue; // já no mesmo cluster
			if (!aabbOverlaps(aabbs[i]!, aabbs[j]!)) continue; // bitmap AND seria zero
			if (iou(getBitmap(i), getBitmap(j)) >= BBOX_CLUSTER_IOU) union(i, j);
		}
	}

	const groups = new Map<number, number[]>();
	for (let i = 0; i < n; i++) {
		const r = find(i);
		const list = groups.get(r) ?? [];
		list.push(i);
		groups.set(r, list);
	}

	const out: ContestedRegion[] = [];
	for (const idx of groups.values()) {
		if (idx.length < 2) continue;
		const coderIdSet = new Set<CoderId>();
		for (const i of idx) coderIdSet.add(markers[i]!.coderId);
		if (coderIdSet.size < 2) continue;

		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (const i of idx) {
			const a = aabbs[i]!;
			if (a.x < x0) x0 = a.x;
			if (a.y < y0) y0 = a.y;
			if (a.x + a.w > x1) x1 = a.x + a.w;
			if (a.y + a.h > y1) y1 = a.y + a.h;
		}

		const first = markers[idx[0]!]!;
		const markerRefs: MarkerRef[] = idx.map(i => ({
			markerId: markers[i]!.markerId,
			codedBy: markers[i]!.coderId,
			codes: markers[i]!.codes,
		}));
		const coderIds = Array.from(coderIdSet);

		const pct = (v: number): string => (v * 100).toFixed(1);
		const prefix = first.page !== undefined ? `page ${first.page} · ` : '';
		const displayLabel = `${prefix}bbox ${pct(x0)}%,${pct(y0)}% (${pct(x1 - x0)}×${pct(y1 - y0)}%)`;

		out.push({
			fileId: first.fileId,
			engine: first.engine,
			bounds: { kind: 'bbox', page: first.page, x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
			coderIds,
			displayLabel,
			markerRefs,
			divergenceKind: classifyDivergence(markerRefs, coderIds),
		});
	}
	return out;
}

/** Adaptive resolution: bboxes pequenas precisam grid maior pra evitar erro de rasterização
 *  (mesma heurística do bboxAdapter, inlined pra evitar export cross-module). */
function detectGridSizeForCluster(
	aabbs: { x: number; y: number; w: number; h: number }[],
): number {
	const base = 200;
	for (const a of aabbs) {
		const area = a.w * a.h;
		if (area < 0.0001 || Math.min(a.w, a.h) < 2 / base) return 400;
	}
	return base;
}

export const __test__ = {
	clusterMarkdownMarkers,
	buildMarkdownRegionFromCluster,
	sameRegion,
	collectPdfTextRegions,
	collectCsvSegmentRegions,
	collectTemporalRegions,
	collectBboxRegions,
};
