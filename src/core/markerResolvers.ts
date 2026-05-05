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

export function getMarkerLabel(marker: BaseMarker, mdModel: CodeMarkerModel | null, maxLength = 60): string {
	if (isPdfMarker(marker)) {
		if (marker.isShape && marker.shapeLabel) return marker.shapeLabel;
		const text = marker.text;
		if (text) return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
		return `Page ${marker.page}`;
	}
	if (isImageMarker(marker)) {
		// Adapter view fornece shapeLabel computado; engine raw (SC cache) tem só `shape`. Fallback inline.
		if (marker.shapeLabel) return marker.shapeLabel;
		const shape = (marker as { shape?: string }).shape;
		return shape ? `${shape.charAt(0).toUpperCase()}${shape.slice(1)} region` : 'Image region';
	}
	if (isCsvMarker(marker)) {
		if (marker.markerText) {
			return marker.markerText.length > maxLength ? marker.markerText.substring(0, maxLength) + '...' : marker.markerText;
		}
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
	if (!mdModel) return md.text ? (md.text.length > maxLength ? md.text.substring(0, maxLength) + '...' : md.text) : `Line ${md.range.from.line + 1}`;
	const view = mdModel.getViewForFile(md.fileId);
	if (!view?.editor) {
		if (md.text) return md.text.length > maxLength ? md.text.substring(0, maxLength) + '...' : md.text;
		return `Line ${md.range.from.line + 1}`;
	}
	try {
		const text = view.editor.getRange(md.range.from, md.range.to);
		return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
	} catch {
		if (md.text) return md.text.length > maxLength ? md.text.substring(0, maxLength) + '...' : md.text;
		return `Line ${md.range.from.line + 1}`;
	}
}

// ── Path helper ──────────────────────────────────────────────

export function shortenPath(fileId: string): string {
	const parts = fileId.split('/');
	const name = parts[parts.length - 1] ?? fileId;
	return name.replace(/\.(md|pdf|csv|parquet|png|jpg|jpeg|gif|bmp|webp|avif|svg|mp3|m4a|wav|ogg|flac|aac|wma|aiff|opus|webm|mp4|ogv)$/i, '');
}
