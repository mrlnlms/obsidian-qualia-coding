/**
 * Export "Parquet enriquecido": parquet original + colunas virtuais (cod-frow,
 * cod-seg, comment) concatenadas como `;`-separated strings ou texto livre.
 *
 * Reusa a temp table `qualia_markers_<id>` da view ativa (lazy mode). Não
 * mutaciona o parquet original — produz arquivo derivado adjacente no vault.
 *
 * Strategy:
 *   - Code names pré-resolvidos JS-side: registry.getAll() gera CASE WHEN inline.
 *     Evita materializar tabela de code definitions em DuckDB (registry é
 *     pequeno, ~500 codes max típico, e CASE compacta legível).
 *   - SQL COPY ... TO ... (FORMAT PARQUET ZSTD) escreve no buffer virtual do
 *     DuckDB; bytes lidos via copyFileToBuffer + escritos no vault.
 *   - Single-pass aggregate JOIN: SELECT p.*, <subquery por virtual col>
 *     evita materializar resultado intermediário.
 *
 * Naming columns: `<sourceCol>__codes_frow`, `<sourceCol>__codes_seg`,
 * `<sourceCol>__comment`. Double underscore por compat downstream
 * (alguns tools rejeitam hyphens em parquet column names).
 */

import { Notice, type App, type TFile } from "obsidian";
import type QualiaCodingPlugin from "../main";
import { CsvCodingView, CSV_CODING_VIEW_TYPE } from "./csvCodingView";
import type { CodeDefinitionRegistry } from "../core/codeDefinitionRegistry";

/**
 * Heurística pra detectar erro de OOM do DuckDB-Wasm worker. Match em mensagens
 * conhecidas: "Out of Memory" / "Allocation failure" / "memory access out of bounds".
 * Usado pelo wrapper de export pra ativar fallback multi-file automaticamente.
 *
 * Não é um classifier completo de erros — outros tipos de erro do DuckDB
 * (SQL inválido, file not found etc.) NÃO devem matchar e propagam normalmente.
 */
export function isOOMError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return /Out of Memory|Allocation failure|memory access out of bounds/i.test(err.message);
}

function quoteString(v: string): string {
	return `'${v.replace(/'/g, "''")}'`;
}

function quoteIdent(v: string): string {
	return `"${v.replace(/"/g, '""')}"`;
}

/**
 * CASE WHEN inline pra resolver code_id → name dentro do SQL. Default = code_id
 * (preserva ID se o code foi deletado mas marker ainda persiste — degradação
 * graceful em vez de NULL silencioso).
 */
function buildCodeNameCase(registry: CodeDefinitionRegistry, idCol: string): string {
	const all = registry.getAll();
	if (all.length === 0) return idCol;  // sem codes definidos — passa o id direto
	const cases = all
		.map((d) => `WHEN ${quoteString(d.id)} THEN ${quoteString(d.name ?? d.id)}`)
		.join(" ");
	return `CASE ${idCol} ${cases} ELSE ${idCol} END`;
}

/**
 * Range opcional `[start, endExclusive)` em `__source_row`. Quando passado
 * (caminho multi-file), o WHERE inline nas CTEs reduz GROUP BY scan pra 1/N
 * da markers table, e o WHERE no SELECT externo limita as rows do source TABLE.
 * No caminho single-file (sem range), o COPY escaneia source inteiro.
 */
interface SourceRowRange {
	start: number;
	endExclusive: number;
}

/**
 * Constrói SELECT enriched a partir do parquet base + temp markers table.
 *
 * Strategy: CTE per virtual col com GROUP BY source_row → LEFT JOIN no SELECT
 * principal. Cada CTE é pequena (markers table tem N rows, N << parquet rows).
 * DuckDB optimizer faz hash JOIN cardinality-aware ao invés de correlated
 * subquery por row (que materializa CROSS JOIN intermediário e estoura memória
 * em parquets grandes).
 *
 * Pra cada virtual col enabled:
 *   - cod-frow/cod-seg: STRING_AGG(code_name, ';') por source_row
 *   - comment: MAX(comment_text) por source_row (comment é per-cell, single value)
 *
 * Quando `range` é passado (caminho multi-file), o filtro `source_row BETWEEN ...`
 * é replicado em CADA CTE — sem isso, o GROUP BY scaneia a markers table
 * inteira em todo chunk, mesmo que só 1/N seja relevante.
 */
function buildEnrichedSelect(
	originalTable: string,
	markersTable: string,
	enabledFields: ReadonlyArray<string>,
	registry: CodeDefinitionRegistry,
	range?: SourceRowRange,
): string {
	const codeNameExpr = buildCodeNameCase(registry, "m.code_id");
	const ctes: string[] = [];
	const joins: string[] = [];
	const projections: string[] = [];

	const cteRangeFilter = range
		? ` AND m.source_row >= ${range.start} AND m.source_row < ${range.endExclusive}`
		: "";

	let cteIdx = 0;
	for (const field of enabledFields) {
		const m = field.match(/^(.+)_(cod-frow|cod-seg|comment)$/);
		if (!m) continue;
		const sourceCol = m[1]!;
		const suffix = m[2]!;
		const colCol = quoteString(sourceCol);
		const cteName = `qe_cte_${cteIdx++}`;

		if (suffix === "comment") {
			const outCol = quoteIdent(`${sourceCol}__comment`);
			ctes.push(
				`${cteName} AS (` +
					`SELECT m.source_row, MAX(m.comment_text) AS val FROM ${markersTable} m ` +
					`WHERE m.kind = 'comment' AND m.column_name = ${colCol} AND m.status = 'accepted'${cteRangeFilter} ` +
					`GROUP BY m.source_row)`,
			);
			joins.push(`LEFT JOIN ${cteName} ON p.__source_row = ${cteName}.source_row`);
			projections.push(`${cteName}.val AS ${outCol}`);
		} else {
			const kind = suffix === "cod-frow" ? "frow" : "seg";
			const outCol = quoteIdent(`${sourceCol}__codes_${kind}`);
			ctes.push(
				`${cteName} AS (` +
					`SELECT m.source_row, STRING_AGG(${codeNameExpr}, ';') AS val FROM ${markersTable} m ` +
					`WHERE m.kind = '${kind}' AND m.column_name = ${colCol} AND m.status = 'accepted'${cteRangeFilter} ` +
					`GROUP BY m.source_row)`,
			);
			joins.push(`LEFT JOIN ${cteName} ON p.__source_row = ${cteName}.source_row`);
			projections.push(`${cteName}.val AS ${outCol}`);
		}
	}

	const cteSql = ctes.length > 0 ? `WITH ${ctes.join(", ")} ` : "";
	const projectionSql = projections.length > 0 ? `, ${projections.join(", ")}` : "";
	const joinSql = joins.length > 0 ? ` ${joins.join(" ")}` : "";
	const outerWhere = range
		? ` WHERE p.__source_row >= ${range.start} AND p.__source_row < ${range.endExclusive}`
		: "";
	// EXCLUDE __source_row: coluna interna injetada pelo DuckDBRowProvider via
	// `row_number() OVER () - 1` no CTAS. Não faz parte do dataset real do user;
	// vazaria pro output como tech detail confuso. Output reflete só schema do
	// parquet original + cols enriched.
	return `${cteSql}SELECT p.* EXCLUDE (__source_row)${projectionSql} FROM ${originalTable} p${joinSql}${outerWhere}`;
}

/**
 * Chunk size pro caminho multi-file. 500k source rows mantém worker peak baixo
 * (~1.5GB stable na M1 8GB com base na densidade observada no stress test
 * 2026-05-07 — C1 com 100k markers em 2.376M rows = ~21k markers por chunk
 * de 500k, abaixo de qualquer cenário que single-file já demonstrou estável).
 *
 * Caminho multi-file só ativa via try-fallback do wrapper quando single-file
 * estoura OOM — não há decisão hardcoded por máquina.
 */
const MULTI_FILE_CHUNK_SIZE = 500_000;

export interface ExportParquetEnrichedResult {
	outputPath: string;
	byteSize: number;
	enrichedColumns: string[];
	/** Definido só no caminho multi-file (fallback após OOM no single-file). */
	numParts?: number;
}

/**
 * Exporta o parquet ativo como artefato derivado com colunas dos markers projetadas.
 * Requer file lazy aberto (CsvCodingView com qualiaMarkersTable instanciada).
 *
 * Output salvo em `<original-stem>.qualia-enriched.parquet` adjacente no vault.
 * Sobrescreve se já existir.
 *
 * Cleanup garantido (try/finally): output buffer no DuckDB virtual fs é
 * dropado mesmo em caso de erro.
 */
export async function exportParquetEnriched(
	app: App,
	plugin: QualiaCodingPlugin,
	file: TFile,
): Promise<ExportParquetEnrichedResult> {
	// 1. Achar a view ativa do file
	const views = app.workspace
		.getLeavesOfType(CSV_CODING_VIEW_TYPE)
		.map((l) => l.view)
		.filter((v): v is CsvCodingView => v instanceof CsvCodingView);
	const view = views.find((v) => v.file?.path === file.path);

	if (!view) {
		throw new Error(
			`File "${file.path}" not open. Open it in lazy mode first, then run the export.`,
		);
	}

	const tempTableName = view.qualiaMarkersTableName;
	const originalTableName = view.lazyOriginalTableName;
	if (!tempTableName || !originalTableName) {
		throw new Error(
			"Lazy mode markers table not available — file may be in eager mode (small CSV/parquet) or markers table failed to build.",
		);
	}

	// 2. Coletar enabled virtual cols do data.json
	const enabledFields = view.csvModel.getEnabledVirtualColumns(file.path);
	if (enabledFields.length === 0) {
		throw new Error(
			"No virtual columns enabled. Toggle cod-frow/cod-seg/comment in the column settings before exporting.",
		);
	}

	// 3. Build SELECT enriched
	const selectSql = buildEnrichedSelect(
		originalTableName,
		tempTableName,
		enabledFields,
		view.csvModel.registry,
	);

	// 4. Run COPY → DuckDB virtual fs buffer
	const runtime = await plugin.getDuckDB();
	const outputName = `qualia_export_${Date.now()}.parquet`;
	let bytes: Uint8Array;

	try {
		await runtime.db.registerEmptyFileBuffer(outputName);

		// Pragma pra reduzir memory pressure no DuckDB-Wasm worker (3.1 GiB cap em wasm32):
		// preserve_insertion_order=false → DuckDB pode pipeline o COPY sem buffer ordenado
		// (ganho de memória 2-5x em parquets wide). Restaurado após COPY pra não poluir state
		// da connection singleton compartilhada.
		// (NÃO usar SET threads=N — DuckDB-Wasm bundle do plugin é compiled sem pthread support.)
		await runtime.conn.query(`SET preserve_insertion_order=false`);

		try {
			// SNAPPY (~10-20% pior compressão que ZSTD, mas usa muito menos memória durante write).
			// ROW_GROUP_SIZE 50000 força flush incremental — buffer peak menor que default 122880.
			await runtime.conn.query(
				`COPY (${selectSql}) TO '${outputName}' ` +
					`(FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 50000)`,
			);
			bytes = await runtime.db.copyFileToBuffer(outputName);
		} finally {
			try { await runtime.conn.query(`SET preserve_insertion_order=true`); } catch { /* ignore */ }
		}
	} finally {
		try {
			await runtime.db.dropFile(outputName);
		} catch (e) {
			console.warn("[qualia-export] dropFile cleanup failed", e);
		}
	}

	// 5. Save to vault (sobrescreve se já existir)
	const stem = file.path.replace(/\.[^.]+$/, "");
	const outputPath = `${stem}.qualia-enriched.parquet`;
	const existing = app.vault.getAbstractFileByPath(outputPath);
	if (existing) {
		await app.vault.adapter.writeBinary(outputPath, bytes.buffer as ArrayBuffer);
	} else {
		await app.vault.createBinary(outputPath, bytes.buffer as ArrayBuffer);
	}

	return {
		outputPath,
		byteSize: bytes.byteLength,
		enrichedColumns: enabledFields,
	};
}

/**
 * Caminho multi-file: exporta o parquet em chunks de range de `__source_row`,
 * cada chunk virando um arquivo separado em `<base>.qualia-enriched/part-NNN.parquet`.
 * Sem concat — leitor externo usa glob (`read_parquet('dir/*.parquet')`).
 *
 * Worker peak ~1.5GB stable: cada part é escrito no vault e dropado do virtual fs
 * antes do próximo chunk começar.
 *
 * Ativado via fallback automático no `exportParquetEnrichedFromActiveView` quando
 * single-file estoura OOM. Não tem decisão hardcoded por máquina — reage ao runtime.
 */
export async function exportParquetEnrichedMultiFile(
	app: App,
	plugin: QualiaCodingPlugin,
	file: TFile,
	onProgress?: (chunkIdx: number, totalChunks: number) => void,
): Promise<ExportParquetEnrichedResult> {
	// 1-2: mesma resolução de view + view state que single-file
	const views = app.workspace
		.getLeavesOfType(CSV_CODING_VIEW_TYPE)
		.map((l) => l.view)
		.filter((v): v is CsvCodingView => v instanceof CsvCodingView);
	const view = views.find((v) => v.file?.path === file.path);

	if (!view) {
		throw new Error(
			`File "${file.path}" not open. Open it in lazy mode first, then run the export.`,
		);
	}

	const tempTableName = view.qualiaMarkersTableName;
	const originalTableName = view.lazyOriginalTableName;
	if (!tempTableName || !originalTableName) {
		throw new Error(
			"Lazy mode markers table not available — file may be in eager mode (small CSV/parquet) or markers table failed to build.",
		);
	}

	const enabledFields = view.csvModel.getEnabledVirtualColumns(file.path);
	if (enabledFields.length === 0) {
		throw new Error(
			"No virtual columns enabled. Toggle cod-frow/cod-seg/comment in the column settings before exporting.",
		);
	}

	// 3: detectar total rows do source TABLE pra calcular chunks
	const runtime = await plugin.getDuckDB();
	const countResult = await runtime.conn.query(
		`SELECT COUNT(*) AS n FROM ${originalTableName}`,
	);
	const countRows = countResult.toArray();
	const totalRows = Number(countRows[0]?.toJSON().n ?? 0);
	const numChunks = Math.max(1, Math.ceil(totalRows / MULTI_FILE_CHUNK_SIZE));

	// 4: preparar dir de output. Recriar zero se já existir (re-export sobrescreve)
	const stem = file.path.replace(/\.[^.]+$/, "");
	const outputDir = `${stem}.qualia-enriched`;
	const adapter = app.vault.adapter;
	if (await adapter.exists(outputDir)) {
		const listing = await adapter.list(outputDir);
		for (const f of listing.files) {
			await adapter.remove(f);
		}
		// listing.folders ignorado — output dir só tem files diretos, sem sub-dirs
	} else {
		await adapter.mkdir(outputDir);
	}

	// 5: loop de chunks. Cada part: COPY → virtual fs → vault → dropFile (libera worker)
	const ts = Date.now();
	let totalBytes = 0;

	await runtime.conn.query(`SET preserve_insertion_order=false`);
	try {
		for (let i = 0; i < numChunks; i++) {
			onProgress?.(i, numChunks);

			const start = i * MULTI_FILE_CHUNK_SIZE;
			const endExclusive = Math.min(start + MULTI_FILE_CHUNK_SIZE, totalRows);
			const partName = `qualia_export_part_${ts}_${i}.parquet`;
			const partPath = `${outputDir}/part-${String(i + 1).padStart(3, "0")}.parquet`;

			const sql = buildEnrichedSelect(
				originalTableName,
				tempTableName,
				enabledFields,
				view.csvModel.registry,
				{ start, endExclusive },
			);

			let partBytes: Uint8Array;
			try {
				await runtime.db.registerEmptyFileBuffer(partName);
				await runtime.conn.query(
					`COPY (${sql}) TO '${partName}' ` +
						`(FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 50000)`,
				);
				partBytes = await runtime.db.copyFileToBuffer(partName);
			} finally {
				try {
					await runtime.db.dropFile(partName);
				} catch (e) {
					console.warn("[qualia-export-multifile] dropFile cleanup failed", partName, e);
				}
			}

			await adapter.writeBinary(partPath, partBytes.buffer as ArrayBuffer);
			totalBytes += partBytes.byteLength;
		}
	} finally {
		try { await runtime.conn.query(`SET preserve_insertion_order=true`); } catch { /* ignore */ }
	}

	return {
		outputPath: outputDir,
		byteSize: totalBytes,
		enrichedColumns: enabledFields,
		numParts: numChunks,
	};
}

/**
 * Helper pro modal handler. Tenta single-file primeiro; se cair com erro tipo OOM
 * (DuckDB-Wasm worker estourando cap 4GB do wasm32), ativa multi-file
 * automaticamente. Decisão dinâmica via runtime — máquina-agnóstico, sem
 * hardcode de teto por classe de hardware.
 */
export async function exportParquetEnrichedFromActiveView(
	app: App,
	plugin: QualiaCodingPlugin,
): Promise<void> {
	const view = app.workspace.getActiveViewOfType(CsvCodingView);
	if (!view || !view.file) {
		new Notice("Open a parquet/CSV file first, then run the export.", 8000);
		return;
	}

	const t0 = performance.now();

	try {
		const result = await exportParquetEnriched(app, plugin, view.file);
		const elapsed = performance.now() - t0;
		const sizeMB = (result.byteSize / (1024 * 1024)).toFixed(1);
		new Notice(
			`✅ Exported ${result.outputPath} · ${sizeMB}MB · ${result.enrichedColumns.length} cols · ${elapsed.toFixed(0)}ms`,
			12000,
		);
		return;
	} catch (err) {
		if (!isOOMError(err)) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("[qualia-export] parquet enriched failed", err);
			new Notice(`❌ Export failed: ${msg}`, 12000);
			return;
		}
		console.warn("[qualia-export] single-file OOM — falling back to multi-file", err);
		new Notice(
			`⚠ Single-file export hit memory limit. Retrying as multi-file dataset…`,
			8000,
		);
	}

	// Fallback path
	try {
		const result = await exportParquetEnrichedMultiFile(
			app,
			plugin,
			view.file,
			(chunkIdx, totalChunks) => {
				new Notice(`Exporting part ${chunkIdx + 1}/${totalChunks}…`, 4000);
			},
		);
		const elapsed = performance.now() - t0;
		const sizeMB = (result.byteSize / (1024 * 1024)).toFixed(1);
		new Notice(
			`✅ Exported as dataset (${result.numParts} parts) · ${result.outputPath}/ · ${sizeMB}MB total · ${result.enrichedColumns.length} cols · ${elapsed.toFixed(0)}ms\n\n` +
				`Read with:\n` +
				`• DuckDB: read_parquet('${result.outputPath}/*.parquet')\n` +
				`• pandas/polars: read_parquet('${result.outputPath}/')`,
			20000,
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[qualia-export] multi-file fallback also failed", err);
		new Notice(`❌ Multi-file export also failed: ${msg}`, 12000);
	}
}
