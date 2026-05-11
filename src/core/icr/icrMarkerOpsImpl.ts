/**
 * IcrMarkerOpsImpl — implementação concreta de IcrMarkerOps wrappando os engine models.
 *
 * Slice E3a Fase 1 cobria markdown + csvRow. Slice E5a estende pra:
 *   - pdf (text — bounds 'pdfText' com page + chars)
 *   - csvSegment (bounds 'csvSegment' com rowIndex + column + chars)
 *   - audio (bounds 'temporal' em ms)
 *   - video (bounds 'temporal' em ms)
 *
 * Pendente em E5b (bbox spatial — frente separada):
 *   - pdfShape (bounds 'bbox' com page + shape coords)
 *   - image (bounds 'bbox' sem page)
 */

import type { IcrMarkerOps } from './markerOps';
import type { CodeApplication, MarkerSnapshot, ReconciliationBounds } from '../types';
import type { CoderId } from './coderTypes';
import type { EngineId } from './reporter';
import type QualiaCodingPlugin from '../../main';
import type { Marker as MarkdownMarker } from '../../markdown/models/codeMarkerModel';
import type { RowMarker, SegmentMarker } from '../../csv/csvCodingTypes';
import type { PdfMarker } from '../../pdf/pdfCodingTypes';
import type { MediaMarker } from '../../media/mediaTypes';

export class IcrMarkerOpsImpl implements IcrMarkerOps {
	constructor(private plugin: QualiaCodingPlugin) {}

	createMarker(
		engine: EngineId,
		spec: { fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId },
	): { markerId: string } {
		if (engine === 'markdown') return this.createMarkdownMarker(spec);
		if (engine === 'csvRow') return this.createCsvRowMarker(spec);
		if (engine === 'csvSegment') return this.createCsvSegmentMarker(spec);
		if (engine === 'pdf') return this.createPdfTextMarker(spec);
		if (engine === 'audio') return this.createMediaMarker(spec, 'audio');
		if (engine === 'video') return this.createMediaMarker(spec, 'video');
		throw new Error(`engine-not-supported-in-slice: ${engine}`);
	}

	removeMarker(engine: EngineId, _fileId: string, markerId: string): void {
		if (engine === 'markdown') { this.plugin.markdownModel?.removeMarker(markerId); return; }
		if (engine === 'csvRow' || engine === 'csvSegment') { this.plugin.csvModel?.removeMarker(markerId); return; }
		if (engine === 'pdf') { this.plugin.pdfModel?.removeMarker(markerId); return; }
		if (engine === 'audio') { this.plugin.audioModel?.removeMarker(markerId); return; }
		if (engine === 'video') { this.plugin.videoModel?.removeMarker(markerId); return; }
		throw new Error(`engine-not-supported-in-slice: ${engine}`);
	}

	updateMarker(
		engine: EngineId,
		_fileId: string,
		markerId: string,
		fields: { codes?: CodeApplication[] },
	): void {
		if (!fields.codes) return;
		const newCodeIds = fields.codes.map(c => c.codeId);

		const model = this.getModelForUpdate(engine);
		if (!model) return;
		const marker = model.findMarker(markerId);
		if (!marker) return;
		const prevCodeIds = marker.codes.map(c => c.codeId);
		// Remove codes que não estão no novo set, depois adiciona os faltantes.
		for (const cid of prevCodeIds) {
			if (!newCodeIds.includes(cid)) model.removeCodeFromMarker(markerId, cid, true);
		}
		for (const cid of newCodeIds) {
			if (!prevCodeIds.includes(cid)) model.addCodeToMarker(markerId, cid);
		}
	}

	serializeMarker(engine: EngineId, fileId: string, markerId: string): MarkerSnapshot {
		const marker = this.findMarkerRaw(engine, markerId);
		return {
			markerId,
			engine,
			fileId,
			serialized: marker ? JSON.parse(JSON.stringify(marker)) : null,
		};
	}

	restoreMarker(snapshot: MarkerSnapshot): void {
		if (!snapshot.serialized) return;
		const e = snapshot.engine;
		if (e === 'markdown') { this.plugin.markdownModel?.insertMarkerRaw(snapshot.serialized as MarkdownMarker); return; }
		if (e === 'csvRow' || e === 'csvSegment') { this.plugin.csvModel?.insertMarkerRaw(snapshot.serialized as RowMarker | SegmentMarker); return; }
		if (e === 'pdf') { this.plugin.pdfModel?.insertMarkerRaw(snapshot.serialized as PdfMarker); return; }
		if (e === 'audio') { this.plugin.audioModel?.insertMarkerRaw(snapshot.serialized as MediaMarker); return; }
		if (e === 'video') { this.plugin.videoModel?.insertMarkerRaw(snapshot.serialized as MediaMarker); return; }
		throw new Error(`engine-not-supported-in-slice: ${snapshot.engine}`);
	}

	findMarkersInRegion(
		region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
	): { markerId: string; codedBy: CoderId; codes: CodeApplication[] }[] {
		if (region.engine === 'markdown' && region.bounds.kind === 'text') {
			const model = this.plugin.markdownModel;
			if (!model) return [];
			const all = model.getMarkersForFile(region.fileId);
			// regionDerivation encoda bounds em "rangeKey = line × 1M + ch" pra clustering.
			// Decodifica antes de comparar com marker ranges reais.
			const fromPos = decodeRangeKey(region.bounds.from);
			const toPos = decodeRangeKey(region.bounds.to);
			const out: { markerId: string; codedBy: CoderId; codes: CodeApplication[] }[] = [];
			for (const m of all) {
				if (rangesOverlapLineCh(m.range, { from: fromPos, to: toPos }) && m.codedBy) {
					out.push({ markerId: m.id, codedBy: m.codedBy, codes: m.codes });
				}
			}
			return out;
		}
		if (region.engine === 'csvRow' && region.bounds.kind === 'csvRow') {
			const model = this.plugin.csvModel;
			if (!model) return [];
			const matches = model.getRowMarkersForCell(region.fileId, region.bounds.rowIndex, region.bounds.column ?? '');
			return matches.filter(m => m.codedBy).map(m => ({ markerId: m.id, codedBy: m.codedBy as CoderId, codes: m.codes }));
		}
		if (region.engine === 'csvSegment' && region.bounds.kind === 'csvSegment') {
			const model = this.plugin.csvModel;
			if (!model) return [];
			const all = model.getSegmentMarkersForCell(region.fileId, region.bounds.rowIndex, region.bounds.column);
			const out: { markerId: string; codedBy: CoderId; codes: CodeApplication[] }[] = [];
			for (const m of all) {
				if (m.codedBy && rangesOverlap1D(m.from, m.to, region.bounds.from, region.bounds.to)) {
					out.push({ markerId: m.id, codedBy: m.codedBy, codes: m.codes });
				}
			}
			return out;
		}
		if (region.engine === 'pdf' && region.bounds.kind === 'pdfText') {
			const model = this.plugin.pdfModel;
			if (!model) return [];
			const all = model.getMarkersForFile(region.fileId).filter(m => m.page === (region.bounds as { page: number }).page);
			const out: { markerId: string; codedBy: CoderId; codes: CodeApplication[] }[] = [];
			for (const m of all) {
				if (m.codedBy && rangesOverlap1D(m.beginIndex, m.endIndex, region.bounds.from, region.bounds.to)) {
					out.push({ markerId: m.id, codedBy: m.codedBy, codes: m.codes });
				}
			}
			return out;
		}
		if ((region.engine === 'audio' || region.engine === 'video') && region.bounds.kind === 'temporal') {
			const model = region.engine === 'audio' ? this.plugin.audioModel : this.plugin.videoModel;
			if (!model) return [];
			const all = model.getMarkersForFile(region.fileId);
			const out: { markerId: string; codedBy: CoderId; codes: CodeApplication[] }[] = [];
			for (const m of all) {
				if (m.codedBy && rangesOverlap1D(m.from, m.to, region.bounds.fromMs, region.bounds.toMs)) {
					out.push({ markerId: m.id, codedBy: m.codedBy, codes: m.codes });
				}
			}
			return out;
		}
		throw new Error(`engine-not-supported-in-slice: ${region.engine}`);
	}

	// ── Internal helpers ──

	private findMarkerRaw(engine: EngineId, markerId: string): unknown {
		if (engine === 'markdown') return this.plugin.markdownModel?.getMarkerById(markerId);
		if (engine === 'csvRow' || engine === 'csvSegment') return this.plugin.csvModel?.findMarkerById(markerId);
		if (engine === 'pdf') return this.plugin.pdfModel?.findMarkerById(markerId);
		if (engine === 'audio') return this.plugin.audioModel?.findMarkerById(markerId);
		if (engine === 'video') return this.plugin.videoModel?.findMarkerById(markerId);
		return null;
	}

	/** Abstrai os 4 models que precisam de update de codes. Retorna interface mínima
	 *  pra evitar duplicação. PdfShape e Image (E5b) terão outro caminho. */
	private getModelForUpdate(engine: EngineId): {
		findMarker: (id: string) => { codes: CodeApplication[] } | undefined;
		addCodeToMarker: (id: string, codeId: string) => void;
		removeCodeFromMarker: (id: string, codeId: string, keepIfEmpty: boolean) => void;
	} | null {
		if (engine === 'markdown') {
			const m = this.plugin.markdownModel;
			if (!m) return null;
			return {
				findMarker: (id) => m.getMarkerById(id) ?? undefined,
				addCodeToMarker: (id, cid) => m.addCodeToMarker(id, cid),
				removeCodeFromMarker: (id, cid, k) => m.removeCodeFromMarker(id, cid, k),
			};
		}
		if (engine === 'csvRow' || engine === 'csvSegment') {
			const m = this.plugin.csvModel;
			if (!m) return null;
			return {
				findMarker: (id) => m.findMarkerById(id),
				addCodeToMarker: (id, cid) => m.addCodeToMarker(id, cid),
				removeCodeFromMarker: (id, cid, k) => m.removeCodeFromMarker(id, cid, k),
			};
		}
		if (engine === 'pdf') {
			const m = this.plugin.pdfModel;
			if (!m) return null;
			return {
				findMarker: (id) => m.findMarkerById(id),
				addCodeToMarker: (id, cid) => m.addCodeToMarker(id, cid),
				removeCodeFromMarker: (id, cid, k) => m.removeCodeFromMarker(id, cid, k),
			};
		}
		if (engine === 'audio') {
			const m = this.plugin.audioModel;
			if (!m) return null;
			return {
				findMarker: (id) => m.findMarkerById(id),
				addCodeToMarker: (id, cid) => m.addCodeToMarker(id, cid),
				removeCodeFromMarker: (id, cid, k) => m.removeCodeFromMarker(id, cid, k),
			};
		}
		if (engine === 'video') {
			const m = this.plugin.videoModel;
			if (!m) return null;
			return {
				findMarker: (id) => m.findMarkerById(id),
				addCodeToMarker: (id, cid) => m.addCodeToMarker(id, cid),
				removeCodeFromMarker: (id, cid, k) => m.removeCodeFromMarker(id, cid, k),
			};
		}
		return null;
	}

	// ── Per-engine create ──

	private createMarkdownMarker(spec: {
		fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId;
	}): { markerId: string } {
		if (spec.bounds.kind !== 'text') throw new Error('markdown-requires-text-bounds');
		const model = this.plugin.markdownModel;
		if (!model) throw new Error('markdown-model-not-loaded');

		// regionDerivation encoda bounds em "rangeKey = line × 1M + ch" pra clustering interno.
		// Decodifica direto pra line/ch — esses bounds NÃO são char offsets absolutos do source.
		const fromPos = decodeRangeKey(spec.bounds.from);
		const toPos = decodeRangeKey(spec.bounds.to);

		const id = `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
		const marker: MarkdownMarker = {
			markerType: 'markdown', id, fileId: spec.fileId,
			range: { from: fromPos, to: toPos },
			color: model.getSettings().defaultColor,
			codes: spec.codeIds.map(codeId => ({ codeId })),
			codedBy: spec.codedBy,
			createdAt: Date.now(), updatedAt: Date.now(),
		};
		model.insertMarkerRaw(marker);
		return { markerId: id };
	}

	private createCsvRowMarker(spec: {
		fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId;
	}): { markerId: string } {
		if (spec.bounds.kind !== 'csvRow') throw new Error('csvRow-requires-csvRow-bounds');
		const model = this.plugin.csvModel;
		if (!model) throw new Error('csv-model-not-loaded');

		const id = `csv-row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const marker: RowMarker = {
			markerType: 'csv', id, fileId: spec.fileId,
			sourceRowId: spec.bounds.rowIndex,
			column: spec.bounds.column ?? '',
			codes: spec.codeIds.map(codeId => ({ codeId })),
			codedBy: spec.codedBy,
			createdAt: Date.now(), updatedAt: Date.now(),
		};
		model.insertMarkerRaw(marker);
		return { markerId: id };
	}

	private createCsvSegmentMarker(spec: {
		fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId;
	}): { markerId: string } {
		if (spec.bounds.kind !== 'csvSegment') throw new Error('csvSegment-requires-csvSegment-bounds');
		const model = this.plugin.csvModel;
		if (!model) throw new Error('csv-model-not-loaded');

		const id = `csv-seg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const marker: SegmentMarker = {
			markerType: 'csv', id, fileId: spec.fileId,
			sourceRowId: spec.bounds.rowIndex,
			column: spec.bounds.column,
			from: spec.bounds.from,
			to: spec.bounds.to,
			codes: spec.codeIds.map(codeId => ({ codeId })),
			codedBy: spec.codedBy,
			createdAt: Date.now(), updatedAt: Date.now(),
		};
		model.insertMarkerRaw(marker);
		return { markerId: id };
	}

	private createPdfTextMarker(spec: {
		fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId;
	}): { markerId: string } {
		if (spec.bounds.kind !== 'pdfText') throw new Error('pdf-requires-pdfText-bounds');
		const model = this.plugin.pdfModel;
		if (!model) throw new Error('pdf-model-not-loaded');

		// PDF text usa beginIndex/endIndex como anchor — beginOffset/endOffset ficam 0
		// (markers de consensus não têm anchor span-relative; collector dá range-level coords).
		const id = `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const marker: PdfMarker = {
			markerType: 'pdf', id, fileId: spec.fileId,
			page: spec.bounds.page,
			beginIndex: spec.bounds.from,
			beginOffset: 0,
			endIndex: spec.bounds.to,
			endOffset: 0,
			text: '',
			codes: spec.codeIds.map(codeId => ({ codeId })),
			codedBy: spec.codedBy,
			createdAt: Date.now(), updatedAt: Date.now(),
		};
		model.insertMarkerRaw(marker);
		return { markerId: id };
	}

	private createMediaMarker(spec: {
		fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId;
	}, kind: 'audio' | 'video'): { markerId: string } {
		if (spec.bounds.kind !== 'temporal') throw new Error(`${kind}-requires-temporal-bounds`);
		const model = kind === 'audio' ? this.plugin.audioModel : this.plugin.videoModel;
		if (!model) throw new Error(`${kind}-model-not-loaded`);

		const id = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const marker: MediaMarker = {
			markerType: kind, id, fileId: spec.fileId,
			from: spec.bounds.fromMs,
			to: spec.bounds.toMs,
			codes: spec.codeIds.map(codeId => ({ codeId })),
			codedBy: spec.codedBy,
			createdAt: Date.now(), updatedAt: Date.now(),
		};
		model.insertMarkerRaw(marker as never);
		return { markerId: id };
	}
}

/** Decodifica o "rangeKey = line × 1M + ch" usado pelo regionDerivation pra clustering interno.
 *  Esse encoding NÃO é um char offset absoluto — é uma chave ordinal pra agrupamento. */
function decodeRangeKey(key: number): { line: number; ch: number } {
	const line = Math.floor(key / 1_000_000);
	const ch = key - line * 1_000_000;
	return { line, ch };
}

/** Overlap line/ch entre dois ranges. Compara (line, ch) lexicograficamente via rangeKey. */
function rangesOverlapLineCh(
	a: { from: { line: number; ch: number }; to: { line: number; ch: number } },
	b: { from: { line: number; ch: number }; to: { line: number; ch: number } },
): boolean {
	const aFrom = a.from.line * 1_000_000 + a.from.ch;
	const aTo = a.to.line * 1_000_000 + a.to.ch;
	const bFrom = b.from.line * 1_000_000 + b.from.ch;
	const bTo = b.to.line * 1_000_000 + b.to.ch;
	return aFrom <= bTo && aTo >= bFrom;
}

/** Overlap 1D entre dois ranges (chars/ms). Inclusivo nas pontas. */
function rangesOverlap1D(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
	return aFrom <= bTo && aTo >= bFrom;
}
