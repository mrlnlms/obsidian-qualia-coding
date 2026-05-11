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
import type { CoderRegistry } from '../coderRegistry';

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

/** Filtra coders do tipo 'consensus' do scope quando `exclude` é true.
 *  E3b: toggle no toolbar liga/desliga pra ver κ pré (sem consensus) vs pós (com consensus).
 *
 *  Detecção dupla: prefix 'consensus:' (sempre confiável) OU registry lookup.
 *  Prefix é convenção cravada em coderRegistry.createConsensus — não pode mudar sem refactor. */
export function applyConsensusExclusion(
	scope: ComparisonScope,
	coderRegistry: CoderRegistry,
	exclude: boolean,
): ComparisonScope {
	if (!exclude) return scope;
	const filtered = scope.coderIds.filter(id => !isConsensusCoderId(id, coderRegistry));
	return { ...scope, coderIds: filtered };
}

/** Lê os ids de coders consensus presentes em um scope — pra view decidir se mostra
 *  o toggle "excluir consensus" e/ou colunas pré/pós no modal lado a lado. */
export function getConsensusCoderIdsInScope(
	scope: ComparisonScope,
	coderRegistry: CoderRegistry,
): CoderId[] {
	return scope.coderIds.filter(id => isConsensusCoderId(id, coderRegistry));
}

/** Identifica consensus coder. Prefix `consensus:` é convenção cravada em createConsensus
 *  (`consensus:${slug}` — coderRegistry.ts L80). Fallback registry pra robustez. */
function isConsensusCoderId(id: CoderId, coderRegistry: CoderRegistry): boolean {
	if (id.startsWith('consensus:')) return true;
	return coderRegistry.getById(id)?.type === 'consensus';
}
