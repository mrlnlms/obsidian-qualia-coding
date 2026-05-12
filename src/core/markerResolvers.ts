/**
 * Shared type guards, label resolvers, and path helpers for unified sidebar views.
 * Extracted from unifiedExplorerView.ts and unifiedDetailView.ts to eliminate duplication.
 */

import type { BaseMarker } from './types';
import type { CodeMarkerModel, Marker } from '../markdown/models/codeMarkerModel';
import type { PdfBaseMarker } from '../pdf/views/pdfSidebarAdapter';
import type { ImageBaseMarker } from '../image/views/imageSidebarAdapter';
import type { CsvBaseMarker } from '../csv/views/csvSidebarAdapter';
import type { AudioBaseMarker } from '../audio/views/audioSidebarAdapter';
import type { VideoBaseMarker } from '../video/views/videoSidebarAdapter';
import type { MediaBaseMarker } from '../media/mediaSidebarAdapter';
import { formatTime } from '../media/formatTime';

// ── Type guards ──────────────────────────────────────────────

export function isPdfMarker(marker: BaseMarker): marker is PdfBaseMarker {
	return marker.markerType === 'pdf';
}

export function isImageMarker(marker: BaseMarker): marker is ImageBaseMarker {
	return marker.markerType === 'image';
}

export function isCsvMarker(marker: BaseMarker): marker is CsvBaseMarker {
	return marker.markerType === 'csv';
}

export function isAudioMarker(marker: BaseMarker): marker is AudioBaseMarker {
	return marker.markerType === 'audio';
}

export function isVideoMarker(marker: BaseMarker): marker is VideoBaseMarker {
	return marker.markerType === 'video';
}

// ── Label resolver ───────────────────────────────────────────

/**
 * Trim + check empty + truncate. Centraliza a regra "se o text é só whitespace,
 * caia no fallback de coordenada". `null` retorno = caller deve usar fallback.
 */
export function previewText(s: string | null | undefined, maxLength: number): string | null {
	if (s == null) return null;
	const trimmed = s.trim();
	if (trimmed.length === 0) return null;
	return trimmed.length > maxLength ? trimmed.substring(0, maxLength) + '...' : trimmed;
}

export function getMarkerLabel(marker: BaseMarker, mdModel: CodeMarkerModel | null, maxLength = 60): string {
	if (isPdfMarker(marker)) {
		if (marker.isShape && marker.shapeLabel) return marker.shapeLabel;
		const preview = previewText(marker.text, maxLength);
		if (preview) return preview;
		return `Page ${marker.page}`;
	}
	if (isImageMarker(marker)) {
		// Adapter view fornece shapeLabel computado; engine raw (SC cache) tem só `shape`. Fallback inline.
		// Formato alinhado com PDF (`Page N`) / CSV (`Row N · column`): tipo capitalized sucinto.
		if (marker.shapeLabel) return marker.shapeLabel;
		const shape = (marker as { shape?: string }).shape;
		return shape ? `${shape.charAt(0).toUpperCase()}${shape.slice(1)}` : 'Region';
	}
	if (isCsvMarker(marker)) {
		const preview = previewText(marker.markerText, maxLength);
		if (preview) return preview;
		if (marker.markerLabel) return marker.markerLabel;
		// Engine raw tem sourceRowId+column; markerLabel é computado pelo adapter.
		const raw = marker as { sourceRowId?: number; column?: string };
		return `Row ${raw.sourceRowId ?? '?'} · ${raw.column ?? ''}`;
	}
	if (isAudioMarker(marker) || isVideoMarker(marker)) {
		if (marker.markerLabel) return marker.markerLabel;
		// Engine raw MediaMarker tem from/to (segundos); adapter view tem startTime/endTime.
		const raw = marker as { startTime?: number; endTime?: number; from?: number; to?: number };
		const start = raw.startTime ?? raw.from ?? 0;
		const end = raw.endTime ?? raw.to ?? 0;
		return `${formatTime(start)} → ${formatTime(end)}`;
	}
	// Markdown
	const md = marker as Marker;
	const fallback = `Line ${md.range.from.line + 1}`;
	if (!mdModel) return previewText(md.text, maxLength) ?? fallback;
	const view = mdModel.getViewForFile(md.fileId);
	if (!view?.editor) return previewText(md.text, maxLength) ?? fallback;
	try {
		const text = view.editor.getRange(md.range.from, md.range.to);
		return previewText(text, maxLength) ?? previewText(md.text, maxLength) ?? fallback;
	} catch {
		return previewText(md.text, maxLength) ?? fallback;
	}
}

/**
 * Texto pesquisável do marker — sem truncar. Usado pelo leaf `textContains` do Smart Code
 * evaluator. Por engine: markdown/pdf-text usa `marker.text` (cacheado), csv usa
 * `marker.markerText` (texto da célula/segmento), media/image caem em `markerLabel`/`shapeLabel`
 * porque não há source-text indexável por marker. Retorna `''` quando não há texto disponível
 * (engine bbox, marker memo-only) — caller trata como "não casa nada" naturalmente.
 */
export function getMarkerSearchableText(marker: BaseMarker): string {
	if (isPdfMarker(marker)) return marker.text ?? '';
	if (isImageMarker(marker)) return marker.shapeLabel ?? '';
	if (isCsvMarker(marker)) return marker.markerText ?? '';
	if (isAudioMarker(marker) || isVideoMarker(marker)) return marker.markerLabel ?? '';
	return (marker as Marker).text ?? '';
}

// ── Path helper ──────────────────────────────────────────────

export function shortenPath(fileId: string): string {
	const parts = fileId.split('/');
	const name = parts[parts.length - 1] ?? fileId;
	return name.replace(/\.(md|pdf|csv|parquet|png|jpg|jpeg|gif|bmp|webp|avif|svg|mp3|m4a|wav|ogg|flac|aac|wma|aiff|opus|webm|mp4|ogv)$/i, '');
}
