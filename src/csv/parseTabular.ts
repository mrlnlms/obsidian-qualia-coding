import type { TFile, Vault } from 'obsidian';
import * as Papa from 'papaparse';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

export interface TabularData {
	headers: string[];
	rows: Record<string, any>[];
}

export async function parseTabularFile(file: TFile, vault: Vault): Promise<TabularData> {
	if (file.extension === 'parquet') {
		const buffer = await vault.adapter.readBinary(file.path);
		const rows = await parquetReadObjects({ file: buffer, compressors }) as Record<string, any>[];
		const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
		return { headers, rows };
	}
	const raw = await vault.read(file);
	const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve) => {
		Papa.parse<Record<string, string>>(raw, {
			header: true,
			skipEmptyLines: true,
			worker: true,
			complete: resolve,
		});
	});
	// Don't throw on `parsed.errors`. Papaparse populates `errors` for non-fatal
	// conditions too — e.g. "Unable to auto-detect delimiting character" on a
	// 1-line file is just a warning that it defaulted to comma, not a failure.
	// Callers gate on headers/rows: `loadEagerPath` shows "No columns found."
	// when headers is empty; `prepopulateMarkerCaches` iterates zero markers
	// and moves on. Any real fatal failure would have rejected the Promise.
	return { headers: parsed.meta.fields ?? [], rows: parsed.data };
}
