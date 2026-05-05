/**
 * smartCodeAnalytics — bridge entre SmartCodeCache (core) e analytics modes.
 *
 * SCs não são markers. São queries derivadas. Cada match do cache resolve pra um
 * UnifiedMarker existente em ConsolidatedData.markers — esse helper materializa
 * a "view" por SC (matched markers) aplicando filters globais (sources, caseVar,
 * group), mas NÃO o codes filter — esse define quais SCs entram, não quais matches.
 *
 * Modes consomem `getSmartCodeViews()` e fazem augmentation per-mode (frequency:
 * count, cooccurrence: intersect sets, evolution: herdar meta, etc.). Não tentamos
 * forçar SC em "synthetic markers" no consolidator porque cooccurrence ficaria
 * incoerente (synthetic teria só [scId], regular markers manteriam original codes
 * → SC × code = 0 falso).
 */

import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";
import type { SmartCodeCache } from "../../core/smartCodes/cache";
import type { SmartCodeRegistry } from "../../core/smartCodes/smartCodeRegistryApi";
import type { ConsolidatedData, FilterConfig, UnifiedMarker } from "./dataTypes";

export interface SmartCodeAnalyticsView {
	id: string;
	name: string;
	color: string;
	hidden: boolean;
	/** Markers que matcham o SC E passam filters globais (sources/caseVar/group). */
	matches: UnifiedMarker[];
}

function passesGlobalFilters(
	m: UnifiedMarker,
	filters: FilterConfig,
	caseVarsRegistry?: CaseVariablesRegistry,
	groupMemberSet?: Set<string> | null,
): boolean {
	if (!filters.sources.includes(m.source)) return false;
	// Codes filter — espelha statsHelpers.applyFilters. Marker excluído se TODOS seus codes
	// estão em excludeCodes (descheckar tema-A → markers com só tema-A saem do pool).
	// SC ids em excludeCodes não afetam aqui (markers não têm SC ids em codes).
	if (filters.codes.length > 0 && !m.codes.some((c) => filters.codes.includes(c))) return false;
	if (filters.excludeCodes.length > 0 && m.codes.every((c) => filters.excludeCodes.includes(c))) return false;
	if (filters.caseVariableFilter && caseVarsRegistry) {
		const { name, value } = filters.caseVariableFilter;
		const vars = caseVarsRegistry.getVariables(m.fileId);
		if (vars[name] !== value) return false;
	}
	// Group filter aplica via codes do marker — espelha statsHelpers.applyFilters comportamento.
	if (groupMemberSet && !m.codes.some((c) => groupMemberSet.has(c))) return false;
	return true;
}

/** Index O(1) pra resolver MarkerRef → UnifiedMarker. Reusable por chamada — caller cacheia. */
export function buildUnifiedMarkerIndex(markers: UnifiedMarker[]): Map<string, UnifiedMarker> {
	const idx = new Map<string, UnifiedMarker>();
	for (const m of markers) {
		// csv splits em csv-segment / csv-row no consolidator — engine type 'csv' do cache cobre os dois.
		// Lookup tenta key exata primeiro, fallback pra engine 'csv' nos dois variants.
		idx.set(`${m.source}:${m.fileId}:${m.id}`, m);
	}
	return idx;
}

function refKey(engine: string, fileId: string, markerId: string): string {
	return `${engine}:${fileId}:${markerId}`;
}

/**
 * Resolve SC matches em UnifiedMarkers. Aplica filters globais. Skip hidden SCs.
 *
 * Engine 'csv' do cache cobre csv-segment + csv-row do consolidator — resolveCsvFallback
 * tenta os 2 SourceTypes no index quando engine === 'csv'.
 */
export function getSmartCodeViews(
	data: ConsolidatedData,
	cache: SmartCodeCache,
	registry: SmartCodeRegistry,
	filters: FilterConfig,
	caseVarsRegistry?: CaseVariablesRegistry,
): SmartCodeAnalyticsView[] {
	const groupMemberSet = filters.groupFilter ? new Set(filters.groupFilter.memberCodeIds) : null;
	const index = buildUnifiedMarkerIndex(data.markers);

	const out: SmartCodeAnalyticsView[] = [];
	for (const sc of registry.getAll()) {
		if (sc.hidden) continue;
		const refs = cache.getMatches(sc.id);
		const matches: UnifiedMarker[] = [];
		for (const ref of refs) {
			let resolved = index.get(refKey(ref.engine, ref.fileId, ref.markerId));
			// Fallback: cache.engine 'csv' tem que casar com 'csv-segment' OU 'csv-row' no consolidator.
			if (!resolved && ref.engine === 'csv') {
				resolved = index.get(refKey('csv-segment', ref.fileId, ref.markerId))
					?? index.get(refKey('csv-row', ref.fileId, ref.markerId));
			}
			if (!resolved) continue;
			if (!passesGlobalFilters(resolved, filters, caseVarsRegistry, groupMemberSet)) continue;
			matches.push(resolved);
		}
		out.push({ id: sc.id, name: sc.name, color: sc.color, hidden: !!sc.hidden, matches });
	}
	return out;
}

/**
 * Filter dispatch helper — separa codes filter por prefixo.
 * - regular ids (`c_*`): aplicam ao pipeline existente de markers
 * - smart ids (`sc_*`): aplicam ao SC pass per-engine
 */
export function partitionCodesByPrefix(codeIds: string[]): { regular: string[]; smart: string[] } {
	const regular: string[] = [];
	const smart: string[] = [];
	for (const id of codeIds) (id.startsWith('sc_') ? smart : regular).push(id);
	return { regular, smart };
}

/** True se um SC id deve aparecer no result dado o codes filter atual.
 *  - filters.codes vazio → todos SCs visíveis entram
 *  - filters.codes não vazio + contém sc.id → entra
 *  - filters.excludeCodes contém sc.id → não entra */
export function smartCodePassesCodesFilter(scId: string, filters: FilterConfig): boolean {
	if (filters.excludeCodes.includes(scId)) return false;
	if (filters.codes.length > 0 && !filters.codes.includes(scId)) return false;
	return true;
}
