/**
 * Translate AG Grid `filterModel` to a DuckDB-compatible SQL `WHERE` fragment.
 *
 * Supports:
 *  - Text filters: contains, notContains, equals, notEqual, startsWith, endsWith,
 *    blank, notBlank
 *  - Number filters: equals, notEqual, lessThan, lessThanOrEqual, greaterThan,
 *    greaterThanOrEqual, inRange, blank, notBlank
 *  - Combined (AND/OR of two conditions per column)
 *
 * Multiple columns combine with AND. Columns with no actionable condition are skipped.
 *
 * Returns `null` when the model produces no constraints (empty model or only blank
 * placeholders), so callers can omit the WHERE clause entirely.
 */

import type { ISimpleFilterModel, ICombinedSimpleModel } from "ag-grid-community";

type AnySimpleModel = ISimpleFilterModel & {
	filter?: string | number | null;
	filterTo?: string | number | null;
};
type AnyCombinedModel = ICombinedSimpleModel<AnySimpleModel>;
type AnyFilterModel = AnySimpleModel | AnyCombinedModel;

export type AgFilterModel = Record<string, AnyFilterModel>;

function quoteIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`;
}

function quoteString(v: string): string {
	return `'${v.replace(/'/g, "''")}'`;
}

function escapeLike(v: string): string {
	// Escape DuckDB LIKE metacharacters (%, _) and the escape char (\) itself.
	return v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildSimpleClause(colId: string, model: AnySimpleModel): string | null {
	const col = quoteIdent(colId);
	const type = model.type;
	if (!type || type === "empty") return null;

	if (type === "blank") {
		return `(${col} IS NULL OR CAST(${col} AS VARCHAR) = '')`;
	}
	if (type === "notBlank") {
		return `(${col} IS NOT NULL AND CAST(${col} AS VARCHAR) <> '')`;
	}

	const filterType = model.filterType ?? "text";

	if (filterType === "text") {
		const raw = model.filter;
		if (raw == null || raw === "") return null;
		const v = String(raw);
		switch (type) {
			case "contains":
				return `CAST(${col} AS VARCHAR) ILIKE '%${escapeLike(v).replace(/'/g, "''")}%' ESCAPE '\\'`;
			case "notContains":
				return `(CAST(${col} AS VARCHAR) NOT ILIKE '%${escapeLike(v).replace(/'/g, "''")}%' ESCAPE '\\' OR ${col} IS NULL)`;
			case "equals":
				return `CAST(${col} AS VARCHAR) = ${quoteString(v)}`;
			case "notEqual":
				return `(CAST(${col} AS VARCHAR) <> ${quoteString(v)} OR ${col} IS NULL)`;
			case "startsWith":
				return `CAST(${col} AS VARCHAR) ILIKE '${escapeLike(v).replace(/'/g, "''")}%' ESCAPE '\\'`;
			case "endsWith":
				return `CAST(${col} AS VARCHAR) ILIKE '%${escapeLike(v).replace(/'/g, "''")}' ESCAPE '\\'`;
			default:
				return null;
		}
	}

	if (filterType === "number") {
		const a = model.filter;
		if (a == null) return null;
		const aNum = typeof a === "number" ? a : Number(a);
		if (!Number.isFinite(aNum)) return null;
		switch (type) {
			case "equals": return `${col} = ${aNum}`;
			case "notEqual": return `(${col} <> ${aNum} OR ${col} IS NULL)`;
			case "lessThan": return `${col} < ${aNum}`;
			case "lessThanOrEqual": return `${col} <= ${aNum}`;
			case "greaterThan": return `${col} > ${aNum}`;
			case "greaterThanOrEqual": return `${col} >= ${aNum}`;
			case "inRange": {
				const b = model.filterTo;
				const bNum = typeof b === "number" ? b : Number(b);
				if (!Number.isFinite(bNum)) return null;
				const lo = Math.min(aNum, bNum);
				const hi = Math.max(aNum, bNum);
				return `${col} BETWEEN ${lo} AND ${hi}`;
			}
			default:
				return null;
		}
	}

	return null;
}

function isCombined(m: AnyFilterModel): m is AnyCombinedModel {
	return Array.isArray((m as AnyCombinedModel).conditions);
}

function buildColumnClause(colId: string, model: AnyFilterModel): string | null {
	if (isCombined(model)) {
		const op = model.operator === "OR" ? "OR" : "AND";
		const parts = model.conditions
			.map(c => buildSimpleClause(colId, c))
			.filter((p): p is string => p !== null);
		if (parts.length === 0) return null;
		if (parts.length === 1) return parts[0]!;
		return `(${parts.join(` ${op} `)})`;
	}
	return buildSimpleClause(colId, model);
}

export function buildWhereClause(model: AgFilterModel | null | undefined): string | null {
	if (!model) return null;
	const parts: string[] = [];
	for (const [colId, m] of Object.entries(model)) {
		const clause = buildColumnClause(colId, m);
		if (clause) parts.push(clause);
	}
	if (parts.length === 0) return null;
	return parts.join(" AND ");
}
