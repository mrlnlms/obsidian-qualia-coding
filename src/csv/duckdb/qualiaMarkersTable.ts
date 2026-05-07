/**
 * `qualia_markers_<fileIdSafe>` — temp table DuckDB com markers do file lazy
 * projetados em long format. Source de verdade pra filter virtual (cod-frow,
 * cod-seg, comment) em modo lazy + export "Parquet enriquecido".
 *
 * Per-file scope. Build em file open via insertArrowTable (single call,
 * validado em spike: ~25ms warmup IPC + ~200μs/row sustained — irrelevante
 * pra escalas de coding qualitativo). Drop em file close.
 *
 * Sync via BatchedMutationApplier (canal onMarkerMutation existente do SC3)
 * — ADD/REMOVE/UPDATE em rAF batch.
 *
 * Conexão DuckDB é singleton (plugin.getDuckDB()) compartilhada entre N files
 * lazy abertos. Nome da temp table por-file (`qualia_markers_<fileIdSafe>`)
 * previne colisão.
 *
 * Hot-reload safety: build começa com DROP TABLE IF EXISTS pra recuperar
 * de cenário onde plugin re-loaded mas worker DuckDB persistiu (Plugin
 * class é descartada mas worker continua vivo).
 *
 * Schema preparada pra LLM (status, created_by) sem features LLM
 * implementadas — DDL change later seria caro (invalida queries em uso).
 */

import * as arrow from "apache-arrow";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { CsvCodingModel } from "../csvCodingModel";
import type { RowMarker, SegmentMarker, CsvMarker } from "../csvCodingTypes";
import type { MarkerMutationEvent } from "../../core/types";

/** Sanitiza fileId (path) pra identifier SQL válido. Replace tudo que não é alnum/_ por _. */
function sanitizeId(fileId: string): string {
	return fileId.replace(/[^a-zA-Z0-9_]/g, "_");
}

interface MarkerRow {
	marker_id: string;
	source_row: number;
	kind: "frow" | "seg" | "comment";
	column_name: string;
	code_id: string | null;
	magnitude: string | null;
	comment_text: string | null;
	segment_start: number | null;
	segment_end: number | null;
	status: string;
	created_by: string;
	created_at: string;
}

/** Projeta um CsvMarker do file pra 0+ rows long-format na temp table. */
function projectMarker(marker: CsvMarker): MarkerRow[] {
	const rows: MarkerRow[] = [];
	const created_at = new Date(marker.createdAt).toISOString();
	const isSeg = "from" in marker && "to" in marker;
	const kind: "frow" | "seg" = isSeg ? "seg" : "frow";

	// Code applications (frow ou seg)
	for (const app of marker.codes) {
		rows.push({
			marker_id: marker.id,
			source_row: marker.sourceRowId,
			kind,
			column_name: marker.column,
			code_id: app.codeId,
			magnitude: app.magnitude ?? null,
			comment_text: null,
			segment_start: isSeg ? (marker as SegmentMarker).from : null,
			segment_end: isSeg ? (marker as SegmentMarker).to : null,
			status: "accepted",
			created_by: "human",
			created_at,
		});
	}

	// Comment (apenas RowMarker, schema só tem comment per-cell)
	if (!isSeg && (marker as RowMarker).comment) {
		rows.push({
			marker_id: marker.id,
			source_row: marker.sourceRowId,
			kind: "comment",
			column_name: marker.column,
			code_id: null,
			magnitude: null,
			comment_text: (marker as RowMarker).comment ?? null,
			segment_start: null,
			segment_end: null,
			status: "accepted",
			created_by: "human",
			created_at,
		});
	}

	return rows;
}

/**
 * Placeholder row prepended SEMPRE no Arrow Table. Razão: `arrow.tableFromJSON`
 * infere schema dos records — colunas onde TODOS os valores são `null` são
 * dropadas (Arrow não consegue determinar o tipo). Isso é sintoma na vida real
 * de vaults com markers que não usam magnitude/segment/comment ainda.
 *
 * Placeholder garante schema completo (todos os 12 fields com types definidos)
 * independente do conteúdo dos rows reais. Removido via DELETE pós-ingest.
 */
const PLACEHOLDER_ROW: MarkerRow = {
	marker_id: "__qualia_placeholder__",
	source_row: -1,  // distinto de qualquer source_row válido (0+)
	kind: "frow",
	column_name: "__placeholder__",
	code_id: "__placeholder__",
	magnitude: "__placeholder__",
	comment_text: "__placeholder__",
	segment_start: 0,
	segment_end: 0,
	status: "accepted",
	created_by: "human",
	created_at: "1970-01-01T00:00:00.000Z",
};

function rowsToArrowTable(rows: MarkerRow[]): arrow.Table {
	// SEMPRE prepend placeholder — garante schema completo via type inference.
	// Real rows com null em fields opcionais ficam NULL no DuckDB (correto).
	const all = [PLACEHOLDER_ROW, ...rows];
	return arrow.tableFromJSON(all as unknown as Record<string, unknown>[]);
}

/**
 * Quote SQL string literal — single quotes escaped por doubling.
 * DuckDB-Wasm não tem prepared statements maduros pra DML em batch, então usamos
 * interpolation com escape rigoroso. Pattern alinha com filterModelToSql.escapeLike.
 */
function q(v: string | number | null): string {
	if (v === null) return "NULL";
	if (typeof v === "number") {
		return Number.isFinite(v) ? String(v) : "NULL";
	}
	return `'${v.replace(/'/g, "''")}'`;
}

function rowToValuesTuple(r: MarkerRow): string {
	return `(${q(r.marker_id)}, ${q(r.source_row)}, ${q(r.kind)}, ${q(r.column_name)}, ${q(r.code_id)}, ${q(r.magnitude)}, ${q(r.comment_text)}, ${q(r.segment_start)}, ${q(r.segment_end)}, ${q(r.status)}, ${q(r.created_by)}, ${q(r.created_at)})`;
}

export class QualiaMarkersTable {
	readonly tableName: string;
	private disposed = false;

	constructor(
		private conn: AsyncDuckDBConnection,
		private fileId: string,
		private model: CsvCodingModel,
	) {
		this.tableName = `qualia_markers_${sanitizeId(fileId)}`;
	}

	/**
	 * Build inicial. Idempotente — DROP IF EXISTS antes do CREATE pra hot-reload safety
	 * (plugin re-loaded mas worker DuckDB persistiu com tabela viva).
	 *
	 * Strategy: insertArrowTable cria a tabela ao mesmo tempo que ingere. Se markers
	 * vazios, cria com row placeholder e DELETE imediato pra deixar schema sem placeholder.
	 */
	async build(): Promise<void> {
		await this.conn.query(`DROP TABLE IF EXISTS ${this.tableName}`);

		const allMarkers = this.model.getMarkersForFile(this.fileId);
		const rows: MarkerRow[] = [];
		for (const m of allMarkers) {
			rows.push(...projectMarker(m));
		}

		const arrowTable = rowsToArrowTable(rows);
		await this.conn.insertArrowTable(arrowTable, {
			name: this.tableName,
			create: true,
		});

		// Cleanup placeholder — sempre presente pra garantir schema completo
		// (ver doc de PLACEHOLDER_ROW pra contexto)
		await this.conn.query(
			`DELETE FROM ${this.tableName} WHERE marker_id = '__qualia_placeholder__'`,
		);

		// Indexes pra queries hot-path (filter resolver, export aggregation)
		await this.conn.query(
			`CREATE INDEX IF NOT EXISTS idx_${sanitizeId(this.fileId)}_source_row ON ${this.tableName}(source_row)`,
		);
		await this.conn.query(
			`CREATE INDEX IF NOT EXISTS idx_${sanitizeId(this.fileId)}_code_id ON ${this.tableName}(code_id)`,
		);
		await this.conn.query(
			`CREATE INDEX IF NOT EXISTS idx_${sanitizeId(this.fileId)}_kind_col ON ${this.tableName}(kind, column_name)`,
		);
	}

	/** DROP TABLE definitivo. Safe a chamar várias vezes — idempotente via flag. */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		try {
			await this.conn.query(`DROP TABLE IF EXISTS ${this.tableName}`);
		} catch (err) {
			console.warn(`[qualia-markers-tmp] dispose ${this.tableName} failed`, err);
		}
	}

	/**
	 * Aplica batch de mutation events. Strategy:
	 * - ADD (marker definido + prevCodeIds vazio): coleta rows e INSERT VALUES bulk
	 * - REMOVE (marker undefined): DELETE WHERE marker_id IN (...)
	 * - UPDATE (marker definido + prevCodeIds populado): DELETE + INSERT (simpler que UPDATE granular)
	 *
	 * Re-build do projection per-event garante consistência: marker pode ter mudado
	 * codes/comment/magnitude, e long-format projeta tudo de uma vez. Mais barato que
	 * SQL UPDATE multi-row diferenciado.
	 */
	async applyBatch(events: MarkerMutationEvent[]): Promise<void> {
		if (this.disposed) return;
		if (events.length === 0) return;

		const removeIds: string[] = [];
		const updateIds: string[] = [];
		const insertRows: MarkerRow[] = [];

		for (const event of events) {
			if (event.fileId !== this.fileId) continue;
			const marker = event.marker;

			if (marker === undefined) {
				// REMOVE
				removeIds.push(event.markerId);
				continue;
			}

			// CsvMarker only (filter por engine — paranoia, applier já filtra fileId)
			if ((marker as { markerType?: string }).markerType !== "csv") continue;
			const csvMarker = marker as CsvMarker;

			if (event.prevCodeIds.length > 0) {
				// UPDATE: clear old rows, re-project current
				updateIds.push(event.markerId);
			}
			insertRows.push(...projectMarker(csvMarker));
		}

		// DELETE (REMOVE + UPDATE old rows) numa só SQL
		const idsToDelete = [...new Set([...removeIds, ...updateIds])];
		if (idsToDelete.length > 0) {
			const inList = idsToDelete.map((id) => q(id)).join(", ");
			await this.conn.query(
				`DELETE FROM ${this.tableName} WHERE marker_id IN (${inList})`,
			);
		}

		// INSERT bulk
		if (insertRows.length > 0) {
			const valuesTuples = insertRows.map(rowToValuesTuple).join(", ");
			await this.conn.query(
				`INSERT INTO ${this.tableName} ` +
					`(marker_id, source_row, kind, column_name, code_id, magnitude, comment_text, segment_start, segment_end, status, created_by, created_at) ` +
					`VALUES ${valuesTuples}`,
			);
		}
	}

	get isDisposed(): boolean {
		return this.disposed;
	}
}
