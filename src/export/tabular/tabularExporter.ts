import { zipSync, strToU8 } from 'fflate';
import type { DataManager } from '../../core/dataManager';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type QualiaCodingPlugin from '../../main';
import { resolveExportTexts } from '../../csv/resolveExportTexts';
import { toCsv } from './csvWriter';
import { buildSegmentsTable } from './buildSegmentsTable';
import { buildCodeApplicationsTable } from './buildCodeApplicationsTable';
import { buildCodesTable } from './buildCodesTable';
import { buildGroupsTable } from './buildGroupsTable';
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
	plugin: QualiaCodingPlugin,
	dm: DataManager,
	registry: CodeDefinitionRegistry,
	opts: TabularExportOptions,
): Promise<TabularExportResult> {
	const warnings: string[] = [];

	const csvTexts = await resolveExportTexts(plugin, warnings);

	const segments = buildSegmentsTable(dm, csvTexts, { includeShapeCoords: opts.includeShapeCoords });
	warnings.push(...segments.warnings);

	const apps = buildCodeApplicationsTable(dm, registry);
	warnings.push(...apps.warnings);

	const codesRows = buildCodesTable(registry);
	const groupsRows = buildGroupsTable(registry);

	const caseVars = buildCaseVariablesTable(dm);
	warnings.push(...caseVars.warnings);

	const files: Record<string, Uint8Array> = {
		'segments.csv': toU8(strToU8(toCsv(segments.rows))),
		'code_applications.csv': toU8(strToU8(toCsv(apps.rows))),
		'codes.csv': toU8(strToU8(toCsv(codesRows))),
		'groups.csv': toU8(strToU8(toCsv(groupsRows))),
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

