import { describe, it, expect } from "vitest";
import { buildWhereClause } from "../../../src/csv/duckdb/filterModelToSql";

describe("buildWhereClause — empty/null", () => {
	it("returns null for null/undefined model", () => {
		expect(buildWhereClause(null)).toBeNull();
		expect(buildWhereClause(undefined)).toBeNull();
	});

	it("returns null for empty object", () => {
		expect(buildWhereClause({})).toBeNull();
	});

	it("skips columns with no actionable condition", () => {
		expect(buildWhereClause({
			col: { filterType: "text", type: "contains", filter: "" },
		})).toBeNull();

		expect(buildWhereClause({
			col: { filterType: "text", type: "empty", filter: "x" },
		})).toBeNull();
	});
});

describe("buildWhereClause — text filters", () => {
	it("contains uses ILIKE with %v%", () => {
		expect(buildWhereClause({
			Produto: { filterType: "text", type: "contains", filter: "abóbora" },
		})).toBe(`CAST("Produto" AS VARCHAR) ILIKE '%abóbora%' ESCAPE '\\'`);
	});

	it("notContains negates and tolerates NULL", () => {
		expect(buildWhereClause({
			Produto: { filterType: "text", type: "notContains", filter: "X" },
		})).toBe(`(CAST("Produto" AS VARCHAR) NOT ILIKE '%X%' ESCAPE '\\' OR "Produto" IS NULL)`);
	});

	it("equals / notEqual cast to varchar", () => {
		expect(buildWhereClause({
			c: { filterType: "text", type: "equals", filter: "SIM" },
		})).toBe(`CAST("c" AS VARCHAR) = 'SIM'`);

		expect(buildWhereClause({
			c: { filterType: "text", type: "notEqual", filter: "SIM" },
		})).toBe(`(CAST("c" AS VARCHAR) <> 'SIM' OR "c" IS NULL)`);
	});

	it("startsWith / endsWith use anchored ILIKE", () => {
		expect(buildWhereClause({
			c: { filterType: "text", type: "startsWith", filter: "CR" },
		})).toBe(`CAST("c" AS VARCHAR) ILIKE 'CR%' ESCAPE '\\'`);

		expect(buildWhereClause({
			c: { filterType: "text", type: "endsWith", filter: "do" },
		})).toBe(`CAST("c" AS VARCHAR) ILIKE '%do' ESCAPE '\\'`);
	});

	it("escapes single quotes in values", () => {
		expect(buildWhereClause({
			c: { filterType: "text", type: "equals", filter: "O'Brien" },
		})).toBe(`CAST("c" AS VARCHAR) = 'O''Brien'`);
	});

	it("escapes LIKE metacharacters", () => {
		expect(buildWhereClause({
			c: { filterType: "text", type: "contains", filter: "50%" },
		})).toBe(`CAST("c" AS VARCHAR) ILIKE '%50\\%%' ESCAPE '\\'`);

		expect(buildWhereClause({
			c: { filterType: "text", type: "contains", filter: "a_b" },
		})).toBe(`CAST("c" AS VARCHAR) ILIKE '%a\\_b%' ESCAPE '\\'`);
	});

	it("escapes column identifier with double quotes", () => {
		expect(buildWhereClause({
			'co"l': { filterType: "text", type: "equals", filter: "v" },
		})).toBe(`CAST("co""l" AS VARCHAR) = 'v'`);
	});
});

describe("buildWhereClause — number filters", () => {
	it("equals / inequalities", () => {
		expect(buildWhereClause({
			n: { filterType: "number", type: "equals", filter: 42 },
		})).toBe(`"n" = 42`);

		expect(buildWhereClause({
			n: { filterType: "number", type: "lessThan", filter: 10 },
		})).toBe(`"n" < 10`);

		expect(buildWhereClause({
			n: { filterType: "number", type: "greaterThanOrEqual", filter: 5 },
		})).toBe(`"n" >= 5`);
	});

	it("inRange normalizes bounds and uses BETWEEN", () => {
		expect(buildWhereClause({
			n: { filterType: "number", type: "inRange", filter: 3, filterTo: 9 },
		})).toBe(`"n" BETWEEN 3 AND 9`);

		// Reversed bounds — still produces a valid range
		expect(buildWhereClause({
			n: { filterType: "number", type: "inRange", filter: 9, filterTo: 3 },
		})).toBe(`"n" BETWEEN 3 AND 9`);
	});

	it("ignores non-finite numbers", () => {
		expect(buildWhereClause({
			n: { filterType: "number", type: "equals", filter: Number.NaN },
		})).toBeNull();

		expect(buildWhereClause({
			n: { filterType: "number", type: "inRange", filter: 1, filterTo: Number.NaN },
		})).toBeNull();
	});
});

describe("buildWhereClause — blank / notBlank", () => {
	it("blank checks NULL or empty string", () => {
		expect(buildWhereClause({
			c: { filterType: "text", type: "blank" },
		})).toBe(`("c" IS NULL OR CAST("c" AS VARCHAR) = '')`);
	});

	it("notBlank negates", () => {
		expect(buildWhereClause({
			c: { filterType: "text", type: "notBlank" },
		})).toBe(`("c" IS NOT NULL AND CAST("c" AS VARCHAR) <> '')`);
	});
});

describe("buildWhereClause — combined / multi-column", () => {
	it("AND of two text conditions on same column", () => {
		expect(buildWhereClause({
			c: {
				operator: "AND",
				conditions: [
					{ filterType: "text", type: "contains", filter: "a" },
					{ filterType: "text", type: "notContains", filter: "b" },
				],
			} as any,
		})).toBe(
			`(CAST("c" AS VARCHAR) ILIKE '%a%' ESCAPE '\\' AND (CAST("c" AS VARCHAR) NOT ILIKE '%b%' ESCAPE '\\' OR "c" IS NULL))`,
		);
	});

	it("OR of two number ranges", () => {
		expect(buildWhereClause({
			n: {
				operator: "OR",
				conditions: [
					{ filterType: "number", type: "lessThan", filter: 5 },
					{ filterType: "number", type: "greaterThan", filter: 100 },
				],
			} as any,
		})).toBe(`("n" < 5 OR "n" > 100)`);
	});

	it("multi-column joins with AND", () => {
		expect(buildWhereClause({
			Produto: { filterType: "text", type: "contains", filter: "creme" },
			Match: { filterType: "text", type: "equals", filter: "SIM" },
		})).toBe(
			`CAST("Produto" AS VARCHAR) ILIKE '%creme%' ESCAPE '\\' AND CAST("Match" AS VARCHAR) = 'SIM'`,
		);
	});

	it("combined with single actionable condition collapses to that clause", () => {
		expect(buildWhereClause({
			c: {
				operator: "AND",
				conditions: [
					{ filterType: "text", type: "contains", filter: "a" },
					{ filterType: "text", type: "contains", filter: "" }, // skipped
				],
			} as any,
		})).toBe(`CAST("c" AS VARCHAR) ILIKE '%a%' ESCAPE '\\'`);
	});
});
