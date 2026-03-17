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
		return marker.shapeLabel;
	}
	if (isCsvMarker(marker)) {
		if (marker.markerText) {
			return marker.markerText.length > maxLength ? marker.markerText.substring(0, maxLength) + '...' : marker.markerText;
		}
		return marker.markerLabel;
	}
	if (isAudioMarker(marker)) {
		return marker.markerLabel;
	}
	if (isVideoMarker(marker)) {
		return marker.markerLabel;
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
