import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { CsvCodingModel } from './csvCodingModel';
import { parseTabularFile } from './parseTabular';

/**
 * Background pre-populate of CSV/parquet marker caches on plugin startup.
 *
 * Runs after `onLayoutReady` so it doesn't race plugin init. For each file with
 * markers in `data.json`:
 *   - Below threshold (eager): if any marker lacks a preview, read + parse the
 *     file and cache the cell excerpts in `markerTextCache`. `rowDataCache` stays
 *     untouched — view's `onLoadFile` populates it when the user actually opens
 *     the file. Symmetric with lazy: only excerpts (~60 chars/marker) live in
 *     memory between sessions, not full row sets.
 *   - Above threshold (lazy): only populate if OPFS already has a fresh copy.
 *     Never forces a download — files the user hasn't opened in this session
 *     stay uncached until they actually open the view. If cached, boot DuckDB,
 *     open the handle, and call `populateMissingMarkerTextsForFile`.
 *
 * Sidebars/detail views re-render once at the end via `notifyListenersOnly`
 * (no data.json write — caches are derived state).
 *
 * Failures are logged and isolated per file.
 */
export async function prepopulateMarkerCaches(
	plugin: QualiaCodingPlugin,
	csvModel: CsvCodingModel,
): Promise<void> {
	const fileIds = csvModel.getAllFileIds();
	if (fileIds.length === 0) return;

	const csvSection = plugin.dataManager.section('csv') as
		| { settings?: { parquetSizeWarningMB?: number; csvSizeWarningMB?: number } }
		| undefined;
	const parquetMB = csvSection?.settings?.parquetSizeWarningMB ?? 50;
	const csvMB = csvSection?.settings?.csvSizeWarningMB ?? 100;

	let touched = false;

	for (const fileId of fileIds) {
		const af = plugin.app.vault.getAbstractFileByPath(fileId);
		if (!(af instanceof TFile)) continue;
		const ext = af.extension;
		if (ext !== 'csv' && ext !== 'parquet') continue;

		const sizeBytes = af.stat.size;
		const thresholdBytes = (ext === 'parquet' ? parquetMB : csvMB) * 1024 * 1024;
		const isHeavy = sizeBytes > thresholdBytes;

		if (!isHeavy) {
			const markers = csvModel.getMarkersForFile(fileId);
			const needsParse = markers.some(m => csvModel.getMarkerText(m) == null);
			if (!needsParse) continue;
			try {
				const { rows } = await parseTabularFile(af, plugin.app.vault);
				for (const m of markers) {
					if (csvModel.getMarkerText(m) != null) continue;
					const row = rows[m.sourceRowId];
					if (!row) continue;
					const rawValue = row[m.column];
					if (rawValue == null) continue;
					const cellText = String(rawValue);
					const text = ('from' in m && 'to' in m)
						? cellText.substring(m.from, m.to)
						: cellText;
					csvModel.cacheMarkerText(m.id, text);
					touched = true;
				}
			} catch (err) {
				console.warn('[qualia-csv prepopulate] eager parse failed', fileId, err);
			}
			// Eager file: cache populated. Marca seen pro hydrator não revisitar
			// (hydrator faria isLazyFile=false → skipped, mas markSeen short-circuita o lookup).
			plugin.markerPreviewHydrator?.markSeen(fileId);
		}
		// Lazy path REMOVIDO: hydrator é a única autoridade sobre OPFS lazy. Sem isso,
		// prepopulate e hydrator podiam criar 2 DuckDBRowProvider concorrentes pro mesmo
		// fileId, causando "Access Handles cannot be created" do OPFS (2026-05-06).
		// Hydrator dispara batch quando Code Explorer/Detail/Smart Code/Memo View renderiza —
		// cobertura equivalente, sem race condition.
	}

	if (touched) csvModel.notifyListenersOnly();
}
