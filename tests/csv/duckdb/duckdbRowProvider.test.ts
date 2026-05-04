import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── In-memory SQL-ish mock for AsyncDuckDB ─────────────────────────────
// We don't run real SQL; instead, the mock holds a list of "tables" — rows of
// records — and answers queries by pattern-matching on the SQL string. This
// lets us exercise DuckDBRowProvider's plumbing (alias registration, query
// shape, escape) without hauling DuckDB-Wasm into jsdom.

interface MockTable {
	rows: Array<Record<string, unknown>>;
}

class MockQueryResult {
	constructor(private readonly rows: Array<Record<string, unknown>>) {}
	toArray() {
		return this.rows.map(r => ({ toJSON: () => r }));
	}
}

class MockConn {
	tables = new Map<string, MockTable>();
	queryLog: string[] = [];
	rejectNextQuery: Error | null = null;

	async query(sql: string): Promise<MockQueryResult> {
		this.queryLog.push(sql);
		if (this.rejectNextQuery) {
			const err = this.rejectNextQuery;
			this.rejectNextQuery = null;
			throw err;
		}

		// CREATE OR REPLACE TABLE <name> AS SELECT row_number() OVER () - 1 AS __source_row, * FROM read_xxx('<alias>')
		const createMatch = sql.match(/CREATE OR REPLACE TABLE (\S+) AS SELECT row_number\(\) OVER \(\) - 1 AS __source_row, \* FROM (read_parquet|read_csv_auto)\('([^']+)'/);
		if (createMatch) {
			const [, tableName, _readFn, alias] = createMatch;
			void _readFn;
			const source = this.tables.get(`__source_${alias}`);
			if (!source) throw new Error(`mock: no source registered for alias ${alias}`);
			const rows = source.rows.map((r, i) => ({ __source_row: i, ...r }));
			this.tables.set(tableName!, { rows });
			return new MockQueryResult([]);
		}

		// CREATE OR REPLACE TABLE <map> AS SELECT __source_row, row_number() OVER (...) - 1 AS display_row FROM <table>
		const mapMatch = sql.match(/CREATE OR REPLACE TABLE (\S+) AS SELECT __source_row, row_number\(\) OVER \(([^)]*)\) - 1 AS display_row FROM (\S+)/);
		if (mapMatch) {
			const [, mapName, orderClause, srcTable] = mapMatch;
			const src = this.tables.get(srcTable!);
			if (!src) throw new Error(`mock: source table ${srcTable} missing`);
			let rows = [...src.rows];
			// minimal ORDER BY parser: ORDER BY "col" ASC|DESC[, ...]
			if (orderClause && orderClause.trim().startsWith('ORDER BY')) {
				const orderSpec = orderClause.replace(/^ORDER BY\s*/, '').split(',').map(s => s.trim());
				rows.sort((a, b) => {
					for (const spec of orderSpec) {
						const m = spec.match(/^"([^"]+)"\s+(ASC|DESC)$/);
						if (!m) continue;
						const [, col, dir] = m;
						const av = a[col!];
						const bv = b[col!];
						const cmp = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : av > bv ? 1 : 0;
						if (cmp !== 0) return dir === 'DESC' ? -cmp : cmp;
					}
					return 0;
				});
			}
			const mapped = rows.map((r, i) => ({ __source_row: r.__source_row, display_row: i }));
			this.tables.set(mapName!, { rows: mapped });
			return new MockQueryResult([]);
		}

		// SELECT <col-or-*> FROM <table> WHERE __source_row = <n> LIMIT 1
		const lookupMatch = sql.match(/SELECT (.+) AS val FROM (\S+) WHERE __source_row = (-?\d+) LIMIT 1/);
		if (lookupMatch) {
			const [, colExpr, tableName, idStr] = lookupMatch;
			const t = this.tables.get(tableName!);
			if (!t) return new MockQueryResult([]);
			const colMatch = colExpr!.match(/^"((?:[^"]|"")+)"$/);
			const col = colMatch ? colMatch[1]!.replace(/""/g, '"') : colExpr;
			const id = Number(idStr);
			const row = t.rows.find(r => r.__source_row === id);
			return new MockQueryResult(row ? [{ val: row[col!] ?? null }] : []);
		}

		// SELECT __source_row, <col> AS val FROM <table> WHERE __source_row IN (1,2,3)
		const batchMatch = sql.match(/SELECT __source_row, (.+) AS val FROM (\S+) WHERE __source_row IN \(([^)]*)\)/);
		if (batchMatch) {
			const [, colExpr, tableName, idsStr] = batchMatch;
			const t = this.tables.get(tableName!);
			if (!t) return new MockQueryResult([]);
			const colMatch = colExpr!.match(/^"((?:[^"]|"")+)"$/);
			const col = colMatch ? colMatch[1]!.replace(/""/g, '"') : colExpr;
			const ids = idsStr!.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
			const idSet = new Set(ids);
			const rows = t.rows
				.filter(r => idSet.has(r.__source_row as number))
				.map(r => ({ __source_row: r.__source_row, val: r[col!] ?? null }));
			return new MockQueryResult(rows);
		}

		// SELECT COUNT(*) AS n FROM <table>
		const countMatch = sql.match(/SELECT COUNT\(\*\) AS n FROM (\S+)/);
		if (countMatch) {
			const [, tableName] = countMatch;
			const t = this.tables.get(tableName!);
			return new MockQueryResult([{ n: t?.rows.length ?? 0 }]);
		}

		// SELECT display_row FROM <map> WHERE __source_row = <n> LIMIT 1
		const displayMatch = sql.match(/SELECT display_row FROM (\S+) WHERE __source_row = (-?\d+) LIMIT 1/);
		if (displayMatch) {
			const [, mapName, idStr] = displayMatch;
			const t = this.tables.get(mapName!);
			if (!t) return new MockQueryResult([]);
			const id = Number(idStr);
			const row = t.rows.find(r => r.__source_row === id);
			return new MockQueryResult(row ? [{ display_row: row.display_row }] : []);
		}

		// SELECT * FROM <table> [ORDER BY ...] LIMIT n OFFSET m
		const rangeMatch = sql.match(/SELECT (.+) FROM (\S+)(?:\s+ORDER BY ([^L]+))?\s+LIMIT (\d+) OFFSET (\d+)/);
		if (rangeMatch) {
			const [, , tableName, , limit, offset] = rangeMatch;
			const t = this.tables.get(tableName!);
			if (!t) return new MockQueryResult([]);
			const slice = t.rows.slice(Number(offset), Number(offset) + Number(limit));
			return new MockQueryResult(slice);
		}

		// DROP TABLE IF EXISTS <name>
		const dropMatch = sql.match(/DROP TABLE IF EXISTS (\S+)/);
		if (dropMatch) {
			this.tables.delete(dropMatch[1]!);
			return new MockQueryResult([]);
		}

		throw new Error(`mock: unrecognized SQL: ${sql.slice(0, 80)}…`);
	}

	async close(): Promise<void> {}
}

class MockDB {
	registered = new Map<string, FileSystemFileHandle>();
	dropped: string[] = [];
	conn: MockConn;
	registerCalls = 0;
	failNextRegister = false;

	constructor(conn: MockConn) { this.conn = conn; }

	async registerFileHandle(name: string, handle: FileSystemFileHandle, _proto: number, _direct: boolean): Promise<void> {
		this.registerCalls++;
		if (this.failNextRegister) {
			this.failNextRegister = false;
			throw new Error('register boom');
		}
		this.registered.set(name, handle);
	}
	async dropFile(name: string): Promise<void> {
		this.dropped.push(name);
		this.registered.delete(name);
	}
	async terminate(): Promise<void> {}
}

vi.mock('@duckdb/duckdb-wasm', () => ({
	AsyncDuckDB: class { },
	AsyncDuckDBConnection: class { },
	ConsoleLogger: class { },
	LogLevel: { WARNING: 1 },
	DuckDBDataProtocol: { BUFFER: 0, NODE_FS: 1, BROWSER_FILEREADER: 2, BROWSER_FSACCESS: 3, HTTP: 4 },
	PACKAGE_VERSION: '1.29.0-mock',
}));

import { DuckDBRowProvider } from '../../../src/csv/duckdb/duckdbRowProvider';
import type { DuckDBRuntime } from '../../../src/csv/duckdb/duckdbBootstrap';

let conn: MockConn;
let db: MockDB;
let runtime: DuckDBRuntime;
const fakeHandle = {} as FileSystemFileHandle;

beforeEach(() => {
	conn = new MockConn();
	db = new MockDB(conn);
	runtime = {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		db: db as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		conn: conn as any,
		worker: {} as Worker,
		dispose: async () => { },
	};
});

function seedRows(alias: string, rows: Array<Record<string, unknown>>) {
	conn.tables.set(`__source_${alias}`, { rows });
}

describe('DuckDBRowProvider.create', () => {
	it('registers the file handle and materializes a table', async () => {
		const alias = 'qualia_test.csv';
		seedRows(alias, [
			{ name: 'A', dept: 'X' },
			{ name: 'B', dept: 'Y' },
		]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		expect(db.registerCalls).toBe(1);
		expect(db.registered.get(alias)).toBe(fakeHandle);
		expect(await p.getRowCount()).toBe(2);
		await p.dispose();
	});

	it('uses read_parquet when fileType=parquet', async () => {
		const alias = 'qualia_test.parquet';
		seedRows(alias, [{ a: 1 }]);
		await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'parquet', alias });
		expect(conn.queryLog.some(q => q.includes("read_parquet('qualia_test.parquet')"))).toBe(true);
	});

	it('cleans up the alias when CREATE TABLE fails', async () => {
		seedRows('al.csv', []);
		conn.rejectNextQuery = new Error('CREATE boom');
		await expect(DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias: 'al.csv' }))
			.rejects.toThrow('CREATE boom');
		expect(db.dropped).toContain('al.csv');
	});
});

describe('getMarkerText', () => {
	it('returns the cell value', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ name: 'Alice' }, { name: 'Bob' }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		expect(await p.getMarkerText({ sourceRowId: 1, column: 'name' })).toBe('Bob');
	});

	it('returns null for missing row', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ name: 'Alice' }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		expect(await p.getMarkerText({ sourceRowId: 99, column: 'name' })).toBeNull();
	});

	it('returns null for missing column', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ name: 'Alice' }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		expect(await p.getMarkerText({ sourceRowId: 0, column: 'missing' })).toBeNull();
	});

	it('escapes column names with double quotes', async () => {
		const alias = 'a.csv';
		// Column name with a literal " — not realistic but the escape path matters.
		seedRows(alias, [{ 'col"weird': 'value' }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		expect(await p.getMarkerText({ sourceRowId: 0, column: 'col"weird' })).toBe('value');
	});
});

describe('batchGetMarkerText', () => {
	it('returns a map keyed by markerRefKey', async () => {
		const alias = 'a.csv';
		seedRows(alias, [
			{ name: 'A', dept: 'X' },
			{ name: 'B', dept: 'Y' },
			{ name: 'C', dept: 'Z' },
		]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		const result = await p.batchGetMarkerText([
			{ sourceRowId: 0, column: 'name' },
			{ sourceRowId: 2, column: 'dept' },
		]);
		expect(result.get('0|name')).toBe('A');
		expect(result.get('2|dept')).toBe('Z');
	});

	it('groups by column to issue one query per distinct column', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		conn.queryLog.length = 0;
		await p.batchGetMarkerText([
			{ sourceRowId: 0, column: 'a' },
			{ sourceRowId: 1, column: 'a' },
			{ sourceRowId: 0, column: 'b' },
		]);
		const batchQueries = conn.queryLog.filter(q => q.includes('IN ('));
		expect(batchQueries.length).toBe(2); // one per column
	});

	it('fills missing rows as null', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ name: 'A' }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		const result = await p.batchGetMarkerText([
			{ sourceRowId: 0, column: 'name' },
			{ sourceRowId: 99, column: 'name' },
		]);
		expect(result.get('0|name')).toBe('A');
		expect(result.get('99|name')).toBeNull();
	});

	it('returns empty map for empty refs', async () => {
		const alias = 'a.csv';
		seedRows(alias, []);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		const result = await p.batchGetMarkerText([]);
		expect(result.size).toBe(0);
	});
});

describe('display_row mapping (sort cache)', () => {
	it('builds a sort-aware mapping table', async () => {
		const alias = 'a.csv';
		seedRows(alias, [
			{ name: 'C' }, // sourceRowId 0
			{ name: 'A' }, // sourceRowId 1
			{ name: 'B' }, // sourceRowId 2
		]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		const mapName = await p.buildDisplayMap([{ column: 'name', descending: false }]);

		// After sort by name ASC: A(1), B(2), C(0) — display rows 0,1,2
		expect(await p.displayRowFor(mapName, 1)).toBe(0);
		expect(await p.displayRowFor(mapName, 2)).toBe(1);
		expect(await p.displayRowFor(mapName, 0)).toBe(2);

		await p.dropDisplayMap(mapName);
	});

	it('descending sort flips the order', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ x: 10 }, { x: 30 }, { x: 20 }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		const mapName = await p.buildDisplayMap([{ column: 'x', descending: true }]);
		// 30 → display 0; 20 → display 1; 10 → display 2
		expect(await p.displayRowFor(mapName, 1)).toBe(0);
		expect(await p.displayRowFor(mapName, 2)).toBe(1);
		expect(await p.displayRowFor(mapName, 0)).toBe(2);
	});

	it('returns null for unknown sourceRowId in map', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ x: 1 }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		const mapName = await p.buildDisplayMap([]);
		expect(await p.displayRowFor(mapName, 99)).toBeNull();
	});
});

describe('dispose', () => {
	it('drops the table and the alias', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ a: 1 }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		await p.dispose();
		expect(db.dropped).toContain(alias);
		expect(conn.queryLog.some(q => q.includes('DROP TABLE IF EXISTS'))).toBe(true);
	});

	it('is idempotent', async () => {
		const alias = 'a.csv';
		seedRows(alias, []);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		await p.dispose();
		await p.dispose();
		expect(db.dropped.filter(d => d === alias).length).toBe(1);
	});

	it('throws on operations after dispose', async () => {
		const alias = 'a.csv';
		seedRows(alias, [{ a: 1 }]);
		const p = await DuckDBRowProvider.create({ runtime, fileHandle: fakeHandle, fileType: 'csv', alias });
		await p.dispose();
		await expect(p.getMarkerText({ sourceRowId: 0, column: 'a' })).rejects.toThrow(/disposed/);
		await expect(p.getRowCount()).rejects.toThrow(/disposed/);
		await expect(p.batchGetMarkerText([{ sourceRowId: 0, column: 'a' }])).rejects.toThrow(/disposed/);
	});
});
