import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { zipSync, strToU8 } from 'fflate';
import Papa from 'papaparse';
import type { DataManager } from '../../core/dataManager';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import { toCsv } from './csvWriter';
import { buildSegmentsTable } from './buildSegmentsTable';
import { buildCodeApplicationsTable } from './buildCodeApplicationsTable';
import { buildCodesTable } from './buildCodesTable';
import { buildCaseVariablesTable } from './buildCaseVariablesTable';
import { buildRelationsTable } from './buildRelationsTable';
import { buildReadme } from './readmeBuilder';

export interface TabularExportOptions {
	fileName: string;
	includeRelations: boolean;
	includeShapeCoords: boolean;
	pluginVersion: string;
}

export interface TabularExportResult {
	fileName: string;
	data: Uint8Array;
	warnings: string[];
}

/** Realm-safe wrapper — fflate's `instanceof Uint8Array` check fails across
 *  realms in Electron/Obsidian. Matches the pattern in `qdpxExporter.ts:437`. */
const toU8 = (buf: Uint8Array): Uint8Array => new Uint8Array(buf);

export async function exportTabular(
	app: App,
	dm: DataManager,
	registry: CodeDefinitionRegistry,
	opts: TabularExportOptions,
): Promise<TabularExportResult> {
	const warnings: string[] = [];

	const csvTexts = await resolveCsvTexts(app, dm, warnings);

	const segments = buildSegmentsTable(dm, csvTexts, { includeShapeCoords: opts.includeShapeCoords });
	warnings.push(...segments.warnings);

	const apps = buildCodeApplicationsTable(dm, registry);
	warnings.push(...apps.warnings);

	const codesRows = buildCodesTable(registry);

	const caseVars = buildCaseVariablesTable(dm);
	warnings.push(...caseVars.warnings);

	const files: Record<string, Uint8Array> = {
		'segments.csv': toU8(strToU8(toCsv(segments.rows))),
		'code_applications.csv': toU8(strToU8(toCsv(apps.rows))),
		'codes.csv': toU8(strToU8(toCsv(codesRows))),
		'case_variables.csv': toU8(strToU8(toCsv(caseVars.rows))),
	};

	if (opts.includeRelations) {
		const rel = buildRelationsTable(dm, registry);
		warnings.push(...rel.warnings);
		files['relations.csv'] = toU8(strToU8(toCsv(rel.rows)));
	}

	files['README.md'] = toU8(strToU8(buildReadme({
		pluginVersion: opts.pluginVersion,
		includeRelations: opts.includeRelations,
		includeShapeCoords: opts.includeShapeCoords,
		warnings,
	})));

	return {
		fileName: opts.fileName,
		data: zipSync(files),
		warnings,
	};
}

async function resolveCsvTexts(app: App, dm: DataManager, warnings: string[]): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const csv = dm.section('csv');
	const fileIds = new Set<string>();
	for (const m of csv.segmentMarkers) fileIds.add(m.fileId);
	for (const m of csv.rowMarkers) fileIds.add(m.fileId);

	for (const fileId of fileIds) {
		const abstractFile = app.vault.getAbstractFileByPath(fileId);
		if (!(abstractFile instanceof TFile)) {
			warnings.push(`CSV ${fileId}: cannot read source for text resolution (file not found)`);
			continue;
		}
		let content: string;
		try {
			content = await app.vault.read(abstractFile);
		} catch (err) {
			warnings.push(`CSV ${fileId}: cannot read source for text resolution (${(err as Error).message})`);
			continue;
		}
		const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
		if (parsed.data.length === 0 && parsed.errors.length > 0) {
			warnings.push(`CSV ${fileId}: parse failed (${parsed.errors[0]!.message}) — skipping text resolution`);
			continue;
		}
		for (const m of csv.segmentMarkers) {
			if (m.fileId !== fileId) continue;
			const cell = parsed.data[m.row]?.[m.column] ?? '';
			result.set(m.id, cell.slice(m.from, m.to));
		}
		for (const m of csv.rowMarkers) {
			if (m.fileId !== fileId) continue;
			const cell = parsed.data[m.row]?.[m.column] ?? '';
			result.set(m.id, cell);
		}
	}

	return result;
}
