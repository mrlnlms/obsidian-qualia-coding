/**
 * RowProvider — abstraction for fetching tabular row content.
 *
 * Two implementations planned:
 *   - MockRowProvider (this file)         — in-memory, used by tests + dev
 *   - DuckDBRowProvider (Fase 4)          — backed by AsyncDuckDB, OPFS-resident parquet/CSV
 *
 * The interface stays small on purpose. Higher-level concerns (caching, filtering,
 * sort-aware navigation) live elsewhere and consume this contract.
 */

export interface MarkerRef {
	sourceRowId: number;
	column: string;
}

export interface RowProvider {
	/** Fetch text content for a single marker. Returns null if row/column missing. */
	getMarkerText(ref: MarkerRef): Promise<string | null>;

	/** Batch fetch — single round-trip, keyed by `${sourceRowId}|${column}`. */
	batchGetMarkerText(refs: MarkerRef[]): Promise<Map<string, string | null>>;

	/** Total number of rows in the underlying source. */
	getRowCount(): Promise<number>;

	/** Release any resources held. Idempotent. */
	dispose(): Promise<void>;
}

/** Composite key used by batch responses. Stable across implementations. */
export function markerRefKey(ref: MarkerRef): string {
	return `${ref.sourceRowId}|${ref.column}`;
}

/**
 * In-memory mock — backed by an array of records. Used in tests and as a stand-in
 * before Fase 4 wires DuckDB up.
 */
export class MockRowProvider implements RowProvider {
	private disposed = false;

	constructor(private readonly rows: ReadonlyArray<Record<string, string>>) {}

	private guard(): void {
		if (this.disposed) {
			throw new Error("MockRowProvider has been disposed");
		}
	}

	async getMarkerText(ref: MarkerRef): Promise<string | null> {
		this.guard();
		const row = this.rows[ref.sourceRowId];
		if (!row) return null;
		const value = row[ref.column];
		return value ?? null;
	}

	async batchGetMarkerText(refs: MarkerRef[]): Promise<Map<string, string | null>> {
		this.guard();
		const out = new Map<string, string | null>();
		for (const ref of refs) {
			const row = this.rows[ref.sourceRowId];
			out.set(markerRefKey(ref), row?.[ref.column] ?? null);
		}
		return out;
	}

	async getRowCount(): Promise<number> {
		this.guard();
		return this.rows.length;
	}

	async dispose(): Promise<void> {
		this.disposed = true;
	}
}
