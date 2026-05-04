import { FileSystemAdapter, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { CsvCodingModel } from './csvCodingModel';
import { parseTabularFile } from './parseTabular';
import {
	DuckDBRowProvider,
	isOpfsCached,
	openOPFSFile,
	opfsKeyFor,
	type TabularFileType,
} from './duckdb';

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

	const adapter = plugin.app.vault.adapter;
	const vaultId = (plugin.app.vault as unknown as { getName: () => string }).getName?.() ?? 'default';

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
			continue;
		}

		// Lazy path: only populate if OPFS already has a fresh copy. Forcing a
		// download here would defeat the "background, no surprise IO" promise.
		if (!(adapter instanceof FileSystemAdapter)) continue;
		const opfsKey = opfsKeyFor(vaultId, fileId);
		const cached = await isOpfsCached(opfsKey, af.stat.mtime).catch(() => false);
		if (!cached) continue;

		let provider: DuckDBRowProvider | null = null;
		try {
			const handle = await openOPFSFile(opfsKey);
			const runtime = await plugin.getDuckDB();
			const fileType: TabularFileType = ext === 'parquet' ? 'parquet' : 'csv';
			provider = await DuckDBRowProvider.create({ runtime, fileHandle: handle, fileType });
			const added = await csvModel.populateMissingMarkerTextsForFile(fileId, provider);
			if (added > 0) touched = true;
		} catch (err) {
			console.warn('[qualia-csv prepopulate] lazy populate failed', fileId, err);
		} finally {
			if (provider) {
				await provider.dispose().catch(() => undefined);
			}
		}
	}

	if (touched) csvModel.notifyListenersOnly();
}
