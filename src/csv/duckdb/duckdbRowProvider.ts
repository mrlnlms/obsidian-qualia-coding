/**
 * DuckDBRowProvider — RowProvider implementation backed by DuckDB-Wasm reading
 * a parquet/CSV file from OPFS via the BROWSER_FSACCESS protocol.
 *
 * Lifecycle:
 *   - `create()` registers the OPFS file handle with DuckDB and materializes a table
 *     `qualia_lazy_<id>` with an injected `__source_row` virtual column (0-based,
 *     matching the eager mode papaparse index — see "Source row id parity" below).
 *   - `dispose()` drops the table and unregisters the file handle.
 *
 * Source row id parity: in eager mode `sourceRowId` comes from papaparse and is
 * 0-based. DuckDB's `row_number() OVER ()` is 1-based, so we subtract 1 in the
 * materialization query to keep the contract identical across modes. Otherwise
 * markers persisted in eager mode would point one row off in lazy mode.
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import type { DuckDBRuntime } from "./duckdbBootstrap";
import type { RowProvider, MarkerRef } from "./rowProvider";
import { markerRefKey } from "./rowProvider";

export type TabularFileType = "csv" | "parquet";

export interface DuckDBRowProviderOptions {
	runtime: DuckDBRuntime;
	fileHandle: FileSystemFileHandle;
	fileType: TabularFileType;
	/** Display name used as the registered file alias (must be unique per provider). */
	alias?: string;
}

/** SQL identifier escape — wrap in double quotes, escape internal quotes by doubling. */
function quoteIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`;
}

let counter = 0;
function uniqueSuffix(): string {
	counter += 1;
	return `${Date.now()}_${counter}`;
}

export class DuckDBRowProvider implements RowProvider {
	private disposed = false;

	private constructor(
		private readonly conn: duckdb.AsyncDuckDBConnection,
		private readonly db: duckdb.AsyncDuckDB,
		private readonly tableName: string,
		private readonly alias: string,
	) {}

	static async create(opts: DuckDBRowProviderOptions): Promise<DuckDBRowProvider> {
		const suffix = uniqueSuffix();
		const alias = opts.alias ?? `qualia_src_${suffix}.${opts.fileType}`;
		const tableName = `qualia_lazy_${suffix}`;

		await opts.runtime.db.registerFileHandle(
			alias,
			opts.fileHandle,
			duckdb.DuckDBDataProtocol.BROWSER_FSACCESS,
			true,
		);

		// CSV reader tuned for tolerance over strictness:
		//  - `all_varchar=true`: every column as VARCHAR (no type inference). Coding
		//    operates on raw cell text — type errors on heterogeneous real-world
		//    CSVs (e.g. timestamp column with "false" sentinel mid-file) are not
		//    worth a hard fail.
		//  - `null_padding=true`: rows with fewer columns than the header become
		//    NULL-padded instead of throwing.
		//  - `ignore_errors=true`: rows with more columns or other parse errors
		//    are skipped (DuckDB still prints a warning per skipped row to the
		//    console, so the user can investigate). The alternative — strict mode
		//    aborting the whole load over one malformed row — blocks coding the
		//    other 99.99% of clean rows.
		//    Caveat: markers that pointed to a skipped row become orphaned (sidebar
		//    label falls back to coordinate). Acceptable for prosumer coding work.
		const readFn = opts.fileType === "parquet"
			? `read_parquet('${alias}')`
			: `read_csv_auto('${alias}', header=true, all_varchar=true, null_padding=true, ignore_errors=true)`;

		try {
			await opts.runtime.conn.query(
				`CREATE OR REPLACE TABLE ${tableName} AS ` +
				`SELECT row_number() OVER () - 1 AS __source_row, * FROM ${readFn}`,
			);
		} catch (err) {
			// Best-effort cleanup so the next attempt starts fresh.
			try { await opts.runtime.db.dropFile(alias); } catch { /* ignore */ }
			throw err;
		}

		return new DuckDBRowProvider(opts.runtime.conn, opts.runtime.db, tableName, alias);
	}

	private guard(): void {
		if (this.disposed) throw new Error("DuckDBRowProvider has been disposed");
	}

	async getMarkerText(ref: MarkerRef): Promise<string | null> {
		this.guard();
		const result = await this.conn.query(
			`SELECT ${quoteIdent(ref.column)} AS val ` +
			`FROM ${this.tableName} ` +
			`WHERE __source_row = ${ref.sourceRowId} LIMIT 1`,
		);
		const rows = result.toArray();
		if (rows.length === 0) return null;
		const v = rows[0].toJSON().val;
		return v == null ? null : String(v);
	}

	async batchGetMarkerText(refs: MarkerRef[]): Promise<Map<string, string | null>> {
		this.guard();
		const out = new Map<string, string | null>();
		if (refs.length === 0) return out;

		// Group by column — one query per distinct column, IN list of source row ids.
		// This keeps queries shaped predictably (DuckDB plans a hash-join filter)
		// and avoids fanout explosion on heterogeneous markers.
		const byColumn = new Map<string, number[]>();
		for (const r of refs) {
			const list = byColumn.get(r.column);
			if (list) list.push(r.sourceRowId);
			else byColumn.set(r.column, [r.sourceRowId]);
		}

		for (const [col, ids] of byColumn) {
			const inList = ids.join(",");
			const result = await this.conn.query(
				`SELECT __source_row, ${quoteIdent(col)} AS val ` +
				`FROM ${this.tableName} ` +
				`WHERE __source_row IN (${inList})`,
			);
			const seen = new Set<number>();
			for (const row of result.toArray()) {
				const j = row.toJSON();
				const sourceRowId = Number(j.__source_row);
				seen.add(sourceRowId);
				out.set(markerRefKey({ sourceRowId, column: col }), j.val == null ? null : String(j.val));
			}
			// Anything in `ids` not returned by the query → out-of-range row → null.
			for (const id of ids) {
				if (!seen.has(id)) out.set(markerRefKey({ sourceRowId: id, column: col }), null);
			}
		}
		return out;
	}

	/**
	 * Total row count. When `whereClause` is provided (already escaped — see
	 * `filterModelToSql.buildWhereClause`), returns the count post-filter.
	 */
	async getRowCount(whereClause?: string): Promise<number> {
		this.guard();
		const where = whereClause ? `WHERE ${whereClause}` : "";
		const result = await this.conn.query(`SELECT COUNT(*) AS n FROM ${this.tableName} ${where}`);
		const rows = result.toArray();
		return Number(rows[0]?.toJSON().n ?? 0);
	}

	/**
	 * Returns the `__source_row` IDs of all rows matching `whereClause`. Used by
	 * batch coding in lazy mode (Infinite Row Model only sees the page cache, so
	 * `forEachNodeAfterFilterAndSort` is unreliable). No `whereClause` → all rows.
	 */
	async getFilteredSourceRowIds(whereClause?: string): Promise<number[]> {
		this.guard();
		const where = whereClause ? `WHERE ${whereClause}` : "";
		const result = await this.conn.query(
			`SELECT __source_row FROM ${this.tableName} ${where} ORDER BY __source_row`,
		);
		// Pull from the Arrow vector directly — `result.toArray().map(r => r.toJSON())`
		// allocates a fresh object per row and is ~10× slower on 600k+ row sets.
		const col = result.getChild("__source_row");
		if (!col) return [];
		const out = new Array<number>(col.length);
		for (let i = 0; i < col.length; i++) out[i] = Number(col.get(i));
		return out;
	}

	/** Original column names (excludes the synthetic __source_row). */
	async getColumns(): Promise<string[]> {
		this.guard();
		const result = await this.conn.query(`SELECT * FROM ${this.tableName} LIMIT 1`);
		const rows = result.toArray();
		if (rows.length > 0) {
			return Object.keys(rows[0].toJSON()).filter(k => k !== "__source_row");
		}
		// Fallback for empty tables — DESCRIBE returns the schema.
		const desc = await this.conn.query(`DESCRIBE ${this.tableName}`);
		return desc.toArray()
			.map(r => String(r.toJSON().column_name))
			.filter(n => n !== "__source_row");
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		try { await this.conn.query(`DROP TABLE IF EXISTS ${this.tableName}`); }
		catch (e) { console.warn("[duckdb-row-provider] DROP TABLE failed", e); }
		try { await this.db.dropFile(this.alias); }
		catch (e) { console.warn("[duckdb-row-provider] dropFile failed", e); }
	}

	/**
	 * Fetch rows by display position with a sort applied. Returns the sliced data
	 * frame Infinite Row Model needs. `orderBy` may be empty (natural row order).
	 */
	async getRowsByDisplayRange(opts: {
		offset: number;
		limit: number;
		orderBy?: Array<{ column: string; descending: boolean }>;
		columns?: string[];
		/** Pre-built SQL WHERE fragment (already escaped — see `filterModelToSql.buildWhereClause`). */
		whereClause?: string;
	}): Promise<Array<Record<string, unknown>>> {
		this.guard();
		const where = opts.whereClause ? `WHERE ${opts.whereClause}` : "";
		const orderClause = opts.orderBy && opts.orderBy.length > 0
			? `ORDER BY ${opts.orderBy.map(o => `${quoteIdent(o.column)} ${o.descending ? "DESC" : "ASC"}`).join(", ")}`
			: "";
		const select = opts.columns && opts.columns.length > 0
			? opts.columns.map(quoteIdent).concat("__source_row").join(", ")
			: "*";
		const result = await this.conn.query(
			`SELECT ${select} FROM ${this.tableName} ${where} ${orderClause} LIMIT ${opts.limit} OFFSET ${opts.offset}`,
		);
		return result.toArray().map(r => r.toJSON() as Record<string, unknown>);
	}

	/**
	 * Build a `__source_row → display_row` mapping for a given sort. Used to keep
	 * scroll-to-row O(1) in lazy mode (spike Premise B addendum §14.5.2).
	 *
	 * The result is a temporary DuckDB table; lookups go via `displayRowFor()`.
	 * Caller is responsible for disposing via `dropDisplayMap()` when sort changes.
	 */
	async buildDisplayMap(
		orderBy: Array<{ column: string; descending: boolean }>,
		whereClause?: string,
	): Promise<string> {
		this.guard();
		const mapName = `qualia_display_map_${uniqueSuffix()}`;
		const orderClause = orderBy.length > 0
			? `ORDER BY ${orderBy.map(o => `${quoteIdent(o.column)} ${o.descending ? "DESC" : "ASC"}`).join(", ")}`
			: "";
		const where = whereClause ? `WHERE ${whereClause}` : "";
		await this.conn.query(
			`CREATE OR REPLACE TABLE ${mapName} AS ` +
			`SELECT __source_row, row_number() OVER (${orderClause}) - 1 AS display_row FROM ${this.tableName} ${where}`,
		);
		return mapName;
	}

	async displayRowFor(mapName: string, sourceRowId: number): Promise<number | null> {
		this.guard();
		const result = await this.conn.query(
			`SELECT display_row FROM ${mapName} WHERE __source_row = ${sourceRowId} LIMIT 1`,
		);
		const rows = result.toArray();
		if (rows.length === 0) return null;
		return Number(rows[0].toJSON().display_row);
	}

	async dropDisplayMap(mapName: string): Promise<void> {
		this.guard();
		try { await this.conn.query(`DROP TABLE IF EXISTS ${mapName}`); }
		catch (e) { console.warn("[duckdb-row-provider] dropDisplayMap failed", e); }
	}
}
