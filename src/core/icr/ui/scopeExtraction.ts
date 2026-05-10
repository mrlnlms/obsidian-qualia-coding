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
import type { PdfMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker, RowMarker, CsvMarker } from '../../../csv/csvCodingTypes';
import type { MediaMarker } from '../../../media/mediaTypes';
import {
	extractMarkdownRange,
	extractPdfRange,
	extractCsvSegmentRange,
	extractMediaRange,
} from '../textRange';
import { extractRowMarkerUnit } from '../categoricalKappaInput';

/** Engines suportados em E1 (text-likes + temporal + categorical). Bbox fica fora. */
const E1_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video'];

/**
 * Models que `extractInputsFromScope` precisa pra coletar markers.
 * Plugin instance fornece (em main.ts: this.markdownModel etc — todos optional).
 */
export interface EngineModelsForExtraction {
	markdown?: { getAllMarkers(): Marker[] };
	pdf?: { getAllMarkers(): PdfMarker[] };
	csv?: { getAllMarkers(): CsvMarker[] };  // mixed segment + row; discriminar via m.kind
	audio?: { getAllMarkers(): MediaMarker[] };
	video?: { getAllMarkers(): MediaMarker[] };
}

export interface ExtractionContext {
	models: EngineModelsForExtraction;
	app: App;
}

export async function extractInputsFromScope(
	scope: ComparisonScope,
	ctx: ExtractionContext,
): Promise<EngineKappaInput[]> {
	const targetEngines = scope.engineIds ?? E1_ENGINES;
	const result: EngineKappaInput[] = [];

	for (const engine of targetEngines) {
		if (engine === 'pdfShape' || engine === 'image') continue;  // E2 path
		const markers = collectMarkersForEngine(engine, ctx.models);
		const filtered = filterByScope(markers, scope);
		if (filtered.length === 0) continue;

		if (engine === 'csvRow') {
			const input = buildCategoricalInput(filtered as RowMarker[], scope.coderIds);
			if (input.units.length > 0) result.push({ engine, kappaInput: input });
		} else {
			const input = await buildPerCharInput(engine, filtered, ctx.app, scope.coderIds);
			if (input.markers.length > 0) result.push({ engine, kappaInput: input });
		}
	}
	return result;
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
					range = extractMediaRange(m as MediaMarker);
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
