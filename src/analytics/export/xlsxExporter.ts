/**
 * xlsxExporter — exporta TODAS as análises do Analytics como single .xlsx multi-tab.
 *
 * Reusa os builders puros `buildXxxRows` extraídos de cada mode. Modes async (com
 * extração de texto / cálculo MCA/MDS) também têm builders Promise-based.
 *
 * Modes sem dados (filtros eliminam tudo) viram aba vazia ou são puladas.
 */

import { Notice } from "obsidian";
import writeXlsxFile from "write-excel-file/browser";
import type { AnalyticsViewContext } from "../views/analyticsViewContext";

import { buildFrequencyRows } from "../views/modes/frequencyMode";
import { buildCooccurrenceRows } from "../views/modes/cooccurrenceMode";
import { buildGraphRows } from "../views/modes/graphMode";
import { buildDocMatrixRows } from "../views/modes/docMatrixMode";
import { buildEvolutionRows } from "../views/modes/evolutionMode";
import { buildWordCloudRows } from "../views/modes/wordCloudMode";
import { buildACMRows } from "../views/modes/acmMode";
import { buildMDSRows } from "../views/modes/mdsMode";
import { buildTemporalRows } from "../views/modes/temporalMode";
import { buildTextStatsRows } from "../views/modes/textStatsMode";
import { buildDendrogramRows } from "../views/modes/dendrogramMode";
import { buildLagRows } from "../views/modes/lagSequentialMode";
import { buildPolarRows } from "../views/modes/polarMode";
import { buildChiSquareRows } from "../views/modes/chiSquareMode";
import { buildDecisionTreeRows } from "../views/modes/decisionTreeMode";
import { buildSourceComparisonRows } from "../views/modes/sourceComparisonMode";
import { buildOverlapRows } from "../views/modes/overlapMode";
import { buildRelationsNetworkRows } from "../views/modes/relationsNetworkMode";
import { buildCodeMetadataRows } from "../views/modes/codeMetadataMode";
import { buildMemoExportRows } from "../views/modes/memoView/exportMemoCSV";

interface SheetSpec {
	name: string;          // Excel limita a 31 chars
	rows: string[][] | null;
}

/** Trunca pra 31 chars (limite do Excel pra sheet name). */
function safeSheetName(name: string): string {
	const cleaned = name.replace(/[\\/?*[\]:]/g, '_');  // chars proibidos em sheet names
	return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
}

/** Converte string[][] no formato esperado pelo write-excel-file. */
function rowsToXlsxData(rows: string[][]): Array<Array<{ value: string; type: typeof String }>> {
	return rows.map(row => row.map(cell => ({ value: cell ?? '', type: String })));
}

export async function exportAllToXlsx(ctx: AnalyticsViewContext, date: string): Promise<void> {
	new Notice("Building XLSX (this may take a moment for word cloud / MCA / MDS)...");

	// Sync builders
	const syncSpecs: SheetSpec[] = [
		{ name: "Frequency", rows: buildFrequencyRows(ctx) },
		{ name: "Co-occurrence", rows: buildCooccurrenceRows(ctx) },
		{ name: "Network Graph", rows: buildGraphRows(ctx) },
		{ name: "Doc-Code Matrix", rows: buildDocMatrixRows(ctx) },
		{ name: "Code Evolution", rows: buildEvolutionRows(ctx) },
		{ name: "Temporal", rows: buildTemporalRows(ctx) },
		{ name: "Dendrogram", rows: buildDendrogramRows(ctx) },
		{ name: "Lag Sequential", rows: buildLagRows(ctx) },
		{ name: "Polar Coords", rows: buildPolarRows(ctx) },
		{ name: "Chi-Square", rows: buildChiSquareRows(ctx) },
		{ name: "Decision Tree", rows: buildDecisionTreeRows(ctx) },
		{ name: "Source Comparison", rows: buildSourceComparisonRows(ctx) },
		{ name: "Code Overlap", rows: buildOverlapRows(ctx) },
		{ name: "Relations Network", rows: buildRelationsNetworkRows(ctx) },
		{ name: "Code Metadata", rows: buildCodeMetadataRows(ctx) },
		{ name: "Memos", rows: buildMemoExportRows(ctx) },
	];

	// Async builders (text extraction / heavy compute)
	const [wordCloud, acm, mds, textStats] = await Promise.all([
		buildWordCloudRows(ctx).catch(() => null),
		buildACMRows(ctx).catch(() => null),
		buildMDSRows(ctx).catch(() => null),
		buildTextStatsRows(ctx).catch(() => null),
	]);

	const asyncSpecs: SheetSpec[] = [
		{ name: "Word Cloud", rows: wordCloud },
		{ name: "MCA Biplot", rows: acm },
		{ name: "MDS Map", rows: mds },
		{ name: "Text Statistics", rows: textStats },
	];

	const allSpecs = [...syncSpecs, ...asyncSpecs];

	// Filtra abas vazias (rows null = mode sem dados / config inválida)
	const validSpecs = allSpecs.filter(s => s.rows && s.rows.length > 0);

	if (validSpecs.length === 0) {
		new Notice("No data to export — check your filters.");
		return;
	}

	const sheets = validSpecs.map(s => ({
		data: rowsToXlsxData(s.rows!),
		sheet: safeSheetName(s.name),
	}));

	const result = await writeXlsxFile(sheets);
	const blob = await result.toBlob();

	const link = document.createElement('a');
	link.download = `qualia-analytics-${date}.xlsx`;
	link.href = URL.createObjectURL(blob);
	link.click();
	URL.revokeObjectURL(link.href);

	new Notice(`Exported ${validSpecs.length} sheets to qualia-analytics-${date}.xlsx`);
}
