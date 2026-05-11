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
import type { CompareCodersViewState } from './compareCodersTypes';
import type { EngineModelsForExtraction } from './scopeExtraction';

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

export function collectContestedRegions(
	state: CompareCodersViewState,
	engineModels: EngineModelsForExtraction,
): ContestedRegion[] {
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
	}

	return out;
}

export function regionKey(
	region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
): string {
	const b = region.bounds;
	const boundsKey = b.kind === 'text' ? `t:${b.from}-${b.to}`
		: b.kind === 'csvRow' ? `r:${b.rowIndex}:${b.column ?? ''}`
		: `m:${b.fromMs}-${b.toMs}`;
	return `${region.fileId}::${region.engine}::${boundsKey}`;
}

export function sameBounds(a: ReconciliationBounds, b: ReconciliationBounds): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'text' && b.kind === 'text') return a.from === b.from && a.to === b.to;
	if (a.kind === 'csvRow' && b.kind === 'csvRow') return a.rowIndex === b.rowIndex && (a.column ?? '') === (b.column ?? '');
	if (a.kind === 'temporal' && b.kind === 'temporal') return a.fromMs === b.fromMs && a.toMs === b.toMs;
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

export function formatBoundsLabel(bounds: ReconciliationBounds): string {
	switch (bounds.kind) {
		case 'text':
			return `chars ${bounds.from}–${bounds.to}`;
		case 'csvRow':
			return bounds.column ? `row ${bounds.rowIndex} · ${bounds.column}` : `row ${bounds.rowIndex}`;
		case 'temporal':
			return `${bounds.fromMs}ms–${bounds.toMs}ms`;
	}
}

export function divergenceTagLabel(kind: DivergenceKind): string {
	switch (kind) {
		case 'code': return 'codes diferentes';
		case 'boundary': return 'mesma marcação, bounds diferentes';
		case 'existence': return 'só 1 coder marcou';
	}
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

export const __test__ = {
	clusterMarkdownMarkers,
	buildMarkdownRegionFromCluster,
	sameRegion,
};
