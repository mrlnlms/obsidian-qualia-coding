import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { CsvMarker } from './csvCodingTypes';
import { parseTabularFile } from './parseTabular';
import {
	DuckDBRowProvider,
	copyVaultFileToOPFS,
	isOpfsCached,
	openOPFSFile,
	opfsKeyFor,
	type TabularFileType,
} from './duckdb';

/**
 * Resolve cell text for every CSV/parquet marker — used by tabular and QDPX
 * exports.
 *
 * Strategy (covers all 6 cases of file-open × cache state):
 *   1. `csvModel.getMarkerText(m)` sync first. Hits cover:
 *      - Eager file currently open (rowDataCache populated)
 *      - Eager/lazy file pre-populated at startup (markerTextCache populated)
 *      - Lazy file currently open (lazyProvider + markerTextCache populated)
 *   2. Cache miss → group remaining markers by fileId, then per-file:
 *      - Below threshold (eager): `parseTabularFile` (handles parquet via
 *        hyparquet, CSV via papaparse) and slice cells in memory.
 *      - Above threshold (lazy): boot DuckDB temp provider against OPFS (copy
 *        if not cached, reuse if cached) and `batchGetMarkerText`. Avoids the
 *        `vault.read()` + `Papa.parse()` RAM spike (5-18× file size per the
 *        bench in `parquet-lazy-design.md` §1.2).
 *
 * Failures per file are isolated (warned, not thrown). Markers in failed files
 * end up missing from the returned map; the export then falls back to `''` per
 * the existing `csvTexts.get(m.id) ?? ''` pattern.
 */
export async function resolveExportTexts(
	plugin: QualiaCodingPlugin,
	warnings: string[],
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const csvModel = plugin.csvModel;
	if (!csvModel) return result;

	const allMarkers = csvModel.getAllMarkers();
	if (allMarkers.length === 0) return result;

	const stillNeedFetch: CsvMarker[] = [];
	for (const m of allMarkers) {
		const cached = csvModel.getMarkerText(m);
		if (cached != null) {
			result.set(m.id, cached);
		} else {
			stillNeedFetch.push(m);
		}
	}
	if (stillNeedFetch.length === 0) return result;

	const byFile = new Map<string, CsvMarker[]>();
	for (const m of stillNeedFetch) {
		const list = byFile.get(m.fileId);
		if (list) list.push(m);
		else byFile.set(m.fileId, [m]);
	}

	const csvSection = plugin.dataManager.section('csv') as
		| { settings?: { parquetSizeWarningMB?: number; csvSizeWarningMB?: number } }
		| undefined;
	const parquetMB = csvSection?.settings?.parquetSizeWarningMB ?? 50;
	const csvMB = csvSection?.settings?.csvSizeWarningMB ?? 100;
	const vaultId = plugin.app.vault.getName();

	for (const [fileId, markers] of byFile) {
		const af = plugin.app.vault.getAbstractFileByPath(fileId);
		if (!(af instanceof TFile)) {
			warnings.push(`CSV ${fileId}: file not found — markers exported with empty text`);
			continue;
		}
		const ext = af.extension;
		if (ext !== 'csv' && ext !== 'parquet') {
			warnings.push(`CSV ${fileId}: unsupported extension '.${ext}' — skipping text resolution`);
			continue;
		}
		const thresholdBytes = (ext === 'parquet' ? parquetMB : csvMB) * 1024 * 1024;
		const isHeavy = af.stat.size > thresholdBytes;

		if (!isHeavy) {
			try {
				const { rows } = await parseTabularFile(af, plugin.app.vault);
				assignFromRows(markers, rows, result);
			} catch (err) {
				warnings.push(`CSV ${fileId}: parse failed (${(err as Error).message})`);
			}
			continue;
		}

		// Heavy file → DuckDB+OPFS streaming. Boot a temporary RowProvider against
		// OPFS (copy first if not cached) and batch-query just the (sourceRow,
		// column) pairs we need. Provider disposed in the finally so the temp table
		// doesn't linger in DuckDB memory after the export finishes.
		let provider: DuckDBRowProvider | null = null;
		try {
			const opfsKey = opfsKeyFor(vaultId, fileId);
			let handle: FileSystemFileHandle;
			if (await isOpfsCached(opfsKey, af.stat.mtime).catch(() => false)) {
				handle = await openOPFSFile(opfsKey);
			} else {
				const adapter = plugin.app.vault.adapter as { getFullPath?: (p: string) => string };
				if (typeof adapter.getFullPath !== 'function') {
					warnings.push(`CSV ${fileId}: lazy export could not access the local filesystem adapter`);
					continue;
				}
				const absPath = adapter.getFullPath(fileId);
				handle = await copyVaultFileToOPFS(absPath, opfsKey, af.stat.mtime);
			}
			const runtime = await plugin.getDuckDB();
			const fileType: TabularFileType = ext === 'parquet' ? 'parquet' : 'csv';
			provider = await DuckDBRowProvider.create({ runtime, fileHandle: handle, fileType });

			// Dedupe (sourceRowId, column) — multiple markers may share a cell.
			const seen = new Set<string>();
			const refs: Array<{ sourceRowId: number; column: string }> = [];
			for (const m of markers) {
				const key = `${m.sourceRowId}|${m.column}`;
				if (seen.has(key)) continue;
				seen.add(key);
				refs.push({ sourceRowId: m.sourceRowId, column: m.column });
			}
			const texts = await provider.batchGetMarkerText(refs);
			for (const m of markers) {
				const cell = texts.get(`${m.sourceRowId}|${m.column}`);
				if (cell == null) continue;
				const text = ('from' in m && 'to' in m) ? cell.substring(m.from, m.to) : cell;
				result.set(m.id, text);
			}
		} catch (err) {
			warnings.push(`CSV ${fileId}: lazy export query failed (${(err as Error).message})`);
		} finally {
			if (provider) {
				await provider.dispose().catch(() => undefined);
			}
		}
	}

	return result;
}

function assignFromRows(
	markers: CsvMarker[],
	rows: Record<string, unknown>[],
	out: Map<string, string>,
): void {
	for (const m of markers) {
		const row = rows[m.sourceRowId];
		if (!row) continue;
		const raw = row[m.column];
		if (raw == null) continue;
		const cell = String(raw);
		const text = ('from' in m && 'to' in m) ? cell.substring(m.from, m.to) : cell;
		out.set(m.id, text);
	}
}
