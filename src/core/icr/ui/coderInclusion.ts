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

// ─── Cache module-level (perf fix 2026-05-11) ──────────────
// `getCodersWithMarkersInScope` é chamado em todo `renderToolbar` da Compare Coders View
// (a cada `updateState`: chip click, mode swap, filter toggle). Sem cache, cada chamada
// itera markers de TODAS as 7 engines + filtra por scope. Mesmo pattern do scopeExtraction:
// gen counter + LRU. Invalidado via bumpCoderInclusionCacheGeneration (chamado quando
// markers mudam — wired no mesmo bumpInputsCacheGeneration via re-export pra simplicidade).

const COVERAGE_CACHE_MAX = 50;
let coverageGen = 0;
const coverageCache = new Map<string, { gen: number; result: CoderId[] }>();

export function bumpCoderInclusionCacheGeneration(): void {
	coverageGen++;
	coverageCache.clear();
}

function coverageKey(scope: ComparisonScope): string {
	const norm = (a?: readonly string[]) => a ? [...a].sort().join(',') : '';
	return `${norm(scope.coderIds)}|${norm(scope.codeIds)}|${norm(scope.fileIds)}|${norm(scope.groupIds)}|${norm(scope.folderIds)}|${norm(scope.engineIds as string[] | undefined)}`;
}

function pruneCoverageCache(): void {
	while (coverageCache.size > COVERAGE_CACHE_MAX) {
		const k = coverageCache.keys().next().value;
		if (k === undefined) break;
		coverageCache.delete(k);
	}
}

export function getCodersWithMarkersInScope(
	scope: ComparisonScope,
	models: EngineModelsForExtraction,
): CoderId[] {
	const key = coverageKey(scope);
	const hit = coverageCache.get(key);
	if (hit && hit.gen === coverageGen) {
		// Touch LRU
		coverageCache.delete(key);
		coverageCache.set(key, hit);
		return hit.result;
	}

	const coderSet = new Set<CoderId>();
	const scopeCoderSet = new Set(scope.coderIds);
	const scopeCodeSet = scope.codeIds ? new Set(scope.codeIds) : null;
	const scopeFileSet = scope.fileIds ? new Set(scope.fileIds) : null;

	// Iteração inline por engine pra evitar spread de 7 arrays (alocação cara em vault grande).
	const scan = (markers: { codedBy?: string; codes?: { codeId: string }[]; fileId: string }[]) => {
		for (const m of markers) {
			if (!m.codedBy) continue;
			if (!scopeCoderSet.has(m.codedBy)) continue;
			if (scopeFileSet && !scopeFileSet.has(m.fileId)) continue;
			if (scopeCodeSet) {
				const codes = m.codes ?? [];
				let hit = false;
				for (const c of codes) {
					if (scopeCodeSet.has(c.codeId)) { hit = true; break; }
				}
				if (!hit) continue;
			}
			coderSet.add(m.codedBy);
		}
	};

	if (models.markdown) scan(models.markdown.getAllMarkers() as never);
	if (models.pdf) {
		scan(models.pdf.getAllMarkers() as never);
		const shapes = (models.pdf as { getAllShapes?: () => unknown[] }).getAllShapes?.();
		if (shapes) scan(shapes as never);
	}
	if (models.csv) scan(models.csv.getAllMarkers() as never);
	if (models.audio) scan(models.audio.getAllMarkers() as never);
	if (models.video) scan(models.video.getAllMarkers() as never);
	if (models.image) scan(models.image.getAllMarkers() as never);

	const result = scope.coderIds.filter(id => coderSet.has(id));
	coverageCache.set(key, { gen: coverageGen, result });
	pruneCoverageCache();
	return result;
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
