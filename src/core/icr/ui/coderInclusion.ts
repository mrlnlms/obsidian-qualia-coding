/**
 * coderInclusion — filtra coders sem markers do escopo (polish E1).
 *
 * Default behavior (E2): includeCodersWithoutMarkers=false → coders com 0 markers
 * no escopo são removidos antes de renderizar matrix/table/heatmap. Resolve o caso
 * "Default coder κ=0 vacuous" do BACKLOG: par envolvendo coder vazio retorna κ=0
 * (todos chars `__none__` vs distribuição real do outro), pintando célula vermelha
 * que confunde — "ausência de markers" disfarçada de "discordância total".
 *
 * Toggle no toolbar (filter chip "incluir coders sem markers") readiciona pra
 * cenários onde pesquisador quer ver coders ainda não engajados.
 *
 * Considera markers de TODAS engines (text-likes + temporal + categorical + bbox).
 */

import type { ComparisonScope } from './compareCodersTypes';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { CoderId } from '../coderTypes';

export function getCodersWithMarkersInScope(
	scope: ComparisonScope,
	models: EngineModelsForExtraction,
): CoderId[] {
	const coderSet = new Set<CoderId>();
	const allMarkers: { codedBy?: string; codes?: { codeId: string }[]; fileId: string }[] = [
		...(models.markdown?.getAllMarkers() ?? []),
		...(models.pdf?.getAllMarkers() ?? []),
		...((models.pdf as any)?.getAllShapes?.() ?? []),
		...(models.csv?.getAllMarkers() ?? []),
		...(models.audio?.getAllMarkers() ?? []),
		...(models.video?.getAllMarkers() ?? []),
		...(models.image?.getAllMarkers?.() ?? []),
	];
	for (const m of allMarkers) {
		if (!m.codedBy) continue;
		if (!scope.coderIds.includes(m.codedBy)) continue;
		if (scope.codeIds && !(m.codes ?? []).some(c => scope.codeIds!.includes(c.codeId))) continue;
		if (scope.fileIds && !scope.fileIds.includes(m.fileId)) continue;
		coderSet.add(m.codedBy);
	}
	return scope.coderIds.filter(id => coderSet.has(id));
}

export function applyCoderInclusion(
	scope: ComparisonScope,
	models: EngineModelsForExtraction,
	includeWithoutMarkers: boolean,
): ComparisonScope {
	if (includeWithoutMarkers) return scope;
	return { ...scope, coderIds: getCodersWithMarkersInScope(scope, models) };
}
