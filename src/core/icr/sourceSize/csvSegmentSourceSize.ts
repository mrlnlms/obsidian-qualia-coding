/**
 * CsvSegmentSourceSize — descobre tamanho real (chars) de célula CSV.
 *
 * Resolve o gap "totalUnits inflated em CSV segment" (BACKLOG §1d, 2026-05-12): sem
 * provider, o motor α usa `max(range.to)` por aproximação. Provider lê texto real
 * da célula e devolve `length`.
 *
 * **Dois modos cobertos:**
 *   1. **Eager** (CSV pequeno, ~maioria dos casos) — `csvModel.rowDataCache` tem
 *      todas as rows em memória após o arquivo ser aberto. Acesso síncrono.
 *   2. **Lazy** (CSV grande >100MB) — `csvModel.getLazyProvider(fileId)` retorna
 *      `RowProvider` ligado ao DuckDB. Acesso assíncrono.
 *
 * Pra CSV fechado, retorna `null` (caller cai no fallback `max(range.to)`).
 *
 * **Janela de absorção potencial:** se a Camada 2 BHM (Bayesian annotation model) for
 * implementada, totalUnits exato vira irrelevante (BHM modela background via prior).
 * Este provider e o `pdfSourceSize` viram redundantes nesse momento. **Re-avaliar
 * relação quando tocar BHM.** Ver `docs/ICR-MULTIMODAL-METHODOLOGY.md` §"Framework
 * Unificado" + `ROADMAP.md §"Frente 2"`.
 *
 * Cache por `(fileId, sourceRowId, column)`. Provider lazy é re-fetched cada query
 * (pode ter sido disposed se user fechou tab).
 */

import type { SourceSizeProvider } from '../ui/scopeExtraction';
import type { EngineId } from '../reporter';
import type { CsvCodingModel } from '../../../csv/csvCodingModel';

const LOCATOR_REGEX = /^row:(\d+)\|col:(.+)$/;

export class CsvSegmentSourceSize implements SourceSizeProvider {
	private charCountCache = new Map<string, number>();

	constructor(private csvModel: CsvCodingModel) {}

	async getSourceSize(
		engine: EngineId,
		fileId: string,
		locator: string,
		_temporalResolution: number,
	): Promise<number | null> {
		if (engine !== 'csvSegment') return null;
		const match = locator.match(LOCATOR_REGEX);
		if (!match) return null;

		const sourceRowId = parseInt(match[1]!, 10);
		const column = match[2]!;
		if (!Number.isFinite(sourceRowId)) return null;

		const cacheKey = `${fileId}|${locator}`;
		const cached = this.charCountCache.get(cacheKey);
		if (cached !== undefined) return cached;

		// Caminho 1: eager (rowDataCache em memória — CSV pequeno).
		const eagerRows = this.csvModel.rowDataCache.get(fileId);
		const eagerCell = eagerRows?.[sourceRowId]?.[column];
		if (eagerCell != null) {
			const chars = String(eagerCell).length;
			this.charCountCache.set(cacheKey, chars);
			return chars;
		}

		// Caminho 2: lazy (RowProvider via DuckDB — CSV grande / parquet).
		const provider = this.csvModel.getLazyProvider(fileId);
		if (!provider) return null;

		try {
			const text = await provider.getMarkerText({ sourceRowId, column });
			if (text == null) return null;
			const chars = text.length;
			this.charCountCache.set(cacheKey, chars);
			return chars;
		} catch {
			return null;
		}
	}

	/** Invalida cache pra um fileId. */
	invalidate(fileId: string): void {
		const prefix = `${fileId}|`;
		for (const key of this.charCountCache.keys()) {
			if (key.startsWith(prefix)) this.charCountCache.delete(key);
		}
	}

	/** Invalida todo o cache. */
	clear(): void {
		this.charCountCache.clear();
	}
}
