/**
 * scopeExtraction — cohort-level adapter sobre per-marker extractors dos slices 1+4.
 *
 * Reduz markers de N engines + filtros de scope em `EngineKappaInput[]` aceito
 * pelo reporter. Per-marker extractors (`extractMarkdownRange` etc) ficam em
 * `textRange.ts`/`categoricalKappaInput.ts`; este módulo agrega.
 *
 * Markdown precisa source text pra `lineChToAbsolute` — caller passa `app`
 * pra leitura via `vault.cachedRead`.
 *
 * Bbox engines (`pdfShape`, `image`) NÃO entram em E1 — adapter é per-pair
 * (slice 6) e exige pathway separado no matrix render. Decisão registrada
 * em `docs/superpowers/specs/2026-05-09-icr-compare-coders-design.md` §1
 * (Q1 escopo Fase 1).
 */

import type { App } from 'obsidian';
import type { ComparisonScope } from './compareCodersTypes';
import type { EngineKappaInput, EngineId } from '../reporter';
import type { CodedMarker, KappaInput, SourceMeta } from '../kappaInput';
import type { CategoricalKappaInput } from '../categoricalKappaInput';
import type { Marker } from '../../../markdown/models/codeMarkerModel';
import type { PdfMarker, PdfShapeMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker, RowMarker, CsvMarker } from '../../../csv/csvCodingTypes';
import type { MediaMarker } from '../../../media/mediaTypes';
import type { ImageMarker } from '../../../image/imageCodingTypes';
import {
	extractMarkdownRange,
	extractPdfRange,
	extractCsvSegmentRange,
	extractMediaRange,
} from '../textRange';
import { extractRowMarkerUnit } from '../categoricalKappaInput';

/** Engines suportados em E1 (text-likes + temporal + categorical). Bbox fica fora. */
const E1_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video'];

// ─── Cache module-level (Slice E3a perf fix) ──────────────────────────────
// Click numa célula da matriz dispara renderOverview que chama extractInputsFromScope.
// Mas scope NÃO muda em selection click — só currentSelection muda. Cachear por scope-hash
// elimina N×vault.cachedRead + N×scan markers em rajadas de clicks.
//
// Invalidation: incrementar generation via bumpInputsCacheGeneration() quando markers
// mudam (após reconciliação, edição manual, etc). LRU 50 entries pra evitar leak em
// sessão longa com muitos scopes diferentes (chips toggle, filters).

const INPUTS_CACHE_MAX_ENTRIES = 50;
let cacheGeneration = 0;
const inputsCache = new Map<string, { gen: number; promise: Promise<EngineKappaInput[]> }>();

/** Cache adicional per-engine (perf fix 2026-05-11): chip de filter engine quebrava o cache
 *  do scope (engineIds muda → key novo) mesmo com markers per engine inalterados.
 *  Cache per engine + scope-sem-engineIds elimina re-extract em chip toggle. */
const engineInputCache = new Map<string, { gen: number; promise: Promise<EngineKappaInput | null> }>();

/** Invalida todo o cache de inputs. Chamar após qualquer mutação que afete extração:
 *  reconciliação (markers novos), edição de marker, deleção de coder, etc. */
export function bumpInputsCacheGeneration(): void {
	cacheGeneration++;
	inputsCache.clear();
	engineInputCache.clear();
}

/**
 * ⚠️ REGRA DE PERFORMANCE — ler antes de mexer em overview matrix/table/heatmap.
 *
 * `state.filters.visibleCoderIds` (toggle de chip) NUNCA deve entrar no scope passado
 * pra `extractInputsFromScope`. O cache do extract usa `coderIds` na key; meter
 * visibility no scope invalida o cache a cada toggle e re-extrai markers de TODAS
 * engines (passo caro: 7 engines × milhares de markers × cada coder).
 *
 * Pattern correto:
 *   1. extract recebe `inclusionScope` (após applyCoderInclusion + applyConsensusExclusion,
 *      SEM applyVisibleCoderFilter) — cache key estável entre toggles.
 *   2. Pra filtrar a tabela κ por coders visíveis, use `filterInputsByCoders` no
 *      resultado do extract, OU monte pairs/grid sobre `coderIds` filtrado e deixe
 *      o report computar só esses pairs.
 *   3. Quando passar `cacheKey` pro reportKappa/reportPairwise com inputs filtrados,
 *      anexe sufixo com visibleCoderIds pro key não colidir com versão "todos coders".
 *
 * Já regrediu 4× — última 2026-05-12. Se vc precisa filtrar coders no extract
 * pra resolver um bug visual, está atacando o problema no lugar errado. Filtre no
 * consumo do resultado (inputs ou pairs), não na entrada do extract.
 */
export function filterInputsByCoders(
	inputs: EngineKappaInput[],
	coderIds: readonly string[],
): EngineKappaInput[] {
	const set = new Set(coderIds);
	const out: EngineKappaInput[] = [];
	for (const input of inputs) {
		const ki = input.kappaInput;
		if ('units' in ki) {
			const units = ki.units.filter(u => set.has(u.coderId));
			if (units.length === 0) continue;
			out.push({ engine: input.engine, kappaInput: { units, coders: ki.coders.filter(c => set.has(c)) } });
		} else {
			const markers = ki.markers.filter(m => set.has(m.coderId));
			if (markers.length === 0) continue;
			out.push({ engine: input.engine, kappaInput: { markers, sources: ki.sources, coders: ki.coders.filter(c => set.has(c)) } });
		}
	}
	return out;
}

export function cacheKeyForScope(scope: ComparisonScope): string {
	// Normaliza arrays pra hash estável (ordem não significativa).
	const norm = (a?: string[]) => a ? [...a].sort() : undefined;
	return JSON.stringify({
		coderIds: norm(scope.coderIds),
		codeIds: norm(scope.codeIds),
		groupIds: norm(scope.groupIds),
		folderIds: norm(scope.folderIds),
		engineIds: norm(scope.engineIds),
		fileIds: norm(scope.fileIds),
		temporalResolution: scope.temporalResolution ?? 1,
	});
}

function pruneCache(): void {
	while (inputsCache.size > INPUTS_CACHE_MAX_ENTRIES) {
		const firstKey = inputsCache.keys().next().value;
		if (firstKey === undefined) break;
		inputsCache.delete(firstKey);
	}
}

/**
 * Models que `extractInputsFromScope` precisa pra coletar markers.
 * Plugin instance fornece (em main.ts: this.markdownModel etc — todos optional).
 */
export interface EngineModelsForExtraction {
	markdown?: { getAllMarkers(): Marker[] };
	pdf?: { getAllMarkers(): PdfMarker[]; getAllShapes?(): PdfShapeMarker[] };
	csv?: { getAllMarkers(): CsvMarker[] };  // mixed segment + row; discriminar via m.kind
	audio?: { getAllMarkers(): MediaMarker[] };
	video?: { getAllMarkers(): MediaMarker[] };
	image?: { getAllMarkers(): ImageMarker[] };
}

export interface ExtractionContext {
	models: EngineModelsForExtraction;
	app: App;
}

export async function extractInputsFromScope(
	scope: ComparisonScope,
	ctx: ExtractionContext,
): Promise<EngineKappaInput[]> {
	const key = cacheKeyForScope(scope);
	const cached = inputsCache.get(key);
	if (cached && cached.gen === cacheGeneration) {
		// Move to end pra LRU (touch).
		inputsCache.delete(key);
		inputsCache.set(key, cached);
		return cached.promise;
	}
	const promise = doExtractInputsFromScope(scope, ctx);
	inputsCache.set(key, { gen: cacheGeneration, promise });
	pruneCache();
	return promise;
}

function engineCacheKey(engine: EngineId, scope: ComparisonScope): string {
	const norm = (a?: string[]) => a ? [...a].sort() : undefined;
	// temporalResolution só afeta audio/video — incluir sempre é OK (inocuo pros outros engines).
	return `${engine}::${JSON.stringify({
		coderIds: norm(scope.coderIds),
		codeIds: norm(scope.codeIds),
		groupIds: norm(scope.groupIds),
		folderIds: norm(scope.folderIds),
		fileIds: norm(scope.fileIds),
		temporalResolution: scope.temporalResolution ?? 1,
	})}`;
}

/** Extrai input pra UMA engine, cacheado por engine + scope-sem-engineIds. Toggle de chip
 *  de filter NÃO invalida esses caches — cada engine é independente. */
async function getEngineInput(
	engine: EngineId,
	scope: ComparisonScope,
	ctx: ExtractionContext,
): Promise<EngineKappaInput | null> {
	if (engine === 'pdfShape' || engine === 'image') return null;
	const key = engineCacheKey(engine, scope);
	const cached = engineInputCache.get(key);
	if (cached && cached.gen === cacheGeneration) {
		engineInputCache.delete(key);
		engineInputCache.set(key, cached);
		return cached.promise;
	}
	const promise = (async (): Promise<EngineKappaInput | null> => {
		const markers = collectMarkersForEngine(engine, ctx.models);
		const filtered = filterByScope(markers, scope);
		if (filtered.length === 0) return null;
		if (engine === 'csvRow') {
			const input = buildCategoricalInput(filtered as RowMarker[], scope.coderIds);
			return input.units.length > 0 ? { engine, kappaInput: input } : null;
		}
		const input = await buildPerCharInput(engine, filtered, ctx.app, scope.coderIds, scope.temporalResolution);
		return input.markers.length > 0 ? { engine, kappaInput: input } : null;
	})();
	engineInputCache.set(key, { gen: cacheGeneration, promise });
	while (engineInputCache.size > INPUTS_CACHE_MAX_ENTRIES) {
		const k = engineInputCache.keys().next().value;
		if (k === undefined) break;
		engineInputCache.delete(k);
	}
	return promise;
}

async function doExtractInputsFromScope(
	scope: ComparisonScope,
	ctx: ExtractionContext,
): Promise<EngineKappaInput[]> {
	const targetEngines = scope.engineIds ?? E1_ENGINES;
	const perEngine = await Promise.all(targetEngines.map(e => getEngineInput(e, scope, ctx)));
	return perEngine.filter((r): r is EngineKappaInput => r !== null);
}

type AnyEngineMarker = Marker | PdfMarker | SegmentMarker | RowMarker | MediaMarker;

/** SegmentMarker tem `from`/`to` chars dentro da cell; RowMarker não tem. */
function isSegmentMarker(m: CsvMarker): m is SegmentMarker {
	return 'from' in m && 'to' in m;
}

function isRowMarker(m: CsvMarker): m is RowMarker {
	return !('from' in m && 'to' in m);
}

function collectMarkersForEngine(engine: EngineId, models: EngineModelsForExtraction): AnyEngineMarker[] {
	switch (engine) {
		case 'markdown':   return models.markdown?.getAllMarkers() ?? [];
		case 'pdf':        return models.pdf?.getAllMarkers() ?? [];
		case 'csvSegment': return (models.csv?.getAllMarkers() ?? []).filter(isSegmentMarker);
		case 'csvRow':     return (models.csv?.getAllMarkers() ?? []).filter(isRowMarker);
		case 'audio':      return models.audio?.getAllMarkers() ?? [];
		case 'video':      return models.video?.getAllMarkers() ?? [];
		default: return [];
	}
}

function filterByScope(markers: AnyEngineMarker[], scope: ComparisonScope): AnyEngineMarker[] {
	return markers.filter(m => {
		const codes = (m as { codes?: { codeId: string }[] }).codes ?? [];
		if (scope.codeIds && !codes.some(c => scope.codeIds!.includes(c.codeId))) return false;
		if (scope.fileIds && !scope.fileIds.includes(m.fileId)) return false;
		const codedBy = (m as { codedBy?: string }).codedBy;
		if (scope.coderIds.length && codedBy && !scope.coderIds.includes(codedBy)) return false;
		return true;
	});
}

async function buildPerCharInput(
	engine: Exclude<EngineId, 'csvRow' | 'pdfShape' | 'image'>,
	markers: AnyEngineMarker[],
	app: App,
	coders: string[],
	temporalResolution: number = 1,
): Promise<KappaInput> {
	const codedMarkers: CodedMarker[] = [];
	const sourceTotals = new Map<string, { fileId: string; locator: string; totalUnits: number }>();

	// Markdown precisa source text — pre-carrega per fileId pra evitar re-read.
	const sourceTexts = engine === 'markdown'
		? await readMarkdownSourceTexts(markers as Marker[], app)
		: undefined;

	for (const m of markers) {
		const codedBy = (m as { codedBy?: string }).codedBy;
		if (!codedBy) continue;

		try {
			let range;
			switch (engine) {
				case 'markdown': {
					const text = sourceTexts!.get(m.fileId);
					if (text === undefined) continue;
					range = extractMarkdownRange(m as Marker, text);
					updateSourceTotal(sourceTotals, m.fileId, '', text.length);
					break;
				}
				case 'pdf': {
					range = extractPdfRange(m as PdfMarker);
					updateSourceTotal(sourceTotals, m.fileId, range.locator, Math.max(getCurrentTotal(sourceTotals, m.fileId, range.locator), range.to));
					break;
				}
				case 'csvSegment': {
					range = extractCsvSegmentRange(m as SegmentMarker);
					updateSourceTotal(sourceTotals, m.fileId, range.locator, Math.max(getCurrentTotal(sourceTotals, m.fileId, range.locator), range.to));
					break;
				}
				case 'audio':
				case 'video': {
					range = extractMediaRange(m as MediaMarker, temporalResolution);
					updateSourceTotal(sourceTotals, m.fileId, range.locator, Math.max(getCurrentTotal(sourceTotals, m.fileId, range.locator), range.to));
					break;
				}
			}

			const codes = (m as { codes: { codeId: string }[] }).codes;
			codedMarkers.push({
				coderId: codedBy,
				range,
				codeIds: codes.map(c => c.codeId),
			});
		} catch {
			// Marker malformado — pula
			continue;
		}
	}

	const sources: SourceMeta[] = Array.from(sourceTotals.values());
	return { markers: codedMarkers, sources, coders };
}

function buildCategoricalInput(markers: RowMarker[], coders: string[]): CategoricalKappaInput {
	const units = markers
		.filter(m => m.codedBy !== undefined)
		.map(m => extractRowMarkerUnit(m));
	return { units, coders };
}

async function readMarkdownSourceTexts(markers: Marker[], app: App): Promise<Map<string, string>> {
	const fileIds = new Set(markers.map(m => m.fileId));
	const result = new Map<string, string>();
	for (const fileId of fileIds) {
		const file = app.vault.getAbstractFileByPath(fileId);
		if (file && 'extension' in file) {
			try {
				const text = await app.vault.cachedRead(file as Parameters<typeof app.vault.cachedRead>[0]);
				result.set(fileId, text);
			} catch {
				// File inacessível — pula markers desse fileId silenciosamente
			}
		}
	}
	return result;
}

function updateSourceTotal(
	map: Map<string, { fileId: string; locator: string; totalUnits: number }>,
	fileId: string,
	locator: string,
	totalUnits: number,
): void {
	const key = `${fileId}|${locator}`;
	map.set(key, { fileId, locator, totalUnits });
}

function getCurrentTotal(
	map: Map<string, { fileId: string; locator: string; totalUnits: number }>,
	fileId: string,
	locator: string,
): number {
	return map.get(`${fileId}|${locator}`)?.totalUnits ?? 0;
}
