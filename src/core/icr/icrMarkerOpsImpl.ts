/**
 * IcrMarkerOpsImpl — implementação concreta de IcrMarkerOps wrappando os engine models.
 *
 * Slice E3a Fase 1 cobre:
 *   - markdown (bounds.kind = 'text', char offsets sobre o file content)
 *   - csvRow (bounds.kind = 'csvRow', sourceRowId + column)
 *
 * Pendente em slices futuras (lança 'engine-not-supported-in-slice'):
 *   - pdf-text (precisa page + spans específicos do span layout — bounds 'text' insuficiente)
 *   - csv-segment (precisa sourceRowId + column + from/to — bounds 'text' insuficiente)
 *   - audio/video (Fase 2)
 *   - pdfShape/image (bbox — frente paralela)
 */

import type { IcrMarkerOps } from './markerOps';
import type { CodeApplication, MarkerSnapshot, ReconciliationBounds } from '../types';
import type { CoderId } from './coderTypes';
import type { EngineId } from './reporter';
import type QualiaCodingPlugin from '../../main';
import type { Marker as MarkdownMarker } from '../../markdown/models/codeMarkerModel';
import type { RowMarker, SegmentMarker } from '../../csv/csvCodingTypes';

export class IcrMarkerOpsImpl implements IcrMarkerOps {
	constructor(private plugin: QualiaCodingPlugin) {}

	createMarker(
		engine: EngineId,
		spec: { fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId },
	): { markerId: string } {
		if (engine === 'markdown') {
			return this.createMarkdownMarker(spec);
		}
		if (engine === 'csvRow') {
			return this.createCsvRowMarker(spec);
		}
		throw new Error(`engine-not-supported-in-slice: ${engine}`);
	}

	removeMarker(engine: EngineId, _fileId: string, markerId: string): void {
		if (engine === 'markdown') {
			this.plugin.markdownModel?.removeMarker(markerId);
			return;
		}
		if (engine === 'csvRow' || engine === 'csvSegment') {
			this.plugin.csvModel?.removeMarker(markerId);
			return;
		}
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

		if (engine === 'markdown') {
			const model = this.plugin.markdownModel;
			if (!model) return;
			const marker = model.getMarkerById(markerId);
			if (!marker) return;
			const prevCodeIds = marker.codes.map(c => c.codeId);
			// Remove codes que não estão no novo set, depois adiciona os faltantes.
			for (const cid of prevCodeIds) {
				if (!newCodeIds.includes(cid)) model.removeCodeFromMarker(markerId, cid, true);
			}
			for (const cid of newCodeIds) {
				if (!prevCodeIds.includes(cid)) model.addCodeToMarker(markerId, cid);
			}
			return;
		}
		if (engine === 'csvRow' || engine === 'csvSegment') {
			const model = this.plugin.csvModel;
			if (!model) return;
			const marker = model.findMarkerById(markerId);
			if (!marker) return;
			const prevCodeIds = marker.codes.map(c => c.codeId);
			for (const cid of prevCodeIds) {
				if (!newCodeIds.includes(cid)) model.removeCodeFromMarker(markerId, cid, true);
			}
			for (const cid of newCodeIds) {
				if (!prevCodeIds.includes(cid)) model.addCodeToMarker(markerId, cid);
			}
			return;
		}
		throw new Error(`engine-not-supported-in-slice: ${engine}`);
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
		if (snapshot.engine === 'markdown') {
			this.plugin.markdownModel?.insertMarkerRaw(snapshot.serialized as MarkdownMarker);
			return;
		}
		if (snapshot.engine === 'csvRow' || snapshot.engine === 'csvSegment') {
			this.plugin.csvModel?.insertMarkerRaw(snapshot.serialized as RowMarker | SegmentMarker);
			return;
		}
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
				if (rangesOverlapLineCh(m.range, { from: fromPos, to: toPos })) {
					if (m.codedBy) {
						out.push({ markerId: m.id, codedBy: m.codedBy, codes: m.codes });
					}
				}
			}
			return out;
		}
		if (region.engine === 'csvRow' && region.bounds.kind === 'csvRow') {
			const model = this.plugin.csvModel;
			if (!model) return [];
			const matches = model.getRowMarkersForCell(region.fileId, region.bounds.rowIndex, region.bounds.column ?? '');
			return matches
				.filter(m => m.codedBy)
				.map(m => ({ markerId: m.id, codedBy: m.codedBy as CoderId, codes: m.codes }));
		}
		throw new Error(`engine-not-supported-in-slice: ${region.engine}`);
	}

	// ── Internal helpers ──

	private findMarkerRaw(engine: EngineId, markerId: string): unknown {
		if (engine === 'markdown') return this.plugin.markdownModel?.getMarkerById(markerId);
		if (engine === 'csvRow' || engine === 'csvSegment') return this.plugin.csvModel?.findMarkerById(markerId);
		return null;
	}

	private createMarkdownMarker(spec: {
		fileId: string;
		bounds: ReconciliationBounds;
		codeIds: string[];
		codedBy: CoderId;
	}): { markerId: string } {
		if (spec.bounds.kind !== 'text') {
			throw new Error('markdown-requires-text-bounds');
		}
		const model = this.plugin.markdownModel;
		if (!model) throw new Error('markdown-model-not-loaded');

		// regionDerivation encoda bounds em "rangeKey = line × 1M + ch" pra clustering interno.
		// Decodifica direto pra line/ch — esses bounds NÃO são char offsets absolutos do source.
		const fromPos = decodeRangeKey(spec.bounds.from);
		const toPos = decodeRangeKey(spec.bounds.to);

		const id = `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
		const marker: MarkdownMarker = {
			markerType: 'markdown',
			id,
			fileId: spec.fileId,
			range: { from: fromPos, to: toPos },
			color: model.getSettings().defaultColor,
			codes: spec.codeIds.map(codeId => ({ codeId })),
			codedBy: spec.codedBy,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		model.insertMarkerRaw(marker);
		return { markerId: id };
	}

	private createCsvRowMarker(spec: {
		fileId: string;
		bounds: ReconciliationBounds;
		codeIds: string[];
		codedBy: CoderId;
	}): { markerId: string } {
		if (spec.bounds.kind !== 'csvRow') {
			throw new Error('csvRow-requires-csvRow-bounds');
		}
		const model = this.plugin.csvModel;
		if (!model) throw new Error('csv-model-not-loaded');

		const id = `csv-row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const marker: RowMarker = {
			markerType: 'csv',
			id,
			fileId: spec.fileId,
			sourceRowId: spec.bounds.rowIndex,
			column: spec.bounds.column ?? '',
			codes: spec.codeIds.map(codeId => ({ codeId })),
			codedBy: spec.codedBy,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		model.insertMarkerRaw(marker);
		return { markerId: id };
	}

	/** Acessa editor da MarkdownView pra converter offset ↔ line/ch. */
	private findEditorForFile(fileId: string): {
		offsetToPos: (offset: number) => { line: number; ch: number };
		posToOffset: (pos: { line: number; ch: number }) => number;
	} | null {
		const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			const view = leaf.view as { file?: { path: string }; editor?: { offsetToPos: (n: number) => { line: number; ch: number }; posToOffset: (p: { line: number; ch: number }) => number } };
			if (view.file?.path === fileId && view.editor) return view.editor;
		}
		return null;
	}

	private markerToOffsets(
		marker: MarkdownMarker,
		editor: { posToOffset: (p: { line: number; ch: number }) => number },
	): { from: number; to: number } | null {
		try {
			return { from: editor.posToOffset(marker.range.from), to: editor.posToOffset(marker.range.to) };
		} catch {
			return null;
		}
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
