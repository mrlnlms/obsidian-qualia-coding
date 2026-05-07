/**
 * SPIKE TEMPORÁRIO — validação do path Arrow IPC ingest em DuckDB-Wasm.
 *
 * Razão: o codebase nunca exercitou `insertArrowTable` / `insertArrowFromIPCStream`.
 * Toda ingest é via `read_parquet(file)`. A spec `tabular-virtual-cols-design.md`
 * assume Arrow IPC pra materializar markers como temp table — antes de aterrissar
 * a feature, validar que a API funciona no bundle real (Electron renderer + worker
 * shimado).
 *
 * Sucesso = registrar Arrow Table de 100 rows, query devolve a mesma quantidade,
 * shape correto. Falha = fallback `INSERT INTO ... VALUES (...)` chunked.
 *
 * REMOVER após validação.
 */
import * as arrow from "apache-arrow";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

interface SpikeRow {
	marker_id: string;
	source_row: number;
	kind: "frow" | "seg" | "comment";
	code_id: string | null;
	status: string;
}

function buildFakeRows(count: number): SpikeRow[] {
	const kinds: ReadonlyArray<SpikeRow["kind"]> = ["frow", "seg", "comment"] as const;
	const rows: SpikeRow[] = [];
	for (let i = 0; i < count; i++) {
		const kind = kinds[i % 3] as SpikeRow["kind"];
		rows.push({
			marker_id: `m_${i.toString().padStart(4, "0")}`,
			source_row: Math.floor(i / 2),
			kind,
			code_id: kind === "comment" ? null : `c_${i % 5}`,
			status: "accepted",
		});
	}
	return rows;
}

function rowsToArrowTable(rows: SpikeRow[]): arrow.Table {
	// `arrow.tableFromJSON` infere schema a partir dos primeiros records — precisa
	// de field types consistentes. NULLs em code_id forçam type Utf8 com nullability.
	return arrow.tableFromJSON(rows as unknown as Record<string, unknown>[]);
}

export interface SpikeResult {
	ok: boolean;
	rowsInserted: number;
	rowsQueried: number;
	groupCounts: Record<string, number>;
	tBuildMs: number;
	tIngestMs: number;
	tQueryMs: number;
	error?: string;
}

/**
 * Roda o spike. Caller responsável por garantir que a connection esteja viva.
 * Usa table name único por chamada (timestamp suffix) pra evitar colisão entre runs.
 */
export async function runArrowIngestSpike(
	conn: AsyncDuckDBConnection,
	rowCount = 100,
): Promise<SpikeResult> {
	const tableName = `qualia_spike_${Date.now()}`;
	const result: SpikeResult = {
		ok: false,
		rowsInserted: rowCount,
		rowsQueried: 0,
		groupCounts: {},
		tBuildMs: 0,
		tIngestMs: 0,
		tQueryMs: 0,
	};

	try {
		// 1. Build Arrow Table
		const t0 = performance.now();
		const rows = buildFakeRows(rowCount);
		const table = rowsToArrowTable(rows);
		result.tBuildMs = performance.now() - t0;

		// 2. Inject into DuckDB via insertArrowTable
		const t1 = performance.now();
		await conn.insertArrowTable(table, { name: tableName, create: true });
		result.tIngestMs = performance.now() - t1;

		// 3. Query back: count by kind to validate ingest preserved data
		const t2 = performance.now();
		const queryResult = await conn.query(
			`SELECT kind, COUNT(*) AS n FROM ${tableName} GROUP BY kind ORDER BY kind`,
		);
		result.tQueryMs = performance.now() - t2;

		const queriedRows = queryResult.toArray().map((r) => r.toJSON());
		let total = 0;
		for (const r of queriedRows) {
			const k = String(r.kind);
			const n = Number(r.n);
			result.groupCounts[k] = n;
			total += n;
		}
		result.rowsQueried = total;
		result.ok = total === rowCount;
	} catch (err) {
		result.error = err instanceof Error ? err.message : String(err);
	} finally {
		// Cleanup — drop table mesmo em caso de falha
		try {
			await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
		} catch (e) {
			console.warn("[arrow-spike] DROP TABLE failed", e);
		}
	}

	return result;
}
