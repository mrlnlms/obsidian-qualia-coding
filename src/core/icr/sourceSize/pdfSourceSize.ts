/**
 * PdfSourceSize — descobre tamanho real (chars de texto) por página de PDF via pdfjs.
 *
 * Resolve o gap "totalUnits inflated em PDF" (BACKLOG §1c, 2026-05-12): sem provider,
 * o motor α nominal usa `max(range.to)` como aproximação do total de unidades. Pra PDFs
 * com muitas páginas (ou marker que cobre só uma fração), isso infla totalUnits e Po
 * vira artificial. Provider retorna chars reais via `pdf.js`.
 *
 * **Janela de absorção potencial:** se a Camada 2 BHM (Bayesian annotation model) do
 * bloco "Framework Unificado ICR + LLM" for implementada, o `totalUnits` exato vira
 * irrelevante — BHM modela background via prior em vez de unidade naturalmente. Este
 * provider e o `csvSegmentSourceSize` viram redundantes nesse momento. **Re-avaliar
 * relação quando tocar BHM.** Ver `docs/ICR-MULTIMODAL-METHODOLOGY.md` §"Framework
 * Unificado" + `ROADMAP.md §"Frente 2"`.
 *
 * Pattern: `window.pdfjsLib` é exposto pelo core PDF viewer do Obsidian após primeiro
 * PDF aberto. Sem PDF aberto na sessão, retorna `null` (caller cai no fallback
 * `max(range.to)`). Diferente do export QDPX (que abre tab oculta pra forçar load —
 * `pdfExportData.ts:24-48`), aqui não fazemos auto-load: provider roda em background
 * durante render do Compare Coders, abrir tab seria UX ruim.
 *
 * Cache: por `(fileId, page)` pra char count + por `fileId` pra doc parseado (evita
 * re-parse de PDF inteiro quando várias páginas são consultadas).
 */

import type { App, TFile } from 'obsidian';
import type { SourceSizeProvider } from '../ui/scopeExtraction';
import type { EngineId } from '../reporter';

interface PdfDoc {
	numPages: number;
	getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string }> }> }>;
	destroy?: () => Promise<void>;
}

export class PdfSourceSize implements SourceSizeProvider {
	private charCountCache = new Map<string, number>();
	private docCache = new Map<string, PdfDoc>();

	constructor(private app: App) {}

	async getSourceSize(
		engine: EngineId,
		fileId: string,
		locator: string,
		_temporalResolution: number,
	): Promise<number | null> {
		if (engine !== 'pdf') return null;
		if (!locator.startsWith('page:')) return null;

		const page = parseInt(locator.slice(5), 10);
		if (!Number.isFinite(page) || page < 0) return null;

		const cacheKey = `${fileId}|${locator}`;
		const cached = this.charCountCache.get(cacheKey);
		if (cached !== undefined) return cached;

		const doc = await this.loadDoc(fileId);
		if (!doc) return null;

		// pdfjs page index é 1-based; locator do plugin é 0-based.
		const pdfjsPageIdx = page + 1;
		if (pdfjsPageIdx > doc.numPages) return null;

		try {
			const pageObj = await doc.getPage(pdfjsPageIdx);
			const content = await pageObj.getTextContent();
			const text = content.items.map(i => (i.str ?? '').trim()).filter(Boolean).join(' ');
			const chars = text.length;
			this.charCountCache.set(cacheKey, chars);
			return chars;
		} catch {
			return null;
		}
	}

	private async loadDoc(fileId: string): Promise<PdfDoc | null> {
		const cached = this.docCache.get(fileId);
		if (cached) return cached;

		// Sem pdfjsLib (= nenhum PDF aberto na sessão) → fallback. Não force-loadeamos
		// em background — abriria tab oculta sem ação do usuário.
		const pdfjsLib = (window as unknown as { pdfjsLib?: { getDocument(src: unknown): { promise: Promise<PdfDoc> } } }).pdfjsLib;
		if (!pdfjsLib) return null;

		const file = this.app.vault.getAbstractFileByPath(fileId) as TFile | null;
		if (!file || !('stat' in file)) return null;

		try {
			const buffer = await this.app.vault.adapter.readBinary(fileId);
			const doc = await pdfjsLib.getDocument(new Uint8Array(buffer)).promise;
			this.docCache.set(fileId, doc);
			return doc;
		} catch {
			return null;
		}
	}

	/** Invalida cache pra um fileId (útil pós file change). */
	invalidate(fileId: string): void {
		const doc = this.docCache.get(fileId);
		if (doc?.destroy) void doc.destroy();
		this.docCache.delete(fileId);
		// Limpa entradas do charCountCache que começam com fileId
		const prefix = `${fileId}|`;
		for (const key of this.charCountCache.keys()) {
			if (key.startsWith(prefix)) this.charCountCache.delete(key);
		}
	}

	/** Invalida todo o cache + destrói docs parseados. */
	async clear(): Promise<void> {
		for (const doc of this.docCache.values()) {
			if (doc.destroy) await doc.destroy();
		}
		this.docCache.clear();
		this.charCountCache.clear();
	}
}
